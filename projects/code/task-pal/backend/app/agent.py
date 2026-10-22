"""The agent loop: ask Claude what to do, do it, show Claude what happened, repeat until Claude answers."""
from collections.abc import AsyncIterator

import anthropic

from .config import Settings
from .llm import explain
from .pricing import cost_usd
from .prompts import SYSTEM
from .schemas import Turn
from .tools import TOOLS, ToolBox


# region: history
def history_messages(history: list[Turn]) -> list[dict]:
    """Earlier turns of the chat as plain text. The model has no memory: if we do not send them, it forgets.
    The API wants the first message to come from the user, so a leading assistant message is dropped."""
    messages = [{"role": t.role, "content": t.text} for t in history]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    return messages
# endregion: history


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
        if not tool_uses:                                       # no tool requested: Claude has finished, and the text is the answer
            usage = {"input_tokens": tokens_in, "output_tokens": tokens_out, "cost_usd": cost_usd(settings.llm_model, tokens_in, tokens_out)}
            yield {"type": "done", "answer": text, "steps": step + 1, "usage": usage}
            return

        if text:
            yield {"type": "note", "step": step, "text": text}   # "Let me check your list first." Shown, but it is not the answer
        messages.append({"role": "assistant", "content": response.content})      # exactly what Claude produced, tool_use blocks included
        results = []
        for use in tool_uses:
            yield {"type": "tool_call", "step": step, "id": use.id, "name": use.name, "input": use.input}
            outcome = tools.call(use.name, use.input)            # WE run the tool. Claude only asked.
            yield {"type": "tool_result", "id": use.id, "name": use.name, "ok": outcome.ok, "summary": outcome.summary, "changed": outcome.changed}
            results.append({"type": "tool_result", "tool_use_id": use.id, "content": outcome.content, "is_error": not outcome.ok})
        messages.append({"role": "user", "content": results})     # every result of this turn, in ONE user message

    yield {"type": "error", "code": "too_many_steps", "message": f"I could not finish within {settings.max_steps} steps. Try a simpler request.", "retryable": False}
# endregion: loop
