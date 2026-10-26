---
title: ==, === and Object.is
level: easy
time: 25
summary: Strict equality, loose equality and the exact steps of ==, Object.is and SameValueZero, which one each API uses (includes, Map, switch), and a simple rule for when ever to use ==.
---

## Four kinds of "equal"

| Operator / API | Name | Differences |
|---|---|---|
| `===` | **Strict equality** | No conversion. `NaN !== NaN`, `+0 === -0` |
| `==` | **Loose equality** | Converts types first (rules below) |
| `Object.is(a, b)` | **SameValue** | Like `===`, but `NaN` equals `NaN` and `+0` differs from `-0` |
| *SameValueZero* | used inside `includes`, `Map`, `Set` | Like `Object.is`, but `+0` equals `-0` |

```js run title="The differences in one table"
const pairs = [[NaN, NaN], [0, -0], [1, "1"], [null, undefined], [{}, {}], ["a", "a"]];
const show = (v) => (Object.is(v, -0) ? "-0" : typeof v === "string" ? JSON.stringify(v) : typeof v === "object" && v ? "{}" : String(v));

for (const [a, b] of pairs) {
  console.log(
    `${show(a)} vs ${show(b)}`.padEnd(18),
    "===", String(a === b).padEnd(5),
    "==", String(a == b).padEnd(5),
    "Object.is", Object.is(a, b),
  );
}

console.log([NaN].includes(NaN), [NaN].indexOf(NaN));          // includes: SameValueZero; indexOf: ===
console.log(new Set([NaN, NaN, 0, -0]).size);                   // Set uses SameValueZero: NaN once, 0 once
```

## `===` (strict equality): use this by default

If the types differ, the result is `false`. If both are the same type, compare values. For objects, compare **references**.

```js run title="Strict equality"
console.log(1 === 1, 1 === "1", "a" === "a", true === 1, null === undefined);
console.log({} === {}, [] === [], [1] === [1]);

const a = { n: 1 };
const b = a;
console.log(a === b);                                           // same reference
```

## `==` (loose equality): the algorithm

If the types are the **same**, `==` works exactly like `===`. If they differ, JavaScript applies these rules (simplified, in this order):

1. `null == undefined` is **true**. And `null`/`undefined` are loosely equal to **nothing else**.
2. **Number vs String**: convert the string to a number.
3. **Boolean vs anything**: convert the boolean to a number (`true` → 1, `false` → 0), then compare again.
4. **Object vs primitive (string, number, symbol)**: convert the object with `ToPrimitive` (calls `valueOf` / `toString`), then compare again.
5. **BigInt vs Number/String**: compare the mathematical values.
6. Otherwise: `false`.

```js run title="Rules in action"
console.log(null == undefined, null == 0, null == false, undefined == 0);   // rule 1: only each other
console.log(1 == "1", 0 == "", "0" == 0, "  " == 0);                         // rule 2: string -> number
console.log(true == 1, true == "1", false == "", false == "0", true == "true");  // rule 3: boolean -> number first
console.log([1] == 1, [1, 2] == "1,2", ({}) == "[object Object]");          // rule 4: object -> primitive
console.log(1n == 1, 1n == "1");                                             // rule 5
```

Walk through a famous one: `[] == false`.

1. Boolean on one side → `false` becomes `0`. Now `[] == 0`.
2. Object vs number → `[]` is converted with `ToPrimitive`: `[].toString()` is `""`. Now `"" == 0`.
3. String vs number → `""` becomes `0`. Now `0 == 0` → **true**.

And why `[] == ![]` is `true`: `![]` is `false` (an object is truthy, `!` negates it), so we get `[] == false`, which we just solved as `true`.

```js run title="Surprising but explainable"
console.log([] == false, [] == ![], "" == false, "0" == false, [0] == false, [[]] == 0);
console.log(NaN == NaN, "b" + "a" + +"a" + "a");                              // the "baNaNa" joke: +"a" is NaN
```

## When (if ever) to use `==`

The one widely accepted use: `x == null`, which is `true` for **both `null` and `undefined`**.

```js run title="x == null"
const values = [null, undefined, 0, "", false, NaN];
console.log(values.map((v) => v == null));                       // [true, true, false, false, false, false]
```

For everything else, use `===`. ESLint's `eqeqeq` rule (with `"null": "ignore"`) enforces this.

## `Object.is`: when you need the exact answer

```js run title="Object.is"
console.log(Object.is(NaN, NaN), NaN === NaN);
console.log(Object.is(0, -0), 0 === -0);
console.log(Object.is(1, 1), Object.is("a", "a"), Object.is({}, {}));
```

React uses `Object.is` to compare state and dependencies (that is why `setState(NaN)` twice does not re-render, and why `0` vs `-0` count as a change).

## Where else equality matters

```js run title="switch, includes, indexOf, Map keys"
function describe(x) {
  switch (x) {                                     // switch uses ===
    case 1: return "number one";
    case "1": return "string one";
    default: return "other";
  }
}
console.log(describe(1), describe("1"), describe(true));

console.log([1, 2, 3].includes("2"), [1, 2, 3].includes(2));
const m = new Map([[NaN, "nan key"], [0, "zero key"]]);
console.log(m.get(NaN), m.get(-0));                  // NaN key works; -0 equals 0
```

## Comparing objects by content: deep equality

Equality of objects checks **identity**, not content. For content, you need a **deep equal** function.

```js run title="A deepEqual (handles nested objects, arrays, dates, NaN and cycles)"
function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;                              // handles NaN, same reference
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (seen.get(a) === b) return true;                            // circular reference guard
  seen.set(a, b);
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return String(a) === String(b);
  if (a instanceof Map || a instanceof Set) {
    if (a.size !== b.size) return false;
    if (a instanceof Set) return [...a].every((v) => b.has(v));
    return [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k), seen));
  }
  const ka = Reflect.ownKeys(a), kb = Reflect.ownKeys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k], seen));
}

console.log(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
console.log(deepEqual({ a: 1 }, { a: 1, b: undefined }), deepEqual([1, 2], [1, 2, 3]));
console.log(deepEqual(NaN, NaN), deepEqual(new Date(5), new Date(5)), deepEqual(new Set([1]), new Set([1])));
const x = { n: 1 }; x.self = x;
const y = { n: 1 }; y.self = y;
console.log(deepEqual(x, y));
```

In production use `node:util`'s `isDeepStrictEqual`, `assert.deepStrictEqual`, or lodash `isEqual`.

:::interview What is the difference between == and ===? Explain [] == false.
"`===` compares without conversion: different types are not equal, and objects compare by reference. `==` converts types first: null and undefined equal only each other, a string compared with a number becomes a number, a boolean becomes a number, and an object is converted with ToPrimitive. So `[] == false`: false becomes 0, the empty array becomes the string '' via toString, then '' becomes 0, and 0 == 0 is true. I use `===` always, except `x == null` to test for null or undefined. `Object.is` differs from `===` for NaN and for ±0, and React uses it."
:::

## More interview questions on this topic

:::qa What does `Object.is` do differently from `===`? {level=medium}
**Say this:** "`Object.is(NaN, NaN)` is true and `Object.is(0, -0)` is false, the reverse of `===` for those two cases."

**In simple words:** The "most exact" comparison.
:::

:::qa Why is `NaN !== NaN`? How do you compare two NaN? {level=easy}
**Say this:** "The IEEE 754 standard says NaN is unequal to everything including itself. I use `Number.isNaN` or `Object.is`."

**In simple words:** Two "not a number" results are not necessarily the same.
:::

:::qa Which equality does `Array.prototype.includes` use? And `indexOf`? {level=hard}
**Say this:** "`includes` uses SameValueZero, so it finds NaN. `indexOf` uses strict equality, so it does not."

**In simple words:** includes is "smarter" about NaN.
:::

:::qa How would you compare two objects by value? {level=medium}
**Say this:** "Write or import a deep equal that compares prototypes, own keys and values recursively, handling NaN, dates, maps, sets and cycles; or use `assert.deepStrictEqual` / lodash `isEqual`. `JSON.stringify` comparison is a quick but lossy shortcut."

**In simple words:** `===` asks "same object?". Deep equal asks "same content?".
:::

```quiz
? What does `null == 0` give?
- true
+ false
- NaN
> null is loosely equal only to undefined.
? What does `Object.is(-0, 0)` give?
- true
+ false
- undefined
> Object.is distinguishes +0 and -0.
? When is `==` generally acceptable?
- Always
+ For `x == null` to check null or undefined
- Never in any case
> That is the common exception.
```

:::keypoints
- **`===`** by default. **`x == null`** is the one good `==` use. Objects compare by **reference**.
- `==` rules: null/undefined only equal each other; string→number; boolean→number; object→primitive.
- **`Object.is`**: NaN equals NaN, +0 ≠ −0. **SameValueZero** (`includes`, `Map`, `Set`): NaN equals NaN, +0 = −0.
- `switch` uses `===`. React compares with `Object.is`.
- **Deep equality** needs a recursive function (or `assert.deepStrictEqual`, `isEqual`).
:::
