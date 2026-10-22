from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import run_agent
from .config import Settings, get_settings
from .llm import make_client
from .schemas import ChatRequest, TaskPatch
from .sse import SSE_HEADERS, sse
from .store import TaskStore
from .tools import ToolBox


def create_app(settings: Settings | None = None, client: anthropic.AsyncAnthropic | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.client = client or make_client(settings)        # None when there is no API key
        app.state.store = TaskStore(settings.database_path)
        yield

    app = FastAPI(title="TaskPal API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])

    @app.get("/api/health")
    def health(request: Request) -> dict:
        s: Settings = request.app.state.settings
        return {"status": "ok", "model": s.llm_model, "has_key": request.app.state.client is not None}

    # region: tasks-routes
    @app.get("/api/tasks")
    def list_tasks(request: Request) -> list[dict]:
        return request.app.state.store.list("all")

    @app.patch("/api/tasks/{task_id}")
    def patch_task(task_id: int, body: TaskPatch, request: Request) -> dict:
        """The tick-box on the board. The same store the agent's tools use, so the two always agree."""
        task = request.app.state.store.update(task_id, done=body.done)
        if task is None:
            raise HTTPException(404, "No such task")
        return task
    # endregion: tasks-routes

    # region: chat-route
    def today_in(tz: str):
        return lambda: datetime.now(ZoneInfo(tz)).date()

    async def chat_events(request: Request, body: ChatRequest) -> AsyncIterator[str]:
        s: Settings = request.app.state.settings
        if request.app.state.client is None:                       # say so plainly: no key, no agent
            yield sse("error", {"code": "no_key", "message": "ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart the server.", "retryable": False})
            return
        tools = ToolBox(request.app.state.store, today_in(s.timezone))
        async for event in run_agent(request.app.state.client, s, tools, body.message, body.history):
            yield sse(event.pop("type"), event)

    @app.post("/api/chat")
    async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
        return StreamingResponse(chat_events(request, body), media_type="text/event-stream", headers=SSE_HEADERS)
    # endregion: chat-route

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
