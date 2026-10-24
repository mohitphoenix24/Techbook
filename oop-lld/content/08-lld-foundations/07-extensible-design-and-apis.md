---
title: Designing for change: variation points and clean APIs
level: intermediate
time: 35
summary: How to find the parts of a design that will change and keep them flexible, how to choose the right tool for it, how to avoid strings and loose ints, and how to write methods that are hard to use wrongly.
---

Almost every LLD interview ends with the same sentence: **"Now, what if we add X?"**

A good design handles X with a **small change in one place**. Let's learn how to build that.

## Step 1: Find what can change (variation points)

A **variation point** is just a place where "things can be different". The way to find it is to read each requirement and ask: *"What could they ask me to change later?"*

| Requirement | What can change (variation point) |
|---|---|
| Parking lot: "fee depends on time" | the **pricing rule** (per hour, flat, weekend rate) |
| Cab booking: "find the nearest driver" | how we **match** (nearest, best rated, least busy) |
| Notifications: "email, SMS" | the **channel** |
| Cache: "remove old entries" | the **eviction rule** (LRU, LFU, FIFO) |
| Payment: "pay by card" | the **payment method** |
| Chess: "each piece moves differently" | the **move rule** of each piece |

Everything that is **not** a variation point should stay simple. This is what separates a clean design from an over-engineered one.

## Step 2: Pick the right tool

| Tool | Use it when | Example |
|---|---|---|
| **Interface + several classes** (Strategy) | there are many ways to do the same job | `PricingStrategy`, `EvictionPolicy` |
| **Factory / registry** | you must create the right object from a name | a map from name to "how to create it" |
| **Callback** (`std::function`) | one small action is decided by the user | `onComplete(callback)` |
| **Observer** | many others want to know when something happens | `subscribe(listener)` |
| **Template parameter** | the choice is known at compile time and speed matters | `Cache<Key, Value, LruPolicy>` |
| **Plain data / config** | only a value differs | a table of rates |
| **Chain** | a list of independent steps | validation rules |

A simple rule to remember: **use data before code, and code before inheritance.** If only a number is different, make it a constant or a setting, not a new class.

## Step 3: Use real types, not strings

If there is a fixed list of choices, use an `enum class`. Do not use plain strings or numbers.

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

Why? With a string like `"gold"` you can make a typo (`"golld"`) and the compiler will not notice. With an enum, a typo does not compile.

If the list keeps growing (new tiers added from config), use a registry or one class per tier. For a **fixed** list, `enum class` is perfect.

## Step 4: Make your methods hard to use wrongly

A good method makes the **right** use easy and the **wrong** use difficult.

| Idea | Weak | Better |
|---|---|---|
| Give ids and units their own type | `move(int from, int to, int amount)` | `move(AccountId from, AccountId to, Money amount)` |
| Do not allow bad values | `Rect(int w, int h)` accepts negatives | the constructor rejects them |
| Do not depend on the caller's memory | `open(); write(); close();` and people forget `close` | RAII: the object closes itself |
| Keep interfaces small | one `IService` with 25 methods | a few small interfaces |
| Return a clear result | an `int` that might be an error code | `optional`, an enum, or `[[nodiscard]]` |
| Do not change things after creation | setters everywhere | create once, never change |

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

In the code above, the strong types mean that swapping `from` and `to` by mistake will not even compile.

## Before and after: a new requirement arrives

**First requirement:** shipping costs a flat 50 rupees.
**New requirement:** "Express is double. International adds 300."

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

Look at the result: the calculator never changes when we add a rule. Each rule is a small class that can be tested alone. The idea behind it is called the **Open/Closed Principle**: *open to add new things, closed to editing old working code.*

## How to answer "what if we add X?"

1. Say **where** the change goes: "I add a new `ShippingRule` class."
2. Say what you **do not touch**: "The calculator and the other rules stay the same."
3. If your design cannot handle it, say so honestly. Explain how you would **refactor**. Do not pretend.

## Short answer to say in an interview

:::interview How do you make a design easy to extend without over-engineering it?
"I first list what is likely to change, like pricing rules, channels or types. I put an interface only at those places and keep the rest simple. I use enums for fixed lists and strong types in methods. Then when a new requirement comes, I can name the one class I add and say that nothing else changes."
:::

```quiz
? What is a variation point?
- A loop in the code
+ A place where behaviour can differ or is likely to change
- A virtual function with a body
> Put an interface there so new cases need new classes, not edits.
? When is an enum class better than a string?
- Never
+ When the choices are a fixed, known list, because the compiler checks them
- When the list changes while the program runs
> Strings allow typos and silent mistakes.
? In the shipping example, how do you add a "heavy parcel" rule?
- Edit ShippingCalculator
+ Write a new ShippingRule class and add it to the list
- Add a bool to Parcel
> The calculator stays closed to changes and open to new rules.
```

:::keypoints
- First find what can change. Then pick a tool: interface, factory, callback, observer, data or chain.
- Use data before code, and composition before inheritance. Use `enum class` for fixed lists.
- Strong types, RAII and `[[nodiscard]]` make methods hard to misuse.
- Always be able to say which class you add, and what you do not touch.
:::
