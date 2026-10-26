---
title: Iterators and iterables
level: intermediate
time: 25
summary: The iteration protocol (Symbol.iterator, next, done), which built-ins are iterable, how for...of, spread and destructuring use it, how to write your own iterable, and iterator helpers.
---

## What is an iterable?

An **iterable** is any object you can loop over with `for...of`. Arrays, strings, `Map`, `Set`, `arguments`, generators and `NodeList` are iterable. Plain objects are **not**.

The rule (the **iteration protocol**) has two parts:

1. An **iterable** has a method at **`[Symbol.iterator]`** that returns an **iterator**.
2. An **iterator** is an object with a **`next()`** method that returns `{ value, done }`.

```js run title="Doing by hand what for...of does"
const iterable = ["a", "b", "c"];
const iterator = iterable[Symbol.iterator]();

console.log(iterator.next());          // { value: 'a', done: false }
console.log(iterator.next());
console.log(iterator.next());
console.log(iterator.next());          // { value: undefined, done: true }: finished

for (const x of iterable) console.log("for...of:", x);     // calls [Symbol.iterator]() and next() for you
```

## Who uses the protocol

```js run title="Everything that accepts an iterable"
const set = new Set([1, 2, 3]);

for (const x of set) console.log("for...of", x);
console.log([...set]);                                   // spread
const [first, ...rest] = set;                            // destructuring
console.log(first, rest);
console.log(Array.from(set, (x) => x * 10));             // Array.from
console.log(new Map([["a", 1], ["b", 2]]));              // the Map constructor
console.log(Math.max(...set));                           // call arguments
console.log(Promise.all(set) instanceof Promise);        // Promise.all, Object.fromEntries, new Set(...), yield*
```

Plain objects are **not** iterable. Use `Object.entries(obj)` (an array, which is iterable):

```js run title="Objects are not iterable"
const obj = { a: 1, b: 2 };
try { for (const x of obj) {} } catch (e) { console.log(e.name + ": " + e.message); }
for (const [k, v] of Object.entries(obj)) console.log(k, v);
```

## The array-like iterators

Arrays, Maps and Sets provide several iterators:

```js run title="entries, keys, values"
const arr = ["x", "y"];
console.log([...arr.entries()], [...arr.keys()], [...arr.values()]);

const map = new Map([["k1", 1], ["k2", 2]]);
console.log([...map], [...map.keys()], [...map.values()]);
for (const [key, value] of map) console.log(key, "=>", value);       // a Map is iterable as [key, value]
```

## Writing your own iterable

```js run title="A class with a custom iterator"
class Range {
  constructor(from, to, step = 1) { this.from = from; this.to = to; this.step = step; }

  [Symbol.iterator]() {
    let current = this.from;
    const { to, step } = this;
    return {
      next: () => (current <= to ? { value: (current += step) - step, done: false } : { value: undefined, done: true }),
    };
  }
}

const range = new Range(1, 10, 3);
console.log([...range]);
for (const n of new Range(1, 3)) console.log("n =", n);
console.log(Math.max(...new Range(1, 5)), Array.from(new Range(0, 20, 5)));
```

The iterator is created **fresh each time** `[Symbol.iterator]()` is called, so you can loop over the same iterable many times. An iterator that returns itself (`[Symbol.iterator]() { return this; }`) can be used only **once**: generators and many built-in iterators work like that.

```js run title="Iterators are often single-use"
const it = [1, 2, 3][Symbol.iterator]();
console.log([...it]);                      // consumes it
console.log([...it]);                      // empty: already exhausted
console.log(typeof it[Symbol.iterator], it[Symbol.iterator]() === it);     // iterators are themselves iterable
```

## `return()`: cleanup when a loop ends early

An iterator can have an optional **`return()`** method. It is called when the loop **stops early** (`break`, `return`, an exception, or destructuring that does not consume everything).

```js run title="return() runs on break"
const resourceIterable = {
  [Symbol.iterator]() {
    let i = 0;
    console.log("open resource");
    return {
      next: () => ({ value: i++, done: i > 5 }),
      return() { console.log("close resource (return called)"); return { done: true }; },
    };
  },
};

for (const x of resourceIterable) {
  console.log("item", x);
  if (x === 1) break;                      // triggers return()
}
const [only] = resourceIterable;           // destructuring one item also calls return()
console.log("only:", only);
```

## Lazy and infinite iterables

Iterators produce values **on demand**, so they can be infinite.

```js run title="An infinite sequence, consumed lazily"
const naturals = {
  [Symbol.iterator]() {
    let n = 0;
    return { next: () => ({ value: ++n, done: false }) };      // never done
  },
};

for (const n of naturals) {
  if (n > 5) break;                                             // the consumer decides when to stop
  console.log(n);
}
```

## Iterator helpers (ES2025)

Modern runtimes (Node 22+, Chrome 122+) add `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray`, `some`, `every`, `find` and `forEach` directly to **iterators**, so you can use lazy pipelines without building arrays:

```js run title="Iterator helpers"
function* naturals() { let n = 1; while (true) yield n++; }

console.log(naturals().filter((n) => n % 2 === 0).map((n) => n * n).take(4).toArray());
console.log(Iterator.from({ next() { return { done: false, value: 7 }; } }).take(2).toArray());
console.log(new Set([1, 2, 3]).values().map((x) => x * 2).toArray());
console.log([5, 6, 7].values().drop(1).reduce((a, b) => a + b, 0));
```

## Iterable vs array-like vs array

| | Array | Array-like | Iterable |
|---|---|---|---|
| Has `length` and indexes | yes | yes | not necessarily |
| Has `[Symbol.iterator]` | yes | not necessarily | **yes** |
| Examples | `[1, 2]` | `arguments`, `{0: "a", length: 1}` | `Set`, `Map`, generators, strings |
| Convert with | | `Array.from(x)` | `[...x]` or `Array.from(x)` |

:::interview What is the iteration protocol? How would you make an object iterable?
"An iterable has a `[Symbol.iterator]` method that returns an iterator, and an iterator has a `next()` method returning `{ value, done }`; optionally `return()` for cleanup on early exit. `for...of`, spread, destructuring, `Array.from`, `Map`/`Set` constructors and `Promise.all` all use it. To make an object iterable I add a `[Symbol.iterator]` method, either returning an object with `next()` or, more simply, as a generator method `*[Symbol.iterator]() { yield ... }`. Iterators are lazy, so they can be infinite, and I can use iterator helpers like `map` and `take` on them."
:::

## More interview questions on this topic

:::qa Is a plain object iterable? How do you loop over it? {level=easy}
**Say this:** "No. Use `Object.keys`, `Object.values` or `Object.entries`, or give the object a `[Symbol.iterator]`."

**In simple words:** Objects have keys, not an order of items to walk through.
:::

:::qa What is the difference between iterable and iterator? {level=medium}
**Say this:** "An iterable can **produce** an iterator through `[Symbol.iterator]()`. An iterator is the object with `next()` that does the walking. An iterator is often iterable itself."

**In simple words:** The book vs the bookmark.
:::

:::qa What does `return()` do on an iterator? {level=hard}
**Say this:** "It is called when iteration ends early (break, return, throw, partial destructuring), so the iterator can clean up resources."

**In simple words:** A "close the door behind you" hook.
:::

:::qa Why can you spread a Set but not an object into an array? {level=easy}
**Say this:** "Array spread requires an iterable. A Set has `[Symbol.iterator]`, a plain object does not. Object spread (`{...obj}`) is a different feature that copies own enumerable properties."

**In simple words:** `[...x]` needs something to walk through.
:::

```quiz
? What does `iterator.next()` return when finished?
- null
+ { value: undefined, done: true }
- It throws
> done: true marks the end.
? Which is NOT iterable?
- A string
- A Map
+ A plain object
> Use Object.entries() to iterate over its pairs.
? When is an iterator's return() called?
- Every time next() is called
+ When iteration stops early, like on break
- At creation
> For cleanup.
```

:::keypoints
- **Iterable** = has `[Symbol.iterator]()`. **Iterator** = has `next()` → `{ value, done }` (optional `return()`).
- `for...of`, spread, destructuring, `Array.from`, `new Map/Set`, `Promise.all` consume iterables.
- Plain objects are not iterable. Use `Object.entries`.
- Iterators are **lazy** and may be **infinite** or **single-use**. `return()` cleans up on early exit.
- ES2025 **iterator helpers**: `.map().filter().take().toArray()`.
:::
