import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(llm_provider="mock", database_path=str(tmp_path / "test.db"), frontend_dist=str(tmp_path / "nope"), _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
