SHEETS.define({
  id: "longest-consecutive-sequence",
  viz: "hashmap",
  io: { fn: "longestConsecutive", params: [["nums", "int[]"]], ret: "int" },

  statement: `Given an **unsorted** array of integers \`nums\`, return the length of the **longest run of consecutive values** (like \`3, 4, 5, 6\`) that can be formed from its elements. The elements need **not** be next to each other in the array.

Your algorithm must run in $O(n)$ time.`,
  examples: [
    { input: "nums = [100, 4, 200, 1, 3, 2]", output: "4", explain: "The longest consecutive run is `[1, 2, 3, 4]`: length 4." },
    { input: "nums = [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]", output: "9", explain: "The values `0 … 8` are all present, so the run has length 9 (the duplicate `0` counts once)." },
    { input: "nums = [1, 0, 1, 2]", output: "3", explain: "`0, 1, 2`: the repeated `1` does not lengthen it." },
  ],
  constraints: ["$0 \\le$ `nums.length` $\\le 10^5$", "$-10^9 \\le$ `nums[i]` $\\le 10^9$"],

  intuition: {
    find: "The longest stretch `x, x+1, x+2, …` made only of values that appear in the array (in any positions, with repeats ignored).",
    beginner: "Sort the array, remove the duplicates, and scan once counting how long each streak of `+1` steps is. Keep the longest.",
    works: "After sorting, consecutive values sit next to each other, so a single scan finds all the streaks.",
    slow: "Sorting costs $O(n \\log n)$, but the problem demands $O(n)$. We need to find streaks without ordering everything.",
    repeat: "Sorting does a lot of work to arrange *all* the numbers, while all we need is to answer *\"is `x + 1` in the array?\"* repeatedly. A hash set answers that in $O(1)$.",
    remember: "Put all the numbers in a **hash set**. Then \"is `x + 1` present?\" and \"is `x − 1` present?\" are $O(1)$ lookups.",
    observation: "If we start counting from **every** number, a streak of length `L` is counted `L` times (once from each member), which can be $O(n^2)$. The fix: only start counting from a number that is the **beginning** of a streak, i.e. whose predecessor `x − 1` is **not** in the set. Then each streak is walked exactly once, from its first element to its last.",
    leads: "For each `x` in the set: if `x − 1` is in the set, skip it (not a start). Otherwise count upward while `x + 1, x + 2, …` are in the set, and keep the maximum length. Every number is visited by at most one counting walk, so the total work is $O(n)$.",
  },

  flow: [
    "Sort, drop duplicates, scan for streaks of `+1` steps.",
    "In sorted order consecutive values are adjacent, so the scan finds every streak.",
    "$O(n \\log n)$: the problem wants $O(n)$.",
    "A hash set answers \"is `x ± 1` present?\" in $O(1)$.",
    "Only start counting at numbers whose predecessor `x − 1` is absent.",
    "Each streak is walked once from its start: $O(n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**Sort and scan:** sort the array, then walk through it keeping the length of the current streak: if the next value equals the previous one, skip it (duplicate); if it is exactly one more, extend the streak; otherwise start a new streak. Keep the longest.",
    why: "Sorting costs $O(n \\log n)$, and the rest of the work is a single linear scan, so the total is $O(n \\log n)$: too slow for the required $O(n)$. All the sorting does is bring neighbours together; a hash set can find neighbours directly.",
    time: "O(n log n)", space: "O(1)",
    measure: { fTex: "n \\log_2 n", f: (n) => n * Math.log2(Math.max(2, n)), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int longestConsecutive(vector<int>& nums) {
        if (nums.empty()) return 0;
        sort(nums.begin(), nums.end());
        int best = 1, cur = 1;
        for (int i = 1; i < (int)nums.size(); i++) {
            if (nums[i] == nums[i - 1]) continue;
            if (nums[i] == nums[i - 1] + 1) cur++; else cur = 1;
            best = max(best, cur);
        }
        return best;
    }
};`,
    js: `function longestConsecutive(nums) {
  if (nums.length === 0) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  let best = 1, cur = 1;
  for (let i = 1; i < a.length; i++) {
    if (a[i] === a[i - 1]) continue;
    if (a[i] === a[i - 1] + 1) cur++; else cur = 1;
    best = Math.max(best, cur);
  }
  return best;
}`,
  },

  pattern: {
    name: "Hash Set",
    why: "The whole structure of the problem is *membership*: \"is the next value present?\". A hash set gives $O(1)$ membership with no ordering at all. The key trick (start only at **sequence starts**) is a smart way to avoid repeated work: each element is *entered* by at most one walk.",
    recognize: [
      "You need relationships between values (`x` and `x + 1`) in an **unsorted** array, in linear time.",
      "Sorting would work but costs $O(n \\log n)$, and the problem asks for $O(n)$.",
      "A brute force that counts upward from every element repeats work: look for a *\"only start here if …\"* condition.",
      "Duplicates must be ignored (a set does that automatically).",
    ],
  },

  optimal: {
    idea: "Put every number in a hash set. For each number `x` in the set, check whether `x − 1` is also in the set: if so, `x` is in the middle of a streak and is skipped. If not, `x` is the **start** of a streak: count upward (`x + 1`, `x + 2`, …) while the next number is in the set, and update the best length.",
    steps: [
      "Insert all elements of `nums` into an `unordered_set` `s` (duplicates vanish).",
      "For each `x` in `s`: if `s` contains `x − 1`, **skip** (not the start of a streak).",
      "Otherwise set `cur = x`, `len = 1`, and while `s` contains `cur + 1`: `cur++`, `len++`.",
      "Update `best = max(best, len)`.",
      "Return `best` (0 for an empty array).",
    ],
    invariant: "**The inner `while` loop runs only for numbers with no predecessor in the set, so every element is walked over by at most one counting loop.**",
    correct: "Any maximal consecutive streak `a, a+1, …, b` has a unique start `a` (its predecessor `a − 1` is absent by maximality). The algorithm reaches `a`, finds that `a − 1` is missing, and counts `a, a+1, …` until `b + 1` is absent, getting length `b − a + 1`. All other members of the streak have their predecessor present and are skipped. So every maximal streak is measured exactly once, and `best` is the largest. Duplicates are irrelevant because we iterate over a *set*.",
  },

  cpp: `class Solution {
public:
    int longestConsecutive(vector<int>& nums) {
        unordered_set<int> s(nums.begin(), nums.end());      // duplicates disappear //@init
        int best = 0;
        for (int x : s) {                                    //@loop
            if (s.count(x - 1)) continue;                    // not the start of a streak //@notstart
            int cur = x, len = 1;                            // x starts a streak //@start
            while (s.count(cur + 1)) { cur++; len++; }       // walk up the streak //@extend
            best = max(best, len);                           //@best
        }
        return best;                                         //@ret
    }
};`,
  js: `function longestConsecutive(nums) {
  const s = new Set(nums);                                   // duplicates disappear //@init
  let best = 0;
  for (const x of s) {                                       //@loop
    if (s.has(x - 1)) continue;                              // not the start of a streak //@notstart
    let cur = x, len = 1;                                    // x starts a streak //@start
    while (s.has(cur + 1)) { cur++; len++; }                 // walk up the streak //@extend
    best = Math.max(best, len);                              //@best
  }
  return best;                                               //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [100, 4, 200, 1, 3, 2] } },
    { name: "Example 2: nine in a row", kind: "normal", input: { nums: [0, 3, 7, 2, 5, 8, 4, 6, 0, 1] } },
    { name: "Example 3: duplicates", kind: "normal", input: { nums: [1, 0, 1, 2] } },
    { name: "Empty array", kind: "edge", input: { nums: [] }, why: "No numbers, no streak: the answer is `0`. The loop never runs and `best` was initialised to `0`; starting `best` at 1 would be wrong here." },
    { name: "Every number equal", kind: "edge", input: { nums: [3, 3, 3] }, why: "The set collapses to `{3}`, a streak of length 1. Without a set, counting `3, 3, 3` as consecutive (because `x == previous`) would overshoot." },
    { name: "Negative numbers across zero", kind: "edge", input: { nums: [-1, -2, -3, 0, 1, 10] }, why: "The streak `−3, −2, −1, 0, 1` has length 5: it crosses zero. Hash lookups work on any integers, positive or negative; an approach based on a boolean array indexed by value would break." },
    { name: "A single element", kind: "corner", input: { nums: [42] }, why: "One number: a streak of length 1. `s.count(41)` is false, so it is a start, and the inner loop does not run." },
    { name: "Reverse sorted", kind: "corner", input: { nums: [5, 4, 3, 2, 1] }, why: "Only `1` has no predecessor, so exactly one counting walk covers the whole run (length 5). Starting a walk from every number would repeat the run 5, 4, 3, 2, 1 times: quadratic work. This is the case the \"only start at a streak's beginning\" rule is designed for." },
    { name: "Gaps everywhere", kind: "corner", input: { nums: [10, 20, 30, 40] }, why: "Every number is the start of a streak of length 1, and every inner `while` stops immediately: the answer is 1 and the work is still linear." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length, cap = 8;
    const uniq = [...new Set(nums)];
    const bucket = (k) => ((k % cap) + cap) % cap;
    const entries = uniq.map((v) => [v, "✓"]);
    const idxOf = (v) => nums.indexOf(v);
    let best = 0, bestStart = null, bestLen = 0, whyStart = false, whySkip = false, whyOnce = false;
    const S = (xi, o = {}) => () => {
      const hl = {};
      if (o.streak) o.streak.forEach((v) => { const i = idxOf(v); if (i >= 0) hl[i] = "win"; });
      if (bestStart != null) for (let v = bestStart; v < bestStart + bestLen; v++) { const i = idxOf(v); if (i >= 0 && hl[i] !== "win") hl[i] = "ok"; }
      if (xi != null) hl[xi] = o.skip ? "dim" : "cur";
      const mhl = {};
      if (o.look != null) mhl[o.look] = o.hit ? "hit" : "bad";
      return { arr: nums, hl, ptr: xi != null ? { x: xi } : {}, label: "nums  (unsorted)", map: { entries, hl: mhl, view: "buckets", cap, title: "s  (the set of distinct values)", hotBucket: o.look != null ? bucket(o.look) : undefined, keyLabel: "value", valLabel: "in set" }, probe: xi != null && o.look != null ? { key: o.look, from: xi, res: o.hit ? "found" : "miss" } : undefined, calc: o.calc, regs: [{ k: "current streak", v: o.len ?? "–", cls: "cur" }, { k: "best so far", v: best, cls: "hit" }] };
    };
    T.step("init", { vars: { n, "distinct values": uniq.length }, state: S(null, {}), phase: "Put everything in a set", say: `All ${n} numbers go into a hash set \`s\`: **${uniq.length}** distinct value${uniq.length === 1 ? "" : "s"} remain (duplicates vanish). Now \"is \`x ± 1\` present?\" is one lookup.`, op: `s = { ${uniq.join(", ")} }`, act: "BUILD_SET" });
    if (!uniq.length) { T.step("ret", { vars: { best: 0 }, state: S(null, {}), say: "The array is empty, so there is no streak: return **0**.", op: "return 0", act: "DONE" }); T.result(0); return; }
    T.phase("For each value: is it the start of a streak?");
    for (const x of uniq) {
      const xi = idxOf(x), hasPrev = entries.some((e) => e[0] === x - 1);
      T.step("loop", { vars: { x, best }, state: S(xi, { look: x - 1, hit: hasPrev, calc: `is ${x - 1} in s ?` }), say: `Take **${x}**. Is its predecessor **${x - 1}** in the set? ${hasPrev ? "Yes." : "No."}`, op: `s.count(${x} − 1) = ${hasPrev ? 1 : 0}`, act: "LOOK_AT_PREDECESSOR" });
      if (hasPrev) {
        T.step("notstart", { vars: { x }, state: S(xi, { skip: true, look: x - 1, hit: true, calc: `${x} is inside a streak: skip` }), say: `${x - 1} **is** in the set, so ${x} is in the **middle** of a streak that begins earlier. Skip it: some other number will count this streak from its start, once.`, op: `${x - 1} in s  ⇒  continue`, act: "SKIP_NOT_A_START",
          why: whySkip ? null : { title: "Why skip it?", text: `Counting from ${x} would walk the same numbers that the streak's real start will walk anyway. Skipping every non-start means each streak is walked once, so the total work stays linear.` } });
        whySkip = true;
        continue;
      }
      let cur = x, len = 1;
      T.step("start", { vars: { x, cur, len }, state: S(xi, { streak: [x], len, look: x - 1, hit: false, calc: `${x} is the start of a streak` }), say: `${x - 1} is **not** in the set, so **${x} starts a streak**. It is the first number, so the streak has length 1 so far.`, op: `cur = ${x},  len = 1`, act: "STREAK_STARTS",
        why: whyStart ? null : { title: "Why does 'x − 1 missing' mean a start?", text: `If x − 1 is absent, nothing smaller continues the run, so x is the smallest member of its streak: the unique place to start counting it.` } });
      whyStart = true;
      const streak = [x];
      while (entries.some((e) => e[0] === cur + 1)) {
        cur++; len++; streak.push(cur);
        T.step("extend", { vars: { x, cur, len }, state: S(xi, { streak: streak.slice(), len, look: cur, hit: true, calc: `${cur} is in s: streak = ${len}` }), say: `${cur} **is** in the set: the streak grows to length **${len}** (${streak.join(", ")}).`, op: `s.count(${cur}) = 1  ⇒  len = ${len}`, act: "EXTEND_STREAK" });
      }
      T.step("extend", { vars: { x, cur, len }, state: S(xi, { streak: streak.slice(), len, look: cur + 1, hit: false, calc: `${cur + 1} is not in s: the streak ends` }), say: `${cur + 1} is **not** in the set, so the streak ends at ${cur}. Its length is **${len}**.`, op: `s.count(${cur + 1}) = 0  ⇒  stop`, act: "STREAK_ENDS" });
      const imp = len > best, prevBest = best;
      if (imp) { best = len; bestStart = x; bestLen = len; }
      T.step("best", { vars: { len, best }, state: S(xi, { streak: streak.slice(), len }), say: imp ? `Length **${len}** beats the best so far: \`best = ${best}\`.` : `Length ${len} does not beat \`best = ${best}\`.`, op: `best = max(${prevBest}, ${len}) = ${best}`, act: imp ? "NEW_BEST" : "KEEP_BEST",
        why: whyOnce ? null : { title: "Is anything walked twice?", text: "No. Each number is either skipped (it has a predecessor) or is the start of exactly one streak, and the while loop only visits the numbers of that one streak. So all the inner loops together visit each element at most once." } });
      whyOnce = true;
    }
    T.step("ret", { vars: { best }, state: S(null, {}), say: `Every number was either skipped or started one streak. The longest run of consecutive values has length **${best}**.`, op: `return ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = Math.floor(rnd() * 12); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 15) - 4) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "each number is skipped or walked over exactly once", short: "n lookups for the outer loop, at most n more across all the inner loops",
      derive: [
        "T_{\\text{set}} = O(n) || inserting $n$ values (average $O(1)$ each)",
        "T_{\\text{outer}} = \\sum_{x \\in s} c = c\\,|s| \\le c\\,n || one `x − 1` lookup per distinct value",
        "\\text{the inner loop runs only from streak starts and visits each streak once} \\;\\Rightarrow\\; \\sum \\text{(inner steps)} \\le |s| \\le n || the streaks are disjoint",
        "T(n) = O(n) + O(n) + O(n)",
        "!T(n) = O(n) \\text{ on average} || versus $O(n \\log n)$ for sorting and $O(n^2)$ if every number started a walk",
      ],
      where: "The nested loops *look* quadratic, but the `continue` guarantees the inner loop starts only at the beginning of a streak, and streaks do not overlap, so the inner steps add up to at most $n$ over the whole run. (Hash operations are $O(1)$ on average.)",
    },
    space: {
      tex: "O(n)", title: "the hash set", short: "up to n distinct values",
      derive: [
        "S(n) = |s| \\cdot s_{\\text{int}} || the set of distinct values",
        "!S(n) = O(n) || the sort-based version needs only $O(1)$ extra space, at the cost of $O(n \\log n)$ time",
      ],
      where: "We trade memory for speed: the set costs $O(n)$ but buys $O(1)$ lookups and removes the sort.",
    },
    limit: "Every number must be read ($\\Omega(n)$), so $O(n)$ time is optimal. In the comparison model without hashing, the problem is as hard as element-distinctness-type problems, so linear time genuinely needs the hash set (or radix sort).",
    measure: { label: "n = nums.length (one long run)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Starting a walk from every number", what: "Counting upward from each element without the `x − 1` check.", why: "It is the direct translation of \"for each number, count how far the run goes\".", breaks: "A run of length $L$ is walked $L$ times (from each member): total $O(n^2)$ for one long run, a time-limit error on 10⁵ numbers.", avoid: "Only start at `x` when `x − 1` is **not** in the set." },
    { title: "Iterating over `nums` instead of the set", what: "`for (int x : nums)` with duplicates.", why: "The array is the input.", breaks: "A value repeated many times starts the same walk many times (each duplicate of a streak start is a fresh start): the complexity degrades to $O(n \\cdot \\text{duplicates})$.", avoid: "Iterate over the **set** (distinct values)." },
    { title: "Initialising `best` to 1", what: "`int best = 1;`", why: "\"A single number is a streak of 1\".", breaks: "For an empty array the answer must be 0, but you return 1.", avoid: "`best = 0`; the first streak start sets it to at least 1." },
    { title: "Sorting and forgetting to skip duplicates", what: "A sorted scan that treats `1, 1` as breaking or extending the streak.", why: "Equal neighbours look like \"no gap\".", breaks: "`[1, 2, 2, 3]` would give 4 (counting the 2 twice) or reset the streak and give 2; the correct answer is 3.", avoid: "Skip `a[i] == a[i − 1]` explicitly, or use a set." },
    { title: "Using a boolean array indexed by value", what: "A visited table of size `max − min + 1`.", why: "Direct addressing is the fastest lookup.", breaks: "Values go up to $10^9$ in absolute value: the table needs gigabytes.", avoid: "Hash set (or coordinate compression after sorting)." },
  ],

  followUps: [
    {
      q: "Solve it with a **hash map** that stores streak lengths at the endpoints.",
      a: "For each new number `x` (if not seen), let `left = len[x−1]` and `right = len[x+1]` be the lengths of the streaks ending just before and starting just after it. The merged streak has length `left + right + 1`; store it at the **two endpoints** `x − left` and `x + right` (only the endpoints need to be correct). Each number is processed once: $O(n)$ with a single pass and no inner loop.",
      cpp: `int longestConsecutiveMap(vector<int>& nums) {
    unordered_map<int, int> len;       // len[v] valid only at streak endpoints
    int best = 0;
    for (int x : nums) {
        if (len.count(x)) continue;
        int left = len.count(x - 1) ? len[x - 1] : 0;
        int right = len.count(x + 1) ? len[x + 1] : 0;
        int total = left + right + 1;
        len[x] = len[x - left] = len[x + right] = total;
        best = max(best, total);
    }
    return best;
}`,
      js: `function longestConsecutiveMap(nums) {
  const len = new Map();               // len.get(v) valid only at streak endpoints
  let best = 0;
  for (const x of nums) {
    if (len.has(x)) continue;
    const left = len.get(x - 1) || 0, right = len.get(x + 1) || 0;
    const total = left + right + 1;
    len.set(x, total); len.set(x - left, total); len.set(x + right, total);
    best = Math.max(best, total);
  }
  return best;
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Solve it with **Union-Find**.",
      a: "Treat each distinct value as a node and `union(x, x + 1)` whenever both are present (use a map from value to index). The answer is the size of the largest set. It is $O(n\\,\\alpha(n))$, a good illustration that *consecutive values* are just *connected components*.",
      time: "O(n·α(n))", space: "O(n)",
    },
    {
      q: "Return the **streak itself**, not just its length.",
      a: "Remember the start `bestStart` and the length when `best` improves, then output `bestStart, bestStart + 1, …, bestStart + best − 1`. No extra cost. (The lab highlights the best streak in green.)",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "The numbers arrive as a **stream**; maintain the longest streak.",
      a: "Use the hash-map endpoint method: it updates in $O(1)$ per new number and keeps `best` up to date at every moment. The set-with-start-check version would have to be re-run from scratch.",
      time: "O(1) per number", space: "O(n)",
    },
  ],

  related: [
    { id: "contains-duplicate", why: "The simplest use of the same hash set." },
    { id: "two-sum", why: "Another \"look up the neighbour value\" hash problem (the complement `target − x`)." },
    { id: "number-of-connected-components-in-an-undirected-graph", why: "Consecutive values are components of the graph `x — x+1`: Union-Find solves it too." },
    { id: "valid-anagram", why: "Another hash-based linear-time idea replacing a sort." },
  ],
  patternNote: "**\"Only start at the beginning\"** is a powerful way to make a nested loop linear: iterate over all items, but run the expensive inner walk only from items that are the *first* of their group, detected in $O(1)$ (here: the predecessor is absent). Each group is then walked once. Pair it with a hash set for $O(1)$ lookups.",
  takeaways: [
    "Put the numbers in a **hash set**; \"is `x ± 1` present?\" becomes $O(1)$.",
    "Walk a streak only from its **start** (`x − 1` not in the set); skip everything else.",
    "Each streak is walked once, so the nested loops total $O(n)$, not $O(n^2)$.",
    "Iterate over the **set**, not the array, so duplicates do not repeat work; `best` starts at 0.",
    "Sorting works in $O(n \\log n)$; the set gives $O(n)$ at the cost of $O(n)$ memory.",
  ],
});
