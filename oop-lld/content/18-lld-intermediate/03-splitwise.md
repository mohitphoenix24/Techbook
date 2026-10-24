---
title: Design Splitwise (expense sharing)
level: intermediate
time: 60
summary: An app for sharing expenses among friends. Learn equal, exact and percentage splits, exact money handling with a fair way to share the leftover paise, balances between people, how to reduce the number of payments, and settling up.
---

:::problem Design Splitwise {level=medium tags="finance,Strategy,graph,money,algorithm"}
Design an expense-sharing app. Friends add expenses ("Asha paid Rs 900 for dinner, shared by four people") using different split types: equal, exact amounts, or percentages. The app tracks who owes whom, shows each person's balance, reduces the debts so that fewer payments are needed, and lets people settle up.

:::hint Hint
Every expense becomes a set of **(debtor, creditor, amount)** pairs. Keep a net balance for each person (what they paid minus what they owe). Splitting must be exact in paise: the leftover paise go to specific people, so shares always add up to the total. To reduce debts, repeatedly match the biggest creditor with the biggest debtor.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Users and groups? | users have ids. A group is a set of users. Expenses can also be outside a group |
| An expense? | description, total amount, **who paid**, who shares it, the split type |
| Split types? | **Equal**, **Exact** (amounts given), **Percent** (percentages given, must add up to 100) |
| Money? | integer paise. Shares add up **exactly** to the total |
| Balances? | for each pair (A, B): how much A owes B. Plus each person's net position |
| Reduce debts? | use as few payments as possible to settle a group |
| Settle up? | a payment between two people reduces their balance |
| Not needed | currencies, receipts, screen |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **`SplitStrategy`** (a Strategy). Each split type checks its input and returns a list of shares that add up to the total. A new split ("by shares or ratio") is a new class.
- **The leftover rule.** Splitting 100 paise equally among 3 gives 34, 33, 33. The first few people pay one paisa more, as many as the leftover. So the sum is always exact, and the result is **the same every time**.
- **The ledger keeps net balances** for each person: `net[u] = paid - owed`. Positive means others owe this person. Negative means this person owes others. The total over all people is always **0**. This is a rule worth testing.
- **A pairwise view** (who owes whom) is kept for display. But **reducing debts uses net balances only**: match the biggest debtor with the biggest creditor. (The perfect minimum is a very hard problem. This greedy way gives at most n-1 payments, which is what apps use.)
- **Settle up** is just a negative expense. A payment from A to B changes both nets and the pair.
- **Threads:** one mutex in the ledger (adding expenses is rare compared with reading).

## Step 4: The code

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

| Case | What happens |
|---|---|
| The amount does not divide evenly (Rs 100 among 3) | 34, 33 and 33 paise. Shares always add up exactly |
| Percentages do not add up to 100 | refused with a message |
| Exact amounts do not match the total | refused, nothing is saved |
| The person who paid is not among those sharing | allowed. They paid but owe nothing |
| Two people owe each other | the debts cancel each other in `addDebt` |
| Rounding with decimal input | convert rupees to paise once at the entrance. All later maths uses integers |
| More than one payer | record each payer's amount as paid. Shares stay the same (extension) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Split by shares or weights" | a `ShareSplit` strategy (in proportion, with the same leftover rule) |
| "Groups with their own balances" | a `Ledger` for each group, and one global ledger |
| "Repeating expenses" | scheduled commands that call `add` |
| "Undo or edit an expense" | keep the list of expenses and **recompute** the ledger from it (event sourcing), or apply reverse entries |
| "Currencies" | `Money` with a currency. Convert at the time of the expense and keep the rate |
| "Notify 'Ravi added an expense'" | Observer events |
| "Faster reduction for big groups" | the greedy way is O(n log n). The exact minimum is exponential |
| "Audit and disputes" | a log of expenses that never changes, with who and when. Balances are worked out from it |

## Short answer to say in an interview

:::interview How do you split money exactly, and how do you reduce the number of payments?
"I store money as integer paise. For an equal split, I divide, and give the leftover paise one each to the first few people, so the shares always add up to the total. The ledger keeps a net balance for each person, paid minus owed, and these always sum to zero. To reduce payments, I repeatedly match the person who is owed the most with the person who owes the most. That gives at most n minus 1 payments."
:::

```quiz
? Why do the net balances always add up to zero?
- By luck
+ Each expense adds the total to the payer and takes the same total away across the shares
- Balances are positive
> It is a rule worth checking in tests.
? How do you split Rs 100 equally among 3 people exactly?
- 33.33 each
+ 34, 33, 33 paise. The leftover paise go one each to the first people
- Round up for everyone
> Integer maths with a clear leftover rule keeps the sum exact.
```

:::keypoints
- A Strategy for split types, integer paise, and a clear leftover rule so shares add up exactly.
- The ledger keeps net balances (they sum to zero) and a pairwise view. Reducing debts matches the biggest debtor with the biggest creditor.
- A settlement is just another entry. Events and recomputing give undo and audit.
:::
