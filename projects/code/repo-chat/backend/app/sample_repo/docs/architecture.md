# How jobq works

## The life of a job

1. A producer calls `new_job` and `Storage.add`. The job is stored with status `queued` and a `run_at` time, which is now plus any delay.
2. A worker calls `Storage.claim_next`. It takes the oldest job whose `run_at` has passed, marks it `running`, records which worker holds it and adds one to `attempts`.
3. The worker runs the handler registered for the job's task.
4. On success the job becomes `done`. On an error the worker asks `should_retry`: if the job has attempts left and the error is not a `PermanentError`, it goes back to `queued` with a later `run_at`; otherwise it becomes `failed`.

## Why SQLite

One file, no server, transactions for free. The queue is meant for small and medium workloads on one machine. If you need many machines, replace `Storage` with one backed by PostgreSQL or Redis: the worker only uses `add`, `claim_next`, `mark_done`, `mark_failed`, `requeue_stale` and `counts`.

## Two workers, one job?

No. `claim_next` selects and updates inside one transaction, and the update only succeeds while the row is still `queued`, so a second worker finds nothing.

## Failure handling

* A handler that raises is caught by the worker; the worker itself never crashes because of a handler.
* A task with no registered handler fails permanently, because retrying cannot create a handler.
* A crashed worker is detected by time: its job has been `running` for longer than `stale_after`, and `requeue_stale` returns it to the queue.

## Scheduling

The `Scheduler` is separate from the worker. It enqueues ordinary jobs when a recurring task is due, so recurring work gets the same retries and recovery as any other job.
