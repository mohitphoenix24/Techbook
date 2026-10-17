"""FastAPI dependencies: how route functions receive shared objects without importing globals."""
from fastapi import HTTPException, Request

from .config import Settings
from .db import Store
from .llm import LLMClient


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


# region: rate-limit
def rate_limit(request: Request) -> None:
    """Dependency: refuse with 429 and a Retry-After header when a client calls too often."""
    limiter = request.app.state.limiter
    if limiter is None:
        return
    ip = request.client.host if request.client else "unknown"
    allowed, wait = limiter.allow(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many messages. Please wait {int(wait) + 1} seconds.",
            headers={"Retry-After": str(int(wait) + 1)},
        )
# endregion: rate-limit
