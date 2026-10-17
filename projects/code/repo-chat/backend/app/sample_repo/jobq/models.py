"""Data types shared by every part of jobq."""
import time
import uuid
from dataclasses import dataclass
from enum import Enum


class JobStatus(str, Enum):
    """Where a job is in its life. A job only ever moves forward, except when a retry puts it back to QUEUED."""

    QUEUED = "queued"        # waiting for a worker (and for its run_at time)
    RUNNING = "running"      # a worker has claimed it
    DONE = "done"            # finished successfully
    FAILED = "failed"        # gave up: no attempts left, or the error was permanent


@dataclass
class Job:
    """One unit of work. `payload` is any JSON-serialisable dictionary handed to the task's handler."""

    id: str
    task: str
    payload: dict
    status: JobStatus = JobStatus.QUEUED
    attempts: int = 0
    max_attempts: int = 3
    run_at: float = 0.0            # the earliest time (unix seconds) the job may run
    locked_by: str | None = None   # the id of the worker that claimed it
    locked_at: float | None = None
    last_error: str | None = None


def new_job(task: str, payload: dict | None = None, *, max_attempts: int = 3, delay: float = 0.0, now: float | None = None) -> Job:
    """Create a queued job that becomes runnable `delay` seconds from now."""
    current = time.time() if now is None else now
    return Job(id=uuid.uuid4().hex[:12], task=task, payload=payload or {}, max_attempts=max_attempts, run_at=current + delay)
