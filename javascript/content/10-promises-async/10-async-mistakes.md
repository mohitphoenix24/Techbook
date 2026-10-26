---
title: Ten common async mistakes
level: advanced
time: 30
summary: The async bugs seen in code reviews and interviews (forEach with await, floating promises, race conditions, check-then-act, shared state, unawaited returns), each with a failing example and a fix.
---

Each example shows the **bug**, what goes wrong, and the **fix**.

## 1. `forEach` with `async`

```js run title="Bug: forEach does not wait"
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const saved = [];
  [1, 2, 3].forEach(async (n) => { await wait(10); saved.push(n); });
  console.log("bug: saved so far =", saved);                         // empty!

  const fixed = [];
  for (const n of [1, 2, 3]) { await wait(10); fixed.push(n); }      // or await Promise.all(map(...))
  console.log("fix: saved =", fixed);
})();
```

## 2. Forgetting `await` (a floating promise)

```js run title="Bug: the promise is created but nobody waits for it"
const save = (user) => new Promise((resolve) => setTimeout(() => { console.log("saved", user); resolve(); }, 20));

(async () => {
  save("asha");                                  // forgot await
  console.log("responded to the client");        // prints BEFORE the save finished
  await save("ravi");                            // fix
  console.log("responded after save");
})();
```

Consequences: the response is sent before the work is done, and if `save` rejects, the error is an **unhandled rejection**. Use the ESLint rule `@typescript-eslint/no-floating-promises` or `require-await`.

## 3. Using `await` in a non-async callback

```js run title="Bug: await inside a normal callback is a syntax error" expect-error
const items = [1, 2, 3];
items.map((n) => await Promise.resolve(n));        // SyntaxError: await is only valid in async functions
```

Fix: `await Promise.all(items.map(async (n) => await work(n)))`.

## 4. Sequential awaits that could be parallel

(See the earlier lesson: independent calls should use `Promise.all`.)

```js run title="Bug: needless serial awaits"
const get = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
(async () => {
  let t = Date.now();
  const a = await get(60, "a");
  const b = await get(60, "b");
  console.log("serial:", Date.now() - t >= 110, [a, b]);

  t = Date.now();
  const [c, d] = await Promise.all([get(60, "c"), get(60, "d")]);
  console.log("parallel:", Date.now() - t < 110, [c, d]);
})();
```

## 5. Race: check-then-act with `await` in between

A classic: between the **check** and the **update**, another call can sneak in.

```js run title="Bug: two withdrawals both pass the check"
let balance = 100;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withdraw(amount) {
  if (balance >= amount) {          // check
    await wait(10);                 // pretend: a call to a bank API (other code runs now!)
    balance -= amount;              // act: the check is out of date
    return "ok";
  }
  return "insufficient funds";
}

(async () => {
  const results = await Promise.all([withdraw(80), withdraw(80)]);
  console.log(results, "balance:", balance);          // both succeeded: -60
})();
```

JavaScript is single-threaded, but **`await` is a point where other code can run**, so races are still possible. Fixes: do the check and the update **without an `await` in between**, serialise with a **mutex/queue**, or use an **atomic operation in the database** (a conditional update).

```js run title="Fix: serialise with a promise queue (mutex)"
let balance = 100;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});          // keep the chain alive even if fn fails
  return run;
}

async function withdraw(amount) {
  return withLock(async () => {
    if (balance < amount) return "insufficient funds";
    await wait(10);
    balance -= amount;
    return "ok";
  });
}

(async () => {
  const results = await Promise.all([withdraw(80), withdraw(80)]);
  console.log(results, "balance:", balance);
})();
```

## 6. Out-of-order responses (stale results)

```js run title="Bug: the slower, older request wins"
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let shown = "";

async function search(q, ms) { await delay(ms); shown = `results for ${q}`; }

(async () => {
  await Promise.all([search("ja", 40), search("jav", 10)]);
  console.log("bug:", shown);                           // "ja": the older request finished last

  let latest = 0;
  async function searchSafe(q, ms) {
    const id = ++latest;
    await delay(ms);
    if (id === latest) shown = `results for ${q}`;       // only the newest request may update
  }
  await Promise.all([searchSafe("ja", 40), searchSafe("jav", 10)]);
  console.log("fix:", shown);
})();
```

## 7. Mixing `await` and `.then` carelessly, and forgetting `return`

```js run title="Bug: inner promise is not returned"
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

async function bad() {
  wait(20, "inner").then((v) => console.log("inner finished", v));    // not awaited
  return "outer value";                                               // returns before inner
}

async function good() {
  const v = await wait(20, "inner");
  console.log("inner finished", v);
  return "outer value";
}

(async () => { console.log(await bad()); console.log(await good()); })();
```

## 8. `async` in the wrong place: promises inside `new Promise` executors

```js run node title="Bug: async executor loses errors"
// an async executor: a throw inside becomes an unhandled rejection of a different promise
const bad = new Promise(async (resolve) => {
  throw new Error("lost in the async executor");       // the outer promise stays pending forever
  resolve(1);
});

setTimeout(() => console.log("bad is still pending after 30 ms"), 30);
process.on?.("unhandledRejection", () => {});          // silence the demo
```

Fix: do not pass an `async` function to `new Promise`. Write `async function` and use `await`, or `new Promise` with normal code.

## 9. Async work in a constructor or in a getter

```js run title="Fix: a static async factory"
class Connection {
  #url;
  constructor(url) { this.#url = url; }              // synchronous and cheap
  static async open(url) {
    await new Promise((r) => setTimeout(r, 10));     // the async work lives here
    return new Connection(url);
  }
  get url() { return this.#url; }
}

Connection.open("db://localhost").then((c) => console.log("ready:", c.url));
```

## 10. Shared state mutated by concurrent async calls

```js run title="Bug: concurrent calls share one variable"
let current = null;                                    // shared, module-level
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function process(id) {
  current = id;                                         // stored in a shared variable
  await wait(10 - id);
  return `processing ${id}, current is ${current}`;     // another call may have changed it
}

(async () => {
  console.log(await Promise.all([process(1), process(2), process(3)]));
})();
```

Fix: keep state **local** to each call (function variables), or pass it as parameters. Shared mutable state plus `await` is a recipe for races.

## A checklist for reviewing async code

- Every promise is **awaited, returned or `.catch`ed**.
- No `async` callbacks in `forEach`. Use `for...of` or `Promise.all(map())`.
- **Independent** work is parallel; **dependent** work is sequential.
- No `await` between a **check** and the **update** that depends on it (or protect it).
- Old responses cannot overwrite new ones (request id, `AbortController`).
- Errors are handled once, at the right level, and never swallowed.
- Limits on concurrency, and timeouts on every network call.

:::interview What async mistakes have you seen, and how do you prevent them?
"The most common are `forEach` with `async` callbacks that do not wait, floating promises that were never awaited so errors become unhandled rejections, serial awaits for independent calls that waste time, and race conditions where a slow old response overwrites a newer one or two calls pass a check before either updates state, because `await` lets other code run. I prevent them with `for...of` or `Promise.all`, lint rules for floating promises, request ids or `AbortController`, serialising critical sections or using atomic database operations, and keeping state local to each call."
:::

## More interview questions on this topic

:::qa JavaScript is single-threaded. Can race conditions still happen? {level=medium}
**Say this:** "Yes. Each synchronous piece runs without interruption, but `await` and callbacks let other code run in between, so state can change between a check and an update."

**In simple words:** No two things run at the same instant, but they can take turns in the middle of your job.
:::

:::qa What is a floating promise and why is it dangerous? {level=easy}
**Say this:** "A promise that is created but not awaited, returned or caught. The caller does not wait for it, and if it rejects, nobody handles it, causing an unhandled rejection."

**In simple words:** Work started and forgotten.
:::

:::qa Why not pass an async function to `new Promise`? {level=hard}
**Say this:** "Errors thrown inside an async executor reject the executor's own hidden promise, not the one you created, so they become unhandled and your promise may never settle. Use async functions directly instead."

**In simple words:** The error goes to the wrong promise.
:::

:::qa How do you prevent an old search response from replacing a newer one? {level=medium}
**Say this:** "Track the latest request with an id (or abort the older request with an `AbortController`) and ignore responses that are not the latest."

**In simple words:** Only the answer to the latest question counts.
:::

```quiz
? Why can `await` cause race conditions in single-threaded JS?
- It starts a new thread
+ Other code can run between the check and the update
- It is not allowed
> Each await is a point where other callbacks run.
? What is the fix for async work needed in a constructor?
- await in the constructor
+ A static async factory method
- A setTimeout
> Constructors cannot be async.
? What does `forEach(async ...)` return to the caller?
- A promise for all items
+ Nothing: it does not wait for the callbacks
- An array of promises
> It returns undefined and ignores the promises.
```

:::keypoints
- The big ten: **forEach+async, floating promises, await in non-async callbacks, needless serial awaits, check-then-act races, stale responses, missing return/await, async executors, async constructors, shared mutable state**.
- **`await` is a yield point**: state can change across it.
- Fixes: `for...of`/`Promise.all`, request ids / `AbortController`, mutex or atomic DB ops, local state, static async factories.
- Use lint rules (`no-floating-promises`) and code review checklists.
:::
