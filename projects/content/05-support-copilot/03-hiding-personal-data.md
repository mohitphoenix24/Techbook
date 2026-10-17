---
title: Hiding personal data
level: advanced
time: 45
summary: Strip emails, phone numbers, card numbers, Aadhaar and UPI ids from a ticket before a model, a log or a trace can see them. Pattern order, a checksum to avoid false alarms, consistent placeholders, the limits of pattern matching, and a leak detector to guard the other end. All of it runs in your browser.
tags: privacy, PII, redaction, regular expressions, Luhn
---

A customer writes: "Charged twice! My UPI id is `anil@oksbi` and my card is `4111 1111 1111 1111`." Does the model need that card number to write a good reply? No. Does it need to know that *a card number was mentioned*? Maybe. So the right design is to **remove the secret and keep the shape of the message**, before anything else touches the text.

:::note Engineering, not legal advice
Laws such as India's Digital Personal Data Protection Act, 2023 put duties on how personal data is collected, processed, kept and shared, and your own company's rules may be stricter. This lesson shows a sound technical habit (collect less, send less, store less). It does not replace advice from your privacy or legal team.
:::

## Where personal data can leak

A ticket's text travels more places than you might think:

| Place | Risk |
|---|---|
| the **model provider** | the data leaves your systems; depending on the contract it may be retained for some time |
| **logs** | easy to forget, kept for months, readable by many people |
| **traces** and error reports | the same, and often copied to third-party tools |
| the **draft** | the model may repeat what it was given, in a message to the wrong person |
| the **database** | breached or backed up long after the ticket is closed |

The cheapest defence works at the top: **redact first**. If the text is cleaned before it enters the pipeline, every later stage (model, logs, traces) is safe by construction, instead of each needing its own care.

## Redaction, in a few lines

Five kinds of personal data, each with a pattern:

```python src="support-pilot/backend/app/redact.py" region="patterns" title="backend/app/redact.py"
```

Patterns are only half the story. Two small decisions make this reliable:

### 1. A checksum, so ordinary numbers survive

A card pattern ("13 to 19 digits") also matches tracking numbers, order references and phone numbers pasted together. Masking those would make tickets unreadable. Real card numbers satisfy a checksum called the **Luhn algorithm**, so we check it:

```python src="support-pilot/backend/app/redact.py" region="luhn" title="backend/app/redact.py"
```

Double every second digit from the right (subtracting 9 if it goes above 9), add everything up, and a real card number's total ends in 0. A random 16-digit tracking number passes only one time in ten.

### 2. Order matters, and the same value gets the same placeholder

```python src="support-pilot/backend/app/redact.py" region="redact" title="backend/app/redact.py"
```

- The **card is masked first**. If the 12-digit Aadhaar pattern ran first, it would bite a piece out of a card number and leave the rest.
- Each value gets a **numbered placeholder**: `[EMAIL_1]`, `[PHONE_2]`. The *same* value gets the *same* placeholder, so the model can still follow "[EMAIL_1] wrote twice" without knowing the address.
- `Found.original` is kept **in memory only**, for the caller who needs it. It is never logged and never stored; the store keeps only `counts()`.

## Try it

```python run src="support-pilot/backend/app/redact.py" title="Redact real-looking tickets" level=intermediate
tickets = {
    "Anil, charged twice": "I was charged twice, Rs 1,899 each time. My UPI id is anil@oksbi and the card was 4111 1111 1111 1111. Call me on +91 98765 43210.",
    "Meera, cracked watch": "Order AUR-1005 arrived cracked. Reach me at meera.iyer@example.com or 98450 12345. Same email again: meera.iyer@example.com.",
    "Tracking is not a card": "Courier tracking 1234567890123456 says delivered, order AUR-1010.",
    "An Aadhaar number": "For KYC my Aadhaar is 2345 6789 0123, please update.",
    "Nothing to hide": "My order AUR-1004 is late, please help.",
}
for title, text in tickets.items():
    result = redact(text)
    print(f"--- {title}")
    print("   before:", text)
    print("   after :", result.text)
    print("   found :", result.counts() or "nothing")

print("\nThe guard at the other end: personal data still present in a DRAFT")
for draft in ("Hi Anil, we can refund Rs 1,899 to your UPI account.", "Hi Anil, we will call you on 98765 43210 about 4111 1111 1111 1111."):
    leaks = ", ".join(find_personal_data(draft)) or "clean"
    print(f"   {leaks:<24}{draft}")
```

Look at the second line of the output for Meera: both mentions of her email became `[EMAIL_1]`, and her phone became `[PHONE_1]`. Look at "Tracking is not a card": the long number is left alone because it fails the checksum. And the draft with a phone number and a card number is flagged (the card also trips the Aadhaar pattern; the guard only needs to know that *something* is there), which leads to the last piece.

## The same patterns, pointed the other way

```python src="support-pilot/backend/app/redact.py" region="leaks" title="backend/app/redact.py"
```

`find_personal_data` reuses the patterns to **inspect text on its way out**. The model might include a phone number it was never given (invented, or copied from training data), or a person editing a draft might paste one in. Lesson 8 runs this as one of the guardrail checks, and the `/send` endpoint runs it once more at the very last moment.

Two guards (one on the way in, one on the way out) cost almost nothing and catch a whole class of embarrassing accidents.

## Honest limits

Pattern matching is not magic. Know what it will miss:

| Missed | Why | What to add |
|---|---|---|
| **names and addresses** ("Asha Verma, 14 MG Road, Pune") | no fixed shape | a name-recognition model, or at least a **customer-name list** to mask |
| a phone number written in words, or with odd spacing | patterns have limits | normalise text first; accept that some will slip |
| an Aadhaar-like 12-digit number that is really a tracking id | over-redaction | acceptable: hiding a harmless number is cheap; leaking a card is not |
| a secret hidden in an **attachment or image** | we only read text | scan attachments too, or refuse to process them |
| **hostile text that makes the patterns slow** | regular expressions can take far longer on adversarial input than on normal text (a classic denial-of-service trick) | bound the input first: the API accepts at most 4,000 characters per ticket, and a test scans worst-case text of that size in under a second |

So treat redaction as **one layer**, not the whole answer: it sits with data minimisation (do not ask for what you do not need), access control, short retention, and a contract with your model provider that matches your obligations.

## Tests

```python src="support-pilot/backend/tests/test_redact.py" region="redact-tests" title="backend/tests/test_redact.py"
```

Notice the test for the **order of patterns** ("a card is masked whole before shorter patterns can bite pieces out of it") and the test that **ordinary long numbers survive**. These are the two bugs that every first version of a redactor has, and one of them breaks tickets while the other leaks cards.

:::keypoints
- Redact first: if the text is clean at the top of the pipeline, every later stage is safe by construction.
- Keep the shape of the message: numbered placeholders let the model follow the story without the secret, and the same value gets the same placeholder.
- Use a checksum (Luhn for cards) to avoid masking ordinary long numbers; mask the longest, most specific patterns first.
- Keep originals in memory only. Store counts, never values.
- Run the same patterns as an exit guard on drafts, and once more just before sending.
- Patterns miss names and addresses. Redaction is one layer, beside minimisation, access control, retention and contracts.
:::

```quiz
? Why is the card number masked before the 12-digit Aadhaar pattern runs?
- Cards are more valuable
+ Otherwise the shorter pattern would bite a piece out of the card number and leave the rest exposed
- Alphabetical order
> The longest, most specific pattern goes first.
? A 16-digit courier tracking number is not masked. Why?
- It is a bug
+ It fails the Luhn checksum, so it is not a real card number
- Tracking numbers are never sensitive
> The checksum separates real cards from ordinary long numbers, so tickets stay readable.
? Where is the same redaction pattern used a second time?
- In the browser
+ As a guardrail on drafts leaving the system, and a last check when sending
- Nowhere
> A guard on the way out catches data the model invents or a person pastes into a draft.
```

:::exercise Add the PAN card
An Indian PAN card number looks like `ABCDE1234F` (five letters, four digits, one letter). Add a `PAN` pattern to `redact.py`, put it in the right place in the order (think about whether it could clash with anything), add the kind to `find_personal_data`, and write the tests. Then think about a false positive: what ordinary text could match five letters, four digits and a letter? How would you reduce it?
:::
