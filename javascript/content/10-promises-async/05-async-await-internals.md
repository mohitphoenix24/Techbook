---
title: async/await: how it really works
level: intermediate
time: 35
summary: What an async function returns, what await does step by step, how async/await is built on promises and generators (with a tiny co-style runner), and the rules about return, throw and top-level await.
---

## `async` and `await` in one minute

```js run title="The basics"
async function getGreeting() {
  return "hello";                          // the value is wrapped in a promise automatically
}

console.log(getGreeting() instanceof Promise);    // true: a Promise, not "hello"
getGreeting().then((v) => console.log(v));

async function main() {
  const text = await getGreeting();        // pause here until the promise settles
  console.log("main got:", text);
}
main();
```

Two rules:

1. An **`async` function always returns a promise**. A returned value becomes a fulfilled promise; a thrown error becomes a rejected promise.
2. **`await`** can be used **inside an async function** (and at the top level of ES modules). It **pauses that function** until the promise settles, then gives you the value (or **throws** the rejection reason).

## What `await` does, step by step

```js
async function demo() {
  console.log("A");
  const x = await somePromise;   // 1. evaluate somePromise (wrap non-promises with Promise.resolve)
  console.log("B", x);           // 4. resume here, as a microtask
}
// 2. demo() returns its own promise to the caller right away
// 3. the thread is free; when somePromise settles, a microtask is queued to resume demo
```

- Code **before** the first `await` runs **synchronously**.
- `await` hands control back to the **caller** (the function returns its promise to the caller).
- The code **after** `await` runs later, as a **microtask**.
- If the awaited promise **rejects**, the `await` expression **throws** at that point, so `try/catch` works.

```js run title="await pauses only this function"
async function slow() {
  console.log("slow: start");
  await new Promise((r) => setTimeout(r, 30));
  console.log("slow: resumed after the wait");
  return "slow result";
}

slow().then((v) => console.log("then got:", v));
console.log("the caller continues immediately");
```

## async/await is syntax over promises (and generators)

This code:

```js
async function load() {
  const user = await getUser();
  const posts = await getPosts(user.id);
  return posts.length;
}
```

is roughly the same as:

```js
function load() {
  return getUser().then((user) => getPosts(user.id)).then((posts) => posts.length);
}
```

And internally, engines treat an async function like a **generator** that **yields** each awaited promise to a small runner, which resumes it when the promise settles. You can build a mini version yourself:

```js run title="A tiny async/await built from generators (the 'co' idea)"
function run(generatorFn) {
  return new Promise((resolve, reject) => {
    const gen = generatorFn();

    function step(method, arg) {
      let result;
      try {
        result = gen[method](arg);                         // resume the generator
      } catch (err) {
        return reject(err);                                // it threw
      }
      if (result.done) return resolve(result.value);       // finished: return value
      Promise.resolve(result.value).then(                  // result.value is the "awaited" promise
        (v) => step("next", v),                            // success: send the value back in
        (e) => step("throw", e),                           // failure: throw into the generator
      );
    }
    step("next");
  });
}

const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

// "yield" plays the role of "await"
run(function* () {
  const a = yield wait(20, 10);
  const b = yield wait(20, 5);
  try {
    yield Promise.reject(new Error("boom"));
  } catch (e) {
    console.log("caught inside:", e.message);
  }
  return a + b;
}).then((total) => console.log("total:", total));
```

That is almost exactly how async functions were compiled before native support (Babel, `regenerator`, the `co` library).

## Return and throw

```js run title="return resolves, throw rejects"
async function good() { return 42; }
async function bad() { throw new Error("nope"); }
async function returnsPromise() { return Promise.resolve("inner"); }       // the promise is unwrapped

good().then((v) => console.log("good:", v));
bad().catch((e) => console.log("bad:", e.message));
returnsPromise().then((v) => console.log("returnsPromise:", v));
```

## `return await` vs `return` inside `try/catch`

```js run title="return vs return await in a try block"
async function fails() { throw new Error("inner failure"); }

async function withoutAwait() {
  try {
    return fails();                // the promise is returned: the try/catch does NOT see the rejection
  } catch (e) {
    return "handled in withoutAwait";
  }
}

async function withAwait() {
  try {
    return await fails();          // awaited inside the try: the catch handles it
  } catch (e) {
    return "handled in withAwait";
  }
}

withoutAwait().then(console.log, (e) => console.log("withoutAwait rejected:", e.message));
withAwait().then(console.log);
```

Rule: **inside a `try` block, use `return await`** if you want the `catch` or `finally` to apply to that promise. Outside `try`, plain `return promise` is fine (and slightly cheaper).

## Awaiting things that are not promises

```js run title="await works on any value, and on thenables"
(async () => {
  console.log(await 5);                                    // wraps with Promise.resolve(5)
  console.log(await { then(res) { res("thenable value"); } });
  console.log(await null);
})();
```

`await 5` still **pauses** and resumes in a microtask. It is a way to "yield to microtasks".

## Top-level await

In an **ES module** (a `.mjs` file, or `"type": "module"`, or `<script type="module">`) you can use `await` at the top level, outside any function:

```js run esm title="Top-level await in an ES module (Node only)"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("before");
await sleep(20);
console.log("after, with no async function around it");

const data = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);
console.log(data);
```

(The examples in this course run inside an async wrapper, so top-level `await` works everywhere here.) It is **not** available in CommonJS. Note that a module with top-level await **delays the modules that import it**.

## Async functions in classes, callbacks and IIFEs

```js run title="Where async is allowed"
class Api {
  async load() { return "loaded"; }                          // async method
  static async create() { return new Api(); }               // async static
  // constructor cannot be async: use a static async factory instead
}

const arrow = async (x) => x * 2;                            // async arrow
[1, 2].map(async (n) => n * 10);                              // returns an array of promises, not numbers

(async () => {
  const api = await Api.create();
  console.log(await api.load(), await arrow(21), await Promise.all([1, 2].map(async (n) => n * 10)));
})();
```

## Common beginner questions

| Question | Answer |
|---|---|
| Does `await` block the thread? | **No.** It pauses only the async function. |
| Can I use `await` in a normal function? | **No.** It is a syntax error (outside modules' top level). |
| Does an async function run in another thread? | **No**, the same thread, until the first `await`. |
| What if I forget `await`? | You get a **Promise object** instead of the value. |
| Does `async` make code faster? | **No.** It only changes how waiting is written. |

:::interview How does async/await work under the hood?
"An async function always returns a promise. It runs synchronously until the first `await`. At `await`, the awaited value is converted to a promise, the function is paused and control goes back to the caller; when the promise settles, the rest of the function is resumed as a microtask, with the value, or with a thrown error if it rejected. It is syntax over promises, and conceptually a generator driven by a runner that resumes it on every settled promise, which is how Babel and `co` compiled it before native support. Because the error is thrown at the `await`, `try/catch` works."
:::

## More interview questions on this topic

:::qa What does an async function return? {level=easy}
**Say this:** "Always a promise. A returned value fulfils it; a thrown error rejects it. Returning a promise makes the outer promise follow it."

**In simple words:** The result is always wrapped in a promise.
:::

:::qa What happens if you forget `await`? {level=easy}
**Say this:** "You get the promise object instead of its value, and the code continues without waiting. Errors may become unhandled rejections."

**In simple words:** You hold the token, not the food.
:::

:::qa Why use `return await` inside a `try` block? {level=hard}
**Say this:** "Without `await`, the promise is returned directly and leaves the function, so a rejection happens outside the `try` and is not caught by the `catch`. With `await`, the rejection is thrown inside the `try`."

**In simple words:** `await` keeps the promise inside the safety net.
:::

:::qa Can a constructor be async? How do you handle async initialisation? {level=medium}
**Say this:** "No. A constructor must return the instance. I use a static async factory method (`static async create()`) that does the async work and then returns `new Class(data)`, or an `init()` method."

**In simple words:** Build the object after the data arrives, not before.
:::

```quiz
? What does `async function f() { return 1; }` return when called?
- 1
+ A Promise that fulfils with 1
- undefined
> Async functions always return promises.
? In `try { return fails(); } catch {}` where fails() is async and rejects, is the catch used?
- Yes
+ No, because the promise is returned without await
- Only in Node
> Use `return await fails()` to have the catch handle it.
? Where does the code after `await` run?
- Immediately
+ As a microtask after the awaited promise settles
- In another thread
> The function resumes through the microtask queue.
```

:::keypoints
- `async` functions **always return a promise**. `return` fulfils, `throw` rejects.
- `await` **pauses only that function** and resumes in a **microtask**; code before the first `await` is synchronous.
- async/await is **syntax over promises** (conceptually generators plus a runner).
- Inside `try`, use **`return await`** so `catch`/`finally` apply. Constructors cannot be async: use a static factory.
- Top-level `await` works only in ES modules.
:::
