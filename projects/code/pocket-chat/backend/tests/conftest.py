import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "test.db"), _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


# region: helpers
def parse_sse(text: str) -> list[tuple[str, dict]]:
    """Turn a raw SSE body into [(event, data), ...] so tests can assert on what a browser would see."""
    events = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def chat(client, **body):
    response = client.post("/api/chat", json=body)
    return response, (parse_sse(response.text) if response.status_code == 200 else [])
# endregion: helpers
