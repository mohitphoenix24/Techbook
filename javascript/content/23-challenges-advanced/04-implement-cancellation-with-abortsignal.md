---
title: Implement cancellation with AbortSignal
level: hard
time: 35
summary: Combine signals, make timeouts, make any promise abortable without leaks, and write cancellable multi-step jobs that clean up. The standard way to stop work in modern JavaScript.
---

:::problem Implement cancellation helpers {level=hard tags="abort,cancellation,promises,cleanup,fetch"}
Promises cannot be cancelled, but **work** can be told to stop. The standard tool is `AbortController` / `AbortSignal`. Write:

1. `anySignal(signals)`: a signal that aborts when **any** of the given signals aborts, with the same reason. (The built-in is `AbortSignal.any`.)
2. `timeoutSignal(ms)`: a signal that aborts with a `TimeoutError` after `ms`. (The built-in is `AbortSignal.timeout`.)
3. `abortable(promise, signal)`: rejects with `signal.reason` as soon as the signal aborts; **removes its listener** when the promise settles first.
4. `sleep(ms, signal)`: cancellable sleep that clears its timer.
5. `fetchJson(url, { timeout, signal })`: combines a user signal and a timeout for a fetch-like function, so the caller can tell **why** it stopped.
6. A multi-step `job(signal)` that checks the signal between steps and **always cleans up**.

:::hint Hint
Always check `signal.aborted` first (it may already be aborted). Use `{ once: true }` for listeners and remove them in `finally`. `signal.throwIfAborted()` throws `signal.reason`.
:::
:::

## Solution and tests

```js run title="Cancellation helpers, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function anySignal(signals) {
  const controller = new AbortController();
  const cleanups = [];
  const finish = (reason) => { cleanups.forEach((f) => f()); controller.abort(reason); };
  for (const s of signals) {
    if (s.aborted) { finish(s.reason); break; }               // one is already aborted
    const onAbort = () => finish(s.reason);
    s.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => s.removeEventListener("abort", onAbort));
  }
  return controller.signal;
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(`Timed out after ${ms} ms`, "TimeoutError")), ms);
  timer.unref?.();                                            // a pending timeout must not keep Node alive
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    const done = () => signal.removeEventListener("abort", onAbort);                             // no listener left behind
    promise.then((v) => { done(); resolve(v); }, (e) => { done(); reject(e); });
  });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// a fake fetch that honours the signal, like the real one does
function fakeFetch(url, { signal } = {}) {
  return sleep(url.includes("slow") ? 200 : 10, signal).then(() => ({ ok: true, json: async () => ({ url }) }));
}
async function fetchJson(url, { timeout = 5000, signal } = {}) {
  const combined = anySignal([timeoutSignal(timeout), ...(signal ? [signal] : [])]);
  const res = await fakeFetch(url, { signal: combined });
  return res.json();
}

async function job(signal, log) {
  try {
    for (let step = 1; step <= 5; step++) {
      signal.throwIfAborted();                                // stop between steps
      await sleep(10, signal);                                // and in the middle of waiting
      log.push("step " + step);
    }
    return "finished";
  } finally {
    log.push("cleanup");                                      // runs on success, error and abort
  }
}

// ---------------- tests ----------------
await test("a default abort reason is an AbortError", async () => {
  const ac = new AbortController();
  ac.abort();
  assert.equal(ac.signal.reason.name, "AbortError");
  assert.equal(ac.signal.aborted, true);
});

await test("custom reasons are passed through", async () => {
  const ac = new AbortController();
  const p = sleep(1000, ac.signal);
  ac.abort(new Error("user left the page"));
  await assert.rejects(p, /user left the page/);
});

await test("anySignal aborts with the first reason", async () => {
  const a = new AbortController(), b = new AbortController();
  const any = anySignal([a.signal, b.signal]);
  assert.equal(any.aborted, false);
  b.abort(new Error("b first"));
  a.abort(new Error("a second"));
  assert.equal(any.aborted, true);
  assert.equal(any.reason.message, "b first");
});

await test("anySignal with an already-aborted input is aborted at once", () => {
  const a = new AbortController();
  a.abort(new Error("old"));
  assert.equal(anySignal([a.signal, new AbortController().signal]).aborted, true);
});

await test("timeoutSignal aborts with a TimeoutError", async () => {
  const s = timeoutSignal(20);
  await assert.rejects(sleep(500, s), (e) => e.name === "TimeoutError");
});

await test("abortable rejects on abort, resolves otherwise", async () => {
  const ac = new AbortController();
  const slow = new Promise((r) => setTimeout(() => r("late"), 100));
  const p = abortable(slow, ac.signal);
  setTimeout(() => ac.abort(new Error("stop waiting")), 10);
  await assert.rejects(p, /stop waiting/);
  assert.equal(await abortable(Promise.resolve("fast"), new AbortController().signal), "fast");
});

await test("abortable rejects at once for an aborted signal", async () => {
  const ac = new AbortController();
  ac.abort(new Error("already"));
  await assert.rejects(abortable(Promise.resolve(1), ac.signal), /already/);
});

await test("abortable leaves no listener behind when the promise wins", async () => {
  const ac = new AbortController();
  let added = 0, removed = 0;
  const add = ac.signal.addEventListener.bind(ac.signal), remove = ac.signal.removeEventListener.bind(ac.signal);
  ac.signal.addEventListener = (...a) => { added++; return add(...a); };
  ac.signal.removeEventListener = (...a) => { removed++; return remove(...a); };
  await abortable(sleep(5), ac.signal);
  assert.deepEqual([added, removed], [1, 1]);
});

await test("fetchJson: success", async () => assert.deepEqual(await fetchJson("/fast"), { url: "/fast" }));

await test("fetchJson: timeout is reported as TimeoutError", async () => {
  await assert.rejects(fetchJson("/slow", { timeout: 30 }), (e) => e.name === "TimeoutError");
});

await test("fetchJson: a user abort is reported as the user's reason", async () => {
  const ac = new AbortController();
  const p = fetchJson("/slow", { timeout: 1000, signal: ac.signal });
  setTimeout(() => ac.abort(new Error("navigated away")), 10);
  await assert.rejects(p, /navigated away/);
});

await test("job completes and cleans up", async () => {
  const log = [];
  assert.equal(await job(new AbortController().signal, log), "finished");
  assert.deepEqual(log, ["step 1", "step 2", "step 3", "step 4", "step 5", "cleanup"]);
});

await test("job stops when aborted and still cleans up", async () => {
  const log = [], ac = new AbortController();
  const p = job(ac.signal, log);
  setTimeout(() => ac.abort(new Error("cancelled")), 25);
  await assert.rejects(p, /cancelled/);
  assert.equal(log.at(-1), "cleanup");
  assert.ok(log.length < 5, "stopped early: " + log.join());
});

await test("telling cancel from a real failure", async () => {
  const ac = new AbortController();
  ac.abort();
  const err = await sleep(10, ac.signal).catch((e) => e);
  const isAbort = err.name === "AbortError" || err.name === "TimeoutError";
  assert.equal(isAbort, true);                                // do not log or retry these like real errors
});
```

## Using it for real

```js
// React: cancel the request when the component unmounts or the id changes
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/users/${id}`, { signal: controller.signal })
    .then((r) => r.json()).then(setUser)
    .catch((e) => { if (e.name !== "AbortError") setError(e); });     // an abort is not an error
  return () => controller.abort();
}, [id]);

// listeners: one abort removes them all
window.addEventListener("resize", onResize, { signal: controller.signal });
```

`AbortSignal.timeout(ms)` and `AbortSignal.any([...])` are built in (Node 20+, current browsers); the helpers above show how they work.

:::qa Can you cancel a promise? {level=easy}
**Say this:** "No. A promise is only a result holder. What you can cancel is the **work** behind it, if that work accepts a signal (`fetch`, timers, streams, your own code). The usual pattern is to pass an `AbortSignal` down and reject with its reason."

**In simple words:** You cannot call back a letter, but you can tell the sender to stop writing.
:::

:::qa Why is an `AbortError` treated differently from other errors? {level=medium}
**Say this:** "It is an expected outcome, not a failure: the user navigated away or a newer request replaced this one. Do not show an error message, report it to monitoring or retry it. Check `error.name === 'AbortError'` (or `TimeoutError` for timeouts)."

**In simple words:** Stopping on purpose is not a bug.
:::

:::qa What can leak in cancellation code? {level=hard}
**Say this:** "Listeners on a long-lived signal that are never removed (each call adds one), timers that keep running after abort, and pending timeouts that keep Node alive. Use `{ once: true }`, remove listeners in `finally`, clear timers on abort, and `unref()` timeout timers."

**In simple words:** Clean up what you set up, on every path out.
:::

:::keypoints
- Cancel the **work**, not the promise: pass an **`AbortSignal`** down.
- `signal.reason`: default **`AbortError`**, timeout **`TimeoutError`**, or your own value; `throwIfAborted()` for loops.
- `anySignal` (**`AbortSignal.any`**) combines user abort and timeout; check `aborted` first.
- Always **remove listeners and clear timers** on every exit path; do **not** treat aborts as errors.
:::
