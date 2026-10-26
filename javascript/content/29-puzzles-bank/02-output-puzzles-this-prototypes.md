---
title: "Puzzles: this, prototypes and classes"
level: hard
time: 30
summary: Eleven puzzles on lost this, arrow functions, bind, new, the prototype chain, shared prototype state, class fields, constructors calling overridden methods, private fields and Symbol.hasInstance.
---

Predict, then run. These run in strict mode (like modules and classes), so a plain call has `this === undefined`.

## Puzzle 1: a method taken out of its object

```js run title="Puzzle 1"
const user = { name: "Asha", hi() { return this?.name; } };
const hi = user.hi;
console.log(user.hi(), hi());
```

:::hint Show the reason
`user.hi()` has an owner, so `this` is `user`. `hi()` has no owner, so `this` is `undefined` in strict mode, and `this?.name` is `undefined`. Output: `Asha undefined`.
:::

## Puzzle 2: callbacks and arrows

```js run title="Puzzle 2"
const counter = {
  count: 0,
  inc() { [1, 2, 3].forEach(function () { this.count++; }); },
  incArrow() { [1, 2, 3].forEach(() => { this.count++; }); },
};
try { counter.inc(); } catch (e) { console.log(e.name); }
counter.incArrow();
console.log(counter.count);
```

:::hint Show the reason
The regular function callback is called plainly, so `this` is `undefined` and `this.count++` throws a `TypeError`. The arrow function uses the `this` of `incArrow`, which is `counter`, so the count goes to 3. Output: `TypeError` then `3`.
:::

## Puzzle 3: binding twice

```js run title="Puzzle 3"
function who() { return this.name; }
const a = who.bind({ name: "A" });
const b = a.bind({ name: "B" });
console.log(a(), b(), who.call({ name: "C" }), a.call({ name: "D" }));
```

:::hint Show the reason
A bound function keeps its first `this` forever. `b` is bound again, but the first binding wins, and `call` on `a` cannot change it either. Only `who.call` on the original function uses `C`. Output: `A A C A`.
:::

## Puzzle 4: new beats bind

```js run title="Puzzle 4"
function P(x) { this.x = x; }
const BP = P.bind({ ignored: true }, 5);
const p = new BP();
console.log(p.x, p instanceof P, p.ignored);
```

:::hint Show the reason
With `new`, the bound `this` is ignored but the preset argument (5) is kept, and the instance is still an instance of the original constructor. Output: `5 true undefined`.
:::

## Puzzle 5: the prototype chain

```js run title="Puzzle 5"
function A() {}
A.prototype.hello = () => "A";
function B() {}
B.prototype = Object.create(A.prototype);
B.prototype.constructor = B;
const b = new B();
console.log(b.hello(), b instanceof A, Object.getPrototypeOf(b) === B.prototype, b.constructor.name, Object.keys(b));
```

:::hint Show the reason
`b` finds `hello` on `A.prototype` through the chain `b → B.prototype → A.prototype`. `instanceof A` is true because `A.prototype` is on the chain. `constructor` was reset to `B`. `b` has no own properties, so `Object.keys(b)` is empty. Output: `A true true B []`.
:::

## Puzzle 6: shared state on a prototype

```js run title="Puzzle 6"
const proto = { items: [], count: 0 };
const x = Object.create(proto), y = Object.create(proto);
x.items.push("a");
x.count++;
console.log(y.items, y.count, x.count, Object.hasOwn(x, "items"), Object.hasOwn(x, "count"));
```

:::hint Show the reason
`x.items.push` reads `items` from the shared prototype and mutates that one array, so `y` sees it. `x.count++` reads `0` from the prototype and then writes a new **own** property on `x`. Output: `[ 'a' ] 0 1 false true`.
:::

## Puzzle 7: class fields and lost this

```js run title="Puzzle 7"
class Btn {
  label = "OK";
  click() { return this?.label; }
  arrow = () => this.label;
}
const btn = new Btn();
const { click, arrow } = btn;
console.log(click(), arrow());
```

:::hint Show the reason
`click` is a prototype method; extracted, it is called plainly with `this === undefined`. `arrow` is an arrow function created per instance in the field initialiser, so it keeps `this` as the instance. Output: `undefined OK`.
:::

## Puzzle 8: the constructor calls an overridden method

```js run title="Puzzle 8"
class Animal {
  constructor() { this.init(); }
  init() { this.kind = "animal"; }
}
class Dog extends Animal {
  name = "Rex";
  init() { this.kind = "dog:" + this.name; }
}
console.log(new Dog().kind);
```

:::hint Show the reason
The parent constructor calls `this.init()`, which resolves to `Dog`'s override. But `Dog`'s field `name = "Rex"` is initialised only **after** `super()` returns, so `this.name` is still `undefined`. Output: `dog:undefined`. Avoid calling overridable methods in constructors.
:::

## Puzzle 9: static, private and instance

```js run title="Puzzle 9"
class Counter {
  static total = 0;
  #n = 0;
  inc() { this.#n++; Counter.total++; return this.#n; }
}
const c1 = new Counter(), c2 = new Counter();
c1.inc(); c1.inc(); c2.inc();
console.log(c1.inc(), c2.inc(), Counter.total, c1.total, "n" in c1);
```

:::hint Show the reason
`#n` is per instance: `c1` reaches 3 and `c2` reaches 2. `total` is a static property on the class, shared by all calls: 5. Instances do not see statics (`c1.total` is `undefined`), and a private field is not visible as `"n"`. Output: `3 2 5 undefined false`.
:::

## Puzzle 10: getters and JSON

```js run title="Puzzle 10"
class User {
  constructor(n) { this.name = n; }
  get upper() { return this.name.toUpperCase(); }
  toJSON() { return { n: this.name }; }
}
const u = new User("asha");
console.log(JSON.stringify(u), Object.keys(u), u.upper, "upper" in u);
```

:::hint Show the reason
`JSON.stringify` calls `toJSON`, so the output is `{"n":"asha"}`. The getter lives on the prototype, so it is not an own key (`Object.keys` gives `[ 'name' ]`), but `"upper" in u` is `true` because `in` looks up the chain. `u.upper` is `ASHA`.
:::

## Puzzle 11: customising instanceof

```js run title="Puzzle 11"
class Even { static [Symbol.hasInstance](n) { return n % 2 === 0; } }
console.log(2 instanceof Even, 3 instanceof Even);
```

:::hint Show the reason
`instanceof` calls `Even[Symbol.hasInstance](value)` first. Here it ignores prototypes and tests evenness. Output: `true false`.
:::

:::keypoints
- `this` comes from the **call**; extracted methods lose it; arrows keep the outer one.
- `bind` is permanent; `new` ignores the bound `this`.
- Prototype **objects and arrays are shared**; primitives written via `x.count++` create own properties.
- Class fields are initialised **after `super()`**; `#private` and `static` are separate worlds.
:::
