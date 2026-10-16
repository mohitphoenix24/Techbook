SHEETS.define({
  id: "contains-duplicate",
  viz: "hashmap",
  io: { fn: "containsDuplicate", params: [["nums", "int[]"]], ret: "bool" },

  statement: `Given an integer array \`nums\`, return \`true\` if **any value appears at least twice** in the array, and \`false\` if every element is distinct.`,
  examples: [
    { input: "nums = [1, 2, 3, 1]", output: "true", explain: "The value `1` appears at index 0 and again at index 3." },
    { input: "nums = [1, 2, 3, 4]", output: "false", explain: "All four values are different." },
    { input: "nums = [1, 1, 1, 3, 3, 4, 3, 2, 4, 2]", output: "true", explain: "Several values repeat; one repeat is enough." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 10^5$", "$-10^9 \\le$ `nums[i]` $\\le 10^9$"],

  intuition: {
    find: "A yes/no answer: *does at least one value occur twice?* We do not need to know which value, or where.",
    beginner: "Compare every element with every element after it. If two are equal, answer `true`. If no pair matches, answer `false`.",
    works: "It examines **every pair** of positions, so any duplicate pair will be found. If none is found, none exists.",
    slow: "There are $\\frac{n(n-1)}{2}$ pairs, about 5 billion for $n = 10^5$. The cost is quadratic.",
    repeat: "For each element we scan the rest of the array asking *\"does this value occur again?\"*. That is a **search by value**, and we run it from scratch for each element.",
    remember: "As we walk through the array we can **remember the values we have seen**. Then, for the current element, the question *\"have I seen this value before?\"* is a single lookup.",
    observation: "We only care about *membership*: \"is `x` among the earlier values?\". A **hash set** answers membership in $O(1)$ on average and ignores order and positions, which is exactly what this question needs.",
    leads: "Walk through the array once. If the current value is already in the set, we have found a duplicate: return `true`. Otherwise insert it and carry on. If the loop finishes, every value was new, so return `false`.",
  },

  flow: [
    "Compare every pair of elements.",
    "All pairs are checked, so a duplicate pair cannot hide.",
    "$\\frac{n(n-1)}{2}$ comparisons, each element re-searching the array.",
    "We only need to know *whether a value was seen before*, not where.",
    "Keep a hash set of seen values: membership is an $O(1)$ lookup.",
    "One pass: if `x` is in the set return `true`, else insert it. $O(n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**Brute force:** two nested loops. For each `i`, check every `j > i`; if `nums[i] == nums[j]` return `true`. If no pair is equal, return `false`.",
    why: "Each element is compared with all later ones: $(n-1) + (n-2) + \\dots + 1 = \\frac{n(n-1)}{2}$ comparisons, which is $\\Theta(n^2)$. It uses no extra memory, but the inner loop is a plain linear search repeated for every element.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        int n = nums.size();
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                if (nums[i] == nums[j]) return true;
        return false;
    }
};`,
    js: `function containsDuplicate(nums) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] === nums[j]) return true;
  return false;
}`,
  },

  pattern: {
    name: "Hash Set",
    why: "The whole question is *membership*: \"is this value already among the ones I have seen?\" A hash set stores values and answers that in constant time on average. It is the simplest form of the hash-based pattern: no associated value, just presence.",
    recognize: [
      "The question is about **duplicates, uniqueness, or \"have I seen this?\"**.",
      "You do not need positions or counts, only whether something appeared before.",
      "A nested loop whose inner loop searches for an **equal value**.",
      "Sorting would also work (equal values become neighbours), but you want to avoid the $O(n \\log n)$ cost, or the input is a stream.",
    ],
  },

  optimal: {
    idea: "Keep a hash set `seen` of the values encountered so far. For each element: if it is already in `seen`, it is a repeat, so return `true`. Otherwise add it. The set can be checked **before** inserting, so the element is never compared with itself.",
    steps: [
      "Create an empty hash set `seen`.",
      "For each `x` in `nums`: if `x` is already in `seen`, **return `true`**.",
      "Otherwise insert `x` into `seen`.",
      "After the loop, no value repeated: **return `false`**.",
    ],
    invariant: "**Before reading element `i`, `seen` holds exactly the distinct values of `nums[0..i−1]`, and none of them was repeated** (otherwise we would already have returned).",
    correct: "If the array has a duplicate, take the earliest *second* occurrence at index `j`. All values before `j` are distinct, so the first occurrence at `i < j` was inserted into `seen`, and when we reach `j` the lookup finds it and returns `true`. If we return `true` at some `x`, then `x` is in `seen`, so an earlier element equals it: a genuine duplicate. If we finish the loop, no lookup ever succeeded, so every element was new: no duplicates.",
  },

  cpp: `class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        unordered_set<int> seen;                 // values seen so far //@init
        for (int x : nums) {                     //@loop
            if (seen.count(x)) return true;      // seen before: duplicate //@lookup,found
            seen.insert(x);                      //@store
        }
        return false;                            //@none
    }
};`,
  js: `function containsDuplicate(nums) {
  const seen = new Set();                        // values seen so far //@init
  for (const x of nums) {                        //@loop
    if (seen.has(x)) return true;                // seen before: duplicate //@lookup,found
    seen.add(x);                                 //@store
  }
  return false;                                  //@none
}`,

  tests: [
    { name: "Example 1: a repeat", kind: "normal", input: { nums: [1, 2, 3, 1] } },
    { name: "Example 2: all distinct", kind: "normal", input: { nums: [1, 2, 3, 4] } },
    { name: "Example 3: many repeats", kind: "normal", input: { nums: [1, 1, 1, 3, 3, 4, 3, 2, 4, 2] } },
    { name: "Adjacent duplicates", kind: "edge", input: { nums: [5, 5] }, why: "The repeat is found on the **second** element, the earliest possible moment. The set lookup must happen *before* the insert; if you inserted first, every element would \"find itself\" and always return `true`." },
    { name: "Negative numbers and zero", kind: "edge", input: { nums: [0, -1, 7, -1] }, why: "Nothing in a hash set cares about the sign. (A solution that used the *value as an array index* in a boolean table would crash on negatives, which is why a hash set is the safe tool here.)" },
    { name: "Extreme values, all different", kind: "edge", input: { nums: [1000000000, -1000000000, 0, 999999999] }, why: "Values at the limits of the constraints stay distinct, so the answer is `false`. A boolean array indexed by value would need two billion cells, which is exactly why we use a hash set instead." },
    { name: "A single element", kind: "corner", input: { nums: [7] }, why: "With one element there is nothing to repeat, so the answer is `false`. The loop inserts once and ends; the code must not assume at least two elements." },
    { name: "Duplicate only at the very end", kind: "corner", input: { nums: [1, 2, 3, 4, 5, 6, 1] }, why: "The first six elements miss, the set grows to size 6, and only the final lookup succeeds. This is the **worst case** for a `true` answer: the full scan and the largest set." },
  ],

  trace(input, T) {
    const { nums } = input, n = nums.length, cap = 8;
    const entries = [], stored = [];
    const bucket = (k) => ((k % cap) + cap) % cap;
    let whyFirst = false;
    const S = (i, o = {}) => () => {
      const hl = {};
      stored.forEach((k) => (hl[k] = "key"));
      if (i != null && i < n) hl[i] = "cur";
      if (o.hit != null) hl[o.hit] = "hit";
      return { arr: nums, hl, ptr: i != null && i < n ? { i } : {}, label: "nums  (input)", map: { entries: entries.map((e) => [e[0], e[1]]), hl: o.mhl || {}, view: "buckets", cap, title: "seen  (a set of values)", hotBucket: o.need != null ? bucket(o.need) : undefined, keyLabel: "value", valLabel: "first at" }, probe: o.probe, calc: o.calc };
    };
    T.step("init", { vars: { "seen.size": 0 }, state: S(null), phase: "One pass with a hash set", say: "`seen` is an empty hash set. It will remember every value we have already walked past, so \"have I seen this before?\" is one lookup.", op: "seen = { }", act: "START" });
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      const at = entries.find((e) => e[0] === x);
      T.step("lookup", { vars: { i, x, "seen.size": entries.length }, state: S(i, { need: x, probe: { key: x, from: i, res: null }, calc: `is ${x} in seen ?` }), say: `We hold **${x}**. Is it already in \`seen\`? Hash it to bucket ${bucket(x)} and look.`, op: `seen.count(${x}) ?`, act: "LOOKUP" });
      if (at) {
        T.step("found", { vars: { i, x, "seen.size": entries.length }, state: S(i, { need: x, hit: at[1], mhl: { [x]: "hit" }, probe: { key: x, from: i, res: "found" }, calc: `${x} was already stored (first at index ${at[1]})  ✓` }), say: `**Found!** ${x} is already in the set (stored from index ${at[1]}). So the value ${x} occurs at indices ${at[1]} and ${i}: a duplicate. Return \`true\`.`, op: `seen.count(${x}) = 1  ⇒  return true`, act: "DUPLICATE",
          why: { title: "Why can we stop immediately?", text: "The question only asks whether **any** value repeats. One repeat is enough to answer `true`, so we return at once without looking at the rest of the array." } });
        T.result(true);
        return;
      }
      entries.push([x, i]); stored.push(i);
      T.step("store", { vars: { i, x, "seen.size": entries.length }, state: S(i, { need: x, mhl: { [x]: "ok" }, probe: { key: x, from: i, res: "miss" }, calc: `${x} was not in the set, so store it` }), say: `${x} is **not** in the set: it is a new value. Insert it, so a later copy of ${x} will be caught.`, op: `seen.insert(${x})  →  size ${entries.length}`, act: "STORE",
        why: whyFirst ? null : { title: "Why look up BEFORE inserting?", text: "If we inserted first, the lookup would always find the element we just inserted and report a false duplicate. Lookup first means the set holds only **earlier** elements." } });
      whyFirst = true;
    }
    T.step("none", { vars: { "seen.size": entries.length }, state: S(null), say: `The loop ended and every lookup missed: all ${n} value${n === 1 ? " is" : "s are"} distinct. Return \`false\`.`, op: "return false", act: "ALL_DISTINCT" });
    T.result(false);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 12); return { nums: Array.from({ length: n }, () => Math.floor(rnd() * 21) - 10) }; },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass, one set operation per element", short: "n iterations of a lookup and an insert",
      derive: [
        "T(n) = \\sum_{i=0}^{n-1} \\big( c_{\\text{lookup}} + c_{\\text{insert}} \\big) || each element does one membership test and at most one insertion",
        "T(n) = \\sum_{i=0}^{n-1} c = c \\cdot n || both are $O(1)$ on average for a hash set, so they merge into one constant",
        "T(n) \\le c\\,n \\;\\text{(and as little as } c \\text{ if the first two values are equal)} || we return as soon as a repeat is found",
        "!T(n) = O(n) || worst case: all distinct, or the repeat is last",
      ],
      where: "Each hash operation is $O(1)$ **on average**; in the worst case (many collisions) a single operation can cost $O(n)$, which would make the total $O(n^2)$. With good hashing this does not happen in practice. The *best* case is $O(1)$: when the second element already equals the first.",
    },
    space: {
      tex: "O(n)", title: "the set may hold every distinct value", short: "up to n values when all are distinct",
      derive: [
        "S(n) = |\\text{seen}| \\cdot s_{\\text{int}} || the set is the only extra memory",
        "|\\text{seen}| \\le n || at most one entry per element",
        "!S(n) = O(n) || attained when every element is distinct",
      ],
      where: "The brute force used $O(1)$ extra space but $O(n^2)$ time. Sorting (see follow-ups) gets $O(1)$ extra space with $O(n \\log n)$ time. The hash set sits at the other end of the trade-off: fastest, most memory.",
    },
    limit: "Without extra memory you cannot beat $O(n \\log n)$ in the comparison model (you must at least sort or compare). With a hash set you reach $O(n)$ on average. In the worst case every element must be looked at at least once, so $\\Omega(n)$ is unavoidable.",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Inserting before checking", what: "Writing `seen.insert(x)` first and then `if (seen.count(x))`.", why: "Both lines are there, so the order feels unimportant.", breaks: "The element is always found (it was just inserted), so the function returns `true` for **every** non-empty array.", avoid: "Look up first, then insert." },
    { title: "Using a boolean array indexed by the value", what: "`bool seen[1000000001]` or `vector<bool>(2e9)`.", why: "A direct-address table is $O(1)$ and tempting for small ranges.", breaks: "Values go up to $10^9$ and can be negative: the table is gigabytes large, and a negative index is out of bounds.", avoid: "Use a hash set (or sort first). Direct addressing only works when the value range is small and non-negative." },
    { title: "Comparing the array length with the set size, but building the set wrongly", what: "`return nums.size() != set<int>(nums.begin(), nums.end()).size();`", why: "It is a neat one-liner and it is **correct**, so it is easy to believe it is always optimal.", breaks: "It builds the whole set even if the first two elements are equal (no early exit), and it can hide mistakes (e.g. using `vector` instead of a set). It is fine for interviews if you mention the trade-off.", avoid: "Know both versions: the one-liner is simpler, the loop exits early." },
    { title: "Sorting the input when you are not allowed to modify it", what: "Calling `sort(nums.begin(), nums.end())` on the caller's array.", why: "Sorting + adjacent comparison is a legitimate $O(1)$-space approach.", breaks: "It silently reorders the caller's data, which may be unexpected (and costs $O(n \\log n)$ time).", avoid: "State the trade-off, or sort a copy (which uses $O(n)$ space again)." },
  ],

  followUps: [
    {
      q: "You must use only $O(1)$ extra space. What is the best you can do?",
      a: "**Sort the array**, then compare each element with its neighbour: after sorting, equal values are adjacent, so any duplicate shows up as `nums[i] == nums[i + 1]`. Time is $O(n \\log n)$ for the sort and extra space is $O(1)$ (if you may modify the input and the sort is in place, like heapsort).",
      cpp: `bool containsDuplicateSorted(vector<int> nums) {      // by value: sorts a copy
    sort(nums.begin(), nums.end());
    for (int i = 1; i < (int)nums.size(); i++)
        if (nums[i] == nums[i - 1]) return true;
    return false;
}`,
      js: `function containsDuplicateSorted(nums) {
  const a = nums.slice().sort((x, y) => x - y);          // sorts a copy
  for (let i = 1; i < a.length; i++)
    if (a[i] === a[i - 1]) return true;
  return false;
}`,
      time: "O(n \\log n)", space: "O(1)",
    },
    {
      q: "Are there two equal values at indices `i` and `j` with `|i − j| ≤ k`? (Contains Duplicate II)",
      a: "Keep a **sliding window** of the last `k` values in the hash set. For each new element, check whether it is in the window; then add it, and if the window is larger than `k`, remove the element that just left (`nums[i − k]`). Time $O(n)$, space $O(k)$.",
      time: "O(n)", space: "O(k)",
    },
    {
      q: "What if the values must also be within `t` of each other (`|nums[i] − nums[j]| ≤ t`)?",
      a: "A plain hash set cannot answer *\"is there any value in `[x − t, x + t]`?\"*. Use a **sorted set** (`std::set`, `lower_bound`) of the last `k` values: find the smallest value `≥ x − t` and check that it is `≤ x + t`. That is $O(n \\log k)$. A cleverer $O(n)$ approach uses **buckets** of width `t + 1`: two values in the same bucket are within `t`, and only the two neighbouring buckets need checking.",
      time: "O(n \\log k)", space: "O(k)",
    },
    {
      q: "The data is too big for memory (billions of numbers). How would you detect a duplicate?",
      a: "Partition by a hash of the value into `p` files so that equal values always land in the same file, then run the in-memory hash-set check on each file. Or sort externally (external merge sort) and scan neighbours. For a fast *probabilistic* answer, a **Bloom filter** tests membership with a tiny memory footprint but with false positives (so it can only say \"probably a duplicate\").",
      time: "O(n)", space: "O(n / p)",
    },
  ],

  related: [
    { id: "two-sum", why: "The same hash lookup, but the key you look up is the **complement** `target − x` instead of `x` itself." },
    { id: "valid-anagram", why: "Instead of presence, remember **counts** of each character and compare the counts." },
    { id: "longest-consecutive-sequence", why: "A set lets you ask \"is `x − 1` present?\" in $O(1)$: the basis of the $O(n)$ solution." },
    { id: "group-anagrams", why: "Use a signature as the hash **key** so that equal groups collide on purpose." },
  ],
  patternNote: "**The Hash Set pattern** is the pure form of \"remember what you have seen\": no positions, no counts, only presence. Any time you catch yourself scanning an array to ask *\"is this value in here?\"*, you can replace that scan with a set. The price is $O(n)$ memory; the gain is a full factor of $n$ in time.",
  takeaways: [
    "Duplicates is a **membership** question, and a hash set answers membership in $O(1)$ on average.",
    "Look up **before** inserting; return `true` the moment a lookup succeeds.",
    "Time $O(n)$, space $O(n)$. With sorting instead you get $O(n \\log n)$ time and $O(1)$ extra space.",
    "Do not index a boolean array by the value when values are huge or negative.",
    "The same idea extends: windows of size `k` (set of recent values), counts (hash map), signatures (anagrams).",
  ],
});
