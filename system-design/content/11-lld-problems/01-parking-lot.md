---
title: Design a Parking Lot
level: intermediate
time: 60
summary: The most-asked LLD question, solved end to end — requirements, entities, class diagram, the park/leave flow, spot allocation and pricing as strategies, per-floor locking for concurrent gates, and a complete runnable implementation in C++ and JavaScript, plus the extensions interviewers ask next.
---

:::problem Design a Parking Lot {level=medium tags="LLD,Strategy,concurrency,classic"}
Design the software for a multi-floor parking lot. Vehicles of different sizes enter through several gates, get a ticket for a suitable spot, and pay by duration when they leave. Model the classes, implement park and leave, and make it safe when several gates operate at once.

:::hint Hint
Find the variation points first: how a spot is chosen, and how the fee is computed. Both change often in real businesses, so make them strategies. Then decide what must be atomic when two gates assign spots at the same moment.
:::
:::

## Step 1: clarify the requirements

Questions worth asking, with the answers we'll assume:

| Question | Assumption |
|---|---|
| Vehicle types? | motorcycle, car, truck, electric car |
| Spot types? | motorcycle, compact, large, EV (with charger) |
| Which vehicles fit which spots? | a vehicle may use its own size or **larger**; EVs prefer EV spots |
| Several floors and gates? | yes, several entry and exit gates operating **concurrently** |
| Pricing? | hourly rate depends on spot type, rounded up per started hour, first 15 minutes free; may change |
| How is a spot chosen? | lowest floor first today; "nearest to the gate" possibly later |
| Payment? | at exit; payment details out of scope (an interface) |
| Displays? | free spots per floor and type |

**Out of scope**: reservations, monthly passes, license-plate cameras (mention them as extensions).

## Step 2: entities and relationships

Nouns from the requirements: **ParkingLot, Floor, Spot, Vehicle, Ticket, Gate**, plus the two variation points: **SpotAllocationStrategy** and **PricingStrategy**.

```viz algo=uml title="Parking lot: class diagram"
class ParkingLot
  - floors: Floor[]
  - active: map<ticketId, Ticket>
  + park(v: Vehicle, at: Time): Ticket
  + leave(ticketId, at: Time): Receipt
  + availability(): string
class Floor
  - number: int
  - spots: Spot[]
  - lock: mutex
  + tryReserve(v: Vehicle, s: Strategy): Spot
class Spot
  - id: string
  - type: SpotType
  - vehicle: Vehicle
class Vehicle
  - plate: string
  - type: VehicleType
class Ticket
  - id: string
  - spot: Spot
  - entry: Time
interface SpotAllocationStrategy
  + choose(free: Spot[], v: Vehicle): Spot
interface PricingStrategy
  + fee(spotType, minutes): Money
class LowestFloorFirst
class HourlyPricing
ParkingLot *-- Floor : 1..*
Floor *-- Spot : 1..*
Spot --> Vehicle : 0..1
Ticket --> Spot
ParkingLot --> SpotAllocationStrategy
ParkingLot --> PricingStrategy
LowestFloorFirst ..|> SpotAllocationStrategy
HourlyPricing ..|> PricingStrategy
```

Responsibilities:

- **ParkingLot** coordinates: issue tickets, close them, report availability. It holds no pricing or allocation rules (SRP).
- **Floor** owns its spots and its **lock**: reserving a spot on a floor is one atomic step.
- **Spot** knows its type and whether it's occupied, and whether a vehicle **fits**.
- **Ticket** records which vehicle took which spot when.
- **Strategies** hold the rules that change: which spot, and how much.

## Step 3: the main flows

```viz algo=seq title="Entry and exit"
participant g EntryGate [gateway]
participant lot ParkingLot [box]
participant f Floor [box]
participant ps Pricing [pay]
participant x ExitGate [gateway]
g -> lot : park(car KA-01-1234, 09:05)
lot -> f : tryReserve(car, allocator) | Floors are tried in order; each reserves under its own lock.
f --> lot : spot F1-C3
lot --> g : Ticket T1 (F1-C3, 09:05)
== later ==
x -> lot : leave(T1, 11:20)
lot -> ps : fee(COMPACT, 135 minutes)
ps --> lot : Rs 120 (3 started hours)
lot -> f : free spot F1-C3
lot --> x : Receipt T1, Rs 120
```

## Step 4: the implementation

:::tabs Parking lot (complete)
```cpp run
#include <bits/stdc++.h>
using namespace std;

enum class VehicleType { MOTORCYCLE, CAR, TRUCK, EV_CAR };
enum class SpotType { MOTORCYCLE, COMPACT, LARGE, EV };

string name(SpotType t) { return array<string, 4>{"MOTORCYCLE", "COMPACT", "LARGE", "EV"}[(int)t]; }

struct Vehicle { string plate; VehicleType type; };

// Which spot types a vehicle may use, in order of preference (smallest suitable first)
vector<SpotType> allowedSpots(VehicleType v) {
    switch (v) {
        case VehicleType::MOTORCYCLE: return {SpotType::MOTORCYCLE, SpotType::COMPACT, SpotType::LARGE};
        case VehicleType::CAR:        return {SpotType::COMPACT, SpotType::LARGE};
        case VehicleType::TRUCK:      return {SpotType::LARGE};
        case VehicleType::EV_CAR:     return {SpotType::EV, SpotType::COMPACT, SpotType::LARGE};
    }
    return {};
}

struct Spot {
    string id; SpotType type; optional<string> plate;     // occupied when plate is set
    bool free() const { return !plate; }
};

// ---- Strategy 1: which free spot to take ----
struct SpotAllocationStrategy {
    virtual ~SpotAllocationStrategy() = default;
    virtual Spot* choose(vector<Spot*>& candidates, const Vehicle& v) = 0;
};
struct SmallestFitFirst : SpotAllocationStrategy {          // prefer the most specific spot type
    Spot* choose(vector<Spot*>& c, const Vehicle& v) override {
        auto pref = allowedSpots(v.type);
        Spot* best = nullptr; size_t bestRank = SIZE_MAX;
        for (Spot* s : c) {
            size_t rank = find(pref.begin(), pref.end(), s->type) - pref.begin();
            if (rank < bestRank) { best = s; bestRank = rank; }
        }
        return best;
    }
};

// ---- Strategy 2: how much to charge ----
struct PricingStrategy {
    virtual ~PricingStrategy() = default;
    virtual long fee(SpotType t, long minutes) const = 0;
};
struct HourlyPricing : PricingStrategy {
    map<SpotType, long> perHour{{SpotType::MOTORCYCLE, 20}, {SpotType::COMPACT, 40}, {SpotType::LARGE, 80}, {SpotType::EV, 60}};
    long fee(SpotType t, long minutes) const override {
        if (minutes <= 15) return 0;                          // grace period
        long hours = (minutes + 59) / 60;                     // every started hour
        return min(hours * perHour.at(t), 10 * perHour.at(t)); // daily cap: 10 hours' worth
    }
};

class Floor {
    int number_;
    vector<Spot> spots_;
    mutable mutex m_;                                         // guards this floor's spots
public:
    Floor(int number, vector<pair<SpotType, int>> layout) : number_(number) {
        const char* code = "MCLE";
        for (auto [type, count] : layout)
            for (int i = 1; i <= count; i++) spots_.push_back({"F" + to_string(number) + "-" + code[(int)type] + to_string(i), type, nullopt});
    }
    // Find AND occupy a spot in one critical section: two gates can't get the same spot
    Spot* tryReserve(const Vehicle& v, SpotAllocationStrategy& alloc) {
        lock_guard lock(m_);
        auto allowed = allowedSpots(v.type);
        vector<Spot*> candidates;
        for (auto& s : spots_) if (s.free() && find(allowed.begin(), allowed.end(), s.type) != allowed.end()) candidates.push_back(&s);
        if (candidates.empty()) return nullptr;
        Spot* s = alloc.choose(candidates, v);
        s->plate = v.plate;
        return s;
    }
    void release(Spot* s) { lock_guard lock(m_); s->plate.reset(); }
    string availability() const {
        lock_guard lock(m_);
        map<SpotType, int> freeCount;
        for (auto& s : spots_) if (s.free()) freeCount[s.type]++;
        string out = "Floor " + to_string(number_) + ":";
        for (auto [t, n] : freeCount) out += " " + name(t) + "=" + to_string(n);
        return out;
    }
};

struct Ticket { string id; Vehicle vehicle; Spot* spot; Floor* floor; long entryMin; };
struct Receipt { string ticketId; string spotId; long minutes; long fee; };

class ParkingLot {
    vector<unique_ptr<Floor>> floors_;
    unique_ptr<SpotAllocationStrategy> alloc_;
    unique_ptr<PricingStrategy> pricing_;
    unordered_map<string, Ticket> active_;
    mutex ticketsM_;
    atomic<int> nextTicket_{1};
public:
    ParkingLot(unique_ptr<SpotAllocationStrategy> a, unique_ptr<PricingStrategy> p) : alloc_(std::move(a)), pricing_(std::move(p)) {}
    void addFloor(unique_ptr<Floor> f) { floors_.push_back(std::move(f)); }

    optional<Ticket> park(const Vehicle& v, long nowMin) {
        for (auto& f : floors_)                                // lowest floor first
            if (Spot* s = f->tryReserve(v, *alloc_)) {
                Ticket t{"T" + to_string(nextTicket_++), v, s, f.get(), nowMin};
                lock_guard lock(ticketsM_);
                active_[t.id] = t;
                return t;
            }
        return nullopt;                                        // lot full for this vehicle type
    }
    Receipt leave(const string& ticketId, long nowMin) {
        Ticket t;
        {
            lock_guard lock(ticketsM_);
            auto it = active_.find(ticketId);
            if (it == active_.end()) throw invalid_argument("unknown or already used ticket " + ticketId);
            t = it->second;
            active_.erase(it);                                 // a ticket can be used once
        }
        long minutes = nowMin - t.entryMin;
        long fee = pricing_->fee(t.spot->type, minutes);
        t.floor->release(t.spot);
        return {t.id, t.spot->id, minutes, fee};
    }
    void printAvailability() const { for (auto& f : floors_) cout << "  " << f->availability() << "\n"; }
};

int main() {
    ParkingLot lot(make_unique<SmallestFitFirst>(), make_unique<HourlyPricing>());
    lot.addFloor(make_unique<Floor>(1, vector<pair<SpotType, int>>{{SpotType::MOTORCYCLE, 2}, {SpotType::COMPACT, 2}, {SpotType::LARGE, 1}, {SpotType::EV, 1}}));
    lot.addFloor(make_unique<Floor>(2, vector<pair<SpotType, int>>{{SpotType::COMPACT, 3}, {SpotType::LARGE, 2}}));

    auto t1 = lot.park({"KA-01-1234", VehicleType::CAR}, 9 * 60 + 5);
    auto t2 = lot.park({"KA-05-9999", VehicleType::EV_CAR}, 9 * 60 + 10);
    auto t3 = lot.park({"MH-12-0001", VehicleType::TRUCK}, 9 * 60 + 15);
    auto t4 = lot.park({"MH-12-0002", VehicleType::TRUCK}, 9 * 60 + 20);
    for (auto* t : {&t1, &t2, &t3, &t4}) cout << "parked " << (*t)->vehicle.plate << " at " << (*t)->spot->id << " (ticket " << (*t)->id << ")\n";
    lot.printAvailability();

    auto r = lot.leave(t1->id, 11 * 60 + 20);
    cout << "receipt " << r.ticketId << ": " << r.spotId << ", " << r.minutes << " min, Rs " << r.fee << "\n";
    try { lot.leave(t1->id, 11 * 60 + 30); } catch (const exception& e) { cout << "error: " << e.what() << "\n"; }

    // Concurrency check: 6 gates park 6 bikes at once; every spot must be unique
    vector<thread> gates; vector<string> spots(6);
    for (int g = 0; g < 6; g++) gates.emplace_back([&, g] {
        auto t = lot.park({"BIKE-" + to_string(g), VehicleType::MOTORCYCLE}, 12 * 60);
        spots[g] = t ? t->spot->id : "FULL";
    });
    for (auto& t : gates) t.join();
    set<string> unique(spots.begin(), spots.end());
    cout << "6 concurrent bikes got " << unique.size() << " distinct spots\n";
    lot.printAvailability();
}
```
```js run
const VehicleType = Object.freeze({ MOTORCYCLE: "MOTORCYCLE", CAR: "CAR", TRUCK: "TRUCK", EV_CAR: "EV_CAR" });
const SpotType = Object.freeze({ MOTORCYCLE: "MOTORCYCLE", COMPACT: "COMPACT", LARGE: "LARGE", EV: "EV" });

// Which spot types a vehicle may use, in order of preference (smallest suitable first)
const ALLOWED = {
  MOTORCYCLE: ["MOTORCYCLE", "COMPACT", "LARGE"],
  CAR: ["COMPACT", "LARGE"],
  TRUCK: ["LARGE"],
  EV_CAR: ["EV", "COMPACT", "LARGE"],
};

class Spot {
  constructor(id, type) { this.id = id; this.type = type; this.plate = null; }
  get free() { return this.plate === null; }
}

// ---- Strategy 1: which free spot to take ----
const smallestFitFirst = {
  choose(candidates, vehicle) {
    const pref = ALLOWED[vehicle.type];
    return candidates.reduce((best, s) => (!best || pref.indexOf(s.type) < pref.indexOf(best.type) ? s : best), null);
  },
};

// ---- Strategy 2: how much to charge ----
class HourlyPricing {
  perHour = { MOTORCYCLE: 20, COMPACT: 40, LARGE: 80, EV: 60 };
  fee(spotType, minutes) {
    if (minutes <= 15) return 0;                              // grace period
    const hours = Math.ceil(minutes / 60);                    // every started hour
    return Math.min(hours, 10) * this.perHour[spotType];      // daily cap: 10 hours' worth
  }
}

class Floor {
  constructor(number, layout) {
    this.number = number;
    this.spots = [];
    const code = { MOTORCYCLE: "M", COMPACT: "C", LARGE: "L", EV: "E" };
    for (const [type, count] of layout) for (let i = 1; i <= count; i++) this.spots.push(new Spot(`F${number}-${code[type]}${i}`, type));
  }
  // Find AND occupy in one synchronous step: no await in between, so no other gate can interleave
  tryReserve(vehicle, allocator) {
    const allowed = ALLOWED[vehicle.type];
    const candidates = this.spots.filter((s) => s.free && allowed.includes(s.type));
    if (!candidates.length) return null;
    const spot = allocator.choose(candidates, vehicle);
    spot.plate = vehicle.plate;
    return spot;
  }
  release(spot) { spot.plate = null; }
  availability() {
    const free = {};
    for (const s of this.spots) if (s.free) free[s.type] = (free[s.type] ?? 0) + 1;
    return `Floor ${this.number}: ` + Object.entries(free).map(([t, n]) => `${t}=${n}`).join(" ");
  }
}

class ParkingLot {
  #floors = []; #active = new Map(); #nextTicket = 1;
  constructor(allocator, pricing) { this.allocator = allocator; this.pricing = pricing; }
  addFloor(floor) { this.#floors.push(floor); return this; }
  park(vehicle, nowMin) {
    for (const floor of this.#floors) {                        // lowest floor first
      const spot = floor.tryReserve(vehicle, this.allocator);
      if (spot) {
        const ticket = { id: `T${this.#nextTicket++}`, vehicle, spot, floor, entryMin: nowMin };
        this.#active.set(ticket.id, ticket);
        return ticket;
      }
    }
    return null;                                               // full for this vehicle type
  }
  leave(ticketId, nowMin) {
    const t = this.#active.get(ticketId);
    if (!t) throw new Error(`unknown or already used ticket ${ticketId}`);
    this.#active.delete(ticketId);                             // a ticket can be used once
    const minutes = nowMin - t.entryMin;
    t.floor.release(t.spot);
    return { ticketId, spotId: t.spot.id, minutes, fee: this.pricing.fee(t.spot.type, minutes) };
  }
  printAvailability() { for (const f of this.#floors) console.log("  " + f.availability()); }
}

const lot = new ParkingLot(smallestFitFirst, new HourlyPricing())
  .addFloor(new Floor(1, [["MOTORCYCLE", 2], ["COMPACT", 2], ["LARGE", 1], ["EV", 1]]))
  .addFloor(new Floor(2, [["COMPACT", 3], ["LARGE", 2]]));

const tickets = [
  lot.park({ plate: "KA-01-1234", type: VehicleType.CAR }, 9 * 60 + 5),
  lot.park({ plate: "KA-05-9999", type: VehicleType.EV_CAR }, 9 * 60 + 10),
  lot.park({ plate: "MH-12-0001", type: VehicleType.TRUCK }, 9 * 60 + 15),
  lot.park({ plate: "MH-12-0002", type: VehicleType.TRUCK }, 9 * 60 + 20),
];
for (const t of tickets) console.log(`parked ${t.vehicle.plate} at ${t.spot.id} (ticket ${t.id})`);
lot.printAvailability();

const r = lot.leave(tickets[0].id, 11 * 60 + 20);
console.log(`receipt ${r.ticketId}: ${r.spotId}, ${r.minutes} min, Rs ${r.fee}`);
try { lot.leave(tickets[0].id, 11 * 60 + 30); } catch (e) { console.log("error:", e.message); }

const bikes = Array.from({ length: 6 }, (_, g) => lot.park({ plate: `BIKE-${g}`, type: VehicleType.MOTORCYCLE }, 12 * 60));
console.log(`6 bikes got ${new Set(bikes.map((t) => t?.spot.id ?? "FULL")).size} distinct spots`);
lot.printAvailability();
```
:::

## Step 5: walk through the design decisions

**Why strategies for allocation and pricing?** Both are stated or obvious variation points. Weekend rates, "first hour free for shoppers", or "nearest to the lift" become new classes; `ParkingLot` doesn't change (Open/Closed).

**Why lock per floor?** Assigning a spot is a **check-then-act** (find a free spot, then occupy it). Doing both under the floor's lock makes it atomic, so two gates can never get the same spot (the C++ demo runs six gates in parallel). A single lot-wide lock would also be correct but would serialise every gate; per-floor locks let gates working on different floors proceed in parallel. Ticket bookkeeping has its own small lock, and the ticket counter is atomic. In JavaScript, `tryReserve` is synchronous (no `await` between finding and occupying), which gives the same guarantee on one thread.

**Why is the ticket removed before computing the fee?** So the same ticket can't be used twice by two exit gates racing (the second gets "already used").

**Why pass time in?** Injecting "now" (or a clock) makes fees testable without waiting hours.

**Should ParkingLot be a Singleton?** There's one lot per process in this problem, but it's created once in `main` and passed where needed, which keeps it testable (the Singleton lesson's advice). If the interviewer expects a singleton, mention the thread-safe Meyers singleton and why you'd still inject it.

## Step 6: extensions interviewers ask

| Follow-up | How the design absorbs it |
|---|---|
| Hourly rates differ on weekends / by membership | a new `PricingStrategy` (or a decorator adding discounts) |
| "Assign the spot nearest to the entry gate" | a new `SpotAllocationStrategy` that knows spot distances per gate |
| Display boards per floor | boards **observe** floors (Observer) and refresh on park/leave |
| Payment by card, UPI, cash | a `PaymentProcessor` interface (Strategy/Adapter) at the exit gate |
| Reservations | a `Reservation` that holds a spot for a time window, with expiry |
| EV charging billed by kWh | the EV spot exposes meter readings; pricing adds an energy component |
| Multiple lots / a city-wide system | lots become a service; spot state moves to a database with conditional updates (`UPDATE spots SET plate=? WHERE id=? AND plate IS NULL`) |

```quiz
? Why must "find a free spot" and "mark it occupied" happen inside the same lock?
+ Otherwise two gates can find the same free spot and both occupy it (a check-then-act race)
- To make finding spots faster
- Because spots are immutable
> The find and the update together form the critical section.

? A new requirement says "night parking costs a flat Rs 150". Which part of the design changes?
+ A new PricingStrategy implementation is added; ParkingLot is unchanged
- ParkingLot.leave() gets an if/else for night time
- The Spot class gets a night flag
> Pricing is a variation point behind an interface (Open/Closed).

? Why does leave() remove the ticket from the active map before releasing the spot and computing the fee?
+ So a second exit attempt with the same ticket is rejected, even if two gates race
- To save memory
- Because the fee depends on it
> Consuming the ticket first makes checkout idempotent-safe.
```

:::keypoints
- Clarify vehicle and spot types, fit rules, floors/gates, pricing and allocation rules; park the rest as extensions.
- Entities: **ParkingLot** (coordinator), **Floor** (owns spots + a lock), **Spot**, **Vehicle**, **Ticket**; **SpotAllocationStrategy** and **PricingStrategy** for the variation points.
- Make **find + occupy** atomic per floor; consume tickets once; keep a ticket counter atomic; inject time.
- Extensions map onto patterns: Strategy (pricing, allocation, payment), Observer (displays), conditional DB updates when distributed.
:::
