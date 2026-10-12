---
title: Design a Ride-Sharing Service (LLD)
level: advanced
time: 65
summary: Uber/Ola at the class level — riders, drivers and trips, a trip lifecycle state machine with legal transitions, a pluggable matching strategy (nearest, rating-aware) with offer/decline handling, fare calculation with surge pricing as strategies, and atomic driver assignment so one driver can't get two trips — in C++ and JavaScript.
---

:::problem Design a Ride-Sharing App (LLD) {level=hard tags="LLD,State,Strategy,concurrency"}
Model the core of a ride-hailing app: drivers go online and report locations; riders request rides; the system matches a nearby available driver, who can accept or decline; the trip moves through its lifecycle to completion, and the fare is computed (with surge pricing when demand is high). Two simultaneous requests must never get the same driver.

:::hint Hint
Three variation points: how drivers are matched, how fares are priced, and how surge is computed (all strategies). The trip itself is a state machine. Assigning a driver is a check-then-act on the driver's status, so make it atomic.
:::
:::

The HLD version of this problem (millions of location updates, geospatial indexing, dispatch at city scale) is a case study later in the course. Here we design the **objects and their rules**.

## Requirements

- Drivers: register with a vehicle type, go **online/offline**, update their **location**, **accept/decline** offers, complete trips, get rated.
- Riders: **request** a ride (pickup, drop, vehicle type), see a **fare estimate**, **cancel**, rate the driver.
- Matching: the best available driver of the right type within a radius; if they decline (or time out), offer the **next** candidate.
- Trips: `REQUESTED → DRIVER_ASSIGNED → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`, with `CANCELLED` allowed before the trip starts.
- Fare: base + per km + per minute, by vehicle type, times a **surge** multiplier from demand/supply in the area.
- Concurrency: a driver is assigned to at most one trip at a time.

## Design

```viz algo=uml title="Ride-sharing classes"
class RideService
  - drivers: map<id, Driver>
  - trips: map<id, Trip>
  - matcher: MatchingStrategy
  - pricing: PricingStrategy
  - surge: SurgeStrategy
  + requestRide(rider, from, to, type): Trip
  + respond(tripId, driverId, accept)
  + advance(tripId, event)
class Driver
  - id: string
  - type: VehicleType
  - location: Point
  - status: DriverStatus
  - rating: double
  + tryReserve(): bool
  + release()
class Rider
  - id: string
  - rating: double
class Trip
  - id: string
  - state: TripState
  - pickup: Point
  - drop: Point
  - driver: Driver
  - fare: Money
  + transition(event): bool
interface MatchingStrategy
  + candidates(drivers, pickup, type): Driver[]
interface PricingStrategy
  + fare(type, km, minutes, surge): Money
interface SurgeStrategy
  + multiplier(area): double
class NearestFirst
class RatingWeighted
RideService o-- Driver
RideService o-- Trip
Trip --> Driver
Trip --> Rider
RideService --> MatchingStrategy
RideService --> PricingStrategy
RideService --> SurgeStrategy
NearestFirst ..|> MatchingStrategy
RatingWeighted ..|> MatchingStrategy
```

### The trip state machine

```viz algo=arch title="Trip lifecycle" dir=right
req     REQUESTED [box]
asg     DRIVER_ASSIGNED [box]
arr     DRIVER_ARRIVED [box]
prog    IN_PROGRESS [box]
done    COMPLETED [box]
canc    CANCELLED [box]
--
req -> asg : driver accepts
asg -> arr : driver at pickup
arr -> prog : rider picked up
prog -> done : dropped off → fare charged
req -> canc : no driver / rider cancels
asg -> canc : cancel (fee may apply)
arr -> canc : cancel / no-show
```

Transitions are enforced with a **transition table** (the State lesson's lighter alternative): an illegal event, such as "start trip" from REQUESTED, is rejected.

### Matching with offers

```viz algo=seq title="Request, offer, decline, re-offer"
participant r Rider [user]
participant s RideService [service]
participant d1 Driver A (nearest) [mobile]
participant d2 Driver B [mobile]
r -> s : requestRide(pickup, drop, SEDAN)
s -> s : candidates = nearest available sedans within 5 km
s -> d1 : tryReserve() → ok; offer trip T1 (15 s to respond) | Reserved atomically: no other trip can take A meanwhile.
d1 --> s : decline
s -> d1 : release()
s -> d2 : tryReserve() → ok; offer T1
d2 --> s : accept → T1 DRIVER_ASSIGNED
s --> r : Driver B arriving in 4 min, fare estimate Rs 287
```

## Implementation

:::tabs Ride-sharing core
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Point { double x, y; };                               // km on a city grid (real systems: lat/lng + haversine)
double dist(Point a, Point b) { return hypot(a.x - b.x, a.y - b.y); }

enum class VehicleType { AUTO, SEDAN, SUV };
enum class DriverStatus { OFFLINE, AVAILABLE, RESERVED, ON_TRIP };

class Driver {
public:
    const string id; const VehicleType type;
    Point location; double rating;
    Driver(string id, VehicleType t, Point p, double r) : id(std::move(id)), type(t), location(p), rating(r) {}
    bool tryReserve() {                                       // atomic AVAILABLE -> RESERVED: one trip at a time
        DriverStatus expected = DriverStatus::AVAILABLE;
        return status_.compare_exchange_strong(expected, DriverStatus::RESERVED);
    }
    void release() { status_ = DriverStatus::AVAILABLE; }
    void startTrip() { status_ = DriverStatus::ON_TRIP; }
    void goOnline() { status_ = DriverStatus::AVAILABLE; }
    DriverStatus status() const { return status_; }
private:
    atomic<DriverStatus> status_{DriverStatus::OFFLINE};
};

// ---- Strategies ----
struct MatchingStrategy { virtual ~MatchingStrategy() = default; virtual vector<Driver*> candidates(vector<Driver*>, Point, VehicleType) const = 0; };
struct NearestFirst : MatchingStrategy {
    double radiusKm = 5;
    vector<Driver*> candidates(vector<Driver*> ds, Point p, VehicleType t) const override {
        vector<Driver*> out;
        for (auto* d : ds) if (d->type == t && d->status() == DriverStatus::AVAILABLE && dist(d->location, p) <= radiusKm) out.push_back(d);
        sort(out.begin(), out.end(), [&](Driver* a, Driver* b) { return dist(a->location, p) < dist(b->location, p); });
        return out;
    }
};
struct PricingStrategy { virtual ~PricingStrategy() = default; virtual long fare(VehicleType, double km, double min, double surge) const = 0; };
struct StandardPricing : PricingStrategy {
    long fare(VehicleType t, double km, double minutes, double surge) const override {
        static const map<VehicleType, array<double, 3>> rate{{VehicleType::AUTO, {30, 11, 1}}, {VehicleType::SEDAN, {50, 14, 1.5}}, {VehicleType::SUV, {80, 18, 2}}};
        auto [base, perKm, perMin] = rate.at(t);
        return lround((base + perKm * km + perMin * minutes) * surge);
    }
};
struct DemandSupplySurge {                                    // surge = clamp(open requests / available drivers, 1, 2.5)
    double multiplier(int openRequests, int availableDrivers) const {
        if (availableDrivers == 0) return 2.5;
        return clamp(round((double)openRequests / availableDrivers * 10) / 10, 1.0, 2.5);
    }
};

// ---- Trip with a transition table ----
enum class TripState { REQUESTED, DRIVER_ASSIGNED, DRIVER_ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED };
const char* name(TripState s) { return array<const char*, 6>{"REQUESTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}[(int)s]; }
const map<pair<TripState, string>, TripState> TRANSITIONS = {
    {{TripState::REQUESTED, "accept"}, TripState::DRIVER_ASSIGNED},
    {{TripState::REQUESTED, "cancel"}, TripState::CANCELLED},
    {{TripState::DRIVER_ASSIGNED, "arrive"}, TripState::DRIVER_ARRIVED},
    {{TripState::DRIVER_ASSIGNED, "cancel"}, TripState::CANCELLED},
    {{TripState::DRIVER_ARRIVED, "start"}, TripState::IN_PROGRESS},
    {{TripState::DRIVER_ARRIVED, "cancel"}, TripState::CANCELLED},
    {{TripState::IN_PROGRESS, "complete"}, TripState::COMPLETED},
};

struct Trip {
    string id, rider; Point pickup, drop; VehicleType type;
    TripState state = TripState::REQUESTED;
    Driver* driver = nullptr; long estimate = 0, fare = 0; double surge = 1;
    vector<Driver*> queue; size_t next = 0;                   // remaining candidates to offer
    bool transition(const string& ev) {
        auto it = TRANSITIONS.find({state, ev});
        if (it == TRANSITIONS.end()) return false;
        state = it->second;
        return true;
    }
};

class RideService {
    vector<unique_ptr<Driver>> drivers_;
    map<string, Trip> trips_;
    const MatchingStrategy& matcher_; const PricingStrategy& pricing_; DemandSupplySurge surge_;
    int seq_ = 0;
    vector<Driver*> driverPtrs() { vector<Driver*> v; for (auto& d : drivers_) v.push_back(d.get()); return v; }
    void offerNext(Trip& t) {                                 // reserve the next candidate who is still free
        while (t.next < t.queue.size()) {
            Driver* d = t.queue[t.next++];
            if (d->tryReserve()) { t.driver = d; cout << "  offer " << t.id << " -> " << d->id << "\n"; return; }
        }
        t.driver = nullptr;
        t.transition("cancel");
        cout << "  " << t.id << ": no driver available, cancelled\n";
    }
public:
    RideService(const MatchingStrategy& m, const PricingStrategy& p) : matcher_(m), pricing_(p) {}
    Driver& addDriver(string id, VehicleType t, Point p, double rating) { drivers_.push_back(make_unique<Driver>(std::move(id), t, p, rating)); drivers_.back()->goOnline(); return *drivers_.back(); }

    string requestRide(const string& rider, Point from, Point to, VehicleType type, int openRequests = 1) {
        string id = "T" + to_string(++seq_);
        Trip t;
        t.id = id; t.rider = rider; t.pickup = from; t.drop = to; t.type = type;
        int available = count_if(drivers_.begin(), drivers_.end(), [&](auto& d) { return d->type == type && d->status() == DriverStatus::AVAILABLE; });
        t.surge = surge_.multiplier(openRequests, available);
        double km = dist(from, to);
        t.estimate = pricing_.fare(type, km, km * 3, t.surge);   // ~3 min per km in city traffic
        t.queue = matcher_.candidates(driverPtrs(), from, type);
        cout << rider << " requests " << id << ": " << fixed << setprecision(1) << km << " km, surge x" << t.surge << ", estimate Rs " << t.estimate << "\n";
        auto& stored = trips_[id] = std::move(t);
        offerNext(stored);
        return id;
    }
    void respond(const string& tripId, bool accept) {
        Trip& t = trips_.at(tripId);
        if (!t.driver || t.state != TripState::REQUESTED) return;
        if (accept) { t.transition("accept"); cout << "  " << t.driver->id << " accepts " << tripId << "\n"; return; }
        cout << "  " << t.driver->id << " declines " << tripId << "\n";
        t.driver->release();
        offerNext(t);
    }
    void event(const string& tripId, const string& ev, double actualMinutes = 0) {
        Trip& t = trips_.at(tripId);
        if (!t.transition(ev)) { cout << "  " << tripId << ": '" << ev << "' not allowed in " << name(t.state) << "\n"; return; }
        if (ev == "start") t.driver->startTrip();
        if (ev == "complete") {
            t.fare = pricing_.fare(t.type, dist(t.pickup, t.drop), actualMinutes, t.surge);
            t.driver->location = t.drop;
            t.driver->release();
            cout << "  " << tripId << " completed, fare Rs " << t.fare << " (estimate was Rs " << t.estimate << ")\n";
        } else if (ev == "cancel" && t.driver) t.driver->release();
        else cout << "  " << tripId << " -> " << name(t.state) << "\n";
    }
};

int main() {
    NearestFirst nearest; StandardPricing pricing;
    RideService svc(nearest, pricing);
    svc.addDriver("ravi", VehicleType::SEDAN, {1, 1}, 4.8);
    svc.addDriver("meera", VehicleType::SEDAN, {2, 3}, 4.9);
    svc.addDriver("arjun", VehicleType::AUTO, {0, 1}, 4.6);
    svc.addDriver("zoya", VehicleType::SEDAN, {9, 9}, 4.7);      // too far away

    string t1 = svc.requestRide("asha", {0, 0}, {6, 8}, VehicleType::SEDAN);
    svc.respond(t1, false);                                     // ravi declines -> offered to meera
    svc.respond(t1, true);
    svc.event(t1, "start");                                     // illegal: the driver hasn't arrived yet
    svc.event(t1, "arrive");
    svc.event(t1, "start");
    svc.event(t1, "complete", 34);

    string t2 = svc.requestRide("bilal", {0, 0}, {3, 4}, VehicleType::SEDAN, 6);   // 6 open requests, 3 sedans -> surge x2
    svc.respond(t2, true);
    string t3 = svc.requestRide("chen", {0, 0}, {1, 1}, VehicleType::SUV);
}
```
```js run
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);     // km on a city grid

class Driver {
  #status = "OFFLINE";
  constructor(id, type, location, rating) { Object.assign(this, { id, type, location, rating }); }
  get status() { return this.#status; }
  goOnline() { this.#status = "AVAILABLE"; }
  tryReserve() { if (this.#status !== "AVAILABLE") return false; this.#status = "RESERVED"; return true; }   // sync = atomic in JS
  release() { this.#status = "AVAILABLE"; }
  startTrip() { this.#status = "ON_TRIP"; }
}

// ---- Strategies ----
const nearestFirst = (radiusKm = 5) => ({
  candidates: (drivers, p, type) => drivers
    .filter((d) => d.type === type && d.status === "AVAILABLE" && dist(d.location, p) <= radiusKm)
    .sort((a, b) => dist(a.location, p) - dist(b.location, p)),
});
const ratingWeighted = (radiusKm = 5) => ({                 // a swappable alternative: trade distance for rating
  candidates: (drivers, p, type) => nearestFirst(radiusKm).candidates(drivers, p, type)
    .sort((a, b) => (dist(a.location, p) - 2 * a.rating) - (dist(b.location, p) - 2 * b.rating)),
});
const standardPricing = {
  rates: { AUTO: [30, 11, 1], SEDAN: [50, 14, 1.5], SUV: [80, 18, 2] },
  fare(type, km, minutes, surge) { const [base, perKm, perMin] = this.rates[type]; return Math.round((base + perKm * km + perMin * minutes) * surge); },
};
const demandSupplySurge = (open, available) => (available === 0 ? 2.5 : Math.min(2.5, Math.max(1, Math.round((open / available) * 10) / 10)));

// ---- Trip lifecycle as a transition table ----
const TRANSITIONS = {
  REQUESTED: { accept: "DRIVER_ASSIGNED", cancel: "CANCELLED" },
  DRIVER_ASSIGNED: { arrive: "DRIVER_ARRIVED", cancel: "CANCELLED" },
  DRIVER_ARRIVED: { start: "IN_PROGRESS", cancel: "CANCELLED" },
  IN_PROGRESS: { complete: "COMPLETED" },
};

class RideService {
  #drivers = []; #trips = new Map(); #seq = 0;
  constructor(matcher, pricing) { Object.assign(this, { matcher, pricing }); }
  addDriver(id, type, location, rating) { const d = new Driver(id, type, location, rating); d.goOnline(); this.#drivers.push(d); return d; }

  requestRide(rider, from, to, type, openRequests = 1) {
    const available = this.#drivers.filter((d) => d.type === type && d.status === "AVAILABLE").length;
    const km = dist(from, to);
    const surge = demandSupplySurge(openRequests, available);
    const t = { id: `T${++this.#seq}`, rider, from, to, type, state: "REQUESTED", driver: null, surge,
                estimate: this.pricing.fare(type, km, km * 3, surge), queue: this.matcher.candidates(this.#drivers, from, type), next: 0 };
    console.log(`${rider} requests ${t.id}: ${km.toFixed(1)} km, surge x${surge}, estimate Rs ${t.estimate}`);
    this.#trips.set(t.id, t);
    this.#offerNext(t);
    return t.id;
  }
  #offerNext(t) {                                            // reserve the next candidate who is still free
    while (t.next < t.queue.length) {
      const d = t.queue[t.next++];
      if (d.tryReserve()) { t.driver = d; return console.log(`  offer ${t.id} -> ${d.id}`); }
    }
    t.driver = null; t.state = "CANCELLED";
    console.log(`  ${t.id}: no driver available, cancelled`);
  }
  respond(tripId, accept) {
    const t = this.#trips.get(tripId);
    if (!t.driver || t.state !== "REQUESTED") return;
    if (accept) { t.state = "DRIVER_ASSIGNED"; return console.log(`  ${t.driver.id} accepts ${tripId}`); }
    console.log(`  ${t.driver.id} declines ${tripId}`);
    t.driver.release();
    this.#offerNext(t);
  }
  event(tripId, ev, actualMinutes = 0) {
    const t = this.#trips.get(tripId), next = TRANSITIONS[t.state]?.[ev];
    if (!next) return console.log(`  ${tripId}: '${ev}' not allowed in ${t.state}`);
    t.state = next;
    if (ev === "start") t.driver.startTrip();
    if (ev === "complete") {
      t.fare = this.pricing.fare(t.type, dist(t.from, t.to), actualMinutes, t.surge);
      t.driver.location = t.to;
      t.driver.release();
      console.log(`  ${tripId} completed, fare Rs ${t.fare} (estimate was Rs ${t.estimate})`);
    } else if (ev === "cancel" && t.driver) t.driver.release();
    else console.log(`  ${tripId} -> ${t.state}`);
  }
}

const svc = new RideService(nearestFirst(5), standardPricing);
svc.addDriver("ravi", "SEDAN", { x: 1, y: 1 }, 4.8);
svc.addDriver("meera", "SEDAN", { x: 2, y: 3 }, 4.9);
svc.addDriver("arjun", "AUTO", { x: 0, y: 1 }, 4.6);
svc.addDriver("zoya", "SEDAN", { x: 9, y: 9 }, 4.7);         // too far away

const t1 = svc.requestRide("asha", { x: 0, y: 0 }, { x: 6, y: 8 }, "SEDAN");
svc.respond(t1, false);                                      // ravi declines -> offered to meera
svc.respond(t1, true);
svc.event(t1, "start");                                      // illegal: the driver hasn't arrived yet
svc.event(t1, "arrive");
svc.event(t1, "start");
svc.event(t1, "complete", 34);

const t2 = svc.requestRide("bilal", { x: 0, y: 0 }, { x: 3, y: 4 }, "SEDAN", 6);   // 6 open requests, 3 sedans -> surge x2
svc.respond(t2, true);
svc.requestRide("chen", { x: 0, y: 0 }, { x: 1, y: 1 }, "SUV");

// Swapping the matching strategy changes who is offered first, with no change to RideService
const order = ratingWeighted(15).candidates([new Driver("near-4.1", "SEDAN", { x: 1, y: 0 }, 4.1), new Driver("far-5.0", "SEDAN", { x: 2, y: 0 }, 5.0)].map((d) => (d.goOnline(), d)), { x: 0, y: 0 }, "SEDAN");
console.log("rating-weighted order:", order.map((d) => d.id).join(", "));
```
:::

## Design discussion

- **Atomic reservation** (`AVAILABLE → RESERVED` with compare-and-swap in C++, a synchronous check-and-set in JS) guarantees one driver per trip even when many requests match the same nearest driver at once. Offers are made one driver at a time; a decline or a **timeout** (a scheduled task from the previous problem) releases the driver and offers the next candidate.
- **Transition table** for the trip lifecycle rejects illegal events and documents the whole lifecycle in one place.
- **Strategies** for matching (nearest, rating-weighted, batch matching that optimises many riders and drivers together), pricing (per vehicle type, airport flat fares, pool discounts) and surge (demand/supply per area, smoothed over time).
- **Observer** for notifications: rider and driver apps subscribe to trip state changes (push notifications, WebSocket updates).
- **Location updates** at scale (every 4 seconds per driver) and city-wide matching belong to the HLD case study: geospatial indexes, sharding by city, in-memory driver state.

| Extension | How |
|---|---|
| Ride pooling | trips with multiple pickups/drops; a matching strategy that checks detour limits |
| Scheduled rides | the task scheduler creates the request at the right time |
| Cancellation fees | a policy object consulted on cancel (time since assignment, distance travelled) |
| Payments | payment strategy at completion; idempotent charge keyed by trip id |
| Driver ETA | a routing service behind an interface (Adapter for a maps API) |

```quiz
? Two riders' requests are processed at the same moment and both select driver Ravi as nearest. How does the design prevent a double assignment?
+ tryReserve() atomically changes Ravi from AVAILABLE to RESERVED; the second request's reservation fails and it moves to its next candidate
- The second rider waits until Ravi finishes
- Requests are processed one per minute
> The reservation is a compare-and-swap on the driver's status: a classic check-then-act made atomic.

? A driver sends "start trip" before "arrived". What should happen?
+ The transition table has no (DRIVER_ASSIGNED, start) entry, so the event is rejected
- The trip starts anyway
- The trip is cancelled
> Explicit transitions make illegal lifecycle events impossible.

? Product wants to test matching by "nearest driver with rating ≥ 4.8 first". Which change is needed?
+ A new MatchingStrategy implementation; RideService stays the same
- Edit RideService.requestRide
- Add a flag to Driver
> Matching is a variation point behind an interface.
```

:::keypoints
- Entities: **Driver** (type, location, rating, status), **Rider**, **Trip** (lifecycle), **RideService** coordinating them.
- **Trip state machine** via a transition table; illegal events are rejected.
- **Strategies**: matching (nearest, rating-weighted, batched), pricing (by vehicle type), surge (demand/supply).
- **Atomic driver reservation** (CAS / synchronous check-and-set) plus sequential offers with decline/timeout → next candidate.
- Notifications via Observer; geospatial scale, sharding and dispatch belong to the HLD case study.
:::
