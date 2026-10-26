---
title: "Node bank: cheat sheet"
level: easy
time: 15
summary: Core modules, the order of async queues, stream rules, error and shutdown checklist, and the questions to prepare for a backend round.
---

## Core modules you should know

| Module | Use |
|---|---|
| `node:fs` / `fs/promises` | files; prefer promises and streams for big data |
| `node:path` | build and normalise paths (`join`, `resolve`, `basename`) |
| `node:http`, `node:https` | servers and clients; Express is built on `http` |
| `node:events` | `EventEmitter`, `once`, `on` |
| `node:stream`, `stream/promises` | streams and `pipeline` |
| `node:crypto` | hashing, HMAC, random bytes, `scrypt`, `randomUUID` |
| `node:worker_threads`, `cluster`, `child_process` | parallelism |
| `node:os`, `node:process` | CPU count, memory, environment |
| `node:util` | `promisify`, `inspect`, `parseArgs` |
| `node:test`, `node:assert` | built-in test runner and assertions |

## Queues in order (CommonJS file)

1. Current synchronous code.
2. `process.nextTick` callbacks.
3. Promise microtasks (`then`, `await`, `queueMicrotask`).
4. Event loop phases: timers → pending → poll (I/O) → check (`setImmediate`) → close.

After each callback, steps 2 and 3 run again.

## Stream rules

- `write()` returned `false` → wait for `drain`.
- Use `pipeline`, not `pipe`.
- Decode text with `setEncoding` or `StringDecoder`.
- Set limits on request bodies and uploads.

## Production checklist

| Area | Check |
|---|---|
| Errors | central error middleware; log with request ID; crash on unknown errors |
| Shutdown | handle `SIGTERM`; stop accepting; drain; close pools; timeout |
| Health | separate liveness and readiness |
| Config | env variables validated at start; no secrets in the repo |
| Security | helmet, CORS, rate limit, validation, parameterised queries, `npm audit` |
| Performance | no sync I/O in handlers; pools; caching; measure p95/p99 and loop delay |
| Logging | structured JSON to stdout, no secrets |
| Deploy | lock file, `npm ci`, non-root user, exec-form `CMD`, memory limit |

## Questions to rehearse

1. How does Node handle 10,000 concurrent connections with one thread?
2. What blocks the event loop, and how do you find it?
3. How would you stream a 5 GB file to a client?
4. How do you do a graceful shutdown?
5. Sessions or JWT, and how do you revoke access?
6. How would you rate-limit an API across several servers?
7. How do you avoid N+1 queries?
8. How do you find and fix a memory leak in production?

:::keypoints
- Learn the **queue order**, the **stream rules**, and the **production checklist**.
- Rehearse the eight questions in two minutes each, with one example from your own work.
:::
