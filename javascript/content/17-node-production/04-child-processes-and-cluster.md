---
title: child_process, cluster and scaling Node across CPU cores
level: advanced
time: 30
summary: spawn, exec, execFile and fork and when to use each, IPC between parent and child, the cluster module and PM2, horizontal scaling and its pitfalls (shared state, sticky sessions), and how to choose between threads, processes and containers.
---

## Why more than one process?

One Node process uses **one CPU core** for your JavaScript. A server with 8 cores would waste 7 of them. And a crash kills the only process. So we run **several processes**, and sometimes spawn **other programs** (ffmpeg, git, Python scripts).

| Tool | Creates | Use for |
|---|---|---|
| **`child_process`** | child OS processes (any program) | run commands, tools, or other Node scripts |
| **`cluster`** | several Node processes **sharing one server port** | scale an HTTP server over CPU cores on one machine |
| **`worker_threads`** | threads inside one process | CPU-bound JS with shared memory options |
| **Containers / orchestrator** (Docker + Kubernetes, PM2) | many processes / machines | production scaling and restarts |

## child_process: four ways to run a program

| Function | Output | Shell? | Best for |
|---|---|---|---|
| `exec(cmd, cb)` | **buffered** (whole stdout/stderr in memory) | yes (a shell string) | short commands with small output |
| `execFile(file, args, cb)` | buffered | **no shell** (safer) | run a program with arguments |
| `spawn(cmd, args)` | **streams** (stdout/stderr are streams) | no (optional) | long-running or large-output commands |
| `fork(modulePath)` | streams **+ an IPC channel** | no | run **another Node script** and send messages |

```js run node title="execFile and spawn"
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

(async () => {
  // execFile: no shell, arguments are an array (safe from injection), output buffered
  const { stdout } = await run(process.execPath, ["-e", "console.log('hello from a child', 6 * 7)"]);
  console.log(stdout.trim());

  // errors: a non-zero exit code rejects, with stdout/stderr attached
  try { await run(process.execPath, ["-e", "console.error('oops'); process.exit(3)"]); }
  catch (e) { console.log("exit code:", e.code, "| stderr:", e.stderr.trim()); }

  // spawn: streams, good for big or endless output
  await new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", "for (let i = 1; i <= 3; i++) console.log('line', i)"]);
    child.stdout.on("data", (chunk) => process.stdout.write("  child said: " + chunk));
    child.on("close", (code) => { console.log("child closed with code", code); resolve(); });
  });
})();
```

### Never build shell commands from user input

```js
const { exec, execFile } = require("node:child_process");

exec(`convert ${userFile} out.png`);                    // DANGEROUS: userFile = "a.png; rm -rf ~" runs the second command!
execFile("convert", [userFile, "out.png"]);             // SAFE: arguments are not interpreted by a shell
```

This is **command injection**. Prefer `execFile`/`spawn` with an **argument array**, and validate the inputs.

## fork: another Node script with a message channel

```js run node title="fork: parent and child exchange messages"
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-"));
const childFile = path.join(dir, "child.js");
fs.writeFileSync(childFile, `
  process.on("message", (msg) => {
    if (msg === "exit") process.exit(0);
    process.send({ doubled: msg.n * 2, isChild: typeof process.send === "function" });     // reply to the parent
  });
`);

const child = fork(childFile);                                  // a new Node process running that file, with an IPC channel
child.on("message", (m) => { console.log("parent received:", m); child.send("exit"); });
child.on("exit", (code) => { console.log("child exited with code", code); fs.rmSync(dir, { recursive: true }); });
child.send({ n: 21 });
```

Messages are copied (JSON-like serialisation, or structured clone with `serialization: "advanced"`). Use IPC for **jobs** and **control messages**, not for huge data.

## cluster: use all CPU cores for a server

The **primary** process forks **workers**. All workers listen on the **same port**: the primary (or the OS) distributes incoming connections between them (round robin on most platforms).

```js
const cluster = require("node:cluster");
const http = require("node:http");
const os = require("node:os");

if (cluster.isPrimary) {
  const workers = os.availableParallelism();                    // number of CPU cores
  for (let i = 0; i < workers; i++) cluster.fork();

  cluster.on("exit", (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died (${signal || code}): starting a new one`);
    cluster.fork();                                              // self-healing: replace a dead worker
  });
} else {
  http.createServer((req, res) => res.end(`handled by worker ${process.pid}\n`)).listen(3000);
}
```

Benefits: uses all cores, **one crashing worker does not take the site down**. In practice, most teams now let **PM2** (`pm2 start app.js -i max`) or the **orchestrator** (several container replicas) do this, instead of writing cluster code.

### Pitfalls of multiple processes

Each worker has **its own memory**, so **in-process state is not shared**:

| Problem | Fix |
|---|---|
| In-memory sessions, caches, rate-limit counters differ per worker | Store them in **Redis** or a database |
| WebSocket connections live in one worker | Use a pub/sub adapter (Redis) to broadcast between workers; or **sticky sessions** (same client → same worker) |
| In-memory job queues | Use a real queue (BullMQ/Redis, SQS, RabbitMQ) |
| Scheduled jobs run N times (once per worker) | Run them in **one** process, or use a distributed lock / a scheduler service |
| DB connections multiply | Size pools: `pool_size × workers × instances` must be below the DB limit |
| Logs are interleaved | Use structured logs with the pid / instance id |

```js run node title="Processes do not share memory"
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "share-"));
const file = path.join(dir, "counter-child.js");
fs.writeFileSync(file, `let counter = 0; process.on("message", () => { counter++; process.send(counter); });`);

let counter = 0;                                            // the parent's own variable
const child = fork(file);
const results = [];
child.on("message", (n) => {
  results.push(n);
  if (results.length === 3) {
    child.kill();
    console.log("the child counted:", results, "| the parent's variable is still:", counter);
    fs.rmSync(dir, { recursive: true });
  }
});
child.send("hit"); child.send("hit"); child.send("hit");
```

## Scaling out: processes, machines and containers

```viz algo=arch title="From one process to a scalable service"
lb Load balancer [lb]
n1 Node instance 1 (container) [service]
n2 Node instance 2 (container) [service]
n3 Node instance 3 (container) [service]
redis Redis (sessions, cache, queue) [cache]
db Database [db]
lb -> n1 : round robin
lb -> n2
lb -> n3
n1 -> redis
n2 -> redis
n3 -> redis
n1 -> db
n2 -> db
n3 -> db
```

Keep the application **stateless** (state in Redis/DB), build one **container image**, run **N replicas**, scale with an **autoscaler**. Use **worker threads** or a **queue and worker service** for CPU-heavy jobs.

## Choosing: threads vs processes vs more containers

| Need | Use |
|---|---|
| Use all cores for an HTTP API on one machine | cluster / PM2 / several replicas |
| CPU-heavy function inside a request | `worker_threads` (pool) |
| Run an external program (ffmpeg, git, python) | `spawn` / `execFile` |
| Isolate untrusted or crash-prone code | child process (separate memory) or a container |
| Long background jobs | a queue + separate worker processes/services |
| High availability | several instances on **several machines** |

:::interview What are the differences between spawn, exec, execFile and fork? How do you use all CPU cores in Node?
"`spawn` starts a command and gives streams for stdout and stderr, so it suits long-running or large output; `exec` runs a command in a shell and buffers all the output, which is fine for small output but risky with user input because of shell injection; `execFile` runs a program directly with an argument array, no shell, and buffers output; `fork` spawns another Node script with an IPC channel for messages. To use all cores I run several Node processes: the cluster module forks workers sharing one port, or more commonly PM2 or several container replicas behind a load balancer. Because processes do not share memory, I keep the app stateless and store sessions, caches and queues in Redis or the database; CPU-heavy work goes to worker threads or a job queue."
:::

## More interview questions on this topic

:::qa What is command injection, and how do you avoid it with child_process? {level=medium}
**Say this:** "If user input is concatenated into a shell command with `exec`, an attacker can add `; other-command`. I avoid it by using `execFile` or `spawn` with an argument array (no shell), and validating inputs."

**In simple words:** Do not give users a way to write extra commands.
:::

:::qa How does the cluster module share a port between workers? {level=hard}
**Say this:** "The primary process listens on the port (or hands the handle) and distributes connections to workers, using round robin by default on Linux and macOS; workers call `listen` as usual and the cluster module intercepts it."

**In simple words:** One doorman, several workers behind him.
:::

:::qa Why are in-memory sessions a problem with multiple processes? {level=medium}
**Say this:** "Each process has its own memory, so a session created in one worker is not visible to another; requests from the same user may hit different workers. Store sessions in a shared store such as Redis, or use stateless tokens."

**In simple words:** The next request may land on someone who has never met you.
:::

:::qa When would you use worker_threads instead of child_process? {level=medium}
**Say this:** "For CPU-bound JavaScript that benefits from lower overhead, shared memory (SharedArrayBuffer) and fast message passing inside one process. Child processes give stronger isolation, separate memory and can run any program."

**In simple words:** Threads for speed and sharing, processes for isolation.
:::

```quiz
? Which function avoids shell injection when running a program with user-provided arguments?
- exec
+ execFile (or spawn) with an argument array
- eval
> No shell interprets the arguments.
? What does fork() add compared to spawn()?
- A shell
+ An IPC channel for messages
- Better speed
> process.send / process.on("message").
? Why do cluster workers not share variables?
- A bug in Node
+ Each worker is a separate process with separate memory
- They are threads
> Use Redis or a database for shared state.
```

:::keypoints
- **`spawn`** (streams), **`exec`** (shell + buffered), **`execFile`** (no shell + buffered), **`fork`** (Node script + IPC).
- **Never** put user input into a shell string: use `execFile`/`spawn` with **arrays**.
- **cluster/PM2/replicas** = one process per core. Processes **share nothing**: keep the app **stateless** (Redis/DB for sessions, cache, queues, locks).
- Worker threads for CPU-bound JS; child processes for isolation and external programs; queues for background jobs.
- Size DB pools for `pool × workers × instances`.
:::
