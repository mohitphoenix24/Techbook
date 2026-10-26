---
title: Implement a middleware pipeline (Koa and Express style)
level: medium
time: 35
summary: Build Koa's compose with async next(), and an Express-style app with use(), error middleware and path prefixes. Understand the onion model, why next is called once, and how errors travel.
---

:::problem Implement middleware pipelines {level=medium tags="middleware,express,koa,async,design"}
**Part 1: Koa style.** `compose(middleware)` returns `(ctx, next?) => Promise`. Each middleware is `async (ctx, next) => {...}`.

- `await next()` runs the rest of the chain, then **comes back** (the "onion").
- A middleware that does not call `next()` **stops** the chain.
- Errors thrown anywhere can be caught by an **earlier** middleware with `try/catch` around `await next()`.
- Calling `next()` **twice** in one middleware is an error.

**Part 2: Express style.** `new MiniApp()` with `use(fn)` and `use(path, fn)`, and `handle(req, res, done)`.

- Normal middleware is `(req, res, next)`; **error middleware** has **four** parameters `(err, req, res, next)`.
- `next(err)` skips normal middleware and goes to the next error middleware.
- A **synchronous throw** is caught and treated like `next(err)`.
- `use("/api", fn)` runs only for URLs under `/api`.

:::hint Hint
Koa: a function `dispatch(i)` that calls `middleware[i]` with a `next` that calls `dispatch(i + 1)`; remember the highest `i` used to catch double calls. Express: a counter `i` into the stack and a `next(err)` that finds the next *suitable* layer (use `fn.length === 4` to tell error handlers).
:::
:::

## Solution and tests

```js run title="compose and MiniApp, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Koa style ----------
function compose(middleware) {
  for (const fn of middleware) if (typeof fn !== "function") throw new TypeError("Middleware must be a function");
  return function (ctx, next) {
    let index = -1;
    function dispatch(i) {
      if (i <= index) return Promise.reject(new Error("next() called multiple times"));
      index = i;
      const fn = i === middleware.length ? next : middleware[i];
      if (!fn) return Promise.resolve();
      try { return Promise.resolve(fn(ctx, () => dispatch(i + 1))); }
      catch (err) { return Promise.reject(err); }            // a sync throw becomes a rejection too
    }
    return dispatch(0);
  };
}

// ---------- Express style ----------
class MiniApp {
  #stack = [];
  use(pathOrFn, maybeFn) {
    const [path, fn] = typeof pathOrFn === "string" ? [pathOrFn, maybeFn] : ["/", pathOrFn];
    this.#stack.push({ path, fn });
    return this;
  }
  handle(req, res, done = () => {}) {
    let i = 0;
    const next = (err) => {
      const layer = this.#stack[i++];
      if (!layer) return done(err);                          // end of the stack (with the error, if any)
      const { path, fn } = layer;
      const matches = path === "/" || req.url === path || req.url.startsWith(path + "/");
      if (!matches) return next(err);
      const isErrorHandler = fn.length === 4;
      try {
        if (err) isErrorHandler ? fn(err, req, res, next) : next(err);      // while an error is pending, only error handlers run
        else isErrorHandler ? next() : fn(req, res, next);                  // normally, error handlers are skipped
      } catch (e) { next(e); }                                              // a sync throw = next(e)
    };
    next();
  }
}

// ---------------- tests ----------------
await test("onion order: down the chain, then back up", async () => {
  const log = [];
  const run = compose([
    async (ctx, next) => { log.push("1 before"); await next(); log.push("1 after"); },
    async (ctx, next) => { log.push("2 before"); await next(); log.push("2 after"); },
    async () => { log.push("3 handler"); },
  ]);
  await run({});
  assert.deepEqual(log, ["1 before", "2 before", "3 handler", "2 after", "1 after"]);
});

await test("middleware share and change ctx", async () => {
  const run = compose([
    async (ctx, next) => { const t0 = Date.now(); await next(); ctx.ms = Date.now() - t0; },
    async (ctx, next) => { ctx.user = "asha"; await next(); },
    async (ctx) => { await new Promise((r) => setTimeout(r, 15)); ctx.body = `hello ${ctx.user}`; },
  ]);
  const ctx = {};
  await run(ctx);
  assert.equal(ctx.body, "hello asha");
  assert.ok(ctx.ms >= 10);
});

await test("not calling next stops the chain", async () => {
  const log = [];
  await compose([async () => log.push("auth failed"), async () => log.push("never")])({});
  assert.deepEqual(log, ["auth failed"]);
});

await test("an upstream try/catch handles downstream errors", async () => {
  const ctx = {};
  await compose([
    async (ctx, next) => { try { await next(); } catch (e) { ctx.status = 500; ctx.message = e.message; } },
    async () => { throw new Error("db down"); },
  ])(ctx);
  assert.deepEqual(ctx, { status: 500, message: "db down" });
});

await test("a synchronous throw is also a rejection", async () => {
  await assert.rejects(compose([() => { throw new Error("sync"); }])({}), /sync/);
});

await test("calling next() twice is an error", async () => {
  await assert.rejects(compose([async (ctx, next) => { await next(); await next(); }, async () => {}])({}), /multiple times/);
});

await test("forgetting to await next() lets the 'after' code run too early", async () => {
  const log = [];
  await compose([
    async (ctx, next) => { next(); log.push("1 after (too early)"); },     // missing await
    async () => { await new Promise((r) => setTimeout(r, 10)); log.push("2 slow handler"); },
  ])({});
  assert.deepEqual(log, ["1 after (too early)"]);
});

await test("compose can be nested (a chain is itself a middleware)", async () => {
  const log = [];
  const inner = compose([async (ctx, next) => { log.push("inner"); await next(); }]);
  await compose([inner, async () => log.push("outer end")])({});
  assert.deepEqual(log, ["inner", "outer end"]);
});

await test("Express: normal order and next()", () => {
  const log = [];
  const app = new MiniApp()
    .use((req, res, next) => { log.push("a"); next(); })
    .use((req, res, next) => { log.push("b"); next(); });
  app.handle({ url: "/" }, {}, () => log.push("done"));
  assert.deepEqual(log, ["a", "b", "done"]);
});

await test("Express: next(err) skips normal middleware and reaches the error handler", () => {
  const log = [];
  const app = new MiniApp()
    .use((req, res, next) => next(new Error("bad input")))
    .use((req, res, next) => { log.push("skipped"); next(); })
    .use((err, req, res, next) => { log.push("handled: " + err.message); next(); })
    .use((req, res, next) => { log.push("continues"); next(); });
  app.handle({ url: "/" }, {});
  assert.deepEqual(log, ["handled: bad input", "continues"]);
});

await test("Express: a synchronous throw is caught", () => {
  const log = [];
  const app = new MiniApp()
    .use(() => { throw new Error("oops"); })
    .use((err, req, res, next) => { log.push(err.message); });
  app.handle({ url: "/" }, {});
  assert.deepEqual(log, ["oops"]);
});

await test("Express: unhandled errors reach `done`", () => {
  let got;
  new MiniApp().use((req, res, next) => next(new Error("nobody handles me"))).handle({ url: "/" }, {}, (err) => (got = err.message));
  assert.equal(got, "nobody handles me");
});

await test("Express: path prefixes", () => {
  const log = [];
  const app = new MiniApp()
    .use("/api", (req, res, next) => { log.push("api"); next(); })
    .use("/admin", (req, res, next) => { log.push("admin"); next(); })
    .use((req, res, next) => { log.push("all"); next(); });
  app.handle({ url: "/api/users" }, {});
  app.handle({ url: "/apiary" }, {});                        // /apiary is NOT under /api
  assert.deepEqual(log, ["api", "all", "all"]);
});

await test("Express 4: a returned (rejected) promise is ignored, so the error handler never runs", async () => {
  let handled = false;
  const failing = Promise.reject(new Error("async boom"));
  failing.catch(() => {});                                   // only so this demo does not crash the process
  const app = new MiniApp()
    .use(() => failing)                                      // an async middleware: its promise is the return value
    .use((err, req, res, next) => { handled = true; });
  app.handle({ url: "/" }, {});
  await sleep(10);
  assert.equal(handled, false);                              // Express 5 would call next(err) for you
});
```

## Express 4 vs 5 and Koa

| | Express 4 | Express 5 | Koa |
|---|---|---|---|
| Async errors | **not caught**, wrap with try/catch or a helper | rejected promises go to `next(err)` | caught through `await next()` |
| Style | `next()` callback | same, plus promises | `async (ctx, next)` onion |
| "After" code | awkward (hook `res.on("finish")`) | same | natural: code after `await next()` |
| Error middleware | 4-argument functions | same | `try/catch` upstream |

:::qa Why does Express identify error handlers by `fn.length === 4`? {level=medium}
**Say this:** "Express reads the number of declared parameters. Four means `(err, req, res, next)`. That is why an error handler must declare all four, even if `next` is unused; with three it is treated as a normal middleware and never receives the error."

**In simple words:** The shape of the function tells Express what it is for.
:::

:::qa What can go wrong if you forget `await next()` in Koa? {level=medium}
**Say this:** "The code after `next()` runs before downstream work finishes, so timing, logging or response handling is wrong, and errors from downstream become unhandled rejections instead of reaching your `try/catch`. Always `await next()` (or `return next()`)."

**In simple words:** If you do not wait, the onion does not wrap properly.
:::

:::qa How do these ideas appear outside web servers? {level=hard}
**Say this:** "Redux middleware, axios interceptors, Next.js middleware, Vite plugins and Webpack loaders are all chains where each step can act before, act after, change the input, or stop the flow. The common pattern is a list of functions composed with a `next` function."

**In simple words:** A line of helpers, each passing the work to the next.
:::

:::keypoints
- Koa **compose**: `dispatch(i)` with `next = () => dispatch(i + 1)`; remember `index` to catch **double `next()`**; always `await next()`.
- **Onion**: code before `await next()` runs on the way in, code after on the way out; skip `next()` to **short-circuit**.
- Express: **4-parameter** functions are **error middleware**; `next(err)` skips normal ones; sync throws are caught; Express 4 does **not** catch async rejections.
- Prefix matching: compare on **segment boundaries** (`/api` is not `/apiary`).
:::
