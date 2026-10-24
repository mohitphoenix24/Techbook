---
title: Strategy
level: intermediate
time: 35
summary: Keep different ways of doing one job in separate classes, and pick one when needed. This removes long if-else chains. See class strategies, lambdas, compile-time policies, and how Strategy differs from State and Template Method.
---

## What is the Strategy pattern?

Don't memorise the definition yet. Think of it like this:

> "There is **one job**, but there are **many ways** to do it. I keep each way in its own box, and I choose a box when I need it."

:::analogy Think of going to the office
The job is "reach the office". The ways are: walk, take a bus, drive, take the metro. You choose a way depending on the day. The destination is the same. Only the **way** changes.
:::

:::def Strategy
Put each **way of doing a job** (an algorithm) into its own class behind one common interface, so that you can **swap** them easily.
:::

This is the most useful pattern in LLD. Almost every problem has a place where "the rule may change": pricing, matching, eviction, routing, scheduling, validation, sorting.

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

Look at the `if / else if` chain. Each time we add a new algorithm, we must edit this function. The code keeps growing and becomes risky to change.

## The pattern

Put each algorithm in its **own class** with the same interface. The class that needs the job done (called the **context**) holds one strategy and asks it to do the work.

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

`Navigator` does not change when we add a new route type. Each strategy is small, easy to test on its own, and can be reused.

## Strategy with `std::function` (the light way)

When the interface is **just one function**, you do not need classes. A lambda can be a strategy.

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

## Strategy as a compile-time choice (policy)

If you know the choice while compiling and speed matters, pass the strategy as a **template parameter**. There is no virtual call, so the compiler can optimise it.

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

| Style | When is the choice made? | Cost | Use when |
|---|---|---|---|
| Interface + classes | while running | a virtual call | strategies keep data, or you swap at run time |
| `std::function` / lambda | while running | an indirect call | one small function |
| Template policy | while compiling | none | speed matters and the choice is fixed |

## Example: many strategies together

Sometimes the context uses **several** strategies (rules) one after another.

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
| Who picks the variant? | the **user** from outside | the object **itself**, as it changes | the designer, at the start | the subclass |
| Do variants know each other? | no | **yes** (they start the next state) | no | not applicable |
| How | composition | composition | composition | **inheritance** |
| Purpose | swap an algorithm | change behaviour as the state changes | keep two families apart | fixed steps, changing details |

## Mistakes to avoid

- A strategy with **only one version** and no plan for more is just extra work.
- The user must know the strategy names to choose one. Hide this with a factory or a config map.
- Too many tiny classes: use lambdas for very simple ones.
- If strategies share a lot of code, move it into a helper.

## Short answer to say in an interview

:::interview What is the difference between Strategy and State? And between Strategy and Template Method?
"Both Strategy and State hold an interface and pass the work to it. In Strategy, the user chooses the algorithm from outside, and the strategies do not know each other. In State, the object changes its own state as it runs, and the states usually know the next state. Template Method also varies an algorithm, but through inheritance: the base class fixes the steps and subclasses change some of them. Strategy swaps the whole algorithm using composition, which is more flexible."
:::

```quiz
? What does Strategy replace?
- Singletons
+ If-else chains that choose between algorithms
- Constructors
> Each branch becomes its own class (or lambda) behind a common interface.
? Who usually chooses the strategy?
- The strategy itself
+ The user or the configuration, from outside
> In State, the object moves between states by itself.
? When would you choose a template policy instead of a virtual strategy?
- When the choice must change while running
+ When the choice is known at compile time and speed matters
> The compiler can inline a policy.
```

:::keypoints
- Strategy = many ways to do one job, each in its own class, swapped by composition.
- Use classes for strategies with data or run-time swapping, lambdas for single functions, templates for compile-time speed.
- It removes if-else chains (OCP) and makes each algorithm easy to test. Different from State (the object moves itself) and Template Method (inheritance).
:::
