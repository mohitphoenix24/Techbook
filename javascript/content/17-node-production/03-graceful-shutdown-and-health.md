---
title: Graceful shutdown, health checks and zero-downtime deploys
level: advanced
time: 35
summary: Why servers must shut down gracefully, a complete shutdown sequence (stop accepting, drain keep-alive connections, close dependencies, timeout), readiness and liveness endpoints, and how it fits Docker and Kubernetes rolling updates.
---

## Why it matters

Servers are stopped all the time: **deploys**, **scaling down**, **crashes and restarts**, **node maintenance**. If your process just dies on `SIGTERM`:

- in-flight requests get **connection reset** errors (users see failures),
- database transactions or file writes stop **half-way**,
- queue messages are **lost or processed twice**,
- logs and metrics are **not flushed**.

A **graceful shutdown** lets the process finish its work, then exit **by itself**.

## The shutdown sequence

```viz algo=state title="Lifecycle of a graceful shutdown"
state running "Running" [initial] @0,1
state draining "Draining (no new work)" @1,1
state closing "Closing resources" @2,1
state exited "Exited" [final] @3,1
running -> draining : SIGTERM
draining -> closing : in-flight work done
closing -> exited : exit(0)
draining -> exited : timeout (force exit 1)
play: SIGTERM, in-flight work done, exit(0)
```

1. **Receive** `SIGTERM` (Docker/Kubernetes send it first) or `SIGINT` (Ctrl+C).
2. **Stop accepting new work:** `server.close()`, mark the app **not ready** (so the load balancer stops sending traffic).
3. **Drain:** wait for in-flight requests, jobs and websockets to finish (with a **maximum time**).
4. **Close dependencies in order:** HTTP server → queues/consumers → database pools → caches → loggers (flush).
5. **Exit** with `0`. If the timeout is reached, **force exit** with a non-zero code.

## A complete example

```js run node title="A server with graceful shutdown that waits for in-flight requests"
const http = require("node:http");

let ready = true;                      // readiness flag
let inFlight = 0;
const events = [];

const server = http.createServer(async (req, res) => {
  if (req.url === "/ready") return res.writeHead(ready ? 200 : 503).end(ready ? "ready" : "shutting down");
  if (req.url === "/live") return res.end("alive");
  inFlight++;
  try {
    await new Promise((r) => setTimeout(r, 200));              // a slow request (200 ms)
    res.end("work done");
  } finally {
    inFlight--;
    if (!ready) server.closeIdleConnections();                  // shutting down: a connection that just became idle must be closed now
  }
});

async function shutdown(signal) {
  events.push(`${signal} received`);
  ready = false;                                                // 1. fail readiness: the load balancer stops sending new traffic
  const closed = new Promise((resolve) => server.close(resolve));    // 2. stop accepting connections; callback runs when all connections end
  server.closeIdleConnections?.();                              //    drop idle keep-alive connections right away (Node 18.2+)
  const forced = new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000).unref());
  const result = await Promise.race([closed.then(() => "drained"), forced]);       // 3. wait, but not forever
  events.push(`shutdown result: ${result}, in-flight now: ${inFlight}`);
  // 4. here: await db.end(); await queue.close(); await logger.flush();
  return result;
}

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const slowRequest = fetch(base + "/work").then((r) => r.text());          // starts now, takes 200 ms
  await new Promise((r) => setTimeout(r, 50));                              // the request is in flight

  const stopped = shutdown("SIGTERM");                                      // the orchestrator asks us to stop
  console.log("response of the in-flight request:", await slowRequest);     // it still completes normally!
  console.log("shutdown:", await stopped);
  console.log(events);

  const late = await fetch(base + "/work").then((r) => r.text(), (e) => "refused: " + e.cause?.code);
  console.log("a new request after shutdown:", late);
});
```

The in-flight request **finishes normally**; new connections are refused. Notice the line in the handler's `finally`: without it, the client's **idle keep-alive connection** would keep the server open until the timeout (try deleting that line and see `shutdown: timeout`).

### Keep-alive connections

HTTP **keep-alive** keeps TCP connections open for reuse. `server.close()` waits for **all** connections to end, and an idle keep-alive connection can hold the process open for a long time. Use:

- `server.closeIdleConnections()` right after `close()` (closes connections with no active request),
- `server.closeAllConnections()` in the **force** path,
- or set a short `server.keepAliveTimeout`.

## Health checks: liveness vs readiness

| Probe | Question | Fails when | Kubernetes action |
|---|---|---|---|
| **Liveness** `/healthz` | "Is the process alive and not stuck?" | deadlock, event loop blocked | **Restart** the container |
| **Readiness** `/ready` | "Can it serve traffic **now**?" | starting up, DB down, shutting down, overloaded | **Remove from the load balancer** (do not restart) |
| **Startup** | "Has it finished starting?" | slow start | wait before liveness checks |

```js
app.get("/healthz", (req, res) => res.sendStatus(200));                  // cheap: no dependencies checked
app.get("/ready", async (req, res) => {
  if (shuttingDown) return res.sendStatus(503);
  try { await Promise.all([db.ping(), cache.ping()]); res.sendStatus(200); }
  catch { res.sendStatus(503); }
});
```

Do **not** make liveness depend on the database: if the DB is down, restarting all your pods will not fix it and makes things worse.

## Kubernetes and Docker details

1. K8s sends **`SIGTERM`**, then waits **`terminationGracePeriodSeconds`** (default 30), then **`SIGKILL`**.
2. Meanwhile it removes the pod from the Service endpoints, but this takes a moment, so some traffic can still arrive. A common trick: **wait 5 to 10 s after `SIGTERM`** before closing the server (`preStop` hook with `sleep`, or `setTimeout`) so the load balancer has stopped sending traffic.
3. In Docker, run Node **directly** (`CMD ["node", "server.js"]`), not via `npm start` or a shell script, otherwise **`SIGTERM` never reaches Node** (the shell receives it). Use `tini` or `--init` for correct signal forwarding and zombie reaping.
4. Set the grace period **longer than** your longest request.

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "server.js"]        # exec form: Node is PID 1 and receives SIGTERM
```

## Rolling deploys and zero downtime

Run **at least 2 instances** behind a load balancer. A rolling update starts a new pod, waits until it is **ready**, then terminates an old one (gracefully). With **readiness probes** and **graceful shutdown**, no request is dropped. Also: make DB migrations **backward compatible** (expand → deploy → contract), because old and new versions run at the same time.

## What else to drain

- **Queue consumers:** stop fetching, finish the current message, ack/nack, close the channel.
- **WebSockets:** send a "going away" close frame (code 1001), let clients reconnect elsewhere.
- **Background jobs / cron:** stop scheduling new, finish or hand over running ones.
- **DB pools:** `await pool.end()` after requests finish.
- **Logs/metrics:** flush buffers (`pino.final`, `logger.flush`).

:::interview What is a graceful shutdown and how do you implement it in Node.js? What are liveness and readiness probes?
"On SIGTERM or SIGINT I stop accepting new work: I fail the readiness check, call `server.close()` and close idle keep-alive connections, then wait for in-flight requests and jobs to finish, with an overall timeout after which I force exit. Then I close dependencies in order: queue consumers, database pools, caches, flush the logger, and exit with 0. In Kubernetes, SIGTERM is followed by SIGKILL after the grace period, so the timeout must be shorter, and the app must run as PID 1 in exec form or with tini to receive the signal. Liveness answers 'is the process stuck?' and triggers a restart, so it must not depend on external services; readiness answers 'can it serve traffic now?' and removes the pod from the load balancer, and fails while starting up, when a dependency is down, or during shutdown."
:::

## More interview questions on this topic

:::qa Why does `server.close()` sometimes not let the process exit? {level=medium}
**Say this:** "It stops accepting new connections but waits for existing ones, including idle keep-alive connections, to end. Call `closeIdleConnections()` (and `closeAllConnections()` on timeout) or lower `keepAliveTimeout`."

**In simple words:** Someone is still holding the door open.
:::

:::qa What is the difference between liveness and readiness? {level=easy}
**Say this:** "Liveness decides whether to restart the container; readiness decides whether to route traffic to it."

**In simple words:** Dead? Restart. Busy? Just do not send customers for now.
:::

:::qa Why might SIGTERM never reach your Node app in Docker? {level=hard}
**Say this:** "If it is started via `npm start`, a shell script or the shell form of CMD, the shell (or npm) is PID 1 and does not forward signals. Use `CMD [\"node\", \"server.js\"]` or `tini`."

**In simple words:** The middleman swallows the message.
:::

:::qa How do you avoid dropping requests during a Kubernetes rolling update? {level=hard}
**Say this:** "Readiness probes so new pods get traffic only when ready, graceful shutdown on SIGTERM with draining, a short delay before closing the server so the endpoint removal propagates, a grace period longer than the longest request, multiple replicas, and backward-compatible migrations."

**In simple words:** New ones join only when ready; old ones leave only when empty.
:::

```quiz
? What should a readiness probe do during shutdown?
- Return 200
+ Return 503 so the load balancer stops sending traffic
- Restart the app
> Fail readiness first.
? Which probe should NOT depend on the database?
- Readiness
+ Liveness
- Both should
> A restart will not fix an outage of the DB.
? Why run Node with CMD ["node", "server.js"] in Docker?
- It is faster
+ So Node is PID 1 and receives SIGTERM directly
- It uses less memory
> Shell wrappers do not forward signals.
```

:::keypoints
- Graceful shutdown: **SIGTERM → fail readiness → `server.close()` + close idle connections → drain with a timeout → close DB/queues → flush logs → exit 0**.
- **Keep-alive** connections can block `close()`: `closeIdleConnections()`.
- **Liveness** (restart, no dependencies) vs **readiness** (traffic, can include dependencies and shutdown state).
- Docker/K8s: exec-form `CMD`, `tini`, grace period > longest request, wait a few seconds for endpoint removal.
- Zero downtime = ≥2 replicas + readiness + graceful shutdown + backward-compatible migrations.
:::
