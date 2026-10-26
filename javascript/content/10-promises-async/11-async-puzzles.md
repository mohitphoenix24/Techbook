---
title: Promise and async/await puzzles
level: advanced
time: 35
summary: Twelve puzzles on promise chains, errors, finally, async return values, await ordering and combinators. Predict the order and the values before running.
---

## Puzzle 1: values through a chain

```js run title="Puzzle 1"
Promise.resolve(1)
  .then((x) => x + 1)
  .then((x) => { throw new Error("oops " + x); })
  .then((x) => console.log("A", x))
  .catch((e) => { console.log("B", e.message); return 10; })
  .then((x) => console.log("C", x))
  .finally(() => console.log("D"));
```

:::hint Show the reason
`1 → 2`, then a throw with `x = 2` skips `A`. `catch` prints `B oops 2` and returns `10`, so `C 10`, then `finally` prints `D`. Output: `B oops 2`, `C 10`, `D`.
:::

## Puzzle 2: then with two arguments

```js run title="Puzzle 2"
Promise.reject(new Error("first"))
  .then(
    () => console.log("success"),
    (e) => { console.log("handler:", e.message); throw new Error("second"); },
  )
  .catch((e) => console.log("catch:", e.message))
  .then(() => console.log("end"));
```

:::hint Show the reason
The rejection handler runs and re-throws `second`, caught by the `catch`, which recovers, so `end` prints. Output: `handler: first`, `catch: second`, `end`.
:::

## Puzzle 3: return vs no return

```js run title="Puzzle 3"
const p = (v, ms = 10) => new Promise((r) => setTimeout(() => r(v), ms));

p("a")
  .then((v) => { p(v + "b"); })                 // no return
  .then((v) => console.log("1:", v));

p("a")
  .then((v) => p(v + "b"))                      // returned
  .then((v) => console.log("2:", v));
```

:::hint Show the reason
Without `return`, the next step receives `undefined` right away: `1: undefined`. With the return, the chain waits: `2: ab`. Output: `1: undefined` first, then `2: ab`.
:::

## Puzzle 4: finally keeps the value

```js run title="Puzzle 4"
Promise.resolve("value")
  .finally(() => "ignored return value")
  .then((v) => console.log("then:", v));

Promise.resolve("ok")
  .finally(() => { throw new Error("finally threw"); })
  .then((v) => console.log("never", v), (e) => console.log("rejected:", e.message));
```

:::hint Show the reason
A normal return from `finally` is ignored: the original value passes through (`then: value`). But throwing in `finally` replaces the result with a rejection (`rejected: finally threw`). Order: the rejected line prints **first**, because `finally` waits for its callback's result and needs a couple of extra microtask ticks to pass a value through, while a throw rejects at once. Output: `rejected: finally threw`, then `then: value`.
:::

## Puzzle 5: async function return types

```js run title="Puzzle 5"
async function a() { return 1; }
async function b() { throw new Error("b failed"); }
async function c() { return Promise.reject(new Error("c failed")); }

console.log(a() instanceof Promise);
a().then((v) => console.log("a", v));
b().catch((e) => console.log("b", e.message));
c().catch((e) => console.log("c", e.message));
```

:::hint Show the reason
Async functions always return promises: `true`. `a` fulfils, `b` rejects through `throw`, and `c` follows a rejected promise. Order of microtasks: `a 1`, `b b failed`, `c c failed` (c needs extra ticks).
:::

## Puzzle 6: await in a loop and the sync part

```js run title="Puzzle 6"
async function run() {
  console.log("run start");
  for (const n of [1, 2]) {
    console.log("before await", n);
    await null;
    console.log("after await", n);
  }
  console.log("run end");
}

run();
console.log("main end");
```

:::hint Show the reason
Everything until the first `await` runs synchronously. Output: `run start`, `before await 1`, `main end`, `after await 1`, `before await 2`, `after await 2`, `run end`.
:::

## Puzzle 7: Promise.all order and fail-fast

```js run title="Puzzle 7"
const wait = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));

Promise.all([wait(30, "A"), wait(10, "B"), wait(20, "C")]).then((r) => console.log("all:", r));
Promise.all([wait(30, "D"), wait(10, "E", true), wait(20, "F")]).catch((e) => console.log("failed with:", e.message));
Promise.race([wait(20, "G"), wait(10, "H")]).then((v) => console.log("race:", v));
Promise.any([wait(10, "I", true), wait(25, "J")]).then((v) => console.log("any:", v));
```

:::hint Show the reason
By time: at 10 ms `E` rejects the second `all` (`failed with: E`) and `H` wins the race (`race: H`); the order of these two lines follows creation order of the timers. At 25 ms `J` wins `any` (`any: J`). At 30 ms the first `all` finishes with the **input order**: `all: [ 'A', 'B', 'C' ]`.
:::

## Puzzle 8: an unusual await target

```js run title="Puzzle 8"
(async () => {
  const thenable = { then(resolve) { console.log("then called"); resolve("x"); } };
  console.log("before");
  const v = await thenable;
  console.log("after", v);
})();
console.log("sync end");
```

:::hint Show the reason
`before` is printed synchronously, then `sync end`. The `then` method of a thenable is called in a **microtask** (a job), so `then called` appears next, then `after x`. Output: `before`, `sync end`, `then called`, `after x`.
:::

## Puzzle 9: error timing

```js run node title="Puzzle 9"
async function f() {
  try {
    setTimeout(() => { throw new Error("late error"); }, 0);
    await Promise.reject(new Error("awaited error"));
  } catch (e) {
    console.log("caught:", e.message);
  }
  console.log("f end");
}

process.on?.("uncaughtException", (e) => console.log("global:", e.message));
f();
```

:::hint Show the reason
The awaited rejection is thrown inside the `try` and caught. `f end` follows (microtasks). The `setTimeout` error is thrown **later** from a timer callback, with no try/catch around it, so it becomes an uncaught exception. Output: `caught: awaited error`, `f end`, `global: late error`. (Uses `process.on`, which exists in Node.)
:::

## Puzzle 10: Promise.resolve with a promise

```js run title="Puzzle 10"
const p1 = Promise.resolve(1);
const p2 = Promise.resolve(p1);
const p3 = new Promise((resolve) => resolve(p1));

console.log(p1 === p2, p1 === p3);
```

:::hint Show the reason
`Promise.resolve(promise)` returns the **same** promise. But `new Promise` always creates a **new** one that follows `p1`. Output: `true false`.
:::

## Puzzle 11: await vs then ticks

```js run title="Puzzle 11"
async function async1() {
  console.log("async1 start");
  await async2();
  console.log("async1 end");
}
async function async2() { console.log("async2"); }

console.log("script start");
setTimeout(() => console.log("setTimeout"), 0);
async1();
new Promise((resolve) => { console.log("promise1"); resolve(); }).then(() => console.log("promise2"));
console.log("script end");
```

:::hint Show the reason
The famous interview question. Sync: `script start, async1 start, async2, promise1, script end`. Microtasks: `async1 end` was queued before `promise2`, so `async1 end`, then `promise2`. Then the timer: `setTimeout`. Full: `script start, async1 start, async2, promise1, script end, async1 end, promise2, setTimeout`.
:::

## Puzzle 12: sequential vs parallel timing

```js run title="Puzzle 12"
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  await wait(50);
  await wait(50);
  const seq = Date.now() - t0;

  const t1 = Date.now();
  await Promise.all([wait(50), wait(50)]);
  const par = Date.now() - t1;

  console.log(seq >= 95 ? "sequential ~100 ms" : "too fast?", par < 90 ? "parallel ~50 ms" : "too slow?");
})();
```

:::hint Show the reason
Two awaited 50 ms waits add up to about 100 ms. Two parallel waits take about 50 ms. Output: `sequential ~100 ms parallel ~50 ms`.
:::

:::keypoints
- A **returned value** continues the chain; a **throw** skips to the next rejection handler; **`catch` returning normally recovers**.
- **`finally`** passes values through; throwing inside it replaces the result.
- **`async` functions** always return promises; code before the first `await` is synchronous.
- `Promise.resolve(p) === p`, but `new Promise(r => r(p))` is a different promise.
- `Promise.all` keeps input order and fails fast; `race` and `any` follow the first settled/fulfilled.
:::
