from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .llm import LLMClient, build_llm
from .repos import RepoStore, load_sample
from .routes import ask, repos


# region: app
def create_app(settings: Settings | None = None, llm: LLMClient | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.llm = llm or build_llm(settings)
        app.state.repos = RepoStore(settings.max_repos)
        app.state.repos.add(load_sample())                      # the built-in repository is always there to ask about
        yield

    app = FastAPI(title="RepoChat API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc: RequestValidationError):
        first = exc.errors()[0]
        return JSONResponse(status_code=422, content={"detail": {"code": "invalid_input", "message": f"{'.'.join(str(p) for p in first['loc'][1:])}: {first['msg']}"}})

    app.include_router(repos.router)
    app.include_router(ask.router)
    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app
# endregion: app


app = create_app()
