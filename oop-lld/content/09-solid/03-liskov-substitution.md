---
title: L: Liskov Substitution Principle
level: advanced
time: 35
summary: Subtypes must be usable wherever their base type is expected, the contract rules (preconditions, postconditions, invariants), classic violations (Rectangle/Square, a read-only list, a non-refundable payment), how to detect and fix them, and the role of substitutability in polymorphism.
---

:::def Liskov Substitution Principle (LSP)
If `S` is a subtype of `T`, then objects of type `T` may be **replaced by objects of type `S`** without breaking the correctness of the program. In plain words: **a derived class must be usable anywhere the base class is expected, with no surprises.**
:::

Inheritance in C++ lets the compiler accept any `Derived` where a `Base&` is needed. LSP is about whether the **behaviour** is acceptable, not just the types.

## The contract view

Think of a base class as a **contract** with its callers. A derived class may keep the contract, or give *more*; it may never give *less*.

| Contract part | Rule for the derived class |
|---|---|
| **Preconditions** (what the caller must provide) | may be **weaker** (accept more), never **stronger** (demand more) |
| **Postconditions** (what the function guarantees) | may be **stronger** (promise more), never **weaker** |
| **Invariants** (what is always true about the object) | must be **preserved** |
| **Exceptions / errors** | must not throw new kinds of errors the base never mentioned |
| **History** | must not allow state changes the base forbids (e.g. mutating an immutable base) |

## Violation 1: strengthened precondition

```cpp run title="A derived class that demands more than the base"
#include <iostream>
#include <memory>
#include <stdexcept>
using namespace std;

class Transfer {
public:
    virtual ~Transfer() = default;
    // Contract: accepts any amount > 0
    virtual void send(double amount) const { cout << "  sent " << amount << "\n"; }
};

class LimitedTransfer : public Transfer {
public:
    void send(double amount) const override {
        if (amount > 1000) throw runtime_error("limit exceeded");     // NEW restriction: strengthened precondition
        Transfer::send(amount);
    }
};

void payRent(const Transfer& t) { t.send(5000); }                     // legitimate for any Transfer, by the base contract

int main() {
    payRent(Transfer());
    try { payRent(LimitedTransfer()); }
    catch (const exception& e) { cout << "  program broke: " << e.what() << "\n"; }
}
```

`payRent` was correct for `Transfer`. Substituting `LimitedTransfer` breaks it. The subtype is not substitutable.

## Violation 2: a subtype that refuses behaviour

A common beginner structure: `Bird` has `fly()`, `Penguin` inherits and throws.

```cpp run title="Penguin throws: the Bird contract is broken"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>
using namespace std;

class Bird {
public:
    virtual ~Bird() = default;
    virtual void fly() const { cout << "  flap flap\n"; }
};
class Sparrow : public Bird {};
class Penguin : public Bird {
public:
    void fly() const override { throw logic_error("penguins cannot fly"); }     // refuses to honour the contract
};

void migrate(const vector<unique_ptr<Bird>>& flock) {
    for (const auto& b : flock) b->fly();               // assumes every Bird can fly
}

int main() {
    vector<unique_ptr<Bird>> flock;
    flock.push_back(make_unique<Sparrow>());
    flock.push_back(make_unique<Penguin>());
    try { migrate(flock); } catch (const exception& e) { cout << "  crash: " << e.what() << "\n"; }
}
```

**Smell:** an override that throws "not supported", returns a dummy value, or does nothing. It tells you the base class promises too much.

## The fix: put capabilities in the right places

Not every `Bird` can fly, so `fly()` does not belong on `Bird`. Model the capability separately.

```cpp run title="Restructured hierarchy: only flying things promise fly()"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Bird {
public:
    virtual ~Bird() = default;
    virtual const char* name() const = 0;
};
class FlyingBird : public Bird {                        // the capability has its own type
public:
    virtual void fly() const = 0;
};

class Sparrow : public FlyingBird {
public:
    const char* name() const override { return "sparrow"; }
    void fly() const override { cout << "  sparrow flaps\n"; }
};
class Penguin : public Bird {                           // no fly(): nothing to refuse
public:
    const char* name() const override { return "penguin"; }
};

void migrate(const vector<FlyingBird*>& flock) { for (auto* b : flock) b->fly(); }    // only accepts birds that can fly

int main() {
    Sparrow s; Penguin p;
    vector<FlyingBird*> flock{&s};                       // a Penguin cannot even be added: caught at compile time
    migrate(flock);
    cout << "  " << p.name() << " stays on the ground\n";
}
```

The mistake is caught at **compile time** now. Whenever you can turn a LSP bug into a type error, do it.

## Violation 3: mutating an immutable base

The Rectangle/Square problem you saw earlier is of this kind: `Square` adds an invariant (`w == h`) that `Rectangle`'s callers do not expect, and `setWidth` stops behaving as promised (postcondition: height unchanged). Fixes: do not inherit; make both immutable value types, or both implement `Shape` with just `area()`.

```cpp run title="Immutable shapes: no setters, no problem"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Shape { public: virtual ~Shape() = default; virtual double area() const = 0; };
class Rectangle : public Shape {
    double w_, h_;
public:
    Rectangle(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
};
class Square : public Shape {                            // a sibling, not a child
    double s_;
public:
    explicit Square(double s) : s_(s) {}
    double area() const override { return s_ * s_; }
};

int main() {
    vector<unique_ptr<Shape>> v;
    v.push_back(make_unique<Rectangle>(5, 4));
    v.push_back(make_unique<Square>(4));
    for (const auto& s : v) cout << s->area() << " ";
    cout << "\n";
}
```

## Detecting LSP violations: a contract test

A powerful technique: write **one test suite against the base contract** and run it on *every* subclass. If any subclass fails, it is not substitutable.

```cpp run title="One contract test, run on every implementation"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Stack {                                            // contract: LIFO; pop on empty returns false
public:
    virtual ~Stack() = default;
    virtual void push(int x) = 0;
    virtual bool pop(int& out) = 0;
};
class VectorStack : public Stack {
    vector<int> v_;
public:
    void push(int x) override { v_.push_back(x); }
    bool pop(int& out) override { if (v_.empty()) return false; out = v_.back(); v_.pop_back(); return true; }
};
class BrokenQueueStack : public Stack {                  // pops from the FRONT: violates LIFO
    vector<int> v_;
public:
    void push(int x) override { v_.push_back(x); }
    bool pop(int& out) override { if (v_.empty()) return false; out = v_.front(); v_.erase(v_.begin()); return true; }
};

bool satisfiesContract(Stack& s) {                       // the contract, written once
    s.push(1); s.push(2); s.push(3);
    int a = 0, b = 0, c = 0, d = 0;
    return s.pop(a) && a == 3 && s.pop(b) && b == 2 && s.pop(c) && c == 1 && !s.pop(d);
}

int main() {
    VectorStack good; BrokenQueueStack bad;
    cout << "VectorStack satisfies the Stack contract: " << boolalpha << satisfiesContract(good) << "\n";
    cout << "BrokenQueueStack satisfies it:            " << satisfiesContract(bad) << "\n";
}
```

## Red flags checklist

- An override that **throws** an exception the base does not declare, or "not implemented".
- An override that **does nothing** where the base does something.
- A subclass that **narrows** accepted inputs (stronger precondition).
- Callers do `if (dynamic_cast<Special*>(p))` to avoid a subclass's quirks.
- A subclass that **changes** state the base promises is constant.
- A base-class function documented "except for class X".

:::interview What is the Liskov Substitution Principle? Give an example of a violation.
"A subtype must be usable wherever its base is expected, honouring the base's contract: preconditions no stronger, postconditions no weaker, invariants kept. The classic violation is making `Square` inherit `Rectangle`: code that sets width and height independently breaks. Another is `Penguin` inheriting `Bird::fly()` and throwing. I fix these by restructuring: separate the capability into its own interface, or make them siblings under a smaller common base."
:::

```quiz
? Which change in a derived class violates LSP?
- Returning a more specific type (covariant return)
+ Throwing "not supported" from an overridden method
- Adding a new method
> Callers of the base cannot expect the refusal; the override breaks the contract.
? Preconditions in a subtype may be...
- stronger
+ weaker or the same
- unrelated
> A subtype may accept more inputs, never fewer.
? What is a good practical way to find LSP violations?
- Code review only
+ Run one contract test suite against every implementation of the base
- Make everything final
> If any subclass fails the base contract tests, it is not substitutable.
```

:::keypoints
- A subtype must be usable anywhere its base is expected: weaker or equal preconditions, stronger or equal postconditions, invariants preserved, no new error types.
- Smells: overrides that throw/do nothing, `dynamic_cast` on callers, "except for class X".
- Fixes: separate capabilities into their own interfaces, use siblings instead of a parent/child, prefer immutability, and test the contract against all subclasses.
:::
