---
title: Scope, shadowing and the scope chain
level: easy
time: 30
summary: Global, function, block and module scope, lexical (static) scope, how a variable is looked up through the scope chain, shadowing, and the classic scope puzzles.
---

## What is scope?

> "**Scope** decides **where a name can be seen**. If a variable is in scope, you can use it. If not, you get a `ReferenceError`."

:::analogy Rooms in a house
Your bedroom has its own cupboard. If you need a spoon and it is not there, you walk to the kitchen. If it is not in the kitchen, you check the whole house. You can **go outwards** to find things, but a guest in the hall cannot see inside your bedroom cupboard. Scopes work the same way: inner code can see outer variables, but outer code cannot see inner ones.
:::

## The kinds of scope

| Scope | Created by | Sees |
|---|---|---|
| **Global** | The top of a script | Visible everywhere in that script |
| **Module** | A file loaded as an ES module (or a Node file) | Visible in that file only |
| **Function** | A function body | Parameters, `var`, `let`, `const` inside |
| **Block** | `{ }` of `if`, `for`, `while`, plain blocks, `switch`, `try/catch` | `let`, `const`, `class` inside (not `var`) |

```js run title="Four scopes in one program"
const globalName = "global";          // module/global scope

function outer() {
  const outerName = "outer";          // function scope

  if (true) {
    const blockName = "block";        // block scope
    console.log(globalName, outerName, blockName);   // all three are visible
  }

  console.log(typeof blockName);      // not visible here
}

outer();
console.log(typeof outerName);        // not visible here
```

## Lexical scope: decided by where you write the code

JavaScript uses **lexical scope** (also called static scope). The scope of a variable is decided by **where the code is written**, not by where a function is called from.

```js run title="Lexical scope: written place wins, not the calling place"
const level = "global";

function printLevel() {
  return level;                       // looks at where printLevel was WRITTEN
}

function caller() {
  const level = "inside caller";      // a different variable
  return printLevel();                // calling from here does not change what printLevel sees
}

console.log(caller());
```

`printLevel` was written at the top, next to the global `level`. So it uses the global one, even when called from inside `caller`. (Languages with *dynamic scope*, like old Lisp or Bash functions, would print `"inside caller"`.)

## The scope chain

When JavaScript sees a name, it looks for it in the **current scope**. If it is not there, it looks in the **parent scope**, then the parent's parent, up to the global scope. If it reaches the end without finding it, you get a `ReferenceError`.

```viz algo=chain title="The scope chain for the innermost function"
node inner "inner() scope" @0,0 [hl]
  c: 3
node middle "middle() scope" @1,0
  b: 2
node outerScope "outer() scope" @2,0
  a: 1
node global "global scope" @3,0 [dim]
  x: 0
link inner -> middle : outer
link middle -> outerScope : outer
link outerScope -> global : outer
```

```js run title="Walk up the chain"
const x = 0;                           // global

function outer() {
  const a = 1;
  function middle() {
    const b = 2;
    function inner() {
      const c = 3;
      return [c, b, a, x];             // c: own scope, b: parent, a: grandparent, x: global
    }
    return inner();
  }
  return middle();
}

console.log(outer());
```

The lookup always goes **outwards**, never inwards or sideways. And it goes along the **lexical** chain (where the function is written).

## Shadowing

If an inner scope declares a variable with the **same name** as an outer one, the inner one **hides** (shadows) the outer one, but only inside that scope.

```js run title="Shadowing"
const name = "outer";

function show() {
  const name = "inner";               // shadows the outer name inside show()
  console.log(name);
}

show();
console.log(name);                    // the outer one is not changed
```

```js run title="Shadowing in a block"
let count = 10;

{
  let count = 20;                     // new variable, only inside this block
  count++;
  console.log("inside:", count);
}

console.log("outside:", count);
```

**Illegal shadowing:** you cannot shadow a `let` with a `var` in the same or an enclosing block, because `var` would "escape" to the outer scope and clash.

```js run title="Illegal shadowing" expect-error
function f() {
  let value = 1;
  {
    var value = 2;      // SyntaxError: the var would be hoisted into f's scope
  }
}
```

(The reverse, `var` outside and `let` inside a block, is legal.)

## Block scope surprises

### `if` and loops have blocks, but `var` ignores them

```js run title="var ignores blocks, let respects them"
for (var i = 0; i < 2; i++) { var inLoop = "var"; let hidden = "let"; }

console.log(i, inLoop);               // both still exist after the loop
console.log(typeof hidden);           // let stayed inside
```

### A function declared inside a block

In strict mode and modules, a function declaration in a block is **block scoped**. In sloppy mode it has odd legacy rules, so avoid defining functions in blocks, or assign them to a `const`.

### `catch` has its own scope

```js run title="catch (e): e only exists inside the catch block"
try {
  throw new Error("boom");
} catch (e) {
  console.log("caught", e.message);
}
console.log(typeof e);
```

## Scope and closures

A closure is just a function that **keeps its scope chain alive**. The chain you saw above is exactly what a closure remembers. The [closures module](#/m/closures) builds on this lesson.

## Scope puzzles

```js run title="Puzzle: which x?"
const x = "global";

function a() {
  const x = "a";
  function b() {
    console.log(x);               // looks in b, then a
  }
  return b;
}

a()();
```

```js run title="Puzzle: assignment goes up the chain too"
let total = 0;

function add(n) {
  total += n;                     // no local `total`, so the global one is changed
}

add(5);
add(7);
console.log(total);
```

:::tip Habit
Keep variables in the **smallest scope** that works. Small scopes mean fewer places a variable can be changed, and fewer bugs.
:::

:::interview Explain scope, lexical scope and the scope chain
"Scope decides where a variable is visible: global, module, function or block. JavaScript uses lexical scope, so the scope of a function is fixed by where it is written. When a name is used, the engine looks in the current scope, then goes outwards through the parent scopes, which is the scope chain, until it finds it or reaches the global scope and throws a ReferenceError. An inner variable with the same name shadows the outer one. `var` is function scoped, while `let` and `const` are block scoped."
:::

## More interview questions on this topic

:::qa What is the difference between scope and context? {level=medium}
**Say this:** "Scope is about where variables can be accessed (decided by where the code is written). Context is about the value of `this` (decided by how the function is called)."

**In simple words:** Scope answers "which variables can I see?". Context answers "what is `this`?". People mix them up, so say it clearly.
:::

:::qa What is lexical scope? How is it different from dynamic scope? {level=medium}
**Say this:** "In lexical scope, the variables a function can see are decided by where the function is written. In dynamic scope they would be decided by who calls it. JavaScript is lexical."

**In simple words:** A function carries its birthplace with it, not the place it is called from.
:::

:::qa What is variable shadowing? Is it a good idea? {level=easy}
**Say this:** "Shadowing is when an inner variable has the same name as an outer one and hides it. It is legal, but it can confuse readers, so avoid it unless it is deliberate."

**In simple words:** Inside the inner scope you cannot reach the outer variable any more, so choose different names.
:::

:::qa Does JavaScript have block scope? {level=easy}
**Say this:** "Yes for `let`, `const` and `class` (ES2015). No for `var`, which is function scoped."

**In simple words:** Before 2015 there was no block scope, so people used functions (IIFEs) to create one.
:::

```quiz
? What decides which variables a function can use?
- Where the function is called
+ Where the function is written (lexical scope)
- The value of this
> JavaScript has lexical scope.
? What happens if a name is not found anywhere in the scope chain?
- It becomes undefined
+ A ReferenceError is thrown
- It is created as a global (in strict mode)
> Reading an unknown name throws. (Assigning to one throws in strict mode too.)
? Which scope does `var` ignore?
- Function scope
+ Block scope
- Global scope
> var is function scoped, so a block does not contain it.
```

:::keypoints
- Scopes: **global, module, function, block**. `let`/`const`/`class` are block scoped, `var` is function scoped.
- **Lexical scope**: decided by where the code is written.
- The **scope chain**: lookup goes from the current scope outwards to the global scope, then a `ReferenceError`.
- **Shadowing**: an inner name hides an outer one. Legal, but use sparingly.
- Scope is about **which variables**; `this` is about **which object**. They are different.
:::
