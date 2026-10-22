import pytest

from app.config import Settings
from app.pricing import cost_usd
from app.tools import build_tools, run_client_tool


def settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


# region: definition-tests
def test_the_web_search_tool_is_declared_not_implemented():
    web, calc = build_tools(settings())
    assert web == {"type": "web_search_20250305", "name": "web_search", "max_uses": 4, "user_location": {"type": "approximate", "country": "IN"}}
    assert "input_schema" not in web, "a server tool has no schema and no function: Anthropic runs it"
    assert calc["name"] == "calculator" and calc["input_schema"]["required"] == ["expression"] and len(calc["description"]) > 30


def test_the_search_budget_and_location_are_settings():
    web = build_tools(settings(max_searches=2, search_country="gb"))[0]
    assert web["max_uses"] == 2 and web["user_location"]["country"] == "GB"
    assert "user_location" not in build_tools(settings(search_country=""))[0]
# endregion: definition-tests


def test_the_calculator():
    r = run_client_tool("calculator", {"expression": "240000 * 0.15 / 12"})
    assert r.ok and r.content == "240000 * 0.15 / 12 = 3000" and r.summary == "= 3000"


@pytest.mark.parametrize("name,args,expect", [
    ("calculator", {"expression": "__import__('os')"}, "Only numbers"),
    ("calculator", {"expression": "1 / 0"}, "Division by zero"),
    ("calculator", {"expression": "2,40,000 * 2"}, "Only numbers"),         # Python reads that as a tuple, which is not arithmetic
    ("calculator", {"expression": "2 +"}, "not a valid arithmetic"),
    ("calculator", {}, "expression"),
    ("calculator", {"expression": ""}, "expression"),
    ("calculator", {"expression": 5}, "expression"),
    ("web_search", {"query": "x"}, "no tool called"),
])
def test_bad_calls_become_errors_the_model_can_read(name, args, expect):
    r = run_client_tool(name, args)
    assert not r.ok and r.content.startswith("Error:") and expect in r.content


def test_cost_includes_the_searches():
    assert cost_usd("claude-opus-5-5", 1_000_000, 100_000) == 6.0
    assert cost_usd("claude-opus-5-5", 1_000_000, 100_000, searches=3) == 6.03
    assert cost_usd("claude-sonnet-5-5", 0, 0, searches=1) == 0.01


def test_a_calculator_bug_becomes_an_error_too(monkeypatch):
    def boom(_):
        raise RuntimeError("bug")
    monkeypatch.setattr("app.tools.calculate", boom)
    r = run_client_tool("calculator", {"expression": "1 + 1"})
    assert not r.ok and r.summary == "tool failed" and "bug" not in r.content
