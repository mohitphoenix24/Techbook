---
title: "Rapid fire: 60 one-line answers"
level: easy
time: 25
summary: Sixty quick questions with one-line answers, grouped by topic. Use them as a warm-up before an interview, or cover the right column and test yourself.
---

Cover the right column. Answer aloud in **one sentence**. If you need more, you have found a topic to revise.

## Language basics

| Question | One-line answer |
|---|---|
| Name the primitive types. | string, number, bigint, boolean, undefined, null, symbol |
| `typeof null`? | `'object'`, a historical bug |
| `var` vs `let`? | function scope and hoisted as undefined vs block scope and TDZ |
| Does `const` make objects immutable? | No, it only fixes the binding |
| What is hoisting? | Declarations are registered before the code runs |
| What is the TDZ? | The time a `let`/`const` exists but cannot be read yet |
| `==` vs `===`? | Loose with coercion vs strict with no conversion |
| Why is `NaN !== NaN`? | IEEE 754 says NaN is not equal to anything; use `Number.isNaN` |
| `null` vs `undefined`? | Intentional empty vs not assigned |
| Falsy values? | `false 0 -0 0n '' null undefined NaN` |
| `??` vs `or`? | `??` only for null/undefined; `or` for any falsy value |
| What does `?.` do? | Stops and returns undefined if the left side is null or undefined |

## Functions and this

| Question | One-line answer |
|---|---|
| What is a closure? | A function plus the variables of the scope where it was created |
| What is a pure function? | Same input, same output, no side effects |
| What is currying? | `f(a, b, c)` becomes `f(a)(b)(c)` |
| What is a higher-order function? | A function that takes or returns a function |
| Arrow function and `this`? | No own `this`; it uses the outer one |
| `call` vs `apply` vs `bind`? | Call now with list, call now with array, return a new function |
| Can you re-bind a bound function? | No, the first bind wins (except with `new`) |
| What does `new` do? | Create object, link prototype, run constructor, return it |
| What is an IIFE? | A function that runs as soon as it is defined |
| Rest vs spread? | Rest gathers arguments; spread expands an iterable |
| Default parameter trigger? | Only `undefined`, not `null` |
| Why avoid `arguments`? | Not a real array and not in arrows; use rest parameters |

## Objects and prototypes

| Question | One-line answer |
|---|---|
| What is the prototype chain? | The linked objects searched when a property is missing |
| `__proto__` vs `prototype`? | The object's actual link vs the template on a constructor |
| What does `Object.create(null)` give? | An object with no prototype, a clean dictionary |
| Are classes real classes? | Syntax over prototypes |
| Shallow vs deep copy? | Top level only vs everything; use `structuredClone` |
| What does `Object.freeze` do? | Makes own properties read-only, shallowly |
| Own property check? | `Object.hasOwn(obj, key)` |
| What is a Symbol? | A unique primitive, used for collision-free keys and hooks |
| `Map` vs object? | Any key type, ordered, `size`, no inherited keys |
| `WeakMap` purpose? | Metadata on objects without preventing garbage collection |
| What is a getter? | A property computed by a function when read |
| What is a Proxy? | An object that intercepts operations on another object |

## Async

| Question | One-line answer |
|---|---|
| Is JavaScript multi-threaded? | Your code runs on one thread; I/O is handled outside |
| Microtask vs macrotask? | Promise callbacks first, then timers and I/O |
| What does `async` return? | Always a promise |
| What does `await` do? | Pauses the function until the promise settles, without blocking the thread |
| `Promise.all` vs `allSettled`? | Fails fast vs reports every outcome |
| `Promise.race` vs `any`? | First to settle vs first to succeed |
| Can you cancel a promise? | No; cancel the work with `AbortController` |
| Why does `forEach(async ...)` fail to wait? | It ignores the returned promises |
| `setTimeout(fn, 0)` runs when? | After the current code and all microtasks |
| What is an unhandled rejection? | A rejected promise with no handler; it can crash Node |
| `process.nextTick` vs promises? | nextTick runs first in Node (CommonJS) |
| What is backpressure? | The consumer telling the producer to slow down |

## Browser, Node and React

| Question | One-line answer |
|---|---|
| Capture vs bubble? | Down from the window to the target, then back up |
| What is event delegation? | One listener on a parent, using `event.target.closest` |
| `defer` vs `async` script? | Run in order after parsing vs run when downloaded |
| What is CORS? | The server telling the browser who may read its responses |
| `localStorage` risk? | Any script (XSS) can read it |
| `HttpOnly` cookie? | Not readable by JavaScript |
| XSS vs CSRF? | Attacker script in your page vs forged request from another site |
| What does `SameSite` do? | Limits sending cookies on cross-site requests |
| What blocks the Node event loop? | Long synchronous work such as big JSON or sync I/O |
| `pipe` vs `pipeline`? | `pipeline` forwards errors and cleans up |
| What is a graceful shutdown? | Stop new requests, finish current ones, close resources, exit |
| Why do React keys matter? | They identify list items so state stays with the right item |

:::keypoints
- Aim for **one clear sentence** per question; then add **one example** if asked.
- Mark every question you hesitated on, and revise that topic's lesson.
:::
