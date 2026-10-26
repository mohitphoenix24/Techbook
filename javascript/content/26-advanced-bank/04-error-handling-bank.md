---
title: "Advanced bank: error handling"
level: hard
time: 25
summary: Twelve answers on the types of errors, try/catch/finally, custom errors, error causes, async errors, global handlers, operational versus programmer errors and good logging.
---

:::qa What kinds of errors exist in JavaScript? {level=easy}
**Say this:** "Built-in types: `Error`, `TypeError`, `ReferenceError`, `SyntaxError`, `RangeError`, `EvalError`, `URIError`, and `AggregateError`. Syntax errors happen at parse time, the others at run time. You can throw anything, but throw `Error` objects so you get a stack trace."

**In simple words:** Different labels for different kinds of mistakes.
:::

:::qa How do `try`, `catch` and `finally` work, and what does `finally` do with `return`? {level=medium}
**Say this:** "`catch` runs if the `try` block throws; `finally` always runs, even after `return`, `break` or a throw. A `return` or `throw` inside `finally` overrides the earlier one, which hides errors, so avoid it."

**In simple words:** `finally` is the cleanup that always happens, and it should not change the story.
:::

:::qa How do you create a custom error class? {level=medium}
**Say this:** "`class ValidationError extends Error { constructor(message, options) { super(message, options); this.name = 'ValidationError'; } }`. Add fields like `code` or `status`, and check with `instanceof` or `error.name`."

**In simple words:** An error with a clear name and the extra data you need.
:::

:::qa What is `error.cause`? {level=medium}
**Say this:** "The `cause` option (`new Error('Could not save user', { cause: err })`) chains the original error to a higher-level one, so you keep the root cause and its stack while giving a meaningful message."

**In simple words:** 'Save failed, because the database said no.'
:::

:::qa Why does `try/catch` not catch errors in `setTimeout` callbacks or promise chains? {level=medium}
**Say this:** "By the time the callback runs, the `try` block has already finished and is no longer on the call stack. Handle errors inside the callback, with `.catch()` on promises, or by `await`ing inside `try/catch`."

**In simple words:** The safety net was taken down before the acrobat jumped.
:::

:::qa How do you catch uncaught errors globally? {level=medium}
**Say this:** "In browsers: `window.onerror` and `window.addEventListener('unhandledrejection', ...)`. In Node: `process.on('uncaughtException')` and `process.on('unhandledRejection')`. Use them to log and report, then exit in Node, because the process state may be corrupt."

**In simple words:** A last-resort alarm, not a way to carry on as normal.
:::

:::qa Operational errors versus programmer errors: what is the difference? {level=hard}
**Say this:** "Operational errors are expected problems at run time: network failure, invalid input, file not found, timeout. Handle or report them. Programmer errors are bugs: `undefined is not a function`, wrong arguments. You cannot recover safely; fix the code, log, and let the process restart."

**In simple words:** Rain on the road versus a broken car engine.
:::

:::qa How should an Express app handle errors? {level=medium}
**Say this:** "Pass errors to `next(err)` (or throw in async handlers on Express 5). A final error middleware with four arguments `(err, req, res, next)` maps known errors to status codes, hides internal details from clients, and logs the full error. Wrap async handlers on Express 4."

**In simple words:** One place decides what the user sees; the logs keep the truth.
:::

:::qa What should you log for an error? {level=medium}
**Say this:** "Message, stack, `cause`, error type or code, a request or correlation ID, user or tenant ID (not secrets), and relevant inputs. Use structured JSON logs, and never log passwords, tokens or personal data."

**In simple words:** Enough facts to reproduce the problem, nothing private.
:::

:::qa Should you throw or return errors? {level=hard}
**Say this:** "Throw for exceptional situations that the caller cannot continue from; return a result (`{ ok, value, error }`) when failure is an expected branch, such as validation. Be consistent in an API, and document which errors callers must handle."

**In simple words:** Throw for emergencies; return for normal 'no' answers.
:::

:::qa How do you handle errors from many parallel promises? {level=medium}
**Say this:** "`Promise.all` rejects with the first error and ignores later ones; use `Promise.allSettled` when you need every outcome. Add an `AbortController` to cancel the others. `Promise.any` throws an `AggregateError` containing all the reasons."

**In simple words:** Decide whether one failure ends the job or you want a full report.
:::

:::qa What is the purpose of `Error.captureStackTrace` and source maps? {level=hard}
**Say this:** "`Error.captureStackTrace(this, Ctor)` (V8) builds the stack trace and can hide the constructor frames. Source maps map minified production stack traces back to the original files and lines in tools like Sentry."

**In simple words:** They make an error report point to your real code.
:::

:::keypoints
- Throw **`Error` objects**; add **`cause`**; use custom classes with codes.
- `try/catch` only covers the **current stack**: use `await` or `.catch` for async.
- **Operational** errors → handle; **programmer** errors → fix and restart.
- One central handler, **structured logs**, no secrets; global handlers are a **last resort**.
:::
