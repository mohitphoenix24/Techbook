---
title: How senior JavaScript interviews work
level: easy
time: 15
summary: The kinds of questions you will get (explain, predict the output, implement, debug, design), what "senior" really means, and a simple 4-step way to answer anything.
---

A junior interview asks, "What is a closure?" A senior interview asks, "Your React component shows an old value after a click. Why? How do you fix it? What would you change so it cannot happen again?"

The topic is the same. The **depth** is different. A senior is expected to explain **why**, to know **what breaks**, and to say **what they would do instead**.

## The five kinds of questions

| Kind | Example | What the interviewer checks |
|---|---|---|
| **Explain** | "How does the event loop work?" | Do you really understand it, or only know the words? |
| **Predict the output** | A 15-line snippet with `setTimeout` and promises | Can you run the engine in your head? |
| **Implement it** | "Write `debounce`", "Write `Promise.all`", "Write a deep clone" | Can you turn ideas into correct code, with edge cases? |
| **Debug** | "This server leaks memory. Find out why." | Do you have a method, not only guesses? |
| **Design and trade-offs** | "Stream a 10 GB file to S3" or "Why not `JSON.parse(JSON.stringify(x))`?" | Do you know when to use what, and what it costs? |

## The 4-step answer

Do not memorise definitions. Use this small recipe for any concept question:

1. **One-line meaning** in simple words.
2. **A tiny example** (even on a whiteboard).
3. **The trap**: where people go wrong.
4. **Real life**: where you met it, or what you would do about it.

Let us try it for closures:

> 1. "A closure is a function that remembers the variables from the place where it was created, even after that place has finished."
> 2. `function counter() { let n = 0; return () => ++n; }`
> 3. "The trap: in a `var` loop, all callbacks share one variable."
> 4. "In React, it causes stale state inside `setTimeout` or `useEffect`, and I fix it with a ref or a functional update."

That is a senior-level answer in about 30 seconds.

## Predicting output: a method that works

Output questions are the most common warm-up. Here is a snippet. Do not run it yet.

```js run title="Predict first, then run"
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

(async () => {
  console.log("D");
  await null;
  console.log("E");
})();

console.log("F");
```

Use these rules, in this order:

1. **Run all synchronous code first**, top to bottom. `A`, then `D` (an `async` function runs synchronously until its first `await`), then `F`.
2. When the stack is empty, run **all microtasks** (promise callbacks, code after `await`): `C`, then `E`.
3. Then take **one macrotask** (a timer callback): `B`.

So the answer is `A D F C E B`. Run it to check. You will learn each rule properly in [module 9](#/m/event-loop).

## What "senior" means in an interview

- You explain **trade-offs**, not only features: "`Promise.all` is fast, but one failure rejects everything. `allSettled` waits for all."
- You think about **failure**: timeouts, retries, errors, memory, limits.
- You know **how things work underneath**: the call stack, the heap, the event loop, the prototype chain.
- You write **clean, safe code**: no hidden mutation, no leaked listeners, no unhandled rejections.
- You can **say "I don't know, but I would check it like this"** and then show a method.

:::interview How do you approach a JavaScript question you have not seen before?
"I first restate it to be sure I understood. Then I think about which part of the runtime is involved: scope, `this`, the prototype chain, or the event loop. I try a small example. I say the edge cases aloud: empty input, errors, async timing. Then I write the simplest version that works and improve it."
:::

## More interview questions on this topic

:::qa What do interviewers look for in a senior JavaScript round? {level=easy}
**Say this:** "Depth and judgement. Not only 'what is X', but why it works that way, what breaks, and what I would choose in a real project."

**In simple words:** Anyone can read the definition of a closure. A senior can say how it caused a bug in production and how to avoid it. Interviewers listen for trade-offs, failure cases and real examples.
:::

:::qa How should you answer "what is X?" questions? {level=easy}
**Say this:** "One-line meaning, a tiny example, the common trap, and where I used it."

**In simple words:** That is the 4-step answer. It keeps you short and shows depth. If the interviewer wants more, they will ask.
:::

:::qa How do you solve "predict the output" questions? {level=medium}
**Say this:** "Run synchronous code first, then all microtasks, then one macrotask, and repeat. I also keep track of scope and `this` as I go."

**In simple words:** Draw three boxes on paper: call stack, microtask queue, task queue. Put things in the right box as you read. It is slow at first, then it becomes natural.
:::

```quiz
? In the 4-step answer, what is the "trap" step for?
- To confuse the interviewer
+ To show you know where people go wrong
- To list every feature
> Knowing the traps is what separates a senior from a beginner.
? In the output snippet above, which prints first: the promise callback or the timer callback?
- The timer callback, since its delay is 0
+ The promise callback, because microtasks run before the next macrotask
- It is random
> After the synchronous code, all microtasks run before the next timer callback.
```

:::keypoints
- Senior interviews test **depth**: why it works, what breaks, what you would choose.
- Five question kinds: explain, predict the output, implement, debug, design.
- Answer with: meaning, tiny example, trap, real-life use.
- Output rule: sync code, then all microtasks, then one macrotask, repeat.
:::
