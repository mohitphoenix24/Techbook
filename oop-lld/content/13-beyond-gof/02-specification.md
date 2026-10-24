---
title: Specification
level: intermediate
time: 30
summary: Turn each business rule into a small object that you can combine with AND, OR and NOT. See a product filter, a lambda version, and why this is better than writing a new function for every combination.
---

## What is the Specification pattern?

Don't memorise the definition yet. Think of it like this:

> "A rule is just a question: **'does this item pass?'** I put each rule in its own small box, and I can join boxes with AND, OR and NOT."

:::analogy Think of shopping filters
On a shopping app you tick "Red", "Size M" and "Under ₹1000". Each filter is a small rule. The app joins them with AND. If you also tick "or Blue", it joins with OR. Nobody writes a new function for every possible combination.
:::

:::def Specification
A **business rule as a small object** that answers one question: *"does this item satisfy me?"* You can **combine** such objects using AND, OR and NOT to make bigger rules.
:::

## The problem: too many filter functions

An online shop wants to find products by colour, by size, by colour **and** size, by price, by colour and size and price... Each new combination needs another function, or one function with many flags.

```cpp run title="Combinatorial functions"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

enum class Colour { Red, Green, Blue };
enum class Size { Small, Medium, Large };
struct Product { string name; Colour colour; Size size; double price; };

vector<Product> byColour(const vector<Product>& v, Colour c) { vector<Product> r; for (auto& p : v) if (p.colour == c) r.push_back(p); return r; }
vector<Product> bySize(const vector<Product>& v, Size s) { vector<Product> r; for (auto& p : v) if (p.size == s) r.push_back(p); return r; }
vector<Product> byColourAndSize(const vector<Product>& v, Colour c, Size s) { vector<Product> r; for (auto& p : v) if (p.colour == c && p.size == s) r.push_back(p); return r; }
// byPriceBelow, byColourAndPriceBelow, bySizeAndPriceBelow, byColourAndSizeAndPriceBelow ... 2^n functions

int main() {
    vector<Product> shop{{"shirt", Colour::Red, Size::Small, 500}, {"coat", Colour::Blue, Size::Large, 3000}, {"tee", Colour::Red, Size::Large, 400}};
    cout << byColour(shop, Colour::Red).size() << " " << bySize(shop, Size::Large).size() << " " << byColourAndSize(shop, Colour::Red, Size::Large).size() << "\n";
}
```

Every new rule means writing many new combinations. This breaks the "do not edit old code" rule.

## The Specification way

Make **one small class per rule**. Join them with **AND / OR / NOT**. One generic filter works with any rule.

```cpp run title="Composable specifications"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

enum class Colour { Red, Green, Blue };
enum class Size { Small, Medium, Large };
struct Product { string name; Colour colour; Size size; double price; };

template <typename T>
class Specification {
public:
    virtual ~Specification() = default;
    virtual bool isSatisfiedBy(const T& item) const = 0;
};

template <typename T>
using SpecPtr = shared_ptr<const Specification<T>>;

// ---- leaf specifications: one criterion each ----
struct ColourIs : Specification<Product> {
    Colour c; explicit ColourIs(Colour c) : c(c) {}
    bool isSatisfiedBy(const Product& p) const override { return p.colour == c; }
};
struct SizeIs : Specification<Product> {
    Size s; explicit SizeIs(Size s) : s(s) {}
    bool isSatisfiedBy(const Product& p) const override { return p.size == s; }
};
struct PriceBelow : Specification<Product> {
    double limit; explicit PriceBelow(double l) : limit(l) {}
    bool isSatisfiedBy(const Product& p) const override { return p.price < limit; }
};

// ---- combinators: work on ANY specification (Composite!) ----
template <typename T> struct AndSpec : Specification<T> {
    SpecPtr<T> a, b; AndSpec(SpecPtr<T> a, SpecPtr<T> b) : a(move(a)), b(move(b)) {}
    bool isSatisfiedBy(const T& x) const override { return a->isSatisfiedBy(x) && b->isSatisfiedBy(x); }
};
template <typename T> struct OrSpec : Specification<T> {
    SpecPtr<T> a, b; OrSpec(SpecPtr<T> a, SpecPtr<T> b) : a(move(a)), b(move(b)) {}
    bool isSatisfiedBy(const T& x) const override { return a->isSatisfiedBy(x) || b->isSatisfiedBy(x); }
};
template <typename T> struct NotSpec : Specification<T> {
    SpecPtr<T> a; explicit NotSpec(SpecPtr<T> a) : a(move(a)) {}
    bool isSatisfiedBy(const T& x) const override { return !a->isSatisfiedBy(x); }
};

// readable operators
template <typename T> SpecPtr<T> operator&&(SpecPtr<T> a, SpecPtr<T> b) { return make_shared<AndSpec<T>>(a, b); }
template <typename T> SpecPtr<T> operator||(SpecPtr<T> a, SpecPtr<T> b) { return make_shared<OrSpec<T>>(a, b); }
template <typename T> SpecPtr<T> operator!(SpecPtr<T> a) { return make_shared<NotSpec<T>>(a); }

// ---- ONE generic filter ----
template <typename T>
vector<T> filter(const vector<T>& items, const SpecPtr<T>& spec) {
    vector<T> out;
    for (const auto& i : items) if (spec->isSatisfiedBy(i)) out.push_back(i);
    return out;
}

int main() {
    vector<Product> shop{
        {"shirt", Colour::Red, Size::Small, 500}, {"coat", Colour::Blue, Size::Large, 3000},
        {"tee", Colour::Red, Size::Large, 400},  {"cap", Colour::Green, Size::Medium, 250}};

    SpecPtr<Product> red = make_shared<ColourIs>(Colour::Red);
    SpecPtr<Product> large = make_shared<SizeIs>(Size::Large);
    SpecPtr<Product> cheap = make_shared<PriceBelow>(1000);

    auto show = [&](const char* label, const SpecPtr<Product>& s) {
        cout << label << ":";
        for (const auto& p : filter(shop, s)) cout << " " << p.name;
        cout << "\n";
    };
    show("red", red);
    show("red AND large", red && large);
    show("red AND NOT large", red && !large);
    show("(red OR large) AND cheap", (red || large) && cheap);
}
```

To add a new rule (like `NameContains`), write **one class**. All combinations come for free. Rules are also reusable and have names, so something like `isPremiumCustomer && hasOverdueInvoice` reads like normal business language.

```viz algo=uml title="Specification (a Composite of predicates)"
interface Specification
  + isSatisfiedBy(item: T): bool
class ColourIs
class SizeIs
class PriceBelow
class AndSpec
class OrSpec
class NotSpec
ColourIs ..|> Specification
SizeIs ..|> Specification
PriceBelow ..|> Specification
AndSpec ..|> Specification
OrSpec ..|> Specification
NotSpec ..|> Specification
AndSpec o-- Specification
OrSpec o-- Specification
NotSpec o-- Specification
```

## The light way: lambdas

In modern C++, a specification is just a **yes/no function**: `std::function<bool(const T&)>`. The AND, OR and NOT joiners are small functions.

```cpp run title="Specifications with std::function"
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Employee { string name; int age; double salary; string dept; };
using Spec = function<bool(const Employee&)>;

Spec operator&&(Spec a, Spec b) { return [=](const Employee& e) { return a(e) && b(e); }; }
Spec operator||(Spec a, Spec b) { return [=](const Employee& e) { return a(e) || b(e); }; }
Spec operator!(Spec a) { return [=](const Employee& e) { return !a(e); }; }

Spec inDept(string d) { return [d](const Employee& e) { return e.dept == d; }; }
Spec olderThan(int n) { return [n](const Employee& e) { return e.age > n; }; }
Spec earnsAbove(double s) { return [s](const Employee& e) { return e.salary > s; }; }

int main() {
    vector<Employee> staff{{"Asha", 34, 90000, "eng"}, {"Ravi", 26, 60000, "eng"}, {"Meera", 45, 120000, "ops"}, {"Kiran", 52, 70000, "ops"}};
    Spec seniorEngineers = inDept("eng") && olderThan(30);
    Spec toReview = (earnsAbove(100000) || olderThan(50)) && !inDept("eng");
    for (const auto& e : staff) {
        cout << e.name << ": seniorEngineer=" << seniorEngineers(e) << " toReview=" << toReview(e) << "\n";
    }
}
```

## Where you will use it

- **Validation**: "an order is valid if it has items AND the total is above 0 AND the customer is not blocked".
- **Search and filter screens**: filters that users combine at run time.
- **Eligibility rules**: loan approval, discount eligibility, access control.
- **Database queries**: turn a rule into a SQL `WHERE` text.
- **Picking items for a job**: "all overdue invoices of premium customers".

| Choose | When |
|---|---|
| **Classes** | rules need names, descriptions, an `explain()`, SQL conversion, or data of their own |
| **Lambdas** | quick, local, in-memory filtering |
| **A plain `if`** | one fixed rule that is never combined |

## Related patterns

The AND/OR/NOT parts form a **Composite** (they hold child rules). The single rules are like **Strategies**. You can walk the whole tree with a **Visitor** (for example to print it or turn it into SQL). It is also a cousin of **Interpreter**: the Interpreter lesson built a similar tree from text.

## Short answer to say in an interview

:::interview What is the Specification pattern?
"A specification is a small object with a method like isSatisfiedBy(item). Each simple rule checks one thing. AND, OR and NOT objects join them, so I can build complex rules from simple ones without writing a function for every combination. One generic filter then works with any rule. It is a Composite of yes/no rules. In C++ it can be classes, or just std::function<bool(const T&)> with small joiner functions."
:::

```quiz
? What problem does Specification solve?
- Slow sorting
+ Writing a new filter function for every combination of rules
- Memory leaks
> Each rule is one object, and joiners make the combinations.
? What structure do AND, OR and NOT specifications form?
- A queue
+ A Composite tree of yes/no rules
- A singleton
> Joiners hold child rules and pass the question to them.
? When is a plain lambda enough?
- Never
+ For simple in-memory filtering when you don't need names, explanations or SQL
- Only for sorting
> Use classes when rules need more features.
```

:::keypoints
- Specification = a rule as an object with `isSatisfiedBy`. Join rules with AND/OR/NOT. One generic filter for all.
- It is a Composite of small rules. Great for validation, eligibility and search filters.
- In modern C++, a `std::function<bool(const T&)>` with `&&`, `||`, `!` helpers is often enough.
:::
