from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..agent import run_agent
from ..config import Settings
from ..deps import get_app_settings, get_llm
from ..llm import LLMClient
from ..pricing import cost_usd
from ..schemas import AskRequest
from ..sse import SSE_HEADERS, sse
from ..tools import ToolBox

router = APIRouter(prefix="/api", tags=["ask"])


# region: events
async def ask_events(body: AskRequest, llm: LLMClient, settings: Settings) -> AsyncIterator[str]:
    """Run the agent and turn each of its events into an SSE event. A new ToolBox per question: no shared state."""
    toolbox = ToolBox(settings.database_path, settings.max_rows, settings.query_timeout_seconds)
    hints = {"simulate_mistake": body.simulate_mistake} if body.simulate_mistake != "none" else None
    async for event in run_agent(llm, toolbox, body.question, [t.model_dump() for t in body.history],
                                 max_steps=settings.max_steps, max_tokens=settings.max_output_tokens, hints=hints):
        if event["type"] == "done":
            usage = event.pop("usage")
            yield sse("usage", {**usage, "cost_usd": cost_usd(llm.model, usage["input_tokens"], usage["output_tokens"])})
        yield sse(event.pop("type"), event)
# endregion: events


# region: route
@router.post("/ask")
async def ask(body: AskRequest, llm: LLMClient = Depends(get_llm), settings: Settings = Depends(get_app_settings)) -> StreamingResponse:
    return StreamingResponse(ask_events(body, llm, settings), media_type="text/event-stream", headers=SSE_HEADERS)
# endregion: route
