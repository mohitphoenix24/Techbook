"""Turn token counts into dollars. Prices are USD per million tokens (input, output)."""

PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
DEFAULT_PRICE = PRICES["claude-sonnet-5-5"]


# region: cost
def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Unknown models (for example the offline mock) are priced like Sonnet, as an estimate."""
    price_in, price_out = PRICES.get(model, DEFAULT_PRICE)
    return round((input_tokens * price_in + output_tokens * price_out) / 1_000_000, 6)
# endregion: cost
