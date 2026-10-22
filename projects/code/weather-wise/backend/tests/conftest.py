import json
import socket
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.tools import ToolBox

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> dict:
    """A real response captured from Open-Meteo, saved as a file. Used to test the parsing code, nothing more."""
    return json.loads((FIXTURES / f"{name}.json").read_text())


def _online() -> bool:
    try:
        socket.create_connection(("api.open-meteo.com", 443), timeout=3).close()
        return True
    except OSError:
        return False


ONLINE = _online()
needs_network = pytest.mark.skipif(not ONLINE, reason="Open-Meteo is not reachable from here")


@pytest.fixture
async def http():
    async with httpx.AsyncClient(timeout=10) as client:
        yield client


@pytest.fixture
async def box(http):
    return ToolBox(http)


@pytest.fixture
def client():
    with TestClient(create_app(Settings(anthropic_api_key=None, frontend_dist="nope", _env_file=None))) as c:
        yield c
