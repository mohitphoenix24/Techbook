---
title: Type coercion and ToPrimitive
level: intermediate
time: 30
summary: How JavaScript converts values automatically (strings, numbers, booleans), the rules for +, -, comparison and conditions, how objects become primitives with valueOf, toString and Symbol.toPrimitive, and how to explain the weird examples.
---

## Coercion: automatic type conversion

JavaScript converts values to other types when an operator or function expects a different type. This is **coercion** (**implicit**), versus a conversion you write yourself (**explicit**: `Number(x)`, `String(x)`, `Boolean(x)`).

Don't memorise weird examples. Learn the **three abstract conversions**, and everything else follows:

| Conversion | Used by | Result |
|---|---|---|
| **ToBoolean** | `if`, `!`, `&&`, `||`, `?:`, `Boolean()` | falsy: `false, 0, -0, 0n, "", null, undefined, NaN`; everything else is true |
| **ToNumber** | `-`, `*`, `/`, `%`, `**`, unary `+`, `<`, `>`, `Number()` | `""` → 0, `" 12 "` → 12, `"abc"` → NaN, `true` → 1, `false` → 0, `null` → 0, `undefined` → NaN, `[]` → 0, `[5]` → 5 |
| **ToString** | template literals, `String()`, `+` with a string | `null` → `"null"`, `undefined` → `"undefined"`, `[1,2]` → `"1,2"`, `{}` → `"[object Object]"` |

And one more for **objects**: **ToPrimitive**, which turns an object into a primitive first.

## The `+` operator: the special one

`+` does **string concatenation or numeric addition**, by this rule:

> "Convert both operands to **primitives**. If **either** is a **string**, convert both to strings and join. Otherwise convert both to numbers and add."

All other arithmetic operators (`-`, `*`, `/`...) **always** convert to numbers.

```js run title="+ versus the other operators"
console.log(1 + "2", "3" + 4, 1 + 2 + "3", "1" + 2 + 3);         // string if ANY side is a string; left to right
console.log("5" - 2, "5" * "2", "10" / 4, "a" - 1, "5" + - "2");  // -, *, / always number
console.log(true + 1, null + 1, undefined + 1, [] + 1, [] + [], {} + [], [1] + [2]);
console.log(+"42", +"", +" 3 ", +"4px", +true, +null, +undefined, +[], +[7], +{});    // unary plus = ToNumber
console.log(`${[1, 2]}`, `${{}}`, `${null}`, String(Symbol("s")));
```

Walk through two: `1 + 2 + "3"`: `(1 + 2) + "3"` = `3 + "3"` = `"33"`. And `"1" + 2 + 3` = `"12" + 3` = `"123"`. Left to right.

## ToPrimitive: how objects become primitives

When an object meets an operator that needs a primitive, JavaScript calls `ToPrimitive(obj, hint)`, where **hint** is `"string"`, `"number"` or `"default"`:

1. If the object has **`[Symbol.toPrimitive](hint)`**, call it.
2. Otherwise, hint `"string"` → try **`toString()`** then **`valueOf()`**; hint `"number"` or `"default"` → try **`valueOf()`** then **`toString()`**. Use the first that returns a **primitive**.
3. If neither does, throw a `TypeError`.

| Operation | Hint |
|---|---|
| Template literal `${obj}`, `String(obj)`, property key `o[obj]` | `"string"` |
| `Number(obj)`, unary `+obj`, `-`, `*`, `<`, `>` | `"number"` |
| `+` (binary), `==`, `Date` constructor | `"default"` (same as number, except `Date` which treats it as string) |

```js run title="Control the conversion"
const price = {
  amount: 50,
  valueOf() { console.log("  valueOf called"); return this.amount; },
  toString() { console.log("  toString called"); return `₹${this.amount}`; },
};

console.log("template:", `${price}`);               // hint string: toString first
console.log("minus:", price - 10);                   // hint number: valueOf first
console.log("plus:", price + 10);                    // hint default: valueOf first, then add numbers
console.log("string concat:", "Total: " + price);    // default hint: valueOf -> 50, so "Total: 50", not the symbol!
console.log("compare:", price > 40);
```

Notice `"Total: " + price` uses `valueOf()` (**not** `toString()`). If you want a string, use a template literal or `String(price)`.

### `Symbol.toPrimitive`: the modern way

```js run title="Symbol.toPrimitive"
const temperature = {
  celsius: 30,
  [Symbol.toPrimitive](hint) {
    console.log("  hint:", hint);
    if (hint === "number") return this.celsius;
    if (hint === "string") return `${this.celsius}°C`;
    return this.celsius;                              // default
  },
};

console.log(+temperature);
console.log(`${temperature}`);
console.log(temperature + 5);
console.log(temperature * 2, temperature > 25);
```

Built-ins use this: `Date` has `[Symbol.toPrimitive]`, with `"default"` treated as **string**, so `date + 1` concatenates, while `date - 1` subtracts.

```js run title="Dates: + concatenates, - subtracts"
const d = new Date(Date.UTC(2024, 0, 15));
console.log(typeof (d + 1), typeof (d - 1));
console.log(d - new Date(Date.UTC(2024, 0, 14)), "ms between the dates");
```

## Comparison operators

`<`, `>`, `<=`, `>=`:

- If **both are strings**: compared **alphabetically** by UTF-16 code units.
- Otherwise: both converted to **numbers**.

```js run title="Comparison coercion"
console.log("10" < "9", 10 < "9", "a" < "b", "B" < "a", null >= 0, null > 0, null == 0, undefined > 0, undefined == 0);
console.log("2" > "12", 2 > "12", [2] > 1, "abc" < "abd");
console.log(NaN < 1, NaN > 1, NaN >= NaN);
```

`null >= 0` is **true** (null → 0) but `null == 0` is **false** (rule: null equals only undefined). A famous quirk of different algorithms for relational vs equality operators.

## Explaining the famous weird examples

| Expression | Result | Why |
|---|---|---|
| `[] + []` | `""` | both `[]` → `""`, string concat |
| `[] + {}` | `"[object Object]"` | `"" + "[object Object]"` |
| `{} + []` (as a **statement**) | `0` | `{}` is parsed as an empty **block**, then `+[]` → `0` |
| `({}) + []` | `"[object Object]"` | the parentheses make `{}` an object |
| `[] == ![]` | `true` | `![]` is `false` → `[] == false` → `"" == 0` → `0 == 0` |
| `"b" + "a" + +"a" + "a"` | `"baNaNa"` | `+"a"` is `NaN`, then converted to `"NaN"` |
| `1 < 2 < 3` / `3 > 2 > 1` | `true` / `false` | `(1<2)` → `true` → `true < 3` → `1 < 3`; `(3>2)` → `true` → `true > 1` → `1 > 1` false |
| `0.1 + 0.2 === 0.3` | `false` | floating point, not coercion |
| `typeof NaN` | `"number"` | NaN is a numeric value |
| `9999999999999999` | `10000000000000000` | beyond the safe integer range |

```js run title="Check the table"
console.log([] + [], [] + {}, ({}) + [], [] == ![], "b" + "a" + +"a" + "a");
console.log(1 < 2 < 3, 3 > 2 > 1, 9999999999999999);
```

## Explicit conversion: the recommended way

```js run title="Be explicit"
const input = "42";
console.log(Number(input) + 1, parseInt(input, 10) + 1, +input + 1, ~~input + 1, input * 1 + 1);
console.log(String(42), (42).toString(), `${42}`, 42 + "");
console.log(Boolean("x"), !!"x", !!"", !!0, !!"0");
console.log(Number(""), Number(" "), Number("12px"), Number(null), Number(undefined), Number([]), Number([1, 2]), Number({}), Number(true));
```

:::tip Good habits
- Convert **explicitly** (`Number`, `String`, `Boolean`), so the intent is clear.
- Use `===`, and `??` instead of `||` for defaults.
- Never rely on the order of `valueOf`/`toString` in clever tricks. If your class needs a string form, define `toString()` or `[Symbol.toPrimitive]`.
- TypeScript catches most coercion bugs at compile time.
:::

:::interview How does type coercion work? What is ToPrimitive?
"JavaScript converts values with three abstract operations: ToBoolean, ToNumber and ToString. The `+` operator converts both operands to primitives, and if either is a string it concatenates, otherwise it adds numbers; `-`, `*` and `/` always use numbers. When an object has to become a primitive, ToPrimitive uses `Symbol.toPrimitive` if present, otherwise `valueOf` then `toString` for number or default hints, and `toString` then `valueOf` for the string hint, taking the first primitive result. That explains `[] + {}`, `[] == false`, and why a Date plus a number concatenates but minus subtracts. In real code I convert explicitly and use strict equality."
:::

## More interview questions on this topic

:::qa What is the output of `1 + "2" + 3` and `1 + 2 + "3"`? {level=easy}
**Say this:** "`'123'` and `'33'`. `+` goes left to right: once a string appears, the rest is concatenation."

**In simple words:** Numbers add until the first string shows up.
:::

:::qa What is a hint in ToPrimitive? {level=hard}
**Say this:** "A string `'string'`, `'number'` or `'default'` that tells the object which kind of primitive is wanted. It decides the order in which `toString` and `valueOf` are tried, or is passed to `Symbol.toPrimitive`."

**In simple words:** The operator tells the object "give me a string" or "give me a number".
:::

:::qa Why is `null >= 0` true but `null == 0` false? {level=hard}
**Say this:** "Relational operators convert to numbers, so `null` becomes 0 and `0 >= 0` is true. Loose equality has its own rule: `null` equals only `undefined` (and itself), so `null == 0` is false."

**In simple words:** Two different rule books.
:::

:::qa How do you make a class convertible to a string and number? {level=medium}
**Say this:** "Define `toString()` for string contexts and `valueOf()` for numeric ones, or a single `[Symbol.toPrimitive](hint)` that switches on the hint."

**In simple words:** Tell JavaScript how your object wants to be turned into a plain value.
:::

```quiz
? What does `"5" + 3` give? And `"5" - 3`?
+ "53" and 2
- 8 and 2
- "53" and "2"
> + concatenates when a string is involved, - always uses numbers.
? Which operator call order is used for `${obj}`?
- valueOf then toString
+ toString then valueOf
- Only toString
> The string hint tries toString first.
? What is `[] + {}`?
- 0
- NaN
+ "[object Object]"
> Both become strings: "" + "[object Object]".
```

:::keypoints
- Three conversions: **ToBoolean, ToNumber, ToString**. Objects go through **ToPrimitive**.
- **`+`**: if either operand is a string → concatenate; else add numbers. `-`, `*`, `/` always → numbers.
- ToPrimitive: `Symbol.toPrimitive` → else `valueOf`/`toString` order by hint (string hint: `toString` first).
- `Date` treats the default hint as **string**. Relational operators use numbers (or string comparison if both are strings).
- Prefer **explicit** conversions and `===`.
:::
