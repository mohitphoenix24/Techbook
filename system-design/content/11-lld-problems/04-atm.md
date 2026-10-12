---
title: Design an ATM
level: intermediate
time: 55
summary: An ATM as a state machine (idle, card inserted, authenticated) with PIN retry limits, a bank interface behind which the core banking system sits, a note-dispensing chain, and a withdrawal that debits and dispenses safely (with a reversal when the dispenser fails), implemented in C++ and JavaScript.
---

:::problem Design an ATM {level=medium tags="LLD,State,Chain of Responsibility,transactions"}
Design the software of an ATM: a customer inserts a card, enters a PIN, checks the balance or withdraws cash in multiples of 100, and takes the card back. The machine has a limited stock of notes. Handle wrong PINs, insufficient funds, and a dispenser failure after the account was debited.

:::hint Hint
The ATM's behaviour depends heavily on its current state (no card / card inserted / authenticated), so model it as a state machine. The bank is an external system behind an interface. And money must never disappear: think about what happens if the debit succeeds but the cash isn't dispensed.
:::
:::

## Requirements

- Insert card → enter PIN (3 wrong attempts **retain the card**) → choose an operation → eject card.
- Operations: **balance enquiry**, **withdrawal** (multiples of 100, up to a per-transaction limit), deposit as an extension.
- The ATM holds a limited number of ₹2000/₹500/₹200/₹100 notes and must dispense the exact amount or refuse.
- Accounts live in the **bank's** core system; the ATM talks to it over a network (it can fail).
- **Money safety**: never debit without dispensing, never dispense without debiting.

## Design

```viz algo=uml title="ATM classes"
class ATM
  - state: ATMState
  - card: Card
  - cash: CashDispenser
  - bank: BankService
  + insertCard(c: Card)
  + enterPin(pin)
  + withdraw(amount)
  + balance()
  + ejectCard()
interface ATMState
  + insertCard(atm, card)
  + enterPin(atm, pin)
  + withdraw(atm, amount)
  + ejectCard(atm)
class IdleState
class CardInsertedState
class AuthenticatedState
interface BankService
  + verifyPin(card, pin): bool
  + debit(account, amount, txnId): bool
  + reverse(txnId)
class CashDispenser
  - notes: map<int, int>
  + plan(amount): map
  + dispense(plan): bool
ATM o-- ATMState : current
IdleState ..|> ATMState
CardInsertedState ..|> ATMState
AuthenticatedState ..|> ATMState
ATM --> BankService
ATM *-- CashDispenser
```

- **State pattern** for the session: the same button (withdraw) is illegal without a card, needs a PIN first, and works only after authentication.
- **BankService** is an interface (Dependency Inversion); the real one is a network adapter to the core banking system, the test one an in-memory fake.
- **CashDispenser** computes a note plan greedily, largest note first (the chain-of-responsibility idea from the patterns module), and only commits notes if the **whole** amount can be served.

### The withdrawal: debit, dispense, and reverse on failure

```viz algo=seq title="A safe withdrawal"
participant u Customer [user]
participant a ATM [box]
participant d Dispenser [box]
participant b Bank [ext]
u -> a : withdraw 3,700
a -> d : plan(3,700) → 1×2000 + 3×500 + 1×200 | Check the notes BEFORE touching the account.
a -> b : debit(acct, 3,700, txn=T91) | Idempotent by transaction id.
b --> a : OK
a -> d : dispense(plan)
d --> a : jammed! | Hardware failure after the debit.
a -> b : reverse(T91) | Compensate, so the customer isn't charged for cash they didn't get.
a --> u : "Unable to dispense. Your account was not charged."
```

This is a **saga** in miniature (from the distributed transactions lesson): debit is one step, dispense another, and a failed dispense triggers a **compensating reversal**. Real ATMs also write each step to a journal so a power cut mid-transaction can be reconciled later.

## Implementation

:::tabs ATM with a state machine and a safe withdrawal
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Card { string number; string account; };

// ---- The bank behind an interface ----
struct BankService {
    virtual ~BankService() = default;
    virtual bool verifyPin(const Card&, const string& pin) = 0;
    virtual long balance(const string& account) = 0;
    virtual bool debit(const string& account, long amount, const string& txnId) = 0;
    virtual void reverse(const string& txnId) = 0;
};
class FakeBank : public BankService {
    map<string, long> balances_{{"ACC-1", 10000}};
    map<string, string> pins_{{"4111-0001", "1234"}};
    map<string, pair<string, long>> txns_;                       // txnId -> (account, amount): idempotency + reversal
public:
    bool verifyPin(const Card& c, const string& pin) override { return pins_[c.number] == pin; }
    long balance(const string& a) override { return balances_[a]; }
    bool debit(const string& a, long amount, const string& txnId) override {
        if (txns_.count(txnId)) return true;                      // retry of the same transaction
        if (balances_[a] < amount) return false;
        balances_[a] -= amount;
        txns_[txnId] = {a, amount};
        return true;
    }
    void reverse(const string& txnId) override {
        auto it = txns_.find(txnId);
        if (it == txns_.end()) return;
        balances_[it->second.first] += it->second.second;
        txns_.erase(it);
    }
};

// ---- Cash: plan first, then commit ----
class CashDispenser {
    map<int, int, greater<int>> notes_;                           // denomination -> count, largest first
public:
    bool jamNextDispense = false;                                 // to simulate a hardware fault
    explicit CashDispenser(map<int, int, greater<int>> notes) : notes_(std::move(notes)) {}
    optional<map<int, int, greater<int>>> plan(long amount) const {
        map<int, int, greater<int>> p;
        for (auto [note, count] : notes_) {
            int use = min<long>(amount / note, count);
            if (use) { p[note] = use; amount -= (long)use * note; }
        }
        if (amount != 0) return nullopt;                          // can't make the exact amount
        return p;
    }
    bool dispense(const map<int, int, greater<int>>& p) {
        if (jamNextDispense) { jamNextDispense = false; return false; }
        for (auto [note, count] : p) notes_[note] -= count;
        return true;
    }
};

class ATM;
struct ATMState {
    virtual ~ATMState() = default;
    virtual void insertCard(ATM&, const Card&) { cout << "  a card is already inside\n"; }
    virtual void enterPin(ATM&, const string&) { cout << "  insert a card first\n"; }
    virtual void withdraw(ATM&, long) { cout << "  not allowed now\n"; }
    virtual void showBalance(ATM&) { cout << "  not allowed now\n"; }
    virtual void ejectCard(ATM&) { cout << "  no card to eject\n"; }
};

class ATM {
public:
    ATM(BankService& bank, CashDispenser& cash);
    void insertCard(const Card& c) { state_->insertCard(*this, c); }
    void enterPin(const string& pin) { state_->enterPin(*this, pin); }
    void withdraw(long amount) { state_->withdraw(*this, amount); }
    void showBalance() { state_->showBalance(*this); }
    void ejectCard() { state_->ejectCard(*this); }
    // used by the states
    BankService& bank; CashDispenser& cash;
    optional<Card> card; int wrongPins = 0; int txnCounter = 0;
    unique_ptr<ATMState> idle, inserted, authenticated;
    ATMState* state_;
};

struct IdleState : ATMState {
    void insertCard(ATM& a, const Card& c) override { a.card = c; a.wrongPins = 0; a.state_ = a.inserted.get(); cout << "  card read, enter PIN\n"; }
};
struct CardInsertedState : ATMState {
    void enterPin(ATM& a, const string& pin) override {
        if (a.bank.verifyPin(*a.card, pin)) { a.state_ = a.authenticated.get(); cout << "  PIN ok\n"; return; }
        if (++a.wrongPins >= 3) { cout << "  wrong PIN 3 times: card retained\n"; a.card.reset(); a.state_ = a.idle.get(); return; }
        cout << "  wrong PIN, " << 3 - a.wrongPins << " attempt(s) left\n";
    }
    void ejectCard(ATM& a) override { a.card.reset(); a.state_ = a.idle.get(); cout << "  card returned\n"; }
};
struct AuthenticatedState : ATMState {
    void showBalance(ATM& a) override { cout << "  balance: Rs " << a.bank.balance(a.card->account) << "\n"; }
    void withdraw(ATM& a, long amount) override {
        if (amount <= 0 || amount % 100 != 0 || amount > 20000) { cout << "  enter a multiple of 100, up to 20,000\n"; return; }
        auto plan = a.cash.plan(amount);                                       // 1. can we pay it out?
        if (!plan) { cout << "  this ATM can't dispense Rs " << amount << " right now\n"; return; }
        string txn = "T" + to_string(++a.txnCounter);
        if (!a.bank.debit(a.card->account, amount, txn)) { cout << "  insufficient funds\n"; return; }   // 2. debit
        if (!a.cash.dispense(*plan)) {                                          // 3. dispense, or compensate
            a.bank.reverse(txn);
            cout << "  unable to dispense; your account was not charged\n";
            return;
        }
        cout << "  dispensed Rs " << amount << ":";
        for (auto [note, n] : *plan) cout << " " << n << "x" << note;
        cout << "\n";
    }
    void ejectCard(ATM& a) override { a.card.reset(); a.state_ = a.idle.get(); cout << "  card returned, thank you\n"; }
};

ATM::ATM(BankService& b, CashDispenser& c)
    : bank(b), cash(c), idle(make_unique<IdleState>()), inserted(make_unique<CardInsertedState>()),
      authenticated(make_unique<AuthenticatedState>()), state_(idle.get()) {}

int main() {
    FakeBank bank;
    CashDispenser cash({{2000, 2}, {500, 4}, {200, 5}, {100, 10}});
    ATM atm(bank, cash);
    Card card{"4111-0001", "ACC-1"};

    cout << "withdraw without a card:\n"; atm.withdraw(500);
    cout << "insert card:\n";             atm.insertCard(card);
    cout << "wrong PIN:\n";               atm.enterPin("0000");
    cout << "right PIN:\n";               atm.enterPin("1234");
    cout << "withdraw 3,700:\n";          atm.withdraw(3700);
    cout << "dispenser jams on 1,000:\n"; cash.jamNextDispense = true; atm.withdraw(1000);
    cout << "check balance:\n";           atm.showBalance();
    cout << "withdraw 50,000:\n";         atm.withdraw(50000);
    cout << "eject:\n";                   atm.ejectCard();
}
```
```js run
// ---- The bank behind an interface (a fake for the demo) ----
class FakeBank {
  #balances = new Map([["ACC-1", 10000]]);
  #pins = new Map([["4111-0001", "1234"]]);
  #txns = new Map();                                        // txnId → { account, amount }
  verifyPin(card, pin) { return this.#pins.get(card.number) === pin; }
  balance(account) { return this.#balances.get(account); }
  debit(account, amount, txnId) {
    if (this.#txns.has(txnId)) return true;                 // retry of the same transaction (idempotent)
    if (this.#balances.get(account) < amount) return false;
    this.#balances.set(account, this.#balances.get(account) - amount);
    this.#txns.set(txnId, { account, amount });
    return true;
  }
  reverse(txnId) {
    const t = this.#txns.get(txnId);
    if (!t) return;
    this.#balances.set(t.account, this.#balances.get(t.account) + t.amount);
    this.#txns.delete(txnId);
  }
}

// ---- Cash: plan first, then commit ----
class CashDispenser {
  jamNextDispense = false;
  constructor(notes) { this.notes = new Map([...notes].sort((a, b) => b[0] - a[0])); }   // largest note first
  plan(amount) {
    const p = new Map();
    for (const [note, count] of this.notes) {
      const use = Math.min(Math.floor(amount / note), count);
      if (use) { p.set(note, use); amount -= use * note; }
    }
    return amount === 0 ? p : null;                         // can't make the exact amount
  }
  dispense(plan) {
    if (this.jamNextDispense) { this.jamNextDispense = false; return false; }
    for (const [note, n] of plan) this.notes.set(note, this.notes.get(note) - n);
    return true;
  }
}

// ---- States ----
const say = (msg) => console.log("  " + msg);
class State {
  insertCard() { say("a card is already inside"); }
  enterPin() { say("insert a card first"); }
  withdraw() { say("not allowed now"); }
  showBalance() { say("not allowed now"); }
  ejectCard() { say("no card to eject"); }
}
class IdleState extends State {
  insertCard(atm, card) { atm.card = card; atm.wrongPins = 0; atm.state = atm.states.inserted; say("card read, enter PIN"); }
}
class CardInsertedState extends State {
  enterPin(atm, pin) {
    if (atm.bank.verifyPin(atm.card, pin)) { atm.state = atm.states.authenticated; return say("PIN ok"); }
    if (++atm.wrongPins >= 3) { atm.card = null; atm.state = atm.states.idle; return say("wrong PIN 3 times: card retained"); }
    say(`wrong PIN, ${3 - atm.wrongPins} attempt(s) left`);
  }
  ejectCard(atm) { atm.card = null; atm.state = atm.states.idle; say("card returned"); }
}
class AuthenticatedState extends State {
  showBalance(atm) { say(`balance: Rs ${atm.bank.balance(atm.card.account)}`); }
  withdraw(atm, amount) {
    if (amount <= 0 || amount % 100 !== 0 || amount > 20000) return say("enter a multiple of 100, up to 20,000");
    const plan = atm.cash.plan(amount);                                    // 1. can we pay it out?
    if (!plan) return say(`this ATM can't dispense Rs ${amount} right now`);
    const txn = `T${++atm.txnCounter}`;
    if (!atm.bank.debit(atm.card.account, amount, txn)) return say("insufficient funds");   // 2. debit
    if (!atm.cash.dispense(plan)) {                                         // 3. dispense, or compensate
      atm.bank.reverse(txn);
      return say("unable to dispense; your account was not charged");
    }
    say(`dispensed Rs ${amount}: ${[...plan].map(([note, n]) => `${n}x${note}`).join(" ")}`);
  }
  ejectCard(atm) { atm.card = null; atm.state = atm.states.idle; say("card returned, thank you"); }
}

class ATM {
  card = null; wrongPins = 0; txnCounter = 0;
  constructor(bank, cash) {
    Object.assign(this, { bank, cash });
    this.states = { idle: new IdleState(), inserted: new CardInsertedState(), authenticated: new AuthenticatedState() };
    this.state = this.states.idle;
  }
  insertCard(c) { this.state.insertCard(this, c); }
  enterPin(p) { this.state.enterPin(this, p); }
  withdraw(a) { this.state.withdraw(this, a); }
  showBalance() { this.state.showBalance(this); }
  ejectCard() { this.state.ejectCard(this); }
}

const cash = new CashDispenser([[2000, 2], [500, 4], [200, 5], [100, 10]]);
const atm = new ATM(new FakeBank(), cash);
const card = { number: "4111-0001", account: "ACC-1" };
console.log("withdraw without a card:"); atm.withdraw(500);
console.log("insert card:");             atm.insertCard(card);
console.log("wrong PIN:");               atm.enterPin("0000");
console.log("right PIN:");               atm.enterPin("1234");
console.log("withdraw 3,700:");          atm.withdraw(3700);
console.log("dispenser jams on 1,000:"); cash.jamNextDispense = true; atm.withdraw(1000);
console.log("check balance:");           atm.showBalance();
console.log("withdraw 50,000:");         atm.withdraw(50000);
console.log("eject:");                   atm.ejectCard();
```
:::

## Design discussion

- **Plan before debit.** Checking whether the cash can be dispensed **before** touching the account avoids most reversals.
- **Idempotent debits** (by transaction id) let the ATM safely retry a debit whose response was lost, the network lesson's ambiguous-timeout problem.
- **Compensation** (reverse) handles the hardware failing after the debit. If even the reversal call fails (network down), the journal records it, and a **reconciliation** job settles it later (banks run these daily).
- **Greedy note selection** works for Indian/US denominations but not for every set of notes (e.g. 500 and 300 can't make 600 greedily if 500 is tried first). A robust dispenser uses a small dynamic-programming search, or a "keep some smaller notes" policy.
- **Security**: the PIN is verified by the bank (the ATM never stores it), sessions time out, and card retention after 3 failures limits brute force.

| Extension | How |
|---|---|
| Deposits (cash/cheque) | a new operation in `AuthenticatedState`; deposits are credited after counting/verification |
| Session timeout | a timer event that ejects the card from any non-idle state |
| Daily withdrawal limit | checked by the bank (account rules), not the ATM |
| Out of service / low cash | an `OutOfServiceState`; refill events move back to idle |
| Receipts, mini-statements | separate operations; receipt printer as another device behind an interface |

```quiz
? Why does the ATM compute the note plan before debiting the account?
+ So it never debits for an amount it can't physically dispense, avoiding unnecessary reversals
- Because the bank requires it
- To make the transaction faster
> Check the local constraint first, then perform the remote side effect.

? The debit succeeds, then the dispenser jams. What must happen?
+ A compensating reversal of the debit (logged, and retried or reconciled if it fails)
- Nothing; the customer can call the bank
- Retry the debit
> It's a saga: a later step failed, so the earlier step is compensated.

? Which pattern prevents "withdraw" from being processed before the PIN is verified?
+ State: only AuthenticatedState implements withdraw; other states refuse it
- Observer
- Builder
> Each state decides which actions are legal.
```

:::keypoints
- Model the session as a **state machine**: Idle → CardInserted → Authenticated, with PIN retry limits and card retention.
- Put the bank behind a **BankService** interface; debits are **idempotent** by transaction id.
- **Plan** the notes first, **debit**, **dispense**, and **reverse** on failure (a mini saga), with a journal for reconciliation.
- Greedy note selection is fine for common denominations; mention its limits.
:::
