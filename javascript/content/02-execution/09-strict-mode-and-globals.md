---
title: Strict mode, the global object and accidental globals
level: easy
time: 20
summary: What "use strict" changes, where strict mode is automatic (modules, classes), globalThis in browser and Node, and how accidental globals and unsafe defaults are avoided.
---

## What is strict mode?

> "Strict mode is a **safer version of JavaScript**. Mistakes that were silently ignored now throw errors, and a few confusing features are switched off."

You turn it on by writing `"use strict";` as the first line of a file or a function. You do not need to write it in:

- **ES modules** (`import` / `export`, `<script type="module">`, `.mjs`, Node with `"type": "module"`)
- **Class bodies**
- Most modern bundler output

So **modern code is almost always strict**. Interviews ask about it to see if you know what changes.

## What changes in strict mode

| Sloppy mode (old) | Strict mode |
|---|---|
| `x = 5` without a declaration creates a **global** | Throws `ReferenceError` |
| Writing to a read-only property fails **silently** | Throws `TypeError` |
| Deleting a non-deletable property fails silently | Throws `TypeError` |
| `this` in a plain function call is `globalThis` | `this` is **`undefined`** |
| Duplicate parameter names allowed | `SyntaxError` |
| `arguments` is linked to the parameters | Not linked |
| `with` statement and octal `010` allowed | `SyntaxError` |
| `eval` can create variables in the surrounding scope | `eval` has its own scope |

```js run sloppy title="Sloppy mode hides mistakes"
function sloppy() {
  undeclared = 123;                           // creates a global by accident
  const frozen = Object.freeze({ a: 1 });
  frozen.a = 2;                               // silently ignored
  console.log("frozen.a is still", frozen.a);
  console.log("this is the global object:", this === globalThis);
}
sloppy();
console.log("leaked global:", globalThis.undeclared);
```

```js run title="Strict mode reports the same mistakes"
"use strict";

function strict() {
  try { undeclared = 123; } catch (e) { console.log(e.name + ": " + e.message); }

  const frozen = Object.freeze({ a: 1 });
  try { frozen.a = 2; } catch (e) { console.log(e.name + ": " + e.message); }

  console.log("this is:", this);
}
strict();
```

## `this` in strict mode

This is the strict-mode change that interviewers like most. In a plain call, `this` is `undefined`, not the global object. This protects you from accidentally creating or changing globals through `this.x = ...`.

```js run title="A plain function call in strict mode"
"use strict";

function show() {
  return this;
}

console.log(show());                  // plain call: undefined
console.log(show.call({ id: 7 }));    // explicit this still works
```

## Where strict mode is automatic

```js run title="Class bodies are always strict"
class Demo {
  method() {
    return this;                      // strict: undefined if the method is detached
  }
}

const detached = new Demo().method;
console.log(detached());              // undefined, even without "use strict"
```

This is why a class method passed as a callback loses `this` and gives `undefined`, instead of the global object. It is a classic React bug (`this.handleClick` passed to `onClick`).

## The global object: globalThis

Different environments name the global object differently. This used to be a pain. `globalThis` (ES2020) works everywhere.

| Environment | Global object names |
|---|---|
| Browser (main thread) | `window`, `self`, `globalThis` |
| Web Worker | `self`, `globalThis` |
| Node.js | `global`, `globalThis` |

```js run title="One name that works everywhere"
console.log(typeof globalThis);
console.log(globalThis === globalThis.globalThis);

// Handy: feature detection that works in all environments
const hasFetch = typeof globalThis.fetch === "function";
console.log("fetch available:", hasFetch);
```

## Accidental globals: how they happen and how to stop them

Common ways to create one by mistake:

1. Assigning to an undeclared name (`count = 0`) in sloppy mode.
2. Chained declarations: `let a = b = 5;` makes `b` a global, only `a` is local.
3. A typo in a variable name when assigning.
4. Using `this.x = ...` inside a function called without `new` in sloppy mode.

```js run sloppy title="let a = b = 5"
function chained() {
  let a = b = 5;                      // really: b = 5 (global), then let a = b
}
chained();
console.log(typeof a, typeof b);      // a is local to chained(), b leaked
```

How to prevent them:

- Use **strict mode / ES modules**, so these are errors.
- Use a **linter**: ESLint rules `no-undef`, `no-implicit-globals` and `prefer-const`.
- Use `const` and `let` always, and never chain assignments.

## "use strict" placement

```js
"use strict";                         // whole file (must be the very first statement)

function f() {
  "use strict";                       // only this function
}
```

A file-level directive is applied to the whole script. Be careful when you **concatenate** scripts: a strict script joined after a sloppy one (or the reverse) can change behaviour. Modules avoid this problem.

:::interview What does strict mode do, and where is it enabled automatically?
"Strict mode turns silent mistakes into errors and removes unsafe features: assigning to an undeclared variable throws, writing to read-only properties throws, `this` in a plain function call is `undefined` instead of the global object, duplicate parameter names are not allowed, and `with` is removed. It is automatic in ES modules and in class bodies. I always write modern code as modules, so I get strict mode for free."
:::

## More interview questions on this topic

:::qa What is `this` in a plain function call, in sloppy mode and in strict mode? {level=easy}
**Say this:** "In sloppy mode it is the global object. In strict mode it is `undefined`."

**In simple words:** Strict mode refuses to hand a function the global object by accident.
:::

:::qa What is `globalThis` and why was it added? {level=easy}
**Say this:** "It is a standard name for the global object in every environment, since `window`, `self` and `global` differ between browsers, workers and Node."

**In simple words:** One name that always works.
:::

:::qa How can you accidentally create a global variable? How do you prevent it? {level=medium}
**Say this:** "By assigning to an undeclared name in sloppy mode, or with `let a = b = 5`. I prevent it with strict mode or modules, a linter, and always declaring with `const` or `let`."

**In simple words:** A typo in a name can silently make a new global, which then causes strange bugs elsewhere.
:::

:::qa Is "use strict" needed in an ES module or a class? {level=medium}
**Say this:** "No. Module code and class bodies are always strict."

**In simple words:** So it is rarely written in modern projects, but the rules are still in force.
:::

```quiz
? In strict mode, what is `this` inside a normal function called as `f()`?
- The global object
+ undefined
- The function itself
> This avoids accidental changes to the global object.
? What does `let a = b = 5;` do inside a function in sloppy mode?
- Declares both a and b locally
+ Declares only a locally and makes b a global
- Throws a SyntaxError
> Only the left-most name is declared. b = 5 creates a global.
? Which of these code is always strict mode?
- A function declaration
+ A class body
- An object literal
> Class bodies and ES modules are always strict.
```

:::keypoints
- **Strict mode** turns silent errors into thrown errors and removes unsafe features.
- Plain-call `this` becomes **`undefined`**; undeclared assignments throw.
- **ES modules and class bodies are strict automatically.**
- `globalThis` is the one portable name for the global object.
- Prevent accidental globals with strict mode, a linter and `const` / `let`.
:::
