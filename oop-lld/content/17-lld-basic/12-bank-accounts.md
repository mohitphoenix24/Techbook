---
title: Design a Bank Account System
level: easy
time: 50
summary: Savings and checking accounts with different rules, an immutable transaction history, deposit, withdraw and atomic transfer between accounts (deadlock-free), interest as a strategy, account states (active, frozen, closed) and alert listeners.
---

:::problem Design a Bank Account System {level=easy tags="banking,concurrency,transfer,Strategy,State,money"}
Design the core of a bank: customers own accounts (savings, checking). Support deposit, withdrawal and transfer between accounts, keeping a transaction history. Savings accounts earn interest and limit withdrawals; checking accounts allow a bounded overdraft. A frozen account accepts deposits but not withdrawals. Transfers must be atomic and safe when many run concurrently.

:::hint Hint
Keep the **balance rules** inside the account (so no caller can break them), make transactions **immutable records**, and lock **both** accounts when transferring, in a way that cannot deadlock.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Account kinds? | Savings (no overdraft, interest, max 3 withdrawals per month), Checking (overdraft up to Rs 5,000) |
| Operations? | deposit, withdraw, transfer, statement |
| Money? | integer paise; positive amounts only |
| History? | every successful operation appends an immutable `Transaction` (id, kind, amount, balance after) |
| States? | Active, Frozen (deposits only), Closed (nothing) |
| Interest? | monthly; the rate comes from a strategy |
| Concurrency? | many threads; transfers atomic; no deadlock |
| Alerts? | a listener is told about large withdrawals |
| Out of scope | customers/KYC, multi-currency, persistence |

## Step 2: entities

```viz algo=uml title="Bank accounts"
abstract class Account
  # id: string
  # balance: Money
  # status: Status
  # history: Transaction[]
  # lock: mutex
  + deposit(m: Money): Result
  + withdraw(m: Money): Result
  + statement(): string
  # canWithdraw(m: Money): bool
class SavingsAccount
  - withdrawalsThisMonth: int
  + addInterest(): void
class CheckingAccount
  - overdraftLimit: Money
class Transaction
  - id: long
  - kind: TxKind
  - amount: Money
  - balanceAfter: Money
interface InterestStrategy
  + monthlyInterest(balance: Money): Money
class FlatRate
class TieredRate
interface AccountListener
  + onLargeWithdrawal(a: string, m: Money): void
class Bank
  + transfer(from: Account, to: Account, m: Money): Result
SavingsAccount --|> Account
CheckingAccount --|> Account
Account *-- Transaction
SavingsAccount --> InterestStrategy
FlatRate ..|> InterestStrategy
TieredRate ..|> InterestStrategy
Account o-- AccountListener
Bank ..> Account
```

## Step 3: design decisions

- **Template Method** in `Account`: `withdraw` does the common checks (state, amount > 0), then asks the subclass `canWithdraw(m)` for its specific rule (savings: monthly limit and no overdraft; checking: balance + overdraft).
- **Transactions are immutable value records**; the history is append-only. The balance can be re-derived from it (useful for audit).
- **Interest** is a `InterestStrategy`, so a tiered or promotional rate is a new class.
- **Status** (Active/Frozen/Closed) is an enum checked in the template method (a full State pattern is warranted only if each status has lots of behaviour).
- **Transfer**: lock **both** accounts with `scoped_lock` (deadlock-free), validate, apply both legs, record both transactions. If the debit succeeds but the credit cannot (closed destination), **nothing** changes: checks happen before any change, under the locks.
- **Listeners** (Observer) for compliance alerts, called **after** releasing locks to avoid calling out under a lock.

## Step 4: the code

```cpp run title="Accounts, interest strategies, and concurrent transfers"
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

using Money = long;                                         // paise (a real system would use the Money type)
enum class Status { Active, Frozen, Closed };
enum class TxKind { Deposit, Withdrawal, TransferIn, TransferOut, Interest };
const char* name(TxKind k) { static const char* n[] = {"deposit", "withdrawal", "transfer-in", "transfer-out", "interest"}; return n[static_cast<int>(k)]; }

struct Transaction { long id; TxKind kind; Money amount; Money balanceAfter; };

struct AccountListener { virtual ~AccountListener() = default; virtual void onLargeWithdrawal(const string& account, Money amount) = 0; };
struct PrintListener : AccountListener { void onLargeWithdrawal(const string& a, Money m) override { cout << "  [alert] large withdrawal on " << a << ": Rs " << m / 100 << "\n"; } };

struct InterestStrategy { virtual ~InterestStrategy() = default; virtual Money monthlyInterest(Money balance) const = 0; };
struct FlatRate : InterestStrategy {
    int bpYear; explicit FlatRate(int basisPointsPerYear) : bpYear(basisPointsPerYear) {}
    Money monthlyInterest(Money b) const override { return b * bpYear / 10000 / 12; }
};
struct TieredRate : InterestStrategy {                      // 2% up to Rs 1 lakh, 3% above
    Money monthlyInterest(Money b) const override { Money low = min(b, 10'000'000L), high = b - low; return (low * 200 + high * 300) / 10000 / 12; }
};

class Account {
protected:
    string id_;
    Money balance_ = 0;
    Status status_ = Status::Active;
    vector<Transaction> history_;
    mutable mutex m_;
    static inline long nextTx_ = 1;                          // (guarded by account locks in this demo; real systems use a DB sequence)
    AccountListener* listener_ = nullptr;
    friend class Bank;

    virtual bool canWithdraw(Money amount, string& why) const = 0;     // the subclass-specific rule
    virtual void onWithdrawn() {}
    void record(TxKind k, Money amount) { history_.push_back({nextTx_++, k, amount, balance_}); }
public:
    explicit Account(string id) : id_(move(id)) {}
    virtual ~Account() = default;
    const string& id() const { return id_; }
    void setListener(AccountListener* l) { listener_ = l; }
    void setStatus(Status s) { lock_guard l(m_); status_ = s; }
    Money balance() const { lock_guard l(m_); return balance_; }
    size_t transactions() const { lock_guard l(m_); return history_.size(); }

    bool deposit(Money amount, string& why) {
        if (amount <= 0) { why = "amount must be positive"; return false; }
        lock_guard l(m_);
        if (status_ == Status::Closed) { why = "account closed"; return false; }
        balance_ += amount; record(TxKind::Deposit, amount);
        return true;
    }
    bool withdraw(Money amount, string& why) {
        bool large = false;
        {
            lock_guard l(m_);
            if (!checkWithdrawLocked(amount, why)) return false;
            balance_ -= amount; record(TxKind::Withdrawal, amount); onWithdrawn();
            large = amount >= 5'000'000;
        }
        if (large && listener_) listener_->onLargeWithdrawal(id_, amount);      // notify AFTER releasing the lock
        return true;
    }
protected:
    bool checkWithdrawLocked(Money amount, string& why) const {             // template method: common checks, then the subclass rule
        if (amount <= 0) { why = "amount must be positive"; return false; }
        if (status_ != Status::Active) { why = status_ == Status::Frozen ? "account frozen" : "account closed"; return false; }
        return canWithdraw(amount, why);
    }
};

class SavingsAccount : public Account {
    unique_ptr<InterestStrategy> interest_;
    int withdrawalsThisMonth_ = 0;
    static constexpr int kMaxWithdrawals = 3;
    bool canWithdraw(Money amount, string& why) const override {
        if (withdrawalsThisMonth_ >= kMaxWithdrawals) { why = "monthly withdrawal limit reached"; return false; }
        if (amount > balance_) { why = "insufficient funds (no overdraft on savings)"; return false; }
        return true;
    }
    void onWithdrawn() override { ++withdrawalsThisMonth_; }
public:
    SavingsAccount(string id, Money opening, unique_ptr<InterestStrategy> i) : Account(move(id)), interest_(move(i)) { balance_ = opening; }
    void addInterest() { lock_guard l(m_); Money i = interest_->monthlyInterest(balance_); balance_ += i; record(TxKind::Interest, i); withdrawalsThisMonth_ = 0; }
};

class CheckingAccount : public Account {
    Money overdraft_;
    bool canWithdraw(Money amount, string& why) const override {
        if (balance_ + overdraft_ < amount) { why = "exceeds balance plus overdraft"; return false; }
        return true;
    }
public:
    CheckingAccount(string id, Money opening, Money overdraft) : Account(move(id)), overdraft_(overdraft) { balance_ = opening; }
};

class Bank {
public:
    // Atomic transfer: both accounts locked together (deadlock-free); all checks before any change.
    static bool transfer(Account& from, Account& to, Money amount, string& why) {
        if (&from == &to) { why = "same account"; return false; }
        scoped_lock lock(from.m_, to.m_);
        if (!from.checkWithdrawLocked(amount, why)) return false;
        if (to.status_ == Status::Closed) { why = "destination closed"; return false; }
        from.balance_ -= amount; from.record(TxKind::TransferOut, amount); from.onWithdrawn();
        to.balance_ += amount;   to.record(TxKind::TransferIn, amount);
        return true;
    }
};

int main() {
    PrintListener alerts;
    SavingsAccount sav("SAV-1", 1'000'000, make_unique<FlatRate>(400));       // Rs 10,000 at 4% a year
    CheckingAccount chk("CHK-1", 200'000, 500'000);                           // Rs 2,000 with a Rs 5,000 overdraft
    sav.setListener(&alerts); chk.setListener(&alerts);
    string why;
    auto show = [&](const char* what, bool ok) { cout << "  " << what << ": " << (ok ? "ok" : "refused (" + why + ")") << "\n"; };

    cout << "checking account:\n";
    show("withdraw Rs 6,000 (balance 2,000 + overdraft)", chk.withdraw(600'000, why));
    show("withdraw Rs 2,000 more (beyond the overdraft)", chk.withdraw(200'000, why));
    cout << "  balance now Rs " << chk.balance() / 100 << "\n";

    cout << "savings account:\n";
    for (int i = 1; i <= 4; ++i) show(("withdrawal #" + to_string(i) + " of Rs 100").c_str(), sav.withdraw(10'000, why));
    sav.addInterest();
    cout << "  after monthly interest: Rs " << sav.balance() / 100.0 << ", withdrawal counter reset\n";
    sav.setStatus(Status::Frozen);
    show("deposit into a frozen account", sav.deposit(5000, why));
    show("withdraw from a frozen account", sav.withdraw(100, why));
    sav.setStatus(Status::Active);

    cout << "concurrent transfers in both directions (deadlock-free):\n";
    CheckingAccount a("A", 1'000'000, 0), b("B", 1'000'000, 0);
    vector<thread> ts;
    for (int t = 0; t < 4; ++t) {
        ts.emplace_back([&] { string w; for (int i = 0; i < 500; ++i) Bank::transfer(a, b, 100, w); });
        ts.emplace_back([&] { string w; for (int i = 0; i < 500; ++i) Bank::transfer(b, a, 100, w); });
    }
    for (auto& t : ts) t.join();
    cout << "  total money: Rs " << (a.balance() + b.balance()) / 100 << " (must be 20000), transactions recorded: " << a.transactions() + b.transactions() << " (expected 8000)\n";

    cout << "large withdrawal triggers an alert:\n";
    CheckingAccount rich("RICH", 20'000'000, 0); rich.setListener(&alerts);
    show("withdraw Rs 60,000", rich.withdraw(6'000'000, why));
}
```

## Edge cases

| Case | Handling |
|---|---|
| Negative or zero amounts | rejected in the template method |
| Transfer to the same account | rejected up front (locking the same mutex twice is undefined) |
| Destination closed | checked **before** any balance changes, so nothing moves |
| Two transfers in opposite directions | `scoped_lock` acquires both mutexes without deadlock |
| Interest on an overdrawn balance | `monthlyInterest` returns 0 for negative balances (add the rule) |
| Listener throws | catch and log so a failing alert cannot break banking |
| Money type | `long` paise here; use a `Money` class in real code |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "New account type (fixed deposit)" | a subclass with its own `canWithdraw` (penalty for early withdrawal) |
| "Daily withdrawal limit across accounts" | a `LimitPolicy` checked by the bank service |
| "Scheduled/standing transfers" | **Command** objects in a scheduler |
| "Persist to a database with transactions" | an `AccountRepository` plus Unit of Work; DB transactions replace in-process locks |
| "Distributed banks" | two-phase commit or the saga pattern with compensation (HLD) |
| "Audit and reconciliation" | the append-only history lets you recompute the balance and compare |
| "Idempotent retries" | each request carries an id; the account ignores a repeated id |

```quiz
? Why does transfer use scoped_lock on both accounts?
- To make it faster
+ Locking both together avoids the deadlock of two opposite transfers each holding one lock
- Because accounts are immutable
> scoped_lock uses a deadlock-avoidance algorithm.
? Why must all checks happen before any balance changes in transfer?
- For readability
+ If the credit fails after the debit, money disappears; validating first keeps it all-or-nothing
- To avoid exceptions
> Atomicity means no partial effects.
```

:::keypoints
- Template Method for withdraw (common checks + subclass rule); strategies for interest; immutable append-only transactions.
- Transfer: `scoped_lock` both accounts, validate everything, then apply both legs. Notify listeners after unlocking.
- Idempotency, audit by history, and DB transactions are the natural next steps.
:::
