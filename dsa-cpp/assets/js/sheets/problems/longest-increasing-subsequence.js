SHEETS.define({
  id: "longest-increasing-subsequence",
  viz: "array",
  io: { fn: "lengthOfLIS", params: [["nums", "int[]"]], ret: "int" },

  statement: `Given an integer array \`nums\`, return the **length of the longest strictly increasing subsequence**.

A subsequence keeps the original order but may skip elements, e.g. \`[3, 6, 2, 7]\` is a subsequence of \`[0, 3, 1, 6, 2, 2, 7]\`.`,
  examples: [
    { input: "nums = [10, 9, 2, 5, 3, 7, 101, 18]", output: "4", explain: "One longest increasing subsequence is `[2, 3, 7, 101]` (also `[2, 5, 7, 18]`): length 4." },
    { input: "nums = [0, 1, 0, 3, 2, 3]", output: "4", explain: "`[0, 1, 2, 3]`." },
    { input: "nums = [7, 7, 7, 7, 7, 7, 7]", output: "1", explain: "*Strictly* increasing: equal values do not count, so the best is a single element." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 2500$", "$-10^4 \\le$ `nums[i]` $\\le 10^4$"],

  intuition: {
    find: "The length of the longest sequence of elements, taken in order (skipping allowed), whose values are **strictly increasing**.",
    beginner: "Try every subsequence: for each element decide *take* or *skip* (taking only if it is larger than the last taken), recursively. Keep the longest length.",
    works: "It enumerates every increasing subsequence, so the longest is among them.",
    slow: "There are $2^n$ subsequences. For $n = 2500$ that is far beyond any computer.",
    repeat: "The question *\"what is the longest increasing subsequence **ending at** index `i`?\"* has an answer that only depends on earlier indices, yet the recursion recomputes it for every route that reaches `i`.",
    remember: "Store `dp[i]` = the length of the longest increasing subsequence **ending at `i`**. Then `dp[i] = 1 + max(dp[j])` over earlier `j` with `nums[j] < nums[i]`. That is the $O(n^2)$ DP (and the brute force code shown below).",
    observation: "Can we do better than checking all earlier `j`? Think about **what future elements need**: to extend a subsequence of length `L`, only the **smallest possible last value** among all increasing subsequences of length `L` matters (smaller tails are easier to extend). Keep `tails[L − 1]` = that smallest tail. This array is always **sorted**, so we can find the right slot for each new number with **binary search**.",
    leads: "For each `x`: find the first position `p` in `tails` with `tails[p] ≥ x` (binary search, `lower_bound`). If none exists, `x` extends the longest subsequence: append it. Otherwise **replace** `tails[p]` with `x` (a smaller tail for length `p + 1`). The length of `tails` at the end is the answer. $O(n \\log n)$.",
  },

  flow: [
    "Try every take/skip choice and keep the longest increasing run.",
    "All $2^n$ subsequences are covered.",
    "Exponential. The $O(n^2)$ DP (best ending at `i`) is better but still checks every earlier element.",
    "For each length `L` only the **smallest tail** of an increasing subsequence of that length matters.",
    "Those smallest tails form a **sorted** array: binary search where each number belongs.",
    "Append if it is bigger than all tails, else replace: $O(n \\log n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**The $O(n^2)$ DP (the straightforward improvement over trying all $2^n$ subsequences):** `dp[i]` = the length of the longest increasing subsequence ending at index `i`. Start `dp[i] = 1`; for every `j < i` with `nums[j] < nums[i]`, set `dp[i] = max(dp[i], dp[j] + 1)`. The answer is the maximum `dp[i]`.",
    why: "Trying all subsequences costs $2^n$. The DP removes that but still compares every pair `(j, i)`, i.e. $\\frac{n(n-1)}{2}$ comparisons: $O(n^2)$. For $n = 10^5$ that would be 5 billion. The next idea finds the position of `nums[i]` among the tails with binary search instead of scanning all earlier elements.",
    time: "O(n^2)", space: "O(n)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int lengthOfLIS(vector<int>& nums) {
        int n = nums.size(), best = 1;
        vector<int> dp(n, 1);
        for (int i = 1; i < n; i++)
            for (int j = 0; j < i; j++)
                if (nums[j] < nums[i]) dp[i] = max(dp[i], dp[j] + 1);
        for (int v : dp) best = max(best, v);
        return best;
    }
};`,
    js: `function lengthOfLIS(nums) {
  const n = nums.length, dp = new Array(n).fill(1);
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
  return Math.max(...dp);
}`,
  },

  pattern: {
    name: "Binary Search (patience sorting / tails)",
    why: "The optimisation keeps a **sorted** summary (`tails`) of what matters about all increasing subsequences found so far, and uses **binary search** to update it in $O(\\log n)$. It is *dynamic programming with a monotone state* plus binary search: a classic way to turn $O(n^2)$ into $O(n \\log n)$.",
    recognize: [
      "A subsequence problem where the $O(n^2)$ DP scans earlier elements for the best predecessor.",
      "The \"best predecessor\" can be replaced by a **monotone summary** (the smallest tail per length).",
      "That summary is **sorted**, so lookups can be done by binary search.",
      "Strictness (`<` vs `≤`) decides `lower_bound` vs `upper_bound`.",
    ],
  },

  optimal: {
    idea: "Keep an array `tails` where `tails[k]` is the smallest possible last value of an increasing subsequence of length `k + 1`. It is always sorted. For each number `x`: binary search the **first** `tails[p] ≥ x`. If there is none, append `x` (a subsequence one longer than any before). Otherwise overwrite `tails[p] = x` (same length, smaller tail, better for the future). The answer is the size of `tails`.",
    steps: [
      "Start with an empty `tails`.",
      "For each `x` in `nums`: find `p` = the first index with `tails[p] >= x` (`lower_bound`).",
      "If `p == tails.size()`: `x` is larger than every tail, so **append** it (the LIS grows by one).",
      "Else **replace** `tails[p] = x`.",
      "Return `tails.size()`.",
    ],
    invariant: "**`tails` is strictly increasing, and `tails[k]` is the smallest tail value over all strictly increasing subsequences of length `k + 1` found among the elements processed so far.**",
    correct: "*Sortedness:* if `tails[k] ≥ tails[k + 1]`, a subsequence of length `k + 2` ending at `tails[k+1]` contains one of length `k + 1` with an even smaller tail, contradicting minimality; so `tails` is strictly increasing. *Update:* a new `x` extends the subsequence ending at the largest tail `< x` (position `p − 1`), producing a subsequence of length `p + 1` ending at `x`; if `x < tails[p]` this is a **smaller** tail for that length, so we replace. If `x` is bigger than all tails it creates a new, longer length. `lower_bound` (first `≥ x`) enforces **strictness**: an equal value replaces itself rather than extending. At the end the number of lengths that have a tail is the LIS length. (Note: `tails` is *not* itself a subsequence of `nums`; it only stores the best tails.)",
  },

  cpp: `class Solution {
public:
    int lengthOfLIS(vector<int>& nums) {
        vector<int> tails;                                        // tails[k]: smallest tail of length k+1 //@init
        for (int x : nums) {                                      //@loop
            auto it = lower_bound(tails.begin(), tails.end(), x); // first tail >= x //@search
            if (it == tails.end()) tails.push_back(x);            // longer subsequence //@append
            else *it = x;                                         // smaller tail //@replace
        }
        return tails.size();                                      //@ret
    }
};`,
  js: `function lengthOfLIS(nums) {
  const tails = [];                                               // tails[k]: smallest tail of length k+1 //@init
  for (const x of nums) {                                         //@loop
    let lo = 0, hi = tails.length;                                // first tail >= x (binary search) //@search
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
    if (lo === tails.length) tails.push(x);                       // longer subsequence //@append
    else tails[lo] = x;                                           // smaller tail //@replace
  }
  return tails.length;                                            //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [10, 9, 2, 5, 3, 7, 101, 18] } },
    { name: "Example 2", kind: "normal", input: { nums: [0, 1, 0, 3, 2, 3] } },
    { name: "Example 3: all equal", kind: "normal", input: { nums: [7, 7, 7, 7, 7, 7, 7] } },
    { name: "Strictly decreasing", kind: "edge", input: { nums: [5, 4, 3, 2, 1] }, why: "Every new number is smaller than the only tail, so it **replaces** `tails[0]` each time. The answer is `1`: a single element. It shows `tails` can stay at length 1 while its value keeps dropping." },
    { name: "Strictly increasing", kind: "edge", input: { nums: [1, 2, 3, 4, 5] }, why: "Every number is larger than all tails, so it is **appended** each time: the answer is the whole length (5), and the binary search always lands at the end." },
    { name: "Duplicates must not extend", kind: "edge", input: { nums: [1, 2, 2, 3] }, why: "The answer is `3` (`1, 2, 3`), not 4: the second `2` must not extend `[1, 2]`. `lower_bound` finds the first tail `≥ 2`, which is the existing `2`, and replaces it. Using `upper_bound` would wrongly give the *non-strict* answer 4." },
    { name: "A single element", kind: "corner", input: { nums: [9] }, why: "`tails` is empty, `lower_bound` returns `end`, the element is appended: length 1." },
    { name: "Tails is not the subsequence", kind: "corner", input: { nums: [1, 5, 2, 0] }, why: "The answer is 2 (for example `1, 5` or `1, 2`), but `tails` ends as `[0, 2]`. In the input the `0` comes *after* the `2`, so `[0, 2]` is **not** a subsequence. `tails` only records the best tail per length: only its **length** is meaningful." },
    { name: "Negative numbers", kind: "corner", input: { nums: [-2, -1, -3, 0, -4, 1] }, why: "Binary search compares only values, so negatives need no special treatment. The longest run is `-2, -1, 0, 1` (4)." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    const tails = [];
    let whyTail = false, whyRep = false, whyApp = false, whyStrict = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      if (i != null && i < n) hl[i] = "cur";
      const th = {};
      if (o.pos != null) th[o.pos] = o.cls || "cmp";
      for (let k = 0; k < tails.length; k++) if (th[k] === undefined) th[k] = "ok";
      const rows = [{ label: "tails", arr: tails.length ? tails.slice() : ["∅"], hl: tails.length ? th : { 0: "empty" }, note: tails.length ? `length of the LIS so far = ${tails.length}` : "empty" }];
      return { arr: nums, hl, ptr: i != null && i < n ? { i } : {}, label: "nums", labelW: 96, rows, note: o.note };
    };
    T.step("init", { vars: { n }, state: S(0), phase: "One pass with a sorted array of tails", say: "`tails[k]` will hold the **smallest last value** of any increasing subsequence of length `k + 1` seen so far. It always stays sorted, which will let us use binary search.", op: "tails = [ ]", act: "START" });
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      let lo = 0, hi = tails.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
      const probes = Math.max(1, Math.ceil(Math.log2(tails.length + 1)));
      T.step("search", { w: 1 + probes, vars: { i, x, tails: tails.slice(), position: lo }, state: S(i, { pos: lo < tails.length ? lo : null, cls: "cmp", note: lo === tails.length ? `${x} is bigger than every tail (or tails is empty)` : `first tail ≥ ${x} is tails[${lo}] = ${tails[lo]}` }), say: tails.length === 0 ? `\`tails\` is empty, so **${x}** goes at position 0.` : lo === tails.length ? `Binary search for the first tail **≥ ${x}**: there is none, because ${x} is **larger than every tail**. It can extend the longest subsequence.` : `Binary search for the first tail **≥ ${x}** (\`lower_bound\`): it is \`tails[${lo}] = ${tails[lo]}\`.`, op: `p = lower_bound(tails, ${x}) = ${lo}   (${probes} probe${probes === 1 ? "" : "s"})`, act: "BINARY_SEARCH",
        why: whyTail ? null : { title: "Why is binary search allowed here?", text: "`tails` is strictly increasing (a longer subsequence can never end in a smaller value than a shorter one's best tail), so 'first tail ≥ x' is a monotone question: exactly what binary search is for." } });
      whyTail = true;
      if (lo === tails.length) {
        tails.push(x);
        T.step("append", { vars: { i, x, length: tails.length }, state: S(i, { pos: lo, cls: "hit", note: `appended ${x}: the LIS is now ${tails.length} long` }), say: `${x} is larger than all tails, so it extends the longest subsequence found so far: **append** it. The longest increasing subsequence now has length **${tails.length}**.`, op: `tails.push(${x})  →  length ${tails.length}`, act: "APPEND",
          why: whyApp ? null : { title: "Why does appending lengthen the LIS?", text: `The last tail is the smallest end of a subsequence of length ${tails.length - 1}. Since ${x} is bigger than it, we can add ${x} after that subsequence to get one of length ${tails.length}.` } });
        whyApp = true;
      } else {
        const old = tails[lo];
        tails[lo] = x;
        T.step("replace", { vars: { i, x, replaced: old, length: tails.length }, state: S(i, { pos: lo, cls: "hit", note: `tails[${lo}]: ${old} → ${x}` }), say: old === x ? `\`tails[${lo}]\` is already **${x}**: an equal value does **not** extend anything (the subsequence must be *strictly* increasing), so nothing changes.` : `Replace \`tails[${lo}] = ${old}\` by the smaller **${x}**. The length of the best subsequence does not change, but its **tail is smaller**, which makes it easier to extend later.`, op: `tails[${lo}] = ${x}   (was ${old})`, act: old === x ? "SAME_VALUE" : "REPLACE",
          why: old === x ? (whyStrict ? null : { title: "Why does an equal value replace and not extend?", text: "The subsequence must be strictly increasing. lower_bound returns the first tail ≥ x, which is the equal value itself, so the new x takes its place instead of going after it." }) : (whyRep ? null : { title: "Why replace with a smaller tail?", text: `Any subsequence of length ${lo + 1} ending in ${old} could also end in ${x} (smaller). A smaller end can only help future numbers, so ${x} is at least as good and we keep it instead.` }) });
        if (old === x) whyStrict = true; else whyRep = true;
      }
    }
    T.step("ret", { vars: { length: tails.length }, state: S(null, { note: `the answer is the length of tails = ${tails.length}` }), say: `All numbers processed. \`tails\` has **${tails.length}** entr${tails.length === 1 ? "y" : "ies"}, so the longest strictly increasing subsequence has length **${tails.length}**. (\`tails\` itself is not necessarily a subsequence of the input: only its length is the answer.)`, op: `return tails.size() = ${tails.length}`, act: "DONE" });
    T.result(tails.length);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 12); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 12) - 4) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i) }; },

  complexity: {
    time: {
      tex: "O(n \\log n)", title: "n numbers, each a binary search of O(log n)", short: "tails never has more than n entries",
      derive: [
        "\\text{for each of the } n \\text{ numbers: one binary search on } |\\text{tails}| \\le n || `lower_bound` on a sorted array",
        "\\text{probes} \\le \\lfloor \\log_2 (|\\text{tails}| + 1) \\rfloor + 1 \\le \\lfloor \\log_2 n \\rfloor + 2 || binary search halves the range each probe",
        "T(n) \\le n\\,(c_1 \\log_2 n + c_2) || plus a constant-time append or replace",
        "!T(n) = O(n \\log n) || versus $\\tfrac{n(n-1)}{2}$ comparisons for the $O(n^2)$ DP",
      ],
      where: "The measured table uses an increasing input (the worst case: `tails` grows to $n$, so each search takes about $\\log_2 n$ probes) and counts each probe as one step. The brute force's $O(n^2)$ becomes $n \\log_2 n$.",
    },
    space: {
      tex: "O(n)", title: "the tails array", short: "at most n entries (when the input is increasing)",
      derive: [
        "S(n) = |\\text{tails}| \\cdot s_{\\text{int}} || the only structure",
        "|\\text{tails}| = \\text{LIS length} \\le n",
        "!S(n) = O(n) || (the quadratic DP also needs $O(n)$)",
      ],
      where: "`tails` holds one value per length, so at most the length of the LIS, which is at most `n`.",
    },
    limit: "$\\Omega(n \\log n)$ comparisons are needed in the comparison model (it is as hard as sorting-like tasks), so $O(n \\log n)$ is optimal for this problem.",
    measure: { label: "n = nums.length (increasing input)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Using `upper_bound` (or `≤`) instead of `lower_bound`", what: "Finding the first tail `> x`.", why: "Both are binary searches that look alike.", breaks: "Equal values extend the subsequence, so `[7, 7, 7]` would give 3 instead of 1 (that is the *non-decreasing* answer).", avoid: "Strict increase needs `lower_bound`: the first tail `≥ x`." },
    { title: "Believing `tails` is the LIS", what: "Printing `tails` as the answer subsequence.", why: "It looks like an increasing sequence made of input elements.", breaks: "It is **not** necessarily a subsequence of the input: replacing a tail can put a later element before an earlier one in position terms. Only its **length** is the answer.", avoid: "To recover an actual LIS, store for each element its predecessor (indices) and rebuild by walking back." },
    { title: "Appending without searching", what: "`if (x > tails.back()) push_back(x); else tails.back() = x;`", why: "Thinking only the last tail matters.", breaks: "A small `x` should replace a **middle** tail, not the last one: `[1, 3, 5, 2, 4]` would lose the `2`'s better tail and give a wrong length.", avoid: "Binary search for the correct slot." },
    { title: "Forgetting the empty-array case in the search", what: "Reading `tails.back()` on an empty `tails`.", why: "Assuming at least one element was processed.", breaks: "Undefined behaviour in C++ (`back()` of an empty vector).", avoid: "Use `lower_bound` on the range (it handles the empty range) and append when it returns `end()`." },
    { title: "Stopping at the $O(n^2)$ DP without noticing a better one", what: "Submitting the double loop for $n = 2500$.", why: "It passes the stated limits of this problem.", breaks: "It is too slow when the follow-up asks for $O(n \\log n)$ (or $n = 10^5$).", avoid: "Know both: DP (easy to prove) and tails + binary search (fast)." },
  ],

  followUps: [
    {
      q: "Return an actual longest increasing subsequence, not just its length.",
      a: "Store, for each element, the **index** of the tail it replaced or extended, and a `prev[i]` pointer to the index of the tail just before it (the last index in `tails` at position `p − 1` when `x` was placed at `p`). Keep the **indices** in `tails` instead of values (comparing `nums[tails[k]]`). At the end, start from the last index in `tails` and follow `prev` pointers back, then reverse. Still $O(n \\log n)$.",
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "Count how many longest increasing subsequences there are.",
      a: "Use the $O(n^2)$ DP with two arrays: `len[i]` (the LIS length ending at `i`) and `cnt[i]` (how many such subsequences). For each `j < i` with `nums[j] < nums[i]`: if `len[j] + 1 > len[i]`, set `len[i] = len[j] + 1` and `cnt[i] = cnt[j]`; if equal, `cnt[i] += cnt[j]`. Sum `cnt[i]` over those with maximal `len`. A segment tree / BIT version gets $O(n \\log n)$.",
      time: "O(n²)", space: "O(n)",
    },
    {
      q: "Allow *non-decreasing* subsequences (equal values may repeat).",
      a: "Switch `lower_bound` to `upper_bound` (the first tail **strictly greater** than `x`): equal values then go *after* existing equal tails and extend the subsequence. That is the only change.",
      cpp: `int lengthOfNonDecreasing(vector<int>& nums) {
    vector<int> tails;
    for (int x : nums) {
        auto it = upper_bound(tails.begin(), tails.end(), x);   // first tail > x
        if (it == tails.end()) tails.push_back(x); else *it = x;
    }
    return tails.size();
}`,
      js: `function lengthOfNonDecreasing(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] <= x) lo = mid + 1; else hi = mid; }   // first tail > x
    if (lo === tails.length) tails.push(x); else tails[lo] = x;
  }
  return tails.length;
}`,
      time: "O(n log n)", space: "O(n)",
    },
    {
      q: "How is LIS related to the **longest common subsequence**?",
      a: "The LIS of an array with **distinct** elements equals the LCS of the array and its **sorted** copy. That gives an $O(n^2)$ solution through the LCS table, and shows that LIS is a special case of LCS. The $O(n \\log n)$ method is faster because it exploits that one of the two sequences is *sorted*.",
      time: "O(n²)", space: "O(n²)",
    },
  ],

  related: [
    { id: "longest-common-subsequence", why: "The 2D table version of subsequence problems; LIS = LCS of the array and its sorted copy." },
    { id: "binary-search", why: "The `lower_bound` search at the heart of the fast solution." },
    { id: "maximum-subarray", why: "Another \"best ending here\" problem, with contiguous segments." },
    { id: "coin-change", why: "Another DP where the state is the best result for a smaller input." },
  ],
  patternNote: "**Patience-sorting LIS** is DP with a *monotone summary*: instead of remembering the best result for each index, remember the best (smallest) tail for each possible *length*, which is sorted and so can be searched in $O(\\log n)$. Whenever an $O(n^2)$ DP picks \"the best earlier compatible element\", ask if a sorted summary can answer it faster.",
  takeaways: [
    "`tails[k]` = the smallest tail of an increasing subsequence of length `k + 1`; it is always **sorted**.",
    "For each `x`: `lower_bound` the first tail `≥ x`; append if none, else replace. The answer is `tails.size()`.",
    "`lower_bound` gives **strictly** increasing; `upper_bound` gives non-decreasing.",
    "`tails` is **not** the subsequence itself; only its length is meaningful.",
    "Time $O(n \\log n)$, space $O(n)$; the simple DP is $O(n^2)$.",
  ],
});
