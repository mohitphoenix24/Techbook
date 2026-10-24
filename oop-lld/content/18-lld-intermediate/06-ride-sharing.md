---
title: Design a Ride-Sharing Service
level: intermediate
time: 60
summary: A rider asks for a ride, a nearby driver is chosen by a strategy, the trip goes through its life cycle, the fare uses distance, time and demand (surge), ratings are updated, and a driver can never be given two rides at once.
---

:::problem Design a Ride-Sharing Service (Uber/Ola) {level=medium tags="State,Strategy,matching,pricing,geo,Observer"}
Design the core of a ride-sharing service. A rider asks for a ride from a pickup place to a drop place. The system finds a free driver nearby. The driver accepts, drives to the rider, the trip happens, and the rider pays a fare based on distance, time and demand. Both can rate each other afterwards.

:::hint Hint
Three separate things can change: **matching** (which driver), **pricing** (how much), and the **trip life cycle**. Changes to a driver's availability must be done safely, so one driver cannot be given to two riders at once.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | Rider, Driver (vehicle type, location, availability, rating), Trip |
| Vehicle types? | Mini, Sedan, SUV, each with its own base rate |
| Matching? | the nearest free driver of the asked type within 5 km. Offer to one driver at a time. If a driver says no, try the next |
| Life cycle? | Requested, DriverAssigned, EnRoute (to the pickup), InProgress, Completed. Or Cancelled |
| Fare? | base + per km + per minute, times a surge number based on demand and supply |
| Ratings? | 1 to 5 each way, with a running average |
| Cancel? | free for the rider before the driver arrives, with a fee after that |
| Many users? | many requests. A driver gets at most one trip |
| Not needed | real maps and travel times (we use straight-line distance), payments |

## Step 2: The life cycle of a trip

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`MatchingStrategy` gives a ranked list.** The service offers the trip to each driver in order until one accepts. (The accept decision is a callback, so the demo can script it.) We can replace it with "highest rated first" or "waiting longest" without changing the service.
- **A driver is claimed safely.** `available = false` is set under the driver registry's lock when assigned, and set back when the trip is completed or cancelled.
- **Surge** comes from `requests / availableDrivers` in the pickup area, and is **frozen on the trip when the ride is requested**. So the rider sees the same number at the end.
- **`FareStrategy`** holds the formula. A promo or a fixed airport fare is a new class.
- **Rating** is a tiny value (sum and count), safe with a mutex or atomics.
- **Trip events** go to listeners (the rider app and the driver app).

## Step 5: The code

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

| Case | What happens |
|---|---|
| All drivers say no, or none is nearby | the request fails with a message. The rider can try again with a bigger distance |
| Two riders want the same driver | the claim (`available = false`) happens under the service lock |
| The driver goes offline during an offer | the offer times out and the next driver is tried |
| Cancel at different stages | a table of fees by state (free, a small fee after arrival, none after pickup) |
| Surge changes between the request and the ride | the number is frozen on the trip when requested |
| A rating from someone not on the trip | only the trip's rider and driver can rate, once |
| Locations arrive all the time | a separate `LocationService` with a spatial index. Matching reads from it |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Shared rides (pooling)" | `Trip` becomes a route with many stops. A matching strategy joins requests that fit |
| "Scheduled rides" | a scheduler (Command) that creates the request at the time |
| "Driver bonuses and cancel penalties" | events used by an `IncentiveService` (Observer) |
| "Find the nearest driver quickly" | a geohash or grid index. Search only the rider's cell and its neighbours |
| "Travel time and routes" | a `RouteProvider` interface in place of straight-line distance |
| "Payments and wallets" | a `PaymentService` interface. The fare is charged when the trip completes |
| "Dispatch at a big scale" | split by city or cell. The matching service holds no state |
| "Fraud and safety" | a chain of rules on requests. SOS events |

## Short answer to say in an interview

:::interview How do you design the matching and pricing in a ride-sharing app?
"I keep matching, pricing and the trip life cycle as three separate parts. A matching strategy returns a ranked list of nearby free drivers, and the service offers the ride to each until one accepts. The driver is claimed under a lock, so nobody gets two rides. A fare strategy works out base plus distance plus time, times a surge number. I freeze the surge on the trip when it is requested so the rider pays the price they saw. The trip is a state machine with checked transitions."
:::

```quiz
? Why is the surge number stored on the trip?
- To save memory
+ The rider must pay the price they saw when they asked, even if demand changes later
- Multipliers are integers
> Freezing it when requested keeps the price stable and fair.
? How is a driver stopped from getting two rides?
- By luck
+ The availability flag is claimed under a lock at assignment, and restored on complete or cancel
- Drivers cannot accept twice
> A shared thing is claimed in one safe step.
```

:::keypoints
- Matching, fare and life cycle are the three parts that can change: a strategy, a strategy, and a state machine.
- Claim drivers safely, free them on complete or cancel, freeze surge on the trip, and check transitions.
- To scale: a spatial index and a split by city. The classes stay the same.
:::
