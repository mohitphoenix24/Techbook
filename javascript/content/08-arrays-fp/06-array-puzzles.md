---
title: Array output puzzles
level: advanced
time: 25
summary: Ten array puzzles: sort, map(parseInt), holes, reduce without initial value, splice vs slice, includes with NaN, array equality and length tricks.
---

## Puzzle 1: default sort

```js run title="Puzzle 1"
console.log([5, 25, 100, 1].sort());
console.log(["b", "a", "C", "B"].sort());
```

:::hint Show the reason
Default sort converts to strings: `"1" < "100" < "25" < "5"`. Strings are compared by code unit, so capitals come before lowercase. Output: `[ 1, 100, 25, 5 ]` and `[ 'B', 'C', 'a', 'b' ]`.
:::

## Puzzle 2: map with a missing return

```js run title="Puzzle 2"
console.log([1, 2, 3].map((n) => { n * 2 }));
console.log([1, 2, 3].map((n) => n * 2));
console.log([1, 2, 3].map((n) => ({ double: n * 2 })));
```

:::hint Show the reason
Braces without `return` give `undefined`. `() => ({...})` returns an object. Output: three `undefined`s, `[ 2, 4, 6 ]`, then the array of objects.
:::

## Puzzle 3: holes

```js run title="Puzzle 3"
const a = [1, , 3];
console.log(a.length, a.map((x) => x * 2), Object.keys(a));
console.log([...a].map((x) => x), Array.from(a));
```

:::hint Show the reason
`map` skips holes and keeps them. `Object.keys` lists only existing indexes `[ '0', '2' ]`. Spread and `Array.from` turn holes into `undefined`. Output: `3 [ 2, <1 empty item>, 6 ] [ '0', '2' ]` then `[ 1, undefined, 3 ] [ 1, undefined, 3 ]`.
:::

## Puzzle 4: reduce without initial value

```js run title="Puzzle 4"
console.log([1, 2, 3].reduce((a, b) => a + b));
console.log(["a", "b"].reduce((acc, x) => acc + x.toUpperCase()));
console.log([[1], [2]].reduce((acc, x) => acc.concat(x)));
```

:::hint Show the reason
With no initial value, the first item is the accumulator. The second line starts with `"a"` (not upper-cased) then adds `"B"`: `aB`. The third starts with `[1]`. Output: `6`, `aB`, `[ 1, 2 ]`.
:::

## Puzzle 5: splice vs slice

```js run title="Puzzle 5"
const a = [1, 2, 3, 4, 5];
const removed = a.splice(1, 2);
const part = a.slice(1);
console.log(removed, part, a);
```

:::hint Show the reason
`splice(1, 2)` removes 2 items starting at index 1: `[2, 3]`, leaving `[1, 4, 5]`. `slice(1)` copies from index 1: `[4, 5]`. Output: `[ 2, 3 ] [ 4, 5 ] [ 1, 4, 5 ]`.
:::

## Puzzle 6: NaN and includes

```js run title="Puzzle 6"
const a = [NaN];
console.log(a.indexOf(NaN), a.includes(NaN), a.findIndex(Number.isNaN), NaN === NaN, Object.is(NaN, NaN));
```

:::hint Show the reason
`indexOf` and `===` use strict equality: `NaN` is never equal to itself. `includes`, `Object.is` and `findIndex(Number.isNaN)` can see it. Output: `-1 true 0 false true`.
:::

## Puzzle 7: array equality

```js run title="Puzzle 7"
console.log([1, 2] == [1, 2], [1, 2] === [1, 2], [1, 2] + "" === "1,2", [] == false, [0] == false, [1] == 1);
console.log(JSON.stringify([1, 2]) === JSON.stringify([1, 2]));
```

:::hint Show the reason
Arrays are objects: `==` and `===` compare **references**, so two separate arrays are not equal. `[1,2] + ""` converts to the string `"1,2"`. `[] == false` → `"" == false` → `true`. `[0] == false` → `"0" == false` → `true`. `[1] == 1` → `true`. Output: `false false true true true true` then `true`.
:::

## Puzzle 8: length tricks

```js run title="Puzzle 8"
const a = [1, 2, 3];
a[5] = 6;
console.log(a.length, a);
a.length = 2;
console.log(a);
console.log([].concat([1], [[2]], 3));
```

:::hint Show the reason
Setting index 5 makes the length 6 with holes. Setting `length = 2` truncates. `concat` flattens one level: `[1, [2], 3]`. Output: `6 [ 1, 2, 3, <2 empty items>, 6 ]`, `[ 1, 2 ]`, `[ 1, [ 2 ], 3 ]`.
:::

## Puzzle 9: sort is in place

```js run title="Puzzle 9"
const a = [3, 1, 2];
const b = a.sort();
b.push(99);
console.log(a, a === b);

const c = [3, 1, 2];
const d = [...c].sort();
d.push(99);
console.log(c, d);
```

:::hint Show the reason
`sort` returns the **same** array, so `a` and `b` are one array. A copy with spread is separate. Output: `[ 1, 2, 3, 99 ] true` and `[ 3, 1, 2 ] [ 1, 2, 3, 99 ]`.
:::

## Puzzle 10: forEach, async and order

```js run title="Puzzle 10"
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  [1, 2, 3].forEach(async (n) => {
    await wait(10);
    console.log("forEach", n);
  });
  console.log("after forEach");

  for (const n of [4, 5]) {
    await wait(10);
    console.log("for-of", n);
  }
  console.log("after for-of");
}
run();
```

:::hint Show the reason
`forEach` does not wait for the async callbacks, so `after forEach` prints first. The three callbacks all wait 10 ms in parallel. The `for...of` loop awaits in order. Output: `after forEach`, then `forEach 1`, `forEach 2`, `forEach 3` (all after 10 ms, in parallel), then `for-of 4`, `for-of 5`, `after for-of`.
:::

:::keypoints
- Default `sort` is **string order**; it mutates and returns the same array.
- `map` with braces needs `return`; wrap object literals in parentheses.
- Holes are skipped by `map`/`forEach`; spread and `Array.from` make them `undefined`.
- `reduce` without an initial value uses the first item as the accumulator.
- Arrays compare by **reference**. `indexOf(NaN)` is -1; `includes(NaN)` is true.
- `forEach(async ...)` does not wait.
:::
