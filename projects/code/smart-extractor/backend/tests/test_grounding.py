from app.grounding import find_date, find_number, find_text, flatten, ground

SOURCE = """Sharma Stationers Pvt Ltd
Invoice No: INV-2026-0042   Date: 14 Oct 2026
A4 Paper   10   250.00   2,500.00
Total: INR 4,861.60"""


# region: grounding-tests
def test_text_ignores_case_and_line_breaks():
    start, end = find_text(SOURCE, "sharma  stationers\npvt ltd")
    assert SOURCE[start:end].lower().startswith("sharma stationers")
    assert find_text(SOURCE, "Acme Corp") is None


def test_numbers_match_however_they_are_written():
    assert find_number(SOURCE, 4861.6) is not None             # written 4,861.60
    assert find_number(SOURCE, 2500) is not None
    assert find_number(SOURCE, 4861.7) is None


def test_dates_match_in_any_format():
    from datetime import date

    start, end = find_date(SOURCE, date(2026, 10, 14))
    assert SOURCE[start:end] == "14 Oct 2026"
    assert find_date(SOURCE, date(2026, 10, 15)) is None


def test_invented_values_are_reported_missing_and_real_ones_found():
    data = {"vendor": "Sharma Stationers Pvt Ltd", "invoice_number": "INV-9999-X", "total": 4861.6, "invoice_date": "2026-10-14"}
    report = ground(SOURCE, data, ["vendor", "invoice_number", "total", "invoice_date"])
    assert {k: v["status"] for k, v in report.items()} == {"vendor": "found", "invoice_number": "missing", "total": "found", "invoice_date": "found"}
# endregion: grounding-tests


def test_only_listed_paths_are_checked_and_wildcards_match_list_items():
    data = {"summary": "an invented sentence", "items": [{"name": "A4 Paper"}, {"name": "Gold bars"}]}
    report = ground(SOURCE, data, ["items[].name"])
    assert set(report) == {"items.0.name", "items.1.name"}
    assert report["items.0.name"]["status"] == "found" and report["items.1.name"]["status"] == "missing"


def test_zero_null_and_booleans_are_not_checked():
    assert ground(SOURCE, {"tax": 0, "due": None, "paid": True}, ["tax", "due", "paid"]) == {}


def test_flatten_gives_dotted_paths():
    assert flatten({"a": [{"b": 1}, {"b": 2}], "c": "x"}) == [("a.0.b", 1), ("a.1.b", 2), ("c", "x")]
