import anthropic
import pytest

from app.research import (SEARCH_ERRORS, domain_of, render_answer, search_calls, search_results, searched_sources, searches_in, split_turn,
                          web_searches_billed)

from .shapes import BRITANNICA, SHANNON, WIKI, failed, message, results, search, text


def blocks_of(shape: dict) -> list[dict]:
    """The way the app reads a response: the SDK parses the JSON into its own types, then each block is dumped back to a dict."""
    return [b.model_dump(mode="json") for b in anthropic.types.Message.model_validate(shape).content]


# region: split-tests
def test_the_answer_is_the_text_after_the_last_tool_block():
    narration, answer = split_turn(blocks_of(SHANNON))
    assert [b["text"] for b in narration] == ["I'll search for when Claude Shannon was born."]
    assert "".join(b["text"] for b in answer).startswith("Based on the search results, Claude Shannon was born")


def test_a_direct_answer_has_no_narration():
    narration, answer = split_turn(blocks_of(message([text("Water boils at 100 °C at sea level.")])))
    assert narration == [] and answer[0]["text"].startswith("Water boils")


def test_text_before_a_calculator_call_is_narration():
    narration, answer = split_turn([{"type": "text", "text": "Let me work that out."}, {"type": "tool_use", "id": "t", "name": "calculator", "input": {"expression": "1+1"}}])
    assert len(narration) == 1 and answer == []
# endregion: split-tests


# region: render-tests
def test_citations_become_numbered_markers_in_order_of_first_use():
    _, answer = split_turn(blocks_of(SHANNON))
    rendered, sources = render_answer(answer)
    assert rendered == ("Based on the search results, Claude Shannon was born on April 30, 1916, in Petoskey, Michigan[1]. "
                        "He is called the father of information theory[2][1].")
    assert [(s["n"], s["url"]) for s in sources] == [(1, WIKI), (2, BRITANNICA)]
    assert sources[0]["title"] == "Claude Shannon - Wikipedia" and sources[0]["quote"].startswith("Claude Elwood Shannon")


def test_the_same_source_cited_twice_in_one_block_is_marked_once():
    both = text("Fact", (WIKI, "W", "q"), (WIKI, "W", "q2"))
    rendered, sources = render_answer([both])
    assert rendered == "Fact[1]" and len(sources) == 1


def test_trailing_spaces_stay_after_the_marker():
    rendered, _ = render_answer([text("First claim ", (WIKI, "W", "q")), text("second claim.")])
    assert rendered == "First claim[1] second claim."


def test_a_long_quote_is_cut_and_other_citation_kinds_are_ignored():
    long = text("x", (WIKI, "W", "q" * 500))
    assert len(render_answer([long])[1][0]["quote"]) == 200
    other = {"type": "text", "text": "y", "citations": [{"type": "char_location", "cited_text": "z"}]}
    assert render_answer([other]) == ("y", [])


def test_no_citations_no_sources():
    assert render_answer([text("Plain.")]) == ("Plain.", [])
    assert render_answer([]) == ("", [])
# endregion: render-tests


# region: search-tests
def test_searches_and_their_results():
    blocks = blocks_of(SHANNON)
    assert search_calls(blocks) == [{"id": "srvtoolu_1", "query": "claude shannon birth date"}]
    [res] = search_results(blocks)
    assert res["ok"] and [r["url"] for r in res["results"]] == [WIKI, BRITANNICA] and res["results"][0]["age"] == "April 30, 2025"
    [joined] = searches_in(blocks)
    assert joined["query"] == "claude shannon birth date" and len(joined["results"]) == 2


def test_a_failed_search_is_an_error_object_not_a_list():
    blocks = blocks_of(message([search("s1", "q"), failed("s1", "max_uses_exceeded")]))
    [res] = search_results(blocks)
    assert res == {"id": "s1", "ok": False, "error": SEARCH_ERRORS["max_uses_exceeded"]}
    assert searches_in(blocks)[0]["ok"] is False


def test_an_error_code_we_do_not_know_still_gives_a_message():
    [res] = search_results([failed("s1", "something_new")])                # a code from a newer API than this code knows
    assert "something_new" in res["error"]


def test_a_search_with_no_results_is_not_an_error():
    [res] = search_results(blocks_of(message([search("s1", "zzzz"), {"type": "web_search_tool_result", "tool_use_id": "s1", "content": []}])))
    assert res == {"id": "s1", "ok": True, "results": []}


# region: pause-test
def test_a_paused_turn_holds_the_search_in_one_response_and_the_results_in_the_next():
    first = blocks_of(message([text("Searching."), search("s1", "gold price today")], stop_reason="pause_turn"))
    second = blocks_of(message([results("s1", ("https://example.com/gold", "Gold today", None)), text("Gold is X.", ("https://example.com/gold", "Gold today", "Gold is X"))]))
    assert search_results(first) == []                                    # nothing to show yet
    [joined] = searches_in(first + second)                                # but together they are one complete search
    assert joined["query"] == "gold price today" and joined["results"][0]["url"] == "https://example.com/gold"
# endregion: pause-test


def test_pages_that_were_searched_but_not_cited():
    s = searches_in(blocks_of(SHANNON)) + searches_in(blocks_of(message([search("s2", "again"), results("s2", (WIKI, "dup", None), ("https://x.org/a", "A", None))])))
    assert [r["url"] for r in searched_sources(s)] == [WIKI, BRITANNICA, "https://x.org/a"]          # each page once
# endregion: search-tests


def test_billed_searches_come_from_the_usage_block():
    m = anthropic.types.Message.model_validate(SHANNON)
    assert web_searches_billed(m.usage) == 1
    assert web_searches_billed(anthropic.types.Message.model_validate(message([text("hi")])).usage) == 0
    assert web_searches_billed({"server_tool_use": {"web_search_requests": 3}}) == 3
    assert web_searches_billed({}) == 0


@pytest.mark.parametrize("url,domain", [("https://www.britannica.com/biography/Claude-Shannon", "britannica.com"), ("https://en.wikipedia.org/wiki/X", "en.wikipedia.org"), ("not a url", "")])
def test_domain_of(url, domain):
    assert domain_of(url) == domain
