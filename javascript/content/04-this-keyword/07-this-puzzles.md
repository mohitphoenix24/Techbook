---
title: this output puzzles
level: advanced
time: 30
summary: Twelve classic this puzzles with answers and reasons. Look at the call for each one, apply the four rules, predict, then run.
---

For every puzzle: **look at the call**, apply the rules (`new` → `call/apply/bind` → `obj.method()` → plain call; arrow = outer `this`), write your answer, then press **Run**.

Most puzzles use **sloppy mode** (marked) so a plain call gives the global object. In strict mode, those plain calls would give `undefined`.

## Puzzle 1: the object before the dot

```js run title="Puzzle 1"
const obj = {
  name: "obj",
  show() { return this.name; },
};
console.log(obj.show());
```

:::hint Show the reason
`obj.show()` has `obj` before the dot, so `this` is `obj`. Output: `obj`.
:::

## Puzzle 2: copying the method

```js run sloppy title="Puzzle 2"
globalThis.name = "global";

const obj = {
  name: "obj",
  show() { return this.name; },
};

const f = obj.show;
console.log(f());
```

:::hint Show the reason
`f()` is a plain call in sloppy mode, so `this` is the global object, and its `name` is `"global"`.
:::

## Puzzle 3: arrow in an object

```js run sloppy title="Puzzle 3"
globalThis.name = "global";

const obj = {
  name: "obj",
  arrow: () => this.name,
  normal() { return this.name; },
};

console.log(obj.arrow(), obj.normal());
```

:::hint Show the reason
The arrow function takes `this` from where it was written: the surrounding code, whose `this` is the global object in sloppy mode. So `"global"`. The normal method gets `obj`. Output: `global obj`.
:::

## Puzzle 4: nested function in a method

```js run sloppy title="Puzzle 4"
globalThis.id = "global";

const obj = {
  id: "obj",
  outer() {
    function inner() { return this.id; }
    return [this.id, inner()];
  },
};

console.log(obj.outer());
```

:::hint Show the reason
`this.id` in `outer` is `"obj"`. `inner()` is a plain call, so its `this` is the global object. Output: `[ 'obj', 'global' ]`.
:::

## Puzzle 5: nested arrow in a method

```js run title="Puzzle 5"
const obj = {
  id: "obj",
  outer() {
    const inner = () => this.id;
    return [this.id, inner()];
  },
};

console.log(obj.outer());
```

:::hint Show the reason
The arrow function uses the `this` of `outer`, which is `obj`. Output: `[ 'obj', 'obj' ]`.
:::

## Puzzle 6: call beats the dot

```js run title="Puzzle 6"
const a = { name: "A", who() { return this.name; } };
const b = { name: "B" };

console.log(a.who(), a.who.call(b));
```

:::hint Show the reason
`call(b)` sets `this = b`. Output: `A B`.
:::

## Puzzle 7: bind twice

```js run title="Puzzle 7"
function who() { return this.name; }

const first = who.bind({ name: "first" });
const second = first.bind({ name: "second" });

console.log(first(), second(), first.call({ name: "third" }));
```

:::hint Show the reason
The first `bind` fixes `this` for good. Output: `first first first`.
:::

## Puzzle 8: parenthesised method call

```js run sloppy title="Puzzle 8"
globalThis.v = "global";
const obj = { v: "obj", get() { return this.v; } };

console.log(obj.get());
console.log((obj.get)());
console.log((0, obj.get)());
console.log((obj.get = obj.get)());
```

:::hint Show the reason
`(obj.get)()` keeps the reference, so `this = obj`: `obj`. But `(0, obj.get)()` and `(obj.get = obj.get)()` first **evaluate** to a plain function value, which loses the base object, so `this` is the global: `global`. Output: `obj`, `obj`, `global`, `global`.
:::

## Puzzle 9: setTimeout and this

```js run sloppy node title="Puzzle 9"
globalThis.label = "global";
const timer = {
  label: "timer",
  run() {
    setTimeout(function () { console.log("A:", this === globalThis ? "global" : typeof this); }, 0);
    setTimeout(() => console.log("B:", this.label), 0);
  },
};
timer.run();
```

:::hint Show the reason
In a browser the plain function gets `window` (global). In Node it gets the `Timeout` object, so the output differs by runtime: here you will see `object` for A. The arrow function uses `timer` as `this`: `B: timer`. This is a good example of a runtime difference.
:::

## Puzzle 10: new overrides everything

```js run title="Puzzle 10"
function Person(name) { this.name = name; }
const bound = Person.bind({ name: "ignored" });

const p = new bound("Asha");
console.log(p.name);
console.log(p instanceof Person);
```

:::hint Show the reason
`new` makes a new object and the bound `this` is ignored. Output: `Asha` and `true`.
:::

## Puzzle 11: class method passed as callback

```js run title="Puzzle 11"
class Counter {
  n = 0;
  add() { return ++this.n; }
}

const c = new Counter();
const run = (fn) => fn();

try {
  console.log(run(c.add));
} catch (e) {
  console.log(e.name);
}
console.log(run(() => c.add()), run(c.add.bind(c)));
```

:::hint Show the reason
`run(c.add)` passes the bare function, so inside `run` it is called plainly. In a class this is strict mode, so `this` is `undefined` and `this.n` throws a `TypeError`. The wrapper and `bind` versions work: `1` and `2`.
:::

## Puzzle 12: the this of a getter

```js run title="Puzzle 12"
const proto = { get who() { return this.name; }, name: "proto" };
const child = Object.create(proto);
child.name = "child";

console.log(proto.who, child.who);
```

:::hint Show the reason
For a property read, `this` is the object you read **from** (the receiver), even if the getter is found on the prototype. Output: `proto child`.
:::

## A cheat sheet to keep

| You see... | `this` is |
|---|---|
| `new F()` | the new object |
| `f.call(x)`, `f.apply(x)`, `f.bind(x)()` | `x` |
| `a.b.f()` | `a.b` (only the last object before the dot) |
| `f()` | `undefined` (strict) / global (sloppy) |
| `() => this` | `this` of the outer code |
| `(0, a.f)()` or `(a.f = a.f)()` | plain call: `undefined` / global |

:::keypoints
- Decide `this` by the **shape of the call**: new, call/apply/bind, dot, plain.
- Only the **last** object before the dot counts: `a.b.f()` → `this` is `b`.
- Arrow functions use the **outer** `this`, and ignore `call`/`bind`.
- A bare method reference loses the dot: `(0, a.f)()`, callbacks, destructuring.
- Runtimes differ for plain callbacks (`setTimeout`): browser `window`, Node `Timeout`.
:::
