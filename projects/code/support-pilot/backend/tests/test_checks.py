from datetime import date

from app.checks import blocking_failures, run_checks
from app.policy import decide
from app.seed import ORDER_BY_ID as BY_ID, TODAY

ORDER = BY_ID["AUR-1001"]
REFUND = decide("refund", ORDER, date.fromisoformat(TODAY))                      # refund Rs 4,499, article "returns"
DENY = decide("refund", BY_ID["AUR-1012"], date.fromisoformat(TODAY))            # window closed, article "returns"
GOOD = "Hi Asha, I am sorry for the trouble. Order AUR-1001 is inside our window, so we can refund ₹4,499 once the pickup is done [kb:returns]."
IDS = {"returns", "refunds-timeline"}


def failing(text, decision=REFUND, order=ORDER, sentiment="neutral"):
    return {c.name for c in run_checks(text, decision=decision, sentiment=sentiment, order=order, article_ids=IDS) if not c.ok}


# region: checks-tests
def test_a_good_draft_passes_every_check():
    assert failing(GOOD) == set()


def test_personal_data_in_a_draft_is_blocked():
    assert "no_personal_data" in failing(GOOD + " We will call 98765 43210.")


def test_a_citation_to_an_article_that_was_not_provided_is_blocked():
    assert "citations_exist" in failing(GOOD.replace("[kb:returns]", "[kb:returns] [kb:secret-policy]"))


def test_the_policy_rule_must_be_cited():
    assert "cites_policy" in failing(GOOD.replace("[kb:returns]", ""))


def test_the_amount_must_be_the_one_the_policy_decided():
    assert "matches_policy" in failing(GOOD.replace("4,499", "4,999"))          # a different amount
    assert "matches_policy" in failing("Hi, order AUR-1001 will be refunded [kb:returns].")      # no amount at all


def test_a_draft_may_not_promise_a_refund_the_policy_denied():
    order = BY_ID["AUR-1012"]
    promised = "Hi Tara, order AUR-1012 is outside the window [kb:returns], but we will refund it anyway."
    assert "matches_policy" in failing(promised, decision=DENY, order=order)
    assert "matches_policy" not in failing("Hi Tara, order AUR-1012 is outside the window, so we cannot refund it [kb:returns].", decision=DENY, order=order)


def test_overpromises_and_internal_wording_are_blocked():
    assert "no_overpromise" in failing(GOOD + " We guarantee it, 100%.")
    assert "no_internal_info" in failing(GOOD + " A team lead already gave approval.")


def test_warnings_do_not_block_but_are_reported():
    checks = run_checks("Refund ₹4,499 is on the way [kb:returns].", decision=REFUND, sentiment="negative", order=ORDER, article_ids=IDS)
    assert {c.name for c in checks if not c.ok} == {"mentions_order", "empathy"}
    assert blocking_failures(checks) == []
# endregion: checks-tests
