from ..config import Settings
from ..gateway import Gateway
from .base import LLMClient
from .mock_client import MockClient


# region: factory
def build_clients(settings: Settings) -> tuple[LLMClient, LLMClient | None]:
    """The main model and, for a real provider, a cheaper one to fall back to. The offline model has no fallback."""
    if settings.resolved_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY to be set.")
        from .anthropic_client import AnthropicClient

        main = AnthropicClient(settings.anthropic_api_key, settings.llm_model, settings.llm_effort)
        backup = AnthropicClient(settings.anthropic_api_key, settings.llm_fallback_model, "low") if settings.llm_fallback_model != settings.llm_model else None
        return main, backup
    return MockClient(settings.mock_delay_ms), None


def build_gateway(settings: Settings, primary: LLMClient | None = None, fallback: LLMClient | None = None, **overrides) -> Gateway:
    main, backup = build_clients(settings) if primary is None else (primary, fallback)
    options = dict(per_minute=settings.rate_limit_per_minute, daily_budget_usd=settings.daily_budget_usd, cache_ttl=settings.cache_ttl_seconds,
                   attempts=settings.llm_attempts, breaker_failures=settings.breaker_failures, breaker_cooldown=settings.breaker_cooldown_seconds,
                   timeout=settings.llm_timeout_seconds)
    return Gateway(main, backup, **{**options, **overrides})
# endregion: factory
