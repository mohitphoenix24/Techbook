---
title: Coercion, equality and type puzzles
level: advanced
time: 30
summary: Fourteen type puzzles with reasons: +, ==, comparison, typeof, NaN, truthiness, copying and JSON. Use the rules from the previous lessons, not memory.
---

Write down your answers first. For each one, say **which rule** you used.

## Puzzle 1: plus

```js run title="Puzzle 1"
console.log(1 + "2" + 3, 1 + 2 + "3", "4" - 1 + "1", "4" + 1 - 1, +"3" + +"4");
```

:::hint Show the reason
Left to right: `"12" + 3` → `"123"`; `3 + "3"` → `"33"`; `"4" - 1` is `3`, then `3 + "1"` → `"31"`; `"4" + 1` is `"41"`, then `"41" - 1` → `40`; `+"3" + +"4"` → `7`. Output: `123 33 31 40 7`.
:::

## Puzzle 2: loose equality

```js run title="Puzzle 2"
console.log(null == 0, null == undefined, "" == 0, "0" == false, [] == "", [1] == 1, NaN == NaN);
```

:::hint Show the reason
`null` equals only `undefined`: `false true`. `"" == 0` → `0 == 0` true. `"0" == false` → `"0" == 0` → `0 == 0` true. `[] == ""` → `"" == ""` true. `[1] == 1` → `"1" == 1` true. `NaN == NaN` false. Output: `false true true true true true false`.
:::

## Puzzle 3: comparison

```js run title="Puzzle 3"
console.log("10" < "9", 10 < "9", "10" < 9, "a" < "b", null >= 0, undefined >= 0, "abc" < "abd");
```

:::hint Show the reason
Two strings compare alphabetically (`"1" < "9"` true). If one is a number, both become numbers (`10 < 9` false twice). `null >= 0` → `0 >= 0` true; `undefined >= 0` → `NaN >= 0` false. Output: `true false false true true false true`.
:::

## Puzzle 4: typeof

```js run title="Puzzle 4"
console.log(typeof typeof 1, typeof [] + typeof {}, typeof null, typeof undefined, typeof (() => {}), typeof 1n);
```

:::hint Show the reason
`typeof 1` is `"number"`, and `typeof "number"` is `"string"`. `typeof [] + typeof {}` → `"object" + "object"`. Output: `string objectobject object undefined function bigint`.
:::

## Puzzle 5: truthiness

```js run title="Puzzle 5"
const list = [0, "0", "", " ", [], {}, null, NaN, -0, "false", 0n, undefined];
console.log(list.map(Boolean));
console.log(list.filter(Boolean).length);
```

:::hint Show the reason
Falsy: `0`, `""`, `null`, `NaN`, `-0`, `0n`, `undefined`. Truthy: `"0"`, `" "`, `[]`, `{}`, `"false"`. Output: `[ false, true, false, true, true, true, false, false, false, true, false, false ]` and `5`.
:::

## Puzzle 6: objects as keys and in strings

```js run title="Puzzle 6"
const a = { toString() { return "A"; } };
const o = { A: 1, [a]: 2 };
console.log(o, `${a}`, a + "!", a + 1);
```

:::hint Show the reason
Property keys use the **string** hint, so `[a]` is `"A"` and overwrites the first key: `{ A: 2 }`. `${a}` → `"A"`. `a + "!"`: the default hint calls `valueOf` first, which returns the object itself (not a primitive), so `toString` is used: `"A!"`. `a + 1` → `"A1"`. Output: `{ A: 2 } A A! A1`.
:::

## Puzzle 7: valueOf vs toString

```js run title="Puzzle 7"
const x = { valueOf: () => 10, toString: () => "ten" };
console.log(x + 1, `${x}`, x * 2, String(x), x + "", x == 10, x == "ten");
```

:::hint Show the reason
`+`, `*`, `==` use the default/number hint → `valueOf` (10). Template and `String()` use the string hint → `toString`. `x + ""` uses the default hint → `10` then `"10"`. `x == "ten"` → default hint → `10 == "ten"` false. Output: `11 ten 20 ten 10 true false`.
:::

## Puzzle 8: NaN

```js run title="Puzzle 8"
console.log(NaN === NaN, [NaN].indexOf(NaN), [NaN].includes(NaN), isNaN("hello"), Number.isNaN("hello"), typeof NaN, NaN + 1);
```

:::hint Show the reason
`indexOf` uses `===`: `-1`. `includes` finds it. Global `isNaN` coerces first (`"hello"` → NaN): true; `Number.isNaN` does not: false. Output: `false -1 true true false number NaN`.
:::

## Puzzle 9: parseInt traps

```js run title="Puzzle 9"
console.log(parseInt("08"), parseInt("0x10"), parseInt("12abc"), parseInt(""), parseInt(0.0000005), parseInt(null), parseInt("Infinity"));
console.log(Number("12abc"), Number("  12  "), Number("1,000"), Number("1e3"));
```

:::hint Show the reason
`parseInt("08")` is 8 (modern engines). `"0x10"` is hex: 16. It stops at the first invalid character: 12. `""` → NaN. `parseInt(0.0000005)` converts the number to the string `"5e-7"` first: **5**. `parseInt(null)` → `"null"` → NaN. `"Infinity"` → NaN. Then `Number` needs the whole string: `NaN 12 NaN 1000`. Output: `8 16 12 NaN 5 NaN NaN` and `NaN 12 NaN 1000`.
:::

## Puzzle 10: array and object printing

```js run title="Puzzle 10"
console.log([1, 2] + [3], [] + [], ({}) + "", [null] + "", [undefined, 1] + "", String([[], [[]], [1, [2]]]));
```

:::hint Show the reason
Arrays join their elements with commas; `null` and `undefined` become empty strings. `[1,2] + [3]` → `"1,2" + "3"` → `"1,23"`. `[null] + ""` → `""`. `[undefined, 1] + ""` → `",1"`. `String([[], [[]], [1,[2]]])` → `",,1,2"`. Output: `1,23  [object Object]  ,1 ,,1,2` (empty strings print as nothing).
:::

## Puzzle 11: copy semantics

```js run title="Puzzle 11"
const a = { x: { y: 1 }, z: [1] };
const b = { ...a };
const c = structuredClone(a);
const d = JSON.parse(JSON.stringify(a));

b.x.y = 2; c.x.y = 3; d.x.y = 4;
console.log(a.x.y, b.x.y, c.x.y, d.x.y, a.z === b.z, a.z === c.z);
```

:::hint Show the reason
The spread copy `b` shares `x`, so changing `b.x.y` changes `a.x.y` too: both `2`. `c` and `d` are deep copies: their changes are independent. Output: `2 2 3 4 true false`.
:::

## Puzzle 12: JSON round trip

```js run title="Puzzle 12"
const o = { a: undefined, b: null, c: NaN, d: () => 1, e: new Date(0), f: [undefined], g: "x" };
console.log(JSON.stringify(o));
console.log(JSON.parse(JSON.stringify(o)));
```

:::hint Show the reason
`undefined` and functions are dropped from objects (but become `null` in arrays). `NaN` → `null`. Date → ISO string. Output: `{"b":null,"c":null,"e":"1970-01-01T00:00:00.000Z","f":[null],"g":"x"}` and the parsed object with `e` as a **string**.
:::

## Puzzle 13: increments and coercion

```js run title="Puzzle 13"
let a = "5";
a++;
let b = "5";
b += 1;
let c = "5";
c = c - -1;
let d = [];
d++;
console.log(a, typeof a, b, typeof b, c, d);
```

:::hint Show the reason
`++` converts to a number: `6`. `+=` with a string concatenates: `"51"`. `"5" - -1` → `5 - (-1)` = `6`. `[]++` → `Number([])` = 0, then 1. Output: `6 number 51 string 6 1`.
:::

## Puzzle 14: Object.is, ==, === together

```js run title="Puzzle 14"
const values = [[0, -0], [NaN, NaN], [null, undefined], ["1", 1], [[], []]];
for (const [x, y] of values) console.log(x === y, x == y, Object.is(x, y));
```

:::hint Show the reason
`[0, -0]`: `true true false`. `[NaN, NaN]`: `false false true`. `[null, undefined]`: `false true false`. `["1", 1]`: `false true false`. `[[], []]`: two different arrays: `false false false`.
:::

## Cheat sheet

| Rule | One line |
|---|---|
| `+` | any string operand → concatenate, else add numbers |
| `- * / %` | always numbers |
| `==` | null↔undefined only; string→number; boolean→number; object→primitive |
| `<`, `>` | both strings → alphabetical; else numbers |
| Falsy | `false 0 -0 0n "" null undefined NaN` |
| `typeof` | null → "object"; function → "function"; NaN → "number" |
| Object → string | `${obj}`, keys: `toString` first. `+`, `==`: `valueOf` first |

:::keypoints
- Apply the **rule**, not a memorised result: `+` (string wins), `-` (number), `==` (convert step by step).
- `null == undefined` only; `null >= 0` is true because relational operators use numbers.
- `parseInt` reads a leading number from the **string form** of its argument.
- Spread is shallow; `structuredClone` and JSON copy deeply (JSON lossy).
- `Object.is` is the only one that tells `+0` from `−0` and treats `NaN` as equal to itself.
:::
