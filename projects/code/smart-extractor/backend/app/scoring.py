"""Score extraction results against known-correct answers. Pure functions: the heart of the eval harness."""
from dataclasses import dataclass, field
from typing import Any

from .grounding import flatten, wildcard


# region: normalise
def normalise(value: Any) -> Any:
    """Make two spellings of the same answer compare equal: case, spaces and float noise do not matter."""
    if isinstance(value, str):
        return " ".join(value.split()).casefold()
    if isinstance(value, float):
        return round(value, 2)
    return value
# endregion: normalise


@dataclass
class CaseScore:
    correct: int = 0
    total: int = 0
    wrong: list[tuple[str, Any, Any]] = field(default_factory=list)       # (path, expected, got)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 1.0

    @property
    def exact(self) -> bool:
        return self.correct == self.total


# region: score
def score_case(expected: dict, actual: dict, ignore: list[str] | tuple[str, ...] = ()) -> CaseScore:
    """Compare field by field. Every leaf in `expected` counts once; extra fields in `actual` are ignored.

    `ignore` lists path patterns (like "action_items[].task") that are the model's own wording, so exact match would
    be unfair. Lists are compared by position, which is simple and strict: the right items in the wrong order score zero.
    """
    got = dict(flatten(actual))
    skip = [wildcard(p) for p in ignore]
    score = CaseScore()
    for path, want in flatten(expected):
        if any(p.match(path) for p in skip):
            continue
        score.total += 1
        have = got.get(path)
        if normalise(have) == normalise(want):
            score.correct += 1
        else:
            score.wrong.append((path, want, have))
    return score
# endregion: score


def summarise(scores: list[CaseScore]) -> dict:
    fields = sum(s.total for s in scores)
    return {
        "cases": len(scores),
        "field_accuracy": round(sum(s.correct for s in scores) / fields, 4) if fields else 1.0,
        "exact_match": round(sum(s.exact for s in scores) / len(scores), 4) if scores else 1.0,
    }
