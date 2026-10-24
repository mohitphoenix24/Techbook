---
title: Design an ATM
level: easy
time: 50
summary: Insert a card, check the PIN (with a retry limit), see the balance, withdraw and deposit. Learn the State pattern for the session, a chain of handlers that gives out notes, and why the ATM should use a bank interface and not a database directly.
---

:::problem Design an ATM {level=easy tags="state machine,State pattern,Chain of Responsibility,banking"}
Design the software of an ATM. A customer inserts a card and enters a PIN (three tries are allowed). Then they can check the balance, withdraw cash or deposit cash. The ATM gives out notes of different values and must never give out more cash than it holds. It talks to a bank to check the PIN and to update balances.

:::hint Hint
The ATM is a state machine (no card, card inserted, logged in). Giving out the right notes is a chain: each handler gives as many notes of its value as it can, and passes the rest to the next handler. Keep the **bank** behind an interface.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Actions? | insert card, enter PIN, balance, withdraw, deposit, eject card |
| PIN rule? | 3 tries, then the card is kept by the machine |
| Notes? | Rs 2000, 500, 100. The ATM keeps a count of each |
| Withdrawal rules? | a positive multiple of 100, not more than the account balance, not more than the ATM's cash, and notes are chosen largest first (greedy) |
| The bank? | a separate system behind an interface (check PIN, get balance, debit, credit) |
| Threads? | one customer at a time in real life (a lock still protects the ATM's cash) |
| Not needed | receipts, card reader hardware, networking |

## Step 2: The states

```viz algo=state title="ATM lifecycle"
state NoCard "No card" [initial] @0,1
state HasCard "Card inserted" @1,1
state Authenticated "Authenticated" @2,1
NoCard -> HasCard : insert card
HasCard -> Authenticated : enter correct PIN
HasCard -> HasCard : wrong PIN (attempts left)
HasCard -> NoCard : 3 wrong PINs (card retained)
Authenticated -> NoCard : eject card
Authenticated -> Authenticated : balance / withdraw / deposit
play: withdraw, insert card, enter wrong pin, enter correct pin, withdraw, eject card
```

## Step 3: Find the classes

```viz algo=uml title="ATM: class diagram"
class ATM
  - state: AtmState
  - cash: CashDispenser
  - bank: Bank
  - card: string
  - attempts: int
  + insertCard(card: string): void
  + enterPin(pin: string): void
  + withdraw(amount: int): void
  + deposit(amount: int): void
  + balance(): void
  + eject(): void
interface AtmState
interface Bank
  + verifyPin(card: string, pin: string): bool
  + balance(card: string): long
  + debit(card: string, amount: long): bool
  + credit(card: string, amount: long): void
class CashDispenser
  - head: NoteHandler
  + canDispense(amount: int): bool
  + dispense(amount: int): void
abstract class NoteHandler
  # denomination: int
  # count: int
  # next: NoteHandler
class FakeBank
ATM o-- AtmState
ATM --> Bank
ATM *-- CashDispenser
CashDispenser *-- NoteHandler
FakeBank ..|> Bank
```

## Step 4: Design decisions

- **State pattern** for the session. If an action is not allowed in a state, we print a clear message.
- **The bank is an interface** (Dependency Inversion). Tests use a `FakeBank`. Real use has a network client.
- **Giving out notes is a chain:** `Handler(2000) → Handler(500) → Handler(100)`. **Plan first, then do it.** We first work out how many notes of each kind are needed, without taking any cash out. Only after the bank **debit** works do we take the notes from the machine. This order means a failure never loses money or notes.
- **Order of steps in withdraw:** check the amount, check the ATM's cash, debit the bank, then give out the notes. If the debit fails, no notes come out. (A real ATM also handles "debit worked but the motor jammed" by reversing the debit.)

## Step 5: The code

```cpp run title="ATM: states, chain of notes, fake bank"
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using namespace std;

// ---------- the bank (an interface; a fake for the demo) ----------
class Bank {
public:
    virtual ~Bank() = default;
    virtual bool verifyPin(const string& card, const string& pin) = 0;
    virtual long balance(const string& card) = 0;
    virtual bool debit(const string& card, long amount) = 0;
    virtual void credit(const string& card, long amount) = 0;
};
class FakeBank : public Bank {
    map<string, pair<string, long>> accounts_{{"CARD-1", {"1234", 5000}}, {"CARD-2", {"9999", 100}}};
public:
    bool verifyPin(const string& c, const string& p) override { auto it = accounts_.find(c); return it != accounts_.end() && it->second.first == p; }
    long balance(const string& c) override { return accounts_.at(c).second; }
    bool debit(const string& c, long a) override { auto& acc = accounts_.at(c); if (acc.second < a) return false; acc.second -= a; return true; }
    void credit(const string& c, long a) override { accounts_.at(c).second += a; }
};

// ---------- chain of responsibility for notes ----------
class NoteHandler {
protected:
    int denom_; int count_;
    unique_ptr<NoteHandler> next_;
public:
    NoteHandler(int d, int c) : denom_(d), count_(c) {}
    virtual ~NoteHandler() = default;
    NoteHandler* setNext(unique_ptr<NoteHandler> n) { next_ = move(n); return next_.get(); }
    // PLAN: how many notes of each denomination would be needed? (does not change anything)
    bool plan(int amount, vector<pair<int, int>>& out) const {
        int use = min(amount / denom_, count_);
        if (use > 0) out.emplace_back(denom_, use);
        int rest = amount - use * denom_;
        if (rest == 0) return true;
        return next_ && next_->plan(rest, out);
    }
    // COMMIT: remove the notes (only after the bank said yes)
    void take(int denom, int n) { if (denom_ == denom) count_ -= n; else if (next_) next_->take(denom, n); }
    int total() const { return denom_ * count_ + (next_ ? next_->total() : 0); }
};

class CashDispenser {
    unique_ptr<NoteHandler> head_;
public:
    CashDispenser(int n2000, int n500, int n100) {
        head_ = make_unique<NoteHandler>(2000, n2000);
        head_->setNext(make_unique<NoteHandler>(500, n500))->setNext(make_unique<NoteHandler>(100, n100));
    }
    bool plan(int amount, vector<pair<int, int>>& out) const { return head_->plan(amount, out); }
    void commit(const vector<pair<int, int>>& notes) { for (auto [d, n] : notes) head_->take(d, n); }
    int total() const { return head_->total(); }
};

// ---------- states ----------
class ATM;
struct AtmState {
    virtual ~AtmState() = default;
    virtual void insertCard(ATM&, const string&) { cout << "  a card is already inserted\n"; }
    virtual void enterPin(ATM&, const string&) { cout << "  insert a card first\n"; }
    virtual void withdraw(ATM&, int) { cout << "  please authenticate first\n"; }
    virtual void deposit(ATM&, int) { cout << "  please authenticate first\n"; }
    virtual void balance(ATM&) { cout << "  please authenticate first\n"; }
    virtual void eject(ATM&) { cout << "  no card to eject\n"; }
};

class ATM {
    Bank& bank_;
    CashDispenser cash_;
    AtmState* state_;
    string card_;
    int attempts_ = 0;
public:
    ATM(Bank& b, CashDispenser c);
    void insertCard(const string& c) { state_->insertCard(*this, c); }
    void enterPin(const string& p) { state_->enterPin(*this, p); }
    void withdraw(int a) { state_->withdraw(*this, a); }
    void deposit(int a) { state_->deposit(*this, a); }
    void balance() { state_->balance(*this); }
    void eject() { state_->eject(*this); }
    Bank& bank() { return bank_; }
    CashDispenser& cash() { return cash_; }
    string& card() { return card_; }
    int& attempts() { return attempts_; }
    void setState(AtmState& s) { state_ = &s; }
};

struct NoCard : AtmState { void insertCard(ATM&, const string&) override; };
struct HasCard : AtmState { void enterPin(ATM&, const string&) override; void eject(ATM&) override; };
struct Authenticated : AtmState {
    void withdraw(ATM&, int) override;
    void deposit(ATM&, int) override;
    void balance(ATM&) override;
    void eject(ATM&) override;
};
NoCard noCard; HasCard hasCard; Authenticated authenticated;
ATM::ATM(Bank& b, CashDispenser c) : bank_(b), cash_(move(c)), state_(&noCard) {}

void NoCard::insertCard(ATM& a, const string& c) { a.card() = c; a.attempts() = 0; cout << "  card accepted, enter PIN\n"; a.setState(hasCard); }
void HasCard::enterPin(ATM& a, const string& pin) {
    if (a.bank().verifyPin(a.card(), pin)) { cout << "  PIN correct\n"; a.setState(authenticated); return; }
    if (++a.attempts() >= 3) { cout << "  3 wrong PINs: card retained\n"; a.card().clear(); a.setState(noCard); }
    else cout << "  wrong PIN, " << 3 - a.attempts() << " attempt(s) left\n";
}
void HasCard::eject(ATM& a) { cout << "  card returned\n"; a.card().clear(); a.setState(noCard); }
void Authenticated::balance(ATM& a) { cout << "  balance: Rs " << a.bank().balance(a.card()) << "\n"; }
void Authenticated::deposit(ATM& a, int amount) {
    if (amount <= 0) { cout << "  invalid amount\n"; return; }
    a.bank().credit(a.card(), amount);
    cout << "  deposited Rs " << amount << "\n";
}
void Authenticated::withdraw(ATM& a, int amount) {
    if (amount <= 0 || amount % 100 != 0) { cout << "  amount must be a positive multiple of 100\n"; return; }
    vector<pair<int, int>> notes;
    if (!a.cash().plan(amount, notes)) { cout << "  ATM cannot dispense Rs " << amount << " (not enough notes)\n"; return; }      // 1. plan, no side effects
    if (!a.bank().debit(a.card(), amount)) { cout << "  insufficient balance\n"; return; }                                      // 2. debit the account
    a.cash().commit(notes);                                                                                                   // 3. only now remove the notes
    cout << "  dispensing Rs " << amount << ":";
    for (auto [d, n] : notes) cout << " " << n << "x" << d;
    cout << "\n";
}
void Authenticated::eject(ATM& a) { cout << "  card returned, goodbye\n"; a.card().clear(); a.setState(noCard); }

int main() {
    FakeBank bank;
    ATM atm(bank, CashDispenser(2, 3, 5));                 // 2x2000 + 3x500 + 5x100 = Rs 6000 in the machine

    cout << "withdraw without a card:\n"; atm.withdraw(500);
    cout << "customer 1:\n";
    atm.insertCard("CARD-1"); atm.enterPin("0000"); atm.enterPin("1234");
    atm.balance(); atm.withdraw(2700); atm.withdraw(550); atm.withdraw(9000); atm.deposit(1000); atm.balance(); atm.eject();
    cout << "customer 2 forgets the PIN:\n";
    atm.insertCard("CARD-2"); atm.enterPin("1"); atm.enterPin("2"); atm.enterPin("3");
    cout << "customer 3 has little money in the account:\n";
    atm.insertCard("CARD-2"); atm.enterPin("9999"); atm.withdraw(500); atm.eject();
}
```

## Edge cases

| Case | What happens |
|---|---|
| The amount cannot be made with the notes left (Rs 300 when only 500s remain) | `plan` fails with "cannot dispense", and the account is **not** debited |
| The ATM has less cash than the account balance | the plan checks the machine's notes first |
| The debit fails after planning | nothing was taken from the machine |
| The debit works but the motor jams | ask the bank to reverse it (extension: Command or Saga) |
| PIN retry limit | tries are counted for each card insertion. At 3, the card is kept |
| Two ATMs, one account | the bank must make `debit` safe (the bank's job) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "A daily withdrawal limit" | the bank, or a `LimitPolicy` strategy |
| "Greedy does not always work" | swap `plan` for a smarter planner (DP or backtracking) behind the same interface |
| "Different notes in different countries" | build the chain from settings |
| "Mini statement, PIN change, transfers" | new actions in the `Authenticated` state, and a log of transactions (Command) |
| "A technician refills cash" | a `Maintenance` state, and a refill method with a log |
| "Receipts and messages" | Observer events after each transaction |
| "Time out after 30 seconds idle" | pass a clock into the ATM. `tick()` ejects the card |

## Short answer to say in an interview

:::interview Why do you plan the notes before debiting the account?
"If the ATM cannot give out the exact amount, the customer's account must not be charged. So I first plan the notes without changing anything. Only after the bank debit works do I take the notes out. That way every failure leaves the system unchanged. I also keep the bank behind an interface, so tests use a fake bank."
:::

```quiz
? Why plan the notes before debiting the account?
- It is faster
+ If the ATM cannot give the amount, the customer's account must not be charged
- Banks require it
> Side effects happen only after all checks pass.
? Why is the bank an interface?
- To hide the PIN
+ Tests use a fake, real use has a real client, and the ATM does not depend on a database
- Because ATMs have many banks
> Dependency inversion keeps the ATM independent of how the bank works.
```

:::keypoints
- State pattern for the session. The bank is an interface. A chain plans the notes.
- Order of side effects: check, plan, debit, then give out the notes. A failure leaves no half-done work.
- Extensions: limits as strategies, a better change-making planner, a maintenance state, events, idle time-out.
:::
