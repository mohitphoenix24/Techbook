from datetime import date

import pytest

from app.policy import AUTO_LIMIT_INR, decide
from app.seed import ORDER_BY_ID as BY_ID, TODAY

TODAY_DATE = date.fromisoformat(TODAY)


def d(category, order_id=None, **kw):
    return decide(category, BY_ID.get(order_id), TODAY_DATE, **kw)


# region: policy-tests
@pytest.mark.parametrize("category,order_id,action,code,amount,lead", [
    ("refund", "AUR-1001", "refund", "within_window", 4499, False),        # delivered 7 days ago, change of mind
    ("refund", "AUR-1012", "deny", "window_closed", 0, False),             # delivered 14 days ago: past the 10-day window
    ("damaged", "AUR-1002", "refund", "within_window", 2999, False),       # 17 days ago, but damaged items get 30 days
    ("damaged", "AUR-1005", "refund", "within_window", 12999, True),       # over the limit: a team lead must approve
    ("damaged", "AUR-1013", "refund", "within_window", 24999, True),
    ("damaged", "AUR-1008", "refund", "within_window", 4398, False),       # two items, total under the limit
    ("refund", "AUR-1006", "deny", "non_refundable_item", 0, False),       # digital goods
    ("refund", "AUR-1009", "info", "already_refunded", 0, False),          # already cancelled
    ("refund", "AUR-1003", "info", "not_delivered_yet", 0, False),
    ("cancellation", "AUR-1004", "cancel", "cancel_before_shipping", 1899, False),
    ("cancellation", "AUR-1003", "deny", "already_shipped", 0, False),
    ("cancellation", "AUR-1001", "info", "use_returns", 0, False),
    ("delivery", "AUR-1003", "info", "in_transit", 0, False),
    ("delivery", "AUR-1004", "info", "not_shipped", 0, False),
    ("delivery", "AUR-1010", "investigate", "marked_delivered", 0, False),
    ("payment", None, "investigate", "payment_review", 0, False),
    ("account", None, "info", "account_help", 0, False),
    ("product_question", None, "info", "general", 0, False),
    ("refund", None, "info", "need_order", 0, False),                      # no order found: ask for it
])
def test_the_policy_decides_from_the_category_and_the_order(category, order_id, action, code, amount, lead):
    got = d(category, order_id)
    assert (got.action, got.code, got.amount, got.needs_lead) == (action, code, amount, lead)


def test_a_cash_on_delivery_cancellation_refunds_nothing_because_nothing_was_paid():
    order = {**BY_ID["AUR-1004"], "payment": "COD"}
    got = decide("cancellation", order, TODAY_DATE)
    assert (got.action, got.amount) == ("cancel", 0)


def test_the_approval_limit_is_a_parameter_not_a_constant_buried_in_the_rules():
    assert not d("damaged", "AUR-1008").needs_lead
    assert d("damaged", "AUR-1008", auto_limit=4000).needs_lead and AUTO_LIMIT_INR == 5000


def test_every_decision_points_to_the_article_that_states_the_rule():
    from app.kb import ARTICLE_BY_ID as ARTICLES
    for category, order_id in [("refund", "AUR-1001"), ("damaged", "AUR-1002"), ("cancellation", "AUR-1004"), ("delivery", "AUR-1003"), ("payment", None)]:
        assert d(category, order_id).article in ARTICLES
# endregion: policy-tests
