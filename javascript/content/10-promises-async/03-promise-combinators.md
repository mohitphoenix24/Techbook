---
title: Promise.all, allSettled, race and any
level: intermediate
time: 30
summary: The four combinators, exactly when each one resolves or rejects, what they return, how to choose between them, and how to write each one yourself.
---

## Why combinators?

Often you have **several** async jobs and you want to react to them together: load three APIs before showing a page, or use whichever server answers first. The `Promise` static methods do this.

| Method | Fulfils when | Rejects when | Result |
|---|---|---|---|
| `Promise.all(list)` | **all** fulfil | **any one** rejects (fail fast) | array of values, in order |
| `Promise.allSettled(list)` | **all** are settled (never rejects) | never | array of `{status, value/reason}` |
| `Promise.race(list)` | the **first** one settles with a value | the **first** one settles with an error | that one value/error |
| `Promise.any(list)` | the **first fulfilment** | **all** reject | the first value; else `AggregateError` |

```js run title="A helper to build timed promises for the examples"
const ok = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const fail = (ms, msg) => new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

// Promise.all: wait for everything
(async () => {
  const results = await Promise.all([ok(30, "users"), ok(10, "orders"), ok(20, "stats")]);
  console.log("all:", results);                              // order of the input, not of finishing
})();
```

## `Promise.all`: all or nothing

```js run title="Promise.all fails fast"
const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), ms));

(async () => {
  try {
    await Promise.all([ok(50, "A"), fail(10, "B failed"), ok(30, "C")]);
  } catch (e) {
    console.log("all rejected as soon as one failed:", e.message);
  }

  console.log(await Promise.all([1, Promise.resolve(2), ok(5, 3)]));    // plain values are allowed
  console.log(await Promise.all([]));                                    // empty: resolves to []
})();
```

Important details:

- The result array is in the **same order as the input**, not the order in which they finished.
- It **rejects immediately** on the first rejection. The other promises are **not cancelled**: they keep running, their results are ignored.
- Use it for **dependent** results: you need all of them.

## `Promise.allSettled`: wait for everything, no matter what

```js run title="Promise.allSettled for partial results"
const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), ms));

(async () => {
  const results = await Promise.allSettled([ok(10, "profile"), fail(20, "orders service down"), ok(30, "recommendations")]);
  // (we print error messages only: a whole Error object would print its stack trace and file paths)
  console.log(results.map((r) => (r.status === "fulfilled" ? { status: r.status, value: r.value } : { status: r.status, reason: r.reason.message })));

  const values = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
  console.log("usable data:", values, "| problems:", errors);
})();
```

Use it for **independent** jobs where **partial success is fine**: a dashboard with many widgets, batch uploads, sending notifications.

## `Promise.race`: the first to finish wins

```js run title="Promise.race: first settled wins (value or error)"
const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), ms));

(async () => {
  console.log(await Promise.race([ok(30, "slow"), ok(10, "fast")]));

  try {
    await Promise.race([ok(30, "slow"), fail(10, "quick failure")]);       // an early rejection wins too
  } catch (e) {
    console.log("race rejected:", e.message);
  }

  // the classic use: a timeout
  const withTimeout = (promise, ms) => Promise.race([promise, fail(ms, "timeout after " + ms + " ms")]);
  try {
    await withTimeout(ok(100, "late data"), 20);
  } catch (e) {
    console.log(e.message);
  }
})();
```

`Promise.race([])` with an **empty array** never settles (it stays pending forever).

## `Promise.any`: the first success

```js run title="Promise.any ignores failures until all fail"
const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), ms));

(async () => {
  // try several mirrors, use whichever answers first successfully
  console.log(await Promise.any([fail(5, "mirror A down"), ok(30, "mirror B"), ok(50, "mirror C")]));

  try {
    await Promise.any([fail(5, "A down"), fail(10, "B down")]);
  } catch (e) {
    console.log(e.constructor.name, "-", e.message);
    console.log(e.errors.map((x) => x.message));          // all the reasons
  }
})();
```

## Which one should I use?

```viz algo=chain title="Choosing a combinator"
node q "Several async jobs" @0,0 [hl]
node all "Promise.all" @1,0 [ok]
  note: need ALL results, fail fast
node settled "Promise.allSettled" @1,1 [ok]
  note: need ALL outcomes, partial is OK
node race "Promise.race" @1,2 [fn]
  note: first to FINISH (timeouts)
node any "Promise.any" @1,3 [fn]
  note: first to SUCCEED (fallbacks)
link q -> all
link q -> settled
link q -> race
link q -> any
```

| Situation | Choice |
|---|---|
| Load user + settings + permissions, page needs all | `Promise.all` |
| Send 50 emails and report which failed | `Promise.allSettled` |
| Timeout around a request | `Promise.race` |
| Ask 3 mirror servers, take the first good answer | `Promise.any` |

## Writing your own (a favourite interview task)

```js run title="Implement Promise.all, allSettled, race and any"
function myAll(items) {
  return new Promise((resolve, reject) => {
    const results = [];
    let remaining = items.length;
    if (remaining === 0) return resolve(results);
    items.forEach((item, i) => {
      Promise.resolve(item).then((value) => {
        results[i] = value;                                // keep the original order
        if (--remaining === 0) resolve(results);
      }, reject);                                          // first rejection rejects all
    });
  });
}

function myAllSettled(items) {
  return myAll(items.map((item) =>
    Promise.resolve(item).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),
    )));
}

function myRace(items) {
  return new Promise((resolve, reject) => {
    items.forEach((item) => Promise.resolve(item).then(resolve, reject));   // first to settle wins
  });
}

function myAny(items) {
  return new Promise((resolve, reject) => {
    const errors = [];
    let remaining = items.length;
    if (remaining === 0) return reject(new AggregateError([], "All promises were rejected"));
    items.forEach((item, i) => {
      Promise.resolve(item).then(resolve, (err) => {
        errors[i] = err;
        if (--remaining === 0) reject(new AggregateError(errors, "All promises were rejected"));
      });
    });
  });
}

const ok = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const fail = (ms, m) => new Promise((_, rej) => setTimeout(() => rej(new Error(m)), ms));

(async () => {
  console.log(await myAll([ok(20, "a"), 2, ok(5, "c")]));
  const settled = await myAllSettled([ok(5, "x"), fail(5, "y")]);
  console.log(settled.map((r) => (r.status === "fulfilled" ? r.value : "rejected: " + r.reason.message)));
  console.log(await myRace([ok(30, "slow"), ok(5, "fast")]));
  console.log(await myAny([fail(5, "e1"), ok(20, "winner")]));
})();
```

## A very common performance question

```js run title="Sequential vs parallel awaits"
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

(async () => {
  let t = Date.now();
  const a = await wait(100, "A");
  const b = await wait(100, "B");              // starts only after A is done
  console.log("sequential took >= 200 ms:", Date.now() - t >= 195);

  t = Date.now();
  const [c, d] = await Promise.all([wait(100, "C"), wait(100, "D")]);   // both start now
  console.log("parallel took about 100 ms:", Date.now() - t < 180);
})();
```

A senior developer should say instantly: if the two calls **do not depend on each other**, start both first, then await them together.

:::interview What is the difference between Promise.all, allSettled, race and any?
"`all` waits for every promise and returns their values in order, but rejects immediately when any one rejects. `allSettled` waits for all to finish and returns each outcome as status plus value or reason, and never rejects, so it is good for partial success. `race` settles with the first promise to settle, either way, which is how I build timeouts. `any` fulfils with the first fulfilment and rejects only if all reject, with an AggregateError. None of them cancel the other promises."
:::

## More interview questions on this topic

:::qa What does `Promise.all` do with the other promises when one rejects? {level=medium}
**Say this:** "It rejects immediately, but the other promises keep running; their results are ignored. Promises cannot be cancelled, so use an `AbortController` if the work should stop."

**In simple words:** The group stops waiting, but the other workers do not stop working.
:::

:::qa How do you run promises in parallel but not fail on the first error? {level=medium}
**Say this:** "Use `Promise.allSettled`, or wrap each promise with `.catch` that returns a fallback or an error object."

**In simple words:** Catch each error inside, so `all` never sees a rejection.
:::

:::qa What does `Promise.race([])` do? And `Promise.all([])`? {level=hard}
**Say this:** "`all([])` resolves immediately with `[]`. `race([])` never settles. `any([])` rejects with an `AggregateError`. `allSettled([])` resolves with `[]`."

**In simple words:** With nobody to race, nobody wins.
:::

:::qa When is `Promise.any` better than `Promise.race`? {level=medium}
**Say this:** "`race` is decided by the first to settle even if it is a failure. `any` ignores failures and waits for the first success, so it is right for fallbacks, such as multiple mirrors."

**In simple words:** `race` = fastest finisher. `any` = fastest successful finisher.
:::

```quiz
? Which combinator never rejects?
- Promise.all
- Promise.race
+ Promise.allSettled
> It reports every outcome instead.
? Which combinator returns the first FULFILLED value and ignores earlier rejections?
- Promise.race
+ Promise.any
- Promise.all
> any waits for a success.
? In `Promise.all([a, b, c])`, in what order is the result array?
- The order of completion
+ The order of the input
- Random
> The index is preserved.
```

:::keypoints
- **all**: all values, fail fast. **allSettled**: all outcomes, never rejects. **race**: first to settle. **any**: first success, else `AggregateError`.
- Results keep the **input order**. Other promises are **not cancelled**.
- Use `allSettled` for partial success, `race` for timeouts, `any` for fallbacks.
- Independent awaits should be started together: `await Promise.all([...])`.
- Edge cases: `all([])` → `[]`; `race([])` → never settles.
:::
