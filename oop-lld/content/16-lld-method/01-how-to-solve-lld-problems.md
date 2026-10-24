---
title: The routine for any LLD problem
level: intermediate
time: 40
summary: A simple step-by-step routine with timings for whiteboard and machine-coding rounds. What to ask first, how to find classes, which pattern fits which hint, how to answer follow-ups, and a score sheet to grade yourself.
---

In the earlier parts you learnt the tools. In Part III you will use them on **43 problems**. This lesson is the **routine** you repeat for every problem.

The goal is simple: by the third problem, you should **not have to think about how to start**.

## The routine, with timings (a 45-minute whiteboard round)

| Minutes | Step | What you produce |
|---|---|---|
| 0 to 5 | **1. Ask questions** (requirements) | 5 to 8 short points: must have, nice to have, out of scope |
| 5 to 10 | **2. Find the classes** and how they connect | a class diagram with boxes and arrows |
| 10 to 15 | **3. Draw the flow** | one sequence or state diagram for the main use case |
| 15 to 20 | **4. Find what can change**, and pick patterns | "pricing can change, so Strategy. It has a life cycle, so State." |
| 20 to 40 | **5. Write the code** for the core | interfaces first, then 2 or 3 key classes, then a small `main` |
| 40 to 45 | **6. Extend and check** | edge cases, "what if we add X", threads |

For a **machine-coding round** (90 to 120 minutes): spend the first 10 minutes on steps 1 to 4 (write a short design), then code for 60 to 80 minutes, and keep the last 10 to 15 minutes for the demo, edge cases and clean-up. **Make the main flow work from start to end by minute 40**, and improve it after that.

## Step 1: Ask questions

Good questions are **short and specific**. Ask them in groups and write the answers down.

| Group | What to ask |
|---|---|
| **Scope** | Which features are included? Which are not? (payments? reservations? admin?) |
| **Users** | Who uses it? (customer, admin, system, driver) |
| **Scale and threads** | One user or many at once? Many threads? (this decides locking) |
| **Data and rules** | What are the limits, prices, times, priorities? Which rules may change? |
| **Failure** | What if it is full, empty, invalid, or two users clash? |
| **Growth** | Which new types or rules do you expect soon? |
| **Not needed** | Saving to a database? A screen? Many machines? (usually no) |

### Questions by type of problem

| Type of problem | Ask about |
|---|---|
| **Games** (tic-tac-toe, chess, snake) | players, whose turn, how to win or draw, undo, board size, computer or human player |
| **Booking** (movie, hotel, parking) | what is booked, time ranges, overlap rules, cancel, double booking, holding a seat while paying |
| **Money** (ATM, wallet, splitwise) | currency, rounding, negative balance, safe transfers, a record of changes |
| **Cache and storage** (LRU, key-value) | size limit, which item to remove, expiry time, many threads, hit and miss counts |
| **Scheduling** (lift, task scheduler) | priorities, fairness, interrupting, repeating, where the time comes from |
| **Messaging** (pub/sub, chat, notifications) | delivery promises, order, retries, offline users, sending to many |
| **Search and text** (typeahead, editor) | data size, ranking, upper and lower case, how often it changes, undo |
| **Workflow and rules** | dependencies, what to do on failure, rules that change while running |
| **Tree-like data** (file system, org chart) | actions on folders and files, permissions, size, search |

Say your **assumptions** out loud: "I assume one currency, everything in memory, and it must be safe for many threads." If you are wrong, the interviewer will tell you.

## Step 2: Find the classes, quickly

1. Underline the **nouns**. These are possible classes.
2. Sort each one: **entity** (has an identity), **value** (like Money or TimeRange), **enum** (a fixed list), **service** (does a job), or **policy / strategy** (a rule that can change).
3. Decide **who owns what**. Who creates it and who deletes it?
4. Give each action to the class that has the data for it.
5. Add **one main class** (the front door) like `ParkingLot`, `Library` or `ChessGame`. It holds the public methods.

## Step 3: Draw the flow

Draw one **sequence diagram** for the main normal path, and one for the most important failure. If something has a life cycle, write a **state table**. If the flow needs a method that is missing, fix the class diagram now.

## Step 4: Which pattern for which hint?

| If the problem says... | Think about |
|---|---|
| "calculate X differently depending on..." (price, fee, discount, route, which item to remove) | **Strategy** |
| "behaves differently depending on its status" (machine, order, lift, ATM) | **State** |
| "tell others when..." (events, price alerts, new message) | **Observer** / event bus |
| "different kinds of Y created from input" (vehicle, piece, payment type) | **Factory** |
| "many options, built step by step" | **Builder** |
| "undo, redo, queue, schedule, record actions" | **Command** (and Memento) |
| "add features by wrapping" (toppings, logging, retry) | **Decorator** |
| "folders, menus, org chart" | **Composite** (and Visitor or Iterator) |
| "one entry point over several parts" | **Facade** |
| "a line of checks" | **Chain of Responsibility** |
| "one global thing" | pass one object in (Singleton as a last choice) |

Always say a pattern **with the reason**. Never use one only for decoration.

## Step 5: The order of coding

1. `enum class` types and small value types.
2. Interfaces (the places where things can change).
3. Main entities with their rules.
4. Strategy and State classes.
5. The main class (`ParkingLot`, ...).
6. `main()`: a demo that prints **each scenario** clearly.

If time is short, write the **interfaces and the main class completely**, implement only one or two strategies, and say what the others would be.

## Step 6: Follow-up questions to expect

| Follow-up | How to answer |
|---|---|
| "Add a new type or rule" | Show the exact new class, and the zero or one line where you plug it in. |
| "Make it thread-safe" | Name the shared data that changes. Choose where to lock (per item or per structure). Mention check-then-act, lock order, and `scoped_lock`. |
| "Save it to storage" | Add a Repository interface, with a memory version and a SQL version. |
| "Make it big / spread over machines" | Say what stays (the interfaces) and what changes (storage, splitting data, queues). This leads into HLD. |
| "How will you test it?" | Pass in clocks and fakes. Check results. Stress test for threads. |
| "What are the weak points?" | Be honest. Name one trade-off (for example, the main class may grow big) and how you would fix it. |

## Score sheet (grade yourself)

Give each line 0, 1 or 2 points (maximum 20). Below 14 means redo the problem.

| What | 0 | 1 | 2 |
|---|---|---|---|
| Asked questions, said assumptions | skipped | some | complete, in order of importance |
| Classes are right, each with one job | one giant class | okay | clean jobs |
| Relationships correct (is-a or has-a, ownership) | confused | mostly | exact, with numbers |
| Changeable parts behind interfaces | if/switch chains | one | all the likely ones |
| Patterns used with reasons | none, or decorative | some | each one earned |
| Code works from start to end, with a clear demo | does not run | normal case works | edge cases too |
| C++ quality: const, RAII, smart pointers, override | raw `new`, no const | partly | clean |
| Edge cases and errors | ignored | a few | planned |
| Extension question answered | stuck | with edits | by adding classes |
| Threads and testing discussed | not mentioned | mentioned | designed |

## Short answer to say in an interview

:::interview What do you do in the first 5 minutes of an LLD round?
"I repeat the problem in my own words. Then I ask short questions: who the users are, the main use cases, which rules can change, whether many threads are involved, and what is not needed. I write the answers as short points and say my assumptions. Only after that do I draw the classes. This stops me from designing the wrong system, and it shows a clear method."
:::

```quiz
? When should you start writing code in a 45-minute round?
- Immediately
+ After asking questions, listing the classes and drawing the flow (about minute 20)
- At the end
> Design first, but keep about 20 minutes for the main code.
? In a machine-coding round, what should work by minute 40?
- Everything, with all edge cases
+ The main flow from start to end, with a demo
- Only the class diagram
> Get the normal case running first, then improve it.
? What is the best way to answer "now add X"?
- Rewrite the design
+ Show which class you add, and what stays the same
- Say it is out of scope
> The smaller and more local the change, the better your design.
```

:::keypoints
- Use the same 6 steps every time: ask, find classes, draw the flow, choose patterns, code, then extend and check. Keep to the timings.
- Ask short questions based on the type of problem. Say your assumptions. Keep the pattern hint table in your head.
- Code the interfaces and the main class first. End with a demo of each scenario.
- Prepare the usual follow-ups: new type, threads, storage, scaling, testing, weak points.
:::
