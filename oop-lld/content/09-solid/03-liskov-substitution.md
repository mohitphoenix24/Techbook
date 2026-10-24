---
title: "L: Liskov Substitution Principle"
level: intermediate
time: 35
summary: If a child class replaces its parent, the program should still work correctly. Simple examples (Penguin and Bird, a limited transfer, shapes), how to fix them, and an easy test to catch the problem.
---

**L** in SOLID stands for **Liskov Substitution Principle**, or **LSP**. The name sounds scary, but the idea is simple.

Don't memorise the formal definition yet. Think of it as one question:

> "If I say **B is an A**, can I safely replace an A with B?"

If the answer is **yes**, the design is fine. If the code breaks or behaves in a surprising way, the design is wrong.

:::def Liskov Substitution Principle (LSP)
Wherever your code uses a parent object, you should be able to give it a child object **and the code should still work correctly**. The child should not surprise the code that is using the parent.
:::

## A real-life picture

You hire a driver. The job is "drive me to the office". If the company sends a new driver, you expect that he can also drive.

Now imagine they send someone who says "I can sit in the car, but I do not drive". He is called a driver, but he **cannot replace** the old driver. That is exactly what LSP is about.

In C++, the compiler will happily accept any child where a parent is expected. But the compiler only checks **types**. It does not check **behaviour**. LSP is about behaviour.

## A simple way to think: promise

Think of the parent class as making a **promise** to the people who use it. A child class is allowed to keep the promise. But it must not break it. In simple terms:

1. **Do not ask for more.** If the parent accepts any amount, the child should not suddenly refuse some amounts.
2. **Do not give less.** If the parent promises a result, the child must give that result.
3. **Do not surprise.** Do not throw strange errors or do nothing where the parent did something.

## Problem 1: the child asks for more

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

`payRent` was fine with a normal `Transfer`. But when we give it a `LimitedTransfer` (which refuses big amounts), it fails. The child is **not a safe replacement** for the parent.

## Problem 2: the child refuses to do the job

A very common mistake: a `Bird` class has `fly()`. Then `Penguin` inherits from `Bird`... and has to throw an error in `fly()`, because penguins cannot fly.

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

Warning sign: **a child that says "not supported", does nothing, or returns a fake value.** It means the parent promised too much.

## The fix: put each ability in the right place

Not every bird can fly. So `fly()` should not be in `Bird`. Put the ability in a separate place.

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

Now if we try to make a penguin fly, the program **does not even compile**. Whenever you can change a runtime surprise into a compile error, do it. It is much safer.

## Problem 3: the Square and Rectangle problem

We already saw this one. A `Square` that inherits from `Rectangle` breaks code that sets width and height separately.

The easy fix is to make the shapes **unchangeable** (no setters). Then there is no problem.

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

## A simple way to catch the problem: one test for all children

Write **one test** based on what the parent promises. Then run that same test on **every child**. If any child fails the test, it is not a safe replacement.

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

## Warning signs

- A child method that **throws** "not implemented".
- A child method that **does nothing** where the parent does something.
- A child that **accepts fewer inputs** than the parent.
- Code that asks `if (it is a Penguin)` to avoid a child's problem.
- A comment like "works for all except class X".

:::note Advanced (optional): the formal words
You may hear these terms in some books. They only say the same three rules above in formal language.

- **Preconditions** (what the caller must give): a child may accept the same or more, never less.
- **Postconditions** (what the method promises): a child may promise the same or more, never less.
- **Invariants** (things that must always stay true): a child must keep them.

You do not need these words for most interviews. The simple question "can I safely replace the parent with the child?" is enough.
:::

## Short answer to say in an interview

:::interview What is the Liskov Substitution Principle? Give an example.
"It means that if I replace a parent object with a child object, the program should still work correctly. The child should not surprise the code using the parent. For example, if Penguin inherits from Bird and throws an error in fly(), then code that uses a Bird breaks. To fix it, I take fly() out of Bird and put it only in the classes that can really fly."
:::

```quiz
? Which change in a child class breaks LSP?
- Adding a new method
+ Throwing "not supported" from a method that the parent promises to do
- Using a more specific return type
> Code that uses the parent does not expect the refusal.
? A child class should accept...
- fewer inputs than the parent
+ the same inputs as the parent, or more
- completely different inputs
> It must work wherever the parent worked.
? What is a good practical way to find LSP problems?
- Hope for the best
+ Write one test for the parent's promise and run it on every child
- Make everything final
> If any child fails the test, it is not a safe replacement.
```

:::keypoints
- Simple test: "If B is an A, can I safely use B wherever I use A?"
- Do not ask for more, do not give less, do not surprise.
- Warning signs: children that throw "not supported", do nothing, or need special checks in the calling code.
- Fix by moving abilities into the classes that really have them, using separate interfaces, or using unchangeable (immutable) shapes.
:::
