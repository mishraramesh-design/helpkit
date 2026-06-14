"""Shared LLM caller — reads provider config from DB."""
import os, httpx
from .core import db

async def get_llm_settings():
    return await db.llm_config.find_one({}, {"_id": 0}) or {}

async def call_llm(prompt: str, system: str = "You are a helpful assistant.") -> str:
    cfg = await get_llm_settings()
    provider = cfg.get("provider", "")
    api_key  = cfg.get("api_key", "")
    model    = cfg.get("model", "")
    base_url = cfg.get("base_url", "")

    if not api_key:
        return ""   # demo mode — caller handles fallback

    try:
        if provider == "groq" or base_url:
            url = (base_url or "https://api.groq.com/openai/v1").rstrip("/") + "/chat/completions"
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(url, headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model or "llama-3.3-70b-versatile", "temperature": 0.3,
                          "messages": [{"role":"system","content":system},{"role":"user","content":prompt}]})
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        elif provider == "openai":
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post("https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model or "gpt-4o-mini", "temperature": 0.3,
                          "messages": [{"role":"system","content":system},{"role":"user","content":prompt}]})
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        elif provider == "gemini":
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model or 'gemini-2.0-flash'}:generateContent?key={api_key}",
                    json={"system_instruction":{"parts":[{"text":system}]},
                          "contents":[{"parts":[{"text":prompt}]}]})
                r.raise_for_status()
                return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return f"[LLM error: {e}]"
    return ""
