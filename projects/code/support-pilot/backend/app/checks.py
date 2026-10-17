"""Guardrails for a drafted reply: plain checks that run AFTER the model and BEFORE a human sees the draft as ready.

A model can write a fluent reply that quietly breaks a rule: it leaks a phone number, promises a refund the policy denies,
quotes the wrong amount, or cites an article that does not exist. These checks catch that with ordinary code.
"""
import re
from dataclasses import dataclass

from .policy import Decision
from .redact import find_personal_data


# region: check
@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    severity: str          # "block": the draft cannot be approved until fixed. "warn": a human should look.
    detail: str


CITATION = re.compile(r"\[kb:([a-z0-9-]+)\]")
RUPEES = re.compile(r"(?:₹|Rs\.?\s?)\s?(\d[\d,]*)")
OVERPROMISE = ["guarantee", "100%", "definitely", "for sure", "promise", "within minutes", "no questions asked"]
INTERNAL = ["team lead", "approval limit", "policy engine", "escalate to a lead", "needs approval"]
REFUND_PROMISE = re.compile(r"(we(?:'ll| will| have)|i(?:'ll| will| have)|has been|is being)\s+(?:\w+\s+){0,3}?(refund|credit|reimburs)\w*", re.I)
APOLOGY = re.compile(r"\b(sorry|apolog\w+|understand|regret|frustrat\w+)\b", re.I)
# endregion: check


def amounts_in(text: str) -> set[int]:
    return {int(m.group(1).replace(",", "")) for m in RUPEES.finditer(text)}


# region: run
def run_checks(draft: str, *, decision: Decision, sentiment: str, order: dict | None, article_ids: set[str]) -> list[Check]:
    """Every check, in a fixed order, so the interface always shows the same list."""
    cited = CITATION.findall(draft)
    leaks = find_personal_data(draft)
    promised = [p for p in OVERPROMISE if p in draft.lower()]
    internal = [p for p in INTERNAL if p in draft.lower()]
    mentioned = amounts_in(draft)
    allowed_amounts = {decision.amount} | ({round(order["total"])} if order else set())
    cites_ok = not decision.article or decision.article in cited or not _needs_citation(decision)

    checks = [
        Check("no_personal_data", not leaks, "block", "Clean." if not leaks else f"The draft contains {', '.join(leaks)}. Remove it."),
        Check("citations_exist", all(c in article_ids for c in cited), "block",
              "Every citation is a real article." if all(c in article_ids for c in cited) else f"Unknown article: {', '.join(c for c in cited if c not in article_ids)}."),
        Check("cites_policy", cites_ok, "block", "The policy is cited." if cites_ok else f"Cite the rule: [kb:{decision.article}]."),
        Check("matches_policy", *_matches_policy(draft, decision, mentioned, allowed_amounts)),
        Check("no_overpromise", not promised, "block", "No promises beyond the policy." if not promised else f"Remove: {', '.join(promised)}."),
        Check("no_internal_info", not internal, "block", "Nothing internal is revealed." if not internal else f"Remove internal wording: {', '.join(internal)}."),
        Check("mentions_order", order is None or order["id"] in draft, "warn", "The order number is mentioned." if order is None or order["id"] in draft else f"Mention the order number {order['id']}."),
        Check("empathy", sentiment != "negative" or bool(APOLOGY.search(draft)), "warn", "The tone suits an upset customer." if sentiment != "negative" or APOLOGY.search(draft) else "The customer is upset: acknowledge it."),
        Check("length", len(draft.split()) <= 170, "warn", f"{len(draft.split())} words." if len(draft.split()) <= 170 else f"{len(draft.split())} words is long for a support reply."),
    ]
    return checks


def _needs_citation(decision: Decision) -> bool:
    return decision.code != "general"


def _matches_policy(draft: str, decision: Decision, mentioned: set[int], allowed: set[int]) -> tuple[bool, str, str]:
    if decision.action in ("refund", "cancel") and decision.amount:
        if decision.amount not in mentioned:
            return False, "block", f"The policy returns ₹{decision.amount:,}. The draft must say so."
        if not mentioned <= allowed:
            return False, "block", f"The draft mentions an amount the policy does not support: {sorted(mentioned - allowed)}."
        return True, "block", f"Matches the policy: ₹{decision.amount:,}."
    if REFUND_PROMISE.search(draft):
        return False, "block", f"The policy says '{decision.code}' (no refund), but the draft promises one."
    return True, "block", "Consistent with the policy."
# endregion: run


def blocking_failures(checks: list[Check]) -> list[Check]:
    return [c for c in checks if not c.ok and c.severity == "block"]
