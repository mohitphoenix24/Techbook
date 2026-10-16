SHEETS.define({
  id: "merge-intervals",
  viz: "interval",
  io: { fn: "merge", params: [["intervals", "int[][]"]], ret: "int[][]", labels: { intervals: "intervals [start, end]" } },

  statement: `Given an array of \`intervals\` where \`intervals[i] = [start, end]\`, **merge all overlapping intervals** and return the resulting non-overlapping intervals that cover every input interval, sorted by start.

Two intervals overlap if they share at least one point, so \`[1, 4]\` and \`[4, 5]\` (touching at 4) **are merged** into \`[1, 5]\`.`,
  examples: [
    { input: "intervals = [[1, 3], [2, 6], [8, 10], [15, 18]]", output: "[[1, 6], [8, 10], [15, 18]]", explain: "`[1, 3]` and `[2, 6]` overlap and become `[1, 6]`; the others stand alone." },
    { input: "intervals = [[1, 4], [4, 5]]", output: "[[1, 5]]", explain: "They touch at 4, which counts as overlapping." },
  ],
  constraints: ["$1 \\le$ `intervals.length` $\\le 10^4$", "`intervals[i].length == 2`", "$0 \\le$ `start`$_i \\le$ `end`$_i \\le 10^4$"],
  check(input) { return input.intervals.length > 8 || input.intervals.some((p) => p.length !== 2 || p[0] > p[1]) ? "for the animation use at most 8 intervals, each as [start, end] with start ≤ end" : input.intervals.some((p) => Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100) ? "for the animation keep the numbers between -100 and 100" : null; },

  intuition: {
    find: "The smallest set of non-overlapping intervals that covers exactly the same points as the input.",
    beginner: "Compare every pair of intervals; whenever two overlap, replace them by their union; repeat until no two overlap.",
    works: "Merging overlapping pairs never loses a covered point and never adds one, and once no pair overlaps the intervals are separate islands: exactly the answer.",
    slow: "Each pass is $O(n^2)$ (all pairs) and several passes may be needed (a merge can create a new overlap), so the worst case is $O(n^3)$.",
    repeat: "We keep re-comparing the same pairs because the intervals are in **random order**: any interval might overlap any other, so everything must be checked against everything.",
    remember: "**Sort by start.** After sorting, an interval can only overlap the ones *just before it*: if it does not overlap the last merged interval, it cannot overlap any earlier one either (their ends are not larger than... they are all to the left).",
    observation: "Walk through the sorted intervals keeping the **last merged interval** `last`. For the next interval `cur`: if `cur.start > last.end`, there is a **gap**: `last` is final, start a new one. Otherwise they overlap (or touch): extend `last.end = max(last.end, cur.end)`. Only the end can grow, because starts are already sorted.",
    leads: "Sort, then one sweep: `if result is empty or last.end < cur.start: push cur; else last.end = max(last.end, cur.end)`. The sort costs $O(n \\log n)$ and the sweep $O(n)$.",
  },

  flow: [
    "Compare all pairs, merge any overlapping pair, repeat until none overlap.",
    "Merging never loses or adds covered points.",
    "$O(n^2)$ per pass, and several passes: up to $O(n^3)$.",
    "Sort by start: only the **last merged** interval can overlap the next one.",
    "Gap → start a new interval; overlap → extend the end with `max`.",
    "Sort + one sweep: $O(n \\log n)$ time, $O(n)$ output space.",
  ],

  brute: {
    idea: "**Brute force:** repeatedly look for any two intervals that overlap, replace them by their union, and start over. Stop when a full pass finds no overlapping pair. Sort the result for a deterministic order.",
    why: "Finding an overlapping pair costs $O(n^2)$, each merge may create new overlaps, and there can be up to $n - 1$ merges, so the total is $O(n^3)$. The intervals being in arbitrary order is what forces all that rechecking; sorting by start removes it.",
    time: "O(n^3)", space: "O(n)",
    measure: { fTex: "n^3", f: (n) => n * n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        vector<vector<int>> v = intervals;
        bool changed = true;
        while (changed) {
            changed = false;
            for (size_t i = 0; i < v.size() && !changed; i++)
                for (size_t j = i + 1; j < v.size() && !changed; j++)
                    if (max(v[i][0], v[j][0]) <= min(v[i][1], v[j][1])) {
                        v[i] = {min(v[i][0], v[j][0]), max(v[i][1], v[j][1])};
                        v.erase(v.begin() + j);
                        changed = true;
                    }
        }
        sort(v.begin(), v.end());
        return v;
    }
};`,
    js: `function merge(intervals) {
  let v = intervals.map((p) => p.slice());
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < v.length && !changed; i++)
      for (let j = i + 1; j < v.length && !changed; j++)
        if (Math.max(v[i][0], v[j][0]) <= Math.min(v[i][1], v[j][1])) {
          v[i] = [Math.min(v[i][0], v[j][0]), Math.max(v[i][1], v[j][1])];
          v.splice(j, 1);
          changed = true;
        }
  }
  return v.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}`,
  },

  pattern: {
    name: "Intervals (sort, then sweep)",
    why: "Intervals are one-dimensional objects with a natural order. **Sorting by start** turns a 2D overlap puzzle into a left-to-right sweep that only ever compares an interval with the *current merged block*. Most interval problems (merge, insert, count rooms, remove overlaps) start with *sort by start* (or by end) and then one sweep.",
    recognize: [
      "Ranges `[start, end]` that you must **merge, cover, count overlaps of, or schedule**.",
      "The input is in arbitrary order; after sorting by start, only neighbours matter.",
      "Decisions depend on whether `next.start` is **before, at or after** `current.end`.",
      "Touching intervals (`end == start`) need an explicit decision (here: merge them).",
    ],
  },

  optimal: {
    idea: "Sort the intervals by start. Keep a result list whose last interval is the *current merged block*. For each interval in order: if the result is empty or the block ends **before** this interval starts (`last.end < cur.start`), the block is finished: append the interval as a new block. Otherwise they overlap (or touch): stretch the block to `max(last.end, cur.end)`.",
    steps: [
      "Sort `intervals` by start (then end).",
      "Start with an empty `res`.",
      "For each `iv` in sorted order: if `res` is empty **or** `res.back().end < iv.start`: `res.push_back(iv)`.",
      "Otherwise: `res.back().end = max(res.back().end, iv.end)`.",
      "Return `res`.",
    ],
    invariant: "**`res` holds the merged form of all intervals processed so far: disjoint, sorted by start, and every later interval starts at or after `res.back().start`.**",
    correct: "Because intervals arrive sorted by start, `iv.start ≥ res.back().start`. If `iv.start > res.back().end`, then `iv` starts after the whole block, hence after *every* earlier block (their ends are smaller), and no later interval can reach back to connect them either (later starts are even larger): `iv` begins a new block. Otherwise `iv.start ≤ res.back().end` and `iv.start ≥ res.back().start`, so `iv` overlaps the block; the union of two overlapping intervals is `[min start, max end] = [res.back().start, max(res.back().end, iv.end)]`, which the update produces. Touching intervals satisfy `iv.start == res.back().end`, so they are merged, as required.",
  },

  cpp: `class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end());                          // by start, then end //@sort
        vector<vector<int>> res;
        for (auto& iv : intervals) {                                       //@loop
            if (res.empty() || res.back()[1] < iv[0]) res.push_back(iv);   // gap: a new block //@gap
            else res.back()[1] = max(res.back()[1], iv[1]);                // overlap: stretch the block //@merge
        }
        return res;                                                        //@ret
    }
};`,
  js: `function merge(intervals) {
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);                    // by start, then end //@sort
  const res = [];
  for (const iv of intervals) {                                            //@loop
    if (res.length === 0 || res[res.length - 1][1] < iv[0]) res.push(iv.slice());   // gap: a new block //@gap
    else res[res.length - 1][1] = Math.max(res[res.length - 1][1], iv[1]); // overlap: stretch the block //@merge
  }
  return res;                                                              //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] } },
    { name: "Example 2: touching intervals", kind: "normal", input: { intervals: [[1, 4], [4, 5]] } },
    { name: "Unsorted input", kind: "normal", input: { intervals: [[8, 10], [1, 3], [2, 6]] } },
    { name: "One interval swallows the others", kind: "edge", input: { intervals: [[1, 10], [2, 3], [4, 5], [6, 7]] }, why: "The later intervals lie **inside** `[1, 10]`. If the update were `last.end = iv.end` instead of `max(last.end, iv.end)`, the block would shrink to `[1, 3]` and then `[1, 5]`…, losing the right end. The `max` is what makes nested intervals harmless." },
    { name: "Identical intervals", kind: "edge", input: { intervals: [[2, 5], [2, 5], [2, 5]] }, why: "All three overlap completely and merge into `[2, 5]`. Duplicates must not produce duplicate outputs." },
    { name: "Sorted by end, not by start", kind: "edge", input: { intervals: [[1, 4], [0, 4]] }, why: "Without sorting by start you would first see `[1, 4]` and then `[0, 4]`, and a one-pass merge would produce `[1, 4]` or a wrong start. After sorting, `[0, 4]` comes first and the result is `[0, 4]`." },
    { name: "A single interval", kind: "corner", input: { intervals: [[3, 7]] }, why: "The result is empty at first, so the first interval is pushed (the `res.empty()` guard prevents reading `res.back()` of an empty list). Nothing else happens." },
    { name: "No overlaps at all", kind: "corner", input: { intervals: [[1, 2], [4, 5], [7, 8]] }, why: "Every interval starts after the previous block ends, so each is appended: the output equals the sorted input. It is the case with the most blocks." },
    { name: "A chain of touching intervals", kind: "corner", input: { intervals: [[1, 2], [2, 3], [3, 4], [4, 5]] }, why: "Each interval touches the next at a single point, so everything collapses into `[1, 5]`. A strict `<` instead of `≤` in the overlap test would leave four separate intervals." },
  ],

  trace(input, T) {
    const iv = input.intervals.map((p, i) => ({ id: "i" + i, s: p[0], e: p[1] }));
    const n = iv.length;
    const sorted = iv.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    const lo = n ? Math.min(...iv.map((x) => x.s)) : 0, hi = n ? Math.max(...iv.map((x) => x.e)) : 4;
    const res = [];
    let state = { order: iv.slice(), cur: -1, done: 0 };
    let whyGap = false, whyMax = false, whySort = false, whyTouch = false;
    const S = (o = {}) => () => {
      const rows = state.order.map((x, k) => ({ label: `#${k + 1}`, items: [{ id: x.id, s: x.s, e: x.e, cls: k === state.cur ? "cur" : k < state.done ? "ok" : "win" }] }));
      rows.push({ label: "merged result", items: res.map((r, k) => ({ id: "r" + k, s: r.s, e: r.e, cls: o.merged === k ? "hit" : "ok", text: `[${r.s}, ${r.e}]` })) });
      const marks = [], shades = [];
      if (o.edgeMark != null) marks.push({ x: o.edgeMark, label: "end of the last block", cls: "hot" });
      if (o.overlap) shades.push({ s: o.overlap[0], e: o.overlap[1], cls: "cmp", label: "overlap" });
      return { lanes: rows, axis: { min: lo, max: hi }, marks, shades, label: "intervals on a number line", note: o.note };
    };
    T.step("sort", { vars: { n }, state: S({ note: "input order" }), phase: "Sort by start", say: `${n} interval${n === 1 ? "" : "s"} in arbitrary order. Any interval might overlap any other, so before sorting we would have to compare everything with everything.`, op: "intervals (as given)", act: "START" });
    state = { order: sorted, cur: -1, done: 0 };
    T.step("sort", { w: Math.max(1, Math.round(n * Math.log2(Math.max(n, 2)))), vars: { n }, state: S({ note: "sorted by start" }), say: "Sorted by start (watch the rows slide into place). Now an interval can only overlap the **last merged block**: everything earlier ends further left or is already merged.", op: "sort(intervals)", act: "SORT",
      why: { title: "Why sort by start?", text: "After sorting, intervals appear left to right. If the next one does not reach the end of the current block, it cannot reach any earlier block either, because those ended even sooner. So one comparison per interval is enough." } });
    whySort = true;
    T.phase("Sweep: gap or overlap?");
    sorted.forEach((x, k) => {
      state = { order: sorted, cur: k, done: k };
      const last = res[res.length - 1];
      const overlaps = !!last && last.e >= x.s;
      T.step("gap", { vars: { interval: `[${x.s}, ${x.e}]`, last: last ? `[${last.s}, ${last.e}]` : "none" }, state: S({ edgeMark: last ? last.e : null, overlap: overlaps ? [x.s, Math.min(last.e, x.e)] : null }),
        say: !last ? `The result is empty, so **[${x.s}, ${x.e}]** becomes the first block.` : overlaps ? `**[${x.s}, ${x.e}]** starts at ${x.s}, which is **not after** the last block's end (${last.e}): they overlap${x.s === last.e ? " (they touch at a single point, which counts)" : ""}.` : `**[${x.s}, ${x.e}]** starts at ${x.s}, **after** the last block's end (${last.e}): there is a gap, so the last block is final.`,
        op: last ? `res.back().end = ${last.e}  <  iv.start = ${x.s} ?  ${last.e < x.s}` : "res is empty", act: !last ? "FIRST_BLOCK" : overlaps ? "OVERLAP" : "GAP",
        why: !last || whyTouch || !(overlaps && x.s === last.e) ? null : { title: "Do touching intervals merge?", text: "Yes: [1, 4] and [4, 5] share the point 4, so they overlap. That is why the gap test is a strict `<`: only `last.end < iv.start` is a real gap." } });
      if (overlaps && x.s === last.e) whyTouch = true;
      if (!last || last.e < x.s) {
        res.push({ s: x.s, e: x.e });
        state = { order: sorted, cur: k, done: k + 1 };
        T.step("gap", { vars: { blocks: res.length }, state: S({ merged: res.length - 1 }), say: `Start a **new block** [${x.s}, ${x.e}]: \`res.push_back(iv)\`.`, op: `res.push_back([${x.s}, ${x.e}])`, act: "NEW_BLOCK",
          why: whyGap ? null : { title: "Why is the old block final?", text: "Everything still to come starts at or after this interval's start, which is already beyond the old block's end. Nothing can reach back to extend it." } });
        whyGap = true;
      } else {
        const oldE = last.e;
        last.e = Math.max(last.e, x.e);
        state = { order: sorted, cur: k, done: k + 1 };
        T.step("merge", { vars: { "old end": oldE, "iv.end": x.e, "new end": last.e }, state: S({ merged: res.length - 1 }), say: x.e <= oldE ? `**[${x.s}, ${x.e}]** lies completely **inside** the block (it ends at ${x.e} ≤ ${oldE}), so the end stays **${last.e}**.` : `Stretch the block: its end grows from ${oldE} to **${last.e}** (the larger of ${oldE} and ${x.e}). The block is now [${last.s}, ${last.e}].`, op: `end = max(${oldE}, ${x.e}) = ${last.e}`, act: x.e <= oldE ? "INSIDE" : "EXTEND",
          why: whyMax ? null : { title: "Why max and not just iv.end?", text: "An interval can be *inside* the current block and end earlier (like [2, 3] inside [1, 10]). Taking the larger end keeps the block from shrinking." } });
        whyMax = true;
      }
    });
    state = { order: sorted, cur: -1, done: n };
    T.step("ret", { vars: { blocks: res.length }, state: S({}), say: `Every interval is processed: **${res.length}** merged interval${res.length === 1 ? "" : "s"}: ${JSON.stringify(res.map((r) => [r.s, r.e]))}.`, op: "return res", act: "DONE" });
    T.result(res.map((r) => [r.s, r.e]));
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 8); return { intervals: Array.from({ length: n }, () => { const a = Math.floor(rnd() * 12), b = a + Math.floor(rnd() * 5); return [a, b]; }) }; },
  gen(n) { return { intervals: Array.from({ length: n }, (_, i) => [(n - i) * 3, (n - i) * 3 + 1]) }; },

  complexity: {
    time: {
      tex: "O(n \\log n)", title: "the sort dominates the linear sweep", short: "sort: n log n, sweep: n",
      derive: [
        "T_{\\text{sort}}(n) = O(n \\log n) || comparison sort by start",
        "T_{\\text{sweep}}(n) = \\sum_{k=1}^{n} c = c\\,n || one comparison and one assignment per interval; `res.back()` is $O(1)$",
        "T(n) = O(n \\log n) + O(n)",
        "!T(n) = O(n \\log n) || the sort is the bottleneck",
      ],
      where: "The sweep is linear because every interval is compared with exactly one thing: the last block. The measured table counts the sort as $n \\log_2 n$ steps (the frame has that weight) plus one step per interval.",
    },
    space: {
      tex: "O(n)", title: "the output list (plus the sort's workspace)", short: "O(log n) to O(n) for the sort depending on the algorithm",
      derive: [
        "S_{\\text{out}} \\le n \\cdot s_{\\text{interval}} || at most $n$ blocks (when nothing overlaps)",
        "S_{\\text{sort}} = O(\\log n) \\text{ (introsort)}",
        "!S(n) = O(n) || dominated by the output (the output is usually not counted as extra space)",
      ],
      where: "If the input array may be modified, the merged result can even be written back into it, leaving $O(\\log n)$ extra space.",
    },
    limit: "In the comparison model, merging arbitrary intervals needs $\\Omega(n \\log n)$ time (it can be reduced from sorting), so the sort-and-sweep is optimal.",
    measure: { label: "n = number of intervals (disjoint, reversed)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Forgetting to sort", what: "Sweeping the intervals in the given order.", why: "The examples often come sorted.", breaks: "An interval far to the right can appear before ones that would link it to earlier blocks: `[[8,10],[1,3],[2,6]]` produces wrong blocks.", avoid: "Sort by start first." },
    { title: "Taking `iv.end` instead of `max(last.end, iv.end)`", what: "`last.end = iv.end;` on overlap.", why: "\"extend the block to the new interval\".", breaks: "A nested interval shrinks the block: `[1,10]` followed by `[2,3]` becomes `[1,3]`.", avoid: "`last.end = max(last.end, iv.end)`." },
    { title: "Using `<=` in the gap test", what: "`if (last.end <= iv.start)` to start a new block.", why: "Treating touching intervals as separate.", breaks: "The problem says intervals sharing a point **do** merge: `[1,4],[4,5]` would stay separate.", avoid: "Gap only when `last.end < iv.start` (strict)." },
    { title: "Reading `res.back()` on an empty result", what: "No `res.empty()` guard.", why: "The first interval has nothing to compare with.", breaks: "Undefined behaviour in C++ (`back()` of an empty vector); `undefined` in JS.", avoid: "`if (res.empty() || …)` first (short-circuit)." },
    { title: "Mutating the input intervals", what: "Pushing the same `iv` reference (or vector) into `res` and then changing its end.", why: "Pushing is cheap.", breaks: "In JS the result entries alias the input arrays, so the caller's data is modified (and a later merge changes the earlier input).", avoid: "Push a **copy** (`iv.slice()`), or accept that the input is consumed." },
  ],

  followUps: [
    {
      q: "Merge when the intervals are **already sorted** by start. Can you do better than $O(n \\log n)$?",
      a: "Yes: skip the sort and the whole algorithm is a single $O(n)$ sweep. This is exactly the *Insert Interval* situation: the list is sorted and non-overlapping, and you merge one new interval in linear time (the next lesson).",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Do it **in place** (without a separate result list).",
      a: "Keep a write index `w`. For each interval after sorting: if it overlaps `intervals[w]`, stretch `intervals[w][1]`; otherwise `intervals[++w] = iv`. At the end resize to `w + 1`. Space is $O(1)$ extra (besides the sort).",
      cpp: `vector<vector<int>> mergeInPlace(vector<vector<int>>& a) {
    if (a.empty()) return a;
    sort(a.begin(), a.end());
    int w = 0;
    for (int i = 1; i < (int)a.size(); i++) {
        if (a[w][1] < a[i][0]) a[++w] = a[i];
        else a[w][1] = max(a[w][1], a[i][1]);
    }
    a.resize(w + 1);
    return a;
}`,
      js: `function mergeInPlace(a) {
  if (a.length === 0) return a;
  a.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let w = 0;
  for (let i = 1; i < a.length; i++) {
    if (a[w][1] < a[i][0]) a[++w] = a[i];
    else a[w][1] = Math.max(a[w][1], a[i][1]);
  }
  a.length = w + 1;
  return a;
}`,
      time: "O(n log n)", space: "O(1)",
    },
    {
      q: "Find the **gaps** (free time) between all the intervals.",
      a: "Sort and sweep keeping the furthest end so far: whenever the next interval starts after it, the stretch between is a gap. That is the same logic as the *gap* branch here, outputting the free interval instead of starting a new block.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "The intervals are given as a **stream** (add one at a time) and you must keep them merged.",
      a: "Keep the merged blocks in a **balanced search tree** (`std::set`/`map` keyed by start). Insert the new interval by finding the neighbours that overlap it (using `lower_bound`), erasing them and inserting their union: $O(\\log n)$ per insertion (amortised, since every erase was once an insert).",
      time: "O(log n) per insert", space: "O(n)",
    },
  ],

  related: [
    { id: "insert-interval", why: "Merging when the list is already sorted: a linear scan in three phases." },
    { id: "non-overlapping-intervals", why: "Sort, then a greedy sweep deciding which overlapping intervals to drop." },
    { id: "meeting-rooms", why: "The simplest interval check: after sorting, does any interval start before the previous one ends?" },
    { id: "meeting-rooms-ii", why: "How many intervals overlap at once: a sweep with a min-heap of end times." },
  ],
  patternNote: "**Sort, then sweep:** order the intervals by start, then keep one running summary (the current block, or the earliest free end) and decide for each next interval from a single comparison. This reduces 2D overlap questions to 1D scans, and it is the template for merge, insert, schedule and room-counting problems.",
  takeaways: [
    "Sort by start; then `last.end < iv.start` is a **gap** (new block), otherwise **overlap** (stretch the block).",
    "Stretch with `max(last.end, iv.end)`: nested intervals must not shrink the block.",
    "Touching intervals (`end == start`) merge: use a strict `<` for the gap test.",
    "Guard `res.empty()`; copy intervals if you must not alias the input.",
    "Time $O(n \\log n)$ (sort) + $O(n)$ sweep; space $O(n)$ for the output.",
  ],
});
