SHEETS.define({
  id: "non-overlapping-intervals",
  viz: "interval",
  io: { fn: "eraseOverlapIntervals", params: [["intervals", "int[][]"]], ret: "int", labels: { intervals: "intervals [start, end]" } },

  statement: `Given an array of \`intervals\` where \`intervals[i] = [start, end]\`, return the **minimum number of intervals you must remove** so that the remaining intervals do not overlap.

Intervals that only **touch** at an endpoint (like \`[1, 2]\` and \`[2, 3]\`) do **not** overlap.`,
  examples: [
    { input: "intervals = [[1, 2], [2, 3], [3, 4], [1, 3]]", output: "1", explain: "Remove `[1, 3]` and the rest (`[1,2]`, `[2,3]`, `[3,4]`) do not overlap." },
    { input: "intervals = [[1, 2], [1, 2], [1, 2]]", output: "2", explain: "Keep only one of the three identical intervals." },
    { input: "intervals = [[1, 2], [2, 3]]", output: "0", explain: "They only touch, so nothing needs to be removed." },
  ],
  constraints: ["$1 \\le$ `intervals.length` $\\le 10^5$", "`intervals[i].length == 2`", "$-5 \\times 10^4 \\le$ `start`$_i <$ `end`$_i \\le 5 \\times 10^4$"],
  check(input) { return input.intervals.length > 9 || input.intervals.some((p) => p.length !== 2 || p[0] >= p[1]) ? "for the animation use at most 9 intervals, each [start, end] with start < end" : input.intervals.some((p) => Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100) ? "keep the numbers between -100 and 100" : null; },

  intuition: {
    find: "How few intervals to delete so that the survivors are pairwise non-overlapping. Equivalently: the **largest set of non-overlapping intervals** (then remove the rest).",
    beginner: "Try every subset of intervals, keep those that are pairwise non-overlapping, and take the largest.",
    works: "It examines every possible choice, so the best subset is found.",
    slow: "There are $2^n$ subsets, hopeless beyond about 25 intervals (and the problem allows $10^5$).",
    repeat: "The search keeps making choices that clearly cannot be best (such as keeping a very long interval that blocks many short ones), but it has no rule to prefer one choice over another.",
    remember: "Think like a scheduler with one room: to fit the **most** meetings, always take the meeting that **ends earliest** among those that still fit, because it leaves the most room for the future.",
    observation: "**Greedy by earliest end:** sort by end time. Keep an interval if it starts at or after the end of the last kept one; otherwise it overlaps, and we drop **it** (not the earlier one), because the earlier one ends no later, so keeping it leaves at least as much room. An exchange argument proves this: swapping any optimal choice for the earliest-ending one never makes the result worse.",
    leads: "Sort by end. `end = −∞`. For each interval: if `start >= end` keep it (`end = its end`), else count a removal. Return the removals. $O(n \\log n)$.",
  },

  flow: [
    "Try every subset and keep the largest non-overlapping one.",
    "All choices are covered, so the best is found.",
    "$2^n$ subsets: hopeless for $n = 10^5$.",
    "To fit the most intervals, prefer the one that **ends earliest**: it leaves the most room.",
    "Sort by end; keep an interval if it starts at or after the last kept end, else remove it.",
    "Sort + one scan: $O(n \\log n)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force (all subsets):** for every subset of the intervals (as a bitmask), check that its intervals are pairwise non-overlapping. The answer is `n` minus the size of the largest valid subset.",
    why: "There are $2^n$ subsets and each check costs up to $O(n^2)$, so the work is exponential. The greedy rule removes all the guessing: a single provable choice (earliest end first) is always safe.",
    time: "O(2^n · n^2)", space: "O(1)",
    measure: { fTex: "2^{n}", f: (n) => Math.pow(2, n), ns: [10, 20, 30, 40, 100] },
    cpp: `class Solution {
public:
    int eraseOverlapIntervals(vector<vector<int>>& iv) {
        int n = iv.size(), best = 0;
        for (int mask = 0; mask < (1 << n); mask++) {
            bool ok = true;
            for (int i = 0; i < n && ok; i++) if (mask >> i & 1)
                for (int j = i + 1; j < n; j++) if (mask >> j & 1)
                    if (iv[i][0] < iv[j][1] && iv[j][0] < iv[i][1]) { ok = false; break; }
            if (ok) best = max(best, __builtin_popcount(mask));
        }
        return n - best;
    }
};`,
    js: `function eraseOverlapIntervals(iv) {
  const n = iv.length;
  let best = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    let ok = true, size = 0;
    for (let i = 0; i < n && ok; i++) if ((mask >> i) & 1) {
      size++;
      for (let j = i + 1; j < n; j++) if ((mask >> j) & 1)
        if (iv[i][0] < iv[j][1] && iv[j][0] < iv[i][1]) { ok = false; break; }
    }
    if (ok) best = Math.max(best, size);
  }
  return n - best;
}`,
  },

  pattern: {
    name: "Greedy (earliest end first)",
    why: "This is the classic **interval scheduling** problem. A greedy choice (*pick the interval that finishes first*) is provably optimal: it never leaves less room than any alternative. Sorting by **end** time, not start time, is what makes the local choice safe.",
    recognize: [
      "Choose the **largest set of non-conflicting** items (meetings, jobs, intervals), or the minimum to remove.",
      "Each item occupies a range; conflicts mean overlapping ranges.",
      "A natural greedy rule exists (*earliest finishing time*), and you can argue by exchange that it loses nothing.",
      "Sort by **end** (not start) and make one pass.",
    ],
  },

  optimal: {
    idea: "Sort the intervals by their **end**. Walk through them keeping `end`, the end of the last interval we decided to keep. If the next interval starts at or after `end` it does not overlap: keep it and move `end` to its end. Otherwise it overlaps with the interval we kept: remove it (count one), because the kept one finishes no later.",
    steps: [
      "Sort `intervals` by end ascending.",
      "Set `removed = 0` and `end = −∞` (the end of the last kept interval).",
      "For each interval `[s, e]`: if `s >= end`, **keep** it: `end = e`.",
      "Otherwise it overlaps the kept one: **remove** it: `removed++`.",
      "Return `removed`.",
    ],
    invariant: "**The kept intervals are pairwise non-overlapping, and among all non-overlapping subsets of the intervals processed so far, the kept set has the maximum size and (among those) the smallest possible last end.**",
    correct: "*Exchange argument:* let `A` be the interval with the earliest end. Take any optimal solution `O`. If `A ∈ O`, fine. Otherwise let `B` be the interval of `O` with the earliest end; `end(A) ≤ end(B)`, so replacing `B` by `A` keeps all other chosen intervals non-overlapping (they start at or after `end(B) ≥ end(A)`), and the size is unchanged: so some optimal solution contains `A`. Remove `A` and everything overlapping it, and repeat on what remains. The scan does exactly this: after keeping `A`, any later interval with `start < end(A)` overlaps it and is removed; the next interval with `start >= end(A)` is the earliest-ending of the remaining compatible ones. Hence the kept set is a maximum non-overlapping set and `removed = n − |kept|` is minimal.",
  },

  cpp: `class Solution {
public:
    int eraseOverlapIntervals(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end(),                    // by END time //@sort
             [](const vector<int>& a, const vector<int>& b) { return a[1] < b[1]; });
        int removed = 0, end = INT_MIN;                             // end of the last kept interval //@init
        for (auto& iv : intervals) {                                //@loop
            if (iv[0] >= end) end = iv[1];                          // fits: keep it //@keep
            else removed++;                                         // overlaps: remove it //@drop
        }
        return removed;                                             //@ret
    }
};`,
  js: `function eraseOverlapIntervals(intervals) {
  intervals.sort((a, b) => a[1] - b[1]);                            // by END time //@sort
  let removed = 0, end = -Infinity;                                 // end of the last kept interval //@init
  for (const iv of intervals) {                                     //@loop
    if (iv[0] >= end) end = iv[1];                                  // fits: keep it //@keep
    else removed++;                                                 // overlaps: remove it //@drop
  }
  return removed;                                                   //@ret
}`,

  tests: [
    { name: "Example 1: remove one", kind: "normal", input: { intervals: [[1, 2], [2, 3], [3, 4], [1, 3]] } },
    { name: "Example 2: three identical", kind: "normal", input: { intervals: [[1, 2], [1, 2], [1, 2]] } },
    { name: "Example 3: touching only", kind: "normal", input: { intervals: [[1, 2], [2, 3]] } },
    { name: "A long interval blocks many short ones", kind: "edge", input: { intervals: [[1, 10], [2, 3], [4, 5], [6, 7]] }, why: "The long interval `[1, 10]` overlaps all three short ones. Sorting by **end** puts the short ones first: they are all kept, and the long one is removed: answer `1`. Sorting by *start* (keeping the first) would keep `[1, 10]` and remove three, answering 3." },
    { name: "Sorting by start would fail", kind: "edge", input: { intervals: [[1, 100], [11, 22], [1, 11], [2, 12]] }, why: "Greedy by earliest *start* keeps `[1, 100]` and removes the rest (3 removals). Greedy by earliest **end** keeps `[1, 11]` and `[11, 22]` and removes 2: the right answer. It shows why the sort key must be the end." },
    { name: "Nested intervals", kind: "edge", input: { intervals: [[1, 6], [2, 3], [3, 5]] }, why: "`[2, 3]` and `[3, 5]` fit inside `[1, 6]` and touch each other: keep both (they do not overlap), remove `[1, 6]`: answer 1." },
    { name: "A single interval", kind: "corner", input: { intervals: [[4, 9]] }, why: "One interval never overlaps anything: nothing to remove. `iv[0] >= INT_MIN` is true, so it is kept." },
    { name: "Negative coordinates", kind: "corner", input: { intervals: [[-5, -1], [-3, 0], [-1, 2]] }, why: "Starting `end` at `INT_MIN` / `−Infinity` (not `0`) is essential: with `end = 0` the first interval `[-5, -1]` would look like an overlap and be wrongly removed." },
    { name: "Already disjoint", kind: "corner", input: { intervals: [[1, 2], [4, 5], [7, 8]] }, why: "Every interval starts after the previous end, so all are kept: answer 0." },
  ],

  trace(input, T) {
    const iv = input.intervals.map((p, i) => ({ id: "v" + i, s: p[0], e: p[1] }));
    const n = iv.length, sorted = iv.slice().sort((a, b) => a.e - b.e || a.s - b.s);
    const lo = Math.min(...iv.map((x) => x.s)), hi = Math.max(...iv.map((x) => x.e));
    let order = iv.slice(), end = -Infinity, removed = 0;
    const status = {};
    let whyEnd = false, whyDrop = false, whyKeep = false;
    const S = (o = {}) => () => ({
      lanes: order.map((x, k) => ({ label: `#${k + 1}`, items: [{ id: x.id, s: x.s, e: x.e, cls: status[x.id] === "keep" ? "ok" : status[x.id] === "drop" ? "bad" : o.cur === k ? "cur" : "win" }] })),
      axis: { min: lo, max: hi }, marks: end !== -Infinity ? [{ x: end, label: "end of the last kept", cls: "hot" }] : [], shades: o.shade ? [{ s: o.shade[0], e: o.shade[1], cls: "bad", label: "overlap" }] : [],
      regs: [{ k: "removed", v: removed, cls: "bad" }, { k: "kept", v: Object.values(status).filter((x) => x === "keep").length, cls: "ok" }], label: "green = kept, red = removed", note: o.note,
    });
    T.step("sort", { vars: { n }, state: S({ note: "as given" }), phase: "Sort by end time", say: `${n} intervals. The greedy rule is *\"always keep the interval that finishes earliest among those that fit\"*, because it leaves the most room for later ones. So we sort by **end**, not by start.`, op: "intervals (as given)", act: "START" });
    order = sorted;
    T.step("sort", { w: Math.max(1, Math.round(n * Math.log2(Math.max(n, 2)))), vars: { n }, state: S({ note: "sorted by END time" }), say: "Sorted by end time. The first interval in this order is the one that finishes soonest.", op: "sort by iv[1]", act: "SORT_BY_END",
      why: { title: "Why sort by END and not START?", text: "An interval that finishes early blocks the fewest future intervals. Sorting by start could put a very long interval first, which would block many others." } });
    T.step("init", { vars: { end: "−∞", removed: 0 }, state: S({}), say: "`end` is the finishing time of the last interval we decided to keep. It starts at **−∞**, so the first interval always fits.", op: "removed = 0,  end = −∞", act: "INIT" });
    T.phase("Sweep: keep or remove");
    sorted.forEach((x, k) => {
      const fits = x.s >= end;
      T.step(fits ? "keep" : "drop", { vars: { interval: `[${x.s}, ${x.e}]`, "iv.start": x.s, end: end === -Infinity ? "−∞" : end, removed }, state: S({ cur: k, shade: !fits ? [x.s, Math.min(end, x.e)] : null }),
        say: fits ? `**[${x.s}, ${x.e}]** starts at ${x.s}${end === -Infinity ? "" : `, at or after the last kept end (${end})`}: it fits. **Keep** it and set \`end = ${x.e}\`.` : `**[${x.s}, ${x.e}]** starts at ${x.s}, **before** the last kept end (${end}): it overlaps the interval we kept. Remove **this** one (the kept one finishes no later, so it blocks less).`,
        op: fits ? `${x.s} >= ${end === -Infinity ? "−∞" : end}  ⇒  end = ${x.e}` : `${x.s} < ${end}  ⇒  removed = ${removed + 1}`, act: fits ? "KEEP" : "REMOVE",
        why: fits ? (whyKeep ? null : { title: "Why is keeping it safe?", text: "Among the intervals that still fit, this one finishes first (the list is sorted by end). Any optimal solution can use it instead of its own first interval without losing anything." }) : (whyDrop ? null : { title: "Why drop this one and not the earlier one?", text: "The earlier (kept) interval ends no later than this one, so keeping it leaves at least as much room. Dropping the later-ending one is never worse." }) });
      if (fits) { status[x.id] = "keep"; end = x.e; whyKeep = true; } else { status[x.id] = "drop"; removed++; whyDrop = true; }
      T.step(fits ? "keep" : "drop", { vars: { end, removed }, state: S({ cur: k }), say: fits ? `Kept. \`end\` is now **${end}**: later intervals must start at ${end} or later.` : `Removed. \`removed\` is now **${removed}**; \`end\` stays **${end}**.`, op: fits ? `end = ${end}` : `removed = ${removed}`, act: fits ? "UPDATE_END" : "COUNT_REMOVED",
        why: !whyEnd && fits ? { title: "Why does `end` track the last KEPT interval?", text: "A new interval can only be kept if it does not overlap *any* kept interval. Because everything kept is ordered by end, comparing with the last kept end is enough." } : null });
      if (fits) whyEnd = true;
    });
    T.step("ret", { vars: { removed }, state: S({}), say: `The scan is done. The fewest intervals to remove is **${removed}** (and ${n - removed} are kept, none of them overlapping).`, op: `return ${removed}`, act: "DONE" });
    T.result(removed);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 8); return { intervals: Array.from({ length: n }, () => { const a = Math.floor(rnd() * 10); return [a, a + 1 + Math.floor(rnd() * 5)]; }) }; },
  gen(n) { return { intervals: Array.from({ length: n }, (_, i) => [(n - i) * 2, (n - i) * 2 + 1]) }; },

  complexity: {
    time: {
      tex: "O(n \\log n)", title: "the sort dominates the linear scan", short: "sort by end: n log n; scan: n",
      derive: [
        "T_{\\text{sort}}(n) = O(n \\log n) || comparison sort by end",
        "T_{\\text{scan}}(n) = \\sum_{k=1}^{n} c = c\\,n || one comparison and at most one assignment per interval",
        "T(n) = O(n \\log n) + O(n)",
        "!T(n) = O(n \\log n) || versus $2^n$ subsets",
      ],
      where: "The measured table counts the sort as $n \\log_2 n$ steps and the scan as $n$ steps (two frames per interval).",
    },
    space: {
      tex: "O(1)", title: "two integers (plus the sort's stack)", short: "`end` and `removed`",
      derive: [
        "S = |\\text{end}| + |\\text{removed}| || the scan keeps two numbers",
        "!S = O(1) \\;\\text{(or } O(\\log n) \\text{ for a recursive sort)} || sorting in place",
      ],
      where: "No auxiliary list of kept intervals is needed: only the *end* of the last kept one matters.",
    },
    limit: "Interval scheduling needs $\\Omega(n \\log n)$ in the comparison model (it can be reduced from sorting), so this is optimal.",
    measure: { label: "n = number of intervals", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Sorting by start instead of end", what: "`sort(iv.begin(), iv.end())` (default sort).", why: "Habit from *Merge Intervals*.", breaks: "A long early interval is kept and blocks many short ones: `[[1,10],[2,3],[4,5],[6,7]]` would answer 3 instead of 1.", avoid: "For *maximise the number of intervals kept*, sort by **end**." },
    { title: "Treating touching intervals as overlapping", what: "`if (iv[0] > end)` to keep.", why: "\"No shared point allowed\".", breaks: "`[1,2]` and `[2,3]` would be counted as overlapping: too many removals. The statement says touching is fine.", avoid: "Keep when `start >= end` (non-strict)." },
    { title: "Initialising `end` to 0", what: "`int end = 0;`", why: "Zero looks neutral.", breaks: "Intervals with negative coordinates are all considered overlapping the (fake) kept interval ending at 0.", avoid: "`INT_MIN` / `−Infinity`, or take the first interval as the initial kept one." },
    { title: "Moving `end` when an interval is removed", what: "Writing `end = iv[1]` in both branches.", why: "Both branches look like they should record the latest interval seen.", breaks: "`end` jumps right past the interval we kept, so later intervals that do **not** overlap the kept one are judged to overlap it, causing extra removals.", avoid: "Update `end` only when you **keep** an interval; a removed interval leaves `end` unchanged." },
    { title: "Counting kept intervals and forgetting to subtract", what: "Returning the number kept.", why: "The loop naturally counts kept intervals.", breaks: "The question asks for the number **removed**.", avoid: "Return `n − kept`, or count removals directly as here." },
  ],

  followUps: [
    {
      q: "Return the **maximum number of non-overlapping intervals** you can keep (*Activity Selection*).",
      a: "It is the same algorithm counting the kept intervals instead of the removed ones: `kept = n − removed`. It is the textbook *activity selection* problem solved greedily by earliest finish time.",
      cpp: `int maxNonOverlapping(vector<vector<int>>& iv) {
    sort(iv.begin(), iv.end(), [](auto& a, auto& b) { return a[1] < b[1]; });
    int kept = 0, end = INT_MIN;
    for (auto& x : iv) if (x[0] >= end) { kept++; end = x[1]; }
    return kept;
}`,
      js: `function maxNonOverlapping(iv) {
  iv.sort((a, b) => a[1] - b[1]);
  let kept = 0, end = -Infinity;
  for (const x of iv) if (x[0] >= end) { kept++; end = x[1]; }
  return kept;
}`,
      time: "O(n log n)", space: "O(1)",
    },
    {
      q: "Each interval has a **weight** (profit); maximise the total weight of non-overlapping intervals (*Weighted Interval Scheduling*).",
      a: "Greedy no longer works (a heavy long interval may beat several light short ones). Sort by end and use **DP**: `dp[i]` = best total using the first `i` intervals; `dp[i] = max(dp[i−1], weight[i] + dp[p(i)])` where `p(i)` is the last interval ending at or before `start[i]`, found by binary search. $O(n \\log n)$.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Find the **minimum number of arrows** to burst all balloons (balloons are intervals; an arrow at `x` bursts all balloons containing `x`).",
      a: "Another interval greedy: sort by **end**, shoot an arrow at the end of the first balloon, skip every balloon that starts at or before that point (the same arrow bursts it), then repeat from the next balloon. The number of arrows is the number of such rounds. Note one difference: balloons that merely **touch** share a point, so one arrow bursts both, while in this lesson touching intervals do not overlap.",
      time: "O(n log n)", space: "O(1)",
    },
    {
      q: "Prove that sorting by start (keep the first) fails, with a counter-example.",
      a: "Take `[[1, 100], [2, 3], [4, 5]]`. By start we keep `[1, 100]` first and must remove the other two (2 removals); by end we keep `[2, 3]` and `[4, 5]` and remove only `[1, 100]` (1 removal). The long interval starts first but finishes last, which is exactly the property that makes it a bad greedy choice.",
      time: "—", space: "—",
    },
  ],

  related: [
    { id: "meeting-rooms-ii", why: "How many intervals overlap at the same time: a min-heap sweep over the sorted starts." },
    { id: "merge-intervals", why: "Sort then sweep, merging overlaps instead of dropping them." },
    { id: "jump-game", why: "Another greedy: keep the one number that matters (the furthest reach) and justify why it is safe." },
    { id: "best-time-to-buy-and-sell-stock", why: "A greedy scan with one running quantity." },
  ],
  patternNote: "**Interval scheduling greedy:** to fit the most non-conflicting items, repeatedly take the one that **ends first**, because it blocks the least. Prove it with an exchange argument (swap any optimal first choice for the earliest-ending one), implement it as *sort by end, scan once*, and be careful with the touching-endpoint rule and with the initial `end`.",
  takeaways: [
    "Maximising the number kept = minimising the number removed: `removed = n − kept`.",
    "Greedy: **sort by end**; keep an interval if `start >= lastEnd`, else remove it (and leave `lastEnd` unchanged).",
    "Sorting by start is **wrong** here (a long early interval blocks many short ones).",
    "Touching is allowed (`>=`); initialise `end` to `−∞` (negative coordinates!).",
    "Time $O(n \\log n)$, space $O(1)$; the exchange argument is the proof.",
  ],
});
