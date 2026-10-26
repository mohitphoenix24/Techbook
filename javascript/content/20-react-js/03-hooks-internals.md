---
title: How hooks work (build useState, useEffect, useMemo and useRef)
level: advanced
time: 45
summary: Why hooks must be called in the same order, how React stores hook state per component, and a working implementation of useState, useRef, useMemo and useEffect in about 60 lines of plain JavaScript that shows closures, stale values and the rules of hooks.
---

## The puzzle hooks solve

A function component runs from the top **every render**, and its local variables are lost afterwards. Yet `const [count, setCount] = useState(0)` **remembers** `count` between renders, **without** being told which component it is in. How?

> "React keeps, for each **component instance**, an **ordered list of hook cells**. Each time the component renders, every hook call takes the **next cell in that list**. The **call order** is the only identity a hook has."

```viz algo=chain title="Hook cells for one component instance (stored on its fiber)"
node fiber "Component instance (fiber)" @0,0 [hl]
  hooks: ->
node h0 "hook 0: useState" @1,0
  state: 5
node h1 "hook 1: useRef" @2,0
  current: null
node h2 "hook 2: useEffect" @3,0
  deps: [5]
  cleanup: fn
link fiber -> h0 : first
link h0 -> h1 : next
link h1 -> h2 : next
```

That is why the **Rules of Hooks** exist:

1. **Only call hooks at the top level** of a component or custom hook: never inside `if`, loops, nested functions or after an early `return`.
2. **Only call hooks from React functions** (components and custom hooks whose names start with `use`).

If the **order** changes between renders, hook #2 would read the cell that belongs to hook #1: **bugs and crashes**. The linter rule `react-hooks/rules-of-hooks` enforces this.

## Build it: a mini React runtime

```js run title="mini-hooks: useState, useRef, useMemo, useEffect"
let currentComponent = null;                     // the component being rendered right now

function createComponent(renderFn) {
  const instance = { hooks: [], cursor: 0, renderFn, renders: 0, output: null, pendingEffects: [] };
  instance.render = () => {
    currentComponent = instance;
    instance.cursor = 0;                         // start again from the first cell on every render
    instance.renders++;
    instance.output = instance.renderFn();       // calls the hooks IN ORDER
    currentComponent = null;
    instance.pendingEffects.splice(0).forEach((run) => run());       // "commit": run effects after render
    return instance.output;
  };
  return instance;
}

function useState(initial) {
  const c = currentComponent;
  const i = c.cursor++;                          // THIS hook's identity is its position
  if (!(i in c.hooks)) c.hooks[i] = { value: typeof initial === "function" ? initial() : initial };    // first render: create the cell
  const cell = c.hooks[i];
  const setState = (next) => {                   // closes over the cell: the same setter works forever
    const resolved = typeof next === "function" ? next(cell.value) : next;
    if (Object.is(resolved, cell.value)) return;
    cell.value = resolved;
    c.render();                                  // real React schedules and batches this
  };
  return [cell.value, setState];                 // the VALUE is a snapshot for this render
}

function useRef(initial) {
  const c = currentComponent;
  const i = c.cursor++;
  if (!(i in c.hooks)) c.hooks[i] = { current: initial };
  return c.hooks[i];                             // the SAME object every render (stable identity)
}

function useMemo(factory, deps) {
  const c = currentComponent;
  const i = c.cursor++;
  const cell = c.hooks[i];
  if (cell && deps.every((d, k) => Object.is(d, cell.deps[k]))) return cell.value;       // deps unchanged: reuse
  const value = factory();
  c.hooks[i] = { value, deps };
  return value;
}

function useEffect(effect, deps) {
  const c = currentComponent;
  const i = c.cursor++;
  const cell = c.hooks[i];
  const changed = !cell || !deps || deps.some((d, k) => !Object.is(d, cell.deps[k]));
  if (!changed) return;
  c.pendingEffects.push(() => {
    if (cell?.cleanup) cell.cleanup();           // run the previous effect's cleanup first
    const cleanup = effect();
    c.hooks[i] = { deps, cleanup };
  });
}

// ---------- use it ----------
const log = [];
const Counter = createComponent(() => {
  const [count, setCount] = useState(0);
  const [step, setStep] = useState(1);
  const renderCount = useRef(0);
  renderCount.current++;
  const doubled = useMemo(() => { log.push("  computing doubled"); return count * 2; }, [count]);

  useEffect(() => {
    log.push(`  effect for count=${count}`);
    return () => log.push(`  cleanup for count=${count}`);
  }, [count]);

  return { count, doubled, step, renderCount: renderCount.current, setCount, setStep };
});

let ui = Counter.render();                                   // first render
log.push("render 1: count=" + ui.count + " doubled=" + ui.doubled);
ui.setCount(1);                                              // state change: render 2
log.push("render 2: count=" + Counter.output.count + " doubled=" + Counter.output.doubled);
Counter.output.setStep(5);                                   // another state: effect and memo are skipped (deps same)
log.push("render 3: step=" + Counter.output.step + " (count unchanged, so no new effect, no recompute)");
Counter.output.setCount(1);                                  // the same value: bail-out, no render
log.push("renders so far: " + Counter.renders + " | refs survive renders: " + Counter.output.renderCount);

console.log(log.join("\n"));
```

What the output shows:

- **`useState`** keeps a cell per call position; the **setter** triggers a re-render; the **value** you destructure is a **snapshot**.
- **`useRef`** returns the **same object** every time; changing `.current` does **not** re-render.
- **`useMemo`** and **`useEffect`** compare **dependencies** with `Object.is`. Unchanged → skip. Changed → run (effects run **after** render, with the **previous cleanup first**).
- Real React is more complex (priorities, batching, Strict Mode double-invocation, concurrent rendering) but the **model** is exactly this.

## Why a conditional hook breaks things

```js run title="Breaking the Rules of Hooks: the cells get shifted"
// reuse the same tiny runtime idea, showing only what goes wrong
const cells = [];
let cursor = 0;
function useState(initial) {
  const i = cursor++;
  if (!(i in cells)) cells[i] = initial;
  return [cells[i], (v) => { cells[i] = v; }];
}

function render(isLoggedIn) {
  cursor = 0;
  const [name] = useState("Asha");
  let theme;
  if (isLoggedIn) {                                         // a hook inside a condition: forbidden!
    [theme] = useState("dark");
  }
  const [count] = useState(42);                             // its cell index depends on the condition above
  return { name, theme, count };
}

console.log("logged in :", render(true));
console.log("logged out:", render(false));                  // count now reads the cell that holds "dark"!
```

When `isLoggedIn` becomes `false`, `useState(42)` takes cell 1, which contains `"dark"`: wrong data, no error. React detects some of these cases and throws "Rendered fewer hooks than expected".

## Closures and hooks: why stale values happen

Each render creates **new** functions that **capture that render's** `count`. If a long-lived callback (timer, listener, effect with `[]`) captured an old render's `count`, it keeps seeing the old value. You saw this in the closures module. The fixes follow from the model:

- **Functional update** (`setCount(c => c + 1)`): the setter reads the **cell**, not the snapshot.
- **Add the value to the dependency array**, so the effect re-subscribes with a fresh closure.
- **`useRef`** to hold the **latest** value: the ref object is the same across renders.
- **`useEffectEvent`** (new): read the latest props/state inside an effect without re-subscribing.

## The other hooks, in one line each

| Hook | Think of it as |
|---|---|
| `useReducer(reducer, init)` | `useState` with a `(state, action) => newState` function: for complex or related state |
| `useCallback(fn, deps)` | `useMemo(() => fn, deps)`: a **stable function identity** |
| `useContext(Ctx)` | read the nearest provider's value; **re-render when it changes** |
| `useLayoutEffect` | like `useEffect` but runs **synchronously after DOM changes, before paint**: for measuring layout |
| `useId` | a stable unique id (SSR-safe) for `htmlFor`/`aria-*` |
| `useSyncExternalStore` | subscribe safely to an external store (Redux, Zustand) |
| `useTransition`, `useDeferredValue` | mark updates as **non-urgent** (concurrent features) |
| `useImperativeHandle` | customise what a parent gets through a `ref` |
| `use(promise \| context)` (React 19) | read a promise (with Suspense) or context, **can be called conditionally** |
| `useActionState`, `useFormStatus`, `useOptimistic` (React 19) | forms and server actions |

## Custom hooks: reuse logic, not state

A custom hook is a function whose name starts with `use` and which calls other hooks. **Each component that calls it gets its own independent state.**

```js run title="A custom hook built on our mini runtime: useToggle and useCounter share nothing"
// (uses the mini runtime defined in the first example of this lesson; here is a compact copy)
let current = null;
const make = (fn) => { const c = { hooks: [], cursor: 0, fn }; c.render = () => { current = c; c.cursor = 0; c.out = fn(); current = null; return c.out; }; return c; };
const useState = (init) => { const c = current, i = c.cursor++; if (!(i in c.hooks)) c.hooks[i] = { v: init }; const cell = c.hooks[i]; return [cell.v, (n) => { cell.v = typeof n === "function" ? n(cell.v) : n; c.render(); }]; };

function useToggle(initial = false) {                      // a custom hook: composes useState
  const [on, setOn] = useState(initial);
  return [on, () => setOn((v) => !v)];
}

const A = make(() => { const [on, toggle] = useToggle(); return { on, toggle }; });
const B = make(() => { const [on, toggle] = useToggle(); return { on, toggle }; });
A.render(); B.render();
A.out.toggle();
console.log("A:", A.out.on, "| B:", B.out.on, "<- B is unaffected: separate state per component");
```

:::interview How do React hooks work internally? Why can't you call them conditionally?
"React stores an ordered list of hook cells on each component's fiber. When the component renders, each hook call takes the next cell by position: `useState` returns the stored value and a setter that updates the cell and schedules a re-render; `useRef` returns the same object; `useMemo` and `useEffect` store their dependency arrays and compare them with `Object.is` to decide whether to recompute or re-run, effects after commit with the previous cleanup first. The only identity of a hook is its call order, so calling hooks inside conditions, loops or after early returns shifts the cells and mixes up state, which is why the Rules of Hooks exist. Each render creates new closures over that render's snapshot, which explains stale closures, and the fixes are functional updates, correct dependencies or refs."
:::

## More interview questions on this topic

:::qa What happens if a component calls a different number of hooks between renders? {level=medium}
**Say this:** "The cell positions shift, so hooks read the wrong state, and React often throws 'Rendered more/fewer hooks than during the previous render'. Hooks must be called unconditionally in the same order."

**In simple words:** The hooks are matched by position, and the positions no longer line up.
:::

:::qa How does `useRef` differ from `useState`? {level=easy}
**Say this:** "Both persist across renders, but changing `ref.current` does not trigger a re-render and the ref object keeps the same identity. State changes schedule a render and give a new snapshot."

**In simple words:** Ref = a box that remembers silently. State = a box that re-draws the screen when it changes.
:::

:::qa What is the difference between `useEffect` and `useLayoutEffect`? {level=medium}
**Say this:** "`useEffect` runs after the browser has painted, asynchronously; `useLayoutEffect` runs synchronously after DOM mutations and before paint, so it can measure and adjust layout without flicker, but it blocks painting."

**In simple words:** One after the picture is shown, one just before it is shown.
:::

:::qa Do two components using the same custom hook share state? {level=easy}
**Say this:** "No. A custom hook shares logic, not state: every call creates its own cells in its own component."

**In simple words:** The recipe is shared; each cook makes their own dish.
:::

```quiz
? How does React know which state belongs to which useState call?
- The variable name
+ The order of the hook calls in the component
- A unique id you pass
> Hooks are matched by position.
? What does `useRef(0).current++` cause?
- A re-render
+ Nothing visible: no re-render
- An error
> Refs are mutable boxes outside the render cycle.
? When do effects run?
- During render
+ After the render is committed (after paint for useEffect)
- Before the component mounts
> Effects are for side effects, outside rendering.
```

:::keypoints
- Hooks = an **ordered list of cells per component instance**; identity is the **call order**. Hence the **Rules of Hooks** (top level, same order every render).
- `useState` = cell + setter that schedules a render (value is a **snapshot**); `useRef` = stable mutable box; `useMemo`/`useEffect`/`useCallback` = cells with **deps compared by `Object.is`**; effects run after commit, **cleanup first**.
- New closures every render ⇒ **stale closures**; fix with functional updates, deps, refs, `useEffectEvent`.
- `useLayoutEffect` before paint; `useEffect` after. Custom hooks share **logic, not state**.
:::
