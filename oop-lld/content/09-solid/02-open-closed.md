---
title: "O: Open/Closed Principle"
level: intermediate
time: 30
summary: Add new features by adding new code, not by editing old working code. The common "switch on type" problem, the fix with interfaces, a discount example, and when not to use it.
---

**O** in SOLID stands for **Open/Closed Principle**.

Don't memorise the definition yet. Think of it like this:

> "When a new requirement comes, can I add **new code** for it, without touching the **old code that already works**?"

If yes, your design follows the principle.

:::def Open/Closed Principle (OCP)
A class should be **open for extension** (you can add new behaviour) but **closed for modification** (you do not need to edit the old, tested code to add it).
:::

Why does this matter? Every time you edit working code, you risk breaking something that was fine. Adding a new class is much safer.

:::analogy Think of a phone charger socket
Your wall socket does not change when you buy a new phone. You just plug in a new charger. The socket is **closed** (nobody rewires it) but **open** (any new device can plug in).
:::

## The most common mistake: switch on type

```cpp run title="Every new shape means editing AreaCalculator"
#include <iostream>
#include <vector>
using namespace std;

enum class ShapeType { Circle, Rectangle };

struct Shape {
    ShapeType type;
    double a, b;                // radius, or width and height
};

class AreaCalculator {
public:
    double area(const Shape& s) const {
        switch (s.type) {
            case ShapeType::Circle:    return 3.14159 * s.a * s.a;
            case ShapeType::Rectangle: return s.a * s.b;
        }
        return 0;
    }
    // To add Triangle: edit the enum, edit this switch, and edit EVERY other place that switches on ShapeType:
    // perimeter(), draw(), serialise()... Miss one and the bug appears at run time.
};

int main() {
    vector<Shape> shapes{{ShapeType::Circle, 1, 0}, {ShapeType::Rectangle, 3, 4}};
    double total = 0;
    for (const auto& s : shapes) total += AreaCalculator().area(s);
    cout << "total " << total << "\n";
}
```

What is the problem? Each time we add a new shape (say a triangle), we must **open `AreaCalculator` and edit it**. If this `switch` is repeated in five places in the project, we must edit all five. Miss one and we have a bug.

A `switch` or `if / else if` chain on a "type" is the number one sign that OCP is broken.

## The fix: let each shape do its own job

Give every shape an `area()` method behind a common interface. The calculator then just calls `area()`. It does not care which shape it is.

```cpp run title="New shapes are new classes; nothing existing changes"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;
};
class Circle : public Shape {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }
};
class Rectangle : public Shape {
    double w_, h_;
public:
    Rectangle(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
};

// Added LATER, in a different file, without touching anything above or below:
class Triangle : public Shape {
    double b_, h_;
public:
    Triangle(double b, double h) : b_(b), h_(h) {}
    double area() const override { return 0.5 * b_ * h_; }
};

class AreaCalculator {                                   // closed for modification: never edited again
public:
    double total(const vector<unique_ptr<Shape>>& shapes) const {
        double t = 0;
        for (const auto& s : shapes) t += s->area();
        return t;
    }
};

int main() {
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(1));
    shapes.push_back(make_unique<Rectangle>(3, 4));
    shapes.push_back(make_unique<Triangle>(6, 2));         // new type, zero edits elsewhere
    cout << "total " << AreaCalculator().total(shapes) << "\n";
}
```

Here is the picture:

```viz algo=uml title="The calculator depends on the abstraction"
interface Shape
  + area(): double
class Circle
class Rectangle
class Triangle
class AreaCalculator
  + total(shapes: Shape[]): double
Circle ..|> Shape
Rectangle ..|> Shape
Triangle ..|> Shape
AreaCalculator --> Shape
```

Now to add a triangle, we write a new `Triangle` class. The calculator does not change at all.

## A more real example: discounts

A shop starts with "10% off for members". Then come a Diwali sale, buy-one-get-one, and coupon codes. If we use `if` statements, the price function becomes a big mess.

```cpp run title="Discount rules as extensions"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Cart { double total; bool member; int items; };

class DiscountRule {
public:
    virtual ~DiscountRule() = default;
    virtual double discount(const Cart& c) const = 0;    // amount to subtract
    virtual string name() const = 0;
};
class MemberDiscount : public DiscountRule {
public:
    double discount(const Cart& c) const override { return c.member ? c.total * 0.10 : 0; }
    string name() const override { return "member 10%"; }
};
class BulkDiscount : public DiscountRule {
public:
    double discount(const Cart& c) const override { return c.items >= 5 ? 100 : 0; }
    string name() const override { return "bulk Rs100 off"; }
};
class FestivalDiscount : public DiscountRule {           // the new requirement: just a new class
public:
    double discount(const Cart& c) const override { return c.total * 0.05; }
    string name() const override { return "festival 5%"; }
};

class PriceCalculator {
    vector<unique_ptr<DiscountRule>> rules_;
public:
    void addRule(unique_ptr<DiscountRule> r) { rules_.push_back(move(r)); }
    double finalPrice(const Cart& c) const {
        double price = c.total;
        for (const auto& r : rules_) {
            double d = r->discount(c);
            if (d > 0) cout << "  applied " << r->name() << ": -" << d << "\n";
            price -= d;
        }
        return price;
    }
};

int main() {
    PriceCalculator calc;
    calc.addRule(make_unique<MemberDiscount>());
    calc.addRule(make_unique<BulkDiscount>());
    calc.addRule(make_unique<FestivalDiscount>());       // plug in; PriceCalculator is untouched
    double price = calc.finalPrice({1000, true, 6});
    cout << "final: " << price << "\n";
}
```

Each discount is a small class. New discount means a new class. The price function stays the same.

## Ways to follow OCP in C++

| Tool | Example |
|---|---|
| Interface (abstract class) | `Shape`, `DiscountRule` |
| Strategy (pass in a behaviour) | pricing rule, sort order |
| `std::function` or lambda | `sort(v.begin(), v.end(), cmp)` |
| Templates | `template <Drawable T> void render(T&)` |
| Registry or factory | a map from name to "how to create" |
| Decorator (wrap to add behaviour) | add logging without editing the old class |
| Callbacks or events | listeners added from outside |

`std::sort` is a nice everyday example. Nobody edits `sort` (it is closed), but you can pass any comparison you like (it is open).

## You cannot close everything

You cannot protect your code from **every** future change. So guess the changes that are **likely** (from the requirements and from experience) and prepare for those. If a surprise change comes later, refactor the code then, so that kind of change is easy next time.

:::warn Do not make everything an interface
If something will never change, keep it simple. If there is only one tax rate and nobody expects another, a constant is enough. Add an interface only where there is **real variation**: you already have two or three cases, or the requirements clearly say more will come.
:::

## Short answer to say in an interview

:::interview How do you recognise an OCP violation?
"I look for a switch or if-else chain on a type, repeated in many places, so that every new case means editing old code. I fix it by creating an interface and one class per case, so a new case becomes a new class. The old code stays untouched and tested."
:::

```quiz
? What is the best sign that OCP is broken?
- A class with private members
+ A switch on a type that must be edited for every new type
- A virtual destructor
> Every new case forces edits in old code.
? Which standard function is a good example of OCP?
- std::swap
+ std::sort with your own comparison
- std::move
> sort never changes, but you can change its behaviour by passing a comparison.
? When should you not use OCP?
- When requirements clearly change
+ When nothing will really vary, because it only adds extra complexity
- Never
> Add flexibility only where change is likely.
```

:::keypoints
- Add new behaviour by adding new code, not by editing old tested code.
- The usual cure for a "switch on type" is an interface with one class per case.
- Other tools: strategy, `std::function`, templates, registry, decorator.
- Prepare only for **likely** changes. Refactor when a surprise change comes.
:::
