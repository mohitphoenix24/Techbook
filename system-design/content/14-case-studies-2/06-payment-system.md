---
title: Design a Payment System
level: advanced
time: 55
summary: Moving money correctly — the payment flow with a payment service provider (PSP), idempotency keys at every hop, a payment state machine, webhooks and retries, a double-entry ledger as the source of truth, wallets and payouts, reconciliation against PSP and bank reports, and why exactly-once is built from at-least-once plus idempotency.
---

:::problem Design a Payment System {level=hard tags="HLD,idempotency,ledger,consistency"}
Design the payment backend of an e-commerce marketplace (like Amazon or Stripe's merchants): customers pay for orders by card, the marketplace takes a fee, sellers are paid out daily. **10 M payments per day.** Money must **never** be charged twice, lost, or created from nothing, even when networks fail mid-request.

:::hint Hint
Throughput is small; correctness is everything. Every external call can time out with an unknown result, so every operation needs an **idempotency key**, a **state machine** with conditional transitions, and an append-only **double-entry ledger**. Then accept that something will still disagree and **reconcile** daily.
:::
:::

## 1. Requirements

**Functional**: pay-in (charge a customer's card for an order), refunds, the marketplace fee, seller balances and **payouts** to bank accounts, payment history.

**Non-functional**
- **Correctness**: no double charges, no lost payments, every cent accounted for (auditable).
- **Reliability**: survive timeouts, crashes and duplicate messages at every step.
- Security and compliance: never store raw card numbers (PCI DSS: use the PSP's tokens).
- Modest scale: 10 M/day ≈ **120/s** average, peaks of ~1,000/s on sale days.

## 2. The cast

- **Payment service**: our API for orders → payments; owns the state machine.
- **PSP** (payment service provider: Stripe, Adyen, Braintree…): talks to card networks; holds card data; returns tokens; sends **webhooks**.
- **Ledger**: double-entry, append-only record of every money movement; the source of truth for balances.
- **Wallet / balances**: seller balances derived from the ledger.
- **Payout service**: moves money to sellers' bank accounts.
- **Reconciliation**: compares our records with PSP and bank settlement files.

## 3. High-level design

```viz algo=arch title="Payment system" dir=down
client   Checkout | card form from PSP SDK [browser] @0,0
order    Order service [service] @1,0
paysvc   Payment service | state machine, idempotency [service*2] @2,0
pdb      Payments DB [sql] @3,0
psp      PSP | Stripe/Adyen [pay] @2,1.3
ledger   Ledger | double-entry, append-only [db] @3,1.3
payout   Payout service [worker] @4,1.3
recon    Reconciliation | nightly [clock] @4,0
bank     Banks | settlement files [ext] @5,0.6
--
client -> psp : card → token
client -> order : place order
order -> paysvc : pay(order, token, key)
paysvc -> pdb
paysvc <-> psp : charge · webhook
paysvc -> ledger : post entries
ledger -> payout : seller balances
payout -> bank : transfers
recon -> pdb
recon -> bank : compare
--
flow A card payment
client > psp : The card form is the PSP's SDK: card data goes straight to the PSP, which returns a token (we never see the number).
client > order : The customer places the order.
order > paysvc : POST /payments {orderId, token, amount} with Idempotency-Key = orderId.
paysvc > pdb : Insert payment (status: pending) — a retry with the same key returns this same payment.
paysvc > psp : Charge via the PSP, passing our payment id as the PSP's idempotency key.
psp > paysvc : The PSP answers (or, if that call timed out, a webhook arrives later): succeeded.
paysvc > ledger : Conditional transition pending → succeeded, and ledger entries: receivable +50.00 / seller −48.25 / fees −1.75.
flow Daily payouts and reconciliation
ledger > payout : Each seller's balance (from the ledger) is paid out, each payout with its own idempotency key.
payout > bank : Bank transfers are submitted.
recon > pdb : Overnight, PSP and bank settlement files are matched against our payments and ledger…
recon > bank : …mismatches (missing webhook, wrong amount, unknown charge) are fixed or escalated.
```

## 4. Deep dives

### A. Idempotency everywhere

A request can time out after the money moved. Retrying blindly double-charges; not retrying loses payments. The answer: an **idempotency key** for each logical operation, stored with its result.

- The **client → payment service** call uses the order id (or a client-generated UUID); a replay returns the stored payment instead of creating another.
- The **payment service → PSP** call passes our payment id as the PSP's idempotency key, so retrying a timed-out charge is safe.
- **Webhooks** may arrive twice or out of order: apply them through **conditional state transitions** (`pending → succeeded` only if still pending).

### B. The payment state machine

`created → pending → succeeded | failed`, then `succeeded → refunded | partially_refunded | disputed`. Every transition is a **conditional update** (`WHERE status = 'pending'`), so duplicates and races resolve deterministically. A payment stuck in `pending` (lost webhook) is resolved by **polling the PSP** after a timeout and by reconciliation.

### C. The double-entry ledger

Every money movement is recorded as **balanced entries**: debits equal credits, so money is never created or destroyed by a bug. Balances are **derived** from the ledger (or maintained alongside it in the same transaction). The ledger is **append-only**: corrections are new reversing entries, never edits, which gives a complete audit trail. Amounts are integers in the smallest currency unit (cents), never floating point.

```js run title="Idempotent payments, a double-entry ledger, and reconciliation"
// Payments core: idempotent API, a state machine, a double-entry ledger, and reconciliation with the PSP
const ledger = [];                                   // append-only: { txn, account, debit, credit }
const payments = new Map();                          // paymentId → { status, amount, merchant }
const idem = new Map();                              // idempotency key → paymentId
const pspRecords = [];                               // what the payment service provider says happened
let nextId = 1;

function post(txn, entries) {                        // every transaction must balance: Σ debits = Σ credits
  const d = entries.reduce((s, e) => s + (e.debit || 0), 0), c = entries.reduce((s, e) => s + (e.credit || 0), 0);
  if (d !== c) throw new Error(`unbalanced ${txn}: ${d} != ${c}`);
  for (const e of entries) ledger.push({ txn, ...e });
}
// assets (money owed to us) grow with debits; liabilities (owed to merchants) and revenue grow with credits
const balance = (acct) => {
  const net = ledger.filter((e) => e.account === acct).reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);
  return acct === "psp_receivable" ? net : -net;
};
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

function createPayment(key, amount, merchant) {      // POST /payments with an Idempotency-Key
  if (idem.has(key)) return { id: idem.get(key), replay: true };
  const id = `pay_${nextId++}`;
  idem.set(key, id);
  payments.set(id, { status: "pending", amount, merchant });
  return { id, replay: false };
}
function pspCharge(id, outcome) {                    // the PSP charges the card; we learn the result via webhook
  pspRecords.push({ id, amount: payments.get(id).amount, status: outcome });
}
function onWebhook(id, outcome) {                    // webhooks can arrive twice: transitions are conditional
  const p = payments.get(id);
  if (p.status !== "pending") return `ignored duplicate webhook for ${id} (${p.status})`;
  p.status = outcome;
  if (outcome === "succeeded") {
    const fee = Math.round(p.amount * 0.029) + 30;   // amounts in cents: never floats for money
    post(id, [
      { account: "psp_receivable", debit: p.amount },
      { account: `merchant:${p.merchant}`, credit: p.amount - fee },
      { account: "revenue:fees", credit: fee },
    ]);
  }
  return `${id} → ${outcome}`;
}

const a = createPayment("order-881-try1", 5000, "acme");
console.log("create:", a, " retry:", createPayment("order-881-try1", 5000, "acme"));
pspCharge(a.id, "succeeded");
console.log(onWebhook(a.id, "succeeded"));
console.log(onWebhook(a.id, "succeeded"));
const b = createPayment("order-882", 12000, "acme");
pspCharge(b.id, "succeeded");                         // our webhook for b was lost!
const c = createPayment("order-883", 800, "bolt");
pspCharge(c.id, "failed"); console.log(onWebhook(c.id, "failed"));

const show = () => ["psp_receivable", "merchant:acme", "revenue:fees"].map((x) => `${x} ${usd(balance(x))}`).join(", ");
console.log("balances:", show());
console.log("ledger sums to zero:", ledger.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0) === 0);

// Nightly reconciliation: compare our records with the PSP's settlement report
for (const r of pspRecords) {
  const ours = payments.get(r.id);
  if (ours.status !== r.status) console.log(`MISMATCH ${r.id}: we say ${ours.status}, PSP says ${r.status} → fix: ${onWebhook(r.id, r.status)}`);
}
console.log("after reconciliation:", show());
```

### D. Exactly-once is built, not given

Messages between services (payment succeeded → order paid → seller credited) use **at-least-once** delivery (outbox pattern + queue) and **idempotent consumers** (deduplicate by event id). Together they give **effectively-once** effects. Distributed transactions across the PSP, the ledger and the order service are impossible; use a **saga**: each step is idempotent, with compensations (refund) when a later step fails.

### E. Reconciliation

Even with all of the above, records drift: lost webhooks, PSP bugs, bank returns, currency rounding. Every night, match the PSP's **settlement report** and bank statements line by line against payments and the ledger. Classify mismatches (missing on our side, missing on theirs, amount differs) and fix them automatically where safe or queue them for finance operations. Reconciliation is the safety net that makes the whole system trustworthy.

### F. Payouts, risk and compliance

Payouts read seller balances from the ledger, hold back a reserve for refunds/chargebacks, and send transfers with idempotency keys; bank failures return money to the balance. Fraud checks (velocity limits, device fingerprinting, 3-D Secure) run before charging. Card data stays with the PSP (tokens only) to minimise PCI scope; everything is encrypted and access-logged.

## 5. Wrap-up

Checkout tokenises cards with the **PSP**; the **payment service** creates payments idempotently, drives a **state machine** with conditional transitions, calls the PSP with idempotency keys, and handles **webhooks** safely; every money movement is a balanced entry in an **append-only double-entry ledger**; events flow via outbox + idempotent consumers; **payouts** come from ledger balances; **nightly reconciliation** with PSP and bank reports catches the rest. Monitor stuck pending payments, webhook lag, reconciliation mismatches, ledger imbalance (must be zero), and payout failures.

```quiz
? The call to the PSP times out. What makes retrying it safe?
+ Passing the same idempotency key (our payment id), so the PSP returns the original result instead of charging again
- Waiting long enough before retrying
- Asking the customer to retry manually
> Unknown outcomes are resolved by idempotent retries or by querying the PSP.

? Why use a double-entry ledger?
+ Every transaction must balance (debits = credits), so money can't appear or vanish, and the append-only history is a complete audit trail
- It's faster than a single balance column
- Regulations require two databases
> Balances are derived from immutable, balanced entries.

? A webhook was lost and a payment is stuck in "pending" although the customer was charged. What catches it?
+ Polling the PSP for long-pending payments and nightly reconciliation against the PSP's settlement report
- Nothing; the customer must complain
- The ledger rejects it
> Reconciliation is the safety net.
```

:::keypoints
- Correctness over throughput: **idempotency keys** at every hop (client → service → PSP), **conditional state transitions** for webhooks and retries.
- A **double-entry, append-only ledger** (integer cents) is the source of truth; corrections are reversing entries.
- **Effectively-once** = at-least-once delivery (outbox) + idempotent consumers; sagas with compensations across services.
- **Reconcile** nightly with PSP and bank reports; poll for stuck payments.
- Never touch raw card data (PSP tokens); fraud checks before charging; payouts from ledger balances with reserves.
:::
