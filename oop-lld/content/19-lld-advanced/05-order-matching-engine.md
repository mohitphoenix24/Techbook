---
title: Design an Order Matching Engine (stock exchange)
level: advanced
time: 75
summary: A limit order book with price-time priority, limit, market and IOC orders, partial fills and trades, cancellation in O(1) through an order index, self-trade prevention, why matching is single-threaded per symbol, and the data-structure choices behind best bid and ask.
---

:::problem Design an Order Matching Engine {level=hard tags="finance,data structures,priority,order book,Strategy,low latency"}
Design the core of a stock exchange for one symbol. Traders submit **buy** and **sell** orders: **limit** orders (with a price) and **market** orders (any price). The engine matches a buy with a sell when the buy price is at least the sell price, using **price-time priority**: the best price first, and among equal prices the earliest order first. It records trades, supports cancellation, partial fills and immediate-or-cancel orders, and publishes market data (best bid/ask).
:::

:::hint Hint
Keep two sides of the book: **bids** sorted by price descending, **asks** by price ascending. Each price level holds a **FIFO queue** of orders. An incoming order walks the opposite side from the best price while prices cross, generating trades. Unfilled limit quantity rests in the book. An id → location index makes cancel fast.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Orders? | `side` (Buy/Sell), `type` (Limit, Market), price (limit only), quantity, trader id, time priority by arrival sequence |
| Matching rule? | price-time priority; the trade price is the **resting** order's price |
| Partial fills? | yes; the remainder of a limit order rests, the remainder of a market order is cancelled |
| Time in force? | GTC (rest until cancelled) and IOC (fill what you can immediately, cancel the rest) |
| Cancel? | by order id; O(1) lookup |
| Self trade? | an order never trades against the same trader's resting order (skip it) |
| Market data? | best bid, best ask, depth by price, trade feed |
| Prices? | integer ticks (never floating point) |
| Concurrency? | the book is **single-threaded** (a sequencer/queue in front); many clients submit via a queue |
| Out of scope | multiple symbols, auctions, risk checks, persistence |

## Step 2: the order book

```text
BIDS (best = highest)                ASKS (best = lowest)
 price  queue (oldest → newest)       price  queue
 101    [B7:30] [B9:10]               102    [S3:20]
 100    [B2:50]                       103    [S5:15] [S8:40]
  99    [B4:25]                       105    [S1:60]

Incoming BUY LIMIT 103 qty 50:
  best ask 102 (S3:20)  ≤ 103 → trade 20 @ 102
  next ask 103 (S5:15)  ≤ 103 → trade 15 @ 103
  next ask 103 (S8:40)  ≤ 103 → trade 15 @ 103   (S8 left with 25)
  done: fully filled, nothing rests
```

## Step 3: entities

```viz algo=uml title="Matching engine"
class MatchingEngine
  + submit(o: OrderRequest): Result
  + cancel(id: long): bool
  + bestBid(): Price
  + bestAsk(): Price
class OrderBook
  - bids: map<Price, Level, greater>
  - asks: map<Price, Level, less>
  - index: unordered_map<long, Location>
  + match(incoming: Order): Trade[]
  + rest(o: Order): void
  + remove(id: long): bool
class Level
  - orders: list<Order>
  - totalQty: long
class Order
  - id: long
  - trader: int
  - side: Side
  - price: Price
  - qty: long
  - seq: long
class Trade
  - buyId: long
  - sellId: long
  - price: Price
  - qty: long
interface TradeListener
  + onTrade(t: Trade): void
interface TimeInForce
  + restAfterMatch(): bool
MatchingEngine *-- OrderBook
OrderBook *-- Level
Level *-- Order
MatchingEngine o-- TradeListener
OrderBook ..> Trade
MatchingEngine ..> TimeInForce
```

## Step 4: design decisions

- **`map<Price, Level>`** for each side with the right comparator, so `begin()` is the best price. Insert/erase of a level is O(log P) (P = number of price levels, small); operations at the best level are O(1).
- **`Level` = `std::list<Order>`**: FIFO queue; a list gives **stable iterators**, so the index can store `(side, price, iterator)` and cancel removes in O(1) without searching.
- **Order index** `unordered_map<id, Location>` for cancellation.
- **Matching loop**: while the incoming order has quantity and the opposite best price **crosses** (buy ≥ ask or sell ≤ bid) or the order is a market order: take orders from the front of the best level; `qty = min(incoming, resting)`; emit a trade at the **resting** order's price; remove or reduce the resting order; remove empty levels.
- **Self-trade prevention**: skip (leave untouched) a resting order of the same trader; simplest policy "cancel the incoming remainder" is also common.
- **Time-in-force as a small strategy/flag**: after matching, a GTC limit order rests; IOC and market orders do not.
- **Determinism and speed**: one thread owns the book; clients enqueue requests to a single sequencer. No locks in the hot path. Sequence numbers define time priority.
- **Events**: trades go to listeners (market data, clearing, audit) after each submit.

## Step 5: the code

```cpp run title="Limit order book with price-time priority"
#include <functional>
#include <iostream>
#include <list>
#include <map>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

using Price = long;                                          // integer ticks
enum class Side { Buy, Sell };
enum class Type { Limit, Market };
enum class TIF { GTC, IOC };

struct Order { long id; int trader; Side side; Price price; long qty; long seq; };
struct Trade { long buyId, sellId; Price price; long qty; };
using Level = list<Order>;

class OrderBook {
    map<Price, Level, greater<Price>> bids_;                  // best (highest) first
    map<Price, Level, less<Price>> asks_;                     // best (lowest) first
    struct Loc { Side side; Price price; Level::iterator it; };
    unordered_map<long, Loc> index_;

    template <typename Book> void restIn(Book& book, const Order& o) {
        Level& lvl = book[o.price];
        lvl.push_back(o);
        index_[o.id] = {o.side, o.price, prev(lvl.end())};
    }
    template <typename Book>
    void sweep(Book& opposite, Order& in, Type type, const function<bool(Price)>& crosses, vector<Trade>& trades) {
        for (auto levelIt = opposite.begin(); levelIt != opposite.end() && in.qty > 0;) {
            if (type == Type::Limit && !crosses(levelIt->first)) break;                           // prices no longer cross
            Level& lvl = levelIt->second;
            for (auto it = lvl.begin(); it != lvl.end() && in.qty > 0;) {
                if (it->trader == in.trader) { ++it; continue; }                                    // self-trade prevention: skip own orders
                long q = min(in.qty, it->qty);
                Trade t = in.side == Side::Buy ? Trade{in.id, it->id, levelIt->first, q} : Trade{it->id, in.id, levelIt->first, q};
                trades.push_back(t);                                                                 // trade at the RESTING order's price
                in.qty -= q; it->qty -= q;
                if (it->qty == 0) { index_.erase(it->id); it = lvl.erase(it); } else ++it;
            }
            if (lvl.empty()) levelIt = opposite.erase(levelIt); else ++levelIt;
        }
    }
public:
    vector<Trade> submit(Order in, Type type, TIF tif) {
        vector<Trade> trades;
        if (in.side == Side::Buy) sweep(asks_, in, type, [&](Price ask) { return in.price >= ask; }, trades);
        else                      sweep(bids_, in, type, [&](Price bid) { return in.price <= bid; }, trades);
        if (in.qty > 0 && type == Type::Limit && tif == TIF::GTC) { if (in.side == Side::Buy) restIn(bids_, in); else restIn(asks_, in); }     // the rest waits in the book
        return trades;                                                                                  // market/IOC remainder is dropped
    }
    bool cancel(long id) {
        auto it = index_.find(id);
        if (it == index_.end()) return false;
        Loc loc = it->second;
        auto erase = [&](auto& book) { auto& lvl = book[loc.price]; lvl.erase(loc.it); if (lvl.empty()) book.erase(loc.price); };
        if (loc.side == Side::Buy) erase(bids_); else erase(asks_);
        index_.erase(it);
        return true;
    }
    optional<Price> bestBid() const { return bids_.empty() ? nullopt : optional<Price>(bids_.begin()->first); }
    optional<Price> bestAsk() const { return asks_.empty() ? nullopt : optional<Price>(asks_.begin()->first); }
    void print() const {
        cout << "    ASKS (high to low):\n";
        for (auto it = asks_.rbegin(); it != asks_.rend(); ++it) { long total = 0; for (auto& o : it->second) total += o.qty; cout << "      " << it->first << "  qty " << total << "  (" << it->second.size() << " orders)\n"; }
        cout << "    ----- spread -----\n    BIDS (high to low):\n";
        for (auto& [p, lvl] : bids_) { long total = 0; for (auto& o : lvl) total += o.qty; cout << "      " << p << "  qty " << total << "  (" << lvl.size() << " orders)\n"; }
    }
};

struct TradeListener { virtual ~TradeListener() = default; virtual void onTrade(const Trade& t) = 0; };

class MatchingEngine {
    OrderBook book_; long nextId_ = 1, seq_ = 0; vector<TradeListener*> listeners_;
public:
    void listen(TradeListener* l) { listeners_.push_back(l); }
    long submit(int trader, Side side, Type type, Price price, long qty, TIF tif = TIF::GTC) {
        Order o{nextId_++, trader, side, price, qty, ++seq_};
        for (const Trade& t : book_.submit(o, type, tif)) for (auto* l : listeners_) l->onTrade(t);
        return o.id;
    }
    bool cancel(long id) { return book_.cancel(id); }
    const OrderBook& book() const { return book_; }
};

struct Tape : TradeListener {
    long volume = 0; int count = 0;
    void onTrade(const Trade& t) override { cout << "    TRADE: " << t.qty << " @ " << t.price << "  (buy #" << t.buyId << " / sell #" << t.sellId << ")\n"; volume += t.qty; ++count; }
};

int main() {
    MatchingEngine ex; Tape tape; ex.listen(&tape);
    cout << "build a book:\n";
    ex.submit(1, Side::Sell, Type::Limit, 102, 20);  ex.submit(2, Side::Sell, Type::Limit, 103, 15);  ex.submit(3, Side::Sell, Type::Limit, 103, 40);  ex.submit(4, Side::Sell, Type::Limit, 105, 60);
    ex.submit(5, Side::Buy, Type::Limit, 101, 30);   ex.submit(6, Side::Buy, Type::Limit, 101, 10);   ex.submit(7, Side::Buy, Type::Limit, 100, 50);
    ex.book().print();

    cout << "buy limit 103 x 50 (crosses three orders: price priority, then time priority at 103):\n";
    ex.submit(8, Side::Buy, Type::Limit, 103, 50);
    ex.book().print();

    cout << "sell market x 45 (takes the best bids; the remainder of a market order never rests):\n";
    ex.submit(9, Side::Sell, Type::Market, 0, 45);
    ex.book().print();

    cout << "IOC buy 105 x 100: fills what it can, the rest is cancelled instead of resting\n";
    ex.submit(10, Side::Buy, Type::Limit, 105, 100, TIF::IOC);
    cout << "  best ask now: " << (ex.book().bestAsk() ? to_string(*ex.book().bestAsk()) : "(none)") << ", best bid: " << (ex.book().bestBid() ? to_string(*ex.book().bestBid()) : "(none)") << "\n";

    cout << "cancel a resting order in O(1) via the index:\n";
    long mine = ex.submit(11, Side::Buy, Type::Limit, 99, 10);
    cout << "  cancel #" << mine << ": " << boolalpha << ex.cancel(mine) << ", cancel again: " << ex.cancel(mine) << "\n";

    cout << "self-trade prevention: trader 11 buys against their own resting sell:\n";
    ex.submit(11, Side::Sell, Type::Limit, 110, 5);
    ex.submit(11, Side::Buy, Type::Limit, 110, 5);
    ex.book().print();
    cout << "tape: " << tape.count << " trades, volume " << tape.volume << "\n";
}
```

## Why these data structures

| Need | Structure | Complexity |
|---|---|---|
| Best price on each side | `std::map` with comparator (or a heap of price levels) | O(1) at `begin()` |
| Time priority within a price | `std::list` (FIFO queue) | O(1) push back, pop front, erase by iterator |
| Cancel by id | `unordered_map<id, (side, price, iterator)>` | O(1) lookup + erase |
| Depth snapshot | iterate levels | O(levels) |
| Production latency | flat arrays indexed by price tick, intrusive lists, object pools | sub-microsecond |

## Edge cases

| Case | Handling |
|---|---|
| Market order with an empty opposite side | no trades; nothing rests; the order is rejected/cancelled |
| Order filled across many levels | loops through levels; each level removed when empty |
| Cancel after fill | `index_` no longer has the id: returns false |
| Equal prices, equal time | the `seq` makes order total; list order encodes it |
| Price not on the tick grid, zero or negative quantity | validate before matching (reject) |
| Self-trade policy | skip (as here), cancel newest, cancel oldest, or cancel both (configurable `SelfTradePolicy` strategy) |
| Order modification (change price) | cancel + new order (loses time priority); quantity decrease may keep priority |
| Large bursts | the sequencer queue provides back-pressure; the engine stays single-threaded |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Fill-or-kill, stop orders, iceberg orders" | order types as strategies on `TimeInForce`/`OrderType`; stops live in a separate trigger book |
| "Many symbols" | one engine instance per symbol, each on its own thread, routed by symbol hash |
| "Fees, risk checks (pre-trade)" | a chain of validators before `submit` (Chain of Responsibility) |
| "Auctions (opening/closing)" | an `AuctionMode` collecting orders and computing a single clearing price |
| "Persistence and recovery" | an event-sourced journal of accepted orders; replay rebuilds the book deterministically |
| "Market data feed" | publish book updates (deltas) with sequence numbers; snapshots on request |
| "High availability" | primary/backup engines consuming the same ordered input stream (deterministic replicas) |
| "Fairness and latency" | the input sequence is the only source of time priority; avoid wall clocks in matching |
| "Price improvement / pro-rata matching" | an alternative matching algorithm behind a `MatchingPolicy` interface |

```quiz
? At what price does a trade happen when an aggressive order crosses a resting order?
- The incoming order's price
+ The resting order's price (price improvement goes to the aggressor)
- The average of the two
> Standard exchange rule for continuous limit order books.
? Why is the matching engine usually single-threaded per symbol?
- C++ cannot do threads
+ Matching must be strictly ordered and deterministic; locks would add latency and complexity, so a sequencer feeds one thread
- Because maps are not thread-safe
> Parallelism comes from running many symbols in parallel.
```

:::keypoints
- Book = two price-ordered maps of FIFO levels (list), plus an id index for O(1) cancel; matching walks the best prices while they cross.
- Trade at the resting price; partial fills; market and IOC remainders do not rest; self-trade prevention is a policy.
- One thread per symbol fed by a sequencer; events and journals make it deterministic and recoverable.
:::
