SHEETS.define({
  id: "insert-interval",
  viz: "interval",
  io: { fn: "insert", params: [["intervals", "int[][]"], ["newInterval", "int[]"]], ret: "int[][]", labels: { intervals: "intervals (sorted by start, no overlaps)", newInterval: "newInterval [start, end]" } },

  statement: `You are given a list of **non-overlapping** intervals \`intervals\`, already **sorted by start**, and one more interval \`newInterval = [start, end]\`.

Insert \`newInterval\` into the list so that the result is still sorted and non-overlapping, **merging** it with any intervals it overlaps (touching counts as overlapping). Return the resulting list.`,
  examples: [
    { input: "intervals = [[1, 3], [6, 9]], newInterval = [2, 5]", output: "[[1, 5], [6, 9]]", explain: "`[2, 5]` overlaps `[1, 3]`, so they merge into `[1, 5]`." },
    { input: "intervals = [[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], newInterval = [4, 8]", output: "[[1, 2], [3, 10], [12, 16]]", explain: "`[4, 8]` overlaps `[3, 5]`, `[6, 7]` and `[8, 10]`; together they become `[3, 10]`." },
  ],
  constraints: ["$0 \\le$ `intervals.length` $\\le 10^4$", "`intervals[i].length == 2`, $0 \\le$ `start`$_i \\le$ `end`$_i \\le 10^5$", "`intervals` is sorted by `start` and its intervals do not overlap.", "`newInterval.length == 2`, $0 \\le$ `start` $\\le$ `end` $\\le 10^5$"],
  check(input) {
    const a = input.intervals, nw = input.newInterval;
    if (nw.length !== 2 || nw[0] > nw[1]) return "newInterval must be [start, end] with start ≤ end";
    if (a.length > 7) return "for the animation use at most 7 intervals";
    for (let i = 0; i < a.length; i++) { if (a[i].length !== 2 || a[i][0] > a[i][1]) return "each interval must be [start, end] with start ≤ end"; if (i && a[i][0] <= a[i - 1][1]) return "intervals must be sorted and must not overlap or touch"; }
    return a.some((p) => Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100) || Math.abs(nw[0]) > 100 || Math.abs(nw[1]) > 100 ? "keep the numbers between -100 and 100" : null;
  },

  intuition: {
    find: "The same set of covered points as `intervals ∪ {newInterval}`, written as a sorted list of disjoint intervals.",
    beginner: "Append `newInterval`, sort everything by start and merge overlapping intervals (the *Merge Intervals* algorithm).",
    works: "It is exactly the previous problem applied to the combined list, so it is correct.",
    slow: "It costs $O(n \\log n)$ for the sort, although the list was **already sorted**. The sort throws away the extra information we were given.",
    repeat: "We re-sort a list that is sorted except for one extra element, and re-merge intervals that were already disjoint.",
    remember: "Use the sortedness: all the intervals fall into three groups relative to `newInterval`: those that end **before** it starts (untouched, to its left), those that **overlap** it (to be absorbed), and those that start **after** it ends (untouched, to its right).",
    observation: "Because the list is sorted and disjoint, these three groups are **contiguous and in that order**. So a single left-to-right scan works in three phases: copy the left group; absorb the overlapping group into `newInterval` (take the min start and the max end); then copy `newInterval` and the right group.",
    leads: "Phase 1: while `intervals[i].end < new.start` copy it. Phase 2: while `intervals[i].start <= new.end`, set `new.start = min(...)`, `new.end = max(...)`, `i++`. Then push `new` and phase 3: copy the rest. One pass, $O(n)$.",
  },

  flow: [
    "Append the new interval, sort everything, run Merge Intervals.",
    "It is the previous problem on the combined list, so it is correct.",
    "$O(n \\log n)$ for a sort of a list that was already sorted.",
    "The intervals split into: ends before `new` / overlaps `new` / starts after `new`.",
    "These three groups are contiguous and in order: scan once in three phases.",
    "Copy left, absorb the overlapping ones into `new`, push it, copy right: $O(n)$.",
  ],

  brute: {
    idea: "**Brute force:** push `newInterval` into the list, sort all the intervals by start, and run the standard merge sweep (*Merge Intervals*).",
    why: "It is correct, but the sort costs $O(n \\log n)$ although the input was already sorted: only one element (the new interval) is out of place. A single linear scan can use the existing order.",
    time: "O(n log n)", space: "O(n)",
    measure: { fTex: "n \\log_2 n", f: (n) => n * Math.log2(Math.max(2, n)), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    vector<vector<int>> insert(vector<vector<int>>& intervals, vector<int>& newInterval) {
        vector<vector<int>> all = intervals;
        all.push_back(newInterval);
        sort(all.begin(), all.end());
        vector<vector<int>> res;
        for (auto& iv : all) {
            if (res.empty() || res.back()[1] < iv[0]) res.push_back(iv);
            else res.back()[1] = max(res.back()[1], iv[1]);
        }
        return res;
    }
};`,
    js: `function insert(intervals, newInterval) {
  const all = intervals.map((p) => p.slice());
  all.push(newInterval.slice());
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const res = [];
  for (const iv of all) {
    if (res.length === 0 || res[res.length - 1][1] < iv[0]) res.push(iv);
    else res[res.length - 1][1] = Math.max(res[res.length - 1][1], iv[1]);
  }
  return res;
}`,
  },

  pattern: {
    name: "Intervals (linear three-phase scan)",
    why: "When the intervals are already sorted and disjoint, the new interval touches a **contiguous block** of them. A scan with three clearly separated phases (before, overlapping, after) handles it in linear time with no sorting. It is the same *gap vs overlap* logic as merging, applied to a list whose order is known.",
    recognize: [
      "A **sorted list of disjoint intervals** and a single new one to add, remove or query.",
      "The affected intervals form one contiguous run.",
      "You can express each phase with one loop condition (`end < new.start`, `start <= new.end`).",
      "Sorting would work but wastes the given order.",
    ],
  },

  optimal: {
    idea: "Scan the sorted intervals with one index `i`. **Phase 1:** copy every interval that ends strictly before `newInterval` starts. **Phase 2:** while the next interval starts at or before `newInterval`'s end, it overlaps: absorb it by widening `newInterval` to `[min(starts), max(ends)]` and advance. Then append the (possibly widened) `newInterval`. **Phase 3:** copy the remaining intervals unchanged.",
    steps: [
      "Set `i = 0`, `res = []`.",
      "While `i < n` and `intervals[i].end < new.start`: `res.push(intervals[i++])`.",
      "While `i < n` and `intervals[i].start <= new.end`: set `new.start = min(new.start, intervals[i].start)`, `new.end = max(new.end, intervals[i].end)`, `i++`.",
      "Push `new` into `res`.",
      "While `i < n`: `res.push(intervals[i++])`.",
      "Return `res`.",
    ],
    invariant: "**At each phase boundary, `res` holds the final, merged form of everything to the left of the current `newInterval`, and `newInterval` covers every interval absorbed so far.**",
    correct: "Because `intervals` is sorted and disjoint, an interval either ends before `new.start` (lies completely left), starts after `new.end` (completely right) or overlaps `new`; and the left ones come first, the overlapping ones next, the right ones last. Phase 1 copies exactly the left group. Phase 2's condition `start ≤ new.end` stays true for precisely the overlapping group (an interval that starts after `new.end` ends the phase; since `new.end` only grows, nothing overlapping is missed). Absorbing an overlapping interval produces the union `[min start, max end]`. Since the right group starts after the final `new.end`, appending it keeps the list sorted and disjoint.",
  },

  cpp: `class Solution {
public:
    vector<vector<int>> insert(vector<vector<int>>& intervals, vector<int>& nw) {
        vector<vector<int>> res;
        size_t i = 0, n = intervals.size();
        while (i < n && intervals[i][1] < nw[0]) res.push_back(intervals[i++]);   // ends before the new one //@before
        while (i < n && intervals[i][0] <= nw[1]) {                               // overlaps the new one //@overlap
            nw[0] = min(nw[0], intervals[i][0]);                                  // absorb it //@absorb
            nw[1] = max(nw[1], intervals[i][1]);
            i++;
        }
        res.push_back(nw);                                                        // the merged interval //@place
        while (i < n) res.push_back(intervals[i++]);                              // starts after the new one //@after
        return res;                                                               //@ret
    }
};`,
  js: `function insert(intervals, nw) {
  const res = [];
  let i = 0;
  const n = intervals.length;
  while (i < n && intervals[i][1] < nw[0]) res.push(intervals[i++]);              // ends before the new one //@before
  while (i < n && intervals[i][0] <= nw[1]) {                                     // overlaps the new one //@overlap
    nw[0] = Math.min(nw[0], intervals[i][0]);                                     // absorb it //@absorb
    nw[1] = Math.max(nw[1], intervals[i][1]);
    i++;
  }
  res.push(nw);                                                                   // the merged interval //@place
  while (i < n) res.push(intervals[i++]);                                         // starts after the new one //@after
  return res;                                                                     //@ret
}`,

  tests: [
    { name: "Example 1: merge with one", kind: "normal", input: { intervals: [[1, 3], [6, 9]], newInterval: [2, 5] } },
    { name: "Example 2: merge with three", kind: "normal", input: { intervals: [[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], newInterval: [4, 8] } },
    { name: "Fits in a gap", kind: "normal", input: { intervals: [[1, 2], [8, 9]], newInterval: [4, 5] } },
    { name: "Empty list", kind: "edge", input: { intervals: [], newInterval: [5, 7] }, why: "No existing intervals: both loops end immediately and `newInterval` is pushed on its own. The code must not touch `intervals[0]`." },
    { name: "New interval goes first", kind: "edge", input: { intervals: [[3, 5], [8, 9]], newInterval: [0, 1] }, why: "It ends before every existing interval starts, so phase 1 copies nothing, phase 2 absorbs nothing, and the new interval is pushed **first**. This tests the empty first phase." },
    { name: "Touching counts as overlapping", kind: "edge", input: { intervals: [[1, 5]], newInterval: [5, 6] }, why: "`[1, 5]` ends exactly where `[5, 6]` starts. Phase 1 uses a strict `<` (`5 < 5` is false), so it is **not** copied as 'before'; phase 2 uses `<=` (`1 <= 6`), so it is absorbed: `[1, 6]`." },
    { name: "New interval covers everything", kind: "edge", input: { intervals: [[2, 3], [4, 5], [6, 7]], newInterval: [1, 9] }, why: "Every existing interval overlaps the new one, so phase 2 absorbs all of them and phases 1 and 3 copy nothing. The result is a single `[1, 9]`." },
    { name: "New interval inside an existing one", kind: "corner", input: { intervals: [[1, 10]], newInterval: [3, 4] }, why: "`[3, 4]` lies inside `[1, 10]`. It is absorbed, and thanks to `min`/`max` the merged interval is still `[1, 10]` (the end must not shrink to 4)." },
    { name: "New interval goes last", kind: "corner", input: { intervals: [[1, 2], [3, 4]], newInterval: [6, 7] }, why: "Phase 1 copies **all** existing intervals (each ends before 6), phase 2 absorbs none, and the new interval is pushed last. Phase 3 has nothing to do." },
  ],

  trace(input, T) {
    const ex = input.intervals.map((p, i) => ({ id: "e" + i, s: p[0], e: p[1] }));
    const nw = { s: input.newInterval[0], e: input.newInterval[1] };
    const n = ex.length, res = [], ph = {};
    const all = ex.map((x) => x.s).concat(ex.map((x) => x.e), [nw.s, nw.e]);
    const lo = Math.min(...all), hi = Math.max(...all);
    let i = 0, absorbed = [], placed = false;
    let whyStrict = false, whyAbsorb = false, whyPlace = false;
    const S = (o = {}) => () => ({
      lanes: [
        { label: "existing", items: ex.map((x, k) => ({ id: x.id, s: x.s, e: x.e, cls: o.cur === k ? "cur" : absorbed.includes(k) ? "hit" : k < i && !absorbed.includes(k) ? "ok" : "win" })) },
        { label: "new", items: placed ? [] : [{ id: "new", s: nw.s, e: nw.e, cls: o.newCls || "cmp", text: `new [${nw.s}, ${nw.e}]` }] },
        { label: "result", items: res.map((r, k) => ({ id: "r" + k, s: r.s, e: r.e, cls: o.placedIdx === k ? "hit" : "ok", text: `[${r.s}, ${r.e}]` })) },
      ],
      axis: { min: lo, max: hi }, marks: o.mark ? [{ x: o.mark[0], label: o.mark[1], cls: "hot" }] : [], shades: o.shade ? [{ s: o.shade[0], e: o.shade[1], cls: "cmp", label: "overlap" }] : [], label: "existing intervals, the new one, and the result", note: o.note,
    });
    T.step("before", { vars: { i, "new.start": nw.s, "new.end": nw.e }, state: S({ note: "three phases: before / overlapping / after" }), phase: "Phase 1: intervals that end before the new one", say: `The existing intervals are sorted and disjoint, so they fall into three **contiguous** groups relative to the new interval **[${nw.s}, ${nw.e}]**: those ending **before** it starts, those **overlapping** it, and those starting **after** it ends.`, op: `i = 0,  new = [${nw.s}, ${nw.e}]`, act: "START" });
    while (i < n && ex[i].e < nw.s) {
      res.push({ s: ex[i].s, e: ex[i].e });
      T.step("before", { vars: { i, "intervals[i].end": ex[i].e, "new.start": nw.s }, state: S({ cur: i, mark: [nw.s, "new starts here"] }), say: `**[${ex[i].s}, ${ex[i].e}]** ends at ${ex[i].e}, **before** the new interval starts at ${nw.s}. It lies completely to the left: copy it unchanged.`, op: `${ex[i].e} < ${nw.s}  ⇒  copy`, act: "COPY_LEFT",
        why: whyStrict ? null : { title: "Why strictly less (`<`)?", text: "An interval that ends exactly where the new one starts touches it, and touching intervals must merge. So only `end < new.start` counts as 'completely before'." } });
      whyStrict = true;
      i++;
    }
    T.phase("Phase 2: absorb the overlapping intervals");
    T.step("overlap", { vars: { i }, state: S({ cur: i < n ? i : undefined }), say: i < n ? `The next interval **[${ex[i].s}, ${ex[i].e}]** does not end before ${nw.s}, so phase 1 is over. Now check whether it **overlaps** the new interval.` : "No intervals are left after phase 1, so there is nothing to absorb.", op: i < n ? `intervals[${i}].start = ${ex[i].s} <= new.end = ${nw.e} ?  ${ex[i].s <= nw.e}` : "i == n", act: "PHASE_2" });
    while (i < n && ex[i].s <= nw.e) {
      const old = { s: nw.s, e: nw.e };
      nw.s = Math.min(nw.s, ex[i].s); nw.e = Math.max(nw.e, ex[i].e);
      absorbed.push(i);
      T.step("absorb", { vars: { i, "new.start": nw.s, "new.end": nw.e }, state: S({ cur: i, newCls: "hit", shade: [Math.max(old.s, ex[i].s), Math.min(old.e, ex[i].e)] }), say: `**[${ex[i].s}, ${ex[i].e}]** starts at ${ex[i].s}, **not after** the new end (${old.e}): it overlaps. Absorb it: the new interval becomes **[${nw.s}, ${nw.e}]** (smaller start, larger end).`, op: `new = [min(${old.s}, ${ex[i].s}), max(${old.e}, ${ex[i].e})] = [${nw.s}, ${nw.e}]`, act: "ABSORB",
        why: whyAbsorb ? null : { title: "Why min and max?", text: "The union of two overlapping intervals runs from the smaller start to the larger end. Using `max` also covers an existing interval that sits **inside** the new one (its end is smaller)." } });
      whyAbsorb = true;
      i++;
    }
    placed = true;
    res.push({ s: nw.s, e: nw.e });
    T.step("place", { vars: { "new.start": nw.s, "new.end": nw.e }, state: S({ placedIdx: res.length - 1 }), say: `No more existing interval overlaps, so the merged new interval **[${nw.s}, ${nw.e}]** is final: push it to the result.`, op: `res.push([${nw.s}, ${nw.e}])`, act: "PLACE_NEW",
      why: whyPlace ? null : { title: "Why is it in the right position?", text: "Everything copied before it ended before its start, and everything still to come starts after its end. So appending it now keeps the result sorted and disjoint." } });
    whyPlace = true;
    T.phase("Phase 3: intervals that start after the new one");
    while (i < n) {
      res.push({ s: ex[i].s, e: ex[i].e });
      T.step("after", { vars: { i }, state: S({ cur: i }), say: `**[${ex[i].s}, ${ex[i].e}]** starts after the merged interval ends, so it lies completely to the right: copy it unchanged.`, op: `res.push([${ex[i].s}, ${ex[i].e}])`, act: "COPY_RIGHT" });
      i++;
    }
    T.step("ret", { vars: { count: res.length }, state: S({}), say: `Done: **${res.length}** interval${res.length === 1 ? "" : "s"}: ${JSON.stringify(res.map((r) => [r.s, r.e]))}. One pass, each interval touched once.`, op: "return res", act: "DONE" });
    T.result(res.map((r) => [r.s, r.e]));
  },
  fuzz(rnd) {
    const n = Math.floor(rnd() * 6), arr = []; let t = Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) { const s = t + 1 + Math.floor(rnd() * 3), e = s + Math.floor(rnd() * 3); arr.push([s, e]); t = e; }
    const a = Math.floor(rnd() * (t + 4)), b = a + Math.floor(rnd() * 6);
    return { intervals: arr, newInterval: [a, b] };
  },
  gen(n) { return { intervals: Array.from({ length: n }, (_, i) => [i * 4, i * 4 + 2]), newInterval: [Math.floor(n * 2), Math.floor(n * 2) + 1] }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass over the intervals", short: "every interval is copied or absorbed exactly once",
      derive: [
        "\\text{the three loops share one index } i, \\text{ which only increases} || phase 1, phase 2 and phase 3 each continue where the last stopped",
        "\\text{total iterations} = |\\text{phase 1}| + |\\text{phase 2}| + |\\text{phase 3}| = n || the three groups partition the intervals",
        "T(n) = c\\,n + c' || a constant amount of work per interval, plus the final push",
        "!T(n) = O(n) || versus $O(n \\log n)$ for sort-and-merge",
      ],
      where: "No interval is looked at twice: `i` moves forward through the list once. The measured table uses disjoint intervals and a new interval in the middle: the steps grow linearly.",
    },
    space: {
      tex: "O(n)", title: "the output list", short: "O(1) extra beyond the output",
      derive: [
        "S_{\\text{out}} \\le n + 1 || at most $n + 1$ intervals in the result",
        "S_{\\text{extra}} = |i| + |\\text{new}| = O(1) || the scan keeps only the index and the widening new interval",
        "!S = O(n) \\text{ (output)}, \\; O(1) \\text{ extra} || the output is required",
      ],
      where: "The result list is required output. Apart from it the algorithm needs only an index and the interval being widened.",
    },
    limit: "Every interval must be inspected (any of them could overlap the new one), so $\\Omega(n)$ is a lower bound. With a *balanced search tree* instead of a list, a single insertion costs $O(\\log n)$, but the input here is a plain list.",
    measure: { label: "n = number of existing intervals", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Using `<=` in phase 1", what: "`while (intervals[i][1] <= nw[0])`.", why: "Looks symmetric with phase 2.", breaks: "An interval touching the new one at a single point is copied as \"before\" and not merged: `[[1,5]]` + `[5,6]` returns `[[1,5],[5,6]]` instead of `[[1,6]]`.", avoid: "Phase 1: strict `<`. Phase 2: `<=` for the start." },
    { title: "Setting `new.end = intervals[i].end` instead of `max`", what: "Overwriting the end during absorption.", why: "Thinking the overlapping interval always extends further.", breaks: "An existing interval nested inside the new one has a *smaller* end and shrinks the result: `[1,10]` + `[3,4]` would give `[1,4]`.", avoid: "`new.end = max(new.end, intervals[i].end)` and `new.start = min(…)`." },
    { title: "Forgetting to push the new interval after phase 2", what: "Moving straight on to the remaining intervals.", why: "Phase 2 \"consumes\" overlapping intervals but pushes nothing.", breaks: "The merged interval is lost from the answer.", avoid: "Push `nw` between phase 2 and phase 3." },
    { title: "Sorting the whole list again", what: "Appending and sorting.", why: "Reusing the *Merge Intervals* solution.", breaks: "Correct but $O(n \\log n)$; the problem is meant to be linear.", avoid: "Use the sorted order: the three-phase scan." },
    { title: "Mutating the caller's `newInterval` or input", what: "Changing `nw[0]`/`nw[1]` in place.", why: "It is the shortest code.", breaks: "The caller's array is modified, which can surprise (and in JS the result may alias it).", avoid: "Work on a copy if the input must stay unchanged, or accept the modification as the lab does." },
  ],

  followUps: [
    {
      q: "Use **binary search** to find the first overlapping interval. Does that make it faster?",
      a: "Binary search can locate the start of the overlapping block in $O(\\log n)$, but you must still *produce* the output list, which is $O(n)$ if you copy. If the intervals live in an array you can **modify in place** (erase the absorbed block and insert one interval), the search is $O(\\log n)$ but the erase/insert shift is $O(n)$ again. A balanced tree makes the whole operation $O(\\log n)$.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Remove an interval from the list (*Remove Interval*), splitting intervals that it cuts.",
      a: "Same three-way classification: intervals completely left or right of the removed range are kept; an interval that **straddles** it is replaced by up to two pieces (`[start, removed.start]` and `[removed.end, end]`, when non-empty). One pass, $O(n)$.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Insert many intervals one by one, keeping the list merged.",
      a: "Each insertion is $O(n)$ with a list, so $k$ insertions cost $O(kn)$. Store the merged blocks in an ordered set keyed by start: each insertion finds its overlapping neighbours with `lower_bound`, erases them and inserts their union, $O(\\log n)$ amortised. That is the structure behind calendar-booking problems.",
      time: "O(log n) per insert", space: "O(n)",
    },
  ],

  related: [
    { id: "merge-intervals", why: "The unsorted version: sort first, then the same gap/overlap logic." },
    { id: "meeting-rooms", why: "A check on a sorted list of intervals using only neighbours." },
    { id: "non-overlapping-intervals", why: "Another sorted sweep over intervals with a greedy decision." },
    { id: "meeting-rooms-ii", why: "Counts overlaps with a min-heap while sweeping the sorted starts." },
  ],
  patternNote: "**The three-phase scan** exploits a sorted structure: classify items as *before / affected / after* the new one; because the classes are contiguous and ordered, one pointer and three loops (copy, absorb, copy) do the whole job in $O(n)$.",
  takeaways: [
    "On a sorted, disjoint list the intervals split into three **contiguous** groups: ends before / overlaps / starts after the new one.",
    "Phase 1: `end < new.start` (strict). Phase 2: `start <= new.end`, absorbing with `min` start and `max` end. Then push `new`, then phase 3.",
    "Touching intervals merge: strict `<` in phase 1, `<=` in phase 2.",
    "Time $O(n)$, space $O(n)$ for the output; no sorting needed.",
    "`max` for the end handles an existing interval nested inside the new one.",
  ],
});
