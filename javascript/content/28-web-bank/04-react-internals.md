---
title: "Web bank: React internals"
level: hard
time: 35
summary: Sixteen answers on rendering, the virtual DOM and reconciliation, keys, state batching, hooks rules, effects and cleanup, memoisation, context, refs, Suspense, server rendering and hydration, and Server Components.
---

:::qa What happens when state changes in React? {level=medium}
**Say this:** "React schedules a re-render of the component. It calls the component function again to get a new element tree, compares it with the previous one (reconciliation), and applies only the necessary DOM changes in the commit phase. Then it runs layout effects and effects."

**In simple words:** Call the function again, compare the new picture with the old, and change only the differences.
:::

:::qa What is the virtual DOM, and is it faster than the real DOM? {level=medium}
**Say this:** "It is a lightweight tree of JavaScript objects describing the UI. React diffs two such trees and updates the real DOM in batches. It is not magic fast: its value is a declarative model with reasonably efficient updates. Hand-tuned DOM code can be faster, but is harder to maintain."

**In simple words:** A draft drawing that React compares before it touches the real wall.
:::

:::qa How does reconciliation decide what to update? {level=hard}
**Say this:** "Two heuristics: elements of different types produce different trees (the old subtree is destroyed and a new one created), and `key`s identify children across renders. Same type at the same position keeps the DOM node and state and updates the changed props."

**In simple words:** Same kind and same place means 'keep it'; different kind means 'rebuild'.
:::

:::qa Why are keys needed, and why not use the array index? {level=easy}
**Say this:** "Keys let React match list items between renders, so it can reorder instead of recreating, and so state follows the right item. With index keys, inserting or reordering items attaches state (inputs, focus, animations) to the wrong item. Use a stable unique ID."

**In simple words:** A name tag for each item, so the right person keeps the right bag.
:::

:::qa Is `setState` synchronous? What is batching? {level=medium}
**Say this:** "No. Updates are queued and applied together in the next render; since React 18 this batching happens everywhere, including timeouts and promises. State is a snapshot per render, so reading the variable right after `setCount` still gives the old value. Use the functional form `setCount(c => c + 1)` when the next value depends on the previous."

**In simple words:** React collects your changes and applies them at once, so the variable in your hand is yesterday's value.
:::

:::qa What are the rules of hooks, and why do they exist? {level=medium}
**Say this:** "Call hooks only at the top level of components or custom hooks, never inside loops, conditions or nested functions. React stores hook state in a list per component and finds it by call order, so the order must be identical on every render."

**In simple words:** React finds your state by position in the list, so the list must never change shape.
:::

:::qa How does `useEffect` work: timing, dependencies and cleanup? {level=medium}
**Say this:** "Effects run after the render is committed and the browser has painted (`useLayoutEffect` runs before paint). The dependency array decides when to re-run; the cleanup function runs before the next effect and on unmount. `[]` means once on mount. In development Strict Mode runs effects twice to expose missing cleanup."

**In simple words:** 'After drawing, do this; and undo it before doing it again.'
:::

:::qa What is a stale closure in hooks, and how do you avoid it? {level=hard}
**Say this:** "A callback or effect closes over the props and state of the render in which it was created. If its dependencies are wrong, it keeps using old values. Fix with correct dependency arrays (use the lint rule), functional state updates, `useRef` for the latest value, or `useEffectEvent` where available."

**In simple words:** The function is still holding last render's copy.
:::

:::qa `useMemo`, `useCallback` and `React.memo`: when do they help? {level=medium}
**Say this:** "`React.memo` skips re-rendering a component if its props are shallow-equal. `useMemo` caches a computed value, and `useCallback` caches a function identity so memoised children and effect dependencies do not change on every render. Use them for measured problems (expensive work, long lists), not everywhere; they have a cost too. The React Compiler can add much of this automatically."

**In simple words:** Remember results when recomputing is expensive, but do not remember everything.
:::

:::qa Why does an inline object or function prop defeat `React.memo`? {level=medium}
**Say this:** "Each render creates a new object or function with a new identity, so the shallow comparison sees a changed prop. Move constants outside the component, or stabilise with `useMemo`/`useCallback`."

**In simple words:** A new copy each time looks like a different thing.
:::

:::qa How does Context work, and what is its performance catch? {level=medium}
**Say this:** "A provider supplies a value to all descendants that call `useContext`. When the value changes (by reference), every consumer re-renders, even if it uses only a part. Split contexts by concern, memoise the value, or use a store with selectors (Zustand, Redux, `useSyncExternalStore`) for frequently changing data."

**In simple words:** Everybody listening to the loudspeaker hears every announcement.
:::

:::qa Controlled versus uncontrolled components, and what are refs for? {level=easy}
**Say this:** "A controlled input has its value held in React state and updated through `onChange`. An uncontrolled input keeps its own value in the DOM, read through a ref when needed. Refs (`useRef`) hold a mutable value that survives renders without causing one, and give access to DOM nodes."

**In simple words:** Either React holds the pen, or the browser does and you look at it later.
:::

:::qa What is Suspense, and what is concurrent rendering? {level=hard}
**Say this:** "Suspense lets a component 'wait' (for lazy code or data) and shows a fallback in the meantime. Concurrent rendering lets React prepare updates in the background, interrupt low-priority work for urgent input (`useTransition`, `useDeferredValue`) and keep the UI responsive."

**In simple words:** Show a placeholder while waiting, and always answer the user's click first.
:::

:::qa SSR, SSG, CSR and hydration: explain. {level=medium}
**Say this:** "CSR renders in the browser from JavaScript (blank page first). SSR renders HTML on the server per request, so users and crawlers see content early. SSG builds HTML at build time. Hydration attaches event handlers to the server HTML in the browser; the markup must match, or you get hydration errors."

**In simple words:** Serve a finished picture, then wire up the buttons.
:::

:::qa What are React Server Components? {level=hard}
**Say this:** "Components that run only on the server, can read databases or files directly, send no JavaScript for themselves to the client, and stream their output as a serialised tree. Client Components (marked `'use client'`) handle interactivity. They reduce bundle size and allow data fetching close to the data."

**In simple words:** Do the heavy work on the server and send only the result, not the code.
:::

:::qa How do you find and fix slow React renders? {level=medium}
**Say this:** "Use the React DevTools Profiler to see what rendered and why, find expensive renders, then reduce them: move state down, split components, memoise where measured, virtualise long lists, avoid unstable props and context churn, and defer non-urgent updates with transitions."

**In simple words:** Find who re-draws too much, and make them draw less.
:::

:::keypoints
- Render → **diff** → commit; **keys** and **element type** drive reconciliation.
- State is a **snapshot**; updates are **batched**; use functional updates.
- Hooks rely on **call order**; effects run **after paint** and need **cleanup**.
- **Memoise by measurement**; unstable props and context value changes cause re-renders.
- **SSR + hydration** for first paint; **Server Components** cut client JavaScript.
:::
