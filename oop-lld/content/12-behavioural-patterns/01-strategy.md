---
title: Strategy
level: intermediate
time: 35
summary: Defining a family of interchangeable algorithms and choosing one at run time or compile time, replacing if-else chains, with class-based strategies, lambdas, template policies, a route planner and a validation example, and how Strategy differs from State and Bridge.
---

:::def Strategy
Define a **family of algorithms**, **encapsulate each one**, and make them **interchangeable**. Strategy lets the algorithm vary independently from the clients that use it.
:::

The most useful pattern in LLD. Almost every problem has a place where "the rule may change": pricing, matching, eviction, routing, scheduling, validation, sorting.

## The problem

```cpp run title="A conditional that grows with every new algorithm"
#include <iostream>
#include <string>
using namespace std;

double routeCost(const string& mode, double km) {
    if (mode == "car") return km * 12;
    else if (mode == "bike") return km * 4;
    else if (mode == "walk") return 0;
    // every new mode = edit this function (and every other function that also switches on mode)
    return -1;
}

int main() { cout << routeCost("car", 10) << " " << routeCost("bike", 10) << "\n"; }
```

## The pattern

Put each algorithm in its own class behind one interface. The **context** holds a strategy and delegates to it.

```viz algo=uml title="Strategy"
class Navigator
  - strategy: RouteStrategy
  + setStrategy(s: RouteStrategy): void
  + plan(from: string, to: string): Route
interface RouteStrategy
  + plan(from: string, to: string): Route
class FastestRoute
class CheapestRoute
class ScenicRoute
Navigator o-- RouteStrategy
FastestRoute ..|> RouteStrategy
CheapestRoute ..|> RouteStrategy
ScenicRoute ..|> RouteStrategy
```

```cpp run title="Classic strategy: a route planner"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Route { string description; int minutes; double cost; };

class RouteStrategy {                                      // the strategy interface
public:
    virtual ~RouteStrategy() = default;
    virtual Route plan(const string& from, const string& to) const = 0;
};
class FastestRoute : public RouteStrategy {
public:
    Route plan(const string& f, const string& t) const override { return {f + " -> highway -> " + t, 35, 180}; }
};
class CheapestRoute : public RouteStrategy {
public:
    Route plan(const string& f, const string& t) const override { return {f + " -> local roads -> " + t, 70, 60}; }
};
class ScenicRoute : public RouteStrategy {
public:
    Route plan(const string& f, const string& t) const override { return {f + " -> coast road -> " + t, 95, 110}; }
};

class Navigator {                                          // the context
    unique_ptr<RouteStrategy> strategy_;
public:
    explicit Navigator(unique_ptr<RouteStrategy> s) : strategy_(move(s)) {}
    void setStrategy(unique_ptr<RouteStrategy> s) { strategy_ = move(s); }     // swap at run time
    void go(const string& from, const string& to) const {
        Route r = strategy_->plan(from, to);
        cout << "  " << r.description << " | " << r.minutes << " min | Rs" << r.cost << "\n";
    }
};

int main() {
    Navigator nav(make_unique<FastestRoute>());
    nav.go("Pune", "Mumbai");
    nav.setStrategy(make_unique<CheapestRoute>());         // the user changes the preference
    nav.go("Pune", "Mumbai");
    nav.setStrategy(make_unique<ScenicRoute>());
    nav.go("Pune", "Mumbai");
}
```

`Navigator` never changes when a new route type is added. Strategies are small, independently testable, and reusable by other contexts.

## Strategy with `std::function` (lightweight)

When the interface is **one function**, you do not need classes. Lambdas are strategies.

```cpp run title="Strategies as lambdas"
#include <algorithm>
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Product { string name; double price; double rating; };

using Comparator = function<bool(const Product&, const Product&)>;

void showSorted(vector<Product> items, const string& label, const Comparator& better) {
    sort(items.begin(), items.end(), better);              // the algorithm std::sort is closed; the strategy varies
    cout << label << ": ";
    for (const auto& p : items) cout << p.name << " ";
    cout << "\n";
}

int main() {
    vector<Product> items{{"lamp", 1200, 4.1}, {"desk", 8000, 4.7}, {"chair", 3500, 3.9}};
    showSorted(items, "cheapest first", [](const Product& a, const Product& b) { return a.price < b.price; });
    showSorted(items, "best rated    ", [](const Product& a, const Product& b) { return a.rating > b.rating; });
    showSorted(items, "value (rating/price)", [](const Product& a, const Product& b) { return a.rating / a.price > b.rating / b.price; });
}
```

## Strategy as a compile-time policy

If the choice is known at compile time and speed matters, pass the strategy as a **template parameter**: no virtual call, inlinable.

```cpp run title="Policy-based strategy"
#include <iostream>
#include <string>
using namespace std;

struct RoundDown { static double apply(double x) { return static_cast<long>(x); } };
struct RoundNearest { static double apply(double x) { return static_cast<long>(x + 0.5); } };

template <typename Rounding>
class PriceFormatter {
public:
    string format(double price) const { return "Rs " + to_string(static_cast<long>(Rounding::apply(price))); }
};

int main() {
    PriceFormatter<RoundDown> a;
    PriceFormatter<RoundNearest> b;
    cout << a.format(99.7) << " vs " << b.format(99.7) << "\n";
}
```

| Form | Choice made | Cost | Use when |
|---|---|---|---|
| Interface + classes | run time | virtual call | strategies have state, or you want to swap at run time |
| `std::function` / lambda | run time | indirect call | a single function, ad hoc |
| Template policy | compile time | zero | performance-critical, known statically |

## A validation example: many strategies at once

Sometimes the context applies **several** strategies (rules) in turn.

```cpp run title="Password rules as strategies"
#include <cctype>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Rule {
    virtual ~Rule() = default;
    virtual bool ok(const string& pw) const = 0;
    virtual string message() const = 0;
};
struct MinLength : Rule {
    size_t n; explicit MinLength(size_t n) : n(n) {}
    bool ok(const string& p) const override { return p.size() >= n; }
    string message() const override { return "at least " + to_string(n) + " characters"; }
};
struct HasDigit : Rule {
    bool ok(const string& p) const override { for (char c : p) if (isdigit(static_cast<unsigned char>(c))) return true; return false; }
    string message() const override { return "a digit"; }
};
struct HasUpper : Rule {
    bool ok(const string& p) const override { for (char c : p) if (isupper(static_cast<unsigned char>(c))) return true; return false; }
    string message() const override { return "an uppercase letter"; }
};

class PasswordValidator {
    vector<unique_ptr<Rule>> rules_;
public:
    PasswordValidator& add(unique_ptr<Rule> r) { rules_.push_back(move(r)); return *this; }
    vector<string> failures(const string& pw) const {
        vector<string> out;
        for (const auto& r : rules_) if (!r->ok(pw)) out.push_back(r->message());
        return out;
    }
};

int main() {
    PasswordValidator v;
    v.add(make_unique<MinLength>(8)).add(make_unique<HasDigit>()).add(make_unique<HasUpper>());
    for (const char* pw : {"abc", "Password1", "longpasswordonly"}) {
        auto f = v.failures(pw);
        cout << pw << ": ";
        if (f.empty()) cout << "OK";
        else { cout << "needs"; for (const auto& m : f) cout << " [" << m << "]"; }
        cout << "\n";
    }
}
```

## Strategy vs State vs Bridge vs Template Method

| | Strategy | State | Bridge | Template Method |
|---|---|---|---|---|
| Who picks the variant? | the **client** (from outside) | the object **itself** (transitions) | the designer, up front | the subclass |
| Variants know each other? | no | **yes** (they trigger transitions) | no | n/a |
| Mechanism | composition | composition | composition | **inheritance** |
| Intent | swap an algorithm | change behaviour as state changes | separate two hierarchies | fix the skeleton, vary steps |

## Pitfalls

- A strategy with **one implementation and no prospect of another** is just indirection.
- **Clients must know the strategies** to choose one (use a factory or a config map to hide that).
- Too many tiny strategy classes: group simple ones as lambdas.
- Strategies sharing a lot of code: factor it into a base class or helper.

:::interview Strategy vs State? And Strategy vs Template Method?
"Both hold an interface and delegate. In Strategy the *client* chooses the algorithm and strategies are independent; in State the *object itself* changes its state object as it runs, and the states usually know the transitions. Template Method also varies an algorithm but through inheritance: the base class fixes the skeleton and subclasses override steps, whereas Strategy replaces the whole algorithm using composition, which is more flexible and swappable at run time."
:::

```quiz
? What does Strategy replace?
- Singletons
+ Conditional logic that selects between algorithms
- Constructors
> Each branch becomes its own class (or lambda) behind a common interface.
? Who normally selects the strategy?
- The strategy itself
+ The client or configuration, from outside the context
> Contrast with State, where the object transitions itself.
? When would you prefer a template policy to a virtual strategy?
- When the choice must change at run time
+ When the choice is known at compile time and performance matters
> Policies are resolved by the compiler and can be inlined.
```

:::keypoints
- Strategy = interchangeable algorithms behind one interface, held by a context; swap by composition.
- Use classes for stateful or run-time-swapped strategies, lambdas for single functions, templates for compile-time speed.
- It removes `if/else` chains (OCP) and makes algorithms testable alone. Differs from State (self-transition) and Template Method (inheritance).
:::
