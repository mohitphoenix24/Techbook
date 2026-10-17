import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.repos import load_sample


@pytest.fixture(scope="session")
def sample():
    """The built-in repository, indexed once for the whole test session."""
    return load_sample()


@pytest.fixture
def settings():
    return Settings(llm_provider="mock", mock_delay_ms=0, frontend_dist="nope", _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def make_zip(files: dict[str, str | bytes], *, compression=zipfile.ZIP_DEFLATED) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buffer.getvalue()


def events_of(response) -> list[tuple[str, dict]]:
    import json
    out = []
    for block in response.text.split("\n\n"):
        if block.strip():
            lines = dict(line.split(": ", 1) for line in block.split("\n") if ": " in line)
            out.append((lines["event"], json.loads(lines["data"])))
    return out
