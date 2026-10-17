"""Labelled tickets for measuring the copilot: the demo inbox plus a few harder ones the offline model is expected to miss.

Each case says what a careful human would conclude: the category, the priority, whether a person must take over, and the
policy decision (the action, the amount, whether a team lead must approve).
"""
from app.seed import SAMPLE_TICKETS


# region: hard-cases
def _hard(email, subject, body, expect):
    return {"from_email": email, "subject": subject, "body": body, "channel": "email", "expect": expect}


HARD_CASES: list[dict] = [
    _hard("rohan.mehta@example.com", "Zip failed", "The zip on my shoes broke on the second day. This is not what I paid for. Order AUR-1002.",
          {"category": "damaged", "priority": "high", "needs_human": False, "action": "refund", "amount": 2999, "needs_lead": False}),
    _hard("kabir.singh@example.com", "Hold my order", "Please stop AUR-1004 from being dispatched, I picked the wrong colour.",
          {"category": "cancellation", "priority": "normal", "needs_human": False, "action": "cancel", "amount": 1899, "needs_lead": False}),
    _hard("anil.kapoor@example.com", "Paise kat gaye", "Paise do baar kat gaye UPI se, order ek hi hai. Jaldi check karo.",
          {"category": "payment", "priority": "high", "needs_human": False, "action": "investigate", "amount": 0, "needs_lead": False}),
    _hard("priya.nair@example.com", "Missed delivery", "The courier says an attempt was made but nobody came to my door. Order AUR-1003.",
          {"category": "delivery", "priority": "normal", "needs_human": False, "action": "info", "amount": 0, "needs_lead": False}),
    _hard("sofia.khan@example.com", "I am a journalist", "I am a journalist and I will publish my experience of this delay on order AUR-1007 if it is not resolved.",
          {"category": "delivery", "priority": "urgent", "needs_human": True, "action": "info", "amount": 0, "needs_lead": False}),
    _hard("asha.verma@example.com", "Thank you", "Love the headphones, thank you so much! Just wanted to say the sound is great.",
          {"category": "other", "priority": "low", "needs_human": False, "action": "info", "amount": 0, "needs_lead": False}),
]
# endregion: hard-cases

# region: all
CASES: list[dict] = [*SAMPLE_TICKETS, *HARD_CASES]
# endregion: all
