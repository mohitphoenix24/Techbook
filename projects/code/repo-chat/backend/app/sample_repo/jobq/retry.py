"""Retry rules: which failures are worth retrying, and how long to wait before the next attempt."""
import random
from dataclasses import dataclass

from .models import Job


class PermanentError(Exception):
    """Raise this from a handler when retrying cannot help (bad input, a missing resource). The job fails at once."""


@dataclass(frozen=True)
class RetryPolicy:
    base_delay: float = 1.0       # the wait before the first retry, in seconds
    factor: float = 2.0           # each later retry waits this many times longer
    max_delay: float = 60.0       # but never longer than this
    jitter: float = 0.1           # add up to this fraction at random, so retries from many jobs do not line up


def backoff_delay(attempt: int, policy: RetryPolicy = RetryPolicy(), rng: random.Random | None = None) -> float:
    """Seconds to wait after the given failed attempt (1 for the first failure): exponential growth with a ceiling and jitter.

    With the defaults the waits are about 1, 2, 4, 8, 16, 32, then 60 seconds, each plus up to 10% random jitter.
    """
    if attempt < 1:
        raise ValueError("attempt starts at 1")
    delay = min(policy.max_delay, policy.base_delay * policy.factor ** (attempt - 1))
    spread = (rng or random).random() * policy.jitter * delay
    return round(delay + spread, 3)


def should_retry(job: Job, error: Exception) -> bool:
    """A job is retried while it has attempts left, unless the error is a PermanentError."""
    if isinstance(error, PermanentError):
        return False
    return job.attempts < job.max_attempts
