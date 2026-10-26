---
title: DOM events: capturing, bubbling, delegation
level: intermediate
time: 40
summary: The three phases of event propagation (capture, target, bubble), target vs currentTarget, stopPropagation and preventDefault, the addEventListener options, event delegation, custom events, and how events interact with microtasks.
---

## What happens when you click

An event does not only happen **on the element**. It **travels** through the tree in three phases:

```
          window
            │  1. CAPTURING  (from the root down to the target)
          document
            │
           html
            │
           body
            │
           div#outer          ← listeners registered with { capture: true } run here on the way down
            │
          div#inner
            │
        ► button#target       2. TARGET (the element that was clicked)
            │
          div#inner           3. BUBBLING  (from the target back up to the root)
            │
          div#outer           ← normal listeners (capture: false) run here on the way up
            │
           body ... window
```

By default `addEventListener("click", fn)` listens in the **bubbling** phase. Pass `true` or `{ capture: true }` to listen while the event is **going down**.

```html run title="Capture goes down, bubble goes up" preview height=100
<div id="outer"><div id="inner"><button id="btn">Click</button></div></div>
<script>
  const outer = document.getElementById("outer");
  const inner = document.getElementById("inner");
  const btn = document.getElementById("btn");
  const log = (label) => (e) => console.log(label.padEnd(18), "target:", e.target.id, "| currentTarget:", e.currentTarget.id, "| phase:", e.eventPhase);

  outer.addEventListener("click", log("outer  (bubble)"));
  inner.addEventListener("click", log("inner  (bubble)"));
  btn.addEventListener("click", log("button (target)"));
  outer.addEventListener("click", log("outer  (CAPTURE)"), true);
  inner.addEventListener("click", log("inner  (CAPTURE)"), true);

  btn.click();                                               // dispatches a real click event
</script>
```

Order: outer capture → inner capture → button (target) → inner bubble → outer bubble. `eventPhase`: 1 = capture, 2 = at target, 3 = bubble.

### `target` vs `currentTarget`

| Property | Meaning |
|---|---|
| **`event.target`** | the element where the event **started** (the deepest element clicked) |
| **`event.currentTarget`** | the element whose **listener is running now** (same as `this` in a normal function listener) |

## Stopping and cancelling

| Method | Effect |
|---|---|
| **`event.stopPropagation()`** | stops the event travelling to **other elements** (the rest of the path) |
| **`event.stopImmediatePropagation()`** | also stops **other listeners on the same element** |
| **`event.preventDefault()`** | cancels the browser's **default action** (follow a link, submit a form, check a box, scroll). It does **not** stop propagation |
| `return false` | in an `onclick="..."` attribute: both; in `addEventListener`, nothing |

```html run title="stopPropagation vs preventDefault" preview height=100
<div id="parent"><a id="link" href="https://example.com/never-opened">a link</a></div>
<script>
  const parent = document.getElementById("parent");
  const link = document.getElementById("link");

  parent.addEventListener("click", () => console.log("parent heard the click"));

  link.addEventListener("click", (e) => {
    e.preventDefault();                                       // the link will NOT navigate
    console.log("link: default prevented?", e.defaultPrevented, "| cancelable?", e.cancelable);
  });
  link.click();                                               // parent still hears it (bubbling continues)

  link.addEventListener("click", (e) => e.stopPropagation(), { once: true });
  link.click();                                               // this time the parent does not hear it
</script>
```

Avoid `stopPropagation()` unless needed: it breaks **analytics, global handlers, and event delegation** higher up. Prefer checking `event.target` in the handler.

## `addEventListener` options

```js
el.addEventListener("click", handler, {
  capture: false,       // listen in the capture phase
  once: true,           // remove the listener automatically after the first call
  passive: true,        // promise not to call preventDefault (lets the browser scroll without waiting)
  signal: controller.signal,   // remove the listener when controller.abort() is called
});
```

```html run title="once, and removing listeners with AbortController" preview height=60
<button id="b">Press</button>
<script>
  const b = document.getElementById("b");
  const controller = new AbortController();

  b.addEventListener("click", () => console.log("once: only the first click"), { once: true });
  b.addEventListener("click", () => console.log("with signal: still listening"), { signal: controller.signal });

  b.click(); b.click();
  controller.abort();                                          // removes every listener registered with this signal
  b.click();
  console.log("after abort, no more output from the signal listener");
</script>
```

`removeEventListener` needs the **same function reference** and the same `capture` flag. `AbortController` is the easiest way to remove many listeners at once (for example in a React effect cleanup).

## Event delegation

Instead of adding a listener to **every** child, add **one** on a **parent** and use `event.target`.

Why:

- **Memory:** 1 listener instead of 1,000.
- **Dynamic content:** elements added later work automatically (no need to attach listeners again).
- Simple cleanup.

```html run title="One listener on the list handles every item, even new ones" preview height=140
<ul id="todo">
  <li data-id="1">Learn closures <button data-action="done">done</button> <button data-action="remove">x</button></li>
  <li data-id="2">Learn events <button data-action="done">done</button> <button data-action="remove">x</button></li>
</ul>
<script>
  const todo = document.getElementById("todo");

  todo.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");     // closest(): works even if you click an icon INSIDE the button
    if (!button || !todo.contains(button)) return;                   // ignore clicks elsewhere
    const li = button.closest("li");
    const { action } = button.dataset;
    console.log(`${action} on item ${li.dataset.id}`);
    if (action === "remove") li.remove();
  });

  // an item added later also works: no new listener needed
  const li = document.createElement("li");
  li.dataset.id = "3";
  li.innerHTML = 'Added later <button data-action="done">done</button>';
  todo.append(li);

  todo.querySelector('li[data-id="1"] button[data-action="done"]').click();
  li.querySelector("button").click();
  todo.querySelector('li[data-id="2"] button[data-action="remove"]').click();
  console.log("items left:", todo.children.length);
</script>
```

Not every event bubbles. `focus`, `blur`, `mouseenter`, `mouseleave`, `load` and `scroll` (on elements) **do not bubble**. Use their bubbling versions (`focusin`, `focusout`, `mouseover`/`mouseout`), or the **capture** phase for delegation (`{ capture: true }` works for any event).

## Custom events

```html run title="CustomEvent: your own events with data" preview height=60
<div id="widget"></div>
<script>
  const widget = document.getElementById("widget");

  document.addEventListener("cart:add", (e) => console.log("document heard:", e.detail));     // bubbles up to document

  widget.dispatchEvent(new CustomEvent("cart:add", {
    detail: { sku: "TEA-1", qty: 2 },                         // any data
    bubbles: true,                                             // custom events do NOT bubble by default
    cancelable: true,
  }));
</script>
```

Custom events (and `EventTarget`/`EventEmitter`) decouple components: the sender does not know who listens. Web Components and micro-frontends communicate this way.

## Events and the event loop

Each event listener runs as part of a **task**. After **each listener** returns, the **microtask queue** is drained (if the JavaScript stack is empty). A **real user click** therefore gives: listener 1, its microtasks, listener 2, its microtasks. But with **`el.click()` or `dispatchEvent` from script**, the JavaScript stack is **not empty** (your script is running), so microtasks wait until **all listeners** have run.

```html run title="Microtasks between listeners: dispatched from script" preview height=60
<button id="b">b</button>
<script>
  const b = document.getElementById("b");
  b.addEventListener("click", () => { console.log("listener 1"); Promise.resolve().then(() => console.log("  microtask from 1")); });
  b.addEventListener("click", () => { console.log("listener 2"); Promise.resolve().then(() => console.log("  microtask from 2")); });

  b.click();                                   // from script: both listeners run first, THEN the microtasks
  console.log("after click() returned");
  // With a real user click the order would be: listener 1, microtask from 1, listener 2, microtask from 2.
</script>
```

This is a classic senior-level detail: **synthetic vs real events** differ in microtask timing.

## Common mistakes

| Mistake | Fix |
|---|---|
| Adding listeners in a loop for 1000 items | Delegation |
| `removeEventListener("click", () => ...)` (new function) | Keep a reference, or use `signal` |
| `this` in an arrow-function listener | Use `event.currentTarget` |
| Expecting `focus` / `mouseenter` to bubble | Use `focusin` / `mouseover`, or capture |
| Listeners never removed (SPA, effects) | Cleanup, `AbortController`, `{ once: true }` |
| `stopPropagation` to "fix" things | Check `event.target`, restructure |
| Heavy work in `scroll`/`mousemove` listeners | Throttle, `requestAnimationFrame`, `{ passive: true }` |

:::interview Explain event bubbling and capturing. What is event delegation and why use it?
"When an event fires, it travels in three phases: capturing from the window down to the target, the target phase, then bubbling back up. Listeners are by default registered for the bubbling phase; `{ capture: true }` registers for the capturing phase. `event.target` is the element that started the event and `currentTarget` is the element whose listener is running. `stopPropagation` stops it travelling further, `preventDefault` cancels the browser default such as navigation or form submit, and they are independent. Event delegation puts one listener on a parent and uses `event.target.closest(...)` to find the child that matters, which saves memory, works for elements added later and makes cleanup easy. Events like focus and mouseenter do not bubble, so I use focusin or capture."
:::

## More interview questions on this topic

:::qa What is the difference between `event.target` and `event.currentTarget`? {level=easy}
**Say this:** "`target` is the deepest element where the event happened; `currentTarget` is the element the running listener is attached to."

**In simple words:** Where it started vs where I am listening.
:::

:::qa Does `preventDefault` stop propagation? {level=easy}
**Say this:** "No. They are independent: `preventDefault` cancels the default browser action, `stopPropagation` stops the event from reaching other elements."

**In simple words:** One cancels what the browser would do; the other cancels who else hears it.
:::

:::qa What is a passive event listener? {level=medium}
**Say this:** "A listener registered with `{ passive: true }`, promising not to call `preventDefault`, so the browser can scroll or zoom immediately without waiting for the handler. Touch and wheel listeners on the document are passive by default."

**In simple words:** "I will not block the scroll," so the browser does not wait.
:::

:::qa How do events relate to microtasks? {level=hard}
**Say this:** "After each listener runs, if the JS stack is empty, microtasks run before the next listener. For script-dispatched events (`click()`, `dispatchEvent`) the stack is not empty, so all listeners run before any microtask."

**In simple words:** A real click gives each listener a fresh turn; a script click does not.
:::

```quiz
? In which phase do normal addEventListener handlers run?
- Capturing
- Target only
+ Bubbling (and at the target)
> Pass capture: true for the capturing phase.
? Which event does NOT bubble?
- click
+ focus
- keydown
> Use focusin instead.
? What is the main benefit of event delegation?
- Faster events
+ One listener handles many (and future) children
- It prevents bubbling
> Less memory, works for dynamic content.
```

:::keypoints
- Three phases: **capture (down) → target → bubble (up)**. Default listeners run on **bubble**; `{ capture: true }` on capture.
- **`target`** (origin) vs **`currentTarget`** (current listener). **`preventDefault`** (cancel default) ≠ **`stopPropagation`** (stop travelling).
- Options: **`once`**, **`passive`**, **`capture`**, **`signal`** (AbortController).
- **Delegation**: one parent listener + `event.target.closest()`. `focus`/`blur`/`mouseenter` do not bubble.
- Custom events: `new CustomEvent(name, { detail, bubbles: true })`. Script-dispatched events delay microtasks until all listeners ran.
:::
