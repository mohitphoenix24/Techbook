---
title: Design a Parking Lot
level: easy
time: 50
summary: The most-asked LLD question: multi-floor lot, vehicle and spot types, tickets, pluggable spot-allocation and pricing strategies, per-floor locking so several gates can work at once, and a complete runnable implementation with the follow-ups that interviewers ask next.
---

:::problem Design a Parking Lot {level=easy tags="classic,Strategy,concurrency,booking,most asked"}
Design the software for a multi-floor parking lot. Vehicles of different sizes enter through several gates, receive a ticket for a suitable spot, and pay by duration when they leave. Model the classes, implement park and leave, and make it safe when several gates operate at once.

:::hint Hint
Find the variation points first: how a spot is chosen, and how the fee is computed. Both change in real businesses, so make them strategies. Then decide what must be atomic when two gates assign a spot at the same moment: finding a free spot and marking it taken is **one** critical step.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Vehicle types? | motorcycle, car, truck |
| Spot types? | small (motorcycle), medium (car), large (truck) |
| Which vehicle fits which spot? | a vehicle may use its own size **or larger**; smallest fit preferred |
| Floors and gates? | several floors; several entry and exit gates operating **concurrently** |
| Pricing? | per started hour by spot size, first 15 minutes free; rules may change |
| Spot choice? | lowest floor first today; "nearest to the exit" possibly later |
| Payment? | at exit; the payment system is out of scope (an interface) |
| Display? | free spots per floor and type |

Out of scope: reservations, monthly passes, number-plate cameras (mention as extensions).

## Step 2: entities

Nouns: **ParkingLot, Floor, Spot, Vehicle, Ticket, Gate**, plus two variation points: **SpotAllocationStrategy** and **PricingStrategy**.

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

Responsibilities:

- **ParkingLot** (coordinator): issues and closes tickets, reports availability. No pricing or allocation rules inside (SRP).
- **Floor** owns its spots and its **lock**. Reserving a spot on a floor is one atomic step.
- **Spot** knows its size, whether it is free, and whether a vehicle **fits**.
- **Strategies** hold the rules that change.

## Step 3: flows

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

## Step 4: design decisions

- **Strategy x2**: `SpotAllocationStrategy` and `PricingStrategy`. A new pricing model (weekend, EV discount) is a new class.
- **Concurrency**: each `Floor` has its own mutex; `tryReserve` finds **and** marks the spot under it. Two gates parking at the same time on different floors never block each other; on the same floor they serialise only briefly. The active-ticket map has its own small lock.
- **Time is injected** (`Minute` parameter) so the demo is deterministic.
- **Results, not exceptions**, for "lot full" and "unknown ticket": these are normal outcomes.
- A **Ticket** records the **Spot pointer and floor** so that `leave` is O(1), with no search.

## Step 5: the code

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

| Case | Handling |
|---|---|
| Lot full for that vehicle type | `park` returns an error result, no exception |
| Ticket used twice / unknown ticket | the map erase makes a second `leave` fail cleanly |
| Two gates, same spot | `tryReserve` finds and marks under the floor's lock |
| Vehicle bigger than any spot | `fits` is false everywhere: "no free spot" |
| Lost ticket | a `leaveByPlate` that looks up by plate and applies a penalty (extension) |
| Clock goes backwards | validate `at >= entry` (not shown) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Electric vehicle spots" | new `SpotSize`/`SpotKind` plus an allocation strategy preferring EV spots for EVs |
| "Nearest to the exit" | a `NearestToGate` allocation strategy using spot coordinates |
| "Dynamic pricing (peak hours)" | a new `PricingStrategy`, or a **Decorator** around `HourlyPricing` adding a surcharge |
| "Reserve a spot" | a `Reservation` with a `TimeRange`; spot allocation checks overlaps |
| "Display boards per floor" | **Observer**: floors publish availability changes |
| "Multiple lots, one app" | a `ParkingService` holding many lots (a Facade) |
| "Payment" | a `PaymentGateway` interface called by `leave`; keep the spot until payment succeeds |
| "Thousands of gates" | per-floor locks already scale; shard floors across servers (leads into HLD) |

```quiz
? Why does `Floor::tryReserve` both find and occupy the spot under one lock?
- To keep the code short
+ If finding and marking were separate steps, two gates could choose the same spot (check-then-act race)
- Because spots are immutable
> One critical section makes the reservation atomic.
? Why are pricing and allocation strategies, not code inside ParkingLot?
- To make the class bigger
+ They are the parts most likely to change; strategies let new rules be added without editing ParkingLot
- Because C++ requires interfaces
> Open/Closed at the variation points.
```

:::keypoints
- Coordinator (ParkingLot) + Floors (own spots and locks) + Spot (fits/free) + two Strategies (allocation, pricing).
- Reserve atomically per floor; tickets give O(1) exit; results instead of exceptions for normal failures.
- Inject time for determinism. Extensions mostly mean a new strategy, a decorator, or an observer.
:::
