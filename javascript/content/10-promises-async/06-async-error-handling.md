---
title: Error handling in async code
level: intermediate
time: 30
summary: try/catch with await, handling errors in parallel work, partial failure, error wrapping with cause, finally for cleanup, unhandled rejections in browsers and Node, and the mistakes that swallow errors.
---

## try / catch works with await

Because a rejected promise **throws at the `await`**, you can use normal `try/catch/finally`.

```js run title="try / catch / finally with await"
const fetchOrder = (id) => new Promise((resolve, reject) => setTimeout(() => (id > 0 ? resolve({ id, total: 500 }) : reject(new Error("invalid order id"))), 10));

async function showOrder(id) {
  let spinner = "on";
  try {
    const order = await fetchOrder(id);
    console.log("order total:", order.total);
  } catch (err) {
    console.log("could not load order:", err.message);
  } finally {
    spinner = "off";                                   // always runs: success or failure
    console.log("spinner:", spinner);
  }
}

(async () => {
  await showOrder(5);
  await showOrder(-1);
})();
```

## Catch only what you can handle

A catch block that handles **everything** the same way hides bugs. Check the error type and re-throw the rest.

```js run title="Handle expected errors, re-throw unexpected ones"
class NotFoundError extends Error {}
class TimeoutError extends Error {}

async function getUser(kind) {
  if (kind === "missing") throw new NotFoundError("no such user");
  if (kind === "slow") throw new TimeoutError("service too slow");
  if (kind === "bug") return null.name;              // a programming error: TypeError
  return { name: "Asha" };
}

async function loadProfile(kind) {
  try {
    const user = await getUser(kind);
    return user.name;
  } catch (e) {
    if (e instanceof NotFoundError) return "guest";          // expected: use a default
    throw e;                                                  // unexpected: let it bubble up
  }
}

(async () => {
  console.log(await loadProfile("ok"), await loadProfile("missing"));
  for (const kind of ["slow", "bug"]) {
    try { await loadProfile(kind); } catch (e) { console.log("escaped:", e.constructor.name, "-", e.message); }
  }
})();
```

## Errors in parallel work

With `Promise.all`, one failure rejects the whole group. With `Promise.allSettled`, you inspect each result.

```js run title="Partial failure"
const call = (name, ok) => new Promise((resolve, reject) => setTimeout(() => (ok ? resolve(name + " ok") : reject(new Error(name + " failed"))), 10));

(async () => {
  try {
    await Promise.all([call("A", true), call("B", false), call("C", true)]);
  } catch (e) {
    console.log("Promise.all stopped at:", e.message);
  }

  const settled = await Promise.allSettled([call("A", true), call("B", false), call("C", true)]);
  const failed = settled.filter((r) => r.status === "rejected");
  console.log("succeeded:", settled.length - failed.length, "| failed:", failed.map((f) => f.reason.message));
})();
```

## Wrapping errors and keeping the cause

When you re-throw with more context, keep the **original error** in `cause` (ES2022), so the stack and details are not lost.

```js run title="Error cause"
async function readConfig() { throw new Error("ENOENT: file not found"); }

async function startApp() {
  try {
    await readConfig();
  } catch (err) {
    throw new Error("Application failed to start", { cause: err });
  }
}

startApp().catch((e) => {
  console.log(e.message);
  console.log("caused by:", e.cause.message);
});
```

## A small helper: `to()` / Result style (avoid try/catch everywhere)

Some teams prefer returning `[error, value]` instead of nesting try/catch blocks:

```js run title="Go-style error handling"
const to = (promise) => promise.then((value) => [null, value], (error) => [error, null]);

const fetchUser = (ok) => new Promise((resolve, reject) => setTimeout(() => (ok ? resolve({ name: "Asha" }) : reject(new Error("db down"))), 5));

(async () => {
  const [err1, user] = await to(fetchUser(true));
  if (err1) return console.log("error", err1.message);
  console.log("user:", user.name);

  const [err2, nothing] = await to(fetchUser(false));
  console.log("handled without try/catch:", err2.message, nothing);
})();
```

## Unhandled rejections

If a rejected promise has no handler by the end of the microtask checkpoint, it is an **unhandled rejection**.

| Environment | What happens |
|---|---|
| **Browser** | `window.addEventListener("unhandledrejection", e => ...)` fires; a console error is shown |
| **Node 15+** | The process **crashes** with exit code 1 (unless you handle `process.on("unhandledRejection")`) |
| **Node < 15** | A warning was printed only |

```js run node title="Global handlers (Node)"
process.on("unhandledRejection", (reason) => {
  console.log("[global] unhandled rejection:", reason.message);
});
process.on("rejectionHandled", () => console.log("[global] a late handler was attached"));

const p = Promise.reject(new Error("forgotten promise"));        // nobody handles it right now
setTimeout(() => p.catch(() => {}), 10);                          // handled too late
```

Use global handlers for **logging and a graceful shutdown**, not as a way to ignore errors. A process in an unknown state should restart (see the Node error-handling lesson).

## Mistakes that swallow errors

```js run title="Four ways to lose an error"
const boom = () => Promise.reject(new Error("lost"));

(async () => {
  // 1. no await, no catch: floating promise (unhandled)
  // boom();

  // 2. an empty catch hides everything
  try { await boom(); } catch (e) { /* ignored */ }

  // 3. catch that returns a value hides the failure from callers
  const value = await boom().catch(() => "default");
  console.log("looks fine, but we never logged the error:", value);

  // 4. async callback in forEach/setTimeout: errors are not caught by outer try/catch
  try {
    await Promise.all([1].map(async () => { throw new Error("caught here, because we used Promise.all"); }));
  } catch (e) {
    console.log(e.message);
  }
})();
```

:::interview How do you handle errors in async/await code? What about unhandled rejections?
"I use `try/catch/finally` around awaits, and I only catch errors I can handle (checking the type and re-throwing the rest) so bugs are not hidden. For parallel work I choose between `Promise.all`, which fails fast, and `allSettled` for partial results. When wrapping errors I use `new Error(msg, { cause })` to keep the original. A rejection nobody handles is an unhandled rejection: the browser fires `unhandledrejection`, and Node 15+ crashes the process, so I never leave floating promises, and I add global handlers only to log and shut down gracefully."
:::

## More interview questions on this topic

:::qa Does try/catch catch an error from a promise that is not awaited? {level=easy}
**Say this:** "No. The rejection happens later, outside the try block. You must `await` it inside the `try`, or attach `.catch`."

**In simple words:** The safety net only covers code that waits inside it.
:::

:::qa What is `Error.cause`? {level=medium}
**Say this:** "An option (`new Error(msg, { cause })`) to attach the original error when re-throwing, so the full chain of reasons is kept for debugging."

**In simple words:** "I failed because of this other failure."
:::

:::qa What happens on an unhandled rejection in Node 18+? {level=medium}
**Say this:** "By default the process raises it as an uncaught exception and exits with code 1. You can listen to `unhandledRejection`, but you should log and exit gracefully."

**In simple words:** Node treats a forgotten failure as a crash.
:::

:::qa How do you handle errors in `Promise.all` without failing the others? {level=medium}
**Say this:** "Use `allSettled`, or map each promise with a `.catch` that returns a fallback or an error marker."

**In simple words:** Catch inside so the group never sees a rejection.
:::

```quiz
? Why does `try { return failingAsync(); } catch {}` not catch the rejection?
- try/catch does not work with async
+ The promise is returned, not awaited inside the try
- failingAsync is not a function
> Use return await to keep the rejection inside the try.
? What does `new Error("msg", { cause: err })` do?
- Rethrows err
+ Stores the original error as e.cause
- Logs err
> It preserves the underlying error.
? What does Node do by default on an unhandled rejection (v15+)?
- Prints a warning
+ Crashes the process
- Ignores it
> Exit code 1 unless you handle it.
```

:::keypoints
- `await` **throws** rejections, so `try/catch/finally` works. Use `return await` inside `try`.
- Catch **expected** errors, **re-throw** the rest. Use `{ cause }` to keep the original error.
- Parallel: `Promise.all` (fail fast) vs `allSettled` (partial results).
- **Unhandled rejections**: browser event, Node 15+ **crash**. Use global handlers for logging and graceful shutdown only.
- Do not swallow errors: no empty `catch`, no floating promises.
:::
