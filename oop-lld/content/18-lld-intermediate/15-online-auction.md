---
title: Design an Online Auction System
level: intermediate
time: 60
summary: Items listed with a reserve price and end time, bidders placing bids under rules (minimum increment, no self-outbidding), an auction lifecycle with an injected clock, outbid notifications, auction types as strategies (English, sealed-bid), and race-free bid handling.
---

:::problem Design an Online Auction System (eBay-like) {level=medium tags="State,Strategy,Observer,concurrency,time,marketplace"}
Design an online auction. A seller lists an item with a starting price, a reserve (minimum acceptable price) and an end time. Bidders place bids; each new bid must beat the current highest by a minimum increment. When the auction ends, the highest bidder wins if the reserve is met. Outbid bidders are notified. Different auction types (English ascending, sealed-bid) should be easy to support.
:::

:::hint Hint
The critical operation is `placeBid`: read the current highest, validate, and update **atomically** (one lock per auction). The auction's **rules** (increment, how the winner is chosen) are a strategy; its **lifecycle** (Scheduled, Open, Closed) is a small state machine driven by an injected clock.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | User (seller or bidder), Item, Auction, Bid |
| Listing? | title, starting price, reserve price, start and end time |
| Bidding rules? | bid ≥ current highest + increment (or ≥ starting price for the first); a seller cannot bid; a bidder cannot outbid themselves |
| Lifecycle? | Scheduled → Open (at start) → Closed (at end); Cancelled by the seller if there are no bids |
| Winner? | highest bid at the end, provided it meets the reserve; else "reserve not met" |
| Anti-sniping? | optional: a bid in the last 2 minutes extends the end by 2 minutes (a rule) |
| Notifications? | outbid, won, lost, ended |
| Concurrency? | many simultaneous bids; the highest bid is always consistent |
| Out of scope | payments, shipping, fraud |

## Step 2: lifecycle

```viz algo=state title="Auction states"
state Scheduled "Scheduled" [initial] @0,1
state Open "Open" @1,1
state Closed "Closed" @2,1
state Cancelled "Cancelled" @1,2
Scheduled -> Open : start time reached
Open -> Open : valid bid
Open -> Closed : end time reached
Scheduled -> Cancelled : seller cancels
Open -> Cancelled : seller cancels (no bids)
play: start time reached, valid bid, valid bid, end time reached
```

## Step 3: entities

```viz algo=uml title="Auction system"
class AuctionHouse
  + list(seller: User, item: Item, rules: AuctionRules, start: long, end: long): Auction
  + tick(): void
class Auction
  - id: int
  - item: Item
  - seller: User
  - state: AuctionState
  - bids: Bid[]
  - endTime: long
  - lock: mutex
  + placeBid(u: User, amount: Money): Result
  + close(): Outcome
class Bid
  - bidder: User
  - amount: Money
  - time: long
interface AuctionRules
  + minNextBid(a: Auction): Money
  + accept(a: Auction, b: Bid): Decision
  + pickWinner(a: Auction): Bid
class EnglishRules
class SealedBidRules
interface BidListener
  + onOutbid(u: User, a: Auction, newAmount: Money): void
  + onEnded(a: Auction, outcome: Outcome): void
interface Clock
AuctionHouse o-- Auction
Auction *-- Bid
Auction --> AuctionRules
EnglishRules ..|> AuctionRules
SealedBidRules ..|> AuctionRules
Auction o-- BidListener
Auction --> Clock
```

## Step 4: design decisions

- **One mutex per auction**: `placeBid` validates and appends under it, so two simultaneous bids are serialised and the second sees the first. Different auctions do not interfere.
- **`AuctionRules` Strategy**: `EnglishRules` (open ascending: min increment, highest wins) and `SealedBidRules` (bids hidden, one bid per user, highest wins at the end; the winner pays the highest or second-highest price, "Vickrey"). Rules decide `minNextBid`, whether a bid is acceptable, and the winner.
- **Clock injection and `tick()`**: the house calls `tick()`; each auction compares `now` against start/end. No timer threads in the core.
- **Observer** for notifications. Listeners are called **after** releasing the lock to avoid calling out under a lock.
- **Anti-sniping** is part of `EnglishRules::accept` (it may extend `endTime`).
- **Immutable `Bid` records**; the auction keeps the full history for audit.
- **Money** as integer rupees/paise.

## Step 5: the code

```cpp run title="Auction with rules, outbid notifications and a bid race"
#include <algorithm>
#include <atomic>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>
using namespace std;

using Money = long;                                          // rupees
struct User { int id; string name; };
struct Bid { const User* bidder; Money amount; long time; };

enum class State { Scheduled, Open, Closed, Cancelled };
const char* name(State s) { static const char* n[] = {"Scheduled", "Open", "Closed", "Cancelled"}; return n[static_cast<int>(s)]; }

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };
struct ManualClock : Clock { atomic<long> t{0}; long now() const override { return t; } };

class Auction;
struct AuctionRules {
    virtual ~AuctionRules() = default;
    virtual Money minNextBid(const vector<Bid>& bids, Money startPrice) const = 0;
    virtual bool visibleBids() const = 0;
    virtual optional<Bid> pickWinner(const vector<Bid>& bids) const = 0;
    virtual Money priceFor(const vector<Bid>& bids) const = 0;                 // what the winner pays
    virtual long extension(long now, long endTime) const { (void)now; (void)endTime; return 0; }
};
struct EnglishRules : AuctionRules {                          // open ascending, with anti-sniping
    Money increment = 10;
    Money minNextBid(const vector<Bid>& b, Money start) const override { return b.empty() ? start : b.back().amount + increment; }
    bool visibleBids() const override { return true; }
    optional<Bid> pickWinner(const vector<Bid>& b) const override { return b.empty() ? nullopt : optional<Bid>(b.back()); }
    Money priceFor(const vector<Bid>& b) const override { return b.back().amount; }
    long extension(long now, long end) const override { return end - now <= 120 ? 120 : 0; }     // a bid in the last 2 minutes extends the end by 2 minutes
};
struct SealedBidRules : AuctionRules {                        // hidden bids; highest wins and pays the SECOND-highest price (Vickrey)
    Money minNextBid(const vector<Bid>&, Money start) const override { return start; }
    bool visibleBids() const override { return false; }
    optional<Bid> pickWinner(const vector<Bid>& b) const override { if (b.empty()) return nullopt; return *max_element(b.begin(), b.end(), [](const Bid& x, const Bid& y) { return x.amount < y.amount; }); }
    Money priceFor(const vector<Bid>& b) const override {
        vector<Money> a; for (auto& x : b) a.push_back(x.amount);
        sort(a.rbegin(), a.rend());
        return a.size() > 1 ? a[1] : a[0];
    }
};

struct BidListener {
    virtual ~BidListener() = default;
    virtual void onOutbid(const User& u, const string& item, Money newAmount) = 0;
    virtual void onEnded(const string& item, const string& summary) = 0;
};
struct Console : BidListener {
    void onOutbid(const User& u, const string& item, Money m) override { cout << "    [notify " << u.name << "] you were outbid on '" << item << "': new highest Rs " << m << "\n"; }
    void onEnded(const string& item, const string& s) override { cout << "    [notify all] auction for '" << item << "' ended: " << s << "\n"; }
};

class Auction {
    string item_; const User* seller_; Money start_, reserve_; long startT_, endT_;
    unique_ptr<AuctionRules> rules_; const Clock& clock_; BidListener* listener_;
    State state_ = State::Scheduled;
    vector<Bid> bids_;
    mutable mutex m_;
public:
    Auction(string item, const User* seller, Money start, Money reserve, long s, long e, unique_ptr<AuctionRules> r, const Clock& c, BidListener* l)
        : item_(move(item)), seller_(seller), start_(start), reserve_(reserve), startT_(s), endT_(e), rules_(move(r)), clock_(c), listener_(l) {}

    void tick() {                                             // advance the lifecycle from the clock
        const User* winner = nullptr; string summary; bool ended = false;
        {
            lock_guard l(m_);
            long now = clock_.now();
            if (state_ == State::Scheduled && now >= startT_) state_ = State::Open;
            if (state_ == State::Open && now >= endT_) {
                state_ = State::Closed; ended = true;
                auto w = rules_->pickWinner(bids_);
                if (!w) summary = "no bids";
                else if (rules_->priceFor(bids_) < reserve_) summary = "reserve not met (highest Rs " + to_string(w->amount) + " < Rs " + to_string(reserve_) + ")";
                else { winner = w->bidder; summary = winner->name + " wins and pays Rs " + to_string(rules_->priceFor(bids_)); }
            }
        }
        if (ended && listener_) listener_->onEnded(item_, summary);
    }
    // returns an empty string on success, or the reason for refusal
    string placeBid(const User& u, Money amount) {
        const User* outbid = nullptr; Money highest = 0;
        {
            lock_guard l(m_);                                // check-and-update must be atomic
            long now = clock_.now();
            if (state_ != State::Open || now >= endT_) return "auction is not open";
            if (&u == seller_) return "sellers cannot bid on their own items";
            if (!bids_.empty() && rules_->visibleBids() && bids_.back().bidder == &u) return "you already hold the highest bid";
            if (!rules_->visibleBids()) for (auto& b : bids_) if (b.bidder == &u) return "sealed auctions allow one bid per bidder";
            Money need = rules_->minNextBid(bids_, start_);
            if (amount < need) return "bid too low: minimum is Rs " + to_string(need);
            if (rules_->visibleBids() && !bids_.empty()) outbid = bids_.back().bidder;
            bids_.push_back({&u, amount, now});
            highest = amount;
            endT_ += rules_->extension(now, endT_);          // anti-sniping
        }
        if (outbid && listener_) listener_->onOutbid(*outbid, item_, highest);
        return "";
    }
    State state() const { lock_guard l(m_); return state_; }
    Money highest() const { lock_guard l(m_); Money h = 0; for (auto& b : bids_) h = max(h, b.amount); return h; }
    size_t bidCount() const { lock_guard l(m_); return bids_.size(); }
    bool incrementsRespected(Money inc) const { lock_guard l(m_); for (size_t i = 1; i < bids_.size(); ++i) if (bids_[i].amount < bids_[i - 1].amount + inc) return false; return true; }
    long endTime() const { lock_guard l(m_); return endT_; }
};

int main() {
    ManualClock clock; Console console;
    User seller{1, "Seller"}, asha{2, "Asha"}, ravi{3, "Ravi"}, meera{4, "Meera"};

    auto tryBid = [&](Auction& a, const User& u, Money amount) {
        string why = a.placeBid(u, amount);
        cout << "  " << u.name << " bids Rs " << amount << ": " << (why.empty() ? "accepted" : "refused (" + why + ")") << "\n";
    };

    cout << "English auction (start Rs 100, reserve Rs 150, increment 10, ends at t=1000):\n";
    Auction english("vintage watch", &seller, 100, 150, 10, 1000, make_unique<EnglishRules>(), clock, &console);
    clock.t = 5;   english.tick();  cout << "  t=5 state: " << name(english.state()) << "\n";
    clock.t = 20;  english.tick();  cout << "  t=20 state: " << name(english.state()) << "\n";
    tryBid(english, asha, 100);
    tryBid(english, ravi, 105);                              // below the increment
    tryBid(english, ravi, 120);
    tryBid(english, ravi, 130);                              // already the highest bidder
    tryBid(english, seller, 500);
    tryBid(english, asha, 160);
    clock.t = 950; tryBid(english, ravi, 200);               // within the last 2 minutes?
    clock.t = 990; tryBid(english, asha, 250);               // last-minute bid: extends the end
    cout << "  new end time after anti-sniping: t=" << english.endTime() << "\n";
    clock.t = 1000; english.tick(); cout << "  at t=1000 state: " << name(english.state()) << " (the extension keeps it open)\n";
    clock.t = 1200; english.tick(); cout << "  at t=1200 state: " << name(english.state()) << "\n";
    tryBid(english, meera, 300);

    cout << "Reserve not met:\n";
    Auction low("old book", &seller, 10, 100, 0, 50, make_unique<EnglishRules>(), clock, &console);
    clock.t = 0; low.tick(); tryBid(low, asha, 20); clock.t = 60; low.tick();

    cout << "Sealed-bid (Vickrey) auction: highest wins, pays the second price\n";
    clock.t = 0;
    Auction sealed("painting", &seller, 100, 100, 0, 100, make_unique<SealedBidRules>(), clock, &console);
    sealed.tick();
    tryBid(sealed, asha, 500); tryBid(sealed, ravi, 800); tryBid(sealed, meera, 650); tryBid(sealed, ravi, 900);
    clock.t = 100; sealed.tick();

    cout << "Race: 50 threads bid Rs 101..150 on one auction; the recorded bids must form a valid ascending sequence\n";
    clock.t = 0;
    Auction race("laptop", &seller, 100, 0, 0, 10000, make_unique<EnglishRules>(), clock, nullptr);
    race.tick();
    vector<User> bidders; for (int i = 0; i < 50; ++i) bidders.push_back({100 + i, "b" + to_string(i)});
    vector<thread> ts;
    for (int i = 0; i < 50; ++i) ts.emplace_back([&, i] { race.placeBid(bidders[i], 101 + i); });
    for (auto& t : ts) t.join();
    cout << "  accepted bids: " << race.bidCount() << ", highest Rs " << race.highest() << "; every accepted bid beat the previous one by the increment: " << boolalpha << race.incrementsRespected(10) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Bid at exactly the end time | `now >= end` means closed: refused |
| Two equal bids at the same instant | the lock serialises them; the second fails the "higher than current" rule |
| Bidding after close | refused; the state check is inside the lock |
| Reserve not met | outcome "reserve not met", no winner |
| Seller cancels with bids | not allowed (or compensates bidders) |
| Clock skew between servers | one authoritative time source per auction |
| Auto-bidding (proxy bids) | extension: a user sets a max; the system bids the minimum needed |
| Bid retraction | rules decide (often disallowed in the last hours) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Dutch auction (price falls until someone accepts)" | a `DutchRules` with a time-dependent `minNextBid` and first-accept-wins |
| "Buy-it-now" | an option on the auction that closes it immediately at a fixed price |
| "Proxy/auto bidding" | `AutoBidder` listener that places counter-bids up to a limit (Observer) |
| "Many concurrent auctions" | per-auction locks scale; a scheduler (previous lesson) triggers `tick` at exact times |
| "Fraud detection" | a filter chain on bids (shill bidding patterns) |
| "Payment and escrow" | on close, emit `AuctionWon`; a payment service holds funds |
| "Persistence/audit" | append-only bid log; the state is derived |
| "Scale and fairness" | strict ordering of bids by an arrival sequence from a single owner of each auction (actor per auction) |

```quiz
? Why must placeBid check and update under one lock?
- To make it slower
+ Otherwise two bidders could both pass the "higher than current" check and both be accepted
- C++ requires it
> Check-then-act on shared state must be atomic.
? What does the Vickrey (second-price) sealed-bid rule change?
- The winner is the lowest bidder
+ The highest bidder wins but pays the second-highest bid, encouraging honest bids
- Nothing
> It is implemented by a different `AuctionRules` strategy.
```

:::keypoints
- Auction = lifecycle (clock-driven) + rules strategy + bids under one lock; listeners notified after unlocking.
- English vs sealed-bid are strategies; anti-sniping is a rule that extends the end time.
- Atomic bid handling, reserve checking at close, injected clock, immutable bid log.
:::
