from fastapi import Request

from .config import Settings
from .llm import LLMClient


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings
