from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.ratelimit import SlidingWindowLimiter


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_allows_up_to_the_limit_then_refuses():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=3, window=60, clock=clock)
    assert [limiter.allow("a")[0] for _ in range(4)] == [True, True, True, False]


def test_reports_how_long_to_wait_and_recovers():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=1, window=60, clock=clock)
    assert limiter.allow("a") == (True, 0.0)
    clock.now += 20
    allowed, wait = limiter.allow("a")
    assert not allowed and round(wait) == 40
    clock.now += 41
    assert limiter.allow("a")[0] is True


def test_each_client_has_its_own_budget():
    limiter = SlidingWindowLimiter(limit=1, window=60, clock=FakeClock())
    assert limiter.allow("a")[0] and limiter.allow("b")[0] and not limiter.allow("a")[0]


def test_chat_endpoint_returns_429_with_retry_after(tmp_path):
    settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "t.db"), rate_limit_per_minute=2, _env_file=None)
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/chat", json={"message": "one"}).status_code == 200
        assert client.post("/api/chat", json={"message": "two"}).status_code == 200
        refused = client.post("/api/chat", json={"message": "three"})
        assert refused.status_code == 429
        assert "Too many messages" in refused.json()["detail"]
        assert int(refused.headers["retry-after"]) >= 1
        assert client.get("/api/health").status_code == 200            # other routes are not limited
