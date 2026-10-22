import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.notes import Notes
from app.proposals import Proposals
from app.tools import ToolBox


@pytest.fixture
def notes(tmp_path):
    n = Notes(tmp_path / "notes")
    n.write("ideas", "# Ideas\n- build a to-do agent\n- try web search\n")
    n.write("shopping", "# Shopping\nmilk\neggs\n")
    return n


@pytest.fixture
def proposals():
    return Proposals()


@pytest.fixture
def box(notes, proposals):
    return ToolBox(notes, proposals)


@pytest.fixture
def client(tmp_path):
    settings = Settings(anthropic_api_key=None, notes_dir=str(tmp_path / "api-notes"), frontend_dist="nope", _env_file=None)
    with TestClient(create_app(settings)) as c:
        yield c
