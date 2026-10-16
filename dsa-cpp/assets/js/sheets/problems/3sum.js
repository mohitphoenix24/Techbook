SHEETS.define({
  id: "3sum",
  viz: "twopointer",
  io: { fn: "threeSum", params: [["nums", "int[]"]], ret: "int[][]", canon: "sort" },

  statement: `Given an integer array \`nums\`, return all the **triplets** \`[nums[i], nums[j], nums[k]]\` such that \`i\`, \`j\` and \`k\` are different indices and \`nums[i] + nums[j] + nums[k] == 0\`.

The answer must **not contain duplicate triplets** (two triplets with the same three values count as duplicates, whatever their indices). You may return the triplets in any order. *(Here the lab prints them with each triplet in ascending order and the list ordered, so outputs can be compared.)*`,
  examples: [
    { input: "nums = [-1, 0, 1, 2, -1, -4]", output: "[[-1, -1, 2], [-1, 0, 1]]", explain: "`(-1) + 0 + 1 = 0` and `(-1) + (-1) + 2 = 0`. The two `-1`s give the same triplet `[-1, 0, 1]` twice, but it is reported once." },
    { input: "nums = [0, 1, 1]", output: "[]", explain: "The only triplet sums to 2." },
    { input: "nums = [0, 0, 0]", output: "[[0, 0, 0]]", explain: "The only triplet sums to 0." },
  ],
  constraints: ["$3 \\le$ `nums.length` $\\le 3000$", "$-10^5 \\le$ `nums[i]` $\\le 10^5$"],
  check(input) { return input.nums.length < 3 ? "nums needs at least three numbers" : null; },
  judge(input, out, exp) {
    const norm = (t) => { try { return JSON.stringify(JSON.parse(t).map((r) => r.slice().sort((a, b) => a - b)).map((r) => JSON.stringify(r)).sort()); } catch { return t; } };
    return { ok: norm(out) === norm(exp), note: "Triplets are compared as sets: the order of triplets, and of numbers inside a triplet, does not matter." };
  },

  intuition: {
    find: "All **distinct** value-triplets from the array that add to zero. Duplicate *values* (not indices) must be reported only once.",
    beginner: "Three nested loops over `i < j < k`; if the sum is zero, sort the triple and put it in a set, which removes duplicates.",
    works: "It tries every triple of positions, so nothing can be missed, and the set removes repeated value-triplets.",
    slow: "$\\binom{n}{3} \\approx \\frac{n^3}{6}$ triples. For $n = 3000$ that is about 4.5 billion checks, too slow; the set adds even more overhead.",
    repeat: "For a fixed `i` and `j`, the third number is **forced**: it must be `−(nums[i] + nums[j])`. We loop over all `k` just to search for that one value. The inner loop is a *search*, repeated for every pair.",
    remember: "Fix the first number `nums[i]`. The remaining question *\"find two numbers that sum to `−nums[i]`\"* is exactly **Two Sum**. If the array is **sorted**, Two Sum has an $O(n)$ answer with no extra memory: two pointers closing in from the ends.",
    observation: "Sort first. For each `i`, put `l` just after it and `r` at the end: if the sum is too small, only moving `l` right can increase it; if too big, only moving `r` left can decrease it. Each step discards a number that cannot be part of any answer with this `i`. Sorting also puts equal values next to each other, so **skipping duplicates** is trivial.",
    leads: "Sort. For each `i` (skipping repeated values), run two pointers `l = i + 1`, `r = n − 1`. On sum 0 record the triplet, move both pointers, and skip over equal neighbours to avoid duplicates. Total: $O(n \\log n) + O(n^2) = O(n^2)$.",
  },

  flow: [
    "Try all triples `i < j < k`, put the sorted sums-to-zero triples in a set.",
    "Every triple is tested and the set removes duplicate value-triples.",
    "About $n^3/6$ triples: far too slow, and the inner loop only *searches* for a forced value.",
    "Fixing one number turns the rest into **Two Sum**, which is easy on a sorted array.",
    "Sort, then for each `i` close in with two pointers: too small → `l++`, too big → `r−−`.",
    "Skip equal neighbours to avoid duplicates: $O(n^2)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force:** three nested loops over indices `i < j < k`. When the three values sum to `0`, sort them and insert the triple into a `set` so that duplicate value-triples collapse. Return the set's contents.",
    why: "There are $\\binom{n}{3} = \\frac{n(n-1)(n-2)}{6} = \\Theta(n^3)$ triples. The innermost loop merely searches for the value `−(nums[i] + nums[j])`, which is fully determined by the first two, so almost all of that work is wasted. The set also adds $O(\\log n)$ per insertion.",
    time: "O(n^3)", space: "O(n)",
    measure: { fTex: "\\binom{n}{3}", f: (n) => (n * (n - 1) * (n - 2)) / 6, ns: [10, 100, 1000, 3000] },
    cpp: `class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        int n = nums.size();
        set<vector<int>> seen;
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                for (int k = j + 1; k < n; k++)
                    if (nums[i] + nums[j] + nums[k] == 0) {
                        vector<int> t = {nums[i], nums[j], nums[k]};
                        sort(t.begin(), t.end());
                        seen.insert(t);
                    }
        return vector<vector<int>>(seen.begin(), seen.end());
    }
};`,
    js: `function threeSum(nums) {
  const n = nums.length, seen = new Map();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++)
        if (nums[i] + nums[j] + nums[k] === 0) {
          const t = [nums[i], nums[j], nums[k]].sort((a, b) => a - b);
          seen.set(t.join(","), t);
        }
  return [...seen.values()];
}`,
  },

  pattern: {
    name: "Two Pointers (on sorted data)",
    why: "On a **sorted** array, a pair that must hit a target sum can be found with two pointers moving inwards: every comparison with the target tells us *which* pointer to move, discarding an element for good. 3Sum reduces to that by fixing one element. The sort also groups duplicates so they can be skipped cheaply.",
    recognize: [
      "You must find **pairs/triplets** with a target sum (or a target difference) in an array.",
      "The input may be **sorted** freely (order of elements does not matter, only values) so sorting is allowed.",
      "A brute force with nested loops where the innermost loop only *searches* for a determined value.",
      "The problem asks for **unique** combinations: sorting makes equal values adjacent, so duplicates are easy to skip.",
    ],
  },

  optimal: {
    idea: "Sort the array. Fix each element `nums[i]` as the smallest of the triplet (skipping repeated values of `i`). Then look for two numbers to its right summing to `−nums[i]` with two pointers `l = i + 1` and `r = n − 1`: if the sum is negative, move `l` right; if positive, move `r` left; if zero, record the triplet and move both inwards, skipping over equal values on both sides.",
    steps: [
      "Sort `nums`.",
      "For each `i` from `0` to `n − 3`: if `nums[i] > 0`, stop (three non-negative numbers cannot sum to 0 unless all are 0, handled earlier).",
      "If `nums[i] == nums[i − 1]`, **skip** it (same first value, same triplets).",
      "Set `l = i + 1`, `r = n − 1`. While `l < r`: `s = nums[i] + nums[l] + nums[r]`.",
      "If `s < 0` then `l++`; if `s > 0` then `r−−`.",
      "If `s == 0`: record `[nums[i], nums[l], nums[r]]`, then `l++`, `r−−`, and advance `l`/`r` past equal values.",
      "Return the recorded triplets.",
    ],
    invariant: "**For the current `i`, every triplet that uses `nums[i]` and two elements outside the window `[l, r]` has already been considered or is impossible.** Each pointer move discards a value that cannot belong to any remaining solution with this `i`.",
    correct: "*Pointer moves are safe:* the array is sorted, so if `nums[i] + nums[l] + nums[r] < 0`, then `nums[l]` paired with any element at or left of `r` gives an even smaller (still negative) sum, so `nums[l]` can never be part of a solution with this `i`: discard it (`l++`). Symmetrically for `r−−`. *No triplet is missed:* every solution `(i, l*, r*)` with `l* < r*` is reached because the pointers only discard elements that cannot work, so the window always contains `l*` and `r*` until the pair is examined. *No duplicates:* sorted order makes equal values contiguous, so skipping repeated `nums[i]` and repeated `l`/`r` values after a hit reports each distinct value-triplet exactly once.",
  },

  cpp: `class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        sort(nums.begin(), nums.end());                                   //@sort
        vector<vector<int>> res;
        int n = nums.size();
        for (int i = 0; i < n - 2; i++) {                                 //@loop
            if (nums[i] > 0) break;                                       // no more zero sums //@pos
            if (i > 0 && nums[i] == nums[i - 1]) continue;                // skip repeated i //@skipi
            int l = i + 1, r = n - 1;                                     //@setup
            while (l < r) {                                               //@while
                int s = nums[i] + nums[l] + nums[r];                      //@sum
                if (s < 0) l++;                                           // too small //@small
                else if (s > 0) r--;                                      // too big //@big
                else {
                    res.push_back({nums[i], nums[l], nums[r]});           //@hit
                    l++; r--;
                    while (l < r && nums[l] == nums[l - 1]) l++;          // skip repeats //@skipl
                    while (l < r && nums[r] == nums[r + 1]) r--;          //@skipr
                }
            }
        }
        return res;                                                       //@ret
    }
};`,
  js: `function threeSum(nums) {
  nums.sort((a, b) => a - b);                                             //@sort
  const res = [], n = nums.length;
  for (let i = 0; i < n - 2; i++) {                                       //@loop
    if (nums[i] > 0) break;                                               // no more zero sums //@pos
    if (i > 0 && nums[i] === nums[i - 1]) continue;                       // skip repeated i //@skipi
    let l = i + 1, r = n - 1;                                             //@setup
    while (l < r) {                                                       //@while
      const s = nums[i] + nums[l] + nums[r];                              //@sum
      if (s < 0) l++;                                                     // too small //@small
      else if (s > 0) r--;                                                // too big //@big
      else {
        res.push([nums[i], nums[l], nums[r]]);                            //@hit
        l++; r--;
        while (l < r && nums[l] === nums[l - 1]) l++;                     // skip repeats //@skipl
        while (l < r && nums[r] === nums[r + 1]) r--;                     //@skipr
      }
    }
  }
  return res;                                                             //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [-1, 0, 1, 2, -1, -4] } },
    { name: "Example 2: no triplet", kind: "normal", input: { nums: [0, 1, 1] } },
    { name: "Example 3: all zeros", kind: "normal", input: { nums: [0, 0, 0] } },
    { name: "A bigger mix", kind: "normal", input: { nums: [-4, -2, -2, -2, 0, 1, 2, 2, 2, 3, 3, 4, 4, 6, 6] } },
    { name: "Many repeated values", kind: "edge", input: { nums: [-2, 0, 0, 2, 2] }, why: "`[-2, 0, 2]` can be formed in **four** ways (two zeros, two twos) but must be reported **once**. Skipping repeated `l` and `r` values after a hit is what prevents duplicates; without it the output would contain four copies." },
    { name: "More than three zeros", kind: "edge", input: { nums: [0, 0, 0, 0] }, why: "Only one distinct triplet, `[0, 0, 0]`, even though there are four ways to choose three zeros. Skipping `nums[i] == nums[i−1]` and the inner duplicates leaves exactly one." },
    { name: "All positive numbers", kind: "edge", input: { nums: [1, 2, 3, 4] }, why: "No triplet of positives can sum to 0. The `nums[i] > 0` early exit stops the loop at once: the cheapest possible run (the sort dominates)." },
    { name: "Smallest valid input", kind: "corner", input: { nums: [-1, 0, 1] }, why: "Exactly three elements: the loop runs once (`i = 0`), `l = 1`, `r = 2`, and one hit." },
    { name: "All negative numbers", kind: "corner", input: { nums: [-3, -2, -1] }, why: "Three negatives sum to something negative, so `s < 0` on every step and `l` walks right until the pointers meet: no triplet. It exercises the \"too small\" branch to exhaustion." },
  ],

  trace(input, T) {
    const orig = input.nums.slice(), n = orig.length;
    const keys = orig.map((_, i) => "k" + i);
    // sort (stable, by value) and keep the keys so cells glide into place
    const order = orig.map((v, i) => i).sort((a, b) => orig[a] - orig[b] || a - b);
    const nums = order.map((i) => orig[i]), skeys = order.map((i) => "k" + i);
    const res = [];
    let whySkipI = false, whyMove = false, whyHit = false, whyDupe = false, whyPos = false;
    const pills = () => ({ label: "triplets found", items: res.map((t) => `[${t.join(", ")}]`) });
    const S = (st, o = {}) => () => ({ arr: o.sorted === false ? orig : nums, keys: o.sorted === false ? keys : skeys, l: o.l, r: o.r, hl: o.hl, ptr: o.i != null ? { i: o.i } : {}, label: o.sorted === false ? "nums  (as given)" : "nums  (sorted)", pills: pills(), regs: o.regs, discard: o.discard, note: o.note });
    T.step("sort", { vars: { n }, state: S(0, { sorted: false }), phase: "Sort first", say: "3Sum starts with the array **as given**. Sorting will put equal values side by side and make two-pointer reasoning possible.", op: "sort(nums)", act: "START" });
    T.step("sort", { vars: { n }, state: S(0, { sorted: true, discard: false }), say: `Sorted: **[${nums.join(", ")}]**. (Watch the cells slide into their new positions.)`, op: `nums = [${nums.join(", ")}]`, act: "SORTED" });
    T.phase("Fix i, then two pointers on the rest");
    for (let i = 0; i < n - 2; i++) {
      T.step("loop", { vars: { i, "nums[i]": nums[i] }, state: S(0, { i, hl: { [i]: "cur" }, discard: false }), say: `Fix the **smallest** number of the triplet: \`nums[${i}] = ${nums[i]}\`. We now need two numbers to its right that sum to **${-nums[i]}**: a Two Sum on a sorted array.`, op: `i = ${i},  need  nums[l] + nums[r] = ${-nums[i]}`, act: "FIX_I" });
      if (nums[i] > 0) {
        T.step("pos", { vars: { i, "nums[i]": nums[i] }, state: S(0, { i, hl: { [i]: "bad" }, discard: false }), say: `\`nums[${i}] = ${nums[i]}\` is **positive**, and every number after it is at least as large, so any triplet starting here sums to something positive. No more answers exist: stop.`, op: `nums[i] = ${nums[i]} > 0  ⇒  break`, act: "STOP_EARLY",
          why: whyPos ? null : { title: "Why can we stop at the first positive?", text: "The array is sorted, so `nums[i]` is the smallest of its triplet. If even the smallest is positive, all three are positive and the sum cannot be 0." } });
        whyPos = true;
        break;
      }
      if (i > 0 && nums[i] === nums[i - 1]) {
        T.step("skipi", { vars: { i, "nums[i]": nums[i] }, state: S(0, { i, hl: { [i]: "bad", [i - 1]: "dim" }, discard: false }), say: `\`nums[${i}] = ${nums[i]}\` equals the previous number, which was already used as the first element of a triplet. Every triplet starting with this value has been found: **skip** it.`, op: `nums[${i}] == nums[${i - 1}]  ⇒  continue`, act: "SKIP_DUPLICATE_I",
          why: whySkipI ? null : { title: "Why skip a repeated first value?", text: "Starting again from the same value would produce exactly the same triplets again. Because the array is sorted, repeats are adjacent, so one comparison with the previous element detects them." } });
        whySkipI = true;
        continue;
      }
      let l = i + 1, r = n - 1;
      T.step("setup", { vars: { i, l, r }, state: S(0, { i, l, r, hl: { [i]: "cur" } }), say: `Place \`l\` just after \`i\` (index ${l}) and \`r\` at the end (index ${r}). The window \`[l, r]\` holds every candidate partner.`, op: `l = ${l},  r = ${r}`, act: "SET_POINTERS" });
      while (l < r) {
        const s = nums[i] + nums[l] + nums[r];
        const regs = [{ k: "sum of the three", v: s, cls: s === 0 ? "ok" : s < 0 ? "bad" : "cmp" }];
        T.step("sum", { vars: { i, l, r, sum: s }, state: S(0, { i, l, r, hl: { [i]: "cur", [l]: "cmp", [r]: "cmp" }, regs }), say: `Sum of the three: ${nums[i]} + ${nums[l]} + ${nums[r]} = **${s}**. Compare with 0.`, op: `${nums[i]} + ${nums[l]} + ${nums[r]} = ${s}`, act: "SUM" });
        if (s < 0) {
          T.step("small", { vars: { i, l, r, sum: s }, state: S(0, { i, l, r, hl: { [i]: "cur", [l]: "bad", [r]: "cmp" }, regs }), say: `${s} < 0: the sum is **too small**. Because the array is sorted, \`nums[${l}] = ${nums[l]}\` paired with **any** number at or left of \`r\` is no bigger, so it can never reach 0 with this \`i\`. Discard it: \`l++\`.`, op: `${s} < 0  ⇒  l = ${l + 1}`, act: "MOVE_LEFT_POINTER_RIGHT",
            why: whyMove ? null : { title: "Why is it safe to move only l?", text: `\`r\` already points to the largest candidate. If even ${nums[l]} + the largest is too small, then ${nums[l]} plus anything else in the window is smaller still. To increase the sum we must use a **bigger** left number.` } });
          whyMove = true;
          l++;
        } else if (s > 0) {
          T.step("big", { vars: { i, l, r, sum: s }, state: S(0, { i, l, r, hl: { [i]: "cur", [l]: "cmp", [r]: "bad" }, regs }), say: `${s} > 0: the sum is **too big**. \`nums[${r}] = ${nums[r]}\` paired with any number at or right of \`l\` is no smaller, so discard it: \`r--\`.`, op: `${s} > 0  ⇒  r = ${r - 1}`, act: "MOVE_RIGHT_POINTER_LEFT" });
          r--;
        } else {
          res.push([nums[i], nums[l], nums[r]]);
          T.step("hit", { vars: { i, l, r, sum: 0 }, state: S(0, { i, l, r, hl: { [i]: "ok", [l]: "ok", [r]: "ok" }, regs }), say: `**Sum = 0!** Record the triplet **[${nums[i]}, ${nums[l]}, ${nums[r]}]**. Then move both pointers inwards: any other triplet with this \`i\` needs a different \`l\` and \`r\`.`, op: `0  ⇒  record [${nums[i]}, ${nums[l]}, ${nums[r]}];  l++, r--`, act: "FOUND",
            why: whyHit ? null : { title: "Why move BOTH pointers?", text: "If we moved only one, the sum would no longer be 0 (all values distinct from the moved one change it), so the other pointer would just have to follow. Moving both is the quickest way to the next possible match." } });
          whyHit = true;
          l++; r--;
          while (l < r && nums[l] === nums[l - 1]) {
            T.step("skipl", { vars: { i, l, r }, state: S(0, { i, l, r, hl: { [i]: "cur", [l]: "bad", [l - 1]: "dim" } }), say: `\`nums[${l}] = ${nums[l]}\` repeats the value just used, so it would produce the same triplet again. **Skip** it: \`l++\`.`, op: `nums[l] == nums[l−1]  ⇒  l = ${l + 1}`, act: "SKIP_DUPLICATE_L",
              why: whyDupe ? null : { title: "Why skip after a hit?", text: "Equal values are adjacent in a sorted array. Re-using the same value would give a copy of the triplet we just recorded, and the answer must contain each distinct triplet once." } });
            whyDupe = true;
            l++;
          }
          while (l < r && nums[r] === nums[r + 1]) {
            T.step("skipr", { vars: { i, l, r }, state: S(0, { i, l, r, hl: { [i]: "cur", [r]: "bad", [r + 1]: "dim" } }), say: `\`nums[${r}] = ${nums[r]}\` repeats the value just used on the right, so skip it: \`r--\`.`, op: `nums[r] == nums[r+1]  ⇒  r = ${r - 1}`, act: "SKIP_DUPLICATE_R" });
            r--;
          }
        }
      }
    }
    T.step("ret", { vars: { found: res.length }, state: S(0, { discard: false }), say: res.length ? `Finished. **${res.length}** distinct triplet${res.length === 1 ? "" : "s"}: ${res.map((t) => "[" + t.join(", ") + "]").join(", ")}.` : "Finished. No triplet sums to zero: the answer is an empty list.", op: "return res", act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) { const n = 3 + Math.floor(rnd() * 8); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 11) - 5) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => -(i + 1)) }; },

  complexity: {
    time: {
      tex: "O(n^2)", title: "an O(n log n) sort, then n two-pointer scans of O(n)", short: "the two-pointer part dominates",
      derive: [
        "T_{\\text{sort}}(n) = O(n \\log n) || comparison sort",
        "\\text{for each } i: \\; r - l \\text{ starts at } n - i - 2 \\text{ and shrinks by at least 1 per step} \\;\\Rightarrow\\; \\le n - i - 2 \\text{ steps} || every iteration of the inner loop moves `l` or `r` inwards",
        "T_{\\text{scan}}(n) \\le \\sum_{i=0}^{n-3} (n - i - 2)\\,c = c \\cdot \\frac{(n-2)(n-1)}{2} || arithmetic series",
        "T(n) = O(n \\log n) + O(n^2) || the quadratic term dominates",
        "!T(n) = O(n^2) || versus $\\Theta(n^3)$ for the brute force",
      ],
      where: "Each fixed `i` costs at most one pass of the two pointers: the pointers only move inwards, never back. That replaces the brute force's innermost loop (over `k`) with $O(1)$ amortised work per pair. $O(n^2)$ is the best known for 3Sum in general.",
    },
    space: {
      tex: "O(1)", title: "no extra structure beyond the output and the sort", short: "a few integers: i, l, r, sum",
      derive: [
        "S_{\\text{extra}}(n) = |i| + |l| + |r| + |s| || four integers",
        "S_{\\text{extra}}(n) = 4c + S_{\\text{sort}} || the sort may use $O(\\log n)$ stack (introsort) or $O(1)$ (heapsort)",
        "!S_{\\text{extra}}(n) = O(1) \\;\\text{(or } O(\\log n) \\text{ with a recursive sort)} || the output list is not counted",
      ],
      where: "The brute force needed a set of triples ($O(n)$ or more). Two pointers need only indices. (The output itself can have $\\Theta(n^2)$ triplets in the worst case, but it is required output and is not counted as extra.)",
    },
    limit: "No general algorithm is known that solves 3Sum in $O(n^{2-\\varepsilon})$ time: it is the standard example of a problem believed to need quadratic time (the *3SUM conjecture*), so $O(n^2)$ is the realistic optimum.",
    measure: { label: "n = nums.length", fTex: "n^2", f: (n) => n * n, sizes: [8, 16, 32, 64, 128, 256], growth: "quadratic", reading: "Doubling the input multiplies the work by about **4**: quadratic growth, from n two-pointer scans of length about n." },
  },

  mistakes: [
    { title: "Forgetting to skip duplicate values", what: "Recording every zero-sum triple without skipping repeated `i`, `l` or `r`.", why: "The pointer logic seems to \"naturally\" avoid repeats.", breaks: "`[-2, 0, 0, 2, 2]` returns `[-2, 0, 2]` four times; the problem requires unique triplets.", avoid: "After sorting: skip `i` if `nums[i] == nums[i−1]`; after a hit move `l` and `r` past equal values." },
    { title: "Skipping duplicates *before* using them", what: "Writing `while (nums[l] == nums[l+1]) l++;` before recording the hit.", why: "It looks like the same duplicate skipping.", breaks: "It can jump over the second element of a legitimate pair like `[-1, -1, 2]` (the first `-1` is `nums[i]`, the second must be allowed at `l`).", avoid: "Skip only **after** recording, by comparing with the value just used (`nums[l] == nums[l − 1]`)." },
    { title: "Not sorting the array", what: "Running two pointers on unsorted data.", why: "Forgetting that the pointer-moving rule depends on order.", breaks: "\"Too small, move `l`\" is meaningless when values are not ordered: answers are missed.", avoid: "Sort first (it is only $O(n \\log n)$, cheaper than the $O(n^2)$ part)." },
    { title: "Moving only one pointer after a hit", what: "Doing `l++` but not `r--` (or vice versa).", why: "Habit from Two Sum II (one answer, so return).", breaks: "Misses other triplets with the same `i`, or loops without making progress in some variants.", avoid: "After a hit move both: `l++; r--;` then skip repeated values." },
    { title: "Using `i <= n − 2` with `l = i + 1`, `r = n − 1`", what: "Looping `i` too far.", why: "Off-by-one in the bound.", breaks: "For `i = n − 2` there is only one element to its right, so `l == r` and the inner loop never runs, harmless; but `i = n − 1` makes `l = n` out of range (and a `nums[l]` read is undefined).", avoid: "Loop `i < n − 2`." },
  ],

  followUps: [
    {
      q: "Solve it with a **hash set** instead of two pointers. Is it better?",
      a: "Fix `i`, then for each `j > i` look up `−nums[i] − nums[j]` in a set of values seen between `i` and `j`. It is also $O(n^2)$ time but uses $O(n)$ extra memory and needs extra care to avoid duplicate triplets (usually by sorting anyway). The two-pointer method needs no extra memory and handles duplicates more naturally, so it is the standard answer.",
      time: "O(n^2)", space: "O(n)",
    },
    {
      q: "**3Sum Closest:** return the sum of three numbers that is closest to a given `target`.",
      a: "The same sort-and-two-pointers skeleton: for each `i`, move `l`/`r` as before (too small → `l++`, too big → `r−−`) but keep track of the sum with the smallest `|sum − target|`; return immediately if you hit `target` exactly. Time $O(n^2)$, space $O(1)$.",
      time: "O(n^2)", space: "O(1)",
    },
    {
      q: "**4Sum:** find all unique quadruplets that sum to `target`.",
      a: "Add one more outer loop: sort, fix `i` and `j`, then run two pointers on the rest, with the same duplicate skipping at every level. Time $O(n^3)$. In general *k*-Sum is solved by recursing down to Two Sum: $O(n^{k-1})$.",
      time: "O(n^3)", space: "O(1)",
    },
    {
      q: "Count the triplets with sum **less than** a target (not their list).",
      a: "Sort, fix `i`, set `l = i + 1`, `r = n − 1`. If `nums[i] + nums[l] + nums[r] < target`, then **every** index between `l` and `r` also works with `l` (the array is sorted), so add `r − l` to the count and do `l++`; otherwise `r−−`. One pass per `i` gives $O(n^2)$ without ever listing the triplets.",
      time: "O(n^2)", space: "O(1)",
    },
  ],

  related: [
    { id: "two-sum", why: "3Sum is Two Sum nested one level deeper: fix one number, then solve the pair problem on the rest." },
    { id: "container-with-most-water", why: "Another two-pointer scan from both ends where a comparison tells you which pointer to move." },
    { id: "valid-palindrome", why: "The simplest two-pointer pattern: compare the ends and move inwards." },
  ],
  patternNote: "**The Two Pointers pattern** works when the data has an order that makes each comparison decisive: *too small → move the left pointer, too big → move the right pointer*, discarding an element for good every time. Combine it with sorting and a fixed outer element to reduce k-Sum problems by one level of looping.",
  takeaways: [
    "Sort, fix one number, then solve **Two Sum on a sorted array** with `l` and `r` closing in.",
    "Sum too small → `l++`; too big → `r−−`; zero → record, move **both**, skip repeats.",
    "Skip duplicates for `i`, and for `l`/`r` *after* a hit, to report each triplet once.",
    "Time $O(n^2)$ (sort $O(n \\log n)$ + $n$ scans), extra space $O(1)$. Brute force is $O(n^3)$.",
    "Recognise it by: pairs/triplets summing to a target, order irrelevant, uniqueness required.",
  ],
});
