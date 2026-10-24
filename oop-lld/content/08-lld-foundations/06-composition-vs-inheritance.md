---
title: Composition over inheritance
level: intermediate
time: 35
summary: Why people say "prefer composition over inheritance", explained with three simple examples (Square and Rectangle, flying birds, and a Stack built on a vector), plus when inheritance is still the right choice.
---

You will hear this line in almost every LLD interview: **"Prefer composition over inheritance."**

Let's understand it without any heavy words.

## First, the two ideas in plain English

- **Inheritance** means "is a". A `Dog` **is an** `Animal`.
- **Composition** means "has a". A `Car` **has an** `Engine`.

Inheritance is like **being born into a family**. You get everything from your parents, whether you want it or not, and you cannot change it later.

Composition is like **building with Lego**. You pick the pieces you want, and you can swap a piece any time.

That is the whole idea. Lego is more flexible, so people prefer it. Now let's see why, with three small examples.

## Example 1: A Square "is a" Rectangle... or is it?

In maths class, a square **is a** rectangle. So we try this in code:

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

Don't try to memorise the code. Just see the problem.

Code that uses a `Rectangle` expects this: "if I set the width to 5 and the height to 4, the area is 20". But when we give it a `Square`, setting the height also changes the width, and the answer is wrong.

So a `Square` **cannot safely replace** a `Rectangle`. (This idea has a name, the Liskov Substitution Principle. We will meet it in module 9.)

The fix is not a clever trick. The fix is to **stop saying "is a"**. Make both of them a `Shape` that can tell its `area()`.

:::note The lesson
"Is a" in real life is not always "is a" in code. Ask: *can I safely use the child everywhere I use the parent?* If not, do not inherit.
:::

## Example 2: Birds that fly, swim, or both

Suppose we make a family of birds.

```text
Bird
 ├─ FlyingBird ── Sparrow, Eagle
 ├─ SwimmingBird ── Penguin?   (penguins swim but don't fly)
 └─ ??? FlyingSwimmingBird ── Duck   (needs BOTH: multiple inheritance, or a new class per combination)
```

See the problem? A penguin swims but does not fly. A duck does both. And what about a robot bird that flies but is not a bird? Each new ability makes the family tree bigger and messier. This is called a **class explosion**.

Here is the Lego way. Make each ability a small **piece**, and give each bird the pieces it needs:

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

Two big benefits:

1. **No explosion.** We join pieces. We do not write a new class for each combination.
2. **We can change behaviour while the program runs.** An injured eagle can swap its "fly" piece for "cannot fly".

This trick (many ways to do one thing, and you can swap them) is the **Strategy pattern**. It is one of the most useful patterns in LLD.

## Example 3: Inheriting only to reuse code

Someone says: "I need a stack. A vector already stores items. Let me inherit from vector!"

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

What went wrong? `BadStack` **is a** `vector`, so it also gives people `insert`, `erase` and `operator[]`. Now anyone can push or remove items from the middle. A stack should only allow "last in, first out", but the class cannot protect that rule.

The fix: **put the vector inside** the class (composition) and give out only `push` and `pop`.

## How to change inheritance into composition

Four easy steps:

1. Remove the parent class. Keep it as a **member** instead.
2. Write small methods that pass the call on to the member, only for the things you want to allow. (This is called **delegation**.)
3. If other code needs to treat different classes the same way, make a small **interface** and let each class follow it.
4. Move the parts that change into small objects you pass in (strategies).

## When is inheritance still the right choice?

Use inheritance only when **all** of these are true:

1. It is a real "is a", and the child works correctly everywhere the parent works.
2. You want **polymorphism** (one piece of code that works with many types, like a loop over `Shape` objects).
3. The parent is made for it: an interface or a small, stable base with a virtual destructor.
4. The family is **shallow** (one or two levels).

A good rule to remember: **inherit from interfaces, and use composition for everything else.**

| | Inheritance | Composition |
|---|---|---|
| Meaning | "is a" | "has a" |
| How tightly joined? | very tight | loose |
| Change at run time? | no | yes, swap a piece |
| Many combinations | class explosion | just join pieces |
| Testing | need the whole parent | plug in a fake |
| What others see | everything the parent has | only what you choose |

## Short answer to say in an interview

:::interview Why do we prefer composition over inheritance?
"Inheritance joins the child tightly to the parent. The child gets everything the parent has and cannot change it later. With composition I build a class from small parts, expose only what I want, and swap parts at run time. I still use inheritance for real 'is a' relationships, mostly from interfaces."
:::

```quiz
? What does the Square and Rectangle example teach?
- Squares are not shapes
+ "Is a" in maths may not be safe in code, because the child can surprise code written for the parent
- Virtual functions are slow
> Code that sets width and height separately breaks with a Square.
? Which design lets a Penguin change how it moves while the program runs?
- A subclass of FlyingBird
+ A behaviour object that can be swapped
- Multiple inheritance
> Pieces can be swapped. A parent class cannot.
? Why is class Stack : public vector<int> a poor idea?
- vector is slow
+ It also exposes insert, erase and [], so the stack rule cannot be protected
- A stack cannot hold ints
> Put a vector inside and expose only push and pop.
```

:::keypoints
- Inheritance means "is a" and is a tight link. Composition means "has a" and is a loose link.
- Classic examples to remember: Square and Rectangle, the bird class explosion, Stack built on vector.
- Inherit from interfaces. Use composition to reuse code. Keep families shallow.
:::
