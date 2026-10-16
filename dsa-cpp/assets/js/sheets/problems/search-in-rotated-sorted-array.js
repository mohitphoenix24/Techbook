SHEETS.define({
  id: "search-in-rotated-sorted-array",
  viz: "binary",
  io: { fn: "search", params: [["nums", "int[]"], ["target", "int"]], ret: "int" },

  statement: `A sorted array of **distinct** integers was rotated at an unknown pivot, for example \`[0, 1, 2, 4, 5, 6, 7]\` became \`[4, 5, 6, 7, 0, 1, 2]\`.

Given the rotated array \`nums\` and an integer \`target\`, return the **index** of \`target\`, or \`-1\` if it is not present. Your algorithm must run in $O(\\log n)$ time.`,
  examples: [
    { input: "nums = [4, 5, 6, 7, 0, 1, 2], target = 0", output: "4", explain: "`nums[4] = 0`." },
    { input: "nums = [4, 5, 6, 7, 0, 1, 2], target = 3", output: "-1", explain: "`3` is not in the array." },
    { input: "nums = [1], target = 0", output: "-1", explain: "A single element that is not the target." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 5000$", "$-10^4 \\le$ `nums[i]` $\\le 10^4$", "All values are **unique**.", "`nums` is a sorted array rotated at some pivot.", "$-10^4 \\le$ `target` $\\le 10^4$"],

  intuition: {
    find: "The index of `target` in an array that is sorted **except for one rotation point**, or `-1`.",
    beginner: "A linear scan: check each element against `target`.",
    works: "It reads every element, so if `target` is present it is found. It works for any array.",
    slow: "$O(n)$. The problem demands $O(\\log n)$, so the sorted structure must be used.",
    repeat: "A scan learns about one element per comparison. A normal binary search would learn about **half** the array, but it cannot be used blindly: comparing `target` with `nums[mid]` no longer tells us which side to keep, because the array is not globally sorted.",
    remember: "We still have something very useful: **at least one half of `[lo, hi]` is always properly sorted** (the rotation drop can only be in one half). If we can tell which half is sorted, we can check whether `target` lies in that sorted half using plain comparisons.",
    observation: "For the window `[lo, hi]` and `mid`: if `nums[lo] ≤ nums[mid]`, the left half `[lo, mid]` is sorted; otherwise the right half `[mid, hi]` is. In the sorted half, `target` is either inside its value range or not. If it is inside, search that half; if not, the target can only be in the **other** half.",
    leads: "At each step: check `nums[mid] == target`. Find the sorted half. If `target` lies within the sorted half's range, shrink the window to that half; otherwise shrink it to the other half. One comparison chain per step halves the window: $O(\\log n)$.",
  },

  flow: [
    "Scan the array for `target`.",
    "Every element is checked, so a present target is found.",
    "$O(n)$: and a plain binary search fails because the array is not globally sorted.",
    "One half of the window is **always sorted**; we can tell which by comparing `nums[lo]` with `nums[mid]`.",
    "Check whether `target` lies inside the sorted half's range; if so keep that half, else keep the other.",
    "A binary search with a two-way test per step: $O(\\log n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** a linear scan returning the first index `i` with `nums[i] == target`, or `-1` at the end.",
    why: "It takes $\\Theta(n)$ comparisons in the worst case and ignores that the array is nearly sorted. The rotation only breaks the order *once*, so most of the useful structure is still there to be exploited.",
    time: "O(n)", space: "O(1)",
    measure: { fTex: "n", f: (n) => n, ns: [10, 100, 1000, 10000, 100000, 1000000] },
    cpp: `class Solution {
public:
    int search(vector<int>& nums, int target) {
        for (int i = 0; i < (int)nums.size(); i++)
            if (nums[i] == target) return i;
        return -1;
    }
};`,
    js: `function search(nums, target) {
  for (let i = 0; i < nums.length; i++)
    if (nums[i] === target) return i;
  return -1;
}`,
  },

  pattern: {
    name: "Binary Search",
    why: "Binary search only needs that, at each step, you can **decide which half cannot contain the answer**. In a rotated array a single comparison with `nums[mid]` is not enough, but combining it with the knowledge of *which half is sorted* is. The structure \"two sorted runs\" gives exactly the information needed.",
    recognize: [
      "A sorted array with a **twist** (rotated, or with one disturbance) and a request for $O(\\log n)$.",
      "A plain comparison with `mid` is ambiguous, but a *second* comparison (with `lo` or `hi`) resolves it.",
      "At every window, one side keeps a simple invariant (it is sorted) that you can test against.",
      "The phrase *\"sorted array, but rotated at an unknown pivot\"*.",
    ],
  },

  optimal: {
    idea: "Binary search on `[lo, hi]`. After testing `mid`, find the sorted half: if `nums[lo] ≤ nums[mid]` the left half `[lo, mid]` is sorted, else the right half `[mid, hi]` is. If `target` is inside the **range** of the sorted half, keep that half; otherwise keep the other one.",
    steps: [
      "Set `lo = 0`, `hi = n − 1`.",
      "While `lo ≤ hi`: `mid = lo + (hi − lo) / 2`. If `nums[mid] == target`, **return `mid`**.",
      "If `nums[lo] ≤ nums[mid]` (**left half sorted**): if `nums[lo] ≤ target < nums[mid]` then `hi = mid − 1`, else `lo = mid + 1`.",
      "Otherwise (**right half sorted**): if `nums[mid] < target ≤ nums[hi]` then `lo = mid + 1`, else `hi = mid − 1`.",
      "If the loop ends, return `−1`.",
    ],
    invariant: "**If `target` is in the array, its index is always in `[lo, hi]`.** Each step discards only a half that provably cannot contain `target`.",
    correct: "*One half is always sorted:* the array restarts (drops) at most once, so at most one of `[lo, mid]`, `[mid, hi]` contains the drop. If `nums[lo] ≤ nums[mid]` there is no drop in `[lo, mid]`, so that half is ascending. In a sorted half, `target` can be tested for membership by its range: `nums[lo] ≤ target < nums[mid]` means the target would have to sit there if it exists. If the test is true we keep that half; if false, it cannot be in the sorted half, so it must be in the other half (or absent). The strict inequalities exclude `nums[mid]`, which was already tested. The window shrinks each step, so the loop ends.",
  },

  cpp: `class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = (int)nums.size() - 1;                          //@init
        while (lo <= hi) {                                              //@loop
            int mid = lo + (hi - lo) / 2;                               //@mid
            if (nums[mid] == target) return mid;                        //@found
            if (nums[lo] <= nums[mid]) {                                // left half sorted //@sorted
                if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;   //@inleft
                else lo = mid + 1;                                      //@outleft
            } else {                                                    // right half sorted
                if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;   //@inright
                else hi = mid - 1;                                      //@outright
            }
        }
        return -1;                                                      //@none
    }
};`,
  js: `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;                                     //@init
  while (lo <= hi) {                                                    //@loop
    const mid = lo + Math.floor((hi - lo) / 2);                         //@mid
    if (nums[mid] === target) return mid;                               //@found
    if (nums[lo] <= nums[mid]) {                                        // left half sorted //@sorted
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;       //@inleft
      else lo = mid + 1;                                                //@outleft
    } else {                                                            // right half sorted
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;       //@inright
      else hi = mid - 1;                                                //@outright
    }
  }
  return -1;                                                            //@none
}`,

  tests: [
    { name: "Example 1: target in the right run", kind: "normal", input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 } },
    { name: "Example 2: target absent", kind: "normal", input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 3 } },
    { name: "Target in the left run", kind: "normal", input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 5 } },
    { name: "Two elements: the `<=` matters", kind: "edge", input: { nums: [3, 1], target: 1 }, why: "Here `mid = lo`, so `nums[lo] == nums[mid]`. The test must be `nums[lo] <= nums[mid]` (not `<`): a one-element left half is trivially sorted. With `<` the code would treat `[mid, hi]` as sorted and wrongly discard the target's side." },
    { name: "Target is the rotation point (the minimum)", kind: "edge", input: { nums: [6, 7, 8, 1, 2, 3, 4, 5], target: 1 }, why: "The minimum sits exactly at the drop. It lies in the *right* sorted run, but it is also smaller than `nums[lo]`, so a solution that only compares with `nums[lo]` can send you the wrong way. The range test handles it." },
    { name: "Not rotated at all", kind: "edge", input: { nums: [1, 2, 3, 4, 5, 6], target: 5 }, why: "A fully sorted array is the degenerate rotation. `nums[lo] <= nums[mid]` is true on every step, so the algorithm behaves exactly like ordinary binary search." },
    { name: "Target bigger than everything", kind: "edge", input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 100 }, why: "No range contains 100, so every step goes to the *other* half, until the window empties and `-1` is returned." },
    { name: "A single element, found", kind: "corner", input: { nums: [1], target: 1 }, why: "`lo = hi = mid = 0` and `nums[0] == target`: found on the first probe." },
    { name: "A single element, absent", kind: "corner", input: { nums: [1], target: 0 }, why: "One probe, then `lo` or `hi` crosses and the window is empty: the smallest not-found case." },
    { name: "Pivot right after the first element", kind: "corner", input: { nums: [9, 1, 2, 3, 4, 5, 6, 7, 8], target: 9 }, why: "The target is the first element and the left run has length 1. The search must be able to move *left* to index 0, past the pivot." },
  ],

  trace(input, T) {
    const { nums, target } = input, n = nums.length;
    let lo = 0, hi = n - 1;
    const sizes = [n];
    const seen = { sortedL: false, sortedR: false, in: false, out: false };
    const S = (o = {}) => () => ({ arr: nums, lo: o.lo !== undefined ? o.lo : lo, hi: o.hi !== undefined ? o.hi : hi, mid: o.mid, target, sizes: sizes.slice(), n, found: o.found, sortedHalf: o.sortedHalf, hl: o.hl, label: "rotated sorted array" });
    T.step("init", { vars: { lo, hi, target }, state: S(), phase: "Halve the window, using the sorted half", say: `Looking for **${target}** in a rotated array. The window is everything: \`[${lo}, ${hi}]\`.`, op: `lo = 0,  hi = n − 1 = ${hi}`, act: "START" });
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      T.step("mid", { vars: { lo, hi, mid, target }, state: S({ mid }), say: `Probe \`mid = ${mid}\`: \`nums[${mid}] = ${nums[mid]}\`.`, op: `mid = ${lo} + (${hi} − ${lo}) / 2 = ${mid}`, act: "PROBE" });
      if (nums[mid] === target) {
        T.step("found", { vars: { lo, hi, mid, target }, state: S({ mid, found: true }), say: `\`nums[${mid}] = ${nums[mid]}\` equals the target. Return **${mid}**.`, op: `nums[${mid}] == ${target}`, act: "FOUND" });
        T.result(mid);
        return;
      }
      T.step("found", { vars: { lo, hi, mid, target }, state: S({ mid }), say: `${nums[mid]} is not ${target}. We need to know which way to go, but the array is only sorted in *pieces*.`, op: `nums[${mid}] = ${nums[mid]} ≠ ${target}`, act: "COMPARE" });
      const leftSorted = nums[lo] <= nums[mid];
      const sh = leftSorted ? [lo, mid] : [mid, hi];
      T.step("sorted", { vars: { lo, hi, mid, "nums[lo]": nums[lo], "nums[mid]": nums[mid] }, state: S({ mid, sortedHalf: sh }), say: leftSorted ? `\`nums[lo] = ${nums[lo]} ≤ nums[mid] = ${nums[mid]}\`, so there is **no drop** between lo and mid: the **left half** \`[${lo}, ${mid}]\` is sorted (green).` : `\`nums[lo] = ${nums[lo]} > nums[mid] = ${nums[mid]}\`: the drop is in the left half, so the **right half** \`[${mid}, ${hi}]\` must be sorted (green).`, op: `nums[lo] <= nums[mid]  →  ${leftSorted}`, act: leftSorted ? "LEFT_SORTED" : "RIGHT_SORTED",
        why: (leftSorted ? seen.sortedL : seen.sortedR) ? null : { title: "Why is one half always sorted?", text: "The rotation breaks the order at **one** place only. That place is either in the left half or in the right half, never both, so the other half is an ordinary ascending run." } });
      if (leftSorted) seen.sortedL = true; else seen.sortedR = true;
      let inside, tag, act, say, op;
      if (leftSorted) {
        inside = nums[lo] <= target && target < nums[mid];
        tag = inside ? "inleft" : "outleft";
        op = `${nums[lo]} <= ${target} < ${nums[mid]}  →  ${inside}`;
        say = inside ? `${target} lies between ${nums[lo]} and ${nums[mid]}, so it can only be inside the sorted left half: **keep the left**.` : `${target} is **not** between ${nums[lo]} and ${nums[mid]}, so it cannot be in the sorted left half: **go right**.`;
        act = inside ? "GO_LEFT" : "GO_RIGHT";
      } else {
        inside = nums[mid] < target && target <= nums[hi];
        tag = inside ? "inright" : "outright";
        op = `${nums[mid]} < ${target} <= ${nums[hi]}  →  ${inside}`;
        say = inside ? `${target} lies between ${nums[mid]} and ${nums[hi]}, so it can only be inside the sorted right half: **keep the right**.` : `${target} is **not** between ${nums[mid]} and ${nums[hi]}, so it cannot be in the sorted right half: **go left**.`;
        act = inside ? "GO_RIGHT" : "GO_LEFT";
      }
      const goLeft = act === "GO_LEFT";
      const hl = {};
      if (goLeft) for (let i = mid; i <= hi; i++) hl[i] = "bad"; else for (let i = lo; i <= mid; i++) hl[i] = "bad";
      T.step(tag, { vars: { lo, hi, mid, target }, state: S({ mid, sortedHalf: sh, hl }), say, op, act,
        why: (inside ? seen.in : seen.out) ? null : (inside ? { title: "Why is a range test enough here?", text: "Inside a sorted half, a value is present **only if** it lies between the half's first and last values. So the two comparisons tell us for certain whether the target could be in that half." } : { title: "Why may we throw the sorted half away?", text: "If the target is outside the range of the sorted half, it cannot be there. If it exists at all, it must be in the other half, the one containing the drop." }) });
      if (inside) seen.in = true; else seen.out = true;
      if (goLeft) hi = mid - 1; else lo = mid + 1;
      sizes.push(Math.max(0, hi - lo + 1));
      T.step("loop", { vars: { lo, hi, target }, state: S(), say: lo <= hi ? `The window is now \`[${lo}, ${hi}]\`: **${hi - lo + 1}** element${hi === lo ? "" : "s"}, about half of before.` : `The window is empty (\`lo = ${lo} > hi = ${hi}\`).`, op: `lo <= hi ?  ${lo} <= ${hi}  →  ${lo <= hi}`, act: lo <= hi ? "SHRINK" : "EMPTY" });
    }
    T.step("none", { vars: { lo, hi, target }, state: S(), say: `No index is left, so ${target} is not in the array. Return **−1**.`, op: "return −1", act: "NOT_FOUND" });
    T.result(-1);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 11), set = new Set();
    while (set.size < n) set.add(Math.floor(rnd() * 41) - 20);
    const a = [...set].sort((x, y) => x - y), k = Math.floor(rnd() * n);
    const nums = a.slice(k).concat(a.slice(0, k));
    const target = rnd() < 0.6 ? nums[Math.floor(rnd() * n)] : Math.floor(rnd() * 45) - 22;
    return { nums, target };
  },
  gen(n) { const a = Array.from({ length: n }, (_, i) => i * 2); const k = Math.floor(n / 3); return { nums: a.slice(k).concat(a.slice(0, k)), target: n * 2 + 1 }; },

  complexity: {
    time: {
      tex: "O(\\log n)", title: "the window at least halves every iteration", short: "about log₂ n iterations, constant work each",
      derive: [
        "n_0 = n, \\qquad n_{k+1} \\le \\left\\lfloor \\frac{n_k}{2} \\right\\rfloor \\;\\Rightarrow\\; n_k \\le \\frac{n}{2^k} || every branch drops `mid` and one whole side: either `[lo..mid]` or `[mid..hi]`",
        "\\text{the loop stops when } n_k < 1 \\iff 2^k > n || an empty window means `lo > hi`",
        "\\text{iterations} \\le \\lfloor \\log_2 n \\rfloor + 1 || the smallest k with $2^k > n$",
        "T(n) = c\\,(\\lfloor \\log_2 n \\rfloor + 1) || each iteration does a few comparisons and one assignment",
        "!T(n) = O(\\log n) || the extra \"which half is sorted\" test costs only a constant",
      ],
      where: "The two-level test (sorted half, then range) adds a constant number of comparisons per iteration, so the logarithmic bound of plain binary search is kept. Watch the ladder of search-space bars in the lab: each is about half the previous one.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "`lo`, `hi`, `mid`",
      derive: [
        "S(n) = |\\text{lo}| + |\\text{hi}| + |\\text{mid}| || the only state kept",
        "!S(n) = 3c = O(1) || independent of n",
      ],
      where: "No copy of the array is made; the window is two indices.",
    },
    limit: "$\\Omega(\\log n)$ comparisons are needed to distinguish $n + 1$ possible answers, so $O(\\log n)$ is optimal. **With duplicates** the worst case becomes $\\Theta(n)$ (`[1, 1, 1, 1, 0, 1, 1]`).",
    measure: { label: "n = nums.length", fTex: "\\lfloor \\log_2 n \\rfloor + 1", f: (n) => Math.floor(Math.log2(n)) + 1, sizes: [16, 64, 256, 1024, 4096, 16384], growth: "logarithmic", reading: "Making the array **4× longer** adds only **two** more iterations: logarithmic growth." },
  },

  mistakes: [
    { title: "Using `<` instead of `<=` when testing the sorted half", what: "`if (nums[lo] < nums[mid])` to decide that the left half is sorted.", why: "Both read naturally.", breaks: "When `mid == lo` (windows of size 1 or 2) the two are equal; with `<` the code decides the left half is *not* sorted and searches the wrong side. `[3, 1]`, target `1` fails.", avoid: "Use `nums[lo] <= nums[mid]`: a one-element half is sorted." },
    { title: "Off-by-one in the range test", what: "Writing `target <= nums[mid]` (or `nums[lo] < target`).", why: "Mixing inclusive and exclusive ends.", breaks: "`nums[mid]` was already compared and is not the target, so including it is harmless, but excluding `nums[lo]` wrongly drops a valid target at the left end of the sorted half.", avoid: "Left sorted: `nums[lo] <= target && target < nums[mid]`. Right sorted: `nums[mid] < target && target <= nums[hi]`." },
    { title: "Running a plain binary search", what: "Ignoring the rotation.", why: "\"The array is nearly sorted\".", breaks: "The comparison `nums[mid] < target` no longer implies the target is to the right, so the search discards the wrong half and misses elements.", avoid: "First determine which half is sorted; only then use the target comparison." },
    { title: "Finding the pivot first and forgetting an edge", what: "Two-step approach: find the minimum, then search the right run.", why: "It is a valid $O(\\log n)$ plan.", breaks: "Forgetting that a non-rotated array has its pivot at index 0, or choosing the wrong run when `target` equals `nums[0]` or `nums[n-1]`.", avoid: "The one-pass method above avoids the pivot bookkeeping." },
    { title: "Applying this code to arrays with duplicates", what: "Using the same test when values can repeat.", why: "The problem here promises distinct values.", breaks: "With `nums[lo] == nums[mid] == nums[hi]` you cannot tell which half is sorted, so the algorithm can discard the half containing the target.", avoid: "For duplicates, when the three are equal do `lo++; hi--` (worst case $O(n)$)." },
  ],

  followUps: [
    {
      q: "The array can contain **duplicates**. What do you change?",
      a: "The only problem is when `nums[lo] == nums[mid] == nums[hi]`: you cannot tell which half is sorted. In that case shrink both ends by one (`lo++`, `hi--`) after checking that they are not the target, and continue. Everywhere else the logic is unchanged. In the worst case (all equal) this degrades to $O(n)$, which is unavoidable: you genuinely may have to look at everything.",
      cpp: `bool searchDup(vector<int>& nums, int target) {
    int lo = 0, hi = (int)nums.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return true;
        if (nums[lo] == nums[mid] && nums[mid] == nums[hi]) { lo++; hi--; }   // cannot decide
        else if (nums[lo] <= nums[mid]) {
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1; else lo = mid + 1;
        } else {
            if (nums[mid] < target && target <= nums[hi]) lo = mid + 1; else hi = mid - 1;
        }
    }
    return false;
}`,
      js: `function searchDup(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] === target) return true;
    if (nums[lo] === nums[mid] && nums[mid] === nums[hi]) { lo++; hi--; }  // cannot decide
    else if (nums[lo] <= nums[mid]) {
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1; else lo = mid + 1;
    } else {
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1; else hi = mid - 1;
    }
  }
  return false;
}`,
      time: "O(n) worst, O(log n) typical", space: "O(1)",
    },
    {
      q: "Solve it by **finding the pivot first**, then doing an ordinary binary search.",
      a: "Use the previous lesson's search to find the index `k` of the minimum. The array is `[0, k − 1]` (large values) followed by `[k, n − 1]` (small values). If `target ≥ nums[0]` search `[0, k − 1]`, otherwise search `[k, n − 1]` (or if `k == 0` search the whole array). Two logarithmic searches: $O(\\log n)$. It is easier to reason about, but needs more code.",
      time: "O(\\log n)", space: "O(1)",
    },
    {
      q: "Treat the rotated array as a **virtual sorted array** to run ordinary binary search.",
      a: "If you know the rotation `k`, map a virtual index `v` in `[0, n)` to the real index `(v + k) mod n`, and run a plain binary search on `v` using `nums[(v + k) % n]`. Finding `k` costs one $O(\\log n)$ search, and the second search is the textbook one. It is elegant when you must search the same array many times (find `k` once).",
      time: "O(\\log n) per query", space: "O(1)",
    },
  ],

  related: [
    { id: "binary-search", why: "The simple sorted-array version of exactly this loop." },
    { id: "find-minimum-in-rotated-sorted-array", why: "Locate the rotation point itself, comparing `mid` with the last element." },
    { id: "longest-increasing-subsequence", why: "Binary search again, this time on the sorted array of tails that the algorithm maintains." },
  ],
  patternNote: "**The Binary Search pattern** survives disturbances to the sorted order as long as, at every step, you can find **one half that still has a simple structure** and use it to decide. Here that half is the sorted one; in other problems it is the half where a monotone condition flips. Ask: *what does a single probe let me conclude with certainty?*",
  takeaways: [
    "In a rotated sorted array, **at least one half of any window is sorted**: `nums[lo] <= nums[mid]` tells you which.",
    "Test whether `target` lies in the **range of the sorted half**; keep that half if it does, otherwise the other one.",
    "Use `<=` in the sortedness test (windows of size 1–2) and strict `<` against `nums[mid]` in the range test.",
    "Time $O(\\log n)$, space $O(1)$. With duplicates, handle `nums[lo] == nums[mid] == nums[hi]` by shrinking both ends ($O(n)$ worst case).",
    "Recognise it by: sorted + rotated + $O(\\log n)$.",
  ],
});
