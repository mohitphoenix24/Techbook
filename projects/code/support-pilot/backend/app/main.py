from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .gateway import Clock, Gateway, RateLimiter
from .llm.base import LLMClient
from .llm.factory import build_gateway
from .routes import meta, tickets
from .seed import ORDERS, SAMPLE_TICKETS
from .store import Store


# region: app
def create_app(settings: Settings | None = None, llm: LLMClient | None = None, gateway: Gateway | None = None, clock: Clock | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = Store(settings.database_path)
        store.init(ORDERS, SAMPLE_TICKETS)                                    # on the first start: the demo shop and a demo inbox
        app.state.settings, app.state.store = settings, store
        app.state.clock = clock or Clock()
        app.state.gateway = gateway or build_gateway(settings, primary=llm, clock=app.state.clock)
        app.state.intake_limiter = RateLimiter(settings.intake_per_minute, app.state.clock)
        app.state.processing = set()                                          # tickets the copilot is working on right now
        yield

    app = FastAPI(title="SupportPilot API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc: RequestValidationError):
        first = exc.errors()[0]
        return JSONResponse(status_code=422, content={"detail": {"code": "invalid_input", "message": f"{'.'.join(str(p) for p in first['loc'][1:])}: {first['msg']}"}})

    app.include_router(meta.router)
    app.include_router(tickets.router)

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app
# endregion: app


app = create_app()
