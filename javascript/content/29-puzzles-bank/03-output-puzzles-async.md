---
title: "Puzzles: the order of async code"
level: hard
time: 35
summary: Twelve puzzles on microtasks and macrotasks, promise chains, await, returning promises from then, try/catch with return await, forEach with async callbacks, finally and Node's nextTick.
---

**Rule of thumb for all of them:** run the synchronous code first, then **all** microtasks (promise callbacks, `await` continuations), then the next timer. Draw the two queues on paper.

## Puzzle 1: the classic

```js run title="Puzzle 1"
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
console.log("D");
```

:::hint Show the reason
Synchronous: `A`, `D`. Then the microtask `C`. Then the timer `B`. Output: `A D C B`.
:::

## Puzzle 2: code before the first await is synchronous

```js run title="Puzzle 2"
async function f() { console.log(1); await null; console.log(2); }
console.log(0);
f();
console.log(3);
```

:::hint Show the reason
An async function runs synchronously until its first `await`. So `0`, then `1` (inside `f`), then `f` pauses and control returns: `3`. The rest of `f` (`2`) is a microtask. Output: `0 1 3 2`.
:::

## Puzzle 3: two chains take turns

```js run title="Puzzle 3"
Promise.resolve().then(() => console.log("a1")).then(() => console.log("a2"));
Promise.resolve().then(() => console.log("b1")).then(() => console.log("b2"));
```

:::hint Show the reason
Both first handlers are queued immediately: `a1`, `b1`. Each `then` queues the next one only after the previous handler finishes, so the second round gives `a2`, `b2`. Output: `a1 b1 a2 b2`.
:::

## Puzzle 4: returning a promise costs extra turns

```js run title="Puzzle 4"
Promise.resolve()
  .then(() => { console.log("x1"); return Promise.resolve("v"); })
  .then(() => console.log("x2"));

Promise.resolve()
  .then(() => console.log("y1"))
  .then(() => console.log("y2"))
  .then(() => console.log("y3"))
  .then(() => console.log("y4"));
```

:::hint Show the reason
Returning a promise from `then` makes the outer promise follow it, which takes about two additional microtask turns. So the `y` chain overtakes: `x1 y1 y2 y3 x2 y4`. Returning a plain value would have given `x1 y1 x2 y2 ...`.
:::

## Puzzle 5: a mixed script

```js run title="Puzzle 5"
async function a1() { console.log("a1 start"); await a2(); console.log("a1 end"); }
async function a2() { console.log("a2"); }
console.log("script start");
setTimeout(() => console.log("timeout"), 0);
a1();
new Promise((resolve) => { console.log("p1"); resolve(); }).then(() => console.log("p2"));
console.log("script end");
```

:::hint Show the reason
Synchronously: `script start`, `a1 start`, `a2` (a2's body runs at once), `p1` (the executor is synchronous), `script end`. Microtasks, in the order they were queued: the continuation of `a1` (`a1 end`), then `p2`. Last, the timer. Output order: `script start, a1 start, a2, p1, script end, a1 end, p2, timeout`.
:::

## Puzzle 6: return versus return await inside try

```js run title="Puzzle 6"
const fail = async () => { throw new Error("boom"); };
async function noAwait() { try { return fail(); } catch { return "caught A"; } }
async function withAwait() { try { return await fail(); } catch { return "caught B"; } }

console.log(await withAwait());
await noAwait().then(console.log, (e) => console.log("rejected:", e.message));
```

:::hint Show the reason
`return fail()` hands back the promise without waiting, so the rejection happens after the `try` block has been left: the `catch` never runs, and the caller sees `rejected: boom`. `return await fail()` waits inside the `try`, so the `catch` handles it: `caught B`.
:::

## Puzzle 7: forEach does not wait

```js run title="Puzzle 7"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
[30, 10, 20].forEach(async (ms) => { await sleep(ms); log.push(ms); });
console.log("after forEach:", log.length);
await sleep(80);
console.log(log);
```

:::hint Show the reason
`forEach` ignores the promises returned by the async callbacks, so it returns at once with nothing done (`0`). All three sleeps run in parallel, so they finish in time order, not array order: `[ 10, 20, 30 ]`.
:::

## Puzzle 8: the executor runs at once

```js run title="Puzzle 8"
const p = new Promise((resolve) => {
  console.log("executor");
  resolve("done");
  console.log("after resolve");
});
p.then((v) => console.log(v));
console.log("end");
```

:::hint Show the reason
The executor is synchronous and keeps running after `resolve` is called. Only the `then` handler is deferred. Output: `executor`, `after resolve`, `end`, `done`.
:::

## Puzzle 9: timers by delay

```js run title="Puzzle 9"
setTimeout(() => console.log("t20"), 20);
setTimeout(() => console.log("t10"), 10);
setTimeout(() => console.log("t0"), 0);
```

:::hint Show the reason
Timers fire in order of their due time, not the order they were written. Output: `t0 t10 t20`.
:::

## Puzzle 10: finally keeps the value

```js run title="Puzzle 10"
const v = await Promise.resolve("v").finally(() => "ignored");
console.log("then:", v);
try {
  await Promise.reject(new Error("e")).finally(() => console.log("cleanup"));
} catch (e) {
  console.log("catch:", e.message);
}
```

:::hint Show the reason
`finally` runs for both outcomes and passes the original value or error through; its own return value is ignored (unless it throws or returns a rejected promise). Output: `then: v`, `cleanup`, `catch: e`.
:::

## Puzzle 11: an error inside then

```js run title="Puzzle 11"
Promise.resolve(1)
  .then((x) => { console.log("first", x); throw new Error("oops"); })
  .then(() => console.log("skipped"))
  .catch((e) => { console.log("catch", e.message); return "recovered"; })
  .then((x) => console.log("after catch", x));
```

:::hint Show the reason
A throw turns the chain into a rejection, which skips ordinary `then` handlers until a `catch`. The `catch` returns a value, so the chain becomes fulfilled again. Output: `first 1`, `catch oops`, `after catch recovered`.
:::

## Puzzle 12: nextTick, promises and setImmediate (Node)

```js run cjs node title="Puzzle 12 (Node, CommonJS)"
Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));
setImmediate(() => console.log("immediate"));
console.log("sync");
```

:::hint Show the reason
After the synchronous code, Node drains the `nextTick` queue first, then the promise microtasks, and `setImmediate` runs in the check phase of the event loop. Output: `sync`, `nextTick`, `promise`, `immediate`. (In an ES module, promises run before `nextTick`, because the module itself is evaluated inside a promise job.)
:::

:::keypoints
- **Sync → microtasks (all) → next timer.**
- Code before the first `await` is synchronous; the rest is a microtask.
- `return promise` inside a `then` costs extra turns; `return await` inside `try` makes `catch` work.
- `forEach(async …)` does not wait; `finally` passes the result through.
- Node: **`nextTick` before promises** (CommonJS).
:::
