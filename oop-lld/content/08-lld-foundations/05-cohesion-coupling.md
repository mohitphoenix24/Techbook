---
title: Cohesion, coupling and the Law of Demeter
level: intermediate
time: 35
summary: The two forces behind every good design, with a runnable example of low-cohesion and high-coupling code made better, the Law of Demeter, tell-don't-ask, and the everyday principles DRY, KISS and YAGNI.
---

Every design principle in this course is an application of two ideas:

- **High cohesion:** things that change together live together. Each class does **one** thing.
- **Low coupling:** classes depend on each other as **little** as possible, and only through stable interfaces.

:::analogy Think of it like this
A well-run kitchen has stations: grill, salad, desserts. Each station is **cohesive** (everything for one job is at hand). Stations pass plates through a **narrow window**, not by walking into each other's area (**low coupling**). If the dessert chef has to know how the grill works, one change breaks everything.
:::

## Cohesion

| Cohesion | Symptom | Example |
|---|---|---|
| **High** (good) | every method uses the class's data; the class has one reason to change | `Money`: add, subtract, compare |
| **Low** (bad) | unrelated methods bundled together; some methods use only some fields | `Utils`, `Manager`, `Helper`, `Common` |

```cpp run title="Low cohesion: a class that does everything"
#include <iostream>
#include <string>
using namespace std;

// One class: validates, computes price, formats text, saves to "disk", sends email.
// Any change to tax rules, the invoice layout, storage or email touches THIS class.
class OrderProcessor {
public:
    bool validate(double qty, double price) { return qty > 0 && price > 0; }
    double total(double qty, double price) { return qty * price * 1.18; }                // tax rule inside
    string format(double total) { return "INVOICE total=" + to_string(total); }
    void save(const string& text) { cout << "  saved to file: " << text << "\n"; }
    void email(const string& text) { cout << "  emailed: " << text << "\n"; }
};

int main() {
    OrderProcessor p;
    if (p.validate(2, 500)) {
        string inv = p.format(p.total(2, 500));
        p.save(inv);
        p.email(inv);
    }
}
```

This class has **five reasons to change** (validation rules, tax, invoice format, storage, email). That is low cohesion.

```cpp run title="High cohesion: each class has one job"
#include <iostream>
#include <string>
using namespace std;

struct OrderLine { double qty, price; };

class OrderValidator { public: bool valid(const OrderLine& l) const { return l.qty > 0 && l.price > 0; } };
class TaxCalculator  { public: double withTax(double amount) const { return amount * 1.18; } };
class InvoiceFormatter { public: string format(double total) const { return "INVOICE total=" + to_string(total); } };

struct InvoiceStore  { virtual ~InvoiceStore() = default;  virtual void save(const string&) = 0; };
struct InvoiceSender { virtual ~InvoiceSender() = default; virtual void send(const string&) = 0; };
struct FileStore  : InvoiceStore  { void save(const string& t) override { cout << "  saved to file: " << t << "\n"; } };
struct EmailSender : InvoiceSender { void send(const string& t) override { cout << "  emailed: " << t << "\n"; } };

class OrderService {                                             // a coordinator, with the details delegated
    OrderValidator validator_; TaxCalculator tax_; InvoiceFormatter formatter_;
    InvoiceStore& store_; InvoiceSender& sender_;
public:
    OrderService(InvoiceStore& st, InvoiceSender& se) : store_(st), sender_(se) {}
    void place(const OrderLine& l) {
        if (!validator_.valid(l)) { cout << "  invalid order\n"; return; }
        string inv = formatter_.format(tax_.withTax(l.qty * l.price));
        store_.save(inv);
        sender_.send(inv);
    }
};

int main() {
    FileStore store; EmailSender sender;
    OrderService svc(store, sender);
    svc.place({2, 500});
    svc.place({0, 500});
}
```

Now a change to the tax rule touches only `TaxCalculator`. Swapping email for SMS touches only the sender. Each class can be tested alone.

## Coupling

Coupling is how much one class **knows about** or **depends on** another. From worst to best:

| Coupling level | What it looks like |
|---|---|
| **Content** (worst) | one class reaches into another's private data (via public fields, friends, casts) |
| **Global** | classes share global/static state (a Singleton used everywhere) |
| **Concrete class** | `Order` holds an `EmailSender` object directly and calls it |
| **Interface** (good) | `Order` holds an `ISender&` and does not know the implementation |
| **Data only** (best) | classes exchange plain values (a message struct) |

The goal is **not zero coupling** (objects must collaborate) but **loose, explicit, via interfaces**.

## The Law of Demeter ("talk only to your friends")

A method should call only: its own members, its parameters, objects it creates, and its direct members. Not "a friend of a friend". The smell is a **train wreck**: `a.getB().getC().doIt()`.

```cpp run title="Law of Demeter violation and fix"
#include <iostream>
#include <string>
using namespace std;

class Wallet {
    double money_ = 500;
public:
    bool pay(double x) { if (x > money_) return false; money_ -= x; return true; }
    double money() const { return money_; }
};
class Customer {
    Wallet wallet_;
public:
    Wallet& wallet() { return wallet_; }                         // exposes the inside
    bool pay(double x) { return wallet_.pay(x); }                // behaviour: hides the inside
};

int main() {
    Customer c;
    // BAD: the shop reaches through the customer into the wallet (it knows Customer has a Wallet)
    cout << "bad : " << c.wallet().pay(200) << "\n";
    // GOOD: the shop talks only to the customer
    cout << "good: " << c.pay(200) << " left " << c.wallet().money() << "\n";
}
```

If `Customer` later pays with a `UpiAccount` instead of a `Wallet`, every `c.wallet().pay(...)` call site breaks. With `c.pay(...)` only one class changes. **Tell, don't ask** is the same idea.

## DRY, KISS, YAGNI

| Principle | Meaning | Trap |
|---|---|---|
| **DRY** (Don't Repeat Yourself) | each piece of knowledge has **one** home | merging code that only *looks* alike but changes for different reasons (wrong abstraction) |
| **KISS** (Keep It Simple) | the simplest design that works | over-engineering with patterns "just in case" |
| **YAGNI** (You Aren't Gonna Need It) | do not build features until needed | designing every extension point on day one |

A good LLD answer balances them: make the **likely** changes easy (variation points you identified from the requirements), and leave the rest simple. "I would add an interface here because pricing rules change often; I would **not** add one for the tax rate: a constant is enough."

## Measuring your design

Ask these quick questions about any class:

1. Can I describe its job in one sentence *without "and"*? (cohesion)
2. Can I test it without building half the system? (coupling)
3. If requirement X changes, how many classes change? (ideally one)
4. Does it call chains like `a.b().c().d()`? (Demeter)

:::interview Define cohesion and coupling. Which do you want?
"Cohesion is how strongly the parts of a module belong together; coupling is how much modules depend on each other. I want **high cohesion** (one clear responsibility per class) and **low coupling** (dependencies through small interfaces, passed in from outside). Together they make a design easy to change and test."
:::

```quiz
? Which describes high cohesion?
- A class with many unrelated helper methods
+ A class whose members all serve a single, clear responsibility
- A class with no data
> High cohesion = one reason to change.
? What does `a.getB().getC().run()` violate?
- DRY
+ The Law of Demeter
- YAGNI
> The caller depends on the internal structure of two other classes.
? Which coupling is preferable?
- Depending on a concrete class
+ Depending on an interface
- Sharing a global variable
> Interfaces let you change the implementation without touching callers.
```

:::keypoints
- High cohesion (one job per class) and low coupling (small interfaces) drive every other principle.
- Law of Demeter / tell-don't-ask: talk to your direct collaborators; give them commands.
- DRY, KISS, YAGNI: remove duplication of knowledge, keep it simple, and do not build for imaginary futures.
:::
