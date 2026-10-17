"""The registry: every document type the app understands, in one place."""
from dataclasses import dataclass, field

from pydantic import BaseModel

from .models import Invoice, MeetingNotes, SupportTicket


# region: registry
@dataclass(frozen=True)
class DocType:
    id: str
    name: str
    description: str
    model: type[BaseModel]
    instructions: str            # extra rules that only apply to this kind of document
    verbatim: list[str]          # fields the model must COPY from the text (checked by grounding)
    free_text: list[str] = field(default_factory=list)   # the model's own wording: never scored by exact match in evals


DOC_TYPES: dict[str, DocType] = {
    "invoice": DocType(
        id="invoice",
        name="Invoice",
        description="A supplier invoice: vendor, dates, line items and totals.",
        model=Invoice,
        instructions=(
            "- Copy amounts as plain numbers: no currency symbols and no thousands separators.\n"
            "- tax is the total of all tax lines (GST, VAT, sales tax). Use 0 if there is no tax line.\n"
            "- line_items[].amount must equal quantity x unit_price."
        ),
        verbatim=["vendor", "invoice_number", "invoice_date", "due_date", "line_items[].description",
                  "line_items[].quantity", "line_items[].unit_price", "line_items[].amount", "subtotal", "tax", "total"],
    ),
    "meeting_notes": DocType(
        id="meeting_notes",
        name="Meeting notes",
        description="Notes from a meeting: attendees, decisions and who must do what by when.",
        model=MeetingNotes,
        instructions=(
            "- An action item needs a task. Fill owner and due_date only when the notes name them.\n"
            "- A decision is something agreed, not a discussion point."
        ),
        verbatim=["meeting_date", "attendees[]", "action_items[].owner", "action_items[].due_date"],
        free_text=["decisions[]", "action_items[].task"],
    ),
    "support_ticket": DocType(
        id="support_ticket",
        name="Support email",
        description="A customer email, turned into a ticket with a category, priority and summary.",
        model=SupportTicket,
        instructions=(
            "- priority: urgent if money was lost or a service is down, high if the customer is clearly upset or blocked, "
            "medium for ordinary problems, low for questions and suggestions.\n"
            "- summary is one sentence in your own words, at most 200 characters."
        ),
        verbatim=["customer_name", "customer_email", "order_id", "product"],
        free_text=["summary"],
    ),
}
# endregion: registry
