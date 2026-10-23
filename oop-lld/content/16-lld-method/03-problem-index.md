---
title: Problem index: all 43 LLD problems by level and by topic
level: intermediate
time: 15
summary: A map of every worked LLD problem: the three levels with what each one trains, the problems grouped by topic (games, booking, state machines, caches, schedulers, finance and more), the patterns each one practises, and a suggested order for 2, 4 and 8 weeks.
---

Use this page as your table of contents for Part III. There are **43 problems**. Each lesson has the requirements, the class diagram, the design decisions, complete runnable C++ with real output, edge cases and the follow-up questions an interviewer asks next.

:::note How to use a problem lesson
1. Read only the problem card. Close the lesson.
2. Spend 30 minutes on paper: requirements, classes, diagram, key methods.
3. Open the lesson and compare. Note what you missed.
4. Re-type the core classes from memory the next day.
5. Tick the problem off in the tracker (`Problems` in the top bar).
:::

## By level


### Basic (14 problems)

Few entities, one clear rule set. These train the habit: **clarify, list nouns, draw, code**. Most first-round machine-coding questions look like these. Aim to finish any of them in 45 minutes.

| # | Problem | What it practises |
|---|---|---|
| 1 | [Tic-Tac-Toe](#/l/tic-tac-toe) | games, 2D board, strategy, beginner |
| 2 | [Snake and Ladder](#/l/snake-and-ladder) | games, simulation, strategy, randomness |
| 3 | [a Vending Machine](#/l/vending-machine) | state machine, State pattern, inventory, money |
| 4 | [a Traffic Signal Controller](#/l/traffic-signal) | state machine, timing, simulation, safety |
| 5 | [a Parking Lot](#/l/parking-lot) | classic, Strategy, concurrency, booking, most asked |
| 6 | [a Library Management System](#/l/library-management) | classic, reservations, Observer, Specification, Strategy |
| 7 | [an ATM](#/l/atm) | state machine, State pattern, Chain of Responsibility, banking |
| 8 | [a Coffee Machine](#/l/coffee-machine) | Template Method, Factory, Decorator, inventory, Observer |
| 9 | [a Logging Framework](#/l/logger-framework) | Chain of Responsibility, Strategy, concurrency, infrastructure |
| 10 | [a Shopping Cart with pricing rules](#/l/shopping-cart) | e-commerce, Strategy, pricing, money, chain of rules |
| 11 | [Blackjack](#/l/blackjack) | games, cards, Strategy, state, simulation |
| 12 | [a Bank Account System](#/l/bank-accounts) | banking, concurrency, transfer, Strategy, State, money |
| 13 | [a URL Shortener (class level)](#/l/url-shortener) | classic, encoding, repository, expiry, counters |
| 14 | [an Expression Calculator](#/l/expression-calculator) | parsing, Composite, Interpreter, Visitor, error handling |

### Intermediate (16 problems)

More entities, a lifecycle or an algorithm in the middle, and **concurrency or time** to worry about. Typical for second-round and senior interviews. Aim for a clean design in 60 minutes.

| # | Problem | What it practises |
|---|---|---|
| 1 | [an Elevator System](#/l/elevator-system) | State, Strategy, scheduling, simulation, classic |
| 2 | [a Movie Ticket Booking System](#/l/movie-ticket-booking) | booking, concurrency, seat locking, state, BookMyShow |
| 3 | [Splitwise (expense sharing)](#/l/splitwise) | finance, Strategy, graph, money, algorithm |
| 4 | [a Hotel Reservation System](#/l/hotel-reservation) | booking, date ranges, Strategy, concurrency, pricing |
| 5 | [a Food Delivery App](#/l/food-delivery) | State, Strategy, Observer, e-commerce, Swiggy, order lifecycle |
| 6 | [a Ride-Sharing Service](#/l/ride-sharing) | State, Strategy, matching, pricing, geo, Observer |
| 7 | [LRU and LFU Caches (generic, thread-safe)](#/l/lru-lfu-cache) | caching, data structures, Strategy, generic, thread-safe, classic |
| 8 | [a Rate Limiter](#/l/rate-limiter) | Strategy, algorithms, concurrency, time, API gateway |
| 9 | [a Notification Service](#/l/notification-service) | Strategy, Chain of Responsibility, async, retry, Observer, infrastructure |
| 10 | [an In-Memory File System](#/l/in-memory-file-system) | Composite, tree, paths, Visitor, commands |
| 11 | [a Q&A Platform (Stack Overflow)](#/l/stack-overflow) | domain modelling, Observer, reputation, search, voting |
| 12 | [a Social Media News Feed](#/l/social-feed) | feed, fan-out, Strategy, Observer, pagination, graph |
| 13 | [an In-Memory Pub/Sub Message Broker](#/l/pub-sub-broker) | messaging, Observer, concurrency, queues, Kafka-like |
| 14 | [a Task Scheduler](#/l/task-scheduler) | Command, priority queue, timers, concurrency, scheduling, cron-like |
| 15 | [an Online Auction System](#/l/online-auction) | State, Strategy, Observer, concurrency, time, marketplace |
| 16 | [a Chat Application (WhatsApp-like)](#/l/chat-app) | Mediator, Observer, messaging, presence, state, groups |

### Advanced (13 problems)

A real algorithm or data structure sits at the core (graphs, tries, intervals, order books, DAGs), plus transactions, undo or extensibility questions. Expect these for senior and staff roles, or as deep follow-ups.

| # | Problem | What it practises |
|---|---|---|
| 1 | [Chess](#/l/chess) | games, polymorphism, Command, undo, rules engine, classic |
| 2 | [a Text Editor with Undo/Redo](#/l/text-editor) | Command, Memento, undo, Composite, document model, Observer |
| 3 | [a Spreadsheet](#/l/spreadsheet) | graph, DAG, Interpreter, Observer, parsing, dependency tracking |
| 4 | [an In-Memory Key-Value Store with TTL and Transactions](#/l/kv-store-transactions) | storage, transactions, TTL, undo log, WAL, concurrency, Command |
| 5 | [an Order Matching Engine (stock exchange)](#/l/order-matching-engine) | finance, data structures, priority, order book, Strategy, low latency |
| 6 | [a Payment Gateway](#/l/payment-gateway) | payments, State, Strategy, idempotency, circuit breaker, ledger, Chain of Responsibility |
| 7 | [a Calendar and Meeting Scheduler](#/l/calendar-scheduler) | intervals, algorithms, recurrence, Strategy, Observer, booking |
| 8 | [Search Autocomplete (Typeahead)](#/l/typeahead) | trie, data structures, ranking, top-k, Strategy, concurrency |
| 9 | [a Cron-Style Job Scheduler](#/l/job-scheduler-cron) | scheduling, cron, Strategy, time, retries, distributed locks |
| 10 | [a Workflow Engine (DAG executor)](#/l/workflow-engine) | DAG, topological sort, concurrency, thread pool, Command, State |
| 11 | [a Mini Git (version control)](#/l/mini-git) | version control, DAG, hashing, immutability, merge, Composite, Memento |
| 12 | [a Web Crawler](#/l/web-crawler) | concurrency, BFS, rate limiting, pipeline, Strategy, distributed |
| 13 | [a Rule Engine](#/l/rule-engine) | Specification, Interpreter, Strategy, forward chaining, DSL, business rules |

## By topic

The same problems, regrouped. Pick a topic to drill when an interview is close.


### Games and simulations

Board and rules modelling, turn handling, strategy for players or dice, validation of moves.

| Problem | Level |
|---|---|
| [Tic-Tac-Toe](#/l/tic-tac-toe) | Basic |
| [Snake and Ladder](#/l/snake-and-ladder) | Basic |
| [Blackjack](#/l/blackjack) | Basic |
| [Chess](#/l/chess) | Advanced |
| [a Traffic Signal Controller](#/l/traffic-signal) | Basic |

### State machines and lifecycles

The State pattern, legal transitions, what happens on an illegal event.

| Problem | Level |
|---|---|
| [a Vending Machine](#/l/vending-machine) | Basic |
| [an ATM](#/l/atm) | Basic |
| [a Traffic Signal Controller](#/l/traffic-signal) | Basic |
| [an Elevator System](#/l/elevator-system) | Intermediate |
| [a Food Delivery App](#/l/food-delivery) | Intermediate |
| [a Ride-Sharing Service](#/l/ride-sharing) | Intermediate |
| [an Online Auction System](#/l/online-auction) | Intermediate |
| [a Payment Gateway](#/l/payment-gateway) | Advanced |

### Booking and reservations (concurrency + time ranges)

Double-booking prevention, locking, date-range overlap, cancellation and expiry.

| Problem | Level |
|---|---|
| [a Parking Lot](#/l/parking-lot) | Basic |
| [a Movie Ticket Booking System](#/l/movie-ticket-booking) | Intermediate |
| [a Hotel Reservation System](#/l/hotel-reservation) | Intermediate |
| [a Library Management System](#/l/library-management) | Basic |
| [a Calendar and Meeting Scheduler](#/l/calendar-scheduler) | Advanced |

### Money and finance

Integer money, atomic transfers, ledgers, idempotency, rounding.

| Problem | Level |
|---|---|
| [a Bank Account System](#/l/bank-accounts) | Basic |
| [Splitwise (expense sharing)](#/l/splitwise) | Intermediate |
| [a Shopping Cart with pricing rules](#/l/shopping-cart) | Basic |
| [a Payment Gateway](#/l/payment-gateway) | Advanced |
| [an Order Matching Engine (stock exchange)](#/l/order-matching-engine) | Advanced |

### Caches, stores and data structures

Choosing the right containers, O(1) operations, eviction, TTL, undo logs.

| Problem | Level |
|---|---|
| [LRU and LFU Caches (generic, thread-safe)](#/l/lru-lfu-cache) | Intermediate |
| [an In-Memory Key-Value Store with TTL and Transactions](#/l/kv-store-transactions) | Advanced |
| [Search Autocomplete (Typeahead)](#/l/typeahead) | Advanced |
| [a URL Shortener (class level)](#/l/url-shortener) | Basic |
| [an In-Memory File System](#/l/in-memory-file-system) | Intermediate |

### Schedulers and timers

Priority queues, injectable clocks, retries, dependencies, worker threads.

| Problem | Level |
|---|---|
| [a Task Scheduler](#/l/task-scheduler) | Intermediate |
| [a Cron-Style Job Scheduler](#/l/job-scheduler-cron) | Advanced |
| [a Workflow Engine (DAG executor)](#/l/workflow-engine) | Advanced |
| [a Rate Limiter](#/l/rate-limiter) | Intermediate |
| [an Elevator System](#/l/elevator-system) | Intermediate |

### Messaging and notifications

Observer, Mediator, fan-out, delivery guarantees, back-pressure.

| Problem | Level |
|---|---|
| [a Notification Service](#/l/notification-service) | Intermediate |
| [an In-Memory Pub/Sub Message Broker](#/l/pub-sub-broker) | Intermediate |
| [a Chat Application (WhatsApp-like)](#/l/chat-app) | Intermediate |
| [a Social Media News Feed](#/l/social-feed) | Intermediate |
| [a Logging Framework](#/l/logger-framework) | Basic |

### Parsing, rules and documents

Composite, Interpreter, Visitor, Command and Memento for undo, DAG evaluation.

| Problem | Level |
|---|---|
| [an Expression Calculator](#/l/expression-calculator) | Basic |
| [a Rule Engine](#/l/rule-engine) | Advanced |
| [a Spreadsheet](#/l/spreadsheet) | Advanced |
| [a Text Editor with Undo/Redo](#/l/text-editor) | Advanced |
| [a Mini Git (version control)](#/l/mini-git) | Advanced |
| [a Coffee Machine](#/l/coffee-machine) | Basic |

### Platforms and domain modelling

Many entities and relationships, permissions, search, background processing.

| Problem | Level |
|---|---|
| [a Q&A Platform (Stack Overflow)](#/l/stack-overflow) | Intermediate |
| [a Food Delivery App](#/l/food-delivery) | Intermediate |
| [a Ride-Sharing Service](#/l/ride-sharing) | Intermediate |
| [a Library Management System](#/l/library-management) | Basic |
| [a Web Crawler](#/l/web-crawler) | Advanced |

## By design pattern
Want to practise a pattern in a full problem? Start here.

| Pattern | Best problems to practise it |
|---|---|
| Strategy | [Parking lot](#/l/parking-lot), [Splitwise](#/l/splitwise), [Rate limiter](#/l/rate-limiter), [Shopping cart](#/l/shopping-cart) |
| State | [Vending machine](#/l/vending-machine), [ATM](#/l/atm), [Online auction](#/l/online-auction), [Payment gateway](#/l/payment-gateway) |
| Observer | [Library management](#/l/library-management), [Stack Overflow](#/l/stack-overflow), [Pub/sub broker](#/l/pub-sub-broker), [Spreadsheet](#/l/spreadsheet) |
| Command and Memento | [Text editor](#/l/text-editor), [Chess](#/l/chess), [Task scheduler](#/l/task-scheduler), [Mini git](#/l/mini-git) |
| Composite | [In-memory file system](#/l/in-memory-file-system), [Expression calculator](#/l/expression-calculator) |
| Chain of Responsibility | [Logging framework](#/l/logger-framework), [ATM](#/l/atm), [Notification service](#/l/notification-service) |
| Template Method, Factory, Decorator | [Coffee machine](#/l/coffee-machine) |
| Mediator | [Chat app](#/l/chat-app) |
| Interpreter and Specification | [Rule engine](#/l/rule-engine), [Expression calculator](#/l/expression-calculator), [Library management](#/l/library-management) |
| Visitor | [Expression calculator](#/l/expression-calculator), [In-memory file system](#/l/in-memory-file-system) |

## Suggested order

:::tip Pick the plan that fits your time
**2 weeks (quick pass, 12 problems):** [Tic-tac-toe](#/l/tic-tac-toe), [Vending machine](#/l/vending-machine), [Parking lot](#/l/parking-lot), [Library management](#/l/library-management), [Logging framework](#/l/logger-framework), [LRU and LFU caches](#/l/lru-lfu-cache), [Rate limiter](#/l/rate-limiter), [Elevator system](#/l/elevator-system), [Splitwise](#/l/splitwise), [Movie ticket booking](#/l/movie-ticket-booking), [Notification service](#/l/notification-service), [Chess](#/l/chess).

**4 weeks (about 25 problems):** all Basic problems in week 1, the first eight Intermediate problems in weeks 2 and 3, then Chess, Text editor, Spreadsheet and Key-value store in week 4.

**8 weeks (everything):** two to three problems per week, in the order of the tracker. Repeat the ones you could not finish in time.
:::

## What to practise besides the problems

- The [LLD toolkit](#/l/lld-toolkit) (ids, money, time ranges, results, clocks) until you can type it without thinking.
- The [method lesson](#/l/how-to-solve-lld-problems): the 45-minute routine and the clarifying questions.
- The [LLD question bank](#/qa/lld) for the theory behind each decision.

```quiz
? You have two hours before an interview and know none of the problems. Which three give the most coverage?
- Chess, Spreadsheet, Mini git
+ Parking lot (booking, strategy), Vending machine or ATM (state machine) and an LRU cache (data structure plus thread-safety)
- Three games
> They cover resource allocation, lifecycles and data-structure design, which are the three shapes most questions take.
```

:::keypoints
- 43 problems: 14 Basic, 16 Intermediate, 13 Advanced.
- Practise by shape (state machine, booking, cache, scheduler, messaging, parser) rather than by name; the same ideas repeat.
- Always do the paper attempt first, then read the walkthrough.
:::
