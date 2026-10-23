---
title: Composition over inheritance
level: intermediate
time: 35
summary: Why "favour composition over inheritance" is the most repeated LLD advice, shown with the Square/Rectangle problem, the flying-bird explosion, and a stack that wrongly extends a vector, plus how to refactor inheritance into composition and when inheritance is still right.
---

**Inheritance** couples a child to its parent's *implementation*. **Composition** builds an object from other objects and delegates to them, coupling only to their *interface*. Composition is more flexible, so the advice is: *favour composition over inheritance*.

## Problem 1: inheritance that breaks substitutability (Liskov)

Geometry says a square *is a* rectangle. In code, it is not:

```cpp run title="Square inherits Rectangle: the old bug"
#include <iostream>
using namespace std;

class Rectangle {
protected:
    int w_ = 0, h_ = 0;
public:
    virtual ~Rectangle() = default;
    virtual void setWidth(int w)  { w_ = w; }
    virtual void setHeight(int h) { h_ = h; }
    int area() const { return w_ * h_; }
};
class Square : public Rectangle {
public:
    void setWidth(int w) override  { w_ = h_ = w; }      // a square must keep sides equal
    void setHeight(int h) override { w_ = h_ = h; }
};

void stretch(Rectangle& r) {                              // written for rectangles: expects width and height to be independent
    r.setWidth(5);
    r.setHeight(4);
    cout << "area = " << r.area() << " (a 5 x 4 rectangle should give 20)\n";
}

int main() {
    Rectangle r;  stretch(r);
    Square s;     stretch(s);                             // surprise: 16, not 20
}
```

`Square` **cannot be used wherever `Rectangle` is expected** without surprises. That violates the Liskov Substitution Principle (module 9). The fix is not a cleverer override; it is to drop the is-a: both are `Shape`s with an `area()`.

## Problem 2: the inheritance explosion

Imagine birds. Some fly, some swim, some do both, some neither.

```text
Bird
 ├─ FlyingBird ── Sparrow, Eagle
 ├─ SwimmingBird ── Penguin?   (penguins swim but don't fly)
 └─ ??? FlyingSwimmingBird ── Duck   (needs BOTH: multiple inheritance, or a new class per combination)
```

Every new ability multiplies the hierarchy. The way out is to treat abilities as **parts you plug in** (composition + strategy):

```cpp run title="Behaviours as components"
#include <iostream>
#include <memory>
#include <string>
#include <utility>
using namespace std;

struct FlyBehaviour  { virtual ~FlyBehaviour() = default;  virtual string fly() const = 0; };
struct SwimBehaviour { virtual ~SwimBehaviour() = default; virtual string swim() const = 0; };

struct Flies   : FlyBehaviour  { string fly() const override { return "flaps and flies"; } };
struct NoFly   : FlyBehaviour  { string fly() const override { return "cannot fly"; } };
struct Swims   : SwimBehaviour { string swim() const override { return "paddles"; } };
struct NoSwim  : SwimBehaviour { string swim() const override { return "avoids water"; } };

class Bird {
    string name_;
    unique_ptr<FlyBehaviour> flying_;                    // has-a: capabilities are PARTS
    unique_ptr<SwimBehaviour> swimming_;
public:
    Bird(string n, unique_ptr<FlyBehaviour> f, unique_ptr<SwimBehaviour> s)
        : name_(move(n)), flying_(move(f)), swimming_(move(s)) {}
    void describe() const { cout << name_ << ": " << flying_->fly() << ", " << swimming_->swim() << "\n"; }
    void learnToFly() { flying_ = make_unique<Flies>(); }   // behaviour can change AT RUN TIME
};

int main() {
    Bird sparrow("Sparrow", make_unique<Flies>(), make_unique<NoSwim>());
    Bird penguin("Penguin", make_unique<NoFly>(), make_unique<Swims>());
    Bird duck("Duck", make_unique<Flies>(), make_unique<Swims>());      // no new class needed
    sparrow.describe(); penguin.describe(); duck.describe();
    penguin.learnToFly();                                  // impossible with inheritance
    penguin.describe();
}
```

Two big wins: **no class explosion** (combinations are assembled, not coded), and **behaviour can change at run time**. This is the Strategy pattern, one of the most useful patterns in LLD.

## Problem 3: inheriting just to reuse code

```cpp run title="class Stack : public vector<int>: a leaky abstraction"
#include <iostream>
#include <vector>
using namespace std;

class BadStack : public vector<int> {                    // "reuse push_back and pop_back"
public:
    void push(int x) { push_back(x); }
    int pop() { int v = back(); pop_back(); return v; }
};

class GoodStack {                                        // composition: expose ONLY stack operations
    vector<int> items_;
public:
    void push(int x) { items_.push_back(x); }
    int pop() { int v = items_.back(); items_.pop_back(); return v; }
    bool empty() const { return items_.empty(); }
};

int main() {
    BadStack b;
    b.push(1); b.push(2); b.push(3);
    b.insert(b.begin(), 99);                             // a "stack" that allows insertion at the bottom: invariant broken
    cout << "bad stack popped " << b.pop() << ", but its bottom is " << b.front() << "\n";

    GoodStack g;
    g.push(1); g.push(2);
    cout << "good stack popped " << g.pop() << "\n";     // g.insert(...) does not exist
}
```

`BadStack` publicly **is a** `vector`, so it exposes `insert`, `erase`, `operator[]`... The class cannot protect its own rule (LIFO). Also, `std::vector` has no virtual destructor, so deleting through a `vector*` is undefined. Composition hides what you do not want to promise.

## Refactoring inheritance into composition: the recipe

1. Replace the base class with a **member** (or `unique_ptr` to an interface).
2. Add forwarding functions for the operations you **really** want to expose (delegation).
3. If clients need to treat the class polymorphically, extract an **interface** and have both implement it.
4. Move the varying behaviour into **strategy objects** you inject.

## When is inheritance still the right choice?

Use public inheritance when **all** of these hold:

1. It is a true **is-a** and the derived class honours the **entire** contract of the base (substitutable, Liskov).
2. You want **polymorphism**: code that works on `Base&` and gets different behaviour.
3. The base is designed for it: abstract/interface-like, virtual destructor, small and stable.
4. The hierarchy is **shallow** (1 or 2 levels).

The sweet spot: **inherit from interfaces** (pure abstract classes), **compose for implementation**.

| | Inheritance | Composition |
|---|---|---|
| Relationship | is-a | has-a / uses-a |
| Coupling | to the parent's implementation (tight) | to an interface (loose) |
| Change behaviour at run time | no | yes (swap the part) |
| Combine many behaviours | multiple inheritance or class explosion | assemble parts |
| Testing | must build the whole parent | inject fakes |
| Visibility | exposes the parent's whole interface | exposes only what you forward |

:::interview Why favour composition over inheritance?
"Inheritance is the tightest coupling: a derived class depends on its parent's implementation, exposes the parent's whole interface, and is fixed at compile time. Composition depends only on an interface, lets you swap or combine behaviours at run time, and hides what you do not want to promise. I still use inheritance for true is-a relationships, mostly from abstract interfaces, with shallow hierarchies."
:::

```quiz
? What does the Square/Rectangle example show?
- Squares are not shapes
+ An is-a in geometry may not be substitutable in code, so inheritance breaks callers' expectations
- That virtual functions are slow
> Code written for independent width and height breaks when given a Square.
? Which design lets a Penguin learn to fly at run time?
- Subclassing FlyingBird
+ Composing a FlyBehaviour object that can be replaced
- Multiple inheritance
> Behaviour objects can be swapped, unlike a fixed base class.
? Why is `class Stack : public vector<int>` poor design?
- vector is too slow
+ It exposes all vector operations, so the stack's LIFO invariant cannot be protected
- Stacks cannot hold ints
> Composition (a vector member) exposes only push and pop.
```

:::keypoints
- Composition couples to an interface and can change at run time; inheritance couples to implementation and is fixed.
- Square/Rectangle, the bird explosion and `Stack : vector` are the classic examples to cite.
- Inherit from interfaces for polymorphism; compose for reuse. Keep hierarchies shallow.
:::
