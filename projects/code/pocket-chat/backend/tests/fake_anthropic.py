"""A tiny fake of the Anthropic Messages API (streaming), so the real SDK adapter can be tested offline.

It speaks the same server-sent-event format as api.anthropic.com, so the official SDK parses it exactly
as it would parse the real thing. It runs in a background thread on a random local port.
"""
import json
import socket
import threading
import time
from contextlib import contextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse


def _event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data)}\n\n"


def build_fake(words: list[str], fail_with: tuple[int, str, str] | None = None) -> FastAPI:
    app = FastAPI()
    app.state.requests = []

    @app.post("/v1/messages")
    async def messages(request: Request):
        body = await request.json()
        app.state.requests.append(body)
        if fail_with:
            status, kind, message = fail_with
            return JSONResponse({"type": "error", "error": {"type": kind, "message": message}}, status_code=status)

        async def stream():
            yield _event("message_start", {"type": "message_start", "message": {
                "id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"], "content": [],
                "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 21, "output_tokens": 1}}})
            yield _event("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}})
            for word in words:
                yield _event("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": word}})
            yield _event("content_block_stop", {"type": "content_block_stop", "index": 0})
            yield _event("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": len(words)}})
            yield _event("message_stop", {"type": "message_stop"})

        return StreamingResponse(stream(), media_type="text/event-stream")

    return app


@contextmanager
def running_fake(words=("Hello", " from", " the", " fake", " API"), fail_with=None):
    app = build_fake(list(words), fail_with)
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
