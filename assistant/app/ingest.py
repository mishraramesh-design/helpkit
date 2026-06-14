"""Ingest pipeline: GitHub repo + PDF/DOCX docs → chunked knowledge."""
import os, re, json, io
from datetime import datetime, timezone
import fitz           # PyMuPDF — PDFs
import httpx
from .core import db
from .llm import call_llm

NOW = lambda: datetime.now(timezone.utc).isoformat()

# ── Text extraction ──────────────────────────────────────────────────────────
def extract_text_pdf(path: str) -> list[dict]:
    """Return [{page, text}] from a PDF."""
    chunks = []
    try:
        pdf = fitz.open(path)
        for i, page in enumerate(pdf):
            text = page.get_text().strip()
            if len(text) >= 80:
                chunks.append({"page": i + 1, "text": text[:3000]})
    except Exception as e:
        pass
    return chunks

def extract_text_docx(path: str) -> list[dict]:
    """Return [{page, text}] from a DOCX/DOC file."""
    try:
        import docx
        doc = docx.Document(path)
        full = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        # Split into ~2000-char chunks
        chunks = []
        for i in range(0, len(full), 2000):
            chunk = full[i:i + 2000].strip()
            if len(chunk) >= 80:
                chunks.append({"page": i // 2000 + 1, "text": chunk})
        return chunks
    except Exception as e:
        return []

def extract_text(path: str) -> list[dict]:
    lower = path.lower()
    if lower.endswith(".pdf"):
        return extract_text_pdf(path)
    if lower.endswith(".docx") or lower.endswith(".doc"):
        return extract_text_docx(path)
    return []

# ── Q&A extraction via LLM ───────────────────────────────────────────────────
async def chunks_to_qa(project_id: str, doc_id: str, doc_type: str, chunks: list[dict]) -> int:
    qa_pairs = []
    for chunk in chunks[:60]:
        raw = await call_llm(
            f"Extract 3-5 question-answer pairs a user would ask about using this application, "
            f"based on this {doc_type} documentation chunk.\n\nChunk:\n{chunk['text']}",
            "You are a knowledge extraction assistant. "
            "Return ONLY valid JSON array: [{\"q\":\"...\",\"a\":\"...\"}]. No prose outside JSON."
        )
        if not raw or raw.startswith("[LLM error"):
            continue
        try:
            t = raw.strip()
            if t.startswith("```"):
                t = t.split("```")[1].lstrip("json").strip()
            pairs = json.loads(t)
            for p in pairs:
                if isinstance(p, dict) and "q" in p and "a" in p:
                    qa_pairs.append({
                        "project_id": project_id,
                        "q": p["q"], "a": p["a"],
                        "source_page": chunk["page"],
                        "doc_id": doc_id, "doc_type": doc_type,
                        "created_at": NOW()
                    })
        except Exception:
            pass

    if qa_pairs:
        await db.assistant_kb.insert_many(qa_pairs)
    return len(qa_pairs)

# ── Document ingestion ───────────────────────────────────────────────────────
async def ingest_pdf(project_id: str, doc_id: str, path: str, doc_type: str):
    await db.documents.update_one({"_id": doc_id}, {"$set": {"status": "ingesting"}})
    try:
        # Check LLM key first
        cfg = await db.llm_config.find_one({}, {"_id": 0}) or {}
        if not cfg.get("api_key"):
            await db.documents.update_one({"_id": doc_id},
                {"$set": {"status": "error: No LLM key configured — go to Settings and add a Groq key first"}})
            return

        chunks = extract_text(path)
        if not chunks:
            await db.documents.update_one({"_id": doc_id},
                {"$set": {"status": "error: Could not extract text — is this a valid PDF or DOCX?"}})
            return

        count = await chunks_to_qa(project_id, doc_id, doc_type, chunks)
        await db.documents.update_one({"_id": doc_id}, {"$set": {
            "status": "ingested", "chunks": len(chunks),
            "qa_pairs": count, "updated_at": NOW()
        }})
    except Exception as e:
        await db.documents.update_one({"_id": doc_id}, {"$set": {"status": f"error: {e}"}})


# ── GitHub ingestion — routes + pages + error codes ──────────────────────────
ERRCODE_RE = re.compile(r'["\']([A-Z]{2,8}-(?:[A-Z]{2,8}-)?\d{3,6})["\']')

# Patterns to find meaningful app structure
FASTAPI_ROUTE_RE = re.compile(
    r'@router\.(get|post|put|delete|patch)\(["\']([^"\']+)["\'].*?\)\s*\nasync def (\w+)',
    re.MULTILINE
)
RAISE_HTTP_RE = re.compile(
    r'raise HTTPException\((\d+),\s*["\']([^"\']{10,})["\']',
)
JSX_PAGE_RE = re.compile(
    r'export default function (\w+)', re.MULTILINE
)

async def ingest_github(project_id: str, doc_id: str, repo_url: str, token: str = ""):
    await db.documents.update_one({"_id": doc_id}, {"$set": {"status": "scanning"}})
    try:
        m = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if not m:
            raise ValueError("Invalid GitHub URL — use https://github.com/owner/repo")
        owner, repo = m.group(1), m.group(2)

        headers = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1",
                headers=headers
            )
            r.raise_for_status()
            tree = r.json().get("tree", [])

        code_files = [
            f for f in tree
            if f["type"] == "blob"
            and any(f["path"].endswith(e) for e in (".py", ".js", ".jsx", ".ts", ".tsx"))
            and f.get("size", 0) < 100000
        ][:100]

        messages_found = []   # structured error codes for Support KB
        features_found = []   # routes + pages for Assistant KB

        cfg = await db.llm_config.find_one({}, {"_id": 0}) or {}
        has_llm = bool(cfg.get("api_key"))

        async with httpx.AsyncClient(timeout=30) as c:
            for f in code_files:
                r = await c.get(
                    f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{f['path']}",
                    headers=headers
                )
                if r.status_code != 200:
                    continue
                content = r.text
                path = f["path"]

                # 1. Structured error codes → Support KB
                for line_no, line in enumerate(content.splitlines(), 1):
                    for mid in ERRCODE_RE.findall(line):
                        messages_found.append({
                            "message_id": mid, "file_path": path,
                            "line_number": line_no, "raw_message": line.strip(),
                            "project_id": project_id, "status": "pending",
                            "created_at": NOW()
                        })

                # 2. FastAPI routes → feature descriptions
                for verb, route, fn in FASTAPI_ROUTE_RE.findall(content):
                    features_found.append({
                        "type": "api_route",
                        "description": f"{verb.upper()} {route} (function: {fn})",
                        "file": path
                    })

                # 3. HTTP error messages → implicit support entries
                for status, msg in RAISE_HTTP_RE.findall(content):
                    messages_found.append({
                        "message_id": f"HTTP-{status}",
                        "file_path": path,
                        "line_number": 0,
                        "raw_message": f"HTTP {status}: {msg}",
                        "project_id": project_id, "status": "pending",
                        "created_at": NOW()
                    })

                # 4. React page components
                if path.endswith((".jsx", ".tsx")) and "pages/" in path:
                    for fn in JSX_PAGE_RE.findall(content):
                        page_name = path.split("/")[-1].replace(".jsx","").replace(".tsx","")
                        features_found.append({
                            "type": "ui_page",
                            "description": f"Page: {page_name} (component: {fn})",
                            "file": path
                        })

        # Save error codes for Support KB
        if messages_found:
            seen = set()
            unique = []
            for msg in messages_found:
                key = f"{msg['message_id']}:{msg['file_path']}"
                if key not in seen:
                    seen.add(key)
                    unique.append(msg)
            await db.support_messages.insert_many(unique)

        # Build Assistant KB from features using LLM
        qa_count = 0
        if features_found and has_llm:
            feature_text = "\n".join(
                f"- {f['type']}: {f['description']}" for f in features_found[:80]
            )
            raw = await call_llm(
                f"Based on this application's routes and pages, generate 10-15 Q&A pairs "
                f"that would help a user understand what the app can do and how to use it.\n\n"
                f"App features:\n{feature_text}",
                "Return ONLY valid JSON array: [{\"q\":\"...\",\"a\":\"...\"}]. No prose."
            )
            if raw and not raw.startswith("[LLM error"):
                try:
                    t = raw.strip()
                    if t.startswith("```"):
                        t = t.split("```")[1].lstrip("json").strip()
                    pairs = json.loads(t)
                    to_insert = [
                        {"project_id": project_id, "q": p["q"], "a": p["a"],
                         "source_page": 0, "doc_id": doc_id, "doc_type": "github",
                         "created_at": NOW()}
                        for p in pairs if isinstance(p, dict) and "q" in p and "a" in p
                    ]
                    if to_insert:
                        await db.assistant_kb.insert_many(to_insert)
                        qa_count = len(to_insert)
                except Exception:
                    pass

        await db.documents.update_one({"_id": doc_id}, {"$set": {
            "status": "scanned",
            "messages_found": len(messages_found),
            "features_found": len(features_found),
            "qa_pairs": qa_count,
            "updated_at": NOW()
        }})

    except Exception as e:
        await db.documents.update_one({"_id": doc_id}, {"$set": {"status": f"error: {e}"}})
