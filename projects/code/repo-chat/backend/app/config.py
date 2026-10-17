from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: Literal["auto", "anthropic", "mock"] = "auto"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    llm_effort: Literal["low", "medium", "high"] = "medium"
    max_output_tokens: int = 1200
    mock_delay_ms: int = 10

    top_k: int = 5                          # chunks found by search (the call graph may add a few more)
    max_repos: int = 5                      # uploaded repositories kept in memory at once
    max_zip_bytes: int = 5_000_000
    max_files: int = 400
    max_file_bytes: int = 200_000
    max_total_bytes: int = 4_000_000

    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def resolved_provider(self) -> str:
        if self.llm_provider != "auto":
            return self.llm_provider
        return "anthropic" if self.anthropic_api_key else "mock"
# endregion: settings


@lru_cache
def get_settings() -> Settings:
    return Settings()
