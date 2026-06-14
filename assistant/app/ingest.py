"""Ingest pipeline: GitHub repo + PDF docs → chunked knowledge."""
import os, re, json, asyncio
from datetime import datetime, timezone
from pathlib import Path
import fitz          # PyMuPDF
import httpx
from .core import db
from .llm import call_llm

NOW = lambda: datetime.now(timezone.utc).isoformat()

# ── PDF ingestion ─────────────────────────────────────────────────────────────
async def ingest_pdf(project_id: str, doc_id: str, path: str, doc_type: str):
    await db.documents.update_one({"_id": doc_id}, {"$set": {"status": "ingesting"}})
    try:
        pdf = fitz.open(path)
        chunks = []
        for i, page in enumerate(pdf):
            text = page.get_text().strip()
            if len(text) < 80: continue
            chunks.append({"page": i+1, "text": text[:3000]})

        # Ask LLM to build Q&A pairs from each chunk
        qa_pairs = []
        for chunk in chunks[:50]:   # cap at 50 pages to stay within limits
            raw = await call_llm(
                f"Extract 3-5 question-answer pairs from this documentation chunk that would help a user understand how to use the application.\n\nChunk:\n{chunk['text']}",
                "You are a knowledge extraction assistant. Return ONLY valid JSON array: [{\"q\":\"...\",\"a\":\"...\"}]. No prose."
            )
            try:
                t = raw.strip()
                if t.startswith("```"): t = t.split("```")[1].lstrip("json").strip()
                pairs = json.loads(t)
                for p in pairs:
                    p.update(source_page=chunk["page"], doc_id=doc_id, doc_type=doc_type)
                    qa_pairs.append(p)
            except Exception:
                pass

        if qa_pairs:
            await db.assistant_kb.insert_many([{"project_id": project_id, **p, "created_at": NOW()} for p in qa_pairs])

        await db.documents.update_one({"_id": doc_id},
            {"$set": {"status": "ingested", "chunks": len(chunks), "qa_pairs": len(qa_pairs), "updated_at": NOW()}})
    except Exception as e:
        await db.documents.update_one({"_id": doc_id}, {"$set": {"status": f"error: {e}"}})


# ── GitHub ingestion ──────────────────────────────────────────────────────────
MSG_RE = re.compile(r'["\']([A-Z]{2,8}-(?:[A-Z]{2,8}-)?\d{3,6})["\']')

async def ingest_github(project_id: str, doc_id: str, repo_url: str, token: str = ""):
    await db.documents.update_one({"_id": doc_id}, {"$set": {"status": "scanning"}})
    try:
        # Convert github.com URL → API URL
        m = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", repo_url)
        if not m: raise ValueError("Invalid GitHub URL")
        owner, repo = m.group(1), m.group(2)

        headers = {"Accept": "application/vnd.github+json"}
        if token: headers["Authorization"] = f"Bearer {token}"

        # Get file tree
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1", headers=headers)
            r.raise_for_status()
            tree = r.json().get("tree", [])

        code_files = [f for f in tree if f["type"]=="blob" and
                      any(f["path"].endswith(e) for e in (".py",".js",".jsx",".ts",".tsx",".java",".go")) and
                      f.get("size", 0) < 80000][:80]

        messages_found = []
        async with httpx.AsyncClient(timeout=30) as c:
            for f in code_files:
                r = await c.get(f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{f['path']}", headers=headers)
                if r.status_code != 200: continue
                content = r.text
                for line_no, line in enumerate(content.splitlines(), 1):
                    for mid in MSG_RE.findall(line):
                        messages_found.append({
                            "message_id": mid, "file_path": f["path"],
                            "line_number": line_no, "raw_message": line.strip(),
                            "project_id": project_id, "status": "pending",
                            "created_at": NOW()
                        })

        if messages_found:
            # Deduplicate by message_id
            seen = set()
            unique = []
            for m in messages_found:
                if m["message_id"] not in seen:
                    seen.add(m["message_id"])
                    unique.append(m)
            await db.support_messages.insert_many(unique)

        await db.documents.update_one({"_id": doc_id},
            {"$set": {"status": "scanned", "messages_found": len(messages_found), "updated_at": NOW()}})
    except Exception as e:
        await db.documents.update_one({"_id": doc_id}, {"$set": {"status": f"error: {e}"}})
