---
title: Design a Hotel Reservation System
level: intermediate
time: 60
summary: Rooms, date ranges and a simple overlap check, searching for free rooms, prices that change by season, cancellation rules, and a lock for each room so two guests never get the same room on the same dates.
---

:::problem Design a Hotel Reservation System {level=medium tags="booking,date ranges,Strategy,concurrency,pricing"}
Design a hotel reservation system. A hotel has rooms of different types. Guests search for rooms by dates and room type, book a room for a stay (check-in to check-out), and can cancel. Prices change by season and by weekday. A room must never be booked twice for dates that overlap.

:::hint Hint
Availability is about **date ranges**. Use ranges that include the start date but not the end date, `[checkIn, checkOut)`, and this overlap test: `a.start < b.end && b.start < a.end`. Booking must **check and save as one step** for each room. Price and cancellation rules are strategies.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Rooms? | numbered rooms, each with a type (Standard, Deluxe, Suite) and a base price |
| Dates? | whole days. A stay is `[checkIn, checkOut)`, so one guest can leave and another arrive on the same day |
| Search? | free rooms of a type (or any type) for a date range |
| Booking? | by room type (the system picks a free room), or a specific room |
| Price? | base price for each night times extras (weekend, busy season). A strategy |
| Cancel? | free until 48 hours before check-in, then one night's charge. A strategy |
| Reservation states? | Confirmed, Cancelled, CheckedIn, CheckedOut |
| Many users? | two guests must not get the same room on overlapping dates |
| Not needed | payments, housekeeping, loyalty points |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **`DateRange`** is a small value that never changes. It has `overlaps` and `nights`, and is used everywhere (it is the toolkit's `TimeRange`).
- **Each `Room` owns its bookings and a mutex.** `tryBook` checks all existing, not-cancelled reservations for an overlap and saves the new one while holding the lock. So each room is safe on its own, and different rooms never wait for each other.
- **Choosing a room by type:** go through the rooms of that type and try each one. The first successful `tryBook` wins. If it fails because another thread was faster, try the next room (no global lock).
- **Price is a Strategy.** It adds up `nightlyRate(room, day)` for the stay, so weekend and busy-season extras live in one class.
- **Cancellation rule is a Strategy** that returns the refund. Cancelling marks the reservation `Cancelled`, which frees the dates.
- **Reservation status** is a small enum with checked changes (cancel only when Confirmed).

## Step 4: The code

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

| Case | What happens |
|---|---|
| Check-out day is the same as another guest's check-in day | no overlap, because the end day is not included |
| `checkOut <= checkIn` | refused by `DateRange` |
| Cancelled stays | filtered out in `freeLocked`, so the dates are free again |
| Booking different room types together | one reservation for each room. A group booking is a coordinator (extension) |
| Many rooms and many requests | locks for each room, no global lock |
| The price changes after booking | the total is saved on the reservation and does not change |
| Cancelling twice | the second call finds no active reservation |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Pick a specific room or the best match (high floor)" | a `RoomSelectionStrategy` used by `book` |
| "Overbooking like airlines" | a rule that allows a set amount of extra bookings, with moving rules |
| "Extras (breakfast, late checkout)" | decorators on the reservation price |
| "Rate plans (refundable or not)" | a `RatePlan` that has a price extra and a cancellation rule |
| "Check-in, check-out and no-shows" | a state machine, and a daily job that marks no-shows |
| "Search on a big scale" | an interval tree for each room type, or a calendar table by date |
| "Many hotels" | a `Hotel` class and a `SearchService` facade |
| "Messages to guests" | Observer on reservation events |

## Short answer to say in an interview

:::interview How do you stop double booking in a hotel system?
"A stay is a range of dates that includes the check-in day but not the check-out day. Two stays overlap if a.start < b.end and b.start < a.end. Each room keeps its own reservations and a mutex, and tryBook checks for an overlap and saves the booking in one locked step. So two guests cannot get the same room on overlapping dates, and different rooms do not wait for each other. Cancelled reservations do not block."
:::

```quiz
? Why are stays ranges that exclude the end day?
- C++ uses them everywhere
+ One guest can check out and another check in on the same day without a clash
- They save memory
> `[checkIn, checkOut)` makes back-to-back stays fit.
? How is double booking prevented with many users?
- A global lock for the whole hotel
+ Each room checks for overlap and saves the booking under its own lock
- By trying again later
> Check and save is one step for each room, so only one booking can win.
```

:::keypoints
- A DateRange value with `overlaps`. A lock for each room for check-and-save. Cancelled bookings do not block.
- Price and cancellation are strategies. The reservation stores its total when booked.
- To scale: calendar indexes and conditional database updates, with the same logic.
:::
