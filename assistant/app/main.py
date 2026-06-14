from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from .routers import projects, config, widget, support_widget, admin_kb

app = FastAPI(title="HelpKit API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(projects.router)
app.include_router(config.router)
app.include_router(widget.router)
app.include_router(support_widget.router)
app.include_router(admin_kb.router)

@app.get("/api/health")
async def health(): return {"status": "ok", "service": "helpkit-api"}

# Serve static embed files
if os.path.exists("/app/static"):
    app.mount("/embed", StaticFiles(directory="/app/static/embed"), name="embed")
