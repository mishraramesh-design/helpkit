"""Support widget API — L1/L2/L3 chat backed by scanned error codes."""
import re
from fastapi import APIRouter, Header, HTTPException, Body
from ..core import db
from ..llm import call_llm

router = APIRouter(prefix="/api/widget/support", tags=["support-widget"])

ROLE_SYSTEM = {
    "L1": ("You are an L1 support agent. Use plain everyday English, be empathetic. "
           "No technical jargon. Pattern: acknowledge → simple explanation → one next step → offer more help."),
    "L2": ("You are an L2 functional support agent. Include: message ID + severity, business context, "
           "possible conditions ranked by likelihood, recommended action, escalation note to L3."),
    "L3": ("You are an L3 developer support agent. Always include: Message Reference (ID, severity, type), "
           "Source Location (file + line), Root Cause Analysis (ranked conditions), Suggested Fix. Be precise and terse."),
}

async def _get_project(key: str):
    p = await db.projects.find_one({"support_key": key}, {"_id":0})
    if not p: raise HTTPException(403, "Invalid API key")
    return p

@router.post("/chat")
async def chat(body: dict = Body(...), x_api_key: str = Header(...)):
    project = await _get_project(x_api_key)
    pid = project["id"]
    role  = body.get("role", "L1")
    msg   = body.get("message", "")
    history = body.get("history", [])

    # Match by message ID first
    mid_match = re.search(r"\b([A-Z]{2,8}-(?:[A-Z]{2,8}-)?\d{3,6})\b", msg)
    kb_entry = None
    if mid_match:
        kb_entry = await db.support_kb.find_one({"project_id": pid, "message_id": mid_match.group(1)}, {"_id":0})

    # Fallback: keyword search
    if not kb_entry:
        words = [w.lower() for w in re.findall(r"[a-zA-Z]{4,}", msg)][:12]
        best, score = None, 0
        async for cand in db.support_kb.find({"project_id": pid}, {"_id":0}):
            s = sum(1 for w in words if w in cand.get("raw_message","").lower()
                    or w in cand.get("business_context","").lower())
            if s > score: best, score = cand, s
        if score >= 2: kb_entry = best

    cfg = await db.llm_config.find_one({}, {"_id":0}) or {}
    llm_active = bool(cfg.get("api_key"))

    if kb_entry and not llm_active:
        # Pure KB answer
        if role == "L1":
            answer = (f"It looks like the system stopped because: {kb_entry.get('business_context','')}\n\n"
                      f"Try this first: {kb_entry.get('recommended_action','').split('.')[0]}.\n\nLet me know if that helps!")
        elif role == "L2":
            conds = "\n".join(f"{i+1}. {c}" for i,c in enumerate(kb_entry.get("conditions",[])))
            answer = (f"**{kb_entry['message_id']} — {kb_entry.get('severity','?')} severity**\n\n"
                      f"Context: {kb_entry.get('business_context','')}\n\nConditions:\n{conds}\n\n"
                      f"Action: {kb_entry.get('recommended_action','')}")
        else:
            answer = (f"ID: {kb_entry['message_id']} · {kb_entry.get('severity','?')}\n"
                      f"Location: {kb_entry.get('file_path','')}:{kb_entry.get('line_number','')}\n\n"
                      f"Root cause: {'; '.join(kb_entry.get('conditions',[]))}\n\n"
                      f"Fix: {kb_entry.get('recommended_action','')}")
    elif llm_active:
        hist_text = "\n".join(f'{"User" if m["role"]=="user" else "Assistant"}: {m["text"]}' for m in history[-4:])
        kb_ctx = f"Known issue: {kb_entry}" if kb_entry else "No exact match in knowledge base."
        prompt = f"App: {project['name']}\n{kb_ctx}\n\n{hist_text}\n\nUser ({role}): {msg}"
        answer = await call_llm(prompt, ROLE_SYSTEM.get(role, ROLE_SYSTEM["L1"]))
    else:
        answer = ("I'm in demo mode. To enable AI answers, configure the LLM key in HelpKit admin. "
                  f"Could you share the exact error code (e.g. APP-001) so I can look it up?")

    return {"answer": answer, "role": role, "matched_id": (kb_entry or {}).get("message_id"), "llm_active": llm_active}
