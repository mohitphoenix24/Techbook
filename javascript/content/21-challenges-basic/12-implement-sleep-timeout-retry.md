---
title: Implement sleep, timeout and retry
level: medium
time: 30
summary: Write sleep, withTimeout and retry with exponential backoff and an abort signal. Three small async helpers that show you understand promises, timers and cleanup.
---

:::problem Implement sleep, timeout and retry {level=easy tags="promises,timers,abort,backoff"}
1. `sleep(ms)` returns a promise that resolves after `ms` ms.
2. `withTimeout(promise, ms)` rejects with a `TimeoutError` if `promise` is not settled in `ms` ms. It must **not leave a timer running** when the promise settles first.
3. `retry(fn, { retries, delay, factor, shouldRetry })` calls `fn(attempt)` until it succeeds, waiting `delay`, `delay*factor`, … between attempts. It stops at once if `shouldRetry(error)` is false. After the last attempt it throws the **last error**.
4. Support cancelling with an `AbortSignal`.

```js
await retry(() => fetchData(), { retries: 3, delay: 100, factor: 2 });   // waits 100, 200, 400 ms between tries
```

:::hint Hint
`sleep` is `new Promise(r => setTimeout(r, ms))`. For the timeout, use `Promise.race` and clear the timer in `finally`. For retry, write a `for` loop with `await` inside.
:::
:::

## Solution and tests

```js run title="sleep, withTimeout and retry, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

class TimeoutError extends Error {
  constructor(ms) { super(`Timed out after ${ms} ms`); this.name = "TimeoutError"; }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };            // stop waiting at once
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(ms)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));          // no dangling timer keeps Node alive
}
// Note: the work behind `promise` is NOT cancelled. Pass an AbortSignal to the real work to stop it.

async function retry(fn, { retries = 3, delay = 100, factor = 2, maxDelay = Infinity, shouldRetry = () => true, signal } = {}) {
  let wait = delay;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;                       // out of attempts, or not worth retrying
      await sleep(wait, signal);
      wait = Math.min(wait * factor, maxDelay);                                         // exponential backoff
    }
  }
}

// ---------------- tests ----------------
await test("sleep waits", async () => {
  const t0 = Date.now();
  await sleep(50);
  assert.ok(Date.now() - t0 >= 45);
});

await test("sleep can be aborted", async () => {
  const ac = new AbortController();
  const p = sleep(5000, ac.signal);
  setTimeout(() => ac.abort(new Error("stop")), 10);
  await assert.rejects(p, /stop/);
});

await test("withTimeout: resolves if fast", async () => {
  assert.equal(await withTimeout(sleep(10).then(() => "ok"), 200), "ok");
});

await test("withTimeout: rejects if slow", async () => {
  await assert.rejects(withTimeout(sleep(300), 30), (e) => e instanceof TimeoutError && /30 ms/.test(e.message));
});

await test("withTimeout passes the original error through", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("original")), 200), /original/);
});

await test("retry: succeeds after failures and counts attempts", async () => {
  let calls = 0;
  const result = await retry(async () => { calls++; if (calls < 3) throw new Error("flaky"); return "done"; }, { retries: 5, delay: 5 });
  assert.equal(result, "done");
  assert.equal(calls, 3);
});

await test("retry: throws the last error after the last attempt", async () => {
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error("fail #" + calls); }, { retries: 2, delay: 1 }), /fail #3/);
  assert.equal(calls, 3);                                  // the first try + 2 retries
});

await test("retry: gives up at once for errors that should not be retried", async () => {
  let calls = 0;
  const e400 = Object.assign(new Error("bad request"), { status: 400 });
  await assert.rejects(retry(async () => { calls++; throw e400; }, { retries: 5, delay: 1, shouldRetry: (e) => e.status >= 500 }), /bad request/);
  assert.equal(calls, 1);
});

await test("retry: the delay grows (backoff)", async () => {
  const times = [];
  await assert.rejects(retry(async () => { times.push(Date.now()); throw new Error("x"); }, { retries: 3, delay: 20, factor: 2 }));
  const gaps = times.slice(1).map((t, i) => t - times[i]);           // about 20, 40, 80
  assert.ok(gaps[0] >= 15 && gaps[1] >= 35 && gaps[2] >= 75, "gaps grow: " + gaps.map((g) => (g < 30 ? "short" : g < 60 ? "medium" : "long")).join(","));
});

await test("retry: abort during the wait stops everything", async () => {
  const ac = new AbortController();
  let calls = 0;
  const p = retry(async () => { calls++; throw new Error("x"); }, { retries: 10, delay: 1000, signal: ac.signal });
  setTimeout(() => ac.abort(new Error("cancelled")), 20);
  await assert.rejects(p, /cancelled/);
  assert.equal(calls, 1);
});
```

## Make it production-ready

- Add **jitter** (a random part of the delay) so a thousand clients do not retry at the same instant.
- Retry only **safe** operations: reads, or writes made idempotent with an **idempotency key**.
- Retry only the right errors: network failures, `429`, `503`. Not `400` or `404`.
- Respect a `Retry-After` header when the server sends it.
- Pass the `AbortSignal` into `fetch` as well, so the real request is cancelled, not just ignored.

:::qa Why must `withTimeout` clear its timer? {level=medium}
**Say this:** "If the promise wins the race, the timeout timer is still pending. It keeps the Node process alive until it fires, and in a loop you would pile up many timers. Clear it in `finally`."

**In simple words:** Switch off the alarm when you no longer need it.
:::

:::qa Does `Promise.race` with a timeout cancel the slow work? {level=hard}
**Say this:** "No. Promises cannot be cancelled. The slow operation keeps running and its result is ignored. For real cancellation pass an `AbortSignal` into the operation (for example to `fetch`), and abort it when the timeout fires."

**In simple words:** You stop waiting, but the work still goes on.
:::

:::qa What is exponential backoff with jitter, and why use it? {level=medium}
**Say this:** "Wait longer after each failure (100, 200, 400 ms…), plus a random amount. Backoff gives a struggling server time to recover; jitter stops all clients from retrying together, which would cause a retry storm."

**In simple words:** Wait longer each time, and not all at the same moment.
:::

:::keypoints
- `sleep` = a promise around `setTimeout`; clear the timer when **aborted**.
- `withTimeout` = `Promise.race` + **`finally(clearTimeout)`**; the work behind is **not cancelled**.
- `retry` = loop + `await` + backoff; stop on **non-retryable** errors; throw the **last error**.
- Production: **jitter**, **idempotent** operations, honour `Retry-After`, pass the **AbortSignal** down.
:::
