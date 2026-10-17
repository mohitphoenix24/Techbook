from typing import Any, Literal

from pydantic import BaseModel, Field


# region: api-models
class ExtractRequest(BaseModel):
    doc_type: str
    text: str = Field(min_length=1)
    simulate_mistake: Literal["none", "rule", "invent"] = Field(
        default="none", description="Offline model only: pretend the model made a mistake, to see the safety nets work.")


class Issue(BaseModel):
    path: str                      # "line_items.0.amount": where in the data the problem is ("" = the whole document)
    level: Literal["error", "warning"]
    message: str


class Evidence(BaseModel):
    status: Literal["found", "missing"]
    start: int | None = None       # character offsets in the source text, for highlighting
    end: int | None = None


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float


class ExtractionResult(BaseModel):
    id: str
    doc_type: str
    data: dict[str, Any]
    valid: bool
    attempts: int
    issues: list[Issue]
    grounding: dict[str, Evidence]
    usage: Usage
    provider: str
    model: str
    duration_ms: int


class ReviewRequest(BaseModel):
    data: dict[str, Any]
# endregion: api-models
