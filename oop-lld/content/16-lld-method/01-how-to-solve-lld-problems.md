---
title: The routine for any LLD problem
level: intermediate
time: 40
summary: A practical routine with timings for whiteboard and machine-coding rounds, question banks for clarifying requirements by problem type, how to choose entities and patterns quickly, how to handle the extension and concurrency follow-ups, and a scoring rubric to grade yourself.
---

Parts I and II gave you the tools. Part III applies them to **43 problems**. This lesson is the routine you will repeat on each one. The goal: after the third problem, you should not need to think about *how* to start.

## The routine, with times (45-minute whiteboard round)

| Minutes | Step | Output |
|---|---|---|
| 0 to 5 | **1. Clarify** requirements and scope | 5 to 8 bullets: must-have, nice-to-have, out of scope |
| 5 to 10 | **2. Entities** and relationships | class diagram: boxes, arrows, multiplicities |
| 10 to 15 | **3. Flows** | one sequence or state diagram for the main use cases |
| 15 to 20 | **4. Variation points and patterns** | "pricing varies, so Strategy; lifecycle, so State" |
| 20 to 40 | **5. Code** the core | interfaces first, then 2 or 3 key classes, then a small driver |
| 40 to 45 | **6. Extend and harden** | edge cases, "what if we add X", concurrency |

For a **machine-coding round** (90 to 120 minutes): spend the first 10 minutes on steps 1 to 4 (written as a short design), then code for 60 to 80 minutes, leaving 10 to 15 for the demo, edge cases and clean-up. **Make the main flow work end to end by minute 40**, and improve from there.

## Step 1: clarify requirements

Good questions are **specific** and **cheap to answer**. Ask in groups, and write the answers down.

| Group | Questions to ask |
|---|---|
| **Scope** | Which features are in? Which are out? (payments? reservations? admin?) |
| **Actors** | Who uses it? (customer, admin, system, driver) |
| **Scale/concurrency** | One user or many at once? Multiple threads? (decides locking) |
| **Data & rules** | What are the limits, prices, durations, priorities? Which rules might change? |
| **Failure** | What if it is full, empty, invalid, or conflicts? |
| **Extensibility** | Which new types or rules do you expect soon? |
| **Non-goals** | Persistence? UI? Distributed? (usually no) |

### Domain-specific question bank

| Problem type | Ask about |
|---|---|
| **Games** (tic-tac-toe, chess, snake) | players, turn order, win/draw rules, undo, board size, AI vs human |
| **Booking** (movie, hotel, parking) | inventory units, time ranges, overlap rules, cancellation, double-booking, locking a seat while paying |
| **Money** (ATM, wallet, splitwise) | currency, rounding, negative balances, atomic transfers, audit trail |
| **Caching/storage** (LRU, KV store) | capacity, eviction policy, TTL, thread-safety, hit/miss metrics |
| **Scheduling** (elevator, task scheduler) | priorities, fairness, preemption, repeats, time source |
| **Messaging** (pub/sub, chat, notifications) | delivery guarantees, ordering, retries, offline users, fan-out |
| **Search/text** (typeahead, editor) | data size, ranking, case rules, update frequency, undo |
| **Workflow/rules** (workflow, rule engine) | dependencies, failure policy, dynamic rule changes |
| **Hierarchies** (file system, org chart) | operations on folders vs files, permissions, size, search |

State your **assumptions** explicitly: "I assume single-currency, in-memory, thread-safe operations." The interviewer will correct you if needed.

## Step 2: entities, quickly

1. Underline the **nouns**: candidate classes.
2. Classify each: **entity** (has identity), **value object** (Money, TimeRange), **enum**, **service/coordinator**, **policy/strategy**.
3. Decide **ownership**: who creates and destroys each? (composition vs reference)
4. Put each **behaviour** in the class that owns the needed data.
5. Add **one coordinator** (the facade): `ParkingLot`, `Library`, `ChessGame`, with the public API.

## Step 3: flows

Draw one **sequence** for the main happy path and one for the most important failure. For anything with a lifecycle, a **state table**. If your flow needs a method that does not exist, fix the class diagram now.

## Step 4: patterns by problem type

| Where you see… | Likely pattern |
|---|---|
| "calculate X differently depending on…" (price, fee, discount, route, eviction) | **Strategy** |
| "behaves differently depending on its status" (machine, order, elevator, ATM) | **State** |
| "notify others when…" (events, price alerts, new message) | **Observer** / event bus |
| "different kinds of Y created from input" (vehicle, piece, payment method) | **Factory** |
| "step by step creation with many options" | **Builder** |
| "undo/redo, queue, schedule, log operations" | **Command** (+ Memento) |
| "add features by wrapping" (toppings, logging, retry) | **Decorator** |
| "tree of folders/menus/org" | **Composite** (+ Visitor/Iterator) |
| "one entry point over several subsystems" | **Facade** |
| "pipeline of checks" | **Chain of Responsibility** |
| "a global single thing" | inject one instance (Singleton last) |

Say patterns **with the reason**, never as decoration.

## Step 5: coding order

1. `enum class`es and small value types.
2. Interfaces (the variation points).
3. Core entities with their rules and invariants.
4. Strategy/State implementations.
5. The coordinator/facade (`ParkingLot`...).
6. `main()`: a driver that prints **each scenario** clearly.

If time is short, write the **interfaces and the coordinator fully**, and implement only one or two strategies, noting the others.

## Step 6: the follow-ups you should expect

| Follow-up | How to answer |
|---|---|
| "Add a new type/rule" | Show the exact new class and the (zero or one) line of registration. |
| "Make it thread-safe" | Name the shared mutable state, choose a lock granularity (per entity / per structure), mention check-then-act, deadlock ordering, and `scoped_lock`. |
| "Persist it" | Introduce a Repository interface; in-memory fake and SQL implementation. |
| "Scale it / distribute it" | Say what stays the same (the interfaces) and what changes (storage, partitioning, queues). This leads into HLD. |
| "How would you test it?" | Inject clocks and fakes; state-based tests; stress tests for concurrency. |
| "What are the weaknesses of your design?" | Be honest: name one trade-off (for example, the coordinator may become big) and how you would refactor. |

## Self-grading rubric

Score each problem from 0 to 2 on each line (max 20). Below 14 means redo it.

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Requirements clarified, assumptions stated | skipped | some | complete and prioritised |
| Entities are right, each with one clear job | god class | okay | clean responsibilities |
| Relationships correct (is-a vs has-a, ownership) | confused | mostly | precise with multiplicities |
| Variation points isolated (interfaces) | switch/if chains | one | all the likely ones |
| Patterns used with justification | none or decorative | some | each one earned |
| Code works end to end with a clear demo | does not run | happy path | edge cases too |
| C++ quality: const, RAII, smart pointers, override | raw `new`, no const | partly | idiomatic |
| Edge cases and errors | ignored | few | systematic |
| Extension drill answered | stuck | with edits | by adding classes |
| Concurrency and testing discussed | not mentioned | mentioned | designed |

:::interview What do you do in the first 5 minutes of an LLD round?
"I restate the problem, then ask scoped questions: who the actors are, the main use cases, the rules that may change, whether concurrency matters, and what is out of scope. I write the answers as short bullets and state my assumptions. Only then do I draw the entities. This prevents designing the wrong system and shows structure."
:::

```quiz
? When should you start writing code in a 45-minute round?
- Immediately
+ After clarifying requirements, listing entities, and outlining the flows (about minute 20)
- At the end
> Design first, but leave about 20 minutes for the core code.
? In a machine-coding round, what should be working by minute 40?
- Everything, including all edge cases
+ The main flow, end to end, with a demo
- Only the class diagram
> Get the happy path running first, then harden.
? What is the best way to handle "now add X"?
- Rewrite the design
+ Show which class you add and what stays unchanged
- Say it is out of scope
> Extensibility is graded by how local the change is.
```

:::keypoints
- Use the same 6 steps every time: clarify, entities, flows, patterns, code, extend and harden, with timings.
- Ask scoped questions by problem type; state assumptions; keep a one-page checklist of patterns by symptom.
- Code interfaces and the coordinator first; end with a driver that demonstrates scenarios.
- Prepare the standard follow-ups: new type, thread-safety, persistence, scaling, testing, weaknesses.
:::
