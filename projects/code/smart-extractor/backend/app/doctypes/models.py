"""The contract for each kind of document: a Pydantic model.

One class gives us three things at once: the JSON Schema we hand to the model, the validation we run on what
comes back, and (via describe.py) the description the React form is drawn from.

Every field is required. Optional values are written `X | None` with no default, so the model must make an
explicit decision ("null: the document does not say") instead of silently leaving a field out.
"""
# region: base
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

TOLERANCE = 0.02          # money is rounded to cents, so allow a cent or two of difference


def close(a: float, b: float) -> bool:
    return abs(a - b) <= TOLERANCE
# endregion: base


# region: invoice
class LineItem(BaseModel):
    description: str = Field(description="What was sold, as written on the invoice")
    quantity: float = Field(gt=0, description="Number of units")
    unit_price: float = Field(ge=0, description="Price of one unit before tax, as a plain number")
    amount: float = Field(ge=0, description="Line total: quantity times unit price")

    @model_validator(mode="after")
    def line_adds_up(self):
        if not close(self.quantity * self.unit_price, self.amount):
            raise ValueError(f"quantity x unit_price is {self.quantity * self.unit_price:.2f} but amount is {self.amount:.2f}")
        return self


class Invoice(BaseModel):
    vendor: str = Field(description="Name of the company that issued the invoice")
    invoice_number: str = Field(description="The invoice number or ID exactly as printed")
    invoice_date: date = Field(description="Date of issue, as YYYY-MM-DD")
    due_date: date | None = Field(description="Payment due date as YYYY-MM-DD, or null if the document gives none")
    currency: str = Field(description="Three-letter ISO currency code such as INR, USD or EUR")
    line_items: list[LineItem] = Field(min_length=1)
    subtotal: float = Field(ge=0, description="Sum of the line amounts before tax")
    tax: float = Field(ge=0, description="Total tax (GST, VAT, sales tax); 0 if there is none")
    total: float = Field(ge=0, description="Grand total including tax")

    @field_validator("currency")
    @classmethod
    def iso_currency(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 3 or not v.isalpha():
            raise ValueError("currency must be a three-letter ISO code such as INR or USD")
        return v

    @model_validator(mode="after")
    def arithmetic_and_dates(self):
        if not close(sum(i.amount for i in self.line_items), self.subtotal):
            raise ValueError(f"line amounts add up to {sum(i.amount for i in self.line_items):.2f} but subtotal is {self.subtotal:.2f}")
        if not close(self.subtotal + self.tax, self.total):
            raise ValueError(f"subtotal + tax is {self.subtotal + self.tax:.2f} but total is {self.total:.2f}")
        if self.due_date and self.due_date < self.invoice_date:
            raise ValueError("due_date is before invoice_date")
        return self
# endregion: invoice


# region: meeting
class ActionItem(BaseModel):
    task: str = Field(description="What has to be done, in a short phrase")
    owner: str | None = Field(description="Who is responsible, or null if nobody is named")
    due_date: date | None = Field(description="Deadline as YYYY-MM-DD, or null")


class MeetingNotes(BaseModel):
    title: str = Field(description="The meeting's title or topic")
    meeting_date: date | None = Field(description="When the meeting took place, as YYYY-MM-DD, or null")
    attendees: list[str] = Field(description="Names of the people present; an empty list if none are listed")
    decisions: list[str] = Field(description="Decisions that were made, one short sentence each")
    action_items: list[ActionItem]
# endregion: meeting


# region: ticket
class SupportTicket(BaseModel):
    customer_name: str | None = Field(description="The customer's name, or null")
    customer_email: str | None = Field(description="The customer's email address, or null")
    order_id: str | None = Field(description="An order or ticket number the customer mentions, or null")
    product: str | None = Field(description="The product the message is about, or null")
    category: Literal["billing", "bug", "feature_request", "account", "other"]
    priority: Literal["low", "medium", "high", "urgent"] = Field(description="urgent = money lost or service down; high = clearly upset or blocked")
    sentiment: Literal["negative", "neutral", "positive"]
    summary: str = Field(description="One sentence, at most 200 characters, saying what the customer wants")

    @field_validator("customer_email")
    @classmethod
    def looks_like_email(cls, v: str | None) -> str | None:
        if v is not None and not (v.count("@") == 1 and "." in v.split("@")[1]):
            raise ValueError("customer_email is not a valid email address")
        return v

    @field_validator("summary")
    @classmethod
    def short_summary(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError(f"summary is {len(v)} characters; it must be at most 200")
        return v
# endregion: ticket
