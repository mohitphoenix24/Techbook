---
title: "Study plans: 7, 14 and 30 days"
level: easy
time: 15
summary: Day-by-day plans for a week, a fortnight and a month, a daily routine that works, and a checklist for the day before the interview.
---

Pick the plan that matches your time. Each day has one **learn** block, one **build** block and one **speak** block. Do not skip the speaking: interviews are spoken.

## The daily routine (about 90 minutes)

| Block | Time | What to do |
|---|---|---|
| **Learn** | 30 min | Read the lessons of the day and run every example. Change the code and run it again. |
| **Build** | 30 min | Do the coding challenge **without looking** at the solution. Then compare. |
| **Speak** | 20 min | Answer the bank questions **aloud**, in one clear sentence plus one example. Record yourself once a week. |
| **Review** | 10 min | Write three lines: what I learned, what I forgot, what to repeat tomorrow. |

## Plan A: 7 days (the interview is next week)

Use the [15 priorities](#/l/roadmap-and-priorities). Each day covers two or three of them.

| Day | Learn | Build | Speak |
|---|---|---|---|
| 1 | [Execution context and call stack](#/l/execution-context), [scope](#/l/scope-and-scope-chain), [hoisting and TDZ](#/l/temporal-dead-zone) | [Implement once and memoize](#/l/implement-once-and-memoize) | [Execution bank](#/l/execution-scope-hoisting), [core puzzles](#/l/output-puzzles-core) |
| 2 | [Closures](#/m/closures), [this](#/l/this-basics) | [Implement call, apply, bind](#/l/implement-call-apply-bind) | [Closures bank](#/l/closures), [this bank](#/l/this-call-apply-bind) |
| 3 | [Prototype chain](#/l/property-lookup-and-the-chain), [classes and OOP](#/l/four-pillars-of-oop) | [Implement new and instanceof](#/l/implement-new-and-instanceof) | [Prototypes bank](#/l/prototypes-classes), [this and prototype puzzles](#/l/output-puzzles-this-prototypes) |
| 4 | [Promises](#/l/promise-basics), [async/await](#/l/async-await-internals), [combinators](#/l/promise-combinators) | [Implement the combinators](#/l/implement-promise-combinators), [sleep, timeout, retry](#/l/implement-sleep-timeout-retry) | [Promises bank](#/l/promises), [async/await bank](#/l/async-await) |
| 5 | [Event loop](#/l/the-event-loop-explained), [microtasks and macrotasks](#/l/microtasks-and-macrotasks), [Node phases](#/l/node-event-loop-phases) | [Event loop puzzles](#/l/event-loop-puzzles) | [Async puzzles](#/l/output-puzzles-async), [Event loop bank](#/l/event-loop) |
| 6 | [Streams and backpressure](#/l/backpressure-pipe-pipeline), [garbage collection and leaks](#/l/memory-leaks) | [Debounce](#/l/implement-debounce) and [throttle](#/l/implement-throttle) | [Node bank](#/m/node-bank), [Memory and performance bank](#/l/memory-and-performance) |
| 7 | Weak spots from your review notes | [Find the bug](#/l/find-the-bug) | [Rapid fire](#/l/rapid-fire), [Core cheat sheet](#/l/core-cheat-sheet), [Async cheat sheet](#/l/async-cheat-sheet) |

## Plan B: 14 days (two weeks)

| Days | Focus | Modules |
|---|---|---|
| 1 to 3 | JS core | [Execution](#/m/execution), [Closures](#/m/closures), [this](#/m/this-keyword) |
| 4 to 5 | Prototypes and OOP | [Prototypes](#/m/prototypes), [Classes](#/m/classes) |
| 6 to 8 | Async | [Event loop](#/m/event-loop), [Promises and async/await](#/m/promises-async) |
| 9 | Functions and FP | [Functions](#/m/functions), [Arrays and FP](#/m/arrays-fp) |
| 10 | Objects and types | [Objects](#/m/objects), [Types and equality](#/m/types-equality) |
| 11 | Node | [Node runtime](#/m/node-runtime), [Node streams](#/m/node-streams) |
| 12 | Memory and performance, browser | [Memory and performance](#/m/memory-performance), [Browser](#/m/browser) |
| 13 | Security and React | [Security](#/m/security), [React JavaScript](#/m/react-js) |
| 14 | Mock interview day | Pick 10 random questions from the [Q&A page](#/qa), two puzzles, one challenge. Time yourself. |

Every day also has one **basic challenge** from [Basic challenges](#/m/challenges-basic).

## Plan C: 30 days (the full course)

| Week | Goal | What to do |
|---|---|---|
| 1 | **Core**: execution, closures, this, prototypes, classes, functions, arrays | Modules 2 to 8. Finish each module's puzzles. Do 7 basic challenges. |
| 2 | **Async and advanced**: event loop, promises, objects, types, modern JS, memory | Modules 9 to 14. Do 8 basic and 4 intermediate challenges. |
| 3 | **Node, browser, security, React** | Modules 15 to 20. Do the [Node bank](#/m/node-bank) and [Web bank](#/m/web-bank). Do 6 intermediate challenges. |
| 4 | **Practice and polish** | 6 advanced challenges, all six banks aloud, the [frontend system design](#/l/frontend-system-design) questions, 3 full mock interviews with a friend. |

## How to practise so it sticks

- **Predict before you run.** Write the output on paper for every puzzle. A wrong guess teaches the most.
- **Implement without looking.** Open the solution only after you tried for 15 minutes, then rewrite it from memory the next day.
- **Explain aloud.** If you cannot explain it in two sentences to a friend, you do not know it yet.
- **Space it out.** Revisit the Q&A page on days 1, 3, 7 and 14. Mark the questions you hesitated on.
- **Link topics.** Closures connect to React hooks, the event loop connects to promises, prototypes connect to classes. Say these links aloud; they impress interviewers.
- **Use your own projects.** For each topic, find one place in your MERN work where it mattered (a memory leak, a race condition, a CORS error). Real stories beat definitions.

## The day before the interview

1. Read the [core cheat sheet](#/l/core-cheat-sheet), [async cheat sheet](#/l/async-cheat-sheet), [Node cheat sheet](#/l/node-cheat-sheet) and [web cheat sheet](#/l/web-cheat-sheet) once.
2. Do the [rapid-fire round](#/l/rapid-fire) aloud.
3. Re-do two puzzles you got wrong.
4. Prepare three stories from your work (a hard bug, a performance fix, a design trade-off) using the method in [How to answer senior questions](#/l/how-to-answer-senior-questions).
5. Sleep. A rested mind recalls more than an extra hour of reading.

:::keypoints
- Daily: **learn, build, speak, review**. Speaking aloud is not optional.
- One week left? Do the **15 priorities**; two weeks? go **module by module**; a month? do **everything including advanced challenges**.
- Practise by **predicting, implementing without looking, and explaining aloud**.
:::
