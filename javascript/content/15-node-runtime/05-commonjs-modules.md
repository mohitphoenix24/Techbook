---
title: CommonJS modules: require, module.exports and caching
level: intermediate
time: 30
summary: How require works (resolution, wrapper function, caching), exports vs module.exports, circular dependencies with partial exports, require.main, JSON and dynamic requires, and how it differs from ES modules.
---

## CommonJS in a nutshell

**CommonJS (CJS)** is Node's original module system, still used by most older packages and by files that do not opt in to ES modules.

```js
// math.js
const PI = 3.14159;
function area(r) { return PI * r * r; }
module.exports = { PI, area };              // what other files get

// app.js
const { area } = require("./math");          // synchronous: returns module.exports
console.log(area(2));
```

## The wrapper function

Node does not run your file as-is. It wraps it in a function, which is why `require`, `module`, `exports`, `__filename` and `__dirname` exist **in every file** without being globals:

```js
(function (exports, require, module, __filename, __dirname) {
  // ...your file's code...
});
```

```js run cjs node title="The five wrapper variables"
console.log(typeof exports, typeof require, typeof module, typeof __filename, typeof __dirname);
console.log(exports === module.exports, this === module.exports);       // at the top level, `this` is module.exports
console.log(require.main === module);                                    // true if this file was started directly with `node file.js`
console.log(arguments.length);                                           // the 5 wrapper arguments are available as `arguments`
```

`require.main === module` is the CommonJS way to write "run this only when executed directly, not when imported" (`if (require.main === module) main();`).

## `exports` vs `module.exports`

At the start, **`exports` is a reference to `module.exports`** (the same empty object). `require` returns **`module.exports`**, not `exports`.

```js run cjs node title="The exports trap"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cjs-"));
const write = (name, code) => fs.writeFileSync(path.join(dir, name), code);

write("good1.js", `exports.a = 1; exports.b = 2;`);                         // adding properties: fine
write("good2.js", `module.exports = { a: 1, b: 2 };`);                      // replacing: fine
write("good3.js", `module.exports = function hello() { return "hi"; };`);   // export a function
write("bad.js", `exports = { a: 1, b: 2 };`);                               // re-assigning the local variable only!

for (const name of ["good1", "good2", "good3", "bad"]) console.log(name.padEnd(5), require(path.join(dir, name + ".js")));
fs.rmSync(dir, { recursive: true });
```

Rule: **add properties** to `exports`, or **replace** `module.exports`. Never reassign `exports`. (Reassigning only changes a local variable.)

## How `require("x")` finds the file

1. **Core module** (`fs`, `node:path`...): returned directly.
2. **Relative or absolute path** (`./a`, `../lib/b`, `/x`): try the exact file, then `.js`, `.json`, `.node`, then a **folder** (`package.json` "main", then `index.js`).
3. **Bare name** (`lodash`): look in `./node_modules/lodash`, then `../node_modules`, then up to the root, then global folders.

```js run cjs node title="require.resolve shows the real path"
console.log(require.resolve("node:fs"));
console.log(require.resolve("node:path"), "| builtin?", require("node:module").builtinModules.includes("fs"));
try { require("this-package-does-not-exist"); } catch (e) { console.log(e.code, "-", e.message.split("\n")[0]); }
console.log(module.paths.slice(0, 2).map((p) => p.endsWith("node_modules")));      // the lookup folders for bare names
```

## Caching: a module runs once

The first `require` loads, runs and **caches** the module (in `require.cache`, keyed by the resolved filename). Later requires return the **same `module.exports` object**. That makes modules **singletons** and makes shared state possible.

```js run cjs node title="Modules are cached, so state is shared"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-"));
fs.writeFileSync(path.join(dir, "counter.js"), `console.log("counter.js runs"); let n = 0; module.exports = { inc: () => ++n };`);
const file = path.join(dir, "counter.js");

const a = require(file);
const b = require(file);                                      // no second "counter.js runs"
console.log(a === b, a.inc(), b.inc());

delete require.cache[require.resolve(file)];                  // force a reload (rarely needed; used by hot reloaders and tests)
const c = require(file);
console.log(c === a, c.inc());
fs.rmSync(dir, { recursive: true });
```

## Values are copied, not live

`module.exports.count` is read **when you require**. If you destructure a primitive, you get a **copy** and will not see later changes (unlike ES module live bindings).

```js run cjs node title="No live bindings in CommonJS"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-"));
fs.writeFileSync(path.join(dir, "state.js"), `
  exports.count = 0;
  exports.increment = function () { exports.count++; };      // update through exports, not a local variable
`);
const file = path.join(dir, "state.js");

const { count, increment } = require(file);
const whole = require(file);
increment();
console.log("destructured copy:", count, "| through the module object:", whole.count);
fs.rmSync(dir, { recursive: true });
```

## Circular dependencies

If **a** requires **b** and **b** requires **a**, Node gives b a **partially filled** `module.exports` of a (whatever a had exported **before** it called `require("./b")`).

```js run cjs node title="Circular require gives a partial export"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "circ-"));
const w = (n, c) => fs.writeFileSync(path.join(dir, n), c);

w("a.js", `
  exports.early = "a-early";
  const b = require("./b");                              // b starts running now, and requires a again
  exports.late = "a-late";
  exports.fromB = b.sawOfA;
`);
w("b.js", `
  const a = require("./a");                              // a is only partly loaded: has early, not late
  exports.sawOfA = JSON.stringify(a);
`);
console.log(require(path.join(dir, "a.js")));
fs.rmSync(dir, { recursive: true });
```

How to avoid problems: move shared code into a **third** module, **require lazily** inside functions, or export a **factory**. Many linters can detect cycles (`eslint-plugin-import` rule `import/no-cycle`, or `madge`).

## Loading JSON and dynamic requires

```js run cjs node title="JSON files, and a dynamic require"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "json-"));
fs.writeFileSync(path.join(dir, "config.json"), '{ "port": 3000, "debug": true }');
fs.writeFileSync(path.join(dir, "plugin-a.js"), 'module.exports = () => "plugin A running";');

console.log(require(path.join(dir, "config.json")));                     // parsed object, cached
for (const name of ["plugin-a", "plugin-missing"]) {
  try { console.log(require(path.join(dir, name))()); }                  // require with a computed path: allowed in CJS
  catch (e) { console.log(name, "->", e.code); }
}
fs.rmSync(dir, { recursive: true });
```

## CommonJS vs ES modules at a glance

| | CommonJS | ES modules |
|---|---|---|
| Syntax | `require()`, `module.exports` | `import`, `export` |
| Loading | **synchronous**, at run time | **asynchronous**, parsed statically first |
| Dynamic paths | yes (`require(variable)`) | only `import()` |
| Exports | **copies** (values at require time) | **live bindings** |
| `this` at top level | `module.exports` | `undefined` |
| `__dirname`, `__filename`, `require` | available | **not available** (use `import.meta`) |
| Top-level `await` | no | yes |
| Strict mode | opt in | always |
| Tree-shaking | hard | easy |
| File type | `.js` (default), `.cjs` | `.mjs`, or `.js` with `"type": "module"` |

:::interview What is the difference between module.exports and exports? What happens with circular requires?
"`exports` is initially just a reference to `module.exports`, and `require` returns `module.exports`. So I can add properties to `exports`, or replace `module.exports` entirely, but if I reassign `exports`, I only change a local variable and the exported value is still the empty object. Modules are loaded synchronously, run once and cached, so they behave like singletons. With circular requires, the second module gets the first one's partially populated `module.exports`, whatever it had exported before the `require` call, so I restructure to break cycles or require lazily inside functions. CommonJS exports are copies; ES modules export live bindings."
:::

## More interview questions on this topic

:::qa What does Node do when you call `require` for the same file twice? {level=easy}
**Say this:** "The first call loads, runs and caches it in `require.cache`. The second call returns the cached `module.exports` without running the file again."

**In simple words:** The file runs once; everyone shares the same result.
:::

:::qa How is `__dirname` available in every file if it is not a global? {level=medium}
**Say this:** "Node wraps each CommonJS file in a function with parameters `exports, require, module, __filename, __dirname`, so they are local to each file."

**In simple words:** Each file is secretly a function, and these are its arguments.
:::

:::qa How can you run code only if a file is run directly? {level=easy}
**Say this:** "`if (require.main === module) { ... }` in CommonJS. In ES modules compare `import.meta.url` with the script path (or `import.meta.main` in newer runtimes)."

**In simple words:** "Am I the main script, or was I imported?"
:::

:::qa Why is `module.exports = ...` replaced but `exports = ...` ignored? {level=medium}
**Say this:** "`exports` is a local variable that starts pointing to the same object as `module.exports`. Re-assigning it changes the variable, not `module.exports`, which is what `require` returns."

**In simple words:** You moved your own name tag, not the object Node hands out.
:::

```quiz
? What does require() return?
- exports
+ module.exports
- The file text
> The value of module.exports at the end of loading.
? What does a second require of the same file do?
- Runs it again
+ Returns the cached exports
- Throws an error
> Modules are cached.
? What does a circular dependency give the second module?
- An error
+ A partially filled export object of the first module
- Nothing at all
> Whatever had been exported before the require call.
```

:::keypoints
- CJS: **`require`** (synchronous), **`module.exports`**, each file wrapped in a function `(exports, require, module, __filename, __dirname)`.
- **`exports` starts as `module.exports`**: add properties, or replace `module.exports`; never reassign `exports`.
- **Resolution**: core → relative/absolute (try `.js`, `.json`, folder/`index.js`) → `node_modules` upwards. **Cached** (`require.cache`): a module runs once.
- Exports are **copies**; **circular** requires give **partial** exports. `require.main === module` = "run directly".
:::
