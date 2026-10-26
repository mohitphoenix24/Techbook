---
title: Implement require() (a CommonJS module loader)
level: hard
time: 45
summary: Build the module system itself. A module wrapper, a cache, path resolution (extensions, index files, node_modules), JSON files, circular dependencies with partial exports, and the exports vs module.exports trap.
---

:::problem Implement a CommonJS loader {level=hard tags="modules,commonjs,require,cache,circular dependencies"}
Write `createLoader(files, { builtins })` over an **in-memory file system** (`{ "/app/main.js": "source…" }`) that returns a `require`-like function `requireFrom(path)`.

It must behave like Node's CommonJS loader:

1. **Wrapper**: each file runs as `function (exports, require, module, __filename, __dirname) { … }`, and `this === module.exports` at the top level.
2. **Resolution** of `require(request)` from a parent file:
   - relative requests (`./x`, `../x`): try the exact name, then `.js`, then `.json`, then a directory with `package.json` `"main"`, then `index.js` / `index.json`
   - bare names (`lodash`): look in `node_modules` of the parent directory, then each parent directory up to `/`
   - built-ins (`path`, `fs`...) come from the `builtins` object
3. **Cache** by resolved filename: a module runs **once**.
4. **Circular requires** return the **partially filled** `exports`.
5. `.json` files are parsed, not executed.
6. A module that **throws** is removed from the cache (so the next `require` tries again).
7. `Cannot find module 'x'` errors with `code: "MODULE_NOT_FOUND"`, listing the requiring file.
8. `require.cache` and `require.resolve`.

:::hint Hint
Create the `module` object and put it in the cache **before** running the code, because that is what makes circular requires work. Write small helpers `dirname`, `join` and `normalize` for POSIX paths (handle `.` and `..`).
:::
:::

## Solution and tests

```js run title="A CommonJS loader, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- POSIX path helpers (written by hand on purpose) ----------
function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}
const dirname = (p) => (p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/")));
const join = (...parts) => normalize(parts.join("/"));

function createLoader(files, { builtins = {} } = {}) {
  const cache = Object.create(null);                         // resolved filename -> module object

  function tryFile(path) { return Object.hasOwn(files, path) ? path : null; }
  function tryFileOrDir(path) {
    return tryFile(path) ?? tryFile(path + ".js") ?? tryFile(path + ".json") ?? tryDirectory(path);
  }
  function tryDirectory(dir) {
    const pkg = tryFile(dir + "/package.json");
    if (pkg) {
      const main = JSON.parse(files[pkg]).main;
      if (main) { const found = tryFile(join(dir, main)) ?? tryFile(join(dir, main) + ".js"); if (found) return found; }
    }
    return tryFile(dir + "/index.js") ?? tryFile(dir + "/index.json");
  }

  function resolve(request, parentFile) {
    if (Object.hasOwn(builtins, request)) return request;    // a built-in module has no file
    const baseDir = dirname(parentFile);
    let found = null;
    if (request.startsWith("./") || request.startsWith("../") || request.startsWith("/")) {
      found = tryFileOrDir(request.startsWith("/") ? normalize(request) : join(baseDir, request));
    } else {                                                 // a bare name: node_modules of this directory, then of every parent
      for (let dir = baseDir; ; dir = dirname(dir)) {
        found = tryFileOrDir(join(dir, "node_modules", request));
        if (found || dir === "/") break;
      }
    }
    if (!found) {
      const err = new Error(`Cannot find module '${request}'\nRequire stack:\n- ${parentFile}`);
      err.code = "MODULE_NOT_FOUND";
      throw err;
    }
    return found;
  }

  function load(filename, parent) {
    if (Object.hasOwn(builtins, filename) && !Object.hasOwn(files, filename)) return builtins[filename];
    if (cache[filename]) return cache[filename].exports;     // cached: also a half-finished module in a cycle

    const module = { id: filename, filename, exports: {}, loaded: false, children: [], parent };
    cache[filename] = module;                                // BEFORE running: this is what makes cycles work
    parent?.children.push(module);

    try {
      if (filename.endsWith(".json")) {
        module.exports = JSON.parse(files[filename]);
      } else {
        const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", files[filename]);
        const localRequire = (request) => load(resolve(request, filename), module);
        localRequire.resolve = (request) => resolve(request, filename);
        localRequire.cache = cache;
        wrapper.call(module.exports, module.exports, localRequire, module, filename, dirname(filename));    // this === exports
      }
      module.loaded = true;
    } catch (err) {
      delete cache[filename];                                // a failed module must not stay in the cache
      throw err;
    }
    return module.exports;                                   // read module.exports AFTER running: the module may have replaced it
  }

  const requireFrom = (entry) => load(resolve(entry, "/"), null);
  requireFrom.cache = cache;
  return requireFrom;
}

// ---------------- tests ----------------
test("exports, relative requires and the wrapper variables", () => {
  const req = createLoader({
    "/app/main.js": `const util = require("./lib/util"); exports.result = util.double(21); exports.file = __filename; exports.dir = __dirname;`,
    "/app/lib/util.js": `exports.double = (n) => n * 2;`,
  });
  assert.deepEqual(req("/app/main.js"), { result: 42, file: "/app/main.js", dir: "/app" });
});

test("this at the top level is module.exports", () => {
  const req = createLoader({ "/a.js": `this.viaThis = true; exports.same = (this === module.exports);` });
  assert.deepEqual(req("/a.js"), { viaThis: true, same: true });
});

test("the cache: a module runs only once", () => {
  const seen = [];
  const req = createLoader({
    "/main.js": `require("./counter"); require("./counter"); require("./other");`,
    "/other.js": `require("./counter");`,
    "/counter.js": `require("hit")("counter ran");`,
  }, { builtins: { hit: (m) => seen.push(m) } });
  req("/main.js");
  assert.deepEqual(seen, ["counter ran"]);
  assert.deepEqual(Object.keys(req.cache).sort(), ["/counter.js", "/main.js", "/other.js"]);
});

test("exports is shared by reference; primitives are copies", () => {
  const req = createLoader({
    "/counter.js": `let count = 0; exports.count = count; exports.getCount = () => count; exports.inc = () => { count++; };`,
    "/main.js": `const c = require("./counter"); c.inc(); c.inc(); exports.snapshot = c.count; exports.live = c.getCount();`,
  });
  assert.deepEqual(req("/main.js"), { snapshot: 0, live: 2 });       // unlike ES modules, CommonJS has no live bindings
});

test("reassigning exports does nothing; reassigning module.exports works", () => {
  const req = createLoader({
    "/bad.js": `exports = { value: 1 };`,
    "/good.js": `module.exports = { value: 1 };`,
    "/fn.js": `module.exports = function hello() { return "hi"; };`,
  });
  assert.deepEqual(req("/bad.js"), {});
  assert.deepEqual(req("/good.js"), { value: 1 });
  assert.equal(req("/fn.js")(), "hi");
});

test("circular requires see a partially filled exports object", () => {
  const req = createLoader({
    "/a.js": `exports.early = 1; const b = require("./b"); exports.late = 2; exports.bSawA = b.sawA; exports.bDone = b.done;`,
    "/b.js": `const a = require("./a"); exports.sawA = JSON.stringify(a); exports.done = true;`,
  });
  const a = req("/a.js");
  assert.equal(a.bSawA, '{"early":1}');                      // b saw a before "late" existed
  assert.deepEqual(Object.keys(a), ["early", "late", "bSawA", "bDone"]);
});

test("resolution: extensions, index files and package.json main", () => {
  const req = createLoader({
    "/main.js": `exports.a = require("./a"); exports.dir = require("./dir"); exports.pkg = require("./pkg"); exports.data = require("./data");`,
    "/a.js": `module.exports = "a.js";`,
    "/dir/index.js": `module.exports = "dir/index.js";`,
    "/pkg/package.json": `{ "main": "lib/entry" }`,
    "/pkg/lib/entry.js": `module.exports = "pkg main";`,
    "/data.json": `{ "answer": 42 }`,
  });
  assert.deepEqual(req("/main.js"), { a: "a.js", dir: "dir/index.js", pkg: "pkg main", data: { answer: 42 } });
});

test("resolution: node_modules is searched upwards", () => {
  const req = createLoader({
    "/proj/src/deep/main.js": `exports.value = require("tool") + "/" + require("@scope/pkg");`,
    "/proj/node_modules/tool/index.js": `module.exports = "tool@root";`,
    "/proj/src/node_modules/@scope/pkg/index.js": `module.exports = "scoped";`,
  });
  assert.equal(req("/proj/src/deep/main.js").value, "tool@root/scoped");
});

test("the nearest node_modules wins", () => {
  const req = createLoader({
    "/proj/src/main.js": `module.exports = require("x");`,
    "/proj/node_modules/x/index.js": `module.exports = "outer";`,
    "/proj/src/node_modules/x/index.js": `module.exports = "inner";`,
  });
  assert.equal(req("/proj/src/main.js"), "inner");
});

test("built-in modules", () => {
  const req = createLoader({ "/main.js": `module.exports = require("greet")("Asha");` }, { builtins: { greet: (n) => "hello " + n } });
  assert.equal(req("/main.js"), "hello Asha");
});

test("missing modules throw MODULE_NOT_FOUND with the requiring file", () => {
  const req = createLoader({ "/main.js": `require("./nope");` });
  assert.throws(() => req("/main.js"), (e) => e.code === "MODULE_NOT_FOUND" && e.message.includes("Cannot find module './nope'") && e.message.includes("/main.js"));
});

test("a module that throws is not cached, so it runs again", () => {
  const counter = { n: 0 };
  const req = createLoader({
    "/main.js": `const c = require("count"); try { require("./flaky"); } catch (e) {} try { require("./flaky"); } catch (e) {} exports.runs = c.n;`,
    "/flaky.js": `require("count").n++; throw new Error("boom");`,
  }, { builtins: { count: counter } });
  assert.equal(req("/main.js").runs, 2);
});

test("require.resolve and require.cache are available inside modules", () => {
  const req = createLoader({
    "/main.js": `exports.resolved = require.resolve("./lib"); exports.cached = Object.keys(require.cache);`,
    "/lib/index.js": `module.exports = 1;`,
  });
  const out = req("/main.js");
  assert.equal(out.resolved, "/lib/index.js");
  assert.deepEqual(out.cached, ["/main.js"]);
});

test("module.parent and module.children link modules together", () => {
  const req = createLoader({
    "/main.js": `require("./child"); exports.children = module.children.map((m) => m.id);`,
    "/child.js": `exports.parentId = module.parent.id;`,
  });
  assert.deepEqual(req("/main.js").children, ["/child.js"]);
});

test("path helpers handle . and ..", () => {
  assert.equal(normalize("/a/b/../c/./d//e"), "/a/c/d/e");
  assert.equal(dirname("/a/b/c.js"), "/a/b");
  assert.equal(dirname("/c.js"), "/");
  assert.equal(join("/a/b", "../x", "y.js"), "/a/x/y.js");
});
```

## What this explains about Node

- **Why `exports = …` does nothing**: `exports` is just a local variable that starts as a reference to `module.exports`. The loader returns `module.exports`.
- **Why top-level `var` is not global**: your file is a function body, so everything is local.
- **Why `__dirname` and `require` exist in CommonJS but not in ES modules**: they are the wrapper's parameters.
- **Why circular dependencies "work" but give half-built objects**: the cache entry exists before the code finishes. ES modules solve this with live bindings and a separate link phase, but cycles still need care.
- **Why `require` is synchronous**: it reads and runs the file at once, so it cannot load over a network. ES modules are asynchronous by design.
- **Why `require.cache` tricks work for hot reloading**: delete the entry and the next `require` re-runs the file (and its old instances still live elsewhere).

:::qa What is the difference between `exports` and `module.exports`? {level=easy}
**Say this:** "`exports` starts as a reference to `module.exports`. Adding properties to either works, but assigning a new value to `exports` only changes the local variable, and Node returns `module.exports`. So to export a single function or class, assign to `module.exports`."

**In simple words:** `exports` is a shortcut; `module.exports` is what you really hand out.
:::

:::qa Why does a circular `require` give a half-empty object? {level=medium}
**Say this:** "When a requires b and b requires a, the cache already has the entry for a (put there before a started running), so b receives a's current `exports`: only what a had assigned before it called `require('./b')`. The fix is to avoid cycles, move shared code to a third module, or `require` lazily inside the function that needs it."

**In simple words:** b arrives while a is still half-written.
:::

:::qa How do ES modules differ from CommonJS in loading? {level=hard}
**Say this:** "ESM is parsed first, imports and exports are known statically, so the loader builds the whole graph, links the bindings, then evaluates (asynchronously, with top-level await). Exports are **live bindings**, not copies, and imports are hoisted. CommonJS runs `require` at run time, synchronously, with copies of values, and can be called conditionally."

**In simple words:** ESM plans the whole trip first; CommonJS decides at each step.
:::

:::keypoints
- Wrapper `(exports, require, module, __filename, __dirname)`; `this === module.exports`; the loader returns **`module.exports`** after running.
- **Cache the module object before running** it ⇒ cycles return partial exports; **remove it from the cache if it throws**.
- Resolution: exact → `.js` → `.json` → directory (`package.json` main, `index.js`); bare names go through **`node_modules` up the tree**.
- CommonJS exports are **copies/references, not live bindings**; `require` is **synchronous**.
:::
