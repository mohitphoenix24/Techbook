"""A small sliding-window rate limiter. Pure logic (no FastAPI) so it is trivial to test with a fake clock."""
# region: imports
import time
from collections import defaultdict, deque
from collections.abc import Callable
# endregion: imports


# region: limiter
class SlidingWindowLimiter:
    """Allow at most `limit` calls per `window` seconds for each key (for example a client's IP address)."""

    def __init__(self, limit: int, window: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> tuple[bool, float]:
        """Return (allowed, seconds to wait if refused)."""
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window:       # forget calls that left the window
            hits.popleft()
        if len(hits) >= self.limit:
            return False, self.window - (now - hits[0])
        hits.append(now)
        return True, 0.0
# endregion: limiter
