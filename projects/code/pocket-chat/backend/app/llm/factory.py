from ..config import Settings
from .base import LLMClient
from .mock_client import MockClient


# region: factory
def build_llm(settings: Settings) -> LLMClient:
    """Pick the provider once, at start-up. The rest of the app only sees the LLMClient protocol."""
    if settings.resolved_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY to be set.")
        from .anthropic_client import AnthropicClient      # imported late: mock mode never needs the SDK

        return AnthropicClient(settings.anthropic_api_key, settings.llm_model)
    return MockClient(delay_ms=settings.mock_delay_ms)
# endregion: factory
