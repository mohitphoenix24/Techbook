from app.describe import describe
from app.doctypes.models import Invoice, SupportTicket


def by_name(fields):
    return {f["name"]: f for f in fields}


def test_invoice_fields_have_the_right_kinds():
    f = by_name(describe(Invoice))
    assert f["vendor"]["type"] == "text" and f["vendor"]["label"] == "Vendor"
    assert f["invoice_date"]["type"] == "date" and f["invoice_date"]["nullable"] is False
    assert f["due_date"]["type"] == "date" and f["due_date"]["nullable"] is True
    assert f["total"]["type"] == "number"


def test_lists_of_objects_describe_their_item_fields():
    items = by_name(describe(Invoice))["line_items"]
    assert items["type"] == "list" and items["item"]["type"] == "object"
    assert [x["name"] for x in items["item"]["fields"]] == ["description", "quantity", "unit_price", "amount"]


def test_literals_become_enums_with_options():
    f = by_name(describe(SupportTicket))
    assert f["category"]["type"] == "enum" and f["category"]["options"] == ["billing", "bug", "feature_request", "account", "other"]
    assert f["customer_email"]["nullable"] is True
