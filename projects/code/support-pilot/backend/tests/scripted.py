"""Fake model clients with scripted behaviour, for testing the gateway and triage without any model."""
import json

from app.llm.base import JsonResult, LLMError, TextDelta, TextDone, Usage

RETRYABLE = LLMError("provider_down", "The model provider had a problem.", retryable=True)


class Scripted:
    """Fails `fail` times (with `error`), then answers. Counts its calls."""

    def __init__(self, name="primary", model="claude-sonnet-5-5", fail=0, error=RETRYABLE, replies=None, text="Hello there."):
        self.name, self.model, self.fail, self.error, self.text = name, model, fail, error, text
        self.replies = list(replies or ['{"ok": true}'])
        self.calls = 0

    async def complete_json(self, *, system, messages, schema, max_tokens, hints=None):
        self.calls += 1
        if self.calls <= self.fail:
            raise self.error
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return JsonResult(reply if isinstance(reply, str) else json.dumps(reply), Usage(100, 20))

    async def stream_text(self, *, system, messages, max_tokens, hints=None):
        self.calls += 1
        if self.calls <= self.fail:
            raise self.error
        for word in self.text.split(" "):
            yield TextDelta(word + " ")
        yield TextDone(self.text, Usage(100, 20))
