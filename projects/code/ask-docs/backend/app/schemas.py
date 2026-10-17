from typing import Literal

from pydantic import BaseModel, Field


# region: ask-request
class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12, description="Earlier turns, kept by the browser.")
    mode: Literal["hybrid", "vector", "keyword"] = "hybrid"
    top_k: int = Field(default=5, ge=1, le=10)
    document_ids: list[str] | None = Field(default=None, description="Search only these documents; omit to search all.")


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    mode: Literal["hybrid", "vector", "keyword"] = "hybrid"
    top_k: int = Field(default=5, ge=1, le=20)
    document_ids: list[str] | None = None
# endregion: ask-request
