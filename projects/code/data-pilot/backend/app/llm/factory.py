from ..config import Settings
from .base import LLMClient
from .mock_client import MockClient


def build_llm(settings: Settings) -> LLMClient:
    if settings.resolved_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY to be set.")
        from .anthropic_client import AnthropicClient

        return AnthropicClient(settings.anthropic_api_key, settings.llm_model, settings.llm_effort)
    return MockClient(settings.mock_delay_ms)
