---
title: Designing for change: variation points and clean APIs
level: intermediate
time: 35
summary: How to find what is likely to change and isolate it, the extension mechanisms in C++ (interface, strategy, callback, registry, configuration), enums versus strings and ids, designing public APIs that are hard to misuse, and a before-and-after example.
---

Interviewers end almost every LLD round with "now add X". A design is good if X is a **small, local change**. Planning for that has a method.

## Step 1: find the variation points

A **variation point** is something that **differs between cases** or is **likely to change**. Ask of each requirement: "what could they ask me to change?"

| Requirement | Variation points |
|---|---|
| Parking lot: "fee depends on duration" | the **pricing rule** (hourly, flat, per vehicle type, weekend rates) |
| Cab booking: "match nearest driver" | the **matching strategy** (nearest, highest rated, least idle) |
| Notifications: "email, SMS" | the **channel** |
| Cache: "evict old entries" | the **eviction policy** (LRU, LFU, FIFO) |
| Payment: "pay by card" | the **payment method**; the **fraud rules** |
| Game: "chess pieces move differently" | the **movement rule** per piece |

Everything that is *not* a variation point should stay simple. This is the discipline that separates a clear design from an over-engineered one.

## Step 2: pick the right extension mechanism

| Mechanism | When | Example in C++ |
|---|---|---|
| **Interface + implementations** (Strategy) | a family of interchangeable behaviours | `PricingStrategy`, `EvictionPolicy` |
| **Factory / registry** | create the right object from a name or config | `map<string, function<unique_ptr<Shape>()>>` |
| **Callback / `std::function`** | one small behaviour, set by the user | `onComplete(function<void()>)` |
| **Observer / events** | many parties react to something | `subscribe(listener)` |
| **Template parameter (policy)** | known at compile time, speed matters | `Cache<Key, Value, LruPolicy>` |
| **Data/config** | the difference is only values | a table of rates, a JSON file |
| **Chain** | an ordered list of independent steps | validation rules, middleware |

Rule: **prefer data over code, and code over inheritance**. If the difference is a number, make it a constant or config, not a class.

## Step 3: use types, not strings, for closed sets

```cpp run title="enum class beats strings and ints"
#include <iostream>
#include <string>
using namespace std;

// Fragile: a typo "premuim" compiles and silently falls through
double discountBad(const string& tier) {
    if (tier == "premium") return 0.20;
    if (tier == "gold") return 0.10;
    return 0;
}

// Robust: a closed set, checked by the compiler; -Wswitch warns if you add a tier and forget a case
enum class Tier { Basic, Gold, Premium };
double discount(Tier t) {
    switch (t) {
        case Tier::Premium: return 0.20;
        case Tier::Gold:    return 0.10;
        case Tier::Basic:   return 0.0;
    }
    return 0;
}

int main() {
    cout << discountBad("premuim") << " (typo: silently wrong)\n";
    cout << discount(Tier::Premium) << "\n";
}
```

For *open* sets that grow (many tiers added by configuration), use a registry or a class per tier. For *closed* sets, `enum class` is perfect. Do not use bare strings or ints as types ("stringly typed" code).

## Step 4: design APIs that are hard to misuse

Good public interfaces make correct use easy and incorrect use difficult or impossible.

| Technique | Bad | Good |
|---|---|---|
| Strong types for ids/units | `void move(int from, int to, int amount)` | `void move(AccountId from, AccountId to, Money amount)` |
| Make invalid states unrepresentable | `Rect(int w, int h)` where negative is allowed | a constructor that rejects it, or `Width` type |
| Hide sequencing rules | `open(); write(); close();` callers forget `close` | RAII: `File f(path); f.write(...)` |
| Small interfaces | a 25-method `IService` | several focused interfaces |
| Return meaningful results | `int` that might be an error code | `optional`, an enum result, or `[[nodiscard]]` |
| Immutable where possible | setters everywhere | construct once, never change |

```cpp run title="Strong types prevent argument mix-ups"
#include <iostream>
using namespace std;

// With plain ints, move(to, from, amount) compiles and sends money the wrong way round.
struct AccountId { int v; explicit AccountId(int x) : v(x) {} };
struct Money     { long paise; explicit Money(long p) : paise(p) {} };

void transfer(AccountId from, AccountId to, Money amount) {
    cout << "transfer " << amount.paise / 100.0 << " from #" << from.v << " to #" << to.v << "\n";
}

int main() {
    transfer(AccountId(1), AccountId(2), Money(25000));
    // transfer(250, 1, 2);                       // error: no implicit conversion from int
    // transfer(Money(1), AccountId(1), AccountId(2));   // error: wrong order is caught by the compiler
}
```

## A before/after: adding a requirement

**Original requirement:** shipping cost = flat 50. **New requirement:** "express costs double, and international adds 300".

```cpp run title="Open for extension: ShippingRule as a variation point"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Parcel { double kg; bool express; bool international; };

class ShippingRule {                                     // the variation point
public:
    virtual ~ShippingRule() = default;
    virtual double apply(const Parcel& p, double costSoFar) const = 0;
};
struct BaseRate : ShippingRule {
    double apply(const Parcel&, double) const override { return 50; }
};
struct ExpressSurcharge : ShippingRule {
    double apply(const Parcel& p, double c) const override { return p.express ? c * 2 : c; }
};
struct InternationalFee : ShippingRule {
    double apply(const Parcel& p, double c) const override { return p.international ? c + 300 : c; }
};

class ShippingCalculator {
    vector<unique_ptr<ShippingRule>> rules_;
public:
    ShippingCalculator& add(unique_ptr<ShippingRule> r) { rules_.push_back(move(r)); return *this; }
    double cost(const Parcel& p) const { double c = 0; for (const auto& r : rules_) c = r->apply(p, c); return c; }
};

int main() {
    ShippingCalculator calc;
    calc.add(make_unique<BaseRate>()).add(make_unique<ExpressSurcharge>()).add(make_unique<InternationalFee>());
    cout << calc.cost({1, false, false}) << " " << calc.cost({1, true, false}) << " " << calc.cost({1, true, true}) << "\n";
    // Tomorrow: "heavy parcels cost extra": write HeavyFee, add it to the chain. ShippingCalculator is untouched.
}
```

The calculator never changes when a rule is added. The order of the chain is explicit, and each rule is tested alone. This combines **Strategy**, **chain** and the **Open/Closed Principle**.

## Answering "what if we add X?"

1. Say **where** the change goes: "a new `ShippingRule` class".
2. Say what is **not** touched: "the calculator and the other rules".
3. If the design cannot absorb it, say so honestly and describe the **refactoring** you would do. Do not pretend.

:::interview How do you design for extensibility without over-engineering?
"I list the requirements and ask what is likely to vary: algorithms, rates, channels, types. I put interfaces only at those variation points, and keep everything else concrete and simple. I prefer data to code and composition to inheritance, use enums for closed sets and strong types in APIs, and I can show exactly which classes a new requirement touches."
:::

```quiz
? What is a variation point?
- A loop in the code
+ A place where behaviour differs between cases or is likely to change
- A virtual function with a body
> Isolating variation points behind interfaces lets new cases be added without editing working code.
? When is `enum class` better than a string?
- Never
+ For a closed, known set of values, because the compiler checks it
- When the set changes at run time
> Strings allow typos and silently invalid values.
? In the shipping example, how is a new "heavy parcel" rule added?
- Edit ShippingCalculator
+ Write a new ShippingRule class and add it to the chain
- Add a bool to Parcel
> The calculator is closed for modification and open for extension.
```

:::keypoints
- First identify variation points, then choose a mechanism: interface/strategy, factory/registry, callback, observer, policy, data, chain.
- Prefer data over code, composition over inheritance; use `enum class` for closed sets.
- Strong types, RAII and `[[nodiscard]]` make APIs hard to misuse.
- Know exactly which classes a new requirement touches. Do not build extension points you do not need.
:::
