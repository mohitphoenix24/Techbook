from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import run_agent
from .config import Settings, get_settings
from .llm import make_client
from .notes import NoteError, Notes, clean_name
from .proposals import Proposals
from .schemas import ChatRequest
from .seed import seed_if_empty
from .sse import SSE_HEADERS, sse
from .tools import ToolBox


def create_app(settings: Settings | None = None, client: anthropic.AsyncAnthropic | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.client = client or make_client(settings)        # None when there is no API key
        app.state.notes = Notes(settings.notes_dir, settings.max_note_chars, settings.max_notes)
        seed_if_empty(app.state.notes)
        app.state.proposals = Proposals()
        yield

    app = FastAPI(title="NoteKeeper API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/api/health")
    def health(request: Request) -> dict:
        return {"status": "ok", "model": request.app.state.settings.llm_model, "has_key": request.app.state.client is not None}

    @app.get("/api/notes")
    def list_notes(request: Request) -> list[dict]:
        return request.app.state.notes.info()

    @app.get("/api/notes/{name}")
    def read_note(name: str, request: Request) -> dict:
        try:
            return {"name": clean_name(name), "content": request.app.state.notes.read(name)}
        except NoteError as exc:
            raise HTTPException(404, str(exc)) from exc

    # region: proposal-routes
    @app.get("/api/proposals")
    def list_proposals(request: Request) -> list[dict]:
        return [p.public() for p in request.app.state.proposals.all()]

    @app.post("/api/proposals/{pid}/apply")
    def apply_proposal(pid: int, request: Request) -> dict:
        """The one place a note is changed, and only a person's click gets here: the agent's tools have no route to it."""
        try:
            return request.app.state.proposals.apply(pid, request.app.state.notes).public()
        except NoteError as exc:
            raise HTTPException(404 if "no proposal" in str(exc) else 409, str(exc)) from exc

    @app.post("/api/proposals/{pid}/reject")
    def reject_proposal(pid: int, request: Request) -> dict:
        try:
            return request.app.state.proposals.reject(pid).public()
        except NoteError as exc:
            raise HTTPException(404 if "no proposal" in str(exc) else 409, str(exc)) from exc
    # endregion: proposal-routes

    async def chat_events(request: Request, body: ChatRequest) -> AsyncIterator[str]:
        s: Settings = request.app.state.settings
        if request.app.state.client is None:                       # say so plainly: no key, no agent
            yield sse("error", {"code": "no_key", "message": "ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart the server.", "retryable": False})
            return
        tools = ToolBox(request.app.state.notes, request.app.state.proposals)
        async for event in run_agent(request.app.state.client, s, tools, body.message, body.history):
            yield sse(event.pop("type"), event)

    @app.post("/api/chat")
    async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
        return StreamingResponse(chat_events(request, body), media_type="text/event-stream", headers=SSE_HEADERS)

    dist = Path(settings.frontend_dist)
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
