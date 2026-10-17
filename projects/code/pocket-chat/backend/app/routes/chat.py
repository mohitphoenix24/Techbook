import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..config import Settings
from ..context import trim_history
from ..db import Store
from ..deps import get_app_settings, get_llm, get_store, rate_limit
from ..llm import LLMClient, LLMError, StreamDone, TextDelta
from ..personas import DEFAULT_PERSONA, PERSONAS, system_prompt
from ..pricing import cost_usd
from ..schemas import ChatRequest
from ..sse import SSE_HEADERS, sse

router = APIRouter(prefix="/api", tags=["chat"])
log = logging.getLogger("pocketchat")


# region: events
async def chat_events(
    *,
    store: Store,
    llm: LLMClient,
    settings: Settings,
    conversation_id: str,
    persona: str,
) -> AsyncIterator[str]:
    """Stream one assistant reply as SSE events: meta, delta..., usage, done (or error)."""
    history = [{"role": m["role"], "content": m["content"]} for m in store.messages(conversation_id)]
    messages, dropped = trim_history(history, settings.context_budget_tokens)

    yield sse("meta", {
        "conversation_id": conversation_id, "persona": persona,
        "provider": llm.name, "model": llm.model, "history_dropped": dropped,
    })

    parts: list[str] = []
    saved = False

    def save(*, stopped: bool, input_tokens=0, output_tokens=0) -> int:
        nonlocal saved
        saved = True
        return store.add_message(
            conversation_id, "assistant", "".join(parts),
            input_tokens=input_tokens, output_tokens=output_tokens,
            cost_usd=cost_usd(llm.model, input_tokens, output_tokens), stopped=stopped,
        )

    try:
        async for event in llm.stream(system=system_prompt(persona), messages=messages, max_tokens=settings.max_output_tokens):
            if isinstance(event, TextDelta):
                parts.append(event.text)
                yield sse("delta", {"text": event.text})
            elif isinstance(event, StreamDone):
                usage = event.usage
                message_id = save(stopped=False, input_tokens=usage.input_tokens, output_tokens=usage.output_tokens)
                log.info("reply saved conversation=%s model=%s in=%d out=%d cost=$%.5f", conversation_id, llm.model,
                         usage.input_tokens, usage.output_tokens, cost_usd(llm.model, usage.input_tokens, usage.output_tokens))
                yield sse("usage", {
                    "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
                    "cost_usd": cost_usd(llm.model, usage.input_tokens, usage.output_tokens),
                    "stop_reason": event.stop_reason,
                })
                yield sse("done", {"message_id": message_id})
    except LLMError as exc:
        yield sse("error", {"code": exc.code, "message": exc.message, "retryable": exc.retryable})
    finally:
        # Runs on success, on an LLM error, and when the browser disconnects (the user pressed Stop).
        # Whatever text we already streamed is kept, marked as "stopped".
        if parts and not saved:
            save(stopped=True)
# endregion: events


# region: endpoint
@router.post("/chat", dependencies=[Depends(rate_limit)])
async def chat(
    body: ChatRequest,
    store: Store = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
    settings: Settings = Depends(get_app_settings),
) -> StreamingResponse:
    persona = body.persona if body.persona in PERSONAS else DEFAULT_PERSONA

    # Everything that can fail with a normal HTTP error happens BEFORE streaming starts:
    # once the first byte is sent the status code is 200 and can no longer change.
    if body.conversation_id:
        conversation = store.get_conversation(body.conversation_id)
        if conversation is None:
            raise HTTPException(404, "Conversation not found")
        conversation_id = conversation["id"]
    else:
        if not body.message.strip():
            raise HTTPException(422, "Write a message first.")
        conversation_id = store.create_conversation(title=body.message.strip(), persona=persona)

    if body.regenerate:
        store.delete_last_assistant_message(conversation_id)
        messages = store.messages(conversation_id)
        if not messages or messages[-1]["role"] != "user":
            raise HTTPException(422, "There is nothing to regenerate.")
    else:
        if not body.message.strip():
            raise HTTPException(422, "Write a message first.")
        store.add_message(conversation_id, "user", body.message.strip())

    stream = chat_events(store=store, llm=llm, settings=settings, conversation_id=conversation_id, persona=persona)
    return StreamingResponse(stream, media_type="text/event-stream", headers=SSE_HEADERS)
# endregion: endpoint
