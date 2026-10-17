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
    max_output_tokens: int = 2000

    database_path: str = "shop.db"
    max_steps: int = 6                    # the most model turns one question may use: an agent needs a hard stop
    query_timeout_seconds: float = 2.0
    max_rows: int = 200                   # rows returned to the browser; the model sees fewer (see tools.py)
    mock_delay_ms: int = 12
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
