from typing import Literal

from pydantic import BaseModel, Field


# region: chat-request
class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[Turn] = Field(default_factory=list, max_length=20)      # the browser keeps the conversation; the server keeps nothing
# endregion: chat-request
