"""Project CRUD — each project = one target application."""
import os, uuid
from fastapi import APIRouter, Depends, Body, BackgroundTasks, UploadFile, File, Form, HTTPException
from ..core import db, require_admin, new_api_key
from ..ingest import ingest_pdf, ingest_github
from datetime import datetime, timezone

router = APIRouter(prefix="/api/projects", tags=["projects"])
NOW = lambda: datetime.now(timezone.utc).isoformat()

@router.get("")
async def list_projects(_=Depends(require_admin)):
    return [p async for p in db.projects.find({}, {"_id":0})]

@router.post("")
async def create_project(body: dict = Body(...), _=Depends(require_admin)):
    pid = str(uuid.uuid4())[:8]
    doc = {
        "id": pid,
        "name": body.get("name", "Unnamed App"),
        "description": body.get("description", ""),
        "assistant_key": new_api_key(),
        "support_key": new_api_key(),
        "created_at": NOW(),
        "status": "active",
    }
    await db.projects.insert_one(doc)
    return {k:v for k,v in doc.items() if k != "_id"}

@router.get("/{pid}")
async def get_project(pid: str, _=Depends(require_admin)):
    p = await db.projects.find_one({"id": pid}, {"_id":0})
    if not p: return {"error": "not found"}, 404
    docs = []
    async for d in db.documents.find({"project_id": pid}):
        d["id"] = d.pop("_id")   # expose _id as "id" so frontend can use d.id
        docs.append(d)
    kb_count = await db.assistant_kb.count_documents({"project_id": pid})
    sup_count = await db.support_messages.count_documents({"project_id": pid, "status": "approved"})
    return {**p, "documents": docs, "assistant_kb_entries": kb_count, "support_kb_entries": sup_count}

@router.delete("/{pid}")
async def delete_project(pid: str, _=Depends(require_admin)):
    await db.projects.delete_one({"id": pid})
    await db.documents.delete_many({"project_id": pid})
    await db.assistant_kb.delete_many({"project_id": pid})
    await db.support_messages.delete_many({"project_id": pid})
    return {"ok": True}

@router.post("/{pid}/ingest/pdf")
async def upload_pdf(pid: str, bg: BackgroundTasks, doc_type: str = Form("manual"),
                     file: UploadFile = File(...), _=Depends(require_admin)):
    doc_id = str(uuid.uuid4())[:12]
    upload_dir = f"/tmp/hk_uploads/{pid}"
    os.makedirs(upload_dir, exist_ok=True)
    path = f"{upload_dir}/{doc_id}_{file.filename}"
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)
    doc = {
        "_id": doc_id, "project_id": pid, "type": doc_type,
        "filename": file.filename,
        "path": path,          # stored for re-scan
        "status": "queued", "created_at": NOW()
    }
    await db.documents.insert_one(doc)
    bg.add_task(ingest_pdf, pid, doc_id, path, doc_type)
    return {"doc_id": doc_id, "status": "queued"}

@router.post("/{pid}/ingest/github")
async def ingest_repo(pid: str, bg: BackgroundTasks, body: dict = Body(...), _=Depends(require_admin)):
    doc_id = str(uuid.uuid4())[:12]
    repo_url = body.get("repo_url", "")
    token    = body.get("token", "")
    doc = {
        "_id": doc_id, "project_id": pid, "type": "github",
        "filename": repo_url,
        "github_url": repo_url,   # stored for re-scan
        "github_token": token,    # stored for re-scan (private repos)
        "status": "queued", "created_at": NOW()
    }
    await db.documents.insert_one(doc)
    bg.add_task(ingest_github, pid, doc_id, repo_url, token)
    return {"doc_id": doc_id, "status": "queued"}

# ── Per-document: Re-scan ────────────────────────────────────────────────────
@router.post("/{pid}/documents/{doc_id}/rescan")
async def rescan_document(pid: str, doc_id: str, bg: BackgroundTasks,
                          body: dict = Body(default={}), _=Depends(require_admin)):
    """Re-ingest an existing document, wiping its old KB entries first."""
    doc = await db.documents.find_one({"_id": doc_id, "project_id": pid})
    if not doc:
        raise HTTPException(404, "Document not found")

    # Wipe old KB entries generated from this document
    await db.assistant_kb.delete_many({"doc_id": doc_id})
    await db.support_messages.delete_many({"doc_id": doc_id})
    await db.documents.update_one({"_id": doc_id}, {"$set": {"status": "queued"}})

    if doc["type"] == "github":
        # Allow caller to supply/update token (e.g. user just added one)
        token = body.get("token") or doc.get("github_token", "")
        if body.get("token"):
            await db.documents.update_one({"_id": doc_id}, {"$set": {"github_token": token}})
        url = doc.get("github_url") or doc.get("filename", "")
        bg.add_task(ingest_github, pid, doc_id, url, token)
    else:
        path = doc.get("path")
        if not path or not os.path.exists(path):
            raise HTTPException(422, "Original file not available — please upload again")
        bg.add_task(ingest_pdf, pid, doc_id, path, doc.get("type", "manual"))

    return {"ok": True, "status": "queued"}

# ── Per-document: Delete ─────────────────────────────────────────────────────
@router.delete("/{pid}/documents/{doc_id}")
async def delete_document(pid: str, doc_id: str, _=Depends(require_admin)):
    """Remove a document and all KB entries derived from it."""
    result = await db.documents.delete_one({"_id": doc_id, "project_id": pid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    await db.assistant_kb.delete_many({"doc_id": doc_id})
    await db.support_messages.delete_many({"doc_id": doc_id})
    return {"ok": True}
