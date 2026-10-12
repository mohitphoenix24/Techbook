---
title: Design a Movie Ticket Booking System (BookMyShow)
level: advanced
time: 65
summary: Movies, cinemas, screens, shows and seats; temporary seat holds with expiry so users can pay without losing their seats; all-or-nothing, double-booking-proof holds under concurrency; payment and confirmation as a small saga; pricing as a strategy — implemented in C++ and JavaScript with an injected clock.
---

:::problem Design a Movie Ticket Booking System {level=hard tags="LLD,concurrency,seat holds,Strategy"}
Users browse movies in a city, pick a show, select seats on a seat map and pay. Selected seats must be held for the user for a few minutes while they pay, and no seat may ever be sold twice, even when thousands of users try to book the same popular show at once.

:::hint Hint
A booking has a lifecycle: seats go AVAILABLE → HELD (with an expiry) → BOOKED, or back to AVAILABLE when a hold expires or payment fails. Make "hold these N seats" all-or-nothing and atomic per show.
:::
:::

## Requirements

**Functional**: list cinemas and shows for a movie in a city; show a seat map with availability and prices; **hold** selected seats for 5 minutes; pay and **confirm** the booking; cancel; release holds when they expire or payment fails.

**Non-functional**: **no double booking**, ever; holds must expire even if the user disappears; high contention on popular shows (first-day, first-show); pricing varies by seat type and show time.

## Entities

```viz algo=uml title="Booking system classes"
class Movie
  - id: string
  - title: string
  - minutes: int
class Cinema
  - id: string
  - city: string
class Screen
  - id: string
  - layout: Seat[]
class Show
  - id: string
  - movie: Movie
  - screen: Screen
  - start: Time
  - seatState: map<seatId, SeatStatus>
class Seat
  - id: string
  - type: SeatType
class Booking
  - id: string
  - user: string
  - seats: string[]
  - amount: Money
  - status: BookingStatus
class BookingService
  + hold(showId, user, seats): Booking
  + confirm(bookingId, payment): Booking
  + cancel(bookingId)
  + releaseExpired()
interface PricingStrategy
  + price(show, seat): Money
interface PaymentGateway
  + charge(user, amount, key): bool
Cinema *-- Screen : 1..*
Screen *-- Seat : 1..*
Show --> Movie
Show --> Screen
BookingService --> Show
BookingService --> Booking : creates
BookingService --> PricingStrategy
BookingService --> PaymentGateway
```

Key modelling decisions:

- **Seat status lives on the Show**, not the Seat: the same physical seat is free for the 6 pm show and taken for the 9 pm one.
- A **Booking** has its own lifecycle: `HELD → CONFIRMED`, or `HELD → EXPIRED / FAILED`, or `CONFIRMED → CANCELLED`.
- Per seat, per show: `AVAILABLE → HELD(bookingId, expiresAt) → BOOKED(bookingId)`.

```viz algo=arch title="Seat lifecycle within a show" dir=right
avail   Available [box]
held    Held | by booking B, until T [lock]
booked  Booked [box]
--
avail -> held : hold (all-or-nothing)
held -> booked : payment confirmed
held -> avail : expired / payment failed / user cancels
booked -> avail : booking cancelled (refund)
```

## The critical section

"Hold seats A5, A6 for user X" must:

1. check **all** requested seats are available (or held but **expired**),
2. mark **all** of them held by the new booking,

**atomically per show**, so two users can't both pass step 1 for A6. Different shows never conflict, so the lock is **per show** (fine-grained enough, simple enough). The confirmation step re-checks that the hold is still valid (it may have expired while the user was on the payment page).

```viz algo=seq title="Hold, pay, confirm"
participant u User [user]
participant s BookingService [service]
participant sh Show (locked) [box]
participant p PaymentGateway [pay]
u -> s : hold(show 42, [A5, A6])
s -> sh : under show 42's lock: all free? → mark HELD until +5 min
s --> u : booking B7, Rs 500, pay within 5 min
u -> s : confirm(B7, card)
s -> sh : hold still valid? (not expired)
s -> p : charge Rs 500 (idempotency key = B7)
p --> s : OK
s -> sh : under the lock: HELD → BOOKED
s --> u : confirmed: tickets for A5, A6
```

## Implementation

:::tabs Booking service with seat holds
```cpp run
#include <bits/stdc++.h>
using namespace std;

enum class SeatType { NORMAL, PREMIUM, RECLINER };
enum class BookingStatus { HELD, CONFIRMED, EXPIRED, FAILED, CANCELLED };
const char* name(BookingStatus s) { return array<const char*, 5>{"HELD", "CONFIRMED", "EXPIRED", "FAILED", "CANCELLED"}[(int)s]; }

struct SeatState { string bookingId; long holdUntil = 0; bool booked = false; };   // empty bookingId = available

struct Show {
    string id, movie; long startMin;
    map<string, SeatType> seats;                     // the screen layout
    map<string, SeatState> state;                    // per-show status
    mutex m;                                         // guards `state`
};

struct Booking { string id, user, showId; vector<string> seats; long amount; BookingStatus status; long holdUntil; };

struct PricingStrategy { virtual ~PricingStrategy() = default; virtual long price(const Show&, SeatType) const = 0; };
struct StandardPricing : PricingStrategy {
    long price(const Show& s, SeatType t) const override {
        long base = t == SeatType::NORMAL ? 200 : t == SeatType::PREMIUM ? 300 : 500;
        int hour = (s.startMin / 60) % 24;
        return hour >= 18 ? base * 12 / 10 : base;       // evening shows +20%
    }
};
struct PaymentGateway { virtual ~PaymentGateway() = default; virtual bool charge(const string& user, long amount, const string& key) = 0; };
struct FakePayments : PaymentGateway {
    set<string> charged;
    bool charge(const string& user, long, const string& key) override { if (user == "declined-user") return false; charged.insert(key); return true; }
};

class BookingService {
    map<string, unique_ptr<Show>> shows_;
    map<string, Booking> bookings_;
    mutex bookingsM_;
    const PricingStrategy& pricing_;
    PaymentGateway& payments_;
    function<long()> now_;                             // injected clock (minutes)
    atomic<int> seq_{0};
    static constexpr long HOLD_MIN = 5;
public:
    BookingService(const PricingStrategy& p, PaymentGateway& g, function<long()> clock) : pricing_(p), payments_(g), now_(std::move(clock)) {}
    void addShow(unique_ptr<Show> s) { for (auto& [id, t] : s->seats) s->state[id] = {}; shows_[s->id] = std::move(s); }

    optional<Booking> hold(const string& showId, const string& user, const vector<string>& seatIds) {
        Show& show = *shows_.at(showId);
        long t = now_();
        Booking b{"B" + to_string(++seq_), user, showId, seatIds, 0, BookingStatus::HELD, t + HOLD_MIN};
        {
            lock_guard lock(show.m);                       // the critical section: check ALL, then take ALL
            for (auto& id : seatIds) {
                auto it = show.state.find(id);
                if (it == show.state.end()) return nullopt;
                const SeatState& st = it->second;
                bool free = st.bookingId.empty() || (!st.booked && st.holdUntil <= t);   // an expired hold counts as free
                if (!free) return nullopt;
            }
            for (auto& id : seatIds) { show.state[id] = {b.id, b.holdUntil, false}; b.amount += pricing_.price(show, show.seats[id]); }
        }
        lock_guard lock(bookingsM_);
        bookings_[b.id] = b;
        return b;
    }

    BookingStatus confirm(const string& bookingId) {
        Booking b;
        { lock_guard lock(bookingsM_); b = bookings_.at(bookingId); }
        if (b.status != BookingStatus::HELD) return b.status;
        Show& show = *shows_.at(b.showId);
        if (now_() >= b.holdUntil) { setStatus(b.id, BookingStatus::EXPIRED); release(show, b); return BookingStatus::EXPIRED; }
        if (!payments_.charge(b.user, b.amount, b.id)) { setStatus(b.id, BookingStatus::FAILED); release(show, b); return BookingStatus::FAILED; }
        {
            lock_guard lock(show.m);
            for (auto& id : b.seats) {                     // still ours? (expiry could race with payment)
                if (show.state[id].bookingId != b.id) { setStatus(b.id, BookingStatus::FAILED); return BookingStatus::FAILED; }   // real system: refund
            }
            for (auto& id : b.seats) show.state[id].booked = true;
        }
        setStatus(b.id, BookingStatus::CONFIRMED);
        return BookingStatus::CONFIRMED;
    }

    string seatMap(const string& showId) {
        Show& show = *shows_.at(showId);
        lock_guard lock(show.m);
        string s;
        long t = now_();
        for (auto& [id, st] : show.state) s += id + (st.booked ? "[X] " : (!st.bookingId.empty() && st.holdUntil > t) ? "[h] " : "[ ] ");
        return s;
    }
private:
    void setStatus(const string& id, BookingStatus s) { lock_guard lock(bookingsM_); bookings_[id].status = s; }
    void release(Show& show, const Booking& b) {
        lock_guard lock(show.m);
        for (auto& id : b.seats) if (show.state[id].bookingId == b.id && !show.state[id].booked) show.state[id] = {};
    }
};

int main() {
    long clock = 18 * 60;                                   // 6:00 pm
    StandardPricing pricing; FakePayments payments;
    BookingService svc(pricing, payments, [&] { return clock; });
    auto show = make_unique<Show>();
    show->id = "S1"; show->movie = "Interstellar"; show->startMin = 19 * 60;
    for (string id : {"A1", "A2", "A3", "A4"}) show->seats[id] = SeatType::NORMAL;
    for (string id : {"P1", "P2"}) show->seats[id] = SeatType::PREMIUM;
    svc.addShow(std::move(show));

    auto b1 = svc.hold("S1", "asha", {"A2", "A3"});
    cout << "asha holds A2,A3: " << (b1 ? b1->id + " Rs " + to_string(b1->amount) : "failed") << "\n";
    auto b2 = svc.hold("S1", "bilal", {"A3", "A4"});
    cout << "bilal wants A3,A4: " << (b2 ? "ok" : "rejected (A3 is held)") << "\n";
    cout << "seat map: " << svc.seatMap("S1") << "\n";
    cout << "asha confirms: " << name(svc.confirm(b1->id)) << "\n";

    auto b3 = svc.hold("S1", "chen", {"P1", "P2"});
    clock += 6;                                             // chen takes 6 minutes to pay
    cout << "chen confirms after 6 min: " << name(svc.confirm(b3->id)) << "\n";
    auto b4 = svc.hold("S1", "dara", {"P1"});
    cout << "dara holds P1 after chen's hold expired: " << (b4 ? "ok" : "rejected") << "\n";

    // 50 users race for seat A1 at the same moment
    atomic<int> winners{0};
    vector<thread> users;
    for (int i = 0; i < 50; i++) users.emplace_back([&, i] { if (svc.hold("S1", "user" + to_string(i), {"A1"})) winners++; });
    for (auto& t : users) t.join();
    cout << "50 concurrent holds on A1 -> winners: " << winners << "\n";
    cout << "seat map: " << svc.seatMap("S1") << "\n";
}
```
```js run
const SeatType = Object.freeze({ NORMAL: "NORMAL", PREMIUM: "PREMIUM", RECLINER: "RECLINER" });
const HOLD_MIN = 5;

const standardPricing = {
  price(show, seatType) {
    const base = { NORMAL: 200, PREMIUM: 300, RECLINER: 500 }[seatType];
    const hour = Math.floor(show.startMin / 60) % 24;
    return hour >= 18 ? (base * 12) / 10 : base;             // evening shows +20%
  },
};
const fakePayments = { charged: new Set(), async charge(user, amount, key) { if (user === "declined-user") return false; this.charged.add(key); return true; } };

class BookingService {
  #shows = new Map(); #bookings = new Map(); #seq = 0;
  constructor(pricing, payments, clock) { Object.assign(this, { pricing, payments, now: clock }); }
  addShow(show) { show.state = new Map([...show.seats.keys()].map((id) => [id, { bookingId: null, holdUntil: 0, booked: false }])); this.#shows.set(show.id, show); }

  // Synchronous on purpose: check-ALL then take-ALL with no await in between = atomic on JS's single thread
  hold(showId, user, seatIds) {
    const show = this.#shows.get(showId), t = this.now();
    const isFree = (st) => !st.bookingId || (!st.booked && st.holdUntil <= t);   // expired holds count as free
    if (!seatIds.every((id) => show.state.has(id) && isFree(show.state.get(id)))) return null;
    const b = { id: `B${++this.#seq}`, user, showId, seats: seatIds, amount: 0, status: "HELD", holdUntil: t + HOLD_MIN };
    for (const id of seatIds) { show.state.set(id, { bookingId: b.id, holdUntil: b.holdUntil, booked: false }); b.amount += this.pricing.price(show, show.seats.get(id)); }
    this.#bookings.set(b.id, b);
    return { ...b };
  }

  async confirm(bookingId) {
    const b = this.#bookings.get(bookingId), show = this.#shows.get(b.showId);
    if (b.status !== "HELD") return b.status;
    if (this.now() >= b.holdUntil) { b.status = "EXPIRED"; this.#release(show, b); return b.status; }
    const paid = await this.payments.charge(b.user, b.amount, b.id);      // ← other tasks may run during this await
    if (!paid) { b.status = "FAILED"; this.#release(show, b); return b.status; }
    if (!b.seats.every((id) => show.state.get(id).bookingId === b.id)) { b.status = "FAILED"; return b.status; }   // re-check after the await (refund in real life)
    for (const id of b.seats) show.state.get(id).booked = true;
    b.status = "CONFIRMED";
    return b.status;
  }
  #release(show, b) { for (const id of b.seats) { const st = show.state.get(id); if (st.bookingId === b.id && !st.booked) show.state.set(id, { bookingId: null, holdUntil: 0, booked: false }); } }
  seatMap(showId) {
    const show = this.#shows.get(showId), t = this.now();
    return [...show.state].map(([id, st]) => `${id}${st.booked ? "[X]" : st.bookingId && st.holdUntil > t ? "[h]" : "[ ]"}`).join(" ");
  }
}

let clock = 18 * 60;                                        // 6:00 pm
const svc = new BookingService(standardPricing, fakePayments, () => clock);
svc.addShow({ id: "S1", movie: "Interstellar", startMin: 19 * 60,
  seats: new Map([["A1", SeatType.NORMAL], ["A2", SeatType.NORMAL], ["A3", SeatType.NORMAL], ["A4", SeatType.NORMAL], ["P1", SeatType.PREMIUM], ["P2", SeatType.PREMIUM]]) });

const b1 = svc.hold("S1", "asha", ["A2", "A3"]);
console.log(`asha holds A2,A3: ${b1.id} Rs ${b1.amount}`);
console.log(`bilal wants A3,A4: ${svc.hold("S1", "bilal", ["A3", "A4"]) ? "ok" : "rejected (A3 is held)"}`);
console.log("seat map:", svc.seatMap("S1"));
console.log("asha confirms:", await svc.confirm(b1.id));

const b3 = svc.hold("S1", "chen", ["P1", "P2"]);
clock += 6;                                                 // chen takes 6 minutes to pay
console.log("chen confirms after 6 min:", await svc.confirm(b3.id));
console.log(`dara holds P1 after chen's hold expired: ${svc.hold("S1", "dara", ["P1"]) ? "ok" : "rejected"}`);

const winners = Array.from({ length: 50 }, (_, i) => svc.hold("S1", `user${i}`, ["A1"])).filter(Boolean).length;
console.log("50 holds on A1 -> winners:", winners);
console.log("seat map:", svc.seatMap("S1"));
```
:::

## Design discussion

- **Holds with expiry** let users pay without blocking seats forever; expired holds are treated as free **lazily** at the next hold attempt, and a background job (`releaseExpired`) can clean them up for accurate seat maps.
- **All-or-nothing** under one per-show lock prevents partial bookings and double bookings. Per-show granularity means different shows never contend.
- **Payment is not held under the lock** (a slow gateway must not block the whole show); instead the hold is **re-validated** after payment returns. If it was lost in between, the payment is **refunded**: a compensation, as in the saga lesson. Idempotency key = booking id, so a retried charge doesn't double charge.
- **Pricing is a strategy** (weekday/weekend, seat type, surge for premieres, coupons as decorators).
- **Scaling beyond one process**: seat state moves to the database: holds as rows with a unique constraint on `(show_id, seat_id)` among active holds, or `UPDATE show_seats SET hold_by = ?, hold_until = ? WHERE show_id = ? AND seat_id IN (…) AND (hold_by IS NULL OR hold_until < now())` checking the affected-row count; or a Redis `SET seat_key booking NX PX 300000` per seat with a Lua script for all-or-nothing. The Ticketmaster case study scales this to millions of users with a virtual waiting room.

```quiz
? Why is seat status stored per Show rather than on the Seat object?
+ The same physical seat can be free for one show and booked for another
- Seats are immutable
- To save memory
> Availability is a property of (show, seat), not of the seat alone.

? Why isn't the payment call made while holding the show's lock?
+ A slow payment gateway would block every other booking attempt for that show; instead, re-validate the hold after payment and compensate if it was lost
- Payments can't run in parallel
- The lock would expire
> Never do slow I/O under a lock; re-check and compensate instead.

? A user's 5-minute hold expired while they were still typing card details. What happens when they press Pay?
+ confirm() sees the hold expired, marks the booking EXPIRED and releases any seats still held by it; the user must reselect
- The payment goes through and the seats are double-booked
- The hold is extended automatically
> Expiry is checked before charging; seats may already belong to someone else.
```

:::keypoints
- Entities: Movie, Cinema, Screen, Seat, **Show** (holds per-show seat state), **Booking** (HELD → CONFIRMED / EXPIRED / FAILED / CANCELLED).
- **Hold** seats all-or-nothing under a **per-show lock**; holds **expire** (lazy check + cleanup job).
- **Confirm** = check expiry → charge (idempotency key, outside the lock) → re-validate under the lock → book; compensate (refund) if lost.
- Pricing as a **Strategy**; in a distributed version, holds become conditional DB updates or Redis `SET NX PX`.
:::
