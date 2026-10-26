---
title: Property descriptors: writable, enumerable, configurable
level: intermediate
time: 30
summary: Every property has hidden flags. Learn writable, enumerable and configurable, how to read and change them with defineProperty, accessor descriptors, and how frameworks use them.
---

## Properties are more than "key and value"

Each property has a small **descriptor** with **flags** that control what you may do with it.

| Flag | If `false`... | Default for `obj.x = 1` | Default for `defineProperty` |
|---|---|---|---|
| **`writable`** | the value cannot be changed | `true` | `false` |
| **`enumerable`** | it is hidden from `for...in`, `Object.keys`, spread, `JSON.stringify` | `true` | `false` |
| **`configurable`** | it cannot be deleted, and its flags (mostly) cannot be changed | `true` | `false` |

```js run title="Read a descriptor"
const user = { name: "Asha" };

console.log(Object.getOwnPropertyDescriptor(user, "name"));
console.log(Object.getOwnPropertyDescriptors({ a: 1, get b() { return 2; } }));
console.log(Object.getOwnPropertyDescriptor(Math, "PI"));        // built-ins are locked
console.log(Object.getOwnPropertyDescriptor([], "length"));
```

## `Object.defineProperty`

```js run title="Create a read-only, hidden and permanent property"
const account = { owner: "Asha" };

Object.defineProperty(account, "id", {
  value: 1001,
  writable: false,           // read-only
  enumerable: false,         // hidden from loops and JSON
  configurable: false,       // cannot be deleted or redefined
});

console.log(account.id);
console.log(Object.keys(account), JSON.stringify(account));       // id is not listed

try { account.id = 999; } catch (e) { console.log("write blocked:", e.message); }   // strict mode throws; sloppy mode ignores
console.log(account.id);
```

In **sloppy mode** the write above would be **silently ignored**. In **strict mode** (modules, classes, our examples), writing to a read-only property **throws**:

```js run title="Strict mode makes violations loud"
const o = {};
Object.defineProperty(o, "fixed", { value: 1 });                    // all flags false by default

try { o.fixed = 2; } catch (e) { console.log(e.name + ": " + e.message); }
try { delete o.fixed; } catch (e) { console.log(e.name + ": " + e.message); }
try { Object.defineProperty(o, "fixed", { value: 3 }); } catch (e) { console.log(e.name + ": " + e.message); }
```

## `enumerable: false`: hide helper data

Non-enumerable properties are skipped by `for...in`, `Object.keys`, spread, `Object.assign` and `JSON.stringify`, but they **still exist** and can be used. Class methods are non-enumerable for this reason.

```js run title="A hidden property"
const config = { host: "localhost" };
Object.defineProperty(config, "_secret", { value: "token123", enumerable: false });

console.log(Object.keys(config), { ...config }, JSON.stringify(config));
console.log(config._secret);                                         // still accessible
console.log(Object.getOwnPropertyNames(config));                     // the full list
```

## `configurable: false` is a one-way door

Once a property is non-configurable you cannot delete it or turn it back. The only allowed change is `writable: true → false`.

```js run title="One-way flags"
const o = {};
Object.defineProperty(o, "x", { value: 1, writable: true, configurable: false });

o.x = 2;                                                              // still writable: fine
Object.defineProperty(o, "x", { writable: false });                   // allowed: tighten
try {
  Object.defineProperty(o, "x", { writable: true });                  // not allowed: loosen
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

## Accessor properties: getters and setters

A property is either a **data property** (`value`, `writable`) **or** an **accessor property** (`get`, `set`). You cannot mix them.

```js run title="Accessor descriptor"
const temp = { _celsius: 25 };

Object.defineProperty(temp, "fahrenheit", {
  get() { return this._celsius * 9 / 5 + 32; },
  set(f) { this._celsius = (f - 32) * 5 / 9; },
  enumerable: true,
  configurable: true,
});

console.log(temp.fahrenheit);
temp.fahrenheit = 212;
console.log(temp._celsius);
console.log(Object.getOwnPropertyDescriptor(temp, "fahrenheit"));
```

## Define many at once, and clone with descriptors

```js run title="defineProperties and a descriptor-preserving copy"
const point = Object.defineProperties({}, {
  x: { value: 3, enumerable: true },
  y: { value: 4, enumerable: true },
  length: { get() { return Math.hypot(this.x, this.y); } },
});
console.log(point.length, Object.keys(point));

// Object.assign / spread LOSE getters (they copy values) ...
const source = { get now() { return "computed"; } };
console.log(Object.getOwnPropertyDescriptor({ ...source }, "now"));          // a plain data property

// ... descriptors keep them
const clone = Object.defineProperties({}, Object.getOwnPropertyDescriptors(source));
console.log(Object.getOwnPropertyDescriptor(clone, "now").get !== undefined);
```

## Where this is used in real code

- **Class members:** methods are non-enumerable; `static` and prototype properties follow descriptors.
- **Libraries** use `defineProperty` to add **hidden metadata** without breaking `JSON.stringify` or loops.
- **Vue 2** made data reactive by replacing properties with **getters/setters** (Vue 3 uses Proxy).
- **Constants:** `Object.defineProperty(obj, "VERSION", { value: "1.0", enumerable: true })`.
- **Polyfills:** adding methods to `Array.prototype` with `enumerable: false` so `for...in` is not polluted.
- **Immutability:** `Object.freeze` sets every property to `writable: false, configurable: false`.

```js run title="A tiny reactive object with getters and setters (the Vue 2 idea)"
function makeReactive(obj, onChange) {
  for (const key of Object.keys(obj)) {
    let value = obj[key];
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: true,
      get() { return value; },
      set(next) {
        if (next !== value) { const old = value; value = next; onChange(key, old, next); }
      },
    });
  }
  return obj;
}

const state = makeReactive({ count: 0, name: "Asha" }, (k, o, n) => console.log(`${k}: ${o} -> ${n}`));
state.count++;
state.name = "Ravi";
state.count = state.count;          // same value: no event
state.added = 1;                     // new keys are NOT reactive: the limitation that Proxy fixes
```

:::interview What are property descriptors? Explain writable, enumerable and configurable.
"A descriptor describes a property's attributes. For a data property: `value`, and flags `writable` (can the value change), `enumerable` (does it show up in `for...in`, `Object.keys`, spread and JSON) and `configurable` (can it be deleted or its attributes changed). An accessor property has `get` and `set` instead of value and writable. Properties created by assignment have all flags true; properties made with `Object.defineProperty` default to false. `Object.freeze` sets writable and configurable to false for all properties. They are used for hidden metadata, constants, and in older frameworks, for reactivity."
:::

## More interview questions on this topic

:::qa What are the default flags of `Object.defineProperty`? {level=medium}
**Say this:** "All three flags default to `false` if you do not set them, unlike normal assignment where they are `true`."

**In simple words:** defineProperty is locked by default.
:::

:::qa How can you make a property that does not appear in `JSON.stringify` or loops but is still usable? {level=easy}
**Say this:** "Define it with `enumerable: false`."

**In simple words:** A hidden field.
:::

:::qa Does the spread operator copy getters? {level=hard}
**Say this:** "No. Spread and `Object.assign` read the value (calling the getter) and create a plain data property. To copy accessors, use `Object.getOwnPropertyDescriptors` with `Object.defineProperties`."

**In simple words:** They copy what the getter returns, not the getter.
:::

:::qa Why did Vue 3 move from `defineProperty` to `Proxy`? {level=hard}
**Say this:** "`defineProperty` must be applied to each existing property, so it cannot detect new keys, deleted keys, or array index and length changes. A Proxy intercepts all operations on the object."

**In simple words:** The old way watched each door. A proxy watches the whole house.
:::

```quiz
? Which flag controls whether a property is skipped by Object.keys?
- writable
+ enumerable
- configurable
> Non-enumerable properties are not listed.
? What is the default `writable` for a property made with `Object.defineProperty` and no flags?
- true
+ false
- undefined
> Everything defaults to false.
? Can a property be both an accessor and have a value?
- Yes
+ No, a descriptor is either data (value/writable) or accessor (get/set)
- Only in classes
> Mixing them throws a TypeError.
```

:::keypoints
- Flags: **writable, enumerable, configurable**. Accessors have `get`/`set` instead of `value`/`writable`.
- Assignment creates all-true flags; **`defineProperty` defaults to false**.
- Non-enumerable = hidden from loops, keys, spread and JSON, but still accessible.
- `configurable: false` is a **one-way door**. `freeze` locks every property.
- Spread/assign **lose getters**; use `getOwnPropertyDescriptors` to copy them.
:::
