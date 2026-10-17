from fastapi import Request

from .config import Settings
from .db import Store
from .llm import LLMClient


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings
