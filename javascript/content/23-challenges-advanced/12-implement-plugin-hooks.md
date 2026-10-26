---
title: Implement a plugin system with hooks (mini tapable)
level: hard
time: 40
summary: Build the hook types behind Webpack, Babel and Vite plugins, sync, bail, waterfall, async series and async parallel, with ordering by stage, interceptors and a plugin API. A design question that tests extensibility thinking.
---

:::problem Implement hooks for a plugin system {level=hard tags="design,plugins,extensibility,async,webpack"}
A build tool, a framework or an editor must let other people add behaviour **without editing its code**. The usual design: the core exposes named **hooks**, plugins **tap** into them.

Implement these hook types (all with `tap(nameOrOptions, fn)`):

| Class | Call | Behaviour |
|---|---|---|
| `SyncHook` | `call(...args)` | run all taps, ignore results |
| `SyncBailHook` | `call(...args)` | stop at the first tap that returns something other than `undefined`, and return it |
| `SyncWaterfallHook` | `call(value, ...rest)` | each tap gets the **previous result** (a tap returning `undefined` keeps the value) |
| `AsyncSeriesHook` | `promise(...args)` | taps one after the other, each awaited |
| `AsyncParallelHook` | `promise(...args)` | all at once, wait for all |
| `AsyncSeriesWaterfallHook` | `promise(value, ...)` | async version of the waterfall |

Also:

1. **Ordering**: `tap({ name, stage })` (lower stage runs earlier, stable for equal stages) and `before: "otherName"`.
2. **Interceptors**: `hook.intercept({ call(...args), tap(tapInfo) })` for logging/profiling.
3. Using a sync hook through `promise()` or an async hook through `call()` is an **error with a clear message**.
4. A `Compiler` example with `plugin.apply(compiler)`.

:::hint Hint
One `Hook` base class with a list of taps and a method `#insert(tap)` that places by stage/before. The six types differ only in the loop that runs the taps. Keep the core tiny; behaviour comes from plugins.
:::
:::

## Solution and tests

```js run title="Hooks and a plugin API, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Hook {
  #taps = [];
  #interceptors = [];
  constructor(name = "hook") { this.name = name; }

  tap(options, fn) {
    const o = typeof options === "string" ? { name: options } : options;
    if (!o?.name) throw new TypeError("A tap needs a name (it shows up in errors and profiling)");
    if (typeof fn !== "function") throw new TypeError(`Tap '${o.name}' must be given a function`);
    const tap = { name: o.name, stage: o.stage ?? 0, fn };
    let i = this.#taps.length;
    if (o.before !== undefined) {
      const at = this.#taps.findIndex((t) => t.name === o.before);
      if (at !== -1) i = at;                                 // go in front of the named tap
    }
    while (i > 0 && this.#taps[i - 1].stage > tap.stage) i--;   // then respect the stage (stable: equal stages keep tap order)
    this.#taps.splice(i, 0, tap);
    for (const ic of this.#interceptors) ic.register?.(tap);
    return this;
  }

  intercept(interceptor) { this.#interceptors.push(interceptor); return this; }

  get taps() { return this.#taps.map(({ name, stage }) => ({ name, stage })); }

  // the runners use this to call each tap, so interceptors see every call
  _prepare(args) {
    for (const ic of this.#interceptors) ic.call?.(...args);
    return this.#taps.map((tap) => (...a) => { for (const ic of this.#interceptors) ic.tap?.(tap); return tap.fn(...a); });
  }
  _wrong(kind, method) { throw new Error(`${this.name} is ${kind === "async" ? "an" : "a"} ${kind} hook: use .${method}(), not the other one`); }
}

class SyncHook extends Hook {
  call(...args) { for (const run of this._prepare(args)) run(...args); }
  promise() { this._wrong("sync", "call"); }
}
class SyncBailHook extends Hook {
  call(...args) { for (const run of this._prepare(args)) { const r = run(...args); if (r !== undefined) return r; } }
  promise() { this._wrong("sync", "call"); }
}
class SyncWaterfallHook extends Hook {
  call(value, ...rest) {
    for (const run of this._prepare([value, ...rest])) { const r = run(value, ...rest); if (r !== undefined) value = r; }
    return value;
  }
  promise() { this._wrong("sync", "call"); }
}
class AsyncSeriesHook extends Hook {
  async promise(...args) { for (const run of this._prepare(args)) await run(...args); }
  call() { this._wrong("async", "promise"); }
}
class AsyncParallelHook extends Hook {
  async promise(...args) { await Promise.all(this._prepare(args).map((run) => run(...args))); }
  call() { this._wrong("async", "promise"); }
}
class AsyncSeriesWaterfallHook extends Hook {
  async promise(value, ...rest) {
    for (const run of this._prepare([value, ...rest])) { const r = await run(value, ...rest); if (r !== undefined) value = r; }
    return value;
  }
  call() { this._wrong("async", "promise"); }
}

// ---------------- a tiny "compiler" that exposes hooks and loads plugins ----------------
class Compiler {
  hooks = {
    init: new SyncHook("init"),
    resolve: new SyncBailHook("resolve"),
    transform: new SyncWaterfallHook("transform"),
    beforeEmit: new AsyncSeriesWaterfallHook("beforeEmit"),
    done: new AsyncParallelHook("done"),
  };
  constructor({ plugins = [] } = {}) {
    for (const plugin of plugins) typeof plugin === "function" ? plugin.call(this, this) : plugin.apply(this);   // the plugin API
    this.hooks.init.call(this);
  }
  async build(source) {
    const resolved = this.hooks.resolve.call(source) ?? source;
    const code = this.hooks.transform.call(resolved);
    const output = await this.hooks.beforeEmit.promise(code);
    await this.hooks.done.promise(output);
    return output;
  }
}

// ---------------- tests ----------------
await test("SyncHook runs every tap in order", () => {
  const log = [], hook = new SyncHook();
  hook.tap("a", (x) => log.push("a" + x)).tap("b", (x) => log.push("b" + x));
  hook.call(1);
  assert.deepEqual(log, ["a1", "b1"]);
});

await test("stage and before control the order", () => {
  const log = [], hook = new SyncHook();
  hook.tap("middle", () => log.push("middle"));
  hook.tap({ name: "late", stage: 10 }, () => log.push("late"));
  hook.tap({ name: "early", stage: -10 }, () => log.push("early"));
  hook.tap({ name: "mine", before: "middle" }, () => log.push("mine"));
  hook.tap("sameStageAsMiddle", () => log.push("same"));
  hook.call();
  assert.deepEqual(log, ["early", "mine", "middle", "same", "late"]);
  assert.deepEqual(hook.taps.map((t) => t.name), ["early", "mine", "middle", "sameStageAsMiddle", "late"]);
});

await test("SyncBailHook stops at the first answer", () => {
  const log = [], hook = new SyncBailHook();
  hook.tap("miss", () => { log.push("miss"); });
  hook.tap("hit", () => { log.push("hit"); return "/abs/path"; });
  hook.tap("never", () => { log.push("never"); });
  assert.equal(hook.call("./x"), "/abs/path");
  assert.deepEqual(log, ["miss", "hit"]);
  assert.equal(new SyncBailHook().call(), undefined);
});

await test("SyncWaterfallHook passes results along; undefined keeps the value", () => {
  const hook = new SyncWaterfallHook();
  hook.tap("trim", (s) => s.trim()).tap("noop", () => {}).tap("upper", (s) => s.toUpperCase());
  assert.equal(hook.call("  hi "), "HI");
});

await test("waterfall also passes the extra arguments", () => {
  const hook = new SyncWaterfallHook();
  hook.tap("add", (value, amount) => value + amount);
  assert.equal(hook.call(1, 10), 11);
});

await test("AsyncSeriesHook waits for each tap", async () => {
  const log = [], hook = new AsyncSeriesHook();
  hook.tap("slow", async () => { await sleep(20); log.push("slow"); });
  hook.tap("fast", async () => { log.push("fast"); });
  await hook.promise();
  assert.deepEqual(log, ["slow", "fast"]);
});

await test("AsyncParallelHook runs taps together", async () => {
  const hook = new AsyncParallelHook();
  let active = 0, peak = 0;
  for (const name of ["a", "b", "c"]) hook.tap(name, async () => { active++; peak = Math.max(peak, active); await sleep(15); active--; });
  await hook.promise();
  assert.equal(peak, 3);
});

await test("AsyncSeriesWaterfallHook", async () => {
  const hook = new AsyncSeriesWaterfallHook();
  hook.tap("a", async (v) => { await sleep(5); return v + 1; }).tap("b", async (v) => v * 10);
  assert.equal(await hook.promise(1), 20);
});

await test("a failing tap rejects the whole call", async () => {
  const series = new AsyncSeriesHook(), parallel = new AsyncParallelHook();
  for (const hook of [series, parallel]) hook.tap("bad", async () => { throw new Error("plugin exploded"); });
  await assert.rejects(series.promise(), /plugin exploded/);
  await assert.rejects(parallel.promise(), /plugin exploded/);
});

await test("using the wrong calling style is a clear error", async () => {
  assert.throws(() => new SyncHook("init").promise(), /init is a sync hook: use \.call\(\)/);
  assert.throws(() => new AsyncSeriesHook("done").call(), /done is an async hook: use \.promise\(\)/);
});

await test("taps must have a name and a function", () => {
  assert.throws(() => new SyncHook().tap({}, () => {}), /needs a name/);
  assert.throws(() => new SyncHook().tap("x", "not a function"), /must be given a function/);
});

await test("interceptors see every call and every tap", () => {
  const seen = [], hook = new SyncHook();
  hook.intercept({ call: (...a) => seen.push("call " + a.join()), tap: (t) => seen.push("tap " + t.name), register: (t) => seen.push("register " + t.name) });
  hook.tap("p1", () => {}).tap("p2", () => {});
  hook.call(7);
  assert.deepEqual(seen, ["register p1", "register p2", "call 7", "tap p1", "tap p2"]);
});

await test("a Compiler loads plugins that tap its hooks", async () => {
  const log = [];
  class AliasPlugin { apply(compiler) { compiler.hooks.resolve.tap("AliasPlugin", (req) => (req === "@/app" ? "src/app.js" : undefined)); } }
  class BannerPlugin { apply(compiler) { compiler.hooks.beforeEmit.tap("Banner", async (code) => `/* built */\n${code}`); } }
  class MinifyPlugin { apply(compiler) { compiler.hooks.transform.tap({ name: "Minify", stage: 100 }, (code) => code.replace(/\s+/g, " ")); } }
  const functionPlugin = (compiler) => compiler.hooks.done.tap("Logger", (out) => log.push("done: " + out.length > 0));
  const compiler = new Compiler({ plugins: [new AliasPlugin(), new MinifyPlugin(), new BannerPlugin(), functionPlugin] });
  compiler.hooks.transform.tap("Uppercase", (code) => code.toUpperCase());       // runs before Minify (stage 0 < 100)
  const out = await compiler.build("@/app");
  assert.equal(out, "/* built */\nSRC/APP.JS");
  assert.equal(log.length, 1);
});

await test("plugins do not need to know about each other", async () => {
  const c = new Compiler();
  assert.equal(await c.build("plain"), "plain");              // with no plugins the core still works
});
```

## The idea behind the design

- The **core stays small**: it defines *when* things happen (the hooks), not *what* happens.
- Hook types encode the **contract** between core and plugins: "may stop the chain" (bail), "may transform the value" (waterfall), "may run side effects in parallel" (parallel).
- Names on taps make **debugging and profiling** possible ("which plugin took 4 s?").
- Order is explicit (`stage`, `before`), because plugin order bugs are the hardest to find.

| Real system | How it exposes extension points |
|---|---|
| **Webpack** | `tapable` hooks on the compiler and compilation (this lesson) |
| **Rollup / Vite** | plugin objects with hook *methods* (`resolveId`, `load`, `transform`), `enforce: "pre" \| "post"` for ordering |
| **Babel** | visitor objects per AST node type |
| **Express / Koa** | middleware chain |
| **Fastify, Hapi** | lifecycle hooks and plugin encapsulation |
| **VS Code, browsers** | contribution points and events, run in separate processes for safety |

:::qa Plugins or inheritance for extension: why plugins? {level=medium}
**Say this:** "Inheritance couples the extension to the exact class and allows only one parent, so combining two extensions is hard. Plugins attach to named extension points, many can be combined, and the core can load, order, and isolate them."

**In simple words:** Plug things in; do not rebuild the machine.
:::

:::qa What can go wrong with plugin systems? {level=hard}
**Say this:** "Order dependence (plugin A must run before B), one slow or broken plugin affecting everyone, shared mutable state between plugins, unclear hook contracts, and security, because plugins run with full privileges. Mitigations: explicit ordering, timeouts and error reporting with plugin names, immutable or copied inputs, versioned hook APIs, and sandboxing (separate processes or workers) for untrusted code."

**In simple words:** Plugins can be late, wrong or hostile; the core must expect that.
:::

:::qa Why does the waterfall hook treat `undefined` as 'keep the value'? {level=medium}
**Say this:** "A plugin that only observes (logs, measures) has no reason to return anything. Treating `undefined` as 'no change' lets such taps exist without breaking the chain, while a tap that wants to change the value returns the new one."

**In simple words:** Say nothing if you have nothing to change.
:::

:::keypoints
- **Core defines hooks; plugins tap them**: `tap(name, fn)`, `call` / `promise`.
- Types: **sync, bail, waterfall, async series, async parallel, async waterfall**; each is just a different loop.
- **Order explicitly** with `stage` and `before`; **name every tap**; add **interceptors** for logging and timing.
- Fail loudly on **wrong call style** and on invalid taps; one failing plugin rejects the call with its name visible.
:::
