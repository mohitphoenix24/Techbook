from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# region: settings
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: Literal["auto", "anthropic", "mock"] = "auto"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    max_output_tokens: int = 700

    embeddings_provider: Literal["hash", "fastembed", "voyage"] = "hash"
    voyage_api_key: str | None = None

    chunk_size: int = 700            # characters per chunk
    chunk_overlap: int = 120
    top_k: int = 5                   # passages sent to the model
    keyword_threshold: float = 2.0   # BM25 score below which the best passages are "not relevant"
    max_upload_bytes: int = 10_000_000

    database_path: str = "askdocs.db"
    frontend_dist: str = "../frontend/dist"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_delay_ms: int = 15

    @property
    def resolved_provider(self) -> str:
        if self.llm_provider != "auto":
            return self.llm_provider
        return "anthropic" if self.anthropic_api_key else "mock"
# endregion: settings


@lru_cache
def get_settings() -> Settings:
    return Settings()
