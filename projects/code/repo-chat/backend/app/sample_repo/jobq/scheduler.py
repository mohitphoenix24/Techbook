"""Recurring jobs: run a task every so often, such as every 5 minutes."""
import re
import time
from collections.abc import Callable

from .models import new_job
from .storage import Storage

UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_interval(text: str) -> int:
    """Turn '30s', '5m', '2h' or '1d' into seconds. Anything else is a ValueError, so a typo fails loudly at start-up."""
    match = re.fullmatch(r"\s*(\d+)\s*([smhd])\s*", text.lower())
    if not match or int(match.group(1)) == 0:
        raise ValueError(f"not an interval: {text!r} (use a number and s, m, h or d, for example 5m)")
    return int(match.group(1)) * UNITS[match.group(2)]


class Scheduler:
    """Keeps a list of recurring tasks and, on each tick, enqueues the ones that are due."""

    def __init__(self, storage: Storage, clock: Callable[[], float] = time.time):
        self.storage, self.clock = storage, clock
        self.entries: list[dict] = []

    def every(self, interval: str, task: str, payload: dict | None = None) -> None:
        """Run `task` every `interval` (for example '5m'). The first run is due one interval from now."""
        seconds = parse_interval(interval)
        self.entries.append({"task": task, "payload": payload or {}, "seconds": seconds, "next_run": self.clock() + seconds})

    def tick(self) -> int:
        """Enqueue a job for every recurring task that is due, and schedule its next run. Returns how many were enqueued.

        If the scheduler was paused for a long time, a task is enqueued once, not once per missed interval: catching up
        on every missed run would flood the queue.
        """
        now, enqueued = self.clock(), 0
        for entry in self.entries:
            if entry["next_run"] <= now:
                self.storage.add(new_job(entry["task"], entry["payload"], now=now))
                entry["next_run"] = now + entry["seconds"]
                enqueued += 1
        return enqueued
