---
title: Generators
level: intermediate
time: 30
summary: Functions that can pause and resume: function*, yield, next(value), yield*, return and throw, two-way communication, and practical uses (lazy sequences, ids, state machines, cooperative tasks).
---

## A function that can pause

A normal function runs from start to end. A **generator function** (`function*`) can **pause** at `yield` and be **resumed** later, keeping its local variables.

```js run title="Your first generator"
function* greetings() {
  console.log("generator starts");
  yield "hello";
  console.log("resumed after the first yield");
  yield "namaste";
  console.log("resumed after the second yield");
  return "done";
}

const gen = greetings();                  // NOTHING runs yet: it only creates a generator object
console.log("created");

console.log(gen.next());                  // runs until the first yield
console.log(gen.next());                  // resumes, runs until the second yield
console.log(gen.next());                  // resumes, runs to the end: done: true, value: the return value
console.log(gen.next());                  // finished: { value: undefined, done: true }
```

Calling a generator function **does not run it**. It returns a **generator object** (an iterator and an iterable). Each `next()` runs until the next `yield`.

## Generators are iterators

So all the iteration tools work:

```js run title="for...of, spread and destructuring with generators"
function* count(from, to) {
  for (let i = from; i <= to; i++) yield i;
}

for (const n of count(1, 3)) console.log("for...of", n);
console.log([...count(10, 14)]);
const [a, b] = count(5, 100);                      // takes only two: the rest is never computed
console.log(a, b);
```

Note: the `return` value (`"done"` above) is **ignored** by `for...of` and spread; only yielded values count.

## Lazy and infinite sequences

```js run title="Infinite generators and take()"
function* naturals() { let n = 1; while (true) yield n++; }     // infinite, but safe because it is lazy

function* take(iterable, n) {
  if (n <= 0) return;
  for (const x of iterable) { yield x; if (--n <= 0) return; }
}
function* map(iterable, fn) { for (const x of iterable) yield fn(x); }
function* filter(iterable, pred) { for (const x of iterable) if (pred(x)) yield x; }

console.log([...take(filter(map(naturals(), (n) => n * n), (n) => n % 2 === 1), 5)]);

function* fibonacci() { let [a, b] = [0, 1]; while (true) { yield a; [a, b] = [b, a + b]; } }
console.log([...take(fibonacci(), 10)]);
```

## `yield` is an expression: two-way communication

`next(value)` **sends a value into** the generator: it becomes the **result of the paused `yield`**.

```js run title="Passing values in with next(value)"
function* conversation() {
  const name = yield "What is your name?";
  const city = yield `Hello ${name}! Where do you live?`;
  return `${name} lives in ${city}`;
}

const talk = conversation();
console.log(talk.next().value);           // the first next() value is ignored: it just starts the generator
console.log(talk.next("Asha").value);
console.log(talk.next("Pune"));
```

```js run title="A running average (state kept between calls)"
function* averager() {
  let sum = 0, count = 0, average = null;
  while (true) {
    const value = yield average;
    sum += value;
    count++;
    average = sum / count;
  }
}

const avg = averager();
avg.next();                               // start
console.log(avg.next(10).value, avg.next(20).value, avg.next(60).value);
```

## `yield*`: delegate to another iterable

```js run title="yield* flattens and recurses"
function* inner() { yield "b"; yield "c"; }
function* outer() { yield "a"; yield* inner(); yield* [1, 2]; yield "end"; }
console.log([...outer()]);

// walk a tree recursively
const tree = { value: 1, children: [{ value: 2, children: [{ value: 4, children: [] }] }, { value: 3, children: [] }] };
function* walk(node) {
  yield node.value;
  for (const child of node.children) yield* walk(child);
}
console.log([...walk(tree)]);
```

## `return()` and `throw()`

```js run title="Stopping or injecting an error"
function* worker() {
  try {
    yield 1;
    yield 2;
    yield 3;
  } catch (e) {
    console.log("worker caught:", e.message);
    yield "recovered";
  } finally {
    console.log("cleanup runs");
  }
}

const w1 = worker();
console.log(w1.next(), w1.return("stopped early"), w1.next());       // return() ends it; finally runs

const w2 = worker();
w2.next();
console.log(w2.throw(new Error("injected")));                        // throws AT the paused yield
```

## Practical uses

### 1. Unique ID generator

```js run title="An id generator"
function* idGenerator(prefix = "id") {
  let n = 1;
  while (true) yield `${prefix}-${n++}`;
}
const ids = idGenerator("user");
console.log(ids.next().value, ids.next().value, ids.next().value);
```

### 2. A state machine

```js run title="A traffic light as a generator"
function* trafficLight() {
  while (true) {
    yield "green";
    yield "yellow";
    yield "red";
  }
}
const light = trafficLight();
console.log(Array.from({ length: 5 }, () => light.next().value));
```

### 3. Chunking and pagination

```js run title="Split an array into chunks lazily"
function* chunk(array, size) {
  for (let i = 0; i < array.length; i += size) yield array.slice(i, i + size);
}
console.log([...chunk([1, 2, 3, 4, 5, 6, 7], 3)]);
```

### 4. Make a class iterable

```js run title="*[Symbol.iterator]() is the easy way"
class Playlist {
  #songs = [];
  add(song) { this.#songs.push(song); return this; }
  *[Symbol.iterator]() { yield* this.#songs; }
}
const list = new Playlist().add("A").add("B");
console.log([...list]);
```

### 5. Cooperative multitasking (the idea behind `async/await` and Redux-Saga)

```js run title="A tiny round-robin scheduler"
function* task(name, steps) {
  for (let i = 1; i <= steps; i++) {
    console.log(`${name} step ${i}`);
    yield;                                      // give control back
  }
}

const tasks = [task("A", 3), task("B", 2)];
while (tasks.length) {
  const t = tasks.shift();
  if (!t.next().done) tasks.push(t);            // not finished: go to the back of the queue
}
```

The next step: if each `yield` is a promise and a runner resumes the generator when it settles, you get `async/await`. You saw this in the [async/await internals](#/l/async-await-internals) lesson.

## Rules and gotchas

- `yield` can only be used **directly inside** the generator function, not in a nested callback (`forEach(x => yield x)` is a SyntaxError).
- Generators cannot be arrow functions. Class method syntax: `*gen() {}`.
- Calling `.next()` on a **finished** generator returns `{ value: undefined, done: true }`.
- A generator object is a **single-use** iterator.

:::interview What is a generator? What can you use it for?
"A generator function, `function*`, returns an iterator object and can pause at each `yield` and resume with `next()`, keeping its local state. Values can also be sent back in through `next(value)`, and errors injected with `throw()`. Because they are lazy iterators, I use them for infinite or large sequences, custom iteration (`*[Symbol.iterator]`), tree walking with `yield*`, simple state machines and schedulers. Async/await is built on the same idea: a generator driven by promises."
:::

## More interview questions on this topic

:::qa What happens when you call a generator function? {level=easy}
**Say this:** "Nothing in the body runs. It returns a generator object. The body runs in steps as you call `next()`."

**In simple words:** You get a remote control, not the show.
:::

:::qa What is the value of `yield` as an expression? {level=medium}
**Say this:** "The value passed to the following `next(value)` call. The first `next()` has no pending `yield`, so its argument is ignored."

**In simple words:** `yield` is a two-way door: a value out, and a value back in.
:::

:::qa What does `yield*` do? {level=medium}
**Say this:** "Delegates to another iterable or generator: yields each of its values, and evaluates to its return value."

**In simple words:** "Hand over to that one for a while."
:::

:::qa How are generators related to async/await? {level=hard}
**Say this:** "An async function behaves like a generator whose yields are awaits: a runner receives each yielded promise and resumes the generator with the result or throws the error into it."

**In simple words:** `await` is a `yield` plus an automatic `next()`.
:::

```quiz
? What does calling `gen()` for `function* gen() {...}` do?
- Runs the whole body
+ Creates a generator object without running the body
- Returns undefined
> The body runs on next().
? What is the first next(arg)'s argument used for?
- It becomes the first yield's result
+ It is ignored
- It is returned
> There is no paused yield yet.
? Which is a generator method inside a class?
- generator method() {}
+ *method() {}
- method*() {}
> The star goes before the name.
```

:::keypoints
- `function*` returns a **generator object** (an iterator). Code runs in steps on `next()`; `yield` pauses.
- **Lazy**, can be infinite. Works with `for...of`, spread, destructuring.
- `next(value)` sends a value into the `yield`; `yield*` delegates; `return()`/`throw()` end or inject errors (`finally` runs).
- Uses: sequences, ids, tree walking, state machines, schedulers, `*[Symbol.iterator]`.
- async/await ≈ generators + promises.
:::
