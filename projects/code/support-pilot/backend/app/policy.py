"""The refund and cancellation rules, as plain code.

The model writes the reply. It never decides money. Whether a customer gets a refund, how much, and whether a team lead
must approve it are decided HERE, by rules a person can read, test and change.
"""
from dataclasses import dataclass
from datetime import date

# region: constants
RETURN_WINDOW_DAYS = 10          # change-of-mind returns, counted from the delivery date
DAMAGE_WINDOW_DAYS = 30          # damaged, defective or wrong item, counted from the delivery date
AUTO_LIMIT_INR = 5000            # a refund above this needs a team lead's approval
# endregion: constants


# region: decision
@dataclass(frozen=True)
class Decision:
    action: str              # refund | cancel | deny | info | investigate
    code: str                # a short machine-readable reason, e.g. window_closed
    reason: str              # the same reason in words, for the draft and for the human reading it
    amount: int = 0          # rupees to return (refund and cancel only)
    needs_lead: bool = False
    article: str = ""        # the knowledge-base article that states this rule
# endregion: decision


def _days_since(day: str | None, today: date) -> int | None:
    return (today - date.fromisoformat(day)).days if day else None


def _refundable_total(order: dict) -> int:
    """Digital goods and gift cards are not refundable, so they are left out of the amount."""
    return round(sum(i["qty"] * i["price"] for i in order["items"] if not i.get("digital")))


# region: decide
def decide(category: str, order: dict | None, today: date, auto_limit: int = AUTO_LIMIT_INR) -> Decision:
    """One decision for one ticket. `order` is None when no order could be found for this customer."""
    if category in ("refund", "damaged", "cancellation", "delivery") and order is None:
        return Decision("info", "need_order", "We could not find an order for this customer, so ask for the order number.", article="order-help")

    if category == "delivery":
        status = order["status"]
        if status == "processing":
            return Decision("info", "not_shipped", "The order is being packed and ships within 2 working days.", article="delivery-times")
        if status == "shipped":
            return Decision("info", "in_transit", f"The order is on its way, expected by {order['eta']}.", article="tracking")
        if status == "delivered":
            return Decision("investigate", "marked_delivered", f"The carrier marked it delivered on {order['delivered_on']}. Ask the customer to check with neighbours and the building reception, then we investigate.", article="tracking")
        return Decision("info", "closed_order", f"The order is {status}.", article="tracking")

    if category == "cancellation":
        status = order["status"]
        if status == "processing":
            amount = 0 if order["payment"] == "COD" else _refundable_total(order)
            return Decision("cancel", "cancel_before_shipping", "The order has not shipped, so it can be cancelled in full.", amount, amount > auto_limit, "cancellation")
        if status == "shipped":
            return Decision("deny", "already_shipped", "The order has already shipped. The customer can refuse delivery, or return it after it arrives.", article="cancellation")
        if status == "cancelled":
            return Decision("info", "already_cancelled", "The order is already cancelled and any payment is on its way back.", article="refunds-timeline")
        return Decision("info", "use_returns", "The order is delivered, so the returns process applies.", article="returns")

    if category in ("refund", "damaged"):
        status = order["status"]
        if status in ("processing", "shipped"):
            return Decision("info", "not_delivered_yet", "The order has not been delivered yet, so there is nothing to return. It can be cancelled or refused.", article="cancellation")
        if status in ("cancelled", "returned"):
            return Decision("info", "already_refunded", f"The order is {status} and the refund is already on its way.", article="refunds-timeline")
        amount = _refundable_total(order)
        if amount == 0:
            return Decision("deny", "non_refundable_item", "Digital goods and gift cards cannot be refunded.", article="gift-cards-digital")
        days = _days_since(order["delivered_on"], today)
        window = DAMAGE_WINDOW_DAYS if category == "damaged" else RETURN_WINDOW_DAYS
        if days is not None and days > window:
            return Decision("deny", "window_closed", f"It was delivered {days} days ago and the window is {window} days.", article="damaged" if category == "damaged" else "returns")
        return Decision("refund", "within_window", f"Delivered {days} days ago, inside the {window}-day window.", amount, amount > auto_limit, "damaged" if category == "damaged" else "returns")

    if category == "payment":
        return Decision("investigate", "payment_review", "The payments team checks the transaction and replies within 3 working days.", article="payment-failed")

    if category == "account":
        return Decision("info", "account_help", "Point the customer to the password reset. Never ask for a password or an OTP.", article="account-password")

    return Decision("info", "general", "A general question: answer from the help articles, and say so plainly when the articles do not cover it.", article="")
# endregion: decide
