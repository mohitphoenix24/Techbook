---
title: Testing Node.js code, and a production checklist
level: advanced
time: 35
summary: The built-in test runner, assert, mocks and fake timers, what to test at each level (unit, integration, end to end), testing HTTP handlers without a server, and a senior-level checklist for security, observability and operations before shipping.
---

## What to test, and how

```
          ▲        few, slow, expensive
         ╱ ╲       End-to-end (browser / full system)
        ╱───╲
       ╱     ╲     Integration (real DB, real HTTP, several modules)
      ╱───────╲
     ╱         ╲   Unit (pure functions, one module, fast, many)
    ╱───────────╲
         ▼         many, fast, cheap
```

- **Unit tests:** pure logic (validators, pricing, parsers). Fast, no network, no DB.
- **Integration tests:** your code with **real** dependencies (a test database in Docker, an HTTP call to your app). They find wiring and query bugs.
- **End-to-end tests:** the whole system as a user sees it (Playwright, Cypress). Few, for critical flows.
- **Contract tests:** the API shape between services (Pact, schema checks).

Good tests are **deterministic** (no real time, randomness or network unless intended), **independent** (any order), and **fast**.

## The built-in test runner (`node:test`) and `assert`

Since Node 18/20 no library is needed:

```js
// sum.test.js        run with:  node --test      (or: node --test --experimental-test-coverage)
import { test, describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { sum, fetchUser } from "./sum.js";

describe("sum", () => {
  it("adds numbers", () => {
    assert.equal(sum(2, 3), 5);
  });
  it("rejects non-numbers", () => {
    assert.throws(() => sum("a", 1), { name: "TypeError", message: /number/ });
  });
});

test("fetchUser returns a user (async)", async () => {
  const user = await fetchUser(7);
  assert.deepEqual(user, { id: 7, name: "Asha" });
  await assert.rejects(fetchUser(-1), { code: "NOT_FOUND" });
});
```

Other popular runners: **Vitest** (fast, Vite, Jest-compatible API), **Jest**, **Mocha** + **Chai**. The ideas are the same.

### `assert` in action

```js run node title="assert: equality, deep equality, throws, rejects"
const assert = require("node:assert/strict");

function attempt(label, fn) {
  try { fn(); console.log("pass  ", label); } catch (e) { console.log("FAIL  ", label, "->", e.code); }
}

attempt("equal numbers", () => assert.equal(2 + 2, 4));
attempt("strict: '4' is not 4", () => assert.equal("4", 4));
attempt("deepEqual objects", () => assert.deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
attempt("deepEqual differs", () => assert.deepEqual({ a: 1 }, { a: 2 }));
attempt("throws", () => assert.throws(() => JSON.parse("{bad"), SyntaxError));
attempt("ok", () => assert.ok(0, "zero is falsy"));

assert.rejects(Promise.reject(new TypeError("nope")), TypeError).then(() => console.log("pass   rejects (async)"));
```

## Mocks, stubs and fake timers

Replace slow or non-deterministic dependencies with **test doubles**:

| Double | Meaning |
|---|---|
| **Stub** | returns fixed answers |
| **Mock / spy** | records calls so you can assert how it was used |
| **Fake** | a simple working replacement (in-memory DB) |

```js run node title="mock.fn and fake timers from node:test"
const { mock } = require("node:test");
const assert = require("node:assert/strict");

(async () => {
  // a function to test, with its dependencies injected
  async function notifyUser(userId, { getUser, sendEmail, now }) {
    const user = await getUser(userId);
    if (!user.email) return "skipped";
    await sendEmail(user.email, `Hi ${user.name}, sent at ${now().toISOString()}`);
    return "sent";
  }

  const getUser = mock.fn(async (id) => (id === 1 ? { name: "Asha", email: "asha@mail.com" } : { name: "Ravi" }));
  const sendEmail = mock.fn(async () => {});
  const now = () => new Date("2024-01-15T10:00:00Z");                    // a fixed clock: deterministic

  console.log(await notifyUser(1, { getUser, sendEmail, now }), await notifyUser(2, { getUser, sendEmail, now }));
  console.log("getUser calls:", getUser.mock.callCount(), "| sendEmail calls:", sendEmail.mock.callCount());
  console.log("email args:", sendEmail.mock.calls[0].arguments);

  // fake timers: test debounce/timeouts without waiting
  mock.timers.enable({ apis: ["setTimeout"] });
  let fired = false;
  setTimeout(() => { fired = true; }, 60_000);                          // a one-minute timer
  mock.timers.tick(59_999); const before = fired;
  mock.timers.tick(1);
  console.log("fired before 60 s:", before, "| after 60 s:", fired);
  mock.timers.reset();
})();
```

**Design for testability:** pass dependencies in (dependency injection), keep **pure logic separate from I/O**, inject the **clock** and **random**, avoid hidden globals.

## Testing HTTP handlers

Two approaches: call the handler with fake objects, or start the app on a random port and use `fetch`.

```js run node title="An integration test: real server on port 0, real fetch"
const http = require("node:http");
const assert = require("node:assert/strict");

function createServer(db) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    const match = req.url.match(/^\/users\/(\d+)$/);
    if (req.method === "GET" && match) {
      const user = await db.find(Number(match[1]));
      return user ? send(200, user) : send(404, { error: "not found" });
    }
    send(404, { error: "no route" });
  });
}

(async () => {
  const fakeDb = { find: async (id) => (id === 1 ? { id: 1, name: "Asha" } : null) };   // a fake instead of a real database
  const server = createServer(fakeDb);
  await new Promise((r) => server.listen(0, r));                                          // port 0 = a free port: tests can run in parallel
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let r = await fetch(`${base}/users/1`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { id: 1, name: "Asha" });

    r = await fetch(`${base}/users/99`);
    assert.equal(r.status, 404);

    r = await fetch(`${base}/unknown`);
    assert.equal((await r.json()).error, "no route");
    console.log("all integration assertions passed");
  } finally {
    server.close();                                                                       // always clean up
  }
})();
```

For Express/Fastify apps use **supertest** (`request(app).get("/users/1").expect(200)`) or Fastify's `app.inject()`, which do not need a port.

## Coverage, CI and flaky tests

- **Coverage** shows untested lines (`node --test --experimental-test-coverage`, `c8`, `nyc`). Aim for meaningful tests, not 100%.
- Run tests **in CI** on every pull request, with linting, type checks and `npm audit`.
- **Flaky tests** (sometimes fail) usually come from real time, shared state, order dependence, or un-awaited promises. Fix them: fake timers, isolated data, `await` everything. Do not just retry.
- **Snapshot tests** are useful for stable output, but review them: blind updates hide bugs.

## A production checklist (senior level)

**Configuration and security**
- [ ] Config from environment, **validated at start-up**; **no secrets in the repo or logs**.
- [ ] `helmet` / security headers, **CORS** restricted, **rate limiting**, request **size limits**, **timeouts** (server, upstream calls, DB queries).
- [ ] **Input validation** (schemas) on every boundary; **parameterised queries** (no string-built SQL); output encoding.
- [ ] **Authentication and authorisation** on every route; secure cookies (`HttpOnly`, `Secure`, `SameSite`); passwords hashed with scrypt/argon2/bcrypt.
- [ ] Dependencies: `npm audit`, lockfile committed, automated updates (Renovate/Dependabot), minimal Docker image, non-root user.

**Reliability**
- [ ] **Graceful shutdown**, **health checks** (liveness/readiness), at least 2 replicas.
- [ ] **Central error handling**; unhandled errors logged and the process restarted by a supervisor.
- [ ] **Retries with back-off + jitter**, **timeouts**, **circuit breakers** for dependencies; **idempotency** for retried writes.
- [ ] Bounded queues, caches and pools; **back-pressure**; no `*Sync` calls in request paths.
- [ ] Database **migrations** that are backward compatible; backups tested.

**Observability**
- [ ] **Structured logs** with request ids; log levels; no PII in logs.
- [ ] **Metrics** (RED: rate, errors, duration; event-loop lag, memory, pool usage) and **alerts**.
- [ ] **Tracing** across services (OpenTelemetry).
- [ ] Error tracking (Sentry etc.) with release versions and source maps.

**Delivery**
- [ ] CI: lint, type-check, tests, build, audit. **One artefact** (image) promoted through environments.
- [ ] Feature flags / staged rollouts; quick **rollback**.
- [ ] Documentation: README, runbook (how to deploy, debug, who to call), ADRs for big decisions.

:::interview How do you test a Node.js service, and what would you check before taking it to production?
"I use a test pyramid: many fast unit tests for pure logic with dependencies injected so I can use mocks and fake timers, integration tests that start the app on a random port and call it with fetch or supertest against a real or containerised database, and a few end-to-end tests for critical journeys. I make tests deterministic by injecting the clock and randomness, run them in CI with coverage, and fix flaky tests instead of retrying. Before production I check configuration and secrets, input validation, authentication and authorisation, security headers, rate limits and timeouts, graceful shutdown and health checks, structured logging with request ids, metrics and alerts, dependency audits, and a rollback plan."
:::

## More interview questions on this topic

:::qa What is the difference between a mock, a stub and a fake? {level=medium}
**Say this:** "A stub returns canned answers; a mock or spy also records calls so the test can assert on interactions; a fake is a lightweight working implementation, like an in-memory repository."

**In simple words:** Stub answers, mock remembers, fake pretends well enough to work.
:::

:::qa Why start a test server on port 0? {level=easy}
**Say this:** "Port 0 asks the OS for a free port, so tests can run in parallel without port conflicts, and the test reads the actual port from `server.address()`."

**In simple words:** Let the OS pick a free number.
:::

:::qa How do you test code that uses `setTimeout` or `Date.now()`? {level=medium}
**Say this:** "Inject the clock or use fake timers (`mock.timers`, Jest/Vitest fake timers) so tests advance time instantly and deterministically instead of waiting."

**In simple words:** Move the clock by hand.
:::

:::qa What makes a test flaky and how do you fix it? {level=medium}
**Say this:** "Real time, randomness, shared state between tests, ordering dependence, unawaited async work or external services. Fix the root cause with fakes, isolation and proper awaiting; do not just add retries."

**In simple words:** The test depends on luck; remove the luck.
:::

```quiz
? Which test type should be the most numerous?
- End-to-end
- Integration
+ Unit
> Fast and cheap, a base of the pyramid.
? What does listening on port 0 do?
- Disables the server
+ Lets the OS choose a free port
- Uses port 80
> Useful for parallel tests.
? What is a good way to test timers quickly?
- Wait for them
+ Fake timers (mock.timers / jest fake timers)
- Skip the test
> Advance virtual time instantly.
```

:::keypoints
- **Pyramid**: many unit tests, some integration (real HTTP/DB), few end-to-end. Tests must be **deterministic, independent, fast**.
- **`node:test` + `node:assert/strict`**, `mock.fn`, `mock.timers`; or Vitest/Jest/Mocha. Use **dependency injection**; inject the clock.
- Test HTTP apps on **port 0** with `fetch`/supertest. Fix **flaky** tests at the root.
- **Production checklist**: config/secrets, validation, auth, headers, limits, timeouts; graceful shutdown, health, retries/circuit breakers; logs, metrics, tracing, alerts; CI, audits, rollback.
:::
