---
title: Design a Bank Account System
level: easy
time: 50
summary: Savings and checking accounts with different rules, a history of transactions that never changes, deposit, withdraw and a safe transfer between accounts (without deadlock), interest as a strategy, account status, and alerts.
---

:::problem Design a Bank Account System {level=easy tags="banking,concurrency,transfer,Strategy,State,money"}
Design the core of a bank. Customers own accounts (savings, checking). Support deposit, withdrawal and transfer between accounts, and keep a history of transactions. Savings accounts earn interest and limit withdrawals. Checking accounts allow a small overdraft. A frozen account accepts deposits but not withdrawals. A transfer must be all-or-nothing, and safe when many run at the same time.

:::hint Hint
Keep the **balance rules inside the account**, so no caller can break them. Make transactions **records that never change**. When transferring, lock **both** accounts in a way that cannot cause a deadlock.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Kinds of account? | Savings (no overdraft, earns interest, at most 3 withdrawals a month) and Checking (overdraft up to Rs 5,000) |
| Actions? | deposit, withdraw, transfer, statement |
| Money? | integer paise. Only positive amounts |
| History? | every successful action adds a `Transaction` that never changes (id, kind, amount, balance after) |
| Status? | Active, Frozen (deposits only), Closed (nothing allowed) |
| Interest? | monthly. The rate comes from a strategy |
| Many threads? | yes. Transfers are all-or-nothing, with no deadlock |
| Alerts? | a listener is told about big withdrawals |
| Not needed | customer details, many currencies, saving to disk |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **Template Method** in `Account`: `withdraw` does the common checks (status, amount above 0), then asks the subclass `canWithdraw(m)` for its own rule. Savings checks the monthly limit and no overdraft. Checking checks balance plus overdraft.
- **Transactions are records that never change**, and the history only grows. The balance could be worked out again from it (useful for audits).
- **Interest is an `InterestStrategy`.** A tiered or special rate is a new class.
- **Status** is an enum checked in the template method. A full State pattern is worth it only if each status has a lot of behaviour.
- **Transfer:** lock **both** accounts with `scoped_lock` (no deadlock), check everything, then change both accounts and record both transactions. If the debit could work but the credit cannot (the other account is closed), **nothing** changes, because all checks come before any change, while holding the locks.
- **Listeners** (Observer) for alerts are called **after** releasing the locks, so we do not call outside code while holding a lock.

## Step 4: The code

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

| Case | What happens |
|---|---|
| Negative or zero amount | refused in the template method |
| Transfer to the same account | refused first (locking the same mutex twice is undefined) |
| The destination is closed | checked **before** any balance changes, so nothing moves |
| Two transfers in opposite directions | `scoped_lock` takes both mutexes without a deadlock |
| Interest on an overdrawn balance | `monthlyInterest` returns 0 for a negative balance (add this rule) |
| A listener throws an error | catch and log it, so a failing alert cannot break banking |
| Money type | `long` paise here. A real project would use a `Money` class |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "A new type of account (fixed deposit)" | a subclass with its own `canWithdraw` (a penalty for early withdrawal) |
| "A daily withdrawal limit across accounts" | a `LimitPolicy` checked by the bank service |
| "Planned or repeating transfers" | **Command** objects in a scheduler |
| "Save in a database with transactions" | an `AccountRepository` and a Unit of Work. Database transactions replace in-program locks |
| "Banks on many machines" | two-phase commit or the saga pattern with undo steps (HLD) |
| "Audit and matching" | the history that only grows lets you recompute the balance and compare |
| "Safe retries" | each request has an id. The account ignores an id it has already seen |

## Short answer to say in an interview

:::interview How do you make a money transfer safe?
"I take both account locks together with scoped_lock, which avoids deadlock when two transfers go in opposite directions. Under the locks I check everything first: both accounts exist and allow the action, and the source has enough money. Only then do I change both balances and record both transactions. So the transfer is all or nothing. Listeners are told after the locks are released."
:::

```quiz
? Why does transfer use scoped_lock on both accounts?
- To make it faster
+ Taking both together avoids a deadlock when two opposite transfers each hold one lock
- Because accounts never change
> scoped_lock uses a method that avoids deadlock.
? Why must all checks happen before any balance changes in a transfer?
- For readability
+ If the credit fails after the debit, money disappears. Checking first keeps it all or nothing
- To avoid exceptions
> No half-done work is allowed.
```

:::keypoints
- Template Method for withdraw (common checks and the subclass rule). Strategies for interest. Transactions never change, and the history only grows.
- Transfer: `scoped_lock` both accounts, check everything, then apply both sides. Tell listeners after unlocking.
- Safe retries (ids), audit from history, and database transactions are the next steps.
:::
