---
title: Implement a task scheduler with dependencies
level: hard
time: 40
summary: Run tasks that depend on each other in the right order, in parallel where possible, with a concurrency limit, cycle detection and clean failure handling. The idea behind build tools, CI pipelines and npm workspaces.
---

:::problem Implement a dependency-aware task runner {level=medium tags="graphs,topological sort,async,concurrency"}
Tasks are described like this:

```js
const tasks = {
  install: { run: async () => "deps" },
  lint:    { deps: ["install"], run: async ({ install }) => "lint ok" },
  test:    { deps: ["install"], run: async () => "tests ok" },
  build:   { deps: ["lint", "test"], run: async () => "built" },
};
```

Write:

1. `topoSort(tasks)` returns an order where every task comes after its dependencies. It throws on an **unknown dependency** and on a **cycle**, with a readable message (`Cycle: a -> b -> a`).
2. `runTasks(tasks, { concurrency })` runs them:
   - a task starts as soon as **all its dependencies succeeded**
   - independent tasks run **in parallel**, up to `concurrency` at once
   - `run(inputs)` receives the **results of its dependencies**
   - when a task **fails**, everything that depends on it is **skipped**, but independent tasks continue
   - it resolves with `{ name: { status: "ok" | "failed" | "skipped", value | error | because } }` and never rejects

:::hint Hint
Count how many unfinished dependencies each task has. A task with zero is **ready**. When a task finishes, decrement its dependents. For cycles, do a depth-first search and keep a "currently visiting" state.
:::
:::

## Solution and tests

```js run title="topoSort and runTasks, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function topoSort(tasks) {
  const names = Object.keys(tasks);
  for (const n of names) for (const d of tasks[n].deps ?? []) {
    if (!(d in tasks)) throw new Error(`Task '${n}' depends on unknown task '${d}'`);
  }
  const state = {};                                          // undefined = new, "visiting" = on the current path, "done"
  const order = [];
  function visit(n, path) {
    if (state[n] === "done") return;
    if (state[n] === "visiting") throw new Error("Cycle: " + [...path.slice(path.indexOf(n)), n].join(" -> "));
    state[n] = "visiting";
    for (const d of tasks[n].deps ?? []) visit(d, [...path, n]);
    state[n] = "done";
    order.push(n);                                           // after all its dependencies
  }
  names.forEach((n) => visit(n, []));
  return order;
}

function runTasks(tasks, { concurrency = Infinity } = {}) {
  topoSort(tasks);                                           // validates: throws before anything runs
  const names = Object.keys(tasks);
  const waiting = new Map(names.map((n) => [n, new Set(tasks[n].deps ?? [])]));      // unfinished dependencies
  const dependents = new Map(names.map((n) => [n, []]));
  for (const n of names) for (const d of tasks[n].deps ?? []) dependents.get(d).push(n);

  const results = {};
  const queue = names.filter((n) => waiting.get(n).size === 0);       // ready to run
  let running = 0, finished = 0;

  return new Promise((resolve) => {
    const skip = (name, because) => {
      if (results[name]) return;
      results[name] = { status: "skipped", because };
      finished++;
      for (const d of dependents.get(name)) skip(d, because);
    };
    const finish = (name, result) => {
      results[name] = result;
      finished++;
      for (const d of dependents.get(name)) {
        if (results[d]) continue;                            // already skipped because of another failure
        if (result.status !== "ok") { skip(d, name); continue; }
        waiting.get(d).delete(name);
        if (waiting.get(d).size === 0) queue.push(d);        // the last dependency finished: ready
      }
    };
    const pump = () => {
      while (running < concurrency && queue.length) {
        const name = queue.shift();
        running++;
        const inputs = Object.fromEntries((tasks[name].deps ?? []).map((d) => [d, results[d].value]));
        Promise.resolve()
          .then(() => tasks[name].run(inputs))
          .then((value) => finish(name, { status: "ok", value }), (error) => finish(name, { status: "failed", error }))
          .finally(() => { running--; pump(); });
      }
      if (finished === names.length && running === 0) resolve(results);
    };
    pump();
  });
}

// ---------------- tests ----------------
await test("topoSort puts dependencies first", () => {
  const order = topoSort({ build: { deps: ["lint", "test"] }, lint: { deps: ["install"] }, test: { deps: ["install"] }, install: {} });
  const at = (n) => order.indexOf(n);
  assert.equal(order.length, 4);
  assert.ok(at("install") < at("lint") && at("install") < at("test") && at("lint") < at("build") && at("test") < at("build"));
});

await test("topoSort reports cycles with the path", () => {
  assert.throws(() => topoSort({ a: { deps: ["b"] }, b: { deps: ["c"] }, c: { deps: ["a"] } }), /Cycle: a -> b -> c -> a/);
  assert.throws(() => topoSort({ a: { deps: ["a"] } }), /Cycle: a -> a/);
});

await test("topoSort reports unknown dependencies", () => {
  assert.throws(() => topoSort({ a: { deps: ["ghost"] } }), /unknown task 'ghost'/);
});

await test("a diamond: the shared dependency runs once, the middle ones in parallel", async () => {
  const started = [], counts = { install: 0 };
  let active = 0, peak = 0;
  const job = (name, ms = 15) => async () => {
    started.push(name); counts[name] = (counts[name] ?? 0) + 1;
    active++; peak = Math.max(peak, active); await sleep(ms); active--;
    return name + " done";
  };
  const res = await runTasks({
    install: { run: job("install") },
    lint: { deps: ["install"], run: job("lint") },
    test: { deps: ["install"], run: job("test") },
    build: { deps: ["lint", "test"], run: job("build") },
  });
  assert.equal(counts.install, 1);
  assert.equal(started[0], "install");
  assert.equal(started.at(-1), "build");
  assert.equal(peak, 2);                                     // lint and test together
  assert.deepEqual(Object.values(res).map((r) => r.status), ["ok", "ok", "ok", "ok"]);
});

await test("dependencies' results are passed in", async () => {
  const res = await runTasks({
    a: { run: async () => 2 },
    b: { run: async () => 3 },
    sum: { deps: ["a", "b"], run: async ({ a, b }) => a + b },
  });
  assert.equal(res.sum.value, 5);
});

await test("the concurrency limit is respected", async () => {
  let active = 0, peak = 0;
  const job = async () => { active++; peak = Math.max(peak, active); await sleep(10); active--; };
  const tasks = Object.fromEntries(["a", "b", "c", "d", "e"].map((n) => [n, { run: job }]));
  await runTasks(tasks, { concurrency: 2 });
  assert.equal(peak, 2);
});

await test("a failure skips dependents, independent tasks continue", async () => {
  const ran = [];
  const res = await runTasks({
    ok: { run: async () => ran.push("ok") },
    bad: { run: async () => { throw new Error("boom"); } },
    afterBad: { deps: ["bad"], run: async () => ran.push("afterBad") },
    deepAfterBad: { deps: ["afterBad"], run: async () => ran.push("deepAfterBad") },
    afterBoth: { deps: ["ok", "bad"], run: async () => ran.push("afterBoth") },
  });
  assert.equal(res.ok.status, "ok");
  assert.equal(res.bad.status, "failed");
  assert.equal(res.bad.error.message, "boom");
  assert.deepEqual([res.afterBad, res.deepAfterBad, res.afterBoth].map((r) => r.status), ["skipped", "skipped", "skipped"]);
  assert.equal(res.deepAfterBad.because, "bad");
  assert.deepEqual(ran, ["ok"]);
});

await test("an empty task list resolves at once", async () => assert.deepEqual(await runTasks({}), {}));

await test("a synchronous throw inside run is a normal failure", async () => {
  const res = await runTasks({ x: { run: () => { throw new Error("sync"); } } });
  assert.equal(res.x.status, "failed");
});

await test("invalid graphs throw before anything runs", async () => {
  let ran = false;
  await assert.rejects(async () => runTasks({ a: { deps: ["b"], run: () => (ran = true) }, b: { deps: ["a"], run: () => (ran = true) } }), /Cycle/);
  assert.equal(ran, false);
});
```

## Where you meet this

| Tool | The same idea |
|---|---|
| `make`, Gradle, Bazel, Nx, Turborepo | build targets with dependencies, parallel and cached |
| npm / pnpm workspaces | install and build packages in dependency order |
| CI pipelines (GitHub Actions `needs:`) | jobs depend on jobs |
| Webpack / Vite module graph | modules ordered by imports; **cycles** are warned about |
| Spreadsheets | cells depend on cells |

**Kahn's algorithm** is the other way to topologically sort: repeatedly take nodes with zero unfinished dependencies. The runner above is Kahn's algorithm running live.

:::qa What is a topological sort, and when is it impossible? {level=easy}
**Say this:** "It is an ordering of nodes of a directed graph where every edge goes from an earlier node to a later one. It exists only if the graph has no cycle, which is why a dependency cycle is an error."

**In simple words:** Put things in an order where each thing comes after what it needs; if A needs B and B needs A, there is no such order.
:::

:::qa Why detect cycles before running anything? {level=medium}
**Say this:** "Otherwise tasks in the cycle would wait for each other forever, and the runner would hang with no error. A pre-check gives a clear message and nothing runs partially."

**In simple words:** Fail early with a clear message instead of hanging.
:::

:::qa How would you add retries, timeouts and cancellation to the runner? {level=hard}
**Say this:** "Wrap each `run` call: `retry(() => withTimeout(run(inputs), ms))`. For cancellation, create one `AbortController` for the run and pass its signal to each task; when the user aborts, mark waiting tasks as skipped and let running ones stop through the signal."

**In simple words:** Keep the scheduler simple, and wrap the task.
:::

:::keypoints
- **Topological order** by DFS with a **visiting** state, or by counting unfinished dependencies (**Kahn**).
- Validate first: **unknown dependency** and **cycle** errors with the path.
- Runner: queue of **ready** tasks, `concurrency` limit, **decrement dependents** when a task finishes.
- On failure **skip descendants** but keep independent work going; **never reject**, return statuses.
:::
