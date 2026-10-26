---
title: Closures with timers, callbacks and promises
level: intermediate
time: 25
summary: How callbacks, setTimeout, promises and event handlers use closures to remember context, and the traps: late values, shared state and "last one wins".
---

## Why closures and async belong together

Async code means "do this **later**". Later, the code that started the work has usually moved on. The callback needs a way to remember **where it came from**: which user, which request, which button. A closure is that memory.

```js run title="A callback remembers its context"
function fetchUser(id, callback) {
  setTimeout(() => {
    callback({ id, name: "User " + id });         // `id` comes from the closure
  }, 50);
}

function showUser(id) {
  const label = `[request for ${id}]`;            // local to showUser

  fetchUser(id, (user) => {
    console.log(label, "got", user.name);         // the callback still sees `label`
  });
}

showUser(1);
showUser(2);
```

`showUser(1)` has already returned when its callback runs, but `label` is still there, **separately for each call**.

## setTimeout and the value you read later

The callback reads the variable **when it runs**, not when it was created.

```js run title="The value is read when the callback runs"
let status = "waiting";

setTimeout(() => console.log("status is", status), 0);   // reads later

status = "done";                                          // changes before the timer fires
```

If you want the value **at the time of the call**, copy it into a new variable first:

```js run title="Capture the value right now"
let status = "waiting";

const snapshot = status;                                  // copy now
setTimeout(() => console.log("snapshot:", snapshot, "| live:", status), 0);

status = "done";
```

## Promises and async/await use closures too

Each `.then` callback and every line after an `await` is a closure over the variables of the surrounding function.

```js run title="await keeps local variables alive"
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function order(item) {
  const started = Date.now();                // lives across the awaits
  const price = await wait(30, 100);
  const tax = await wait(30, price * 0.18);
  console.log(item, "total:", price + tax, "| waited long enough:", Date.now() - started >= 50);
}

order("book");
order("pen");
```

Both calls run **at the same time**, and each has its own `item`, `price` and `tax`. That is closures again: each call to `order` makes its own environment, and the `await` keeps it alive until the function continues.

## The "last one wins" trap (race with shared state)

A shared variable plus async calls can give the wrong answer when responses arrive out of order.

```js run title="A race: slower request finishes last, but is it the right one?"
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let shown = "";                                      // shared state

async function search(text, ms) {
  await delay(ms);                                   // pretend: network time
  shown = `results for "${text}"`;                   // the last response to arrive wins
}

search("ja", 80);                                    // the older search is slower
search("jav", 20);                                   // the newer search is faster

setTimeout(() => console.log(shown), 150);           // shows the OLD search: a classic bug
```

The user typed "jav" last, but the screen shows results for "ja". The fix is to remember **which request is latest** (a counter or an `AbortController`), also with a closure:

```js run title="Fix: ignore stale responses"
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let shown = "";
let latest = 0;                                      // id of the newest request

async function search(text, ms) {
  const myId = ++latest;                             // captured by this call only
  await delay(ms);
  if (myId !== latest) return;                       // a newer search exists: drop this answer
  shown = `results for "${text}"`;
}

search("ja", 80);
search("jav", 20);

setTimeout(() => console.log(shown), 150);
```

## Event handlers and removing them

An event handler is a closure. To remove it, you need the **same function object**.

```js run title="Event handlers are closures" 
const { EventEmitter } = require("node:events");
const bus = new EventEmitter();

function watch(name) {
  let count = 0;                                     // private to this watcher
  const handler = () => { count++; console.log(name, "saw", count, "event(s)"); };
  bus.on("tick", handler);
  return () => bus.off("tick", handler);             // returns an "unsubscribe" closure
}

const stopA = watch("A");
const stopB = watch("B");

bus.emit("tick");
stopA();                                             // A unsubscribes
bus.emit("tick");
```

Returning an **unsubscribe function** is a very common pattern in Redux, RxJS, React effects and event libraries. It works because the returned closure remembers the `handler`.

:::warn Common mistake: a different function on remove
`el.removeEventListener("click", () => ...)` does **nothing**, because the arrow function you pass is a new object, not the one you added. Keep a reference to the handler.
:::

## A small rule for async code

> Any variable that a callback uses is **alive until the callback runs**. If it is large (a big array, a DOM tree, a response body), the memory stays too. And if the variable changes, the callback sees the change.

:::interview How do closures work with asynchronous code? Give an example of a bug.
"Callbacks, `.then` handlers and the code after `await` are closures, so they remember the variables of the function that started the async work. That is how each call keeps its own context. The bugs come from sharing: a `var` loop variable or a shared outer variable is read when the callback finally runs, not when it was created. A real example is search-as-you-type where a slow old response overwrites a newer one. I fix it by capturing a request id in the closure and ignoring stale responses, or by aborting the old request with an AbortController."
:::

## More interview questions on this topic

:::qa Why do async callbacks still have access to the variables of a function that already returned? {level=easy}
**Say this:** "Because they are closures. They keep a reference to the outer environment, which lives on the heap."

**In simple words:** The function ended, but its notebook was kept, because the callback still holds it.
:::

:::qa How do you make sure a callback uses the value from the time it was scheduled, not a later one? {level=medium}
**Say this:** "Copy the value into a new `const` before scheduling, or pass it as an argument, so the callback closes over its own variable."

**In simple words:** Take a photo of the value instead of pointing to the live one.
:::

:::qa Why does `removeEventListener` not work with an inline arrow function? {level=easy}
**Say this:** "It compares function identity. Each arrow function expression is a new object, so the one you try to remove is not the one you added."

**In simple words:** Save the handler in a variable and use that same variable for both calls.
:::

:::qa How do you handle out-of-order responses in a search box? {level=hard}
**Say this:** "Keep a request id (or an AbortController) in the closure. When a response comes back, ignore it if a newer request has started. Combined with debouncing, this removes stale results."

**In simple words:** Only the answer to the latest question is allowed to update the screen.
:::

```quiz
? A callback reads a variable `x`. When does it read the value?
- When the callback is created
+ When the callback runs
- When the program starts
> The closure holds the variable, so it sees the value at run time.
? What does a returned "unsubscribe" function rely on?
- A global variable
+ A closure that remembers the handler
- The event loop
> The returned function closes over the handler it must remove.
? Why can "last response wins" be a bug?
- Responses are always in order
+ A slow old response can arrive after a newer one and overwrite it
- Promises cannot be raced
> Network timing is not guaranteed to match the order of requests.
```

:::keypoints
- Async callbacks use closures to remember **context** (ids, labels, DOM nodes).
- The callback reads shared variables **when it runs**, so changes in between are visible.
- Copy a value into a new `const` to freeze it for a callback.
- Fix races with a **request id** in a closure, or `AbortController`.
- To remove a listener, keep the **same function object**. Returning an unsubscribe closure is a common pattern.
:::
