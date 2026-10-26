---
title: "Node bank: scaling, performance and security"
level: hard
time: 30
summary: Twelve answers on cluster and worker threads, horizontal scaling, caching, databases and connection pools, profiling, memory limits, the main security risks in Node and supply chain safety.
---

:::qa How do you use all CPU cores with Node? {level=medium}
**Say this:** "Run several processes: the `cluster` module, a process manager such as PM2, or simply several containers behind a load balancer. For CPU-heavy tasks inside one process use `worker_threads`. Keep services stateless so any instance can handle any request."

**In simple words:** One Node process uses one core; start more processes or hire helpers.
:::

:::qa `cluster` versus `worker_threads` versus `child_process`? {level=hard}
**Say this:** "`cluster` forks processes that share the same server port, good for scaling HTTP across cores. `worker_threads` run JavaScript in threads of one process with their own event loop, able to share memory with `SharedArrayBuffer`, good for CPU-bound jobs. `child_process` starts any program, with strong isolation and communication through pipes or IPC."

**In simple words:** Copies of the app, helper threads inside the app, or separate programs.
:::

:::qa How do you scale a Node service horizontally? {level=medium}
**Say this:** "Make it stateless (sessions in Redis or in tokens, files in object storage), put a load balancer in front, share nothing in memory, use health checks and autoscaling, and move work to queues (BullMQ, SQS) for slow jobs. Watch the database, which becomes the next bottleneck."

**In simple words:** Many identical copies, no personal memory, and a doorman distributing visitors.
:::

:::qa What caching layers can you use? {level=medium}
**Say this:** "HTTP caching (`Cache-Control`, `ETag`) and a CDN for public responses, an in-process cache for tiny hot data (with a size limit), Redis for shared caches, and database query caching. Decide invalidation (TTL, explicit delete, versioned keys) and protect against cache stampedes."

**In simple words:** Remember answers close to where they are needed, and decide when they go stale.
:::

:::qa Why use a database connection pool? {level=easy}
**Say this:** "Opening a connection is slow and databases limit the number of connections. A pool reuses a fixed number of open connections. Size it by what the database can handle across all app instances, release connections in `finally`, and set timeouts."

**In simple words:** Keep a few phone lines open and share them.
:::

:::qa What is the N+1 query problem? {level=medium}
**Say this:** "One query to load a list, then one more query per item to load its related data (1 + N queries). Fix with joins, `IN (...)` batching, eager loading in the ORM, or a DataLoader that batches and caches per request."

**In simple words:** Asking the shop a hundred separate questions instead of one list.
:::

:::qa How do you find performance problems in a Node service? {level=medium}
**Say this:** "Measure first: percentile latencies (p95, p99) and throughput, event-loop delay, CPU and memory. Profile with `node --cpu-prof`, `--inspect` and Chrome DevTools, clinic.js flame graphs, or `0x`. Load-test with autocannon or k6, and use tracing (OpenTelemetry) across services."

**In simple words:** Find the slow step with tools, then fix that step.
:::

:::qa How do you limit and monitor memory in Node? {level=hard}
**Say this:** "Set `--max-old-space-size` below the container limit, watch `process.memoryUsage()` and GC metrics, take heap snapshots when it grows, and look for unbounded caches, listeners and closures. Streaming instead of buffering also reduces peak memory."

**In simple words:** Give the process a ceiling, and watch how close it gets.
:::

:::qa What are the main security risks for a Node API? {level=medium}
**Say this:** "Injection (SQL, NoSQL, command), broken authentication and authorisation, XSS in rendered output, SSRF when fetching user-supplied URLs, path traversal in file access, insecure deserialisation, prototype pollution, unlimited request sizes or regex ReDoS, and vulnerable dependencies."

**In simple words:** Never trust input, and check who is asking for what.
:::

:::qa How do you prevent command and path injection? {level=medium}
**Say this:** "Never build shell commands from user input; use `execFile`/`spawn` with an argument array and no shell. For files, resolve the path and check it stays inside an allowed directory (`path.resolve` and `startsWith(base + path.sep)`), and use allow-lists for names."

**In simple words:** Pass pieces separately, and stay inside the allowed folder.
:::

:::qa What is prototype pollution, and how do you stop it? {level=hard}
**Say this:** "An attacker-controlled key like `__proto__` or `constructor.prototype` in a merge, clone or path-setting function modifies `Object.prototype`, affecting every object (for example setting `isAdmin`). Block those keys, use `Object.create(null)` or `Map`, validate input with schemas, and keep dependencies updated. `node --disable-proto=delete` can help as a mitigation."

**In simple words:** A crafted key reaches into the shared parent object and changes it for everyone.
:::

:::qa How do you reduce supply chain risk from npm packages? {level=medium}
**Say this:** "Commit the lock file and use `npm ci`, run `npm audit` and automated updates, prefer well-maintained packages with few dependencies, review new dependencies, disable install scripts when you can (`--ignore-scripts`), use 2FA and provenance for your own packages, and scan in CI."

**In simple words:** Every package is code from strangers; choose and check carefully.
:::

:::keypoints
- Scale with **processes/containers**, workers for **CPU**, queues for **slow jobs**; stay **stateless**.
- Use **connection pools**, avoid **N+1**, cache with a clear **invalidation** plan.
- Measure **p95/p99**, event-loop delay and memory; profile with flame graphs.
- Security basics: **validate input, parameterise queries, no shell strings, path checks, block `__proto__`, audit dependencies**.
:::
