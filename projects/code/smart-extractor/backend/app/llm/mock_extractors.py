"""Rule-based extractors that stand in for a model when no API key is set.

These are NOT clever. They are regular expressions tuned to the sample documents and to a few common layouts,
and they fail on anything unusual, which is exactly how you will notice the difference when you switch to Claude
(the eval harness measures it). Their job is to return JSON in the same shape a real model would, so the
validation, grounding, repair loop, API and interface can all be built and tested for free.
"""
import re
from typing import Any

from ..dates import default_year, find_dates, parse_date

MONEY = r"([\d,]+(?:\.\d+)?)"


def _num(text: str) -> float:
    return float(text.replace(",", "").rstrip("."))


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _lines(text: str) -> list[str]:
    return [line.rstrip() for line in text.splitlines()]


# ----------------------------------------------------------------------------- invoices
CURRENCIES = [("₹", "INR"), ("INR", "INR"), ("Rs.", "INR"), ("€", "EUR"), ("EUR", "EUR"), ("£", "GBP"), ("GBP", "GBP"), ("$", "USD"), ("USD", "USD")]
ITEM_TABLE = re.compile(rf"^\s*(?P<d>\S.*?)\s{{2,}}(?P<q>\d+(?:\.\d+)?)\s+{MONEY}\s+{MONEY}\s*$")
ITEM_INLINE = re.compile(rf"^\s*(?P<q>\d+(?:\.\d+)?)\s*[x×]\s*(?P<d>.+?)\s*@\s*[$₹€£]?\s*{MONEY}\s*=\s*[$₹€£]?\s*{MONEY}\s*$")


def _last_number(line: str) -> float | None:
    numbers = re.findall(MONEY, line)
    return _num(numbers[-1]) if numbers else None


def extract_invoice(text: str) -> dict[str, Any]:
    lines = _lines(text)
    vendor = ""
    for line in lines:
        m = re.match(r"\s*(?:from|vendor|seller|billed by)\s*:\s*(.+)", line, re.I)
        if m:
            vendor = m.group(1).strip()
            break
    if not vendor:
        vendor = next((l.strip() for l in lines if l.strip() and "invoice" not in l.lower()), "")

    number = ""
    m = re.search(r"(?:invoice|inv)\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/_-]*)", text, re.I)
    if m:
        number = m.group(1)

    invoice_date = due_date = None
    for line in lines:
        label = line.strip().lower()
        if label.startswith("due"):
            due_date = due_date or parse_date(line)
        elif label.startswith(("invoice date", "date", "issued", "dated")):
            invoice_date = invoice_date or parse_date(line)
    if invoice_date is None:
        invoice_date = parse_date(text)

    currency = next((code for symbol, code in CURRENCIES if symbol in text), "USD")

    items = []
    for line in lines:
        m = ITEM_TABLE.match(line) or ITEM_INLINE.match(line)
        if not m:
            continue
        items.append({"description": m["d"].strip(), "quantity": _num(m["q"]), "unit_price": _num(m.group(3)), "amount": _num(m.group(4))})

    subtotal = tax = total = None
    for line in lines:
        low = line.strip().lower()
        if re.match(r"sub\s*-?\s*total", low):
            subtotal = _last_number(line)
        elif re.search(r"\b(gst|vat|tax|cgst|sgst|igst)\b", low) and "total" not in low:
            tax = (tax or 0) + (_last_number(line) or 0)
        elif re.match(r"(grand\s+)?total", low):
            total = _last_number(line)

    if subtotal is None and items:
        subtotal = round(sum(i["amount"] for i in items), 2)
    return {
        "vendor": vendor, "invoice_number": number, "invoice_date": _iso(invoice_date), "due_date": _iso(due_date),
        "currency": currency, "line_items": items,
        "subtotal": subtotal if subtotal is not None else 0.0, "tax": tax if tax is not None else 0.0,
        "total": total if total is not None else (subtotal or 0.0) + (tax or 0.0),
    }


# ----------------------------------------------------------------------------- meeting notes
HEADINGS = {"decisions": "decisions", "decision": "decisions", "action items": "actions", "actions": "actions", "action points": "actions", "next steps": "actions"}
BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$")
OWNER = re.compile(r"^(?P<owner>[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:\s+to\s+|\s*:\s*|\s+will\s+)(?P<task>.+)$")
DUE = re.compile(r"\s*[(\[]?\b(?:by|due(?: on)?|before)\b\s*:?\s*(?P<when>[^)\]]+?)[)\]]?\s*\.?$", re.I)


def extract_meeting(text: str) -> dict[str, Any]:
    lines = _lines(text)
    first = next((l for l in lines if l.strip()), "")
    year = default_year(text)
    meeting_date = parse_date(first) or parse_date(text)
    title = re.split(r"\s[—–|-]\s|,\s", first)[0].strip()

    attendees: list[str] = []
    for line in lines:
        m = re.match(r"\s*(?:attendees?|present|participants?)\s*:\s*(.+)", line, re.I)
        if m:
            attendees = [a.strip() for a in re.split(r",|\band\b", m.group(1)) if a.strip()]
            break

    section = None
    decisions: list[str] = []
    actions: list[dict] = []
    for line in lines:
        heading = line.strip().rstrip(":").lower()
        if heading in HEADINGS:
            section = HEADINGS[heading]
            continue
        bullet = BULLET.match(line)
        if not bullet or section is None:
            continue
        item = bullet.group(1)
        if section == "decisions":
            decisions.append(item.rstrip("."))
        else:
            due = None
            m = DUE.search(item)
            if m:
                found = find_dates(m.group("when"), year)
                if found:
                    due = found[0][0]
                    item = item[: m.start()].rstrip(" ,;")
            owner = None
            m = OWNER.match(item)
            if m:
                owner, item = m.group("owner"), m.group("task")
            actions.append({"task": item.rstrip("."), "owner": owner, "due_date": _iso(due)})
    return {"title": title, "meeting_date": _iso(meeting_date), "attendees": attendees, "decisions": decisions, "action_items": actions}


# ----------------------------------------------------------------------------- support emails
NEGATIVE = r"upset|angry|furious|terrible|worst|unacceptable|frustrat|disappoint|annoy|ridiculous"
URGENT = r"urgent|asap|immediately|outage|cannot access|can't access|charged twice|double charged|lost money"
HIGH = r"third time|second time|very upset|unacceptable|blocked|still not|again and again"


def extract_ticket(text: str) -> dict[str, Any]:
    name = email = None
    m = re.search(r"^from:\s*(?:\"?([^\"<\n]+?)\"?\s*)?<([^>\s]+@[^>\s]+)>", text, re.I | re.M)
    if m:
        name, email = (m.group(1) or "").strip() or None, m.group(2)
    else:
        m = re.search(r"^from:\s*([^\s<]+@[^\s>]+)", text, re.I | re.M)
        email = m.group(1) if m else None

    body = re.sub(r"^(from|subject|to|date):.*$", "", text, flags=re.I | re.M)
    low = body.lower()

    order = None
    m = re.search(r"\border\s*(?:no\.?|number|#|id)?\s*[:#]?\s*([A-Z]{1,3}-\d{3,})", text)
    if m:
        order = m.group(1)

    product = None
    m = re.search(r"\bbought\s+(?:the|a|an|my)\s+(.+?)(?:\s+(?:last|on|from|yesterday|today|and|in)\b|[,.(])", body)
    if m:
        product = m.group(1).strip()
    else:
        m = re.search(r"\b(?:the|our|your)\s+((?:[a-z]+\s)?app)\b", body, re.I)
        product = m.group(1).lower() if m else None

    if re.search(r"charge|refund|invoice|payment|billing|bill\b", low):
        category = "billing"
    elif re.search(r"crash|error|bug|not working|broken|fails?\b|stuck", low):
        category = "bug"
    elif re.search(r"would be great|suggest|feature|wish|could you add|it would be nice", low):
        category = "feature_request"
    elif re.search(r"password|log ?in|account|sign ?in|email address", low):
        category = "account"
    else:
        category = "other"

    negative = bool(re.search(NEGATIVE, low))
    if re.search(URGENT, low):
        priority = "urgent"
    elif re.search(HIGH, low) or negative:
        priority = "high"
    elif category == "feature_request":
        priority = "low"
    else:
        priority = "medium"

    if negative:
        sentiment = "negative"
    elif re.search(r"\blove|great|lovely|thank|happy|wonderful", low) and category in ("feature_request", "other"):
        sentiment = "positive"
    else:
        sentiment = "neutral"

    flat = re.sub(r"^\s*(?:hi|hello|dear|hey)\b[^,.!\n]*[,!]\s*", "", " ".join(body.split()), flags=re.I)      # drop the greeting
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", flat) if len(s.split()) >= 6]
    key = {"billing": r"charge|refund", "bug": r"crash|error|bug|fail", "feature_request": r"would be great|suggest|wish", "account": r"password|log|account"}.get(category, r"")
    summary = next((s for s in sentences if key and re.search(key, s.lower())), sentences[0] if sentences else body.strip()[:200])
    summary = (summary[:1].upper() + summary[1:])[:200]
    return {"customer_name": name, "customer_email": email, "order_id": order, "product": product,
            "category": category, "priority": priority, "sentiment": sentiment, "summary": summary}


EXTRACTORS = {"Invoice": extract_invoice, "MeetingNotes": extract_meeting, "SupportTicket": extract_ticket}


# ----------------------------------------------------------------------------- simulated model mistakes
def break_a_rule(title: str, data: dict) -> dict:
    """A mistake that VALIDATION catches: the output is well-formed but breaks a rule of the schema."""
    data = {**data}
    if title == "Invoice":
        data["total"] = round(data["total"] + 100, 2)                      # subtotal + tax no longer equals total
    elif title == "MeetingNotes" and data["action_items"]:
        data["action_items"] = [{**data["action_items"][0], "due_date": "next Friday"}, *data["action_items"][1:]]
    elif title == "SupportTicket":
        data["summary"] = (data["summary"] + " ") * 12                        # longer than 200 characters
    return data


def invent_a_value(title: str, data: dict) -> dict:
    """A mistake that only GROUNDING catches: perfectly valid, but the value is not in the document."""
    data = {**data}
    if title == "Invoice":
        data["invoice_number"] = "INV-9999-X"
    elif title == "MeetingNotes":
        data["attendees"] = [*data["attendees"], "Dr. Imaginary"]
    elif title == "SupportTicket":
        data["order_id"] = "ZZ-00000"
    return data
