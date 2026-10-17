"""Find and parse dates in free text. Pure functions, shared by the offline model and the grounding check."""
import re
from datetime import date

# region: dates
MONTHS = {m: i for i, names in enumerate(
    [("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
     ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"), ("dec", "december")], start=1)
    for m in names}

_MONTH = "|".join(sorted(MONTHS, key=len, reverse=True))
PATTERNS = [
    # 2026-10-14
    (re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"), lambda m: (int(m[1]), int(m[2]), int(m[3]))),
    # 14/10/2026 or 14-10-2026 (day first, as in India and most of the world)
    (re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b"), lambda m: (int(m[3]), int(m[2]), int(m[1]))),
    # 14 Oct 2026, 14th October 2026, 14-Oct-2026
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?[\s-]+({_MONTH})\.?,?[\s-]+(\d{{4}})\b", re.I), lambda m: (int(m[3]), MONTHS[m[2].lower()], int(m[1]))),
    # Oct 14, 2026
    (re.compile(rf"\b({_MONTH})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I), lambda m: (int(m[3]), MONTHS[m[1].lower()], int(m[2]))),
]

SHORT_PATTERNS = [
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?[\s-]+({_MONTH})\b", re.I), lambda m: (MONTHS[m[2].lower()], int(m[1]))),
    (re.compile(rf"\b({_MONTH})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", re.I), lambda m: (MONTHS[m[1].lower()], int(m[2]))),
]


def find_dates(text: str, default_year: int | None = None) -> list[tuple[date, int, int]]:
    """Every valid date in `text` as (date, start, end), in order of appearance. Impossible dates are skipped.

    Meeting notes often write "15 Oct" with no year. If `default_year` is given, such dates borrow it.
    """
    found: list[tuple[date, int, int]] = []
    for pattern, to_ymd in PATTERNS:
        for m in pattern.finditer(text):
            try:
                found.append((date(*to_ymd(m)), m.start(), m.end()))
            except ValueError:                                  # 31 February and friends
                continue
    if default_year is not None:
        taken = [(s, e) for _, s, e in found]
        for pattern, to_md in SHORT_PATTERNS:
            for m in pattern.finditer(text):
                if any(s <= m.start() < e for s, e in taken):   # already part of a full date
                    continue
                try:
                    found.append((date(default_year, *to_md(m)), m.start(), m.end()))
                except ValueError:
                    continue
    found.sort(key=lambda item: item[1])
    return found


def default_year(text: str) -> int | None:
    """The year of the first complete date in the text; used to complete dates such as "15 Oct"."""
    dates = find_dates(text)
    return dates[0][0].year if dates else None


def parse_date(text: str) -> date | None:
    """The first date in `text`, or None."""
    dates = find_dates(text)
    return dates[0][0] if dates else None
# endregion: dates
