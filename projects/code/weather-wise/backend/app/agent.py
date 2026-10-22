"""The agent loop: ask Claude what to do, do it, show Claude what happened, repeat until Claude answers.
Same loop as TaskPal, with one new idea: when Claude asks for several tools in one turn, they run at the same time."""
import asyncio
from collections.abc import AsyncIterator

import anthropic

from .config import Settings
from .llm import explain
from .pricing import cost_usd
from .prompts import SYSTEM
from .schemas import Turn
from .tools import TOOLS, ToolBox


def history_messages(history: list[Turn]) -> list[dict]:
    """Earlier turns of the chat as plain text. The API wants the first message to come from the user."""
    messages = [{"role": t.role, "content": t.text} for t in history]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    return messages


# region: loop
async def run_agent(client: anthropic.AsyncAnthropic, settings: Settings, tools: ToolBox, message: str, history: list[Turn]) -> AsyncIterator[dict]:
    """Yield events: step, note, tool_call, tool_result, then done (or error). One generator = one user message."""
    messages = [*history_messages(history), {"role": "user", "content": message}]
    tokens_in = tokens_out = 0

    for step in range(settings.max_steps):                      # the brake: at most max_steps paid calls
        yield {"type": "step", "step": step}
        try:
            response = await client.messages.create(
                model=settings.llm_model, max_tokens=settings.max_output_tokens, system=SYSTEM, tools=TOOLS,
                messages=messages, output_config={"effort": settings.llm_effort},
            )
        except anthropic.APIError as exc:
            yield {"type": "error", **explain(exc)}
            return
        tokens_in += response.usage.input_tokens
        tokens_out += response.usage.output_tokens

        if response.stop_reason == "refusal":
            yield {"type": "error", "code": "refused", "message": "Claude declined this request.", "retryable": False}
            return
        if response.stop_reason == "max_tokens":
            yield {"type": "error", "code": "truncated", "message": "The reply was cut off. Try a shorter request.", "retryable": False}
            return

        text = "".join(b.text for b in response.content if b.type == "text")
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            usage = {"input_tokens": tokens_in, "output_tokens": tokens_out, "cost_usd": cost_usd(settings.llm_model, tokens_in, tokens_out)}
            yield {"type": "done", "answer": text, "steps": step + 1, "usage": usage}
            return

        if text:
            yield {"type": "note", "step": step, "text": text}
        messages.append({"role": "assistant", "content": response.content})
        for use in tool_uses:                                    # show every request first...
            yield {"type": "tool_call", "step": step, "id": use.id, "name": use.name, "input": use.input}
        outcomes = await asyncio.gather(*(tools.call(u.name, u.input) for u in tool_uses))      # ...then run them all at once
        results = []
        for use, outcome in zip(tool_uses, outcomes):
            yield {"type": "tool_result", "id": use.id, "name": use.name, "ok": outcome.ok, "summary": outcome.summary, "ui": outcome.ui}
            results.append({"type": "tool_result", "tool_use_id": use.id, "content": outcome.content, "is_error": not outcome.ok})
        messages.append({"role": "user", "content": results})     # every result of this turn, in ONE user message

    yield {"type": "error", "code": "too_many_steps", "message": f"I could not finish within {settings.max_steps} steps. Try a simpler request.", "retryable": False}
# endregion: loop
