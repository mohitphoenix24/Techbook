---
title: Specification
level: intermediate
time: 30
summary: Encapsulating business rules as small, combinable predicate objects: a product filter with and, or and not, specifications built from lambdas, why this beats a growing pile of filter functions, and use in validation and queries.
---

:::def Specification
Encapsulate a **business rule** as a small object with one question: *"does this candidate satisfy me?"* Specifications can be **combined** with AND, OR and NOT to build complex rules.
:::

## The problem: filter function explosion

An online shop needs to find products by colour, by size, by colour **and** size, by price below X, by colour and size and price... Each new combination becomes another function, or one function with a dozen flags.

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

This violates OCP: each new criterion needs a new combination of functions.

## The Specification pattern

One small class per **criterion**. Combine them with **AND / OR / NOT**. One generic filter works with any specification.

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

Now adding a new criterion (`NameContains`) is **one class**. All combinations come for free. The rules are **reusable objects** with names, so `isPremiumCustomer && hasOverdueInvoice` reads like the business language.

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

## The lightweight way: lambdas as specifications

In modern C++ a specification is just a **predicate**: `std::function<bool(const T&)>`. Combinators are small functions.

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

## Where it appears

- **Validation**: "an order is valid if has items AND total > 0 AND NOT blacklisted customer".
- **Search/filter UIs**: filters the user combines at run time.
- **Eligibility** and policy rules: loan approval, discount eligibility, access control.
- **Querying**: translating specifications to SQL `WHERE` clauses (a `toSql()` method).
- **Selecting** objects for batch actions ("all overdue invoices of premium customers").

| Choose | Use when |
|---|---|
| **Class-based Specification** | rules need names, descriptions, `explain()`, SQL translation, or state |
| **Lambda predicates** | quick, in-memory, local filtering |
| **Plain `if`** | one fixed rule that will not be combined |

## Related patterns

It is a **Composite** (and/or/not nodes holding children), the leaves are **Strategies** (a rule), and the combined tree can be walked by a **Visitor** (to print or convert to SQL). It is also a close relative of **Interpreter**: the Interpreter lesson parsed text into a similar tree.

:::interview Explain the Specification pattern
"A specification is a small object that answers `isSatisfiedBy(candidate)`; leaf specifications check one criterion, and AND, OR and NOT combinators compose them, so complex rules are built from simple ones without a function per combination. A single generic filter works with any spec. It is a Composite of predicates. In C++ it can be classes, or just `std::function<bool(const T&)>` with combinator functions."
:::

```quiz
? What problem does Specification solve?
- Slow sorting
+ The explosion of filter functions for every combination of criteria
- Memory leaks
> Each criterion is one object; combinators create the combinations.
? Which structure do AND, OR and NOT specifications form?
- A queue
+ A Composite tree of predicates
- A singleton
> Combinators hold child specifications and delegate.
? When is a plain lambda enough?
- Never
+ For simple in-memory filtering without names, explanations or SQL translation
- Only for sorting
> Use classes when the rules need richer behaviour.
```

:::keypoints
- Specification: a rule as an object with `isSatisfiedBy`; combine with AND/OR/NOT; one generic filter for all.
- It is a Composite of Strategy-like leaf rules; ideal for validation, eligibility and search filters.
- In modern C++ a predicate `std::function<bool(const T&)>` with `&&`, `||`, `!` operators is often enough.
:::
