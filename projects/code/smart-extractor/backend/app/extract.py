"""The extraction pipeline: ask, validate, repair, ground.

    ask      the model returns JSON that follows the schema
    validate Pydantic checks every rule the schema cannot express (arithmetic, date order, ...)
    repair   if validation fails, show the model its own errors and ask again (a few times at most)
    ground   check that every copied value really appears in the document
"""
import json
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from .doctypes import DocType
from .grounding import ground
from .llm import LLMClient, Usage
from .prompts import repair_message, system_prompt, user_message


# region: errors
def format_errors(exc: ValidationError | json.JSONDecodeError) -> list[dict]:
    """Pydantic errors -> [{"path": "line_items.0.amount", "message": "..."}], in words a model (and a person) can use."""
    if isinstance(exc, json.JSONDecodeError):
        return [{"path": "", "message": f"The output was not valid JSON ({exc.msg})."}]
    out = []
    for e in exc.errors():
        message = e["msg"].removeprefix("Value error, ")
        out.append({"path": ".".join(str(p) for p in e["loc"]), "message": message})
    return out
# endregion: errors


@dataclass
class Extraction:
    data: dict[str, Any]
    valid: bool
    attempts: int
    usage: Usage
    issues: list[dict] = field(default_factory=list)
    grounding: dict[str, dict] = field(default_factory=dict)


# region: pipeline
async def extract_document(
    llm: LLMClient, doc: DocType, text: str, *, max_repairs: int = 2, max_tokens: int = 4096, hints: dict | None = None,
) -> Extraction:
    schema = doc.model.model_json_schema()
    system = system_prompt(doc)
    messages = [{"role": "user", "content": user_message(doc, text)}]
    usage = Usage()
    raw: Any = {}

    for attempt in range(1, max_repairs + 2):                       # 1 first try + max_repairs retries
        result = await llm.complete_json(
            system=system, messages=messages, schema=schema, max_tokens=max_tokens,
            hints=hints if attempt == 1 else None,                    # a simulated mistake only happens once
        )
        usage = usage + result.usage
        try:
            raw = json.loads(result.text)
            parsed = doc.model.model_validate(raw)
        except (json.JSONDecodeError, ValidationError) as exc:
            errors = format_errors(exc)
            if attempt > max_repairs:                                 # out of attempts: hand back what we have, flagged
                issues = [{"path": e["path"], "level": "error", "message": e["message"]} for e in errors]
                return Extraction(raw if isinstance(raw, dict) else {}, False, attempt, usage, issues)
            messages += [{"role": "assistant", "content": result.text}, {"role": "user", "content": repair_message(errors)}]
            continue

        data = parsed.model_dump(mode="json")                         # dates become "YYYY-MM-DD" strings
        evidence = ground(text, data, doc.verbatim)
        issues = [{"path": path, "level": "warning", "message": "This value was not found in the document. Check it against the source."}
                  for path, ev in evidence.items() if ev["status"] == "missing"]
        return Extraction(data, True, attempt, usage, issues, evidence)

    raise AssertionError("unreachable")
# endregion: pipeline
