"""The offline "model": an extractive summariser. It writes the answer from the code it is shown, with correct citations.

It does not understand the question. It reports what the best-matching functions are, what their docstrings say, and which
of them call each other. That is enough to run and test everything around it (retrieval, citations, streaming, the
interface) without a key, and it is honest about what it is.
"""
import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any

from ..pricing import estimate_tokens
from ..rag.chunker import Chunk
from .base import Message, TextDelta, TextDone, Usage

NO_ANSWER = "I could not find anything in this repository that answers that. Try naming a function, a file, or a behaviour you are looking for."


# region: writer
def summary_of(chunk: Chunk) -> str:
    """One sentence about a chunk: its docstring, or the first line that says something."""
    if chunk.kind == "doc":                                    # a document section: the first line of text under its heading
        body = [l.strip().lstrip("*-• ").strip() for l in chunk.text.splitlines()[1:] if l.strip() and not l.strip().startswith(("```", "#", "|"))]
        return (body[0] if body else chunk.name) + ("" if not body or body[0].endswith(".") else ".")
    if chunk.doc:
        return chunk.doc if chunk.doc.endswith((".", "?", "!")) else chunk.doc + "."
    doc = re.match(r'\s*"""(.+?)(?:"""|$)', chunk.text, re.S)
    return " ".join(doc.group(1).split()) if doc else f"Code in {chunk.path}."


def mock_answer(shown: list[Chunk], simulate: str = "none") -> str:
    """An answer built from the excerpts the model was shown, citing each one by its exact line range."""
    if not shown:
        return NO_ANSWER
    names = {c.name.split(".")[-1]: c for c in shown if c.kind in ("function", "method", "class")}
    lines = ["Here is what the code says:"]
    for chunk in shown[:3]:
        label = f"`{chunk.name}`" if chunk.kind in ("function", "method", "class") else f"`{chunk.path}`"
        sentence = f"- {label} [{chunk.path}:{chunk.start}-{chunk.end}]: {summary_of(chunk)}"
        leans = [n for n in dict.fromkeys(call.split(".")[-1] for call in chunk.calls) if n in names and names[n] is not chunk]
        if leans:
            sentence += " It relies on " + " and ".join(f"`{n}`" for n in leans[:2]) + "."
        lines.append(sentence)
    text = "\n".join(lines)
    if simulate == "bad_citation":
        text += "\nThe retry schedule itself is defined in [jobq/ghost.py:10-20], and the defaults live at [jobq/models.py:900-950]."
    return text
# endregion: writer


# region: mock
class MockClient:
    name = "mock"
    model = "mock-1"

    def __init__(self, delay_ms: int = 10):
        self._delay = delay_ms / 1000

    async def stream_text(self, *, system: str, messages: list[Message], max_tokens: int,
                          hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TextDone]:
        hints = hints or {}
        text = mock_answer(hints.get("chunks", []), hints.get("simulate", "none"))
        for piece in re.findall(r"\S+\s*", text):
            if self._delay:
                await asyncio.sleep(self._delay / 3)
            yield TextDelta(piece)
        yield TextDone(text, Usage(estimate_tokens(system + json.dumps(messages)), estimate_tokens(text)))
# endregion: mock
