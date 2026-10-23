---
title: Writing a good class: the checklist and a worked refactoring
level: intermediate
time: 35
summary: A checklist that pulls Part I together (invariants, interface, special members, const, ownership, errors), then a step-by-step refactoring of a poorly written BankAccount into a clean, safe, testable class.
---

You now know the pieces of OOP in C++. This lesson puts them together. When an interviewer says "write a class for X", this is the mental checklist to run.

## The checklist

1. **What is the invariant?** (Balance ≥ 0, start ≤ end, size ≤ capacity.) Write it down. The constructor must establish it and every public function must preserve it.
2. **Is it a value or an entity?** A value is copyable and compared by content; an entity has identity and is usually not copied.
3. **Keep data private.** Expose **behaviour** (`withdraw`), not fields (`setBalance`).
4. **Make the constructor set a valid state.** Use the initialiser list, default member initialisers, `explicit` on single-argument constructors, and throw (or use a factory) when arguments are invalid.
5. **Const-correctness:** getters and queries are `const`; parameters you only read are `const T&`; use `[[nodiscard]]` for results that must be checked.
6. **Resource management:** hold resources in RAII members, so the Rule of Zero applies. If you must own a raw resource, apply the Rule of Five.
7. **Inheritance only for is-a.** If it is a base class: virtual destructor, `override`, no data in interfaces, no copying (slicing).
8. **Error handling:** decide and be consistent (exceptions, `optional`, `Result`).
9. **Thread-safety:** state it. Immutable? Internally locked? Not thread-safe?
10. **Naming and size:** the class name is a noun, functions are verbs, each class has **one** reason to change. If you cannot name it without "and" or "Manager", split it.

## A bad class

```cpp title="Everything wrong with this BankAccount: do not copy"
class BankAccount {
public:
    char* owner;                      // raw owning pointer, public
    double balance;                   // public data
    int type;                         // 0 = savings, 1 = current: magic numbers
    BankAccount(char* o, double b, int t) { owner = o; balance = b; type = t; }
    double getBalance() { return balance; }              // not const
    void setBalance(double b) { balance = b; }           // no validation
    void withdraw(double x) {
        if (type == 0) { if (balance - x >= 0) balance -= x; }
        else { if (balance - x >= -5000) balance -= x; }     // overdraft rule hidden in an if
    }
};
```

Problems: public data, no invariant, raw pointer with no ownership story (copying would alias or leak), magic numbers, a type code with an `if` instead of polymorphism, non-const getter, silent failure in `withdraw`, no `explicit`.

## The refactoring, in steps

### Step 1: encapsulate and give it an invariant

```cpp run title="Step 1: private data, a valid state, an honest result"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

class BankAccount {
    string owner_;                                   // value member: Rule of Zero, no raw pointer
    double balance_;
public:
    BankAccount(string owner, double opening)
        : owner_(move(owner)), balance_(opening) {
        if (opening < 0) throw invalid_argument("opening balance must be >= 0");
    }
    [[nodiscard]] bool withdraw(double amount) {     // the caller must look at the result
        if (amount <= 0 || amount > balance_) return false;
        balance_ -= amount;
        return true;
    }
    void deposit(double amount) {
        if (amount <= 0) throw invalid_argument("deposit must be positive");
        balance_ += amount;
    }
    double balance() const { return balance_; }
    const string& owner() const { return owner_; }
};

int main() {
    BankAccount a("Asha", 100);
    cout << boolalpha << a.withdraw(30) << " " << a.withdraw(500) << " " << a.balance() << "\n";
}
```

### Step 2: replace the type code with polymorphism (the overdraft rule varies)

The `if (type == 0)` is a variation point. Make the rule a **strategy**, so a new account type needs a new class, not an edit.

```cpp run title="Step 2: the overdraft rule becomes a strategy"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

class OverdraftPolicy {                               // interface
public:
    virtual ~OverdraftPolicy() = default;
    virtual double limit() const = 0;                 // how far below zero the balance may go
};
class NoOverdraft : public OverdraftPolicy {
public:
    double limit() const override { return 0; }
};
class LimitedOverdraft : public OverdraftPolicy {
    double max_;
public:
    explicit LimitedOverdraft(double max) : max_(max) {}
    double limit() const override { return max_; }
};

class BankAccount {
    string owner_;
    double balance_;
    unique_ptr<OverdraftPolicy> policy_;              // owned strategy
public:
    BankAccount(string owner, double opening, unique_ptr<OverdraftPolicy> p)
        : owner_(move(owner)), balance_(opening), policy_(move(p)) {
        if (!policy_) throw invalid_argument("policy required");
        if (opening < -policy_->limit()) throw invalid_argument("opening balance below the overdraft limit");
    }
    [[nodiscard]] bool withdraw(double amount) {
        if (amount <= 0 || balance_ - amount < -policy_->limit()) return false;
        balance_ -= amount;
        return true;
    }
    double balance() const { return balance_; }
};

int main() {
    BankAccount savings("Asha", 100, make_unique<NoOverdraft>());
    BankAccount current("Ravi", 100, make_unique<LimitedOverdraft>(5000));
    cout << boolalpha;
    cout << "savings withdraw 600: " << savings.withdraw(600) << ", balance " << savings.balance() << "\n";
    cout << "current withdraw 600: " << current.withdraw(600) << ", balance " << current.balance() << "\n";
}
```

### Step 3: now it is easy to extend and to test

A new rule is one new class (`class PremiumOverdraft : public OverdraftPolicy`), with no change to `BankAccount`. A test can inject a fake policy. (This is the Strategy pattern, the Open/Closed Principle and dependency injection, all in a dozen lines. You will study each properly in Part II.)

Compare the refactored class with the checklist:

| Checklist item | Original | Refactored |
|---|---|---|
| Invariant stated and enforced | none | constructor + `withdraw` guard |
| Data private | public | private |
| Ownership clear | raw `char*` | `string` value, `unique_ptr` policy |
| Const-correct | no | yes (`balance() const`) |
| Special members | broken default copy | Rule of Zero (copy deleted automatically because of `unique_ptr`) |
| Errors visible | silent | `[[nodiscard]]` result + exceptions in the constructor |
| Open for extension | edit an `if` | add a class |

:::interview "Write a class for X": how do I structure my answer?
"First I state the invariants and whether it is a value or an entity. Then I show the constructor, the public operations as behaviour, the const accessors, and how errors are reported. I use RAII members so I do not need custom copy or destructor code, and I add a virtual destructor only if it is a base class. Finally I point out where it may change in future and how the design handles that (a strategy, a factory)." That structure alone puts you ahead of most candidates.
:::

```quiz
? What is the first thing to decide when designing a class?
- Its method names
+ Its invariant: what must always be true about a valid object
- Its base class
> Everything else (constructor checks, private data, operations) follows from the invariant.
? In the refactoring, why was the `type` code replaced by a strategy object?
- To make the class shorter
+ So that new account rules are added by writing new classes, not by editing a conditional
- Because ints cannot be stored
> This is the Open/Closed idea: open to extension, closed to modification.
```

:::keypoints
- Run the checklist: invariant, value vs entity, private data and behaviour, valid constructor, const-correctness, RAII members, errors, thread-safety, naming.
- Type codes with `if`/`switch` are a design smell: replace them with polymorphism or a strategy.
- A good class is small, has one job, is hard to misuse, and is easy to extend and test.
:::
