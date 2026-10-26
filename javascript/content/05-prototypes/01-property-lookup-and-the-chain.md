---
title: Property lookup and the prototype chain
level: intermediate
time: 30
summary: Every object has a hidden link to another object. When a property is missing, JavaScript follows the link. This is the prototype chain, and it is how inheritance works.
---

## Start with a question

```js run title="Where does toString come from?"
const user = { name: "Asha" };

console.log(user.name);                  // defined by us
console.log(typeof user.toString);       // we never wrote this!
console.log(user.toString());
```

We never defined `toString` on `user`, yet it works. Where does it come from? The answer is the **prototype chain**.

## The idea

Don't memorise the term yet. Think of it like this:

> "Every object has a **hidden link** to another object, its **prototype**. If you ask an object for a property it does not have, JavaScript **asks its prototype**. If that one does not have it, it asks the **prototype's prototype**, and so on, until it reaches `null`."

:::analogy Asking a senior
You ask a new employee how to file a claim. They do not know, so they ask their team lead. The team lead does not know, so they ask the department head. If nobody knows, you get "undefined". The chain of people you ask is the prototype chain.
:::

:::def Prototype chain
The linked list of objects that JavaScript searches, in order, to find a property: the object itself, then its prototype, then that object's prototype, up to `null`. This is how objects **inherit** properties and methods.
:::

## Seeing the chain

```viz algo=chain title="The prototype chain of { name: 'Asha' }"
node user "user" @0,0 [hl]
  name: "Asha"
node op "Object.prototype" @1,0
  toString: function
  hasOwnProperty: function
  valueOf: function
node nul "null" @2,0 [dim]
  note: end of the chain
link user -> op : [[Prototype]]
link op -> nul : [[Prototype]]
```

```js run title="Walk the chain by hand"
const user = { name: "Asha" };

const proto = Object.getPrototypeOf(user);
console.log(proto === Object.prototype);                 // true: plain objects link to Object.prototype
console.log(Object.getPrototypeOf(proto));               // null: the end of the chain
console.log(Object.hasOwn(user, "toString"));            // false: not the object's own property
console.log("toString" in user);                         // true: found somewhere in the chain
```

## Own vs inherited properties

- An **own** property lives on the object itself.
- An **inherited** property is found further up the chain.

| Check | Looks at |
|---|---|
| `obj.prop` | Own properties first, then the chain |
| `Object.hasOwn(obj, "prop")` | **Own** only |
| `"prop" in obj` | Own **and** inherited |
| `Object.keys(obj)` | Own, enumerable, string keys |
| `for (const k in obj)` | Own **and inherited** enumerable keys |

```js run title="Own vs inherited"
const animal = { eats: true };
const dog = Object.create(animal);        // dog's prototype is animal
dog.barks = true;

console.log(dog.barks, dog.eats);         // barks is own; eats is inherited
console.log(Object.hasOwn(dog, "eats"));  // false
console.log("eats" in dog);               // true
console.log(Object.keys(dog));            // ['barks']
for (const key in dog) console.log("for...in sees:", key);   // both!
```

`for...in` includes inherited keys. That surprises people, which is why most code uses `Object.keys`, `Object.entries` or `for...of` on those.

## Reading is up the chain, writing is on the object

This is a key rule:

- **Reading** `obj.x` searches the whole chain.
- **Writing** `obj.x = 1` creates or changes the property on **`obj` itself**. It never changes the prototype. (This is called **shadowing**.)

```js run title="Writing shadows. It does not change the prototype"
const proto = { colour: "blue" };
const a = Object.create(proto);
const b = Object.create(proto);

a.colour = "red";                         // creates an OWN property on a only
console.log(a.colour, b.colour, proto.colour);

delete a.colour;                          // remove the shadow
console.log(a.colour);                    // the inherited value is visible again
```

One exception: if the inherited property is a **setter**, the setter runs. And if it is a **read-only** (non-writable) inherited property, the write fails (throws in strict mode).

## Methods on the chain: shared, not copied

When many objects share a prototype, there is only **one copy** of a method, so memory is saved.

```js run title="One method, many objects"
const speaker = {
  speak() { return `${this.name} says hello`; },
};

const a = Object.create(speaker, { name: { value: "A" } });
const b = Object.create(speaker, { name: { value: "B" } });

console.log(a.speak(), "|", b.speak());
console.log(a.speak === b.speak);         // the very same function object
```

`this` is not the prototype. It is the object **before the dot** (`a` or `b`), so the same function gives different results.

## The built-in chains

```viz algo=chain title="Chains of common built-in values"
node arr "[1, 2, 3]" @0,0 [hl]
  0: 1
  length: 3
node ap "Array.prototype" @1,0
  map: function
  push: function
node fn "function f() {}" @0,1 [hl]
  name: "f"
node fp "Function.prototype" @1,1
  call: function
  apply: function
  bind: function
node op "Object.prototype" @2,0
  toString: function
  hasOwnProperty: function
link arr -> ap : [[Prototype]]
link ap -> op : [[Prototype]]
link fn -> fp : [[Prototype]]
link fp -> op : [[Prototype]]
```

So an array can use `.map` (from `Array.prototype`) and `.toString` (from `Object.prototype`, overridden in `Array.prototype`). A function can use `.call`, `.apply` and `.bind` from `Function.prototype`.

```js run title="Built-in chains"
const arr = [1, 2, 3];
console.log(Object.getPrototypeOf(arr) === Array.prototype);
console.log(Object.getPrototypeOf(Array.prototype) === Object.prototype);

function f() {}
console.log(Object.getPrototypeOf(f) === Function.prototype);
console.log(Object.getPrototypeOf(Function.prototype) === Object.prototype);

// Primitives get temporary wrapper objects
console.log(Object.getPrototypeOf(Object("text")) === String.prototype);
console.log("text".toUpperCase());
```

## An object with no prototype

`Object.create(null)` makes an object at the **end of the chain**, with no inherited properties at all. It is useful as a safe dictionary.

```js run title="A prototype-free dictionary"
const dict = Object.create(null);
dict.hello = 1;

console.log("toString" in dict);          // false: nothing inherited
console.log("toString" in {});            // true: normal objects inherit it
console.log(Object.getPrototypeOf(dict)); // null
```

A normal object used as a dictionary has a risk: keys like `"toString"` or `"__proto__"` collide with inherited names. Use a `Map` or `Object.create(null)`.

:::interview Explain the prototype chain.
"Every object has an internal link, `[[Prototype]]`, to another object. When I read a property that the object does not have, the engine follows the link and looks in the prototype, then the prototype's prototype, until it finds the property or reaches `null`, where it returns `undefined`. That is how inheritance works in JavaScript: objects inherit directly from other objects. Methods are shared through the chain, not copied. Writing a property always happens on the object itself and shadows any inherited one, unless the inherited one is a setter or is read-only."
:::

## More interview questions on this topic

:::qa How does JavaScript find `obj.toString()` on a plain object? {level=easy}
**Say this:** "It looks at `obj` first, then at `Object.prototype` through the prototype link, and finds `toString` there."

**In simple words:** The object does not have it. Its parent does.
:::

:::qa What is the difference between `Object.hasOwn(obj, key)` and `key in obj`? {level=easy}
**Say this:** "`hasOwn` checks only the object's own properties. `in` checks own and inherited ones."

**In simple words:** `in` also walks up the chain.
:::

:::qa If you assign to an inherited property, is the prototype changed? {level=medium}
**Say this:** "No. The assignment creates an own property that shadows the inherited one. The exceptions are inherited setters, which run, and inherited read-only properties, which block the write."

**In simple words:** You make your own copy. The shared original stays as it was.
:::

:::qa What is at the end of every prototype chain? {level=easy}
**Say this:** "`null`. A normal object's chain ends at `Object.prototype`, whose prototype is `null`."

**In simple words:** When there is nobody left to ask, the answer is `undefined`.
:::

:::qa Why is `for...in` sometimes a bad idea? {level=medium}
**Say this:** "It also loops over inherited enumerable properties. If someone adds a property to a prototype, it appears in the loop. I prefer `Object.keys`, `Object.entries` or `for...of`."

**In simple words:** It sees keys from the parents too, which you usually do not want.
:::

```quiz
? What does the engine do when a property is not found on an object?
- Throws a ReferenceError
+ Looks in the object's prototype, and so on, until null
- Returns null at once
> The chain ends with undefined if nothing has it.
? `const b = Object.create(a); b.x = 1;` What changes?
- a.x
+ b gets its own x
- Both change
> Writes create own properties on the target object.
? What is `Object.getPrototypeOf(Object.prototype)`?
- Object
+ null
- undefined
> The end of the chain.
```

:::keypoints
- Every object has a hidden `[[Prototype]]` link. Missing properties are looked up along this **chain** until `null`.
- Inheritance in JavaScript = **objects linked to objects**.
- **Reads** go up the chain. **Writes** go on the object (shadowing).
- Methods on a prototype are **shared**; `this` is the object before the dot.
- `Object.hasOwn` = own only; `in` = own + inherited; `for...in` includes inherited.
- `Object.create(null)` gives a prototype-free dictionary.
:::
