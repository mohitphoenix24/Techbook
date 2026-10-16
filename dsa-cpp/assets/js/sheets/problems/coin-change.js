SHEETS.define({
  id: "coin-change",
  viz: "dp",
  io: { fn: "coinChange", params: [["coins", "int[]"], ["amount", "int"]], ret: "int" },

  statement: `You are given an array \`coins\` of coin denominations and an integer \`amount\`. Return the **fewest number of coins** needed to make up exactly \`amount\`. If it is impossible, return \`-1\`.

You have an **unlimited supply** of each kind of coin.`,
  examples: [
    { input: "coins = [1, 2, 5], amount = 11", output: "3", explain: "`11 = 5 + 5 + 1`: three coins." },
    { input: "coins = [2], amount = 3", output: "-1", explain: "Odd amounts cannot be made from 2s." },
    { input: "coins = [1], amount = 0", output: "0", explain: "Zero coins make an amount of 0." },
  ],
  constraints: ["$1 \\le$ `coins.length` $\\le 12$", "$1 \\le$ `coins[i]` $\\le 2^{31} - 1$", "$0 \\le$ `amount` $\\le 10^4$"],
  check(input) { return input.amount > 40 || input.coins.length > 6 || input.coins.some((c) => c < 1) ? "for the animation use an amount up to 40, at most 6 coins, each at least 1" : null; },

  intuition: {
    find: "The **smallest number of coins** (repeats allowed) that sum to `amount`, or `-1` if no combination does.",
    beginner: "Be greedy: always take the largest coin that still fits, repeat until the amount is 0.",
    works: "For some coin systems (like real-world money) greedy is optimal, and it is fast, so it seems fine.",
    slow: "It is **not correct** in general: with coins `{1, 3, 4}` and amount `6`, greedy takes `4 + 1 + 1` (3 coins) but `3 + 3` needs only 2. And plain recursion over all coin choices is exponential, about `(number of coins)^(amount)`.",
    repeat: "The recursive search *\"fewest coins for amount `a`\"* meets the same smaller amounts again and again (`6 → 5 → 4 …` and `6 → 3 → …`), recomputing `fewest(4)` many times.",
    remember: "Let `dp[a]` be the fewest coins for amount `a`. There are only `amount + 1` of these values, and each can be reused whenever that smaller amount is needed.",
    observation: "The **last coin** used to make `a` is some coin `c` in the list. Then the rest is an optimal solution for `a − c`: `dp[a] = 1 + dp[a − c]`. Try every coin and keep the best: `dp[a] = min over c ≤ a of (dp[a − c] + 1)`. Amounts that cannot be formed stay at infinity.",
    leads: "Fill `dp[0..amount]` from small to large with `dp[0] = 0`. For each amount try every coin. The answer is `dp[amount]` (or `-1` if it is still infinity). $O(\\text{amount} \\times \\text{coins})$ time.",
  },

  flow: [
    "Greedy: always take the largest coin that fits.",
    "Fast, and right for some coin systems (such as real currencies).",
    "Wrong in general (`{1,3,4}`, 6) and exponential if you try all choices.",
    "`dp[a]` = fewest coins for `a`; the last coin `c` leaves an optimal `a − c`.",
    "`dp[a] = min(dp[a − c] + 1)` over all coins `c ≤ a`.",
    "Fill a table of `amount + 1` cells: $O(\\text{amount} \\cdot k)$ time, $O(\\text{amount})$ space.",
  ],

  brute: {
    idea: "**Brute force (recursion):** `fewest(rem)` returns `0` for `rem = 0`; for `rem > 0` it tries every coin `c ≤ rem` and returns `1 + min(fewest(rem − c))` over coins whose sub-call is possible, or *impossible* if none works.",
    why: "From each amount the recursion branches into up to `k` calls (one per coin), so the tree has up to $k^{\\text{amount}}$ nodes. Yet there are only `amount + 1` distinct arguments, so the same sub-answer is recomputed over and over.",
    time: "O(k^amount)", space: "O(amount)",
    measure: { fTex: "\\approx 3^{\\text{amount}}", f: (n) => Math.pow(3, n), ns: [5, 10, 15, 20, 30] },
    cpp: `class Solution {
    int fewest(vector<int>& coins, int rem) {          // INT_MAX = impossible
        if (rem == 0) return 0;
        int best = INT_MAX;
        for (int c : coins)
            if (c <= rem) {
                int sub = fewest(coins, rem - c);
                if (sub != INT_MAX) best = min(best, sub + 1);
            }
        return best;
    }
public:
    int coinChange(vector<int>& coins, int amount) {
        int r = fewest(coins, amount);
        return r == INT_MAX ? -1 : r;
    }
};`,
    js: `function coinChange(coins, amount) {
  const fewest = (rem) => {                          // Infinity = impossible
    if (rem === 0) return 0;
    let best = Infinity;
    for (const c of coins) if (c <= rem) best = Math.min(best, fewest(rem - c) + 1);
    return best;
  };
  const r = fewest(amount);
  return r === Infinity ? -1 : r;
}`,
  },

  pattern: {
    name: "Dynamic Programming (unbounded knapsack)",
    why: "Each coin can be used any number of times, so for every amount you decide *which coin comes last* and rely on the optimal answer for the remaining amount. That is optimal substructure with heavily **overlapping** subproblems, the textbook trigger for DP. It is the *unbounded knapsack* shape: items (coins) reusable, target (amount) filled exactly, objective (count) minimised.",
    recognize: [
      "\"Fewest/most items to reach an exact total\" with **unlimited** copies of each item.",
      "A greedy choice (biggest first) is tempting but has counterexamples.",
      "The recursion's argument is the **remaining amount**, and many branches reach the same remaining amount.",
      "The table is indexed by the target value: `dp[0..amount]`.",
    ],
  },

  optimal: {
    idea: "Let `dp[a]` be the minimum number of coins that sum to `a`. Start with `dp[0] = 0` and every other cell at infinity (not yet reachable). For each amount `a` from `1` to `amount`, try every coin `c ≤ a`: using it as the last coin costs `dp[a − c] + 1`. Keep the minimum. At the end, `dp[amount]` is the answer if finite, else `-1`.",
    steps: [
      "Create `dp[0..amount]` filled with a large value (`amount + 1` works as infinity) and set `dp[0] = 0`.",
      "For `a` from `1` to `amount`:",
      "for each coin `c` with `c ≤ a`: `dp[a] = min(dp[a], dp[a − c] + 1)`.",
      "Return `dp[amount]`, or `-1` if it is still larger than `amount` (unreachable).",
    ],
    invariant: "**When the loop reaches `a`, `dp[x]` is correct for every `x < a`** (the fewest coins, or \"impossible\"), and while trying coins `dp[a]` always holds the best found among the coins tried so far.",
    correct: "Consider an optimal way to make `a ≥ 1` with `m` coins and let `c` be any one of its coins. Removing it leaves a way to make `a − c` with `m − 1` coins, and it must be optimal for `a − c` (otherwise we could improve the whole). So `dp[a] = dp[a − c] + 1` for some coin `c`, and trying all coins and taking the minimum finds it. The values used (`dp[a − c]`, with `c ≥ 1`) were final because they are for smaller amounts. A cell stays at infinity exactly when no coin leads to a reachable smaller amount, i.e. when `a` cannot be formed.",
  },

  cpp: `class Solution {
public:
    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, amount + 1);               // amount+1 = "impossible" //@init
        dp[0] = 0;                                            // zero coins make 0 //@seed
        for (int a = 1; a <= amount; a++)                     //@loop
            for (int c : coins)                               //@coin
                if (c <= a) dp[a] = min(dp[a], dp[a - c] + 1);   // last coin is c //@relax
        return dp[amount] > amount ? -1 : dp[amount];         //@ret
    }
};`,
  js: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(amount + 1);          // amount+1 = "impossible" //@init
  dp[0] = 0;                                                  // zero coins make 0 //@seed
  for (let a = 1; a <= amount; a++)                           //@loop
    for (const c of coins)                                    //@coin
      if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);     // last coin is c //@relax
  return dp[amount] > amount ? -1 : dp[amount];               //@ret
}`,

  tests: [
    { name: "Example 1: [1, 2, 5], 11", kind: "normal", input: { coins: [1, 2, 5], amount: 11 } },
    { name: "Example 2: impossible", kind: "normal", input: { coins: [2], amount: 3 } },
    { name: "Example 3: amount 0", kind: "normal", input: { coins: [1], amount: 0 } },
    { name: "Greedy fails: [1, 3, 4], 6", kind: "edge", input: { coins: [1, 3, 4], amount: 6 }, why: "Greedy takes `4 + 1 + 1` = 3 coins, but `3 + 3` uses 2. The DP tries *every* coin as the last one for each amount, so it finds the 2. This is the standard counter-example to the greedy idea." },
    { name: "Impossible with two even coins", kind: "edge", input: { coins: [2, 4], amount: 7 }, why: "Every sum of 2s and 4s is even, so 7 is unreachable. Cells for odd amounts stay at infinity, and the answer is `-1`: the code must not return the sentinel value itself." },
    { name: "Every coin larger than the amount", kind: "edge", input: { coins: [5, 10], amount: 3 }, why: "The test `c <= a` skips every coin, so `dp[1], dp[2], dp[3]` stay at infinity and the answer is `-1`. Without that guard, `dp[a − c]` would read a negative index." },
    { name: "A single coin that fits exactly", kind: "corner", input: { coins: [7], amount: 7 }, why: "`dp[7] = dp[0] + 1 = 1`: the base case `dp[0] = 0` is what makes the first coin count as 1. Everything below 7 stays unreachable." },
    { name: "Larger amount, mixed coins", kind: "corner", input: { coins: [2, 5, 10, 1], amount: 27 }, noBrute: true, why: "`27 = 10 + 10 + 5 + 2` needs 4 coins. The unsorted coin list shows the DP does not depend on the coin order. (The plain recursion would need millions of calls here, so the lab's brute force skips this input.)" },
    { name: "Many ways to make the same amount", kind: "corner", input: { coins: [1, 2, 3], amount: 6 }, why: "`6 = 3 + 3`, `3 + 2 + 1`, `2 + 2 + 2`, … many combinations; the DP does not enumerate them, it only keeps the minimum count per amount (2 here)." },
  ],

  trace(input, T) {
    const { coins, amount } = input;
    const INF = Infinity;
    const dp = Array.from({ length: amount + 1 }, () => null);
    dp[0] = 0;
    let whyMin = false, whyInf = false, whyGreedy = false;
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i <= amount; i++) if (dp[i] !== null) hl[i] = dp[i] === INF ? "bad" : "ok";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = "cur";
      if (o.answer) hl[amount] = "hit";
      return { arrs: [{ label: "coin denominations (unlimited supply)", arr: coins, hl: o.coin != null ? { [o.coin]: "cur" } : {}, cw: 44 }], dp: dp.map((v) => v), hl, cur: cur ?? null, deps: deps || [], depLabels: deps ? deps.map(() => "") : [], formula: o.formula, label: "dp[a] = fewest coins that make amount a   (∞ = impossible)" };
    };
    T.step("init", { vars: { amount }, state: S(null), phase: "Set up the table", say: "`dp[a]` will be the **fewest coins that make exactly the amount a**. Every cell starts as \"not yet known\", except `dp[0] = 0`: zero coins make the amount 0.", op: `dp[0..${amount}] = ∞,  dp[0] = 0`, act: "START" });
    T.step("seed", { vars: { "dp[0]": 0 }, state: S(0, null, { formula: "dp[0] = 0   (no coins needed for amount 0)" }), say: "Base case: the amount 0 needs **0 coins**. Every other amount will be built on top of it.", op: "dp[0] = 0", act: "BASE_CASE" });
    T.phase("Fill amounts from 1 up to the target");
    for (let a = 1; a <= amount; a++) {
      dp[a] = INF;
      const usable = coins.map((c, k) => [c, k]).filter(([c]) => c <= a);
      T.step("loop", { vars: { a, "usable coins": usable.map(([c]) => c).join(", ") || "none" }, state: S(a, usable.map(([c]) => a - c), { formula: `dp[${a}] = min over coins c ≤ ${a} of  dp[${a} − c] + 1   (so far: ∞)` }), say: usable.length ? `Computing **dp[${a}]**. The last coin could be ${usable.map(([c]) => c).join(", ")} (a coin bigger than ${a} cannot fit). Each choice leaves \`${a} − c\`, whose answer is already in the table.` : `Computing **dp[${a}]**: every coin is bigger than ${a}, so no coin fits and the cell stays **∞** (impossible).`, op: usable.length ? `try c ∈ {${usable.map(([c]) => c).join(", ")}}:  dp[${a}] = min(dp[${a} − c] + 1)` : `no coin ≤ ${a}  ⇒  dp[${a}] = ∞`, act: usable.length ? "TRY_COINS" : "NO_COIN_FITS" });
      for (const [c, k] of usable) {
        const prev = dp[a - c], cand = prev === INF ? INF : prev + 1, old = dp[a];
        const imp = cand < old;
        if (imp) dp[a] = cand;
        T.step("relax", { vars: { a, c, [`dp[${a - c}]`]: prev === INF ? "∞" : prev, "candidate": cand === INF ? "∞" : cand, [`dp[${a}]`]: dp[a] === INF ? "∞" : dp[a] }, state: S(a, [a - c], { coin: k, formula: `last coin ${c}:  dp[${a - c}] + 1 = ${prev === INF ? "∞" : prev} + 1 = ${cand === INF ? "∞" : cand}   →   dp[${a}] = min(${old === INF ? "∞" : old}, ${cand === INF ? "∞" : cand}) = ${dp[a] === INF ? "∞" : dp[a]}` }),
          say: prev === INF ? `Coin **${c}** would leave ${a - c}, which is **impossible** (∞), so this choice is no good.` : imp ? `Coin **${c}** leaves ${a - c}, which takes ${prev} coin${prev === 1 ? "" : "s"}. So ${prev} + 1 = **${cand}**, better than ${old === INF ? "∞" : old}: **dp[${a}] = ${cand}**.` : `Coin **${c}** gives ${prev} + 1 = ${cand}, no better than the current **${dp[a]}**. Keep it.`,
          op: `dp[${a}] = min(${old === INF ? "∞" : old}, dp[${a - c}] + 1) = ${dp[a] === INF ? "∞" : dp[a]}`, act: imp ? "IMPROVE" : "KEEP",
          why: imp && !whyMin ? { title: "Why dp[a − c] + 1?", text: `If the last coin is ${c}, the other coins must make exactly ${a - c}, and the cheapest way to do that is dp[${a - c}]. Adding the last coin costs one more.` } : prev === INF && !whyInf ? { title: "What does ∞ mean?", text: "∞ marks an amount that cannot be formed. Adding one coin to an impossible amount is still impossible, so such choices are ignored by the `min`." } : null });
        if (imp) whyMin = true; if (prev === INF) whyInf = true;
      }
    }
    const res = dp[amount] === INF ? -1 : dp[amount];
    T.step("ret", { vars: { "dp[amount]": dp[amount] === INF ? "∞" : dp[amount], answer: res }, state: S(amount, null, { answer: true, formula: res === -1 ? `dp[${amount}] = ∞  →  answer −1 (impossible)` : `answer = dp[${amount}] = ${res}` }), say: res === -1 ? `\`dp[${amount}]\` is still ∞: no combination of these coins makes ${amount}. Return **−1**.` : `The table is complete: the fewest coins for ${amount} is **${res}**.`, op: `return ${res}`, act: "DONE",
      why: !whyGreedy && coins.length > 1 ? { title: "Why not just take the biggest coin each time?", text: "That greedy choice can be wrong (for coins {1, 3, 4} and amount 6 it uses 3 coins instead of 2). The table tries every coin as the last one for every amount, so it never commits too early." } : null });
    T.result(res);
  },
  fuzz(rnd) {
    const k = 1 + Math.floor(rnd() * 3), set = new Set();
    while (set.size < k) set.add(1 + Math.floor(rnd() * 6));
    return { coins: [...set], amount: Math.floor(rnd() * 11) };
  },
  gen(n) { return { coins: [1, 2, 5], amount: n }; },

  complexity: {
    time: {
      tex: "O(S \\cdot k)", title: "(amount + 1) states, each tries k coins", short: "S = amount, k = number of coin types",
      derive: [
        "\\#\\text{states} = S + 1 \\;(\\text{amounts } 0 \\dots S) || one cell per amount",
        "\\text{work per state} \\le k \\cdot c || each coin costs one comparison, one subtraction, one `min`",
        "T = c_0 + \\sum_{a=1}^{S} k\\,c = c_0 + c\\,k\\,S || sum over the $S$ amounts",
        "!T = O(S \\cdot k) || versus $k^{S}$ for the plain recursion",
      ],
      where: "A DP's cost is *(number of states) × (work per state)*: $S$ states times $k$ coins. In the lab the number of steps grows linearly with the amount for a fixed coin set, which the table below measures.",
    },
    space: {
      tex: "O(S)", title: "one cell per amount", short: "the dp array of S + 1 integers",
      derive: [
        "S(n) = (S + 1) \\cdot s_{\\text{int}} || the table `dp[0..S]`",
        "!S(n) = O(S) || all cells are needed: any smaller amount may be reused",
      ],
      where: "Unlike *House Robber*, the dependencies `dp[a − c]` can reach far back (the coin sizes), so you cannot keep just two cells; the whole table stays.",
    },
    limit: "Coin change is NP-hard in general when the amount is given in binary (it is a form of knapsack), so a time that depends on the **value** of the amount, $O(S \\cdot k)$, is *pseudo-polynomial* and essentially the best known: it is only efficient when the amount is moderate.",
    measure: { label: "S = amount (with coins {1, 2, 5})", fTex: "S", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear in the amount for a fixed coin set" },
  },

  mistakes: [
    { title: "Greedy: take the largest coin first", what: "Sorting coins in decreasing order and subtracting greedily.", why: "It works for most currencies, so it feels natural.", breaks: "`coins = [1, 3, 4]`, `amount = 6` → greedy gives 3 coins, the optimum is 2.", avoid: "Unless the coin system is *canonical*, use DP: try every coin as the last one." },
    { title: "Initialising `dp` with `INT_MAX` and adding 1", what: "`vector<int> dp(amount+1, INT_MAX); … dp[a - c] + 1`.", why: "INT_MAX looks like the natural infinity.", breaks: "`INT_MAX + 1` overflows to a negative number, and then `min` picks it as the best: wrong answers or crashes (undefined behaviour in C++).", avoid: "Use `amount + 1` (any impossible count is at most `amount`), or check for the sentinel before adding." },
    { title: "Returning `dp[amount]` without translating \"impossible\"", what: "`return dp[amount];`", why: "It is the table's answer.", breaks: "For unreachable amounts you would return the sentinel (`amount + 1`), not `-1`.", avoid: "`return dp[amount] > amount ? -1 : dp[amount];`" },
    { title: "Not guarding `c <= a`", what: "Reading `dp[a − c]` for a coin larger than `a`.", why: "Forgetting that coins can exceed the amount.", breaks: "Negative index: undefined behaviour in C++, `undefined` (and `NaN` results) in JS.", avoid: "Only consider coins with `c <= a`." },
    { title: "Mixing up this with the *number of ways* problem", what: "Using `+` over coins instead of `min`.", why: "The loops look identical to *Combination Sum IV* / *Coin Change II*.", breaks: "You would count ways instead of finding the minimum.", avoid: "Read the question: *fewest* → `min(dp[a − c] + 1)`; *number of ways* → `dp[a] += dp[a − c]`." },
  ],

  followUps: [
    {
      q: "Count the **number of distinct combinations** that make the amount (order does not matter): *Coin Change II*.",
      a: "Loop over the **coins on the outside** and amounts on the inside: `for c in coins: for a in c..amount: ways[a] += ways[a − c]`, with `ways[0] = 1`. Putting coins outside means each combination is counted once, in a fixed coin order. If you loop amounts outside and coins inside, you count *orderings* (that is *Combination Sum IV*).",
      cpp: `int change(int amount, vector<int>& coins) {
    vector<unsigned> ways(amount + 1, 0);
    ways[0] = 1;
    for (int c : coins)
        for (int a = c; a <= amount; a++) ways[a] += ways[a - c];
    return (int)ways[amount];
}`,
      js: `function change(amount, coins) {
  const ways = new Array(amount + 1).fill(0);
  ways[0] = 1;
  for (const c of coins)
    for (let a = c; a <= amount; a++) ways[a] += ways[a - c];
  return ways[amount];
}`,
      time: "O(S·k)", space: "O(S)",
    },
    {
      q: "Solve it **top-down** (memoised recursion). When is that better?",
      a: "Keep the recursion `fewest(rem)` but cache each result in a table: each of the `amount + 1` arguments is computed once, so it is $O(S \\cdot k)$ as well. Top-down only visits the amounts that are actually reachable from the target, which can be fewer when coins are large; bottom-up avoids the recursion stack and is usually faster.",
      time: "O(S·k)", space: "O(S)",
    },
    {
      q: "Return **which coins** were used.",
      a: "Store, for each amount, the coin that gave its best value (`choice[a]`). Starting from `amount`, repeatedly output `choice[a]` and move to `a − choice[a]` until 0. That adds $O(S)$ space and an $O(\\text{answer})$ walk.",
      time: "O(S·k)", space: "O(S)",
    },
    {
      q: "Each coin may be used **at most once**. What changes?",
      a: "That is the **0/1 knapsack** variant: iterate the amounts **downwards** inside each coin's loop (`for a from amount down to c`), so that a coin cannot be reused within the same pass. The recurrence is unchanged, but the loop order encodes the use-once rule.",
      time: "O(S·k)", space: "O(S)",
    },
  ],

  related: [
    { id: "climbing-stairs", why: "The same recurrence with coins `{1, 2}`, counting ways instead of minimising." },
    { id: "combination-sum-iv", why: "Same table, but the operation is `+` (count ordered ways) instead of `min`." },
    { id: "word-break", why: "A boolean version: `dp[i]` is true if some word ends at `i` and `dp` is true at the start of that word." },
    { id: "longest-increasing-subsequence", why: "Another 1D DP, with a different recurrence (best ending at `i`)." },
  ],
  patternNote: "**The unbounded-knapsack DP** indexes a table by the target value and, for each value, tries every item as the *last* one added, relying on the optimal answer for what is left. Swap the combining operation to fit the question: `min(…)+1` for fewest items, `+` for number of ways, `or` for feasibility.",
  takeaways: [
    "`dp[a]` = fewest coins for amount `a`; `dp[a] = min(dp[a − c] + 1)` over coins `c ≤ a`; `dp[0] = 0`.",
    "Greedy (biggest coin first) is **wrong** in general: `{1, 3, 4}`, 6.",
    "Use `amount + 1` as infinity (never `INT_MAX + 1`), guard `c <= a`, and return `-1` for unreachable.",
    "Time $O(S \\cdot k)$, space $O(S)$: pseudo-polynomial. The plain recursion is $k^{S}$.",
    "Same table, different operation: `min` (fewest), `+` (count ways), `or` (feasible).",
  ],
});
