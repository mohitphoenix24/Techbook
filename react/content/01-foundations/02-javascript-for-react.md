---
title: The JavaScript You Need for React
level: easy
time: 30
summary: The modern JavaScript React code uses on every line — const/let, arrow functions, template literals, destructuring, spread, map/filter/reduce, optional chaining, modules, promises and async/await.
---

React is "just JavaScript". Most confusion beginners have with React is actually confusion with modern JavaScript syntax. This lesson covers exactly the features you'll see in every component. The examples print to the **Console** panel.

## const, let and template literals

:::def const and let
`const` creates a variable that can't be **reassigned**; `let` creates one that can. Prefer `const` — in React most values never get reassigned (state changes go through setter functions instead). Avoid the old `var`.
:::

```js run level=easy
const model = "claude-opus-5-5";
let tokens = 100;
tokens = tokens + 50;          // fine: let can be reassigned
// model = "other";            // TypeError: Assignment to constant variable.

const name = "Ada";
console.log(`Hello ${name}, you used ${tokens} tokens on ${model}.`);   // template literal
console.log(`Multi-line
strings work too.`);
```

## Arrow functions

:::def Arrow function
A short way to write a function: `(a, b) => a + b`. With one expression, the result is returned automatically. React code uses them for event handlers, `map` callbacks and small helpers.
:::

```js run level=easy
function add(a, b) { return a + b; }        // classic function
const add2 = (a, b) => a + b;               // arrow: implicit return
const square = x => x * x;                  // one parameter: brackets optional
const makeMsg = (text) => ({ role: "user", content: text });   // return an object: wrap in ( )
const greet = (name) => {                   // with a body: explicit return
  const upper = name.toUpperCase();
  return `Hi ${upper}!`;
};
console.log(add(2, 3), add2(2, 3), square(9));
console.log(makeMsg("hello"));
console.log(greet("ada"));
```

## Objects and arrays

```js run level=easy
const message = { role: "assistant", content: "Hello!", tokens: 3 };
console.log(message.role, message["content"]);

const tags = ["ai", "react", "ml"];
console.log(tags[0], tags.length, tags.includes("react"));

const key = "tokens";
console.log(message[key]);                  // dynamic property access
```

## Destructuring

:::def Destructuring
Pulling values out of objects or arrays into variables in one step: `const { role, content } = message` or `const [first, second] = list`. React uses it constantly — for props and for `useState`.
:::

```js run level=easy
const message = { role: "assistant", content: "Hi there", usage: { input: 12, output: 5 } };

const { role, content } = message;                         // object destructuring
const { usage: { output } } = message;                     // nested
const { model = "claude-opus-5-5" } = message;             // default value if missing
console.log(role, content, output, model);

const [first, second, ...rest] = ["a", "b", "c", "d"];     // array destructuring + rest
console.log(first, second, rest);

// This is exactly what useState gives you:
const fakeUseState = (initial) => [initial, (v) => console.log("set to", v)];
const [count, setCount] = fakeUseState(0);
setCount(count + 1);

// And how props arrive in a component:
function Bubble({ text, from = "user" }) { return `${from}: ${text}`; }
console.log(Bubble({ text: "hello" }));
```

## Spread and rest

:::def Spread syntax (...)
Copies the items of an array or the properties of an object into a new one: `[...old, newItem]`, `{ ...old, done: true }`. React state must be **updated immutably** — you create new arrays/objects instead of changing old ones — and spread is how.
:::

```js run level=easy
const messages = [{ id: 1, text: "Hi" }];
const withNew = [...messages, { id: 2, text: "Hello!" }];      // add (new array)
console.log(messages.length, "→", withNew.length);              // the original is unchanged

const settings = { model: "claude-opus-5-5", maxTokens: 1024 };
const updated = { ...settings, maxTokens: 4096 };               // copy + override
console.log(settings.maxTokens, "→", updated.maxTokens);

const sum = (...nums) => nums.reduce((a, b) => a + b, 0);       // rest parameters
console.log(sum(1, 2, 3, 4));
```

## map, filter, reduce, find

These array methods are how you turn data into UI in React — `map` especially.

```js run level=easy
const msgs = [
  { id: 1, role: "user", text: "What is RAG?", tokens: 4 },
  { id: 2, role: "assistant", text: "Retrieval-Augmented Generation…", tokens: 40 },
  { id: 3, role: "user", text: "Thanks!", tokens: 2 },
];

console.log(msgs.map((m) => m.text));                               // transform each
console.log(msgs.filter((m) => m.role === "user").length);           // keep some
console.log(msgs.reduce((total, m) => total + m.tokens, 0));         // combine into one value
console.log(msgs.find((m) => m.id === 2).role);                      // first match
console.log(msgs.some((m) => m.tokens > 30), msgs.every((m) => m.tokens > 0));
console.log([...msgs].sort((a, b) => b.tokens - a.tokens).map((m) => m.id));   // sort a COPY

// Update one item immutably — the most common React pattern:
const edited = msgs.map((m) => (m.id === 3 ? { ...m, text: "Thank you!" } : m));
console.log(edited[2].text, "| original:", msgs[2].text);
// Remove one item immutably:
console.log(msgs.filter((m) => m.id !== 1).map((m) => m.id));
```

## Conditionals in expressions

```js run level=easy
const loading = false;
const error = null;
const user = { name: "Ada", plan: { name: "pro" } };

console.log(loading ? "Loading…" : "Ready");                 // ternary
console.log(error && "Something went wrong");                // && short-circuit (null here)
console.log(user?.plan?.name, user?.billing?.card);          // optional chaining: no crash
console.log(user.nickname ?? "no nickname");                 // ?? : default only for null/undefined
console.log(0 || "fallback", 0 ?? "fallback");               // || treats 0 as "missing", ?? doesn't
```

## Modules: import and export

:::def ES modules
Each file is a module. `export` makes things available to other files; `import` brings them in. React apps are many small module files.
:::

```js
// math.js
export const add = (a, b) => a + b;          // named export
export default function multiply(a, b) {     // default export (one per file)
  return a * b;
}

// App.jsx
import multiply, { add } from "./math.js";   // default + named
import { useState, useEffect } from "react"; // named exports from a package
```

## Promises and async/await

Talking to a server or an AI API takes time. JavaScript handles waiting with **promises**.

:::def Promise
An object representing a value that will arrive **later** (or an error). `await` pauses an `async` function until the promise settles, without freezing the page.
:::

```js run level=intermediate
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fakeLLM(prompt) {
  await sleep(300);                               // pretend network delay
  if (!prompt) throw new Error("empty prompt");
  return `Answer to "${prompt}"`;
}

async function main() {
  console.log("asking…");
  const answer = await fakeLLM("What is JSX?");
  console.log(answer);

  try {
    await fakeLLM("");
  } catch (err) {
    console.log("caught:", err.message);
  }

  const results = await Promise.all([fakeLLM("a"), fakeLLM("b"), fakeLLM("c")]);   // in parallel
  console.log(results);
}
main();
```

### fetch

```js
// GET JSON from an API
const res = await fetch("https://api.example.com/items");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const items = await res.json();

// POST JSON to your own backend
const reply = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
});
```

:::warn Never put API keys in front-end code
Anything in browser JavaScript can be read by anyone. Your React app should call **your own backend**, which holds the `ANTHROPIC_API_KEY` and calls the model. (The AI Interfaces module shows this pattern.)
:::

## Classes, this and other things you'll rarely need

Modern React uses **function components**, so you'll rarely write `class` or worry about `this`. The one exception is **error boundaries** (covered in Modern React 19).

## Check yourself

```quiz
? How do you add an item to a state array the React way?
+ setItems([...items, newItem])
- items.push(newItem)
- items[items.length] = newItem
> React needs a NEW array; push mutates the old one, so React may not re-render.

? What does `const { name } = user` do?
+ Creates a variable `name` from `user.name`
- Renames user to name
- Copies the whole user object
> That's object destructuring.

? What does `user?.address?.city` return if `address` is missing?
+ undefined (no error)
- An error
- An empty string
> Optional chaining stops safely at the missing part.

? Why do React apps use `map` so much?
+ To turn arrays of data into arrays of UI elements
- To create maps for geography apps
- Because loops are not allowed in JavaScript
> {items.map(item => <Item key={item.id} {...item} />)}
```

:::exercise Data transformation
Given `const orders = [{ id: 1, total: 30, paid: true }, { id: 2, total: 55, paid: false }, { id: 3, total: 20, paid: true }]`, use `filter`, `map` and `reduce` to log: the ids of paid orders, the total revenue from paid orders, and a new array where order 2 is marked `paid: true` (without changing the original).
:::

:::solution
```js run
const orders = [{ id: 1, total: 30, paid: true }, { id: 2, total: 55, paid: false }, { id: 3, total: 20, paid: true }];

const paid = orders.filter((o) => o.paid);
console.log(paid.map((o) => o.id));
console.log(paid.reduce((sum, o) => sum + o.total, 0));
const updated = orders.map((o) => (o.id === 2 ? { ...o, paid: true } : o));
console.log(updated, "original still unpaid:", orders[1].paid);
```
:::

:::keypoints
- Prefer `const`; use template literals and arrow functions.
- **Destructuring** unpacks props and `useState`; **spread** copies arrays/objects for immutable updates.
- `map` (render lists), `filter` (remove), `reduce` (totals) and `find` are everyday tools.
- `?.`, `??`, ternaries and `&&` make conditional logic concise.
- `async/await` + `fetch` talk to servers; never ship secret keys in front-end code.
:::
