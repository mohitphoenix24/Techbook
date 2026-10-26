---
title: ES modules: import, export and how they differ from CommonJS
level: intermediate
time: 30
summary: Named and default exports, live bindings, dynamic import, top-level await, import.meta, circular imports, tree-shaking, using modules in browsers and Node, and a preview of the CommonJS comparison.
---

## Why modules?

Before modules, scripts shared one global scope, so names clashed, and load order mattered. **Modules** give each file its **own scope**, with explicit **imports** and **exports**, and let tools remove unused code.

## Named and default exports

```js
// math.js
export const PI = 3.14159;                       // named export
export function area(r) { return PI * r * r; }   // named export
export default class Calculator {}               // ONE default export per file

// app.js
import Calculator, { PI, area as circleArea } from "./math.js";   // default + named, with a rename
import * as math from "./math.js";                                 // namespace object: math.PI, math.area
```

| Style | Export | Import | When |
|---|---|---|---|
| **Named** | `export const a = 1` | `import { a } from "./m.js"` | Many things per file; tools can find usages and tree-shake |
| **Default** | `export default fn` | `import anyName from "./m.js"` | A file whose main job is one thing (a component, a class) |
| **Re-export** | `export { a } from "./m.js"` or `export * from "./m.js"` | | Barrel files (`index.js`) |
| **Side-effect only** | | `import "./polyfill.js"` | Run a file without importing names |

Many teams prefer **named exports only**: the name is the same everywhere (good for search, refactoring and auto-import), unlike default exports which can be renamed on every import.

## Modules are real files: let us run an example

Browsers and Node load modules from files. The next example writes a few small files to a temporary folder and imports them, so you can see the behaviour with real output.

```js run node title="Live bindings, singletons and a cycle-free demo"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esm-"));
const write = (name, code) => fs.writeFileSync(path.join(dir, name), code);

write("counter.mjs", `
  export let count = 0;                         // an exported variable
  export function increment() { count++; }
  export default { id: "singleton" };
  console.log("counter.mjs is evaluated (once)");
`);

write("main.mjs", `
  import config, { count, increment } from "./counter.mjs";
  import * as ns from "./counter.mjs";
  import config2 from "./counter.mjs";           // second import: same module, not evaluated again

  console.log("before:", count, ns.count);
  increment();
  console.log("after: ", count, ns.count);       // LIVE binding: the imported name sees the change
  console.log("same default object:", config === config2);
  try { count = 99; } catch (e) { console.log(e.name + ":", e.message); }   // imports are read-only
`);

import(pathToFileURL(path.join(dir, "main.mjs")).href).then(() => fs.rmSync(dir, { recursive: true }));
```

Key facts shown here:

1. A module is **evaluated once**, the first time it is imported. Everyone shares the same instance (that is why a module-level object is a singleton).
2. **Live bindings:** an imported `count` is a **read-only view of the exporter's variable**, not a copy. If the exporter changes it, importers see the new value. (CommonJS copies values: `const { count } = require(...)` would stay 0.)
3. **Imports are read-only.** Assigning to an imported name throws a TypeError.

## Static structure: why `import` cannot be dynamic

`import` and `export` statements are **static**: they must be at the top level, with **string literals** as paths, so tools can analyse the dependency graph **before running** the code:

- **Tree-shaking:** bundlers remove exports that nobody imports.
- **Early errors:** a wrong import name is a SyntaxError at load time.
- Imports are **hoisted**: they run before the rest of the module's code.

```js
if (needsChart) {
  import { draw } from "./chart.js";          // SyntaxError: imports cannot be inside blocks
}
const name = "./chart.js";
import x from name;                            // SyntaxError: the path must be a literal
```

## Dynamic `import()`: load on demand

`import(path)` is an **expression** that returns a **promise** of the module namespace. Use it for **code splitting** (load heavy code only when needed), conditional loading, and loading by a computed path.

```js run node title="Dynamic import()"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dyn-"));
fs.writeFileSync(path.join(dir, "heavy.mjs"), `
  console.log("heavy module loaded now");
  export const answer = 42;
  export default function greet(name) { return "hello " + name; }
`);

(async () => {
  console.log("before import()");
  const mod = await import(pathToFileURL(path.join(dir, "heavy.mjs")).href);
  console.log(Object.keys(mod), mod.answer, mod.default("Asha"));      // default export is under .default
  const { answer } = await import(pathToFileURL(path.join(dir, "heavy.mjs")).href);    // cached: no second "loaded" log
  console.log(answer);
  fs.rmSync(dir, { recursive: true });
})();
```

In React: `const Chart = React.lazy(() => import("./Chart.js"))`, in a router: `() => import("./pages/Settings.js")`.

## Top-level await

In a module you can use `await` outside a function. The module (and everything that imports it) **waits** until the promise settles.

```js
// config.js
const response = await fetch("/config.json");     // other modules importing this one wait for it
export const config = await response.json();
```

Use it for startup work (loading config, connecting to a DB). Be careful: it **blocks the module graph**, so slow awaits slow your whole start-up.

## `import.meta`

```js
console.log(import.meta.url);        // the file's own URL: file:///project/src/app.js (or https://... in a browser)
const here = new URL("./data.json", import.meta.url);      // path relative to THIS file (replaces __dirname)
// Node 20.11+: import.meta.dirname, import.meta.filename
```

## Circular imports

Module A imports B and B imports A. ES modules handle this thanks to **live bindings and hoisting**: the bindings exist before the code runs, but they are in the **temporal dead zone** until initialised. A function that uses the other module's export **later** works; using it **during** module evaluation can throw a `ReferenceError`.

```js run node title="A circular import: it works when use is delayed"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyc-"));
const w = (n, c) => fs.writeFileSync(path.join(dir, n), c);

w("a.mjs", `import { b } from "./b.mjs"; export const a = "A"; export const callB = () => "a sees " + b;`);
w("b.mjs", `import { a, callB } from "./a.mjs";
  export const b = "B";
  export const peek = () => "b sees a = " + a;           // used later: fine
  try { console.log(a); } catch (e) { console.log("during evaluation:", e.name); }   // used now: a is not initialised yet
`);
w("main.mjs", `import { callB } from "./a.mjs"; import { peek } from "./b.mjs"; console.log(callB(), "|", peek());`);

import(pathToFileURL(path.join(dir, "main.mjs")).href).then(() => fs.rmSync(dir, { recursive: true }));
```

Fix circular imports by **moving shared code to a third module**, or by delaying use to a function call.

## Modules in the browser and in Node

| | Browser | Node.js |
|---|---|---|
| Enable | `<script type="module" src="app.js">` | file ends in `.mjs`, or `"type": "module"` in `package.json` |
| Strict mode | always | always |
| Top-level `this` | `undefined` | `undefined` |
| Path rules | URLs: `./a.js` or full `https://...`; **extension required** | relative paths with **extension**; bare names (`"lodash"`) come from `node_modules` |
| Deferred? | Yes: module scripts run **after** HTML parsing (like `defer`) | |
| `require`, `__dirname` | not available | not available in ESM (use `import.meta.*` or `createRequire`) |

The next module covers **CommonJS vs ESM in Node** in depth, including interop and the dual-package problem.

:::interview What are ES modules? How do they differ from CommonJS?
"ES modules are the standard module system: `import` and `export` statements are static, so tools can analyse them and tree-shake unused exports. Each module has its own scope, is strict, is evaluated once and cached, and exports are live read-only bindings rather than copies. They load asynchronously and support top-level await and dynamic `import()`. CommonJS uses `require` and `module.exports`, is synchronous, dynamic, and exports copies of values. In Node I use ESM with `.mjs` or `type: module`, and I know the interop rules between the two."
:::

## More interview questions on this topic

:::qa What does "live binding" mean? {level=medium}
**Say this:** "An imported name is a read-only reference to the variable in the exporting module, so when the exporter changes it, importers see the new value. CommonJS exports copy values at require time."

**In simple words:** A window onto the variable, not a photo of it.
:::

:::qa Can you use `import` conditionally? {level=easy}
**Say this:** "Not the statement, since it is static and hoisted. Use dynamic `import()`, which returns a promise, for conditional or lazy loading."

**In simple words:** `import` is a declaration. `import()` is a function-like call.
:::

:::qa What is tree-shaking and why does it need ES modules? {level=medium}
**Say this:** "Removing unused exports from the bundle. It works because ES module imports and exports are static, so a bundler can see exactly which names are used without running the code."

**In simple words:** The bundler can tell what you use, because the imports are written in plain sight.
:::

:::qa Named vs default exports: which do you prefer? {level=medium}
**Say this:** "Named exports: consistent names, better refactoring and auto-imports, and easy re-exports. Default exports can be imported under any name, which makes code harder to search."

**In simple words:** Names that cannot be changed on import are easier to follow.
:::

```quiz
? When is a module's top-level code run?
- Every time it is imported
+ Once, on the first import (the result is cached)
- Never until you call it
> Module instances are singletons.
? What do you get from `import { count } from "./c.js"` when c.js later changes count?
- The old value (a copy)
+ The new value (a live binding)
- An error
> Imports are live, read-only views.
? Which loads a module only when needed?
- import x from "./x.js"
+ await import("./x.js")
- require.lazy
> Dynamic import returns a promise.
```

:::keypoints
- ES modules: own scope, strict, **evaluated once**, **static** `import`/`export`, hoisted.
- **Live, read-only bindings**; named exports preferred; one default per file.
- **Dynamic `import()`** = promise, for lazy loading and code splitting. **Top-level await** delays dependants.
- `import.meta.url` replaces `__dirname`. Circular imports work if use is delayed.
- Browser: `type="module"`. Node: `.mjs` or `"type": "module"`; file extensions are required.
:::
