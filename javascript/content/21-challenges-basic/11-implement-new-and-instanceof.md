---
title: Implement new, instanceof and Object.create
level: medium
time: 25
summary: Rebuild what the new operator does in four steps, write instanceof by walking the prototype chain, and implement Object.create. Shows you understand prototypes, not just syntax.
---

:::problem Implement new, instanceof and Object.create {level=easy tags="prototypes,new,instanceof"}
1. `myNew(Constructor, ...args)` must behave like `new Constructor(...args)`.
   - Create an object whose prototype is `Constructor.prototype`.
   - Run the constructor with `this` set to that object.
   - If the constructor **returns an object**, that is the result; otherwise use the new object.
2. `myInstanceOf(value, Constructor)` walks the prototype chain of `value` looking for `Constructor.prototype`.
3. `myCreate(proto, props?)` is `Object.create`.

```js
function Person(name) { this.name = name; }
Person.prototype.hi = function () { return "hi " + this.name; };
myNew(Person, "Asha").hi();                 // "hi Asha"
myInstanceOf(myNew(Person, "A"), Person);   // true
```

:::hint Hint
`new` has four steps: make an empty object, link its prototype, run the function with that object as `this`, and return the object (unless the function returned another object).
:::
:::

## Solution and tests

```js run title="myNew, myInstanceOf and myCreate, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function myCreate(proto, props) {
  if (proto !== null && typeof proto !== "object" && typeof proto !== "function") throw new TypeError("Object prototype may only be an Object or null");
  function Temp() {}
  Temp.prototype = proto;                                  // the classic old way
  const obj = new Temp();
  if (proto === null) Object.setPrototypeOf(obj, null);    // a null prototype cannot be done with the function trick
  if (props) Object.defineProperties(obj, props);
  return obj;
}

function myNew(Constructor, ...args) {
  if (typeof Constructor !== "function") throw new TypeError("not a constructor");
  const proto = Constructor.prototype !== null && typeof Constructor.prototype === "object" ? Constructor.prototype : Object.prototype;
  const obj = myCreate(proto);                             // steps 1 and 2: create and link
  const result = Constructor.apply(obj, args);             // step 3: run with this = obj
  const isObject = result !== null && (typeof result === "object" || typeof result === "function");
  return isObject ? result : obj;                          // step 4
}

function myInstanceOf(value, Constructor) {
  if (typeof Constructor !== "function") throw new TypeError("Right-hand side of 'instanceof' is not callable");
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;   // primitives are never instances
  const target = Constructor.prototype;
  for (let p = Object.getPrototypeOf(value); p !== null; p = Object.getPrototypeOf(p)) {
    if (p === target) return true;
  }
  return false;
}

// ---------------- tests ----------------
function Person(name) { this.name = name; }
Person.prototype.hi = function () { return "hi " + this.name; };

test("myNew builds an instance", () => {
  const p = myNew(Person, "Asha");
  assert.equal(p.name, "Asha");
  assert.equal(p.hi(), "hi Asha");
  assert.equal(Object.getPrototypeOf(p), Person.prototype);
});

test("returning an object replaces the instance", () => {
  function Weird() { this.a = 1; return { replaced: true }; }
  assert.deepEqual(myNew(Weird), { replaced: true });
});

test("returning a primitive is ignored", () => {
  function Ok() { this.a = 1; return 42; }
  assert.equal(myNew(Ok).a, 1);
});

test("works with inheritance", () => {
  function Student(name, school) { Person.call(this, name); this.school = school; }
  Student.prototype = Object.create(Person.prototype);
  Student.prototype.constructor = Student;
  const s = myNew(Student, "Ravi", "IIT");
  assert.equal(s.hi(), "hi Ravi");
  assert.ok(myInstanceOf(s, Student));
  assert.ok(myInstanceOf(s, Person));
  assert.ok(myInstanceOf(s, Object));
});

test("class constructors cannot be called without new", () => {
  class A {}
  assert.throws(() => myNew(A), TypeError);                // classes insist on real new; the polyfill works for functions
});

test("myNew rejects non-functions", () => assert.throws(() => myNew({}), TypeError));

test("instanceof basics", () => {
  assert.equal(myInstanceOf([], Array), true);
  assert.equal(myInstanceOf([], Object), true);
  assert.equal(myInstanceOf({}, Array), false);
  assert.equal(myInstanceOf(() => {}, Function), true);
});

test("primitives are not instances", () => {
  assert.equal(myInstanceOf(5, Number), false);
  assert.equal(myInstanceOf("s", String), false);
  assert.equal(myInstanceOf(new String("s"), String), true);
});

test("null-prototype objects are not instances of anything", () => assert.equal(myInstanceOf(Object.create(null), Object), false));

test("instanceof follows the current prototype, not the constructor that made it", () => {
  const p = new Person("A");
  Person.prototype = {};                                   // replace the prototype after creating p
  assert.equal(myInstanceOf(p, Person), false);
  assert.equal(p instanceof Person, false);                // the real operator agrees
});

test("myCreate", () => {
  const base = { greet() { return "hello " + this.n; } };
  const o = myCreate(base, { n: { value: "x", enumerable: true } });
  assert.equal(o.greet(), "hello x");
  assert.equal(Object.getPrototypeOf(o), base);
  assert.equal(Object.getPrototypeOf(myCreate(null)), null);
});
```

## The interview version of "what does `new` do?"

1. **Create** a new empty object.
2. **Link** its `[[Prototype]]` to `Constructor.prototype`.
3. **Run** the constructor with `this` = the new object.
4. **Return** the object, unless the constructor returned a different **object**.

(Also: `new.target` is set inside the constructor, and class constructors refuse to run without `new`.)

:::qa How could `instanceof` be fooled? {level=medium}
**Say this:** "It only checks the prototype chain. Change a prototype later, use `Object.setPrototypeOf`, or define `Symbol.hasInstance` on the constructor, and the answer changes. Across iframes or realms each has its own `Array`, so `[] instanceof OtherRealmArray` is false. Use `Array.isArray` for arrays."

**In simple words:** It checks the family tree, not what the object really is.
:::

:::qa What is `Symbol.hasInstance`? {level=hard}
**Say this:** "A static method that `instanceof` calls first, so a class can decide for itself what counts as an instance. For example `static [Symbol.hasInstance](x) { return typeof x.quack === 'function'; }` gives duck typing."

**In simple words:** The class can write its own rule for `instanceof`.
:::

:::keypoints
- `new` = **create → link prototype → run with `this` → return** (an object result overrides).
- `instanceof` = walk `getPrototypeOf` until `Constructor.prototype` or `null`; **primitives are never instances**.
- `Object.create(proto)` = an empty object whose prototype is `proto` (`null` allowed).
- Realm problems: prefer `Array.isArray`; `Symbol.hasInstance` can customise `instanceof`.
:::
