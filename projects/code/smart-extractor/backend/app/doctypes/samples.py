"""Example documents for each type, so the app is useful the moment it starts."""

SAMPLES: dict[str, list[dict]] = {
    "invoice": [
        {"id": "stationery", "title": "Stationery invoice (INR, GST)", "text": """TAX INVOICE
Sharma Stationers Pvt Ltd
12 MG Road, Pune 411001 | GSTIN 27AABCS1234F1Z5

Invoice No: INV-2026-0042
Invoice Date: 14 Oct 2026
Due Date: 13 Nov 2026
Bill To: Nayan Traders, Nashik

Description                 Qty     Rate      Amount
A4 Paper (500 sheets)        10   250.00    2,500.00
Ball pens (box of 50)         4   180.00      720.00
Stapler, heavy duty           2   450.00      900.00

Subtotal:        4,120.00
GST (18%):         741.60
Total:      INR  4,861.60

Payment terms: Net 30. Thank you for your business!
"""},
        {"id": "freelance", "title": "Freelance invoice (USD, sales tax)", "text": """INVOICE #7781
From: Bright Pixel Studio LLC
Date: 2026-09-02
Due: 2026-09-16

2 x Logo design (revised) @ $450.00 = $900.00
1 x Brand guidelines PDF @ $300.00 = $300.00
5 x Social media templates @ $40.00 = $200.00

Subtotal $1,400.00
Sales tax (8%) $112.00
TOTAL DUE $1,512.00 USD
"""},
    ],
    "meeting_notes": [
        {"id": "product-sync", "title": "Product sync", "text": """Product sync — 12 Oct 2026
Attendees: Asha Rao, Ravi Kulkarni, Meera Iyer, Tom Becker

We reviewed the launch checklist and the open bugs. The pricing page copy still needs a final look.

Decisions
- Launch moves to 3 November.
- We will use the new pricing page.

Action items
- Ravi to update the launch checklist by 15 Oct
- Meera: send the beta invite list (due 14 Oct)
- Tom will book the demo room
"""},
        {"id": "standup", "title": "Weekly standup", "text": """Weekly standup, 5 Oct 2026
Present: Kavya, Dev, Irfan

Decisions:
* Freeze the API on Friday

Actions:
* Dev: fix the login timeout by 9 Oct
* Kavya will share the roadmap
"""},
    ],
    "support_ticket": [
        {"id": "double-charge", "title": "Charged twice (angry)", "text": """From: Priya Nair <priya.nair@example.com>
Subject: Charged twice for order A-10492

Hi team,

I bought the Wireless Earbuds Pro last week (order A-10492) and my card was charged twice. This is the third time I am writing about it. Please refund the extra charge today, I am very upset.

Priya
"""},
        {"id": "crash", "title": "App crash (polite)", "text": """From: Rahul Mehta <rahul@example.org>
Subject: App crashes when I upload a PDF

Hello,

The mobile app crashes every time I try to upload a PDF bigger than 5 MB. I am using version 3.2 on Android. It works fine with smaller files. Could you look into it when you have time? Thanks!

Rahul
"""},
        {"id": "dark-mode", "title": "Feature request (happy)", "text": """From: Sofia Alvarez <sofia.alvarez@example.com>
Subject: Suggestion: dark mode for the dashboard

Hi! I love the dashboard, but it is very bright at night. It would be great if you added a dark mode. Thanks for the lovely product!

Sofia
"""},
    ],
}
