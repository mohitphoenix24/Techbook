---
title: Middleware, routing and error middleware (build a mini Express)
level: advanced
time: 40
summary: How Express-style middleware works (a chain of functions with next), error-handling middleware with four parameters, async handlers, validation and 404 handling, shown by building a tiny Express in 60 lines, then the real Express code.
---

## What is middleware?

> "**Middleware** is a function that sits between the incoming request and the final handler. It can **read or change** the request and response, **end** the response, or call **`next()`** to pass control to the next function."

```viz algo=seq title="A request travelling through a middleware chain"
participant c Client [user]
participant l logger [box]
participant a auth [box]
participant r route handler [box]
participant e error handler [box]
c -> l : GET /orders
l -> a : next()
a -> r : next()  (token OK)
r --> c : 200 JSON
c -> l : GET /orders (no token)
l -> a : next()
a -> e : next(err)  (token missing)
e --> c : 401 JSON
```

Typical middleware: **logging**, **body parsing** (`express.json()`), **CORS**, **authentication**, **rate limiting**, **compression**, **validation**, **request ids**, **error handling**.

## A mini Express in about 60 lines

Building it shows exactly how the real one works.

```js run node title="mini-express: use(), routes, next(), next(err), error middleware"
const http = require("node:http");

function createApp() {
  const stack = [];                                         // { method?, path?, fn }
  const app = (req, res) => {
    const url = new URL(req.url, "http://localhost");
    req.path = url.pathname;
    req.query = Object.fromEntries(url.searchParams);
    res.json = (data, status = 200) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));

    let i = 0;
    const next = async (err) => {
      const layer = stack[i++];
      if (!layer) {                                          // the end of the chain
        return err ? res.json({ error: "Unhandled: " + err.message }, 500) : res.json({ error: "Not Found" }, 404);
      }
      const matches = (!layer.method || layer.method === req.method) && (!layer.path || layer.path === req.path || req.path.startsWith(layer.path + "/"));
      if (!matches) return next(err);                        // skip layers that do not match, keep the error
      const isErrorHandler = layer.fn.length === 4;          // (err, req, res, next): arity 4 means error middleware
      try {
        if (err && isErrorHandler) await layer.fn(err, req, res, next);
        else if (!err && !isErrorHandler) await layer.fn(req, res, next);
        else return next(err);                               // error present but this is a normal layer (or the reverse): skip
      } catch (e) {
        next(e);                                             // a throw or a rejected promise becomes next(e)
      }
    };
    next();
  };
  app.use = (...a) => { const [path, fn] = typeof a[0] === "string" ? a : [undefined, a[0]]; stack.push({ path, fn }); return app; };
  for (const m of ["get", "post"]) app[m] = (path, fn) => { stack.push({ method: m.toUpperCase(), path, fn }); return app; };
  return app;
}

// ---- use it like Express ----
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const app = createApp();
const log = [];

app.use((req, res, next) => { log.push(`${req.method} ${req.path}`); next(); });                 // logger

app.use("/admin", (req, res, next) => {                                                           // auth for /admin/*
  if (req.headers.authorization !== "Bearer secret") return next(new HttpError(401, "token required"));
  next();
});

app.get("/hello", (req, res) => res.json({ hello: req.query.name ?? "world" }));
app.get("/admin/stats", (req, res) => res.json({ users: 42 }));
app.get("/slow", async (req, res) => { await new Promise((r) => setTimeout(r, 10)); res.json({ ok: true }); });
app.get("/boom", async () => { throw new HttpError(418, "I am a teapot"); });                      // async error: caught by our wrapper
app.get("/bug", () => { return undefined.x; });                                                   // a bug

app.use((err, req, res, next) => {                                                                // ERROR middleware: 4 parameters
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) log.push("ERROR " + err.message);
  res.json({ error: status === 500 ? "Internal Server Error" : err.message }, status);
});

const server = http.createServer(app);
server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, headers) => { const r = await fetch(base + path, { headers }); return `${r.status} ${await r.text()}`; };

  console.log(await call("/hello?name=Asha"));
  console.log(await call("/admin/stats"));
  console.log(await call("/admin/stats", { authorization: "Bearer secret" }));
  console.log(await call("/slow"));
  console.log(await call("/boom"));
  console.log(await call("/bug"));
  console.log(await call("/nowhere"));
  console.log(log);
  server.close();
});
```

What this shows:

1. **Order matters.** Middleware runs in the order registered; error handlers must come **after** the routes.
2. **`next()`** passes control forward. **Not calling `next()` or sending a response** leaves the request **hanging** (a common bug).
3. **`next(err)`** skips to the next **error handler** (a function with **4 parameters**).
4. A path prefix (`app.use("/admin", ...)`) applies to everything under it.
5. Async handlers: a thrown error or rejected promise must reach `next(err)`. **Express 4** needs a wrapper (`asyncHandler`); **Express 5** does it automatically.

## The same thing with real Express

```js
import express from "express";
import { z } from "zod";

const app = express();

app.use(express.json({ limit: "100kb" }));               // body parser (limit it!)
app.use(requestId());                                     // your own middleware: attaches req.id
app.use(pinoHttp());                                      // structured request logging

const Order = z.object({ item: z.string().min(1), qty: z.number().int().positive() });

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(new ValidationError("Invalid body", result.error.flatten()));
  req.body = result.data;                                 // the parsed, typed, trimmed data
  next();
};

app.post("/orders", authenticate, validate(Order), async (req, res) => {
  const order = await orders.create(req.user.id, req.body);   // Express 5: a rejected promise reaches the error handler
  res.status(201).json(order);
});

app.use((req, res) => res.status(404).json({ error: "Not Found" }));            // 404: after all routes

app.use((err, req, res, next) => {                                              // error handler: last, four parameters
  if (res.headersSent) return next(err);                                        // too late to change the status: delegate to the default
  const status = err.status ?? 500;
  if (status >= 500) req.log.error({ err }, "request failed");
  res.status(status).json({ error: status >= 500 ? "Internal Server Error" : err.message, requestId: req.id });
});

app.listen(3000);
```

**Express 4 and async handlers:** a rejected promise inside a handler is **not** caught automatically. Wrap it:

```js
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get("/users/:id", asyncHandler(async (req, res) => { res.json(await users.find(req.params.id)); }));
```

## Middleware you should know

| Concern | Typical middleware |
|---|---|
| Security headers | `helmet()` |
| CORS | `cors({ origin: [...], credentials: true })` |
| Body parsing | `express.json()`, `express.urlencoded()`, `multer` / `busboy` for files |
| Rate limiting | `express-rate-limit` (+ Redis store for many instances) |
| Auth | `passport`, JWT middleware, session middleware |
| Compression | `compression()` (or let the reverse proxy do it) |
| Logging | `morgan`, `pino-http` |
| Validation | `zod`, `joi`, `express-validator`, `ajv` |
| Static files | `express.static()` (better: a CDN or nginx) |

Frameworks alternatives: **Fastify** (faster, schema validation, plugin system), **Koa** (async middleware with `await next()`), **NestJS** (structured, TypeScript, decorators), **Hono**.

## Middleware patterns

```js run node title="Middleware as higher-order functions: config in, handler out"
// a middleware factory: returns a middleware configured with options
const rateLimiter = ({ max, windowMs }, now = () => Date.now()) => {
  const hits = new Map();                                         // ip -> { count, resetAt }
  return (req, res, next) => {
    const entry = hits.get(req.ip) ?? { count: 0, resetAt: now() + windowMs };
    if (now() > entry.resetAt) { entry.count = 0; entry.resetAt = now() + windowMs; }
    entry.count++;
    hits.set(req.ip, entry);
    if (entry.count > max) return res.status(429).end("Too Many Requests");
    next();
  };
};

// test it without a server: fake req/res
const limiter = rateLimiter({ max: 3, windowMs: 1000 });
const results = [];
for (let i = 1; i <= 5; i++) {
  const res = { status(code) { this.code = code; return this; }, end(msg) { results.push(`${i}: ${this.code} ${msg}`); } };
  limiter({ ip: "1.2.3.4" }, res, () => results.push(`${i}: passed`));
}
console.log(results);
```

Because middleware are plain functions of `(req, res, next)`, they are **easy to unit test** with fake objects, and to **compose**.

:::interview How does Express middleware work? How are errors handled?
"Express keeps an ordered stack of functions. Each is called with `(req, res, next)`; it can modify the request and response, end the response, or call `next()` to continue, in registration order. Calling `next(err)` skips the normal handlers and jumps to error-handling middleware, which is recognised by having four parameters `(err, req, res, next)` and must be registered after the routes. A thrown error in a synchronous handler is caught by Express; async handlers in Express 4 need to pass rejections to `next`, with a wrapper, while Express 5 does it automatically. I use one central error handler that maps known errors to status codes, hides internals for 500s, and logs them with a request id, plus a 404 handler after all routes."
:::

## More interview questions on this topic

:::qa How does Express recognise an error-handling middleware? {level=medium}
**Say this:** "By its arity: a function that declares four parameters `(err, req, res, next)`. Express only calls it when an error was passed to `next`."

**In simple words:** The number of parameters tells Express it is an error handler.
:::

:::qa What happens if a middleware neither responds nor calls `next()`? {level=easy}
**Say this:** "The request hangs until the client or a server timeout gives up, because nothing sends a response."

**In simple words:** The request is stuck at your function.
:::

:::qa Why does middleware order matter? {level=easy}
**Say this:** "They run in the order registered: body parsing must precede routes that read `req.body`, auth must precede protected routes, and error handlers and the 404 handler must come last."

**In simple words:** The request walks through the list from top to bottom.
:::

:::qa How would you validate request bodies? {level=medium}
**Say this:** "A validation middleware using a schema library such as zod, joi or ajv. It parses `req.body`, calls `next(error)` with a 400 error on failure, and replaces `req.body` with the parsed, typed data on success."

**In simple words:** Check the input at the door, before any logic runs.
:::

```quiz
? What marks a function as error-handling middleware in Express?
- Its name contains "error"
+ It has four parameters: (err, req, res, next)
- It is registered with app.error()
> Express checks fn.length.
? Where should error handlers be registered?
- Before the routes
+ After all routes and other middleware
- Anywhere
> Errors only travel forward.
? What does next(err) do?
- Continues normally
+ Skips normal middleware and goes to the next error handler
- Restarts the server
> It switches the chain into error mode.
```

:::keypoints
- **Middleware** = `(req, res, next)` functions in an ordered chain: log, parse, auth, validate, route.
- `next()` continues; `next(err)` jumps to the **error middleware** `(err, req, res, next)` (4 params), registered **last**; a 404 handler after the routes.
- **Express 5** handles rejected promises; **Express 4** needs an `asyncHandler`.
- Validate input with a schema, set limits, add `helmet`, `cors`, rate limits, request ids and structured logging.
- Middleware factories (`rateLimiter(options)`) make configurable, testable building blocks.
:::
