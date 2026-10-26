---
title: Proxy and Reflect
level: advanced
time: 40
summary: How a Proxy intercepts operations on an object (get, set, has, delete, ownKeys, apply, construct), why Reflect pairs with it, practical uses (validation, defaults, logging, read-only views, reactivity) and the limits and costs.
---

## What is a Proxy?

> "A **Proxy** wraps an object and lets you **intercept** operations on it: reading a property, writing, deleting, checking `in`, calling it as a function, and more."

:::analogy A receptionist
Visitors do not walk straight into the manager's office. They talk to the receptionist (the proxy), who can check them, log them, say no, or pass the request on. To the visitor, it looks like talking to the manager.
:::

```js run title="The smallest proxy: log every read and write"
const target = { name: "Asha", age: 25 };

const proxy = new Proxy(target, {
  get(target, property, receiver) {
    console.log(`get ${String(property)}`);
    return Reflect.get(target, property, receiver);          // forward to the real object
  },
  set(target, property, value, receiver) {
    console.log(`set ${String(property)} = ${value}`);
    return Reflect.set(target, property, value, receiver);   // must return true on success
  },
});

console.log(proxy.name);
proxy.age = 26;
console.log(target);                                           // the target is changed through the proxy
```

`new Proxy(target, handler)`: the **handler** is an object with **traps**, functions that intercept operations. Any trap you do **not** define behaves normally (it forwards to the target).

## The main traps

| Trap | Intercepts | Example operation |
|---|---|---|
| `get(t, prop, receiver)` | reading | `proxy.x`, `proxy[x]` |
| `set(t, prop, value, receiver)` | writing | `proxy.x = 1` |
| `has(t, prop)` | `in` operator | `"x" in proxy` |
| `deleteProperty(t, prop)` | `delete` | `delete proxy.x` |
| `ownKeys(t)` | key listing | `Object.keys`, `for...in`, `Reflect.ownKeys` |
| `getOwnPropertyDescriptor(t, prop)` | descriptor reads | `Object.keys` (checks enumerability) |
| `defineProperty(t, prop, desc)` | `Object.defineProperty` | |
| `apply(t, thisArg, args)` | calling a function proxy | `proxy(1, 2)` |
| `construct(t, args, newTarget)` | `new proxy()` | |
| `getPrototypeOf`, `setPrototypeOf` | prototype access | `instanceof` |

## `Reflect`: the matching toolbox

`Reflect` has a **function for every trap**, with the same arguments. Use it inside traps to perform the **default** behaviour:

```js run title="Reflect mirrors the language operations"
const o = { a: 1 };

console.log(Reflect.get(o, "a"), Reflect.set(o, "b", 2), Reflect.has(o, "b"), Reflect.ownKeys(o));
console.log(Reflect.deleteProperty(o, "a"), o);
console.log(Reflect.apply(Math.max, null, [1, 5, 3]), Reflect.construct(Date, [0]).getTime());
console.log(Reflect.getPrototypeOf(o) === Object.prototype, Reflect.defineProperty(o, "x", { value: 1 }));
```

Why use `Reflect` rather than `target[prop]`?

1. It handles **`receiver`** correctly (this matters for getters and inheritance).
2. `Reflect.set`/`defineProperty`/`deleteProperty` **return `true`/`false`** instead of throwing, which is what traps need to return.
3. It is a clean functional form of operators (`in`, `delete`, `new`).

## Use 1: validation

```js run title="Validate on write"
function validated(target, rules) {
  return new Proxy(target, {
    set(obj, prop, value, receiver) {
      const rule = rules[prop];
      if (rule && !rule(value)) throw new TypeError(`Invalid value for "${String(prop)}": ${JSON.stringify(value)}`);
      return Reflect.set(obj, prop, value, receiver);
    },
  });
}

const user = validated({}, {
  age: (v) => Number.isInteger(v) && v >= 0 && v < 150,
  email: (v) => typeof v === "string" && v.includes("@"),
});

user.age = 30;
user.email = "asha@mail.com";
for (const bad of [["age", -5], ["age", "x"], ["email", "nope"]]) {
  try { user[bad[0]] = bad[1]; } catch (e) { console.log(e.message); }
}
console.log(user.age, user.email);
```

## Use 2: default values and "missing property" errors

```js run title="Defaults, and catching typos"
const withDefaults = (target, fallback) => new Proxy(target, {
  get: (t, prop, r) => (prop in t ? Reflect.get(t, prop, r) : fallback),
});
const counts = withDefaults({ a: 1 }, 0);
counts.b++;                                                        // undefined ++ would be NaN; here the default is 0
console.log(counts.a, counts.zzz, counts.b);

const strict = (target) => new Proxy(target, {
  get(t, prop, r) {
    if (typeof prop === "string" && !(prop in t)) throw new ReferenceError(`unknown property "${prop}"`);
    return Reflect.get(t, prop, r);
  },
});
const settings = strict({ theme: "dark" });
console.log(settings.theme);
try { settings.thme; } catch (e) { console.log(e.message); }       // a typo is caught immediately
```

## Use 3: negative array indexes (like Python)

```js run title="arr[-1]"
const negativeIndexes = (arr) => new Proxy(arr, {
  get(t, prop, r) {
    if (typeof prop === "string" && /^-\d+$/.test(prop)) prop = String(t.length + Number(prop));
    return Reflect.get(t, prop, r);
  },
});
const a = negativeIndexes([10, 20, 30, 40]);
console.log(a[-1], a[-2], a[0], a.length);
```

## Use 4: a read-only view

```js run title="A deep read-only proxy"
function readonly(target) {
  return new Proxy(target, {
    get(t, prop, r) {
      const value = Reflect.get(t, prop, r);
      return value !== null && typeof value === "object" ? readonly(value) : value;      // wrap nested objects too
    },
    set(t, prop) { throw new TypeError(`cannot set "${String(prop)}": read-only`); },
    deleteProperty(t, prop) { throw new TypeError(`cannot delete "${String(prop)}": read-only`); },
  });
}

const config = readonly({ db: { host: "localhost", ports: [1, 2] } });
for (const attempt of [() => (config.db.host = "x"), () => config.db.ports.push(3), () => delete config.db]) {
  try { attempt(); } catch (e) { console.log(e.message); }
}
console.log(config.db.host);
```

## Use 5: function proxies (apply trap): logging, timing, memoizing

```js run title="Wrap a function with apply"
function slowSquare(n) { return n * n; }

const memoized = new Proxy(slowSquare, {
  cache: new Map(),
  apply(fn, thisArg, args) {
    const key = JSON.stringify(args);
    if (!this.cache.has(key)) { console.log("  computing", key); this.cache.set(key, Reflect.apply(fn, thisArg, args)); }
    return this.cache.get(key);
  },
});

console.log(memoized(4), memoized(4), memoized(5));
```

## Use 6: dynamic APIs (a `get` trap that builds methods on the fly)

```js run title="api.users.get(7) without defining each method"
const api = (path = []) => new Proxy(function () {}, {
  get: (_, prop) => api([...path, String(prop)]),                       // each property deepens the path
  apply: (_, __, args) => `GET /${path.join("/")}${args.length ? "/" + args.join("/") : ""}`,
});

console.log(api().users(7));
console.log(api().orders.recent());
console.log(api().a.b.c("x"));
```

## Use 7: reactivity (how Vue 3 works)

A reactive system needs to know **which code reads which property** (track), and **re-run it when the property changes** (trigger). A Proxy can do both.

```js run title="A tiny reactive system"
const subscribers = new WeakMap();                  // target -> Map(property -> Set(effects))
let activeEffect = null;

function track(target, prop) {
  if (!activeEffect) return;
  if (!subscribers.has(target)) subscribers.set(target, new Map());
  const props = subscribers.get(target);
  if (!props.has(prop)) props.set(prop, new Set());
  props.get(prop).add(activeEffect);
}
function trigger(target, prop) {
  subscribers.get(target)?.get(prop)?.forEach((effect) => effect());
}

function reactive(target) {
  return new Proxy(target, {
    get(t, prop, r) { track(t, prop); return Reflect.get(t, prop, r); },
    set(t, prop, value, r) {
      const changed = t[prop] !== value;
      const ok = Reflect.set(t, prop, value, r);
      if (changed) trigger(t, prop);
      return ok;
    },
  });
}

function effect(fn) { activeEffect = fn; fn(); activeEffect = null; }

const state = reactive({ count: 0, name: "Asha" });
effect(() => console.log("count is", state.count));              // runs now, and re-runs when count changes
effect(() => console.log("hello", state.name));

state.count++;
state.count++;
state.name = "Ravi";
state.count = 2;                                                  // same value: no trigger
```

Compare with the `defineProperty` version in the descriptors lesson: Proxy sees **new keys**, **deletions** and **array changes** too. The Vue 3, MobX and Valtio libraries are built on this.

## Limits and gotchas

```js run title="Gotchas"
// 1. A proxy is NOT the target: identity differs
const target = {};
const p = new Proxy(target, {});
console.log(p === target);

// 2. Private fields (#x) and some built-ins (Map, Date) break, because `this` is the proxy, not the real object
class Counter { #n = 0; inc() { return ++this.#n; } }
const pc = new Proxy(new Counter(), {});
try { pc.inc(); } catch (e) { console.log("private field:", e.name); }

const pm = new Proxy(new Map(), {});
try { pm.set("a", 1); } catch (e) { console.log("Map method:", e.name); }
const fixed = new Proxy(new Map(), { get: (t, prop) => { const v = Reflect.get(t, prop, t); return typeof v === "function" ? v.bind(t) : v; } });
fixed.set("a", 1);
console.log(fixed.get("a"), fixed.size);                              // bind the methods to the real target

// 3. Invariants: a proxy cannot lie about non-configurable properties
const frozen = Object.freeze({ x: 1 });
const liar = new Proxy(frozen, { get: () => 2 });
try { liar.x; } catch (e) { console.log("invariant:", e.name); }

// 4. Revocable proxies can be switched off
const { proxy, revoke } = Proxy.revocable({ secret: 42 }, {});
console.log(proxy.secret);
revoke();
try { proxy.secret; } catch (e) { console.log("revoked:", e.name); }
```

Performance: every operation through a proxy is **slower** (roughly 10 to 100 times for the access itself). Do not wrap hot loops or huge arrays blindly.

:::interview What is a Proxy and what is Reflect? Give use cases and limits.
"A Proxy wraps a target object with a handler of traps such as `get`, `set`, `has`, `deleteProperty`, `ownKeys`, `apply` and `construct`, which intercept operations on it. `Reflect` provides the default implementation of each operation, with matching arguments, so traps can forward to the original behaviour correctly, including the `receiver`. Use cases: validation, default values, logging, read-only views, memoising function calls, dynamic APIs, and reactivity: Vue 3 tracks reads in `get` and triggers effects in `set`. Limits: the proxy is a different object from the target, private fields and some built-ins like Map break because `this` is the proxy, there are invariants for non-configurable properties, and there is a performance cost."
:::

## More interview questions on this topic

:::qa Why does Vue 3 use Proxy instead of `Object.defineProperty`? {level=medium}
**Say this:** "A Proxy intercepts all operations on an object, including adding and deleting properties and array changes, without having to wrap each property in advance. `defineProperty` cannot detect new keys or array index changes."

**In simple words:** The proxy guards the whole object, not just the doors that existed at the time.
:::

:::qa What is the `receiver` argument and why pass it to `Reflect.get`? {level=hard}
**Say this:** "It is the object the operation was started on (usually the proxy). Passing it keeps `this` correct inside getters and setters, and makes inheritance through the proxy work."

**In simple words:** It says "who was asked", so getters use the right `this`.
:::

:::qa Why can calling a method on a proxied `Map` throw? {level=hard}
**Say this:** "Map methods need an internal slot that only the real Map has. When `this` is the proxy, the check fails. The fix is to bind functions to the target in the `get` trap."

**In simple words:** The proxy is not a real Map, only a stand-in.
:::

:::qa What does a `set` trap need to return? {level=medium}
**Say this:** "`true` if the assignment succeeded. Returning `false` throws a TypeError in strict mode."

**In simple words:** The trap must say "yes, I did it".
:::

```quiz
? Which operation does the `has` trap intercept?
- delete obj.x
+ "x" in obj
- obj.x = 1
> has handles the in operator.
? Why is Reflect used inside traps?
- It is faster than normal access
+ It performs the default operation with the same signature and handles the receiver
- It disables the proxy
> Forward to the original behaviour.
? Which of these breaks with a plain Proxy wrapper?
- A plain object
+ A class with #private fields
- An array
> The private field is not on the proxy.
```

:::keypoints
- **Proxy(target, handler)** intercepts operations through **traps**: `get`, `set`, `has`, `deleteProperty`, `ownKeys`, `apply`, `construct`...
- **`Reflect`** has a function for each trap: use it to forward the default behaviour (with the `receiver`).
- Uses: **validation, defaults, strict objects, read-only views, logging, memoizing, dynamic APIs, reactivity (Vue 3)**.
- Limits: proxy ≠ target; **private fields and built-in slots** break; invariants; **slower**.
- `Proxy.revocable` creates a proxy you can switch off.
:::
