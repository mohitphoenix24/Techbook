"""Server-Sent Events (SSE) is a tiny text protocol: lines of `field: value`, one blank line ends an event."""
import json
from typing import Any


# region: format
def sse(event: str, data: Any) -> str:
    """Format one event. `data` is sent as a single line of JSON."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
# endregion: format


SSE_HEADERS = {
    "Cache-Control": "no-cache",       # never let a proxy or the browser cache a live stream
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",         # nginx: do not buffer, send each chunk immediately
}
