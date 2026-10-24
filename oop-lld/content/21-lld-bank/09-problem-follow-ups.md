---
title: "LLD interview: follow-up questions for each problem"
level: hard
time: 45
summary: The question interviewers ask after your first design of a classic LLD problem, with a simple answer: parking lot, elevator, vending machine, ATM, library, tic-tac-toe, chess, splitwise, LRU cache, rate limiter and more.
---

Each question links to the full problem. Use this page to revise after you have solved the problems once. The map of all problems is in the [problem index](#/l/problem-index).

Each answer is short. The link takes you to the full walkthrough.

:::qa Parking lot: how do you add a new vehicle type or a new pricing scheme without changing existing code? {level=medium}
**Say this:** "Pricing is a Strategy (`PricingPolicy`: hourly, flat, peak). Spot choosing is another Strategy. A new vehicle type is a new enum value or class."

See [Parking lot](#/l/parking-lot).
:::

:::qa Parking lot: how do two cars not get the same slot at the same time? {level=medium}
**Say this:** "Finding a free slot and marking it taken is one step, under a lock for each floor (or a compare-and-swap on the slot)."

Give the ticket only after the slot is reserved.
:::

:::qa Elevator: how do you choose which elevator serves a call? {level=hard}
**Say this:** "A dispatch Strategy with a cost: nearest lift, plus a bonus if it is already moving that way. Each lift keeps sorted stops and uses SCAN."

See [Elevator system](#/l/elevator-system).
:::

:::qa Elevator: how do you model the elevator's behaviour? {level=medium}
**Say this:** "As a state machine: `Idle`, `MovingUp`, `MovingDown`, `DoorsOpen`, `Maintenance`."

Events are: a request, arrival, a door timer, an emergency.
:::

:::qa Vending machine: how do you prevent wrong actions in the wrong state? {level=easy}
**Say this:** "The State pattern. Each state class allows only the actions that make sense and refuses the rest with a message."

See [Vending machine](#/l/vending-machine).
:::

:::qa Vending machine: how do you give change with limited coins? {level=hard}
**Say this:** "Keep a coin store. Work out the change with a greedy method (or dynamic programming). If exact change is not possible, refuse the sale before dispensing."
:::

:::qa ATM: how do you add new transaction types, and how do you give cash in notes? {level=medium}
**Say this:** "Transactions are Commands. Notes are a Chain of Responsibility (500, then 200, then 100). The session is a State machine."

See [ATM](#/l/atm).
:::

:::qa Library system: how do you handle reservations, fines and notifications? {level=medium}
**Say this:** "A waiting line for each book, a Strategy for fines, and Observer to tell the next member when a copy comes back. Keep `Book` and `BookCopy` separate."

See [Library management](#/l/library-management).
:::

:::qa Tic-tac-toe: how do you check for a winner in O(1) per move, and extend to N x N or K in a row? {level=medium}
**Say this:** "Keep counters for each row, column and both diagonals. A line wins when a counter reaches N. For K in a row, scan from the last move in four directions."

See [Tic-tac-toe](#/l/tic-tac-toe).
:::

:::qa Snake and ladder: how do you make dice and board rules easy to change? {level=easy}
**Say this:** "Dice is an interface. Jumps are a map from start to end. Rules like exact finish are small options."

See [Snake and ladder](#/l/snake-and-ladder).
:::

:::qa Chess: how do you model piece moves and check for check and checkmate? {level=hard}
**Say this:** "Each piece makes its possible moves. The game keeps only the moves that do not leave its own king attacked (apply, test, undo). No legal moves means checkmate if in check, otherwise stalemate."

See [Chess](#/l/chess).
:::

:::qa Splitwise: how do you reduce debts, and keep amounts exact? {level=hard}
**Say this:** "Money in paise. Give the leftover paise to the first few people. Work out each person's net balance and match the biggest creditor with the biggest debtor."

See [Splitwise](#/l/splitwise).
:::

:::qa LRU cache: what data structures give O(1) get and put? {level=easy}
**Say this:** "A hash map from key to a node, plus a doubly linked list ordered by recent use."

On use, move the node to the front. When full, remove from the back. See [LRU and LFU caches](#/l/lru-lfu-cache).
:::

:::qa Rate limiter: compare fixed window, sliding window and token bucket. {level=medium}
**Say this:** "Fixed window is simple but can let double the rate through at the boundary. Sliding window is exact but uses more memory. Token bucket allows controlled bursts and is cheap."

See [Rate limiter](#/l/rate-limiter).
:::

:::qa Logger: how do you add new outputs and levels, and avoid blocking the app? {level=medium}
**Say this:** "Appenders behind an interface, a level filter, a formatter Strategy, and a background queue with a worker thread so callers never wait for the disk."

See [Logging framework](#/l/logger-framework).
:::

:::qa Notification service: how do you make delivery reliable? {level=hard}
**Say this:** "Save the notification first, retry with longer waits, use an idempotency key to avoid repeats, and put permanent failures in a dead-letter queue."

See [Notification service](#/l/notification-service).
:::

:::qa Movie booking: how do you hold seats while the user pays? {level=hard}
**Say this:** "A seat goes `AVAILABLE`, then `HELD` (until a time), then `BOOKED`. The hold expires using a clock, checked when the seat is next looked at."

See [Movie ticket booking](#/l/movie-ticket-booking).
:::

:::qa Hotel reservation: how do you check availability for date ranges? {level=hard}
**Say this:** "A stay is `[check-in, check-out)`. A room is free if no booking overlaps: `a.start < b.end && b.start < a.end`."

See [Hotel reservation](#/l/hotel-reservation).
:::

:::qa Ride-sharing: how do you match riders to drivers and compute fares? {level=medium}
**Say this:** "A Matching Strategy (nearest free driver), a Pricing Strategy (base, distance, time, surge), the trip as State, and Observer for messages."

See [Ride-sharing](#/l/ride-sharing).
:::

:::qa Food delivery: what is the order life cycle and who is notified? {level=medium}
**Say this:** "`Placed, Accepted, Preparing, ReadyForPickup, OutForDelivery, Delivered` or `Cancelled`, as a state machine. The customer, restaurant and delivery partner listen."

See [Food delivery](#/l/food-delivery).
:::

:::qa File system: how do you support paths, ls, mkdir, find? {level=medium}
**Say this:** "A Composite tree of directories and files. One function resolves a path. Jobs like find use a visitor or recursion."

See [In-memory file system](#/l/in-memory-file-system).
:::

:::qa Stack Overflow: how do you model votes, reputation and tags? {level=medium}
**Say this:** "Posts keep votes by user. Reputation is a listener on events. A tag index finds questions by tag."

See [Q&A platform](#/l/stack-overflow).
:::

:::qa News feed: pull vs push (fan-out) model? {level=hard}
**Say this:** "Push copies a post to followers when posted (fast reads, heavy for celebrities). Pull collects posts when reading (cheap writes, slower reads). Use a mix."

See [News feed](#/l/social-feed).
:::

:::qa Pub/sub broker: delivery guarantees and ordering? {level=hard}
**Say this:** "A log for each topic with an offset for each consumer group gives order. Acknowledgements and retries give at-least-once. Exactly-once needs safe-to-repeat consumers."

See [Pub/sub broker](#/l/pub-sub-broker).
:::

:::qa Task scheduler: how do you run tasks at a time with priorities and retries? {level=medium}
**Say this:** "A min-heap by due time, a worker pool, and a condition variable that waits until the earliest time. Tasks are Commands, and the clock is passed in."

See [Task scheduler](#/l/task-scheduler).
:::

:::qa Auction: how do you handle two bids arriving at the same time? {level=hard}
**Say this:** "Handle bids one at a time for each item under that item's lock. Accept only if higher than the current price plus the step and the auction is open."

See [Online auction](#/l/online-auction).
:::

:::qa Chat app: how do you deliver messages to offline users? {level=medium}
**Say this:** "Keep a pending queue for each user. Send it in order when they come online. Groups go through a Mediator that sends to each member."

See [Chat app](#/l/chat-app).
:::

:::qa Text editor: how do you implement undo/redo efficiently? {level=hard}
**Say this:** "A Command for each edit, with an undo stack and a redo stack. Join typed letters into one command. Use a gap buffer or rope for big text."

See [Text editor](#/l/text-editor).
:::

:::qa Spreadsheet: how do you recompute dependent cells and detect cycles? {level=hard}
**Say this:** "Cells form a DAG. On change, recalculate the dependents once in topological order. A loop is a cycle, found when a cell cannot be ordered."

See [Spreadsheet](#/l/spreadsheet).
:::

:::qa Key-value store with transactions: how do you support rollback? {level=hard}
**Say this:** "A stack of overlay maps. Writes go to the top overlay. Rollback drops it. Commit joins it into the layer below. Reads look from the top down."

See [KV store with transactions](#/l/kv-store-transactions).
:::

:::qa Order matching engine: data structures for the book? {level=hard}
**Say this:** "Bids and asks as maps of price to a FIFO list. Match while best bid is at least best ask. An id index makes cancel O(1)."

See [Order matching engine](#/l/order-matching-engine).
:::

:::qa Payment gateway: how do you avoid double charging and handle failures? {level=hard}
**Say this:** "Idempotency keys, a payment state machine, retries with a circuit breaker, a double-entry ledger, and events for the merchant."

See [Payment gateway](#/l/payment-gateway).
:::

:::qa Calendar: how do you detect conflicts and handle recurrence? {level=hard}
**Say this:** "Keep events sorted and check the overlap with neighbours. Store repeats as a rule and make occurrences when asked."

See [Calendar scheduler](#/l/calendar-scheduler).
:::

:::qa Typeahead: how do you rank suggestions fast? {level=hard}
**Say this:** "A trie where each node saves its top-k suggestions. Updates refresh the path."

See [Typeahead](#/l/typeahead).
:::

:::qa Cron scheduler: how do you find the next run time? {level=hard}
**Say this:** "Read the five fields into sets. Start at the next minute and jump field by field until all match. Keep jobs in a min-heap by next run."

See [Cron job scheduler](#/l/job-scheduler-cron).
:::

:::qa Workflow engine: how do you run independent tasks in parallel and handle failure? {level=hard}
**Say this:** "Count each task's unfinished dependencies. Run ready tasks on a pool. On failure, mark dependents skipped."

See [Workflow engine](#/l/workflow-engine).
:::

:::qa Mini git: why are commits identified by hashes? {level=hard}
**Say this:** "The id is the hash of the content and parents, so the same content is stored once and history cannot be changed without changing ids."

See [Mini git](#/l/mini-git).
:::

:::qa Web crawler: how do you avoid fetching duplicates and overloading a host? {level=hard}
**Say this:** "Clean the URLs and keep a visited set updated in the same step as queueing. A politeness gate for each host, robots rules, and a depth limit. Stop when queued plus in-progress is zero."

See [Web crawler](#/l/web-crawler).
:::

:::qa Rule engine: how do you avoid infinite loops and conflicting rules? {level=hard}
**Say this:** "Each rule fires at most once per run, priorities decide clashes, there is a global firing limit, and I record fired rules for an explanation."

See [Rule engine](#/l/rule-engine).
:::

```quiz
? A parking lot must charge differently on weekends without editing existing classes. What do you add?
- A new if in the ticket class
+ A new PricingPolicy class chosen by configuration
- A subclass of ParkingLot
> Strategy keeps the ticket service closed to edits.
```

:::keypoints
- For every classic problem remember: the **key data structure**, the **pattern**, the **thread danger**, and the **extension** an interviewer will ask.
- Follow the links to the worked problems for the full code.
:::
