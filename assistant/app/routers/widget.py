"""Widget API — called by the embedded JS assistant widget."""
import re
from fastapi import APIRouter, Header, HTTPException, Body
from ..core import db
from ..llm import call_llm

router = APIRouter(prefix="/api/widget/assistant", tags=["widget"])

async def _get_project(key: str):
    p = await db.projects.find_one({"assistant_key": key}, {"_id": 0})
    if not p:
        raise HTTPException(403, "Invalid API key")
    return p

async def _search_kb(pid: str, query: str, limit: int = 5) -> list:
    words = [w.lower() for w in re.findall(r"[a-zA-Z]{3,}", query)][:12]
    if not words:
        return []
    entries = []
    async for e in db.assistant_kb.find({"project_id": pid}, {"_id": 0}).limit(300):
        score = sum(1 for w in words
                    if w in e.get("q", "").lower() or w in e.get("a", "").lower())
        if score > 0:
            entries.append((score, e))
    entries.sort(key=lambda x: -x[0])
    return [e for _, e in entries[:limit]]

@router.post("/guidance")
async def guidance(body: dict = Body(...), x_api_key: str = Header(...)):
    project = await _get_project(x_api_key)
    pid     = project["id"]
    page    = body.get("page", "")
    question = body.get("question", "")
    history  = body.get("history", [])

    cfg = await db.llm_config.find_one({}, {"_id": 0}) or {}
    llm_active = bool(cfg.get("api_key"))

    # Search KB
    query = f"{page} {question}".strip()
    top   = await _search_kb(pid, query)

    if question and llm_active:
        # LLM answer grounded in KB
        kb_ctx = "\n".join(f"Q: {e['q']}\nA: {e['a']}" for e in top) if top else "No KB entries yet."
        hist_text = "\n".join(
            f'{"User" if m["role"]=="user" else "Assistant"}: {m.get("text","")}'
            for m in history[-4:]
        )
        system = (
            f"You are a helpful in-app assistant for '{project['name']}'. "
            f"Use the knowledge base below to answer. Be concise, practical, step-by-step. "
            f"If the KB doesn't cover the question, use general knowledge about the app type."
        )
        prompt = (
            f"Knowledge base:\n{kb_ctx}\n\n"
            f"{'Conversation:\n' + hist_text if hist_text else ''}\n\n"
            f"User is on page '{page}' and asks: {question}"
        )
        reply = await call_llm(prompt, system)
    elif top:
        # Best KB match — no LLM needed
        reply = top[0]["a"]
    elif llm_active:
        # No KB match but LLM available — answer directly
        system = (
            f"You are a helpful in-app assistant for '{project['name']}'. "
            f"The user is on the '{page}' page. Answer their question helpfully and concisely."
        )
        reply = await call_llm(question or f"What can I do on the {page} page?", system)
    else:
        # Demo mode — at least explain the page
        reply = (
            f"You're on the **{page}** section of {project['name']}. "
            f"I'm in demo mode — no knowledge base has been built yet. "
            f"To enable AI answers: go to HelpKit Admin → Settings → add a Groq key, "
            f"then re-ingest your documents."
        )

    return {
        "reply": reply,
        "llm_active": llm_active,
        "project_name": project["name"],
        "kb_hits": len(top),
    }

@router.get("/kb")
async def list_kb(x_api_key: str = Header(...)):
    project = await _get_project(x_api_key)
    entries = [e async for e in db.assistant_kb.find(
        {"project_id": project["id"]}, {"_id": 0}).limit(100)]
    return {"entries": entries, "total": len(entries)}
