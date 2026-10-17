from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # the model
    llm_provider: Literal["auto", "anthropic", "mock"] = "auto"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    llm_fallback_model: str = "claude-haiku-5-5"       # used when the main model keeps failing
    llm_effort: Literal["low", "medium", "high"] = "medium"
    max_output_tokens: int = 1200
    mock_delay_ms: int = 8

    # the gateway
    rate_limit_per_minute: int = 30
    daily_budget_usd: float = 5.0
    cache_ttl_seconds: float = 600
    llm_attempts: int = 3
    breaker_failures: int = 4
    breaker_cooldown_seconds: float = 20
    llm_timeout_seconds: float = 30

    # the desk
    database_path: str = "support.db"
    today: str = "2026-10-12"                           # the demo's fixed "today", so policy windows are repeatable
    refund_auto_limit_inr: int = 5000                   # a refund above this needs a team lead
    intake_per_minute: int = 12                         # the public form: new tickets per minute per address

    # who may use the desk. These are DEMO tokens: set your own, or sign in with a real identity provider.
    agent_token: str = "agent-demo-token"
    lead_token: str = "lead-demo-token"

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
