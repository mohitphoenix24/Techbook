"""Remove personal data from text before it goes to a model, a log or a trace.

Pure Python, no dependencies. It over-redacts on purpose: hiding a harmless number is cheap, leaking a card number is not.
"""
# region: imports
import re
from dataclasses import dataclass
# endregion: imports


# region: luhn
def luhn_ok(digits: str) -> bool:
    """The checksum every real card number satisfies. It stops us masking ordinary long numbers (order and tracking ids)."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n = n * 2 - 9 if n * 2 > 9 else n * 2
        total += n
    return total % 10 == 0
# endregion: luhn


# region: patterns
CARD = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")
AADHAAR = re.compile(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}\b")
UPI = re.compile(r"\b[\w.-]{2,}@(?:oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|axl|paytm|upi|apl)\b", re.I)
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\d)(?:\+91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?!\d)")
# endregion: patterns


@dataclass
class Found:
    kind: str                 # CARD, AADHAAR, UPI, EMAIL or PHONE
    placeholder: str          # what the text now says, e.g. [EMAIL_1]
    original: str             # kept in memory only: never log it


@dataclass
class Redacted:
    text: str
    items: list[Found]

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for item in self.items:
            out[item.kind] = out.get(item.kind, 0) + 1
        return out


# region: redact
def redact(text: str) -> Redacted:
    """Replace each personal detail with a numbered placeholder such as [PHONE_1]. The same value gets the same placeholder."""
    items: list[Found] = []
    seen: dict[tuple[str, str], str] = {}

    def swap(kind: str, match: re.Match) -> str:
        original = match.group(0)
        key = (kind, re.sub(r"[ -]", "", original).lower())
        if key not in seen:
            seen[key] = f"[{kind}_{sum(1 for i in items if i.kind == kind) + 1}]"
            items.append(Found(kind, seen[key], original))
        return seen[key]

    def card(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        return swap("CARD", match) if 13 <= len(digits) <= 19 and luhn_ok(digits) else match.group(0)

    # the order matters: a card must be masked before the shorter patterns can bite pieces out of it
    text = CARD.sub(card, text)
    for kind, pattern in (("AADHAAR", AADHAAR), ("UPI", UPI), ("EMAIL", EMAIL), ("PHONE", PHONE)):
        text = pattern.sub(lambda m, k=kind: swap(k, m), text)
    return Redacted(text, items)
# endregion: redact


# region: leaks
def find_personal_data(text: str) -> list[str]:
    """The kinds of personal data still present in `text`: the guardrail used on drafts and traces."""
    return [kind for kind, pattern in (("CARD", CARD), ("AADHAAR", AADHAAR), ("UPI", UPI), ("EMAIL", EMAIL), ("PHONE", PHONE))
            if any(kind != "CARD" or luhn_ok(re.sub(r"\D", "", m.group(0))) for m in pattern.finditer(text))]
# endregion: leaks
