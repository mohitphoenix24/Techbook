SHEETS.define({
  id: "find-minimum-in-rotated-sorted-array",
  viz: "binary",
  io: { fn: "findMin", params: [["nums", "int[]"]], ret: "int" },

  statement: `A sorted array of **distinct** integers (ascending) was **rotated** between 1 and \`n\` times. Rotating once moves the last element to the front: \`[0, 1, 2, 4, 5, 6, 7]\` becomes \`[7, 0, 1, 2, 4, 5, 6]\`. Rotating \`n\` times gives back the original array.

Given the rotated array \`nums\`, return its **minimum** element, in $O(\\log n)$ time.`,
  examples: [
    { input: "nums = [3, 4, 5, 1, 2]", output: "1", explain: "The original array `[1, 2, 3, 4, 5]` was rotated 3 times." },
    { input: "nums = [4, 5, 6, 7, 0, 1, 2]", output: "0", explain: "The original array `[0, 1, 2, 4, 5, 6, 7]` was rotated 4 times." },
    { input: "nums = [11, 13, 15, 17]", output: "11", explain: "Rotated 4 times (a full turn): the array is back to sorted order." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 5000$", "$-5000 \\le$ `nums[i]` $\\le 5000$", "All values are **unique**.", "`nums` is a sorted array rotated between 1 and `n` times."],

  intuition: {
    find: "The smallest value of a sorted array that has been cut and rotated. It sits at the **rotation point**: the one place where the order drops (e.g. `7 → 0`).",
    beginner: "Scan the whole array and keep the smallest element.",
    works: "It looks at every element, so the minimum cannot be missed. It does not even need the array to be rotated or sorted.",
    slow: "$O(n)$: it ignores the structure. The problem asks for $O(\\log n)$, so there must be a way to discard half the array with one comparison.",
    repeat: "A scan compares each element with the best so far and learns nothing about *other* elements. Yet the array is almost sorted: it is **two sorted pieces** glued together.",
    remember: "We do not need to remember anything extra. We need a comparison that tells us **which side of `mid` contains the rotation point**.",
    observation: "Compare `nums[mid]` with the **last element** `nums[hi]`. If `nums[mid] > nums[hi]`, the order drops somewhere between `mid` and `hi` (a sorted run cannot end larger than it starts), so the minimum is to the **right** of `mid`. Otherwise `nums[mid] ≤ nums[hi]`, the right part is sorted, so the minimum is at `mid` or to its **left**.",
    leads: "Binary search on `[lo, hi]`: if `nums[mid] > nums[hi]` set `lo = mid + 1` (the minimum is strictly right), else set `hi = mid` (`mid` itself might be the minimum, so keep it). Stop when `lo == hi`: that index holds the minimum.",
  },

  flow: [
    "Scan every element and keep the smallest.",
    "All elements are checked, so the minimum is found.",
    "$O(n)$ and blind to the sorted structure we were given.",
    "The array is two sorted runs; the minimum is where the order drops.",
    "Compare `nums[mid]` with `nums[hi]` to decide which half contains the drop.",
    "Binary search that keeps `mid` when it might be the answer: $O(\\log n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** a linear scan that keeps the smallest value seen. It works for any array, rotated or not.",
    why: "It reads every element, so it is $\\Theta(n)$ and does not use the fact that the array is made of two sorted runs. For a sorted array you would not scan to find the minimum; the point of this problem is to recover the same speed after a rotation.",
    time: "O(n)", space: "O(1)",
    measure: { fTex: "n", f: (n) => n, ns: [10, 100, 1000, 10000, 100000, 1000000] },
    cpp: `class Solution {
public:
    int findMin(vector<int>& nums) {
        int best = nums[0];
        for (int x : nums) best = min(best, x);
        return best;
    }
};`,
    js: `function findMin(nums) {
  let best = nums[0];
  for (const x of nums) best = Math.min(best, x);
  return best;
}`,
  },

  pattern: {
    name: "Binary Search",
    why: "Even though the whole array is not sorted, it has a **monotonic yes/no question**: *\"is `nums[i]` larger than the last element?\"* is `true, true, true, false, false, false` along the array (the first run is above the last element, the second below). The minimum is exactly where the answer flips from `true` to `false`, and a boundary like that can be found by binary search.",
    recognize: [
      "A sorted array that was **rotated**, or a \"mountain\"/\"valley\" shape with one turning point.",
      "A condition that is `true` for a prefix and `false` for the rest (or vice versa): *find the boundary*.",
      "The statement asks for $O(\\log n)$ on data that is *almost* sorted.",
      "Comparing `mid` with an **endpoint** tells you which side of `mid` the turning point is on.",
    ],
  },

  optimal: {
    idea: "Keep a window `[lo, hi]` that always contains the minimum. Probe `mid`. If `nums[mid] > nums[hi]`, then `mid` is in the larger left run and the minimum is strictly to its right: `lo = mid + 1`. Otherwise `mid` is in the right (smaller) run or is the minimum itself: `hi = mid` (we cannot exclude `mid`). The window shrinks until a single index remains.",
    steps: [
      "Set `lo = 0`, `hi = n − 1`.",
      "While `lo < hi`: compute `mid = lo + (hi − lo) / 2`.",
      "If `nums[mid] > nums[hi]`: the minimum is **right of `mid`**, so `lo = mid + 1`.",
      "Else: the minimum is at `mid` or to its **left**, so `hi = mid`.",
      "When `lo == hi`, return `nums[lo]`.",
    ],
    invariant: "**The minimum of the whole array is always at an index in `[lo, hi]`.** Each update discards only indices that cannot hold the minimum.",
    correct: "*If `nums[mid] > nums[hi]`:* the array restarts (drops) somewhere after `mid`, because if `mid..hi` were sorted ascending we would have `nums[mid] < nums[hi]` (values are distinct). So the minimum is in `(mid, hi]`: `lo = mid + 1` is safe. *Otherwise `nums[mid] < nums[hi]`:* the segment `[mid, hi]` is sorted, so its smallest element is `nums[mid]`, and nothing right of `mid` can be smaller than `nums[mid]`: the minimum is in `[lo, mid]`, so `hi = mid`. The window strictly shrinks (`mid < hi` because `lo < hi`), so the loop ends with `lo == hi`, the only index left, which must hold the minimum.",
  },

  cpp: `class Solution {
public:
    int findMin(vector<int>& nums) {
        int lo = 0, hi = (int)nums.size() - 1;            //@init
        while (lo < hi) {                                 //@loop
            int mid = lo + (hi - lo) / 2;                 //@mid
            if (nums[mid] > nums[hi]) lo = mid + 1;       // drop is right of mid //@right
            else hi = mid;                                // mid may be the min //@left
        }
        return nums[lo];                                  //@ret
    }
};`,
  js: `function findMin(nums) {
  let lo = 0, hi = nums.length - 1;                       //@init
  while (lo < hi) {                                       //@loop
    const mid = lo + Math.floor((hi - lo) / 2);           //@mid
    if (nums[mid] > nums[hi]) lo = mid + 1;               // drop is right of mid //@right
    else hi = mid;                                        // mid may be the min //@left
  }
  return nums[lo];                                        //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [3, 4, 5, 1, 2] } },
    { name: "Example 2", kind: "normal", input: { nums: [4, 5, 6, 7, 0, 1, 2] } },
    { name: "Example 3: a full rotation", kind: "normal", input: { nums: [11, 13, 15, 17] } },
    { name: "Minimum at the very end", kind: "edge", input: { nums: [2, 3, 4, 5, 1] }, why: "Rotated by `n − 1`: the minimum is the **last** element. Every probe says `nums[mid] > nums[hi]`, so `lo` keeps moving right until it reaches `hi`. It checks that going right never overshoots." },
    { name: "Minimum right after the first element", kind: "edge", input: { nums: [7, 1, 2, 3, 4, 5, 6] }, why: "Rotated once: the drop is between index 0 and 1. The window must be able to collapse *leftwards* onto index 1 (`hi = mid`), which is why `mid` cannot be discarded in the \"else\" branch." },
    { name: "Two elements, rotated", kind: "edge", input: { nums: [2, 1] }, why: "`mid = lo + (hi − lo) / 2 = 0` (rounded down). `nums[0] = 2 > nums[1] = 1`, so `lo = 1`. If you compared with `nums[lo]` instead of `nums[hi]`, the equality `nums[mid] == nums[lo]` here would send you the wrong way." },
    { name: "A single element", kind: "corner", input: { nums: [42] }, why: "`lo == hi` from the start, so the loop never runs and we return `nums[0]`." },
    { name: "Already sorted (rotated n times)", kind: "corner", input: { nums: [1, 2, 3, 4, 5, 6, 7] }, why: "There is no drop at all. Each probe finds `nums[mid] < nums[hi]`, so `hi` keeps moving **left** to index 0. The same loop handles it with no special case." },
    { name: "Negative values", kind: "corner", input: { nums: [0, 5, 9, -8, -3] }, why: "Only comparisons are used, never arithmetic on the values, so negatives behave like any other numbers. The minimum is `-8`." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length;
    let lo = 0, hi = n - 1;
    const sizes = [n];
    let whyR = false, whyL = false, whyHi = false;
    const S = (o = {}) => () => ({ arr: nums, lo: o.lo !== undefined ? o.lo : lo, hi: o.hi !== undefined ? o.hi : hi, mid: o.mid, sizes: sizes.slice(), n, found: o.found, hl: Object.assign(o.hl || {}, o.mid != null ? {} : {}), label: "rotated sorted array", note: o.note });
    T.step("init", { vars: { lo, hi }, state: S(), phase: "Find the rotation point", say: `The minimum sits where the order drops. We keep a window \`[${lo}, ${hi}]\` that always contains it; at the start that is the whole array.`, op: `lo = 0,  hi = n − 1 = ${hi}`, act: "START" });
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      T.step("mid", { vars: { lo, hi, mid }, state: S({ mid, hl: { [hi]: "cur" } }), say: `Probe \`mid = ${mid}\` (value **${nums[mid]}**) and compare it with the **last element of the window**, \`nums[hi] = ${nums[hi]}\` (pink).`, op: `mid = ${lo} + (${hi} − ${lo}) / 2 = ${mid}`, act: "PROBE" });
      if (nums[mid] > nums[hi]) {
        const hl = {}; for (let i = lo; i <= mid; i++) hl[i] = "bad"; hl[hi] = "cur";
        T.step("right", { vars: { lo, hi, mid }, state: S({ mid, hl }), say: `${nums[mid]} > ${nums[hi]}: the middle is **bigger** than the end, so the order must drop somewhere between \`mid\` and \`hi\`. The minimum is **right of mid**; indices ${lo}..${mid} cannot hold it.`, op: `nums[mid] = ${nums[mid]} > nums[hi] = ${nums[hi]}  ⇒  lo = mid + 1 = ${mid + 1}`, act: "MOVE_RIGHT",
          why: whyR ? null : { title: "Why compare with nums[hi]?", text: `In a sorted run, a later element is larger. If \`nums[mid] > nums[hi]\`, the run from \`mid\` to \`hi\` is **not** sorted: it must contain the drop, so the minimum is right of \`mid\`.` } });
        whyR = true;
        lo = mid + 1;
      } else {
        const hl = {}; for (let i = mid + 1; i <= hi; i++) hl[i] = "bad"; hl[hi] = "cur";
        T.step("left", { vars: { lo, hi, mid }, state: S({ mid, hl }), say: `${nums[mid]} < ${nums[hi]}: the stretch from \`mid\` to \`hi\` is **sorted**, so nothing right of \`mid\` is smaller than ${nums[mid]}. The minimum is at \`mid\` **or to its left**; discard indices ${mid + 1}..${hi}.`, op: `nums[mid] = ${nums[mid]} < nums[hi] = ${nums[hi]}  ⇒  hi = mid = ${mid}`, act: "MOVE_LEFT",
          why: whyL ? null : { title: "Why hi = mid and not mid − 1?", text: `\`mid\` itself could be the minimum (we only know nothing *right* of it is smaller). Writing \`mid − 1\` could throw the answer away. Keeping \`mid\` still shrinks the window, because \`mid < hi\` when \`lo < hi\`.` } });
        whyL = true;
        hi = mid;
      }
      sizes.push(hi - lo + 1);
      T.step("loop", { vars: { lo, hi }, state: S(), say: lo < hi ? `The window is now \`[${lo}, ${hi}]\`: **${hi - lo + 1}** elements, and the minimum is still inside it.` : `The window has shrunk to a single index, **${lo}**. It must hold the minimum.`, op: `lo < hi ?  ${lo} < ${hi}  →  ${lo < hi}`, act: lo < hi ? "SHRINK" : "ONE_LEFT" });
    }
    T.step("ret", { vars: { lo, hi, "nums[lo]": nums[lo] }, state: S({ mid: lo, found: true }), say: `\`lo == hi == ${lo}\`. The minimum is **${nums[lo]}**.`, op: `return nums[${lo}] = ${nums[lo]}`, act: "FOUND",
      why: whyHi ? null : { title: "Why is the last remaining index the minimum?", text: "The invariant says the minimum is always inside `[lo, hi]`. When only one index remains, it has to be that one." } });
    T.result(nums[lo]);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 11), set = new Set();
    while (set.size < n) set.add(Math.floor(rnd() * 41) - 20);
    const a = [...set].sort((x, y) => x - y), k = Math.floor(rnd() * n);
    return { nums: a.slice(k).concat(a.slice(0, k)) };
  },
  gen(n) { const a = Array.from({ length: n }, (_, i) => i); const k = Math.floor(n / 3); return { nums: a.slice(k).concat(a.slice(0, k)) }; },

  complexity: {
    time: {
      tex: "O(\\log n)", title: "the window halves every iteration", short: "about log₂ n probes",
      derive: [
        "n_0 = n,\\qquad n_{k+1} \\le \\left\\lceil \\frac{n_k}{2} \\right\\rceil \\;\\Rightarrow\\; n_k \\le \\left\\lceil \\frac{n}{2^k} \\right\\rceil || each probe keeps at most the larger half (`hi = mid` keeps `mid`, so the window size goes from $m$ to at most $\\lceil m/2 \\rceil$)",
        "\\text{loop ends when the window has 1 element: } \\frac{n}{2^k} \\le 1 \\iff k \\ge \\log_2 n || `lo < hi` becomes false at size 1",
        "\\text{iterations} \\le \\lceil \\log_2 n \\rceil || smallest whole k satisfying the inequality",
        "!T(n) = c\\,\\lceil \\log_2 n \\rceil = O(\\log n) || each iteration is constant work",
      ],
      where: "Compare with the linear scan: for $n = 10^9$ the scan needs a billion reads, the binary search about 30. As in Binary Search, the *ladder of bars* in the lab halves every iteration.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "`lo`, `hi`, `mid`",
      derive: [
        "S(n) = |\\text{lo}| + |\\text{hi}| + |\\text{mid}| || the only state kept",
        "!S(n) = 3c = O(1) || independent of n",
      ],
      where: "The window is represented by two indices; no part of the array is copied.",
    },
    limit: "Without extra structure, locating the boundary between two sorted runs needs $\\Omega(\\log n)$ comparisons (each comparison has two outcomes and there are $n$ possible positions), so $O(\\log n)$ is optimal. **With duplicates** the worst case degrades to $\\Theta(n)$ (see the follow-ups).",
    measure: { label: "n = nums.length", fTex: "\\lceil \\log_2 n \\rceil + 1", f: (n) => Math.ceil(Math.log2(n)) + 1, sizes: [16, 64, 256, 1024, 4096, 16384], growth: "logarithmic", reading: "Making the array **4× longer** adds only **two** more iterations: logarithmic growth." },
  },

  mistakes: [
    { title: "Comparing `nums[mid]` with `nums[lo]` instead of `nums[hi]`", what: "Using `if (nums[mid] >= nums[lo]) lo = mid + 1;`", why: "It mirrors the way you test \"is the left half sorted?\" in the search problem.", breaks: "For an array that is not rotated (or when `mid == lo`) both branches look the same, and the loop moves away from the minimum: `[1, 2, 3, 4, 5]` returns 5 or loops.", avoid: "Compare with the **right end**: the right end is on the lower run exactly when the array is rotated, so it gives an unambiguous signal." },
    { title: "Setting `hi = mid − 1`", what: "Excluding `mid` when `nums[mid] < nums[hi]`.", why: "Copying the update from the classic binary search.", breaks: "`mid` may itself be the minimum, and discarding it loses the answer: `[3, 1, 2]` → `hi = 0` and the result is 3.", avoid: "Use `hi = mid` here. The loop condition `lo < hi` still guarantees progress." },
    { title: "Using `lo <= hi` with `hi = mid`", what: "Mixing the closed-window loop condition with a non-shrinking update.", why: "Both styles are \"binary search\" in your head.", breaks: "When `lo == hi`, `mid == hi` and `hi = mid` does not change anything: an **infinite loop**.", avoid: "Pair `while (lo < hi)` with `hi = mid`; pair `while (lo <= hi)` with `hi = mid − 1`." },
    { title: "Checking only if the array is rotated", what: "Returning `nums[0]` when `nums[0] < nums[n−1]`, else running the search.", why: "It is a useful shortcut for the sorted case.", breaks: "It is only a shortcut; forgetting the search for the rotated case (or mis-writing the test with `<=` for single elements) gives wrong answers.", avoid: "The loop already handles the sorted case correctly, so you do not need the shortcut." },
    { title: "Assuming duplicates are absent when they are not", what: "Using this exact loop on an array with repeated values.", why: "This problem promises distinct values, so the code is correct here.", breaks: "With duplicates, `nums[mid] == nums[hi]` no longer tells you which side holds the minimum (`[3, 3, 1, 3]`), so the algorithm can discard the minimum.", avoid: "For duplicates, shrink with `hi--` when `nums[mid] == nums[hi]` (worst case $O(n)$)." },
  ],

  followUps: [
    {
      q: "The array may contain **duplicates**. What breaks, and how do you fix it?",
      a: "When `nums[mid] == nums[hi]`, you cannot tell whether the drop is left or right of `mid` (think `[3, 3, 3, 1, 3]` versus `[3, 1, 3, 3, 3]`). But you can safely discard **one** element, `hi`, because if `nums[hi]` is the minimum then `nums[mid]` (equal to it) is a copy that stays in the window. So: if `nums[mid] > nums[hi]` then `lo = mid + 1`; else if `nums[mid] < nums[hi]` then `hi = mid`; else `hi--`. The worst case (all equal) becomes $O(n)$.",
      cpp: `int findMinDup(vector<int>& nums) {
    int lo = 0, hi = (int)nums.size() - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] > nums[hi]) lo = mid + 1;
        else if (nums[mid] < nums[hi]) hi = mid;
        else hi--;                        // cannot decide: drop one copy
    }
    return nums[lo];
}`,
      js: `function findMinDup(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] > nums[hi]) lo = mid + 1;
    else if (nums[mid] < nums[hi]) hi = mid;
    else hi--;                            // cannot decide: drop one copy
  }
  return nums[lo];
}`,
      time: "O(n) worst, O(log n) typical", space: "O(1)",
    },
    {
      q: "Return **how many times** the array was rotated.",
      a: "The number of rotations equals the **index of the minimum** (the original first element has moved there). Run the same search and return `lo` instead of `nums[lo]`. (A full rotation, `lo = 0`, counts as 0 or `n` turns; they give the same array.)",
      time: "O(\\log n)", space: "O(1)",
    },
    {
      q: "Now you must **search for a target** in the rotated array. How does this help?",
      a: "Find the rotation index `k` first. The array is two sorted runs: `[0, k − 1]` and `[k, n − 1]`. Decide in $O(1)$ which run can contain the target (compare with `nums[n − 1]`), then run an ordinary binary search inside that run. Two logarithmic searches in total: $O(\\log n)$. (The next lesson does it in a single pass.)",
      time: "O(\\log n)", space: "O(1)",
    },
  ],

  related: [
    { id: "binary-search", why: "The warm-up: the same window-halving loop on a fully sorted array." },
    { id: "search-in-rotated-sorted-array", why: "Same rotated array, but searching for a target: decide which half is sorted, then whether the target lies in it." },
    { id: "longest-increasing-subsequence", why: "Another place where binary search finds a boundary inside a sorted structure (the tails array)." },
  ],
  patternNote: "**The Binary Search pattern** is really *\"find the boundary of a monotonic condition\"*. The array here is not sorted, but \"larger than the last element\" is `true, true, true, false, false, false`, so a boundary exists and binary search finds it. Always ask: *what is my yes/no question, and is it monotonic?*",
  takeaways: [
    "A rotated sorted array is **two sorted runs**; the minimum is where the order drops.",
    "Compare `nums[mid]` with `nums[hi]`: bigger means the drop is to the **right**, otherwise `mid` or something to its left is the minimum.",
    "Use `lo = mid + 1` for the first case and `hi = mid` (**not** `mid − 1`) for the second, with `while (lo < hi)`.",
    "Time $O(\\log n)$, space $O(1)$. With duplicates, add `hi--` for ties and accept an $O(n)$ worst case.",
    "Recognise it by: a sorted array that was rotated, plus a request for $O(\\log n)$.",
  ],
});
