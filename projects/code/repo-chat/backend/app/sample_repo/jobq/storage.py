"""Persistence: jobs live in one SQLite table, and every state change is a single SQL statement."""
import json
import sqlite3
import threading

from .models import Job, JobStatus

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, task TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL, run_at REAL NOT NULL,
    locked_by TEXT, locked_at REAL, last_error TEXT
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs (status, run_at);
"""


class Storage:
    """A job store. Safe to share between threads: every call takes the lock."""

    def __init__(self, path: str = ":memory:"):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock, self._conn:
            self._conn.executescript(SCHEMA)

    def add(self, job: Job) -> Job:
        """Insert a new job and return it."""
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO jobs (id, task, payload, status, attempts, max_attempts, run_at) VALUES (?,?,?,?,?,?,?)",
                (job.id, job.task, json.dumps(job.payload), job.status.value, job.attempts, job.max_attempts, job.run_at),
            )
        return job

    def claim_next(self, worker_id: str, now: float) -> Job | None:
        """Atomically take the oldest job that is ready to run, so two workers can never claim the same job.

        The SELECT and the UPDATE happen under one lock and one transaction, and the UPDATE only succeeds while the
        row is still QUEUED. If another worker got there first, the UPDATE changes nothing and we report no job.
        """
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT * FROM jobs WHERE status = ? AND run_at <= ? ORDER BY run_at, rowid LIMIT 1", (JobStatus.QUEUED.value, now)
            ).fetchone()
            if row is None:
                return None
            claimed = self._conn.execute(
                "UPDATE jobs SET status = ?, locked_by = ?, locked_at = ?, attempts = attempts + 1 WHERE id = ? AND status = ?",
                (JobStatus.RUNNING.value, worker_id, now, row["id"], JobStatus.QUEUED.value),
            ).rowcount
            return self.get(row["id"]) if claimed else None

    def get(self, job_id: str) -> Job | None:
        row = self._conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _job(row) if row else None

    def mark_done(self, job_id: str) -> None:
        """Record success and release the lock."""
        with self._lock, self._conn:
            self._conn.execute("UPDATE jobs SET status = ?, locked_by = NULL, locked_at = NULL WHERE id = ?", (JobStatus.DONE.value, job_id))

    def mark_failed(self, job_id: str, error: str, retry_at: float | None = None) -> None:
        """Record a failure. With `retry_at` the job goes back to the queue for later; without it, the job is FAILED for good."""
        status = JobStatus.QUEUED if retry_at is not None else JobStatus.FAILED
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE jobs SET status = ?, last_error = ?, run_at = COALESCE(?, run_at), locked_by = NULL, locked_at = NULL WHERE id = ?",
                (status.value, error[:500], retry_at, job_id),
            )

    def requeue_stale(self, stale_after: float, now: float) -> int:
        """Crash recovery: a job that has been RUNNING longer than `stale_after` seconds belongs to a worker that died, so put it back."""
        with self._lock, self._conn:
            return self._conn.execute(
                "UPDATE jobs SET status = ?, locked_by = NULL, locked_at = NULL WHERE status = ? AND locked_at < ?",
                (JobStatus.QUEUED.value, JobStatus.RUNNING.value, now - stale_after),
            ).rowcount

    def counts(self) -> dict[str, int]:
        """How many jobs are in each status."""
        rows = self._conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()
        return {row["status"]: row["n"] for row in rows}


def _job(row: sqlite3.Row) -> Job:
    return Job(id=row["id"], task=row["task"], payload=json.loads(row["payload"]), status=JobStatus(row["status"]), attempts=row["attempts"],
               max_attempts=row["max_attempts"], run_at=row["run_at"], locked_by=row["locked_by"], locked_at=row["locked_at"], last_error=row["last_error"])
