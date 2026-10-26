---
title: Function composition and pipe
level: intermediate
time: 20
summary: Build big functions from small ones with compose and pipe, including async pipelines, data-last style and point-free code, plus a readable way to debug a pipeline.
---

## The idea

> "**Composition** means connecting small functions so that the **output of one becomes the input of the next**."

:::analogy A factory line
Raw wood goes into the cutter, the cut pieces go to the sander, then to the painter. Each machine does one small job. The line as a whole turns wood into a table.
:::

```js run title="Without composition: nested calls"
const trim = (s) => s.trim();
const lower = (s) => s.toLowerCase();
const hyphenate = (s) => s.replace(/\s+/g, "-");

console.log(hyphenate(lower(trim("  Hello Brave World  "))));
```

Nested calls read **inside out**, which is hard to follow. `compose` and `pipe` fix this.

## `pipe`: left to right

```js run title="pipe: do the steps in the order you read them"
const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);

const trim = (s) => s.trim();
const lower = (s) => s.toLowerCase();
const hyphenate = (s) => s.replace(/\s+/g, "-");

const slugify = pipe(trim, lower, hyphenate);

console.log(slugify("  Hello Brave World  "));
console.log(slugify("   JavaScript   MASTERY "));
```

## `compose`: right to left

`compose` is the same, but runs from the **last** function to the first, like maths: `(f ∘ g)(x) = f(g(x))`.

```js run title="compose: the mathematical order"
const compose = (...fns) => (input) => fns.reduceRight((value, fn) => fn(value), input);

const add1 = (n) => n + 1;
const double = (n) => n * 2;

console.log(compose(add1, double)(5));       // add1(double(5)) = 11
console.log(compose(double, add1)(5));       // double(add1(5)) = 12
```

Choose one and use it consistently. Most teams find **`pipe`** easier to read.

## Rules for functions that compose well

1. Each function takes **one input** and returns **one output** (unary).
2. The output type of one matches the input type of the next.
3. Functions are **pure** (no side effects), so they are easy to test and reorder.

If a function needs more arguments, **curry** it or **partially apply** it first (next lesson).

```js run title="Composing with configured functions"
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);
const multiplyBy = (n) => (x) => x * n;
const add = (n) => (x) => x + n;

const priceWithTax = pipe(multiplyBy(1.18), Math.round);
const finalPrice = pipe(add(-50), priceWithTax, (n) => `₹${n}`);

console.log(finalPrice(1000));
```

## Working with arrays: a data pipeline

```js run title="A realistic pipeline"
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

const orders = [
  { id: 1, status: "paid", amount: 500, city: "Pune" },
  { id: 2, status: "refund", amount: 300, city: "Delhi" },
  { id: 3, status: "paid", amount: 1200, city: "Pune" },
  { id: 4, status: "paid", amount: 250, city: "Mumbai" },
];

const filter = (pred) => (list) => list.filter(pred);
const map = (fn) => (list) => list.map(fn);
const sum = (list) => list.reduce((a, b) => a + b, 0);

const totalPaidInPune = pipe(
  filter((o) => o.status === "paid"),
  filter((o) => o.city === "Pune"),
  map((o) => o.amount),
  sum,
);

console.log(totalPaidInPune(orders));
```

Notice the **data-last** style: `map(fn)(list)` takes the data **last**, so it can be configured first and used in a pipeline. This is how Ramda and lodash/fp work.

## Async pipelines

A pipeline where steps may return promises:

```js run title="pipeAsync"
const pipeAsync = (...fns) => (input) => fns.reduce((acc, fn) => acc.then(fn), Promise.resolve(input));

const fetchUser = async (id) => ({ id, name: "Asha" });
const addGreeting = async (user) => ({ ...user, greeting: `Hello ${user.name}` });
const shout = (user) => ({ ...user, greeting: user.greeting.toUpperCase() });     // can be sync too

const load = pipeAsync(fetchUser, addGreeting, shout);
load(7).then(console.log);
```

## Debugging a pipeline with `tap`

A tiny function that **looks at** the value and passes it on:

```js run title="tap: peek inside a pipeline"
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);
const tap = (label) => (value) => { console.log(`${label}:`, value); return value; };

const process = pipe(
  (s) => s.split(" "),
  tap("after split"),
  (words) => words.map((w) => w[0].toUpperCase() + w.slice(1)),
  tap("after capitalise"),
  (words) => words.join(" "),
);

console.log(process("learn javascript well"));
```

## Point-free style

**Point-free** means you do not mention the argument name:

```js run title="Point-free vs explicit"
const words = ["10", "20", "30"];

console.log(words.map((w) => Number(w)));       // explicit
console.log(words.map(Number));                  // point-free: pass the function itself
```

:::warn A famous trap: `["1", "2", "3"].map(parseInt)`
`map` passes `(item, index, array)`. `parseInt(item, radix)` takes the **index as the radix**. So you get `[1, NaN, NaN]`. Point-free is only safe when the function takes exactly the arguments you pass.
:::

```js run title="The parseInt trap"
console.log(["1", "2", "3"].map(parseInt));
console.log(["1", "2", "3"].map(Number));
console.log(["1", "2", "3"].map((s) => parseInt(s, 10)));
```

:::interview What is function composition? Write compose and pipe.
"Composition is building a function by chaining others so that the result of one feeds the next. `pipe(f, g, h)(x)` is `h(g(f(x)))`, left to right, and it is `fns.reduce((v, f) => f(v), x)`. `compose` is the same but right to left, using `reduceRight`. The functions should be small, pure and take one argument, so they combine well. It makes code easy to test and read, and I add a `tap` helper to debug."
:::

## More interview questions on this topic

:::qa What is the difference between `compose` and `pipe`? {level=easy}
**Say this:** "The order. `pipe` runs functions left to right, `compose` right to left (like maths `f(g(x))`)."

**In simple words:** pipe = the order you read. compose = inside out.
:::

:::qa Why do composed functions usually take only one argument? {level=medium}
**Say this:** "Because a function returns one value, so the next function receives one value. For more parameters I use currying or partial application to pre-fill the rest."

**In simple words:** A pipe has one pipe-end, not many.
:::

:::qa What is point-free style and when is it risky? {level=medium}
**Say this:** "Passing functions without naming their arguments, like `map(Number)`. It is risky when the function accepts more parameters than you intend, like `map(parseInt)` where the index becomes the radix."

**In simple words:** Short is good, but check what arguments will really be passed.
:::

```quiz
? What does `pipe(f, g)(x)` compute?
- f(g(x))
+ g(f(x))
- f(x) + g(x)
> pipe goes left to right.
? What does `["1","2","3"].map(parseInt)` return?
- [1, 2, 3]
+ [1, NaN, NaN]
- [NaN, NaN, NaN]
> parseInt gets (item, index): the index is used as the radix.
? What is a good use of `tap` in a pipeline?
- Changing the value
+ Logging the value without changing it, for debugging
- Making it async
> It returns the value unchanged.
```

:::keypoints
- **Composition**: output of one function feeds the next. `pipe` = left→right (`reduce`), `compose` = right→left (`reduceRight`).
- Compose **small, pure, unary** functions. Curry to fit extra arguments.
- Data-last style makes functions pipeline-friendly.
- Use `tap` to debug. Beware point-free with `parseInt`.
:::
