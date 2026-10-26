---
title: "Core bank: cheat sheet"
level: easy
time: 15
summary: One page to revise the night before. Declarations, this rules, equality and coercion, mutating versus non-mutating array methods, the object API and the classic traps.
---

## Declarations

| | `var` | `let` | `const` | `function f(){}` | `class` |
|---|---|---|---|---|---|
| Scope | function | block | block | function/block | block |
| Hoisted | yes, as `undefined` | yes, **TDZ** | yes, **TDZ** | yes, **with body** | yes, **TDZ** |
| Redeclare in same scope | yes | no | no | yes | no |
| Reassign | yes | yes | no (binding) | yes | no |
| Global object property (script) | yes | no | no | yes | no |

## What is `this`?

| Call | `this` |
|---|---|
| `new F()` | the new object |
| `f.call(x)` / `f.apply(x)` / `f.bind(x)()` | `x` |
| `obj.f()` | `obj` |
| `f()` (strict / module) | `undefined` |
| `f()` (sloppy) | global object |
| arrow function | `this` of the surrounding code |
| DOM handler (regular function) | the element (`currentTarget`) |

## Equality and coercion

| Expression | Result | Why |
|---|---|---|
| `null == undefined` | `true` | special rule |
| `null === undefined` | `false` | different types |
| `0 == '0'`, `0 == ''`, `'0' == ''` | `true, true, false` | `==` converts to numbers, then compares |
| `NaN === NaN` | `false` | use `Number.isNaN` |
| `Object.is(NaN, NaN)`, `Object.is(0, -0)` | `true`, `false` | "same value" |
| `[] + []`, `[] + {}` | `''`, `'[object Object]'` | `+` converts to strings |
| `'5' + 1`, `'5' - 1` | `'51'`, `4` | `+` may concatenate; `-` is maths |
| `typeof null`, `typeof []`, `typeof (() => {})` | `'object'`, `'object'`, `'function'` | historical |
| `[10, 9, 1].sort()` | `[1, 10, 9]` | default sort is by string; pass a comparator |
| `parseInt('08')`, `Number('')`, `Number(null)` | `8`, `0`, `0` | `Number(undefined)` is `NaN` |

Falsy: `false 0 -0 0n '' null undefined NaN`. Everything else is truthy.

## Arrays: which methods mutate?

| Mutate the array | Return a new array |
|---|---|
| `push pop shift unshift splice sort reverse fill copyWithin` | `map filter slice concat flat flatMap toSorted toReversed toSpliced with` |

`forEach` returns nothing; `find` returns an item; `some`/`every` return booleans; `reduce` returns anything.

## Objects

| Need | Use |
|---|---|
| Own enumerable keys / values / pairs | `Object.keys / values / entries` |
| Build an object from pairs | `Object.fromEntries` |
| Is this key mine? | `Object.hasOwn(o, k)` |
| Shallow copy / merge | `{ ...a, ...b }`, `Object.assign` |
| Deep copy | `structuredClone` |
| Lock | `Object.freeze` (shallow), `seal`, `preventExtensions` |
| Prototype-free dictionary | `Object.create(null)` or `Map` |

## Traps to mention before they ask

- `var` in loops with callbacks; `let` fixes it.
- Lost `this` when passing a method as a callback.
- `==` coercion, `NaN`, `-0`, `typeof null`.
- `const` does not freeze objects.
- Default parameters apply for `undefined` only.
- `for...in` includes inherited keys; `for...of` iterates values of iterables.
- `async` functions always return a promise; `forEach` ignores `await`.
- Floating point: `0.1 + 0.2`; money in integers.

:::keypoints
- Learn the four tables: **declarations, `this`, equality, mutating methods**.
- Quote one trap and one fix for every concept: it shows experience.
:::
