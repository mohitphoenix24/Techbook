from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .db import Store
from .llm import LLMClient, build_llm
from .ratelimit import SlidingWindowLimiter
from .routes import chat, conversations


# region: factory
def create_app(settings: Settings | None = None, llm: LLMClient | None = None) -> FastAPI:
    """Build the app. Tests pass their own settings and a fake LLM; production passes nothing."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.store = Store(settings.database_path)
        app.state.llm = llm or build_llm(settings)
        app.state.limiter = SlidingWindowLimiter(settings.rate_limit_per_minute) if settings.rate_limit_per_minute else None
        yield

    app = FastAPI(title="Pocket Chat API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.include_router(conversations.router)
    app.include_router(chat.router)

    # region: static
    # In production one process can serve everything: the API under /api and the built React app at /.
    # Mounted last, so it never shadows an API route.
    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    # endregion: static
    return app
# endregion: factory


app = create_app()
