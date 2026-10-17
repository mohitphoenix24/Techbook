import random

import pytest

from jobq import PermanentError, RetryPolicy, backoff_delay, new_job, should_retry


def test_delay_doubles_until_it_reaches_the_ceiling():
    policy = RetryPolicy(base_delay=1, factor=2, max_delay=10, jitter=0)
    assert [backoff_delay(n, policy) for n in range(1, 7)] == [1, 2, 4, 8, 10, 10]


def test_jitter_adds_a_little_but_never_more_than_the_fraction():
    policy = RetryPolicy(base_delay=10, jitter=0.1)
    delays = {backoff_delay(1, policy, random.Random(seed)) for seed in range(20)}
    assert len(delays) > 1 and all(10 <= d <= 11 for d in delays)


def test_attempts_start_at_one():
    with pytest.raises(ValueError):
        backoff_delay(0)


def test_a_permanent_error_is_never_retried():
    job = new_job("x", max_attempts=5)
    assert not should_retry(job, PermanentError("bad input"))
    assert should_retry(job, RuntimeError("boom"))


def test_a_job_with_no_attempts_left_is_not_retried():
    job = new_job("x", max_attempts=2)
    job.attempts = 2
    assert not should_retry(job, RuntimeError("boom"))
