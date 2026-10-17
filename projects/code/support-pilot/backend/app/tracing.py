"""Tracing: record what a request did, step by step, with how long each step took and what it cost.

A trace is a tree of spans. When a draft is wrong or slow, the trace answers "which step, and why?" without guessing.
Pure Python with an injectable clock.
"""
# region: imports
from dataclasses import dataclass, field
from typing import Any

from .gateway import Clock
# endregion: imports


# region: span
@dataclass
class Span:
    id: int
    parent: int | None
    name: str
    start_ms: float                      # when it began, relative to the start of the trace
    duration_ms: float = 0.0
    status: str = "ok"                   # ok | error
    attrs: dict[str, Any] = field(default_factory=dict)

    def set(self, **attrs: Any) -> None:
        self.attrs.update(attrs)

    def to_dict(self) -> dict:
        return {"id": self.id, "parent": self.parent, "name": self.name, "start_ms": round(self.start_ms, 1),
                "duration_ms": round(self.duration_ms, 1), "status": self.status, "attrs": self.attrs}
# endregion: span


# region: tracer
class _SpanContext:
    def __init__(self, tracer: "Tracer", name: str, attrs: dict[str, Any]):
        self.tracer, self.name, self.attrs = tracer, name, attrs
        self.span: Span | None = None

    def __enter__(self) -> Span:
        t = self.tracer
        self.span = Span(len(t.spans) + 1, t.stack[-1].id if t.stack else None, self.name, (t.clock.now() - t.t0) * 1000, attrs=dict(self.attrs))
        t.spans.append(self.span)
        t.stack.append(self.span)
        return self.span

    def __exit__(self, exc_type, exc, tb) -> bool:
        t, span = self.tracer, self.span
        span.duration_ms = (t.clock.now() - t.t0) * 1000 - span.start_ms
        if exc is not None:
            span.status = "error"
            span.attrs["error"] = str(exc)[:200]
        t.stack.pop()
        return False                                  # never swallow the error: a trace observes, it does not decide


class Tracer:
    """One tracer per request. `with tracer.span("triage", model="x") as s: s.set(tokens=120)`."""

    def __init__(self, clock: Clock | None = None):
        self.clock = clock or Clock()
        self.t0 = self.clock.now()
        self.spans: list[Span] = []
        self.stack: list[Span] = []

    def span(self, name: str, **attrs: Any) -> _SpanContext:
        return _SpanContext(self, name, attrs)

    def summary(self) -> dict:
        """The numbers a person wants first: how long, how much, and whether anything went wrong."""
        top = [s for s in self.spans if s.parent is None]
        return {
            "spans": len(self.spans),
            "duration_ms": round(max((s.start_ms + s.duration_ms for s in self.spans), default=0.0), 1),
            "cost_usd": round(sum(s.attrs.get("cost_usd", 0) for s in self.spans), 6),
            "tokens": sum(s.attrs.get("input_tokens", 0) + s.attrs.get("output_tokens", 0) for s in self.spans),
            "errors": sum(s.status == "error" for s in self.spans),
            "stages": [s.name for s in top],
        }

    def to_list(self) -> list[dict]:
        return [s.to_dict() for s in self.spans]
# endregion: tracer
