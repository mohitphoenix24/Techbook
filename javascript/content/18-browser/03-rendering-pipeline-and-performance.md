---
title: How the browser renders a page, and how to keep it fast
level: advanced
time: 40
summary: The critical rendering path (parse, style, layout, paint, composite), reflow vs repaint vs composite-only changes, layout thrashing and how to avoid it, loading performance (render-blocking resources, preload, lazy loading), and the Core Web Vitals.
---

## From bytes to pixels

```viz algo=chain title="The critical rendering path"
node html "1. HTML" @0,0
  note: parsed into the DOM
node css "2. CSS" @0,1
  note: parsed into the CSSOM
node tree "3. Render tree" @1,0 [hl]
  note: visible nodes + computed styles
node layout "4. Layout (reflow)" @2,0
  note: size and position of every box
node paint "5. Paint" @3,0
  note: draw text, colours, borders into layers
node comp "6. Composite" @4,0 [ok]
  note: layers combined on the GPU
link html -> tree : DOM
link css -> tree : CSSOM
link tree -> layout
link layout -> paint
link paint -> comp
```

1. **Parse HTML → DOM.** Scripts can pause parsing (unless `defer`/`async`).
2. **Parse CSS → CSSOM.** CSS is **render-blocking**: the browser will not paint until it knows the styles.
3. **Build the render tree** (DOM + CSSOM, without `display: none` nodes).
4. **Layout** (reflow): compute the geometry of every box.
5. **Paint:** turn boxes into pixels on **layers**.
6. **Composite:** combine layers (possibly on the **GPU**) and show the frame.

When JavaScript changes the page, the browser may have to redo some or all of these steps for the next **frame** (about 16.7 ms at 60 fps).

## What each kind of change costs

| You change... | Browser redoes | Cost | Example |
|---|---|---|---|
| **Geometry** (width, height, margin, top, font-size, adding or removing nodes) | **layout + paint + composite** | highest ("reflow") | `el.style.width = "200px"` |
| **Appearance only** (colour, background, box-shadow, visibility) | paint + composite | medium ("repaint") | `el.style.background = "red"` |
| **`transform`, `opacity`** (on their own compositor layer) | **composite only** | lowest | `el.style.transform = "translateX(100px)"` |

So **animate `transform` and `opacity`**, not `left`/`top`/`width`. They can be handled on the GPU without layout or paint, and keep 60 fps even when the main thread is busy.

```css
.box { transition: transform 300ms ease, opacity 300ms ease; will-change: transform; }   /* a hint: use sparingly */
.box:hover { transform: scale(1.1) translateY(-4px); }
```

## Layout thrashing: interleaving reads and writes

Some properties **force the browser to compute layout immediately** when you read them (**forced synchronous layout**): `offsetWidth`, `offsetHeight`, `clientWidth`, `getBoundingClientRect()`, `scrollTop`, `getComputedStyle(el).width`...

If you **write** (invalidating layout), then **read** (forcing layout), then write, then read, in a loop, the browser recalculates layout on **every iteration**: **layout thrashing**.

```js
// BAD: read, write, read, write... forces a layout on each iteration
for (const box of boxes) {
  const width = box.offsetWidth;            // READ  (forces layout, if a write happened before)
  box.style.width = width * 2 + "px";       // WRITE (invalidates layout)
}

// GOOD: batch all reads, then all writes
const widths = boxes.map((box) => box.offsetWidth);                     // all reads: one layout
boxes.forEach((box, i) => { box.style.width = widths[i] * 2 + "px"; }); // all writes: one layout later
```

```js
// Even better in animation code: do writes inside requestAnimationFrame
function update() {
  requestAnimationFrame(() => {
    const height = panel.offsetHeight;                // read at the start of the frame
    list.style.height = height + "px";                // write
  });
}
```

Libraries like **FastDOM** schedule reads and writes in separate phases. Frameworks (React, Vue) batch DOM writes for you, but **your own `getBoundingClientRect` calls in effects can still thrash**.

```js run title="Reads and writes, batched: the same result, fewer layouts (a model, not a measurement)"
// A tiny model of layout cost: a write invalidates layout, a read after a write forces a recalculation.
function simulate(order) {
  let dirty = false, layouts = 0;
  for (const op of order) {
    if (op === "write") dirty = true;
    if (op === "read" && dirty) { layouts++; dirty = false; }
  }
  return layouts;
}

const n = 100;
const interleaved = Array.from({ length: n }, () => ["read", "write"]).flat();            // r w r w r w ...
const batched = [...Array(n).fill("read"), ...Array(n).fill("write")];                      // r r r ... w w w ...
console.log("forced layouts, interleaved:", simulate(interleaved), "| batched:", simulate(batched));
```

## Make the first paint fast: loading performance

### Render-blocking resources

- **CSS** in `<head>` blocks rendering. Keep it small, inline the **critical CSS**, load the rest asynchronously.
- **Synchronous `<script>`** blocks the parser. Use **`defer`** or `type="module"`.
- **Web fonts** can delay text (FOIT) or cause shifts: use `font-display: swap` and preload the key font.

### Hints to the browser

```html
<link rel="preconnect" href="https://api.example.com">      <!-- open the connection early -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>   <!-- this resource is needed SOON -->
<link rel="prefetch" href="/next-page.js">                  <!-- fetch at low priority, for a LIKELY next page -->
<img src="hero.jpg" fetchpriority="high" width="1200" height="600" alt="...">      <!-- the LCP image first -->
<img src="below-the-fold.jpg" loading="lazy" decoding="async" width="400" height="300" alt="...">
<script src="app.js" defer></script>
```

Always set **`width` and `height`** (or `aspect-ratio`) on images and embeds, so the browser reserves space and the page does not jump.

### Ship less JavaScript

- **Code splitting** (`import()`, route-level splitting), **tree-shaking**, **minification** and **compression** (brotli).
- Avoid huge dependencies (check with **bundle analyzers**: `webpack-bundle-analyzer`, `source-map-explorer`).
- **Defer** third-party scripts (analytics, chat widgets): they often cost more than your own code.
- Prefer **server-side rendering** or **static generation** for the first view, then hydrate (see the React module).

## Core Web Vitals: what Google measures

| Metric | Measures | Good |
|---|---|---|
| **LCP** (Largest Contentful Paint) | **loading**: when the main content appears | ≤ 2.5 s |
| **INP** (Interaction to Next Paint) | **responsiveness**: delay between a user action and the next paint (replaced FID in 2024) | ≤ 200 ms |
| **CLS** (Cumulative Layout Shift) | **visual stability**: how much things jump around | ≤ 0.1 |

How the JavaScript you write affects them:

- **LCP:** big hero image or text blocked by CSS/JS; slow server response; late discovery of the LCP image. Fix: preload, `fetchpriority`, SSR, CDN, smaller images (AVIF/WebP, `srcset`).
- **INP:** **long tasks** on the main thread (over 50 ms) delay input handling. Fix: break up work (the event-loop lessons), `scheduler.yield()`, web workers, less JS, debounce handlers, avoid layout thrashing.
- **CLS:** images without sizes, late-injected banners, web fonts swapping, ads. Fix: reserve space, `aspect-ratio`, animate with `transform`.

```js
// Measuring in the browser (real users): the web-vitals library or PerformanceObserver
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) console.log("LCP candidate:", entry.startTime, entry.element);
}).observe({ type: "largest-contentful-paint", buffered: true });

new PerformanceObserver((list) => list.getEntries().forEach((e) => console.log("long task:", e.duration)))
  .observe({ type: "longtask", buffered: true });
```

Tools: **Lighthouse** (lab), **Chrome DevTools Performance** panel (flame chart, layout events, long tasks), **WebPageTest**, **PageSpeed Insights / CrUX** (real-user data), **web-vitals** library for your own RUM.

:::interview Explain the critical rendering path. How do you avoid layout thrashing?
"The browser parses HTML into the DOM and CSS into the CSSOM, combines them into a render tree, runs layout to compute geometry, paints into layers and composites them, often on the GPU. CSS blocks rendering and synchronous scripts block parsing, so I use `defer`, inline critical CSS and preload key resources. Changing geometry triggers layout, paint and composite; colour changes trigger paint and composite; `transform` and `opacity` can be composite-only, so I animate those. Layout thrashing happens when I interleave reads like `offsetWidth` with writes to styles in a loop, forcing a synchronous layout each time; I batch all reads first and writes after, use `requestAnimationFrame`, and avoid querying layout in effects. I monitor Core Web Vitals: LCP, INP and CLS."
:::

## More interview questions on this topic

:::qa What is the difference between reflow and repaint? {level=easy}
**Say this:** "Reflow (layout) recalculates the size and position of elements; repaint redraws their appearance without changing geometry. Reflow is more expensive, and it usually triggers a repaint too."

**In simple words:** Measuring and arranging the furniture vs repainting the walls.
:::

:::qa Why are `transform` and `opacity` best for animations? {level=medium}
**Say this:** "They can be applied by the compositor on a separate layer, skipping layout and paint, so they stay smooth even if the main thread is busy."

**In simple words:** The GPU just moves a picture around.
:::

:::qa What is a forced synchronous layout? {level=hard}
**Say this:** "Reading a layout property (such as `offsetHeight`) right after changing styles makes the browser recompute layout immediately to give a correct answer, instead of waiting for the next frame. Repeating this in a loop causes layout thrashing."

**In simple words:** You asked for a measurement while the room was being rearranged, so the browser stops to re-measure.
:::

:::qa What do LCP, INP and CLS measure? {level=easy}
**Say this:** "LCP: loading speed of the main content. INP: how quickly the page responds to user interactions. CLS: how much the layout shifts unexpectedly."

**In simple words:** How fast it shows, how fast it responds, how stable it looks.
:::

```quiz
? Which CSS change is cheapest for an animation?
- width
- top
+ transform
> Composite-only, no layout or paint.
? What causes layout thrashing?
- Using too many CSS files
+ Interleaving layout reads and style writes in a loop
- Using async scripts
> Each read forces a fresh layout.
? Which attribute prevents CLS from images?
- loading="lazy"
+ width and height (or aspect-ratio)
- decoding="async"
> The browser reserves the space.
```

:::keypoints
- **Critical rendering path**: DOM + CSSOM → render tree → **layout** → **paint** → **composite**. CSS blocks rendering; sync JS blocks parsing (use `defer`).
- Cost: geometry (layout+paint+composite) > appearance (paint+composite) > **`transform`/`opacity`** (composite only): animate those.
- **Layout thrashing** = interleaved reads (`offsetWidth`, `getBoundingClientRect`) and writes: batch reads then writes, use `requestAnimationFrame`.
- Loading: `preconnect`, `preload`, `fetchpriority`, `loading="lazy"`, image sizes, code splitting, defer third parties.
- **Core Web Vitals**: **LCP** (≤2.5 s), **INP** (≤200 ms), **CLS** (≤0.1). Measure with Lighthouse, DevTools, `web-vitals`.
:::
