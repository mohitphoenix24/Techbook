from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..config import Settings
from ..deps import get_llm, get_repo, get_settings_dep
from ..llm import LLMClient, LLMError, TextDelta, TextDone
from ..llm.mock_client import NO_ANSWER
from ..pricing import cost_usd
from ..rag.citations import validate
from ..rag.codetext import code_tokens
from ..rag.prompt import SYSTEM, user_message
from ..rag.retrieve import retrieve
from ..repos import Repo
from ..schemas import AskRequest
from ..sse import SSE_HEADERS, sse
from .shared import hit_json

router = APIRouter(prefix="/api", tags=["ask"])


# region: events
async def ask_events(repo: Repo, body: AskRequest, llm: LLMClient, settings: Settings) -> AsyncIterator[str]:
    """retrieval, then the answer word by word, then the checked citations, the cost and the end."""
    result = retrieve(repo.index, repo.graph, body.question, k=settings.top_k, expand=body.expand)
    yield sse("retrieval", {"hits": [hit_json(h) for h in result.context], "terms": list(dict.fromkeys(code_tokens(body.question)))})

    if not result.hits:                                        # nothing relevant: do not pay a model to improvise
        yield sse("delta", {"text": NO_ANSWER})
        yield sse("citations", {"items": [], "uncited": False})
        yield sse("done", {})
        return

    shown = [h.chunk for h in result.context]
    messages = [{"role": "user", "content": user_message(body.question, shown)}]
    final: TextDone | None = None
    try:
        async for event in llm.stream_text(system=SYSTEM, messages=messages, max_tokens=settings.max_output_tokens,
                                           hints={"chunks": shown, "simulate": body.simulate}):
            if isinstance(event, TextDelta):
                yield sse("delta", {"text": event.text})
            else:
                final = event
    except LLMError as exc:
        yield sse("error", {"code": exc.code, "message": exc.message, "retryable": exc.retryable})
        return
    assert final is not None
    checked = validate(final.text, repo.files, shown)
    yield sse("citations", {"items": [c.__dict__ for c in checked], "uncited": not checked})
    yield sse("usage", {"input_tokens": final.usage.input_tokens, "output_tokens": final.usage.output_tokens,
                        "cost_usd": cost_usd(llm.model, final.usage.input_tokens, final.usage.output_tokens)})
    yield sse("done", {})
# endregion: events


# region: route
@router.post("/repos/{repo_id}/ask")
async def ask(body: AskRequest, repo: Repo = Depends(get_repo), llm: LLMClient = Depends(get_llm), settings: Settings = Depends(get_settings_dep)) -> StreamingResponse:
    return StreamingResponse(ask_events(repo, body, llm, settings), media_type="text/event-stream", headers=SSE_HEADERS)
# endregion: route
