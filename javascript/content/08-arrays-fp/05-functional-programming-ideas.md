---
title: Functional programming ideas
level: intermediate
time: 30
summary: The ideas behind map/filter/reduce: declarative style, pure functions, immutability, composition, functors (Maybe/Either for safe code) and lazy evaluation with generators and iterator helpers.
---

## What is functional programming (FP)?

> "Build programs by **combining small, pure functions** that transform data, instead of changing shared variables step by step."

JavaScript is **multi-paradigm**. You do not have to be a purist. But FP ideas make code **easier to test and reason about**, and every modern framework uses them (React hooks and reducers, Redux, RxJS, array methods).

| Idea | Meaning | JavaScript tools |
|---|---|---|
| **Pure functions** | Same input → same output, no side effects | Plain functions, no outside state |
| **Immutability** | Do not change data, create new data | spread, `map`, `filter`, `toSorted`, `structuredClone` |
| **First-class / higher-order functions** | Functions as values | callbacks, `map`, `reduce` |
| **Composition** | Build big from small | `pipe`, `compose` |
| **Declarative style** | Say *what*, not *how* | array methods, JSX |
| **Avoid shared state** | Pass data in, return data out | closures, arguments |

## Imperative vs declarative

```js run title="Imperative (how) vs declarative (what)"
const users = [
  { name: "Asha", age: 25, active: true },
  { name: "Ravi", age: 17, active: true },
  { name: "Meera", age: 32, active: false },
];

// imperative: manage the loop, the index and the result array yourself
const imperative = [];
for (let i = 0; i < users.length; i++) {
  if (users[i].active && users[i].age >= 18) {
    imperative.push(users[i].name.toUpperCase());
  }
}

// declarative: describe the result
const declarative = users
  .filter((u) => u.active && u.age >= 18)
  .map((u) => u.name.toUpperCase());

console.log(imperative, declarative);
```

## Functors: things you can `map` over

A **functor** is a container with a `map` method that applies a function to the value(s) **inside**, and returns a container of the same kind.

- `Array.map` applies a function to every item.
- `Promise.then` applies a function to the future value.
- You can build your own, like **Maybe**, to handle `null` safely.

### Maybe: no more `Cannot read properties of undefined`

```js run title="A Maybe container"
class Maybe {
  #value;
  constructor(value) { this.#value = value; }
  static of(value) { return new Maybe(value); }
  isNothing() { return this.#value === null || this.#value === undefined; }
  map(fn) { return this.isNothing() ? this : Maybe.of(fn(this.#value)); }     // skip if nothing
  getOrElse(fallback) { return this.isNothing() ? fallback : this.#value; }
}

const user = { profile: { address: { city: "Pune" } } };
const noProfile = {};

const cityOf = (u) => Maybe.of(u)
  .map((x) => x.profile)
  .map((p) => p.address)
  .map((a) => a.city)
  .map((c) => c.toUpperCase())
  .getOrElse("unknown");

console.log(cityOf(user), cityOf(noProfile));

// the modern built-in way for simple cases: optional chaining + nullish coalescing
console.log(user?.profile?.address?.city?.toUpperCase() ?? "unknown", noProfile?.profile?.address?.city ?? "unknown");
```

### Either: success or failure without exceptions

```js run title="Either: carry an error as a value"
const Right = (value) => ({ isRight: true, value, map: (fn) => Right(fn(value)), fold: (_, ok) => ok(value) });
const Left = (error) => ({ isRight: false, error, map: () => Left(error), fold: (fail) => fail(error) });

const parseJson = (text) => {
  try { return Right(JSON.parse(text)); } catch (e) { return Left("invalid JSON"); }
};

const getAge = (text) => parseJson(text)
  .map((o) => o.age)
  .map((age) => (age >= 0 ? age : null));

console.log(getAge('{"age": 30}').fold((e) => "error: " + e, (v) => "age: " + v));
console.log(getAge("{broken").fold((e) => "error: " + e, (v) => "age: " + v));
```

Errors travel along the pipeline as **values**, and the `map` steps are skipped after a failure, like in a promise chain.

## Lazy evaluation with generators and iterators

Array methods are **eager**: each step builds a whole new array. For huge or infinite data, use **iterators** that produce values **one at a time, on demand**.

```js run title="A lazy pipeline with generators"
function* naturals() { let n = 1; while (true) yield n++; }        // infinite!

function* map(iterable, fn) { for (const x of iterable) yield fn(x); }
function* filter(iterable, pred) { for (const x of iterable) if (pred(x)) yield x; }
function* take(iterable, n) { let i = 0; for (const x of iterable) { if (i++ >= n) return; yield x; } }

const firstFiveEvenSquares = take(filter(map(naturals(), (n) => n * n), (n) => n % 2 === 0), 5);
console.log([...firstFiveEvenSquares]);                              // works on an infinite source
```

Modern JavaScript (Node 22+, Chrome 122+) has **iterator helpers** built in:

```js run title="Iterator helpers (ES2025)"
function* naturals() { let n = 1; while (true) yield n++; }

const result = naturals()
  .map((n) => n * n)
  .filter((n) => n % 2 === 0)
  .take(5)
  .toArray();

console.log(result);
```

Only as many items as needed are computed, and no intermediate arrays are created.

## Recursion and immutability together

FP code often uses recursion and spread instead of loops and mutation:

```js run title="Immutable updates in a reducer (the Redux idea)"
const initial = { count: 0, history: [] };

function reducer(state, action) {
  switch (action.type) {
    case "add":   return { ...state, count: state.count + action.amount, history: [...state.history, action.amount] };
    case "reset": return initial;
    default:      return state;
  }
}

const actions = [{ type: "add", amount: 5 }, { type: "add", amount: 3 }, { type: "reset" }, { type: "add", amount: 1 }];
const states = actions.reduce((acc, a) => [...acc, reducer(acc.at(-1), a)], [initial]);

console.log(states.map((s) => s.count));
console.log(states[2] === initial, states[0] === initial);
```

A reducer is `(state, action) → newState`: a **pure** function. `reduce` over a list of actions gives you the **whole history**, which is why time-travel debugging is possible.

## FP in the real world: balance

- Use **FP for data transformation** (lists, pipelines, reducers, validation).
- Use **objects/classes** for long-lived things with identity (a connection, a UI component, a cache).
- Do not force `reduce` or point-free tricks where a plain loop reads better.
- **Side effects** (network, DOM, files) are needed: keep them at the edges of a pure core.

:::interview What is functional programming and which of its ideas do you use in JavaScript?
"It is a style that builds programs from small pure functions that transform data, avoids shared mutable state, and treats functions as values. In JavaScript I use pure functions and immutable updates (spread, `map`, `filter`, `toSorted`), higher-order functions and composition, declarative array pipelines, and reducers. The same ideas power Redux, React's `useReducer` and state updates. I keep side effects at the edges and I use loops when they are clearer. I also use iterators and generators for lazy processing of large data."
:::

## More interview questions on this topic

:::qa Imperative vs declarative: what is the difference? {level=easy}
**Say this:** "Imperative code describes how to do something step by step, managing state. Declarative code describes what result you want, such as `filter().map()`."

**In simple words:** A recipe with every step vs ordering a dish by name.
:::

:::qa What is a functor? {level=hard}
**Say this:** "A container with a `map` that applies a function to the inside value and returns the same kind of container, keeping the structure. Arrays and Promises are functors; Maybe is a custom one."

**In simple words:** Something you can `map` over without opening it.
:::

:::qa What is lazy evaluation and how do you get it in JavaScript? {level=medium}
**Say this:** "Computing values only when needed. Generators and iterators produce items on demand, and iterator helpers like `.map().filter().take()` do not build intermediate arrays."

**In simple words:** Do the work for item 1, pass it along, then item 2, instead of finishing everything first.
:::

:::qa Why are reducers pure functions? {level=medium}
**Say this:** "So the same state and action always give the same new state. That makes state changes predictable, testable, replayable (time travel) and safe for change detection by reference."

**In simple words:** No surprises, so you can replay history.
:::

```quiz
? Which is a declarative style?
- A for loop with push
+ filter followed by map
- A while loop with a counter
> It says what, not how.
? What does `Maybe.of(null).map(fn)` do?
- Calls fn with null
+ Skips fn and stays "nothing"
- Throws
> Nothing flows through safely.
? What is the advantage of a generator pipeline over array methods for a huge list?
- It is shorter
+ Items are processed one at a time, with no big intermediate arrays
- It is async
> Lazy evaluation saves memory and work.
```

:::keypoints
- FP ideas: **pure functions, immutability, higher-order functions, composition, declarative style**.
- **Functor**: a container with `map` (Array, Promise, Maybe). **Maybe/Either** make absence and errors safe values.
- **Lazy** pipelines with generators or iterator helpers (`.map().filter().take()`) avoid intermediate arrays and allow infinite sequences.
- A **reducer** `(state, action) => newState` is the FP core of Redux and `useReducer`.
- Use FP where it clarifies; do not force it.
:::
