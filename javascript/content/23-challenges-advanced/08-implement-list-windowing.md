---
title: Implement list windowing (virtual scrolling maths)
level: hard
time: 40
summary: Compute which rows to render for a scroll position, first with fixed heights and then with variable measured heights using a Fenwick tree, so a list of a million rows only mounts a few dozen DOM nodes.
---

:::problem Implement the maths of a virtualised list {level=hard tags="performance,algorithms,fenwick tree,virtual scroll,binary search"}
Rendering 100,000 rows creates 100,000 DOM nodes and freezes the page. A **virtualised** list renders only the rows near the viewport inside a tall empty container.

**Part 1: fixed height.** `fixedRange({ scrollTop, viewportHeight, itemHeight, count, overscan })` returns:

```js
{ start, end, offsetTop, totalHeight }   // render items start..end-1, translate them down by offsetTop
```

- `overscan` extra rows above and below avoid flicker while scrolling.
- Clamp for an empty list and for a `scrollTop` beyond the end.

**Part 2: variable height.** Row heights are only known after they are rendered and measured. Write a `HeightIndex` class:

- `new HeightIndex(count, estimate)` starts with every row at an estimated height.
- `set(i, height)` updates a measured height in **O(log n)**.
- `offsetOf(i)` returns the top of row `i` (the sum of heights before it) in **O(log n)**.
- `indexAt(y)` returns the row that contains the vertical position `y` in **O(log n)**.
- `total` is the total height.
- `range(scrollTop, viewportHeight, overscan)` as in part 1.

:::hint Hint
Part 1 is division. Part 2 needs **prefix sums with updates**: a plain array makes updates O(n); a **Fenwick tree (binary indexed tree)** gives O(log n) for both. To find the row for `y`, walk down the tree by powers of two ("binary lifting").
:::
:::

## Solution and tests

```js run title="fixedRange and HeightIndex, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- Part 1: fixed height ----------
function fixedRange({ scrollTop, viewportHeight, itemHeight, count, overscan = 3 }) {
  const totalHeight = count * itemHeight;
  if (count === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight };
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, totalHeight - viewportHeight));    // clamp: no scrolling beyond the content
  const first = Math.floor(top / itemHeight);                                                 // first row touching the viewport
  const last = Math.ceil((top + viewportHeight) / itemHeight);                                // one past the last row touching it
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + overscan);
  return { start, end, offsetTop: start * itemHeight, totalHeight };
}

// ---------- Part 2: variable height with a Fenwick tree ----------
class HeightIndex {
  #n; #tree; #heights;
  constructor(count, estimate = 40) {
    this.#n = count;
    this.#heights = new Array(count).fill(estimate);
    this.#tree = new Array(count + 1).fill(0);               // 1-based
    for (let i = 1; i <= count; i++) {                       // O(n) build
      this.#tree[i] += estimate;
      const parent = i + (i & -i);
      if (parent <= count) this.#tree[parent] += this.#tree[i];
    }
  }
  get count() { return this.#n; }
  get total() { return this.#prefix(this.#n); }
  heightOf(i) { return this.#heights[i]; }

  set(i, height) {                                           // a row was measured
    const delta = height - this.#heights[i];
    if (delta === 0) return;
    this.#heights[i] = height;
    for (let k = i + 1; k <= this.#n; k += k & -k) this.#tree[k] += delta;       // update the O(log n) nodes that cover row i
  }

  #prefix(i) {                                               // sum of the first i rows
    let sum = 0;
    for (let k = i; k > 0; k -= k & -k) sum += this.#tree[k];
    return sum;
  }
  offsetOf(i) { return this.#prefix(i); }                    // top edge of row i

  indexAt(y) {                                               // the row containing position y
    if (this.#n === 0) return 0;
    let pos = 0, remaining = Math.max(0, y);
    let step = 1; while (step * 2 <= this.#n) step *= 2;     // the highest power of two <= n
    for (; step > 0; step >>= 1) {                           // binary lifting: add big blocks while they still fit
      const next = pos + step;
      if (next <= this.#n && this.#tree[next] <= remaining) { pos = next; remaining -= this.#tree[next]; }
    }
    return Math.min(pos, this.#n - 1);                       // pos rows fit completely before y: row `pos` contains y
  }

  range(scrollTop, viewportHeight, overscan = 3) {
    if (this.#n === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
    const total = this.total;
    const top = Math.min(Math.max(0, scrollTop), Math.max(0, total - viewportHeight));
    const first = this.indexAt(top);
    const last = this.indexAt(Math.max(top, top + viewportHeight - 0.001));          // the row containing the bottom edge
    const start = Math.max(0, first - overscan);
    const end = Math.min(this.#n, last + 1 + overscan);
    return { start, end, offsetTop: this.offsetOf(start), totalHeight: total };
  }
}

// ---------------- tests ----------------
test("fixed: the rows around the viewport plus overscan", () => {
  const r = fixedRange({ scrollTop: 1000, viewportHeight: 400, itemHeight: 50, count: 10000, overscan: 2 });
  // rows 20..27 are visible (1000/50 = 20 up to 1400/50 = 28); overscan 2 each side
  assert.deepEqual(r, { start: 18, end: 30, offsetTop: 900, totalHeight: 500000 });
});

test("fixed: at the top and at the bottom", () => {
  assert.deepEqual(fixedRange({ scrollTop: 0, viewportHeight: 100, itemHeight: 50, count: 100, overscan: 1 }), { start: 0, end: 3, offsetTop: 0, totalHeight: 5000 });
  const bottom = fixedRange({ scrollTop: 99999, viewportHeight: 100, itemHeight: 50, count: 100, overscan: 1 });
  assert.equal(bottom.end, 100);
  assert.equal(bottom.start, 97);
});

test("fixed: empty list, negative scroll, short list", () => {
  assert.deepEqual(fixedRange({ scrollTop: 0, viewportHeight: 100, itemHeight: 50, count: 0 }), { start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  assert.equal(fixedRange({ scrollTop: -50, viewportHeight: 100, itemHeight: 50, count: 100 }).start, 0);
  assert.equal(fixedRange({ scrollTop: 0, viewportHeight: 1000, itemHeight: 50, count: 3 }).end, 3);
});

test("fixed: only a handful of rows are rendered for a million", () => {
  const r = fixedRange({ scrollTop: 25_000_000, viewportHeight: 600, itemHeight: 50, count: 1_000_000, overscan: 5 });
  assert.ok(r.end - r.start < 30);
});

test("variable: offsets and total with the estimate", () => {
  const idx = new HeightIndex(5, 40);
  assert.equal(idx.total, 200);
  assert.deepEqual([0, 1, 4, 5].map((i) => idx.offsetOf(i)), [0, 40, 160, 200]);
});

test("variable: measuring a row moves everything below it", () => {
  const idx = new HeightIndex(5, 40);
  idx.set(1, 100);
  assert.equal(idx.total, 260);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => idx.offsetOf(i)), [0, 40, 140, 180, 220]);
});

test("variable: indexAt finds the row containing a position (including boundaries)", () => {
  const idx = new HeightIndex(4, 10);
  idx.set(2, 30);                                            // rows: 0-10, 10-20, 20-50, 50-60
  assert.deepEqual([0, 9, 10, 19, 20, 49, 50, 59].map((y) => idx.indexAt(y)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(idx.indexAt(-5), 0);
  assert.equal(idx.indexAt(9999), 3);                        // beyond the end: the last row
});

test("variable: the Fenwick tree matches a plain array on random operations", () => {
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  const n = 237, heights = Array.from({ length: n }, () => 40);
  const idx = new HeightIndex(n, 40);
  for (let step = 0; step < 2000; step++) {
    if (rand(2)) { const i = rand(n), h = 10 + rand(200); heights[i] = h; idx.set(i, h); }
    else {
      const y = rand(heights.reduce((a, b) => a + b, 0) + 50);
      let acc = 0, expected = heights.length - 1;
      for (let i = 0; i < n; i++) { if (y < acc + heights[i]) { expected = i; break; } acc += heights[i]; }
      assert.equal(idx.indexAt(y), expected, "indexAt " + y);
      const k = rand(n + 1);
      assert.equal(idx.offsetOf(k), heights.slice(0, k).reduce((a, b) => a + b, 0), "offsetOf " + k);
    }
  }
  assert.equal(idx.total, heights.reduce((a, b) => a + b, 0));
});

test("variable: range with overscan, clamped at both ends", () => {
  const idx = new HeightIndex(100, 50);
  assert.deepEqual(idx.range(0, 100, 1), { start: 0, end: 3, offsetTop: 0, totalHeight: 5000 });
  const mid = idx.range(1000, 100, 2);
  assert.deepEqual([mid.start, mid.end, mid.offsetTop], [18, 24, 900]);      // rows 20, 21 visible; overscan 2 each side
  const bottom = idx.range(1e9, 100, 1);
  assert.equal(bottom.end, 100);
});

test("variable: works for a million rows", () => {
  const idx = new HeightIndex(1_000_000, 30);
  idx.set(500_000, 300);
  assert.equal(idx.total, 30_000_000 + 270);
  const r = idx.range(15_000_100, 800, 5);
  assert.ok(r.end - r.start < 60);
  assert.equal(idx.indexAt(idx.offsetOf(750_000) + 1), 750_000);
});

test("empty variable list", () => assert.deepEqual(new HeightIndex(0).range(0, 100), { start: 0, end: 0, offsetTop: 0, totalHeight: 0 }));
```

## Using the numbers in the page

```html
<div class="viewport" style="height: 600px; overflow: auto">
  <div class="spacer" style="height: {totalHeight}px; position: relative">
    <div class="rows" style="transform: translateY({offsetTop}px)">
      <!-- render only rows start..end-1 here -->
    </div>
  </div>
</div>
```

- Measure real heights with **`ResizeObserver`**, call `set(i, height)`, and correct `scrollTop` if rows **above** the viewport changed height (scroll anchoring), or the content jumps.
- Use a stable **`key`** for rows (not the index), and avoid layout-triggering reads inside the scroll handler; use `requestAnimationFrame`.
- Libraries: **react-window**, **react-virtuoso**, **TanStack Virtual**. Know their trade-offs: find-in-page, accessibility (`aria-rowcount`, `aria-rowindex`) and keyboard focus all need extra work.
- Alternative for very long content: **pagination** or **infinite scroll** with `IntersectionObserver`, or CSS `content-visibility: auto`.

:::qa Why is a Fenwick tree better than a prefix-sum array here? {level=hard}
**Say this:** "A prefix-sum array answers 'offset of row i' in O(1) but a single height change must update every later entry, O(n). Heights change all the time while scrolling. A Fenwick tree answers both the update and the prefix query in O(log n), and finds the row for a position in O(log n) with binary lifting."

**In simple words:** It balances fast reads and fast changes.
:::

:::qa What breaks if you do not use overscan? {level=easy}
**Say this:** "While scrolling fast, new rows appear after a delay, so the user sees blank space. Rendering a few extra rows above and below hides this. Too much overscan costs rendering time, so keep it small."

**In simple words:** Prepare a little beyond the edge of the screen.
:::

:::qa How do you handle rows whose height is unknown until rendered? {level=hard}
**Say this:** "Start with an estimated height, render, measure with `ResizeObserver`, and update the index. When rows above the viewport change height, adjust `scrollTop` by the difference so the visible content does not jump. Good estimates reduce the correction."

**In simple words:** Guess first, measure, then fix the position.
:::

:::keypoints
- Render only **`start..end`** plus **overscan**, inside a **spacer** of the full height, moved with `translateY(offsetTop)`.
- Fixed height: `floor(top / h)` and `ceil((top + view) / h)`; **clamp** both ends.
- Variable height: **Fenwick tree** for prefix sums with updates; `indexAt` by **binary lifting**; all in **O(log n)**.
- Measure with **ResizeObserver**, keep **scroll anchoring**, use stable keys; mind accessibility and find-in-page.
:::
