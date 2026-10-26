---
title: "Your roadmap and the 15 priorities"
level: easy
time: 20
summary: Your JavaScript interview roadmap (tiers 1 to 9, the six phases, and the 15 priorities for next week) mapped to the exact lessons, challenges and question banks in JSLab.
---

This course was built from the roadmap you shared. Every topic in it has: a **lesson** (explained from zero), **runnable code**, **puzzles**, and **interview questions** after it. This page is the map.

## The 15 priorities, if your interview is next week

Do them in this order. For each: read the lesson, run the code, then **say the answer aloud** from the bank.

| # | Priority | Read | Practise | Drill (questions and puzzles) |
|---|---|---|---|---|
| 1 | Execution context and call stack | [How JavaScript runs](#/l/how-javascript-runs), [Execution context](#/l/execution-context), [Call stack](#/l/call-stack) | [Hoisting](#/l/hoisting) examples | [Execution, scope and hoisting](#/l/execution-scope-hoisting) |
| 2 | Scope and lexical environment | [Scope and the scope chain](#/l/scope-and-scope-chain), [Lexical environment](#/l/lexical-environment) | [var, let, const](#/l/var-let-const) | [Core puzzles](#/l/output-puzzles-core) |
| 3 | Closures | [What is a closure?](#/l/what-is-a-closure), [Closures in loops](#/l/closures-in-loops), [Closures in React](#/l/closures-in-react) | [Implement once and memoize](#/l/implement-once-and-memoize) | [Closures bank](#/l/closures) |
| 4 | `this` | [this basics](#/l/this-basics), [Lost this](#/l/implicit-and-lost-this), [call, apply, bind](#/l/call-apply-bind) | [Implement call, apply, bind](#/l/implement-call-apply-bind) | [this bank](#/l/this-call-apply-bind), [this puzzles](#/l/output-puzzles-this-prototypes) |
| 5 | Prototype and the prototype chain | [Property lookup and the chain](#/l/property-lookup-and-the-chain), [prototype vs __proto__](#/l/prototype-vs-proto) | [Implement new and instanceof](#/l/implement-new-and-instanceof) | [Prototypes and classes bank](#/l/prototypes-classes) |
| 6 | Classes and OOP | [Class syntax, fields, static](#/l/class-syntax-fields-static), [Four pillars of OOP](#/l/four-pillars-of-oop), [Composition vs inheritance](#/l/composition-vs-inheritance) | [Class puzzles](#/l/class-puzzles) | [Patterns and architecture](#/l/patterns-and-architecture) |
| 7 | Hoisting and the TDZ | [Hoisting](#/l/hoisting), [Temporal dead zone](#/l/temporal-dead-zone) | [Core puzzles](#/l/output-puzzles-core) | [Core cheat sheet](#/l/core-cheat-sheet) |
| 8 | Promises | [Promise basics](#/l/promise-basics), [Chaining and error propagation](#/l/chaining-and-error-propagation) | [Implement a Promise class](#/l/implement-promise-class) | [Promises bank](#/l/promises) |
| 9 | async/await | [async/await internals](#/l/async-await-internals), [Async error handling](#/l/async-error-handling), [Async mistakes](#/l/async-mistakes) | [Implement sleep, timeout, retry](#/l/implement-sleep-timeout-retry) | [Async/await bank](#/l/async-await) |
| 10 | Event loop, microtasks and macrotasks | [The event loop explained](#/l/the-event-loop-explained), [Microtasks and macrotasks](#/l/microtasks-and-macrotasks) | [Event loop puzzles](#/l/event-loop-puzzles) | [Event loop bank](#/l/event-loop), [Async puzzles](#/l/output-puzzles-async) |
| 11 | `Promise.all`, `allSettled`, `race`, `any` | [Promise combinators](#/l/promise-combinators), [Sequential vs parallel](#/l/sequential-vs-parallel) | [Implement the combinators](#/l/implement-promise-combinators) | [Async cheat sheet](#/l/async-cheat-sheet) |
| 12 | The Node.js event loop | [Event loop phases](#/l/node-event-loop-phases), [nextTick, setImmediate, microtasks](#/l/nexttick-setimmediate-microtasks) | [Node puzzles](#/l/node-event-loop-puzzles) | [Node runtime bank](#/l/runtime-and-modules) |
| 13 | Streams and backpressure | [Streams basics](#/l/streams-basics), [Backpressure, pipe, pipeline](#/l/backpressure-pipe-pipeline) | [Stream transforms and backpressure](#/l/implement-stream-transform-and-backpressure) | [Streams and buffers bank](#/l/streams-and-buffers) |
| 14 | Memory leaks and garbage collection | [Garbage collection](#/l/garbage-collection), [Memory leaks](#/l/memory-leaks) | [Memory and performance bank](#/l/memory-and-performance) | [Advanced bank](#/m/advanced-bank) |
| 15 | Debounce, throttle and performance | [Debounce](#/l/debounce), [Throttle](#/l/throttle), [V8 and performance](#/l/v8-performance) | [Implement debounce](#/l/implement-debounce), [Implement throttle](#/l/implement-throttle) | [Rapid fire](#/l/rapid-fire) |

## Your roadmap, topic by topic

| Tier | Your topic | Where it is in JSLab |
|---|---|---|
| 1 | 1. Execution model | module [Execution model](#/m/execution) |
| 1 | 2. `this` | module [The this keyword](#/m/this-keyword) |
| 1 | 3. Prototypes and the chain | module [Prototypes](#/m/prototypes) |
| 1 | 4. Closures | module [Closures](#/m/closures) |
| 1 | 5. Async JavaScript | module [Promises and async/await](#/m/promises-async) |
| 2 | 6. Event loop | module [The event loop](#/m/event-loop) and [Node phases](#/l/node-event-loop-phases) |
| 2 | 7. Scope and closures | [Scope chain](#/l/scope-and-scope-chain), [Lexical environment](#/l/lexical-environment) |
| 2 | 8. Functions as first-class objects | module [Functions](#/m/functions) |
| 2 | 9. Functional programming | module [Arrays and FP](#/m/arrays-fp) |
| 3 | 10. Objects and the property system | [Object basics](#/l/object-basics-and-static-methods), [Property descriptors](#/l/property-descriptors), [Freeze and seal](#/l/freeze-seal-immutability) |
| 3 | 11. Destructuring, spread, rest | [Destructuring, spread, rest](#/l/destructuring-spread-rest) |
| 3 | 12. Shallow vs deep copy | [Shallow vs deep copy](#/l/shallow-vs-deep-copy), [JSON limits](#/l/json-dates-and-strings), [Implement deep clone](#/l/implement-deep-clone) |
| 3 | 13. Equality and coercion | [Equality and Object.is](#/l/equality-and-object-is), [Coercion and ToPrimitive](#/l/type-coercion-and-toprimitive) |
| 3 | 14. ES6+ | module [Modern JavaScript](#/m/modern-js) |
| 4 | 15. CommonJS vs ES modules | [CommonJS](#/l/commonjs-modules), [ESM in Node and interop](#/l/esm-in-node-and-interop), [Implement require()](#/l/implement-require-loader) |
| 4 | 16. Node event loop | module [Node runtime](#/m/node-runtime) |
| 4 | 17. Streams | module [Node streams](#/m/node-streams) |
| 4 | 18. Buffers | [Buffers](#/l/buffers) |
| 4 | 19. Error handling | [Error handling](#/l/error-handling), [Error middleware](#/l/middleware-and-error-middleware), [Graceful shutdown](#/l/graceful-shutdown-and-health) |
| 4 | 20. Memory management | module [Memory and performance](#/m/memory-performance) |
| 5 | 21. Iterators and generators | [Iterators and iterables](#/l/iterators-and-iterables), [Generators](#/l/generators), [Async iterators](#/l/async-iterators-and-generators) |
| 5 | 22. Symbols | [Symbols](#/l/symbols) |
| 5 | 23. Proxy and Reflect | [Proxy and Reflect](#/l/proxy-and-reflect), [Implement reactivity with Proxy](#/l/implement-proxy-reactivity) |
| 6 | 24. Debounce and throttle | [Debounce](#/l/debounce), [Throttle](#/l/throttle) |
| 6 | 25. Memoization | [Memoization](#/l/memoization), [Implement memoize](#/l/implement-once-and-memoize) |
| 6 | 26. Web Workers and worker threads | [Workers](#/l/web-workers-and-worker-threads), [Implement a worker pool](#/l/implement-worker-pool) |
| 7 | React-specific JavaScript | module [React JavaScript internals](#/m/react-js), [React bank](#/l/react-internals) |
| 8 | Browser fundamentals | module [Browser](#/m/browser), [Web bank](#/m/web-bank) |
| 9 | Security | module [Security](#/m/security), [Security bank](#/l/web-security) |

## Your six phases, as a path

1. **Phase 1, JS core:** [Execution](#/m/execution) → [Closures](#/m/closures) → [this](#/m/this-keyword) → [Prototypes](#/m/prototypes) → [Classes and OOP](#/m/classes).
2. **Phase 2, async JS:** [Event loop](#/m/event-loop) → [Promises and async/await](#/m/promises-async).
3. **Phase 3, advanced JS:** [Objects](#/m/objects) → [Types and equality](#/m/types-equality) → [Modern JS](#/m/modern-js) → [Memory and performance](#/m/memory-performance).
4. **Phase 4, Node.js:** [Node runtime](#/m/node-runtime) → [Streams and buffers](#/m/node-streams) → [Production Node](#/m/node-production).
5. **Phase 5, browser:** [Browser](#/m/browser) → [Security](#/m/security).
6. **Phase 6, React:** [React JavaScript internals](#/m/react-js).

Then practise: [Basic challenges](#/m/challenges-basic) → [Intermediate](#/m/challenges-intermediate) → [Advanced](#/m/challenges-advanced), and drill with the banks: [Core](#/m/core-bank), [Async](#/m/async-bank), [Advanced](#/m/advanced-bank), [Node](#/m/node-bank), [Web](#/m/web-bank), [Puzzles](#/m/puzzles-bank).

## "Interview-style questions after each topic"

You asked for questions after every topic instead of only theory. Here is how that is built:

- Every topic module ends with **puzzles** (predict the output) and its lessons end with a **"Say this in an interview"** answer.
- The **Q&A page** collects every question in one place, grouped by area, with filters by level.
- The **Problems page** lists all coding challenges by level (Basic, Intermediate, Advanced).
- The **banks** are the fast revision pass: short answers you can say aloud.

:::keypoints
- Week-left plan: do the **15 priorities** in order; read, run, then speak the answer.
- Everything in your tiers 1 to 9 has a place in the course; use the table to jump.
- Finish each topic with its **bank** and **puzzles**, and the coding questions from the **challenges**.
:::
