from datetime import date

from app.dates import default_year, find_dates, parse_date


def test_common_formats_all_give_the_same_date():
    for text in ["2026-10-14", "14/10/2026", "14.10.2026", "14 Oct 2026", "14th October 2026", "14-Oct-2026", "Oct 14, 2026"]:
        assert parse_date(text) == date(2026, 10, 14), text


def test_day_comes_first_in_numeric_dates():
    assert parse_date("03/04/2026") == date(2026, 4, 3)          # 3 April, not 4 March


def test_impossible_dates_are_skipped():
    assert find_dates("31/02/2026 and 2026-13-01") == []


def test_positions_are_reported_for_highlighting():
    text = "Due on 13 Nov 2026, thanks"
    (found, start, end), = find_dates(text)
    assert text[start:end] == "13 Nov 2026"


def test_dates_without_a_year_borrow_one_when_asked():
    text = "Meeting 12 Oct 2026. Ravi to finish by 15 Oct and Meera by Oct 18."
    assert [d for d, _, _ in find_dates(text)] == [date(2026, 10, 12)]
    assert [d for d, _, _ in find_dates(text, default_year(text))] == [date(2026, 10, 12), date(2026, 10, 15), date(2026, 10, 18)]
