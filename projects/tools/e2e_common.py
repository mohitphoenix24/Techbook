"""Shared helpers for the end-to-end tests: start a project's FastAPI backend and Vite frontend, drive them
with a real browser (Playwright + Chrome), then shut everything down.

    PL_PYTHON=/path/to/venv/bin/python PL_NODE_BIN=/path/to/node/bin python3 projects/tools/e2e_pocket_chat.py

The backend runs in offline mock mode against a throw-away SQLite file, so no API key is needed.
"""
import contextlib
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CODE = ROOT / "code"
PYTHON = os.environ.get("PL_PYTHON", sys.executable)
NODE_BIN = os.environ.get("PL_NODE_BIN", "")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for(url: str, timeout: float = 40.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"{url} did not come up")


@contextlib.contextmanager
def stack(project: str, env: dict | None = None, backend_port: int | None = None, backend_cmd=None):
    """Yield the frontend URL with backend + frontend running. `env` overrides backend environment variables.
    `backend_cmd(port)` may return a different command line than the default `uvicorn app.main:app` (cwd is still backend/)."""
    backend_dir = CODE / project / "backend"
    frontend_dir = CODE / project / "frontend"
    bport, fport = backend_port or free_port(), free_port()
    tmp = tempfile.mkdtemp(prefix="pl-e2e-")
    clean = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    clean.update({"PYTHONNOUSERSITE": "1", "LLM_PROVIDER": "mock", "DATABASE_PATH": f"{tmp}/e2e.db", "MOCK_DELAY_MS": "8"})
    clean.update(env or {})
    argv = backend_cmd(bport) if backend_cmd else [PYTHON, "-m", "uvicorn", "app.main:app", "--port", str(bport), "--log-level", "warning"]
    api = subprocess.Popen(argv, cwd=backend_dir, env=clean, preexec_fn=os.setsid)
    fenv = dict(os.environ)
    if NODE_BIN:
        fenv["PATH"] = NODE_BIN + os.pathsep + fenv["PATH"]
    fenv["API_URL"] = f"http://127.0.0.1:{bport}"
    web = subprocess.Popen(["npx", "vite", "--port", str(fport), "--strictPort", "--host", "127.0.0.1"],
                           cwd=frontend_dir, env=fenv, preexec_fn=os.setsid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for(f"http://127.0.0.1:{bport}/api/health")
        wait_for(f"http://127.0.0.1:{fport}/")
        yield f"http://127.0.0.1:{fport}"
    finally:
        for p in (web, api):
            with contextlib.suppress(Exception):
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)


class Checks:
    """Tiny assertion collector so one failure does not hide the others."""

    def __init__(self):
        self.failed = []
        self.passed = 0

    def ok(self, cond, label):
        if cond:
            self.passed += 1
            print(f"  ✓ {label}")
        else:
            self.failed.append(label)
            print(f"  ✗ {label}")

    def finish(self):
        print(f"\n{self.passed} passed, {len(self.failed)} failed")
        if self.failed:
            sys.exit(1)
