"""Response shapes for the tests, written to match the web-search documentation (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool).
They are plain data, used to test the code that READS responses. They are not a model and they replace no part of the app."""


def message(content: list[dict], stop_reason: str = "end_turn", searches: int = 0) -> dict:
    return {"id": "msg_shape", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "content": content,
            "stop_reason": stop_reason, "stop_sequence": None,
            "usage": {"input_tokens": 6039, "output_tokens": 931, **({"server_tool_use": {"web_search_requests": searches, "web_fetch_requests": 0}} if searches else {})}}


def text(t: str, *cites: tuple[str, str, str]) -> dict:
    block = {"type": "text", "text": t}
    if cites:
        block["citations"] = [{"type": "web_search_result_location", "url": u, "title": title, "cited_text": quote, "encrypted_index": "Eo8B..."} for u, title, quote in cites]
    return block


def search(call_id: str, query: str) -> dict:
    return {"type": "server_tool_use", "id": call_id, "name": "web_search", "input": {"query": query}}


def results(call_id: str, *pages: tuple[str, str, str | None]) -> dict:
    return {"type": "web_search_tool_result", "tool_use_id": call_id,
            "content": [{"type": "web_search_result", "url": u, "title": t, "page_age": age, "encrypted_content": "EqgfCioIARgB..."} for u, t, age in pages]}


def failed(call_id: str, code: str) -> dict:
    return {"type": "web_search_tool_result", "tool_use_id": call_id, "content": {"type": "web_search_tool_result_error", "error_code": code}}


WIKI = "https://en.wikipedia.org/wiki/Claude_Shannon"
BRITANNICA = "https://www.britannica.com/biography/Claude-Shannon"

# A search turn: narration, a search, results, then an answer made of text blocks, two of them cited.
SHANNON = message([
    text("I'll search for when Claude Shannon was born."),
    search("srvtoolu_1", "claude shannon birth date"),
    results("srvtoolu_1", (WIKI, "Claude Shannon - Wikipedia", "April 30, 2025"), (BRITANNICA, "Claude Shannon | Britannica", None)),
    text("Based on the search results, "),
    text("Claude Shannon was born on April 30, 1916, in Petoskey, Michigan", (WIKI, "Claude Shannon - Wikipedia", "Claude Elwood Shannon (April 30, 1916 – February 24, 2001) was an American mathematician")),
    text(". He is called the father of information theory", (BRITANNICA, "Claude Shannon | Britannica", "American mathematician and electrical engineer who laid the theoretical foundations"), (WIKI, "Claude Shannon - Wikipedia", "He is credited with founding information theory")),
    text("."),
], searches=1)
