"""Triage: turn a messy ticket into a validated, grounded Triage object."""
import re
from dataclasses import dataclass

from pydantic import ValidationError

from .llm.base import LLMClient, LLMError, Usage
from .prompts import TRIAGE_SYSTEM
from .schemas import Triage

WELL_FORMED = re.compile(r"^AUR-\d{4}$")


# region: fallback
SAFE_FALLBACK = Triage(category="other", priority="high", sentiment="neutral", language="en", order_ids=[],
                       summary="Could not be classified automatically. A person should read it.", needs_human=True)
# endregion: fallback


@dataclass
class TriageInfo:
    usage: Usage
    model: str = ""
    cached: bool = False
    attempts: int = 1
    repaired: bool = False          # the first answer was invalid and a second ask fixed it
    fell_back: bool = False         # nothing valid came back: the safe fallback sends it to a person


# region: classify
async def classify(llm: LLMClient, redacted_text: str, original_text: str, hints: dict | None = None) -> tuple[Triage, TriageInfo]:
    """Ask for triage. Validate. If invalid, show the model its errors once. If still invalid, fail SAFE, never silently."""
    messages = [{"role": "user", "content": redacted_text}]
    info = TriageInfo(Usage())
    for attempt in range(2):
        result = await llm.complete_json(system=TRIAGE_SYSTEM, messages=messages, schema=Triage.model_json_schema(), max_tokens=400, hints=hints)
        info.usage, info.model, info.cached, info.attempts = info.usage + result.usage, result.model, result.cached, result.attempts
        try:
            triage = Triage.model_validate_json(result.text)
            return ground(triage, original_text), info
        except ValidationError as exc:
            problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())[:400]
            messages = [*messages, {"role": "assistant", "content": result.text},
                        {"role": "user", "content": f"That JSON was not valid ({problems}). Return corrected JSON only."}]
            info.repaired = attempt == 0
    info.fell_back, info.repaired = True, False
    return SAFE_FALLBACK, info


def ground(triage: Triage, original_text: str) -> Triage:
    """Keep an order number only if it is well formed AND really appears in the ticket. A model must not invent evidence."""
    real = {m.upper() for m in re.findall(r"AUR-\d{4}", original_text, re.I)}
    kept = [o.upper() for o in triage.order_ids if WELL_FORMED.match(o.upper()) and o.upper() in real]
    return triage.model_copy(update={"order_ids": list(dict.fromkeys(kept))})
# endregion: classify
