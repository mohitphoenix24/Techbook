import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

AGENT = {"Authorization": "Bearer agent-demo-token"}
LEAD = {"Authorization": "Bearer lead-demo-token"}


@pytest.fixture
def settings(tmp_path):
    return Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "support.db"), frontend_dist="nope",
                    rate_limit_per_minute=10_000, intake_per_minute=5, _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def events_of(response) -> list[tuple[str, dict]]:
    """Read a finished Server-Sent Events response the way a browser would: (event name, data) pairs."""
    out = []
    for block in response.text.split("\n\n"):
        if block.strip():
            lines = dict(line.split(": ", 1) for line in block.split("\n") if ": " in line)
            out.append((lines["event"], json.loads(lines["data"])))
    return out


def process(client, ticket_id: int, headers=AGENT, simulate: str = "none") -> list[tuple[str, dict]]:
    response = client.post(f"/api/tickets/{ticket_id}/process", headers=headers, json={"simulate": simulate})
    assert response.status_code == 200, response.text
    return events_of(response)
