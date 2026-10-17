from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: Literal["auto", "anthropic", "mock"] = "auto"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    llm_effort: Literal["low", "medium", "high"] = "medium"

    database_path: str = "extractor.db"
    max_repairs: int = 2                 # extra attempts after the first, each one shows the model its validation errors
    max_output_tokens: int = 4096
    max_document_chars: int = 30_000
    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def resolved_provider(self) -> str:
        if self.llm_provider != "auto":
            return self.llm_provider
        return "anthropic" if self.anthropic_api_key else "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
