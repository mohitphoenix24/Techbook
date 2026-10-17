"""Counters and timings, kept in memory and read as a snapshot."""
from collections import defaultdict


class Metrics:
    """Collects how many jobs were started, finished and retried, and how long handlers took."""

    def __init__(self) -> None:
        self.counters: dict[str, int] = defaultdict(int)
        self.timings: dict[str, list[float]] = defaultdict(list)

    def incr(self, name: str, amount: int = 1) -> None:
        self.counters[name] += amount

    def observe(self, name: str, seconds: float) -> None:
        self.timings[name].append(seconds)

    def snapshot(self) -> dict:
        """A plain dictionary of every counter plus the count, mean and maximum of every timing."""
        out: dict = dict(self.counters)
        for name, values in self.timings.items():
            out[name] = {"count": len(values), "mean": round(sum(values) / len(values), 4), "max": round(max(values), 4)}
        return out
