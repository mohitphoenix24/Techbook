import os
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.seed import build_database


@pytest.fixture(scope="session")
def db_path(tmp_path_factory):
    """One shop for the whole test session: it is read-only, and building it once keeps the tests fast."""
    path = str(tmp_path_factory.mktemp("shop") / "shop.db")
    conn = sqlite3.connect(path)
    build_database(conn)
    conn.close()
    return path


@pytest.fixture
def settings(db_path):
    return Settings(llm_provider="mock", mock_delay_ms=0, database_path=db_path, frontend_dist="nope", _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def sql(db_path, query, args=()):
    """Straight SQL against the shop, for expected values in tests."""
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(query, args).fetchall()
    finally:
        conn.close()
