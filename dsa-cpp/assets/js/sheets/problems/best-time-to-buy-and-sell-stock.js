SHEETS.define({
  id: "best-time-to-buy-and-sell-stock",
  viz: "array",
  io: { fn: "maxProfit", params: [["prices", "int[]"]], ret: "int" },

  statement: `You are given an array \`prices\` where \`prices[i]\` is the price of a stock on day \`i\`.

You may complete **one** transaction: choose one day to **buy** and a **later** day to **sell**. Return the maximum profit you can make. If no profit is possible, return \`0\`.`,
  examples: [
    { input: "prices = [7, 1, 5, 3, 6, 4]", output: "5", explain: "Buy on day 1 (price 1) and sell on day 4 (price 6): profit $6 - 1 = 5$. Buying on day 1 and selling on day 0 would be illegal, since you must buy first." },
    { input: "prices = [7, 6, 4, 3, 1]", output: "0", explain: "The price only falls, so every transaction loses money. The best choice is not to trade, so the answer is 0." },
  ],
  constraints: ["$1 \\le$ `prices.length` $\\le 10^5$", "$0 \\le$ `prices[i]` $\\le 10^4$"],

  intuition: {
    find: "A pair of days `i < j` that makes `prices[j] − prices[i]` as large as possible. If every such difference is negative, the answer is `0` (we simply do not trade).",
    beginner: "Try every buy day `i` and every later sell day `j`, compute `prices[j] − prices[i]`, and keep the biggest. Two nested loops.",
    works: "It examines **every legal pair**, so the best one cannot be missed. The condition `j > i` makes sure we never sell before buying.",
    slow: "There are $\\frac{n(n-1)}{2}$ pairs. With $n = 10^5$ that is about 5 billion pairs, far too slow.",
    repeat: "For each sell day `j`, we look back over **all** earlier days `i` just to find the cheapest one. That backward scan is repeated for every `j`, and almost all of it overlaps with the previous scan.",
    remember: "For a given sell day, the best buy day is simply the **cheapest price seen so far**. As we walk forward, we can keep that single number up to date: one variable, `minPrice`, instead of re-scanning.",
    observation: "To maximise `prices[j] − prices[i]` for a fixed `j`, we want the **smallest** `prices[i]` with `i < j`. The whole earlier history is summarised by its minimum. We do not need to know *which* earlier days were expensive.",
    leads: "Walk through the days once, keeping `minPrice` (the cheapest price so far). On each day, the best profit if we **sell today** is `price − minPrice`. Keep the largest such value in `best`. One pass, two variables: $O(n)$ time, $O(1)$ space.",
  },

  flow: [
    "Try every buy day `i` and every later sell day `j`.",
    "It checks every legal pair, so it cannot miss the best one.",
    "$\\frac{n(n-1)}{2}$ pairs, and each sell day re-scans the past for its cheapest price.",
    "For a fixed sell day, only the **cheapest earlier price** matters.",
    "Carry `minPrice` along as we walk forward: the past is summarised by one number.",
    "One pass: update `minPrice`, then `best = max(best, price − minPrice)`. $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for each buy day `i`, scan every later day `j > i` and compute `prices[j] − prices[i]`. Remember the largest difference seen (starting from `0`, which stands for \"do not trade\").",
    why: "For each `j` the inner loop re-discovers the cheapest earlier price from scratch. Counting the pairs gives $(n-1) + (n-2) + \\dots + 1 = \\frac{n(n-1)}{2} = \\Theta(n^2)$. For a year of daily prices that is trivial; for $10^5$ ticks it is billions of operations.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int best = 0, n = prices.size();
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                best = max(best, prices[j] - prices[i]);
        return best;
    }
};`,
    js: `function maxProfit(prices) {
  let best = 0;
  for (let i = 0; i < prices.length; i++)
    for (let j = i + 1; j < prices.length; j++)
      best = Math.max(best, prices[j] - prices[i]);
  return best;
}`,
  },

  pattern: {
    name: "Greedy",
    why: "At every day we make the **locally best** choice (\"the cheapest buy price available so far\") and it is provably also globally best: no earlier day can beat the minimum for a fixed sell day. A single pass with a running summary (here, a running minimum) is the signature of greedy / one-pass problems.",
    recognize: [
      "You need the best **pair** `(i, j)` with `i < j`, and the quantity depends on `i` only through something simple (a minimum, a maximum, a sum).",
      "A nested loop whose inner loop only recomputes a **prefix minimum / maximum / sum**.",
      "The answer can be updated **as you go** by looking only at the current element and one remembered value.",
      "Order matters (\"buy before sell\"), so you must process left to right and never use future information.",
    ],
  },

  optimal: {
    idea: "Scan the prices from left to right. Keep `minPrice`, the lowest price seen so far (the best day to have bought, given that we are selling no earlier than today). For each price, first update `minPrice`, then compute the profit of selling today, `price − minPrice`, and update `best` if it is larger.",
    steps: [
      "Start with `minPrice = ∞` (no price seen yet) and `best = 0` (doing nothing earns 0).",
      "For each day's `price`: set `minPrice = min(minPrice, price)`.",
      "Compute today's candidate profit `price − minPrice` (selling today, having bought at the cheapest earlier-or-same day).",
      "Set `best = max(best, price − minPrice)`.",
      "After the last day, return `best`.",
    ],
    invariant: "**After processing day `i`, `minPrice` is the smallest of `prices[0..i]`, and `best` is the largest profit achievable with a sell day `≤ i`.**",
    correct: "Take an optimal transaction (buy day `b`, sell day `s`, `b ≤ s`). When the scan reaches day `s`, `minPrice ≤ prices[b]` (it is the minimum of a prefix containing `b`), so the candidate `prices[s] − minPrice ≥ prices[s] − prices[b]` = the optimal profit. So `best` is at least optimal. Conversely every candidate we compute corresponds to a real pair (the day that produced `minPrice` is on or before today), so `best` is never larger than the optimum. Updating `minPrice` **before** computing the profit lets a day be both the buy and sell day, giving profit `0`, which is the \"do nothing\" answer.",
  },

  cpp: `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int minPrice = INT_MAX, best = 0;          //@init
        for (int p : prices) {                     //@loop
            minPrice = min(minPrice, p);           //@min
            best = max(best, p - minPrice);        //@best
        }
        return best;                               //@ret
    }
};`,
  js: `function maxProfit(prices) {
  let minPrice = Infinity, best = 0;           //@init
  for (const p of prices) {                    //@loop
    minPrice = Math.min(minPrice, p);          //@min
    best = Math.max(best, p - minPrice);       //@best
  }
  return best;                                 //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { prices: [7, 1, 5, 3, 6, 4] } },
    { name: "Example 2: always falling", kind: "normal", input: { prices: [7, 6, 4, 3, 1] } },
    { name: "Steady rise", kind: "normal", input: { prices: [1, 2, 3, 4, 5] } },
    { name: "The cheapest day comes too late", kind: "edge", input: { prices: [2, 4, 1] }, why: "The global minimum (`1`) is the **last** day, so there is nothing after it to sell on. The answer is `4 − 2 = 2`, not `4 − 1 = 3`. Algorithms that take `max − min` over the whole array get this wrong, because they ignore that you must buy *before* you sell." },
    { name: "Every price the same", kind: "edge", input: { prices: [4, 4, 4, 4] }, why: "No day is better than another, so the profit is `0`. The code must not return a negative number or `minPrice`; `best` starts at `0` and only grows." },
    { name: "Best buy is not the first low", kind: "edge", input: { prices: [3, 3, 5, 0, 0, 3, 1, 4] }, why: "The first big gain (`3 → 5`) is tempting, but a later dip to `0` allows `0 → 4`, which is better. The running minimum has to *keep updating* while we scan, and `best` must remember the earlier candidate in case nothing beats it." },
    { name: "A single day", kind: "corner", input: { prices: [10] }, why: "With one day you cannot buy and sell on different days. The loop runs once, `minPrice = best`'s source day, profit `0`. Nothing may read `prices[1]`." },
    { name: "Two days, rising", kind: "corner", input: { prices: [1, 2] }, why: "The smallest case with a real profit: buy on day 0, sell on day 1. It checks that the profit uses `minPrice` from an *earlier* day." },
    { name: "Huge gain on the last day", kind: "corner", input: { prices: [9, 8, 7, 1, 2, 3, 4, 100] }, why: "The best profit (`100 − 1 = 99`) appears only at the very end, so `best` must still be updated on the final element. A loop that stops one day early would return `3`." },
  ],

  trace(input, T) {
    const { prices } = input, n = prices.length;
    let minP = Infinity, minIdx = -1, best = 0, bestB = -1, bestS = -1;
    let whyMin = false, whyBest = false;
    const reg = (cand) => [{ k: "cheapest price so far", v: minP === Infinity ? "∞" : minP, cls: "ok" }, { k: "profit if sold today", v: cand === undefined ? "–" : cand, cls: "cur" }, { k: "best profit", v: best, cls: "hit" }];
    const S = (i, cand, o = {}) => () => {
      const hl = {};
      if (minIdx >= 0) hl[minIdx] = "ok";
      if (bestB >= 0) { hl[bestB] = "ok"; hl[bestS] = "hit"; }
      if (i != null) hl[i] = "cur";
      const arcs = [];
      if (bestB >= 0) arcs.push({ from: bestB, to: bestS, cls: "ok", label: `best +${best}` });
      if (o.arc && minIdx >= 0 && i != null && minIdx !== i) arcs.push({ from: minIdx, to: i, cls: "cmp", label: `today +${prices[i] - minP}` });
      const ptr = {};
      if (minIdx >= 0) ptr.buy = { i: minIdx, side: "bottom" };
      if (i != null) ptr.today = { i, side: "top" };
      return { arr: prices, bars: true, hl, ptr, arcs, regs: reg(cand), label: "price on each day", max: Math.max(...prices, 1) };
    };
    T.step("init", { vars: { minPrice: "∞", best: 0 }, state: S(null), phase: "One pass through the days", say: "We scan the days left to right. `minPrice` will hold the cheapest price seen so far; `best` holds the best profit found so far (0 means *do not trade*).", op: "minPrice = ∞,  best = 0", act: "START" });
    for (let i = 0; i < n; i++) {
      const p = prices[i];
      const newMin = p < minP;
      const before = minP;
      if (newMin) { minP = p; minIdx = i; }
      T.step("min", {
        vars: { day: i, price: p, minPrice: minP === Infinity ? "∞" : minP, best }, state: S(i),
        say: newMin ? `Price **${p}** is cheaper than anything before (${before === Infinity ? "nothing yet" : before}). Remember it: this is now the best day to have bought.` : `Price ${p} is not cheaper than the cheapest so far (**${minP}**), so the best buy day does not change.`,
        op: `minPrice = min(${before === Infinity ? "∞" : before}, ${p}) = ${minP}`, act: newMin ? "NEW_MIN" : "KEEP_MIN",
        why: !newMin || whyMin ? null : { title: "Why do we only keep the minimum?", text: "If we sell on a later day, the best buy day is the **cheapest earlier day**. Every other earlier day is more expensive, so it can never beat the minimum. The whole past collapses into one number." },
      });
      if (newMin) whyMin = true;
      const cand = p - minP;
      const better = cand > best, prevBest = best;
      if (better) { best = cand; bestB = minIdx; bestS = i; }
      T.step("best", {
        vars: { day: i, price: p, minPrice: minP, "p − minPrice": cand, best }, state: S(i, cand, { arc: true }),
        say: better ? `Selling today would earn ${p} − ${minP} = **${cand}**, better than the best so far. New best profit: **${cand}**.` : cand === 0 && minIdx === i ? `Today is the cheapest day so far, so buying and selling today earns **0**. Nothing beats the best (${best}).` : `Selling today would earn ${p} − ${minP} = ${cand}, which does not beat the best (**${best}**).`,
        op: `best = max(${prevBest}, ${p} − ${minP}) = ${best}`, act: better ? "NEW_BEST" : "KEEP_BEST",
        why: !better || whyBest || cand === 0 ? null : { title: "Why is this a valid transaction?", text: `\`minPrice\` came from day ${minIdx}, which is **on or before** today (day ${i}). So we buy on day ${minIdx} and sell on day ${i}, in the right order.` },
      });
      if (better && cand > 0) whyBest = true;
    }
    T.step("ret", { vars: { best }, state: S(null), say: best > 0 ? `All days processed. The best profit is **${best}**: buy on day ${bestB} at ${prices[bestB]}, sell on day ${bestS} at ${prices[bestS]}.` : "All days processed and no transaction earned money, so the answer is **0** (do not trade).", op: `return ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 12); return { prices: Array.from({ length: n }, () => Math.floor(rnd() * 21)) }; },
  gen(n) { return { prices: Array.from({ length: n }, (_, i) => (i * 7919) % 1000) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass, constant work per day", short: "n iterations of two comparisons",
      derive: [
        "T(n) = \\sum_{i=0}^{n-1} \\big( c_{\\min} + c_{\\text{profit}} \\big) || each day does one `min` and one `max`/subtraction, all $O(1)$",
        "T(n) = \\sum_{i=0}^{n-1} c || the two constants merge into one constant c",
        "T(n) = c \\cdot n || exactly n days are visited, each once",
        "!T(n) = O(n) || drop the constant",
      ],
      where: "Each price is read **once** and never revisited. The nested-loop brute force re-reads old prices over and over (that is where its extra factor of $n$ comes from). Here the summary variable `minPrice` replaces the whole inner loop.",
    },
    space: {
      tex: "O(1)", title: "two integers", short: "only `minPrice` and `best`",
      derive: [
        "S(n) = |\\text{minPrice}| + |\\text{best}| || the only state that is kept between days",
        "S(n) = 2c || independent of n",
        "!S(n) = O(1) || constant extra space",
      ],
      where: "We never store the array of profits or past prices; the running minimum is enough. (The input array itself is not counted as extra space.)",
    },
    limit: "You cannot do better than $O(n)$ time: every price could be the cheapest or the best, so each must be looked at at least once. $O(1)$ space is also the minimum possible.",
    measure: { label: "n = prices.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Taking `max(prices) − min(prices)`", what: "Subtracting the global minimum from the global maximum.", why: "It is the quickest way to get the biggest difference, and it works on increasing data.", breaks: "It ignores the **order**: for `[2, 4, 1]` it returns `4 − 1 = 3`, but selling on day 1 at 4 and having bought at 1 on day 2 is time travel. The right answer is 2.", avoid: "Always pair a sell day with a buy day **before** it: keep the minimum of the *prefix*, not of the whole array." },
    { title: "Initialising `minPrice` to `0` (or the wrong sentinel)", what: "Starting with `int minPrice = 0;`.", why: "Zero feels like a natural starting value.", breaks: "Then `min(0, p)` is always `0`, so every day looks like a profit of `p − 0` and the code returns the **maximum price**.", avoid: "Start from `INT_MAX` (C++) / `Infinity` (JS), or from `prices[0]` and loop from day 1." },
    { title: "Returning a negative profit", what: "Initialising `best` to the first difference or to `INT_MIN`.", why: "Taking \"maximum of all differences\" literally.", breaks: "On a falling market the maximum difference is negative, but the problem says to return `0` when no profit is possible.", avoid: "Initialise `best = 0`: doing nothing is always allowed." },
    { title: "Computing the profit before updating `minPrice`", what: "Doing `best = max(best, p − minPrice)` first, then `minPrice = min(minPrice, p)`.", why: "It looks like the order in which you would describe it in words.", breaks: "With `minPrice = INT_MAX` on day 0, `p − INT_MAX` is hugely negative (and in some languages overflows). It also stops a day from being its own buy day.", avoid: "Update the minimum **first**; then the profit for today is always ≥ 0." },
    { title: "Nested loops with `j` starting at `0`", what: "Writing `for j in 0..n` instead of `j = i + 1`.", why: "Copy-paste from a different pair-counting loop.", breaks: "It allows selling **before** buying, so the answer can be larger than the true optimum.", avoid: "Start the inner loop at `i + 1`, or better, avoid the inner loop with the running minimum." },
  ],

  followUps: [
    {
      q: "You may complete **as many** transactions as you like (but hold at most one share at a time). What is the maximum profit?",
      a: "Collect **every upward step**. If `prices[i] > prices[i − 1]`, you could have bought yesterday and sold today, so add the difference. Adding all positive daily differences is exactly the maximum, because any profitable round trip is the sum of the daily rises inside it. This greedy argument is a classic.",
      cpp: `int maxProfitMany(vector<int>& prices) {
    int profit = 0;
    for (int i = 1; i < (int)prices.size(); i++)
        if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1];
    return profit;
}`,
      js: `function maxProfitMany(prices) {
  let profit = 0;
  for (let i = 1; i < prices.length; i++)
    if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1];
  return profit;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Also return **which days** to buy and sell.",
      a: "Remember the **index** of the minimum along with its value, and whenever `best` improves, record the pair `(minIndex, today)`. Nothing else changes, so the cost is still $O(n)$ time and $O(1)$ space. (The lab above does exactly this: the green and blue bars are the best buy and sell days found so far.)",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "At most **`k`** transactions are allowed. How would you solve it?",
      a: "Now the greedy running-minimum trick is not enough, because the choice of one transaction affects the others. Use dynamic programming with states `buy[t]` (best profit while holding a stock after `t` buys) and `sell[t]` (best profit with no stock after `t` sells), updated once per day: `buy[t] = max(buy[t], sell[t − 1] − price)` and `sell[t] = max(sell[t], buy[t] + price)`. That is $O(nk)$ time and $O(k)$ space. If $k \\ge n/2$ the limit is irrelevant and the previous follow-up applies.",
      time: "O(nk)", space: "O(k)",
    },
    {
      q: "There is a **cooldown** (you cannot buy the day after selling) or a **transaction fee**. What changes?",
      a: "Model the day as a small **state machine**: *holding* a stock, *not holding and free to buy*, and *cooling down*. Each day the best profit in each state is computed from yesterday's states in $O(1)$. With a fee, subtract it when you sell. It is the same one-pass idea, but with a few more remembered numbers instead of just one.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "maximum-subarray", why: "Define `diff[i] = prices[i] − prices[i−1]`: the best single transaction is the **maximum-sum subarray** of `diff`. Both are one-pass problems that carry a running best-ending-here value." },
    { id: "jump-game", why: "Another greedy one-pass scan: keep one running number (the furthest reachable index) and update it from each element." },
    { id: "container-with-most-water", why: "Again a best **pair** `(i, j)`, but solved by shrinking from both ends: another way to beat the $O(n^2)$ pair loop." },
  ],
  patternNote: "**The Greedy pattern** builds the answer step by step, always taking the choice that looks best *right now*, and relies on a proof that this never hurts later. Here the proof is simple: for a fixed sell day, a lower buy price is never worse. Look for problems where a nested loop only recomputes a running minimum, maximum or sum: replace the inner loop by one remembered value.",
  takeaways: [
    "For a fixed sell day, the best buy day is the **cheapest earlier day**: remember just that.",
    "One pass, two variables: update `minPrice` first, then `best = max(best, price − minPrice)`.",
    "`best` starts at `0` because not trading is always allowed; `minPrice` starts at `∞`.",
    "Time $O(n)$, space $O(1)$. The nested-loop brute force is $O(n^2)$.",
    "Do not use `max − min` over the whole array: order matters (buy **before** sell).",
  ],
});
