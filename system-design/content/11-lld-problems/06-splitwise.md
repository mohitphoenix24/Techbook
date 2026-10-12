---
title: Design Splitwise (Expense Sharing)
level: intermediate
time: 55
summary: Users and groups share expenses split equally, by exact amounts, by percentages or by shares (a Strategy per split type, with paise-exact rounding), a balance ledger that tracks who owes whom, and the "simplify debts" algorithm that settles a group with the fewest transfers — in C++ and JavaScript.
---

:::problem Design Splitwise {level=medium tags="LLD,Strategy,greedy,money"}
Friends add expenses ("Asha paid ₹3,000 for dinner, split equally among 4"; "Bilal paid ₹1,000 for cabs, 60/40"). The app shows each person's balance and who owes whom, and can "simplify debts" so the group settles with as few payments as possible.

:::hint Hint
Every split type answers the same question: "how much does each participant owe for this expense?" Put each rule behind one interface. For balances, track one net number per person; settling is then a matching problem between people who are owed and people who owe.
:::
:::

## Requirements

- Users, groups; an **expense** has a payer, an amount, participants and a **split type**:
  - **EQUAL**: divided equally;
  - **EXACT**: given amounts that must add up to the total;
  - **PERCENT**: percentages that must add up to 100;
  - **SHARES**: weights (2 shares vs 1 share).
- Show balances: per person (net), and pairwise ("Chen owes Asha ₹750").
- **Simplify debts**: produce a minimal-ish list of payments that settles everyone.
- Money is exact: amounts in **paise**; rounding leftovers must not vanish.

## Design

```viz algo=uml title="Splitwise classes"
class ExpenseManager
  - ledger: map<user, map<user, long>>
  + addExpense(e: Expense)
  + balances(): map<user, long>
  + simplify(): Payment[]
class Expense
  - paidBy: string
  - amount: long
  - participants: string[]
  - split: SplitStrategy
interface SplitStrategy
  + shares(amount, participants): map<user, long>
class EqualSplit
class ExactSplit
  - amounts: map
class PercentSplit
  - percents: map
class SharesSplit
  - weights: map
Expense --> SplitStrategy
EqualSplit ..|> SplitStrategy
ExactSplit ..|> SplitStrategy
PercentSplit ..|> SplitStrategy
SharesSplit ..|> SplitStrategy
ExpenseManager o-- Expense : records
```

- **Strategy** per split type: validation rules differ (exact amounts must sum to the total; percents to 100), and new types (by item, by consumption) are added without touching the manager.
- **Rounding**: ₹100 split 3 ways is 3333 + 3333 + 3334 paise; the remainder is assigned deterministically (here, to the first participants) so the shares always sum to the total.
- **Ledger**: a net balance per person is enough for simplification; a pairwise ledger answers "who owes whom" before simplification.

## Simplifying debts

Each person's **net balance** = paid − owed. Positive = creditor, negative = debtor; the sum is always zero. Greedy algorithm: repeatedly match the **largest creditor** with the **largest debtor**, transfer the smaller of the two amounts, and update. Each step settles at least one person, so it uses at most **n − 1** payments.

```viz algo=arch title="The demo group after simplification" dir=right
b   Bilal | net −1,483.33 [user]
d   Dara | net −1,650.00 [user]
a   Asha | net +2,916.66 [user]
c   Chen | net +216.67 [user]
--
d -> a : 1,650.00
b -> a : 1,266.66
b -> c : 216.67
caption: Five expenses and many pairwise debts, settled with 3 transfers (n − 1 for 4 people).
```

:::note Minimum number of transfers is NP-hard
The greedy method gives at most n − 1 transfers, which is what apps use. The **true** minimum can be lower (when subgroups balance out exactly, they can settle among themselves); finding it is NP-hard in general (subset-sum flavour). Mention this as a refinement, not something to implement in an interview.
:::

## Implementation

:::tabs Expense manager with split strategies and debt simplification
```cpp run
#include <bits/stdc++.h>
using namespace std;

using Shares = map<string, long>;                       // user -> paise owed for one expense

struct SplitStrategy {
    virtual ~SplitStrategy() = default;
    virtual Shares shares(long amount, const vector<string>& people) const = 0;
};
struct EqualSplit : SplitStrategy {
    Shares shares(long amount, const vector<string>& p) const override {
        Shares s;
        long base = amount / p.size(), rem = amount % p.size();
        for (size_t i = 0; i < p.size(); i++) s[p[i]] = base + ((long)i < rem ? 1 : 0);   // leftovers to the first ones
        return s;
    }
};
struct ExactSplit : SplitStrategy {
    Shares exact;
    explicit ExactSplit(Shares e) : exact(std::move(e)) {}
    Shares shares(long amount, const vector<string>&) const override {
        long sum = 0;
        for (auto& [_, v] : exact) sum += v;
        if (sum != amount) throw invalid_argument("exact amounts must add up to the total");
        return exact;
    }
};
struct PercentSplit : SplitStrategy {
    map<string, int> pct;
    explicit PercentSplit(map<string, int> p) : pct(std::move(p)) {}
    Shares shares(long amount, const vector<string>&) const override {
        int total = 0;
        for (auto& [_, v] : pct) total += v;
        if (total != 100) throw invalid_argument("percentages must add up to 100");
        Shares s; long given = 0;
        for (auto& [u, v] : pct) { s[u] = amount * v / 100; given += s[u]; }
        s.begin()->second += amount - given;              // put the rounding remainder somewhere deterministic
        return s;
    }
};
struct SharesSplit : SplitStrategy {
    map<string, int> weights;
    explicit SharesSplit(map<string, int> w) : weights(std::move(w)) {}
    Shares shares(long amount, const vector<string>&) const override {
        int total = 0;
        for (auto& [_, w] : weights) total += w;
        Shares s; long given = 0;
        for (auto& [u, w] : weights) { s[u] = amount * w / total; given += s[u]; }
        s.begin()->second += amount - given;
        return s;
    }
};

struct Payment { string from, to; long amount; };

class ExpenseManager {
    map<string, long> net_;                               // + is owed money, - owes money
public:
    void addExpense(const string& paidBy, long amount, const vector<string>& people, const SplitStrategy& split, const string& label) {
        Shares owed = split.shares(amount, people);       // validates before changing any balance
        net_[paidBy] += amount;
        for (auto& [u, v] : owed) net_[u] -= v;
        cout << "  + " << label << ": " << paidBy << " paid Rs " << amount / 100 << "\n";
    }
    const map<string, long>& balances() const { return net_; }

    vector<Payment> simplify() const {                    // greedy: biggest debtor pays biggest creditor
        priority_queue<pair<long, string>> creditors, debtors;
        for (auto& [u, v] : net_) {
            if (v > 0) creditors.push({v, u});
            else if (v < 0) debtors.push({-v, u});
        }
        vector<Payment> out;
        while (!creditors.empty() && !debtors.empty()) {
            auto [credit, c] = creditors.top(); creditors.pop();
            auto [debt, d] = debtors.top(); debtors.pop();
            long x = min(credit, debt);
            out.push_back({d, c, x});
            if (credit > x) creditors.push({credit - x, c});
            if (debt > x) debtors.push({debt - x, d});
        }
        return out;
    }
};

string rs(long paise) { ostringstream s; s << "Rs " << paise / 100 << "." << setw(2) << setfill('0') << abs(paise % 100); return s.str(); }

int main() {
    ExpenseManager m;
    vector<string> trip{"asha", "bilal", "chen", "dara"};
    m.addExpense("asha", 300000, trip, EqualSplit{}, "dinner (equal)");
    m.addExpense("bilal", 100000, {"bilal", "chen"}, PercentSplit({{"bilal", 60}, {"chen", 40}}), "cabs (60/40)");
    m.addExpense("asha", 120000, trip, SharesSplit({{"asha", 1}, {"bilal", 1}, {"chen", 2}, {"dara", 2}}), "drinks (by shares)");
    m.addExpense("dara", 10000, {"asha", "bilal", "chen"}, EqualSplit{}, "snacks (equal, 3 ways)");
    m.addExpense("chen", 240000, trip, ExactSplit({{"asha", 30000}, {"bilal", 90000}, {"chen", 60000}, {"dara", 60000}}), "hotel (exact amounts)");
    try { m.addExpense("chen", 50000, trip, ExactSplit({{"asha", 20000}, {"bilal", 20000}}), "bad exact split"); }
    catch (const exception& e) { cout << "  rejected: " << e.what() << "\n"; }

    cout << "net balances:\n";
    long sum = 0;
    for (auto& [u, v] : m.balances()) { cout << "  " << left << setw(6) << u << (v >= 0 ? " is owed " : " owes    ") << rs(abs(v)) << "\n"; sum += v; }
    cout << "  (sum = " << sum << ", always zero)\n";
    cout << "settle up with:\n";
    for (auto& p : m.simplify()) cout << "  " << p.from << " pays " << p.to << " " << rs(p.amount) << "\n";
}
```
```js run
// Split strategies: each returns a Map(user → paise owed) for one expense
const equalSplit = {
  shares(amount, people) {
    const base = Math.floor(amount / people.length), rem = amount % people.length;
    return new Map(people.map((u, i) => [u, base + (i < rem ? 1 : 0)]));    // leftovers to the first ones
  },
};
const exactSplit = (amounts) => ({
  shares(amount) {
    const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
    if (sum !== amount) throw new Error("exact amounts must add up to the total");
    return new Map(Object.entries(amounts));
  },
});
const weighted = (weights, mustTotal = null) => ({                  // percentages are weights that must total 100
  shares(amount) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (mustTotal !== null && total !== mustTotal) throw new Error(`percentages must add up to ${mustTotal}`);
    const s = new Map(Object.entries(weights).map(([u, w]) => [u, Math.floor((amount * w) / total)]));
    const given = [...s.values()].reduce((a, b) => a + b, 0);
    const first = s.keys().next().value;
    s.set(first, s.get(first) + amount - given);                    // rounding remainder, deterministically
    return s;
  },
});
const percentSplit = (p) => weighted(p, 100);
const sharesSplit = (w) => weighted(w);

class ExpenseManager {
  #net = new Map();                                                 // + is owed money, − owes money
  addExpense(paidBy, amount, people, split, label) {
    const owed = split.shares(amount, people);                      // validates before touching balances
    this.#net.set(paidBy, (this.#net.get(paidBy) ?? 0) + amount);
    for (const [u, v] of owed) this.#net.set(u, (this.#net.get(u) ?? 0) - v);
    console.log(`  + ${label}: ${paidBy} paid Rs ${amount / 100}`);
  }
  get balances() { return new Map([...this.#net].sort(([a], [b]) => a.localeCompare(b))); }
  simplify() {                                                      // greedy: biggest debtor pays biggest creditor
    const creditors = [], debtors = [];
    for (const [u, v] of this.#net) { if (v > 0) creditors.push([v, u]); else if (v < 0) debtors.push([-v, u]); }
    const byAmount = (a, b) => b[0] - a[0] || a[1].localeCompare(b[1]);
    const out = [];
    while (creditors.length && debtors.length) {
      creditors.sort(byAmount); debtors.sort(byAmount);             // fine for small groups; use heaps for big ones
      const [credit, c] = creditors.shift(), [debt, d] = debtors.shift();
      const x = Math.min(credit, debt);
      out.push({ from: d, to: c, amount: x });
      if (credit > x) creditors.push([credit - x, c]);
      if (debt > x) debtors.push([debt - x, d]);
    }
    return out;
  }
}

const rs = (paise) => `Rs ${Math.floor(Math.abs(paise) / 100)}.${String(Math.abs(paise) % 100).padStart(2, "0")}`;
const m = new ExpenseManager();
const trip = ["asha", "bilal", "chen", "dara"];
m.addExpense("asha", 300000, trip, equalSplit, "dinner (equal)");
m.addExpense("bilal", 100000, ["bilal", "chen"], percentSplit({ bilal: 60, chen: 40 }), "cabs (60/40)");
m.addExpense("asha", 120000, trip, sharesSplit({ asha: 1, bilal: 1, chen: 2, dara: 2 }), "drinks (by shares)");
m.addExpense("dara", 10000, ["asha", "bilal", "chen"], equalSplit, "snacks (equal, 3 ways)");
m.addExpense("chen", 240000, trip, exactSplit({ asha: 30000, bilal: 90000, chen: 60000, dara: 60000 }), "hotel (exact amounts)");
try { m.addExpense("chen", 50000, trip, exactSplit({ asha: 20000, bilal: 20000 }), "bad exact split"); }
catch (e) { console.log("  rejected:", e.message); }

console.log("net balances:");
let sum = 0;
for (const [u, v] of m.balances) { console.log(`  ${u.padEnd(6)}${v >= 0 ? " is owed " : " owes    "}${rs(v)}`); sum += v; }
console.log(`  (sum = ${sum}, always zero)`);
console.log("settle up with:");
for (const p of m.simplify()) console.log(`  ${p.from} pays ${p.to} ${rs(p.amount)}`);
```
:::

## Design discussion

- **Validation before mutation**: `shares()` throws on an invalid split before any balance changes, so a bad expense never half-applies.
- **Integer paise + deterministic remainders** keep every expense summing exactly to its total; the global sum of balances stays exactly zero (the program prints it as a self-check).
- **Expenses are immutable records**; editing an expense = reversing it and adding the corrected one. Storing them (not just the balances) gives history and auditability: event sourcing in miniature.
- **Concurrency**: two people adding expenses to the same group at once both update balances, so updates per group must be serialised (a group lock, or in a database a transaction per expense; since balances are derived, they can also be recomputed from the expense log).
- **Multiple currencies**: keep balances per currency; convert only when settling, at a recorded rate.

| Extension | How |
|---|---|
| Itemised bills (who ate what) | a new `SplitStrategy` that sums item-level allocations |
| Recurring expenses (rent) | a scheduler that creates expenses (Command objects) |
| Notifications ("Bilal added an expense") | observers on the group |
| Settle-up payments via UPI | a `Payment` expense type that moves balances in the opposite direction |
| Exact minimum transfers | subset-sum search for small groups (NP-hard in general) |

```quiz
? ₹100 (10,000 paise) split equally among 3 people. What should the shares be?
+ 3,334 + 3,333 + 3,333 paise: the remainder is assigned deterministically so the shares sum exactly to the total
- 3,333 each, losing 1 paisa
- 33.33 rupees each as floating point
> Integer minor units plus a remainder rule keep money exact.

? Why are split types modelled as strategies?
+ Each type has its own computation and validation, and new types can be added without changing the expense manager
- Because there must be exactly four of them
- To make expenses mutable
> It's the Open/Closed variation point of this problem.

? With n people in a group, how many payments does the greedy "largest debtor pays largest creditor" method need at most?
- n²
+ n − 1
- 1
> Each transfer settles at least one person, and the last person is settled automatically.
```

:::keypoints
- Model **Expense** (payer, amount in paise, participants, **SplitStrategy**) and an **ExpenseManager** holding net balances.
- Split strategies (**equal, exact, percent, shares**) validate their inputs and distribute rounding remainders deterministically.
- **Simplify debts** greedily (largest creditor ↔ largest debtor) with heaps: at most n − 1 payments; the true minimum is NP-hard.
- Keep expenses immutable (edit = reverse + re-add), serialise updates per group, handle currencies separately.
:::
