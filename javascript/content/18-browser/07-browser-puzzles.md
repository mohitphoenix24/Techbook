---
title: Browser output puzzles: events, DOM and timing
level: advanced
time: 30
summary: Eight puzzles you can run in the page: event propagation order, stopPropagation, delegation, once, microtasks in event handlers, innerHTML and live collections, and script execution order.
---

All of these run inside a small sandboxed page, and the **Console** panel under each example shows what was printed. Write your answer first.

## Puzzle 1: capture and bubble order

```html run preview height=60 title="Puzzle 1"
<div id="a"><div id="b"><span id="c">x</span></div></div>
<script>
  for (const id of ["a", "b", "c"]) {
    const el = document.getElementById(id);
    el.addEventListener("click", () => console.log(id, "bubble"));
    el.addEventListener("click", () => console.log(id, "capture"), true);
  }
  document.getElementById("c").click();
</script>
```

:::hint Show the reason
Capture goes down (`a`, `b`, then at the target `c`), bubble goes up. At the **target itself**, listeners run in **registration order** (in modern browsers capture listeners run first at the target, regardless of order). Output: `a capture`, `b capture`, `c capture`, `c bubble`, `b bubble`, `a bubble`.
:::

## Puzzle 2: stopPropagation in the capture phase

```html run preview height=60 title="Puzzle 2"
<div id="outer"><button id="btn">go</button></div>
<script>
  const outer = document.getElementById("outer");
  const btn = document.getElementById("btn");
  outer.addEventListener("click", (e) => { console.log("outer capture"); e.stopPropagation(); }, true);
  btn.addEventListener("click", () => console.log("button"));
  outer.addEventListener("click", () => console.log("outer bubble"));
  btn.click();
  console.log("done");
</script>
```

:::hint Show the reason
Stopping propagation in the **capture** phase at `outer` means the event never reaches the button or the bubble phase. Output: `outer capture`, `done`.
:::

## Puzzle 3: stopImmediatePropagation

```html run preview height=60 title="Puzzle 3"
<button id="b">b</button>
<script>
  const b = document.getElementById("b");
  b.addEventListener("click", () => console.log("first"));
  b.addEventListener("click", (e) => { console.log("second"); e.stopImmediatePropagation(); });
  b.addEventListener("click", () => console.log("third (never)"));
  document.body.addEventListener("click", () => console.log("body (never)"));
  b.click();
</script>
```

:::hint Show the reason
`stopImmediatePropagation` also stops the **remaining listeners on the same element**, and stops propagation to ancestors. Output: `first`, `second`.
:::

## Puzzle 4: microtasks and listeners

```html run preview height=60 title="Puzzle 4"
<button id="b">b</button>
<script>
  const b = document.getElementById("b");
  b.addEventListener("click", () => {
    console.log("listener 1");
    Promise.resolve().then(() => console.log("microtask 1"));
    setTimeout(() => console.log("timeout 1"), 0);
  });
  b.addEventListener("click", () => {
    console.log("listener 2");
    Promise.resolve().then(() => console.log("microtask 2"));
  });
  b.click();
  console.log("after click()");
</script>
```

:::hint Show the reason
`click()` runs from script, so the JavaScript stack is not empty: both listeners run, then the script continues (`after click()`), and only then do microtasks run, then the timer. Output: `listener 1`, `listener 2`, `after click()`, `microtask 1`, `microtask 2`, `timeout 1`. (A real user click would interleave: `listener 1`, `microtask 1`, `listener 2`, `microtask 2`.)
:::

## Puzzle 5: live vs static collections

```html run preview height=60 title="Puzzle 5"
<ul id="u"><li>a</li><li>b</li></ul>
<script>
  const u = document.getElementById("u");
  const live = u.getElementsByTagName("li");
  const staticList = u.querySelectorAll("li");

  u.append(document.createElement("li"));
  console.log(live.length, staticList.length);

  for (const li of live) { if (li.parentNode) u.removeChild(li); }      // removing while iterating a LIVE collection
  console.log("left after loop:", u.children.length);
</script>
```

:::hint Show the reason
The live collection grows (`3`), the static `NodeList` keeps its snapshot (`2`). Removing items while looping over a **live** collection skips elements, because the collection shrinks as you iterate: items at index 0, then (after the shift) index 1... so one `li` remains. Output: `3 2`, then `left after loop: 1`.
:::

## Puzzle 6: this in listeners

```html run preview height=60 title="Puzzle 6"
<button id="b">b</button>
<script>
  const b = document.getElementById("b");
  const obj = {
    name: "obj",
    regular() { console.log("regular:", this === b ? "the button" : this.name); },
    arrow: () => console.log("arrow: this is", this === window ? "window" : typeof this),
  };
  b.addEventListener("click", function () { console.log("function:", this === b, this === event.currentTarget); });
  b.addEventListener("click", obj.regular);
  b.addEventListener("click", obj.arrow);
  b.addEventListener("click", () => obj.regular());
  b.click();
</script>
```

:::hint Show the reason
A normal function listener gets `this = the element`. `obj.regular` passed directly also gets the element (`the button`). The arrow function at the top level has `this` of the page (the `window`). Calling `obj.regular()` through a wrapper makes `this = obj`. Output: `function: true true`, `regular: the button`, `arrow: this is window`, `regular: obj`.
:::

## Puzzle 7: once and removed listeners

```html run preview height=60 title="Puzzle 7"
<button id="b">b</button>
<script>
  const b = document.getElementById("b");
  const handler = () => console.log("handler");

  b.addEventListener("click", handler);
  b.addEventListener("click", handler);                       // the same function and options: added once
  b.addEventListener("click", () => console.log("anonymous 1"));
  b.removeEventListener("click", () => console.log("anonymous 1"));     // a different function object: nothing removed
  b.addEventListener("click", () => console.log("once"), { once: true });

  b.click();
  b.click();
</script>
```

:::hint Show the reason
Adding the **same** function twice registers it once. Removing an inline arrow does nothing, since it is a different function. The `once` listener is removed after the first call. Output (first click): `handler`, `anonymous 1`, `once`; (second click): `handler`, `anonymous 1`.
:::

## Puzzle 8: script and DOM order

```html run preview height=60 title="Puzzle 8"
<p id="p">paragraph</p>
<script>
  console.log("1 script runs while parsing; #p exists:", !!document.getElementById("p"), "| #later exists:", !!document.getElementById("later"));
  document.addEventListener("DOMContentLoaded", () => console.log("4 DOMContentLoaded"));
  window.addEventListener("load", () => console.log("5 load"));
  setTimeout(() => console.log("3 timeout"), 0);
  Promise.resolve().then(() => console.log("2 microtask"));
</script>
<p id="later">later paragraph</p>
```

:::hint Show the reason
Inline scripts run **at the point where the parser reaches them**, so `#p` exists but `#later` does not yet. The microtask always runs right after the script. `DOMContentLoaded` fires when the HTML is fully parsed, and `load` when all resources are loaded. The timer is a separate task, and its place relative to those two is **not guaranteed** (here it usually comes last). Typical output: `1 script runs...: true | #later exists: false`, `2 microtask`, `4 DOMContentLoaded`, `5 load`, `3 timeout`.
:::

## Cheat sheet

| Question | Answer |
|---|---|
| Event order | capture (down) → target → bubble (up) |
| Stop reaching other elements | `stopPropagation()`; also other listeners on the same element: `stopImmediatePropagation()` |
| Cancel the default action | `preventDefault()` |
| Microtasks and listeners | real events: after each listener; script-dispatched: after all listeners |
| Live vs static | `getElementsBy*`, `children` are live; `querySelectorAll` is static |
| `this` in a listener | the element (normal function); lexical (arrow) |
| Page events | script (at parse point) → `DOMContentLoaded` → `load` |

:::keypoints
- Capture runs **top-down**, bubble **bottom-up**; the target is in between.
- `stopPropagation` ≠ `stopImmediatePropagation` ≠ `preventDefault`.
- Script-dispatched events delay microtasks until **all listeners** ran.
- Live collections change while you loop: copy with `[...list]` first.
- The same function added twice is registered once; an inline arrow cannot be removed.
:::
