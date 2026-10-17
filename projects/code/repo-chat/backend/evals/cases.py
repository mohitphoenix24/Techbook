"""Labelled questions about the sample repository, and which chunks a careful engineer would open to answer each one.

`names` lists every chunk that answers the question well (a function, a class, a section of a document). Finding any of
them counts. `names: []` marks a question the repository cannot answer, where the right behaviour is to find nothing.
"""

# region: cases
CASES: list[dict] = [
    {"question": "Where is the retry delay calculated?", "names": ["backoff_delay"]},
    {"question": "How does a worker recover when another worker crashed while running a job?", "names": ["Storage.requeue_stale", "Worker.run_once"]},
    {"question": "What happens when a handler raises an exception?", "names": ["Worker._handle_failure", "Worker.run_once"]},
    {"question": "How do I schedule a job to run every 5 minutes?", "names": ["Scheduler", "parse_interval", "README.md > jobq > Recurring jobs"]},
    {"question": "Which environment variables configure jobq?", "names": ["load_config", "jobq.config", "README.md > jobq > Configuration"]},
    {"question": "How is a job claimed so that two workers never take the same one?", "names": ["Storage.claim_next"]},
    {"question": "What does Worker._handle_failure do?", "names": ["Worker._handle_failure"]},
    {"question": "What is the default maximum number of attempts for a job?", "names": ["Config", "new_job", "Job", "README.md > jobq > How retries work"]},
    {"question": "Which errors are never retried?", "names": ["should_retry", "PermanentError"]},
    {"question": "What does the stale_after setting mean?", "names": ["Config", "Storage.requeue_stale", "README.md > jobq > Crash recovery"]},
    {"question": "How does the worker shut down gracefully when it gets SIGTERM?", "names": ["main", "Worker.stop", "Worker.run_forever"]},
    {"question": "What happens to a job whose task has no registered handler?", "names": ["Worker._execute"]},
    {"question": "How does the wait between retries grow with each attempt?", "names": ["backoff_delay", "RetryPolicy"]},
    {"question": "What are the possible states of a job?", "names": ["JobStatus"]},
    {"question": "How are metrics collected?", "names": ["Metrics"]},
    {"question": "Which command line commands does jobq have?", "names": ["build_parser", "main"]},
    {"question": "Why does jobq use SQLite, and what if I need several machines?", "names": ["docs/architecture.md > How jobq works > Why SQLite"]},
    {"question": "How does the scheduler avoid flooding the queue after it was paused?", "names": ["Scheduler"]},
    # questions this repository cannot answer: the right result is to find nothing
    {"question": "How do I deploy jobq to Kubernetes with a Helm chart?", "names": []},
    {"question": "What is the airspeed velocity of an unladen swallow?", "names": []},
]
# endregion: cases

# region: held-out
# Questions written AFTER the search was tuned, and never used to tune it. A score on these is an honest estimate of how
# the search does on questions nobody has looked at; a score on CASES is partly a measure of how well we fitted them.
HELD_OUT: list[dict] = [
    {"question": "What does JobStatus.FAILED mean?", "names": ["JobStatus"]},
    {"question": "How can I make the worker poll for new jobs less often?", "names": ["Config", "Worker.run_forever", "README.md > jobq > Configuration"]},
    {"question": "Where do retry attempts get counted?", "names": ["Storage.claim_next"]},
    {"question": "What does requeue_stale return?", "names": ["Storage.requeue_stale"]},
    {"question": "How do I enqueue a job from the command line, to run after a delay?", "names": ["build_parser", "main", "README.md > jobq > Quick start"]},
    {"question": "Which function creates a new job that becomes runnable later?", "names": ["new_job"]},
    {"question": "How do I plug jobq into a Django project with Celery?", "names": []},
]
# endregion: held-out
