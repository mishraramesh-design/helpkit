"""Widget API — called by the embedded JS assistant widget."""
import re
from fastapi import APIRouter, Header, HTTPException, Body
from ..core import db
from ..llm import call_llm

router = APIRouter(prefix="/api/widget/assistant", tags=["widget"])

async def _get_project(key: str):
    p = await db.projects.find_one({"assistant_key": key}, {"_id":0})
    if not p: raise HTTPException(403, "Invalid API key")
    return p

@router.post("/guidance")
async def guidance(body: dict = Body(...), x_api_key: str = Header(...)):
    project = await _get_project(x_api_key)
    pid = project["id"]
    page = body.get("page", "")
    question = body.get("question", "")

    # Search KB for relevant entries
    words = [w.lower() for w in re.findall(r"[a-zA-Z]{3,}", (page + " " + question))][:10]
    entries = []
    async for e in db.assistant_kb.find({"project_id": pid}, {"_id":0}).limit(200):
        score = sum(1 for w in words if w in e.get("q","").lower() or w in e.get("a","").lower())
        if score > 0: entries.append((score, e))
    entries.sort(key=lambda x: -x[0])
    top = [e for _, e in entries[:5]]

    cfg = await db.llm_config.find_one({}, {"_id":0}) or {}
    llm_active = bool(cfg.get("api_key"))

    if question and llm_active:
        kb_context = "\n".join(f"Q: {e['q']}\nA: {e['a']}" for e in top)
        system = (f"You are a helpful assistant for '{project['name']}'. "
                  f"Answer questions using the knowledge base provided. "
                  f"Be concise and friendly. If unsure, say so.")
        prompt = f"Knowledge base:\n{kb_context}\n\nUser is on page '{page}' and asks:\n{question}"
        reply = await call_llm(prompt, system)
    elif top:
        reply = top[0]["a"]
    else:
        reply = f"I can help you with {project['name']}. What would you like to know?"

    return {
        "reply": reply,
        "llm_active": llm_active,
        "project_name": project["name"],
        "kb_hits": len(top),
    }

@router.get("/kb")
async def list_kb(x_api_key: str = Header(...), _=None):
    project = await _get_project(x_api_key)
    entries = [e async for e in db.assistant_kb.find({"project_id": project["id"]}, {"_id":0}).limit(100)]
    return {"entries": entries, "total": len(entries)}
