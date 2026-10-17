"""Grounding: is each extracted value actually in the document?

Validation checks that the output is *well-formed*. Grounding checks that it is *true to the source*.
A model can return a perfectly valid invoice number that appears nowhere in the document: a hallucination.
These functions are pure (text in, evidence out) and they also give the interface the exact span to highlight.
"""
import re
from datetime import date
from typing import Any

from .dates import default_year, find_dates

Span = tuple[int, int]

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


# region: finders
def find_text(source: str, value: str) -> Span | None:
    """Case-insensitive search that ignores differences in whitespace (line breaks, double spaces)."""
    words = value.split()
    if not words:
        return None
    pattern = r"\s+".join(re.escape(w) for w in words)
    m = re.search(pattern, source, re.I)
    return (m.start(), m.end()) if m else None


def find_number(source: str, value: float) -> Span | None:
    """Find a number however it is written: 4861.6, 4,861.60 and 4861.60 are all the same value."""
    for m in NUMBER.finditer(source):
        try:
            candidate = float(m.group().replace(",", "").rstrip("."))
        except ValueError:
            continue
        if abs(candidate - value) < 0.005:
            return m.start(), m.end()
    return None


def find_date(source: str, value: date) -> Span | None:
    """Find a date in any of the formats `find_dates` understands (14 Oct 2026, 14/10/2026, 2026-10-14, or "15 Oct")."""
    for found, start, end in find_dates(source, default_year(source)):
        if found == value:
            return start, end
    return None
# endregion: finders


# region: ground
def flatten(value: Any, path: str = "") -> list[tuple[str, Any]]:
    """{'a': [{'b': 1}]} -> [('a.0.b', 1)]. Leaves are strings, numbers, booleans and None."""
    if isinstance(value, dict):
        return [leaf for k, v in value.items() for leaf in flatten(v, f"{path}.{k}" if path else k)]
    if isinstance(value, list):
        return [leaf for i, v in enumerate(value) for leaf in flatten(v, f"{path}.{i}" if path else str(i))]
    return [(path, value)]


def wildcard(pattern: str) -> re.Pattern:
    """'line_items[].amount' -> a regex matching 'line_items.0.amount', 'line_items.7.amount', ..."""
    return re.compile("^" + re.escape(pattern).replace(r"\[\]", r"\.\d+") + "$")


def ground(source: str, data: dict, verbatim: list[str]) -> dict[str, dict]:
    """Check every value whose path matches one of the `verbatim` patterns.

    Returns {path: {"status": "found" | "missing", "start": int | None, "end": int | None}}.
    Values that the model derives rather than copies (a summary, a category) are not listed at all.
    """
    patterns = [wildcard(p) for p in verbatim]
    report: dict[str, dict] = {}
    for path, value in flatten(data):
        # Zero is skipped: "tax: 0" because there is no tax line is a correct answer with nothing to point at.
        if value is None or value == 0 or isinstance(value, bool) or not any(p.match(path) for p in patterns):
            continue
        if isinstance(value, str) and ISO_DATE.match(value):
            try:
                span = find_date(source, date.fromisoformat(value))
            except ValueError:
                span = None
        elif isinstance(value, (int, float)):
            span = find_number(source, float(value))
        else:
            span = find_text(source, str(value))
        report[path] = {"status": "found" if span else "missing", "start": span[0] if span else None, "end": span[1] if span else None}
    return report
# endregion: ground
