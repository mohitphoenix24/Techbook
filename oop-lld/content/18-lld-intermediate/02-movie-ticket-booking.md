---
title: Design a Movie Ticket Booking System
level: intermediate
time: 60
summary: Cinemas, screens, shows and seats. Learn how to hold seats for a few minutes while a user pays, how to let the hold expire, how to confirm the booking, and how to stop two users from getting the same seat.
---

:::problem Design a Movie Ticket Booking System {level=medium tags="booking,concurrency,seat locking,state,BookMyShow"}
Design a system like BookMyShow. Users search for shows of a movie in a city, see the seat map, choose seats, pay and get tickets. While a user is paying, their chosen seats must be held so nobody else can take them. If the payment is not finished in time, the seats are released. Two users must never get the same seat.

:::hint Hint
A seat has a life cycle for each show: available, then **held** (with an expiry time), then booked. The key step is "hold these seats **all or none**" under a lock for each show. Check expiry only when someone asks for the seat, using a clock that you pass in.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | Cinema, Screen (seat layout), Movie, Show (movie + screen + start time), Seat, Booking |
| Search? | shows by movie and city (and date) |
| Choosing seats? | 1 to 6 seats. All must be free, or the request fails |
| Hold? | a successful choice holds the seats for 5 minutes |
| Payment? | confirm within the hold time, or the hold expires. The payment itself is behind an interface |
| Cancel? | allowed before the show. Seats become free again |
| Price? | by seat type (regular, premium). A strategy (peak hours, weekends) |
| Many users? | yes. No double booking. Hold, confirm and expiry must agree with each other |
| Not needed | food orders, coupons, refund details |

## Step 2: The life of a seat

```viz algo=state title="A seat in one show"
state Available "Available" [initial] @0,1
state Held "Held (expires)" @1,1
state Booked "Booked" @2,1
Available -> Held : hold
Held -> Available : hold expired / user released
Held -> Booked : payment confirmed
Booked -> Available : booking cancelled
play: hold, payment confirmed, booking cancelled
```

## Step 3: Find the classes

```viz algo=uml title="Movie booking"
class BookingService
  + searchShows(movie: string, city: string): Show[]
  + hold(userId: string, showId: int, seats: string[]): Result<Hold>
  + confirm(holdId: int, payment: PaymentGateway): Result<Booking>
  + cancel(bookingId: int): bool
class Show
  - id: int
  - movie: Movie
  - screen: Screen
  - start: long
  - seats: map<string, SeatState>
  - lock: mutex
  + tryHold(user: string, seats: string[], now: long): Hold
  + confirm(hold: Hold, now: long): bool
  + release(seats: string[]): void
class Screen
  - layout: Seat[]
class Seat
  - label: string
  - category: SeatCategory
class SeatState
  - status: Status
  - heldBy: string
  - holdUntil: long
class Hold
  - id: int
  - show: int
  - seats: string[]
  - expiresAt: long
class Booking
interface PricingStrategy
interface PaymentGateway
interface Clock
BookingService o-- Show
Show *-- SeatState
Show --> Screen
Screen *-- Seat
BookingService --> PricingStrategy
BookingService --> PaymentGateway
BookingService --> Clock
```

## Step 4: Design decisions

- **One mutex for each show.** All seat changes for a show happen while holding that show's lock. Different shows never wait for each other.
- **`tryHold` is all or nothing.** First check every requested seat (it must be free, or held with an expired hold, which counts as free). Then mark all of them as held. A partial hold would leave users stuck.
- **Lazy expiry.** There is no timer thread. A held seat whose `holdUntil <= now` counts as free when we look at it. (A background sweeper is only needed to free memory or to send messages.)
- **Confirm checks again.** It checks that the hold still belongs to that user and has not expired, **then** calls payment, then marks the seats booked. If payment fails, the seats stay held until they expire (or are released at once).
- **A clock passed in** lets us test expiry without waiting.
- **Price is a Strategy** by seat type and time. It is kept out of `Show`.

## Step 5: The code

```cpp run title="Show, holds, confirmation, expiry, concurrent bookings"
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

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };
struct ManualClock : Clock { atomic<long> t{0}; long now() const override { return t; } };

enum class Category { Regular, Premium };
enum class Status { Available, Held, Booked };

struct SeatState { Category category; Status status = Status::Available; string heldBy; long holdUntil = 0; string bookedBy; };

struct Hold { int id; string user; vector<string> seats; long expiresAt; };

class Show {
    int id_; string movie_; long start_;
    map<string, SeatState> seats_;
    mutable mutex m_;
    static constexpr long kHoldSeconds = 300;
    bool effectivelyFree(const SeatState& s, long now) const { return s.status == Status::Available || (s.status == Status::Held && s.holdUntil <= now); }
public:
    Show(int id, string movie, long start, int rows, int cols, int premiumRows) : id_(id), movie_(move(movie)), start_(start) {
        for (int r = 0; r < rows; ++r) for (int c = 1; c <= cols; ++c) seats_[string(1, 'A' + r) + to_string(c)] = SeatState{r < premiumRows ? Category::Premium : Category::Regular};
    }
    int id() const { return id_; }
    const string& movie() const { return movie_; }
    Category categoryOf(const string& seat) const { return seats_.at(seat).category; }

    optional<Hold> tryHold(const string& user, const vector<string>& want, long now, int holdId, string& why) {
        if (want.empty() || want.size() > 6) { why = "choose between 1 and 6 seats"; return nullopt; }
        lock_guard lock(m_);
        for (const auto& s : want) {                         // phase 1: validate ALL seats, change nothing
            auto it = seats_.find(s);
            if (it == seats_.end()) { why = "no such seat " + s; return nullopt; }
            if (!effectivelyFree(it->second, now)) { why = "seat " + s + " is not available"; return nullopt; }
        }
        for (const auto& s : want) { auto& st = seats_[s]; st.status = Status::Held; st.heldBy = user; st.holdUntil = now + kHoldSeconds; }   // phase 2: commit
        return Hold{holdId, user, want, now + kHoldSeconds};
    }
    bool confirm(const Hold& h, long now, string& why) {
        lock_guard lock(m_);
        for (const auto& s : h.seats) {
            const auto& st = seats_.at(s);
            if (st.status != Status::Held || st.heldBy != h.user) { why = "the hold on " + s + " is no longer yours"; return false; }
            if (st.holdUntil <= now) { why = "the hold expired"; return false; }
        }
        for (const auto& s : h.seats) { auto& st = seats_[s]; st.status = Status::Booked; st.bookedBy = h.user; }
        return true;
    }
    void release(const Hold& h) {                            // user gave up or payment failed
        lock_guard lock(m_);
        for (const auto& s : h.seats) { auto& st = seats_[s]; if (st.status == Status::Held && st.heldBy == h.user) { st.status = Status::Available; st.heldBy.clear(); } }
    }
    int availableCount(long now) const { lock_guard l(m_); int n = 0; for (const auto& [k, s] : seats_) n += effectivelyFree(s, now); return n; }
    int bookedCount() const { lock_guard l(m_); int n = 0; for (const auto& [k, s] : seats_) n += s.status == Status::Booked; return n; }
};

struct PricingStrategy { virtual ~PricingStrategy() = default; virtual long price(Category c, long showStart) const = 0; };
struct WeekendPricing : PricingStrategy { long price(Category c, long) const override { return c == Category::Premium ? 450 : 250; } };

struct PaymentGateway { virtual ~PaymentGateway() = default; virtual bool pay(const string& user, long amount) = 0; };
struct FakePayment : PaymentGateway { bool ok = true; bool pay(const string&, long) override { return ok; } };

class BookingService {
    map<int, shared_ptr<Show>> shows_;
    map<int, Hold> holds_; mutex holdsM_; atomic<int> nextHold_{1};
    const Clock& clock_; PricingStrategy& pricing_; PaymentGateway& payment_;
public:
    BookingService(const Clock& c, PricingStrategy& p, PaymentGateway& g) : clock_(c), pricing_(p), payment_(g) {}
    void addShow(shared_ptr<Show> s) { shows_[s->id()] = move(s); }
    vector<int> searchShows(const string& movie) const { vector<int> r; for (auto& [id, s] : shows_) if (s->movie() == movie) r.push_back(id); return r; }

    optional<Hold> hold(const string& user, int showId, const vector<string>& seats, string& why) {
        auto it = shows_.find(showId); if (it == shows_.end()) { why = "no such show"; return nullopt; }
        auto h = it->second->tryHold(user, seats, clock_.now(), nextHold_++, why);
        if (h) { lock_guard l(holdsM_); holds_[h->id] = *h; holdShow_[h->id] = showId; }
        return h;
    }
    bool confirm(int holdId, long& total, string& why) {
        Hold h; int showId;
        { lock_guard l(holdsM_); auto it = holds_.find(holdId); if (it == holds_.end()) { why = "unknown hold"; return false; } h = it->second; showId = holdShow_[holdId]; }
        Show& show = *shows_.at(showId);
        total = 0; for (auto& s : h.seats) total += pricing_.price(show.categoryOf(s), 0);
        if (clock_.now() >= h.expiresAt) { why = "the hold expired"; return false; }
        if (!payment_.pay(h.user, total)) { show.release(h); why = "payment failed, seats released"; return false; }
        if (!show.confirm(h, clock_.now(), why)) return false;
        { lock_guard l(holdsM_); holds_.erase(holdId); }
        return true;
    }
private:
    map<int, int> holdShow_;
};

int main() {
    ManualClock clock; WeekendPricing pricing; FakePayment pay;
    BookingService svc(clock, pricing, pay);
    auto show = make_shared<Show>(1, "Lagaan", 18 * 3600, 3, 4, 1);      // rows A-C, 4 seats each; row A is premium
    svc.addShow(show);

    string why; long total = 0;
    cout << "shows for Lagaan: " << svc.searchShows("Lagaan").size() << "\n";

    auto h1 = svc.hold("asha", 1, {"A1", "A2"}, why);
    cout << "asha holds A1,A2: " << (h1 ? "ok" : why) << "\n";
    auto h2 = svc.hold("ravi", 1, {"A2", "B1"}, why);
    cout << "ravi wants A2,B1: " << (h2 ? "ok" : "refused (" + why + ")") << "; B1 stays free: " << show->availableCount(clock.now()) << " of 12 free\n";

    cout << "asha pays: " << (svc.confirm(h1->id, total, why) ? "booked, total Rs " + to_string(total) : why) << "\n";

    auto h3 = svc.hold("meera", 1, {"C1", "C2"}, why);
    cout << "meera holds C1,C2, then waits 6 minutes\n";
    clock.t += 360;
    cout << "meera pays late: " << (svc.confirm(h3->id, total, why) ? "booked" : "refused (" + why + ")") << "\n";
    auto h4 = svc.hold("kiran", 1, {"C1"}, why);
    cout << "kiran takes C1 after the hold expired: " << (h4 ? "ok" : why) << "\n";

    pay.ok = false;
    auto h5 = svc.hold("dev", 1, {"B3"}, why);
    cout << "dev's payment fails: " << (svc.confirm(h5->id, total, why) ? "booked" : why) << "\n";
    pay.ok = true;

    cout << "20 users race for the same 2 seats:\n";
    auto race = make_shared<Show>(2, "Dangal", 20 * 3600, 1, 2, 0);
    svc.addShow(race);
    atomic<int> winners{0};
    vector<thread> ts;
    for (int u = 0; u < 20; ++u)
        ts.emplace_back([&, u] {
            string w; auto h = svc.hold("user" + to_string(u), 2, {"A1", "A2"}, w); long t;
            if (h && svc.confirm(h->id, t, w)) ++winners;
        });
    for (auto& t : ts) t.join();
    cout << "  successful bookings: " << winners << ", seats booked: " << race->bookedCount() << " (exactly one winner)\n";
}
```

## Edge cases

| Case | What happens |
|---|---|
| Two users choose overlapping seats | the second `tryHold` fails completely (no partial hold) |
| A hold expires, someone else books, then the first user pays | confirm checks ownership and expiry again, and refuses |
| Payment fails | seats are released at once, not after the expiry |
| The same user holds twice | the second hold on the same seats works only if they are free or held by that user (extension) |
| The show has already started | `hold` refuses when `now >= start` (add this check) |
| Hold ids that can be guessed | use random ids, and check that the hold belongs to the caller |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Release held seats on time" | a sweeper thread, or a `release` for each hold on a timer (Command) |
| "Many servers" | seat state moves to a database with conditional updates, or Redis locks (`SET NX PX`). The same API |
| "Changing prices, coupons" | a new `PricingStrategy` and a `Discount` chain |
| "Tell the user" | Observer on booking events (email, SMS) |
| "A waiting list for sold-out shows" | a queue for each show, and offer seats on cancellation |
| "Different seat maps" | build `Screen` from a layout description. Seat types by row |
| "Search on a big scale" | an index by (city, movie, date) in a `ShowRepository` |
| "Refunds" | the booking state machine gets a `Cancelled` state and a refund command |

## Short answer to say in an interview

:::interview How do you stop two users from booking the same seat?
"A seat goes through available, held and booked. All changes for a show happen under that show's mutex. tryHold checks every seat first and marks them all, or none. The hold has an expiry, and I check it lazily against a clock that I pass in. At confirm time I check that the hold still belongs to the user and has not expired, then I take payment, then I mark the seats booked. In a bigger system the same state machine works with conditional updates in a shared database."
:::

```quiz
? Why must tryHold check all seats before changing any?
- It is faster
+ A partial hold would leave the user holding some seats but not all
- Maps need it
> All or nothing, under one lock.
? How are expired holds handled without a timer thread?
- They stay forever
+ A held seat whose time has passed counts as free the next time it is checked (lazy expiry)
- The database deletes them
> The clock that we pass in decides at check time.
```

:::keypoints
- Seat state for each show, with one lock for each show. Hold (all or nothing, with expiry), then confirm (check again, pay, book).
- Lazy expiry with a clock passed in. A failed payment releases the seats. Price is a strategy.
- To scale: conditional updates in a shared store, with the same state machine.
:::
