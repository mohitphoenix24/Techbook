---
title: Problem index: all 43 LLD problems by level and by topic
level: intermediate
time: 15
summary: A simple map of all 43 LLD problems. See them by level (Basic, Intermediate, Advanced), by topic, and by design pattern, with a suggested order for 2, 4 and 8 weeks.
---

This page is the **table of contents for Part III**. There are **43 problems**. Every problem lesson gives you the requirements, the class diagram, the main design decisions, complete C++ code that runs (with its real output), edge cases, and the follow-up questions an interviewer may ask next.

:::note How to use a problem lesson
1. Read only the problem card. Close the lesson.
2. Spend 30 minutes on paper: requirements, classes, diagram, key methods.
3. Open the lesson and compare. Note what you missed.
4. Re-type the core classes from memory the next day.
5. Tick the problem off in the tracker (`Problems` in the top bar).
:::

## By level


### Basic (14 problems)

Only a few classes and clear rules. These build the habit: **ask, list the nouns, draw, code**. Most first-round machine-coding questions look like these. Try to finish each in 45 minutes.

| # | Problem | What it practises |
|---|---|---|
| 1 | [Tic-Tac-Toe](#/l/tic-tac-toe) | games, 2D board, strategy, beginner |
| 2 | [Snake and Ladder](#/l/snake-and-ladder) | games, simulation, strategy, randomness |
| 3 | [Vending Machine](#/l/vending-machine) | state machine, State pattern, inventory, money |
| 4 | [Traffic Signal Controller](#/l/traffic-signal) | state machine, timing, simulation, safety |
| 5 | [Parking Lot](#/l/parking-lot) | classic, Strategy, concurrency, booking, most asked |
| 6 | [Library Management System](#/l/library-management) | classic, reservations, Observer, Specification, Strategy |
| 7 | [ATM](#/l/atm) | state machine, State pattern, Chain of Responsibility, banking |
| 8 | [Coffee Machine](#/l/coffee-machine) | Template Method, Factory, Decorator, inventory, Observer |
| 9 | [Logging Framework](#/l/logger-framework) | Chain of Responsibility, Strategy, concurrency, infrastructure |
| 10 | [Shopping Cart with pricing rules](#/l/shopping-cart) | e-commerce, Strategy, pricing, money, chain of rules |
| 11 | [Blackjack](#/l/blackjack) | games, cards, Strategy, state, simulation |
| 12 | [Bank Account System](#/l/bank-accounts) | banking, concurrency, transfer, Strategy, State, money |
| 13 | [URL Shortener (class level)](#/l/url-shortener) | classic, encoding, repository, expiry, counters |
| 14 | [Expression Calculator](#/l/expression-calculator) | parsing, Composite, Interpreter, Visitor, error handling |

### Intermediate (16 problems)

More classes, a life cycle or an algorithm in the middle, and **threads or time** to think about. Typical for second-round interviews. Aim for a clean design in 60 minutes.

| # | Problem | What it practises |
|---|---|---|
| 1 | [Elevator System](#/l/elevator-system) | State, Strategy, scheduling, simulation, classic |
| 2 | [Movie Ticket Booking System](#/l/movie-ticket-booking) | booking, concurrency, seat locking, state, BookMyShow |
| 3 | [Splitwise (expense sharing)](#/l/splitwise) | finance, Strategy, graph, money, algorithm |
| 4 | [Hotel Reservation System](#/l/hotel-reservation) | booking, date ranges, Strategy, concurrency, pricing |
| 5 | [Food Delivery App](#/l/food-delivery) | State, Strategy, Observer, e-commerce, Swiggy, order lifecycle |
| 6 | [Ride-Sharing Service](#/l/ride-sharing) | State, Strategy, matching, pricing, geo, Observer |
| 7 | [LRU and LFU Caches (generic, thread-safe)](#/l/lru-lfu-cache) | caching, data structures, Strategy, generic, thread-safe, classic |
| 8 | [Rate Limiter](#/l/rate-limiter) | Strategy, algorithms, concurrency, time, API gateway |
| 9 | [Notification Service](#/l/notification-service) | Strategy, Chain of Responsibility, async, retry, Observer, infrastructure |
| 10 | [In-Memory File System](#/l/in-memory-file-system) | Composite, tree, paths, Visitor, commands |
| 11 | [Q&A Platform (Stack Overflow)](#/l/stack-overflow) | domain modelling, Observer, reputation, search, voting |
| 12 | [Social Media News Feed](#/l/social-feed) | feed, fan-out, Strategy, Observer, pagination, graph |
| 13 | [In-Memory Pub/Sub Message Broker](#/l/pub-sub-broker) | messaging, Observer, concurrency, queues, Kafka-like |
| 14 | [Task Scheduler](#/l/task-scheduler) | Command, priority queue, timers, concurrency, scheduling, cron-like |
| 15 | [Online Auction System](#/l/online-auction) | State, Strategy, Observer, concurrency, time, marketplace |
| 16 | [Chat Application (WhatsApp-like)](#/l/chat-app) | Mediator, Observer, messaging, presence, state, groups |

### Advanced (13 problems)

A real algorithm or data structure sits at the centre (graphs, tries, time ranges, order books, DAGs), plus transactions, undo or extension questions. Expect these for senior roles, or as deep follow-ups.

| # | Problem | What it practises |
|---|---|---|
| 1 | [Chess](#/l/chess) | games, polymorphism, Command, undo, rules engine, classic |
| 2 | [Text Editor with Undo/Redo](#/l/text-editor) | Command, Memento, undo, Composite, document model, Observer |
| 3 | [Spreadsheet](#/l/spreadsheet) | graph, DAG, Interpreter, Observer, parsing, dependency tracking |
| 4 | [In-Memory Key-Value Store with TTL and Transactions](#/l/kv-store-transactions) | storage, transactions, TTL, undo log, WAL, concurrency, Command |
| 5 | [Order Matching Engine (stock exchange)](#/l/order-matching-engine) | finance, data structures, priority, order book, Strategy, low latency |
| 6 | [Payment Gateway](#/l/payment-gateway) | payments, State, Strategy, idempotency, circuit breaker, ledger, Chain of Responsibility |
| 7 | [Calendar and Meeting Scheduler](#/l/calendar-scheduler) | intervals, algorithms, recurrence, Strategy, Observer, booking |
| 8 | [Search Autocomplete (Typeahead)](#/l/typeahead) | trie, data structures, ranking, top-k, Strategy, concurrency |
| 9 | [Cron-Style Job Scheduler](#/l/job-scheduler-cron) | scheduling, cron, Strategy, time, retries, distributed locks |
| 10 | [Workflow Engine (DAG executor)](#/l/workflow-engine) | DAG, topological sort, concurrency, thread pool, Command, State |
| 11 | [Mini Git (version control)](#/l/mini-git) | version control, DAG, hashing, immutability, merge, Composite, Memento |
| 12 | [Web Crawler](#/l/web-crawler) | concurrency, BFS, rate limiting, pipeline, Strategy, distributed |
| 13 | [Rule Engine](#/l/rule-engine) | Specification, Interpreter, Strategy, forward chaining, DSL, business rules |

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
| [Traffic Signal Controller](#/l/traffic-signal) | Basic |

### State machines and lifecycles

The State pattern, legal transitions, what happens on an illegal event.

| Problem | Level |
|---|---|
| [Vending Machine](#/l/vending-machine) | Basic |
| [ATM](#/l/atm) | Basic |
| [Traffic Signal Controller](#/l/traffic-signal) | Basic |
| [Elevator System](#/l/elevator-system) | Intermediate |
| [Food Delivery App](#/l/food-delivery) | Intermediate |
| [Ride-Sharing Service](#/l/ride-sharing) | Intermediate |
| [Online Auction System](#/l/online-auction) | Intermediate |
| [Payment Gateway](#/l/payment-gateway) | Advanced |

### Booking and reservations (concurrency + time ranges)

Double-booking prevention, locking, date-range overlap, cancellation and expiry.

| Problem | Level |
|---|---|
| [Parking Lot](#/l/parking-lot) | Basic |
| [Movie Ticket Booking System](#/l/movie-ticket-booking) | Intermediate |
| [Hotel Reservation System](#/l/hotel-reservation) | Intermediate |
| [Library Management System](#/l/library-management) | Basic |
| [Calendar and Meeting Scheduler](#/l/calendar-scheduler) | Advanced |

### Money and finance

Integer money, atomic transfers, ledgers, idempotency, rounding.

| Problem | Level |
|---|---|
| [Bank Account System](#/l/bank-accounts) | Basic |
| [Splitwise (expense sharing)](#/l/splitwise) | Intermediate |
| [Shopping Cart with pricing rules](#/l/shopping-cart) | Basic |
| [Payment Gateway](#/l/payment-gateway) | Advanced |
| [Order Matching Engine (stock exchange)](#/l/order-matching-engine) | Advanced |

### Caches, stores and data structures

Choosing the right containers, O(1) operations, eviction, TTL, undo logs.

| Problem | Level |
|---|---|
| [LRU and LFU Caches (generic, thread-safe)](#/l/lru-lfu-cache) | Intermediate |
| [In-Memory Key-Value Store with TTL and Transactions](#/l/kv-store-transactions) | Advanced |
| [Search Autocomplete (Typeahead)](#/l/typeahead) | Advanced |
| [URL Shortener (class level)](#/l/url-shortener) | Basic |
| [In-Memory File System](#/l/in-memory-file-system) | Intermediate |

### Schedulers and timers

Priority queues, injectable clocks, retries, dependencies, worker threads.

| Problem | Level |
|---|---|
| [Task Scheduler](#/l/task-scheduler) | Intermediate |
| [Cron-Style Job Scheduler](#/l/job-scheduler-cron) | Advanced |
| [Workflow Engine (DAG executor)](#/l/workflow-engine) | Advanced |
| [Rate Limiter](#/l/rate-limiter) | Intermediate |
| [Elevator System](#/l/elevator-system) | Intermediate |

### Messaging and notifications

Observer, Mediator, fan-out, delivery guarantees, back-pressure.

| Problem | Level |
|---|---|
| [Notification Service](#/l/notification-service) | Intermediate |
| [In-Memory Pub/Sub Message Broker](#/l/pub-sub-broker) | Intermediate |
| [Chat Application (WhatsApp-like)](#/l/chat-app) | Intermediate |
| [Social Media News Feed](#/l/social-feed) | Intermediate |
| [Logging Framework](#/l/logger-framework) | Basic |

### Parsing, rules and documents

Composite, Interpreter, Visitor, Command and Memento for undo, DAG evaluation.

| Problem | Level |
|---|---|
| [Expression Calculator](#/l/expression-calculator) | Basic |
| [Rule Engine](#/l/rule-engine) | Advanced |
| [Spreadsheet](#/l/spreadsheet) | Advanced |
| [Text Editor with Undo/Redo](#/l/text-editor) | Advanced |
| [Mini Git (version control)](#/l/mini-git) | Advanced |
| [Coffee Machine](#/l/coffee-machine) | Basic |

### Platforms and domain modelling

Many entities and relationships, permissions, search, background processing.

| Problem | Level |
|---|---|
| [Q&A Platform (Stack Overflow)](#/l/stack-overflow) | Intermediate |
| [Food Delivery App](#/l/food-delivery) | Intermediate |
| [Ride-Sharing Service](#/l/ride-sharing) | Intermediate |
| [Library Management System](#/l/library-management) | Basic |
| [Web Crawler](#/l/web-crawler) | Advanced |

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
