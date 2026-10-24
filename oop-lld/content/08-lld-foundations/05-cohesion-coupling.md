---
title: Cohesion, coupling and the Law of Demeter
level: intermediate
time: 35
summary: The two ideas behind almost every good design, explained with before-and-after code. Cohesion (one class, one job), coupling (depend on as little as possible), the Law of Demeter, and DRY, KISS and YAGNI.
---

Almost every design rule you will learn comes from just two ideas.

- **High cohesion:** things that belong together stay together. One class does **one** job.
- **Low coupling:** classes depend on each other as **little** as possible.

:::analogy Think of a kitchen
A good kitchen has stations: grill, salad, dessert. Each station has everything for its own job (that is **cohesion**). The stations pass plates through a small window. They do not walk into each other's area (that is **low coupling**). If the dessert chef needs to know how the grill works, then one small change breaks everything.
:::

## Cohesion: "does this class have one job?"

| | What you see | Example |
|---|---|---|
| **High cohesion** (good) | all methods work on the same data and serve one purpose | `Money`: add, subtract, compare |
| **Low cohesion** (bad) | unrelated things are mixed together | `Utils`, `Manager`, `Helper`, `Common` |

Here is a class with low cohesion:

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

This one class has **five reasons to change**: the rules, the tax, the invoice format, the storage, and the email. If anyone touches any one of them, the whole class is at risk.

Now the same code, split by job:

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

Now a tax change touches only `TaxCalculator`. Switching from email to SMS touches only the sender. And you can test each class alone.

## Coupling: "how much does this class need to know about others?"

Coupling means how much one class **depends on** another. Here is the list from worst to best:

| Kind | What it looks like |
|---|---|
| **Worst**: reaching inside | one class reads another's private data (through public fields, `friend`, or casts) |
| **Bad**: shared global | many classes use the same global or singleton |
| **Okay**: concrete class | `Order` holds an `EmailSender` directly |
| **Good**: interface | `Order` holds an `ISender&` and does not know who is behind it |
| **Best**: only plain data | classes just pass simple values (a message struct) |

The goal is **not zero coupling**, because classes must work together. The goal is **loose coupling**: they talk through small, clear interfaces.

## The Law of Demeter: "talk only to your close friends"

A method should call only:

- its own methods and data,
- its parameters,
- objects it creates itself,
- its direct members.

It should **not** reach through one object to get to another. The warning sign is a long chain: `a.getB().getC().doIt()`.

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

Why is the second way better? Suppose `Customer` starts paying with a `UpiAccount` instead of a `Wallet`. With the chain, **every place** that wrote `c.wallet().pay(...)` breaks. With `c.pay(...)`, only the `Customer` class changes.

This is also called **"tell, don't ask"**: tell the object what you want. Do not pull out its parts and do the work yourself.

## DRY, KISS and YAGNI

| Rule | In simple words | The trap |
|---|---|---|
| **DRY** (Don't Repeat Yourself) | keep each piece of knowledge in one place | joining two pieces of code that only *look* the same but change for different reasons |
| **KISS** (Keep It Simple) | choose the simplest design that works | adding patterns "just in case" |
| **YAGNI** (You Aren't Gonna Need It) | do not build what you do not need yet | adding extension points for every imaginary future |

A good interview answer finds a balance: make the **likely** changes easy, and keep everything else simple. For example: "Pricing rules change often, so I add an interface there. The tax rate is a constant, so I do not."

## Quick self-check for any class

1. Can I describe its job in one sentence **without the word "and"**? (cohesion)
2. Can I test it without building half the system? (coupling)
3. If one requirement changes, how many classes must change? (ideally one)
4. Does it use long chains like `a.b().c().d()`? (Demeter)

## Short answer to say in an interview

:::interview What are cohesion and coupling? Which do you want?
"Cohesion is how well the parts of a class belong together. Coupling is how much classes depend on each other. I want high cohesion, meaning each class has one clear job, and low coupling, meaning classes depend on small interfaces and not on each other's insides. That makes the code easy to change and easy to test."
:::

```quiz
? Which one describes high cohesion?
- A class with many unrelated helper methods
+ A class whose members all serve one clear job
- A class with no data
> High cohesion means one reason to change.
? What does a.getB().getC().run() break?
- DRY
+ The Law of Demeter
- YAGNI
> The caller depends on the insides of two other classes.
? Which kind of coupling is better?
- Depending on a concrete class
+ Depending on an interface
- Sharing a global variable
> With an interface you can change the implementation without touching the callers.
```

:::keypoints
- High cohesion: one class, one job. Low coupling: depend on small interfaces, not on insides.
- Law of Demeter ("tell, don't ask"): talk to your direct collaborators. Do not reach through them.
- DRY, KISS, YAGNI: no repeated knowledge, keep it simple, and do not build for imaginary futures.
:::
