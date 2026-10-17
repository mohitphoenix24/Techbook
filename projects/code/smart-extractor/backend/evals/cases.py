"""Golden cases: a document and the answer a careful person would give.

`expected` lists only the fields that have ONE right answer (names, numbers, dates, ids, categories). Free text
such as a summary is not scored by exact match: a good model words it differently every time.

Where do real cases come from? From the people who use the app: every correction saved by /review is a
(document, right answer) pair. Start with a few dozen of those.
"""
from app.doctypes.samples import SAMPLES


def sample(doc_type: str, sample_id: str) -> str:
    return next(s["text"] for s in SAMPLES[doc_type] if s["id"] == sample_id)


# region: cases
CASES: list[dict] = [
    {"id": "invoice-stationery", "doc_type": "invoice", "text": sample("invoice", "stationery"), "expected": {
        "vendor": "Sharma Stationers Pvt Ltd", "invoice_number": "INV-2026-0042", "invoice_date": "2026-10-14", "due_date": "2026-11-13",
        "currency": "INR", "subtotal": 4120.0, "tax": 741.6, "total": 4861.6,
        "line_items": [{"description": "A4 Paper (500 sheets)", "quantity": 10.0, "unit_price": 250.0, "amount": 2500.0},
                       {"description": "Ball pens (box of 50)", "quantity": 4.0, "unit_price": 180.0, "amount": 720.0},
                       {"description": "Stapler, heavy duty", "quantity": 2.0, "unit_price": 450.0, "amount": 900.0}]}},
    {"id": "invoice-freelance", "doc_type": "invoice", "text": sample("invoice", "freelance"), "expected": {
        "vendor": "Bright Pixel Studio LLC", "invoice_number": "7781", "invoice_date": "2026-09-02", "due_date": "2026-09-16",
        "currency": "USD", "subtotal": 1400.0, "tax": 112.0, "total": 1512.0,
        "line_items": [{"description": "Logo design (revised)", "quantity": 2.0, "unit_price": 450.0, "amount": 900.0},
                       {"description": "Brand guidelines PDF", "quantity": 1.0, "unit_price": 300.0, "amount": 300.0},
                       {"description": "Social media templates", "quantity": 5.0, "unit_price": 40.0, "amount": 200.0}]}},
    {"id": "meeting-product-sync", "doc_type": "meeting_notes", "text": sample("meeting_notes", "product-sync"), "expected": {
        "title": "Product sync", "meeting_date": "2026-10-12", "attendees": ["Asha Rao", "Ravi Kulkarni", "Meera Iyer", "Tom Becker"],
        "action_items": [{"task": "update the launch checklist", "owner": "Ravi", "due_date": "2026-10-15"},
                         {"task": "send the beta invite list", "owner": "Meera", "due_date": "2026-10-14"},
                         {"task": "book the demo room", "owner": "Tom", "due_date": None}]}},
    {"id": "meeting-standup", "doc_type": "meeting_notes", "text": sample("meeting_notes", "standup"), "expected": {
        "title": "Weekly standup", "meeting_date": "2026-10-05", "attendees": ["Kavya", "Dev", "Irfan"],
        "action_items": [{"task": "fix the login timeout", "owner": "Dev", "due_date": "2026-10-09"},
                         {"task": "share the roadmap", "owner": "Kavya", "due_date": None}]}},
    {"id": "ticket-double-charge", "doc_type": "support_ticket", "text": sample("support_ticket", "double-charge"), "expected": {
        "customer_name": "Priya Nair", "customer_email": "priya.nair@example.com", "order_id": "A-10492", "product": "Wireless Earbuds Pro",
        "category": "billing", "priority": "urgent", "sentiment": "negative"}},
    {"id": "ticket-crash", "doc_type": "support_ticket", "text": sample("support_ticket", "crash"), "expected": {
        "customer_name": "Rahul Mehta", "customer_email": "rahul@example.org", "order_id": None, "product": "mobile app",
        "category": "bug", "priority": "medium", "sentiment": "neutral"}},
    {"id": "ticket-dark-mode", "doc_type": "support_ticket", "text": sample("support_ticket", "dark-mode"), "expected": {
        "customer_name": "Sofia Alvarez", "customer_email": "sofia.alvarez@example.com", "order_id": None, "product": None,
        "category": "feature_request", "priority": "low", "sentiment": "positive"}},

    # Three harder documents. The rule-based offline model is expected to struggle with them; a real model should not.
    {"id": "invoice-prose-layout", "doc_type": "invoice", "text": """Moonlight Furniture Co.
Invoice: MF/26/118   Dated 7th of March 2026

3 Desk lamp, brushed brass — 1,200 each — 3,600
1 Oak side table — 8,500 each — 8,500

Total payable: ₹12,100 (inclusive of all taxes)
""", "expected": {
        "vendor": "Moonlight Furniture Co.", "invoice_number": "MF/26/118", "invoice_date": "2026-03-07", "due_date": None, "currency": "INR",
        "subtotal": 12100.0, "tax": 0.0, "total": 12100.0,
        "line_items": [{"description": "Desk lamp, brushed brass", "quantity": 3.0, "unit_price": 1200.0, "amount": 3600.0},
                       {"description": "Oak side table", "quantity": 1.0, "unit_price": 8500.0, "amount": 8500.0}]}},
    {"id": "ticket-hinglish", "doc_type": "support_ticket", "text": """From: Amit <amit.k@example.com>
Subject: paisa wapas chahiye

Bhai, mera order O-5521 late aaya aur ab refund bhi nahi mila. Kab tak milega? Bahut bura experience raha.
""", "expected": {
        "customer_name": "Amit", "customer_email": "amit.k@example.com", "order_id": "O-5521", "product": None,
        "category": "billing", "priority": "high", "sentiment": "negative"}},
    {"id": "meeting-lowercase", "doc_type": "meeting_notes", "text": """design review - 20 Oct 2026
attendees: nisha, omar, lee

actions:
- nisha to share the mockups by 22 Oct
- omar will review the copy
""", "expected": {
        "title": "design review", "meeting_date": "2026-10-20", "attendees": ["nisha", "omar", "lee"],
        "action_items": [{"task": "share the mockups", "owner": "nisha", "due_date": "2026-10-22"},
                         {"task": "review the copy", "owner": "omar", "due_date": None}]}},
]
# endregion: cases
