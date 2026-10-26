---
title: ES modules in Node.js, and CommonJS interop
level: advanced
time: 35
summary: How Node decides if a file is ESM or CJS, the differences you must handle (no __dirname, file extensions, JSON), importing CJS from ESM and the reverse, require(esm), the package.json exports field, and the dual-package hazard.
---

## How Node chooses the module system

| File | Treated as |
|---|---|
| `.mjs` | **ES module** |
| `.cjs` | **CommonJS** |
| `.js` with nearest `package.json` `"type": "module"` | **ES module** |
| `.js` with `"type": "commonjs"` or no `"type"` | **CommonJS** |
| Code from `--input-type=module` / `--eval` | flag decides |

Most new projects set `"type": "module"` in `package.json` and use `import`/`export`. Many existing packages are still CJS.

## What changes when you write ESM in Node

| CommonJS | ES module equivalent |
|---|---|
| `require("fs")` | `import fs from "node:fs"` or `import { readFile } from "node:fs/promises"` |
| `module.exports = x` | `export default x` |
| `exports.a = 1` | `export const a = 1` |
| `__filename`, `__dirname` | `import.meta.filename`, `import.meta.dirname` (Node 20.11+), or `fileURLToPath(import.meta.url)` |
| `require("./data.json")` | `import data from "./data.json" with { type: "json" }` (import attributes), or `JSON.parse(await readFile(...))` |
| `require(variable)` | `await import(variable)` |
| `require.resolve`, `require.cache` | `import.meta.resolve()`; ESM cache cannot be cleared |
| Sync loading | Async loading; **top-level `await`** allowed |
| Extensionless `require("./a")` | **Extension required**: `import "./a.js"` |
| Folder import `require("./lib")` | Not supported: `import "./lib/index.js"` |

```js run esm node title="ESM in Node: import.meta, top-level await and dynamic import"
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const file = fileURLToPath(import.meta.url);                       // the old __filename
const dir = path.dirname(file);                                      // the old __dirname
console.log(path.basename(file).startsWith("main"), typeof dir, typeof __dirname, typeof require);

const text = await readFile(file, "utf8");                           // top-level await
console.log("first line of this file:", text.split("\n")[0].slice(0, 30));

const { default: os } = await import("node:os");                    // dynamic import
console.log(typeof os.cpus);
console.log(this);                                                    // top-level `this` is undefined
```

## ESM importing CommonJS: usually fine

`import` can load a CJS module. The **default import** is always `module.exports`. **Named imports** work only if Node can detect the names statically (using `cjs-module-lexer`), which fails for dynamic exports.

```js run esm node title="Import a CommonJS file from ESM"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interop-"));
fs.writeFileSync(path.join(dir, "lib.cjs"), `exports.add = (a, b) => a + b; exports.name = "lib";`);
fs.writeFileSync(path.join(dir, "fn.cjs"), `module.exports = function shout(s) { return s.toUpperCase(); };`);

const lib = await import(pathToFileURL(path.join(dir, "lib.cjs")).href);
console.log(Object.keys(lib), lib.default.add(2, 3), lib.add(4, 5));            // default = module.exports; named exports detected

const shout = (await import(pathToFileURL(path.join(dir, "fn.cjs")).href)).default;
console.log(shout("hello"));
fs.rmSync(dir, { recursive: true });
```

## CommonJS importing ESM: the hard direction

`require()` is **synchronous**, but ES modules load **asynchronously** (and may use top-level await). So historically `require("an-esm-package")` **fails** with `ERR_REQUIRE_ESM`. Options:

1. Use **dynamic `import()`** (it works in CJS and returns a promise):

```js run cjs node title="CJS loading an ES module with import()"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esm-from-cjs-"));
fs.writeFileSync(path.join(dir, "util.mjs"), `export const double = (n) => n * 2; export default "esm default";`);

try { require(path.join(dir, "util.mjs")); }
catch (e) { console.log("require() of an .mjs file:", e.code); }

(async () => {
  const mod = await import(pathToFileURL(path.join(dir, "util.mjs")).href);       // works from CommonJS
  console.log(mod.double(21), mod.default);
  fs.rmSync(dir, { recursive: true });
})();
```

2. **Newer Node** (22.12+ and 20.19+) supports **`require(esm)`** for ES modules **without top-level await**. Check your Node version before relying on it.
3. Convert your app to ESM, or bundle (esbuild, Rollup) to CJS.

## The `exports` field: the modern package entry point

In a library's `package.json`, **`exports`** controls what consumers can import. It supports **conditions**, so one package can ship **both** formats:

```json
{
  "name": "my-lib",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": "./dist/utils.js",
    "./package.json": "./package.json"
  },
  "files": ["dist"]
}
```

- **`exports` encapsulates**: files not listed cannot be imported (`my-lib/dist/internal.js` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- Conditions are matched in order: `import`, `require`, `node`, `default`, `types`...
- `main`/`module` are older fields; use `exports` for new packages.

## The dual-package hazard

If a package ships both an ESM and a CJS build, an app may load **both**: one dependency does `import "lib"` and another does `require("lib")`. Then you get **two copies** of the library with **separate state** (two singletons, `instanceof` failing across them). Solutions: make the CJS build a thin wrapper that loads the ESM one, ship ESM only, or keep **state in a separate CJS module** both builds use.

## Practical advice (2024+)

- **Applications:** use **ESM** (`"type": "module"`), TypeScript with `"module": "nodenext"`, always include **extensions** in relative imports, use `node:` prefixes for core modules.
- **Libraries:** ship **ESM** (optionally also CJS via `exports`), include types, and test both formats.
- Mixed codebase? Use `.cjs` and `.mjs` extensions to be explicit.
- `createRequire` gives you `require` inside ESM when you need it (JSON, native addons, old packages):

```js run esm node title="createRequire inside an ES module"
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
console.log(typeof require, require("node:os").EOL === "\n", typeof require.resolve);
```

:::interview How do CommonJS and ES modules interoperate in Node.js? What is the dual package hazard?
"Node decides by file extension (`.mjs`, `.cjs`) or the `type` field in package.json. ESM can import CommonJS: the default import is `module.exports` and named imports work when Node can detect them statically. CommonJS cannot `require()` an ES module in older Node versions because loading is asynchronous; I use dynamic `import()`, or newer Node's `require(esm)` for modules without top-level await. ESM has no `__dirname`, `require` or implicit extensions: I use `import.meta.url`/`dirname` and full file names. Libraries use the `exports` field with `import` and `require` conditions to ship both formats, which can cause the dual-package hazard: the same library loaded twice, as ESM and as CJS, with separate state, so singletons and `instanceof` checks break."
:::

## More interview questions on this topic

:::qa How do you get `__dirname` in an ES module? {level=easy}
**Say this:** "`import.meta.dirname` in Node 20.11+, or `path.dirname(fileURLToPath(import.meta.url))`."

**In simple words:** `import.meta.url` is the file's address; convert it to a path.
:::

:::qa Why do relative imports in ESM need the `.js` extension? {level=medium}
**Say this:** "ES module resolution in Node follows URL rules: no automatic extension or folder lookup (unlike CommonJS), so the full file name is required. TypeScript with `nodenext` also requires `.js` in import paths."

**In simple words:** ESM does not guess; you must name the file.
:::

:::qa What does the `exports` field in package.json do? {level=medium}
**Say this:** "It defines the public entry points of a package, with conditions like `import` and `require`, and blocks deep imports of files that are not listed."

**In simple words:** The package decides which doors visitors may use.
:::

:::qa Can you `require()` an ES module? {level=hard}
**Say this:** "Not in older Node (ERR_REQUIRE_ESM). Use dynamic `import()`. Node 22.12+ and 20.19+ allow `require(esm)` when the module has no top-level await."

**In simple words:** The old door was closed because ESM loads asynchronously; recent Node opened a side door.
:::

```quiz
? What does a default import of a CommonJS module give in ESM?
- Its first export
+ module.exports
- undefined
> The whole export object (or function).
? Which is NOT available in an ES module?
- import.meta.url
- Top-level await
+ __dirname (without computing it)
> Use import.meta.dirname or fileURLToPath.
? What can go wrong with a package that has both ESM and CJS builds?
- Nothing
+ Two copies may load, with separate state
- It will not install
> The dual-package hazard.
```

:::keypoints
- Module type by **`.mjs`/`.cjs`** or `"type"` in package.json. ESM: **extensions required**, no `__dirname`/`require`, **top-level await**, `import.meta`.
- **ESM → CJS**: fine (`default` = `module.exports`). **CJS → ESM**: dynamic **`import()`** (or `require(esm)` on new Node).
- **`exports`** field: entry points + conditions (`import`, `require`, `types`) and encapsulation.
- **Dual-package hazard**: two copies, two states. Prefer ESM for new code; `createRequire` bridges the gap.
:::
