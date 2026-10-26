---
title: process, environment variables, signals and CLIs
level: intermediate
time: 30
summary: The process object (argv, env, exit codes, stdin/stdout, signals, events), configuration with environment variables and dotenv-style loading, graceful shutdown, and building a small command-line tool.
---

## The `process` object

`process` is a global object that represents **the running Node process**. It is an EventEmitter.

```js run node title="What process tells you"
console.log(typeof process.pid, process.platform.length > 0, process.version.startsWith("v"), typeof process.arch);
console.log(process.argv.length >= 2, typeof process.cwd(), typeof process.uptime(), typeof process.hrtime.bigint());
console.log(Object.keys(process.memoryUsage()).join(", "));
console.log(process.versions.node === process.version.slice(1), Boolean(process.versions.v8));
console.log(process.exitCode, process.stdout.isTTY === undefined || typeof process.stdout.isTTY === "boolean");
```

| Member | Meaning |
|---|---|
| `process.argv` | `[node path, script path, ...your arguments]` |
| `process.env` | environment variables (strings!) |
| `process.cwd()`, `process.chdir()` | current working directory |
| `process.exit(code)`, `process.exitCode` | end the process (0 = success) |
| `process.stdin`, `stdout`, `stderr` | standard streams |
| `process.on("SIGINT" / "SIGTERM" / "exit" / ...)` | signals and lifecycle events |
| `process.hrtime.bigint()` | high-resolution timer (nanoseconds) |
| `process.memoryUsage()`, `cpuUsage()` | resource use |
| `process.nextTick(fn)` | the nextTick queue |
| `process.pid`, `process.platform`, `process.version(s)` | information |

## Command-line arguments

```js run cjs node title="argv and util.parseArgs"
const { parseArgs } = require("node:util");

// node app.js --port 8080 --verbose build ./src   ->  argv = [node, app.js, '--port', ...]
const argv = ["--port", "8080", "--verbose", "build", "./src"];

const { values, positionals } = parseArgs({
  args: argv,                                      // normally: process.argv.slice(2)
  options: { port: { type: "string", short: "p", default: "3000" }, verbose: { type: "boolean", short: "v" } },
  allowPositionals: true,
});
console.log(values, positionals);
console.log("port as a number:", Number(values.port) + 1);
```

For bigger CLIs use **commander**, **yargs** or **cac**: they add help text, validation and sub-commands.

## Environment variables and configuration

```js run node title="process.env: always strings, validate at start-up"
process.env.PORT = "8080";                           // normally set by the shell, container or host
process.env.DEBUG = "false";
process.env.RETRIES = "3";

const config = {
  port: Number(process.env.PORT ?? 3000),
  debug: process.env.DEBUG === "true",               // "false" is a truthy string: compare explicitly!
  retries: Number.parseInt(process.env.RETRIES ?? "1", 10),
  dbUrl: process.env.DATABASE_URL,                   // undefined: not set
};
console.log(config, typeof process.env.PORT, !!process.env.DEBUG);

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
try { requireEnv("DATABASE_URL"); } catch (e) { console.log(e.message); }       // fail fast at start-up
```

Good practices (the **Twelve-Factor** way):

- **Configuration lives in the environment**, not in code: database URLs, API keys, ports, feature flags.
- **Never commit secrets.** Use `.env` files locally (in `.gitignore`), and the platform's secret manager (AWS Secrets Manager, Vault, Kubernetes secrets) in production.
- **Validate** all configuration **once at start-up** (a schema with Zod), and fail fast with a clear message.
- Load `.env` with `node --env-file=.env app.js` (Node 20.6+) or the `dotenv` package.
- `process.env` values are **always strings**: convert them.

## Exit codes and signals

```js run node title="exit codes and the 'exit' event"
process.on("exit", (code) => console.log("exit handler runs (sync only), code =", code));

process.exitCode = 0;                                 // preferred: set the code, let the process end naturally
setTimeout(() => console.log("pending work completes first"), 10);
// process.exit(1) would stop IMMEDIATELY, even with pending work: use it only after cleanup.
```

| Code | Meaning (by convention) |
|---|---|
| 0 | success |
| 1 | general failure / uncaught exception |
| 2 | misuse (bad arguments) |
| 128 + N | killed by signal N (130 = SIGINT / Ctrl+C, 143 = SIGTERM) |

CI systems and shell scripts (`&&`, `||`, `set -e`) depend on the **exit code**.

**Signals** are messages from the OS: `SIGINT` (Ctrl+C), `SIGTERM` (polite stop: sent by Docker/Kubernetes before killing), `SIGHUP`, `SIGUSR1/2`. `SIGKILL` cannot be handled.

```js run node title="Handle SIGTERM: a graceful shutdown (we send ourselves the signal)"
const http = require("node:http");

const server = http.createServer((req, res) => res.end("ok"));
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}: stop accepting new connections`);
  server.close(() => {                               // waits for in-flight requests to finish
    console.log("all connections closed: cleanup done, exiting");
    clearTimeout(forceExit);
  });
  const forceExit = setTimeout(() => { console.log("forced exit after the timeout"); process.exit(1); }, 5000);
  forceExit.unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.listen(0, () => {
  console.log("server up");
  process.kill(process.pid, "SIGTERM");               // simulate the orchestrator stopping us
});
```

In production a graceful shutdown means: **stop accepting** new work, **finish** in-flight requests, **close** DB pools and queues, flush logs, then **exit** (with a timeout as a safety net). We cover it in the production module.

## Standard streams and building a CLI

`stdin`, `stdout` and `stderr` are streams. Convention: **results go to stdout**, **logs and errors to stderr**, so output can be piped (`node app.js > out.txt`).

```js run node title="A tiny word-count CLI reading from stdin" 
const { Readable } = require("node:stream");

async function wordCount(input) {
  let words = 0, lines = 0, chars = 0;
  for await (const chunk of input) {                 // works for process.stdin, files, any readable
    const text = chunk.toString();
    chars += text.length;
    lines += text.split("\n").length - 1;
    words += text.split(/\s+/).filter(Boolean).length;
  }
  return { lines, words, chars };
}

(async () => {
  const fakeStdin = Readable.from(["hello world\n", "this is a test\n", "node cli\n"]);     // in a real CLI: process.stdin
  const result = await wordCount(fakeStdin);
  process.stdout.write(JSON.stringify(result) + "\n");        // the data goes to stdout
  process.stderr.write("(logs go to stderr)\n");               // diagnostics go to stderr
})();
```

A real CLI starts with a **shebang** line and is registered in `package.json`:

```js
#!/usr/bin/env node
// cli.js
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { name: { type: "string" } } });
console.log(`Hello, ${values.name ?? "world"}!`);
```

```json
{ "name": "hello-cli", "type": "module", "bin": { "hello": "./cli.js" } }
```

After `npm link` or `npm i -g`, you can run `hello --name Asha`. `npx some-tool` runs a package's `bin` without installing it globally.

## Process-level error events

```js
process.on("uncaughtException", (err, origin) => { /* log, then exit: the process may be in a bad state */ });
process.on("unhandledRejection", (reason, promise) => { /* log; Node 15+ throws by default */ });
process.on("warning", (w) => console.warn(w.name, w.message));
```

(See the error-handling lesson for the right way to use these.)

:::interview How do you handle configuration and secrets in a Node.js app? How do you shut down gracefully?
"Configuration comes from environment variables, validated once at start-up with a schema, converted from strings, and failing fast if something is missing; locally from an `.env` file loaded with `--env-file` or dotenv, never committed, and in production from the platform's secret store. For shutdown I listen for SIGTERM and SIGINT, stop accepting new connections with `server.close`, wait for in-flight requests, close database pools, queues and flush logs, then exit with code 0, with a force-exit timeout as a safety net. I set `process.exitCode` rather than calling `process.exit()` directly, so pending I/O completes."
:::

## More interview questions on this topic

:::qa What are the first two items of `process.argv`? {level=easy}
**Say this:** "The path of the node executable and the path of the script. Your own arguments start at index 2: `process.argv.slice(2)`."

**In simple words:** Skip the first two.
:::

:::qa Why is `process.env.DEBUG === "false"` a classic bug source? {level=medium}
**Say this:** "Environment variables are always strings, and `'false'` is a non-empty string, which is truthy. Compare explicitly (`=== 'true'`) or parse with a schema."

**In simple words:** The text "false" is not the boolean false.
:::

:::qa What is the difference between `process.exit()` and `process.exitCode`? {level=medium}
**Say this:** "`process.exit(code)` terminates immediately, possibly dropping pending async work. Setting `process.exitCode` lets the process finish naturally and exit with that code."

**In simple words:** One pulls the plug, the other asks the app to finish and then leave.
:::

:::qa Which signal do Docker and Kubernetes send to stop a container? {level=medium}
**Say this:** "SIGTERM first, then SIGKILL after the grace period (30 s by default). So the app must handle SIGTERM to shut down gracefully."

**In simple words:** A polite request first, and then a forced stop.
:::

```quiz
? Where do your own command-line arguments start in process.argv?
- Index 0
- Index 1
+ Index 2
> The first two are node and the script path.
? What type are process.env values?
- Whatever they look like
+ Always strings
- Numbers
> Convert them yourself.
? Which signal can a Node process NOT handle?
- SIGTERM
- SIGINT
+ SIGKILL
> It terminates the process immediately.
```

:::keypoints
- `process`: `argv` (own args at index 2), `env` (**strings**), `cwd`, `exit`/`exitCode`, `stdin/stdout/stderr`, signals, events.
- **Config from the environment**, validated once at start-up; `.env` locally (`--env-file`), secrets manager in production; never commit secrets.
- **Exit codes** matter (0 = success). Prefer **`process.exitCode`** over `process.exit()`.
- **Graceful shutdown**: handle **SIGTERM/SIGINT**, stop accepting, finish in-flight work, close resources, exit.
- CLIs: **shebang + `bin`**, results to **stdout**, logs to **stderr**, `util.parseArgs` or commander.
:::
