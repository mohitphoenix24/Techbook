---
title: Design Splitwise (expense sharing)
level: intermediate
time: 60
summary: Users and groups, expenses split equally, by exact amounts or by percentage, exact money arithmetic with remainder distribution, a balance sheet between every pair of users, simplifying debts to the fewest payments, and settlement.
---

:::problem Design Splitwise {level=medium tags="finance,Strategy,graph,money,algorithm"}
Design an expense-sharing app. Friends add expenses ("Asha paid Rs 900 for dinner, split among four people") using different split types: equal, exact amounts, or percentages. The app tracks who owes whom, shows each user's balances, simplifies debts so that fewer payments are needed, and lets users settle up.

:::hint Hint
Every expense becomes a set of **(debtor, creditor, amount)** pairs. Keep a net balance per user (what they paid minus what they owe). Splitting must be exact in paise: remainders go to specific people so that the shares always sum to the total. Simplifying debts is a greedy match of the biggest creditor with the biggest debtor.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Users and groups? | users with ids; a group is a set of users; expenses may be outside groups |
| Expense? | description, total amount, **payer(s)**, participants, split type |
| Split types? | **Equal**, **Exact** (amounts given), **Percent** (percentages given, must total 100) |
| Money? | integer paise; shares always sum **exactly** to the total |
| Balances? | for each pair (A,B): how much A owes B; plus each user's net position |
| Simplify? | minimise the number of transactions to settle a group |
| Settle? | a payment between two users reduces their balance |
| Out of scope | currencies, receipts, UI |

## Step 2: entities

```viz algo=uml title="Splitwise"
class ExpenseService
  + addExpense(e: Expense): Result
  + balanceOf(user: string): Money
  + simplify(): Transfer[]
  + settle(from: string, to: string, amount: Money): void
class Expense
  - id: int
  - description: string
  - total: Money
  - payer: string
  - shares: Share[]
class Share
  - user: string
  - amount: Money
interface SplitStrategy
  + split(total: Money, participants: string[], params: double[]): Share[]
class EqualSplit
class ExactSplit
class PercentSplit
class Ledger
  - net: map<string, Money>
  - owes: map<pair<string,string>, Money>
  + record(e: Expense): void
class DebtSimplifier
  + simplify(net: map): Transfer[]
class Transfer
  - from: string
  - to: string
  - amount: Money
ExpenseService --> Ledger
ExpenseService --> SplitStrategy
ExpenseService ..> DebtSimplifier
EqualSplit ..|> SplitStrategy
ExactSplit ..|> SplitStrategy
PercentSplit ..|> SplitStrategy
Expense *-- Share
```

## Step 3: design decisions

- **`SplitStrategy`** (Strategy): each split type validates its input and returns `vector<Share>` summing to the total. Adding "by shares/ratio" is a new class.
- **Remainder rule**: for an equal split of 100 paise among 3, shares are 34, 33, 33: the first `remainder` people pay one paisa more. This guarantees the sum is exact, and it is **deterministic**.
- **Ledger keeps net balances** per user: `net[u] = paid - owed`. Positive: others owe u; negative: u owes others. The sum over all users is always **0** (an invariant to test).
- **Pairwise view** (who owes whom) is also maintained for display, but **simplification works on net balances only**: minimum cash flow, matching the largest debtor with the largest creditor. (The true minimum is NP-hard in general; greedy gives at most n-1 transfers, which is what apps use.)
- **Settle** is just a negative expense: a payment from A to B adjusts both nets and the pair.
- **Thread-safety**: one mutex in the ledger (expenses are rare compared with reads).

## Step 4: the code

```cpp run title="Splits, ledger, simplified debts"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <numeric>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
using namespace std;

using Money = long;                                          // paise
string rs(Money m) { string s = m < 0 ? "-" : ""; m = m < 0 ? -m : m; return s + "Rs " + to_string(m / 100) + "." + (m % 100 < 10 ? "0" : "") + to_string(m % 100); }

struct Share { string user; Money amount; };

struct SplitStrategy {
    virtual ~SplitStrategy() = default;
    virtual vector<Share> split(Money total, const vector<string>& who, const vector<double>& params) const = 0;   // throws invalid_argument on bad input
};
struct EqualSplit : SplitStrategy {
    vector<Share> split(Money total, const vector<string>& who, const vector<double>&) const override {
        long n = static_cast<long>(who.size());
        Money base = total / n, rem = total % n;
        vector<Share> out;
        for (long i = 0; i < n; ++i) out.push_back({who[i], base + (i < rem ? 1 : 0)});       // the first 'rem' people pay one paisa more
        return out;
    }
};
struct ExactSplit : SplitStrategy {
    vector<Share> split(Money total, const vector<string>& who, const vector<double>& amounts) const override {
        if (amounts.size() != who.size()) throw invalid_argument("one amount per participant");
        vector<Share> out; Money sum = 0;
        for (size_t i = 0; i < who.size(); ++i) { Money a = static_cast<Money>(amounts[i] * 100 + 0.5); out.push_back({who[i], a}); sum += a; }
        if (sum != total) throw invalid_argument("exact amounts total " + rs(sum) + " but the expense is " + rs(total));
        return out;
    }
};
struct PercentSplit : SplitStrategy {
    vector<Share> split(Money total, const vector<string>& who, const vector<double>& pct) const override {
        if (pct.size() != who.size()) throw invalid_argument("one percentage per participant");
        double sum = accumulate(pct.begin(), pct.end(), 0.0);
        if (sum < 99.999 || sum > 100.001) throw invalid_argument("percentages must total 100, got " + to_string(sum));
        vector<Share> out; Money assigned = 0;
        for (size_t i = 0; i < who.size(); ++i) { Money a = static_cast<Money>(total * pct[i] / 100.0); out.push_back({who[i], a}); assigned += a; }
        out.front().amount += total - assigned;                // rounding remainder goes to the first person: sum is exact
        return out;
    }
};

struct Transfer { string from, to; Money amount; };

class Ledger {
    map<string, Money> net_;                                  // paid minus owed
    map<pair<string, string>, Money> owes_;                   // (debtor, creditor) -> amount (kept netted both ways)
    mutable mutex m_;
    void addDebt(const string& debtor, const string& creditor, Money a) {
        if (debtor == creditor || a == 0) return;
        auto reverse = owes_.find({creditor, debtor});
        if (reverse != owes_.end()) {                         // net against an opposite debt
            Money r = min(reverse->second, a);
            reverse->second -= r; a -= r;
            if (reverse->second == 0) owes_.erase(reverse);
        }
        if (a > 0) owes_[{debtor, creditor}] += a;
    }
public:
    void record(const string& payer, Money total, const vector<Share>& shares) {
        lock_guard l(m_);
        net_[payer] += total;
        for (const auto& s : shares) { net_[s.user] -= s.amount; addDebt(s.user, payer, s.amount); }
    }
    Money net(const string& u) const { lock_guard l(m_); auto it = net_.find(u); return it == net_.end() ? 0 : it->second; }
    map<string, Money> allNet() const { lock_guard l(m_); return net_; }
    vector<Transfer> pairwise() const { lock_guard l(m_); vector<Transfer> v; for (auto& [k, a] : owes_) v.push_back({k.first, k.second, a}); return v; }
};

// Minimum cash flow, greedy: largest debtor pays largest creditor.
vector<Transfer> simplify(const map<string, Money>& net) {
    vector<pair<Money, string>> creditors, debtors;
    for (auto& [u, n] : net) { if (n > 0) creditors.push_back({n, u}); else if (n < 0) debtors.push_back({-n, u}); }
    vector<Transfer> out;
    sort(creditors.rbegin(), creditors.rend()); sort(debtors.rbegin(), debtors.rend());
    size_t i = 0, j = 0;
    while (i < creditors.size() && j < debtors.size()) {
        Money pay = min(creditors[i].first, debtors[j].first);
        out.push_back({debtors[j].second, creditors[i].second, pay});
        creditors[i].first -= pay; debtors[j].first -= pay;
        if (creditors[i].first == 0) ++i;
        if (debtors[j].first == 0) ++j;
    }
    return out;
}

class ExpenseService {
    Ledger ledger_;
    map<string, unique_ptr<SplitStrategy>> strategies_;
public:
    ExpenseService() {
        strategies_["equal"] = make_unique<EqualSplit>();
        strategies_["exact"] = make_unique<ExactSplit>();
        strategies_["percent"] = make_unique<PercentSplit>();
    }
    string add(const string& what, const string& payer, double rupees, const vector<string>& who, const string& type, const vector<double>& params = {}) {
        try {
            Money total = static_cast<Money>(rupees * 100 + 0.5);
            auto it = strategies_.find(type);
            if (it == strategies_.end()) return "unknown split type " + type;
            auto shares = it->second->split(total, who, params);
            Money sum = 0; for (auto& s : shares) sum += s.amount;
            if (sum != total) return "internal error: shares do not add up";       // the invariant, checked
            ledger_.record(payer, total, shares);
            string out = "added '" + what + "' " + rs(total) + " paid by " + payer + ":";
            for (auto& s : shares) out += " " + s.user + "=" + rs(s.amount);
            return out;
        } catch (const exception& e) { return string("rejected '") + what + "': " + e.what(); }
    }
    void settle(const string& from, const string& to, double rupees) {
        Money a = static_cast<Money>(rupees * 100 + 0.5);
        ledger_.record(from, a, {{to, a}});                    // a payment is an expense paid by `from` and owed entirely by `to`
    }
    const Ledger& ledger() const { return ledger_; }
};

int main() {
    ExpenseService svc;
    cout << svc.add("dinner", "Asha", 900, {"Asha", "Ravi", "Meera", "Kiran"}, "equal") << "\n";
    cout << svc.add("cab", "Ravi", 100, {"Asha", "Ravi", "Meera"}, "equal") << "\n";                          // 100 / 3: remainders handled
    cout << svc.add("hotel", "Meera", 3000, {"Asha", "Ravi", "Meera"}, "percent", {50, 30, 20}) << "\n";
    cout << svc.add("tickets", "Kiran", 1000, {"Asha", "Kiran"}, "exact", {400, 600}) << "\n";
    cout << svc.add("bad exact", "Kiran", 1000, {"Asha", "Kiran"}, "exact", {400, 500}) << "\n";
    cout << svc.add("bad percent", "Asha", 100, {"Asha", "Ravi"}, "percent", {60, 30}) << "\n";

    cout << "net balances (positive = is owed money):\n";
    Money sum = 0;
    for (auto& [u, n] : svc.ledger().allNet()) { cout << "  " << u << ": " << rs(n) << "\n"; sum += n; }
    cout << "sum of all nets: " << rs(sum) << " (always zero)\n";

    cout << "who owes whom (before simplifying): " << svc.ledger().pairwise().size() << " debts\n";
    auto plan = simplify(svc.ledger().allNet());
    cout << "simplified settlement plan (" << plan.size() << " payments):\n";
    for (auto& t : plan) cout << "  " << t.from << " pays " << t.to << " " << rs(t.amount) << "\n";

    svc.settle(plan[0].from, plan[0].to, plan[0].amount / 100.0);
    cout << "after the first payment, remaining plan: " << simplify(svc.ledger().allNet()).size() << " payments\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Amount not divisible (Rs 100 among 3) | 34 + 33 + 33 paise-wise; shares always sum exactly |
| Percentages not summing to 100 | rejected with a message |
| Exact amounts not matching the total | rejected, nothing recorded |
| Payer not among participants | allowed (they paid but owe nothing) |
| Two users owing each other | debts net against each other in `addDebt` |
| Rounding with floating-point input | convert rupees to paise once at the boundary; all later maths is integer |
| Multiple payers | record each payer's contribution as paid; shares are unchanged (extension) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Split by shares or weights" | a `ShareSplit` strategy (proportional with the same remainder rule) |
| "Groups with their own balances" | a `Ledger` per group, plus a global one |
| "Recurring expenses" | scheduled commands that call `add` |
| "Undo or edit an expense" | keep expenses; **recompute** the ledger from the list (event sourcing) or apply the reverse entries |
| "Currencies" | `Money` with a currency; convert at expense time and store the rate |
| "Notifications 'Ravi added an expense'" | Observer events |
| "Large groups: faster simplification" | the greedy is O(n log n); exact minimisation (subset-sum partitioning) is exponential |
| "Audit and dispute" | immutable expense log with who/when; balances derived |

```quiz
? Why do the nets always sum to zero?
- By luck
+ Every expense adds the total to the payer and subtracts the same total across the shares
- Because balances are positive
> It is an invariant worth asserting in tests.
? How do you split Rs 100 equally among 3 people exactly?
- 33.33 each
+ 34, 33, 33 paise-wise: give the remainder one paisa each to the first people
- Round up for everyone
> Integer arithmetic with a defined remainder rule keeps the sum exact.
```

:::keypoints
- Strategy for split types; integer paise; a deterministic remainder rule so shares sum exactly.
- Ledger holds net balances (sum zero) and a pairwise view; simplification matches largest debtor with largest creditor.
- A settlement is just another entry; events and recomputation give undo and audit.
:::
