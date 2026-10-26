---
title: Optional chaining, nullish coalescing and logical assignment
level: easy
time: 20
summary: ?. for safe access, ?? for real defaults (and why || is wrong for 0 and ""), the logical assignment operators ??=, ||= and &&=, short-circuiting, and the gotchas.
---

## The problem they solve

```js run title="Without safety: the most common runtime error"
const user = { name: "Asha" };      // no address

try {
  console.log(user.address.city);
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

`Cannot read properties of undefined (reading 'city')` is the number one error in JavaScript apps. Optional chaining prevents it.

## Optional chaining `?.`

If the thing **before** `?.` is `null` or `undefined`, the whole expression **stops and returns `undefined`**. Otherwise it continues.

```js run title="?. in its three forms"
const user = { name: "Asha", address: { city: "Pune" }, getRole() { return "admin"; }, tags: ["a", "b"] };
const nobody = null;

console.log(user.address?.city, user.contact?.email);          // property: safe access
console.log(user.getRole?.(), user.fly?.());                   // method: call only if it exists
console.log(user.tags?.[1], user.items?.[0]);                  // index / computed key
console.log(nobody?.name, nobody?.address.city);               // short-circuit: the rest is NOT evaluated

let count = 0;
nobody?.method(count++);                                        // arguments are not evaluated either
console.log("count:", count);
```

Notes:

- It only checks for `null` and `undefined`, **not** for other falsy values (`0`, `""`, `false`).
- It does **not** hide errors in other parts: `user.getRole?.()` is safe if `getRole` is missing, but if `getRole` exists and **throws**, the error still appears.
- You cannot use it on the left side of an assignment: `a?.b = 1` is a SyntaxError.
- Do not overuse it. If a value **must** exist, a missing value is a bug, and `?.` would hide it. Use it where data may truly be missing (API responses, optional config).

## Nullish coalescing `??`

`a ?? b` gives `b` **only if `a` is `null` or `undefined`**.

```js run title="?? vs ||"
const settings = { volume: 0, title: "", darkMode: false, retries: null };

console.log("|| :", settings.volume || 50, `"${settings.title || "Untitled"}"`, settings.darkMode || true);
console.log("?? :", settings.volume ?? 50, `"${settings.title ?? "Untitled"}"`, settings.darkMode ?? true);
console.log(settings.retries ?? 3, settings.missing ?? "default");
```

`||` replaces **any falsy** value (`0`, `""`, `false`, `NaN`). That is a bug when `0` or `""` is a **valid value**. Use `??` for defaults.

| Left side is... | `a \|\| b` gives | `a ?? b` gives |
|---|---|---|
| `0` | `b` | `0` |
| `""` | `b` | `""` |
| `false` | `b` | `false` |
| `null` / `undefined` | `b` | `b` |

Combine them for deep defaults:

```js run title="Safe access with a default"
const config = { server: { port: 0 } };

console.log(config.server?.port ?? 3000);          // 0: a real value
console.log(config.cache?.ttl ?? 60);               // 60: missing
```

`??` cannot be mixed with `||` or `&&` without parentheses (a syntax error), so the intention is explicit.

## Logical assignment: `||=`, `&&=`, `??=`

Short forms that **assign only if** the condition holds. (ES2021)

| Operator | Same as | Assigns when the left is... |
|---|---|---|
| `a \|\|= b` | `a \|\| (a = b)` | falsy |
| `a &&= b` | `a && (a = b)` | truthy |
| `a ??= b` | `a ?? (a = b)` | `null` or `undefined` |

```js run title="Logical assignment"
const options = { retries: 0, name: "", cache: null };

options.retries ||= 3;           // 0 is falsy: replaced (probably a bug here!)
options.name ??= "anonymous";    // "" is not nullish: kept
options.cache ??= new Map();     // null: assigned
options.extra ??= [];            // missing: assigned

console.log(options);

// a common memoization/lazy-init pattern
const registry = {};
(registry.users ??= []).push("Asha");
(registry.users ??= []).push("Ravi");
console.log(registry);

let user = { loggedIn: true, token: "abc" };
user.loggedIn &&= false;                         // only change if currently true
console.log(user);
```

These operators **short-circuit**: if no assignment is needed, the setter is not even called.

## Short-circuit evaluation

`&&` and `||` return **one of their operands**, not a boolean, and stop early.

```js run title="&& and || return operands"
console.log("hi" && "there", 0 && "never evaluated", null || "fallback", "first" || "second");

const user = { name: "Asha" };
user.name && console.log("runs only if name is truthy");          // a common (but terse) if
console.log(typeof user.logout === "function" && "has logout");   // false if missing
```

Avoid using `&&` as an `if` in application code; a real `if` is clearer. In JSX, `{cond && <Thing/>}` is fine, but beware: `{count && <Thing/>}` renders **`0`** when `count` is `0`!

## Gotchas

```js run title="Gotchas"
// 1. delete works with ?.
const o = { a: { b: 1 } };
console.log(delete o.x?.y);                      // true: nothing to delete

// 2. typeof a missing nested value is still safe with ?.
console.log(typeof o.a?.c?.d);

// 3. ?. with a function that is NOT a function throws
const val = { fn: 42 };
try { val.fn?.(); } catch (e) { console.log(e.name + ": " + e.message); }

// 4. NaN is not nullish
console.log(NaN ?? "x", NaN || "x");

// 5. optional chaining returns undefined, not null, so JSON drops the key
console.log(JSON.stringify({ a: null?.x, b: 1 }));
```

:::interview What is the difference between `||` and `??`? When do you use optional chaining?
"`||` returns the right side for any falsy left value (0, empty string, false, NaN), so it breaks defaults when those are valid values. `??` returns the right side only for `null` or `undefined`, which is what 'missing' really means. Optional chaining `?.` safely reads a property, calls a method or indexes when the value may be `null` or `undefined`: it short-circuits to `undefined` instead of throwing. I use them for optional data such as API responses, but not to hide values that must exist. The logical assignment operators `??=`, `||=` and `&&=` assign only when needed."
:::

## More interview questions on this topic

:::qa What does `a?.b.c` do if `a` is null? {level=medium}
**Say this:** "The whole chain short-circuits to `undefined`, including `.c`. If `a` exists but `a.b` is undefined, then `.c` throws, because only the `?.` position is protected."

**In simple words:** `?.` guards only the thing right before it, but it stops the rest when it triggers.
:::

:::qa Why is `value || default` a bug for numbers? {level=easy}
**Say this:** "If `value` is `0` (valid), `||` replaces it with the default. Use `value ?? default`."

**In simple words:** Zero is a real number, not "missing".
:::

:::qa What is `??=` for? {level=medium}
**Say this:** "Assign a value only if the variable is `null` or `undefined`, such as lazy initialisation: `cache ??= new Map()`."

**In simple words:** "Set it if empty."
:::

:::qa Can you mix `??` with `||` in one expression? {level=hard}
**Say this:** "Not without parentheses; it is a SyntaxError, to avoid ambiguity. Write `(a ?? b) || c`."

**In simple words:** The language makes you say which one you mean.
:::

```quiz
? What does `0 ?? 5` return?
- 5
+ 0
- null
> 0 is not null or undefined.
? What does `null?.name` return?
- null
+ undefined
- It throws
> The chain stops with undefined.
? What does `x ||= 10` do when x is 0?
- Keeps 0
+ Assigns 10
- Throws
> 0 is falsy.
```

:::keypoints
- **`?.`** short-circuits to `undefined` on `null`/`undefined`: `a?.b`, `a?.[k]`, `a?.()`.
- **`??`** defaults only for `null`/`undefined`. **`||`** defaults for any falsy value: wrong for `0`, `""`, `false`.
- `??=`, `||=`, `&&=` assign **conditionally** (and short-circuit).
- Do not use `?.` to hide values that **must** exist. `{count && <X/>}` renders `0`.
:::
