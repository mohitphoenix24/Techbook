"""The agent loop: ask the model what to do, do it, show the model what happened, repeat until it is done."""
from collections.abc import AsyncIterator
from typing import Any

from .llm import LLMClient, LLMError, TextDelta, TurnDone, Usage
from .prompts import SYSTEM
from .tools import TOOLS, ToolBox

# region: history
def history_messages(history: list[dict]) -> list[dict]:
    """Earlier turns, as plain text. The queries are written into the assistant's message, so a follow-up such as
    "show that as a chart" can refer to them."""
    messages: list[dict] = []
    for turn in history[-4:]:
        messages.append({"role": "user", "content": turn["question"]})
        sql = " | ".join(turn.get("queries", [])[-1:])
        messages.append({"role": "assistant", "content": turn["answer"] + (f"\n(SQL used: {sql})" if sql else "")})
    return messages
# endregion: history


def summarise(output) -> str:
    """A one-line description of a tool result for the interface's timeline."""
    ui = output.ui
    if not output.ok:
        return output.content.removeprefix("Error: ")
    return {"table": f"{ui.get('row_count', 0)} rows in {ui.get('ms', 0)} ms{' (truncated)' if ui.get('truncated') else ''}",
            "chart": f"{ui.get('kind')} chart shown", "columns": f"{len(ui.get('columns', []))} columns", "tables": f"{len(ui.get('tables', []))} tables"}.get(ui.get("type"), "done")


# region: loop
async def run_agent(
    llm: LLMClient, toolbox: ToolBox, question: str, history: list[dict], *, max_steps: int = 6, max_tokens: int = 2000,
    hints: dict[str, Any] | None = None,
) -> AsyncIterator[dict]:
    """Yield events: turn, delta, tool_call, tool_result, then usage and done (or error). One generator = one question."""
    messages = [*history_messages(history), {"role": "user", "content": question}]
    usage, queries, answer = Usage(), [], ""

    for step in range(max_steps):
        yield {"type": "turn", "turn": step}
        done = None
        try:
            async for event in llm.turn(system=SYSTEM, messages=messages, tools=TOOLS, max_tokens=max_tokens, hints=hints):
                if isinstance(event, TextDelta):
                    yield {"type": "delta", "turn": step, "text": event.text}
                elif isinstance(event, TurnDone):
                    done = event.turn
        except LLMError as exc:
            yield {"type": "error", "code": exc.code, "message": exc.message, "retryable": exc.retryable}
            return
        assert done is not None
        usage = usage + done.usage

        if not done.tool_uses:                                  # the model has nothing more to do: that text is the answer
            answer = done.text
            break

        messages.append({"role": "assistant", "content": done.content})          # exactly what the model produced
        results = []
        for use in done.tool_uses:
            yield {"type": "tool_call", "turn": step, "id": use.id, "name": use.name, "input": use.input}
            output = toolbox.call(use.name, use.input)                           # WE run the tool, never the model
            if use.name == "run_sql" and output.ok:
                queries.append(output.ui["sql"])
            yield {"type": "tool_result", "id": use.id, "name": use.name, "ok": output.ok, "summary": summarise(output), "ui": output.ui}
            results.append({"type": "tool_result", "tool_use_id": use.id, "content": output.content, "is_error": not output.ok})
        messages.append({"role": "user", "content": results})                    # ALL results of a turn go back in ONE message
    else:                                                       # the loop used every step without finishing: stop, and say so
        yield {"type": "error", "code": "too_many_steps", "message": f"I could not finish within {max_steps} steps. Try a narrower question.", "retryable": False}
        return

    yield {"type": "done", "answer": answer, "queries": queries, "usage": {"input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens}}
# endregion: loop
