---
title: Design an Order Matching Engine (stock exchange)
level: advanced
time: 75
summary: The heart of a stock exchange. Learn the order book, matching by best price and then by time, partial fills, cancelling an order quickly, preventing a trader from trading with themselves, and why matching runs on one thread.
---

:::problem Design an Order Matching Engine {level=hard tags="finance,data structures,priority,order book,Strategy,low latency"}
Design the core of a stock exchange for one symbol. Traders send **buy** and **sell** orders. A **limit** order has a price. A **market** order accepts any price. The engine matches a buy with a sell when the buy price is at least the sell price, using **price-time priority**: the best price first, and among equal prices the earliest order first. It records trades, supports cancelling, partial fills and immediate-or-cancel orders, and shares market data (best bid and ask).
:::

:::hint Hint
Keep two sides of the book: **bids** (buy orders) sorted from the highest price, and **asks** (sell orders) sorted from the lowest price. Each price has a **first-in-first-out queue** of orders. A new order walks along the other side from the best price while prices cross, making trades. If a limit order is not fully filled, the rest waits in the book. A map from id to location makes cancelling fast.
:::

## First, a few words

- **Bid**: an offer to buy at some price. **Ask**: an offer to sell at some price.
- **Best bid** = the highest buy price. **Best ask** = the lowest sell price. A trade happens when best bid ≥ best ask.
- **Resting order**: an order that is waiting in the book. **Aggressive (incoming) order**: the new order that triggers the match.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Orders? | `side` (Buy or Sell), `type` (Limit or Market), price (limit only), quantity, trader id. Time priority by arrival number |
| Matching rule? | price-time priority. The trade price is the price of the **resting** order |
| Partial fills? | yes. The rest of a limit order waits. The rest of a market order is cancelled |
| Time in force? | GTC (wait until cancelled) and IOC (fill what you can now, cancel the rest) |
| Cancel? | by order id, with a fast lookup |
| Self trade? | an order never trades against a waiting order of the same trader (skip it) |
| Market data? | best bid, best ask, depth by price, a feed of trades |
| Prices? | whole ticks as integers (never floating point) |
| Many threads? | the book is **single-threaded** (a sequencer queue in front). Many clients send requests through the queue |
| Not needed | many symbols, auctions, risk checks, saving to disk |

## Step 2: The order book

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`map<Price, Level>`** for each side with the right order, so `begin()` is the best price. Adding or removing a level is O(log P) (P = number of price levels, which is small). Work at the best level is O(1).
- **`Level` = `std::list<Order>`:** a first-in-first-out queue. A list has **stable iterators**, so the index can keep `(side, price, iterator)` and cancel removes the order in O(1) without searching.
- **Order index** `unordered_map<id, Location>` for cancelling.
- **The matching loop:** while the new order has quantity left, and the best price on the other side **crosses** (buy ≥ ask, or sell ≤ bid) or the order is a market order: take orders from the front of the best level. `qty = min(incoming, resting)`. Make a trade at the **resting** order's price. Remove or reduce the resting order. Remove empty levels.
- **Self-trade prevention:** skip a waiting order of the same trader (leave it untouched). Another simple rule is "cancel the rest of the new order".
- **Time in force** is a small flag or strategy: after matching, a GTC limit order waits. IOC and market orders do not.
- **Predictable and fast:** one thread owns the book. Clients put requests in one sequencer queue. No locks in the busy path. Sequence numbers decide time priority.
- **Events:** trades go to listeners (market data, clearing, audit) after each submit.

## Step 5: The code

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

| Need | Structure | Cost |
|---|---|---|
| The best price on each side | `std::map` with a comparator (or a heap of price levels) | O(1) at `begin()` |
| Time order inside one price | `std::list` (a FIFO queue) | O(1) to add at the back, take from the front, and erase by iterator |
| Cancel by id | `unordered_map<id, (side, price, iterator)>` | O(1) lookup and erase |
| A depth snapshot | go through the levels | O(levels) |
| Real exchanges (very low delay) | flat arrays indexed by price tick, intrusive lists, object pools | less than a microsecond |

## Edge cases

| Case | What happens |
|---|---|
| A market order when the other side is empty | no trades. Nothing waits. The order is refused or cancelled |
| An order filled across many levels | the loop goes through the levels. Each level is removed when empty |
| Cancelling after it was filled | `index_` no longer has the id, so it returns false |
| Same price, same time | the `seq` makes the order exact. The list order holds it |
| A price not on the tick grid, zero or negative quantity | checked before matching (refused) |
| Self-trade policy | skip (as here), cancel the newest, cancel the oldest, or cancel both (a `SelfTradePolicy` strategy) |
| Changing an order's price | cancel and make a new order (it loses its place in time). Lowering the quantity may keep its place |
| Big bursts of orders | the sequencer queue pushes back. The engine stays single-threaded |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Fill-or-kill, stop orders, iceberg orders" | order types as strategies on `TimeInForce` and `OrderType`. Stops live in a separate trigger book |
| "Many symbols" | one engine for each symbol, each on its own thread, chosen by a hash of the symbol |
| "Fees and risk checks before the trade" | a chain of checks before `submit` (Chain of Responsibility) |
| "Auctions (at open and close)" | an `AuctionMode` that collects orders and finds one price that clears |
| "Saving and recovery" | a journal of accepted orders (event sourcing). Replaying it rebuilds the book exactly |
| "A market data feed" | publish book updates (changes) with sequence numbers. A snapshot on request |
| "High availability" | a main and a backup engine that read the same ordered input (the same results) |
| "Fairness and delay" | the input sequence is the only source of time priority. Do not use wall clocks in matching |
| "Matching by share instead of by time" | another matching algorithm behind a `MatchingPolicy` interface |

## Short answer to say in an interview

:::interview How does an order matching engine work?
"I keep two maps of price levels: bids sorted from the highest price, asks from the lowest. Each level is a FIFO list of orders, which gives price-time priority. A new order walks the other side from the best price while the prices cross, makes trades at the resting order's price, and handles partial fills. A limit order that is not filled rests in the book, but market and IOC orders do not. An index from id to list iterator makes cancel O(1). The engine runs on one thread per symbol, fed by a sequencer, so it is exact and predictable."
:::

```quiz
? At what price does a trade happen when a new order crosses a resting order?
- The new order's price
+ The resting order's price (the new order may get a better price)
- The average of the two
> This is the standard rule for continuous limit order books.
? Why is the matching engine usually single-threaded for each symbol?
- C++ cannot do threads
+ Matching must be in strict order and exact. Locks would add delay and complexity, so a sequencer feeds one thread
- Maps are not thread-safe
> Speed comes from running many symbols in parallel.
```

:::keypoints
- The book = two price-ordered maps of FIFO levels (lists) and an id index for O(1) cancel. Matching walks the best prices while they cross.
- The trade is at the resting price. Partial fills happen. Market and IOC remainders do not wait. Self-trade prevention is a policy.
- One thread for each symbol, fed by a sequencer. Events and journals make it exact and recoverable.
:::
