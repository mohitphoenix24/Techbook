---
title: "LLD cheat sheet"
level: easy
time: 15
summary: One page to look at before the interview: the routine, which pattern for which hint, SOLID in a line, types of problems, and the key idea for each classic problem.
---

## The routine (45 minutes)

| Minutes | What to do |
|---|---|
| 0 to 5 | Ask questions: users, scale, what is not needed |
| 5 to 15 | Find the classes, connect them, draw, choose patterns |
| 15 to 35 | Code the interfaces, main classes and main flow |
| 35 to 45 | Edge cases, threads, tests, extensions |

## Which pattern for which hint

| If the problem says... | Think about |
|---|---|
| "different ways of doing one job / policies" | Strategy |
| "modes / life cycle / allowed actions" | State |
| "tell others when X changes" | Observer |
| "undo / queue / record actions" | Command (and Memento) |
| "tree of parts and wholes" | Composite |
| "add features by wrapping" | Decorator |
| "wrap old or third-party code" | Adapter |
| "make a complicated group easy to use" | Facade |
| "control access / lazy / cache" | Proxy |
| "create by type / matching set" | Factory / Abstract Factory |
| "many optional settings" | Builder |
| "a line of handlers" | Chain of Responsibility |
| "fixed steps, changing details" | Template Method |
| "many objects talk to many" | Mediator |
| "add jobs to stable classes" | Visitor |
| "only one object" | Singleton (or pass one in) |

## SOLID in a line each

S: one reason to change. O: add, do not edit. L: a child must be safe to use in place of the parent. I: small interfaces. D: depend on interfaces.

## Types of problems

| Type | Examples | The key idea |
|---|---|---|
| Booking | parking lot, movie, hotel | check and reserve in one step. Time ranges. Hold with expiry |
| State machine | vending, ATM, traffic light, order | State pattern or a table of transitions |
| Games | tic-tac-toe, chess, snake and ladder | board model, check moves, a strategy for players |
| Money | splitwise, bank, payment | integer paise, safe transfers, idempotency |
| Cache and store | LRU, key-value store, typeahead | hash map with list, heap or trie. Removing items. TTL |
| Scheduler | task, cron, workflow | priority queue, clock, retries, DAG |
| Messaging | pub/sub, notification, chat, feed | queues, sending to many, ack and retry, observers |
| Tree and parser | file system, calculator, spreadsheet | Composite, Interpreter, DAG recalculation |

## Always say

Checks and errors, threads on shared data, a clock and ids you can replace, how to test, and one or two extensions.

:::keypoints
- Ask first, then patterns from what can change, then code the main flow, then edge cases and extensions.
- For each problem, name the data structure and its cost.
:::
