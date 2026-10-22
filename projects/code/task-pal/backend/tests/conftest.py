from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.store import TaskStore
from app.tools import ToolBox

TODAY = date(2026, 10, 18)          # a Sunday


@pytest.fixture
def store():
    return TaskStore(":memory:")


@pytest.fixture
def box(store):
    return ToolBox(store, lambda: TODAY)


@pytest.fixture
def settings(tmp_path):
    return Settings(anthropic_api_key=None, database_path=str(tmp_path / "tasks.db"), frontend_dist="nope", _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
