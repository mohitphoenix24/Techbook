---
title: Implement event delegation and a DOM helper
level: medium
time: 30
summary: Write delegate(root, selector, type, handler) with closest(), correct currentTarget, an unsubscribe, support for non-bubbling events, and an on-once helper. Runs live in the page.
---

:::problem Implement event delegation {level=medium tags="dom,events,bubbling,delegation"}
A list has 10,000 rows, and rows are added and removed all the time. Adding a listener to every row is slow, and new rows would have no listener.

Write `delegate(root, selector, type, handler, options)`:

1. Adds **one** listener on `root`.
2. When the event fires, finds the **closest ancestor of `event.target` that matches `selector`** and is **inside `root`**.
3. Calls `handler` with `this` and `event.delegateTarget` set to that element. (Use `Object.defineProperty`; `currentTarget` is read-only and equals `root` during the call.)
4. Works for rows **added later**.
5. Returns a function to **remove** the listener.
6. Non-bubbling events (`focus`, `blur`) must still work: use the **capture** phase for them (or `focusin`/`focusout`).

Also write `once(el, type, fn)` using the built-in option.

:::hint Hint
`event.target` may be a child of the element you care about (an icon inside a button). `target.closest(selector)` walks up for you. Then check `root.contains(match)`, because `closest` could find an element **outside** the root.
:::
:::

## Solution and demo

The tests below run in the page. Click **Run** and read the console.

```html run preview height=170 title="delegate(), tested in the browser"
<ul id="list">
  <li class="row" data-id="1"><span class="label">Row 1</span> <button class="del"><b>✕</b></button></li>
  <li class="row" data-id="2"><span class="label">Row 2</span> <button class="del"><b>✕</b></button></li>
</ul>
<input id="name" placeholder="focus me">
<script>
  const FOCUS_LIKE = new Set(["focus", "blur"]);                   // these do not bubble, so use capture

  function delegate(root, selector, type, handler, options = {}) {
    const listener = (event) => {
      const start = event.target instanceof Element ? event.target : event.target.parentElement;   // text nodes have no closest()
      const match = start && start.closest(selector);
      if (!match || !root.contains(match)) return;                  // not found, or found outside the root
      Object.defineProperty(event, "delegateTarget", { value: match, configurable: true });
      handler.call(match, event);
    };
    const capture = options.capture ?? FOCUS_LIKE.has(type);
    root.addEventListener(type, listener, capture);
    return () => root.removeEventListener(type, listener, capture);  // same type + same capture flag, or it is not removed
  }

  const once = (el, type, fn) => el.addEventListener(type, fn, { once: true });

  // ---------------- tests ----------------
  const list = document.getElementById("list");
  const log = [];
  const stop = delegate(list, ".row", "click", function (e) { log.push("row " + this.dataset.id); });
  const stopDel = delegate(list, "button.del", "click", function (e) { e.stopPropagation(); this.closest(".row").remove(); });

  const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (err) { console.log("✗", name, "-", err.message); } };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  test("a click on a child finds the row", () => {
    list.querySelector(".label").click();
    expect(log.join() === "row 1", "got " + log.join());
  });

  test("rows added later work without new listeners", () => {
    const li = document.createElement("li");
    li.className = "row"; li.dataset.id = "3"; li.innerHTML = '<span class="label">Row 3</span>';
    list.append(li);
    li.querySelector(".label").click();
    expect(log.at(-1) === "row 3", "got " + log.at(-1));
  });

  test("the inner <b> of the delete button reaches the button handler", () => {
    const before = list.querySelectorAll(".row").length;
    log.length = 0;
    list.querySelector(".del b").click();
    expect(list.querySelectorAll(".row").length === before - 1, "row was not removed");
  });

  test("stopPropagation does not stop other handlers on the SAME root", () => {
    // Both delegated listeners live on #list. stopPropagation() only stops the event from moving UP to other elements.
    // The row handler (registered first) already ran on #list, so it still logged. stopImmediatePropagation() would stop it.
    expect(log.join() === "row 1", "log was " + log.join());      // the click was inside row 1
  });

  test("a match outside the root is ignored", () => {
    const outside = document.createElement("div");
    outside.className = "row";
    const inner = document.createElement("section");
    outside.append(inner);
    document.body.append(outside);
    const sub = document.createElement("div");
    inner.append(sub);
    const seen = [];
    const off = delegate(sub, ".row", "click", () => seen.push("called"));   // the .row is an ANCESTOR of root
    sub.click();
    off(); outside.remove();
    expect(seen.length === 0, "the handler must not run for an element outside the root");
  });

  test("focus works through capture", () => {
    const seen = [];
    const off = delegate(document.body, "#name", "focus", () => seen.push("focus"));
    document.getElementById("name").focus();
    off();
    expect(seen.length === 1, "focus was not delegated");
  });

  test("the returned function removes the listener", () => {
    const before = log.length;
    stop();
    const row = list.querySelector(".row .label");
    row && row.click();
    expect(log.length === before, "the row handler still ran");
  });

  test("once() runs a single time", () => {
    const b = document.createElement("button");
    let n = 0;
    once(b, "click", () => n++);
    b.click(); b.click();
    expect(n === 1, "ran " + n + " times");
  });
</script>
```

## Why delegation helps

| | Listener on every row | One delegated listener |
|---|---|---|
| Memory | thousands of listeners | one |
| New rows | need new listeners (and cleanup) | work at once |
| Removing rows | listeners must be removed to avoid leaks | nothing to clean |
| Cost | setup time grows with rows | tiny |

## When delegation does not work

- Events that **do not bubble**: `focus`, `blur`, `mouseenter`, `mouseleave`, `load`, `scroll` on elements. Use `focusin`/`focusout`, `mouseover`/`mouseout`, or capture.
- When a **child calls `stopPropagation()`**, the event never reaches the root. (This is a reason to avoid `stopPropagation` in libraries.) And two delegated handlers on the **same root** do not hide events from each other with `stopPropagation()`: you need `stopImmediatePropagation()`, or register the more specific one first.
- `event.target` may be an inner element or a **text node**; always go through `closest`.
- Shadow DOM retargets `event.target` to the host; use `event.composedPath()`.

:::qa What is the difference between `event.target` and `event.currentTarget`? {level=easy}
**Say this:** "`target` is the innermost element that was actually clicked. `currentTarget` is the element the listener is attached to. With delegation, `currentTarget` is the root and `target` is something inside a row, so you use `closest` to find the row."

**In simple words:** `target` is where it happened; `currentTarget` is who is listening.
:::

:::qa Why check `root.contains(match)`? {level=medium}
**Say this:** "`closest` walks up the whole document, so it can match an ancestor that lies outside the root we delegate for. Without the check, a handler could fire for elements that are not in its area."

**In simple words:** Make sure the element is inside your own box.
:::

:::qa How do you avoid leaks with listeners in a component? {level=medium}
**Say this:** "Keep the removal function (or an `AbortController`) and call it when the component is destroyed. With `addEventListener(type, fn, { signal })`, one `controller.abort()` removes every listener that used that signal."

**In simple words:** Whatever you add, remove when you leave.
:::

:::keypoints
- **One listener on a parent**, then `event.target.closest(selector)` and `root.contains(match)`.
- Add **`delegateTarget`** (since `currentTarget` is the root); return an **unsubscribe** with the same type and capture flag.
- Use **capture** (or `focusin`/`focusout`) for non-bubbling events; remember `stopPropagation` breaks delegation.
- Use `{ once: true }` and `{ signal }` for cleanup.
:::
