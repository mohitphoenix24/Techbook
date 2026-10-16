SHEETS.define({
  id: "combination-sum-iv",
  viz: "dp",
  io: { fn: "combinationSum4", params: [["nums", "int[]"], ["target", "int"]], ret: "int" },

  statement: `Given an array \`nums\` of **distinct** positive integers and a positive integer \`target\`, return the **number of possible sequences** of numbers from \`nums\` (each number may be used any number of times) that add up to \`target\`.

Sequences with a different **order** count as different ("1, 2" and "2, 1" are two answers). The answer fits in a 32-bit integer.`,
  examples: [
    { input: "nums = [1, 2, 3], target = 4", output: "7", explain: "`1+1+1+1`, `1+1+2`, `1+2+1`, `2+1+1`, `2+2`, `1+3`, `3+1`: seven sequences." },
    { input: "nums = [9], target = 3", output: "0", explain: "9 is bigger than 3, so no sequence adds to 3." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 200$", "$1 \\le$ `nums[i]` $\\le 1000$", "All numbers in `nums` are **distinct**.", "$1 \\le$ `target` $\\le 1000$"],
  check(input) { return input.target > 30 || input.nums.length > 5 ? "for the animation use a target up to 30 and at most 5 numbers" : input.nums.some((x) => x < 1) ? "numbers must be positive" : new Set(input.nums).size !== input.nums.length ? "numbers must be distinct" : null; },

  intuition: {
    find: "How many different **ordered** sequences of numbers from `nums` (with repetition) sum to `target`.",
    beginner: "Recursively try every first number: `count(t) = Σ count(t − x)` over the numbers `x ≤ t`, with `count(0) = 1` (the empty sequence).",
    works: "Every sequence has a first number; grouping sequences by that first number partitions all of them, so the sum counts each exactly once.",
    slow: "Each call spawns up to `n` calls, so about $n^{t}$ calls for target $t$. The same smaller targets are counted again and again.",
    repeat: "`count(4)` calls `count(3)`, `count(2)`, `count(1)`; `count(3)` calls `count(2)` again, and so on. `count(2)` is recomputed in many branches.",
    remember: "There are only `target + 1` different questions, `count(0) … count(target)`. Store each answer once in `dp[t]`.",
    observation: "Group the sequences that sum to `t` by their **last** (or first) number `x`: removing it leaves a sequence for `t − x`. Different `x` give different groups, and the order matters, so **add** the counts: `dp[t] = Σ dp[t − x]` over `x ≤ t`, with `dp[0] = 1`. Compare Coin Change: the table is the same, the operation is `+` instead of `min`.",
    leads: "Fill `dp[1..target]` in increasing order. For each `t`, loop over the numbers and add `dp[t − x]` when `x ≤ t`. Return `dp[target]`. $O(\\text{target} \\times n)$ time. (Use `unsigned` so intermediate overflow wraps harmlessly.)",
  },

  flow: [
    "Recurse: `count(t) = Σ count(t − x)` over every number `x ≤ t`.",
    "Grouping by the first number partitions all sequences, so nothing is double counted.",
    "About $n^t$ calls, re-counting the same smaller targets.",
    "Only `target + 1` distinct questions: store `dp[t]`.",
    "Order matters, so sequences ending in different numbers add up: `dp[t] = Σ dp[t − x]`.",
    "Fill a table: $O(\\text{target} \\cdot n)$ time, $O(\\text{target})$ space.",
  ],

  brute: {
    idea: "**Brute force:** `count(t)` returns `1` when `t == 0` (the empty sequence is complete), and otherwise the sum of `count(t − x)` for every `x ≤ t`.",
    why: "Each call makes up to `n` recursive calls, so the recursion tree has up to $n^{t}$ nodes. Only `t + 1` distinct arguments exist, so each is recomputed an exponential number of times.",
    time: "O(n^target)", space: "O(target)",
    measure: { fTex: "\\approx 3^{t}", f: (n) => Math.pow(3, n), ns: [5, 10, 15, 20, 30] },
    cpp: `class Solution {
    int count(vector<int>& nums, int t) {
        if (t == 0) return 1;
        int total = 0;
        for (int x : nums) if (x <= t) total += count(nums, t - x);
        return total;
    }
public:
    int combinationSum4(vector<int>& nums, int target) { return count(nums, target); }
};`,
    js: `function combinationSum4(nums, target) {
  const count = (t) => {
    if (t === 0) return 1;
    let total = 0;
    for (const x of nums) if (x <= t) total += count(t - x);
    return total;
  };
  return count(target);
}`,
  },

  pattern: {
    name: "Dynamic Programming (counting, unbounded)",
    why: "It has the same structure as *Coin Change* (unlimited items, a target value) but the question is *how many ways*. Because the order of the numbers matters, the loops are arranged as *target outside, numbers inside*: for each total, every number is allowed as the last one, so different orders are all counted.",
    recognize: [
      "\"**Number of ways** / sequences / combinations\" that add to a target, with unlimited reuse of items.",
      "Different **orders** are different answers (permutations of a multiset): *target outside, items inside*.",
      "The recursion's argument is the remaining total and sub-totals repeat.",
      "If order did **not** matter you would swap the loops (*Coin Change II*).",
    ],
  },

  optimal: {
    idea: "`dp[t]` = the number of ordered sequences that sum to `t`. The empty sequence gives `dp[0] = 1`. For `t` from `1` to `target`, add `dp[t − x]` for every number `x ≤ t`: each sequence for `t` ends in some `x`, and what remains is a sequence for `t − x`.",
    steps: [
      "Create `dp[0..target]` of zeros; set `dp[0] = 1`.",
      "For `t` from `1` to `target`:",
      "for each `x` in `nums` with `x ≤ t`: `dp[t] += dp[t − x]`.",
      "Return `dp[target]`.",
    ],
    invariant: "**When the loop reaches `t`, every `dp[s]` with `s < t` is the exact number of ordered sequences summing to `s`.**",
    correct: "Take all sequences summing to `t ≥ 1`. Each is non-empty, so it has a unique last number `x ≤ t`; removing it leaves a sequence summing to `t − x`, and conversely appending `x` to any sequence for `t − x` gives a sequence for `t` ending in `x`. So the sequences for `t` ending in `x` are in one-to-one correspondence with those for `t − x`, giving `dp[t − x]` of them. Summing over the distinct values `x` counts each sequence exactly once. `dp[0] = 1` counts the empty sequence, so a number equal to `t` itself contributes 1.",
  },

  cpp: `class Solution {
public:
    int combinationSum4(vector<int>& nums, int target) {
        vector<unsigned> dp(target + 1, 0);               // wraps instead of overflowing //@init
        dp[0] = 1;                                        // the empty sequence //@seed
        for (int t = 1; t <= target; t++)                 //@loop
            for (int x : nums)                            //@coin
                if (x <= t) dp[t] += dp[t - x];           // x is the last number //@add
        return (int)dp[target];                           //@ret
    }
};`,
  js: `function combinationSum4(nums, target) {
  const dp = new Array(target + 1).fill(0);               //@init
  dp[0] = 1;                                              // the empty sequence //@seed
  for (let t = 1; t <= target; t++)                       //@loop
    for (const x of nums)                                 //@coin
      if (x <= t) dp[t] += dp[t - x];                     // x is the last number //@add
  return dp[target];                                      //@ret
}`,

  tests: [
    { name: "Example 1: [1, 2, 3], 4", kind: "normal", input: { nums: [1, 2, 3], target: 4 } },
    { name: "Example 2: [9], 3", kind: "normal", input: { nums: [9], target: 3 } },
    { name: "Order matters: [1, 2], 3", kind: "normal", input: { nums: [1, 2], target: 3 } },
    { name: "Unreachable target", kind: "edge", input: { nums: [2, 4], target: 7 }, why: "Every sum of 2s and 4s is even, so no sequence reaches 7: the answer is `0`. Odd cells stay at 0 because no `dp[t − x]` is non-zero." },
    { name: "Target equals one number", kind: "edge", input: { nums: [5], target: 5 }, why: "`dp[5] = dp[0] = 1`: the base case `dp[0] = 1` makes a single number count as one sequence. If `dp[0]` were `0`, every answer would be 0." },
    { name: "Numbers larger than the target", kind: "edge", input: { nums: [10, 20], target: 5 }, why: "No number fits, so every `dp[t]` stays `0`. The guard `x <= t` prevents reading `dp[negative]`." },
    { name: "Target 1", kind: "corner", input: { nums: [1, 2, 3], target: 1 }, why: "Only the sequence `[1]`: `dp[1] = dp[0] = 1`. It is the smallest target and tests the first loop iteration." },
    { name: "Many orderings", kind: "corner", input: { nums: [1, 2, 3], target: 8 }, why: "`dp[8] = 81`: the counts grow like a *tribonacci* sequence. Order matters, so `3 + 3 + 2`, `3 + 2 + 3` and `2 + 3 + 3` all count: this is why the answer is so much larger than the number of combinations." },
  ],

  trace(input, T) {
    const { nums, target } = input;
    const dp = Array.from({ length: target + 1 }, () => null);
    dp[0] = 1;
    let whyAdd = false, whyOrder = false;
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i <= target; i++) if (dp[i] !== null) hl[i] = "ok";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = "cur";
      if (o.answer) hl[target] = "hit";
      return { arrs: [{ label: "allowed numbers (any number of times)", arr: nums, hl: o.num != null ? { [o.num]: "cur" } : {}, cw: 44 }], dp: dp.slice(), hl, cur: cur ?? null, deps: deps || [], depLabels: deps ? deps.map(() => "") : [], formula: o.formula, label: "dp[t] = number of ordered sequences that sum to t" };
    };
    T.step("init", { vars: { target }, state: S(null), phase: "Set up the table", say: "`dp[t]` will count the **ordered sequences** of the allowed numbers that add up to `t`. We fill it from `t = 1` up to the target.", op: `dp = [?, …, ?]  (size ${target + 1})`, act: "START" });
    T.step("seed", { vars: { "dp[0]": 1 }, state: S(0, null, { formula: "dp[0] = 1   (the empty sequence adds up to 0)" }), say: "Base case: there is exactly **one** way to make the total 0: choose nothing. This `1` is what makes a number equal to `t` count as one sequence.", op: "dp[0] = 1", act: "BASE_CASE" });
    T.phase("Fill totals from 1 up to the target");
    for (let t = 1; t <= target; t++) {
      dp[t] = 0;
      const usable = nums.map((x, k) => [x, k]).filter(([x]) => x <= t);
      T.step("loop", { vars: { t, "numbers ≤ t": usable.map(([x]) => x).join(", ") || "none" }, state: S(t, usable.map(([x]) => t - x), { formula: `dp[${t}] = Σ dp[${t} − x]   over x ∈ {${usable.map(([x]) => x).join(", ")}}   (so far: 0)` }), say: usable.length ? `Computing **dp[${t}]**. A sequence for ${t} ends with one of ${usable.map(([x]) => x).join(", ")}; before that last number it must add to ${usable.map(([x]) => t - x).join(", ")} respectively.` : `Computing **dp[${t}]**: every allowed number is bigger than ${t}, so no sequence can end here: **0**.`, op: usable.length ? `dp[${t}] = Σ_x dp[${t} − x]` : `no x ≤ ${t}  ⇒  dp[${t}] = 0`, act: usable.length ? "SUM_OVER_LAST_NUMBER" : "NOTHING_FITS" });
      for (const [x, k] of usable) {
        const add = dp[t - x], old = dp[t];
        dp[t] += add;
        T.step("add", { vars: { t, x, [`dp[${t - x}]`]: add, [`dp[${t}]`]: dp[t] }, state: S(t, [t - x], { num: k, formula: `last number ${x}:  dp[${t}] = ${old} + dp[${t - x}] = ${old} + ${add} = ${dp[t]}` }), say: `If the last number is **${x}**, the part before it adds to ${t - x}, and there are **${add}** ordered sequences for ${t - x}. Add them: \`dp[${t}] = ${old} + ${add} = ${dp[t]}\`.`, op: `dp[${t}] += dp[${t - x}]  →  ${dp[t]}`, act: "ADD",
          why: whyAdd ? null : { title: "Why ADD (not min or max)?", text: "We are counting. Sequences that end in different numbers are different sequences, and every sequence ends in exactly one number, so the groups do not overlap and together cover everything: the counts simply add." } });
        whyAdd = true;
      }
      if (t === 3 && nums.length > 1 && nums.some((x) => x < 3) && !whyOrder) {
        T.step("loop", { vars: { t }, state: S(t, null, { formula: `dp[${t}] = ${dp[t]}` }), say: `Notice that \`1 + 2\` and \`2 + 1\` are counted **separately**: with *totals outside, numbers inside*, every number is tried as the last one at every total, so each ordering is counted.`, op: `order matters: [1,2] ≠ [2,1]`, act: "ORDER_MATTERS",
          why: { title: "Why does the loop order matter?", text: "Having the totals in the outer loop lets every number be the LAST number for every total, which counts all orderings. If the numbers were in the outer loop, each number would be allowed only 'before' the next one, counting combinations instead (Coin Change II)." } });
        whyOrder = true;
      }
    }
    T.step("ret", { vars: { "dp[target]": dp[target] }, state: S(target, null, { answer: true, formula: `answer = dp[${target}] = ${dp[target]}` }), say: `The table is complete: there are **${dp[target]}** ordered sequences that add up to ${target}.`, op: `return dp[${target}] = ${dp[target]}`, act: "DONE" });
    T.result(dp[target]);
  },
  fuzz(rnd) {
    const k = 1 + Math.floor(rnd() * 3), set = new Set();
    while (set.size < k) set.add(1 + Math.floor(rnd() * 5));
    return { nums: [...set], target: 1 + Math.floor(rnd() * 10) };
  },
  gen(n) { return { nums: [1, 2, 3], target: n }; },

  complexity: {
    time: {
      tex: "O(T \\cdot n)", title: "T states, each loops over n numbers", short: "T = target, n = how many numbers",
      derive: [
        "\\#\\text{states} = T + 1 || one cell per total from 0 to T",
        "\\text{work per state} \\le n \\cdot c || one comparison and one addition per number",
        "T_{\\text{total}} = c_0 + \\sum_{t=1}^{T} n\\,c = c_0 + c\\,n\\,T || sum over the $T$ totals",
        "!T_{\\text{total}} = O(T \\cdot n) || versus $n^{T}$ for the plain recursion",
      ],
      where: "Time is *(number of states) × (work per state)*. The measured table fixes `nums = [1, 2, 3]` and grows the target, so the step count is linear in the target.",
    },
    space: {
      tex: "O(T)", title: "the table of T + 1 counts", short: "one cell per total",
      derive: [
        "S = (T + 1) \\cdot s_{\\text{int}} || the table `dp[0..T]`",
        "!S = O(T) || any smaller total may be needed again",
      ],
      where: "Because the numbers can be large, `dp[t]` can depend on cells far back, so the full table is kept.",
    },
    limit: "The count itself can be exponentially large (tribonacci growth), which is why 32-bit overflow matters and why the problem promises that the *answer* fits. Pseudo-polynomial time in the target is the standard best.",
    measure: { label: "T = target (with numbers {1, 2, 3})", fTex: "T", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear in the target for a fixed number set" },
  },

  mistakes: [
    { title: "Swapping the two loops", what: "Numbers outside, totals inside.", why: "It is the standard Coin Change II / \"unbounded knapsack\" loop order.", breaks: "That order counts **combinations** (order ignored): for `[1, 2, 3]` and target 4 it gives 4, not 7.", avoid: "Here order matters: **totals outside, numbers inside**." },
    { title: "Forgetting `dp[0] = 1`", what: "Leaving all cells at 0.", why: "\"No ways\" feels like a neutral start.", breaks: "Every cell stays 0: a number equal to `t` has no base to build on.", avoid: "`dp[0] = 1`: the empty sequence is one valid way to make 0." },
    { title: "Signed overflow in intermediate sums", what: "Using `int dp` with large targets.", why: "The final answer fits in 32 bits, so the problem seems safe.", breaks: "Intermediate cells (for totals that are never needed) may exceed `INT_MAX`; signed overflow is undefined behaviour in C++.", avoid: "Use `unsigned` (well-defined wrap-around) or `long long`, and cast the answer." },
    { title: "Reading `dp[t − x]` for `x > t`", what: "Omitting the guard.", why: "Forgetting that numbers can exceed the total.", breaks: "Negative index: undefined behaviour in C++.", avoid: "`if (x <= t)`." },
    { title: "Using plain recursion", what: "The direct recursive formula with no memo.", why: "It mirrors the statement.", breaks: "Exponential: time-limit exceeded for targets around 40.", avoid: "Memoise it or build the table bottom-up." },
  ],

  followUps: [
    {
      q: "Count **combinations** instead (order does not matter): *Coin Change II*.",
      a: "Swap the loops: **numbers outside, totals inside**: `for x in nums: for t in x..target: dp[t] += dp[t − x]`. Now each number is processed in one block, so a combination is counted only in the order of the outer loop. For `[1, 2, 3]` and 4 this gives 4 combinations (`1111, 112, 22, 13`) instead of 7 sequences.",
      cpp: `int combinations(vector<int>& nums, int target) {
    vector<unsigned> dp(target + 1, 0);
    dp[0] = 1;
    for (int x : nums)
        for (int t = x; t <= target; t++) dp[t] += dp[t - x];
    return (int)dp[target];
}`,
      js: `function combinations(nums, target) {
  const dp = new Array(target + 1).fill(0);
  dp[0] = 1;
  for (const x of nums)
    for (let t = x; t <= target; t++) dp[t] += dp[t - x];
  return dp[target];
}`,
      time: "O(T·n)", space: "O(T)",
    },
    {
      q: "What if the array may contain **negative numbers**?",
      a: "Then sequences can be arbitrarily long (e.g. `+1, −1, +1, …`), so the number of sequences summing to `target` may be **infinite**. To get a sensible problem you must limit the length of the sequences, for example to at most `L` numbers, and add that as a second DP dimension: `dp[len][t]`. That is the question to ask back in an interview.",
      time: "O(L·T·n)", space: "O(L·T)",
    },
    {
      q: "Print all the sequences, not just their number.",
      a: "Now the output can be exponentially large, so use **backtracking** (DFS that appends numbers to a path and records it when the total hits `target`). The DP count is still useful to know in advance how many results will be produced. This is the classic *Combination Sum* family with backtracking.",
      time: "O(output size)", space: "O(target)",
    },
  ],

  related: [
    { id: "climbing-stairs", why: "The special case `nums = [1, 2]`: the answer is a Fibonacci number." },
    { id: "coin-change", why: "The same table with `min(… + 1)` instead of `+`." },
    { id: "decode-ways", why: "A counting DP over positions where the last piece is 1 or 2 characters long." },
    { id: "unique-paths", why: "Another counting DP: add the counts of the cells you could have come from." },
  ],
  patternNote: "**Counting DP** adds the counts of the independent ways to make the *last* choice. The two loop orders encode two different questions: totals outside = *ordered* sequences; items outside = *unordered* combinations. Know both, and know why they differ.",
  takeaways: [
    "`dp[t] = Σ dp[t − x]` over numbers `x ≤ t`, with `dp[0] = 1`: add the counts per last number.",
    "**Totals outside, numbers inside** counts ordered sequences; swapping the loops counts combinations.",
    "Use `unsigned`/`long long` for intermediate sums; guard `x <= t`.",
    "Time $O(T \\cdot n)$, space $O(T)$. The plain recursion is $n^{T}$.",
    "Climbing Stairs is the special case `nums = [1, 2]`.",
  ],
});
