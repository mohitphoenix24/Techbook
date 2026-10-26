---
title: The DOM and the BOM
level: easy
time: 30
summary: What the DOM is (a tree of nodes), how to select, create, change and remove elements efficiently, textContent vs innerHTML, DOM collections, the BOM objects (window, location, history, navigator), and the observer APIs.
---

## The DOM: a live tree

When the browser loads HTML, it parses it into the **Document Object Model (DOM)**: a **tree of objects** you can read and change with JavaScript. Changing the tree changes the page.

```viz algo=chain title="HTML and its DOM tree"
node html "html" @0,0
node body "body" @1,0
node ul "ul#list" @2,0 [hl]
node li1 "li (text: Tea)" @3,0
node li2 "li.done (text: Coffee)" @3,1 [ok]
link html -> body : child
link body -> ul : child
link ul -> li1 : child
link ul -> li2 : child
```

The DOM is **not** the HTML source: it is a **live** structure. JavaScript can add elements that were never in the HTML, and the browser also repairs invalid HTML.

Node types you meet: **Element** (`<div>`), **Text**, **Comment**, **Document**, **DocumentFragment**. Elements have `parentNode`, `children`, `firstElementChild`, `nextElementSibling`, etc.

## Selecting elements

```html run title="Selecting, creating, changing and removing" preview height=120
<ul id="list">
  <li>Tea</li>
  <li class="done">Coffee</li>
</ul>
<script>
  const list = document.getElementById("list");                    // by id (fastest)
  const items = list.querySelectorAll("li");                        // CSS selector, returns a static NodeList
  const done = list.querySelector("li.done");                       // first match, or null
  console.log(items.length, done.textContent);

  const li = document.createElement("li");                          // create
  li.textContent = "Juice";                                          // safe text
  li.classList.add("new");                                           // classes
  li.dataset.price = "40";                                           // data-price="40"
  list.append(li);                                                   // add to the end

  list.firstElementChild.remove();                                   // remove the first item
  done.setAttribute("title", "already finished");
  console.log([...list.children].map((c) => c.textContent + (c.className ? "." + c.className : "")));
  console.log(list.children.length, li.parentNode === list, li.closest("ul") === list, li.dataset.price);
</script>
```

| Method | Returns | Live? |
|---|---|---|
| `getElementById(id)` | element or null | |
| `querySelector(css)` / `querySelectorAll(css)` | first match / **static** `NodeList` | static (a snapshot) |
| `getElementsByClassName`, `getElementsByTagName` | **live** `HTMLCollection` | live (updates automatically) |
| `el.children`, `el.childNodes` | `HTMLCollection` / `NodeList` | live |
| `el.closest(css)` | the nearest ancestor (or itself) matching | |
| `el.matches(css)` | boolean | |

`NodeList` and `HTMLCollection` are **array-like**, not arrays: use `[...list]` or `Array.from(list)` to use `map`/`filter`. (`NodeList.forEach` exists.)

## textContent vs innerHTML (security!)

| | `textContent` | `innerHTML` |
|---|---|---|
| Treats the value as | plain **text** | **HTML** (parsed) |
| Safe with user input? | **Yes** | **No: XSS risk** |
| Speed | fast | slower (parses HTML, rebuilds children) |

```html run title="innerHTML runs untrusted markup, textContent does not" preview height=80
<div id="a"></div><div id="b"></div>
<script>
  const userInput = '<img src="x" onerror="console.log(\'XSS: attacker code ran\')">';
  document.getElementById("a").innerHTML = userInput;       // the browser creates the img, the error handler runs: attacker's code
  document.getElementById("b").textContent = userInput;     // shown as harmless text
  console.log(document.getElementById("b").innerHTML);
</script>
```

Rules: use **`textContent`** (or `createElement` + `append`) for user data. If you must insert HTML, **sanitise** it (DOMPurify), use the **Sanitizer API** when available, and set a **Content-Security-Policy**. Frameworks (React, Vue) escape by default; `dangerouslySetInnerHTML` / `v-html` turn that off.

## Efficient updates: batch DOM work

Touching the DOM is much slower than plain JavaScript, and each change can trigger layout. **Batch** changes:

```html run title="DocumentFragment: build offline, insert once" preview height=60
<ul id="big"></ul>
<script>
  const ul = document.getElementById("big");

  // slow pattern: 1000 separate insertions into the live DOM
  // for (let i = 0; i < 1000; i++) ul.appendChild(Object.assign(document.createElement("li"), { textContent: i }));

  // better: build in a fragment (or an array of strings), insert once
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 1000; i++) {
    const li = document.createElement("li");
    li.textContent = "Item " + i;
    fragment.append(li);
  }
  ul.append(fragment);                         // ONE insertion

  // also good: replaceChildren with an array
  ul.replaceChildren(...Array.from({ length: 3 }, (_, i) => Object.assign(document.createElement("li"), { textContent: "Row " + i })));
  console.log("children:", ul.children.length);
</script>
```

For very long lists use **virtualisation** (render only visible rows: `react-window`, `@tanstack/virtual`) and **`content-visibility: auto`**.

## The BOM: the browser object model

The **BOM** is everything the browser gives you **besides the document**:

| Object | What it offers |
|---|---|
| `window` | the global object in the browser (`window.innerWidth`, `setTimeout`, `alert`, `open`) |
| `location` | the URL: `href`, `origin`, `pathname`, `search`, `hash`, `assign()`, `reload()` |
| `history` | `back()`, `forward()`, `pushState()`, `replaceState()` (what client-side routers use) |
| `navigator` | `userAgent`, `language`, `onLine`, `clipboard`, `geolocation`, `serviceWorker`, `mediaDevices` |
| `screen` | screen size, orientation |
| `localStorage`, `sessionStorage`, `document.cookie` | storage (next lessons) |
| `performance` | timing, `performance.now()`, marks and measures |

```html run title="location and URL, history and window sizes" preview height=60
<script>
  const url = new URL("https://shop.example.com:8443/products/list?category=tea&page=2#reviews");
  console.log(url.origin, url.pathname, url.searchParams.get("category"), url.hash);

  console.log(typeof window.innerWidth, typeof location.href, typeof history.length, typeof navigator.userAgent);
  console.log(window === globalThis, window.window === window, typeof document.documentElement.clientWidth);
</script>
```

Single-page apps change the URL **without reloading**:

```js
history.pushState({ page: 2 }, "", "/products?page=2");          // adds an entry, no reload
window.addEventListener("popstate", (e) => render(location.pathname, e.state));   // back/forward buttons
```

## Observer APIs (do not poll, subscribe)

| API | Tells you when... | Use for |
|---|---|---|
| **`IntersectionObserver`** | an element enters or leaves the viewport | lazy-loading images, infinite scroll, analytics, animations on scroll |
| **`MutationObserver`** | the DOM changes (children, attributes, text) | reacting to third-party DOM changes |
| **`ResizeObserver`** | an element's size changes | responsive components, charts |
| **`PerformanceObserver`** | performance entries appear (LCP, long tasks) | monitoring |

```js
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.src = entry.target.dataset.src;       // load the image only when it is about to be seen
      observer.unobserve(entry.target);
    }
  }
}, { rootMargin: "200px" });                                // start loading 200px before it is visible
document.querySelectorAll("img[data-src]").forEach((img) => observer.observe(img));
```

## Script loading: where JavaScript meets the parser

| Tag | Download | Execution |
|---|---|---|
| `<script src>` | blocks HTML parsing | runs immediately, blocks parsing |
| `<script defer src>` | parallel | after parsing, **in order**, before `DOMContentLoaded` |
| `<script async src>` | parallel | **as soon as downloaded**, in any order |
| `<script type="module">` | parallel | deferred by default; modules are strict, have their own scope |

Put scripts in `<head>` with **`defer`** (or `type="module"`), so they download early but do not block rendering. `DOMContentLoaded` = HTML parsed; `load` = everything (images, styles) loaded.

:::interview What is the DOM? How do you manipulate it efficiently and safely?
"The DOM is the browser's live, tree-shaped object representation of the document: elements, text and attributes you can read and change from JavaScript. I select with `querySelector` or `getElementById`, create with `createElement`, and update with `textContent`, `classList` and `dataset`. For safety, I never put user input into `innerHTML`, because it parses HTML and enables XSS; I use `textContent` or sanitise with DOMPurify. For performance I batch changes with a DocumentFragment or `replaceChildren`, avoid interleaving layout reads and writes, virtualise long lists, and use observers such as IntersectionObserver instead of scroll polling."
:::

## More interview questions on this topic

:::qa What is the difference between the DOM and the BOM? {level=easy}
**Say this:** "The DOM represents the document (HTML elements). The BOM is the browser's own objects beyond the document: `window`, `location`, `history`, `navigator`, `screen`."

**In simple words:** DOM = the page. BOM = the browser around the page.
:::

:::qa What is the difference between `querySelectorAll` and `getElementsByClassName`? {level=medium}
**Say this:** "`querySelectorAll` takes any CSS selector and returns a static NodeList (a snapshot). `getElementsByClassName` returns a live HTMLCollection that updates as the DOM changes."

**In simple words:** A photo vs a live video.
:::

:::qa What do `defer` and `async` do on a script tag? {level=medium}
**Say this:** "Both download in parallel with HTML parsing. `defer` runs scripts in order after the document is parsed; `async` runs each script as soon as it arrives, in any order, which suits independent scripts like analytics."

**In simple words:** defer = later, in order. async = whenever ready.
:::

:::qa How do you lazy-load images? {level=easy}
**Say this:** "Use the native `loading="lazy"` attribute, or an `IntersectionObserver` that sets the real `src` when the image is near the viewport."

**In simple words:** Do not download pictures nobody has scrolled to.
:::

```quiz
? Which is safe for inserting untrusted text?
- innerHTML
+ textContent
- outerHTML
> textContent does not parse HTML.
? What does querySelectorAll return?
- A live HTMLCollection
+ A static NodeList
- An array
> A snapshot at the time of the call.
? Which script attribute keeps execution order and waits for parsing?
- async
+ defer
- none
> Deferred scripts run in order after parsing.
```

:::keypoints
- **DOM** = live tree of nodes; **BOM** = `window`, `location`, `history`, `navigator`, `screen`.
- Select: `querySelector(All)` (static) vs `getElementsBy*` (live). `NodeList` is array-like.
- **`textContent`** for user data; **`innerHTML`** only with trusted/sanitised HTML (XSS).
- Batch updates (**fragments**, `replaceChildren`); **virtualise** long lists; use **observers** instead of polling.
- Scripts: **`defer`** (ordered, after parse), **`async`** (as soon as ready), **`type="module"`** (deferred).
:::
