---
title: A tour of modern JavaScript (ES2015 to ES2025)
level: intermediate
time: 35
summary: The language features added since ES2015 that senior interviews take for granted, with a runnable example for each: templates, tagged templates, regex features, new array and object methods, promise helpers, error cause, and what is coming next.
---

JavaScript gets a new version every year (ES2015, ES2016 ... ES2025). You do not need the dates. You need to know **what exists** and **when to use it**. This lesson is a fast, runnable tour. (Features you already met in other lessons are only listed.)

## Already covered in this course

`let/const`, arrow functions, classes, default/rest/spread, destructuring, modules, iterators/generators, symbols, `Map/Set/WeakMap`, `Proxy/Reflect`, promises, `async/await`, `async iterators`, optional chaining `?.`, nullish `??`, logical assignment, private fields, `BigInt`, `globalThis`, `structuredClone`, `Object.fromEntries`, `Object.hasOwn`, top-level `await`.

## Template literals and tagged templates

```js run title="Template literals"
const name = "Asha", n = 3;
console.log(`Hello ${name}, you have ${n} new ${n === 1 ? "message" : "messages"}.`);
console.log(`line 1
line 2 (a real newline)`);
console.log(`1 + 2 = ${1 + 2}`, `nested: ${`inner ${name.toUpperCase()}`}`);
```

A **tag** is a function placed before a template. It receives the **string parts** and the **values**, and can do anything: escape HTML, translate, format, build SQL safely.

```js run title="Tagged templates"
function html(strings, ...values) {
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return strings.reduce((out, str, i) => out + str + (i < values.length ? escape(values[i]) : ""), "");
}

const userInput = `<img src=x onerror="alert(1)">`;
console.log(html`<p>Hello ${userInput}</p>`);                    // the input is escaped automatically

const sql = (strings, ...values) => ({ text: strings.reduce((q, s, i) => q + s + (i < values.length ? `$${i + 1}` : ""), ""), values });
console.log(sql`SELECT * FROM users WHERE id = ${7} AND role = ${"admin"}`);   // parameters, not string concatenation
console.log(String.raw`C:\temp\new`);                           // raw strings: no escape processing
```

Libraries like styled-components, `lit-html`, GraphQL `gql` and `sql-template-strings` use tagged templates.

## Array and object additions

```js run title="Newer array methods"
const nums = [5, 1, 4, 2, 3];

console.log(nums.at(-1), nums.findLast((n) => n > 3), nums.findLastIndex((n) => n > 3));   // ES2022/2023
console.log(nums.toSorted(), nums.toReversed(), nums.toSpliced(1, 2, "x"), nums.with(0, 99), nums);   // ES2023: copies, no mutation
console.log([1, [2, [3]]].flat(Infinity), [1, 2].flatMap((x) => [x, x * 10]));                          // ES2019
console.log(Array.from({ length: 3 }, (_, i) => i), Array.of(7), [1, 2, 3].includes(2));

console.log(Object.groupBy(["apple", "avocado", "banana"], (w) => w[0]));                              // ES2024
console.log(Object.entries({ a: 1 }), Object.fromEntries([["b", 2]]), Object.hasOwn({ x: 1 }, "x"));
```

## Strings

```js run title="String methods"
console.log("a-b-c".replaceAll("-", "+"), "abc".at(-1), "5".padStart(3, "0"), "tab".padEnd(6, ".") + "|");
console.log("  trim  ".trimStart() + "|", "x".repeat(3), "Hello".includes("ell"), "abc".startsWith("ab"));
console.log("ab\uD800".isWellFormed(), "ab\uD800".toWellFormed().length);                 // ES2024: lone surrogates
console.log("İstanbul".toLocaleLowerCase("tr"), "i".toLocaleUpperCase("tr"));
```

## Regular expression features

```js run title="Named groups, lookbehind, matchAll, indices"
const date = "Released on 2024-03-15 and patched 2024-04-02.";

const re = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/g;
for (const m of date.matchAll(re)) console.log(m.groups.year, m.groups.month, m.groups.day, "at", m.index);

console.log(date.replace(/(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/, "$<d>/$<m>/$<y>"));          // named group in replacement
console.log("price: $45, cost: €30".match(/(?<=\$)\d+/)[0], "price: $45, cost: €30".match(/\d+(?=\D*$)/)[0]);   // lookbehind / lookahead
console.log(/a.c/s.test("a\nc"), /^b/m.test("a\nb"), "aBc".match(/b/i).index);               // s (dotAll), m, i flags
console.log(/(?<word>\w+)/d.exec("hello world").indices.groups.word);                         // d flag: match indices
console.log(/\p{L}+/u.exec("héllo wörld!")[0], /\p{Emoji}/u.test("😀"));                       // Unicode property escapes
```

## Errors, promises and async

```js run title="Error cause, AggregateError, promise helpers"
try {
  try { JSON.parse("{bad"); } catch (e) { throw new Error("config unreadable", { cause: e }); }
} catch (e) { console.log(e.message, "<-", e.cause.name); }

Promise.any([Promise.reject(new Error("a")), Promise.reject(new Error("b"))]).catch((e) => console.log(e.constructor.name, e.errors.length));
Promise.allSettled([Promise.resolve(1), Promise.reject("x")]).then((r) => console.log(r.map((x) => x.status)));
const { promise, resolve } = Promise.withResolvers();
promise.then((v) => console.log("withResolvers:", v));
resolve("ok");
Array.fromAsync((async function* () { yield 1; yield 2; })()).then((a) => console.log("fromAsync:", a));
```

```js run title="Optional catch binding, exponent, numeric separators, labelled blocks"
try { JSON.parse("x"); } catch { console.log("no need to name the error"); }            // ES2019
console.log(2 ** 10, (-2) ** 3, 1_000_000, 0b1010_1010, 0xFF_EC);                       // ES2016, ES2021
outer: for (const i of [1, 2, 3]) {
  for (const j of [1, 2, 3]) {
    if (j === 2) continue outer;                                                         // labelled continue
    if (i === 3) break outer;
    console.log(i, j);
  }
}
```

## Classes and objects

```js run title="Class fields, private methods, static blocks, accessors"
class Counter {
  static #instances = 0;
  static { Counter.defaults = { start: 10 }; }                    // static block
  #count;
  constructor() { this.#count = Counter.defaults.start; Counter.#instances++; }
  #bump() { return ++this.#count; }                                // private method
  inc() { return this.#bump(); }
  static get instances() { return Counter.#instances; }
  static isCounter(o) { return #count in o; }                      // brand check
}
const c = new Counter();
console.log(c.inc(), Counter.instances, Counter.isCounter(c), Counter.isCounter({}));

const key = "dynamic";
const obj = { [key + "Key"]: 1, method() { return "m"; }, get computed() { return 42; }, async *stream() {}, ...{ spread: true } };
console.log(obj);
```

## Where to look for new features

| Stage | Meaning |
|---|---|
| **TC39 stage 4** | finished, in the next yearly spec (safe to use when your targets support it) |
| **Stage 3** | candidate: engines are implementing (`Temporal`, decorators, explicit resource management `using`) |
| **Stages 0 to 2** | ideas: do not rely on them |

Look up support on **MDN** and **caniuse.com**, **node.green** for Node, and the **TC39 proposals** repository. Use **Babel** or **TypeScript** to compile newer syntax down for older targets, and **polyfills** (such as `core-js`) for missing methods.

A few features on the horizon, worth mentioning in interviews:

- **`Temporal`**: a modern replacement for `Date` (time zones, calendars, immutable values).
- **Decorators** (`@log method() {}`): metaprogramming for classes.
- **Explicit resource management** (`using file = open()`): automatic cleanup at scope end.
- **Records and tuples** (immutable by value): `#{a: 1}`: still being designed.
- **Pipeline operator** (`value |> fn`) and **pattern matching**: proposals.

:::interview Name modern JavaScript features you use regularly.
"Day to day: `const/let`, arrow functions, destructuring and spread, template literals, modules, classes with private fields, optional chaining and nullish coalescing, `async/await` with `Promise.all/allSettled`, `Array.at`, `flatMap`, `structuredClone`, `Object.fromEntries`/`groupBy`, `toSorted` and other non-mutating array methods, named groups in regexes, `AbortController`, and `Error` with `cause`. I check MDN and node.green for support, and compile with Babel or TypeScript for older targets."
:::

## More interview questions on this topic

:::qa What is a tagged template literal? {level=medium}
**Say this:** "A function placed before a template string. It receives the array of string parts and the interpolated values, and can return anything. It is used for escaping HTML, safe SQL, styled-components and i18n."

**In simple words:** The function gets to process the template before it becomes text.
:::

:::qa What do named capture groups give you? {level=easy}
**Say this:** "Readable access to matches by name (`m.groups.year`) instead of by index, and named references in replacements (`$<year>`)."

**In simple words:** Name the pieces instead of counting parentheses.
:::

:::qa Which array methods return a copy instead of mutating? {level=easy}
**Say this:** "`toSorted`, `toReversed`, `toSpliced` and `with` (ES2023), plus the older `map`, `filter`, `slice`, `concat`, `flat`."

**In simple words:** The "to..." versions leave the original alone.
:::

:::qa How do you use a feature that older browsers lack? {level=medium}
**Say this:** "Transpile new syntax with Babel or TypeScript, add polyfills (core-js) for missing methods, and use a browserslist to decide the targets."

**In simple words:** Compile the syntax, polyfill the methods.
:::

```quiz
? What does `[1, 2, 3].at(-1)` return?
- 1
+ 3
- undefined
> Negative indexes count from the end.
? What is a tag in a tagged template?
- A comment
+ A function called with the template's strings and values
- A symbol
> html`<p>${x}</p>` calls html(strings, x).
? Which feature gives readable regex matches?
- Lookahead
+ Named capture groups
- Sticky flag
> (?<year>\d{4}) then m.groups.year.
```

:::keypoints
- **Template literals** and **tagged templates** (escaping, safe SQL, styling).
- Array: `at`, `findLast`, `flat/flatMap`, `toSorted/toReversed/toSpliced/with`, `Object.groupBy`.
- Strings: `replaceAll`, `padStart/End`, `at`, `isWellFormed`. Regex: **named groups, lookbehind, `matchAll`, `d`, `s`, `u`/`v`**.
- Promises: `allSettled`, `any`, `withResolvers`; errors: `{ cause }`, `AggregateError`.
- Check **MDN / caniuse / node.green**; transpile with Babel/TypeScript, polyfill with core-js.
:::
