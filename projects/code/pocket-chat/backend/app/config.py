"""Settings come from environment variables (and a .env file), validated once at start-up."""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "auto" picks Claude when a key is present and the offline mock otherwise.
    llm_provider: Literal["auto", "anthropic", "mock"] = "auto"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    max_output_tokens: int = 1024

    # How much conversation history we send each turn (see app/context.py).
    context_budget_tokens: int = 6000

    database_path: str = "pocketchat.db"
    # If this folder exists (after `npm run build`), the API also serves the built React app.
    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Calls per minute allowed per client IP on /api/chat (0 turns the limit off).
    rate_limit_per_minute: int = 30

    # Mock provider only: pause between chunks so streaming is visible in the UI.
    mock_delay_ms: int = 25

    @property
    def resolved_provider(self) -> str:
        if self.llm_provider != "auto":
            return self.llm_provider
        return "anthropic" if self.anthropic_api_key else "mock"
# endregion: settings


@lru_cache
def get_settings() -> Settings:
    return Settings()
