from typing import Literal

from pydantic import BaseModel, Field


# region: ask-request
class PastTurn(BaseModel):
    question: str = Field(max_length=1000)
    answer: str = Field(max_length=4000)
    queries: list[str] = Field(default_factory=list, max_length=10)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    history: list[PastTurn] = Field(default_factory=list, max_length=6)
    simulate_mistake: Literal["none", "wrong_column", "unsafe"] = Field(
        default="none", description="Offline model only: pretend the model wrote a bad query, to watch the agent recover or the guard block it.")


class SqlRequest(BaseModel):
    query: str = Field(min_length=1, max_length=5000)
# endregion: ask-request
