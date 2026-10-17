"""Follow-up questions: "and for sick leave?" means nothing to a search engine. Rewrite it into a standalone question."""
import re

from ..llm.base import Usage
from .text import tokenize

FOLLOW_UP = re.compile(r"^(and|also|what about|how about|what if|why|then|so)\b|\b(it|its|that|this|they|them|those|these|he|she|there|same)\b", re.I)


# region: rewrite
def looks_like_follow_up(question: str, history: list[dict]) -> bool:
    """Cheap test, no model call: there is a conversation, and the question is a single word or points back
    ("and...", "what about...", "it", "that")."""
    return bool(history) and (len(tokenize(question)) <= 1 or bool(FOLLOW_UP.search(question)))


REWRITE_SYSTEM = (
    "Rewrite the user's last question so it can be understood without the conversation. "
    "Replace pronouns and vague references with what they refer to. Keep it short. "
    "Reply with the rewritten question only. If it is already clear, repeat it unchanged."
)


async def standalone_question(llm, question: str, history: list[dict]):
    """Return (the question to search for, the tokens the rewrite cost). Costs nothing when no rewrite is needed."""
    if not looks_like_follow_up(question, history):
        return question, Usage()                           # no model call: most questions are already standalone
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history[-6:])
    result = await llm.complete(
        system=REWRITE_SYSTEM,
        messages=[{"role": "user", "content": f"Conversation:\n{transcript}\n\nLast question: {question}"}],
        max_tokens=120,
    )
    return result.text.strip().strip('"') or question, result.usage
# endregion: rewrite
