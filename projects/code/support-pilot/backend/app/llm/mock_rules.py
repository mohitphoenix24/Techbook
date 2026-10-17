"""The offline "model": keyword rules for triage and a template writer for replies.

It is NOT a language model. It exists so the whole pipeline (redaction, retrieval, policy, guardrails, the approval flow,
tracing and the gateway) runs and is tested with no key and no network. A real model replaces it behind the same interface
and is judged by the same evals.
"""
import re

ORDER_NUMBER = re.compile(r"\bAUR-\d{4}\b", re.I)
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
HINGLISH = {"mera", "meri", "nahi", "kab", "aayega", "abhi", "tak", "batao", "kya", "hai", "mujhe", "paisa", "wapas", "bhej", "kripya"}
NEGATIVE = ("worst", "unacceptable", "disappointed", "awful", "terrible", "angry", "useless", "cheated", "fraud", "ridiculous", "not happy", "pathetic")
POSITIVE = ("thank", "great", "love", "happy with", "wonderful", "appreciate")
LEGAL = ("consumer court", "lawyer", "legal action", "sue ", "police", "complaint to the", "legal notice")
INJECTION = ("ignore all previous", "ignore previous instructions", "system:", "you are now", "admin mode", "disregard your rules")
URGENT = ("immediately", "urgent", "asap", "urgently", "right now")

# region: triage-rules
def triage(text: str) -> dict:
    """Subject and body in, the Triage fields out. Order matters: the first category whose words appear wins."""
    low = text.lower()
    ids = list(dict.fromkeys(m.group(0).upper() for m in ORDER_NUMBER.finditer(text)))
    injected = any(p in low for p in INJECTION)
    legal = any(p in low for p in LEGAL)

    if DEVANAGARI.search(text):
        language = "hi"
    else:
        language = "hinglish" if len(HINGLISH & set(re.findall(r"[a-z]+", low))) >= 3 else "en"

    negative = sum(w in low for w in NEGATIVE)
    sentiment = "negative" if negative else "positive" if any(w in low for w in POSITIVE) else "neutral"

    if injected:
        category = "other"
    elif any(w in low for w in ("charged twice", "double charged", "payment failed", "money was deducted", "deducted twice")):
        category = "payment"
    elif any(w in low for w in ("password", "sign in", "log in", "login", "forgot my")):
        category = "account"
    elif any(w in low for w in ("damaged", "cracked", "broken", "defective", "crushed", "came off", "not working", "faulty", "wrong item", "stopped working")):
        category = "damaged"
    elif re.search(r"\bcancel\b", low):
        category = "cancellation"
    elif any(w in low for w in ("refund", "money back", "return ")):
        category = "refund"
    elif any(w in low for w in ("where is my", "not arrived", "not received", "delivery", "delivered", "tracking", "supposed to arrive", "nahi aaya", "abhi tak", "status of order")):
        category = "delivery"
    elif "?" in text and not ids:
        category = "product_question"
    else:
        category = "other"

    if injected:
        priority = "low"
    elif legal:
        priority = "urgent"
    elif category in ("damaged", "payment") or negative or any(w in low for w in URGENT):
        priority = "high"
    elif category == "product_question":
        priority = "low"
    else:
        priority = "normal"

    wants = {"refund": "Wants a refund", "damaged": "Reports a damaged or defective item", "delivery": "Asks where an order is",
             "cancellation": "Wants to cancel an order", "payment": "Has a payment problem", "account": "Cannot get into the account",
             "product_question": "Asks a question about a product", "other": "Needs a person to read this"}[category]
    summary = wants + (f" (order {ids[0]})" if ids else "") + "."
    return {"category": category, "priority": priority, "sentiment": sentiment, "language": language,
            "order_ids": ids[:5], "summary": summary[:160], "needs_human": injected or legal}
# endregion: triage-rules


# region: writer
def _money(n: int) -> str:
    return "₹" + format(n, ",")


def write_reply(facts: dict, simulate: str = "none", revision: bool = False) -> str:
    """A reply built from the facts the pipeline gathered (policy decision, order, articles). Plain templates."""
    d, order, name = facts["decision"], facts.get("order"), facts["first_name"]
    cite = f" [kb:{d['article']}]" if d.get("article") else ""
    oid = order["id"] if order else ""
    item = order["items"][0]["name"] if order else "your order"

    timeline = " UPI refunds take 1 to 3 working days and cards 5 to 7 [kb:refunds-timeline]." if "refunds-timeline" in facts.get("articles", []) else ""
    faulty = " If the item is faulty, please tell us and we will look at it under our damaged item policy [kb:damaged]." if "damaged" in facts.get("articles", []) else " If the item is faulty, please tell us."
    opening = "I am sorry about this, and I understand how frustrating it is." if facts["sentiment"] == "negative" else "Thanks for getting in touch."
    body = {
        "within_window": f"Order {oid} ({item}) was delivered on {order['delivered_on'] if order else ''}, which is inside our policy window. We can refund {_money(d['amount'])} to your original payment method once the free pickup is done.{cite}{timeline}",
        "cancel_before_shipping": (f"Order {oid} has not shipped yet, so we can cancel it. {_money(d['amount'])} goes back to your original payment method.{cite}" if d["amount"]
                                   else f"Order {oid} has not shipped yet, so we can cancel it. No payment was taken, so there is nothing to refund.{cite}"),
        "window_closed": f"Order {oid} was delivered on {order['delivered_on'] if order else ''}, which is outside our window, so we cannot offer a refund for a change of mind.{cite}{faulty}",
        "non_refundable_item": f"Digital goods such as e-books cannot be refunded once delivered.{cite} If the file or code does not work, tell us and we will reissue it.",
        "in_transit": f"Order {oid} is on its way and is expected by {order['eta'] if order else ''}.{cite} The tracking link is in the SMS and email we sent.",
        "not_shipped": f"Order {oid} is being packed and ships within 2 working days.{cite}",
        "marked_delivered": f"Our records show order {oid} was marked delivered on {order['delivered_on'] if order else ''}. Please check with your neighbours and building reception. If you still cannot find it, reply here and we will investigate with the carrier.{cite}",
        "already_refunded": f"Order {oid} is already {order['status'] if order else 'closed'} and its refund is on its way. UPI refunds take 1 to 3 working days and cards 5 to 7.{cite}",
        "already_shipped": f"Order {oid} has already shipped, so it cannot be cancelled. You can refuse delivery, or return it within 10 days of delivery.{cite}",
        "payment_review": f"Thank you for the details. Our payments team will check the transactions and reply within 3 working days. If a payment failed, the amount returns automatically in 5 to 7 working days.{cite}",
        "account_help": f"Please use Forgot password on the sign-in page and follow the link we email you.{cite} We never ask for a password or an OTP, on any channel.",
        "need_order": f"Could you share your order number? It looks like AUR-1234 and is in your confirmation email.{cite} To protect your privacy we can only discuss orders placed with the email address on your account.",
        "general": "I will check this with our product team and get back to you.",
    }.get(d["code"], f"{d['reason']}{cite}")

    text = f"Hi {name},\n\n{opening} {body}\n\nWarm regards,\nAurora Support"
    if simulate == "none" or (revision and simulate != "stubborn"):          # a revision fixes everything except a stubborn draft
        return text
    if simulate in ("overpromise", "stubborn"):
        text = text.replace("\n\nWarm regards", " We guarantee this will be sorted within minutes, 100%.\n\nWarm regards")
    if simulate == "leak" or simulate == "stubborn":
        text = text.replace("\n\nWarm regards", " We will call you on 98765 43210.\n\nWarm regards")
    if simulate == "wrong_amount" and d["amount"]:
        text = text.replace(_money(d["amount"]), _money(d["amount"] + 500))
    return text
# endregion: writer
