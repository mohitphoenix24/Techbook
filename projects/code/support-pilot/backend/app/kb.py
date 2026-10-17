"""The help-centre articles the copilot may quote, and a small keyword search (BM25) over them.

Pure Python, no dependencies. In a real system the articles come from your help centre; the shape stays the same.
"""
# region: imports
import math
import re
from dataclasses import dataclass
# endregion: imports


@dataclass(frozen=True)
class Article:
    id: str
    title: str
    text: str


# region: articles
ARTICLES: list[Article] = [
    Article("returns", "Returns and exchanges", "You can return most items within 10 days of delivery for a full refund of the item price. The item must be unused and in its original packaging. Raise the return from your Orders page or reply to us with the order number. We arrange a free pickup."),
    Article("damaged", "Damaged, defective or wrong items", "If an item arrives damaged, defective or different from what you ordered, tell us within 30 days of delivery. We replace it or refund it in full, including shipping, and we arrange a free pickup. A photo of the item and the packaging helps us act faster."),
    Article("refunds-timeline", "When will I get my refund?", "Refunds go back to the original payment method. UPI and wallet refunds take 1 to 3 working days, cards take 5 to 7 working days, and net banking takes 3 to 5 working days. Cash on delivery refunds are sent to your bank account after you share the details. The refund starts once we receive the item or confirm the cancellation."),
    Article("cancellation", "Cancelling an order", "You can cancel an order for free until it ships, and the full amount is refunded. After it ships, it cannot be cancelled: you can refuse delivery, or return it within 10 days of delivery."),
    Article("delivery-times", "Delivery times", "Orders ship within 2 working days. Metro cities receive orders in 2 to 4 days, other cities in 4 to 7 days, and remote areas in up to 10 days. Delivery times can be longer during festive sales."),
    Article("tracking", "Tracking your order", "Once an order ships, we send a tracking link by SMS and email. If tracking says delivered but you did not receive it, check with neighbours and your building reception, then contact us within 48 hours so we can investigate with the carrier."),
    Article("payment-failed", "Payment failed or charged twice", "If money left your account but the order shows payment failed, the amount is returned automatically within 5 to 7 working days. If you were charged twice for one order, share the transaction details and our payments team will check and reply within 3 working days."),
    Article("cod", "Cash on delivery", "Cash on delivery is available for orders up to Rs 20,000 in most pin codes. Please keep the exact amount ready. A refund for a cash on delivery order is sent to your bank account after you share the details."),
    Article("warranty", "Warranty on electronics", "Electronics carry a one year manufacturer warranty from the date of delivery. For a fault under warranty, keep your invoice and contact the brand's service centre or ask us to arrange a repair."),
    Article("gift-cards-digital", "Gift cards and digital products", "Gift cards and digital products such as e-books and software keys cannot be returned or refunded once delivered. If a code does not work, contact us and we will reissue it."),
    Article("account-password", "Account and password help", "To reset your password, choose Forgot password on the sign-in page and follow the link we email you. For your safety we never ask for your password or an OTP, on any channel."),
    Article("invoice-gst", "Invoices and GST", "Your GST invoice is available from the Orders page once the order ships. To add or change a GSTIN, contact us within 7 days of placing the order."),
    Article("order-help", "Finding your order number", "Your order number looks like AUR-1234 and is in your confirmation email and on the Orders page. Please include it so we can help quickly."),
]
ARTICLE_BY_ID = {a.id: a for a in ARTICLES}
# endregion: articles


# region: bm25
STOPWORDS = set("a an and are as at be by can did do does for from has have how i if in is it its me my of on or our so that the this to was we were what when will with you your".split())


def tokens(text: str) -> list[str]:
    """Lower-case words, stop words dropped, and a crude plural fix so 'refunds' matches 'refund'."""
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]


class Index:
    def __init__(self, articles: list[Article], k1: float = 1.5, b: float = 0.75):
        self.articles, self.k1, self.b = articles, k1, b
        self.docs = [tokens(a.title + " " + a.title + " " + a.text) for a in articles]        # the title counts double
        self.avg = sum(len(d) for d in self.docs) / len(self.docs)
        df: dict[str, int] = {}
        for d in self.docs:
            for t in set(d):
                df[t] = df.get(t, 0) + 1
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def score(self, query: list[str], doc: list[str]) -> float:
        total = 0.0
        for t in set(query):
            tf = doc.count(t)
            if tf:
                total += self.idf[t] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * len(doc) / self.avg))
        return total

    def search(self, query: str, k: int = 3, min_score: float = 1.0) -> list[tuple[Article, float]]:
        q = tokens(query)
        scored = sorted(((self.score(q, d), a) for d, a in zip(self.docs, self.articles)), key=lambda x: -x[0])
        return [(a, round(s, 3)) for s, a in scored[:k] if s >= min_score]
# endregion: bm25


INDEX = Index(ARTICLES)
