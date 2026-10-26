---
title: Function forms and parameters
level: easy
time: 25
summary: Declaration vs expression vs arrow vs method, named function expressions, IIFE, default, rest and destructured parameters, the arguments object, and how arguments are passed (by sharing).
---

## The ways to write a function

```js run title="Seven forms of the same idea"
// 1. function declaration (hoisted)
function add1(a, b) { return a + b; }

// 2. function expression (not hoisted)
const add2 = function (a, b) { return a + b; };

// 3. named function expression (the name is visible only inside)
const add3 = function sum(a, b) { return a + b; };

// 4. arrow function
const add4 = (a, b) => a + b;

// 5. method shorthand in an object
const math = { add5(a, b) { return a + b; } };

// 6. class method
class Calc { add6(a, b) { return a + b; } }

// 7. IIFE: define and call at once
const result = (function (a, b) { return a + b; })(2, 3);

console.log(add1(1, 2), add2(1, 2), add3(1, 2), add4(1, 2), math.add5(1, 2), new Calc().add6(1, 2), result);
console.log(add2.name, add3.name, add4.name);
```

| Form | Hoisted? | Own `this`? | `new`-able? | Typical use |
|---|---|---|---|---|
| Declaration | Yes (fully) | yes | yes | Top-level helpers |
| Expression | No (variable rules) | yes | yes | Callbacks, conditional definitions |
| Arrow | No | **no** | **no** | Short callbacks |
| Method shorthand | No | yes | **no** | Object and class methods |
| Generator `function*` | like declaration | yes | no | Lazy sequences |
| Async `async function` | like declaration | yes | no | Promises |

## Named function expressions

A name on a function **expression** is visible **only inside** that function. It is useful for recursion and for clear stack traces.

```js run title="Named function expression"
const factorial = function fact(n) {
  return n <= 1 ? 1 : n * fact(n - 1);     // fact is visible inside only
};

console.log(factorial(5));
console.log(typeof fact);                   // not visible outside
```

## IIFE: Immediately Invoked Function Expression

```js run title="IIFE: a private scope, and also async IIFE"
const counter = (() => {
  let count = 0;                            // private
  return { next: () => ++count };
})();
console.log(counter.next(), counter.next());

(async () => {                              // an async IIFE (before top-level await existed)
  const value = await Promise.resolve("loaded");
  console.log(value);
})();
```

## Parameters

### Default parameters

```js run title="Default values"
function connect(host = "localhost", port = 5432, { ssl = false } = {}) {
  return `${host}:${port} ssl=${ssl}`;
}

console.log(connect());
console.log(connect("db.prod", undefined, { ssl: true }));     // undefined triggers the default
console.log(connect("db", null));                              // null does NOT: it is a value
```

Defaults are evaluated **at call time**, left to right, and can use earlier parameters:

```js run title="Defaults are evaluated on each call"
let calls = 0;
const next = () => ++calls;

function f(a = next(), b = a * 10) { return [a, b]; }
console.log(f(), f(), f(7));
```

### Rest parameters

```js run title="Rest: collect the remaining arguments into a real array"
function sum(first, ...others) {
  return others.reduce((total, n) => total + n, first);
}
console.log(sum(1), sum(1, 2, 3, 4));

const [head, ...tail] = [1, 2, 3];
console.log(head, tail);
```

### Destructured parameters

```js run title="Named options with destructuring"
function createUser({ name, age = 18, role = "user" } = {}) {
  return { name, age, role };
}

console.log(createUser({ name: "Asha" }));
console.log(createUser({ name: "Ravi", role: "admin", age: 30 }));
console.log(createUser());
```

Passing **one options object** is easier to read than five positional arguments, and order does not matter.

## The `arguments` object

In normal functions (not arrows) there is an **array-like** object called `arguments`. Today, use rest parameters instead.

```js run title="arguments vs rest"
function old() {
  console.log(arguments.length, Array.isArray(arguments));    // array-like, not a real array
  return Array.from(arguments).join("-");
}
function modern(...args) {
  return args.join("-");                                      // a real array
}
console.log(old(1, 2, 3), modern(1, 2, 3));
```

In **sloppy** mode, `arguments` is **linked** to the named parameters (changing one changes the other). Strict mode removes that link.

```js run sloppy title="arguments is linked in sloppy mode (a legacy quirk)"
function link(a) {
  arguments[0] = "changed through arguments";
  return a;
}
console.log(link("original"));
```

## How arguments are passed: by sharing

JavaScript passes **a copy of the reference**. This is sometimes called "call by sharing":

- **Primitives** (numbers, strings, booleans): the function gets a copy. Changing it inside does not affect the caller.
- **Objects** (including arrays): the function gets a copy of the **reference** to the same object. **Mutating** it is visible outside. **Re-assigning** the parameter is not.

```js run title="Mutation vs re-assignment"
function change(num, obj, arr) {
  num = 100;                  // changes only the local copy
  obj.changed = true;         // mutates the shared object
  arr = [9, 9, 9];            // re-assigns the local variable: the caller's array is untouched
}

let n = 1;
const o = { changed: false };
const a = [1, 2, 3];
change(n, o, a);
console.log(n, o, a);
```

## Function parameters and scope

Default parameters create their **own scope**. A body variable with the same name as a default's variable does not leak back:

```js run title="Parameter scope"
const x = "outer";
function f(a = x) {
  const x = "inner";          // a separate scope from the parameter list
  return a;
}
console.log(f());
```

:::interview What are the differences between a function declaration, a function expression and an arrow function?
"A declaration is hoisted with its body, so I can call it before it appears. An expression is a value assigned to a variable, so it follows that variable's hoisting rules and is not available early. An arrow function is a shorter expression that has no own `this`, `arguments`, or `prototype`, and cannot be used with `new`; it is best for callbacks. Named function expressions have a name that is visible only inside, which helps recursion and stack traces."
:::

## More interview questions on this topic

:::qa What are rest parameters and how are they different from `arguments`? {level=easy}
**Say this:** "Rest parameters (`...args`) collect the extra arguments into a real array, work in arrow functions, and make the intent clear. `arguments` is an array-like object that only normal functions have."

**In simple words:** Rest gives you a proper array. `arguments` gives you a half-array.
:::

:::qa Does JavaScript pass by value or by reference? {level=medium}
**Say this:** "By value, where the value of an object variable is a reference. So the function gets a copy of the reference: it can mutate the object, but re-assigning the parameter does not change the caller's variable."

**In simple words:** You get a copy of the address, not the house. You can change the house, but changing your copy of the address does not move the original.
:::

:::qa When is a default parameter used? Is `null` replaced? {level=easy}
**Say this:** "Only when the argument is `undefined` or missing. `null`, `0`, `''` and `false` are real values and are kept."

**In simple words:** Default means "nothing was given".
:::

:::qa Why name a function expression? {level=medium}
**Say this:** "The name shows in stack traces, and it is visible inside the function for recursion or self-reference, even if the variable is later reassigned."

**In simple words:** Easier debugging and safe self-calls.
:::

```quiz
? What does `((a, b = 2) => a + b)(1, null)` return?
- 3
+ 1
- NaN
> null is a value, so b is null: 1 + null = 1.
? What is the type of `arguments`?
- Array
+ An array-like object
- String
> It has length and indexes, but not array methods.
? A function receives an array and does `arr.push(1)`. What happens to the caller's array?
- Unchanged
+ It is changed, because both point to the same array
- An error
> The reference is shared.
```

:::keypoints
- Forms: declaration (hoisted), expression, **arrow** (no own this), method, generator, async, IIFE.
- Defaults apply on `undefined` only. **Rest** gives a real array. Use **destructured options** for many parameters.
- Prefer rest over `arguments`.
- Arguments are passed **by sharing**: mutation is visible, re-assignment is not.
:::
