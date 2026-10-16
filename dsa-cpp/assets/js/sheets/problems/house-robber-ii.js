SHEETS.define({
  id: "house-robber-ii",
  viz: "dp",
  io: { fn: "rob", params: [["nums", "int[]"]], ret: "int" },

  statement: `This is *House Robber* with one change: the houses are arranged in a **circle**, so the **first and the last house are neighbours**.

Given \`nums[i]\`, the money in house \`i\`, return the maximum you can rob **without robbing two adjacent houses** (remembering that house \`0\` and house \`n − 1\` are adjacent).`,
  examples: [
    { input: "nums = [2, 3, 2]", output: "3", explain: "You cannot rob house 0 and house 2 together (they are neighbours in the circle), so the best is house 1 alone." },
    { input: "nums = [1, 2, 3, 1]", output: "4", explain: "Rob house 0 (1) and house 2 (3): `1 + 3 = 4`." },
    { input: "nums = [1, 2, 3]", output: "3", explain: "Any two houses are adjacent in a circle of three, so rob only house 2." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 100$", "$0 \\le$ `nums[i]` $\\le 1000$"],

  intuition: {
    find: "The best total over sets of houses with **no two neighbours on the circle**. The new rule: house `0` and house `n − 1` cannot both be robbed.",
    beginner: "Try both possibilities for the first house: either it is robbed or it is not. Solve the rest recursively with the circular restriction tracked.",
    works: "Splitting on the first house covers every valid set. The recursion with take/skip choices explores them all.",
    slow: "Exponential, exactly like the plain recursion in *House Robber*, since the same suffix problems repeat.",
    repeat: "The recursion rebuilds the same *\"best from house `k` on\"* values for both cases (first house robbed or not).",
    remember: "We already know how to solve a **line** of houses in $O(n)$ (previous lesson). The circle is only a line with one extra constraint at its ends.",
    observation: "In any valid plan, **at least one of house `0` and house `n − 1` is not robbed**. So every valid plan is a valid plan on the line `0..n−2` (last house excluded) **or** on the line `1..n−1` (first house excluded). Two cases, each an ordinary House Robber.",
    leads: "Answer = `max(robLine(0..n−2), robLine(1..n−1))`, with the special case `n == 1` (return `nums[0]`). Two linear scans: $O(n)$ time, $O(1)$ space.",
  },

  flow: [
    "Recursively choose rob/skip per house, tracking whether the first was robbed.",
    "All valid sets are covered by the choices.",
    "Exponential, with repeated suffix problems.",
    "A line of houses is already solved in $O(n)$.",
    "In any valid plan house `0` or house `n − 1` is skipped: two line problems.",
    "`max(line 0..n−2, line 1..n−1)` (and `nums[0]` when `n = 1`): $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** a recursion over the houses that, at each house, either robs it (and jumps two ahead) or skips it, remembering whether house 0 was robbed so that the last house is forbidden in that case.",
    why: "Every house doubles the number of branches, giving exponentially many calls (about $\\varphi^n$) that recompute the same suffixes. A line DP removes all of that repetition.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "\\approx \\varphi^n", f: (n) => Math.pow(1.618, n), ns: [10, 20, 30, 40, 100] },
    cpp: `class Solution {
    int go(vector<int>& a, int i, bool tookFirst) {
        int n = a.size();
        if (i >= n) return 0;
        int skip = go(a, i + 1, tookFirst);
        if (i == n - 1 && tookFirst) return skip;          // the last house is next to house 0
        int take = a[i] + go(a, i + 2, tookFirst || i == 0);
        return max(skip, take);
    }
public:
    int rob(vector<int>& nums) {
        if (nums.size() == 1) return nums[0];
        return go(nums, 0, false);
    }
};`,
    js: `function rob(nums) {
  const n = nums.length;
  if (n === 1) return nums[0];
  const go = (i, tookFirst) => {
    if (i >= n) return 0;
    const skip = go(i + 1, tookFirst);
    if (i === n - 1 && tookFirst) return skip;             // the last house is next to house 0
    const take = nums[i] + go(i + 2, tookFirst || i === 0);
    return Math.max(skip, take);
  };
  return go(0, false);
}`,
  },

  pattern: {
    name: "Dynamic Programming (reduce to the line)",
    why: "A circular constraint looks new, but it can be **cut** into a few linear cases: pick the places where the circle is broken, and each piece becomes the problem you already solved. Here the break is *\"either the first or the last house is not robbed\"*, which leaves two lines.",
    recognize: [
      "A familiar linear DP with the twist that the **ends touch** (a circle).",
      "A constraint involving only two special elements (first and last).",
      "You can enumerate a **small number of cases** (here 2) that each remove the circular constraint.",
      "The same helper routine can be called on different sub-ranges.",
    ],
  },

  optimal: {
    idea: "Write a helper `robRange(lo, hi)` that solves the ordinary *House Robber* on houses `lo..hi` with two rolling variables. The circular answer is the better of `robRange(0, n − 2)` (the last house is off-limits) and `robRange(1, n − 1)` (the first house is off-limits). A single house is returned directly.",
    steps: [
      "If `n == 1`, return `nums[0]`.",
      "Compute `A = robRange(0, n − 2)`: best total when house `n − 1` is never robbed.",
      "Compute `B = robRange(1, n − 1)`: best total when house `0` is never robbed.",
      "Return `max(A, B)`.",
      "`robRange` keeps `prev2`, `prev1`: for each house `cur = max(prev1, prev2 + money)`, then slide.",
    ],
    invariant: "**Every valid circular plan is a valid line plan on `0..n−2` or on `1..n−1`, and every valid line plan on those ranges is a valid circular plan.** So the maximum over the union is the answer.",
    correct: "(⇒) In a valid circular plan, houses `0` and `n − 1` are not both robbed. If `n − 1` is not robbed, the plan is a plan on `0..n−2` with no two adjacent. If house `0` is not robbed, it is a plan on `1..n−1`. (⇐) A valid line plan on `0..n−2` never touches house `n − 1`, so house `0` and `n − 1` are not both robbed; likewise for `1..n−1`. So the two cases partition all valid plans, and the best of the two is optimal.",
  },

  cpp: `class Solution {
    int robRange(vector<int>& a, int lo, int hi) {         // houses lo..hi in a line
        int prev2 = 0, prev1 = 0;                          //@rinit
        for (int i = lo; i <= hi; i++) {                   //@rloop
            int cur = max(prev1, prev2 + a[i]);            // skip or rob //@rcur
            prev2 = prev1; prev1 = cur;                    //@rroll
        }
        return prev1;
    }
public:
    int rob(vector<int>& nums) {
        int n = nums.size();
        if (n == 1) return nums[0];                        //@single
        return max(robRange(nums, 0, n - 2),               // skip the last //@ret
                   robRange(nums, 1, n - 1));              // or skip the first
    }
};`,
  js: `function rob(nums) {
  const robRange = (lo, hi) => {                           // houses lo..hi in a line
    let prev2 = 0, prev1 = 0;                              //@rinit
    for (let i = lo; i <= hi; i++) {                       //@rloop
      const cur = Math.max(prev1, prev2 + nums[i]);        // skip or rob //@rcur
      prev2 = prev1; prev1 = cur;                          //@rroll
    }
    return prev1;
  };
  const n = nums.length;
  if (n === 1) return nums[0];                             //@single
  return Math.max(robRange(0, n - 2),                      // skip the last //@ret
                  robRange(1, n - 1));                     // or skip the first
}`,

  tests: [
    { name: "Example 1: [2, 3, 2]", kind: "normal", input: { nums: [2, 3, 2] } },
    { name: "Example 2: [1, 2, 3, 1]", kind: "normal", input: { nums: [1, 2, 3, 1] } },
    { name: "Example 3: [1, 2, 3]", kind: "normal", input: { nums: [1, 2, 3] } },
    { name: "A single house", kind: "edge", input: { nums: [7] }, why: "With one house, the \"first\" and \"last\" are the same house. `robRange(0, −1)` would be an empty range and `robRange(1, 0)` too, so the answer would be `0` instead of `7`. The explicit `n == 1` special case is required." },
    { name: "Two houses", kind: "edge", input: { nums: [2, 3] }, why: "The two houses are adjacent (and also adjacent around the circle), so only one can be robbed: `max(2, 3) = 3`. Each helper call sees a single house, giving the two candidates." },
    { name: "Two large houses at the ends", kind: "edge", input: { nums: [10, 1, 1, 10] }, why: "Houses 0 and 3 are neighbours on the circle, so you cannot take both 10s. Each linear case can take only one of them: the answer is `11` (a 10 plus a 1), not 20." },
    { name: "All equal", kind: "corner", input: { nums: [1, 1, 1, 1] }, why: "On a circle of four equal houses the best is two houses (opposite ones): `2`. Both linear cases give 2." },
    { name: "Best is entirely in the middle", kind: "corner", input: { nums: [1, 50, 1, 50, 1] }, why: "The two 50s (indices 1 and 3) are not adjacent and do not touch the ends. Both ranges contain them, and the answer is `100`." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    if (n === 1) {
      T.step("single", { vars: { n }, state: () => ({ dps: [{ label: "only one house", dp: [nums[0]], hl: { 0: "hit" }, colHead: [0] }], arrs: [{ label: "money in each house", arr: nums, hl: { 0: "hit" } }], formula: `n == 1  →  rob it = ${nums[0]}` }), phase: "Special case", say: "With a single house the circle has nothing to split: rob it.", op: `n == 1  →  return ${nums[0]}`, act: "SINGLE" });
      T.result(nums[0]);
      return;
    }
    const runs = [{ lo: 0, hi: n - 2, dp: [], title: "Case A: skip the LAST house (houses 0 … n−2)" }, { lo: 1, hi: n - 1, dp: [], title: "Case B: skip the FIRST house (houses 1 … n−1)" }];
    let whySplit = false, whyMax = false;
    const colHead = (r) => Array.from({ length: r.hi - r.lo + 1 }, (_, k) => r.lo + k);
    const S = (active, cur, deps, o = {}) => () => {
      const dps = runs.map((r, k) => {
        const len = r.hi - r.lo + 1;
        const dp = Array.from({ length: len }, (_, j) => (j < r.dp.length ? r.dp[j] : null));
        const hl = {};
        if (k === active && cur != null) { hl[cur] = "cur"; (deps || []).forEach((d) => (hl[d] = "cmp")); }
        if (o.final && k === o.winner) hl[len - 1] = "hit";
        return { label: r.title, dp, hl, cur: k === active ? cur : null, deps: k === active ? deps : [], colHead: colHead(r), depLabels: ["skip", "rob"] };
      });
      const arrHl = {};
      if (active != null) { const r = runs[active]; for (let h = r.lo; h <= r.hi; h++) arrHl[h] = "win"; if (cur != null) arrHl[r.lo + cur] = "cur"; }
      return { arrs: [{ label: "money in each house (a circle: the ends touch)", arr: nums, hl: arrHl }], dps, formula: o.formula, regs: o.regs };
    };
    T.step("rinit", { vars: { n }, state: S(null, null, null), phase: "Split the circle into two lines", say: "On a circle, house 0 and house n − 1 are neighbours, so **at least one of them is not robbed**. That gives two ordinary line problems: skip the last house, or skip the first.", op: `max( line(0..${n - 2}),  line(1..${n - 1}) )`, act: "START",
      why: { title: "Why only two cases?", text: "A valid plan cannot contain both end houses. So either house n − 1 is not robbed (a plan on houses 0..n−2) or house 0 is not robbed (a plan on houses 1..n−1). Every valid plan falls into at least one of those two lines." } });
    whySplit = true;
    const results = [];
    runs.forEach((r, k) => {
      let prev2 = 0, prev1 = 0;
      for (let i = r.lo; i <= r.hi; i++) {
        const j = i - r.lo, cur = Math.max(prev1, prev2 + nums[i]);
        const deps = [];
        if (j >= 1) deps.push(j - 1);
        if (j >= 2) deps.push(j - 2);
        r.dp.push(cur);
        T.step("rcur", { vars: { case: k === 0 ? "A" : "B", house: i, "prev1 (skip)": prev1, "prev2 + money (rob)": prev2 + nums[i], cur }, state: S(k, j, deps, { formula: `case ${k === 0 ? "A" : "B"}, house ${i}:  max(skip = ${prev1},  rob = ${prev2} + ${nums[i]} = ${prev2 + nums[i]}) = ${cur}` }), say: `${k === 0 ? "Case A" : "Case B"}, house ${i} (money **${nums[i]}**): skip keeps **${prev1}**, robbing gives ${prev2} + ${nums[i]} = **${prev2 + nums[i]}**. The best is **${cur}**.`, op: `cur = max(${prev1}, ${prev2} + ${nums[i]}) = ${cur}`, act: prev2 + nums[i] > prev1 ? "ROB" : "SKIP",
          phase: k === 0 ? "Case A: houses 0 … n−2" : "Case B: houses 1 … n−1" });
        prev2 = prev1; prev1 = cur;
      }
      results.push(prev1);
    });
    const A = results[0], B = results[1], best = Math.max(A, B);
    T.step("ret", { vars: { A, B, answer: best }, state: S(null, null, null, { final: true, winner: A >= B ? 0 : 1, formula: `answer = max(A, B) = max(${A}, ${B}) = ${best}`, regs: [{ k: "Case A", v: A, cls: "cmp" }, { k: "Case B", v: B, cls: "cmp" }, { k: "answer", v: best, cls: "hit" }] }), phase: "Combine", say: `Case A (skip the last house) gives **${A}**, case B (skip the first) gives **${B}**. The circular answer is the larger: **${best}**.`, op: `return max(${A}, ${B}) = ${best}`, act: "DONE",
      why: whyMax ? null : { title: "Why max of the two?", text: "Each case is a set of valid circular plans, and together they cover all valid plans. The best plan overall is therefore the better of the two best plans." } });
    T.result(best);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 11); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 20)) }; },
  gen(n) { return { nums: Array.from({ length: Math.max(n, 2) }, (_, i) => (i * 7) % 10 + 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "two linear scans", short: "each scan visits n − 1 houses",
      derive: [
        "T(n) = T_{\\text{line}}(0..n-2) + T_{\\text{line}}(1..n-1) || two calls of the line routine",
        "T_{\\text{line}}(m) = c\\,m \\;\\text{ for a line of } m \\text{ houses} || one `max` and two moves per house",
        "T(n) = c\\,(n-1) + c\\,(n-1) = 2c\\,(n-1) || both lines have $n - 1$ houses",
        "!T(n) = O(n) || the factor 2 is a constant",
      ],
      where: "The circle costs only a **constant factor** of 2 compared with the line, since we run the linear algorithm twice.",
    },
    space: {
      tex: "O(1)", title: "two running variables per scan", short: "`prev1`, `prev2` (and the two results)",
      derive: [
        "S(n) = |\\text{prev1}| + |\\text{prev2}| + |\\text{cur}| + 2|\\text{result}| || the scans run one after the other",
        "!S(n) = O(1) || no table",
      ],
      where: "The lesson's trace shows the two dp rows for teaching; the code itself keeps only `prev2` and `prev1`.",
    },
    limit: "$\\Omega(n)$ time is needed to read the input, and $O(1)$ space is minimal, so this is optimal.",
    measure: { label: "n = number of houses", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Forgetting the single-house case", what: "Calling `robRange(0, n−2)` and `robRange(1, n−1)` for `n = 1`.", why: "The examples have at least 3 houses.", breaks: "Both ranges are empty (`robRange(0, −1)` and `robRange(1, 0)`), returning `0` instead of `nums[0]`.", avoid: "`if (n == 1) return nums[0];` first." },
    { title: "Running the line routine on the full array", what: "Solving the ordinary House Robber on `0..n−1`.", why: "Forgetting the circle.", breaks: "It may rob both house 0 and house `n − 1`, which are neighbours: e.g. `[2, 3, 2]` gives 4 instead of 3.", avoid: "Exclude one end in each of two runs." },
    { title: "Excluding both ends in one run", what: "Solving only `1..n−2`.", why: "\"Neither end can be robbed\" looks safe.", breaks: "It is too restrictive: the best plan may rob exactly one end, e.g. `[5, 1, 1]` → 5, but `1..1` gives 1.", avoid: "Use two runs; each keeps one of the ends." },
    { title: "Off-by-one on the ranges", what: "`robRange(0, n−1)` / `robRange(1, n)`.", why: "Mixing inclusive and exclusive upper bounds.", breaks: "Reads `nums[n]` out of bounds, or silently robs the forbidden end.", avoid: "Inclusive bounds: `0..n−2` and `1..n−1`." },
    { title: "Resetting state between the two runs", what: "Sharing `prev1` and `prev2` across both runs.", why: "Copy-pasting the loop.", breaks: "The second run starts with leftovers from the first, giving a wrong answer.", avoid: "Put the loop in a helper (or reset both variables to 0 each time)." },
  ],

  followUps: [
    {
      q: "Return **which houses** to rob.",
      a: "Run the two line DPs with full tables (not rolling variables), pick the case with the larger value, and backtrack through that case's table: if `dp[i] == dp[i − 1]` the house was skipped, otherwise it was robbed and you jump back two. Offset the indices by the start of the range. $O(n)$ time and space.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "What if houses `0` and `n − 1` are adjacent **and** you may rob at most `k` houses in total?",
      a: "Add a second dimension to the DP: `dp[i][j]` = best total using houses up to `i` with exactly `j` robbed. The recurrence is `dp[i][j] = max(dp[i−1][j], dp[i−2][j−1] + nums[i])`, and the circle is handled with the same two-range trick. Time $O(nk)$, space $O(nk)$ (or $O(k)$ with rolling rows).",
      time: "O(nk)", space: "O(k)",
    },
    {
      q: "Why does cutting the circle at the ends work, in one sentence? What if three houses were mutually adjacent?",
      a: "Because the only forbidden pair that the line cannot express is `(0, n − 1)`, and forcing one of the two to be skipped removes it without losing any valid plan. If more pairs were forbidden (a general graph of conflicts), the problem becomes *maximum weight independent set*, which is NP-hard in general; the line and the circle (and trees) are special cases that are easy.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "house-robber", why: "The line version: the subroutine this problem calls twice." },
    { id: "climbing-stairs", why: "The same two-previous-cells recurrence with `+`." },
    { id: "maximum-subarray", why: "Another compact 1D DP carrying one running value." },
  ],
  patternNote: "**Breaking a cycle into lines** is a recurring trick: find a small set of cases that together cover every valid solution and each of which removes the circular dependency, solve each case with the linear algorithm, then take the best. It turns a new problem into a call to one you already trust.",
  takeaways: [
    "On a circle, house `0` and house `n − 1` cannot both be robbed.",
    "Answer = `max(robLine(0..n−2), robLine(1..n−1))`: two ordinary House Robber runs.",
    "Special-case `n == 1` (return `nums[0]`), or both ranges are empty.",
    "Time $O(n)$ (two scans), space $O(1)$.",
    "Reduce a new constraint to a problem you can already solve.",
  ],
});
