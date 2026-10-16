SHEETS.define({
  id: "jump-game",
  viz: "greedy",
  io: { fn: "canJump", params: [["nums", "int[]"]], ret: "bool" },

  statement: `You are standing on the first index of the array \`nums\`. Each element \`nums[i]\` is the **maximum jump length** from position \`i\` (you may jump any distance from \`1\` to \`nums[i]\`).

Return \`true\` if you can reach the **last index**, otherwise \`false\`.`,
  examples: [
    { input: "nums = [2, 3, 1, 1, 4]", output: "true", explain: "Jump 1 step from index 0 to 1, then 3 steps to the last index." },
    { input: "nums = [3, 2, 1, 0, 4]", output: "false", explain: "Whatever you do you land on index 3, whose value is 0, so you can never move past it." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 10^4$", "$0 \\le$ `nums[i]` $\\le 10^5$"],

  intuition: {
    find: "A yes/no answer: is the last index **reachable** from index 0 using jumps of length at most `nums[i]` from each position?",
    beginner: "Try everything: from index `i`, try every jump length from 1 to `nums[i]` and recurse. If any path reaches the last index, say `true`.",
    works: "It explores every possible sequence of jumps, so if a route exists it is found.",
    slow: "There can be exponentially many routes (up to $2^{n}$ for an array of ones and twos), and the same position is explored again and again.",
    repeat: "Many different routes pass through the **same index**, and from that index the question *\"can I reach the end from here?\"* has the same answer every time, yet we re-answer it.",
    remember: "Instead of tracking routes, track the **furthest index reachable so far**. If we can reach an index, we can also reach every index before it (just take smaller jumps), so the reachable set is always a *prefix* `[0, reach]`.",
    observation: "Walk left to right keeping `reach` = the farthest index any earlier position can jump to. If we arrive at an index `i > reach`, we are **stuck**: no earlier position could jump this far. Otherwise `i` is reachable, and from it we can extend `reach = max(reach, i + nums[i])`. If `reach` ever covers the last index, we win.",
    leads: "One pass: for each `i`, if `i > reach` return `false`; else update `reach = max(reach, i + nums[i])`. After the loop return `true`. $O(n)$ time, $O(1)$ space.",
  },

  flow: [
    "Try every jump length from every position, recursively.",
    "All routes are explored, so a route to the end is found if it exists.",
    "Exponentially many routes, re-solving the same positions.",
    "Reachable positions always form a prefix: `[0, reach]`.",
    "Scan left to right: stuck if `i > reach`, else `reach = max(reach, i + nums[i])`.",
    "A single greedy pass: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force (backtracking):** `canReach(i)` is `true` if `i` is the last index, otherwise try every jump `1..nums[i]` and return `true` if any `canReach(i + jump)` is `true`.",
    why: "From each index it branches into up to `nums[i]` calls, and many different routes arrive at the same index, so the number of calls grows exponentially. Only `n` distinct positions exist, but the search revisits them over and over.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "\\approx 2^{n}", f: (n) => Math.pow(2, n), ns: [10, 20, 30, 40, 100] },
    cpp: `class Solution {
    bool go(vector<int>& a, int i) {
        if (i >= (int)a.size() - 1) return true;
        for (int step = 1; step <= a[i]; step++)
            if (go(a, i + step)) return true;
        return false;
    }
public:
    bool canJump(vector<int>& nums) { return go(nums, 0); }
};`,
    js: `function canJump(nums) {
  const go = (i) => {
    if (i >= nums.length - 1) return true;
    for (let step = 1; step <= nums[i]; step++) if (go(i + step)) return true;
    return false;
  };
  return go(0);
}`,
  },

  pattern: {
    name: "Greedy",
    why: "A greedy algorithm keeps one summary of the past and makes the locally best update, relying on a proof that nothing is lost. Here the summary is `reach`, and the proof is that the reachable indices form a prefix: reaching index `r` means every index below `r` is also reachable. So tracking the maximum is enough.",
    recognize: [
      "A question about **reachability** or *feasibility* along a line where each element gives a range.",
      "A DP/backtracking formulation exists but a single number (`farthest`, `current end`) summarises the whole past.",
      "You can show the set of reachable positions is an **interval/prefix**.",
      "The solution scans once and updates a running maximum or minimum.",
    ],
  },

  optimal: {
    idea: "Scan left to right with `reach`, the farthest index reachable so far (initially 0). At index `i`: if `i > reach` then `i` cannot be reached, so the last index cannot either: return `false`. Otherwise extend `reach = max(reach, i + nums[i])`. If the loop completes, every index (including the last) was reachable.",
    steps: [
      "Set `reach = 0`.",
      "For each `i` from `0` to `n − 1`: if `i > reach`, **return `false`** (stuck before `i`).",
      "Otherwise set `reach = max(reach, i + nums[i])`.",
      "After the loop, **return `true`**.",
    ],
    invariant: "**Before processing index `i`, `reach` is the largest index reachable using jumps from indices `0..i−1`, and every index in `[0, reach]` is reachable.**",
    correct: "*Prefix property:* if index `r` is reachable by a jump from `k`, every index in `[k+1, r]` is reachable too (shorter jump from `k`), so by induction the reachable indices are exactly `[0, reach]`. *Stuck:* if `i > reach`, no index `< i` can reach `i`, and indices `> i` are only reachable through some index `≤ i` that is unreachable, so nothing beyond `reach` can ever be reached: the answer is `false`. *Otherwise* `i ≤ reach` is reachable and its own jump extends `reach` to `max(reach, i + nums[i])`. If the scan finishes without getting stuck, every index up to `n − 1` was reached.",
  },

  cpp: `class Solution {
public:
    bool canJump(vector<int>& nums) {
        int reach = 0;                                       // farthest index reachable so far //@init
        for (int i = 0; i < (int)nums.size(); i++) {         //@loop
            if (i > reach) return false;                     // cannot even stand here //@stuck
            reach = max(reach, i + nums[i]);                 // jump as far as possible //@update
        }
        return true;                                         //@ret
    }
};`,
  js: `function canJump(nums) {
  let reach = 0;                                             // farthest index reachable so far //@init
  for (let i = 0; i < nums.length; i++) {                    //@loop
    if (i > reach) return false;                             // cannot even stand here //@stuck
    reach = Math.max(reach, i + nums[i]);                    // jump as far as possible //@update
  }
  return true;                                               //@ret
}`,

  tests: [
    { name: "Example 1: reachable", kind: "normal", input: { nums: [2, 3, 1, 1, 4] } },
    { name: "Example 2: stuck at a zero", kind: "normal", input: { nums: [3, 2, 1, 0, 4] } },
    { name: "Plenty of slack", kind: "normal", input: { nums: [5, 0, 0, 0, 0, 1] } },
    { name: "A single index", kind: "edge", input: { nums: [0] }, why: "You are already standing on the last index, so the answer is `true` even though `nums[0] = 0` (no jump is needed). A solution that demands `nums[0] > 0` would be wrong." },
    { name: "Zero at the start with more cells", kind: "edge", input: { nums: [0, 1] }, why: "From index 0 you cannot move at all, so index 1 is unreachable: `false`. The check `i > reach` fires immediately at `i = 1`." },
    { name: "Zeros can be jumped over", kind: "edge", input: { nums: [2, 0, 0] }, why: "Zeros are only dangerous if you *land* on them. The jump of 2 from index 0 hops over the first zero straight onto the last index: `true`. A rule like \"any zero is a wall\" would be wrong." },
    { name: "Exactly enough to arrive", kind: "corner", input: { nums: [1, 1, 1, 1] }, why: "`reach` grows one step at a time and reaches the last index at the final iteration. There is no slack at all: any off-by-one in `i + nums[i]` shows up here." },
    { name: "One short of the end", kind: "corner", input: { nums: [1, 0, 1] }, why: "From index 0 you reach index 1 (a zero); index 2 is out of range of every earlier jump (`reach = 1`). At `i = 2` we have `i > reach` → `false`." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    let reach = 0, whyPrefix = false, whyStuck = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      for (let k = 0; k <= Math.min(reach, n - 1); k++) hl[k] = "ok";
      for (let k = Math.min(reach, n - 1) + 1; k < n; k++) hl[k] = "dim";
      if (i != null && i < n) hl[i] = o.stuck ? "bad" : "cur";
      const arcs = [];
      if (i != null && i < n && !o.stuck) { const to = Math.min(i + nums[i], n - 1); if (to > i) arcs.push({ from: i, to, cls: "cur", label: `+${nums[i]}` }); }
      const spans = [{ from: 0, to: Math.min(reach, n - 1), cls: o.stuck ? "bad" : "ok", label: `reachable so far: indices 0 … ${Math.min(reach, n - 1)}${reach >= n - 1 ? "  (covers the last index)" : ""}` }];
      return { arr: nums, hl, ptr: i != null && i < n ? { i } : {}, arcs, spans, label: "jump length at each index", regs: [{ k: "reach (farthest index)", v: reach, cls: "hit" }, { k: "last index", v: n - 1, cls: "dim" }], decision: o.decision, note: o.note };
    };
    T.step("init", { vars: { reach }, state: S(0), phase: "One greedy pass", say: "Only index 0 is known to be reachable (we stand there), so `reach = 0`. We walk right and keep extending `reach` with every jump we could make from reachable cells.", op: "reach = 0", act: "START" });
    for (let i = 0; i < n; i++) {
      T.step("stuck", { vars: { i, reach, "nums[i]": nums[i] }, state: S(i, { stuck: i > reach }), say: i > reach ? `We are at index **${i}**, but \`reach = ${reach}\`: **no earlier position can jump this far**. We are stuck: the last index is unreachable.` : `Index ${i} ≤ \`reach = ${reach}\`: it is **reachable**, so we may stand here and jump.`, op: `i = ${i} > reach = ${reach} ?  ${i > reach}`, act: i > reach ? "STUCK" : "REACHABLE",
        why: i > reach ? (whyStuck ? null : { title: "Why does 'i > reach' mean failure for good?", text: `Every earlier index has been used and the farthest any of them can jump is ${reach}. Any later index can only be reached from an index we can stand on, and we can't stand on ${i}: so the end is out of reach.` }) : null });
      if (i > reach) { whyStuck = true; T.result(false); return; }
      const cand = i + nums[i], old = reach;
      reach = Math.max(reach, cand);
      T.step("update", { vars: { i, "i + nums[i]": cand, reach }, state: S(i, { decision: { cand: `i + nums[i] = ${i} + ${nums[i]} = ${cand}`, verdict: cand > old ? `reach = ${reach}` : `reach stays ${old}`, cls: cand > old ? "ok" : "dim", because: cand > old ? "this jump goes farther than any before" : "an earlier jump already goes at least this far" } }), say: cand > old ? `From index ${i} we can jump up to **${cand}**, farther than any earlier index could: \`reach\` grows from ${old} to **${reach}**.` : `From index ${i} we could reach ${cand}, which is **not farther** than the current \`reach = ${old}\`. It changes nothing.`, op: `reach = max(${old}, ${i} + ${nums[i]}) = ${reach}`, act: cand > old ? "EXTEND_REACH" : "KEEP_REACH",
        why: whyPrefix || !(cand > old) ? null : { title: "Why is every index up to `reach` reachable?", text: `If we can land on index ${cand}, then by taking a shorter jump from ${i} we can land on any index between ${i + 1} and ${cand}. So the reachable set is always a prefix [0, reach] with no holes.` } });
      if (cand > old) whyPrefix = true;
    }
    T.step("ret", { vars: { reach }, state: S(null), say: `We scanned every index without getting stuck, so all indices up to the last are reachable. Return **true**.`, op: "return true", act: "REACHABLE_END" });
    T.result(true);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 9); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 4)) }; },
  gen(n) { return { nums: Array.from({ length: n }, () => 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "a single left-to-right pass", short: "n iterations, each a comparison and a max",
      derive: [
        "T(n) = \\sum_{i=0}^{n-1} \\big( c_{\\text{cmp}} + c_{\\max} \\big) || each index: one comparison with `reach`, one `max`",
        "T(n) = c\\,n || the two constants merge",
        "!T(n) = O(n) || the loop may even stop early (when stuck)",
      ],
      where: "The brute force explores routes; the greedy pass looks at each index once because one number (`reach`) captures everything the earlier indices can do.",
    },
    space: {
      tex: "O(1)", title: "one integer", short: "just `reach`",
      derive: [
        "S(n) = |\\text{reach}| + |i| || the only state",
        "!S(n) = 2c = O(1) || no table, no recursion",
      ],
      where: "A DP table `canReach[i]` would need $O(n)$; the prefix property lets one integer replace it.",
    },
    limit: "Every element can matter, so $\\Omega(n)$ time is needed in the worst case; constant space is minimal.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Treating every zero as a barrier", what: "Returning `false` as soon as a `0` is seen.", why: "Zeros look like walls.", breaks: "`[2, 0, 0]` is reachable: the jump from index 0 skips both zeros.", avoid: "A zero blocks only if `reach` does not extend past it: compare `i` with `reach`." },
    { title: "Using `i >= reach` for the stuck test", what: "`if (i >= reach) return false;`", why: "Off-by-one: \"I cannot move from here\".", breaks: "Index `i == reach` is reachable (the farthest index you can land on). The check would reject `[1, 1, 1]`.", avoid: "Stuck means `i > reach`, strictly greater." },
    { title: "Forgetting to take the maximum", what: "`reach = i + nums[i];`", why: "Overwriting instead of extending.", breaks: "A smaller later jump lowers `reach`: `[5, 0, 0, 0, 0, 1]` would be rejected at index 1.", avoid: "`reach = max(reach, i + nums[i])`." },
    { title: "Stopping the loop at `n − 2` or `reach >= n`", what: "Looping fewer iterations or comparing against the wrong bound.", why: "Confusion about the last index.", breaks: "Misses the case `[0]` (single index) or ends one step early.", avoid: "Loop all indices and return `true` at the end; the last index only needs `i <= reach`." },
    { title: "Plain recursion without memoisation", what: "Backtracking over all jump lengths.", why: "It is the direct reading of the statement.", breaks: "Exponential time: a time-limit error for $n$ around 40–50.", avoid: "Either memoise (O(n²) DP) or use the greedy `reach` scan (O(n))." },
  ],

  followUps: [
    {
      q: "What is the **minimum number of jumps** to reach the last index (assuming it is reachable)?",
      a: "Still greedy, like *BFS by levels*: keep `curEnd` (the farthest index reachable with the current number of jumps) and `farthest` (reachable with one more). Scan; whenever `i == curEnd`, you must take another jump: `jumps++` and `curEnd = farthest`. Each index is touched once: $O(n)$.",
      cpp: `int minJumps(vector<int>& nums) {
    int jumps = 0, curEnd = 0, farthest = 0;
    for (int i = 0; i + 1 < (int)nums.size(); i++) {
        farthest = max(farthest, i + nums[i]);
        if (i == curEnd) { jumps++; curEnd = farthest; }
    }
    return jumps;
}`,
      js: `function minJumps(nums) {
  let jumps = 0, curEnd = 0, farthest = 0;
  for (let i = 0; i + 1 < nums.length; i++) {
    farthest = Math.max(farthest, i + nums[i]);
    if (i === curEnd) { jumps++; curEnd = farthest; }
  }
  return jumps;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Solve it with **dynamic programming** instead. Why is greedy better?",
      a: "Let `ok[i]` be *\"can reach the last index from `i`\"*, filled from the right: `ok[n−1] = true`, and `ok[i] = true` if any `j` in `i+1..i+nums[i]` has `ok[j]`. That is $O(n^2)$ naively (and $O(n)$ with the observation that you only need the *leftmost* good index). The greedy solution makes the same observation without any table: it is a DP compressed into one variable.",
      time: "O(n²)", space: "O(n)",
    },
    {
      q: "You must **land exactly** on the last index with jump lengths **exactly** `nums[i]` (not at most). What changes?",
      a: "The prefix property disappears (you can no longer take shorter jumps), so greedy no longer works. It becomes a reachability problem on a **graph**: from `i` you may go only to `i + nums[i]` (or also `i − nums[i]` in *Jump Game III*), so a BFS/DFS with a `visited` array is the right tool, $O(n)$.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "best-time-to-buy-and-sell-stock", why: "Another one-pass greedy that keeps a running best (the minimum) instead of exploring all pairs." },
    { id: "maximum-subarray", why: "A one-pass scan carrying one running value." },
    { id: "climbing-stairs", why: "The same \"how far can I get\" structure, solved by counting rather than by feasibility." },
    { id: "non-overlapping-intervals", why: "Another greedy proof: keep the choice that leaves the most room (the earliest end)." },
  ],
  patternNote: "**The Greedy pattern** compresses the past into one number and proves that this number is all that matters. Reachability on a line is a classic case: if you can reach a cell you can reach everything before it, so the *farthest* reachable index is a complete summary. When a DP table is just a prefix of `true`s, replace it by its boundary.",
  takeaways: [
    "Keep `reach`, the farthest reachable index; reachable indices always form the prefix `[0, reach]`.",
    "At index `i`: if `i > reach` you are **stuck** (return `false`); else `reach = max(reach, i + nums[i])`.",
    "Zeros are not barriers by themselves; only a zero that `reach` cannot jump over is.",
    "Time $O(n)$, space $O(1)$. Exponential backtracking → $O(n^2)$ DP → $O(n)$ greedy.",
    "Use strict `>` in the stuck test, and `max` when extending.",
  ],
});
