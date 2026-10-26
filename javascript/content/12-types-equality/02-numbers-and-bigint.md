---
title: Numbers, floating point and BigInt
level: intermediate
time: 25
summary: Why 0.1 + 0.2 is not 0.3, safe integers, rounding and toFixed, NaN and Infinity, parseInt vs Number, BigInt, and how to handle money correctly.
---

## All numbers are 64-bit floats

JavaScript has **one number type** for integers and decimals: a 64-bit **IEEE 754 double**. It stores a number as binary with limited precision.

```js run title="The famous result"
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
console.log(0.1 * 3, 0.7 + 0.1, 1.1 + 2.2);
console.log(9007199254740992 === 9007199254740993);       // beyond 2^53, integers lose precision
```

Why? `0.1` has no exact binary form, just like `1/3` has no exact decimal form (0.3333...). The tiny error shows up in the result. This happens in **every** language that uses doubles, not just JavaScript.

### Comparing floats safely

```js run title="Use a tolerance (epsilon)"
const nearlyEqual = (a, b) => Math.abs(a - b) < Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

console.log(nearlyEqual(0.1 + 0.2, 0.3));
console.log(Number.EPSILON);
```

## Safe integers

Integers are exact only up to **2⁵³ − 1** (`Number.MAX_SAFE_INTEGER`, 9,007,199,254,740,991).

```js run title="The safe range"
console.log(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
console.log(Number.isSafeInteger(2 ** 53 - 1), Number.isSafeInteger(2 ** 53));
console.log(2 ** 53 + 1, 2 ** 53 + 2);                    // the +1 is lost
console.log(Number.MAX_VALUE, Number.MIN_VALUE);          // the largest/smallest representable (not "safe")
console.log(Number.MAX_VALUE * 2, -Number.MAX_VALUE * 2);   // Infinity, -Infinity
```

Large IDs from databases or APIs (Twitter/Snowflake IDs, 64-bit integers) can be **silently corrupted** when parsed as numbers. Use **strings** or **BigInt** for them.

```js run title="A big ID corrupted by JSON.parse"
const raw = '{"id": 1234567890123456789}';
console.log(JSON.parse(raw).id);                           // not the same digits!
console.log(BigInt("1234567890123456789"));                // exact
```

## NaN, Infinity and -0

```js run title="Special values"
console.log(0 / 0, 1 / 0, -1 / 0, Math.sqrt(-1), parseInt("abc"), Number(undefined), undefined + 1);
console.log(NaN === NaN, Number.isNaN(NaN), Object.is(NaN, NaN), [NaN].includes(NaN));
console.log(Number.isFinite(Infinity), Number.isFinite("5"), isFinite("5"));        // the global isFinite coerces

console.log(0 === -0, Object.is(0, -0), 1 / -0, -0 + "", JSON.stringify(-0), Math.round(-0.4));
```

`NaN` is **contagious**: any arithmetic with `NaN` gives `NaN`. It is the only value not equal to itself.

## Converting strings to numbers

| Function | `"42px"` | `""` | `"  7 "` | `"0x1f"` | `null` | `true` |
|---|---|---|---|---|---|---|
| `Number(x)` | `NaN` | `0` | `7` | `31` | `0` | `1` |
| `parseInt(x, 10)` | `42` | `NaN` | `7` | `0` (stops at x) | `NaN` | `NaN` |
| `parseFloat(x)` | `42` | `NaN` | `7` | `0` | `NaN` | `NaN` |
| `+x` (unary plus) | same as `Number` | | | | | |

```js run title="Number vs parseInt vs parseFloat"
const inputs = ["42px", "", "  7 ", "0x1f", "3.14abc", "1e3", null, true, "12.5"];
for (const x of inputs) {
  console.log(String(JSON.stringify(x)).padEnd(10), "Number:", String(Number(x)).padEnd(4), "parseInt:", String(parseInt(x, 10)).padEnd(4), "parseFloat:", parseFloat(x));
}
```

**Always pass the radix** to `parseInt`: `parseInt("08", 10)`. Use `Number()` when the **whole** string must be numeric, and `parseInt`/`parseFloat` when you want to read a **leading** number (`"42px"`).

## Rounding and formatting

```js run title="Rounding"
console.log(Math.round(2.5), Math.round(-2.5), Math.round(1.005 * 100) / 100);     // round half up (towards +Infinity)
console.log(Math.floor(-1.5), Math.ceil(-1.5), Math.trunc(-1.5));
console.log((1.005).toFixed(2), (2.5).toFixed(0), (1234.5678).toFixed(1));         // toFixed returns a STRING
console.log(typeof (1.5).toFixed(1), +(1.005).toFixed(2));
console.log(Math.round(1.255 * 100) / 100, Number(Math.round(1.255 + "e2") + "e-2"));   // the exponent trick avoids the float error
console.log((1234567.891).toLocaleString("en-IN"), (1234567.891).toLocaleString("en-US"));
console.log(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(1234567.5));
```

## BigInt: integers of any size

Add `n` to a number, or call `BigInt(...)`.

```js run title="BigInt"
const big = 9007199254740993n;
console.log(big, big + 1n, big * big);
console.log(typeof big, 5n / 2n, 5n % 2n, 2n ** 100n);

try { console.log(1n + 1); } catch (e) { console.log(e.name + ": " + e.message); }     // no mixing
console.log(1n + BigInt(1), Number(10n) + 1);

console.log(1n < 2, 2n == 2, 2n === 2, 0n ? "truthy" : "falsy");                       // comparisons mix, equality does not
try { JSON.stringify({ n: 1n }); } catch (e) { console.log(e.name + ": " + e.message); }
console.log(BigInt.asUintN(8, 257n));
```

Rules: no mixing with `Number` in arithmetic; no `Math.*`; no JSON by default; no decimals. Use it for **big integers**, exact IDs, and some cryptography.

## Money: do not use floating point

```js run title="Handling money"
// BAD: float rupees
console.log(0.1 + 0.2, 19.99 * 100, 1.15 * 100);

// GOOD 1: integer paise (smallest unit)
const priceInPaise = 1999;
const qty = 3;
const totalPaise = priceInPaise * qty;
console.log(totalPaise, (totalPaise / 100).toFixed(2));

// GOOD 2: format only at the edge
const fmt = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
console.log(fmt(totalPaise));

// percentage with integers: 18% GST on 1999 paise, rounded
console.log(Math.round((1999 * 18) / 100));
```

For serious financial work use **integer minor units**, a decimal library (`decimal.js`, `big.js`), or the database `DECIMAL` type, never `Number` with fractions.

## Useful number methods

```js run title="Handy utilities"
console.log(Math.max(), Math.min(), Math.max(...[3, 9, 2]), Math.hypot(3, 4), Math.sign(-8), Math.cbrt(27));
console.log(Number("1_000"), 1_000_000, 0b1010, 0o17, 0xff, 1e3, 5e-7);
console.log((255).toString(16), (255).toString(2), parseInt("ff", 16), (0.5).toString(2));
console.log(Number.parseFloat("1.5"), Number.parseInt("7", 10), Number.EPSILON > 0);
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
console.log(random(1, 6) >= 1);
```

:::interview Why is 0.1 + 0.2 !== 0.3 in JavaScript? How do you handle decimals and large integers?
"JavaScript numbers are 64-bit IEEE 754 doubles. 0.1 and 0.2 cannot be represented exactly in binary, so their sum is 0.30000000000000004. It is the same in most languages. To compare I use a tolerance like `Number.EPSILON`, or round for display with `toFixed` or `Intl.NumberFormat`. For money I use integer minor units (paise or cents), or a decimal library, never floats. Integers are exact only up to `Number.MAX_SAFE_INTEGER` (2^53 − 1), so for larger IDs I use strings or `BigInt`, which cannot be mixed with Number in arithmetic."
:::

## More interview questions on this topic

:::qa What is `Number.MAX_SAFE_INTEGER`? {level=easy}
**Say this:** "2⁵³ − 1 = 9007199254740991, the largest integer such that it and all smaller integers can be represented exactly. Above it, integers can lose precision."

**In simple words:** After this, some whole numbers are skipped.
:::

:::qa What is the difference between `Number("12px")`, `parseInt("12px")` and `parseFloat("12.5px")`? {level=easy}
**Say this:** "`Number` needs the whole string to be numeric, so `NaN`. `parseInt` and `parseFloat` read a leading number and stop at the first invalid character: 12 and 12.5."

**In simple words:** Number is strict. parse* is forgiving.
:::

:::qa How do you check for NaN? {level=easy}
**Say this:** "`Number.isNaN(x)` or `Object.is(x, NaN)`. `x === NaN` is always false, and the global `isNaN` coerces its argument first."

**In simple words:** NaN is not equal to anything, even itself.
:::

:::qa What can't you do with BigInt? {level=medium}
**Say this:** "Mix it with Number in arithmetic, use `Math` functions, use decimals, or call `JSON.stringify` directly (it throws)."

**In simple words:** It is a separate world of whole numbers.
:::

```quiz
? What is 0.1 + 0.2 === 0.3?
- true
+ false
- NaN
> Floating-point rounding error.
? What does `1n + 1` do?
- 2
- 2n
+ Throws a TypeError
> BigInt and Number cannot be mixed.
? Which is the best way to store money?
- Floating-point rupees
+ Integer paise (minor units) or a decimal library
- Strings only
> Avoid floating point for money.
```

:::keypoints
- All numbers are **64-bit doubles**: `0.1 + 0.2 !== 0.3`. Compare with a tolerance; round for display.
- Exact integers only up to **2⁵³ − 1**. Use **BigInt** or strings for bigger IDs.
- `NaN` is contagious and not equal to itself: use `Number.isNaN`.
- `Number()` (strict) vs `parseInt(x, 10)` / `parseFloat` (leading number). Always give `parseInt` a radix.
- **Money** = integer minor units, or a decimal library. Format with `Intl.NumberFormat`.
:::
