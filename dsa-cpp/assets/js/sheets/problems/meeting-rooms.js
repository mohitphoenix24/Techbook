SHEETS.define({
  id: "meeting-rooms",
  viz: "interval",
  io: { fn: "canAttendMeetings", params: [["intervals", "int[][]"]], ret: "bool", labels: { intervals: "meetings [start, end]" } },
  premium: true,

  statement: `Given an array of meeting time intervals \`intervals\` where \`intervals[i] = [start, end]\`, determine whether a person could **attend all the meetings**. They can attend two meetings only if one ends no later than the other starts (a meeting ending at 5 and another starting at 5 do **not** conflict).`,
  examples: [
    { input: "intervals = [[0, 30], [5, 10], [15, 20]]", output: "false", explain: "`[0, 30]` overlaps both of the other meetings." },
    { input: "intervals = [[7, 10], [2, 4]]", output: "true", explain: "`[2, 4]` is over before `[7, 10]` starts." },
  ],
  constraints: ["$0 \\le$ `intervals.length` $\\le 10^4$", "`intervals[i].length == 2`", "$0 \\le$ `start`$_i <$ `end`$_i \\le 10^6$"],
  check(input) { return input.intervals.length > 8 || input.intervals.some((p) => p.length !== 2 || p[0] >= p[1]) ? "for the animation use at most 8 meetings, each [start, end] with start < end" : input.intervals.some((p) => Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100) ? "keep the numbers between -100 and 100" : null; },

  intuition: {
    find: "A yes/no answer: **do any two meetings overlap?** If none do, the person can attend them all.",
    beginner: "Compare every pair of meetings; if some pair overlaps, answer `false`.",
    works: "Two meetings overlap exactly when each starts before the other ends. Checking all pairs finds any conflict.",
    slow: "$\\frac{n(n-1)}{2}$ pairs: $O(n^2)$, about 50 million pairs for $n = 10^4$ (and far worse for bigger inputs).",
    repeat: "Most of those comparisons are between meetings that are **far apart in time** and can't possibly clash, but the pair loop has no way to know that.",
    remember: "If the meetings are listed in **time order** (sorted by start), a meeting can only conflict with the ones near it: specifically, a conflict with some earlier meeting implies a conflict with the **immediately preceding** one.",
    observation: "After sorting by start, suppose some earlier meeting `j` overlaps meeting `i`, i.e. `end[j] > start[i]`. Every meeting between them starts no earlier than `start[j]` and no later than `start[i]`, and in particular meeting `i − 1` does too. If `i − 1 = j` we are done. Otherwise `i − 1` starts before `start[i] < end[j]`, so it overlaps `j`, and the first clash in the list was at an **adjacent** pair. So checking only neighbours finds a clash whenever one exists.",
    leads: "Sort by start, then scan once: `if (intervals[i].start < intervals[i − 1].end) return false`. If the scan ends, no overlap exists. $O(n \\log n)$ for the sort and $O(n)$ for the scan.",
  },

  flow: [
    "Compare every pair of meetings for overlap.",
    "Any conflicting pair is found, so the answer is right.",
    "$O(n^2)$ pairs, mostly between meetings far apart in time.",
    "Sort by start: a conflict with an earlier meeting implies a conflict with the previous one.",
    "Scan the sorted list comparing each start with the previous end.",
    "Sort + one scan: $O(n \\log n)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force:** for every pair `i < j`, check whether the meetings overlap: `start[i] < end[j] && start[j] < end[i]`. If any pair does, return `false`.",
    why: "There are $\\frac{n(n-1)}{2}$ pairs, so $\\Theta(n^2)$ comparisons. Sorting by start would reduce the check to $n - 1$ adjacent comparisons, since a clash with any earlier meeting always shows up as a clash with the previous one.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    bool canAttendMeetings(vector<vector<int>>& intervals) {
        int n = intervals.size();
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                if (intervals[i][0] < intervals[j][1] && intervals[j][0] < intervals[i][1]) return false;
        return true;
    }
};`,
    js: `function canAttendMeetings(intervals) {
  const n = intervals.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (intervals[i][0] < intervals[j][1] && intervals[j][0] < intervals[i][1]) return false;
  return true;
}`,
  },

  pattern: {
    name: "Intervals (sort, then compare neighbours)",
    why: "Sorting by start time lines the meetings up in the order they begin. Then any overlap must show up between **neighbours**: the question *\"does anything overlap?\"* shrinks from all pairs to adjacent pairs.",
    recognize: [
      "A yes/no question about overlaps or conflicts among time ranges.",
      "Sorting the ranges lets you only compare **adjacent** ones.",
      "The test between neighbours is a single comparison of `next.start` with `prev.end`.",
      "Touching ranges (`end == start`) do **not** conflict here (a strict `<`).",
    ],
  },

  optimal: {
    idea: "Sort the meetings by start time. Walk through them: if a meeting starts **before** the previous one ends (`intervals[i][0] < intervals[i − 1][1]`), two meetings overlap, so the person cannot attend all. If the scan finishes, there is no overlap.",
    steps: [
      "Sort `intervals` by start (then end).",
      "For `i` from `1` to `n − 1`: if `intervals[i].start < intervals[i − 1].end`, **return `false`**.",
      "Return `true`.",
    ],
    invariant: "**After checking meeting `i`, no two of the first `i + 1` meetings (in sorted order) overlap.**",
    correct: "If the algorithm returns `false` at `i`, meetings `i − 1` and `i` overlap (`start[i] < end[i−1]`, and `start[i−1] ≤ start[i]` by sorting). If the input has an overlapping pair `(j, i)` with `j < i` in sorted order, then `start[j] ≤ start[i] < end[j]`. Take the smallest such `i`. For all `k` with `j ≤ k < i`, `start[k] ≤ start[i]`; meeting `i − 1` starts at or after `start[j]`; if `i − 1 = j` the check at `i` fires. Otherwise meeting `i − 1` starts in `[start[j], start[i]]`, so it starts before `end[j]` and overlaps `j`, contradicting the minimality of `i`. So some adjacent pair always overlaps, and the scan finds it.",
  },

  cpp: `class Solution {
public:
    bool canAttendMeetings(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end());                         // by start //@sort
        for (size_t i = 1; i < intervals.size(); i++)                     //@loop
            if (intervals[i][0] < intervals[i - 1][1]) return false;      // starts before the last one ended //@check
        return true;                                                      //@ret
    }
};`,
  js: `function canAttendMeetings(intervals) {
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);                   // by start //@sort
  for (let i = 1; i < intervals.length; i++)                              //@loop
    if (intervals[i][0] < intervals[i - 1][1]) return false;              // starts before the last one ended //@check
  return true;                                                            //@ret
}`,

  tests: [
    { name: "Example 1: overlapping", kind: "normal", input: { intervals: [[0, 30], [5, 10], [15, 20]] } },
    { name: "Example 2: no overlap", kind: "normal", input: { intervals: [[7, 10], [2, 4]] } },
    { name: "Several meetings, all separate", kind: "normal", input: { intervals: [[1, 2], [3, 4], [5, 6], [8, 9]] } },
    { name: "Back-to-back meetings", kind: "edge", input: { intervals: [[1, 5], [5, 8]] }, why: "One ends at 5 and the next starts at 5: **no conflict**, so the answer is `true`. The test must be a strict `<` (`start < previous end`); using `<=` would wrongly reject back-to-back meetings." },
    { name: "Identical meetings", kind: "edge", input: { intervals: [[2, 6], [2, 6]] }, why: "Two meetings at exactly the same time clash: `2 < 6` is true after sorting, so `false`." },
    { name: "A long meeting hides a conflict further on", kind: "edge", input: { intervals: [[0, 20], [5, 6], [10, 11]] }, why: "After sorting, `[5, 6]` starts before `[0, 20]` ends: the clash appears **at the very first adjacent pair**, even though `[10, 11]` also conflicts with `[0, 20]` (and not with `[5, 6]`). Checking only adjacent pairs is enough because the first conflict is always adjacent." },
    { name: "No meetings", kind: "corner", input: { intervals: [] }, why: "Nothing to attend, nothing to clash: `true`. The loop starts at `i = 1` and never runs; `sort` on an empty list is a no-op." },
    { name: "One meeting", kind: "corner", input: { intervals: [[3, 9]] }, why: "A single meeting cannot overlap with anything: `true`. Same as the empty case, the loop body never runs." },
    { name: "Unsorted input, no overlap", kind: "corner", input: { intervals: [[10, 12], [1, 3], [5, 7]] }, why: "Without sorting, comparing neighbours as given (`[10,12]` then `[1,3]`) would wrongly flag a conflict (`1 < 12`). After sorting the scan finds none." },
  ],

  trace(input, T) {
    const iv = input.intervals.map((p, i) => ({ id: "m" + i, s: p[0], e: p[1] }));
    const n = iv.length, sorted = iv.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    const lo = n ? Math.min(...iv.map((x) => x.s)) : 0, hi = n ? Math.max(...iv.map((x) => x.e)) : 4;
    let order = iv.slice();
    let whyAdj = false, whyStrict = false;
    const S = (o = {}) => () => ({
      lanes: order.map((x, k) => ({ label: `#${k + 1}`, items: [{ id: x.id, s: x.s, e: x.e, cls: o.bad && (k === o.bad[0] || k === o.bad[1]) ? "bad" : k === o.cur ? "cur" : k === o.prev ? "cmp" : o.done != null && k < o.done ? "ok" : "win" }] })),
      axis: { min: lo, max: hi }, marks: o.mark != null ? [{ x: o.mark, label: "previous meeting ends", cls: o.bad ? "bad" : "hot" }] : [], shades: o.shade ? [{ s: o.shade[0], e: o.shade[1], cls: "bad", label: "clash" }] : [], label: "meetings on a timeline", note: o.note,
    });
    T.step("sort", { vars: { n }, state: S({ note: "as given" }), phase: "Sort, then compare neighbours", say: `${n} meeting${n === 1 ? "" : "s"}, listed in arbitrary order. Comparing every pair would be quadratic work; sorting by start will let us compare only **neighbours**.`, op: "intervals (as given)", act: "START" });
    order = sorted;
    T.step("sort", { w: Math.max(1, Math.round(n * Math.log2(Math.max(n, 2)))), vars: { n }, state: S({ note: "sorted by start time" }), say: "Sorted by start time: the rows slide into the order in which the meetings begin. Now a clash can only appear between a meeting and the one just before it.", op: "sort(intervals)", act: "SORT" });
    for (let i = 1; i < n; i++) {
      const a = sorted[i - 1], b = sorted[i], clash = b.s < a.e;
      T.step("check", { vars: { i, "start[i]": b.s, "end[i−1]": a.e }, state: S({ prev: i - 1, cur: i, mark: a.e, bad: clash ? [i - 1, i] : null, shade: clash ? [b.s, Math.min(a.e, b.e)] : null, done: i - 1 }),
        say: clash ? `Meeting **[${b.s}, ${b.e}]** starts at **${b.s}**, **before** the previous meeting **[${a.s}, ${a.e}]** ends at **${a.e}**. They overlap, so the person cannot attend both. Return \`false\`.` : b.s === a.e ? `Meeting [${b.s}, ${b.e}] starts at **${b.s}**, exactly when [${a.s}, ${a.e}] ends. Back-to-back is **fine**: no clash.` : `Meeting [${b.s}, ${b.e}] starts at **${b.s}**, **after** the previous one ended at **${a.e}**: no clash.`,
        op: `intervals[${i}].start = ${b.s}  <  intervals[${i - 1}].end = ${a.e} ?  ${clash}`, act: clash ? "CLASH" : "NO_CLASH",
        why: clash ? { title: "Why is the previous meeting enough to compare with?", text: "The meetings are sorted by start, so every earlier meeting started no later than the previous one. If an earlier meeting reached past this start, so would the previous one or a meeting between them: a clash anywhere earlier always shows up at the adjacent pair, and we stop at the first." } : (b.s === a.e && !whyStrict ? { title: "Why strict `<`?", text: "Ending at 5 and starting at 5 is allowed: you can walk from one meeting to the next. Only a start strictly before the previous end is a clash." } : (!whyAdj ? { title: "Why only neighbours?", text: "Sorting by start makes the meetings appear in time order. If this meeting does not clash with the previous one, it cannot clash with any earlier one either, since those started even earlier." } : null)) });
      if (b.s === a.e) whyStrict = true; whyAdj = true;
      if (clash) { T.result(false); return; }
    }
    T.step("ret", { vars: { n }, state: S({ done: n }), say: n < 2 ? `With ${n} meeting${n === 1 ? "" : "s"} there is nothing that could overlap: return \`true\`.` : "Every adjacent pair is separated, so no two meetings overlap. The person can attend them all: return `true`.", op: "return true", act: "ALL_ATTENDABLE" });
    T.result(true);
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 7); return { intervals: Array.from({ length: n }, () => { const a = Math.floor(rnd() * 14); return [a, a + 1 + Math.floor(rnd() * 3)]; }) }; },
  gen(n) { return { intervals: Array.from({ length: n }, (_, i) => [(n - i) * 3, (n - i) * 3 + 1]) }; },

  complexity: {
    time: {
      tex: "O(n \\log n)", title: "the sort dominates the linear scan", short: "sort: n log n, scan: n − 1 comparisons",
      derive: [
        "T_{\\text{sort}}(n) = O(n \\log n) || comparison sort by start",
        "T_{\\text{scan}}(n) = (n-1)\\,c || one comparison per adjacent pair",
        "T(n) = O(n \\log n) + O(n)",
        "!T(n) = O(n \\log n) || versus $\\tfrac{n(n-1)}{2}$ pair checks",
      ],
      where: "If a clash exists the scan can stop early, but the worst case (no clash) runs the whole scan. The measured table counts the sort as $n \\log_2 n$ steps on a no-clash input (the worst case).",
    },
    space: {
      tex: "O(1)", title: "no extra structure (the sort may use O(log n) stack)", short: "just the loop index",
      derive: [
        "S = |i| + S_{\\text{sort}} || the scan needs one index",
        "!S = O(1) \\;\\text{(or } O(\\log n) \\text{ for a recursive sort)} || the intervals are sorted in place",
      ],
      where: "If you must not modify the input, sort a copy and the space becomes $O(n)$.",
    },
    limit: "Detecting whether any two intervals overlap needs $\\Omega(n \\log n)$ comparisons in the comparison model (it contains element distinctness), so sort-and-scan is optimal.",
    measure: { label: "n = number of meetings (no clash)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Using `<=` in the clash test", what: "`intervals[i][0] <= intervals[i − 1][1]`.", why: "Treating a shared endpoint as a clash.", breaks: "Back-to-back meetings (`[1,5]`, `[5,8]`) are rejected, but the problem says they are fine.", avoid: "Clash only when `start < previous end` (strict)." },
    { title: "Not sorting", what: "Comparing adjacent meetings in the given order.", why: "The examples may look ordered.", breaks: "`[[10,12],[1,3],[5,7]]` is flagged as a clash (`1 < 12`) although no two meetings overlap.", avoid: "Sort by start first." },
    { title: "Comparing with the *next* meeting but sorting by end", what: "Sorting by end time and still using the start-based test.", why: "Mixing up the two common sort keys.", breaks: "The adjacent-pair argument depends on sorting by **start**.", avoid: "Sort by start for this check." },
    { title: "Reading `intervals[i − 1]` at `i = 0`", what: "Starting the loop at 0.", why: "Off-by-one.", breaks: "Out-of-bounds read (undefined behaviour in C++).", avoid: "Start at `i = 1`." },
    { title: "Checking only the first and last meeting", what: "Looking for a single global overlap.", why: "Thinking the earliest and latest decide it.", breaks: "A clash in the middle is missed.", avoid: "Scan **every** adjacent pair." },
  ],

  followUps: [
    {
      q: "Return the **minimum number of rooms** needed to hold all the meetings (*Meeting Rooms II*).",
      a: "Now overlaps are allowed but each overlapping meeting needs its own room. Sort by start and keep a **min-heap of end times** (one per room in use): before assigning a meeting, pop the room that ends earliest if it is free by this start. The heap size at the end is the number of rooms. That is the next lesson, $O(n \\log n)$.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Check overlaps **without sorting** (e.g. the intervals are integers in a small range).",
      a: "Use a **difference array / bucket marking** over the time range: add `+1` at each start and `−1` at each end, take a prefix sum, and look for any value above 1 (strictly, any point covered twice). It is $O(n + R)$ where $R$ is the length of the range, which beats sorting only when $R$ is small.",
      time: "O(n + R)", space: "O(R)",
    },
    {
      q: "Find **which** two meetings clash (return the pair).",
      a: "In the sorted scan, return the two adjacent meetings when the test fires. To report the pair in terms of the original positions, sort an array of *indices* (or carry the original index along) instead of sorting the intervals themselves. Same $O(n \\log n)$.",
      time: "O(n log n)", space: "O(n)",
    },
  ],

  related: [
    { id: "meeting-rooms-ii", why: "The same sorted order, but counting how many meetings overlap at once with a min-heap." },
    { id: "merge-intervals", why: "Sort by start, then sweep: overlapping neighbours are merged instead of reported." },
    { id: "non-overlapping-intervals", why: "Sort and sweep deciding which intervals to remove so that none overlap." },
    { id: "insert-interval", why: "Linear scan on an already sorted interval list." },
  ],
  patternNote: "**Sort then compare neighbours** is the first move for almost every interval question: once sorted by start, an interval's *only* relevant neighbour is the previous one (or the current merged block), so one comparison per interval answers questions that look like they need all pairs.",
  takeaways: [
    "Sort by start; then a clash exists iff some `start[i] < end[i − 1]`.",
    "Use a strict `<`: back-to-back meetings do not clash.",
    "A clash with any earlier meeting always appears at the adjacent pair, so adjacent comparisons suffice.",
    "Start the scan at `i = 1`; empty and single-meeting inputs are trivially `true`.",
    "Time $O(n \\log n)$ (sort) + $O(n)$, extra space $O(1)$; brute force is $O(n^2)$.",
  ],
});
