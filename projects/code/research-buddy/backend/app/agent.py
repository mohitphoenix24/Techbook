"""The agent loop for a research question. Same shape as the earlier projects, with three new things to handle:
searches that Anthropic runs for us (we only report them), a turn that can PAUSE and must be resumed, and citations."""
from collections.abc import AsyncIterator

import anthropic

from .config import Settings
from .llm import explain
from .pricing import cost_usd
from .prompts import SYSTEM
from .research import render_answer, search_calls, search_results, searched_sources, searches_in, split_turn, web_searches_billed
from .schemas import Turn
from .tools import build_tools, run_client_tool


def history_messages(history: list[Turn]) -> list[dict]:
    """Earlier turns of the chat as plain text. The API wants the first message to come from the user."""
    messages = [{"role": t.role, "content": t.text} for t in history]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    return messages


# region: append
def append_assistant(messages: list[dict], content: list) -> None:
    """Add what Claude produced to the conversation, exactly as received. If the previous message is already Claude's (a paused turn that is
    being continued), the new blocks join it, so the history reads like one uninterrupted turn."""
    if messages and messages[-1]["role"] == "assistant":
        messages[-1]["content"] = [*messages[-1]["content"], *content]
    else:
        messages.append({"role": "assistant", "content": list(content)})
# endregion: append


# region: loop
async def run_agent(client: anthropic.AsyncAnthropic, settings: Settings, message: str, history: list[Turn]) -> AsyncIterator[dict]:
    """Yield events: step, note, search, search_result, tool_call, tool_result, then done (or error)."""
    tools = build_tools(settings)
    messages = [*history_messages(history), {"role": "user", "content": message}]
    tokens_in = tokens_out = billed_searches = 0
    seen: list[dict] = []                                           # every content block of the whole run, for the final summary

    for step in range(settings.max_steps):                          # the brake: at most max_steps paid calls
        yield {"type": "step", "step": step}
        try:
            response = await client.messages.create(
                model=settings.llm_model, max_tokens=settings.max_output_tokens, system=SYSTEM, tools=tools,
                messages=messages, output_config={"effort": settings.llm_effort},
            )
        except anthropic.APIError as exc:
            yield {"type": "error", **explain(exc)}
            return
        tokens_in += response.usage.input_tokens
        tokens_out += response.usage.output_tokens
        billed_searches += web_searches_billed(response.usage)

        if response.stop_reason == "refusal":
            yield {"type": "error", "code": "refused", "message": "Claude declined this request.", "retryable": False}
            return
        if response.stop_reason == "max_tokens":
            yield {"type": "error", "code": "truncated", "message": "The answer was cut off. Try a narrower question.", "retryable": False}
            return

        blocks = [b.model_dump(mode="json") for b in response.content]    # plain dicts to read; `response.content` itself is what we send back
        seen.extend(blocks)
        narration, answer_blocks = split_turn(blocks)
        for text in (b["text"] for b in narration if b["text"].strip()):
            yield {"type": "note", "step": step, "text": text}
        for call in search_calls(blocks):
            yield {"type": "search", **call}
        for result in search_results(blocks):
            yield {"type": "search_result", **result}

        client_calls = [b for b in blocks if b["type"] == "tool_use"]
        if response.stop_reason == "pause_turn":                    # a long search turn paused: send it back unchanged and the service carries on
            append_assistant(messages, response.content)
            continue
        if client_calls:                                            # the calculator: WE run it. The searches already ran on Anthropic's side.
            append_assistant(messages, response.content)
            results = []
            for call in client_calls:
                yield {"type": "tool_call", "step": step, "id": call["id"], "name": call["name"], "input": call["input"]}
                outcome = run_client_tool(call["name"], call["input"])
                yield {"type": "tool_result", "id": call["id"], "name": call["name"], "ok": outcome.ok, "summary": outcome.summary}
                results.append({"type": "tool_result", "tool_use_id": call["id"], "content": outcome.content, "is_error": not outcome.ok})
            messages.append({"role": "user", "content": results})
            continue

        answer, sources = render_answer(answer_blocks or narration)       # no tool was requested: the text after the last tool block is the answer
        searches = searches_in(seen)
        usage = {"input_tokens": tokens_in, "output_tokens": tokens_out, "searches": billed_searches,
                 "cost_usd": cost_usd(settings.llm_model, tokens_in, tokens_out, billed_searches)}
        yield {"type": "done", "answer": answer, "sources": sources, "searched": searched_sources(searches), "steps": step + 1, "usage": usage}
        return

    yield {"type": "error", "code": "too_many_steps", "message": f"I could not finish within {settings.max_steps} steps. Try a narrower question.", "retryable": False}
# endregion: loop
