"""Reading what the web-search tool sends back. No network and no SDK objects here: every function takes plain dicts (the
response's content blocks, as JSON) and returns plain data, so it is easy to read, to test and to run in a browser."""
from typing import Any
from urllib.parse import urlparse

SEARCH_ERRORS = {
    "too_many_requests": "The search service is busy. Try again in a moment.",
    "max_uses_exceeded": "The search limit for this question was reached.",
    "invalid_tool_input": "The search query was not valid.",
    "query_too_long": "The search query was too long.",
    "request_too_large": "The search request was too large.",
    "unavailable": "The search service is unavailable right now.",
}


# region: split
def is_tool_block(block: dict) -> bool:
    return block.get("type") in ("server_tool_use", "web_search_tool_result", "tool_use")


def split_turn(blocks: list[dict]) -> tuple[list[dict], list[dict]]:
    """(narration, answer). Claude writes text before it searches ("I'll look that up") and text after it has read the results.
    The text after the last tool block is the answer; text before it is just narration."""
    last = max((i for i, b in enumerate(blocks) if is_tool_block(b)), default=-1)
    texts = [(i, b) for i, b in enumerate(blocks) if b.get("type") == "text"]
    return [b for i, b in texts if i < last], [b for i, b in texts if i > last]
# endregion: split


# region: searches
def search_calls(blocks: list[dict]) -> list[dict]:
    """The searches Claude decided to make: [{id, query}]. The service runs them; we only watch."""
    return [{"id": b["id"], "query": (b.get("input") or {}).get("query", "")} for b in blocks if b.get("type") == "server_tool_use" and b.get("name") == "web_search"]


def search_results(blocks: list[dict]) -> list[dict]:
    """What the searches found: [{id, ok, results} or {id, ok: False, error}]. A search that fails is still a 200 response: the
    result block's `content` is then ONE error object instead of a list of results."""
    out = []
    for b in blocks:
        if b.get("type") != "web_search_tool_result":
            continue
        content = b.get("content")
        if isinstance(content, dict):
            code = content.get("error_code", "unavailable")
            out.append({"id": b["tool_use_id"], "ok": False, "error": SEARCH_ERRORS.get(code, f"Search failed ({code}).")})
        else:
            results = [{"title": r.get("title") or r.get("url", ""), "url": r.get("url", ""), "age": r.get("page_age")} for r in (content or []) if r.get("type") == "web_search_result"]
            out.append({"id": b["tool_use_id"], "ok": True, "results": results})
    return out


def searches_in(blocks: list[dict]) -> list[dict]:
    """Calls and results joined, over any number of responses: a paused turn can hold a search in one response and its results in the next."""
    found = {r["id"]: r for r in search_results(blocks)}
    return [{**c, **found.get(c["id"], {"ok": True, "results": []})} for c in search_calls(blocks)]
# endregion: searches


# region: render
def render_answer(answer_blocks: list[dict]) -> tuple[str, list[dict]]:
    """Text blocks with citations -> (text with [1] [2] markers, numbered sources).
    Each source gets a number the first time it is cited, so the markers read 1, 2, 3 in order."""
    numbers: dict[str, int] = {}
    sources: list[dict] = []
    text = ""
    for block in answer_blocks:
        piece = block.get("text", "")
        marks = ""
        for cite in block.get("citations") or []:
            if cite.get("type") != "web_search_result_location" or not cite.get("url"):
                continue
            n = numbers.get(cite["url"])
            if n is None:
                n = numbers[cite["url"]] = len(numbers) + 1
                sources.append({"n": n, "title": cite.get("title") or cite["url"], "url": cite["url"], "quote": (cite.get("cited_text") or "")[:200]})
            if f"[{n}]" not in marks:
                marks += f"[{n}]"
        body = piece.rstrip()
        text += body + marks + piece[len(body):]                   # the marker goes right after the words, before any trailing space
    return text.strip(), sources
# endregion: render


def searched_sources(searches: list[dict]) -> list[dict]:
    """Every page the searches returned (not only the cited ones), once each: for an 'also looked at' list."""
    seen, out = set(), []
    for s in searches:
        for r in s.get("results", []):
            if r["url"] and r["url"] not in seen:
                seen.add(r["url"])
                out.append(r)
    return out


def web_searches_billed(usage: Any) -> int:
    """How many searches a response used, from its usage block (an SDK object or a dict; absent when no search ran)."""
    tool_usage = usage.get("server_tool_use") if isinstance(usage, dict) else getattr(usage, "server_tool_use", None)
    if tool_usage is None:
        return 0
    return (tool_usage.get("web_search_requests") if isinstance(tool_usage, dict) else getattr(tool_usage, "web_search_requests", 0)) or 0


def domain_of(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host.removeprefix("www.")
