---
title: "LLD interview: follow-up questions for each problem"
level: hard
time: 45
summary: The question interviewers ask after your first design of a classic LLD problem, with the design answer: parking lot, elevator, vending machine, ATM, library, tic-tac-toe, chess, splitwise, LRU cache, rate limiter, notification service and more.
---

Each question links to the full worked problem. Use these as a quick revision after you have solved the problems once. For the all-problems map see the [problem index](#/l/problem-index).

:::qa Parking lot: how do you add a new vehicle type or a new pricing scheme without changing existing code? {level=medium}
Vehicle types via an enum or a `Vehicle` hierarchy that reports its required slot type; **pricing as a Strategy** (`PricingPolicy`: hourly, flat, peak) injected into the ticket service. A slot-allocation Strategy (`NearestEntry`, `LowestFloor`) finds the slot. See [Parking lot](#/l/parking-lot).
:::

:::qa Parking lot: how do two cars not get the same slot concurrently? {level=medium}
The "find a free slot and mark it taken" step must be atomic: a mutex per floor (or per lot) around allocation, or a per-slot state with compare-and-swap. Return the ticket only after the slot is reserved.
:::

:::qa Elevator: how do you choose which elevator serves a call? {level=hard}
A **dispatch Strategy**: nearest idle car, or the car already moving toward the call in the same direction, scored by distance and load. Each car keeps sorted stop sets for up and down (SCAN/LOOK scheduling). See [Elevator system](#/l/elevator-system).
:::

:::qa Elevator: how do you model the elevator's behaviour? {level=medium}
A **State machine**: `Idle`, `MovingUp`, `MovingDown`, `DoorsOpen`, `Maintenance`. Events: request, arrival, door timer, emergency. Each state decides the next action.
:::

:::qa Vending machine: how do you prevent illegal operations in the wrong state? {level=easy}
The **State** pattern: each state class implements only the operations that make sense and rejects the rest ("insert money first"). The transitions are explicit and testable. See [Vending machine](#/l/vending-machine).
:::

:::qa Vending machine: how do you give change with limited coins? {level=hard}
Keep a coin inventory; compute change with a greedy algorithm (works for canonical coin systems) or dynamic programming; if exact change cannot be made, refuse the sale before dispensing and refund.
:::

:::qa ATM: how do you add new transaction types, and how do you dispense cash in notes? {level=medium}
Transactions as **Command** objects (withdraw, deposit, balance, transfer) executed under an authenticated session; cash via a **Chain of Responsibility** of note handlers (500 → 200 → 100). State machine for the card/PIN/session flow. See [ATM](#/l/atm).
:::

:::qa Library system: how do you handle reservations, fines and notifications? {level=medium}
Reservation queue per book (FIFO); a **Strategy** for fine calculation; **Observer** to notify the next member when a copy returns. Separate `Book` (title) from `BookCopy` (physical item). See [Library management](#/l/library-management).
:::

:::qa Tic-tac-toe: how do you check for a winner in O(1) per move, and extend to N x N or K in a row? {level=medium}
Keep counters per row, column and the two diagonals (+1 for X, -1 for O; a line wins at ±N). For K-in-a-row, scan from the last move in four directions. Players as strategy (human, bot) and the board size as a parameter. See [Tic-tac-toe](#/l/tic-tac-toe).
:::

:::qa Snake and ladder: how do you make dice and board rules configurable? {level=easy}
Dice as a `Dice` interface (one or two dice, fixed for tests); board jumps as a map from start to end; rules (exact finish, extra turn on six) as small strategies. See [Snake and ladder](#/l/snake-and-ladder).
:::

:::qa Chess: how do you model piece moves and validate check/checkmate? {level=hard}
A `Piece` hierarchy with `possibleMoves(board)`; the `Game` filters moves that leave the own king in check; checkmate = in check and no legal move; stalemate = not in check and no legal move. Special moves (castling, en passant, promotion) as extra move generators; **Command** for undo. See [Chess](#/l/chess).
:::

:::qa Splitwise: how do you simplify debts, and keep amounts exact? {level=hard}
Store money as integer paise; split strategies (equal, exact, percentage) with remainder distribution; compute each person's net balance and match largest creditor with largest debtor (heap) to minimise transactions. See [Splitwise](#/l/splitwise).
:::

:::qa LRU cache: what data structures give O(1) get and put? {level=easy}
A hash map from key to list iterator plus a doubly linked list ordered by recency: on access move the node to the front; on overflow evict from the back. For LFU add frequency buckets. See [LRU and LFU caches](#/l/lru-lfu-cache).
:::

:::qa Rate limiter: compare fixed window, sliding window and token bucket. {level=medium}
Fixed window is simple but allows a burst of twice the limit at the boundary. Sliding window (log or counter blend) is accurate but costs more memory. **Token bucket** allows controlled bursts and is cheap (tokens + last refill time). Choose the algorithm by a Strategy. See [Rate limiter](#/l/rate-limiter).
:::

:::qa Logger: how do you add new outputs and levels, and avoid blocking the app? {level=medium}
Appenders (console, file, network) behind an interface, a level filter, formatter strategy; an **asynchronous** queue with a background thread so callers never wait on I/O; flush on shutdown. See [Logging framework](#/l/logger-framework).
:::

:::qa Notification service: how do you make delivery reliable? {level=hard}
Persist the notification before sending, retry with exponential backoff and a maximum, an idempotency key to avoid duplicates, a dead-letter queue for permanent failures, per-channel rate limits and user preferences. See [Notification service](#/l/notification-service).
:::

:::qa Movie booking: how do you hold seats while the user pays? {level=hard}
A seat state `AVAILABLE → HELD(until t) → BOOKED`; the hold has an expiry (injectable clock); confirm only if the hold is still valid for that user; a sweeper or lazy check releases expired holds. See [Movie ticket booking](#/l/movie-ticket-booking).
:::

:::qa Hotel reservation: how do you check availability for date ranges? {level=hard}
Model a stay as a half-open range [check-in, check-out). A room is available if no existing booking overlaps (`a.start < b.end && b.start < a.end`). Use a sorted interval structure per room for fast checks. See [Hotel reservation](#/l/hotel-reservation).
:::

:::qa Ride-sharing: how do you match riders to drivers and compute fares? {level=medium}
A **Matching Strategy** (nearest available driver, with a spatial index such as a grid); **Pricing Strategy** (base + distance + time, surge multiplier); trip lifecycle as State; notifications via Observer. See [Ride-sharing](#/l/ride-sharing).
:::

:::qa Food delivery: what is the order lifecycle and who is notified? {level=medium}
`Placed → Accepted → Preparing → ReadyForPickup → OutForDelivery → Delivered/Cancelled` as a State machine; customers, restaurant and delivery partners observe transitions. Cancellation rules depend on the state. See [Food delivery](#/l/food-delivery).
:::

:::qa File system: how do you support paths, `ls`, `mkdir`, `find`? {level=medium}
**Composite** tree of `Directory` and `File` nodes; path resolution by splitting on `/`; operations as visitors or recursive methods; permissions and symbolic links as extensions. See [In-memory file system](#/l/in-memory-file-system).
:::

:::qa Stack Overflow: how do you model votes, reputation and tags? {level=medium}
`Question`, `Answer`, `Comment`, `User`, `Tag`; votes as events that update reputation through rules (Strategy); **Observer** for notifications; search via inverted index on tags and words. See [Q&A platform](#/l/stack-overflow).
:::

:::qa News feed: pull vs push (fan-out) model? {level=hard}
Fan-out on **write** (push): update followers' feeds when a post is made (fast reads, heavy for celebrities). Fan-out on **read** (pull): merge followees' posts at read time (cheap writes, slower reads). Hybrid: push for normal users, pull for celebrities. See [News feed](#/l/social-feed).
:::

:::qa Pub/sub broker: delivery guarantees and ordering? {level=hard}
Per-topic queues with consumer offsets give ordered delivery per partition; at-least-once needs acknowledgements and redelivery; exactly-once needs idempotent consumers. Back-pressure via bounded queues. See [Pub/sub broker](#/l/pub-sub-broker).
:::

:::qa Task scheduler: how do you run tasks at a time with priorities and retries? {level=medium}
A min-heap ordered by (run time, priority), a worker pool, and a condition variable that waits until the earliest time; tasks as **Command**; retry policy as Strategy; injectable clock for tests. See [Task scheduler](#/l/task-scheduler).
:::

:::qa Auction: how do you handle two bids arriving at the same time? {level=hard}
Serialise bids per item under that item's lock; accept only if higher than the current price plus increment and the auction is open; tie-break by arrival order. Close the auction by a timer using the clock. See [Online auction](#/l/online-auction).
:::

:::qa Chat app: how do you deliver messages to offline users? {level=medium}
Store messages per conversation with status (sent, delivered, read); an offline inbox queue delivered on reconnect; presence via heartbeat; group chats through a `Mediator` that fans out. See [Chat app](#/l/chat-app).
:::

:::qa Text editor: how do you implement undo/redo efficiently? {level=hard}
**Command** per edit with inverse operations (insert/delete ranges), an undo stack and redo stack; merge consecutive typing into one command; a gap buffer or rope for text storage. See [Text editor](#/l/text-editor).
:::

:::qa Spreadsheet: how do you recompute dependent cells and detect cycles? {level=hard}
Cells form a dependency **DAG**: on change, mark dependents dirty and recompute in topological order; detect cycles with DFS (or Kahn's algorithm) when a formula is set and reject it. See [Spreadsheet](#/l/spreadsheet).
:::

:::qa Key-value store with transactions: how do you support rollback? {level=hard}
A stack of transaction layers: writes go to the top layer's map; `commit` merges into the parent, `rollback` discards. Reads search layers top-down. TTL with a lazy expiry check or a min-heap sweeper. See [KV store with transactions](#/l/kv-store-transactions).
:::

:::qa Order matching engine: data structures for the book? {level=hard}
Bids and asks as price levels (`map<price, deque<Order>>`) for price-time priority; match while best bid ≥ best ask; partial fills; cancel via an id index. See [Order matching engine](#/l/order-matching-engine).
:::

:::qa Payment gateway: how do you avoid double charging and handle failures? {level=hard}
Idempotency keys, a payment state machine (`CREATED → AUTHORISED → CAPTURED → REFUNDED`), retries with a circuit breaker, a ledger with double-entry records, and webhooks for asynchronous results. See [Payment gateway](#/l/payment-gateway).
:::

:::qa Calendar: how do you detect conflicts and handle recurrence? {level=hard}
Keep each user's events in a sorted structure and check overlap on the interval; represent recurrence as a rule (RRULE-like) and expand occurrences lazily within a window; exceptions as overrides. See [Calendar scheduler](#/l/calendar-scheduler).
:::

:::qa Typeahead: how do you rank suggestions fast? {level=hard}
A **trie** where each node caches its top-k suggestions (by frequency/recency); updates propagate to ancestors; periodic rebuild from logs. See [Typeahead](#/l/typeahead).
:::

:::qa Cron scheduler: how do you find the next run time? {level=hard}
Parse the five fields into sets; starting from now+1 minute, advance field by field until all match; keep a min-heap of next-run times; define policies for missed runs after downtime. See [Cron job scheduler](#/l/job-scheduler-cron).
:::

:::qa Workflow engine: how do you run independent tasks in parallel and handle failure? {level=hard}
Topologically sort the DAG; run tasks whose dependencies are done on a thread pool; on failure, mark dependents skipped (or retry per policy). See [Workflow engine](#/l/workflow-engine).
:::

:::qa Mini git: why are commits identified by hashes? {level=hard}
Content addressing: the id is the hash of content + parents, so identical content is stored once and history cannot be altered without changing ids (a Merkle DAG). See [Mini git](#/l/mini-git).
:::

:::qa Web crawler: how do you avoid fetching duplicates and overloading a host? {level=hard}
Normalise URLs and keep a visited set updated atomically with enqueue; per-host politeness gate; robots rules; depth limit. Termination: queued + in-flight = 0. See [Web crawler](#/l/web-crawler).
:::

:::qa Rule engine: how do you avoid infinite loops and conflicting rules? {level=hard}
Refraction (each rule fires once per run), salience for conflict resolution, a global firing limit, and explanations of fired rules for audit. See [Rule engine](#/l/rule-engine).
:::

```quiz
? A parking lot must charge differently on weekends without editing existing classes. What do you add?
- A new `if` in the ticket class
+ A new PricingPolicy implementation chosen by configuration
- A subclass of ParkingLot
> Strategy keeps the ticket service closed to modification.
```

:::keypoints
- For every classic problem remember: the **key data structure**, the **pattern**, the **concurrency hazard**, and the **extension** an interviewer will ask.
- Follow the links to the worked problems for the full code.
:::
