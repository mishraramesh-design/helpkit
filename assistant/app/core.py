import os, secrets
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException, Header

MONGO_URL   = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME     = os.getenv("DB_NAME", "helpkit")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "hk-admin-token")

_client = AsyncIOMotorClient(MONGO_URL)
db      = _client[DB_NAME]

async def require_admin(x_admin_token: str = Header(...)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(401, "Invalid admin token")

def new_api_key():
    return "hk-" + secrets.token_urlsafe(24)
