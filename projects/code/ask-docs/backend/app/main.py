from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .db import Store
from .ingest import build_index
from .llm import LLMClient, build_llm
from .rag.embeddings import Embedder
from .rag.factory import build_embedder
from .routes import ask, documents


# region: factory
def create_app(settings: Settings | None = None, llm: LLMClient | None = None, embedder: Embedder | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.store = Store(settings.database_path)
        app.state.llm = llm or build_llm(settings)
        app.state.embedder = embedder or build_embedder(settings)
        app.state.index = build_index(app.state.store, app.state.embedder)       # read vectors back; nothing is re-embedded
        yield

    app = FastAPI(title="AskDocs API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])
    app.include_router(documents.router)
    app.include_router(ask.router)

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app
# endregion: factory


app = create_app()
