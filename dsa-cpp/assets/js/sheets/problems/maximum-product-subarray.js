SHEETS.define({
  id: "maximum-product-subarray",
  viz: "array",
  io: { fn: "maxProduct", params: [["nums", "int[]"]], ret: "int" },

  statement: `Given an integer array \`nums\`, find the **contiguous subarray** (at least one element) with the **largest product**, and return that product.

The answer is guaranteed to fit in a 32-bit integer.`,
  examples: [
    { input: "nums = [2, 3, -2, 4]", output: "6", explain: "The subarray `[2, 3]` has product 6. `[2, 3, -2, 4]` would give −48." },
    { input: "nums = [-2, 0, -1]", output: "0", explain: "The result cannot be 2, because `[-2, -1]` is not contiguous: the `0` sits between them." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 2 \\times 10^4$", "$-10 \\le$ `nums[i]` $\\le 10$", "The product of any subarray fits in a 32-bit integer."],

  intuition: {
    find: "The largest product over all contiguous, non-empty runs. A run containing a `0` has product `0`, so zeros cut the array into independent parts.",
    beginner: "Try every start and every end, multiplying as the end moves, and keep the largest product.",
    works: "It checks every subarray, so the best one is among them.",
    slow: "$\\frac{n(n+1)}{2}$ subarrays: $O(n^2)$, which is 200 million steps for $n = 2 \\times 10^4$ and far too slow for larger inputs.",
    repeat: "As in *Maximum Subarray*, every start re-multiplies almost the same elements as the previous start.",
    remember: "Copy the idea from Maximum Subarray: remember the best product **ending at the current element**. But watch out: a *negative* number flips the order, so the **smallest** (most negative) product ending at the previous element can become the **largest** after multiplying by a negative.",
    observation: "Multiplying by `x` can produce the new best from the old maximum (if `x > 0`) or from the old **minimum** (if `x < 0`). So we must carry both: `curMax` and `curMin`. The new maximum is `max(x, x·curMax, x·curMin)` and the new minimum is `min(x, x·curMax, x·curMin)`. A `0` automatically resets both (everything becomes 0, then restarts).",
    leads: "One pass keeping `curMax`, `curMin` and `best`. At each `x`: compute the three candidates `x`, `x·curMax`, `x·curMin`, set the new `curMax`/`curMin` from them (using the **old** values for both), and update `best = max(best, curMax)`. $O(n)$ time, $O(1)$ space.",
  },

  flow: [
    "Multiply along every (start, end) pair and keep the largest product.",
    "Every subarray is covered, so the best one is found.",
    "$O(n^2)$ subarrays, with heavy re-multiplication.",
    "Negatives flip signs: the smallest product so far can become the biggest after one more negative.",
    "Carry both the **max** and the **min** product ending here.",
    "One pass, three variables: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for each start `i`, extend the end `j` and keep a running product of `nums[i..j]`; update `best` with every product.",
    why: "Like the sum version, it performs $\\frac{n(n+1)}{2}$ multiplications. It has no memory of the best product ending *before* each start, so every start rebuilds products from scratch.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n+1)}{2}", f: (n) => (n * (n + 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int maxProduct(vector<int>& nums) {
        int n = nums.size();
        long long best = LLONG_MIN;
        for (int i = 0; i < n; i++) {
            long long p = 1;
            for (int j = i; j < n; j++) {
                p *= nums[j];
                best = max(best, p);
            }
        }
        return (int)best;
    }
};`,
    js: `function maxProduct(nums) {
  let best = -Infinity;
  for (let i = 0; i < nums.length; i++) {
    let p = 1;
    for (let j = i; j < nums.length; j++) {
      p *= nums[j];
      best = Math.max(best, p);
    }
  }
  return best;
}`,
  },

  pattern: {
    name: "Dynamic Programming (track max and min)",
    why: "It is Kadane's \"best ending here\" with one extra twist: multiplication by a negative reverses the order of values, so the *worst* product ending at the previous element may become the *best* now. A correct DP state must therefore hold **both extremes** ending at each index.",
    recognize: [
      "A best-subarray problem where the combining operation is **not monotonic** (products with negative numbers).",
      "Adding one more element can turn the minimum into the maximum (sign flips).",
      "A single running best is not enough: you must keep the opposite extreme as well.",
      "Zeros act as resets: they erase everything before them.",
    ],
  },

  optimal: {
    idea: "Maintain, for the subarrays that **end at the current index**, the largest product `curMax` and the smallest product `curMin`. For the next element `x`, the products ending at `x` are `x` alone, `x × (a product ending before)`. The extreme values come from `curMax·x` and `curMin·x` (one of them is the max, the other the min, depending on the sign of `x`). Update both from the old values, and track the overall best.",
    steps: [
      "Initialise `curMax = curMin = best = nums[0]`.",
      "For each next `x`: compute `a = curMax × x` and `b = curMin × x` (from the **old** values).",
      "New `curMax = max(x, a, b)`; new `curMin = min(x, a, b)` (update both only after computing both).",
      "Update `best = max(best, curMax)`.",
      "Return `best`.",
    ],
    invariant: "**After processing index `i`, `curMax` and `curMin` are the maximum and the minimum product of a non-empty subarray ending at `i`, and `best` is the maximum over all subarrays ending at or before `i`.**",
    correct: "A subarray ending at `i` is `[nums[i]]` or `nums[i]` appended to one ending at `i−1`. Its product is `x` or `x × p` where `p` ranges over products ending at `i−1`. For fixed `x`, `x × p` is monotonic in `p` (increasing if `x > 0`, decreasing if `x < 0`, constant 0 if `x = 0`), so its maximum and minimum occur at `p = curMax` or `p = curMin`. Hence the new max and min are the max and min of `{x, x·curMax, x·curMin}`. Zero gives `0` for the products and `x = 0` itself, which resets both extremes to 0. The overall maximum is the best `curMax` over all positions.",
  },

  cpp: `class Solution {
public:
    int maxProduct(vector<int>& nums) {
        int curMax = nums[0], curMin = nums[0], best = nums[0];   //@init
        for (int i = 1; i < (int)nums.size(); i++) {              //@loop
            int x = nums[i];
            int hi = max({x, curMax * x, curMin * x});            // new maximum //@hi
            int lo = min({x, curMax * x, curMin * x});            // new minimum //@lo
            curMax = hi; curMin = lo;                             // after both //@upd
            best = max(best, curMax);                             //@best
        }
        return best;                                              //@ret
    }
};`,
  js: `function maxProduct(nums) {
  let curMax = nums[0], curMin = nums[0], best = nums[0];         //@init
  for (let i = 1; i < nums.length; i++) {                         //@loop
    const x = nums[i];
    const hi = Math.max(x, curMax * x, curMin * x);               // new maximum //@hi
    const lo = Math.min(x, curMax * x, curMin * x);               // new minimum //@lo
    curMax = hi; curMin = lo;                                     // after both //@upd
    best = Math.max(best, curMax);                                //@best
  }
  return best;                                                    //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [2, 3, -2, 4] } },
    { name: "Example 2: a zero in the middle", kind: "normal", input: { nums: [-2, 0, -1] } },
    { name: "Two negatives make a positive", kind: "normal", input: { nums: [-2, 3, -4] } },
    { name: "Odd number of negatives", kind: "edge", input: { nums: [-1, -2, -3] }, why: "Three negatives: the whole array is negative (−6), so the best subarray drops **one** of the ends: `[-2, -3] = 6`. The best product comes from the *minimum* (−2) times the next negative, which is why `curMin` is needed." },
    { name: "A zero resets everything", kind: "edge", input: { nums: [2, 0, 3] }, why: "The zero kills any product that crosses it, so the answer is the best of the parts on each side (`3`). After the zero, both `curMax` and `curMin` become 0 and the next element restarts the products." },
    { name: "A big positive after a big negative", kind: "edge", input: { nums: [-3, 4, -2, 5] }, why: "The best run is the **whole array**: `-3 · 4 · -2 · 5 = 120`, because the two negatives cancel. A solution that restarts at every negative (like Kadane for sums) would miss `120`." },
    { name: "A single negative element", kind: "corner", input: { nums: [-3] }, why: "One element: the answer is that element, even though negative. Initialising `best = 1` or `0` would be wrong." },
    { name: "All zeros", kind: "corner", input: { nums: [0, 0, 0] }, why: "Every product is `0`. Both `curMax` and `curMin` stay `0`, and the answer is `0`, not a negative or a leftover value." },
    { name: "Two negatives", kind: "corner", input: { nums: [-2, -3] }, why: "The smallest case where the sign flip matters: `curMin` after `−2` is `−2`, and `−2 × −3 = 6` becomes the new maximum." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    let mx = nums[0], mn = nums[0], best = nums[0], whyMin = false, whyZero = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      if (i != null) hl[i] = "cur";
      if (o.bestAt != null) hl[o.bestAt] = "hit";
      return { arr: nums, hl, ptr: i != null ? { i } : {}, label: "nums", regs: [{ k: "curMax (biggest ending here)", v: o.mx ?? mx, cls: "ok" }, { k: "curMin (smallest ending here)", v: o.mn ?? mn, cls: "bad" }, { k: "best", v: best, cls: "hit" }], note: o.note };
    };
    let bestAt = 0;
    T.step("init", { vars: { curMax: mx, curMin: mn, best }, state: S(0, { bestAt }), phase: "One pass, tracking max AND min", say: `Start with the first element: \`curMax = curMin = best = ${nums[0]}\`. We track the **smallest** product too, because a negative number can turn it into the largest.`, op: `curMax = curMin = best = ${nums[0]}`, act: "START" });
    for (let i = 1; i < n; i++) {
      const x = nums[i], a = mx * x, b = mn * x;
      const hi = Math.max(x, a, b), lo = Math.min(x, a, b);
      T.step("hi", { vars: { i, x, "curMax·x": a, "curMin·x": b, hi }, state: S(i, { bestAt }), say: `Candidates for the biggest product ending at ${i}: \`x = ${x}\`, \`curMax·x = ${a}\`, \`curMin·x = ${b}\`. The largest is **${hi}**${x < 0 && hi === b ? " — it came from the **minimum** times a negative: the sign flip at work" : x === 0 ? " (a zero resets everything)" : ""}.`, op: `hi = max(${x}, ${a}, ${b}) = ${hi}`, act: x < 0 && hi === b ? "FLIP_TO_MAX" : "NEW_MAX",
        why: whyMin || !(x < 0) ? (whyZero || x !== 0 ? null : { title: "What does a zero do?", text: "Any product containing 0 is 0. Both candidates `curMax·0` and `curMin·0` are 0, and so is `x`: both extremes become 0, so the next element starts a fresh product." }) : { title: "Why do we need curMin?", text: `${x} is negative, so multiplying makes big numbers small and **small (very negative) numbers big**. The old minimum ${mn} times ${x} is ${b}, which can beat ${a}.` } });
      if (x < 0) whyMin = true; if (x === 0) whyZero = true;
      T.step("lo", { vars: { i, x, "curMax·x": a, "curMin·x": b, lo }, state: S(i, { bestAt }), say: `Candidates for the smallest product ending at ${i}: ${x}, ${a}, ${b}. The smallest is **${lo}**. (Both new values use the *old* \`curMax\` and \`curMin\`.)`, op: `lo = min(${x}, ${a}, ${b}) = ${lo}`, act: "NEW_MIN" });
      mx = hi; mn = lo;
      T.step("upd", { vars: { i, curMax: mx, curMin: mn }, state: S(i, { bestAt }), say: `Now update both together: \`curMax = ${mx}\`, \`curMin = ${mn}\`. Updating \`curMax\` before computing \`lo\` would have used a wrong value.`, op: `curMax = ${mx},  curMin = ${mn}`, act: "UPDATE_BOTH" });
      const imp = mx > best;
      if (imp) { best = mx; bestAt = i; }
      T.step("best", { vars: { i, curMax: mx, best }, state: S(i, { bestAt }), say: imp ? `\`curMax = ${mx}\` beats the best so far: **\`best = ${best}\`**.` : `\`curMax = ${mx}\` does not beat \`best = ${best}\`.`, op: `best = max(best, curMax) = ${best}`, act: imp ? "NEW_BEST" : "KEEP_BEST" });
    }
    T.step("ret", { vars: { best }, state: S(null, { bestAt }), say: `Done. The largest product of a contiguous subarray is **${best}**.`, op: `return ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 9); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 9) - 4) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => (i % 4 === 3 ? -1 : 1)) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass, constant work per element", short: "three products, two max/min, one comparison per element",
      derive: [
        "T(n) = c_0 + \\sum_{i=1}^{n-1} \\big( c_{\\text{hi}} + c_{\\text{lo}} + c_{\\text{best}} \\big) || each element computes two products, a 3-way max, a 3-way min and one comparison: $O(1)$",
        "T(n) = c_0 + (n-1)\\,c || the constants merge",
        "!T(n) = O(n) || every element is read exactly once",
      ],
      where: "The brute force's $\\frac{n(n+1)}{2}$ multiplications are replaced by two products per element. The extra variable `curMin` costs nothing asymptotically.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "`curMax`, `curMin` and `best`",
      derive: [
        "S(n) = |\\text{curMax}| + |\\text{curMin}| + |\\text{best}| || the only state carried",
        "!S(n) = 3c = O(1) || independent of n",
      ],
      where: "No array of intermediate results is needed: each step reads only the previous step's extremes.",
    },
    limit: "Every element can change the answer, so $\\Omega(n)$ time is needed, and a constant number of variables is the least state that still handles sign flips.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Tracking only the maximum", what: "Writing `cur = max(x, cur * x)` as in Kadane.", why: "It is the direct translation of the sum version.", breaks: "For `[-2, 3, -4]` it never sees that the old minimum (−6 after `[-2, 3]`) times −4 is 24, so it returns 3 instead of 24.", avoid: "Keep `curMin` too: a negative `x` turns the minimum into the maximum." },
    { title: "Overwriting `curMax` before computing `curMin`", what: "`curMax = max(...); curMin = min(x, curMax * x, curMin * x);`", why: "The two lines look independent.", breaks: "The second line uses the **new** `curMax`, not the old one, so the minimum is computed from the wrong value.", avoid: "Compute both new values into temporaries (`hi`, `lo`) and assign afterwards (or swap when `x < 0`)." },
    { title: "Initialising `best` to 0 or 1", what: "`int best = 0;`", why: "Habit from sums.", breaks: "For an all-negative single element like `[-3]` the answer is `-3`, but `0` would be returned.", avoid: "Start from `nums[0]`." },
    { title: "Forgetting that zero resets the run", what: "Treating `0` like any other number and expecting the product to \"recover\".", why: "Products never recover once 0, so people add special-casing.", breaks: "Not a bug in this algorithm if written as above: `x` itself is always a candidate, so after a zero the next element starts fresh. The bug appears if `x` is *not* among the candidates.", avoid: "Always include `x` itself in the max/min candidates." },
    { title: "Integer overflow in the brute force", what: "Multiplying many numbers in an `int`.", why: "The final answer fits in 32 bits, but intermediate products of *other* subarrays may not.", breaks: "Overflow is undefined behaviour in C++ (and a wrong comparison in practice).", avoid: "In the brute force use `long long`. The optimal algorithm only ever keeps values that are products of actual subarrays, which are guaranteed to fit." },
  ],

  followUps: [
    {
      q: "Another way: split the array at zeros and use prefix/suffix products. Why does it work?",
      a: "In a zero-free block, if the number of negatives is even, the whole block is the best. If it is odd, you must drop either a prefix up to and including the **first** negative, or a suffix starting at the **last** negative. A neat shortcut: scan once from the left taking the maximum prefix product, once from the right taking the maximum suffix product (resetting the running product to 1 after a zero). The best subarray is always a prefix or a suffix of some zero-free block.",
      cpp: `int maxProductPrefixSuffix(vector<int>& nums) {
    int n = nums.size(), best = nums[0];
    long long pre = 1, suf = 1;
    for (int i = 0; i < n; i++) {
        pre = (pre == 0 ? 1 : pre) * nums[i];
        suf = (suf == 0 ? 1 : suf) * nums[n - 1 - i];
        best = max<long long>(best, max(pre, suf));
    }
    return best;
}`,
      js: `function maxProductPrefixSuffix(nums) {
  const n = nums.length;
  let best = nums[0], pre = 1, suf = 1;
  for (let i = 0; i < n; i++) {
    pre = (pre === 0 ? 1 : pre) * nums[i];
    suf = (suf === 0 ? 1 : suf) * nums[n - 1 - i];
    best = Math.max(best, pre, suf);
  }
  return best;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the **subarray** (its indices), not just the product.",
      a: "Remember the start index of the run that produced `curMax` and `curMin` (they may start at different places), and when `best` improves record `(start of curMax's run, i)`. When `x` is negative, `curMax` and `curMin` swap roles, so their start indices swap too. Same $O(n)$ time and $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "What if the array is **circular** (the subarray may wrap)?",
      a: "Products do not have the 'total − minimum' trick that sums have (no subtraction, and zeros break division). A safe approach is to double the array (`nums + nums`) and run the algorithm on windows of length at most `n`, or run it on the doubled array while limiting the run length with a deque. It is $O(n)$ for the doubling with care about the length limit.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "maximum-subarray", why: "The sum version: only the maximum needs to be tracked, because addition keeps the order of values." },
    { id: "product-of-array-except-self", why: "Also about products, solved with prefix/suffix products and no division." },
    { id: "house-robber", why: "Another one-pass DP that carries a tiny state from one element to the next." },
  ],
  patternNote: "**The \"carry both extremes\" DP** appears whenever the combining operation can reverse the order of values (multiplying by a negative, subtracting, negation). If the previous *maximum* is not enough to produce the next maximum, keep the previous *minimum* too and let each step choose between the two.",
  takeaways: [
    "Like Kadane, track the best product **ending at each index**: but also the **minimum**, since a negative flips them.",
    "New max = `max(x, x·curMax, x·curMin)`, new min = `min(x, x·curMax, x·curMin)`: compute both from the **old** values.",
    "`x` itself is always a candidate (restart), and a zero resets both extremes.",
    "Start from `nums[0]`; time $O(n)$, space $O(1)$. Brute force is $O(n^2)$.",
    "Recognise the twist: an operation that can reverse order needs both extremes in the state.",
  ],
});
