---
title: useEffect in depth: dependencies, cleanup, races and when not to use it
level: advanced
time: 40
summary: What effects are for, how the dependency array and cleanup work, Strict Mode's double run, fetching data without race conditions, and the "you might not need an effect" rules.
---

## What an effect is for

> "An **effect** synchronises your component with **something outside React**: the network, the DOM, timers, subscriptions, a browser API, a third-party widget."

Rendering must be **pure**. Anything that **does** something to the outside world belongs in an **event handler** (the user did something) or an **effect** (the component appeared or its data changed).

```jsx
useEffect(() => {
  // setup: connect, subscribe, start a timer, fetch
  const id = setInterval(tick, 1000);
  return () => {
    // cleanup: undo exactly what the setup did
    clearInterval(id);
  };
}, [tick]);        // dependencies: re-run when any of these change
```

## The three dependency array forms

| Code | Runs |
|---|---|
| `useEffect(fn)` | after **every** render |
| `useEffect(fn, [])` | after the **first** render only (and cleanup on unmount) |
| `useEffect(fn, [a, b])` | after the first render and whenever `a` or `b` **changes** (`Object.is`) |

**Cleanup runs** before the effect runs **again** (with the old values) and when the component **unmounts**. Think of it as a loop: *cleanup old → setup new*.

```js run title="The effect lifecycle, as a model (setup / cleanup order)"
function createEffectRunner() {
  let prevDeps = null, cleanup = null;
  const log = [];
  return {
    log,
    commit(effect, deps) {                                       // called after each render
      const changed = prevDeps === null || deps === undefined || deps.some((d, i) => !Object.is(d, prevDeps[i]));
      if (!changed) return log.push("  (deps unchanged: effect skipped)");
      if (cleanup) { cleanup(); cleanup = null; }                  // 1. cleanup of the PREVIOUS effect (with its old closure)
      cleanup = effect() ?? null;                                  // 2. run the new setup
      prevDeps = deps;
    },
    unmount() { if (cleanup) cleanup(); },
  };
}

const runner = createEffectRunner();
const subscribe = (room) => () => { runner.log.push(`connect(${room})`); return () => runner.log.push(`disconnect(${room})`); };

runner.commit(subscribe("general"), ["general"]);      // mount
runner.commit(subscribe("general"), ["general"]);      // re-render, same room
runner.commit(subscribe("music"), ["music"]);          // room changed
runner.commit(subscribe("music"), ["music"]);
runner.unmount();                                      // component removed
console.log(runner.log.join("\n"));
```

## Rules for the dependency array

1. **Every reactive value used inside the effect must be listed**: props, state, and anything derived from them (including functions defined in the component). The ESLint rule `react-hooks/exhaustive-deps` checks it. **Do not disable it**; fix the code.
2. Values that do **not** change (module-level constants, imports, `setState` functions, refs) need not be listed.
3. If a dependency changes **too often** (an object or function re-created every render), the effect re-runs too often. Fix the **cause**: move the object **inside** the effect, make it a primitive, `useMemo`/`useCallback` it, or move it outside the component.

```jsx
// BAD: options is a new object every render, so the effect re-runs every render
const options = { room: roomId, secure: true };
useEffect(() => { const c = connect(options); return () => c.disconnect(); }, [options]);

// GOOD: create it inside the effect and depend on the primitives
useEffect(() => {
  const c = connect({ room: roomId, secure: true });
  return () => c.disconnect();
}, [roomId]);
```

## React 18 Strict Mode: effects run twice in development

In **development** with `<StrictMode>`, React mounts, **runs the effect, runs cleanup, runs the effect again**. This is to reveal missing cleanup and bugs: your effect must be **resilient**: setup → cleanup → setup should leave the same state as setup once.

```jsx
useEffect(() => {
  const ws = new WebSocket(url);
  return () => ws.close();                 // with cleanup: the double run is harmless
}, [url]);

useEffect(() => { analytics.track("page view"); }, []);     // without cleanup: tracked twice in dev (production: once)
```

If the double run **breaks** something, the effect is missing its cleanup. (Do not "fix" it by removing StrictMode.)

## Fetching data: the race condition

```jsx
// BUGGY: if userId changes quickly, an older (slower) response can arrive last and overwrite the newer one
useEffect(() => {
  fetch(`/api/users/${userId}`).then((r) => r.json()).then(setUser);
}, [userId]);

// FIXED with a flag...
useEffect(() => {
  let ignore = false;
  fetch(`/api/users/${userId}`).then((r) => r.json()).then((data) => { if (!ignore) setUser(data); });
  return () => { ignore = true; };         // this effect run is now "stale"
}, [userId]);

// ...or better, cancel the request with AbortController
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/users/${userId}`, { signal: controller.signal })
    .then((r) => r.json()).then(setUser)
    .catch((e) => { if (e.name !== "AbortError") setError(e); });
  return () => controller.abort();
}, [userId]);
```

```js run title="The race, and the fix, as a runnable model"
const delay = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
const api = (id) => delay(id === 1 ? 60 : 10, "user " + id);                 // user 1 is SLOW, user 2 is fast

async function buggy() {
  let shown = null;
  api(1).then((u) => { shown = u; });                                         // effect run for userId=1
  api(2).then((u) => { shown = u; });                                         // userId changed to 2 straight away
  await delay(100);
  return shown;                                                               // "user 1": the stale response won!
}

async function fixed() {
  let shown = null;
  const runEffect = (id) => { let ignore = false; api(id).then((u) => { if (!ignore) shown = u; }); return () => { ignore = true; }; };
  const cleanup1 = runEffect(1);
  cleanup1();                                                                 // React runs cleanup before the next effect
  runEffect(2);
  await delay(100);
  return shown;
}

(async () => console.log("buggy:", await buggy(), "| fixed:", await fixed()))();
```

**In real apps do not hand-write data fetching in effects.** Use **TanStack Query**, **SWR**, **RTK Query**, a router loader, or **Server Components**. They give caching, deduplication, retries, race-safety, loading and error states, and background refresh.

## You might not need an effect

Effects are an **escape hatch**. Many uses are mistakes:

| You wrote an effect to... | Do this instead |
|---|---|
| Calculate data from props/state (filter a list, full name) | **Compute during render** (`useMemo` only if expensive) |
| Reset all state when a prop changes | give the component a **`key`** (`<Profile key={userId} />`) |
| Respond to a **user event** (submit a form, click) | put the logic in the **event handler** |
| Update state when other state changes (`useEffect(() => setB(a * 2), [a])`) | derive `b` during render; or update both in the **same handler** |
| Notify a parent after state changes | call the parent callback in the **same event handler** |
| Initialise app-wide things once | module-level code, or `useState(() => init())` for per-component |
| Subscribe to an external store | **`useSyncExternalStore`** |
| Fetch data | a data-fetching library / framework |

```jsx
// BAD: an effect chain: extra renders, flicker, hard to follow
const [first, setFirst] = useState("Asha"), [last, setLast] = useState("Rao"), [full, setFull] = useState("");
useEffect(() => setFull(first + " " + last), [first, last]);

// GOOD: derived value, no state, no effect
const full = first + " " + last;
```

## Common effect bugs

| Bug | Cause | Fix |
|---|---|---|
| Infinite re-render loop | an effect sets state that is in its own dependencies, or an object/array dependency recreated each render | correct dependencies; derive; functional update; stable refs |
| Stale value in a timer/listener | closure over old render and missing dependency | add the dependency, functional update, or `useRef` for the latest value |
| Memory leak / duplicate listeners | no cleanup | return a cleanup that removes the listener/timer/subscription |
| "Can't update an unmounted component" | async result after unmount | cancel with `AbortController` or ignore flag |
| Effect runs twice in dev | Strict Mode | write idempotent effects with cleanup |
| Layout flicker | measuring in `useEffect` after paint | `useLayoutEffect` for measuring/adjusting layout |
| `async` effect function | `useEffect(async () => ...)` returns a promise, not a cleanup | define an async function **inside** and call it |

:::interview Explain useEffect: the dependency array, cleanup, and common pitfalls. How do you fetch data safely?
"`useEffect` synchronises a component with something outside React. React runs it after the render is committed; the dependency array decides when: no array means every render, an empty array only on mount, and listed values re-run it when they change by `Object.is`. The returned cleanup runs before the next effect run and on unmount, so subscriptions, timers and listeners are undone. All reactive values used inside must be listed, which the exhaustive-deps lint rule checks; objects and functions created in the body change every render, so I move them inside the effect or stabilise them. In Strict Mode development the effect runs setup, cleanup, setup to expose missing cleanup. For fetching, a naive effect has a race condition where a slow earlier response overwrites a newer one, so I abort the request with an AbortController in the cleanup, or better use a library like TanStack Query. And I avoid effects for derived data or event logic: compute during render, use keys to reset state, and put event logic in handlers."
:::

## More interview questions on this topic

:::qa What does the cleanup function of an effect do and when does it run? {level=easy}
**Say this:** "It undoes the effect's setup, for example removing a listener or clearing a timer. It runs before the effect re-runs because of changed dependencies, and when the component unmounts."

**In simple words:** Put the toys away before taking out new ones.
:::

:::qa Why does React run effects twice in development? {level=medium}
**Say this:** "Strict Mode mounts, unmounts and remounts components to reveal effects that lack cleanup or are not resilient. Production runs once. If the double run breaks something, the effect needs a proper cleanup."

**In simple words:** A test drive to catch bugs early.
:::

:::qa What is the difference between `useEffect` and an event handler for side effects? {level=medium}
**Say this:** "An event handler runs in response to a specific user action and is the right place for logic caused by that action. An effect runs because the component rendered with certain data and keeps it synchronised. Do not use effects for things caused by events."

**In simple words:** Handler = "because the user did this". Effect = "because this is on screen".
:::

:::qa How do you avoid an infinite loop in `useEffect`? {level=medium}
**Say this:** "Do not set state that is one of the effect's own dependencies without a condition; avoid object or function dependencies recreated every render; use functional updates and move constants outside."

**In simple words:** The effect keeps triggering itself, so break the cycle.
:::

```quiz
? What does `useEffect(fn, [])` do?
- Runs on every render
+ Runs after the first render (and cleans up on unmount)
- Never runs
> No dependencies means it only synchronises once.
? Which is the best fix for a fetch race condition?
- Use setTimeout
+ Abort the previous request in the effect cleanup (or use a data library)
- Fetch twice
> Only the latest request may set state.
? Which should NOT be an effect?
- Subscribing to window resize
+ Computing a filtered list from props
- Opening a WebSocket
> Derive it during render.
```

:::keypoints
- Effects **synchronise with external systems**; keep render pure; event logic goes in **handlers**.
- **Deps**: none = every render, `[]` = once, `[a, b]` = when they change. **Cleanup** runs before re-run and on unmount. List **all** reactive values (`exhaustive-deps`).
- **Strict Mode** runs setup → cleanup → setup in dev: effects must be idempotent with cleanup.
- **Fetch**: abort/ignore stale responses; prefer TanStack Query/SWR/loaders/Server Components.
- **You might not need an effect**: derive during render, use `key` to reset, do work in handlers.
:::
