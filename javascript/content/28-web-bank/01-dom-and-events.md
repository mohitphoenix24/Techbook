---
title: "Web bank: the DOM and events"
level: medium
time: 25
summary: Twelve answers on the DOM tree, selecting and changing elements, event capture and bubbling, delegation, passive listeners, observers and common browser APIs.
---

:::qa What is the DOM? {level=easy}
**Say this:** "The Document Object Model is the browser's in-memory tree of objects that represents the HTML page. JavaScript uses it to read and change elements, attributes, text and styles, and the browser re-renders when it changes."

**In simple words:** A family tree of the page that your code can edit.
:::

:::qa `querySelector` versus `getElementById` versus `getElementsByClassName`? {level=easy}
**Say this:** "`getElementById` is the fastest and returns one element. `querySelector`/`querySelectorAll` accept any CSS selector; `querySelectorAll` returns a static `NodeList`. `getElementsByClassName` returns a live `HTMLCollection` that updates when the DOM changes."

**In simple words:** A direct address, a flexible search, and a search result list that updates itself.
:::

:::qa `textContent`, `innerText` and `innerHTML`? {level=medium}
**Say this:** "`textContent` gets or sets raw text and is fast and safe. `innerText` respects CSS (hidden text is skipped) and triggers layout. `innerHTML` parses a string as HTML, which is dangerous with user input (XSS). Prefer `textContent` or create elements with `createElement`."

**In simple words:** Text is safe; HTML strings can carry attacks.
:::

:::qa Explain event capturing, target and bubbling. {level=medium}
**Say this:** "An event first travels down from `window` to the target (capture phase), runs on the target, then travels back up (bubble phase). `addEventListener(type, fn)` listens in the bubble phase by default; pass `true` or `{ capture: true }` for capture. `stopPropagation` stops the travel."

**In simple words:** The message goes down the building to the room, then back up through the floors.
:::

:::qa What is event delegation, and why use it? {level=easy}
**Say this:** "Attaching one listener to a parent instead of many on children, then using `event.target.closest(selector)` to find the real element. It saves memory, works for elements added later, and avoids cleanup. It does not work for events that do not bubble (`focus`, `blur`, `mouseenter`), where you use `focusin`/`focusout` or capture."

**In simple words:** One receptionist at the entrance instead of one in every room.
:::

:::qa `event.target` versus `event.currentTarget`? {level=easy}
**Say this:** "`target` is the element where the event started (the innermost element clicked). `currentTarget` is the element the running listener is attached to."

**In simple words:** Where it happened versus who is listening.
:::

:::qa `preventDefault` versus `stopPropagation` versus `stopImmediatePropagation`? {level=medium}
**Say this:** "`preventDefault` cancels the browser's default action (following a link, submitting a form) but the event keeps travelling. `stopPropagation` stops it reaching other elements. `stopImmediatePropagation` also stops the other listeners on the same element."

**In simple words:** Cancel the action, stop the message travelling, or stop everyone in the room.
:::

:::qa What are passive event listeners? {level=hard}
**Say this:** "A listener registered with `{ passive: true }` promises it will not call `preventDefault()`, so the browser can scroll immediately without waiting for your handler. It is the default for `touchstart`, `touchmove` and `wheel` on the window, and it improves scrolling performance."

**In simple words:** Telling the browser 'I will not block scrolling', so it does not wait for you.
:::

:::qa How do you remove an event listener, and what causes leaks? {level=medium}
**Say this:** "`removeEventListener` with the same function reference and capture flag (anonymous functions cannot be removed). Or use `{ signal }` with an `AbortController` and abort once. Forgotten listeners on long-lived targets (`window`, `document`) keep closures and DOM nodes alive."

**In simple words:** Keep the handle of what you attach, so you can detach it.
:::

:::qa What is the difference between `DOMContentLoaded`, `load` and `defer`/`async` scripts? {level=medium}
**Say this:** "`DOMContentLoaded` fires when the HTML is parsed and deferred scripts have run, without waiting for images and styles. `load` fires after everything, including images. A normal script blocks parsing; `defer` downloads in parallel and runs in order after parsing; `async` runs as soon as it is downloaded, in any order."

**In simple words:** Page is readable, page is complete; and how scripts avoid blocking the page.
:::

:::qa Which observers does the browser provide? {level=medium}
**Say this:** "`IntersectionObserver` (visibility: lazy loading, infinite scroll), `ResizeObserver` (element size changes), `MutationObserver` (DOM changes), and `PerformanceObserver` (metrics). They avoid polling and scroll handlers."

**In simple words:** The browser tells you when something changes, so you do not keep asking.
:::

:::qa How do you create many DOM elements efficiently? {level=medium}
**Say this:** "Build them in a `DocumentFragment` (or a string with `insertAdjacentHTML` for trusted content) and insert once, to avoid repeated layout. Batch reads and writes, and virtualise long lists so only visible rows exist."

**In simple words:** Prepare everything off-stage, then bring it on in one go.
:::

:::keypoints
- Prefer `textContent`; **`innerHTML` with user input = XSS**.
- Events: **capture ↓, target, bubble ↑**; **delegate** with `closest`.
- `preventDefault` ≠ `stopPropagation`; **passive** listeners keep scrolling smooth.
- Use **observers** instead of scroll handlers; remove listeners (or use `AbortController`).
:::
