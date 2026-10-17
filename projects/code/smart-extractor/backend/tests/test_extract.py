import json

import pytest

from app.doctypes import DOC_TYPES
from app.doctypes.samples import SAMPLES
from app.extract import extract_document, format_errors
from app.llm import JsonResult, Usage
from app.llm.mock_client import MockClient
from pydantic import ValidationError

INVOICE = DOC_TYPES["invoice"]
TEXT = SAMPLES["invoice"][0]["text"]


class Scripted:
    """A fake model that returns the given replies one after another, and remembers what it was asked."""

    name, model = "scripted", "scripted-1"

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def complete_json(self, *, system, messages, schema, max_tokens, hints=None):
        self.calls.append({"messages": [dict(m) for m in messages], "hints": hints})
        reply = self.replies.pop(0)
        return JsonResult(reply if isinstance(reply, str) else json.dumps(reply), Usage(100, 20))


async def correct():
    return (await extract_document(MockClient(), INVOICE, TEXT)).data


# region: pipeline-tests
async def test_a_good_answer_passes_first_time_and_is_grounded():
    result = await extract_document(MockClient(), INVOICE, TEXT)
    assert result.valid and result.attempts == 1 and result.issues == []
    assert result.grounding["invoice_number"]["status"] == "found"
    assert result.data["total"] == 4861.6 and result.data["currency"] == "INR"


async def test_a_rule_breaking_answer_is_sent_back_and_repaired():
    broken = {**await correct(), "total": 9999.0}
    llm = Scripted(broken, await correct())
    result = await extract_document(llm, INVOICE, TEXT)

    assert result.valid and result.attempts == 2
    repair_turn = llm.calls[1]["messages"]
    assert [m["role"] for m in repair_turn] == ["user", "assistant", "user"]       # original, the bad answer, the errors
    assert "subtotal + tax is 4861.60 but total is 9999.00" in repair_turn[2]["content"]
    assert result.usage == Usage(200, 40)                                           # both calls are paid for


async def test_it_gives_up_after_max_repairs_and_flags_the_errors():
    broken = {**await correct(), "total": 1.0}
    llm = Scripted(broken, broken, broken)
    result = await extract_document(llm, INVOICE, TEXT, max_repairs=2)
    assert not result.valid and result.attempts == 3 and len(llm.calls) == 3
    assert result.issues[0]["level"] == "error" and "total" in result.issues[0]["message"]
    assert result.data["total"] == 1.0                                              # what the model said is still shown, flagged


async def test_text_that_is_not_json_is_also_repaired():
    llm = Scripted("Sure! Here is the invoice: ...", await correct())
    result = await extract_document(llm, INVOICE, TEXT)
    assert result.valid and result.attempts == 2
    assert "not valid JSON" in llm.calls[1]["messages"][2]["content"]


async def test_a_valid_but_invented_value_is_caught_by_grounding_not_validation():
    result = await extract_document(MockClient(), INVOICE, TEXT, hints={"simulate_mistake": "invent"})
    assert result.valid and result.attempts == 1
    assert [(i["path"], i["level"]) for i in result.issues] == [("invoice_number", "warning")]


async def test_simulated_mistakes_only_happen_on_the_first_attempt():
    llm = Scripted(await correct())
    await extract_document(llm, INVOICE, TEXT, hints={"simulate_mistake": "rule"})
    assert llm.calls[0]["hints"] == {"simulate_mistake": "rule"}
# endregion: pipeline-tests


async def test_the_document_is_wrapped_in_tags():
    llm = Scripted(await correct())
    await extract_document(llm, INVOICE, TEXT)
    first = llm.calls[0]["messages"][0]["content"]
    assert first.startswith("Extract the invoice") and "<document>" in first and first.rstrip().endswith("</document>")


def test_errors_say_where_and_why():
    from app.doctypes.models import Invoice

    with pytest.raises(ValidationError) as e:
        Invoice.model_validate({"vendor": "x"})
    paths = {err["path"] for err in format_errors(e.value)}
    assert {"invoice_number", "invoice_date", "line_items", "total"} <= paths
