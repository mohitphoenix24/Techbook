"""Settings, read from environment variables."""
import os
from dataclasses import dataclass


class ConfigError(ValueError):
    """Raised when a setting is missing or has a value jobq cannot use."""


@dataclass(frozen=True)
class Config:
    db_path: str = "jobq.db"
    max_attempts: int = 3          # how many times a job may run before it is marked failed
    base_delay: float = 1.0        # seconds before the first retry; later retries wait longer
    max_delay: float = 60.0        # the longest any retry will ever wait
    poll_interval: float = 0.5     # how often an idle worker looks for work
    stale_after: float = 300.0     # a job running longer than this is assumed to belong to a crashed worker


def _number(env: dict, name: str, default: float, minimum: float) -> float:
    raw = env.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    return value


def load_config(env: dict | None = None) -> Config:
    """Build a Config from JOBQ_DB, JOBQ_MAX_ATTEMPTS, JOBQ_BASE_DELAY, JOBQ_MAX_DELAY, JOBQ_POLL_INTERVAL and JOBQ_STALE_AFTER."""
    env = dict(os.environ if env is None else env)
    return Config(
        db_path=env.get("JOBQ_DB", Config.db_path),
        max_attempts=int(_number(env, "JOBQ_MAX_ATTEMPTS", Config.max_attempts, 1)),
        base_delay=_number(env, "JOBQ_BASE_DELAY", Config.base_delay, 0),
        max_delay=_number(env, "JOBQ_MAX_DELAY", Config.max_delay, 0),
        poll_interval=_number(env, "JOBQ_POLL_INTERVAL", Config.poll_interval, 0.01),
        stale_after=_number(env, "JOBQ_STALE_AFTER", Config.stale_after, 1),
    )
