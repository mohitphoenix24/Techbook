SHEETS.define({
  id: "product-of-array-except-self",
  viz: "array",
  io: { fn: "productExceptSelf", params: [["nums", "int[]"]], ret: "int[]" },

  statement: `Given an integer array \`nums\`, return an array \`answer\` such that \`answer[i]\` is the product of **all the elements of \`nums\` except \`nums[i]\`**.

You must solve it in $O(n)$ time **without using division**. Every prefix or suffix product is guaranteed to fit in a 32-bit integer.`,
  examples: [
    { input: "nums = [1, 2, 3, 4]", output: "[24, 12, 8, 6]", explain: "`answer[0] = 2·3·4 = 24`, `answer[1] = 1·3·4 = 12`, `answer[2] = 1·2·4 = 8`, `answer[3] = 1·2·3 = 6`." },
    { input: "nums = [-1, 1, 0, -3, 3]", output: "[0, 0, 9, 0, 0]", explain: "Every product that includes the `0` is `0`; only `answer[2]` leaves the zero out: `(-1)·1·(-3)·3 = 9`." },
  ],
  constraints: ["$2 \\le$ `nums.length` $\\le 10^5$", "$-30 \\le$ `nums[i]` $\\le 30$", "The product of any prefix or suffix fits in a 32-bit integer."],

  intuition: {
    find: "For **each** position `i`, the product of everything except `nums[i]`: the product of the elements to its left times the product of the elements to its right.",
    beginner: "For each `i`, multiply all the other elements in an inner loop (skipping `i`).",
    works: "It computes each requested product literally, so it is obviously correct, and it needs no division.",
    slow: "Each of the `n` answers takes $O(n)$ multiplications: $O(n^2)$ in total. For $n = 10^5$ that is $10^{10}$ multiplications.",
    repeat: "Neighbouring answers share almost all of their factors. `answer[i]` and `answer[i+1]` both contain the whole prefix `nums[0..i−1]`, and both contain the suffix `nums[i+2..]`. We multiply those same long runs again and again.",
    remember: "The product of everything to the **left** of `i` can be built up as we walk right (a *prefix product*), and the product of everything to the **right** of `i` can be built up walking left (a *suffix product*). Each is a running number.",
    observation: "`answer[i] = (product of nums[0..i−1]) × (product of nums[i+1..n−1])`. Both factors are *prefix* and *suffix* products, and each next one is the previous one times one new element. Division (total ÷ `nums[i]`) is not allowed and would fail anyway when the array contains a `0`.",
    leads: "Pass 1 (left to right): store in `answer[i]` the product of everything to the left of `i`. Pass 2 (right to left): keep a running product of everything to the right and multiply it into `answer[i]`. Two passes, $O(n)$ time, and only the output array as extra space.",
  },

  flow: [
    "For every `i`, loop over all other elements and multiply them.",
    "Each answer is computed exactly as defined, so it is correct and needs no division.",
    "$n$ answers × $n$ multiplications = $O(n^2)$, repeating almost identical products.",
    "`answer[i]` = (product to the left of `i`) × (product to the right of `i`).",
    "Prefix products and suffix products are each a running value built in one pass.",
    "Two passes (left→right, then right→left) into the output array: $O(n)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force:** for every index `i`, run an inner loop over all `j ≠ i` and multiply `nums[j]` into a running product. Store it as `answer[i]`.",
    why: "There are `n` outputs and each takes `n − 1` multiplications: $n(n-1) = \\Theta(n^2)$. The inner loops recompute huge shared products (the whole prefix and the whole suffix) for every single `i`.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "n(n-1)", f: (n) => n * (n - 1), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> answer(n, 1);
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (j != i) answer[i] *= nums[j];
        return answer;
    }
};`,
    js: `function productExceptSelf(nums) {
  const n = nums.length, answer = new Array(n).fill(1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (j !== i) answer[i] *= nums[j];
  return answer;
}`,
  },

  pattern: {
    name: "Prefix and Suffix Products",
    why: "Each answer is a product over *everything left of `i`* and *everything right of `i`*. Those are prefix and suffix aggregates, and an aggregate of a growing prefix is cheap to maintain: the next prefix is the previous one combined with one new element. Precomputing prefix/suffix summaries turns \"for every `i`, aggregate the rest\" into two linear passes.",
    recognize: [
      "For each index you need an aggregate (sum, product, min, max, gcd) of **everything except itself**, or of everything to its left/right.",
      "The brute force has an inner loop that re-aggregates a range that overlaps with the previous one.",
      "Division (or subtraction, for sums) is forbidden or unsafe (zeros!), so you cannot use *total ÷ element*.",
      "Combining a **left-to-right pass** with a **right-to-left pass** is the natural fix.",
    ],
  },

  optimal: {
    idea: "Use the output array itself to hold prefix products. First pass, left to right: `answer[i]` becomes the product of `nums[0..i−1]` (`answer[0] = 1`, the empty product). Second pass, right to left: keep `suffix`, the product of `nums[i+1..n−1]`, and multiply it into `answer[i]`, then fold `nums[i]` into `suffix`.",
    steps: [
      "Create `answer` of size `n`. Keep a running `prefix = 1`.",
      "**Pass 1 (left → right):** for each `i`, set `answer[i] = prefix`, then `prefix *= nums[i]`.",
      "Now `answer[i]` = product of everything **left** of `i`.",
      "Keep a running `suffix = 1`.",
      "**Pass 2 (right → left):** for each `i`, set `answer[i] *= suffix`, then `suffix *= nums[i]`.",
      "Return `answer`.",
    ],
    invariant: "**After pass 1, `answer[i] = nums[0] × … × nums[i−1]`. During pass 2, at index `i`, `suffix = nums[i+1] × … × nums[n−1]`**, so multiplying gives exactly the product of everything except `nums[i]`.",
    correct: "Pass 1 writes `answer[i] = prefix` *before* folding in `nums[i]`, so `nums[i]` is excluded and `answer[i]` is the product of all elements to its left (the empty product for `i = 0` is 1). Pass 2 multiplies by `suffix` *before* folding in `nums[i]`, so at index `i` it contributes exactly the product of all elements to the right. Hence `answer[i] = left(i) × right(i)`, the product of everything except `nums[i]`. Zeros need no special handling: a zero simply makes every product that includes it zero.",
  },

  cpp: `class Solution {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> answer(n, 1);                  //@init
        int prefix = 1;
        for (int i = 0; i < n; i++) {              //@loop1
            answer[i] = prefix;                    // everything left of i //@left
            prefix *= nums[i];                     //@growleft
        }
        int suffix = 1;
        for (int i = n - 1; i >= 0; i--) {         //@loop2
            answer[i] *= suffix;                   // times everything right of i //@right
            suffix *= nums[i];                     //@growright
        }
        return answer;                             //@ret
    }
};`,
  js: `function productExceptSelf(nums) {
  const n = nums.length;
  const answer = new Array(n).fill(1);             //@init
  let prefix = 1;
  for (let i = 0; i < n; i++) {                    //@loop1
    answer[i] = prefix;                            // everything left of i //@left
    prefix *= nums[i];                             //@growleft
  }
  let suffix = 1;
  for (let i = n - 1; i >= 0; i--) {               //@loop2
    answer[i] *= suffix;                           // times everything right of i //@right
    suffix *= nums[i];                             //@growright
  }
  return answer;                                   //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [1, 2, 3, 4] } },
    { name: "Example 2: with a zero", kind: "normal", input: { nums: [-1, 1, 0, -3, 3] } },
    { name: "Mixed signs", kind: "normal", input: { nums: [2, -3, 4, -1] } },
    { name: "Two zeros", kind: "edge", input: { nums: [0, 4, 0, 5] }, why: "With two zeros, **every** product contains at least one zero, so the whole answer is `[0, 0, 0, 0]`. The \"total ÷ element\" trick would divide by zero here, which is one reason the problem forbids division." },
    { name: "A single zero", kind: "edge", input: { nums: [3, 0, 2] }, why: "Only the position of the zero gets a non-zero answer (the product of the others, `3 × 2 = 6`); all other positions include the zero and become `0`. Prefix/suffix products handle this with no special case." },
    { name: "All ones", kind: "edge", input: { nums: [1, 1, 1, 1] }, why: "Every answer is `1`. It checks that the empty product is `1` (not `0`): `answer[0]` has nothing on its left." },
    { name: "Smallest input: two elements", kind: "corner", input: { nums: [5, 7] }, why: "With two elements each answer is simply the *other* element: `[7, 5]`. Both the prefix of `answer[0]` and the suffix of `answer[1]` are empty products (1)." },
    { name: "Negative numbers only", kind: "corner", input: { nums: [-2, -3, -4] }, why: "Signs combine: `(-3)(-4) = 12`, `(-2)(-4) = 8`, `(-2)(-3) = 6`. All three answers are positive. It confirms the algorithm needs no absolute values or sign handling." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    const ans = Array.from({ length: n }, () => 1);
    let prefix = 1, suffix = 1, whyL = false, whyR = false;
    const written1 = new Set(), written2 = new Set();
    const S = (i, o = {}) => () => {
      const hl = {}, h2 = {};
      for (let k = 0; k < n; k++) { if (written1.has(k)) h2[k] = "ok"; if (written2.has(k)) h2[k] = "hit"; }
      if (i != null) { hl[i] = "cur"; h2[i] = o.pass === 2 ? "cur" : "cur"; }
      if (o.pass === 1) for (let k = 0; k < (i ?? 0); k++) hl[k] = "win";
      if (o.pass === 2) for (let k = (i ?? n - 1) + 1; k < n; k++) hl[k] = "win";
      const ptr = i != null ? { i } : {};
      return { arr: nums, hl, ptr, label: "nums", labelW: 92, label2: "", rows: [{ label: "answer", arr: ans.map((v, k) => (o.shown && o.shown[k] === false ? "·" : v)), hl: h2 }], regs: [{ k: "prefix (everything left of i)", v: prefix, cls: o.pass === 1 ? "cur" : "dim" }, { k: "suffix (everything right of i)", v: o.pass === 2 || o.afterAll ? suffix : "–", cls: o.pass === 2 ? "cur" : "dim" }], note: o.note };
    };
    const shown = Array.from({ length: n }, () => false);
    const view = () => shown.map((s) => s);
    T.step("init", { vars: { prefix, suffix }, state: () => ({ arr: nums, hl: {}, ptr: {}, label: "nums", labelW: 92, rows: [{ label: "answer", arr: ans.map(() => "·"), hl: {} }], regs: [{ k: "prefix (everything left of i)", v: 1, cls: "dim" }, { k: "suffix (everything right of i)", v: "–", cls: "dim" }] }), phase: "Pass 1: products of everything to the LEFT", say: "`answer` starts as a row of 1s (not yet filled). Pass 1 will write into it, from left to right, the product of **everything to the left** of each position.", op: "answer = [1, 1, …, 1]", act: "START" });
    for (let i = 0; i < n; i++) {
      ans[i] = prefix; written1.add(i); shown[i] = true;
      T.step("left", { vars: { i, prefix, "answer[i]": ans[i] }, state: S(i, { pass: 1, shown: view() }), say: `\`answer[${i}] = prefix = ${prefix}\`: the product of everything to the left of index ${i}${i === 0 ? " (nothing, so the empty product **1**)" : ` (${nums.slice(0, i).join(" × ")})`}. Note that \`nums[${i}]\` is **not** included yet.`, op: `answer[${i}] = prefix = ${prefix}`, act: "STORE_LEFT",
        why: whyL ? null : { title: "Why write BEFORE multiplying?", text: "`answer[i]` must exclude `nums[i]`. Writing the prefix first leaves `nums[i]` out; folding it into `prefix` afterwards prepares the value for the *next* index." } });
      whyL = true;
      prefix *= nums[i];
      T.step("growleft", { vars: { i, prefix }, state: S(i, { pass: 1, shown: view() }), say: `Fold \`nums[${i}] = ${nums[i]}\` into the prefix: \`prefix\` becomes **${prefix}**, the product of \`nums[0..${i}]\`, ready for index ${i + 1}.`, op: `prefix = prefix × nums[${i}] = ${prefix}`, act: "GROW_PREFIX" });
    }
    T.phase("Pass 2: multiply in everything to the RIGHT");
    for (let i = n - 1; i >= 0; i--) {
      const before = ans[i];
      ans[i] *= suffix; written2.add(i);
      T.step("right", { vars: { i, suffix, "answer[i]": ans[i] }, state: S(i, { pass: 2, shown: view() }), say: `Multiply \`answer[${i}]\` (left part **${before}**) by \`suffix = ${suffix}\` (the product of everything to the right of ${i}): **${ans[i]}**. That is the product of all elements except \`nums[${i}]\`.`, op: `answer[${i}] = ${before} × ${suffix} = ${ans[i]}`, act: "MULTIPLY_RIGHT",
        why: whyR ? null : { title: "Why does this give the answer?", text: "`answer[i]` already holds *left(i)*. Multiplying by `suffix` = *right(i)* gives left × right: every element except `nums[i]`, with no division at all." } });
      whyR = true;
      suffix *= nums[i];
      T.step("growright", { vars: { i, suffix }, state: S(i, { pass: 2, shown: view() }), say: `Fold \`nums[${i}] = ${nums[i]}\` into the suffix: \`suffix\` becomes **${suffix}**, ready for index ${i - 1}.`, op: `suffix = suffix × nums[${i}] = ${suffix}`, act: "GROW_SUFFIX" });
    }
    T.step("ret", { vars: { answer: ans.slice() }, state: S(null, { shown: view(), afterAll: true }), say: `Both passes are done: **[${ans.join(", ")}]**. Each cell was written once in pass 1 and updated once in pass 2.`, op: "return answer", act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) { const n = 2 + Math.floor(rnd() * 8); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 9) - 3) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => (i % 3) + 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "two passes over the array", short: "n steps left→right plus n steps right→left, each with two multiplications",
      derive: [
        "T(n) = \\underbrace{n \\cdot (c_1 + c_2)}_{\\text{pass 1: store, multiply}} + \\underbrace{n \\cdot (c_3 + c_4)}_{\\text{pass 2: multiply, multiply}} || each iteration does a constant number of operations",
        "T(n) = n\\,(c_1 + c_2 + c_3 + c_4) = c\\,n || the two sums merge into one constant c",
        "!T(n) = O(n) || exactly $2n$ iterations, compared with $n(n-1)$ multiplications for the brute force",
      ],
      where: "The brute force performs $n(n-1)$ multiplications. Here every element is multiplied into the prefix once and into the suffix once, so the total is $2n$ iterations, regardless of the values.",
    },
    space: {
      tex: "O(1)", title: "only the output array and two numbers", short: "extra space besides the answer: `prefix` and `suffix`",
      derive: [
        "S(n) = \\underbrace{|\\text{answer}|}_{\\text{required output}} + |\\text{prefix}| + |\\text{suffix}| || the output is not counted as extra",
        "S_{\\text{extra}}(n) = 2c || two integers",
        "!S_{\\text{extra}}(n) = O(1) || the obvious two-array version would use $O(n)$",
      ],
      where: "The simplest version builds a `left[]` array and a `right[]` array ($O(n)$ extra). Reusing the output array for the prefixes and a single running `suffix` removes both. (The output array itself is required and is not counted as extra space.)",
    },
    limit: "$O(n)$ time is optimal: every output depends on every input, so each input must be read. $O(1)$ extra space (apart from the output) is also optimal.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Dividing the total product by `nums[i]`", what: "Compute `total = product of all`, then `answer[i] = total / nums[i]`.", why: "It is the most natural idea and it is $O(n)$.", breaks: "The problem forbids division, and it also fails with zeros: one zero makes `total = 0`, and dividing by the zero itself is undefined (a crash in C++). With two or more zeros the right answer is all zeros, which the division cannot distinguish.", avoid: "Use prefix and suffix products: they never divide, so zeros are harmless." },
    { title: "Including `nums[i]` in its own prefix", what: "Doing `prefix *= nums[i]; answer[i] = prefix;` in that order.", why: "Swapping two lines looks harmless.", breaks: "`answer[i]` then contains `nums[i]` itself, so every answer is multiplied by `nums[i]` once too often.", avoid: "**Write first, then multiply**: store the prefix, *then* fold in `nums[i]`." },
    { title: "Starting prefix or suffix at 0", what: "`int prefix = 0;`", why: "Habit from sums, where the identity is 0.", breaks: "Every product becomes 0 (0 × anything = 0).", avoid: "The identity for multiplication is **1**: start both at 1." },
    { title: "Allocating two extra arrays when asked for O(1) extra space", what: "Building `left[]` and `right[]` and combining them.", why: "It is the clearest version and perfectly valid as a first step.", breaks: "It uses $O(n)$ extra memory, which loses points when the follow-up asks for $O(1)$.", avoid: "Write the answer into the output array in pass 1 and carry `suffix` as a single variable in pass 2." },
    { title: "Integer overflow in intermediate products", what: "Using `int` when a prefix product might exceed the limit (in a variant without the guarantee).", why: "The statement here promises the products fit, so the problem never shows the issue.", breaks: "In variants with larger values the multiplication wraps around silently (undefined behaviour in C++).", avoid: "Read the guarantee. If it is missing, use `long long` or work modulo a prime." },
  ],

  followUps: [
    {
      q: "Give the version with two separate arrays, `left[]` and `right[]`. Why is the lesson's version better?",
      a: "`left[i]` = product of `nums[0..i−1]`, `right[i]` = product of `nums[i+1..n−1]`, and `answer[i] = left[i] × right[i]`. It is easier to read and to debug, but uses $O(n)$ extra space. The one-array version compresses it: pass 1 *is* `left`, and the running `suffix` replaces `right[]`.",
      cpp: `vector<int> productTwoArrays(vector<int>& nums) {
    int n = nums.size();
    vector<int> left(n, 1), right(n, 1), answer(n);
    for (int i = 1; i < n; i++) left[i] = left[i - 1] * nums[i - 1];
    for (int i = n - 2; i >= 0; i--) right[i] = right[i + 1] * nums[i + 1];
    for (int i = 0; i < n; i++) answer[i] = left[i] * right[i];
    return answer;
}`,
      js: `function productTwoArrays(nums) {
  const n = nums.length, left = new Array(n).fill(1), right = new Array(n).fill(1);
  for (let i = 1; i < n; i++) left[i] = left[i - 1] * nums[i - 1];
  for (let i = n - 2; i >= 0; i--) right[i] = right[i + 1] * nums[i + 1];
  return left.map((l, i) => l * right[i]);
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Division **is** allowed. How would you do it, and what must you handle?",
      a: "Count the zeros. With **no** zero: `answer[i] = total / nums[i]`. With **exactly one** zero: only the zero's position gets a non-zero answer (the product of all the *non-zero* elements); all other answers are `0`. With **two or more** zeros: every answer is `0`. It is $O(n)$ and $O(1)$ extra, but the case analysis is easy to get wrong, which is why the prefix/suffix method is the safer interview answer.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "How would you answer many queries *\"product of `nums[l..r]`\"* quickly?",
      a: "Build a **prefix product** array and divide: `prod(l, r) = pre[r+1] / pre[l]`, which only works if there are no zeros. With zeros, keep a prefix count of zeros and a prefix product of the non-zero values, or use a **segment tree** (query $O(\\log n)$, no division needed). The segment tree is also what you want if the array can be *updated*.",
      time: "O(\\log n) per query", space: "O(n)",
    },
    {
      q: "Return, for each `i`, the sum of all elements except `nums[i]`.",
      a: "Sums are simpler because subtraction undoes addition: compute `total` once and return `total − nums[i]` for each `i`, in $O(n)$ time and $O(1)$ extra space. The product version needs prefix/suffix because division is forbidden or unsafe, but the prefix/suffix idea works for any associative operation (min, max, gcd, bitwise AND/OR).",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "maximum-subarray", why: "Another one-pass problem that carries a running aggregate (best sum ending here) instead of re-summing ranges." },
    { id: "maximum-product-subarray", why: "Products again, but now you must track both a running **maximum** and **minimum** because negatives flip signs." },
    { id: "container-with-most-water", why: "Another problem where a smarter pass over the array replaces an $O(n^2)$ pair loop." },
    { id: "best-time-to-buy-and-sell-stock", why: "A running summary of the past (the minimum so far) replaces a loop that looks back." },
  ],
  patternNote: "**The Prefix / Suffix pattern** precomputes a running aggregate from the left and another from the right, so that anything that depends on \"everything before\" and \"everything after\" an index becomes an $O(1)$ combination. It works for any associative operation, and it avoids both division and re-scanning.",
  takeaways: [
    "`answer[i] = (product of everything left of i) × (product of everything right of i)`.",
    "Pass 1 left→right writes the prefixes into the output; pass 2 right→left multiplies in a running suffix.",
    "**Write before you multiply** so `nums[i]` is excluded; the identity for products is `1`.",
    "Time $O(n)$, extra space $O(1)$ (the output is not counted). No division, so zeros need no special case.",
    "Recognise it by: *\"for each i, combine everything except i\"* and a ban on division.",
  ],
});
