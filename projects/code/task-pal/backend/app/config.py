from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5-5"
    llm_effort: Literal["low", "medium", "high"] = "medium"
    max_output_tokens: int = 4096
    max_steps: int = 8                    # the most model calls one request may use: an agent needs a hard stop

    database_path: str = "tasks.db"
    timezone: str = "Asia/Kolkata"        # what "today" means for the get_today tool
    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]
# endregion: settings


@lru_cache
def get_settings() -> Settings:
    return Settings()
