---
title: "How to answer senior questions"
level: medium
time: 25
summary: A simple structure for spoken answers, how to think aloud in coding questions, what senior interviewers look for, how to handle questions you do not know, and the questions to ask at the end.
---

At a senior level, interviewers already believe you know the **definition**. They are checking **judgement**: do you know when it breaks, what it costs, and how you would find the problem in production?

## The five-step answer

Use this for any concept question. It takes about 60 seconds.

1. **One-line answer.** The definition in one sentence.
2. **How it works.** The mechanism in two or three sentences.
3. **Example.** Five lines of code, or a real situation from your work.
4. **Trade-off or pitfall.** When it goes wrong, or what it costs.
5. **Connection.** Where it matters in real code (React, Node, performance).

### Example: "What is a closure?"

> **(1)** A closure is a function together with the variables from the place where it was created. **(2)** The function keeps a reference to that scope, so the variables stay alive as long as the function exists. **(3)** For example, `makeCounter` returns a function that increments a private `count`; nothing outside can touch `count`. **(4)** The cost is memory: if a long-lived object holds a closure that captured something big, it is never freed, and in loops with `var` all closures share one variable. **(5)** In React this shows up as stale closures in effects, where an old value is captured because a dependency was missing.

### Example: "Explain the event loop."

> **(1)** JavaScript runs one thing at a time on one call stack, and the event loop decides what runs next. **(2)** When the stack is empty it takes the next task from a queue; after each task it first runs all microtasks, which are promise callbacks and `await` continuations, and only then the next macrotask such as a timer. **(3)** So in `setTimeout(a, 0); Promise.resolve().then(b);` the promise callback `b` runs first. **(4)** The risk is blocking: a long synchronous loop freezes the page or the server, and endless microtasks can starve timers. **(5)** In Node the same idea has phases, and heavy CPU work goes to worker threads.

### Example: "Debounce or throttle?"

> **(1)** Debounce waits until activity stops and then runs once; throttle runs at most once per interval. **(2)** Both are closures around a timer. **(3)** Search boxes use debounce, scroll handlers use throttle. **(4)** The usual bugs are losing `this` and arguments, a missing trailing call in throttle, and not cancelling on unmount. **(5)** For visual updates I would rather use `requestAnimationFrame`.

## Thinking aloud in coding questions

1. **Clarify.** Ask about inputs, sizes, errors, and whether you may use built-ins. ("Can the array contain `null`? Should this mutate the input?")
2. **Examples.** Write one normal case and one edge case before coding.
3. **Plan.** Say the approach and its complexity before typing. ("I will use a Map for O(1) lookups; time O(n), space O(n).")
4. **Code.** Small functions, clear names, no clever tricks. Talk while you type.
5. **Test.** Walk through your examples by hand, then the edge cases (empty, one item, duplicates, `undefined`, very large).
6. **Improve.** Mention what you would add with more time: types, error handling, performance, tests.

If you get stuck, say so: "I am stuck on how to keep the order; let me try a simple example." Interviewers help people who communicate.

## What senior interviewers look for

| Signal | How to show it |
|---|---|
| **Depth** | Explain the mechanism, not just the name. Use the correct terms (microtask, reference, descriptor). |
| **Trade-offs** | Say "it depends" and then say **on what**: data size, team, latency, consistency. |
| **Failure thinking** | Mention what happens on error, timeout, retry, race, memory growth. |
| **Measurement** | "I would profile first" and name the tool: Performance panel, heap snapshot, `--cpu-prof`. |
| **Simplicity** | Choose the plain solution and say when you would use the complex one. |
| **Ownership** | Use "I" for what you did; give numbers (latency from 800 ms to 200 ms). |
| **Communication** | Short sentences, structure, check that the listener follows. |

## When you do not know the answer

1. Say what you **do** know about it: "I have not used `WeakRef` in production, but I know it holds an object without keeping it alive."
2. **Reason out loud** from a related idea: "It is probably similar to how `WeakMap` works, so the callback timing would not be guaranteed."
3. Say how you would **find out**: "I would check MDN and write a small experiment."
4. Never invent a confident wrong answer. Honest and reasoned beats confident and wrong.

## Telling stories from your work

Use **STAR with technical detail**: **S**ituation (one line), **T**ask (your responsibility), **A**ction (the technical steps, with reasons), **R**esult (numbers, and what you learned).

> "Our search page was slow (S). I was asked to fix it before a launch (T). I profiled it and saw that every keystroke called the API and that old responses overwrote new ones, so I added a debounce, cancelled the previous request with `AbortController`, and cached recent queries (A). Median time to results went from 900 ms to 250 ms and wrong results disappeared; I also added a test for the race (R)."

Prepare **three** stories: a hard bug, a performance improvement, a design disagreement or trade-off. Practise them aloud until each takes two minutes.

## Questions to ask the interviewer

- "What does a good first six months look like in this role?"
- "How do you handle production incidents and on-call?"
- "How are technical decisions made and documented?"
- "What is the hardest technical problem the team has right now?"
- "How do you test and release changes?"

## Common mistakes

- Reciting definitions with no example.
- Talking for five minutes without checking if the interviewer wants more or less.
- Starting to code before understanding the problem.
- Saying "I would use library X" without knowing what it does inside. (Use the [challenges](#/m/challenges-basic) to learn the insides.)
- Ignoring errors, edge cases and performance until asked.
- Memorising "weird" puzzle answers instead of understanding the rule behind them.

:::keypoints
- Answer in five steps: **one line, mechanism, example, trade-off, connection**.
- In coding rounds: **clarify, examples, plan, code, test, improve**, while talking.
- Seniors are judged on **trade-offs, failure modes and measurement**.
- If you do not know: say what you know, **reason**, and say how you would **find out**.
- Prepare **three STAR stories** with numbers.
:::
