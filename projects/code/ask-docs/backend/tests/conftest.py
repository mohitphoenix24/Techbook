import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "test.db"), frontend_dist=str(tmp_path / "nope"), _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def loaded(client):
    """A client with the three sample documents ingested and ready."""
    client.post("/api/documents/samples")
    wait_until_ready(client)
    return client


def wait_until_ready(client, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        docs = client.get("/api/documents").json()
        if docs and all(d["status"] in ("ready", "failed") for d in docs):
            return docs
        time.sleep(0.05)
    raise AssertionError("documents did not finish ingesting")
