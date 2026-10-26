---
title: Prototype output puzzles
level: advanced
time: 30
summary: Ten prototype, constructor and inheritance puzzles. Draw the chain on paper, predict, run, and read the reason.
---

Tip: for each puzzle, **draw the chain** first (boxes and arrows). Most wrong answers come from forgetting that writes go on the object and reads go up the chain.

## Puzzle 1: shadowing

```js run title="Puzzle 1"
const parent = { x: 1 };
const child = Object.create(parent);

child.x++;                       // read x (1, inherited), then write 2 on child

console.log(child.x, parent.x, Object.hasOwn(child, "x"));
```

:::hint Show the reason
`child.x++` reads the inherited `1`, adds one, and **writes `2` as an own property of `child`**. The parent stays `1`. Output: `2 1 true`.
:::

## Puzzle 2: shared array

```js run title="Puzzle 2"
const proto = { list: [] };
const a = Object.create(proto);
const b = Object.create(proto);

a.list.push("x");
b.list = ["y"];

console.log(a.list, b.list, proto.list);
```

:::hint Show the reason
`a.list.push` **reads** `list` through the chain and mutates the shared array. `b.list = ["y"]` **writes** a new own property on `b`. Output: `[ 'x' ] [ 'y' ] [ 'x' ]`.
:::

## Puzzle 3: instanceof after replacing the prototype

```js run title="Puzzle 3"
function F() {}
const a = new F();
F.prototype = {};
const b = new F();

console.log(a instanceof F, b instanceof F);
```

:::hint Show the reason
`a` was linked to the old prototype object. After the replacement, `F.prototype` is a different object that is not in `a`'s chain. So `false true`.
:::

## Puzzle 4: constructor property

```js run title="Puzzle 4"
function Animal() {}
function Dog() {}
Dog.prototype = Object.create(Animal.prototype);

const d = new Dog();
console.log(d.constructor === Animal, d.constructor === Dog);
```

:::hint Show the reason
`Dog.prototype` was replaced and has no own `constructor`. The lookup finds `Animal.prototype.constructor`, which is `Animal`. So `true false`. This is why we restore `constructor` after `Object.create`.
:::

## Puzzle 5: method on the prototype and `this`

```js run title="Puzzle 5"
function Counter() { this.count = 0; }
Counter.prototype.inc = function () { this.count++; return this.count; };

const a = new Counter();
const b = new Counter();
a.inc(); a.inc();
const inc = b.inc;

try {
  console.log(a.count, b.count, inc());
} catch (e) {
  console.log(a.count, b.count, e.name);
}
```

:::hint Show the reason
`a.inc()` twice makes `a.count` 2. `b.count` stays 0. The detached `inc()` is a plain call: strict mode gives `this` as `undefined`, so `this.count++` throws a `TypeError`. Output: `2 0 TypeError`.
:::

## Puzzle 6: the chain of a function

```js run title="Puzzle 6"
function foo() {}

console.log(typeof foo.prototype);
console.log(foo.prototype.constructor === foo);
console.log(Object.getPrototypeOf(foo) === Function.prototype);
console.log(foo.__proto__ === foo.prototype);
```

:::hint Show the reason
`foo.prototype` is an object (the plan for instances). Its `constructor` is `foo`. But `foo`'s **own** `[[Prototype]]` is `Function.prototype`, not `foo.prototype`. The last line is `false`: the two things named "prototype" are different objects.
:::

## Puzzle 7: method overriding with super

```js run title="Puzzle 7"
class A {
  who() { return "A"; }
  test() { return this.who(); }
}
class B extends A {
  who() { return "B"; }
  test() { return super.test() + "!"; }
}

console.log(new B().test());
```

:::hint Show the reason
`super.test()` runs `A`'s `test` with `this` still being the `B` instance, so `this.who()` finds `B`'s `who`. Output: `B!`.
:::

## Puzzle 8: class fields vs prototype methods

```js run title="Puzzle 8"
class K {
  a = () => "arrow";
  b() { return "method"; }
}
const x = new K(), y = new K();

console.log(x.a === y.a, x.b === y.b);
console.log(Object.keys(x));
```

:::hint Show the reason
The arrow field is created **per instance**, so the functions differ: `false`. The method is on the prototype: `true`. `Object.keys` shows only own enumerable properties: `[ 'a' ]`.
:::

## Puzzle 9: Object.create(null)

```js run title="Puzzle 9"
const d = Object.create(null);
d.key = 1;

console.log("toString" in d, "toString" in {});
try {
  console.log(`${d}`);
} catch (e) {
  console.log(e.name);
}
```

:::hint Show the reason
`d` inherits nothing, so `"toString" in d` is `false`. Converting it to a string needs `toString`/`valueOf`, which do not exist, so JavaScript throws a `TypeError`. Output: `false true` then `TypeError`.
:::

## Puzzle 10: who has the property?

```js run title="Puzzle 10"
function Person() {}
Person.prototype.species = "human";

const p = new Person();
console.log(p.species, Object.hasOwn(p, "species"), "species" in p);

p.species = "robot";
delete Person.prototype.species;

console.log(p.species, Person.prototype.species);
```

:::hint Show the reason
First line: found through the chain, not own, in the chain: `human false true`. Then `p.species = "robot"` creates an own property. Deleting the prototype's property does not touch `p`'s own: `robot undefined`.
:::

## Cheat sheet

| Question | Answer |
|---|---|
| Does `obj.x = v` change the prototype? | No. It writes on `obj` (shadowing) |
| Does `obj.list.push(v)` change the prototype's list? | Yes, if `list` is inherited: it mutates the shared object |
| What does `instanceof` check? | Is `F.prototype` somewhere in the chain? |
| Where is a class method stored? | On `Class.prototype` (shared) |
| Where is an arrow class field stored? | On each instance (own property) |
| What ends every chain? | `null` (after `Object.prototype`) |

:::keypoints
- **Read** goes up the chain; **write** goes on the object.
- Mutating an inherited object (`push`) changes the **shared** object.
- Replacing `F.prototype` breaks `instanceof` for old instances and removes `constructor`.
- `super.method()` keeps the **child's** `this`.
- An object without a prototype cannot be turned into a string with `${}`.
:::
