---
title: Welcome, and how to use this course
level: easy
time: 10
summary: What JSLab teaches, how every lesson is built, how to study from it, and how to run the examples on your own computer.
---

This course is built for one goal: to help you clear the **JavaScript part of a senior full-stack interview** (MERN, React, Node.js). You do not need to learn "all of JavaScript". You need the parts interviewers really use to test your depth, your debugging skill, your async thinking and your design sense.

:::analogy Think of it like this
Learning JavaScript for an interview is like learning to drive in a big city. You do not need to know every lane in every town. You need to know the main roads very well (execution context, closures, `this`, the event loop), and what to do when something goes wrong (memory leaks, errors, race conditions).
:::

## What is inside

| Part | Modules | What you get |
|---|---|---|
| **I. Core JavaScript** | 2 to 8 | How code runs, hoisting, scope, closures, `this`, prototypes, classes, functions, arrays and functional ideas |
| **II. Async JavaScript** | 9 and 10 | The call stack, the event loop, microtasks and macrotasks, promises, `async/await`, `Promise.all` and friends, cancellation and retries |
| **III. Advanced JavaScript** | 11 to 14 | Objects and property descriptors, copying, equality and coercion, iterators, generators, symbols, Proxy, memory and garbage collection, debounce, throttle, memoization, workers |
| **IV. Node.js** | 15 to 17 | The Node event loop, modules (CommonJS and ESM), buffers, streams and backpressure, error handling, worker threads, performance |
| **V. Browser, security, React** | 18 to 20 | DOM events, storage, CORS, caching, XSS, CSRF, cookies, JWT, prototype pollution, and the JavaScript behind React |
| **VI. Practice** | 21 to 29 | Coding challenges (write debounce, curry, `Promise.all`, an event emitter, an LRU cache...), and question banks with output puzzles and find-the-bug drills |
| **VII. Plan** | 30 | Study schedules, including the "interview next week" plan |

You can jump to the [Interview Q&A](#/qa) page at any time. It collects every question in the course.

## How every lesson is built

1. **A picture or an everyday example first**, in plain words.
2. **Small programs you can run.** Press **Run**, then change the code and press **Run** again.
3. **The exact rules and the traps**, with the mistakes people make.
4. **A "Say this in an interview" box**: a short answer you can speak aloud.
5. **More interview questions** on the topic, a **quick quiz** and **key points**.

:::note The code is real
Every example was run with **Node.js 22** when the course was built, and the output you see is what Node printed. Examples are run twice, and the two outputs must match, so the output never depends on luck. If you **edit** an example and press Run, it runs live in your browser instead.
:::

## Your first example

Read this once and guess the order of the four lines. Then press **Run**.

```js run title="Which line prints first?"
console.log("1: start");

setTimeout(() => console.log("4: timeout"), 0);

Promise.resolve().then(() => console.log("3: promise"));

console.log("2: end");
```

Did you expect `timeout` before `promise`? Many people do, because the timer says `0` milliseconds. The promise callback still goes first. By the end of module 9 you will be able to predict this without running anything, and explain **why**.

## Running the code on your own computer

You do not have to install anything to use this site. But for practice, Node.js on your computer is best:

```bash
# check the version (use Node 20 or newer)
node --version

# save any example as main.js and run it
node main.js

# for code that uses import/export, save it as main.mjs
node main.mjs
```

:::tip A good habit
Do not just read. For each example: **guess** the output first, run it, then **change one thing** and guess again. Guessing before running is what builds the skill that interviews test.
:::

## How to study with this course

- **One week left?** Open the [15 priorities](#/l/roadmap-and-priorities) and the [study plans](#/l/study-plans). Do those topics, then drill the Q&A bank.
- **Two to four weeks?** Follow the modules in order. After each module, open the Q&A page and answer its questions aloud.
- **Already good, want to polish?** Go to the [coding challenges](#/problems) and the output puzzles. Write each solution yourself before you read ours.

:::keypoints
- JSLab is focused on what **senior JavaScript interviews** test, not on every corner of the language.
- Every lesson: example first, rules next, a short interview answer, more questions, a quiz.
- All examples were run with real Node.js 22. Edit them to run live in your browser.
- Guess first, then run. That is the skill being tested.
:::
