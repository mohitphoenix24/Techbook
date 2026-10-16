SHEETS.define({
  id: "house-robber",
  viz: "dp",
  io: { fn: "rob", params: [["nums", "int[]"]], ret: "int" },

  statement: `You are planning to rob houses along a street. \`nums[i]\` is the amount of money in house \`i\`. Adjacent houses have connected security systems: if you rob **two adjacent houses**, the police are alerted.

Return the **maximum amount** you can rob without robbing two adjacent houses.`,
  examples: [
    { input: "nums = [1, 2, 3, 1]", output: "4", explain: "Rob house 0 (1) and house 2 (3): total 4." },
    { input: "nums = [2, 7, 9, 3, 1]", output: "12", explain: "Rob houses 0, 2 and 4: `2 + 9 + 1 = 12`." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 100$", "$0 \\le$ `nums[i]` $\\le 400$"],

  intuition: {
    find: "The largest total of a set of houses in which **no two are neighbours**.",
    beginner: "Try every house: either rob it (and then you must skip the next one) or skip it. Recursively compute the best for the rest of the street and take the better option.",
    works: "Every valid set of houses is a sequence of rob/skip decisions, and the recursion explores all of them, so the best is found.",
    slow: "Each house creates two branches: about $2^n$ (more precisely Fibonacci-many) calls. For 100 houses that is astronomically many.",
    repeat: "Different sequences of decisions reach the **same house with the same situation**: *\"the best I can do from house `k` onwards\"* is recomputed again and again.",
    remember: "Let `dp[i]` be the best total using only houses `0..i`. There are only `n` of those answers, and each depends only on shorter prefixes, so store them.",
    observation: "For house `i` there are only two choices. **Skip** it: the best is `dp[i − 1]`. **Rob** it: you cannot have robbed house `i − 1`, so the best is `nums[i] + dp[i − 2]`. The answer for the prefix is the larger of the two: `dp[i] = max(dp[i − 1], nums[i] + dp[i − 2])`.",
    leads: "Fill a table (or just two running variables): `dp[0] = nums[0]`, `dp[1] = max(nums[0], nums[1])`, then the recurrence for `i ≥ 2`. The answer is `dp[n − 1]`. $O(n)$ time.",
  },

  flow: [
    "Recurse: for each house either rob it (skip the next) or skip it.",
    "Every valid choice of houses is one path of decisions, so the best is found.",
    "About $2^n$ branches that keep re-solving the same suffixes.",
    "Only the **prefix** matters: `dp[i]` = best using houses `0..i`.",
    "Skip house `i` → `dp[i−1]`; rob it → `nums[i] + dp[i−2]`; take the larger.",
    "Fill `dp` left to right: $O(n)$ time, $O(n)$ space (reducible to $O(1)$).",
  ],

  brute: {
    idea: "**Brute force:** `best(i)` = the most you can rob from houses `i..n−1`. Either skip house `i` (`best(i + 1)`) or rob it and jump over the next one (`nums[i] + best(i + 2)`). Return the maximum of the two; `best(i) = 0` once `i ≥ n`.",
    why: "Each call makes two more calls, so the call tree is exponential (about $\\varphi^n$ calls), and the same `best(k)` is evaluated in many different branches. Only `n` distinct values exist, but the recursion computes each one over and over.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "\\approx \\varphi^n", f: (n) => Math.pow(1.618, n), ns: [10, 20, 30, 40, 100] },
    cpp: `class Solution {
    int best(vector<int>& a, int i) {
        if (i >= (int)a.size()) return 0;
        return max(best(a, i + 1), a[i] + best(a, i + 2));
    }
public:
    int rob(vector<int>& nums) { return best(nums, 0); }
};`,
    js: `function rob(nums) {
  const best = (i) => (i >= nums.length ? 0 : Math.max(best(i + 1), nums[i] + best(i + 2)));
  return best(0);
}`,
  },

  pattern: {
    name: "Dynamic Programming (1D, take or skip)",
    why: "At each element you make a binary choice (take or skip) and the consequences of the choice only reach a few steps ahead. That is the signature of 1D DP: a state indexed by *how far you have got*, and a recurrence combining the two options with `max` (or `min`, or `+` when counting).",
    recognize: [
      "A sequence where you **choose a subset** under a local restriction (no two adjacent, at least `k` apart).",
      "The question asks for the **best total** (max/min), and a greedy rule seems tempting but fails.",
      "The brute force recursion has two branches per element and repeats suffix problems.",
      "The state is *just the index*, and the recurrence looks only 1–2 steps back.",
    ],
  },

  optimal: {
    idea: "Let `dp[i]` be the maximum money from houses `0..i`. For house `i`, either skip it (keep `dp[i − 1]`) or rob it and add to the best of houses `0..i−2` (`nums[i] + dp[i − 2]`). Take the maximum. Seed with `dp[0] = nums[0]` and `dp[1] = max(nums[0], nums[1])`.",
    steps: [
      "If there is only one house, return `nums[0]`.",
      "Create `dp` of size `n`. Set `dp[0] = nums[0]` and `dp[1] = max(nums[0], nums[1])`.",
      "For `i` from `2` to `n − 1`: `dp[i] = max(dp[i − 1], dp[i − 2] + nums[i])`.",
      "Return `dp[n − 1]`.",
    ],
    invariant: "**`dp[i]` is the maximum total over all valid selections from houses `0..i`.**",
    correct: "Consider an optimal selection among houses `0..i`. If it does not contain house `i`, it is a valid selection of `0..i−1`, and an optimal one has value `dp[i − 1]`. If it contains house `i`, it cannot contain `i − 1`, so the rest is a valid selection of `0..i−2`, worth at most `dp[i − 2]`, and combining with `nums[i]` achieves exactly that. The better of the two cases is optimal, which is the recurrence. The base cases are the best of one house, and of two adjacent houses (only one can be robbed).",
  },

  cpp: `class Solution {
public:
    int rob(vector<int>& nums) {
        int n = nums.size();
        if (n == 1) return nums[0];                              // nothing to compare //@single
        vector<int> dp(n);                                       // dp[i] = best for houses 0..i //@init
        dp[0] = nums[0]; dp[1] = max(nums[0], nums[1]);          //@seed
        for (int i = 2; i < n; i++)                              //@loop
            dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]);         // skip or rob //@fill
        return dp[n - 1];                                        //@ret
    }
};`,
  js: `function rob(nums) {
  const n = nums.length;
  if (n === 1) return nums[0];                                   // nothing to compare //@single
  const dp = new Array(n).fill(0);                               // dp[i] = best for houses 0..i //@init
  dp[0] = nums[0]; dp[1] = Math.max(nums[0], nums[1]);           //@seed
  for (let i = 2; i < n; i++)                                    //@loop
    dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i]);            // skip or rob //@fill
  return dp[n - 1];                                              //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [1, 2, 3, 1] } },
    { name: "Example 2", kind: "normal", input: { nums: [2, 7, 9, 3, 1] } },
    { name: "Decreasing money", kind: "normal", input: { nums: [5, 4, 3, 2, 1] } },
    { name: "Greedy alternate-sums fails", kind: "edge", input: { nums: [2, 1, 1, 2] }, why: "Robbing odd positions gives `1 + 2 = 3` and even positions `2 + 1 = 3`, but the best is houses 0 **and 3**: `2 + 2 = 4` (not adjacent, but not alternating either). A rule like \"rob every other house\" is wrong; the DP considers skipping two houses in a row." },
    { name: "All houses equal", kind: "edge", input: { nums: [3, 3, 3, 3, 3] }, why: "With equal values the best is to take as many non-adjacent houses as possible: houses 0, 2 and 4 → 9. It checks that ties in `max` are harmless." },
    { name: "Zeros", kind: "edge", input: { nums: [0, 0, 0] }, why: "No money anywhere, so the answer is `0`. Nothing may subtract or assume positive values." },
    { name: "A single house", kind: "corner", input: { nums: [5] }, why: "The seed `dp[1] = max(nums[0], nums[1])` would read `nums[1]`, which does not exist. The explicit `n == 1` guard is needed." },
    { name: "Two houses", kind: "corner", input: { nums: [2, 1] }, why: "You may rob only one of two adjacent houses, so the answer is `max(2, 1) = 2`. This is exactly `dp[1]`, with no loop iterations." },
    { name: "Big houses at both ends", kind: "corner", input: { nums: [100, 1, 1, 100] }, why: "The two 100s are far enough apart, so the answer is 200. The DP finds it by carrying `dp[1] = 100` forward until the last house adds 100 on top of `dp[1]`." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    const dp = Array.from({ length: n }, () => null);
    let whyMax = false, whyBase = false;
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i < n; i++) if (dp[i] !== null) hl[i] = "ok";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = "cur";
      if (o.answer) hl[n - 1] = "hit";
      return { arrs: [{ label: "money in each house", arr: nums, hl: cur != null ? { [cur]: "cur" } : {} }], dp: dp.slice(), hl, cur: cur ?? null, deps: deps || [], depLabels: ["skip this house", "rob this house"], formula: o.formula, label: "dp[i] = best total using houses 0..i" };
    };
    if (n === 1) {
      dp[0] = nums[0];
      T.step("single", { vars: { n }, state: S(0, null, { answer: true, formula: `only one house: take it = ${nums[0]}` }), phase: "Base case", say: "There is only one house, so there is nothing to choose between: rob it.", op: `n == 1  →  return ${nums[0]}`, act: "SINGLE" });
      T.result(nums[0]);
      return;
    }
    T.step("init", { vars: { n }, state: S(null), phase: "Set up", say: `\`dp[i]\` will hold the **best total using only houses 0..i**. All ${n} cells are still unknown.`, op: `dp = vector(${n})`, act: "START" });
    dp[0] = nums[0]; dp[1] = Math.max(nums[0], nums[1]);
    T.step("seed", { vars: { "dp[0]": dp[0], "dp[1]": dp[1] }, state: S(1, [0], { formula: `dp[0] = ${nums[0]}   dp[1] = max(${nums[0]}, ${nums[1]}) = ${dp[1]}` }), say: `Base cases: with one house the best is **${nums[0]}**. With two adjacent houses you may rob only one, so \`dp[1] = max(${nums[0]}, ${nums[1]}) = ${dp[1]}\`.`, op: `dp[0] = ${nums[0]},  dp[1] = max(${nums[0]}, ${nums[1]}) = ${dp[1]}`, act: "BASE_CASES",
      why: { title: "Why max for dp[1]?", text: "Houses 0 and 1 are neighbours, so robbing both is forbidden. The best with two houses is simply the larger of the two." } });
    T.phase("Fill left to right: skip or rob");
    for (let i = 2; i < n; i++) {
      const skip = dp[i - 1], rob = dp[i - 2] + nums[i];
      T.step("loop", { vars: { i, "nums[i]": nums[i], "dp[i−1]": skip, "dp[i−2]": dp[i - 2] }, state: S(i, [i - 1, i - 2], { formula: `dp[${i}] = max(dp[${i - 1}], dp[${i - 2}] + nums[${i}]) = max(${skip}, ${dp[i - 2]} + ${nums[i]}) = ?` }), say: `Two choices for house ${i} (money **${nums[i]}**): **skip** it and keep \`dp[${i - 1}] = ${skip}\`, or **rob** it and add it to \`dp[${i - 2}] = ${dp[i - 2]}\` (house ${i - 1} must stay untouched).`, op: `skip = ${skip},   rob = ${dp[i - 2]} + ${nums[i]} = ${rob}`, act: "TWO_CHOICES" });
      dp[i] = Math.max(skip, rob);
      T.step("fill", { vars: { i, skip, rob, "dp[i]": dp[i] }, state: S(i, [i - 1, i - 2], { formula: `dp[${i}] = max(${skip}, ${rob}) = ${dp[i]}` }), say: `${rob > skip ? `Robbing is better: ${rob} > ${skip}.` : rob === skip ? `Both give ${skip}: a tie.` : `Skipping is better: ${skip} > ${rob}.`} \`dp[${i}] = ${dp[i]}\`.`, op: `dp[${i}] = max(${skip}, ${rob}) = ${dp[i]}`, act: rob > skip ? "ROB" : "SKIP",
        why: whyMax ? null : { title: "Why dp[i−2] and not dp[i−1] when robbing?", text: `If we rob house ${i}, house ${i - 1} must be skipped, so the earlier money can only come from houses 0..${i - 2}. Using \`dp[${i - 1}]\` could secretly include house ${i - 1} and put two neighbours in the plan.` } });
      whyMax = true;
    }
    T.step("ret", { vars: { "dp[n−1]": dp[n - 1] }, state: S(n - 1, null, { answer: true, formula: `answer = dp[${n - 1}] = ${dp[n - 1]}` }), say: `The last cell holds the best total over all the houses: **${dp[n - 1]}**.`, op: `return dp[${n - 1}] = ${dp[n - 1]}`, act: "DONE" });
    T.result(dp[n - 1]);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 12); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 20)) }; },
  gen(n) { return { nums: Array.from({ length: Math.max(n, 2) }, (_, i) => (i * 7) % 10 + 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "n − 2 cells, constant work each", short: "one max of two sums per house",
      derive: [
        "\\#\\text{states} = n - 2 \\;(\\text{cells } 2 \\dots n-1) || cells 0 and 1 are base cases",
        "T(n) = c_0 + \\sum_{i=2}^{n-1} c || each cell does two reads, one addition and one max: $O(1)$",
        "T(n) = c_0 + (n-2)\\,c || the sum has $n - 2$ equal terms",
        "!T(n) = O(n) || versus $\\Theta(\\varphi^n)$ calls for the plain recursion",
      ],
      where: "DP time is *(number of states) × (work per state)* = $n \\times O(1)$. The recursion visited the same states exponentially often.",
    },
    space: {
      tex: "O(n)", title: "a table of n numbers", short: "reducible to O(1): only the last two cells are ever read",
      derive: [
        "S(n) = n \\cdot s_{\\text{int}} || the table `dp[0..n−1]`",
        "!S(n) = O(n) || and with `prev2`, `prev1` only: $O(1)$ (first follow-up)",
      ],
      where: "Each cell reads only the previous two, so two variables are enough (see the follow-up). The table version is easier to explain and to debug.",
    },
    limit: "Every house can change the answer, so $\\Omega(n)$ time is needed; $O(1)$ extra space is achievable, so both bounds are tight.",
    measure: { label: "n = number of houses", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "A greedy rule: rob the biggest, or alternate houses", what: "Taking the largest house and its non-neighbours, or comparing the sum of odd vs even positions.", why: "It feels natural for \"no two adjacent\".", breaks: "`[2, 1, 1, 2]` needs houses 0 and 3 (4), but odd/even sums give 3. `[2, 7, 9, 3, 1]` shows biggest-first can also lose.", avoid: "Local rules fail because skipping *two* houses in a row can be optimal. Use the DP, which tries both options everywhere." },
    { title: "Using `dp[i − 1] + nums[i]` when robbing", what: "`dp[i] = max(dp[i−1], dp[i−1] + nums[i])`.", why: "Treating `dp[i − 1]` as \"everything so far\".", breaks: "`dp[i − 1]` may include house `i − 1`, so adding house `i` robs two neighbours.", avoid: "When robbing house `i`, build on `dp[i − 2]`." },
    { title: "Reading `nums[1]` for a one-house street", what: "Seeding `dp[1]` without checking `n == 1`.", why: "The examples have several houses.", breaks: "Out-of-bounds read: undefined behaviour in C++, `undefined`/`NaN` in JS.", avoid: "Handle `n == 1` before seeding the table." },
    { title: "Initialising `dp[1]` as `nums[1]`", what: "`dp[1] = nums[1]`.", why: "Treating index 1 like a fresh start.", breaks: "If `nums[0] > nums[1]`, the best for the first two houses is `nums[0]`; you lose it.", avoid: "`dp[1] = max(nums[0], nums[1])`." },
    { title: "Returning the maximum of the whole table instead of the last cell", what: "`return *max_element(dp…)`.", why: "Unsure which cell holds the answer.", breaks: "Not wrong here (dp is non-decreasing), but it signals confusion and fails if `dp` were defined as \"ending exactly at `i`\".", avoid: "`dp[i]` already means *best among houses 0..i*, so the last cell is the answer." },
  ],

  followUps: [
    {
      q: "Reduce the space to $O(1)$.",
      a: "Each `dp[i]` uses only `dp[i − 1]` and `dp[i − 2]`. Keep two variables, `prev2` and `prev1`, and slide them: `cur = max(prev1, prev2 + x)`, then `prev2 = prev1`, `prev1 = cur`. Starting both at `0` also removes the special cases for the first two houses.",
      cpp: `int robO1(vector<int>& nums) {
    int prev2 = 0, prev1 = 0;
    for (int x : nums) {
        int cur = max(prev1, prev2 + x);
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}`,
      js: `function robO1(nums) {
  let prev2 = 0, prev1 = 0;
  for (const x of nums) {
    const cur = Math.max(prev1, prev2 + x);
    prev2 = prev1;
    prev1 = cur;
  }
  return prev1;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "The houses form a **circle** (the first and last are adjacent). What changes?",
      a: "That is *House Robber II*: you cannot rob both house 0 and house `n − 1`. So the answer is the better of two linear problems: houses `0..n−2` (never rob the last) and houses `1..n−1` (never rob the first). Special case: with one house, return it.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "The houses form a **binary tree** (robbing a node alerts its parent and children). How would you solve it?",
      a: "Tree DP: for each node compute two values, `(robThis, skipThis)`. `robThis = node.val + skip(left) + skip(right)`; `skipThis = max(rob(left), skip(left)) + max(rob(right), skip(right))`. One post-order traversal returns the pair, $O(n)$ time and $O(h)$ stack.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Return **which houses** to rob, not just the total.",
      a: "Keep the table `dp` and walk it **backwards**: starting at `i = n − 1`, if `dp[i] == dp[i − 1]` the house was skipped (`i--`); otherwise it was robbed: record it and jump to `i − 2`. This reconstruction is standard for DP problems and costs $O(n)$ extra.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "house-robber-ii", why: "The same street arranged in a circle: solve two linear problems." },
    { id: "climbing-stairs", why: "Same two-previous-cells recurrence, with `+` instead of `max`." },
    { id: "maximum-subarray", why: "Another one-dimensional DP where the state at `i` depends on the state at `i − 1`." },
    { id: "decode-ways", why: "Another sequence DP looking one and two steps back." },
  ],
  patternNote: "**The 1D \"take or skip\" DP** has a state `dp[i]` = the best answer for the first `i + 1` elements, and a recurrence that compares *not using element `i`* with *using it, and falling back to the last state it is compatible with*. The restriction (no neighbours) decides how far back to look.",
  takeaways: [
    "`dp[i]` = best total from houses `0..i`; `dp[i] = max(dp[i−1], dp[i−2] + nums[i])` (skip or rob).",
    "When robbing house `i`, build on `dp[i − 2]`, never `dp[i − 1]`.",
    "Seed `dp[0] = nums[0]`, `dp[1] = max(nums[0], nums[1])`, and guard `n == 1`.",
    "Time $O(n)$, space $O(n)$ → $O(1)$ with two variables. Greedy alternate-house rules are wrong.",
    "The same skeleton solves the circular and the tree versions with small changes.",
  ],
});
