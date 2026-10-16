SHEETS.define({
  id: "climbing-stairs",
  viz: "dp",
  io: { fn: "climbStairs", params: [["n", "int"]], ret: "int", labels: { n: "n (number of stairs)" } },

  statement: `You are climbing a staircase with \`n\` steps. Each time you can climb **1** or **2** steps.

In how many **distinct ways** can you climb to the top? (Climbing 1 then 2 is a different way from climbing 2 then 1.)`,
  examples: [
    { input: "n = 2", output: "2", explain: "Two ways: `1 + 1` and `2`." },
    { input: "n = 3", output: "3", explain: "Three ways: `1 + 1 + 1`, `1 + 2` and `2 + 1`." },
  ],
  constraints: ["$1 \\le n \\le 45$ (so that the answer fits in a 32-bit `int`)"],
  check(input) { return input.n < 1 || input.n > 45 ? "n must be between 1 and 45 (larger answers overflow a 32-bit int)" : null; },

  intuition: {
    find: "The **number of different sequences** of 1s and 2s that add up to exactly `n`. We count the sequences; we do not list them.",
    beginner: "Think about the **last step** you take. You either arrive from stair `n − 1` with a 1-step, or from stair `n − 2` with a 2-step. So `ways(n) = ways(n − 1) + ways(n − 2)`. Write that as a recursive function.",
    works: "Every way of reaching stair `n` ends with a 1-step or a 2-step, and those two groups share no sequence, so adding the counts is exactly right. The base cases are `ways(1) = 1` and `ways(2) = 2`.",
    slow: "Each call makes two calls, so the number of calls grows like Fibonacci: about $1.618^n$. For `n = 45` that is **over 3 billion calls** to compute a number below 2 billion.",
    repeat: "The same sub-questions are asked again and again. `ways(5)` asks for `ways(4)` and `ways(3)`; `ways(4)` asks for `ways(3)` **again**, and so on. `ways(3)` alone is recomputed many times, each time with its entire sub-tree.",
    remember: "Write each answer down the first time we compute it. There are only `n` distinct questions (`ways(1)` … `ways(n)`), so a table of `n` numbers is enough to answer every repeat in $O(1)$.",
    observation: "Two facts: the answer for `i` depends **only on smaller stairs** (`i − 1` and `i − 2`), and there are only `n` different subproblems. So we can fill a table **from the bottom up**: stair 1, stair 2, then each next one from the two before it.",
    leads: "`dp[1] = 1`, `dp[2] = 2`, and for `i = 3 … n`: `dp[i] = dp[i − 1] + dp[i − 2]`. Return `dp[n]`. Each cell is computed once in $O(1)$, so the whole thing takes $O(n)$ time.",
  },

  flow: [
    "Recurse: `ways(n) = ways(n − 1) + ways(n − 2)`.",
    "Every route ends in a 1-step or a 2-step, and the two groups never overlap.",
    "Each call spawns two more: about $1.618^n$ calls, and the same `ways(k)` is recomputed over and over.",
    "Only **n distinct** sub-questions exist, and each depends only on two smaller ones.",
    "Store each answer once; fill a table from the bottom up.",
    "`dp[i] = dp[i − 1] + dp[i − 2]`: $O(n)$ time (and $O(1)$ space with two variables).",
  ],

  brute: {
    idea: "**Brute force (plain recursion):** `ways(n)` returns `n` for `n ≤ 2`, and otherwise `ways(n − 1) + ways(n − 2)`. It is a faithful translation of *\"the last step is 1 or 2\"*.",
    why: "The calls form a binary tree that is nearly as deep as `n`, and the **same arguments appear in many branches**. Let $C(n)$ be the number of calls: $C(n) = C(n-1) + C(n-2) + 1$, which grows like the Fibonacci numbers, $C(n) = \\Theta(\\varphi^n)$ with $\\varphi \\approx 1.618$. For $n = 45$ that is about 3 billion calls.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "2F_n - 1 \\approx \\varphi^n", f: (n) => { let a = 1, b = 1; for (let i = 3; i <= n; i++) [a, b] = [b, a + b]; return 2 * b - 1; }, ns: [10, 20, 30, 40, 45] },
    cpp: `class Solution {
public:
    int climbStairs(int n) {
        if (n <= 2) return n;
        return climbStairs(n - 1) + climbStairs(n - 2);
    }
};`,
    js: `function climbStairs(n) {
  if (n <= 2) return n;
  return climbStairs(n - 1) + climbStairs(n - 2);
}`,
  },

  pattern: {
    name: "Dynamic Programming (1D)",
    why: "Dynamic programming applies when a problem has **optimal substructure** (the answer for `n` is built from answers for smaller sizes) and **overlapping subproblems** (the same smaller answers are needed many times). Here `ways(n)` is the sum of two smaller `ways`, and plain recursion recomputes the same ones exponentially often. Storing them turns the exponential tree into a straight line.",
    recognize: [
      "You are asked to **count the ways**, or find a min/max, to reach a target by a sequence of choices.",
      "The answer for size `n` can be written using the answers for **smaller sizes** (a recurrence).",
      "A natural recursion exists but it **recomputes the same arguments** (draw the call tree and look for repeated nodes).",
      "The number of *distinct* subproblems is small (here `n`), even though the number of *paths* is huge.",
    ],
  },

  optimal: {
    idea: "Define `dp[i]` as the number of distinct ways to reach stair `i`. A way to reach stair `i` ends with a 1-step from `i − 1` or a 2-step from `i − 2`, so `dp[i] = dp[i − 1] + dp[i − 2]`. The base cases are `dp[1] = 1` and `dp[2] = 2`. Fill the table from small to large; the answer is `dp[n]`.",
    steps: [
      "If `n ≤ 2`, return `n` (one way to reach stair 1; two ways, `1+1` and `2`, to reach stair 2).",
      "Create a table `dp[0..n]` and set the base cases `dp[1] = 1`, `dp[2] = 2`.",
      "For `i` from `3` to `n`: set `dp[i] = dp[i − 1] + dp[i − 2]`.",
      "Return `dp[n]`.",
    ],
    invariant: "**Before computing `dp[i]`, every entry `dp[1..i−1]` already holds the exact number of ways to reach that stair.** So the two values we read are final, and each cell is computed once.",
    correct: "By induction on `i`. *Base:* `dp[1] = 1` (only a 1-step) and `dp[2] = 2` (`1+1`, `2`). *Step:* consider all ways to reach stair `i ≥ 3`. Split them by their **last step**: those ending with a 1-step are exactly the ways to reach `i − 1` followed by that step (`dp[i − 1]` of them), and those ending with a 2-step are exactly the ways to reach `i − 2` followed by a 2-step (`dp[i − 2]` of them). The two groups are disjoint and together contain every way, so `dp[i] = dp[i − 1] + dp[i − 2]`.",
  },

  cpp: `class Solution {
public:
    int climbStairs(int n) {
        if (n <= 2) return n;                    // stairs 1 and 2 are known //@base
        vector<int> dp(n + 1);                   // dp[i] = ways to reach stair i //@init
        dp[1] = 1; dp[2] = 2;                    // base cases //@seed
        for (int i = 3; i <= n; i++)             //@loop
            dp[i] = dp[i - 1] + dp[i - 2];       // last step was 1 or 2 //@fill
        return dp[n];                            //@ret
    }
};`,
  js: `function climbStairs(n) {
  if (n <= 2) return n;                          // stairs 1 and 2 are known //@base
  const dp = new Array(n + 1).fill(0);           // dp[i] = ways to reach stair i //@init
  dp[1] = 1; dp[2] = 2;                          // base cases //@seed
  for (let i = 3; i <= n; i++)                   //@loop
    dp[i] = dp[i - 1] + dp[i - 2];               // last step was 1 or 2 //@fill
  return dp[n];                                  //@ret
}`,

  tests: [
    { name: "Example 1: n = 2", kind: "normal", input: { n: 2 } },
    { name: "Example 2: n = 3", kind: "normal", input: { n: 3 } },
    { name: "n = 5", kind: "normal", input: { n: 5 } },
    { name: "n = 8", kind: "normal", input: { n: 8 } },
    { name: "n = 1: the first base case", kind: "edge", input: { n: 1 }, why: "There is exactly one way to climb one stair. The `n ≤ 2` guard must return before the code writes `dp[2]`: on a table of size 2 (`n + 1`), `dp[2]` is **out of bounds** and corrupts memory in C++." },
    { name: "n = 4", kind: "edge", input: { n: 4 }, why: "The first value that needs the table to be built over **two** steps (`dp[3]` then `dp[4]`). It confirms that `dp[i]` really reads `dp[i − 1]` and `dp[i − 2]` after they were filled, not before." },
    { name: "n = 3: the smallest case that enters the loop", kind: "corner", input: { n: 3 }, why: "With `n = 3` the loop body runs exactly once. If your loop started at `i = 2` or `i = 4`, you would overwrite a base case or skip the only computation: the first place an off-by-one shows up." },
    { name: "n = 45: the largest allowed", kind: "corner", input: { n: 45 }, noBrute: true, why: "The answer, 1,836,311,903, is the largest Fibonacci-like value that still fits in a signed 32-bit `int` (max 2,147,483,647). `n = 46` would **overflow**: that is why the limit is 45. The plain recursion would need about 3 billion calls for this input, so the lab's brute force skips it." },
  ],

  trace(input, T) {
    const n = input.n;
    const dp = Array.from({ length: n + 1 }, () => null);
    let whySum = false, whyDone = false;
    const S = (cur, deps, o = {}) => () => {
      const hl = { 0: "dim" };
      for (let i = 1; i <= n; i++) if (dp[i] !== null) hl[i] = "ok";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = o.filled ? "cur" : "cur";
      if (o.answer) hl[n] = "hit";
      return { dp: dp.slice(), hl, cur: cur ?? null, deps: deps || [], depLabels: ["+ a 1-step", "+ a 2-step"], formula: o.formula, label: `dp[i] = ways to reach stair i   (stairs 0 … ${n})`, regs: o.regs, note: o.note };
    };
    if (n <= 2) {
      dp[1] = 1; if (n === 2) dp[2] = 2;
      T.step("base", { vars: { n }, state: S(n, null, { answer: true, formula: n === 1 ? "ways(1) = 1   (just a 1-step)" : "ways(2) = 2   (1+1, or 2)" }), phase: "Base case", say: `\`n = ${n}\` is a base case, answered directly: ${n === 1 ? "only one way: a single 1-step" : "two ways: `1 + 1` and `2`"}. The table is not even needed.`, op: `n <= 2  →  return ${n}`, act: "BASE_CASE" });
      T.result(n);
      return;
    }
    T.step("base", { vars: { n }, state: S(null), phase: "Set up the table", say: `\`n = ${n}\` is bigger than 2, so we need the table. Think of \`dp[i]\` as *the number of ways to arrive on stair i*.`, op: "n <= 2 ?  false", act: "START" });
    T.step("init", { vars: { n, "dp.size": n + 1 }, state: S(null), say: `Create the table \`dp\` with ${n + 1} cells (\`dp[0] … dp[${n}]\`). Cell 0 is never used; every other cell is still unknown.`, op: `dp = vector(${n + 1})`, act: "ALLOCATE" });
    dp[1] = 1; dp[2] = 2;
    T.step("seed", { vars: { n, "dp[1]": 1, "dp[2]": 2 }, state: S(null), say: "The two **base cases** are known without any thinking: one way to reach stair 1 (a 1-step), two ways to reach stair 2 (`1+1` or `2`).", op: "dp[1] = 1,  dp[2] = 2", act: "BASE_CASES" });
    T.phase("Fill the table, left to right");
    for (let i = 3; i <= n; i++) {
      const a = dp[i - 1], b = dp[i - 2];
      T.step("loop", { vars: { i, "dp[i−1]": a, "dp[i−2]": b }, state: S(i, [i - 1, i - 2], { formula: `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${a} + ${b} = ?` }), say: `To compute **dp[${i}]** we only need the two cells just before it: dp[${i - 1}] = **${a}** and dp[${i - 2}] = **${b}**. Both are already final.`, op: `dp[${i}] = dp[${i - 1}] + dp[${i - 2}]  =  ${a} + ${b}`, act: "READ_DEPENDENCIES" });
      dp[i] = a + b;
      T.step("fill", { vars: { i, "dp[i]": dp[i] }, state: S(i, [i - 1, i - 2], { formula: `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${a} + ${b} = ${dp[i]}`, filled: true }), say: `${a} ways to arrive from stair ${i - 1} (then a 1-step) **plus** ${b} ways to arrive from stair ${i - 2} (then a 2-step) = **${dp[i]}** ways to reach stair ${i}.`, op: `dp[${i}] = ${a} + ${b} = ${dp[i]}`, act: "FILL",
        why: whySum ? null : { title: "Why do we ADD the two?", text: `Every way to reach stair ${i} ends with either a 1-step (arriving from ${i - 1}) or a 2-step (arriving from ${i - 2}). The two groups share **no** sequence and together cover **all** of them, so the counts add.` } });
      whySum = true;
    }
    T.step("ret", { vars: { n, "dp[n]": dp[n] }, state: S(n, null, { answer: true, formula: `answer = dp[${n}] = ${dp[n]}` }), say: `The table is complete. There are **${dp[n]}** distinct ways to climb ${n} stairs. Each cell was computed exactly once.`, op: `return dp[${n}] = ${dp[n]}`, act: "DONE",
      why: whyDone ? null : { title: "Why is this so much faster than the recursion?", text: `The recursion would compute the same \`ways(k)\` again and again (about ${(() => { let a = 1, b = 1; for (let i = 3; i <= n; i++) [a, b] = [b, a + b]; return 2 * b - 1; })().toLocaleString("en-IN")} calls for n = ${n}). The table computes each of the ${n - 2} cells **once**.` } });
    T.result(dp[n]);
  },
  fuzz(rnd) { return { n: 1 + Math.floor(rnd() * 25) }; },
  gen(n) { return { n }; },

  complexity: {
    time: {
      tex: "O(n)", title: "n − 2 subproblems, constant work for each", short: "one addition per table cell",
      derive: [
        "\\#\\text{subproblems} = n - 2 \\;(\\text{cells } 3 \\dots n) || each stair beyond the base cases is one subproblem, solved exactly once",
        "T(n) = \\underbrace{c_0}_{\\text{setup}} + \\sum_{i=3}^{n} \\underbrace{c}_{\\text{two reads + one add}} || the recurrence reads two cells and adds them: $O(1)$",
        "T(n) = c_0 + c\\,(n - 2) || the sum has $n - 2$ equal terms",
        "!T(n) = O(n) || compare with the recursion, where $C(n) = C(n-1) + C(n-2) + 1 \\Rightarrow C(n) = \\Theta(\\varphi^n)$",
      ],
      where: "A DP's running time is always **(number of states) × (work per state)**. There are `n` states and each costs $O(1)$, so $O(n)$. The exponential recursion visits the same states repeatedly: memoising or tabulating each state once removes all the repetition.",
    },
    space: {
      tex: "O(n)", title: "a table of n + 1 integers", short: "reducible to O(1): only the last two cells are ever read",
      derive: [
        "S(n) = (n + 1) \\cdot s_{\\text{int}} || the table `dp[0..n]`",
        "!S(n) = O(n) || linear in n",
      ],
      where: "Each cell only reads the two cells to its left, so the older cells are dead weight. Keeping just two variables (`prev2`, `prev1`) gives the same answer in **$O(1)$ space**, which is the first follow-up below. (The recursion's own space is $O(n)$ too, from the call stack.)",
    },
    limit: "You can go further than linear: $\\text{ways}(n)$ is the Fibonacci number $F_{n+1}$, and Fibonacci numbers can be computed with **matrix exponentiation** or *fast doubling* in $O(\\log n)$ arithmetic steps. For $n \\le 45$, $O(n)$ is plenty.",
    measure: { label: "n = number of stairs", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "A table of size `n` instead of `n + 1`", what: "`vector<int> dp(n);` and then reading or writing `dp[n]`.", why: "Counting stairs `1 … n` but forgetting that arrays are indexed from 0.", breaks: "`dp[n]` is one past the end: undefined behaviour in C++ (a crash or garbage), `undefined` in JS.", avoid: "If the table is indexed by *stair number*, give it `n + 1` cells so that index `n` exists." },
    { title: "Missing base cases or guards for tiny `n`", what: "Always writing `dp[1] = 1; dp[2] = 2;` even when `n = 1`.", why: "The loop looks fine for `n ≥ 3`, so small inputs are not tried.", breaks: "For `n = 1` the table has 2 cells, and `dp[2]` is out of bounds. For `n = 0` or `n = 1` the recursion without base cases never ends.", avoid: "Handle `n ≤ 2` first (`if (n <= 2) return n;`), then build the table." },
    { title: "Plain recursion without memoisation", what: "Submitting `climbStairs(n − 1) + climbStairs(n − 2)` directly.", why: "It is the shortest correct code and works for the examples.", breaks: "The number of calls is about $1.618^n$: `n = 45` needs about 3 billion calls and exceeds every time limit.", avoid: "Store each result (memoise the recursion) or fill a table bottom-up. Either way each `ways(k)` is computed once." },
    { title: "Using `int` beyond `n = 45`", what: "The same code on larger `n`.", why: "The recurrence is correct for every `n`, so it is easy to overlook that the *result* grows exponentially.", breaks: "`ways(46) = 2,971,215,073` exceeds `INT_MAX`; signed overflow is undefined behaviour in C++ and silently wraps to a wrong negative number in practice.", avoid: "Read the constraints. For bigger `n`, use `long long` (up to `n = 90`), or big integers, or return the answer modulo something." },
    { title: "Counting combinations instead of ordered sequences", what: "Treating `1 + 2` and `2 + 1` as the same way.", why: "Mixing this up with *partitions*.", breaks: "For `n = 3` you would get 2 instead of 3, and the recurrence `dp[i] = dp[i−1] + dp[i−2]` would not hold.", avoid: "Re-read the statement: the order of steps matters, so each last-step choice leads to a different sequence." },
  ],

  followUps: [
    {
      q: "Reduce the space to $O(1)$.",
      a: "`dp[i]` reads only `dp[i − 1]` and `dp[i − 2]`, so keep just **two variables** and slide them forward. After computing `cur`, the old `prev2` is never needed again, so `prev2 = prev1; prev1 = cur`. The time stays $O(n)$ but the table disappears.",
      cpp: `int climbStairsO1(int n) {
    if (n <= 2) return n;
    int prev2 = 1, prev1 = 2;                 // ways(1), ways(2)
    for (int i = 3; i <= n; i++) {
        int cur = prev1 + prev2;
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}`,
      js: `function climbStairsO1(n) {
  if (n <= 2) return n;
  let prev2 = 1, prev1 = 2;                   // ways(1), ways(2)
  for (let i = 3; i <= n; i++) {
    const cur = prev1 + prev2;
    prev2 = prev1;
    prev1 = cur;
  }
  return prev1;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Write the **top-down** (memoised recursion) version. When would you prefer it?",
      a: "Keep the recursive definition, but before computing `ways(k)` look it up in a memo table, and store the result before returning. Each `k` is then computed once, so it is $O(n)$ time and $O(n)$ space (table plus recursion stack). Prefer top-down when the **order** of subproblems is awkward to write as loops, or when only some subproblems are actually needed; prefer bottom-up when you want no recursion overhead or the $O(1)$-space trick.",
      cpp: `int memoWays(int n, vector<int>& memo) {
    if (n <= 2) return n;
    if (memo[n] != 0) return memo[n];          // already computed
    return memo[n] = memoWays(n - 1, memo) + memoWays(n - 2, memo);
}`,
      js: `function memoWays(n, memo = {}) {
  if (n <= 2) return n;
  if (memo[n] !== undefined) return memo[n];   // already computed
  return (memo[n] = memoWays(n - 1, memo) + memoWays(n - 2, memo));
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Now you may climb **1, 2 or 3** steps at a time (or any set `steps`). How does it change?",
      a: "The reasoning is identical: split by the last step. For steps `{1, 2, 3}`, `dp[i] = dp[i − 1] + dp[i − 2] + dp[i − 3]`, with `dp[0] = 1` (one way to stand at the bottom: do nothing). In general `dp[i] = Σ dp[i − s]` over every allowed `s ≤ i`. The time becomes $O(n \\cdot |steps|)$. This is exactly the shape of *Combination Sum IV* and *Coin Change* (counting ordered ways).",
      time: "O(n·k)", space: "O(n)",
    },
    {
      q: "Some stairs are **broken** (you cannot step on them). How do you count the ways?",
      a: "Add one rule: if stair `i` is broken, set `dp[i] = 0` instead of the sum. A zero propagates correctly, since ways that would pass through that stair simply contribute nothing to later stairs. Time and space are unchanged.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Can you compute the answer in $O(\\log n)$ time for a huge `n` (taken modulo a prime)?",
      a: "Yes. The recurrence is linear, so $\\begin{pmatrix} F_{n+1} \\\\ F_n \\end{pmatrix} = \\begin{pmatrix} 1 & 1 \\\\ 1 & 0 \\end{pmatrix}^{n} \\begin{pmatrix} 1 \\\\ 0 \\end{pmatrix}$. Raise the $2 \\times 2$ matrix to the power `n` by repeated squaring ($O(\\log n)$ multiplications). The number of ways to climb `n` stairs is $F_{n+1}$.",
      time: "O(\\log n)", space: "O(1)",
    },
  ],

  related: [
    { id: "house-robber", why: "The identical two-previous-cells recurrence, but with `max` instead of `+` and a choice (rob this house or skip it)." },
    { id: "decode-ways", why: "Count the ways to read a digit string: at each position the last piece is 1 digit or 2 digits, just like a 1-step or a 2-step." },
    { id: "coin-change", why: "The same idea with many possible steps (the coins) and *minimising* the number of steps instead of counting ways." },
    { id: "unique-paths", why: "A 2D table where each cell adds the cell above and the cell to its left: the same \"sum of smaller subproblems\"." },
    { id: "combination-sum-iv", why: "Climbing stairs where the allowed steps are an arbitrary list of numbers (ordered ways)." },
  ],
  patternNote: "**The 1D Dynamic Programming pattern** has four steps: define the state (`dp[i]` = what exactly?), find the recurrence (how does `dp[i]` use smaller states?), set the base cases, and decide the order (small to large). If the plain recursion repeats arguments, you have found a DP. Counting problems add the sub-answers, optimisation problems take a `min` or `max` of them.",
  takeaways: [
    "Split by the **last step**: `ways(n) = ways(n − 1) + ways(n − 2)`, the two groups never overlap.",
    "Plain recursion recomputes the same sub-answers: about $1.618^n$ calls. There are only `n` distinct ones.",
    "Fill `dp[1..n]` from the bottom up. State, recurrence, base cases and order are the four DP steps.",
    "Time $O(n)$, space $O(n)$, reducible to $O(1)$ with two variables (and even $O(\\log n)$ with matrix powers).",
    "Watch the traps: table size `n + 1`, tiny-`n` guard, and `int` overflow beyond `n = 45`.",
  ],
});
