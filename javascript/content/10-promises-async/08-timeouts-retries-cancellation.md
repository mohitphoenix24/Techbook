---
title: Timeouts, retries and cancellation (AbortController)
level: advanced
time: 35
summary: How to add a timeout to any promise, retry with exponential back-off and jitter, and cancel work properly with AbortController and AbortSignal (fetch, timers, your own APIs).
---

## Promises cannot be cancelled

A promise has no `cancel()`. Once started, the work continues, even if you stop caring. So we need other tools:

1. **Timeout:** stop *waiting* after some time (`Promise.race`).
2. **Cancellation:** tell the work to **stop** (`AbortController`).
3. **Retry:** try again when it fails for a temporary reason.

## Timeout with `Promise.race`

```js run title="withTimeout(promise, ms)"
const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));   // clean up the timer!
}

(async () => {
  console.log(await withTimeout(delay(20, "fast enough"), 100));
  try {
    await withTimeout(delay(200, "too slow"), 50);
  } catch (e) {
    console.log(e.message);
  }
})();
```

Remember to **clear the timer** after the race. Otherwise an unused timer keeps the process alive and wastes memory. Also note: the original slow promise **keeps running**. Use `AbortController` if you can stop it.

## Retry with exponential back-off

Many errors are **temporary** (network glitch, 503, rate limit). Retrying helps. But retrying immediately and forever can make an outage worse. Use **exponential back-off** (wait 100 ms, 200 ms, 400 ms...) and **jitter** (a random part so that many clients do not retry at the same moment).

```js run title="retry(fn, options)"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, { retries = 3, baseMs = 20, factor = 2, jitter = true, shouldRetry = () => true } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;           // give up
      const backoff = baseMs * factor ** attempt;                        // 20, 40, 80...
      const wait = jitter ? Math.random() * backoff : backoff;           // "full jitter"
      console.log(`attempt ${attempt + 1} failed (${err.message}), retrying`);
      await sleep(wait);
      attempt++;
    }
  }
}

let calls = 0;
const flaky = async () => {
  calls++;
  if (calls < 3) throw new Error("503 service unavailable");
  return "success on call " + calls;
};

retry(flaky).then(console.log);
```

Only retry **safe and temporary** failures:

| Retry | Do not retry |
|---|---|
| Network errors, timeouts, 502/503/504, 429 (after waiting) | 400 (bad request), 401/403, 404, validation errors |
| **Idempotent** requests (GET, PUT, DELETE) | Non-idempotent POST (could create duplicates) unless you use an **idempotency key** |

```js run title="Only retry what makes sense"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, { retries = 3, baseMs = 5, shouldRetry }) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= retries || !shouldRetry(e)) throw e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
}

const isTemporary = (e) => e.status >= 500 || e.status === 429 || e.code === "ETIMEDOUT";
let n = 0;
const call = async () => { n++; const e = new Error("bad request"); e.status = 400; throw e; };

retry(call, { shouldRetry: isTemporary }).catch((e) => console.log("gave up after", n, "call(s):", e.message));
```

## `AbortController`: real cancellation

`AbortController` gives you a **signal** that you pass to the work, and an **`abort()`** method you call when you want to stop it. APIs that accept a `signal` (`fetch`, streams, timers/promises, many libraries) stop and **reject with an `AbortError`**.

```js run title="AbortController basics"
const controller = new AbortController();
const { signal } = controller;

signal.addEventListener("abort", () => console.log("abort event fired, reason:", signal.reason.name));

console.log("aborted before?", signal.aborted);
controller.abort();                                   // you can pass a reason: abort(new Error("user left"))
console.log("aborted after?", signal.aborted);
console.log(signal.reason instanceof DOMException, signal.reason.name);
```

### Using the signal in your own async function

```js run title="Make your own function cancellable"
function cancellableDelay(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);                    // already cancelled
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve("done"); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }     // stop the work and reject
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

(async () => {
  const controller = new AbortController();
  const work = cancellableDelay(1000, { signal: controller.signal });

  setTimeout(() => controller.abort(), 20);                                // the user clicks "cancel"
  try {
    await work;
  } catch (e) {
    console.log("cancelled:", e.name);
  }
})();
```

### With `fetch` (browser and Node 18+)

```js
const controller = new AbortController();
fetch("/api/search?q=js", { signal: controller.signal })
  .then((r) => r.json())
  .catch((e) => { if (e.name !== "AbortError") throw e; });   // ignore our own cancellation

// later, e.g. when the user types another letter or leaves the page:
controller.abort();
```

### Built-in timeouts and combining signals

```js run title="AbortSignal.timeout and AbortSignal.any"
const sleep = (ms, { signal }) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

(async () => {
  // a signal that aborts itself after 30 ms
  try { await sleep(500, { signal: AbortSignal.timeout(30) }); }
  catch (e) { console.log("timeout signal:", e.name); }

  // abort when EITHER the user cancels OR the timeout hits
  const user = new AbortController();
  const either = AbortSignal.any([user.signal, AbortSignal.timeout(500)]);
  setTimeout(() => user.abort(new Error("user pressed cancel")), 10);
  try { await sleep(300, { signal: either }); }
  catch (e) { console.log("combined signal:", e.message); }
})();
```

(`AbortSignal.timeout` rejects with a `TimeoutError`; `abort()` rejects with an `AbortError` unless you pass a reason.)

## Cancelling in React effects (a classic)

```jsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/user/${id}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setUser)
    .catch((e) => { if (e.name !== "AbortError") setError(e); });
  return () => controller.abort();            // cleanup: cancel the old request when id changes
}, [id]);
```

This removes the **race** where an old, slower response overwrites a newer one.

## Putting it together: a robust request helper

```js run title="timeout + retry + abort in one helper"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resilientRequest(doRequest, { timeoutMs = 50, retries = 2, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    const attemptSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    try {
      return await doRequest(attemptSignal, attempt);
    } catch (e) {
      if (signal?.aborted) throw e;                       // the caller cancelled: never retry
      if (attempt >= retries) throw e;
      await sleep(10 * 2 ** attempt);
    }
  }
}

const fakeApi = (signal, attempt) => new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve("data from attempt " + attempt), attempt < 2 ? 500 : 5);   // first two attempts are too slow
  signal.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

resilientRequest(fakeApi).then(console.log, (e) => console.log("failed:", e.name));
```

:::interview How do you cancel an async operation? How do you implement retries?
"Promises cannot be cancelled, so I pass an `AbortSignal` to the work, usually `fetch`, which rejects with an AbortError when I call `controller.abort()`. I use `AbortSignal.timeout(ms)` for timeouts and `AbortSignal.any` to combine several reasons. In React effects I abort in the cleanup function so old responses cannot overwrite new ones. For retries, I wrap the call in a loop with exponential back-off and jitter, retry only temporary errors (network, 5xx, 429) and idempotent requests, set a maximum number of attempts, and never retry when the caller has cancelled."
:::

## More interview questions on this topic

:::qa Can you cancel a promise? {level=easy}
**Say this:** "Not directly. A promise is just a result holder. You cancel the underlying work with an `AbortController` signal, or stop waiting for it using `Promise.race` with a timeout."

**In simple words:** You can stop listening, but to stop the work you must tell the worker.
:::

:::qa What are exponential back-off and jitter? {level=medium}
**Say this:** "Back-off increases the wait between retries (100, 200, 400 ms...) to give a struggling server time to recover. Jitter adds randomness so that many clients do not retry at the same instant (the thundering herd)."

**In simple words:** Wait longer each time, and not all at the same moment.
:::

:::qa Which requests are safe to retry? {level=medium}
**Say this:** "Idempotent ones (GET, PUT, DELETE), and failures that are temporary. A POST that creates something is risky unless the server supports idempotency keys."

**In simple words:** Doing it twice must not cause harm.
:::

:::qa What error does an aborted `fetch` reject with? {level=easy}
**Say this:** "A `DOMException` named `AbortError` (or the signal's reason if one was given). `AbortSignal.timeout` gives a `TimeoutError`."

**In simple words:** Check `e.name === "AbortError"` and ignore it as expected.
:::

```quiz
? What is the right way to stop a fetch request?
- promise.cancel()
+ Pass an AbortController signal and call abort()
- clearTimeout
> fetch accepts a signal.
? What does jitter do?
- Makes retries faster
+ Randomises the wait so clients do not retry together
- Cancels a retry
> It avoids synchronised retry storms.
? Which promise helper builds a timeout?
- Promise.all
+ Promise.race with a rejecting timer
- Promise.any
> The first to settle wins.
```

:::keypoints
- Promises are **not cancellable**. Use **`AbortController`/`AbortSignal`** for real cancellation, `signal.timeout()` and `AbortSignal.any()`.
- **Timeout** = `Promise.race([work, rejectAfter(ms)])` (clear the timer!).
- **Retry**: exponential back-off + jitter, a max count, only temporary errors and idempotent calls.
- In React, abort in the **effect cleanup**.
- Check `e.name === "AbortError"` to ignore intentional cancellations.
:::
