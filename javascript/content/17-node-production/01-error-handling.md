---
title: Error handling in Node.js
level: advanced
time: 40
summary: Operational vs programmer errors, how errors travel in sync code, callbacks, promises and events, custom error classes with codes and cause, what to do on uncaughtException and unhandledRejection, and a centralised error-handling strategy.
---

## Two kinds of errors

The most useful idea in Node error handling:

| | **Operational errors** | **Programmer errors (bugs)** |
|---|---|---|
| What | Problems that can happen in a correct program: bad input, a file or service is missing, a timeout, connection refused, out of disk | Mistakes in the code: `undefined is not a function`, wrong argument type, off-by-one, forgot `await` |
| Examples | `ENOENT`, `ECONNREFUSED`, HTTP 404 from an API, invalid user JSON, DB constraint violation | `TypeError`, `ReferenceError`, `RangeError`, assertion failures |
| What to do | **Handle** it: retry, fall back, return a 4xx/5xx, show a message, log | **Fix the code.** The program is in an unknown state: **log and restart** (crash) |
| Show to the user? | Often yes, in a safe, friendly form | No: return a generic 500 |

Do not wrap everything in `try/catch` and carry on. Catching a **bug** and continuing can corrupt data. Catching an **operational** error and crashing is bad for availability.

## How errors travel in different styles

```js run node title="The same failure in five styles of Node code"
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const missing = "/definitely/not/here.txt";
const results = {};

(async () => {
  // 1. synchronous: throws
  try { fs.readFileSync(missing); } catch (e) { results["1 sync throw"] = e.code; }

  // 2. error-first callback: the error is the first argument (it is never thrown!)
  await new Promise((done) => fs.readFile(missing, (err) => { results["2 callback"] = err.code; done(); }));

  // 3. promise: a rejection
  await fsp.readFile(missing).catch((e) => { results["3 promise reject"] = e.code; });

  // 4. async/await: thrown at the await
  try { await fsp.readFile(missing); } catch (e) { results["4 async/await"] = e.code; }

  // 5. event emitter: an 'error' event (with no listener it would be thrown)
  await new Promise((done) => fs.createReadStream(missing).on("error", (e) => { results["5 stream 'error'"] = e.code; done(); }));

  for (const [style, code] of Object.entries(results)) console.log(style.padEnd(18), code);
})();
```

A `try/catch` **cannot** catch errors from callbacks or events that fire **later**:

```js run node title="try/catch does not catch async callback errors"
const fs = require("node:fs");

try {
  fs.readFile("/nope", (err) => { throw new Error("thrown inside the callback"); });   // runs later, outside the try
} catch (e) {
  console.log("never reached");
}

process.once("uncaughtException", (e) => console.log("it escaped to the process:", e.message));
```

## Custom error classes

Create errors that carry **meaning**: a stable `code`, an HTTP `status`, whether it is `operational`, and the original `cause`.

```js run node title="An error hierarchy for an API"
class AppError extends Error {
  constructor(message, { code = "APP_ERROR", status = 500, operational = true, cause, details } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;                 // shown in stack traces
    this.code = code;
    this.status = status;
    this.operational = operational;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);   // hide the constructor frame
  }
  toJSON() { return { error: { name: this.name, code: this.code, message: this.message, details: this.details } }; }
}
class ValidationError extends AppError {
  constructor(message, details) { super(message, { code: "VALIDATION_FAILED", status: 400, details }); }
}
class NotFoundError extends AppError {
  constructor(what) { super(`${what} not found`, { code: "NOT_FOUND", status: 404 }); }
}
class DependencyError extends AppError {
  constructor(message, cause) { super(message, { code: "UPSTREAM_FAILED", status: 502, cause }); }
}

const errors = [
  new ValidationError("email is invalid", { field: "email" }),
  new NotFoundError("User 7"),
  new DependencyError("payment service failed", new Error("ECONNRESET")),
];
for (const e of errors) console.log(e.name.padEnd(16), e.status, e.code.padEnd(18), e instanceof AppError, e.cause?.message ?? "-");
console.log(JSON.stringify(errors[0]));
```

Match on **`instanceof`** or on **`code`** (strings are stable; messages are not).

```js run node title="Wrap low-level errors with context, keep the cause"
async function loadUser(id) {
  try {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });   // the database is down
  } catch (err) {
    if (err.code === "ECONNREFUSED") throw new Error(`could not load user ${id}`, { cause: err });     // add context
    throw err;                                                                                          // unknown: do not hide it
  }
}

loadUser(7).catch((e) => {
  console.log(e.message, "<-", e.cause.message);
  let depth = 0;
  for (let c = e; c; c = c.cause) depth++;                       // walk the chain of causes when logging
  console.log("chain depth:", depth);
});
```

## Process-level safety nets

```js
process.on("uncaughtException", (err, origin) => {
  logger.fatal({ err, origin }, "uncaught exception");     // 1. log (synchronously if you can)
  shutdown(1);                                              // 2. clean up what you can, with a timeout...
});                                                        // 3. exit: the process state is unknown

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection");          // Node 15+ would crash anyway: treat it as a bug
  shutdown(1);
});
```

Rules:

- These are a **last resort for logging and graceful exit**, **not** a way to keep running. After an `uncaughtException`, the app can be half-updated, with locks held and invariants broken.
- Let a **supervisor** (systemd, Docker, Kubernetes, PM2) **restart** the process. Run **several instances** so one crash does not drop users. **Fail fast, restart fast.**
- Keep a `.catch()` on every promise and `error` listeners on every emitter.

## Error handling in HTTP handlers

```js run node title="One central error handler turns errors into responses"
const http = require("node:http");

class HttpError extends Error { constructor(status, message, expose = true) { super(message); this.status = status; this.expose = expose; } }

function handle(req) {
  if (req.url === "/ok") return { hello: "world" };
  if (req.url === "/missing") throw new HttpError(404, "no such thing");
  if (req.url === "/bug") return null.property;                        // a programmer error (TypeError)
  throw new HttpError(400, "bad request");
}

const server = http.createServer((req, res) => {
  try {
    const body = handle(req);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  } catch (err) {
    const operational = err instanceof HttpError;
    const status = operational ? err.status : 500;
    if (!operational) console.log("[logged internally]", err.name);              // log the real error and stack
    res.writeHead(status, { "Content-Type": "application/json" })
       .end(JSON.stringify({ error: operational ? err.message : "Internal Server Error" }));   // never leak internals
  }
});

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const p of ["/ok", "/missing", "/bug", "/other"]) {
    const r = await fetch(base + p);
    console.log(p.padEnd(9), r.status, await r.text());
  }
  server.close();
});
```

**Never** send stack traces, SQL, file paths or secrets to clients. Send an **error id** that you can look up in the logs.

## Logging errors well

- Use a structured logger (**pino**, winston): JSON lines with `level`, `time`, `msg`, `err` (name, message, stack, code, cause), `requestId`.
- Log an error **once**, where it is handled (not at every `catch` and re-throw).
- Include **context**: user id, request id, inputs (without secrets).
- Alert on rates (5xx per minute), not on single operational errors.

## Common mistakes

| Mistake | Fix |
|---|---|
| Empty `catch {}` | At least log; ideally handle or re-throw |
| `throw "string"` or `throw { code: 1 }` | Throw `Error` objects (they have a stack) |
| Throwing in a callback | Pass `callback(err)`; or use promises |
| Catching everything and continuing after a bug | Only catch what you can handle; crash on the unknown |
| Returning stack traces to users | Generic message + error id |
| Mixing return codes, throws and callbacks in one API | Pick one style (promises / `async`) |
| `new Promise(async ...)` | Plain `async` functions |
| Forgetting `await` in `try` (`return fn()` instead of `return await fn()`) | `return await` inside `try` |

:::interview How do you handle errors in a Node.js application? What is the difference between operational and programmer errors?
"I separate operational errors, which are expected failures in a correct program such as bad input, a timeout, a missing file or a refused connection, from programmer errors, which are bugs like a TypeError. Operational errors are handled: validated and turned into 4xx responses, retried, or reported with context using custom error classes that have codes, status and a `cause`. For bugs I log and let the process exit and be restarted by a supervisor, because continuing in an unknown state is dangerous. I use try/catch with await, error-first callbacks or `.catch` on promises, `error` listeners on emitters, a central error handler in the web framework that hides internals from clients, and `uncaughtException` and `unhandledRejection` handlers only to log and shut down gracefully."
:::

## More interview questions on this topic

:::qa Why not just catch `uncaughtException` and keep the server running? {level=medium}
**Say this:** "After an uncaught exception the process state is unknown: resources may be half-closed, invariants broken, data corrupted. The safe approach is to log, finish what can be finished quickly, exit, and let a supervisor restart a clean process."

**In simple words:** A machine that threw a gear should be stopped and checked, not kept running.
:::

:::qa How do you propagate the original error when wrapping it? {level=easy}
**Say this:** "`new Error('context', { cause: originalError })`. The cause is available as `err.cause` and shown by Node's inspector."

**In simple words:** "I failed because of this other failure."
:::

:::qa How do you handle errors in Express? {level=medium}
**Say this:** "Pass errors to `next(err)` (Express 5 does this automatically for rejected promises from async handlers), and register one error-handling middleware with four parameters `(err, req, res, next)` at the end that maps errors to responses and logs the unexpected ones."

**In simple words:** All errors flow to one central place.
:::

:::qa Why should you use `code` instead of the message to identify an error? {level=easy}
**Say this:** "Messages are for humans and can change or be translated; codes like `ENOENT` or `VALIDATION_FAILED` are stable, so code can safely branch on them."

**In simple words:** Branch on the label, not the sentence.
:::

```quiz
? Which is an operational error?
- A TypeError from calling undefined()
+ ECONNREFUSED when the database is down
- A misspelt variable name
> A correct program can still face it.
? What should you do after an uncaughtException?
- Ignore it and continue
+ Log it, clean up quickly and exit so a supervisor restarts the process
- Retry the same code
> The state is unknown.
? What does `new Error("x", { cause: err })` do?
- Rethrows err
+ Keeps err available as error.cause
- Logs err
> Preserves the underlying error.
```

:::keypoints
- **Operational** errors: handle (retry, 4xx, fallback). **Programmer** errors: fix the code, **crash and restart**.
- Errors travel as **throws** (sync/await), **callback args**, **rejections**, and **`error` events**. `try/catch` cannot catch later callbacks/events.
- **Custom errors**: `code`, `status`, `operational`, **`cause`**; branch on `instanceof`/`code`.
- **Central error handler**; never leak internals; log once with context (structured).
- `uncaughtException`/`unhandledRejection` = **log + graceful exit**, not "carry on".
:::
