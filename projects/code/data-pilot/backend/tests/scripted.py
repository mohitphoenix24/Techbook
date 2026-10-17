"""A fake model that follows a script, so tests can drive the agent loop exactly."""
from app.llm import AssistantTurn, TextDelta, ToolUse, TurnDone, Usage


def reply(text: str = "", *calls: tuple[str, dict]) -> AssistantTurn:
    uses = [ToolUse(f"toolu_{i}", name, args) for i, (name, args) in enumerate(calls, start=1)]
    content = ([{"type": "text", "text": text}] if text else []) + [{"type": "tool_use", "id": u.id, "name": u.name, "input": u.input} for u in uses]
    return AssistantTurn(text, uses, "tool_use" if uses else "end_turn", Usage(100, 20), content)


class Scripted:
    """Returns the scripted turns one by one (the last one repeats). Remembers every request it received."""

    name, model = "scripted", "scripted-1"

    def __init__(self, *turns: AssistantTurn):
        self.turns, self.requests = list(turns), []

    async def turn(self, *, system, messages, tools, max_tokens, hints=None):
        self.requests.append([dict(m) for m in messages])
        turn = self.turns.pop(0) if len(self.turns) > 1 else self.turns[0]
        if turn.text:
            yield TextDelta(turn.text)
        yield TurnDone(turn)
