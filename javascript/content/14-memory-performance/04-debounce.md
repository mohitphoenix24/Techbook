---
title: Debounce
level: intermediate
time: 30
summary: What debounce does and where it is used (search boxes, resize, autosave), a step-by-step implementation, leading and trailing options, cancel and flush, a React hook, and how it differs from throttle.
---

## The idea

> "**Debounce** waits until the user has **stopped** doing something for a short time, and **then** runs the function once."

:::analogy A lift door
A lift waits a few seconds after the last person steps in before the door closes. Each new person **resets the timer**. The door closes only when nobody has entered for that moment.
:::

Typing "javascript" in a search box fires an input event for every letter: `j`, `ja`, `jav`... Calling the API for each is wasteful: 10 requests, 9 of them useless. With a 300 ms debounce you send **one** request, 300 ms after the last key.

```viz algo=timeline title="Typing j-a-v-a with a 100 ms debounce: one call at the end"
scale: 0-420 ms
lane keystrokes | 0-0 | j | wait
dot keystrokes | 0 | j
dot keystrokes | 60 | a
dot keystrokes | 120 | v
dot keystrokes | 180 | a
lane search() | 280-280 | one call | ok
dot search() | 280 | search("java")
mark 280 | 100 ms after the last key
```

## Implementation

```js run title="debounce(fn, wait)"
function debounce(fn, wait) {
  let timerId;
  return function debounced(...args) {
    clearTimeout(timerId);                          // every call cancels the previous timer
    timerId = setTimeout(() => fn.apply(this, args), wait);   // and starts a new one
  };
}

const calls = [];
const search = debounce((text) => calls.push(text), 100);

// simulate typing: keystrokes at 0, 30, 60 and 90 ms; then a pause; then one more at 300 ms
const keys = [[0, "j"], [30, "ja"], [60, "jav"], [90, "java"], [300, "javas"]];
for (const [at, text] of keys) setTimeout(() => search(text), at);

setTimeout(() => console.log("API calls made:", calls), 500);
```

Only `"java"` (100 ms after the last key of the first burst) and `"javas"` are sent. It is a **closure** holding `timerId`: each debounced function has its own timer.

Key points of the implementation:

1. **`clearTimeout`** on every call: reset the timer.
2. **`fn.apply(this, args)`** keeps the **`this`** and the **latest arguments** (the last call wins).
3. The timer variable lives in the **closure**.

## Leading and trailing edges

| Option | Runs... | Use when |
|---|---|---|
| **trailing** (default) | **after** the quiet period | search-as-you-type, autosave, resize end |
| **leading** | **immediately** on the first call, then ignores calls until quiet | a button that must react at once but must not double-submit |
| both | on the first and on the last | |

```js run title="debounce with leading/trailing, cancel and flush"
function debounce(fn, wait, { leading = false, trailing = true } = {}) {
  let timerId = null, lastArgs, lastThis, result;

  function invoke() {
    const args = lastArgs, ctx = lastThis;
    lastArgs = lastThis = undefined;
    result = fn.apply(ctx, args);
    return result;
  }

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    const startingBurst = timerId === null;
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      if (trailing && lastArgs) invoke();               // trailing call (only if there is a pending call)
    }, wait);
    if (leading && startingBurst) invoke();             // leading call: the first of a burst
    return result;
  }

  debounced.cancel = () => { clearTimeout(timerId); timerId = null; lastArgs = lastThis = undefined; };
  debounced.flush = () => { if (timerId !== null) { clearTimeout(timerId); timerId = null; if (lastArgs) return invoke(); } return result; };
  debounced.pending = () => timerId !== null;
  return debounced;
}

const log = [];
const trailing = debounce((x) => log.push("trailing:" + x), 50);
const leading = debounce((x) => log.push("leading:" + x), 50, { leading: true, trailing: false });
const both = debounce((x) => log.push("both:" + x), 50, { leading: true, trailing: true });

for (const f of [trailing, leading, both]) { f(1); setTimeout(() => f(2), 15); setTimeout(() => f(3), 30); }

const cancelled = debounce((x) => log.push("cancelled:" + x), 50);
cancelled("never");
cancelled.cancel();

const flushed = debounce((x) => log.push("flushed:" + x), 500);
flushed("now");
console.log("pending before flush:", flushed.pending());
flushed.flush();                                        // run the waiting call right now

setTimeout(() => console.log(log), 200);
```

- **`cancel()`**: drop the pending call (for example when a component unmounts).
- **`flush()`**: run the pending call now (for example on page unload, to save a draft).
- Lodash's `debounce` also has **`maxWait`** to guarantee a call at least every N ms during a long burst.

## Where to use debounce

| Use | Wait | Why |
|---|---|---|
| Search-as-you-type / autocomplete | 200 to 400 ms | fewer API calls |
| Window **resize**, layout recalculation | 100 to 250 ms | do it once the user stops dragging |
| **Autosave** drafts | 1000 to 2000 ms | save after a pause |
| Form validation on input | 300 to 500 ms | do not nag while typing |
| Preventing **double submit** | 500+ ms, **leading** | ignore repeated clicks |

## Debounce in React

A debounced function must keep **the same identity** across renders, or each render creates a new timer and nothing is debounced.

```jsx
// 1. debounce a VALUE (simple and common)
function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);                    // cleanup: the "reset the timer" step
  }, [value, delay]);
  return debounced;
}

function Search() {
  const [text, setText] = useState("");
  const query = useDebouncedValue(text, 300);
  useEffect(() => { if (query) fetchResults(query); }, [query]);   // runs only after typing pauses
  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}

// 2. debounce a CALLBACK (keep identity with useMemo or useRef)
const debouncedSave = useMemo(() => debounce(save, 1000), [save]);
useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);        // cancel on unmount
```

## Debounce vs throttle (preview)

- **Debounce:** "wait until it **stops**". Many events become **one** call at the end.
- **Throttle:** "at most **once per interval**". Many events become a **steady stream** of calls. (Next lesson.)

:::interview What is debouncing? Implement a debounce function.
"Debouncing delays calling a function until a given time has passed since the last call, so a burst of events results in one call. It is used for search-as-you-type, resize handlers and autosave. The implementation keeps a timer id in a closure: each call clears the previous timer and sets a new one that calls the function with the latest arguments and `this` after `wait` ms. Good versions support leading and trailing edges, `cancel()` and `flush()`. In React I debounce a value with an effect that clears its timeout on change, or keep one stable debounced callback with `useMemo` and cancel it on unmount."
:::

## More interview questions on this topic

:::qa What is the difference between debounce and throttle? {level=easy}
**Say this:** "Debounce runs once after the events stop for a given time. Throttle runs at most once per interval while events keep coming."

**In simple words:** Debounce: "wait until quiet". Throttle: "not more than once every X ms".
:::

:::qa Why does the debounced function need `fn.apply(this, args)`? {level=medium}
**Say this:** "So the original function runs with the right `this` and the arguments of the last call, for example inside an event handler or object method."

**In simple words:** Keep the context and the latest data.
:::

:::qa What are leading and trailing options? {level=medium}
**Say this:** "Leading calls the function immediately at the start of a burst, trailing calls it at the end after the quiet period. Leading is good for double-click protection, trailing for search and autosave."

**In simple words:** Act first, or act last.
:::

:::qa What happens if you create the debounced function inside a React component body? {level=hard}
**Say this:** "A new debounced function, with a new timer, is created on every render, so calls are never grouped. Keep it stable with `useMemo`/`useRef`, or debounce the value with `useEffect`."

**In simple words:** The memory of the timer is lost every render.
:::

```quiz
? What does a 300 ms debounce do for 5 keystrokes typed quickly?
- Calls the function 5 times
+ Calls it once, 300 ms after the last keystroke
- Calls it once per 300 ms
> Each keystroke resets the timer.
? Which method runs the pending debounced call immediately?
- cancel()
+ flush()
- reset()
> flush executes it now.
? Which is best for search-as-you-type?
- throttle
+ trailing debounce
- setInterval
> Wait for the user to pause.
```

:::keypoints
- **Debounce** = run once after calls **stop** for `wait` ms. Each call **resets** the timer.
- Implementation: a timer id in a **closure**, `clearTimeout` + `setTimeout`, `fn.apply(this, args)`.
- Options: **leading/trailing**, `cancel()`, `flush()`, `maxWait`.
- Uses: search, resize end, autosave, validation, double-submit guard.
- In React keep the debounced function **stable** (or debounce a value with an effect).
:::
