---
title: Event loop output puzzles
level: advanced
time: 45
summary: Twelve ordering puzzles that interviewers love, from easy to tricky. Use the rule (sync, all microtasks, one macrotask) and write the answer before you run each one.
---

## How to solve these

1. Mark everything **synchronous**: it runs first, top to bottom (the part of an `async` function before its first `await` is synchronous; a promise **executor** is synchronous).
2. Put each `.then`, `await` continuation and `queueMicrotask` in the **microtask queue**, in the order they become ready.
3. Put each timer in the **task queue**, ordered by delay (and then by creation order).
4. Run: sync → all microtasks → one macrotask → all microtasks → ...

If you want to see the machine run, the simulator below shows puzzle 4. Then try the others on paper.

## Puzzle 1: the warm-up

```js run title="Puzzle 1"
setTimeout(() => console.log("1"), 0);

new Promise((resolve) => {
  console.log("2");
  resolve();
}).then(() => console.log("3"));

console.log("4");
```

:::hint Show the reason
The promise **executor** is synchronous, so `2` prints during the script. Output: `2 4 3 1` (sync: 2, 4; microtask: 3; macrotask: 1).
:::

## Puzzle 2: async and await

```js run title="Puzzle 2"
async function f() {
  console.log("f1");
  await g();
  console.log("f2");
}
async function g() {
  console.log("g");
}

console.log("s1");
f();
console.log("s2");
```

:::hint Show the reason
`f()` runs synchronously until `await`: `f1`, then `g()` runs synchronously: `g`. The rest of `f` (`f2`) is a microtask. Output: `s1 f1 g s2 f2`.
:::

## Puzzle 3: timers with different delays

```js run title="Puzzle 3"
setTimeout(() => console.log("100"), 100);
setTimeout(() => console.log("0"), 0);
setTimeout(() => console.log("50"), 50);
setTimeout(() => console.log("1"), 1);
console.log("sync");
```

:::hint Show the reason
Timers fire in order of expiry time. Delay `0` is treated as `1` ms (in Node and in browsers), so `0` and `1` tie and keep **creation order**. Output: `sync 0 1 50 100`.
:::

## Puzzle 4: microtasks that start timers, and timers that start microtasks

```js run title="Puzzle 4"
Promise.resolve()
  .then(() => {
    console.log("p1");
    setTimeout(() => console.log("t1"), 0);
  })
  .then(() => console.log("p2"));

setTimeout(() => {
  console.log("t2");
  Promise.resolve().then(() => console.log("p3"));
}, 0);
```

```viz algo=eventloop title="Puzzle 4 step by step"
step | stack: main | note: Script runs. `.then(p1)` is queued as a microtask. The timer `t2` is started.
step | stack: main | micro: p1 | apis: timer t2 | note: The promise is already resolved, so `p1` waits in the **microtask queue**. `t2` is a timer.
step | stack: main | apis: - | micro: p1 | macro: t2 | note: The 0 ms timer finished: `t2` is in the **task queue**.
step | stack: - | note: The script is done. The stack is empty.
step | stack: p1 | micro: - | print: p1 | note: **All microtasks first.** `p1` prints, and creates timer `t1`. Its return resolves the next promise, so `p2` is queued.
step | stack: - | micro: p2 | apis: timer t1 | note: `p2` is now in the microtask queue.
step | stack: p2 | micro: - | apis: - | macro: t2, t1 | print: p2 | note: `p2` prints. Meanwhile timer `t1` finished too, and is queued **after** `t2` (created later).
step | stack: t2 | macro: t1 | print: t2 | note: Microtasks are empty, so take **one** task: `t2`. It prints and queues microtask `p3`.
step | stack: - | micro: p3 | note: `t2` finished. Before the next task, drain the microtasks.
step | stack: p3 | micro: - | print: p3 | note: `p3` prints.
step | stack: t1 | macro: - | print: t1 | note: Now the next task: `t1` prints. Output: **p1 p2 t2 p3 t1**.
```

:::hint Show the reason
Output: `p1 p2 t2 p3 t1`. Microtasks `p1`, `p2` run before any timer. Then `t2` runs alone, and its microtask `p3` runs before `t1`, the next timer.
:::

## Puzzle 5: await in a loop vs a promise chain

```js run title="Puzzle 5"
(async () => {
  for (let i = 0; i < 3; i++) {
    await null;
    console.log("loop", i);
  }
})();

Promise.resolve()
  .then(() => console.log("p0"))
  .then(() => console.log("p1"))
  .then(() => console.log("p2"));
```

:::hint Show the reason
Both are one microtask per step, and they **alternate**: the loop's continuation was queued first. Output: `loop 0, p0, loop 1, p1, loop 2, p2`.
:::

## Puzzle 6: catch, finally and then

```js run title="Puzzle 6"
Promise.reject(new Error("x"))
  .then(() => console.log("A"))
  .catch(() => console.log("B"))
  .finally(() => console.log("C"))
  .then(() => console.log("D"));
```

:::hint Show the reason
The rejection skips `A`, is caught by `catch` (prints `B`) which returns normally, so `finally` runs (`C`), and the chain continues with the original fulfilled value: `D`. Output: `B C D`.
:::

## Puzzle 7: async return vs return promise

```js run title="Puzzle 7"
async function a() { return 1; }
async function b() { return Promise.resolve(2); }

a().then((v) => console.log("a", v));
b().then((v) => console.log("b", v));

Promise.resolve()
  .then(() => console.log("p1"))
  .then(() => console.log("p2"))
  .then(() => console.log("p3"));
```

:::hint Show the reason
`a()` returns a promise already resolved with `1`, so its callback runs in the first tick. `b()` returns **a promise inside an async function**, which costs extra ticks to unwrap. Output: `a 1, p1, p2, b 2, p3`.
:::

## Puzzle 8: errors inside timers and promises

```js run node title="Puzzle 8"
setTimeout(() => console.log("timer"), 0);

new Promise((_, reject) => reject(new Error("fail")))
  .catch((e) => console.log("caught", e.message));

try {
  setTimeout(() => { throw new Error("in timer"); }, 0);
} catch (e) {
  console.log("never caught here");
}
process.on("uncaughtException", (e) => console.log("uncaught:", e.message));
```

:::hint Show the reason
`try/catch` does not catch errors thrown later, in a timer callback: the call stack is different by then. The promise rejection is handled by `.catch` (microtask first). Output: `caught fail`, `timer`, `uncaught: in timer`. (This uses the Node-specific `process.on`.)
:::

## Puzzle 9: setInterval and clearInterval

```js run title="Puzzle 9"
let n = 0;
const id = setInterval(() => {
  n++;
  console.log("tick", n);
  Promise.resolve().then(() => console.log("  micro after tick", n));
  if (n === 3) clearInterval(id);
}, 30);

setTimeout(() => console.log("timeout 75"), 75);
```

:::hint Show the reason
The interval fires at about 30, 60 and 90 ms. The 75 ms timeout falls between tick 2 and tick 3. After each tick, its microtask runs before the next timer. Output: `tick 1`, `micro 1`, `tick 2`, `micro 2`, `timeout 75`, `tick 3`, `micro 3`.
:::

## Puzzle 10: promise constructor, thenable and order

```js run title="Puzzle 10"
const p = new Promise((resolve) => {
  console.log(1);
  resolve("resolved");
  console.log(2);
});

p.then((v) => console.log(v));
console.log(3);

const thenable = { then(res) { console.log("thenable.then called"); res("from thenable"); } };
Promise.resolve(thenable).then((v) => console.log(v));
console.log(4);
```

:::hint Show the reason
The executor runs synchronously (`1`, `2`) and **continues after `resolve`**. `3` and `4` are sync. Then the microtasks: `p`'s callback (`resolved`); `Promise.resolve(thenable)` schedules a job that calls `thenable.then` (a microtask), which prints `thenable.then called`, and the final value arrives one tick later. Output: `1 2 3 4 resolved thenable.then called from thenable`.
:::

## Puzzle 11: queueMicrotask vs setTimeout in a loop

```js run title="Puzzle 11"
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log("timeout", i), 0);
  queueMicrotask(() => console.log("micro", i));
}
console.log("end");
```

:::hint Show the reason
All three microtasks run before any timer, even though they were created in the same loop. Output: `end, micro 0, micro 1, micro 2, timeout 0, timeout 1, timeout 2`.
:::

## Puzzle 12: the full mix

```js run title="Puzzle 12"
console.log("script start");

setTimeout(() => console.log("setTimeout 1"), 0);

new Promise((resolve) => {
  console.log("promise executor");
  resolve();
})
  .then(() => {
    console.log("then 1");
    setTimeout(() => console.log("setTimeout inside then"), 0);
    return Promise.resolve();
  })
  .then(() => console.log("then 2"));

(async () => {
  console.log("async start");
  await undefined;
  console.log("async after await");
})();

setTimeout(() => console.log("setTimeout 2"), 0);
console.log("script end");
```

:::hint Show the reason
Sync: `script start, promise executor, async start, script end`. Microtasks, in queue order: `then 1` (it creates a timer and returns a promise, which delays `then 2`), then `async after await`, then `then 2` after the extra ticks. Timers: `setTimeout 1`, `setTimeout 2`, `setTimeout inside then`. Full output: `script start, promise executor, async start, script end, then 1, async after await, then 2, setTimeout 1, setTimeout 2, setTimeout inside then`.
:::

## Habits that help

- **Write the answer, then run.** Do not run first.
- Draw **two columns**: microtasks and macrotasks. Add to the right queue as you read the code.
- Remember the special cases: the executor and the code before the first `await` are **synchronous**.
- Returning a promise from `then` or an `async` function costs **extra ticks**. If a puzzle depends on this, say so.
- In Node, add `process.nextTick` (runs before promise microtasks) and `setImmediate` (see the Node module).

:::keypoints
- Order: **sync → all microtasks → one macrotask → all microtasks → ...**
- A promise **executor** and an `async` function body (until `await`) run **synchronously**.
- **Microtasks** created by timers run before the next timer. Timers created in a microtask go behind earlier timers.
- `try/catch` cannot catch errors thrown **later** in a timer or callback.
- Equal timers run in **creation order**; `0` is treated as `1`.
:::
