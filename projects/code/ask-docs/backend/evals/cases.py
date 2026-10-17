"""Retrieval test cases: a question and a phrase that the right passage must contain.

We do not label chunk ids (they change whenever the chunk size does). We label the PHRASE that answers the question:
a retrieved passage is correct if it contains it. Out-of-scope questions have no phrase: the right behaviour is to refuse.
"""

# region: cases
ANSWERABLE: list[tuple[str, str]] = [
    ("How many days of annual leave do I get?", "24 days of paid annual leave"),
    ("How much unused leave can I carry over?", "carry over up to 6 unused days"),
    ("How long can I work from home each week?", "up to three days each week"),
    ("When do I get my expenses reimbursed?", "within 10 working days"),
    ("What is the hotel limit in metro cities?", "₹6,000 per night"),
    ("Can I buy lunch on a business trip and claim it back?", "food allowance of ₹800 per day"),          # lunch -> food: needs meaning
    ("What happens to my unused vacation days?", "carried-over days must be used by 31 March"),           # vacation -> leave
    ("How long is the notice period after probation?", "After probation it is 60 days"),
    ("Can I take time off when my father passes away?", "5 days of bereavement leave"),                  # father -> close family member
    ("How long does the battery last?", "play for up to 8 hours"),
    ("My earbud only plays on one side", "If only one earbud plays sound"),
    ("Are the earbuds waterproof?", "rated IPX4"),                                                        # waterproof -> IPX4
    ("How do I reset my earbuds?", "hold the back button for 10 seconds until the light flashes red"),
    ("I was charged twice, how do I get my money back?", "If you were charged twice"),
    ("How much is the fastest internet plan?", "Max plan gives 1 Gbps for ₹1,799"),                       # fastest -> 1 Gbps
    ("What is the fair usage limit?", "3.3 TB of data each month"),
    ("What is the late fee if I pay my bill late?", "late fee of 2 percent"),
    ("How long does the router warranty last?", "24-month warranty"),
]

OUT_OF_SCOPE: list[str] = [
    "What is the capital of France?",
    "Who won the 2011 cricket world cup?",
    "What is the CEO's salary?",
    "How do I bake a chocolate cake?",
    "What is the weather in Pune today?",
]
# endregion: cases
