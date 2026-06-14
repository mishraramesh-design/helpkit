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
