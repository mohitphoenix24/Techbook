---
title: Design a Hotel Reservation System
level: intermediate
time: 60
summary: Room types and rooms, date-range availability with overlap checks, searching free rooms, pricing strategies (seasonal, weekend), cancellation policies, preventing double booking with a lock per room, and reservation states.
---

:::problem Design a Hotel Reservation System {level=medium tags="booking,date ranges,Strategy,concurrency,pricing"}
Design a hotel reservation system. A hotel has rooms of different types. Guests search for availability by dates and room type, book a room for a stay (check-in to check-out), and may cancel. Prices vary by season and weekday. A room can never be double booked for overlapping dates.

:::hint Hint
Availability is about **date ranges**, so use half-open intervals `[checkIn, checkOut)` and the overlap test `a.start < b.end && b.start < a.end`. Booking must **check and insert atomically** per room. Price and cancellation rules are strategies.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Rooms? | numbered rooms, each with a type (Standard, Deluxe, Suite) and a base price |
| Dates? | whole days; a stay is `[checkIn, checkOut)`, so checking out and in on the same day is fine |
| Search? | free rooms of a type (or any) for a date range |
| Booking? | by room type: the system picks a free room; or a specific room |
| Pricing? | base price per night x multipliers (weekend, peak season); a strategy |
| Cancellation? | policy: free until 48 hours before check-in, then one night's charge; a strategy |
| States? | Confirmed, Cancelled, CheckedIn, CheckedOut |
| Concurrency? | two guests must not get the same room for overlapping dates |
| Out of scope | payments, housekeeping, loyalty |

## Step 2: entities

```viz algo=uml title="Hotel reservation"
class HotelService
  + search(type: RoomType, stay: DateRange): Room[]
  + book(guest: string, type: RoomType, stay: DateRange): Result<Reservation>
  + cancel(id: int, today: int): Result<Money>
class Room
  - number: int
  - type: RoomType
  - basePrice: Money
  - bookings: Reservation[]
  - lock: mutex
  + isFree(stay: DateRange): bool
  + tryBook(r: Reservation): bool
class DateRange
  - checkIn: int
  - checkOut: int
  + overlaps(o: DateRange): bool
  + nights(): int
class Reservation
  - id: int
  - guest: string
  - room: int
  - stay: DateRange
  - status: ResStatus
  - total: Money
interface PricingStrategy
  + nightlyRate(room: Room, day: int): Money
class SeasonalPricing
interface CancellationPolicy
  + refund(r: Reservation, today: int): Money
class FlexiblePolicy
HotelService *-- Room
Room *-- Reservation
Reservation --> DateRange
HotelService --> PricingStrategy
HotelService --> CancellationPolicy
SeasonalPricing ..|> PricingStrategy
FlexiblePolicy ..|> CancellationPolicy
```

## Step 3: design decisions

- **`DateRange`** is an immutable value object with `overlaps` and `nights`, used everywhere (the toolkit's `TimeRange`).
- **Each `Room` owns its bookings and a mutex.** `tryBook` checks all existing non-cancelled reservations for overlap and inserts one under the lock: atomic per room. Different rooms never contend.
- **Picking a room by type**: iterate rooms of that type and try each; the first successful `tryBook` wins. If `tryBook` fails because another thread got it first, try the next room (no global lock).
- **Pricing as Strategy**: sums `nightlyRate(room, day)` over the stay, so weekend or peak multipliers live in one class.
- **CancellationPolicy as Strategy** returns the refund. Cancelling marks the reservation `Cancelled`, which frees the dates for overlap checks.
- **Reservation status** is a small enum with guarded transitions (cancel only when Confirmed).

## Step 4: the code

```cpp run title="Rooms, date ranges, pricing, cancellation, double-booking race"
#include <algorithm>
#include <atomic>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>
using namespace std;

using Money = long;                                          // rupees, to keep the numbers readable

class DateRange {
    int in_, out_;                                            // day numbers: [in, out)
public:
    DateRange(int in, int out) : in_(in), out_(out) { if (out <= in) throw invalid_argument("check-out must be after check-in"); }
    int checkIn() const { return in_; }
    int checkOut() const { return out_; }
    int nights() const { return out_ - in_; }
    bool overlaps(const DateRange& o) const { return in_ < o.out_ && o.in_ < out_; }
};

enum class RoomType { Standard, Deluxe, Suite };
const char* name(RoomType t) { return t == RoomType::Standard ? "Standard" : t == RoomType::Deluxe ? "Deluxe" : "Suite"; }
enum class ResStatus { Confirmed, Cancelled };

struct Reservation { int id; string guest; int room; DateRange stay; ResStatus status; Money total; };

class Room {
    int number_; RoomType type_; Money base_;
    vector<Reservation> bookings_;
    mutable mutex m_;
    bool freeLocked(const DateRange& stay) const { for (const auto& b : bookings_) if (b.status == ResStatus::Confirmed && b.stay.overlaps(stay)) return false; return true; }
public:
    Room(int n, RoomType t, Money base) : number_(n), type_(t), base_(base) {}
    int number() const { return number_; }
    RoomType type() const { return type_; }
    Money base() const { return base_; }
    bool isFree(const DateRange& stay) const { lock_guard l(m_); return freeLocked(stay); }
    bool tryBook(const Reservation& r) {                      // check AND insert under one lock
        lock_guard l(m_);
        if (!freeLocked(r.stay)) return false;
        bookings_.push_back(r);
        return true;
    }
    bool cancel(int reservationId) {
        lock_guard l(m_);
        for (auto& b : bookings_) if (b.id == reservationId && b.status == ResStatus::Confirmed) { b.status = ResStatus::Cancelled; return true; }
        return false;
    }
    int confirmedCount() const { lock_guard l(m_); int n = 0; for (auto& b : bookings_) n += b.status == ResStatus::Confirmed; return n; }
};

struct PricingStrategy { virtual ~PricingStrategy() = default; virtual Money nightlyRate(const Room& r, int day) const = 0; };
struct SeasonalPricing : PricingStrategy {                    // weekend +25%, peak season (days 100..130) +50%
    Money nightlyRate(const Room& r, int day) const override {
        double mult = 1.0;
        if (day % 7 == 5 || day % 7 == 6) mult += 0.25;
        if (day >= 100 && day <= 130) mult += 0.50;
        return static_cast<Money>(r.base() * mult);
    }
};

struct CancellationPolicy { virtual ~CancellationPolicy() = default; virtual Money refund(const Reservation& r, Money firstNight, int today) const = 0; };
struct FlexiblePolicy : CancellationPolicy {                  // free until 2 days before; then lose the first night
    Money refund(const Reservation& r, Money firstNight, int today) const override { return (r.stay.checkIn() - today >= 2) ? r.total : r.total - firstNight; }
};

class HotelService {
    vector<unique_ptr<Room>> rooms_;
    map<int, Reservation> reservations_; mutex resM_; atomic<int> nextId_{1};
    unique_ptr<PricingStrategy> pricing_; unique_ptr<CancellationPolicy> policy_;
public:
    HotelService(unique_ptr<PricingStrategy> p, unique_ptr<CancellationPolicy> c) : pricing_(move(p)), policy_(move(c)) {}
    void addRoom(int n, RoomType t, Money base) { rooms_.push_back(make_unique<Room>(n, t, base)); }

    vector<int> search(RoomType type, const DateRange& stay) const {
        vector<int> out; for (auto& r : rooms_) if (r->type() == type && r->isFree(stay)) out.push_back(r->number()); return out;
    }
    Money priceFor(const Room& r, const DateRange& stay) const { Money t = 0; for (int d = stay.checkIn(); d < stay.checkOut(); ++d) t += pricing_->nightlyRate(r, d); return t; }

    optional<Reservation> book(const string& guest, RoomType type, const DateRange& stay, string& why) {
        for (auto& r : rooms_) {
            if (r->type() != type) continue;
            Reservation res{nextId_++, guest, r->number(), stay, ResStatus::Confirmed, priceFor(*r, stay)};
            if (r->tryBook(res)) { lock_guard l(resM_); reservations_.emplace(res.id, res); return res; }      // try the next room if someone beat us to it
        }
        why = string("no ") + name(type) + " room is free for those dates";
        return nullopt;
    }
    optional<Money> cancel(int id, int today, string& why) {
        optional<Reservation> found;
        { lock_guard l(resM_); auto it = reservations_.find(id); if (it == reservations_.end() || it->second.status != ResStatus::Confirmed) { why = "no active reservation " + to_string(id); return nullopt; } found = it->second; }
        Reservation res = *found;
        Room* room = nullptr; for (auto& r : rooms_) if (r->number() == res.room) room = r.get();
        if (!room->cancel(id)) { why = "already cancelled"; return nullopt; }
        { lock_guard l(resM_); reservations_.at(id).status = ResStatus::Cancelled; }
        Money firstNight = pricing_->nightlyRate(*room, res.stay.checkIn());
        return policy_->refund(res, firstNight, today);
    }
    int confirmedBookings() const { int n = 0; for (auto& r : rooms_) n += r->confirmedCount(); return n; }
};

int main() {
    HotelService hotel(make_unique<SeasonalPricing>(), make_unique<FlexiblePolicy>());
    hotel.addRoom(101, RoomType::Standard, 3000); hotel.addRoom(102, RoomType::Standard, 3000); hotel.addRoom(201, RoomType::Deluxe, 5000);
    string why;

    cout << "free Standard rooms for days 10-13: " << hotel.search(RoomType::Standard, DateRange(10, 13)).size() << "\n";
    auto a = hotel.book("Asha", RoomType::Standard, DateRange(10, 13), why);
    cout << "Asha books room " << a->room << " for 3 nights, total Rs " << a->total << "\n";
    auto b = hotel.book("Ravi", RoomType::Standard, DateRange(12, 15), why);
    cout << "Ravi (overlapping, other room): room " << b->room << "\n";
    auto c = hotel.book("Meera", RoomType::Standard, DateRange(12, 14), why);
    cout << "Meera (both Standard rooms taken): " << (c ? "ok" : why) << "\n";
    auto d = hotel.book("Kiran", RoomType::Standard, DateRange(13, 15), why);
    cout << "Kiran checks in on Asha's check-out day (13): room " << d->room << " (back-to-back is fine)\n";

    cout << "weekend and peak pricing, 3 nights from day 103 (Deluxe): Rs " << hotel.book("Peak", RoomType::Deluxe, DateRange(103, 106), why)->total << "\n";

    cout << "cancel Asha 5 days before: refund Rs " << *hotel.cancel(a->id, 5, why) << "\n";
    cout << "cancel Ravi 1 day before: refund Rs " << *hotel.cancel(b->id, 11, why) << "\n";
    cout << "cancel Ravi again: " << (hotel.cancel(b->id, 11, why) ? "ok" : why) << "\n";
    cout << "room 101 is free again for Meera: " << (hotel.book("Meera", RoomType::Standard, DateRange(12, 14), why) ? "booked" : why) << "\n";

    cout << "race: 10 guests want the single Suite for the same dates\n";
    HotelService h2(make_unique<SeasonalPricing>(), make_unique<FlexiblePolicy>());
    h2.addRoom(901, RoomType::Suite, 9000);
    atomic<int> got{0};
    vector<thread> ts;
    for (int i = 0; i < 10; ++i) ts.emplace_back([&, i] { string w; if (h2.book("guest" + to_string(i), RoomType::Suite, DateRange(50, 52), w)) ++got; });
    for (auto& t : ts) t.join();
    cout << "  bookings made: " << got << ", confirmed in the room: " << h2.confirmedBookings() << " (exactly one)\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Check-out day equals another guest's check-in | half-open ranges: no overlap |
| `checkOut <= checkIn` | rejected by `DateRange` |
| Cancelled stays | status filter in `freeLocked`: dates become available again |
| Booking different room types at once | one reservation per room; a group booking is a coordinator (extension) |
| Many rooms, many requests | per-room locks, no global lock |
| Pricing changes after booking | the total is stored on the reservation: it does not change |
| Double cancellation | the second call finds no active reservation |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Choose a specific room or best match (high floor)" | a `RoomSelectionStrategy` used by `book` |
| "Overbooking like airlines" | a policy allowing a configurable over-allocation, with relocation rules |
| "Add-ons (breakfast, late checkout)" | decorators on the reservation price |
| "Rate plans (refundable vs non-refundable)" | `RatePlan` carrying both a pricing multiplier and a cancellation policy |
| "Check-in/out lifecycle and no-shows" | State machine; a daily job marks no-shows |
| "Search at scale" | per-room-type interval trees or a calendar table with date buckets |
| "Multiple hotels" | `Hotel` aggregate and a `SearchService` facade |
| "Notifications" | Observer on reservation events |

```quiz
? Why are stays modelled as half-open ranges?
- C++ uses them everywhere
+ Checking out and in on the same day does not count as an overlap
- They save memory
> `[checkIn, checkOut)` makes back-to-back stays compatible.
? How is double booking prevented under concurrency?
- A global lock for the whole hotel
+ Each room checks overlap and inserts the reservation under its own lock
- By retrying later
> Check-and-insert is atomic per room, so only one concurrent booking can succeed.
```

:::keypoints
- DateRange value object with `overlaps`; per-room lock for atomic check-and-insert; cancelled bookings do not block.
- Pricing and cancellation are strategies; the reservation stores its total at booking time.
- Scaling: calendar indexes and conditional database updates keep the same logic.
:::
