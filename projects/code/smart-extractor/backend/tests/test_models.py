import pytest
from pydantic import ValidationError

from app.doctypes.models import Invoice, SupportTicket

GOOD = {
    "vendor": "Sharma Stationers", "invoice_number": "INV-1", "invoice_date": "2026-10-14", "due_date": "2026-11-13", "currency": "inr",
    "line_items": [{"description": "Paper", "quantity": 10, "unit_price": 250, "amount": 2500}],
    "subtotal": 2500, "tax": 450, "total": 2950,
}


def messages(exc: ValidationError) -> str:
    return " | ".join(e["msg"] for e in exc.errors())


# region: model-tests
def test_a_correct_invoice_is_accepted_and_the_currency_normalised():
    assert Invoice.model_validate(GOOD).currency == "INR"


def test_total_must_equal_subtotal_plus_tax():
    with pytest.raises(ValidationError) as e:
        Invoice.model_validate({**GOOD, "total": 3050})
    assert "subtotal + tax is 2950.00 but total is 3050.00" in messages(e.value)


def test_each_line_must_add_up():
    bad = {**GOOD, "line_items": [{"description": "Paper", "quantity": 10, "unit_price": 250, "amount": 2000}]}
    with pytest.raises(ValidationError) as e:
        Invoice.model_validate(bad)
    assert "quantity x unit_price is 2500.00 but amount is 2000.00" in messages(e.value)
    assert e.value.errors()[0]["loc"][:2] == ("line_items", 0)         # the error says WHICH line
# endregion: model-tests


def test_due_date_cannot_precede_invoice_date():
    with pytest.raises(ValidationError, match="due_date is before invoice_date"):
        Invoice.model_validate({**GOOD, "due_date": "2026-10-01"})


def test_nullable_fields_must_still_be_present():
    without_due = {k: v for k, v in GOOD.items() if k != "due_date"}
    with pytest.raises(ValidationError, match="due_date"):
        Invoice.model_validate(without_due)
    assert Invoice.model_validate({**GOOD, "due_date": None}).due_date is None


@pytest.mark.parametrize("bad", ["INRS", "12", "₹"])
def test_currency_must_be_a_three_letter_code(bad):
    with pytest.raises(ValidationError):
        Invoice.model_validate({**GOOD, "currency": bad})


def test_ticket_rules():
    base = dict(customer_name=None, customer_email=None, order_id=None, product=None, category="bug", priority="low", sentiment="neutral", summary="ok")
    assert SupportTicket.model_validate(base)
    for change in ({"customer_email": "not-an-email"}, {"summary": "x" * 201}, {"category": "feedback"}, {"priority": "critical"}):
        with pytest.raises(ValidationError):
            SupportTicket.model_validate({**base, **change})
