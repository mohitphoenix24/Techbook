---
title: Prototype pollution: how it is exploited and how to stop it
level: advanced
time: 35
summary: How an attacker modifies Object.prototype through unsafe merge, clone and path-set functions, what they can do with it (auth bypass, DoS, remote code execution via gadgets), runnable vulnerable and fixed code, and defences from input validation to Node flags.
---

You met the idea in the [prototype pitfalls lesson](#/l/prototype-pitfalls). Here is the security view, which is a frequent topic for Node.js roles: prototype pollution has produced many real CVEs in popular libraries (lodash, jQuery, minimist, hoek, merge, set-value, qs).

## The mechanism in 3 steps

1. Every normal object inherits from **`Object.prototype`**.
2. JavaScript lets code reach it through the special key **`__proto__`** (and `constructor.prototype`).
3. If untrusted input controls the **keys** in a recursive **merge, clone, set-by-path or query-string parse**, the attacker writes **`__proto__.something = value`**, and now **every object in the process** inherits `something`.

```js run title="A vulnerable deep merge, exploited from JSON input"
function merge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object") {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]);                  // for key "__proto__", target["__proto__"] IS Object.prototype
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const payload = JSON.parse('{ "profile": { "name": "x" }, "__proto__": { "isAdmin": true, "role": "admin" } }');   // from a request body
merge({}, payload);

const session = { user: "guest" };                       // an unrelated object created later
console.log(session.isAdmin, session.role, ({}).isAdmin);        // polluted: every object now has isAdmin = true
if (session.isAdmin) console.log("authorisation bypass: a guest is treated as an admin");

delete Object.prototype.isAdmin; delete Object.prototype.role;   // clean up this demo
```

The same bug appears in many shapes:

```js
_.merge({}, userInput)                    // old lodash versions
_.set(obj, userPath, value)               // path "__proto__.polluted"
qs.parse("a[__proto__][x]=1")             // query-string libraries
Object.assign / spread are SAFE for __proto__ keys from JSON.parse (they define own properties), but recursive helpers are not.
config.get / set("a.b.c", v)              // dotted-path setters
```

## What can an attacker do?

| Impact | How |
|---|---|
| **Authorisation bypass** | `isAdmin`, `role`, `authenticated` properties appear on every object; code like `if (user.isAdmin)` passes |
| **Denial of service** | overwrite `toString`, `hasOwnProperty`, `valueOf` with a non-function: every call throws and the app crashes |
| **XSS / template injection** (client side) | pollute properties read by frameworks or sanitisers ("gadgets") |
| **Remote code execution (server side)** | pollute options used by dangerous APIs: `child_process.spawn/exec` (`shell`, `env`, `argv0`), template engines (`ejs`, `pug`, `handlebars`), `require`-ing options. **Gadgets** are existing code that reads a property that was never set, so it now reads the polluted value |

```js run title="A 'gadget': code that reads an option that was never set"
function runReport(options = {}) {
  // a library function with an optional, normally-undefined option
  if (options.outputPath) return `writing the report to ${options.outputPath}`;
  return "returning the report in memory";
}

console.log(runReport({}));
Object.prototype.outputPath = "/var/www/html/shell.js";          // the attacker's pollution (from somewhere else)
console.log(runReport({}));                                      // the SAME call now writes to an attacker-chosen path
delete Object.prototype.outputPath;
```

## Defences (use several)

### 1. Do not write recursive merge/clone/set helpers yourself, and update dependencies

Use maintained libraries and keep them **patched** (`npm audit`, Dependabot, Renovate). Many popular ones fixed this years ago, but old versions are still in the wild in transitive dependencies.

### 2. Block the dangerous keys

```js run title="A safe merge"
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function safeMerge(target, source) {
  for (const key of Object.keys(source)) {                      // own enumerable keys only
    if (FORBIDDEN.has(key)) continue;                           // skip the pollution vectors
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!Object.hasOwn(target, key) || typeof target[key] !== "object") target[key] = {};
      safeMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const payload = JSON.parse('{ "a": { "__proto__": { "polluted": 1 } }, "constructor": { "prototype": { "polluted2": 2 } }, "ok": 1 }');
console.log(safeMerge({}, payload), ({}).polluted, ({}).polluted2);
```

### 3. Use objects that have no prototype, or Maps, for user-controlled keys

```js run title="Object.create(null) and Map are immune"
const dict = Object.create(null);                                // no prototype: "__proto__" is just a normal key
dict["__proto__"] = { isAdmin: true };
console.log(Object.keys(dict), ({}).isAdmin, Object.getPrototypeOf(dict));

const map = new Map();
map.set("__proto__", 1);
console.log(map.get("__proto__"), ({}).__proto__ === Object.prototype);
```

### 4. Validate input against a schema (reject unknown keys)

```js
import { z } from "zod";
const Body = z.object({ name: z.string().max(100), age: z.number().int().min(0) }).strict();   // unknown keys (like __proto__) => error
const data = Body.parse(JSON.parse(rawBody));
```

Allow-list **what you accept**, instead of trying to block what is bad.

### 5. Freeze or harden the runtime

```js
Object.freeze(Object.prototype);            // pollution attempts now fail (strict mode: throws). Test first: some libraries write to prototypes!
```

```bash
node --disable-proto=delete app.js          # removes the __proto__ accessor completely ("throw" makes access throw)
node --frozen-intrinsics app.js             # (experimental) freezes built-ins
```

### 6. Safer coding habits

- Use `Object.hasOwn(obj, key)` (not `obj[key]`, `in`) when you check for options and flags.
- Read security-relevant flags only from **own** properties: `Object.hasOwn(user, "isAdmin") && user.isAdmin`.
- Create option objects with `Object.create(null)` or class instances; avoid `{}` defaults for things read by dangerous APIs.
- Pass explicit values to `child_process` / `spawn` (`{ shell: false, env: {...} }`) so inherited properties cannot change behaviour.
- Lint: `eslint-plugin-security`, `semgrep` rules for prototype pollution; use **snyk** or **npm audit** to find vulnerable versions.

```js run title="Checking for own properties defeats polluted flags"
Object.prototype.isAdmin = true;                                  // pretend an attacker polluted it

const user = { name: "guest" };
console.log("naive check:", Boolean(user.isAdmin));
console.log("own-property check:", Object.hasOwn(user, "isAdmin") && user.isAdmin);

delete Object.prototype.isAdmin;
```

## Detecting pollution in tests

```js run title="A test helper: run code and fail if Object.prototype changed"
function assertNoPollution(fn) {
  const before = new Set(Object.getOwnPropertyNames(Object.prototype));
  try { fn(); }
  finally {
    for (const key of Object.getOwnPropertyNames(Object.prototype)) {
      if (!before.has(key)) { delete Object.prototype[key]; throw new Error("Object.prototype was polluted with: " + key); }
    }
  }
}

const vulnerableSet = (obj, path, value) => { const keys = path.split("."); let o = obj; keys.slice(0, -1).forEach((k) => (o = o[k] ??= {})); o[keys.at(-1)] = value; };

try { assertNoPollution(() => vulnerableSet({}, "__proto__.hacked", true)); } catch (e) { console.log("FAILED:", e.message); }
```

Add such a test around **any code that merges, clones or sets by path using external input**.

:::interview What is prototype pollution? How does it become a security problem, and how do you prevent it?
"Prototype pollution is when an attacker can write properties onto `Object.prototype`, typically through a recursive merge, clone or set-by-path function that accepts the key `__proto__` or `constructor.prototype` from untrusted input like a JSON body or query string. Since every object inherits from it, the injected property shows up everywhere. It can bypass authorisation checks like `if (user.isAdmin)`, crash the app by overriding `toString`, and in Node it can lead to remote code execution through gadgets, existing code that reads an unset option such as a child process or template-engine option. I prevent it by validating input with a strict schema, never using homemade recursive merge on untrusted data, skipping `__proto__`, `constructor` and `prototype` keys, using `Object.create(null)` or `Map` for user-keyed data, checking own properties with `Object.hasOwn`, keeping dependencies patched, and optionally running Node with `--disable-proto=delete` or freezing the prototype."
:::

## More interview questions on this topic

:::qa Why is `JSON.parse('{"__proto__": {...}}')` not itself dangerous? {level=hard}
**Say this:** "`JSON.parse` creates `__proto__` as a normal own property, without changing the prototype. The danger is later code that does `target[key]` with that key, which reads the real prototype and then writes into it."

**In simple words:** The key is just text until some code treats it as a door.
:::

:::qa What is a gadget in this context? {level=hard}
**Say this:** "An existing piece of code that reads a property which is normally undefined, so a polluted value changes its behaviour, for example an options field of `child_process.spawn` or a template engine."

**In simple words:** The poisoned water is only dangerous where someone drinks it.
:::

:::qa Which checks make code robust against polluted properties? {level=medium}
**Say this:** "Use `Object.hasOwn`, read flags only from own properties, build objects with `Object.create(null)` or classes, and validate with a strict schema."

**In simple words:** Ask the object itself, not its ancestors.
:::

:::qa What does `node --disable-proto=delete` do? {level=hard}
**Say this:** "It removes the `Object.prototype.__proto__` accessor so that `obj.__proto__` no longer reaches the prototype, closing one pollution route (`constructor.prototype` still needs other defences)."

**In simple words:** It removes one of the doors into the prototype.
:::

```quiz
? Which key is the classic pollution vector?
- __proto__
- constructor.prototype
+ Both
> They lead to Object.prototype.
? Which structure is immune to __proto__ keys from users?
- A plain object {}
+ Object.create(null) or a Map
- An array
> No prototype to pollute.
? What is the best defence for incoming JSON?
- Escape quotes
+ Validate it against a strict schema (unknown keys rejected)
- Parse twice
> Allow-list what you accept.
```

:::keypoints
- **Pollution** = writing `__proto__` / `constructor.prototype` through unsafe recursive merge/clone/set/qs-parse → **all objects** inherit attacker values.
- Impact: **authz bypass**, **DoS**, **RCE via gadgets** (child_process, template engines).
- Defences: **strict schema validation**, skip `__proto__`/`constructor`/`prototype`, **`Object.create(null)`/`Map`**, **`Object.hasOwn`** checks, **patched dependencies**, `--disable-proto=delete`, freeze the prototype, tests with a pollution assertion.
:::
