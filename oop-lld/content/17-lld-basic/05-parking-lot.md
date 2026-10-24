---
title: Design a Parking Lot
level: easy
time: 50
summary: The most asked LLD question. A parking lot with many floors, different vehicle and spot sizes, tickets, rules for choosing a spot and for pricing that can be swapped, and safe locking so several gates can work together.
---

:::problem Design a Parking Lot {level=easy tags="classic,Strategy,concurrency,booking,most asked"}
Design the software for a parking lot with many floors. Vehicles of different sizes come in through several gates, get a ticket for a suitable spot, and pay by the time they stayed when they leave. Design the classes, write park and leave, and make it safe when several gates work at the same time.

:::hint Hint
First find what can change: **how a spot is chosen**, and **how the fee is worked out**. Both change in real businesses, so make both of them strategies. Then think about what must happen as one step when two gates ask for a spot at the same moment: finding a free spot and marking it as taken is **one** step.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Vehicle types? | motorcycle, car, truck |
| Spot types? | small (motorcycle), medium (car), large (truck) |
| Which vehicle fits which spot? | a vehicle can use its own size **or a bigger one**. The smallest fit is preferred |
| Floors and gates? | many floors. Many entry and exit gates working **at the same time** |
| Price? | per started hour, depends on the spot size, the first 15 minutes are free. The rules may change |
| Choosing a spot? | the lowest floor first for now. Maybe "nearest to the exit" later |
| Payment? | at the exit. The payment system itself is not needed (an interface) |
| Display? | free spots for each floor and type |

Not needed: reservations, monthly passes, number-plate cameras (we can mention them as extensions).

## Step 2: Find the classes

Nouns: **ParkingLot, Floor, Spot, Vehicle, Ticket, Gate**. And two things that can change: **SpotAllocationStrategy** and **PricingStrategy**.

```viz algo=uml title="Parking lot: class diagram"
class ParkingLot
  - floors: Floor[]
  - active: map<string, Ticket>
  + park(v: Vehicle, at: Minute): Result<Ticket>
  + leave(ticketId: string, at: Minute): Result<Receipt>
  + availability(): string
class Floor
  - number: int
  - spots: Spot[]
  - lock: mutex
  + tryReserve(v: Vehicle, s: SpotAllocationStrategy): Spot
  + release(s: Spot): void
class Spot
  - id: string
  - size: SpotSize
  - occupiedBy: string
class Vehicle
  - plate: string
  - type: VehicleType
class Ticket
  - id: string
  - spot: Spot
  - entry: Minute
interface SpotAllocationStrategy
  + choose(free: Spot[], v: Vehicle): Spot
interface PricingStrategy
  + fee(size: SpotSize, minutes: long): long
class LowestFloorFirst
class HourlyPricing
ParkingLot *-- Floor : 1..*
Floor *-- Spot : 1..*
ParkingLot --> SpotAllocationStrategy
ParkingLot --> PricingStrategy
Ticket --> Spot
LowestFloorFirst ..|> SpotAllocationStrategy
HourlyPricing ..|> PricingStrategy
```

What each class does:

- **ParkingLot** (the main class): gives out and closes tickets, and tells how many spots are free. It holds no pricing or allocation rules (one job per class).
- **Floor** owns its spots and its **lock**. Reserving a spot on a floor is one safe step.
- **Spot** knows its size, whether it is free, and whether a vehicle **fits**.
- **Strategies** hold the rules that change.

## Step 3: The flows

```viz algo=seq title="Entry and exit"
participant g EntryGate [gateway]
participant lot ParkingLot [box]
participant f Floor [box]
participant ps PricingStrategy [pay]
participant x ExitGate [gateway]
g -> lot : park(car KA-01-1234, 09:05)
lot -> f : tryReserve(car, allocation) | Floors are tried in order; each reserves under its own lock.
f --> lot : spot F1-M3
lot --> g : Ticket T-1 (F1-M3, 09:05)
== later ==
x -> lot : leave(T-1, 11:20)
lot -> ps : fee(MEDIUM, 135 minutes)
ps --> lot : Rs 120 (3 started hours)
lot -> f : release(F1-M3)
lot --> x : Receipt T-1, Rs 120
```

In words:

- **Entry:** the gate asks the lot to park. The lot asks the strategy which spot, the floor reserves it, and a ticket is returned.
- **Exit:** the gate gives the ticket. The lot finds the spot from the ticket, frees it, asks the pricing strategy for the fee, and returns it.

## Step 4: Design decisions

- **Two strategies:** `SpotAllocationStrategy` and `PricingStrategy`. A new price rule (weekend, electric car discount) is a new class.
- **Threads:** each `Floor` has its **own mutex**. `tryReserve` finds **and** marks the spot while holding it. Two gates on different floors never wait for each other. On the same floor they wait only for a very short time. The map of active tickets has its own small lock.
- **Time is passed in** (a `Minute` value), so the demo gives the same result every time.
- **Results, not exceptions,** for "lot is full" and "unknown ticket". These are normal things.
- A **Ticket** remembers the **spot and floor**, so leaving is O(1). We never search.

## Step 5: The code

```cpp run title="Parking lot: complete"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>
using namespace std;

using Minute = long;
enum class VehicleType { Motorcycle, Car, Truck };
enum class SpotSize { Small, Medium, Large };

const char* name(SpotSize s) { return s == SpotSize::Small ? "SMALL" : s == SpotSize::Medium ? "MEDIUM" : "LARGE"; }
SpotSize minimumSize(VehicleType v) { return v == VehicleType::Motorcycle ? SpotSize::Small : v == VehicleType::Car ? SpotSize::Medium : SpotSize::Large; }

struct Vehicle { string plate; VehicleType type; };

struct Spot {
    string id;
    SpotSize size;
    optional<string> occupiedBy;
    bool free() const { return !occupiedBy; }
    bool fits(const Vehicle& v) const { return static_cast<int>(size) >= static_cast<int>(minimumSize(v.type)); }
};

// ---------- strategy 1: which free spot? ----------
struct SpotAllocationStrategy {
    virtual ~SpotAllocationStrategy() = default;
    virtual Spot* choose(vector<Spot*>& candidates, const Vehicle& v) = 0;
};
struct SmallestFitFirst : SpotAllocationStrategy {         // avoid wasting big spots on small vehicles
    Spot* choose(vector<Spot*>& c, const Vehicle&) override {
        return *min_element(c.begin(), c.end(), [](Spot* a, Spot* b) { return static_cast<int>(a->size) < static_cast<int>(b->size); });
    }
};

// ---------- strategy 2: how much? ----------
struct PricingStrategy {
    virtual ~PricingStrategy() = default;
    virtual long fee(SpotSize s, long minutes) const = 0;
};
struct HourlyPricing : PricingStrategy {
    long rate(SpotSize s) const { return s == SpotSize::Small ? 20 : s == SpotSize::Medium ? 40 : 80; }
    long fee(SpotSize s, long minutes) const override {
        if (minutes <= 15) return 0;                       // grace period
        long hours = (minutes + 59) / 60;                  // every started hour
        return min(hours, 10L) * rate(s);                  // daily cap: 10 hours
    }
};

class Floor {
    int number_;
    vector<Spot> spots_;
    mutable mutex m_;
public:
    Floor(int number, int small, int medium, int large) : number_(number) {
        auto add = [&](SpotSize s, int count, char code) { for (int i = 1; i <= count; ++i) spots_.push_back({"F" + to_string(number) + "-" + code + to_string(i), s, nullopt}); };
        add(SpotSize::Small, small, 'S'); add(SpotSize::Medium, medium, 'M'); add(SpotSize::Large, large, 'L');
    }
    // find AND occupy in one critical section: two gates cannot get the same spot
    Spot* tryReserve(const Vehicle& v, SpotAllocationStrategy& alloc) {
        lock_guard lock(m_);
        vector<Spot*> candidates;
        for (auto& s : spots_) if (s.free() && s.fits(v)) candidates.push_back(&s);
        if (candidates.empty()) return nullptr;
        Spot* s = alloc.choose(candidates, v);
        s->occupiedBy = v.plate;
        return s;
    }
    void release(Spot* s) { lock_guard lock(m_); s->occupiedBy.reset(); }
    string availability() const {
        lock_guard lock(m_);
        int freeCount[3] = {0, 0, 0};
        for (const auto& s : spots_) if (s.free()) ++freeCount[static_cast<int>(s.size)];
        return "floor " + to_string(number_) + ": small=" + to_string(freeCount[0]) + " medium=" + to_string(freeCount[1]) + " large=" + to_string(freeCount[2]);
    }
};

struct Ticket { string id; Vehicle vehicle; Spot* spot; Floor* floor; Minute entry; };
struct Receipt { string ticketId; string spotId; long minutes; long fee; };

template <typename T> struct Result { optional<T> value; string error; explicit operator bool() const { return value.has_value(); } };

class ParkingLot {
    vector<unique_ptr<Floor>> floors_;
    unique_ptr<SpotAllocationStrategy> allocation_;
    unique_ptr<PricingStrategy> pricing_;
    map<string, Ticket> active_;
    mutex ticketsM_;
    int nextTicket_ = 1;
public:
    ParkingLot(unique_ptr<SpotAllocationStrategy> a, unique_ptr<PricingStrategy> p) : allocation_(move(a)), pricing_(move(p)) {}
    void addFloor(int small, int medium, int large) { floors_.push_back(make_unique<Floor>(static_cast<int>(floors_.size()) + 1, small, medium, large)); }

    Result<Ticket> park(const Vehicle& v, Minute at) {
        for (auto& f : floors_) {                          // lowest floor first (a policy that could also be a strategy)
            if (Spot* s = f->tryReserve(v, *allocation_)) {
                lock_guard lock(ticketsM_);
                Ticket t{"T-" + to_string(nextTicket_++), v, s, f.get(), at};
                active_.emplace(t.id, t);
                return {t, ""};
            }
        }
        return {nullopt, "no free spot for " + v.plate};
    }
    Result<Receipt> leave(const string& ticketId, Minute at) {
        Ticket t;
        {
            lock_guard lock(ticketsM_);
            auto it = active_.find(ticketId);
            if (it == active_.end()) return {nullopt, "unknown or already used ticket " + ticketId};
            t = it->second;
            active_.erase(it);
        }
        long minutes = at - t.entry;
        long fee = pricing_->fee(t.spot->size, minutes);
        t.floor->release(t.spot);
        return {Receipt{t.id, t.spot->id, minutes, fee}, ""};
    }
    void print() const { for (const auto& f : floors_) cout << "  " << f->availability() << "\n"; }
};

int main() {
    ParkingLot lot(make_unique<SmallestFitFirst>(), make_unique<HourlyPricing>());
    lot.addFloor(1, 2, 1);                                 // floor 1: 1 small, 2 medium, 1 large
    lot.addFloor(0, 1, 1);

    auto showEntry = [](const Result<Ticket>& r) {
        if (r) cout << "  ticket " << r.value->id << " -> spot " << r.value->spot->id << "\n"; else cout << "  refused: " << r.error << "\n";
    };
    cout << "entries:\n";
    auto t1 = lot.park({"KA-01-1234", VehicleType::Car}, 9 * 60 + 5);   showEntry(t1);
    auto t2 = lot.park({"MH-12-777", VehicleType::Motorcycle}, 9 * 60 + 10); showEntry(t2);
    auto t3 = lot.park({"KA-05-9999", VehicleType::Truck}, 9 * 60 + 12); showEntry(t3);
    auto t4 = lot.park({"DL-01-5555", VehicleType::Truck}, 9 * 60 + 15); showEntry(t4);
    auto t5 = lot.park({"TN-09-4321", VehicleType::Truck}, 9 * 60 + 20); showEntry(t5);      // no large spot left
    lot.print();

    cout << "exits:\n";
    auto show = [](const Result<Receipt>& r) {
        if (r) cout << "  " << r.value->ticketId << " left " << r.value->spotId << " after " << r.value->minutes << " min, pay Rs " << r.value->fee << "\n";
        else cout << "  refused: " << r.error << "\n";
    };
    show(lot.leave("T-1", 11 * 60 + 20));                  // 135 minutes: 3 started hours x 40 = 120
    show(lot.leave("T-2", 9 * 60 + 20));                   // 10 minutes: free
    show(lot.leave("T-2", 9 * 60 + 30));                   // already used
    lot.print();

    cout << "ten gates racing for the last spots:\n";
    ParkingLot busy(make_unique<SmallestFitFirst>(), make_unique<HourlyPricing>());
    busy.addFloor(0, 5, 0);                                // exactly 5 medium spots
    vector<thread> gates;
    vector<int> got(10, 0);
    for (int g = 0; g < 10; ++g) gates.emplace_back([&, g] { got[g] = busy.park({"CAR-" + to_string(g), VehicleType::Car}, 0) ? 1 : 0; });
    for (auto& t : gates) t.join();
    int parked = 0; for (int x : got) parked += x;
    cout << "  cars parked: " << parked << " of 10 (capacity 5: never oversold)\n";
}
```

## Edge cases

| Case | What happens |
|---|---|
| Lot is full for that vehicle type | `park` returns an error result, no exception |
| Ticket used twice, or unknown ticket | removing it from the map makes a second `leave` fail cleanly |
| Two gates want the same spot | `tryReserve` finds and marks the spot while holding the floor's lock |
| Vehicle bigger than every spot | `fits` is false everywhere: "no free spot" |
| Lost ticket | a `leaveByPlate` that finds the vehicle by plate and adds a penalty (extension) |
| Clock goes backwards | check that `at >= entry` (not shown) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Electric vehicle spots" | a new spot kind, and an allocation strategy that prefers EV spots for EVs |
| "Nearest to the exit" | a `NearestToGate` allocation strategy using spot positions |
| "Price changes at peak hours" | a new `PricingStrategy`, or a **Decorator** around `HourlyPricing` that adds an extra charge |
| "Reserve a spot" | a `Reservation` with a `TimeRange`. The allocation checks for overlaps |
| "Display boards on each floor" | **Observer**: floors announce when availability changes |
| "Many lots in one app" | a `ParkingService` that holds many lots (a Facade) |
| "Payment" | a `PaymentGateway` interface used by `leave`. Keep the spot until payment succeeds |
| "Thousands of gates" | per-floor locks already scale. Spread the floors over servers (this leads to HLD) |

## Short answer to say in an interview

:::interview How do you stop two gates from giving the same spot to two cars?
"Finding a free spot and marking it as taken must be one step. So each floor has its own mutex, and tryReserve does both under that lock. Gates on different floors do not block each other. I also keep the pricing rule and the spot-choosing rule as strategies, because those are the parts that change most."
:::

```quiz
? Why does Floor::tryReserve find and take the spot under one lock?
- To keep the code short
+ If finding and marking were separate steps, two gates could pick the same spot (a check-then-act race)
- Because spots never change
> One locked step makes the reservation safe.
? Why are pricing and allocation strategies and not code inside ParkingLot?
- To make the class bigger
+ They change most often, and strategies let us add new rules without editing ParkingLot
- Because C++ needs interfaces
> New rule, new class. Old code stays the same.
```

:::keypoints
- ParkingLot (main class), Floors (own spots and locks), Spot (fits and free), and two strategies (allocation and pricing).
- Reserve safely per floor. Tickets make exit O(1). Normal failures return results, not exceptions.
- Pass time in for predictable tests. Most extensions mean a new strategy, decorator or observer.
:::
