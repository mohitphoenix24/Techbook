"""Keep the conversation inside a token budget.

The model has a limited context window and every token costs money, so we do not resend an
entire long chat forever. These functions are pure (no I/O), which makes them easy to test.
"""
# region: imports
import math
from collections.abc import Callable

Message = dict[str, str]
# endregion: imports


# region: estimate
def estimate_tokens(text: str) -> int:
    """A rough guess: English averages about four characters per token.

    Good enough for budgeting. When you need an exact number, ask the API
    (`client.messages.count_tokens`) instead of guessing.
    """
    return max(1, math.ceil(len(text) / 4))
# endregion: estimate


# region: trim
def trim_history(
    messages: list[Message],
    budget: int,
    count: Callable[[str], int] = estimate_tokens,
) -> tuple[list[Message], int]:
    """Return (messages that fit in `budget` tokens, how many old messages were dropped).

    Rules:
      1. Walk backwards from the newest message, keeping messages while they fit.
      2. The newest message is always kept, even if it alone is over budget.
      3. The result must start with a "user" message (the API requires it), so a
         leading assistant reply left over by the cut is dropped too.
    """
    if not messages:
        return [], 0

    kept: list[Message] = []
    used = 0
    for message in reversed(messages):
        cost = count(message["content"])
        if kept and used + cost > budget:
            break
        kept.append(message)
        used += cost
    kept.reverse()

    while len(kept) > 1 and kept[0]["role"] != "user":
        kept.pop(0)

    return kept, len(messages) - len(kept)
# endregion: trim
