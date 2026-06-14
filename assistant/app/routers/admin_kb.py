"""Admin: review scanned messages, approve/dismiss, build support KB."""
import json
from fastapi import APIRouter, Depends, Body, BackgroundTasks
from ..core import db, require_admin
from ..llm import call_llm
from datetime import datetime, timezone

router = APIRouter(prefix="/api/admin/kb", tags=["admin-kb"])
NOW = lambda: datetime.now(timezone.utc).isoformat()

@router.get("/{pid}/messages")
async def get_messages(pid: str, status: str = "pending", _=Depends(require_admin)):
    return [m async for m in db.support_messages.find({"project_id": pid, "status": status}, {"_id":0}).limit(300)]

@router.post("/{pid}/messages/{mid}/approve")
async def approve(pid: str, mid: str, _=Depends(require_admin)):
    await db.support_messages.update_one({"project_id": pid, "message_id": mid}, {"$set": {"status": "approved"}})
    return {"ok": True}

@router.post("/{pid}/messages/{mid}/dismiss")
async def dismiss(pid: str, mid: str, _=Depends(require_admin)):
    await db.support_messages.update_one({"project_id": pid, "message_id": mid}, {"$set": {"status": "dismissed"}})
    return {"ok": True}

@router.post("/{pid}/messages/approve-all")
async def approve_all(pid: str, _=Depends(require_admin)):
    r = await db.support_messages.update_many({"project_id": pid, "status": "pending"}, {"$set": {"status": "approved"}})
    return {"approved": r.modified_count}

@router.post("/{pid}/build")
async def build_kb(pid: str, bg: BackgroundTasks, _=Depends(require_admin)):
    bg.add_task(_run_build, pid)
    return {"status": "started"}

async def _run_build(pid: str):
    await db.build_status.update_one({"project_id": pid}, {"$set": {"status": "running", "at": NOW()}}, upsert=True)
    done = 0
    try:
        async for m in db.support_messages.find({"project_id": pid, "status": "approved"}):
            if await db.support_kb.find_one({"project_id": pid, "message_id": m["message_id"]}): continue
            raw = await call_llm(
                f'Message [{m["message_id"]}]: "{m["raw_message"]}" at {m["file_path"]}:{m["line_number"]}',
                'Analyse this application error message. Return STRICT JSON: {"conditions":["3-5 strings"],"severity":"High|Medium|Low","recommended_action":"string","technical_details":"string","business_context":"string"}. No prose outside JSON.'
            )
            try:
                t = raw.strip()
                if t.startswith("```"): t = t.split("```")[1].lstrip("json").strip()
                k = json.loads(t)
            except Exception:
                k = {"conditions": ["Unknown condition"], "severity": "Medium",
                     "recommended_action": "Investigate the error context.",
                     "technical_details": m["raw_message"], "business_context": "Application error occurred."}
            k.update(project_id=pid, message_id=m["message_id"], raw_message=m["raw_message"],
                     file_path=m["file_path"], line_number=m["line_number"], built_at=NOW())
            await db.support_kb.insert_one(k)
            done += 1
        await db.build_status.update_one({"project_id": pid},
            {"$set": {"status": f"completed — {done} entries", "at": NOW()}}, upsert=True)
    except Exception as e:
        await db.build_status.update_one({"project_id": pid}, {"$set": {"status": f"error: {e}"}}, upsert=True)

@router.get("/{pid}/support-kb")
async def get_support_kb(pid: str, _=Depends(require_admin)):
    return [k async for k in db.support_kb.find({"project_id": pid}, {"_id":0}).limit(200)]

@router.get("/{pid}/assistant-kb")
async def get_assistant_kb(pid: str, _=Depends(require_admin)):
    return [k async for k in db.assistant_kb.find({"project_id": pid}, {"_id":0}).limit(200)]
