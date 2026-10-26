---
title: Closures in loops
level: intermediate
time: 25
summary: The most famous closure puzzle: why var in a loop prints the same number, and the four ways to fix it (let, a function wrapper, bind, forEach).
---

## The puzzle everyone is asked

```js run title="What does this print?"
for (var i = 0; i < 3; i++) {
  setTimeout(function () {
    console.log(i);
  }, 100);
}
```

Many people answer `0 1 2`. The real answer is **`3 3 3`**.

## Why?

1. `var i` is **one variable** for the whole function (or file). It is not made again in each round.
2. The loop runs three times, very fast, and schedules three timers. None of them runs yet.
3. When the loop ends, `i` is `3`.
4. 100 ms later, each callback runs. They all look at the **same** `i`, which is now `3`.

Remember: closures keep **variables, not values**. All three callbacks point to the same variable.

```viz algo=chain title="var: three callbacks, one variable"
node cb0 "callback 1" @0,0 [fn]
node cb1 "callback 2" @0,1 [fn]
node cb2 "callback 3" @0,2 [fn]
node env "Function / global environment" @1,1 [bad]
  i: 3
link cb0 -> env : reads i
link cb1 -> env : reads i
link cb2 -> env : reads i
```

## Fix 1: use `let` (the best fix)

`let` makes a **new `i` for every round** of the loop, so each callback gets its own.

```js run title="Fix 1: let"
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100);
}
```

```viz algo=chain title="let: each callback has its own variable"
node cb0 "callback 1" @0,0 [fn]
node cb1 "callback 2" @0,1 [fn]
node cb2 "callback 3" @0,2 [fn]
node e0 "Round 0 environment" @1,0 [ok]
  i: 0
node e1 "Round 1 environment" @1,1 [ok]
  i: 1
node e2 "Round 2 environment" @1,2 [ok]
  i: 2
link cb0 -> e0
link cb1 -> e1
link cb2 -> e2
```

## Fix 2: wrap the callback in a function (the old way)

Before `let`, people created a **new scope per round** with an IIFE. The function parameter `j` is a new variable each time, holding a **copy** of the current `i`.

```js run title="Fix 2: an IIFE (pre-ES2015)"
for (var i = 0; i < 3; i++) {
  (function (j) {
    setTimeout(function () { console.log(j); }, 100);
  })(i);                                   // pass the current value in
}
```

## Fix 3: pass the value as an argument

`setTimeout` can pass extra arguments to the callback. Or use `bind`.

```js run title="Fix 3: setTimeout's extra argument, or bind"
for (var i = 0; i < 3; i++) {
  setTimeout((n) => console.log("arg:", n), 100, i);
}

for (var k = 0; k < 3; k++) {
  setTimeout(function (n) { console.log("bind:", n); }.bind(null, k), 200);
}
```

## Fix 4: use an array method instead of a loop

`forEach`, `map` and friends call a function for each item, so every call gets its own parameter.

```js run title="Fix 4: forEach creates a new scope per item"
[0, 1, 2].forEach((i) => {
  setTimeout(() => console.log(i), 100);
});
```

## A twist: let, but the variable is changed later

`let` gives each round its own variable, but if code **changes** that variable after the closure is created, the closure sees the change.

```js run title="let does not freeze the value"
const fns = [];
for (let i = 0; i < 3; i++) {
  fns.push(() => i);
  i++;                                     // changes this round's i after the push
}
console.log(fns.map((f) => f()));
```

Here the loop only runs for `i = 0` and `i = 2` (because of the extra `i++`). Each closure sees the value **after** the change in its round: `[1, 3]`.

## Another twist: while loops with let inside

`let` inside the **body** is also new each round, so this is safe:

```js run title="let in the loop body"
const fns = [];
let n = 0;
while (n < 3) {
  const copy = n;                          // new variable in every round
  fns.push(() => copy);
  n++;
}
console.log(fns.map((f) => f()));
```

## Click handlers in the DOM

The same bug appears when adding handlers in a loop. Use `let` or `const`, or event delegation (one handler on the parent).

```html run preview height=110 title="Three buttons, each shows its own number"
<div id="row"></div>
<script>
  const row = document.getElementById("row");
  for (let i = 1; i <= 3; i++) {
    const btn = document.createElement("button");
    btn.textContent = "Button " + i;
    btn.onclick = () => console.log("clicked", i);
    row.appendChild(btn);
  }
  row.querySelectorAll("button").forEach((b) => b.click());   // simulate three clicks
</script>
```

:::interview Why does `var` in a loop with setTimeout print the same value? How do you fix it?
"`var` is function scoped, so the loop has one `i` shared by every callback. The callbacks run after the loop finishes, when `i` already has its final value, so they all print it. The best fix is `let`, which creates a new binding for each iteration. The older fixes are an IIFE that passes the value as a parameter, `bind`, `setTimeout`'s extra arguments, or using `forEach` so each call gets its own parameter."
:::

## More interview questions on this topic

:::qa What does `for (var i = 0; i < 3; i++) setTimeout(() => console.log(i))` print, and why? {level=easy}
**Say this:** "`3 3 3`. One shared `i` becomes 3 when the loop ends, and the timers run after that."

**In simple words:** The callbacks do not remember the number at the time. They remember the variable.
:::

:::qa How does `let` fix the loop closure problem? {level=medium}
**Say this:** "The spec creates a new environment for each iteration and copies the loop variable into it, so each closure has its own binding."

**In simple words:** `let` makes a new box for `i` in every round.
:::

:::qa Can you fix it without `let`? Show two ways. {level=medium}
**Say this:** "Yes. Wrap the body in an IIFE that takes `i` as a parameter, or use `bind` or the extra argument of `setTimeout`. `forEach` also works."

**In simple words:** Each of these makes a fresh variable that holds a copy of the current value.
:::

:::qa Does the problem exist with `for...of` and `const`? {level=medium}
**Say this:** "No. `for (const x of list)` creates a new binding for every iteration, so closures capture each item separately."

**In simple words:** `const` per round is allowed in `for...of` because each round is a new variable, not a re-assignment.
:::

```quiz
? What is printed? `for (let i = 0; i < 3; i++) setTimeout(() => console.log(i))`
+ 0 1 2
- 3 3 3
- 0 0 0
> let makes a separate i for each round.
? Why do all callbacks in the var version print the same number?
- The timers are all set to the same delay
+ They share one variable, which has its final value when they run
- var cannot be used in closures
> One variable, many readers.
? Which of these is NOT a fix for the var loop problem?
- Use let
- Wrap in an IIFE that takes i as a parameter
+ Increase the setTimeout delay
> A longer delay still reads the same shared variable.
```

:::keypoints
- `var` in a loop = **one shared variable**. Callbacks that run later all see the final value.
- `let` / `const` in the loop head = **a new binding per round**.
- Old fixes: IIFE with a parameter, `bind`, extra `setTimeout` argument, `forEach`.
- Closures capture **variables**: if the variable is changed later, the closure sees the new value.
:::
