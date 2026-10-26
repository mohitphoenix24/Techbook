---
title: reduce in depth: grouping, counting, pipelines
level: intermediate
time: 30
summary: Ten practical reduce recipes (sum, max, count, group by, index by id, flatten, unique, pipe, async chain, build objects) and when reduce is the wrong tool.
---

## Why reduce matters in interviews

`reduce` can build **any** array method (`map`, `filter`, `find`, `flat`...). A senior developer should be able to:

1. Use it for sums, counts, grouping and indexing.
2. Choose the **accumulator type** (number, object, array, Map, function, promise).
3. Know when **not** to use it.

The shape is always:

```js
array.reduce((accumulator, item) => newAccumulator, initialAccumulator)
```

## 1. Sum, product, max, min

```js run title="Numbers"
const marks = [67, 91, 54, 88];

console.log(marks.reduce((a, b) => a + b, 0));
console.log(marks.reduce((a, b) => a * b, 1));
console.log(marks.reduce((max, m) => (m > max ? m : max), -Infinity));
console.log(marks.reduce((min, m) => Math.min(min, m), Infinity));
console.log(marks.reduce((a, b) => a + b, 0) / marks.length);       // average
```

## 2. Count occurrences (accumulator is an object)

```js run title="Count how many times each word appears"
const words = ["apple", "pear", "apple", "fig", "pear", "apple"];

const counts = words.reduce((acc, w) => {
  acc[w] = (acc[w] ?? 0) + 1;
  return acc;
}, {});

console.log(counts);
```

## 3. Group by a key

```js run title="groupBy"
const people = [
  { name: "Asha", city: "Pune" },
  { name: "Ravi", city: "Delhi" },
  { name: "Meera", city: "Pune" },
  { name: "Kiran", city: "Delhi" },
  { name: "Zoya", city: "Mumbai" },
];

const byCity = people.reduce((groups, p) => {
  (groups[p.city] ??= []).push(p.name);               // create the array if missing, then push
  return groups;
}, {});

console.log(byCity);
console.log(Object.groupBy(people, (p) => p.city));    // built in since Node 21 / modern browsers
```

`Object.groupBy` (ES2024) and `Map.groupBy` do this natively. Interviewers may still ask for the `reduce` version.

## 4. Index by id (array to lookup object)

```js run title="Index by id for O(1) lookups"
const users = [{ id: 7, name: "Asha" }, { id: 9, name: "Ravi" }];

const byId = users.reduce((map, u) => ({ ...map, [u.id]: u }), {});
console.log(byId[9].name);

// faster: do not spread in a loop (it copies the object every time: O(n²))
const byIdFast = users.reduce((map, u) => { map[u.id] = u; return map; }, {});
const asMap = new Map(users.map((u) => [u.id, u]));
console.log(byIdFast[7].name, asMap.get(7).name);
```

:::warn The spread-in-reduce trap
`reduce((acc, x) => ({ ...acc, [x.k]: x }), {})` creates a **new object for each item**, copying all previous keys. That is **O(n²)**. For big arrays, mutate the accumulator (it is local and safe) or use `Object.fromEntries`/`Map`.
:::

## 5. Flatten one level, and deeply

```js run title="Flatten"
const nested = [[1, 2], [3], [4, [5, 6]]];

console.log(nested.reduce((flat, a) => flat.concat(a), []));       // one level

const flattenDeep = (arr) => arr.reduce((flat, x) => flat.concat(Array.isArray(x) ? flattenDeep(x) : x), []);
console.log(flattenDeep(nested));
```

## 6. Unique values and partitions

```js run title="Unique and partition"
console.log([3, 1, 3, 2, 1].reduce((u, x) => (u.includes(x) ? u : [...u, x]), []));

const [evens, odds] = [1, 2, 3, 4, 5].reduce(
  ([e, o], n) => (n % 2 === 0 ? [[...e, n], o] : [e, [...o, n]]),
  [[], []],
);
console.log(evens, odds);
```

## 7. Build `map` and `filter` with `reduce`

This proves `reduce` is the general tool:

```js run title="map and filter from reduce"
const myMap = (arr, fn) => arr.reduce((acc, x, i) => (acc.push(fn(x, i)), acc), []);
const myFilter = (arr, fn) => arr.reduce((acc, x, i) => (fn(x, i) && acc.push(x), acc), []);

console.log(myMap([1, 2, 3], (x) => x * x));
console.log(myFilter([1, 2, 3, 4], (x) => x % 2 === 0));
```

## 8. Function composition with reduce

```js run title="pipe via reduce"
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);
console.log(pipe((x) => x + 1, (x) => x * 2, String)(4));
```

## 9. Sequential async work with reduce

Each step waits for the previous one, by chaining promises in the accumulator.

```js run title="Run async tasks one after another"
const delay = (ms, label) => new Promise((r) => setTimeout(() => { console.log("done", label); r(label); }, ms));

const tasks = [() => delay(30, "A"), () => delay(10, "B"), () => delay(20, "C")];

tasks
  .reduce((chain, task) => chain.then((results) => task().then((r) => [...results, r])), Promise.resolve([]))
  .then((all) => console.log("results:", all));
```

(With `async/await` you would write a simple `for...of` loop, which is clearer.)

## 10. Running totals

```js run title="Running total (cumulative sum)"
const sales = [100, 250, 50, 300];
const running = sales.reduce((acc, n) => [...acc, (acc.at(-1) ?? 0) + n], []);
console.log(running);
```

## When NOT to use `reduce`

- When a **simpler method** says it better: `map`, `filter`, `some`, `every`, `find`, `Math.max(...arr)`, `Object.fromEntries`, `Object.groupBy`.
- When the callback becomes **long and nested**. A `for...of` loop is more readable and often faster.
- When you are using it just for **side effects**.

:::tip Readability test
If a teammate needs more than 10 seconds to understand your `reduce`, rewrite it as a named helper or a loop.
:::

:::interview Implement groupBy and countBy with reduce. What is the pitfall with spread inside reduce?
"For `groupBy` I use an object accumulator: `(groups, item) => { (groups[key(item)] ??= []).push(item); return groups; }` with `{}` as the initial value. For `countBy`, `acc[k] = (acc[k] ?? 0) + 1`. The pitfall is returning `{ ...acc, [k]: v }` on every iteration: it copies the whole accumulator each time, so the total cost is O(n squared). I mutate the accumulator instead, since it is local to the reduce call, or use Map or `Object.fromEntries`."
:::

## More interview questions on this topic

:::qa What can the accumulator be in `reduce`? {level=easy}
**Say this:** "Anything: a number, string, array, object, `Map`, `Set`, a function (for composition) or a promise (for sequential async work). The initial value decides the type."

**In simple words:** It is just a variable that you carry through the loop.
:::

:::qa Can you implement `map` using `reduce`? {level=medium}
**Say this:** "Yes: start with `[]`, and for each item push `fn(item)` and return the accumulator."

**In simple words:** Because reduce can build any collection.
:::

:::qa What are `Object.groupBy` and `Map.groupBy`? {level=medium}
**Say this:** "ES2024 built-ins that group items by the key returned by a callback. `Object.groupBy` returns a null-prototype object, `Map.groupBy` returns a Map (keys can be any type)."

**In simple words:** The standard version of the `reduce` groupBy recipe.
:::

:::qa Why might a `for` loop beat `reduce`? {level=medium}
**Say this:** "It is easier to read when the logic is complex, allows `break`, avoids allocating new accumulators, and is usually a little faster."

**In simple words:** `reduce` is clever, but not always clear.
:::

```quiz
? What is the initial value for counting words into an object?
- 0
+ {}
- []
> The accumulator is an object of counts.
? What is the complexity problem of `reduce((acc, x) => ({ ...acc, [x.id]: x }), {})`?
- None
+ It copies the object on every iteration: O(n²)
- It mutates the input
> Mutate the accumulator or use Object.fromEntries.
? Which built-in groups items by a key function?
- Array.group
+ Object.groupBy
- Object.split
> ES2024.
```

:::keypoints
- `reduce` carries an accumulator of **any type** — number, object, array, Map, function, promise.
- Recipes: **sum/max, count, groupBy, indexBy, flatten, unique, partition, pipe, sequential async, running totals**.
- Beware `{ ...acc }` in the callback (O(n²)). Mutate the local accumulator.
- Prefer `Object.groupBy`, `Object.fromEntries`, `some`, `every` when they say it clearer.
:::
