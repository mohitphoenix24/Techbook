"""Tokens and dollars. Prices are USD per million tokens (input, output)."""
import math

PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}


def estimate_tokens(text: str) -> int:
    """About four characters per token for English. Use the API's count_tokens when you need an exact number."""
    return max(1, math.ceil(len(text) / 4))


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICES.get(model, PRICES["claude-sonnet-5-5"])
    return round((input_tokens * price_in + output_tokens * price_out) / 1_000_000, 6)
