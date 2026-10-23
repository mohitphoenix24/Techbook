---
title: "LLD cheat sheet"
level: easy
time: 15
summary: One page: the interview routine, pattern chooser, SOLID in a line, problem shapes and the key data structure or pattern for each classic problem.
---

## The routine (45 minutes)

| Minutes | Do |
|---|---|
| 0 to 5 | Clarify requirements, actors, scale, out of scope |
| 5 to 15 | Entities, relationships, class diagram, patterns |
| 15 to 35 | Code interfaces, core classes, the main flow |
| 35 to 45 | Edge cases, concurrency, tests, extensions |

## Pattern chooser

| If the problem says... | Think |
|---|---|
| "different algorithms / policies" | Strategy |
| "modes / lifecycle / allowed actions" | State |
| "notify others when X changes" | Observer |
| "undo / queue / log requests" | Command (+ Memento) |
| "tree of parts and wholes" | Composite |
| "add behaviour dynamically" | Decorator |
| "wrap legacy / third party" | Adapter |
| "simplify a complex subsystem" | Facade |
| "control access / lazy / cache" | Proxy |
| "create by type / by family" | Factory / Abstract Factory |
| "many optional parameters" | Builder |
| "pipeline of handlers" | Chain of Responsibility |
| "fixed steps, varying details" | Template Method |
| "many objects talk to many" | Mediator |
| "add operations to stable types" | Visitor |
| "only one instance" | Singleton (or inject one) |

## SOLID in a line each

S: one reason to change · O: extend, don't edit · L: subtypes honour the base contract · I: small client-specific interfaces · D: depend on abstractions.

## Problem shapes

| Shape | Examples | Key idea |
|---|---|---|
| Booking / allocation | parking lot, movie, hotel | atomic check-and-reserve; time ranges; holds with expiry |
| State machine | vending, ATM, traffic light, order | State pattern or transition table |
| Games | tic-tac-toe, chess, snake-ladder | board model, move validation, strategy for players |
| Money | splitwise, bank, payment | integer minor units, atomic transfers, idempotency |
| Cache / store | LRU, KV store, typeahead | hash map + list/heap/trie, eviction, TTL |
| Scheduler | task, cron, workflow | priority queue, clock, retries, DAG |
| Messaging | pub/sub, notification, chat, feed | queues, fan-out, ack/retry, observers |
| Tree / parser | file system, calculator, spreadsheet | Composite, Interpreter, DAG recompute |

## Always mention

Validation and error handling · concurrency on the shared state · injectable clock/id/random · how to test · one or two extensions.

:::keypoints
- Requirements first, patterns from variation, code the main flow, then edge cases.
- Name the data structure and its complexity for every problem.
:::
