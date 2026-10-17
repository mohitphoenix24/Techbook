"""A tiny fake of the Anthropic Messages API (non-streaming), so the real SDK adapter can be tested offline."""
import json
import socket
import threading
import time
from contextlib import contextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def build_fake(reply_text: str, stop_reason: str = "end_turn", fail_with: tuple[int, str, str] | None = None) -> FastAPI:
    app = FastAPI()
    app.state.requests = []

    @app.post("/v1/messages")
    async def messages(request: Request):
        body = await request.json()
        app.state.requests.append(body)
        if fail_with:
            status, kind, message = fail_with
            return JSONResponse({"type": "error", "error": {"type": kind, "message": message}}, status_code=status)
        return {"id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"],
                "content": [{"type": "text", "text": reply_text}], "stop_reason": stop_reason, "stop_sequence": None,
                "usage": {"input_tokens": 120, "output_tokens": 45}}

    return app


@contextmanager
def running_fake(reply: dict | str = "{}", stop_reason: str = "end_turn", fail_with=None):
    text = reply if isinstance(reply, str) else json.dumps(reply)
    app = build_fake(text, stop_reason, fail_with)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.01)
    try:
        yield f"http://127.0.0.1:{port}", app
    finally:
        server.should_exit = True
        thread.join(timeout=5)
