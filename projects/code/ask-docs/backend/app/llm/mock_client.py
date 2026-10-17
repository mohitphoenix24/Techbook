"""An offline model for RAG. It cannot reason, but it does the one thing that makes RAG testable: it answers ONLY from
the numbered sources it is given, cites them, and says "I couldn't find that" when they do not help."""
import asyncio
import re
from collections.abc import AsyncIterator

from ..pricing import estimate_tokens
from ..rag.prompt import REFUSAL
from ..rag.text import tokenize
from .base import Completion, Message, StreamDone, TextDelta, Usage

SOURCE = re.compile(r'<source id="(\d+)" document="([^"]*)" page="(\d+)"(?: section="([^"]*)")?>\n(.*?)\n</source>', re.S)


# region: extractive
def answer_from_sources(prompt: str) -> str:
    """Pick the one or two sentences that share the most (long, rare-ish) words with the question, and cite them."""
    question = prompt.rsplit("Question:", 1)[-1].strip()
    wanted = set(tokenize(question))
    candidates = []                                                   # (score, source number, sentence)
    for n, _doc, _page, section, text in SOURCE.findall(prompt):
        for sentence in re.split(r"(?<=[.!?])\s+", " ".join(text.split())):
            overlap = wanted & set(tokenize(f"{section} {sentence}"))          # the section heading is context for the sentence
            if overlap:
                candidates.append((sum(len(w) for w in overlap), int(n), sentence.strip()))
    candidates.sort(key=lambda c: (-c[0], c[1]))
    enough = 2 if len(wanted) > 2 else 1                              # a question with real content must share a few words
    floor = 3 * enough
    if not candidates or candidates[0][0] < floor:
        return REFUSAL
    best = [c for c in candidates if c[0] >= max(floor, 0.75 * candidates[0][0])][:2]       # the best, and anything nearly as good
    return " ".join(f"{sentence} [{n}]" for _score, n, sentence in sorted(best, key=lambda c: c[1]))
# endregion: extractive


class MockClient:
    name = "mock"
    model = "mock-1"

    def __init__(self, delay_ms: int = 15):
        self._delay = delay_ms / 1000

    async def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[TextDelta | StreamDone]:
        reply = answer_from_sources(messages[-1]["content"])
        for chunk in re.findall(r"\S+\s*", reply):
            if self._delay:
                await asyncio.sleep(self._delay)
            yield TextDelta(chunk)
        prompt = estimate_tokens(system) + sum(estimate_tokens(m["content"]) for m in messages)
        yield StreamDone("end_turn", Usage(prompt, estimate_tokens(reply)))

    async def complete(self, *, system: str, messages: list[Message], max_tokens: int) -> Completion:
        """Query rewriting, offline: join the previous question and the follow-up so a keyword search sees both."""
        text = messages[-1]["content"]
        last = text.rsplit("Last question:", 1)[-1].strip()
        previous = [m for m in re.findall(r"^user: (.*)$", text, re.M)]
        rewritten = f"{previous[-1].rstrip('?')} {last}" if previous else last
        return Completion(rewritten, Usage(estimate_tokens(system + text), estimate_tokens(rewritten)))
