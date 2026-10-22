from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5-5"
    llm_effort: Literal["low", "medium", "high"] = "medium"
    max_output_tokens: int = 8000
    max_steps: int = 6                    # the most model calls one question may use
    max_searches: int = 4                 # the most web searches one question may use (the API enforces it)
    search_country: str = "IN"            # localises results; "" turns it off

    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]
# endregion: settings


@lru_cache
def get_settings() -> Settings:
    return Settings()
