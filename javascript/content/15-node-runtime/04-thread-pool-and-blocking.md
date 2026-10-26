---
title: The libuv thread pool, and what blocks Node
level: advanced
time: 30
summary: Which Node operations run on the thread pool (fs, crypto, zlib, dns.lookup), the default size of 4 and UV_THREADPOOL_SIZE, how to see it in action, which calls block the main thread, and how to detect event-loop lag.
---

## "Node is single-threaded", but not completely

Your JavaScript runs on **one thread**. But some operations have **no non-blocking version at the OS level** (for example, many file system calls and password hashing). For those, libuv uses a **thread pool** of worker threads (C++, not JavaScript) and the result comes back to the event loop as a callback.

```viz algo=chain title="Which work goes where"
node js "JavaScript thread (1)" @0,0 [hl]
  note: your code + event loop
node pool "libuv thread pool (4 threads)" @1,0 [ok]
  fs.*  (most file operations)
  crypto: pbkdf2, scrypt, randomBytes
  zlib: gzip, brotli
  dns.lookup
node os "OS async I/O (epoll / kqueue / IOCP)" @2,0 [fn]
  note: TCP / UDP sockets, pipes, http
link js -> pool : blocking-style work
link js -> os : network I/O
```

| Runs in the **thread pool** (default 4 threads) | Runs through **OS async I/O** (no pool) | Runs **on the JS thread** (blocks it) |
|---|---|---|
| `fs` (most async functions), `fs.promises` | TCP/UDP sockets, `http`, `net`, `dgram` | Your own loops and calculations |
| `crypto.pbkdf2`, `scrypt`, `randomBytes`, `randomFill` | pipes, TTYs | `JSON.parse` / `stringify` of big data |
| `zlib` (gzip, deflate, brotli) | child process pipes | **All `*Sync` functions** (`readFileSync`, `pbkdf2Sync`...) |
| `dns.lookup` (and `getaddrinfo`) | `dns.resolve*` (c-ares) | regex with heavy backtracking |

## See the pool in action

`crypto.pbkdf2` is deliberately slow (password hashing). Run 1 job, then 4, then 8, and watch the time:

```js run node title="Four jobs in parallel, then eight" nondet
const crypto = require("node:crypto");

function hash() {
  return new Promise((resolve, reject) =>
    crypto.pbkdf2("password", "salt", 200000, 64, "sha512", (err) => (err ? reject(err) : resolve())));
}

async function timeJobs(n) {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, hash));
  return Date.now() - t0;
}

(async () => {
  const one = await timeJobs(1);
  const four = await timeJobs(4);
  const eight = await timeJobs(8);
  console.log("1 job :", one > 0);
  console.log("4 jobs take about as long as 1 (4 threads in parallel):", four < one * 2.5);
  console.log("8 jobs take about twice as long (4 threads, two rounds):", eight > four * 1.4);
})();
```

With 4 threads (and 4 or more CPU cores), 4 jobs take roughly as long as one. 8 jobs need **two rounds**.

### Changing the pool size

```bash
UV_THREADPOOL_SIZE=16 node app.js        # up to 1024; set before the first use of the pool
```

Or at the top of the entry file: `process.env.UV_THREADPOOL_SIZE = 16;` (only works if set before the pool is first used). More threads helps when many slow fs/crypto/zlib/DNS calls run at once and you have spare CPU cores. More threads than cores will **not** speed up CPU-bound hashing.

## A slow `dns.lookup` can starve fs

All pool users share the 4 threads. If 4 slow DNS lookups are pending, a `fs.readFile` must **wait** for a free thread, even though disks are fast. This is a real production gotcha ("my file reads are slow when DNS is slow"). Mitigations: raise `UV_THREADPOOL_SIZE`, use `dns.resolve*` instead of `lookup`, cache DNS, or set connection pooling.

## What actually blocks the main thread

```js run node title="Sync APIs block the event loop; async versions do not" nondet
const fs = require("node:fs");
const crypto = require("node:crypto");

let ticks = 0;
const timer = setInterval(() => ticks++, 5);               // a "heartbeat": should tick every 5 ms

function after(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  await after(60);
  const beforeSync = ticks;
  crypto.pbkdf2Sync("password", "salt", 300000, 64, "sha512");    // SYNC: blocks the thread
  await after(0);
  const duringSync = ticks - beforeSync;

  const beforeAsync = ticks;
  await new Promise((r) => crypto.pbkdf2("password", "salt", 300000, 64, "sha512", r));   // ASYNC: thread pool
  const duringAsync = ticks - beforeAsync;
  clearInterval(timer);

  console.log("heartbeat ticks during the SYNC hash :", duringSync <= 1);
  console.log("heartbeat ticks during the ASYNC hash:", duringAsync >= 5);
})();
```

During the **sync** call the heartbeat could not run. During the **async** call it kept ticking.

### Other blockers

- `JSON.parse` / `JSON.stringify` of tens of MB.
- Big loops and sorting; array methods over millions of items.
- **Regular expressions with catastrophic backtracking** (ReDoS).
- `fs.readFileSync`, `execSync`, `spawnSync` after start-up.
- Large `Buffer` operations such as `toString()` on hundreds of MB.
- Synchronous logging to a slow terminal (`console.log` on a pipe is sync in some cases).

```js run title="ReDoS: a regular expression that takes exponential time" nondet
const evil = /^(a+)+$/;
const input = "a".repeat(24) + "!";                          // the "!" makes the match fail after trying every split

const t0 = Date.now();
evil.test(input);
console.log("took a long time for just 25 characters:", Date.now() - t0 > 100);
```

## Measuring event loop lag

If the loop is blocked, timers fire **late**. Measure the lateness:

```js run node title="monitorEventLoopDelay and a manual lag check" nondet
const { monitorEventLoopDelay } = require("node:perf_hooks");

const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

const end = Date.now() + 120;
while (Date.now() < end) {}                                // block the loop for ~120 ms

setTimeout(() => {
  h.disable();
  console.log("max lag is above 100 ms:", h.max / 1e6 > 100);       // values are in nanoseconds
  console.log("p99 and mean exist:", h.percentile(99) > 0, h.mean > 0);
}, 50);
```

In production export this as a metric (APM tools like Datadog, New Relic and Prometheus clients include it). Alert when lag goes above, say, 100 ms.

## Rules of thumb

1. Prefer **async** APIs. In servers, never use `*Sync` calls inside request handlers (start-up code is fine).
2. For **CPU-bound** work use **`worker_threads`**, a **child process** or an external queue/service. The thread pool is for libuv's own blocking calls, not for your JavaScript.
3. **Stream** big data. Do not load whole files.
4. Watch **thread pool saturation** when using bcrypt/scrypt/pbkdf2, zlib, fs under high load.
5. Measure **event loop lag**, not only CPU.

:::interview Node.js is single-threaded, so how do fs and crypto operations not block it? What is the thread pool?
"The JavaScript code and event loop run on one thread, but libuv keeps a pool of worker threads, four by default, for operations that cannot be done with non-blocking OS APIs: most fs calls, crypto functions like pbkdf2, scrypt and randomBytes, zlib and dns.lookup. When I call the async version, the work is queued to the pool, the main thread continues, and the completion callback is queued to the event loop. Network I/O uses OS-level async mechanisms (epoll, kqueue, IOCP) without the pool. The pool is shared, so slow DNS lookups can delay file reads; `UV_THREADPOOL_SIZE` raises it. Sync APIs, big JSON work, and regex backtracking run on the main thread and block everything."
:::

## More interview questions on this topic

:::qa What is the default thread pool size and how do you change it? {level=easy}
**Say this:** "Four. Set the environment variable `UV_THREADPOOL_SIZE` (up to 1024) before the pool is first used."

**In simple words:** Four helpers by default; you can hire more.
:::

:::qa Which operations use the thread pool and which use OS async I/O? {level=medium}
**Say this:** "Pool: most fs operations, crypto (pbkdf2, scrypt, randomBytes), zlib, `dns.lookup`. OS async: network sockets (TCP, UDP, HTTP), pipes."

**In simple words:** Files and hashing go to the helpers; network is handled by the operating system.
:::

:::qa Why is `fs.readFileSync` bad in a request handler? {level=easy}
**Say this:** "It blocks the main thread until the file is read, so no other request can be processed during that time. Use `fs.promises.readFile` or streams."

**In simple words:** One slow customer holds up the entire queue.
:::

:::qa How would you detect that the event loop is blocked in production? {level=hard}
**Say this:** "Track event loop lag with `perf_hooks.monitorEventLoopDelay` or by measuring how late a timer fires, export it as a metric and alert on high percentiles; then profile with `--cpu-prof` or clinic to find the blocking code."

**In simple words:** A timer that arrives late is a sign the loop was busy.
:::

```quiz
? Which operation uses the libuv thread pool?
- http.get
+ crypto.pbkdf2 (async)
- A for loop
> Crypto hashing goes to the pool.
? What is the default size of the thread pool?
- 1
+ 4
- 16
> Change with UV_THREADPOOL_SIZE.
? Why can slow DNS lookups slow down fs.readFile?
- They share the CPU cache
+ They share the same four pool threads
- Both use the network
> The pool is a shared resource.
```

:::keypoints
- Your JS runs on **1 thread**; libuv has a **thread pool (4 by default)** for **fs, crypto (pbkdf2/scrypt), zlib, dns.lookup**. Network I/O uses the **OS** async mechanism.
- Change the pool size with **`UV_THREADPOOL_SIZE`**. The pool is **shared**: saturation causes surprising delays.
- **Blockers:** `*Sync` APIs, big JSON, heavy loops, regex backtracking.
- Use **worker threads** for CPU-bound JS. Measure **event-loop lag** (`monitorEventLoopDelay`).
:::
