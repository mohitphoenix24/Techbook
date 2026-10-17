"""The worker: claim a job, run its handler, and decide what happens next."""
import time
import uuid
from collections.abc import Callable

from .metrics import Metrics
from .models import Job
from .retry import PermanentError, RetryPolicy, backoff_delay, should_retry
from .storage import Storage

Handler = Callable[[dict], None]


class Worker:
    """Runs jobs from a Storage. Register one handler per task name, then call run_once or run_forever."""

    def __init__(self, storage: Storage, policy: RetryPolicy = RetryPolicy(), *, worker_id: str | None = None,
                 stale_after: float = 300.0, clock: Callable[[], float] = time.time, sleep: Callable[[float], None] = time.sleep,
                 metrics: Metrics | None = None):
        self.storage, self.policy, self.stale_after = storage, policy, stale_after
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:6]}"
        self.clock, self.sleep, self.metrics = clock, sleep, metrics or Metrics()
        self.handlers: dict[str, Handler] = {}
        self._stopping = False

    def register(self, task: str, handler: Handler) -> None:
        """Say which function runs jobs of this task."""
        self.handlers[task] = handler

    def run_once(self) -> Job | None:
        """Recover stale jobs, claim the next ready job and run it. Returns the job, or None when the queue has nothing ready."""
        recovered = self.storage.requeue_stale(self.stale_after, self.clock())
        if recovered:
            self.metrics.incr("jobs_recovered", recovered)
        job = self.storage.claim_next(self.worker_id, self.clock())
        if job is None:
            return None
        self.metrics.incr("jobs_started")
        started = self.clock()
        try:
            self._execute(job)
        except Exception as error:                      # a handler may raise anything: the worker must survive it
            self._handle_failure(job, error)
        else:
            self.storage.mark_done(job.id)
            self.metrics.incr("jobs_done")
        finally:
            self.metrics.observe("handler_seconds", self.clock() - started)
        return self.storage.get(job.id)

    def _execute(self, job: Job) -> None:
        """Run the handler for the job's task. A task nobody registered is a permanent error: retrying will not make a handler appear."""
        handler = self.handlers.get(job.task)
        if handler is None:
            raise PermanentError(f"no handler registered for task {job.task!r}")
        handler(job.payload)

    def _handle_failure(self, job: Job, error: Exception) -> None:
        """Decide between a retry and giving up. A retry waits `backoff_delay` seconds, so a struggling service gets room to recover."""
        message = f"{type(error).__name__}: {error}"
        if should_retry(job, error):
            retry_at = self.clock() + backoff_delay(job.attempts, self.policy)
            self.storage.mark_failed(job.id, message, retry_at=retry_at)
            self.metrics.incr("jobs_retried")
        else:
            self.storage.mark_failed(job.id, message)
            self.metrics.incr("jobs_failed")

    def stop(self) -> None:
        """Ask run_forever to finish the job it is on and then return (used by signal handlers for a graceful shutdown)."""
        self._stopping = True

    def run_forever(self, poll_interval: float = 0.5) -> None:
        """Keep running jobs until stop() is called, sleeping `poll_interval` seconds whenever the queue is empty."""
        while not self._stopping:
            if self.run_once() is None:
                self.sleep(poll_interval)
