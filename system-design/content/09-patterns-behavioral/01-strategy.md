---
title: Strategy
level: intermediate
time: 35
summary: The most useful pattern in LLD interviews — encapsulating interchangeable algorithms behind one interface (pricing, parking-spot allocation, ride matching), choosing them at run time, strategies as plain functions, and how Strategy differs from State and Template Method. Implemented in C++ and JavaScript.
---

If you remember one behavioral pattern for LLD rounds, make it **Strategy**. Almost every machine-coding question has a rule that "may change" or "depends on the situation": how to price a ride, which parking spot to pick, how to split a bill, which elevator answers a call, which driver gets a ride request. Strategy is the standard way to keep those rules swappable.

:::def Strategy
Defines a **family of algorithms**, encapsulates each one in its own class (or function), and makes them **interchangeable** behind a common interface. The **context** object uses a strategy without knowing which one it is, and the strategy can be chosen or changed at run time.
:::

```viz algo=uml title="Strategy"
class ParkingLot
  - allocator: SpotAllocationStrategy
  + park(v: Vehicle): Spot
  + setAllocator(s: SpotAllocationStrategy)
interface SpotAllocationStrategy
  + choose(spots: Spot[], v: Vehicle): Spot
class NearestToEntrance
class FillLowestFloorFirst
class SpreadEvenly
ParkingLot o-- SpotAllocationStrategy
NearestToEntrance ..|> SpotAllocationStrategy
FillLowestFloorFirst ..|> SpotAllocationStrategy
SpreadEvenly ..|> SpotAllocationStrategy
```

## Example: ride fare strategies

A ride-hailing app prices rides differently: standard per-km pricing, surge pricing during peak demand, flat airport fares, and promotional discounts. Product managers add new schemes every quarter. The `FareCalculator` shouldn't change each time:

:::tabs Fare strategies
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Trip { double km; int minutes; string pickupZone, dropZone; };

class PricingStrategy {                              // the strategy interface
public:
    virtual ~PricingStrategy() = default;
    virtual long fare(const Trip& t) const = 0;      // in rupees
    virtual string name() const = 0;
};

class StandardPricing : public PricingStrategy {
public:
    long fare(const Trip& t) const override { return lround(50 + 12 * t.km + 1.5 * t.minutes); }
    string name() const override { return "standard"; }
};

class SurgePricing : public PricingStrategy {        // wraps another strategy and multiplies it
    const PricingStrategy& base_; double multiplier_;
public:
    SurgePricing(const PricingStrategy& base, double m) : base_(base), multiplier_(m) {}
    long fare(const Trip& t) const override { return lround(base_.fare(t) * multiplier_); }
    string name() const override { ostringstream s; s << "surge x" << multiplier_; return s.str(); }
};

class AirportFlatRate : public PricingStrategy {
public:
    long fare(const Trip& t) const override { return t.km <= 40 ? 799 : 799 + lround(14 * (t.km - 40)); }
    string name() const override { return "airport flat"; }
};

class FareCalculator {                               // the context: uses a strategy, doesn't know which
    const PricingStrategy* strategy_;
public:
    explicit FareCalculator(const PricingStrategy& s) : strategy_(&s) {}
    void setStrategy(const PricingStrategy& s) { strategy_ = &s; }   // switch at run time
    string quote(const Trip& t) const { return strategy_->name() + ": Rs " + to_string(strategy_->fare(t)); }
};

// Choosing the strategy is a separate decision (often a small factory)
const PricingStrategy& choose(const Trip& t, double demandRatio, const StandardPricing& standard, const SurgePricing& surge, const AirportFlatRate& airport) {
    if (t.dropZone == "AIRPORT" || t.pickupZone == "AIRPORT") return airport;
    if (demandRatio > 1.5) return surge;
    return standard;
}

int main() {
    StandardPricing standard;
    SurgePricing surge(standard, 1.8);
    AirportFlatRate airport;
    Trip city{12.5, 34, "KORAMANGALA", "INDIRANAGAR"}, toAirport{38, 55, "WHITEFIELD", "AIRPORT"};

    FareCalculator calc(standard);
    cout << calc.quote(city) << "\n";
    calc.setStrategy(surge);
    cout << calc.quote(city) << "\n";
    for (auto [trip, demand] : vector<pair<Trip, double>>{{city, 1.0}, {city, 2.3}, {toAirport, 2.3}})
        cout << "auto-chosen -> " << FareCalculator(choose(trip, demand, standard, surge, airport)).quote(trip) << "\n";
}
```
```js run
// In JavaScript a strategy can be a class or simply a function with the agreed signature.
const standard = { name: "standard", fare: (t) => Math.round(50 + 12 * t.km + 1.5 * t.minutes) };
const surge = (base, m) => ({ name: `surge x${m}`, fare: (t) => Math.round(base.fare(t) * m) });
const airportFlat = { name: "airport flat", fare: (t) => (t.km <= 40 ? 799 : 799 + Math.round(14 * (t.km - 40))) };

class FareCalculator {                                 // the context
  constructor(strategy) { this.strategy = strategy; }
  setStrategy(s) { this.strategy = s; }               // switch at run time
  quote(trip) { return `${this.strategy.name}: Rs ${this.strategy.fare(trip)}`; }
}

// Choosing the strategy is a separate decision (often a small factory)
function choose(trip, demandRatio) {
  if (trip.dropZone === "AIRPORT" || trip.pickupZone === "AIRPORT") return airportFlat;
  if (demandRatio > 1.5) return surge(standard, 1.8);
  return standard;
}

const city = { km: 12.5, minutes: 34, pickupZone: "KORAMANGALA", dropZone: "INDIRANAGAR" };
const toAirport = { km: 38, minutes: 55, pickupZone: "WHITEFIELD", dropZone: "AIRPORT" };

const calc = new FareCalculator(standard);
console.log(calc.quote(city));
calc.setStrategy(surge(standard, 1.8));
console.log(calc.quote(city));
for (const [trip, demand] of [[city, 1.0], [city, 2.3], [toAirport, 2.3]])
  console.log("auto-chosen ->", new FareCalculator(choose(trip, demand)).quote(trip));
```
:::

Things to notice:

- `FareCalculator` never changes when a new pricing scheme appears (**Open/Closed**). Each scheme is independently testable.
- The **choice** of strategy (`choose`) is separate from the strategies themselves; it can be a small factory, configuration, or a user preference.
- Strategies can **compose**: surge wraps any base strategy (that's a decorator-flavoured strategy).
- In JavaScript, a strategy is often just a **function**; first-class functions make the pattern almost invisible.

## Where Strategy appears in LLD problems

| Problem | Strategy | Variants |
|---|---|---|
| Parking lot | spot allocation, fee calculation | nearest, lowest floor, by size; hourly, flat, weekend |
| Ride sharing | driver matching, pricing | nearest, best rated, least idle; standard, surge, pool |
| Elevator | dispatching | nearest car, SCAN, zoning |
| Splitwise | expense splitting | equal, exact amounts, percentages, shares |
| Rate limiter | the algorithm | token bucket, sliding window |
| Cache | eviction policy | LRU, LFU, FIFO |
| Payment | payment method | card, UPI, wallet |
| Sorting / search | comparator, ranking | price, rating, distance |

## Strategy vs State vs Template Method

| | Strategy | State | Template Method |
|---|---|---|---|
| What varies | one algorithm | behaviour that depends on the object's **current state** | some steps of a fixed algorithm |
| Who chooses | the client or configuration | the state objects themselves, on transitions | the subclass (at compile time) |
| Mechanism | composition (has-a strategy) | composition (has-a current state) | inheritance (overrides steps) |
| Example | pricing scheme | vending machine: idle → has money → dispensing | data import: open → parse → validate → save |

```quiz
? A food delivery app must assign orders to riders "nearest first" today, "least busy" next month, and test "best rated" for VIPs. Which pattern?
+ Strategy: an AssignmentStrategy interface with one class per rule, chosen at run time
- Singleton
- Composite
> The algorithm varies independently of the dispatcher that uses it.

? What's the main benefit of Strategy over a switch statement on a "pricingType" field?
+ New algorithms are added as new classes/functions without modifying the context, and each can be tested alone
- It runs faster
- It needs fewer files
> Strategy applies the Open/Closed Principle to algorithms.

? How does Strategy differ from State?
+ In Strategy the client picks the algorithm; in State the object's behaviour changes as its internal state transitions
- They are identical
- State uses inheritance; Strategy uses static methods
> Both use composition, but State objects drive the transitions themselves.
```

:::keypoints
- **Strategy** puts interchangeable algorithms behind one interface; the context delegates to whichever strategy it holds.
- Keep **choosing** the strategy (factory/config) separate from the strategies themselves; strategies can compose.
- In JavaScript, strategies are often plain functions.
- It's the go-to pattern for LLD variation points: pricing, allocation, matching, splitting, eviction, payment.
- Strategy = client-chosen algorithm; State = behaviour driven by internal state; Template Method = fixed skeleton, overridable steps.
:::
