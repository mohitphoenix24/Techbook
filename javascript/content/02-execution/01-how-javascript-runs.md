---
title: How JavaScript runs your code
level: easy
time: 20
summary: The engine, the runtime, why JavaScript has one thread, and what "single-threaded" means for your code. The picture you need before closures, the event loop or this.
---

## The one-chef kitchen

Imagine a small restaurant with **one chef**. The chef can cook only one dish at a time. Orders wait in a line. While a pizza is in the oven, the chef does not stand and stare at it. The chef starts the next dish, and a timer tells them when the pizza is ready.

JavaScript works like this.

- The **chef** is the JavaScript engine's single thread. It runs one piece of code at a time.
- The **oven timer** is a helper outside the chef: the browser or Node.js does the waiting (timers, network, files).
- The **line of orders** is the set of queues that hold callbacks until the chef is free.

Everything about async JavaScript, the event loop, and "why did my page freeze" comes from this one picture.

## Engine and runtime are not the same thing

:::def Engine
The program that reads your JavaScript and runs it. Chrome and Node.js use **V8**. Firefox uses **SpiderMonkey**. Safari uses **JavaScriptCore**.
:::

:::def Runtime (host environment)
The engine **plus** extra features around it. The browser adds the DOM, `fetch`, `setTimeout`, `localStorage`. Node.js adds `fs`, `http`, `process`, `Buffer`. These are **not** part of the JavaScript language.
:::

This difference is a common interview question. `setTimeout` is **not** in the JavaScript language (ECMAScript). It is given to the language by the browser or by Node.

```js run title="Where do these come from?"
// Part of the language itself (always there):
console.log(typeof Promise, typeof Map, typeof Symbol);

// Added by the host. Node and browsers both provide these names,
// but they are not in the ECMAScript specification:
console.log(typeof setTimeout, typeof console);

// Only in browsers (not here): document, window, fetch (Node 18+ has fetch too)
console.log(typeof document);
```

## What the engine does with your code

```viz algo=arch title="From source text to running code (V8)"
src Source code [file]
parser Parser [gateway]
ast AST [list]
ign Ignition (bytecode) [service]
tf TurboFan (optimiser) [fn]
cpu Machine code [cache]
src -> parser : text
parser -> ast : syntax tree
ast -> ign : compile
ign -> tf : hot code
tf -> cpu : optimise
cpu ~> ign : de-optimise
```

1. The **parser** reads the text and builds a tree (the AST). A syntax error is found here, before any code runs.
2. **Ignition** turns the tree into small bytecode instructions and starts running them quickly.
3. Code that runs many times ("hot" code) is sent to **TurboFan**, which makes fast machine code. This is **JIT** (just-in-time) compilation.
4. If a guess made by the optimiser turns out wrong (for example, a function that always got numbers suddenly gets a string), the engine **de-optimises** and goes back to bytecode.

So is JavaScript "interpreted" or "compiled"? **Both.** Modern engines compile it just in time. The best interview answer is: "It is compiled JIT, but we program it as if it is interpreted."

## One thread, one call stack

JavaScript has **one call stack**. A function call is pushed on the stack. When it returns, it is popped. Only the function at the top runs.

Because there is only one stack, **a long task blocks everything else**: other callbacks, clicks, timers, even screen painting in the browser.

```js run title="A busy loop blocks the timer"
const start = Date.now();

setTimeout(() => {
  console.log("timer callback ran");
}, 0);

// Block the only thread for about 200 ms
while (Date.now() - start < 200) { /* busy waiting */ }

console.log("loop finished, 200 ms passed:", Date.now() - start >= 200);
```

The timer was set for `0` ms, yet it ran **after** the loop. The timer's callback could not interrupt the chef. It waited for the stack to become empty. A `0` timer means "as soon as possible, but not before the current code finishes".

:::warn Common mistake
Thinking `setTimeout(fn, 0)` runs `fn` immediately. It never does. It runs after the current synchronous code, and after all pending microtasks.
:::

## Single-threaded, but not "one thing at a time" overall

JavaScript runs **one piece of your code** at a time. But the browser or Node does many things in parallel in the background: network requests, file reads, timers, and (in Node) a thread pool for some work. When they finish, they put a callback in a queue. The event loop gives it to the single thread when it is free.

```js run title="Waiting does not block"
console.log("order placed");

setTimeout(() => console.log("pizza ready (after 100 ms)"), 100);
setTimeout(() => console.log("garlic bread ready (after 50 ms)"), 50);

console.log("chef is free to take the next order");
```

Both waits happen **at the same time** in the background, so the total is about 100 ms, not 150. That is why Node.js can serve thousands of connections with one thread, as long as each request mostly waits for I/O.

## What blocks, and what does not

| Blocks the thread | Does not block (async) |
|---|---|
| A big `for` loop, heavy maths | `setTimeout`, `setInterval` |
| `JSON.parse` of a huge string | `fetch`, network calls |
| `fs.readFileSync` in Node | `fs.readFile` / `fs/promises` |
| A regex with catastrophic backtracking | `await` on a promise |
| `alert()` in the browser | reading from a stream |

:::interview Is JavaScript single-threaded? How does it handle many things at once?
"Yes. One call stack runs one piece of JavaScript at a time. But the runtime, the browser or Node, does slow work like timers, network and file I/O outside the stack, and puts callbacks in queues. The event loop moves them to the stack when it is empty. So JavaScript is concurrent through the event loop, not parallel through threads. For heavy CPU work, I would use a Web Worker or a Node worker thread."
:::

## More interview questions on this topic

:::qa Is JavaScript interpreted or compiled? {level=easy}
**Say this:** "Both. Modern engines like V8 parse the code, run bytecode in an interpreter, and compile hot code to machine code just in time (JIT)."

**In simple words:** The old idea "JavaScript is interpreted" is half true. V8 starts with an interpreter (Ignition) so your code runs soon, then optimises the busy parts (TurboFan). If its guesses fail, it falls back.
:::

:::qa What is the difference between a JavaScript engine and a runtime? {level=easy}
**Say this:** "The engine runs the language (V8). The runtime is the engine plus host APIs like timers, `fetch`, the DOM or `fs`, and the event loop."

**In simple words:** `Array` and `Promise` come from the language. `setTimeout` and `document` come from the browser. `fs` and `process` come from Node.
:::

:::qa Why is JavaScript single-threaded, and what does it cost us? {level=medium}
**Say this:** "It was designed for the browser, where many threads changing the DOM would be unsafe. One thread means no data races in your code, but a long task blocks everything."

**In simple words:** Fewer bugs from locks and shared memory. The price is that you must never block the thread: split long work, use async APIs, or use workers.
:::

:::qa Why does `setTimeout(fn, 0)` not run right away? {level=easy}
**Say this:** "Because the callback goes to the task queue. It runs only after the current code and all microtasks finish. Also, browsers apply a minimum delay for nested timers."

**In simple words:** The timer's delay is a minimum wait, not a promise of exact time. If the thread is busy, the callback just waits.
:::

```quiz
? Which of these is NOT part of the JavaScript language itself?
- Promise
- Map
+ setTimeout
- Symbol
> setTimeout is given by the host (browser or Node). Promise, Map and Symbol are in the ECMAScript language.
? A loop runs for 3 seconds on the main thread. What happens to a button click during that time?
- It runs at once in a second thread
+ It waits until the loop ends
- It is lost forever
> One thread: the click handler is queued and runs when the stack is empty.
? What does JIT compilation mean?
- Compiling the whole program before it starts
+ Compiling hot code to machine code while the program runs
- Interpreting every line again and again
> Engines like V8 optimise the code that runs often, at run time.
```

:::keypoints
- The **engine** runs the language. The **runtime** adds timers, I/O, DOM or `fs`, and the event loop.
- JavaScript has **one call stack**: one piece of your code runs at a time.
- Slow work (timers, network, files) happens outside the stack. Callbacks wait in queues.
- A long synchronous task **blocks** everything. Do not block the thread.
- V8 uses JIT: bytecode first, optimised machine code for hot code, de-optimise if a guess fails.
:::
