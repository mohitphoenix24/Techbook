"""Tokens and searches to dollars. Token prices are USD per million tokens (input, output). Web search is billed on top."""

PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
SEARCH_USD = 10.00 / 1000            # $10 per 1,000 searches: one cent each


def token_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICES.get(model, PRICES["claude-opus-5-5"])
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000


def cost_usd(model: str, input_tokens: int, output_tokens: int, searches: int = 0) -> float:
    return round(token_cost_usd(model, input_tokens, output_tokens) + searches * SEARCH_USD, 6)
