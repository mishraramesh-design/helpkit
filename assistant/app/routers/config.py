"""LLM provider config for this helpkit instance."""
from fastapi import APIRouter, Depends, Body
from ..core import db, require_admin

router = APIRouter(prefix="/api/config", tags=["config"])

@router.get("")
async def get_config(_=Depends(require_admin)):
    cfg = await db.llm_config.find_one({}, {"_id":0}) or {}
    if cfg.get("api_key"): cfg["api_key"] = "••••" + cfg["api_key"][-4:]
    return cfg

@router.put("")
async def set_config(body: dict = Body(...), _=Depends(require_admin)):
    cur = await db.llm_config.find_one({}) or {}
    if body.get("api_key","").startswith("••••"):
        body["api_key"] = cur.get("api_key","")
    await db.llm_config.replace_one({}, body, upsert=True)
    return {"ok": True}

@router.post("/test")
async def test_config(_=Depends(require_admin)):
    """Make a real LLM call and return success/error — used by the Settings page."""
    from ..llm import call_llm
    cfg = await db.llm_config.find_one({}, {"_id": 0}) or {}
    if not cfg.get("api_key"):
        return {"ok": False, "error": "No API key configured. Add one above and save first."}
    try:
        reply = await call_llm(
            'Respond with exactly: "HelpKit connection OK ✓"',
            "You are a test assistant. Follow instructions exactly."
        )
        if not reply or reply.startswith("[LLM error"):
            return {"ok": False, "error": reply or "Empty response"}
        return {"ok": True, "reply": reply.strip()[:120]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
