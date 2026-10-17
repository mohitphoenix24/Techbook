"""Request and response shapes. FastAPI validates input with these and writes the OpenAPI docs from them."""
from typing import Literal

from pydantic import BaseModel, Field


# region: chat-request
class ChatRequest(BaseModel):
    conversation_id: str | None = Field(default=None, description="Omit to start a new conversation.")
    message: str = Field(default="", max_length=8000)
    persona: str = "friendly"
    regenerate: bool = Field(default=False, description="Re-answer the last user message instead of sending a new one.")
# endregion: chat-request


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    stopped: bool
    created_at: str


class ConversationOut(BaseModel):
    id: str
    title: str
    persona: str
    updated_at: str
    message_count: int = 0


class ConversationDetail(BaseModel):
    id: str
    title: str
    persona: str
    messages: list[MessageOut]


class PersonaOut(BaseModel):
    id: str
    name: str
    blurb: str
