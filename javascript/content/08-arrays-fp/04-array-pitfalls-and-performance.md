---
title: Array pitfalls and performance
level: intermediate
time: 25
summary: Mutating vs non-mutating methods, holes and sparse arrays, array-likes, the cost of shift/unshift/includes/spread, chaining vs single pass, and which loop to use.
---

## Mutating vs non-mutating methods

This is asked very often, because accidental mutation causes real bugs, especially in React.

| Mutate the array (careful!) | Return a new array (safe) |
|---|---|
| `push`, `pop`, `shift`, `unshift` | `map`, `filter`, `slice`, `concat` |
| `splice`, `sort`, `reverse` | `flat`, `flatMap`, spread `[...a]` |
| `fill`, `copyWithin` | `toSorted`, `toReversed`, `toSpliced`, `with` (ES2023) |

```js run title="Same job, mutating vs not"
const base = [3, 1, 2];

const a = base.reverse();                 // mutates AND returns the same array
console.log(base, a === base);

const b = [3, 1, 2];
const c = b.toReversed();                 // a new array
console.log(b, c, c === b);

const d = [1, 2, 3, 4, 5];
console.log(d.splice(1, 2), d);           // splice removes AND returns the removed items
console.log([1, 2, 3, 4, 5].slice(1, 3)); // slice copies a range
```

`splice` and `slice` are confused all the time: **splice changes**, **slice copies**.

## Holes and sparse arrays

```js run title="Holes: empty slots are not undefined"
const holey = [1, , 3];                   // a hole at index 1
console.log(holey, holey.length, 1 in holey);

holey.forEach((x, i) => console.log("forEach sees", i, x));        // skips the hole
console.log(holey.map((x) => x * 2));                               // the hole stays a hole

const withUndefined = [1, undefined, 3];
console.log(1 in withUndefined);

const arr = [1, 2, 3];
delete arr[1];                                                       // makes a hole, does not shrink
console.log(arr, arr.length);

const a = new Array(3);                                              // 3 holes
console.log(a, a.map((_, i) => i));                                  // map skips holes!
console.log(Array.from({ length: 3 }, (_, i) => i), [...Array(3).keys()]);
```

Sparse arrays can be slower (the engine may switch to a dictionary mode). Avoid creating holes. To remove an item, use `splice` or `filter`.

## `length` is writable

```js run title="length can truncate or extend"
const a = [1, 2, 3, 4, 5];
a.length = 2;
console.log(a);
a.length = 4;
console.log(a);                            // new empty slots
a.length = 0;                              // a fast way to clear an array in place
console.log(a);
```

## Array-likes and iterables

An **array-like** has `length` and indexes but is not an array (`arguments`, `NodeList`, strings). An **iterable** works with `for...of` (`Set`, `Map`, generators).

```js run title="Convert with Array.from or spread"
const arrayLike = { 0: "a", 1: "b", length: 2 };
console.log(Array.from(arrayLike));
// [...arrayLike] would throw: it is array-like, but not iterable

console.log(Array.from(new Set([1, 1, 2])), [...new Map([["k", 1]])]);
console.log(Array.from("hello", (ch) => ch.toUpperCase()));
```

## Performance: what is cheap and what is not

| Operation | Cost | Notes |
|---|---|---|
| `arr[i]`, `arr.length`, `push`, `pop` | O(1) | Fast: they work at the end |
| `shift`, `unshift`, `splice(0, ...)` | **O(n)** | Every other item moves (V8 optimises small arrays) |
| `includes`, `indexOf`, `find` | O(n) | A `Set` or `Map` lookup is O(1) |
| `[...arr, x]`, `concat` | O(n) | A new array each time |
| `sort` | O(n log n) | |
| Spread inside a loop | O(n²) overall | Avoid building arrays with `[...acc, x]` in `reduce` |

```js run title="Using a Set for fast membership tests"
const blocked = Array.from({ length: 5000 }, (_, i) => "user" + i);
const requests = Array.from({ length: 5000 }, (_, i) => "user" + (i * 3));

const t1 = performance.now();
const slow = requests.filter((r) => blocked.includes(r)).length;      // O(n × m)
const t2 = performance.now();

const blockedSet = new Set(blocked);
const fast = requests.filter((r) => blockedSet.has(r)).length;        // O(n + m)
const t3 = performance.now();

console.log("same answer:", slow === fast, "| Set faster:", (t3 - t2) < (t2 - t1));
```

### A queue with `shift` is slow for big arrays

```js run title="A cheap queue: use an index, or a linked list"
class Queue {
  #items = [];
  #head = 0;
  enqueue(x) { this.#items.push(x); }
  dequeue() {
    if (this.#head >= this.#items.length) return undefined;
    const x = this.#items[this.#head++];
    if (this.#head > 1000 && this.#head * 2 > this.#items.length) {   // compact occasionally
      this.#items = this.#items.slice(this.#head);
      this.#head = 0;
    }
    return x;
  }
  get size() { return this.#items.length - this.#head; }
}

const q = new Queue();
[1, 2, 3].forEach((n) => q.enqueue(n));
console.log(q.dequeue(), q.dequeue(), q.size);
```

### Chaining creates intermediate arrays

`arr.filter(...).map(...).reduce(...)` creates two temporary arrays. For small arrays this does not matter, and readability wins. For very large arrays on a hot path, a single `for...of` or `reduce` pass, or an iterator pipeline, is lighter.

```js run title="One pass vs a chain (same result)"
const nums = Array.from({ length: 10 }, (_, i) => i + 1);

const chained = nums.filter((n) => n % 2).map((n) => n * n).reduce((a, b) => a + b, 0);

let loop = 0;
for (const n of nums) if (n % 2) loop += n * n;

console.log(chained, loop);
```

## Which loop should I use?

| Loop | Good for | Notes |
|---|---|---|
| `for (let i...)` | Index control, hot paths, early exit | Fastest, verbose |
| `for...of` | Most array loops, `await` in order, `break` | Works with any iterable |
| `forEach` | Simple side effects | Cannot `break`; ignores `await` |
| `for...in` | Object keys, **not arrays** | Gives string keys and inherited ones |
| `map/filter/reduce` | Transform data | Return values, no side effects |

:::interview Which array methods mutate the original array? Why does it matter?
"`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill` and `copyWithin` mutate. `map`, `filter`, `slice`, `concat`, `flat` and the ES2023 `toSorted`, `toReversed`, `toSpliced` and `with` return new arrays. It matters because shared mutable arrays cause hidden bugs, and in React or Redux a mutation keeps the same reference, so change detection fails. I use the non-mutating versions, or copy first with spread."
:::

## More interview questions on this topic

:::qa What is the difference between `slice` and `splice`? {level=easy}
**Say this:** "`slice(start, end)` returns a shallow copy of a range and does not change the array. `splice(start, count, ...items)` removes and/or inserts items in place and returns the removed items."

**In simple words:** slice = copy, splice = surgery.
:::

:::qa What is a sparse array and why avoid it? {level=medium}
**Say this:** "An array with holes (empty slots). Methods like `forEach` and `map` skip holes, and the engine may store it less efficiently. Avoid `delete arr[i]` and `new Array(n)` without filling."

**In simple words:** Holes are "missing", not `undefined`.
:::

:::qa Why is `shift` slow compared to `pop`? {level=medium}
**Say this:** "`shift` removes the first item, so every other item has to move down one place: O(n). `pop` removes the last one: O(1). For queues use an index pointer or a linked list."

**In simple words:** Taking from the front makes the whole line move.
:::

:::qa How do you make an array of N items (0..N-1) quickly? {level=easy}
**Say this:** "`Array.from({ length: N }, (_, i) => i)` or `[...Array(N).keys()]`. `new Array(N).map(...)` does not work because of holes."

**In simple words:** `Array.from` with a length object is the safest.
:::

```quiz
? Which method both changes the array and returns removed items?
- slice
+ splice
- concat
> splice removes in place.
? What does `new Array(3).map((_, i) => i)` return?
- [0, 1, 2]
+ An array of 3 empty slots
- [undefined, undefined, undefined]
> map skips holes.
? What is the fastest way to test if a value is in a large list, many times?
- includes on the array
+ Put them in a Set and use has
- indexOf
> Set lookup is O(1).
```

:::keypoints
- **Mutating**: push, pop, shift, unshift, splice, sort, reverse, fill. **Safe**: map, filter, slice, concat, toSorted, toReversed, with.
- `splice` changes, `slice` copies. `delete arr[i]` leaves a **hole**.
- `shift`/`unshift` are O(n). `includes` is O(n): use a **Set** for lookups.
- Avoid spread-in-loop O(n²). Chains are fine for small arrays; use one pass on hot paths.
- Prefer `for...of`, and never `for...in` for arrays.
:::
