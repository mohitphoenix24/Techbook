import json

from app.llm.mock_client import MockClient
from app.triage import SAFE_FALLBACK, classify, ground
from app.schemas import Triage

from .scripted import Scripted

TEXT = "Subject: Late order\n\nOrder AUR-1003 has not arrived. Also AUR-9999 is wrong."
VALID = {"category": "delivery", "priority": "normal", "sentiment": "neutral", "language": "en", "order_ids": ["AUR-1003"], "summary": "Asks where an order is.", "needs_human": False}


# region: triage-tests
async def test_a_valid_answer_is_accepted_as_it_is():
    triage, info = await classify(Scripted(replies=[VALID]), TEXT, TEXT)
    assert triage.category == "delivery" and triage.order_ids == ["AUR-1003"] and not info.repaired and not info.fell_back


async def test_an_invalid_answer_is_repaired_once_by_showing_the_model_its_errors():
    llm = Scripted(replies=[{**VALID, "category": "shipping-problem"}, VALID])
    triage, info = await classify(llm, TEXT, TEXT)
    assert triage.category == "delivery" and info.repaired and llm.calls == 2


async def test_when_the_repair_fails_too_it_fails_safe_to_a_person_not_to_a_guess():
    triage, info = await classify(Scripted(replies=["not json at all"]), TEXT, TEXT)
    assert triage == SAFE_FALLBACK and triage.needs_human and info.fell_back


def test_an_order_number_the_customer_never_wrote_is_dropped():
    invented = Triage(**{**VALID, "order_ids": ["AUR-1003", "AUR-7777", "aur-9999", "BAD"]})
    assert ground(invented, TEXT).order_ids == ["AUR-1003", "AUR-9999"]                      # 7777 is not in the text; "BAD" is not an order number


async def test_the_offline_model_returns_valid_triage_for_the_same_schema():
    triage, _ = await classify(MockClient(0), TEXT, TEXT)
    assert triage.category == "delivery" and triage.order_ids == ["AUR-1003", "AUR-9999"]
# endregion: triage-tests
