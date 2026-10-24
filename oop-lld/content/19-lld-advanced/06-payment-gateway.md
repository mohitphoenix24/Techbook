---
title: Design a Payment Gateway
level: advanced
time: 75
summary: Accept payments by card, UPI or wallet through different providers. Learn the payment state machine, idempotency keys so nobody is charged twice, a chain of fraud checks, routing with failover and a circuit breaker, a ledger, and notifications to merchants.
---

:::problem Design a Payment Gateway (Razorpay/Stripe-like core) {level=hard tags="payments,State,Strategy,idempotency,circuit breaker,ledger,Chain of Responsibility"}
Design the core of a payment gateway used by merchants. A merchant creates a payment for an amount. The customer pays by card, UPI or wallet. The gateway checks for fraud, sends the request to a bank or provider (with a backup if one fails), records the result, and tells the merchant. Merchants can **capture** an authorised payment and **refund** a captured one. Network failures and retries must never charge a customer twice.
:::

:::hint Hint
Three ideas matter most. (1) A **state machine** for the payment, so wrong transitions are impossible. (2) **Idempotency keys**, so a repeated request returns the first result. (3) A **separate provider interface**, so routing, failover and the circuit breaker can be swapped. Record the movement of money in a **double-entry ledger**.
:::

## First, some words

- **Authorise**: the bank agrees to hold the money (a hold). The money is not yet taken.
- **Capture**: take the held money for real.
- **Refund**: give money back after capture.
- **Idempotent**: doing the same request many times has the same effect as doing it once.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Methods? | card, UPI, wallet (each has its own adapter) |
| The flow? | `create`, then `authorize` (hold the money), then `capture` (take it), then optionally `refund` (full or partial). Or a direct `charge` (authorize and capture together) |
| Idempotency? | every call that changes things carries an idempotency key. A repeat returns the saved result with no new effect |
| Fraud checks? | a pipeline: amount limits, too many attempts, a blocked list. Can reject or flag |
| Providers? | several for each method. Pick by cost or success rate. **Fail over** if one is down |
| Safety against failures? | time limits, retries only when safe, a circuit breaker for each provider |
| Ledger? | every capture or refund makes balanced debit and credit entries (customer, merchant, fees) |
| Messages? | merchants get events (`payment.captured`, `refund.created`) like webhooks |
| Not needed | how card data is stored (PCI), paying out to bank accounts, disputes |

## Step 2: The life cycle of a payment

```viz algo=state title="Payment states"
state Created "Created" [initial] @0,1
state Authorized "Authorized" @1,0
state Captured "Captured" @2,0
state Refunded "Refunded" @3,0
state Failed "Failed" @1,2
state Voided "Voided" @2,2
Created -> Authorized : provider approves
Created -> Failed : declined / fraud / provider error
Authorized -> Captured : capture
Authorized -> Voided : void / expiry
Captured -> Refunded : refund (full)
Captured -> Captured : partial refund
play: provider approves, capture, partial refund, refund (full)
```

## Step 3: Find the classes

```viz algo=uml title="Payment gateway"
class PaymentGateway
  + createPayment(req: Request, idemKey: string): Result<Payment>
  + capture(id: string, idemKey: string): Result
  + refund(id: string, amount: Money, idemKey: string): Result
class Payment
  - id: string
  - merchant: string
  - amount: Money
  - captured: Money
  - refunded: Money
  - state: PaymentState
  - method: Method
interface FraudCheck
  + check(p: Request): Verdict
class AmountLimit
class VelocityCheck
class BlacklistCheck
interface Provider
  + authorize(p: Payment): ProviderResult
  + capture(p: Payment): ProviderResult
  + refund(p: Payment, m: Money): ProviderResult
class CardProvider
class UpiProvider
class Router
  + choose(method: Method): Provider[]
class CircuitBreaker
  - failures: int
  - openUntil: long
class IdempotencyStore
  - results: map<string, Result>
class Ledger
  + post(entries: Entry[]): void
interface EventListener
PaymentGateway --> FraudCheck
PaymentGateway --> Router
PaymentGateway --> IdempotencyStore
PaymentGateway --> Ledger
PaymentGateway o-- EventListener
Router --> Provider
CardProvider ..|> Provider
UpiProvider ..|> Provider
Provider --> CircuitBreaker
AmountLimit ..|> FraudCheck
VelocityCheck ..|> FraudCheck
BlacklistCheck ..|> FraudCheck
PaymentGateway *-- Payment
```

## Step 4: Design decisions

- **The payment state machine** is inside `Payment`: `authorize()`, `capture()`, `refund(m)` check the current state and the amounts (`refunded + m ≤ captured`). A wrong action returns an error. It never succeeds silently.
- **Idempotency store:** key to saved response. On a repeat, the gateway returns the **same response** and does not call the provider again. If the first try is still running, the second one waits or gets "in progress". The key belongs to (merchant, action).
- **Fraud pipeline** (Chain of Responsibility): each check says Approve, Reject(reason) or Review. The first Reject stops the payment before any provider is called.
- **Provider interface and Router:** the router gives an **ordered list** of providers for the method (by cost, success rate or rules). The gateway tries them in order. It does a **failover** on a *retryable* failure (timeout, server error), but **not** on a final decline (not enough money). Trying a decline again elsewhere risks a double charge and annoys customers.
- **A circuit breaker for each provider** (Closed, then Open after N failures in a row, then Half-open after a cool-down, then Closed again on success). It stops us from hammering a provider that is failing.
- **Ledger with double entry:** each movement takes from one account and gives to another for the same amount. All entries together always add up to zero. Fees are separate entries. The ledger only grows.
- **Events** after a state change (Observer) act like webhooks. Delivery is at-least-once with retries (the merchant must also handle repeats).
- **Amounts** are in small units (paise) with a currency code.

## Step 5: The code

```cpp run title="Idempotent payments, fraud chain, failover with circuit breaker, ledger"
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
using namespace std;

using Money = long;                                          // paise
enum class State { Created, Authorized, Captured, Refunded, Failed, Voided };
const char* name(State s) { static const char* n[] = {"CREATED", "AUTHORIZED", "CAPTURED", "REFUNDED", "FAILED", "VOIDED"}; return n[static_cast<int>(s)]; }

struct Request { string merchant; string customer; Money amount; string method; };
struct Payment { string id; Request req; State state = State::Created; Money captured = 0, refunded = 0; string provider, failure; };

// ---------- fraud pipeline ----------
struct Verdict { bool ok; string reason; };
struct FraudCheck { virtual ~FraudCheck() = default; virtual Verdict check(const Request& r) = 0; };
struct AmountLimit : FraudCheck { Money max; explicit AmountLimit(Money m) : max(m) {} Verdict check(const Request& r) override { return r.amount > max ? Verdict{false, "amount above limit"} : Verdict{true, ""}; } };
struct VelocityCheck : FraudCheck {
    map<string, int> attempts; int maxAttempts;
    explicit VelocityCheck(int m) : maxAttempts(m) {}
    Verdict check(const Request& r) override { return ++attempts[r.customer] > maxAttempts ? Verdict{false, "too many attempts"} : Verdict{true, ""}; }
};
struct Blacklist : FraudCheck { vector<string> bad; Verdict check(const Request& r) override { for (auto& b : bad) if (b == r.customer) return {false, "customer blacklisted"}; return {true, ""}; } };

// ---------- providers and the circuit breaker ----------
enum class Outcome { Approved, Declined, Unavailable };      // Unavailable = retryable (timeout / 5xx)
struct Provider {
    virtual ~Provider() = default;
    virtual string name() const = 0;
    virtual Outcome authorize(const Payment& p) = 0;
    virtual Outcome capture(const Payment&) { return Outcome::Approved; }
    virtual Outcome refund(const Payment&, Money) { return Outcome::Approved; }
};
struct ScriptedProvider : Provider {                         // behaviour is scripted so the demo is deterministic
    string n; vector<Outcome> script; size_t i = 0; int calls = 0;
    ScriptedProvider(string n, vector<Outcome> s) : n(move(n)), script(move(s)) {}
    string name() const override { return n; }
    Outcome authorize(const Payment&) override { ++calls; return i < script.size() ? script[i++] : Outcome::Approved; }
};
class CircuitBreaker {
    int failures_ = 0, threshold_; long openUntil_ = 0, cooldown_;
public:
    CircuitBreaker(int t, long c) : threshold_(t), cooldown_(c) {}
    bool allows(long now) const { return now >= openUntil_; }                // open while cooling down; then a trial call is allowed (half-open)
    void success() { failures_ = 0; openUntil_ = 0; }
    void failure(long now) { if (++failures_ >= threshold_) openUntil_ = now + cooldown_; }
    bool isOpen(long now) const { return now < openUntil_; }
};

// ---------- double-entry ledger ----------
struct LedgerEntry { string account; Money delta; string memo; };      // + credit, - debit
class Ledger {
    vector<LedgerEntry> entries_;
public:
    void post(vector<LedgerEntry> es) { Money sum = 0; for (auto& e : es) sum += e.delta; if (sum != 0) throw logic_error("unbalanced ledger posting"); for (auto& e : es) entries_.push_back(move(e)); }
    Money balance(const string& account) const { Money b = 0; for (auto& e : entries_) if (e.account == account) b += e.delta; return b; }
    Money total() const { Money s = 0; for (auto& e : entries_) s += e.delta; return s; }
    size_t size() const { return entries_.size(); }
};

struct EventListener { virtual ~EventListener() = default; virtual void onEvent(const string& event, const Payment& p) = 0; };

struct Response { bool ok; string paymentId; string message; };

class PaymentGateway {
    vector<unique_ptr<FraudCheck>> fraud_;
    vector<pair<Provider*, CircuitBreaker>> providers_;      // ordered by routing preference
    map<string, Response> idem_;                              // idempotency key -> stored response
    map<string, Payment> payments_;
    Ledger ledger_; vector<EventListener*> listeners_;
    int nextId_ = 1; long now_ = 0;
    void emit(const string& e, const Payment& p) { for (auto* l : listeners_) l->onEvent(e, p); }
public:
    void addFraud(unique_ptr<FraudCheck> f) { fraud_.push_back(move(f)); }
    void addProvider(Provider* p, int failureThreshold, long cooldown) { providers_.push_back({p, CircuitBreaker(failureThreshold, cooldown)}); }
    void listen(EventListener* l) { listeners_.push_back(l); }
    void setTime(long t) { now_ = t; }
    const Ledger& ledger() const { return ledger_; }
    State stateOf(const string& id) const { return payments_.at(id).state; }

    Response charge(const Request& req, const string& idemKey) {
        if (auto it = idem_.find(idemKey); it != idem_.end()) { Response r = it->second; r.message += " (replayed: no new charge)"; return r; }      // IDEMPOTENT
        Payment p{"pay_" + to_string(nextId_++), req};
        Response res = process(p);
        payments_[p.id] = p;
        return idem_[idemKey] = res;
    }
    Response capture(const string& id, const string& idemKey) {
        if (auto it = idem_.find(idemKey); it != idem_.end()) return it->second;
        Payment& p = payments_.at(id); Response res;
        if (p.state != State::Authorized) res = {false, id, string("cannot capture in state ") + name(p.state)};
        else {
            p.state = State::Captured; p.captured = p.req.amount;
            Money fee = p.req.amount * 2 / 100;                                                       // 2% platform fee
            ledger_.post({{"customer:" + p.req.customer, -p.req.amount, "payment " + id}, {"merchant:" + p.req.merchant, p.req.amount - fee, "payment " + id}, {"fees", fee, "fee " + id}});
            res = {true, id, "captured"}; emit("payment.captured", p);
        }
        return idem_[idemKey] = res;
    }
    Response refund(const string& id, Money amount, const string& idemKey) {
        if (auto it = idem_.find(idemKey); it != idem_.end()) return it->second;
        Payment& p = payments_.at(id); Response res;
        if (p.state != State::Captured) res = {false, id, string("cannot refund in state ") + name(p.state)};
        else if (amount <= 0 || p.refunded + amount > p.captured) res = {false, id, "refund exceeds the captured amount"};
        else {
            p.refunded += amount;
            if (p.refunded == p.captured) p.state = State::Refunded;
            ledger_.post({{"merchant:" + p.req.merchant, -amount, "refund " + id}, {"customer:" + p.req.customer, amount, "refund " + id}});
            res = {true, id, "refunded " + to_string(amount)}; emit("refund.created", p);
        }
        return idem_[idemKey] = res;
    }
private:
    Response process(Payment& p) {
        for (auto& f : fraud_) { Verdict v = f->check(p.req); if (!v.ok) { p.state = State::Failed; p.failure = v.reason; emit("payment.failed", p); return {false, p.id, "rejected: " + v.reason}; } }
        string tried;
        for (auto& [prov, breaker] : providers_) {                                                   // routing order, with failover
            if (!breaker.allows(now_)) { tried += prov->name() + "(circuit open) "; continue; }
            Outcome o = prov->authorize(p);
            if (o == Outcome::Approved) { breaker.success(); p.state = State::Authorized; p.provider = prov->name(); emit("payment.authorized", p); return {true, p.id, "authorized via " + prov->name() + (tried.empty() ? "" : "; skipped: " + tried)}; }
            if (o == Outcome::Declined) { breaker.success(); p.state = State::Failed; p.failure = "declined"; emit("payment.failed", p); return {false, p.id, "declined by " + prov->name() + " (no failover for a decline)"}; }
            breaker.failure(now_); tried += prov->name() + "(unavailable) ";                         // retryable: fail over to the next provider
        }
        p.state = State::Failed; p.failure = "all providers unavailable"; emit("payment.failed", p);
        return {false, p.id, "all providers unavailable: " + tried};
    }
};

struct Webhook : EventListener { void onEvent(const string& e, const Payment& p) override { cout << "    [webhook -> " << p.req.merchant << "] " << e << " " << p.id << " (" << name(p.state) << ")\n"; } };

int main() {
    PaymentGateway gw; Webhook hook; gw.listen(&hook);
    gw.addFraud(make_unique<AmountLimit>(5'000'000)); gw.addFraud(make_unique<VelocityCheck>(3));
    auto bl = make_unique<Blacklist>(); bl->bad.push_back("mallory"); gw.addFraud(move(bl));

    ScriptedProvider primary("PrimaryBank", {Outcome::Unavailable, Outcome::Unavailable, Outcome::Declined});
    ScriptedProvider backup("BackupBank", {});
    gw.addProvider(&primary, 2, 60); gw.addProvider(&backup, 2, 60);

    auto show = [](const char* label, const Response& r) { cout << "  " << label << ": " << (r.ok ? "OK " : "FAILED ") << r.message << "\n"; };
    Request order{"shop", "asha", 250000, "card"};           // Rs 2,500

    cout << "1) primary is down: the gateway fails over to the backup\n";
    Response r1 = gw.charge(order, "key-001"); show("charge", r1);
    cout << "2) the client times out and retries with the SAME idempotency key: no second charge\n";
    show("retry", gw.charge(order, "key-001"));
    cout << "3) capture, and retry the capture\n";
    show("capture", gw.capture(r1.paymentId, "cap-001")); show("capture again", gw.capture(r1.paymentId, "cap-001"));
    cout << "   ledger: merchant " << gw.ledger().balance("merchant:shop") << ", fees " << gw.ledger().balance("fees") << ", customer " << gw.ledger().balance("customer:asha") << "; total of all entries = " << gw.ledger().total() << " (always 0)\n";

    cout << "4) partial refund, over-refund, full refund\n";
    show("refund Rs 1,000", gw.refund(r1.paymentId, 100000, "ref-1"));
    show("refund Rs 2,000 (too much)", gw.refund(r1.paymentId, 200000, "ref-2"));
    show("refund the remaining Rs 1,500", gw.refund(r1.paymentId, 150000, "ref-3"));
    cout << "   state: " << name(gw.stateOf(r1.paymentId)) << "\n";

    cout << "5) circuit breaker: the primary failed twice, so it is skipped while open\n";
    gw.setTime(10);
    show("charge (the primary fails a second time: the circuit opens)", gw.charge({"shop", "ravi", 10000, "card"}, "key-002"));
    gw.setTime(20);
    show("charge while the circuit is open", gw.charge({"shop", "kiran", 10000, "card"}, "key-002b"));
    gw.setTime(100);                                          // cool-down is over: the primary gets a trial call (it declines)
    show("charge after cool-down", gw.charge({"shop", "meera", 10000, "card"}, "key-003"));

    cout << "6) fraud checks stop payments before any provider call\n";
    show("huge amount", gw.charge({"shop", "kiran", 9'000'000, "card"}, "key-004"));
    show("blacklisted", gw.charge({"shop", "mallory", 1000, "card"}, "key-005"));
    show("velocity: 4th attempt by one customer", [&] { Response r; for (int i = 0; i < 4; ++i) r = gw.charge({"shop", "dev", 1000, "card"}, "dev-" + to_string(i)); return r; }());
}
```

## Why each safety is there

| Problem | Safety |
|---|---|
| The client retries after a timeout, and the customer is charged twice | an **idempotency key** returns the saved result |
| Two requests with the same key at the same time | the store marks the key "in progress". The second waits or gets a conflict |
| A provider is down | **failover** to the next provider (only for retryable failures) |
| A provider that keeps failing and recovering | a **circuit breaker** stops the traffic and tests after a cool-down |
| Refunding more than was captured | the rule `refunded + amount ≤ captured` is checked in the state machine |
| Money appears or disappears | a **double-entry ledger**: postings must add up to zero |
| Lost webhooks | at-least-once delivery with retries. Events have ids so merchants can remove duplicates |
| Card testing and abuse | a fraud pipeline with limits on attempts and a blocked list |

## Edge cases

| Case | What happens |
|---|---|
| Authorised but never captured | cancel automatically after N days (a scheduled job) |
| The provider says "timeout" but really charged | check the provider's status with the same reference before trying elsewhere |
| Capturing less than was authorised | a partial capture. The rest is released |
| A different currency | amounts carry a currency. The gateway refuses or converts |
| A refund request repeated | idempotency on the refund key |
| Clock differences for the circuit breaker | use a steady clock |
| Audit | every state change is saved as an event that never changes |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "3-D Secure or OTP step" | an `Authentication` state between Created and Authorized |
| "Smart routing by success rate and cost" | the router ranks providers using live numbers (Strategy) |
| "Subscriptions and repeat billing" | a scheduler that creates payments from saved tokens |
| "Split payments, marketplaces" | ledger entries to several merchant accounts |
| "Settlements and matching records" | a nightly job that compares the ledger with provider reports |
| "PCI rules" | keep card data in a vault as tokens. The gateway sees only tokens |
| "Many regions and consistency" | keep the idempotency store and ledger in a strongly consistent database. Use the outbox pattern for events |
| "Rate limits for each merchant" | the rate limiter from the earlier lesson in front of the API |

## Short answer to say in an interview

:::interview How do you make sure a customer is never charged twice?
"Every request that changes something carries an idempotency key. The gateway stores the key with the response, so a repeat returns the saved response and does not call the provider again. The payment itself is a state machine, so a wrong action like capturing twice is refused. If a provider times out, I check its status with the same reference before trying another one. I fail over only on retryable errors, never on a final decline, and I record money in a double-entry ledger."
:::

```quiz
? What does an idempotency key promise?
- That requests are faster
+ Repeating a request with the same key returns the first result and has no new effect
- That the payment works
> It makes retries safe.
? When should the gateway fail over to another provider?
- On any failure, including a card decline
+ Only on retryable failures like timeouts. A final decline goes back to the customer
- Never
> Retrying a decline elsewhere risks a double charge and wastes tries.
```

:::keypoints
- A state machine for the payment, idempotency keys for every change, and a fraud chain before the providers.
- A provider interface, a router order, failover on retryable errors, and a circuit breaker for each provider.
- A double-entry ledger (always adds to zero), events like webhooks, and amounts in small units.
:::
