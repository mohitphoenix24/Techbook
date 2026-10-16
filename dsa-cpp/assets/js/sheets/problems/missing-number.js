SHEETS.define({
  id: "missing-number",
  viz: "bit",
  io: { fn: "missingNumber", params: [["nums", "int[]"]], ret: "int" },

  statement: `Given an array \`nums\` containing \`n\` **distinct** numbers taken from the range \`[0, n]\`, return the **one number in that range that is missing** from the array.`,
  examples: [
    { input: "nums = [3, 0, 1]", output: "2", explain: "`n = 3`, so the range is `[0, 3]`. The number `2` does not appear." },
    { input: "nums = [0, 1]", output: "2", explain: "`n = 2`, range `[0, 2]`: `2` is missing." },
    { input: "nums = [9, 6, 4, 2, 3, 5, 7, 0, 1]", output: "8", explain: "`n = 9`, range `[0, 9]`: `8` is missing." },
  ],
  constraints: ["`n == nums.length`", "$1 \\le n \\le 10^4$", "$0 \\le$ `nums[i]` $\\le n$", "All the numbers of `nums` are **unique**."],
  check(input) {
    const n = input.nums.length, s = new Set(input.nums);
    if (s.size !== n) return "the numbers must all be different";
    if (input.nums.some((v) => v < 0 || v > n)) return `every number must be between 0 and ${n} (the length)`;
    return null;
  },

  intuition: {
    find: "The single value in `0 … n` that is **not** in the array. The array has `n` numbers and the range has `n + 1` values, so exactly one is missing.",
    beginner: "For each candidate `v` from `0` to `n`, scan the array to see whether `v` appears. The first `v` that does not appear is the answer.",
    works: "Every candidate is tested against every element, so the one that is absent is found.",
    slow: "For each of the `n + 1` candidates we scan up to `n` elements: $O(n^2)$, about $10^8$ steps for $n = 10^4$.",
    repeat: "Each scan is a *membership test* (\"is `v` in the array?\"), repeated for every `v`. We could answer them all with one pass if we remembered what appears.",
    remember: "Remember the array's contents in a hash set (membership in $O(1)$), or sort the array and look for a gap. Both work; the hash set costs $O(n)$ memory, the sort costs $O(n \\log n)$ time. Is there something cheaper still?",
    observation: "Compare two collections: the full range `0, 1, …, n` and the array. Every value appears **twice** across them (once in each) except the missing one, which appears **once**. XOR has a perfect property for that: `x ^ x = 0` and `x ^ 0 = x`. XOR everything together and all pairs cancel, leaving only the missing value.",
    leads: "Start with `x = n` (the one range value that has no index). For each index `i`, do `x ^= i ^ nums[i]`: it XORs the index (a range value) and the array element. After the loop, every present value has been XORed twice and cancelled; `x` is the missing number. $O(n)$ time, $O(1)$ space.",
  },

  flow: [
    "For each `v` in `0..n`, scan the array to see whether it contains `v`.",
    "Every candidate is checked against every element, so the absent one is found.",
    "$O(n^2)$: each scan is a membership test repeated `n + 1` times.",
    "Across the range `0..n` and the array, every value appears twice except the missing one.",
    "XOR cancels pairs: `x ^ x = 0`, `x ^ 0 = x`.",
    "XOR all indices and all elements (starting from `n`): what is left is the missing number. $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for each `v` from `0` to `n`, scan `nums` for `v`. Return the first `v` that is not found.",
    why: "There are `n + 1` candidates and each scan costs up to `n` comparisons: $O(n^2)$. Each scan answers a single yes/no question that a single pass (with a set, a sort or XOR) could have answered for **all** values together.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n+1)}{2}", f: (n) => (n * (n + 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int missingNumber(vector<int>& nums) {
        int n = nums.size();
        for (int v = 0; v <= n; v++) {
            bool found = false;
            for (int x : nums) if (x == v) { found = true; break; }
            if (!found) return v;
        }
        return -1;
    }
};`,
    js: `function missingNumber(nums) {
  for (let v = 0; v <= nums.length; v++) {
    let found = false;
    for (const x of nums) if (x === v) { found = true; break; }
    if (!found) return v;
  }
  return -1;
}`,
  },

  pattern: {
    name: "Bit Manipulation (XOR)",
    why: "XOR is its own inverse: `a ^ a = 0` and `a ^ 0 = a`, and it is commutative and associative. So XOR-ing a collection in which every value appears **twice except one** leaves exactly that one value. That makes XOR a free, in-place *pair canceller*, with no sorting and no hash set.",
    recognize: [
      "Every value appears an **even number of times** except one (or two) special values.",
      "You can build the *expected* collection (a range, a full set) and compare with the *actual* one.",
      "The statement asks for $O(1)$ extra space and $O(n)$ time on a *find the odd one out* task.",
      "Sum-based tricks are risky because of overflow, but XOR never overflows.",
    ],
  },

  optimal: {
    idea: "XOR together all the numbers `0, 1, …, n` and all the elements of `nums`. Every number that is present occurs once in the range and once in the array, so it cancels to `0`; the missing number occurs only in the range, so it survives. Do it in one loop by XOR-ing `i` and `nums[i]` together, starting with `n`.",
    steps: [
      "Start with `x = n` (the range value that has no matching index).",
      "For each index `i` from `0` to `n − 1`: `x ^= i ^ nums[i]`.",
      "After the loop, return `x`.",
    ],
    invariant: "**After processing indices `0..i`, `x` equals the XOR of `n`, of the indices `0..i`, and of the elements `nums[0..i]`.** In the end that is the XOR of all range values and all elements.",
    correct: "Let `M` be the missing number. The range values are `0, 1, …, n` and the array holds all of them except `M`. The XOR of the range and the array is `(0 ^ 1 ^ … ^ n) ^ (all elements)`. Each value `v ≠ M` appears in both, contributing `v ^ v = 0`; `M` appears only in the range, contributing `M`. XOR is commutative and associative, so the total is `0 ^ … ^ 0 ^ M = M`. The loop computes exactly this XOR: the indices `0..n−1` plus the initial `n` give the whole range.",
  },

  cpp: `class Solution {
public:
    int missingNumber(vector<int>& nums) {
        int x = nums.size();                         // start with n //@init
        for (int i = 0; i < (int)nums.size(); i++)   //@loop
            x ^= i ^ nums[i];                        // pairs cancel //@xor
        return x;                                    //@ret
    }
};`,
  js: `function missingNumber(nums) {
  let x = nums.length;                               // start with n //@init
  for (let i = 0; i < nums.length; i++)              //@loop
    x ^= i ^ nums[i];                                // pairs cancel //@xor
  return x;                                          //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [3, 0, 1] } },
    { name: "Example 2", kind: "normal", input: { nums: [0, 1] } },
    { name: "Example 3: unsorted", kind: "normal", input: { nums: [9, 6, 4, 2, 3, 5, 7, 0, 1] } },
    { name: "The missing number is 0", kind: "edge", input: { nums: [1, 2, 3] }, why: "The answer is `0`, the smallest value in the range. `x` ends as `0`, which is a perfectly valid answer: don't treat `0` as \"nothing found\"." },
    { name: "The missing number is n", kind: "edge", input: { nums: [0, 1, 2, 3] }, why: "The range is `0..4` but the array stops at `3`. Starting `x` at `n` is what makes this case work: no index equals `n`, so `n` would otherwise never be XORed in and could never be the answer." },
    { name: "Unsorted, missing in the middle", kind: "edge", input: { nums: [5, 3, 0, 4, 1] }, why: "XOR does not care about order, only about *which* values appear, so unsorted input needs no preprocessing." },
    { name: "A single element, 0 present", kind: "corner", input: { nums: [0] }, why: "`n = 1`, range `[0, 1]`: `1` is missing. `x = 1 ^ 0 ^ 0 = 1`." },
    { name: "A single element, 1 present", kind: "corner", input: { nums: [1] }, why: "`n = 1`, the array holds `1` so `0` is missing: `x = 1 ^ 0 ^ 1 = 0`. The smallest case where the answer is 0." },
    { name: "Reversed order", kind: "corner", input: { nums: [5, 4, 3, 2, 1] }, why: "Range `0..5`, array `5,4,3,2,1`: the missing value is `0`. Reversed input checks again that order is irrelevant." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    let x = n, whyCancel = false, whyStart = false;
    const W = Math.max(4, n.toString(2).length + 1);
    const seen = [];
    const S = (i, o = {}) => () => {
      const arrHl = {};
      for (let k = 0; k < (i ?? 0); k++) arrHl[k] = "ok";
      if (i != null && i < n) arrHl[i] = "cur";
      const rows = [{ label: "x", value: o.xv ?? x, width: W, hl: o.xhl, cls: "hit", note: o.xnote }];
      if (o.i != null) { rows.push({ label: `i = ${o.i}`, value: o.i, width: W, hl: {}, note: "an index (a value of the range)" }); rows.push({ label: `nums[${o.i}]`, value: nums[o.i], width: W, hl: {}, note: "an array element" }); }
      return { rows, width: W, arr: nums, arrLabel: "nums", arrHl, arrPtr: i != null && i < n ? { i } : {}, label: o.label || "running XOR", note: o.note };
    };
    T.step("init", { vars: { x, n }, state: S(null, { label: `x starts as n = ${n}`, xnote: "the range value 'n' has no index to be XORed with" }), phase: "XOR everything: pairs cancel", say: `The array has ${n} numbers from \`0..${n}\`, so exactly one of those ${n + 1} values is missing. Start with \`x = n = ${n}\`: the range value **${n}** is the only one with no index of its own.`, op: `x = n = ${n}`, act: "START",
      why: whyStart ? null : { title: "Why start at n?", text: "The loop XORs the indices `0..n−1`, which are only the first `n` range values. The last range value, `n`, needs to be XORed in too, so we start `x` with it." } });
    whyStart = true;
    for (let i = 0; i < n; i++) {
      const before = x;
      x = x ^ i ^ nums[i];
      T.step("xor", { vars: { i, "nums[i]": nums[i], x_before: before, x }, state: S(i, { i, xv: x, xnote: `${before} ^ ${i} ^ ${nums[i]}`, label: `x = x ^ i ^ nums[i] = ${before} ^ ${i} ^ ${nums[i]} = ${x}` }), say: `XOR in the index **${i}** (a range value) and the element **${nums[i]}** (an array value): \`${before} ^ ${i} ^ ${nums[i]} = ${x}\`. ${i === nums[i] ? `Here the index and the element are equal, so they cancel each other (\`${i} ^ ${i} = 0\`).` : `If the value ${i} is somewhere else in the array (or ${nums[i]} appears as another index), their copies will cancel later.`}`, op: `x = ${before} ^ ${i} ^ ${nums[i]} = ${x}`, act: "XOR",
        why: whyCancel ? null : { title: "Why does the missing number survive?", text: "Each value present in the array is XORed once as an index and once as an element: `v ^ v = 0`. The missing value is only ever XORed as an index, so nothing cancels it. XOR is commutative, so the order we meet the values in does not matter." } });
      whyCancel = true;
    }
    T.step("ret", { vars: { x }, state: S(null, { xv: x, label: "everything has been XORed", note: `${x} is the only value that was never cancelled` }), say: `Every value that appears in the array was XORed twice and cancelled out. What is left is **${x}**: the missing number.`, op: `return x = ${x}`, act: "DONE" });
    T.result(x);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 10), all = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return { nums: all.slice(0, n) };
  },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i + 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "a single pass of n XORs", short: "n iterations, each two XORs",
      derive: [
        "T(n) = c_0 + \\sum_{i=0}^{n-1} \\big( c_{\\oplus} + c_{\\oplus} \\big) || each iteration performs two XORs and an index step",
        "T(n) = c_0 + 2c\\,n || constants merge",
        "!T(n) = O(n) || every element is read once",
      ],
      where: "Compare with the brute force, which searches the whole array for each candidate. XOR processes **all** the membership questions together because cancellation does the bookkeeping.",
    },
    space: {
      tex: "O(1)", title: "one integer", short: "just `x`",
      derive: [
        "S(n) = |x| + |i| || the only variables",
        "!S(n) = 2c = O(1) || no hash set, no sorted copy",
      ],
      where: "A hash set would take $O(n)$, a sorted copy $O(n)$. XOR keeps a single running value.",
    },
    limit: "Every element must be read, so $\\Omega(n)$ time is needed, and a constant amount of memory is already optimal.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Starting `x` at 0 and forgetting `n`", what: "`int x = 0; for i in 0..n-1: x ^= i ^ nums[i];`", why: "The loop only touches indices `0..n − 1`.", breaks: "The range value `n` is never XORed in, so when the missing number is `n` the result is wrong (it returns 0 instead of `n`).", avoid: "Start with `x = n`, or loop `i` from `0` to `n` and treat `nums[n]` as `0`." },
    { title: "Using the sum formula with overflow", what: "`n·(n+1)/2 − sum(nums)` in a 32-bit `int`.", why: "It is a famous alternative and correct in exact arithmetic.", breaks: "For large `n` the intermediate `n·(n+1)` overflows `int` (at about $n > 46{,}000$), giving a wrong answer without any error.", avoid: "Use `long long`, or use XOR, which cannot overflow." },
    { title: "Sorting the input when it must not be modified", what: "Sorting `nums` and scanning for the first gap.", why: "It is simple and correct.", breaks: "It costs $O(n \\log n)$ and changes the caller's array (or uses $O(n)$ extra space for a copy).", avoid: "State the trade-off; XOR gets $O(n)$ time and $O(1)$ space." },
    { title: "Treating the answer `0` as \"not found\"", what: "Using `0` as a sentinel for failure.", why: "`0` looks like a default.", breaks: "When `0` is the missing number, the correct answer is returned but a caller (or your own check) treats it as an error.", avoid: "There is always exactly one missing number; there is no failure value." },
    { title: "Assuming the numbers are sorted", what: "Binary searching the array for the gap.", why: "The examples look sorted.", breaks: "`[3, 0, 1]` and `[9, 6, 4, …]` are not sorted, so a binary search is wrong without sorting first.", avoid: "Only rely on sortedness if the statement says so; XOR and sums do not need it." },
  ],

  followUps: [
    {
      q: "Solve it with the **sum formula**. What must you watch out for?",
      a: "The sum of `0..n` is `n(n+1)/2`, so the missing number is `n(n+1)/2 − sum(nums)`. It is $O(n)$ time and $O(1)$ space and very short. The danger is **overflow**: `n(n+1)` exceeds a 32-bit `int` for $n$ above about 46,000, so use `long long`. XOR never overflows, which is why it is often preferred.",
      cpp: `int missingNumberSum(vector<int>& nums) {
    long long n = nums.size(), expected = n * (n + 1) / 2, sum = 0;
    for (int x : nums) sum += x;
    return (int)(expected - sum);
}`,
      js: `function missingNumberSum(nums) {
  const n = nums.length;
  let sum = 0;
  for (const x of nums) sum += x;
  return (n * (n + 1)) / 2 - sum;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Solve it with a **hash set** or by **sorting**. When would you choose each?",
      a: "*Hash set:* insert all elements, then test `0..n`: $O(n)$ time, $O(n)$ space, easy to get right. *Sorting:* sort and find the first index `i` with `nums[i] != i`: $O(n \\log n)$ time, $O(1)$ extra space if you may sort in place. Choose the set when memory is plentiful, sorting when space is tight and speed less so; XOR or the sum beat both.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Now **two** numbers are missing. How do you find them?",
      a: "XOR everything as before: you get `a ^ b` (the two missing values). Since `a ≠ b`, that XOR has at least one set bit; pick the lowest set bit `d`. It separates the values into two groups (bit `d` set / not set), and `a` and `b` fall into different groups. XOR the range values and elements of each group separately: each group's result is one of the missing numbers. $O(n)$ time, $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Find the **single number** that appears once in an array where every other number appears twice.",
      a: "XOR the whole array: all pairs cancel and the single number remains. This is the *Single Number* problem, and the idea of this lesson (XOR as a pair canceller) solves it directly in $O(n)$ time and $O(1)$ space.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "sum-of-two-integers", why: "XOR again, this time as the *sum without carries*." },
    { id: "number-of-1-bits", why: "More bit tricks that replace extra memory with a clever identity." },
    { id: "contains-duplicate", why: "The hash-set approach to a related \"what appears / repeats\" question." },
    { id: "counting-bits", why: "Reuse of known answers with bit identities." },
  ],
  patternNote: "**The XOR pair-cancelling pattern** uses `a ^ a = 0` and `a ^ 0 = a`. If every value appears twice except the one you want, XOR-ing everything leaves it, with no extra memory and no sorting. You can create the pairs yourself, as here, by also XOR-ing the *expected* collection (the full range).",
  takeaways: [
    "Across the range `0..n` and the array, every value appears twice except the missing one: **XOR cancels pairs**.",
    "Start with `x = n`, then `x ^= i ^ nums[i]` for each index: the survivor is the missing number.",
    "Time $O(n)$, space $O(1)$; order does not matter; XOR cannot overflow (the sum formula can).",
    "The answer may be `0` or `n`: starting `x` at `n` covers the second case.",
    "Same idea: Single Number, and with one extra step, two missing/unique numbers.",
  ],
});
