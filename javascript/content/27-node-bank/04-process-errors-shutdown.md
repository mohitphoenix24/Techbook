---
title: "Node bank: process, errors and graceful shutdown"
level: hard
time: 20
summary: Ten answers on the process object, signals, exit codes, uncaught exceptions, unhandled rejections, graceful shutdown, health checks and running under Docker or Kubernetes.
---

:::qa What is the `process` object used for? {level=easy}
**Say this:** "It describes and controls the current Node process: `process.argv`, `process.env`, `process.cwd()`, `process.exit(code)`, `process.on(event, handler)` for signals and errors, `process.memoryUsage()`, `process.hrtime.bigint()`, and standard streams `stdin`, `stdout`, `stderr`."

**In simple words:** The control panel of your running program.
:::

:::qa What happens on an uncaught exception or unhandled rejection? {level=medium}
**Say this:** "By default (modern Node) both crash the process with a non-zero exit code. You may listen with `process.on('uncaughtException')` and `process.on('unhandledRejection')` to log and report, but after an uncaught exception the app state may be inconsistent, so exit and let a supervisor restart it."

**In simple words:** An unexpected crash is a signal that something is broken; log it, then restart cleanly.
:::

:::qa What is a graceful shutdown, and how do you implement it? {level=hard}
**Say this:** "On `SIGTERM` or `SIGINT`: stop accepting new connections (`server.close()`), mark readiness as failing, finish in-flight requests, close idle keep-alive connections, close database and queue connections, flush logs, then `process.exit(0)`. Add a timeout (for example 10 s) that forces exit if something hangs."

**In simple words:** Stop letting new customers in, serve those inside, then lock up.
:::

:::qa Why does `server.close()` seem to hang? {level=hard}
**Say this:** "It stops accepting new connections but waits for existing ones to end. Keep-alive connections can stay open for a long time. Call `server.closeIdleConnections()` (Node 18.2+) or `server.closeAllConnections()` after a grace period, and send `Connection: close` while shutting down."

**In simple words:** The door is locked, but people inside are still sitting there.
:::

:::qa What do exit codes mean? {level=easy}
**Say this:** "`0` means success; any non-zero value means failure (commonly `1`). Process managers, CI and Kubernetes use the exit code to decide whether to restart or fail the job. Set `process.exitCode` and let the loop drain instead of calling `process.exit()` abruptly, which can cut off pending writes."

**In simple words:** Zero is 'all good'; anything else is 'something went wrong'.
:::

:::qa What is the difference between liveness and readiness checks? {level=medium}
**Say this:** "Liveness answers 'is the process alive or stuck?' and a failure restarts the container. Readiness answers 'can it take traffic now?' and a failure removes it from the load balancer without restarting. Readiness should fail during start-up and shutdown or when a critical dependency is down."

**In simple words:** 'Is he breathing?' versus 'is he ready to serve?'.
:::

:::qa How do signals work with Docker and Kubernetes? {level=hard}
**Say this:** "Kubernetes sends `SIGTERM` then, after `terminationGracePeriodSeconds`, `SIGKILL`. Node must be PID 1's real handler: use `CMD ["node", "server.js"]` (exec form), not `npm start` through a shell that swallows signals, or use `tini`/`--init`. Handle `SIGTERM` as above."

**In simple words:** The platform asks nicely first; your app must listen and respond.
:::

:::qa How do you keep a Node app running in production? {level=easy}
**Say this:** "Do not run `node app.js` alone. Use a supervisor: systemd, PM2, or a container orchestrator (Docker restart policies, Kubernetes) that restarts it on crash, plus logs, health checks and resource limits."

**In simple words:** Someone must restart it if it falls.
:::

:::qa How do you handle configuration and secrets across environments? {level=medium}
**Say this:** "Twelve-factor style: configuration through environment variables, validated at start-up. Secrets from a secrets manager or the platform (not in the repo or image). Different values per environment, the same build artefact for all."

**In simple words:** Same app everywhere, different settings.
:::

:::qa How do you log in production? {level=medium}
**Say this:** "Write structured JSON logs to stdout (pino or winston), with levels, timestamps, request IDs and no secrets. Let the platform collect them. Use async logging so slow disks do not block requests, and sample or limit noisy logs."

**In simple words:** Print clean, labelled lines and let the system gather them.
:::

:::keypoints
- Crash on **programmer errors**, supervisor restarts; log with context.
- **Graceful shutdown**: stop accepting → drain → close resources → exit, with a timeout.
- Use **exec-form `CMD`** so Node receives `SIGTERM`; separate **liveness** and **readiness**.
- Config from **env**, validated at start; **structured logs** to stdout.
:::
