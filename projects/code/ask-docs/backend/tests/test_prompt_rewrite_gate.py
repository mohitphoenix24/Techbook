from app.llm import Completion, Usage
from app.llm.mock_client import MockClient, answer_from_sources
from app.rag.gate import is_relevant
from app.rag.index import Hit
from app.rag.prompt import REFUSAL, SYSTEM, build_messages, check_citations, format_sources
from app.rag.rewrite import looks_like_follow_up, standalone_question

SOURCES = [
    {"n": 1, "document": "Handbook", "page": 1, "text": "Every full-time employee gets 24 days of paid annual leave per year."},
    {"n": 2, "document": "Handbook", "page": 1, "text": "Sick leave is 8 days per year. A doctor's note is needed after 2 days."},
]


# region: prompt-tests
def test_sources_are_numbered_and_the_question_comes_last():
    messages = build_messages("How much leave?", SOURCES, history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}])
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    last = messages[-1]["content"]
    assert last.startswith("<sources>") and '<source id="2" document="Handbook" page="1">' in last and last.rstrip().endswith("Question: How much leave?")
    assert "sources" not in messages[0]["content"]                  # only the current question carries sources


def test_the_section_heading_goes_into_the_source_block():
    block = format_sources([{"n": 1, "document": "FAQ", "page": 1, "heading": "Battery and charging", "text": "It lasts 8 hours."}])
    assert '<source id="1" document="FAQ" page="1" section="Battery and charging">' in block


def test_citation_check_separates_real_invented_and_missing_citations():
    assert check_citations("24 days [1]. A note is needed [2][1].", 2) == {"used": [1, 2], "invalid": [], "refused": False, "uncited": False}
    assert check_citations("You get 30 days [7].", 2)["invalid"] == [7]
    assert check_citations("You get 30 days.", 2)["uncited"] is True
    assert check_citations(REFUSAL, 2) == {"used": [], "invalid": [], "refused": True, "uncited": False}
# endregion: prompt-tests


def test_the_system_prompt_gives_an_exit_and_treats_sources_as_data():
    assert REFUSAL in SYSTEM and "ignore them" in SYSTEM and "Never use outside knowledge" in SYSTEM


def test_the_offline_model_answers_only_from_the_sources_and_cites_them():
    prompt = build_messages("How many days of annual leave do I get?", SOURCES, [])[-1]["content"]
    assert answer_from_sources(prompt) == "Every full-time employee gets 24 days of paid annual leave per year. [1]"
    assert answer_from_sources(build_messages("What is the capital of France?", SOURCES, [])[-1]["content"]) == REFUSAL


def test_follow_ups_are_detected_without_calling_a_model():
    history = [{"role": "user", "content": "How many days of annual leave do I get?"}]
    assert looks_like_follow_up("And sick leave?", history) and looks_like_follow_up("How many of them can I carry over?", history)
    assert not looks_like_follow_up("How many days of annual leave do I get?", [])
    assert not looks_like_follow_up("What is the notice period after probation?", history)


class CountingLLM:
    name, model = "counting", "counting-1"

    def __init__(self):
        self.calls = 0

    async def complete(self, *, system, messages, max_tokens):
        self.calls += 1
        return Completion("  \"How many days of sick leave are there?\"  ", Usage(10, 5))


async def test_standalone_questions_cost_nothing_and_follow_ups_are_rewritten():
    llm = CountingLLM()
    history = [{"role": "user", "content": "How many days of annual leave do I get?"}, {"role": "assistant", "content": "24 [1]"}]
    assert await standalone_question(llm, "What is the notice period?", history) == ("What is the notice period?", Usage())
    assert llm.calls == 0
    text, usage = await standalone_question(llm, "And sick leave?", history)
    assert text == "How many days of sick leave are there?" and usage == Usage(10, 5) and llm.calls == 1


async def test_the_offline_rewrite_joins_the_previous_question_and_the_follow_up():
    history = [{"role": "user", "content": "How many days of annual leave do I get?"}]
    text, usage = await standalone_question(MockClient(), "And sick leave?", history)
    assert text == "How many days of annual leave do I get And sick leave?" and usage.input_tokens > 0


# region: gate-tests
def test_the_gate_lets_a_real_match_through_and_stops_unrelated_questions():
    good = [Hit(1, 0.03, vector_score=0.05, keyword_score=9.0)]
    weak = [Hit(1, 0.03, vector_score=0.05, keyword_score=0.0), Hit(2, 0.02, vector_score=0.04, keyword_score=0.0)]
    assert is_relevant(good, vector_threshold=0.2, keyword_threshold=2.0)
    assert not is_relevant(weak, vector_threshold=0.2, keyword_threshold=2.0)
    assert is_relevant([Hit(1, 0.0, vector_score=0.7)], vector_threshold=0.55, keyword_threshold=2.0)
    assert not is_relevant([], 0.2, 2.0)
# endregion: gate-tests
