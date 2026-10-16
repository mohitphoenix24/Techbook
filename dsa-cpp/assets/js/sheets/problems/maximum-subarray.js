SHEETS.define({
  id: "maximum-subarray",
  viz: "array",
  io: { fn: "maxSubArray", params: [["nums", "int[]"]], ret: "int" },

  statement: `Given an integer array \`nums\`, find the **contiguous subarray** (at least one element) with the **largest sum**, and return that sum.`,
  examples: [
    { input: "nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]", output: "6", explain: "The subarray `[4, -1, 2, 1]` has the largest sum, 6." },
    { input: "nums = [1]", output: "1", explain: "The only subarray is `[1]`." },
    { input: "nums = [5, 4, -1, 7, 8]", output: "23", explain: "The whole array: `5 + 4 − 1 + 7 + 8 = 23`." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 10^5$", "$-10^4 \\le$ `nums[i]` $\\le 10^4$"],

  intuition: {
    find: "The biggest possible sum of a **run of neighbouring elements** (a subarray). It must contain at least one element, so for an all-negative array the answer is the *least negative* number, not 0.",
    beginner: "Try every start `i` and every end `j ≥ i`, add up `nums[i..j]`, and keep the biggest sum. To avoid re-adding from scratch, extend the running sum as `j` grows.",
    works: "It considers every possible subarray, so the best one is certainly among them.",
    slow: "There are $\\frac{n(n+1)}{2}$ subarrays, so even with a running sum it is $O(n^2)$: about 5 billion steps for $n = 10^5$.",
    repeat: "For every start `i` we re-walk almost the same elements as for start `i − 1`. The sums of `nums[i..j]` and `nums[i−1..j]` differ only by one element, yet we recompute each from its own start.",
    remember: "Instead of asking *\"what is the best subarray starting at i?\"* ask *\"what is the best subarray **ending at** i?\"*. Call it `cur`. It is the only thing we need to remember about the past.",
    observation: "The best subarray ending at `i` either **extends** the best one ending at `i − 1` (`cur + nums[i]`), or **starts fresh** at `i` (`nums[i]`). If the running sum `cur` is negative, it only drags the next element down, so we should drop it and restart. That is `cur = max(nums[i], cur + nums[i])`.",
    leads: "One pass: update `cur = max(nums[i], cur + nums[i])`, and keep `best = max(best, cur)`. This is **Kadane's algorithm**: $O(n)$ time and $O(1)$ space.",
  },

  flow: [
    "Try every start and end, summing as the end moves.",
    "Every subarray is checked, so the best cannot be missed.",
    "$\\frac{n(n+1)}{2}$ subarrays: $O(n^2)$, each start re-walking nearly the same elements.",
    "Only the best sum **ending at the current element** matters for the next step.",
    "Extend it (`cur + x`) or restart at `x`, whichever is larger: a negative `cur` is dead weight.",
    "One pass, two variables (`cur`, `best`): $O(n)$ time, $O(1)$ space (Kadane).",
  ],

  brute: {
    idea: "**Brute force:** for each start index `i`, walk the end index `j` from `i` to `n − 1`, keeping a running `sum` of `nums[i..j]`, and update `best` with every sum.",
    why: "Each start does a walk of up to `n` steps, so the total is $n + (n-1) + \\dots + 1 = \\frac{n(n+1)}{2} = \\Theta(n^2)$. The walks from neighbouring starts overlap almost completely: the information \"the best sum ending just before here\" is thrown away each time.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n+1)}{2}", f: (n) => (n * (n + 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int best = INT_MIN, n = nums.size();
        for (int i = 0; i < n; i++) {
            int sum = 0;
            for (int j = i; j < n; j++) {
                sum += nums[j];
                best = max(best, sum);
            }
        }
        return best;
    }
};`,
    js: `function maxSubArray(nums) {
  let best = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    let sum = 0;
    for (let j = i; j < nums.length; j++) {
      sum += nums[j];
      best = Math.max(best, sum);
    }
  }
  return best;
}`,
  },

  pattern: {
    name: "Kadane (DP: best ending here)",
    why: "This is dynamic programming in its smallest form. Let $f(i)$ be the best sum of a subarray **ending exactly at `i`**. Then $f(i) = \\max(\\text{nums}[i],\\, f(i-1) + \\text{nums}[i])$, and the answer is $\\max_i f(i)$. Because $f(i)$ only depends on $f(i-1)$, one running variable is enough.",
    recognize: [
      "You want the best (max/min) **contiguous** segment: subarray, substring, run.",
      "The best answer ending at position `i` can be built from the best answer ending at `i − 1`.",
      "A **negative / unhelpful prefix** should be dropped: the choice at each element is *extend* or *restart*.",
      "The brute force is a double loop over (start, end) with a running sum.",
    ],
  },

  optimal: {
    idea: "Scan once, carrying `cur` = the best sum of a subarray that **ends at the current element** and `best` = the best seen anywhere. At each element, either extend the previous best-ending-here (`cur + x`) or start over at `x`; whichever is bigger becomes the new `cur`. Then `best = max(best, cur)`.",
    steps: [
      "Initialise `cur = best = nums[0]` (the first element is the only subarray ending there).",
      "For each next element `x`: set `cur = max(x, cur + x)`.",
      "That is: **extend** if `cur` is non-negative (it helps), **restart** at `x` if `cur` is negative (it hurts).",
      "Update `best = max(best, cur)`.",
      "After the loop, return `best`.",
    ],
    invariant: "**After processing index `i`, `cur` is the maximum sum of a subarray ending at `i`, and `best` is the maximum sum of any subarray that ends at or before `i`.**",
    correct: "Any subarray ending at `i` is either just `[nums[i]]` or a subarray ending at `i − 1` with `nums[i]` appended. The best of the second kind uses the **best** subarray ending at `i − 1` (adding the same `nums[i]` to a smaller sum can only be worse), which is `cur`. So the best ending at `i` is `max(nums[i], cur + nums[i])`. Every subarray ends somewhere, so the overall maximum is the maximum over `i` of these, which `best` keeps. Starting with `cur = best = nums[0]` (not `0`) makes the answer correct for all-negative arrays.",
  },

  cpp: `class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int cur = nums[0], best = nums[0];             // best sum ending here / overall //@init
        for (int i = 1; i < (int)nums.size(); i++) {   //@loop
            cur = max(nums[i], cur + nums[i]);         // extend, or restart //@cur
            best = max(best, cur);                     //@best
        }
        return best;                                   //@ret
    }
};`,
  js: `function maxSubArray(nums) {
  let cur = nums[0], best = nums[0];                   // best sum ending here / overall //@init
  for (let i = 1; i < nums.length; i++) {              //@loop
    cur = Math.max(nums[i], cur + nums[i]);            // extend, or restart //@cur
    best = Math.max(best, cur);                        //@best
  }
  return best;                                         //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] } },
    { name: "Example 2: a single element", kind: "normal", input: { nums: [1] } },
    { name: "Example 3: take everything", kind: "normal", input: { nums: [5, 4, -1, 7, 8] } },
    { name: "All numbers negative", kind: "edge", input: { nums: [-3, -1, -2] }, why: "The subarray must have **at least one** element, so the best is the single largest element, `-1`, not `0`. Initialising `best = 0` is the classic bug: it would claim an empty subarray with sum 0." },
    { name: "Zeros mixed with negatives", kind: "edge", input: { nums: [0, -3, 0, -1] }, why: "A zero neither helps nor hurts: `0` beats any negative, so the answer is `0`. It checks the extend-or-restart rule when `cur + x` ties with `x`." },
    { name: "A big loss in the middle", kind: "edge", input: { nums: [5, -20, 4, 3] }, why: "The first `5` is good, but `−20` wipes it out. `cur` becomes `−15`, which is worse than starting over at `4`, so the algorithm **restarts**. The answer `7` comes from `4 + 3`, never including the early `5`." },
    { name: "A single negative element", kind: "corner", input: { nums: [-5] }, why: "One element, so the answer is that element even though it is negative. Our initialisation (`cur = best = nums[0]`) handles it; the loop does not even run." },
    { name: "The best run is at the very end", kind: "corner", input: { nums: [-5, -4, 10, 3] }, why: "`best` must be updated on the **last** element too. A loop that stops one short, or updates `best` only on restarts, would miss `13`." },
    { name: "Alternating signs", kind: "corner", input: { nums: [2, -1, 2, -1, 2] }, why: "Each `−1` is smaller than the running positive sum, so the algorithm **extends** through it. The best subarray is the whole array (4). It shows that a negative element is *not* automatically a reason to restart." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    let cur = nums[0], best = nums[0], s = 0, bs = 0, be = 0;
    let whyRestart = false, whyExtend = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      for (let k = bs; k <= be; k++) hl[k] = "ok";
      for (let k = s; k <= (i ?? 0); k++) hl[k] = hl[k] === "ok" ? "ok" : "win";
      if (i != null) hl[i] = "cur";
      const spans = [{ from: s, to: i ?? s, cls: "win", label: `best ending here: sum ${cur}` }];
      if (be >= bs && (bs !== s || be !== (i ?? s))) spans.push({ from: bs, to: be, cls: "ok", label: `best so far: sum ${best}` });
      return { arr: nums, hl, ptr: i != null ? { i } : {}, spans, label: "nums", regs: [{ k: "cur  (best sum ending here)", v: o.cur ?? cur, cls: "cur" }, { k: "best  (overall)", v: best, cls: "hit" }], note: o.note };
    };
    T.step("init", { vars: { cur, best }, state: S(0), phase: "One pass (Kadane)", say: `Start with the first element: the only subarray ending at index 0 is \`[${nums[0]}]\`, so \`cur = best = ${nums[0]}\`.`, op: `cur = best = nums[0] = ${nums[0]}`, act: "START" });
    for (let i = 1; i < n; i++) {
      const x = nums[i], ext = cur + x, restart = x > ext;
      const prevCur = cur;
      if (restart) { cur = x; s = i; } else cur = ext;
      T.step("cur", {
        vars: { i, x, "cur + x": ext, cur }, state: S(i),
        say: restart ? `Extending would give ${prevCur} + ${x} = **${ext}**, which is worse than starting fresh at **${x}**. The running sum ${prevCur} is *negative*: it only hurts, so **restart** here.` : prevCur < 0 ? `Extending gives ${prevCur} + ${x} = **${ext}**, no worse than starting fresh (${x}), so keep going.` : `Extending gives ${prevCur} + ${x} = **${ext}**, better than starting fresh at ${x}. The running sum ${prevCur} **helps**, so extend.`,
        op: `cur = max(${x}, ${prevCur} + ${x}) = max(${x}, ${ext}) = ${cur}`, act: restart ? "RESTART" : "EXTEND",
        why: restart ? (whyRestart ? null : { title: "Why drop a negative running sum?", text: `A subarray ending at ${i} that includes the old part has sum ${ext}; one that starts at ${i} has sum ${x}. Since ${prevCur} < 0, the old part can only **lower** every later sum, so the best subarray ending here (and anywhere after) never needs it.` }) : (whyExtend ? null : { title: "Why extend?", text: `The old running sum ${prevCur} is positive, so adding it to ${x} gives more than ${x} alone. Dropping it would throw away value.` }),
      });
      if (restart) whyRestart = true; else whyExtend = true;
      const imp = cur > best, prevBest = best;
      if (imp) { best = cur; bs = s; be = i; }
      T.step("best", { vars: { i, cur, best }, state: S(i), say: imp ? `\`cur = ${cur}\` beats the previous best, so **\`best\` becomes ${best}** (the subarray from index ${bs} to ${be}).` : `\`cur = ${cur}\` does not beat \`best = ${best}\`, so the best subarray found so far stays.`, op: `best = max(${prevBest}, ${cur}) = ${best}`, act: imp ? "NEW_BEST" : "KEEP_BEST" });
    }
    T.step("ret", { vars: { best }, state: S(null, {}), say: `The scan is done. The maximum subarray sum is **${best}**, from index ${bs} to ${be}: \`[${nums.slice(bs, be + 1).join(", ")}]\`.`, op: `return best = ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 11); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 13) - 6) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => (i % 5) - 2) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass, two comparisons per element", short: "n − 1 iterations of constant work",
      derive: [
        "T(n) = c_0 + \\sum_{i=1}^{n-1} \\big( c_{\\text{cur}} + c_{\\text{best}} \\big) || each element does one `max(x, cur + x)` and one `max(best, cur)`",
        "T(n) = c_0 + (n-1)\\,c || the two constants merge",
        "!T(n) = O(n) || every element is read once, in order",
      ],
      where: "The brute force's inner loop re-adds the same elements for every start. Kadane's `cur` carries the useful part of that work from one index to the next, so each element costs a constant amount.",
    },
    space: {
      tex: "O(1)", title: "two integers", short: "`cur` and `best`",
      derive: [
        "S(n) = |\\text{cur}| + |\\text{best}| || the only state carried between elements",
        "!S(n) = 2c = O(1) || independent of n",
      ],
      where: "A DP table `f[i]` would be $O(n)$, but each `f[i]` only reads `f[i−1]`, so one running variable replaces the whole table.",
    },
    limit: "$O(n)$ time and $O(1)$ space are both optimal: every element can change the answer, and the algorithm stores only a constant amount of information.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Initialising `best` (or `cur`) to 0", what: "`int cur = 0, best = 0;`", why: "Zero feels like a neutral start, as it is for sums.", breaks: "For an all-negative array, `best` stays `0` (an empty subarray), but the problem requires at least one element: for `[-3, -1, -2]` the answer is `-1`.", avoid: "Start from `nums[0]` (or `INT_MIN` and handle the first element in the loop)." },
    { title: "Resetting `cur` to 0 instead of to `x`", what: "`if (cur < 0) cur = 0; cur += x;`", why: "It is a common variant of Kadane that works when empty subarrays are allowed.", breaks: "With all negatives it returns the best of `0` and sums, not the best *non-empty* sum, unless `best` is tracked carefully.", avoid: "Use `cur = max(x, cur + x)`: the restart value is the element itself." },
    { title: "Updating `best` only when restarting", what: "Calling `best = max(best, cur)` in only one branch.", why: "Mixing up where the answer \"appears\".", breaks: "The best sum can occur while extending, so it is missed.", avoid: "Update `best` after **every** step, once `cur` is final." },
    { title: "Using a sliding window with a fixed rule", what: "Moving `left` forward whenever the sum is negative, like in window problems.", why: "It looks like a window problem (contiguous, running sum).", breaks: "Negative numbers break the monotonic logic that windows rely on; a window can be negative now and positive after the next big number.", avoid: "Decide per element between extend and restart, as Kadane does." },
    { title: "Confusing it with the maximum subsequence", what: "Adding all positive numbers.", why: "A *subsequence* may skip elements; a *subarray* may not.", breaks: "For `[5, -20, 4, 3]` it returns 12 instead of 7: it jumps over the `−20`, which is not allowed.", avoid: "Re-read: **contiguous**." },
  ],

  followUps: [
    {
      q: "Also return the **indices** of the best subarray.",
      a: "Track where the current run started (`s`). Whenever `cur` restarts, set `s = i`. Whenever `best` improves, record `(bestStart, bestEnd) = (s, i)`. The cost does not change: $O(n)$ time, $O(1)$ space. (This is what the lab's green span shows.)",
      cpp: `pair<int,int> maxSubArrayRange(vector<int>& nums) {
    int cur = nums[0], best = nums[0], s = 0, bs = 0, be = 0;
    for (int i = 1; i < (int)nums.size(); i++) {
        if (nums[i] > cur + nums[i]) { cur = nums[i]; s = i; }   // restart here
        else cur += nums[i];
        if (cur > best) { best = cur; bs = s; be = i; }
    }
    return {bs, be};
}`,
      js: `function maxSubArrayRange(nums) {
  let cur = nums[0], best = nums[0], s = 0, bs = 0, be = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > cur + nums[i]) { cur = nums[i]; s = i; }       // restart here
    else cur += nums[i];
    if (cur > best) { best = cur; bs = s; be = i; }
  }
  return [bs, be];
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Solve it with **divide and conquer**. How does it compare?",
      a: "Split the array in the middle. The best subarray is either entirely in the left half, entirely in the right half, or **crosses the middle**. The crossing one is the best suffix of the left half plus the best prefix of the right half, found in $O(n)$. The recurrence is $T(n) = 2T(n/2) + O(n)$, i.e. $O(n \\log n)$ by the Master theorem. It is slower than Kadane, but it parallelises well and is a classic divide-and-conquer example.",
      time: "O(n \\log n)", space: "O(\\log n)",
    },
    {
      q: "The array is **circular** (the subarray may wrap around the end). What changes?",
      a: "The best circular subarray is either an ordinary one (Kadane) or it wraps, in which case the elements it **leaves out** form an ordinary subarray in the middle: the one with the *minimum* sum. So `answer = max(kadaneMax, total − kadaneMin)`. Special case: if all elements are negative, `total − kadaneMin = 0` would mean an empty subarray, so return `kadaneMax`.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "What is the maximum sum of a subarray if you may **delete at most one element** from it?",
      a: "Keep two running values per index: `noDel[i]` (best ending at `i` with no deletion, ordinary Kadane) and `oneDel[i]` (best ending at `i` with one deletion so far): `oneDel[i] = max(oneDel[i−1] + nums[i], noDel[i−1])` (either keep going after having deleted, or delete `nums[i]` now). The answer is the maximum over all of them. Still $O(n)$ and $O(1)$ with rolling variables.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "best-time-to-buy-and-sell-stock", why: "The best single transaction is exactly the maximum-sum subarray of the daily price *differences*." },
    { id: "maximum-product-subarray", why: "The same extend-or-restart idea for products, with the twist that you must track the minimum as well." },
    { id: "house-robber", why: "Another one-pass DP with a tiny state: at each element choose between two options based on the previous best." },
    { id: "jump-game", why: "A one-pass scan carrying a single running value (the furthest reach) that decides everything." },
  ],
  patternNote: "**The Kadane / best-ending-here pattern** is dynamic programming with a one-number state. Define $f(i)$ = the best result of a segment that **ends at `i`**, write $f(i)$ in terms of $f(i-1)$ (extend or restart), and the answer is the best $f(i)$ over all `i`. Whenever the brute force is a double loop over (start, end), ask whether *\"best ending here\"* can replace the start.",
  takeaways: [
    "Track the best sum **ending at** the current element: `cur = max(x, cur + x)`. A negative `cur` is dropped.",
    "Keep `best = max(best, cur)` after every element; start from `nums[0]`, not `0`.",
    "A subarray must be **contiguous and non-empty**: all-negative arrays return their largest element.",
    "Time $O(n)$, space $O(1)$: Kadane's algorithm. Brute force is $O(n^2)$.",
    "The pattern generalises: max product (track min too), circular arrays, at most one deletion.",
  ],
});
