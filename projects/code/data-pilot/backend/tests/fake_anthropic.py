"""A tiny fake of the Anthropic Messages API that streams scripted turns, including tool_use blocks."""
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


def build_fake(turns: list[list[tuple]], fail_with=None) -> FastAPI:
    """turns: one list of blocks per request. A block is ("text", "...") or ("tool_use", id, name, input_dict)."""
    app = FastAPI()
    app.state.requests = []

    @app.post("/v1/messages")
    async def messages(request: Request):
        body = await request.json()
        app.state.requests.append(body)
        if fail_with:
            status, kind, message = fail_with
            return JSONResponse({"type": "error", "error": {"type": kind, "message": message}}, status_code=status)
        blocks = turns[min(len(app.state.requests) - 1, len(turns) - 1)]
        has_tool = any(b[0] == "tool_use" for b in blocks)

        async def stream():
            yield _event("message_start", {"type": "message_start", "message": {"id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"], "content": [],
                                                                                 "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 50, "output_tokens": 1}}})
            for i, block in enumerate(blocks):
                if block[0] == "text":
                    yield _event("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
                    for word in block[1].split(" "):
                        yield _event("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": word + " "}})
                else:
                    _, tool_id, name, args = block
                    yield _event("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": tool_id, "name": name, "input": {}}})
                    raw = json.dumps(args)
                    for part in (raw[: len(raw) // 2], raw[len(raw) // 2:]):                      # arguments arrive in pieces
                        yield _event("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": part}})
                yield _event("content_block_stop", {"type": "content_block_stop", "index": i})
            yield _event("message_delta", {"type": "message_delta", "delta": {"stop_reason": "tool_use" if has_tool else "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 30}})
            yield _event("message_stop", {"type": "message_stop"})

        return StreamingResponse(stream(), media_type="text/event-stream")

    return app


@contextmanager
def running_fake(turns=None, fail_with=None):
    app = build_fake(turns or [[("text", "Hello")]], fail_with)
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
