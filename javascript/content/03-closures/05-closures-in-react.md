---
title: Closures in React: stale state explained
level: intermediate
time: 30
summary: Why a React component can show or send an old value (a stale closure), explained with a tiny hand-made useState in plain JavaScript, and the fixes: functional updates, refs and correct dependencies.
---

## The bug every React developer meets

You write a counter. You click a button three times quickly, or you start a timer, and the number you see or log is **old**. This is not a React bug. It is a **closure** doing exactly what closures do.

To see why, we will build a tiny version of React's `useState` in plain JavaScript. It is only a few lines, and it shows what really happens.

## A component is just a function that runs again and again

In React, every time the state changes, your component function **runs again**. Each run creates **new** local variables, and new inner functions that close over **that run's** variables.

```js run title="A tiny React: render() calls the component again"
let state;                                   // React stores the state outside your function
let renders = 0;

function useState(initial) {
  if (state === undefined) state = initial;
  const value = state;                        // each render gets the value as a plain constant
  const setState = (next) => {
    state = next;
    render();                                 // re-run the component
  };
  return [value, setState];
}

function Counter() {
  const [count, setCount] = useState(0);      // `count` is a new const in every render
  renders++;
  console.log(`render #${renders}: count = ${count}`);

  return {
    clickPlusOne: () => setCount(count + 1),  // closes over THIS render's count
    logLater: () => setTimeout(() => console.log(`  (later) count was ${count} when this ran`), 50),
  };
}

let ui;
function render() { ui = Counter(); }

render();                                     // render #1
const firstRender = ui;                       // keep the handlers of render #1

firstRender.logLater();                       // schedules a log that closes over render #1's count (0)
firstRender.clickPlusOne();                   // state becomes 1, render #2
firstRender.clickPlusOne();                   // still uses count = 0, so state becomes 1 again!
```

Read the output carefully:

- `render #2` shows `count = 1`. But the second click used the **old handler of render #1**, where `count` is `0`. So it set the state to `0 + 1 = 1` again, and `render #3` still shows `count = 1`. **We lost a click.**
- The delayed log says `count was 0`, because it closed over render #1's `count`. It will never see a later value.

Every render is like a **snapshot**: the variables and functions in it belong together, and never change.

:::analogy A photograph
Each render takes a photograph of the state. The handlers in that photograph can only see what is in that photograph, even if the real state moves on.
:::

## The classic stale closure: `setInterval` inside `useEffect`

```jsx
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(seconds + 1);        // `seconds` is always 0 here (first render's value)
    }, 1000);
    return () => clearInterval(id);
  }, []);                             // empty array: the effect (and the closure) never refreshes

  return <p>{seconds}</p>;            // stuck at 1
}
```

The effect ran only once, in render #1, so the interval callback closed over `seconds = 0` forever. It sets `0 + 1` every second, so the display shows `1` and stops.

## Fix 1: the functional update

Instead of using the old value from the closure, **ask React for the latest value**:

```js run title="Fix 1: setState(prev => prev + 1)"
let state = 0;
let renders = 0;

function setState(next) {
  state = typeof next === "function" ? next(state) : next;   // a function receives the latest state
  renders++;
}

// two clicks from the SAME old render
const oldCount = 0;
setState(oldCount + 1);                       // wrong style: uses the stale value
setState(oldCount + 1);
console.log("stale style:", state);

state = 0;
setState((prev) => prev + 1);                 // right style: uses the latest value
setState((prev) => prev + 1);
console.log("functional style:", state);
```

In React you write `setSeconds((s) => s + 1)`. Now the interval callback does not need `seconds` at all, so the `[]` dependency list is correct.

## Fix 2: put the value in the dependency array

```jsx
useEffect(() => {
  const id = setInterval(() => setSeconds(seconds + 1), 1000);
  return () => clearInterval(id);
}, [seconds]);                        // effect re-runs when seconds changes: a fresh closure each time
```

This works, but it resets the interval every second. For timers, the functional update is better.

## Fix 3: a ref holds "the latest" value

A **ref** is an object that stays the **same** across renders, so a closure that holds the ref always reaches the current value.

```js run title="Fix 3: a ref always points to the latest value"
// A ref is one stable object. Each render writes into it; old closures read from it.
const ref = { current: 0 };

function renderWith(value) {
  ref.current = value;                        // like: ref.current = count (done on every render)
  return {
    logNow: () => console.log("closure value:", value, "| ref value:", ref.current),
  };
}

const r1 = renderWith(1);
const r2 = renderWith(2);
const r3 = renderWith(3);

r1.logNow();                                  // r1's closure is stale, the ref is fresh
```

React code: `const latest = useRef(count); latest.current = count;` and then `setTimeout(() => console.log(latest.current), 3000)`.

## The rule of thumb

| Situation | Use |
|---|---|
| New state depends on the old state | `setX((prev) => ...)` |
| An effect or callback needs the latest value but must not re-run | a **ref** (`useRef`) |
| An effect should re-run when a value changes | add it to the **dependency array** |
| A handler that is passed down and should keep a stable identity | `useCallback` with the right dependencies |

:::tip Let the linter help
The ESLint rule `react-hooks/exhaustive-deps` finds missing dependencies, which is the most common source of stale closures. Do not silence it. Fix the code.
:::

:::interview What is a stale closure in React? How do you fix it?
"Each render of a component creates new variables and new functions that close over that render's values. If a callback is created in one render, like in a `setInterval` inside an effect with an empty dependency array, it keeps seeing that old render's state. I fix it by using the functional update form `setState(prev => ...)`, by listing the right values in the dependency array, or by reading the latest value from a ref. The `exhaustive-deps` lint rule catches most cases."
:::

## More interview questions on this topic

:::qa Why does `console.log(count)` right after `setCount(count + 1)` print the old value? {level=easy}
**Say this:** "Because `count` is a constant of the current render. `setCount` schedules a new render, where there will be a new `count`. The current closure never changes."

**In simple words:** The new value will appear in the next photograph, not in this one.
:::

:::qa Why does clicking a button twice quickly with `setCount(count + 1)` only add one? {level=medium}
**Say this:** "Both handler calls use the same `count` from the same render, so both set the same new value. With `setCount(c => c + 1)` React applies each update to the latest state, so you get two."

**In simple words:** The function form says "add one to whatever it is now".
:::

:::qa What does an empty dependency array do to the closures in `useEffect`? {level=medium}
**Say this:** "The effect runs once, after the first render. Any state or props it uses are frozen at their first-render values, unless it reads them from a ref or uses functional updates."

**In simple words:** The effect keeps the first photograph forever.
:::

:::qa When would you choose `useRef` instead of adding a dependency? {level=hard}
**Say this:** "When I need the latest value inside a long-lived callback, like a timer, a WebSocket handler or an event listener, and re-creating it on every change would be costly or wrong."

**In simple words:** The ref is a mailbox that always holds the newest letter, and the old closure just checks the mailbox.
:::

```quiz
? Why does a `setInterval(() => setN(n + 1), 1000)` in an effect with `[]` get stuck?
- setInterval is broken in React
+ The callback closes over the first render's n, which is always 0
- React runs the callback only once
> A stale closure: the effect never re-ran, so the callback never saw a new n.
? Which update is safe when the new state depends on the old one?
- setN(n + 1) inside any closure
+ setN(prev => prev + 1)
- n = n + 1
> The functional form always receives the latest state.
? What stays the same across renders and can hold the latest value?
- A const variable in the component
+ A ref created with useRef
- A prop
> The ref object has a stable identity; only its .current changes.
```

:::keypoints
- A component function **runs again on every render**. Each run has its own variables and closures: a snapshot.
- Handlers and effects see the values from the render where they were **created**.
- **Stale closure** = a long-lived callback using old render values.
- Fixes: **functional updates**, **correct dependencies**, or a **ref** for "latest value".
- Lint with `react-hooks/exhaustive-deps`.
:::
