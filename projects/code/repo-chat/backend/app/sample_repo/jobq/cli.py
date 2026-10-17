"""The command line: enqueue a job, run a worker, or look at the queue."""
import argparse
import json
import signal
import sys

from .config import ConfigError, load_config
from .models import new_job
from .retry import RetryPolicy
from .storage import Storage
from .worker import Worker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jobq", description="A small SQLite-backed job queue.")
    commands = parser.add_subparsers(dest="command", required=True)
    enqueue = commands.add_parser("enqueue", help="add a job to the queue")
    enqueue.add_argument("task")
    enqueue.add_argument("--payload", default="{}", help="a JSON object passed to the handler")
    enqueue.add_argument("--delay", type=float, default=0.0, help="seconds to wait before the job may run")
    commands.add_parser("worker", help="run jobs until interrupted")
    commands.add_parser("stats", help="show how many jobs are in each status")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point. Returns the process exit code: 0 on success, 2 for a bad setting or bad input."""
    args = build_parser().parse_args(argv)
    try:
        config = load_config()
    except ConfigError as error:
        print(f"jobq: {error}", file=sys.stderr)
        return 2
    storage = Storage(config.db_path)

    if args.command == "enqueue":
        try:
            payload = json.loads(args.payload)
        except json.JSONDecodeError as error:
            print(f"jobq: --payload is not valid JSON: {error}", file=sys.stderr)
            return 2
        job = storage.add(new_job(args.task, payload, max_attempts=config.max_attempts, delay=args.delay))
        print(job.id)
    elif args.command == "stats":
        print(json.dumps(storage.counts(), indent=2))
    else:
        worker = Worker(storage, RetryPolicy(config.base_delay, max_delay=config.max_delay), stale_after=config.stale_after)
        signal.signal(signal.SIGTERM, lambda *_: worker.stop())      # finish the current job, then exit cleanly
        signal.signal(signal.SIGINT, lambda *_: worker.stop())
        worker.run_forever(config.poll_interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
