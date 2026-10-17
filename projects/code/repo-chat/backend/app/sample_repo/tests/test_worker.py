from jobq import JobStatus, RetryPolicy, Storage, Worker, new_job


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make(clock=None):
    clock = clock or Clock()
    storage = Storage()
    return storage, Worker(storage, RetryPolicy(base_delay=10, jitter=0), clock=clock, sleep=lambda s: None, stale_after=60), clock


def test_a_successful_job_is_marked_done():
    storage, worker, clock = make()
    worker.register("ok", lambda payload: None)
    storage.add(new_job("ok", now=clock()))
    assert worker.run_once().status == JobStatus.DONE


def test_a_failing_job_goes_back_to_the_queue_with_a_later_run_time():
    storage, worker, clock = make()
    def boom(payload):
        raise RuntimeError("down")
    worker.register("flaky", boom)
    storage.add(new_job("flaky", now=clock()))
    job = worker.run_once()
    assert job.status == JobStatus.QUEUED and job.run_at == clock() + 10 and "down" in job.last_error
    assert worker.run_once() is None                      # not ready yet
    clock.now += 10
    assert worker.run_once().attempts == 2


def test_a_job_with_no_handler_fails_at_once():
    storage, worker, clock = make()
    storage.add(new_job("mystery", now=clock()))
    job = worker.run_once()
    assert job.status == JobStatus.FAILED and "no handler" in job.last_error


def test_a_job_stuck_running_after_a_crash_is_recovered():
    storage, worker, clock = make()
    storage.add(new_job("ok", now=clock()))
    storage.claim_next("dead-worker", clock())            # claimed, then the worker died
    clock.now += 61
    worker.register("ok", lambda payload: None)
    assert worker.run_once().status == JobStatus.DONE and worker.metrics.counters["jobs_recovered"] == 1
