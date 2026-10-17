import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .llm import LLMClient, build_llm
from .routes import ask, data
from .seed import build_database


# region: ensure-db
def ensure_database(path: str) -> None:
    """Create the shop the first time the app starts. Same seed, same shop, so everyone sees the same numbers."""
    if not Path(path).exists():
        conn = sqlite3.connect(path)
        build_database(conn)
        conn.close()
# endregion: ensure-db


def create_app(settings: Settings | None = None, llm: LLMClient | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        ensure_database(settings.database_path)
        app.state.settings = settings
        app.state.llm = llm or build_llm(settings)
        yield

    app = FastAPI(title="DataPilot API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.include_router(data.router)
    app.include_router(ask.router)

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
