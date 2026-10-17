# jobq

A small background job queue for Python, backed by a single SQLite file. No server to run: producers add jobs, workers claim and run them.

## Quick start

```python
from jobq import Storage, Worker, new_job

storage = Storage("jobs.db")
storage.add(new_job("send_email", {"to": "asha@example.com"}))

worker = Worker(storage)
worker.register("send_email", lambda payload: print("sending to", payload["to"]))
worker.run_once()
```

From the command line:

```bash
jobq enqueue send_email --payload '{"to": "asha@example.com"}'
jobq worker
jobq stats
```

## How retries work

When a handler raises an exception, the worker does not give up at once. It waits and tries again, up to `max_attempts` times (3 by default).
The wait grows exponentially: about 1 second, then 2, 4, 8, and so on, never more than 60 seconds, plus a little random jitter.
Raise `PermanentError` from a handler to fail a job immediately without retries, for example when the input is invalid.

## Crash recovery

If a worker process dies while running a job, the job stays marked RUNNING. Any worker that starts a new run notices that the job has been
running for longer than `stale_after` seconds (300 by default) and puts it back in the queue.
That means a handler may run more than once for the same job, so handlers should be safe to repeat.

## Configuration

All settings come from environment variables: `JOBQ_DB`, `JOBQ_MAX_ATTEMPTS`, `JOBQ_BASE_DELAY`, `JOBQ_MAX_DELAY`, `JOBQ_POLL_INTERVAL`
and `JOBQ_STALE_AFTER`. An invalid value stops start-up with a clear error.

## Recurring jobs

Use the `Scheduler` to enqueue a task on a schedule such as `5m` or `2h`:

```python
scheduler = Scheduler(storage)
scheduler.every("5m", "refresh_cache")
scheduler.tick()   # call this regularly, for example once a second
```
