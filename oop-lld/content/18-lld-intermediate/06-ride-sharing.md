---
title: Design a Ride-Sharing Service
level: intermediate
time: 60
summary: Riders request rides, nearby drivers are matched by a strategy, the trip goes through a lifecycle, fares combine distance, time and surge pricing, ratings update after the trip, and events notify rider and driver; with the concurrency rule that one driver takes one ride.
---

:::problem Design a Ride-Sharing Service (Uber/Ola) {level=medium tags="State,Strategy,matching,pricing,geo,Observer"}
Design the core of a ride-sharing service. A rider requests a ride from a pickup to a drop location. The system finds an available driver nearby, the driver accepts, drives to the rider, the trip runs, and the rider pays a fare based on distance, time and demand. Both can rate each other afterwards.

:::hint Hint
Three independent variation points: **matching** (which driver), **pricing** (how much), and the **trip lifecycle**. Keep drivers' availability changes atomic so one driver cannot be assigned to two riders at once.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | Rider, Driver (vehicle type, location, availability, rating), Trip |
| Vehicle types? | Mini, Sedan, SUV with different base rates |
| Matching? | nearest available driver of the requested type within 5 km; offer to one driver at a time; decline moves to the next |
| Lifecycle? | Requested → DriverAssigned → EnRoute (to pickup) → InProgress → Completed; Cancelled |
| Fare? | base + per-km + per-minute, times a surge multiplier by demand/supply ratio |
| Ratings? | 1 to 5 each way, running average |
| Cancel? | rider free before the driver arrives; a fee after |
| Concurrency? | many requests; a driver is assigned to at most one trip |
| Out of scope | real maps/ETAs (use straight-line distance), payments |

## Step 2: trip lifecycle

```viz algo=state title="Trip states"
state Requested "Requested" [initial] @0,1
state Assigned "Driver assigned" @1,1
state EnRoute "Driver en route" @2,0
state InProgress "In progress" @3,0
state Completed "Completed" @4,0
state Cancelled "Cancelled" @2,2
Requested -> Assigned : driver accepts
Requested -> Cancelled : no driver / rider cancels
Assigned -> EnRoute : driver starts driving to pickup
Assigned -> Cancelled : rider or driver cancels
EnRoute -> InProgress : rider picked up
EnRoute -> Cancelled : rider cancels (fee)
InProgress -> Completed : arrived at the drop
play: driver accepts, driver starts driving to pickup, rider picked up, arrived at the drop
```

## Step 3: entities

```viz algo=uml title="Ride sharing"
class RideService
  + requestRide(rider: string, from: Point, to: Point, type: VehicleType): Result<Trip>
  + start(tripId: int): void
  + complete(tripId: int): Fare
  + cancel(tripId: int, by: Role): Money
class Driver
  - id: int
  - name: string
  - location: Point
  - type: VehicleType
  - available: bool
  - rating: Rating
class Rider
  - id: string
  - rating: Rating
class Trip
  - id: int
  - rider: string
  - driver: int
  - pickup: Point
  - drop: Point
  - state: TripState
  - surge: double
interface MatchingStrategy
  + rank(drivers: Driver[], pickup: Point): Driver[]
class NearestDriver
interface FareStrategy
  + fare(distanceKm: double, minutes: double, surge: double, type: VehicleType): Money
class StandardFare
class SurgeCalculator
  + multiplier(demand: int, supply: int): double
class Rating
  - sum: int
  - count: int
interface TripListener
RideService o-- Driver
RideService o-- Trip
RideService --> MatchingStrategy
RideService --> FareStrategy
RideService ..> SurgeCalculator
NearestDriver ..|> MatchingStrategy
StandardFare ..|> FareStrategy
Trip --> Driver
```

## Step 4: design decisions

- **MatchingStrategy returns a ranked list**; the service offers the trip to each driver in order until one accepts (the accept decision is a callback so the demo can script it). Replace with "highest rated first" or "least idle time" without changing the service.
- **Driver availability is claimed atomically** (`available = false` under the driver registry lock when assigned) and restored on completion or cancellation.
- **Surge** is computed from `requests / availableDrivers` in the pickup area and **frozen on the trip at request time** so the rider sees the same multiplier at the end.
- **FareStrategy** isolates the formula; a promo or a flat airport fare is a new class.
- **Rating** is a tiny value type (sum, count), thread-safe with a mutex or atomics.
- **Trip events** go to listeners (rider app, driver app).

## Step 5: the code

```cpp run title="Matching, trip lifecycle, fare with surge, ratings"
#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
using namespace std;

struct Point { double x, y; };
double km(Point a, Point b) { return hypot(a.x - b.x, a.y - b.y); }
using Money = long;                                          // rupees

enum class VehicleType { Mini, Sedan, SUV };
enum class TripState { Requested, Assigned, EnRoute, InProgress, Completed, Cancelled };
const char* name(TripState s) { static const char* n[] = {"Requested", "Assigned", "EnRoute", "InProgress", "Completed", "Cancelled"}; return n[static_cast<int>(s)]; }

class Rating {
    int sum_ = 0, count_ = 0;
public:
    void add(int stars) { sum_ += max(1, min(5, stars)); ++count_; }
    double average() const { return count_ ? static_cast<double>(sum_) / count_ : 0; }
    int count() const { return count_; }
};

struct Driver { int id; string name; Point location; VehicleType type; bool available = true; Rating rating; };
struct Trip {
    int id; string rider; int driver = 0; Point pickup, drop; VehicleType type; double surge = 1.0; TripState state = TripState::Requested;
};

struct MatchingStrategy { virtual ~MatchingStrategy() = default; virtual vector<Driver*> rank(vector<Driver>& drivers, Point pickup, VehicleType type) = 0; };
struct NearestDriver : MatchingStrategy {
    double radius; explicit NearestDriver(double r) : radius(r) {}
    vector<Driver*> rank(vector<Driver>& drivers, Point pickup, VehicleType type) override {
        vector<Driver*> c;
        for (auto& d : drivers) if (d.available && d.type == type && km(d.location, pickup) <= radius) c.push_back(&d);
        sort(c.begin(), c.end(), [&](Driver* a, Driver* b) { return km(a->location, pickup) < km(b->location, pickup); });
        return c;
    }
};

struct FareStrategy { virtual ~FareStrategy() = default; virtual Money fare(double distanceKm, double minutes, double surge, VehicleType t) const = 0; };
struct StandardFare : FareStrategy {
    Money fare(double d, double mins, double surge, VehicleType t) const override {
        double base = t == VehicleType::Mini ? 40 : t == VehicleType::Sedan ? 60 : 90;
        double perKm = t == VehicleType::Mini ? 10 : t == VehicleType::Sedan ? 14 : 20;
        return static_cast<Money>(ceil((base + perKm * d + 1.5 * mins) * surge));
    }
};
double surgeFor(int demand, int supply) {                    // demand/supply ratio, capped
    if (supply == 0) return 2.0;
    double r = static_cast<double>(demand) / supply;
    return r <= 1 ? 1.0 : r <= 2 ? 1.5 : 2.0;
}

class RideService {
    vector<Driver> drivers_;
    map<int, Trip> trips_;
    map<string, Rating> riders_;
    unique_ptr<MatchingStrategy> matching_; unique_ptr<FareStrategy> fares_;
    function<void(const string&)> notify_;
    mutex m_; int nextTrip_ = 1; int recentRequests_ = 0;
    void emit(const string& s) { if (notify_) notify_(s); }
public:
    RideService(unique_ptr<MatchingStrategy> m, unique_ptr<FareStrategy> f, function<void(const string&)> n) : matching_(move(m)), fares_(move(f)), notify_(move(n)) {}
    void addDriver(Driver d) { drivers_.push_back(move(d)); }

    // `accepts` simulates the driver's response to an offer
    optional<int> requestRide(const string& rider, Point from, Point to, VehicleType type, const function<bool(const Driver&)>& accepts, string& why) {
        lock_guard lock(m_);
        ++recentRequests_;
        int supply = 0; for (auto& d : drivers_) supply += d.available && d.type == type;
        Trip t{nextTrip_, rider, 0, from, to, type, surgeFor(recentRequests_, max(supply, 1)), TripState::Requested};
        if (t.surge > 1.0) emit("surge pricing x" + to_string(t.surge).substr(0, 3) + " in your area");
        for (Driver* d : matching_->rank(drivers_, from, type)) {            // offer to each candidate in turn
            emit("offer to " + d->name + " (" + to_string(km(d->location, from)).substr(0, 3) + " km away)");
            if (accepts(*d)) {
                d->available = false; t.driver = d->id; t.state = TripState::Assigned;           // claim the driver atomically
                trips_.emplace(nextTrip_, t);
                emit(d->name + " accepted: trip #" + to_string(nextTrip_) + " for " + rider);
                return nextTrip_++;
            }
            emit(d->name + " declined");
        }
        why = "no driver available nearby";
        return nullopt;
    }
    void advance(int id, TripState to) {
        lock_guard lock(m_);
        Trip& t = trips_.at(id);
        bool ok = (t.state == TripState::Assigned && to == TripState::EnRoute) || (t.state == TripState::EnRoute && to == TripState::InProgress) || (t.state == TripState::InProgress && to == TripState::Completed);
        if (!ok) { emit(string("trip #") + to_string(id) + ": cannot go from " + name(t.state) + " to " + name(to)); return; }
        t.state = to;
        emit(string("trip #") + to_string(id) + " is now " + name(to));
    }
    Money complete(int id, double distanceKm, double minutes, int riderStars, int driverStars) {
        advance(id, TripState::Completed);
        lock_guard lock(m_);
        Trip& t = trips_.at(id);
        Money f = fares_->fare(distanceKm, minutes, t.surge, t.type);
        for (auto& d : drivers_) if (d.id == t.driver) { d.available = true; d.location = t.drop; d.rating.add(driverStars); }          // the driver is free again, now at the drop-off
        riders_[t.rider].add(riderStars);
        emit("fare Rs " + to_string(f) + " (distance " + to_string(static_cast<int>(distanceKm)) + " km, " + to_string(static_cast<int>(minutes)) + " min, surge x" + to_string(t.surge).substr(0, 3) + ")");
        return f;
    }
    Money cancel(int id, bool afterDriverArrived) {
        lock_guard lock(m_);
        Trip& t = trips_.at(id);
        if (t.state == TripState::InProgress || t.state == TripState::Completed) { emit("too late to cancel"); return 0; }
        t.state = TripState::Cancelled;
        for (auto& d : drivers_) if (d.id == t.driver) d.available = true;                   // release the driver
        Money fee = afterDriverArrived ? 50 : 0;
        emit("trip #" + to_string(id) + " cancelled, fee Rs " + to_string(fee));
        return fee;
    }
    double driverRating(int id) const { for (auto& d : drivers_) if (d.id == id) return d.rating.average(); return 0; }
    bool driverAvailable(int id) const { for (auto& d : drivers_) if (d.id == id) return d.available; return false; }
};

int main() {
    RideService svc(make_unique<NearestDriver>(5.0), make_unique<StandardFare>(), [](const string& m) { cout << "    " << m << "\n"; });
    svc.addDriver({1, "Kiran", {1, 1}, VehicleType::Sedan});
    svc.addDriver({2, "Meera", {3, 3}, VehicleType::Sedan});
    svc.addDriver({3, "Dev", {20, 20}, VehicleType::Sedan});          // too far
    string why;

    cout << "ride 1: nearest driver declines, the next accepts\n";
    auto t1 = svc.requestRide("Asha", {0, 0}, {10, 0}, VehicleType::Sedan, [](const Driver& d) { return d.name != "Kiran"; }, why);
    svc.advance(*t1, TripState::EnRoute);
    svc.advance(*t1, TripState::InProgress);
    svc.advance(*t1, TripState::EnRoute);                              // invalid transition
    Money fare = svc.complete(*t1, 10, 25, 5, 4);
    cout << "  Asha pays Rs " << fare << "; Meera available again: " << boolalpha << svc.driverAvailable(2) << ", rating " << svc.driverRating(2) << "\n";

    cout << "ride 2: no SUV nearby\n";
    auto t2 = svc.requestRide("Ravi", {0, 0}, {5, 5}, VehicleType::SUV, [](const Driver&) { return true; }, why);
    cout << "  " << (t2 ? "ok" : why) << "\n";

    cout << "ride 3: rider cancels after the driver arrived\n";
    auto t3 = svc.requestRide("Meera K", {1, 0}, {8, 8}, VehicleType::Sedan, [](const Driver&) { return true; }, why);
    svc.advance(*t3, TripState::EnRoute);
    Money fee = svc.cancel(*t3, true);
    cout << "  fee Rs " << fee << ", Kiran available again: " << svc.driverAvailable(1) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| All candidates decline or none nearby | the request fails with a message; the rider may retry with a bigger radius |
| Two riders compete for one driver | the claim (`available = false`) happens under the service lock |
| Driver goes offline mid-offer | the offer times out and the next candidate is tried |
| Cancel at different stages | table of fees by state (free, small fee after arrival, none after pickup) |
| Surge changes between request and ride | the multiplier is frozen on the trip when requested |
| Rating by an uninvolved person | only the trip's rider/driver may rate, once |
| Location updates arriving constantly | a separate `LocationService` with a spatial index; matching reads it |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Ride pooling / shared rides" | `Trip` becomes a multi-stop route; a matching strategy that merges compatible requests |
| "Scheduled rides" | a scheduler (Command) that creates the request at a time |
| "Driver incentives and cancellations penalties" | events consumed by an `IncentiveService` (Observer) |
| "Efficient nearest-driver search" | a geohash/grid index: only search the rider's cell and neighbours |
| "ETA and routing" | a `RouteProvider` interface; replace straight-line distance |
| "Payments and wallets" | a `PaymentService` interface; the fare is charged on completion |
| "Dispatch at scale" | partition by city/cell; the matching service stays stateless |
| "Fraud and safety" | rule chain on requests; SOS events |

```quiz
? Why is the surge multiplier stored on the trip?
- To save memory
+ The rider must pay the price they saw when requesting, even if demand changes
- Because multipliers are integers
> Freezing it at request time keeps the price stable and fair.
? How is a driver prevented from being assigned twice?
- By luck
+ The availability flag is claimed under a lock at assignment and restored on completion or cancel
- Drivers cannot accept twice
> Atomic claim of a shared resource.
```

:::keypoints
- Matching, fare and lifecycle are the three variation points: strategy, strategy, state machine.
- Claim drivers atomically, free them on completion/cancel, freeze surge on the trip, validate transitions.
- Scale with a spatial index and per-city partitions; the classes stay the same.
:::
