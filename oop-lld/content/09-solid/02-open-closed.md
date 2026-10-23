---
title: O: Open/Closed Principle
level: intermediate
time: 30
summary: Software entities should be open for extension but closed for modification. The classic switch-on-type violation, the polymorphic fix, other extension mechanisms in C++, and the balance between this principle and over-engineering.
---

:::def Open/Closed Principle (OCP)
A module should be **open for extension** (you can add new behaviour) but **closed for modification** (you do not edit existing, tested code to do so).
:::

When a new requirement arrives, the cheapest and safest change is to **add new code**, not to **edit working code**. Every edit risks breaking something that already works.

## The classic violation: switch on type

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

The calculator is **not closed** for modification: each new shape forces edits to existing code. This pattern (`switch`/`if-else` on a type code) is the number one OCP violation.

## The fix: polymorphism

Make each shape responsible for its own area behind an interface. The calculator depends only on the interface.

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

## A realistic example: discounts

A shop starts with "10% off for members". Soon: Diwali sale, buy-one-get-one, coupon codes. Without OCP, `calculatePrice()` becomes a forest of `if`s.

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

## Ways to achieve OCP in C++

| Mechanism | Example |
|---|---|
| **Abstract base class / interface** (runtime) | `Shape`, `DiscountRule` |
| **Strategy** object passed in | pricing, sorting order |
| **std::function / lambda** | `sort(v.begin(), v.end(), cmp)`: `sort` is closed, you extend with `cmp` |
| **Templates / concepts** (compile time) | `template <Drawable T> void render(T&)` |
| **Registry / factory** | `map<string, Creator>` so new types register themselves |
| **Decorator** | add behaviour by wrapping, without editing |
| **Callbacks / events** | listeners added from outside |

`std::sort` is a perfect everyday example: it is *closed* (nobody edits it) but *open* (you pass any comparator).

## OCP is about *predicted* change

You cannot close a design against **every** possible change. Choose the changes you expect (from the requirements and experience) and design for those. Then, the first time an unexpected change forces an edit, **refactor** so that kind of change is covered next time. This is "fool me once".

:::warn Do not make everything an interface
Adding an abstraction for something that will never vary is over-engineering (it breaks KISS and YAGNI). If there is one tax rate and nobody expects another, a constant is fine. Abstract where **real variation** exists: you have two or three cases already, or the requirements clearly say more will come.
:::

:::interview How do you recognise an OCP violation?
"A `switch` or an `if/else if` chain over a type code or enum, repeated in several places, so that adding a new case means editing all of them. I replace it with an interface and one class per case, or with a strategy or registry, so a new case is a new class. The existing code stays untouched and tested."
:::

```quiz
? What is the best sign of an OCP violation?
- A class with private members
+ A switch over a type code that must be edited for every new type
- A virtual destructor
> A new case forces editing existing code in several places.
? Which standard function is a good example of OCP?
- `std::swap`
+ `std::sort` with a custom comparator
- `std::move`
> sort never changes, but a comparator extends its behaviour.
? When should you not apply OCP?
- When requirements are known to vary
+ When there is no real variation: an abstraction would be speculative over-engineering
- Never
> Add extension points at real variation points, not everywhere.
```

:::keypoints
- Add behaviour by adding code, not by editing tested code.
- The usual cure for a type-code `switch` is polymorphism: one class per case behind an interface.
- Other mechanisms: strategy, `std::function`, templates, registries, decorators.
- Close against *likely* changes only. Refactor when a surprise change appears.
:::
