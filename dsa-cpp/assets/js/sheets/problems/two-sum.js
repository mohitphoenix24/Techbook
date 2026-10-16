SHEETS.define({
  id: "two-sum",
  viz: "hashmap",
  io: { fn: "twoSum", params: [["nums", "int[]"], ["target", "int"]], ret: "int[]" },

  statement: `You are given an array of integers \`nums\` and an integer \`target\`. Return the **indices** of the two numbers that add up to \`target\`.

Exactly one valid pair exists, and you may not use the same element twice (the same *index* cannot be used twice). You can return the two indices in any order.`,
  examples: [
    { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", explain: "`nums[0] + nums[1] = 2 + 7 = 9`." },
    { input: "nums = [3, 2, 4], target = 6", output: "[1, 2]", explain: "`2 + 4 = 6`. The first `3` cannot be paired with itself, since that would use one element twice." },
    { input: "nums = [3, 3], target = 6", output: "[0, 1]", explain: "Two different elements may have the same value." },
  ],
  constraints: ["$2 \\le$ `nums.length` $\\le 10^4$", "$-10^9 \\le$ `nums[i]` $\\le 10^9$", "$-10^9 \\le$ `target` $\\le 10^9$", "Exactly one valid answer exists."],
  check(input) { return input.nums.length < 2 ? "nums needs at least two numbers" : null; },
  judge(input, out, exp) {
    try { const a = JSON.parse(out).slice().sort((x, y) => x - y), b = JSON.parse(exp).slice().sort((x, y) => x - y); return { ok: JSON.stringify(a) === JSON.stringify(b), note: "The order of the two indices does not matter." }; } catch { return { ok: false }; }
  },

  intuition: {
    find: "Two **positions** `i` and `j` (with `i ≠ j`) such that `nums[i] + nums[j] = target`. We are not asked for the numbers themselves, only where they sit.",
    beginner: "Pick the first number, then look at every number after it and ask: *does this pair add up to the target?* If not, move on to the second number and repeat. Two loops, one inside the other.",
    works: "Because it simply **tries every possible pair**. If a valid pair exists, one of the pairs we try must be it, so we cannot miss the answer. Correctness is never the problem here. Speed is.",
    slow: "With `n` numbers there are $\\binom{n}{2} = \\frac{n(n-1)}{2}$ pairs. For $n = 10^4$ that is about 50 million checks, and for $n = 10^5$ about 5 billion. The work grows with the **square** of the input, so doubling the array makes it four times slower.",
    repeat: "For each number `x` we **scan the rest of the array to find `target − x`**. That scan is a *search*, and we perform it again and again, once for every number, even though the answers to those searches overlap heavily.",
    remember: "Instead of searching the array each time, we can **remember what we have already seen**: for every number we passed, store *value → index*. Then the question *\"have I seen the number I need?\"* becomes a lookup in that memory.",
    observation: "For a fixed number `x`, its partner is **completely determined**: it must be exactly `target − x`. We never need to try other partners. So the only question per element is *\"is `target − x` somewhere?\"*, and a hash map answers that in $O(1)$ on average instead of $O(n)$.",
    leads: "Walk through the array once. At index `i`: compute `need = target − nums[i]`, **look up** `need` in the map. If it is there, its stored index and `i` are the answer. If not, **store** `nums[i] → i` and continue. Each element is touched a constant number of times, so the whole thing is $O(n)$.",
  },

  flow: [
    "Try every pair `(i, j)` with two nested loops.",
    "It checks all pairs, so it can never miss the answer.",
    "$\\frac{n(n-1)}{2}$ checks: quadratic, and each one re-searches the array.",
    "The partner of `x` must be exactly `target − x`. No other value can work.",
    "Remember what we have seen in a hash map, so the partner is a lookup, not a scan.",
    "One pass: look up `target − x`, else store `x`. $O(n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**Brute force:** fix the first number with index `i`, then scan every later index `j` and test `nums[i] + nums[j] == target`. The first pair that works is returned. We start `j` at `i + 1` so a pair is never tried twice and an element is never paired with itself.",
    why: "The inner loop is a **linear search for `target − nums[i]`**, repeated for every `i`. We never reuse what we learned: if we already walked past a `7`, we will happily walk past it again for the next element. The total number of comparisons is $(n-1) + (n-2) + \\dots + 1 = \\frac{n(n-1)}{2}$, which is $\\Theta(n^2)$.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2 },
    cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        int n = nums.size();
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                if (nums[i] + nums[j] == target) return {i, j};
        return {};
    }
};`,
    js: `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
  return [];
}`,
  },

  pattern: {
    name: "Hash Map",
    why: "The brute force spends its time on one repeated question: *\"is there an element with value `v` somewhere?\"* That is exactly what a hash map is built to answer in constant time. Whenever the heart of a problem is **looking something up by value** (a complement, a duplicate, a frequency), a hash map replaces a scan with a lookup.",
    recognize: [
      "You keep asking *\"have I seen this value before?\"* or *\"where was it?\"*",
      "The partner of each element is **fixed** by the rule (a complement, a difference, a target minus x).",
      "The brute force is a nested loop where the inner loop only **searches** for something.",
      "Order does not matter for the lookup, only presence and position, so you can drop the structure of the array and keep a dictionary.",
    ],
  },

  optimal: {
    idea: "Make **one pass** over the array and keep a hash map `seen` of *value → index* for everything to the left of the current position. At each element, ask the map for its complement. Because the map contains only earlier elements, any hit is automatically a *different* element.",
    steps: [
      "Create an empty hash map `seen` (value → index).",
      "For each index `i` from left to right, compute `need = target − nums[i]`.",
      "**Look up** `need` in `seen`. If it is present, return `[seen[need], i]`.",
      "Otherwise **store** `seen[nums[i]] = i` and move on.",
      "(The problem guarantees an answer, so we return from inside the loop.)",
    ],
    invariant: "**Before processing index `i`, `seen` contains exactly the values of `nums[0..i−1]`, each with its index, and no pair among those earlier elements adds up to `target`** (otherwise we would already have returned).",
    correct: "Suppose the answer is the pair $(j, i)$ with $j < i$. When the loop reaches $i$, the invariant says `nums[j]` is in `seen`, and `need = target − nums[i] = nums[j]`, so the lookup succeeds and returns $(j, i)$. We can never return a wrong pair, because a hit means some earlier index holds exactly `target − nums[i]`. And since we **look up before we store**, `nums[i]` is not yet in the map, so an element can never be matched with itself.",
  },

  cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;                   // value -> index //@init
        for (int i = 0; i < (int)nums.size(); i++) {     //@loop
            int need = target - nums[i];                 //@need
            auto it = seen.find(need);                   //@lookup
            if (it != seen.end())                        //@check
                return {it->second, i};                  //@found
            seen[nums[i]] = i;                           //@store
        }
        return {};                                       //@none
    }
};`,
  js: `function twoSum(nums, target) {
  const seen = new Map();                 // value -> index //@init
  for (let i = 0; i < nums.length; i++) { //@loop
    const need = target - nums[i];        //@need
    const j = seen.get(need);             //@lookup
    if (j !== undefined) {                //@check
      return [j, i];                      //@found
    }
    seen.set(nums[i], i);                 //@store
  }
  return [];                              //@none
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { nums: [2, 7, 11, 15], target: 9 } },
    { name: "Example 2", kind: "normal", input: { nums: [3, 2, 4], target: 6 } },
    { name: "Example 3 (equal values)", kind: "normal", input: { nums: [3, 3], target: 6 }, why: "Two **different** elements may share a value. The map must still find the earlier `3` when the second `3` arrives, which works because we look up *before* storing the current one." },
    { name: "Negative numbers", kind: "edge", input: { nums: [-3, 4, 3, 90], target: 0 }, why: "The complement of a negative number is positive (`0 − (−3) = 3`). Nothing in the algorithm assumes positive values, which is why it beats approaches that rely on `target − x ≥ 0`." },
    { name: "Zeros and a zero target", kind: "edge", input: { nums: [0, 4, 3, 0], target: 0 }, why: "The complement of `0` is `0` itself. The solution must pair the **two different zeros** (indices 0 and 3), never one zero with itself. Looking up before storing guarantees that." },
    { name: "Half of the target appears once", kind: "edge", input: { nums: [5, 1, 9], target: 10 }, why: "`5` is exactly half of `10`, so its complement is itself. If you stored `5` **before** looking up, you would wrongly return `[0, 0]`. Here the real answer is `1 + 9`." },
    { name: "Smallest possible input", kind: "corner", input: { nums: [1, 2], target: 3 }, why: "With `n = 2` the answer has to be both elements. The loop must reach the second one before returning, and it must not run off the end looking for a third." },
    { name: "Answer is the last two elements", kind: "corner", input: { nums: [1, 2, 3, 4, 5, 100, 101], target: 201 }, why: "This is the **worst case**: every earlier element misses, so the map grows to its full size before the final lookup hits. It is the case that defines the $O(n)$ time and space bound." },
    { name: "Values at the limits", kind: "corner", input: { nums: [-1000000000, 1000000000], target: 0 }, why: "`target − nums[i]` can reach `2 × 10⁹` (here `0 − (−10⁹) = 10⁹`; with `target = 10⁹` and `nums[i] = −10⁹` it is `2 × 10⁹`). That still fits in a 32-bit `int` (max ≈ 2.147 × 10⁹), but only just. With larger limits you would need `long long`." },
  ],

  trace(input, T) {
    const { nums, target } = input, n = nums.length, cap = 8;
    const entries = [];
    const bucket = (k) => ((k % cap) + cap) % cap;
    const stored = [];
    let whyHit = false, whyMiss = false;
    const put = (k, v) => { const e = entries.find((x) => x[0] === k); if (e) e[1] = v; else entries.push([k, v]); };
    const S = (i, o = {}) => () => {
      const hl = {};
      stored.forEach((k) => (hl[k] = "key"));
      if (i != null && i < n) hl[i] = "cur";
      if (o.hit != null) hl[o.hit] = "hit";
      return {
        arr: nums, hl, ptr: i != null && i < n ? { i } : {}, label: "nums  (input)",
        map: { entries: entries.map((e) => [e[0], e[1]]), hl: o.mhl || {}, view: "buckets", cap, title: "seen  (value → index)", hotBucket: o.need != null ? bucket(o.need) : undefined },
        probe: o.probe, calc: o.calc,
      };
    };
    T.step("init", { vars: { target, "seen.size": 0 }, state: S(null), phase: "Walk through the array", say: "We walk through `nums` once from the left. `seen` is an empty hash map: it will remember **value → index** for every number we have already passed.", op: "seen = { }", act: "START" });
    for (let i = 0; i < n; i++) {
      const need = target - nums[i];
      const base = { i, "nums[i]": nums[i], target, "seen.size": entries.length };
      T.step("need", { vars: base, state: S(i, { calc: `need = target − nums[i] = ${target} − ${nums[i]} = ${need}` }), say: `We are holding **${nums[i]}**. To reach ${target} its partner would have to be exactly **${need}**. No other value can work.`, op: `need = ${target} − ${nums[i]} = ${need}`, act: "COMPUTE_NEED" });
      const at = entries.find((e) => e[0] === need);
      T.step("lookup", { vars: Object.assign({ need }, base), state: S(i, { need, calc: `need = ${need}`, probe: { key: need, from: i, res: null } }), say: `Ask the map: has any **earlier** element been ${need}? Hash it to bucket ${bucket(need)} and look inside.`, op: `seen.find(${need}) ?`, act: "LOOKUP" });
      if (at) {
        const j = at[1];
        T.step("found", {
          vars: Object.assign({ need, j }, base), state: S(i, { need, hit: j, mhl: { [need]: "hit" }, calc: `nums[${j}] + nums[${i}] = ${nums[j]} + ${nums[i]} = ${target}  ✓`, probe: { key: need, from: i, res: "found" } }),
          say: `**Found it.** ${need} was stored at index ${j}, so \`nums[${j}] + nums[${i}] = ${nums[j]} + ${nums[i]} = ${target}\`. Return \`[${j}, ${i}]\`.`, op: `${nums[j]} + ${nums[i]} = ${target}  ✓`, act: "FOUND",
          why: whyHit ? null : { title: "Why is this guaranteed to be a valid answer?", text: `\`seen\` holds only elements **before** index ${i}. Finding ${need} there means a *different, earlier* index ${j} has exactly the partner we need. And we looked up **before** storing ${nums[i]}, so an element can never be paired with itself.` },
        });
        whyHit = true;
        T.result([j, i]);
        return;
      }
      T.step("check", {
        vars: Object.assign({ need }, base), state: S(i, { need, calc: `${need} is not in the map`, probe: { key: need, from: i, res: "miss" } }),
        say: `No earlier element is ${need}, so ${nums[i]} has no partner **yet**. Maybe a later element will be ${need}, and then it will need ${nums[i]}.`, op: `seen.find(${need}) → not found`, act: "MISS",
        why: whyMiss ? null : { title: "Why do we store after the lookup, not before?", text: `If we stored ${nums[i]} first, the lookup for \`target − ${nums[i]}\` could find **itself** when ${nums[i]} is exactly half of the target. Looking up first keeps the two elements of the pair different.` },
      });
      whyMiss = true;
      put(nums[i], i); stored.push(i);
      T.step("store", { vars: Object.assign({ need }, base, { "seen.size": entries.length }), state: S(i, { mhl: { [nums[i]]: "ok" }, calc: `store ${nums[i]} → ${i}` }), say: `Remember **${nums[i]} → index ${i}** so that a later element can find it.`, op: `seen[${nums[i]}] = ${i}`, act: "STORE" });
    }
    T.step("none", { vars: { "seen.size": entries.length }, state: S(null, {}), say: "We reached the end without finding a pair. (This cannot happen for valid input, because the problem guarantees one answer.) The function returns an empty array.", op: "return { }", act: "NO_PAIR" });
    T.result([]);
  },
  fuzz(rnd, k) {
    // random arrays that have exactly one valid pair (the problem's guarantee)
    for (;;) {
      const n = 2 + Math.floor(rnd() * 9), nums = Array.from({ length: n }, () => Math.floor(rnd() * 41) - 20);
      const a = Math.floor(rnd() * n); let b = Math.floor(rnd() * n); if (a === b) b = (a + 1) % n;
      const target = nums[a] + nums[b];
      let pairs = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (nums[i] + nums[j] === target) pairs++;
      if (pairs === 1) return { nums, target };
    }
  },
  gen(n) {
    const nums = [];
    for (let i = 0; i < n - 2; i++) nums.push(i);
    nums.push(100000, 100001);
    return { nums, target: 200001 };
  },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass, constant work per element", short: "n iterations, each does a constant amount of work",
      derive: [
        "T(n) = \\sum_{i=0}^{n-1} \\big( c_{\\text{need}} + c_{\\text{find}} + c_{\\text{store}} \\big) || the loop body does one subtraction, one hash lookup and at most one hash insert",
        "T(n) = \\sum_{i=0}^{n-1} c || the three constants add up to a single constant c (hash operations are $O(1)$ on average)",
        "T(n) = c \\cdot n || the sum has exactly $n$ equal terms",
        "!T(n) = O(n) || drop the constant c",
      ],
      where: "The only loop runs at most `n` times, and **everything inside it is constant time**: one subtraction, one `find` and one insert on an `unordered_map`. A hash operation is $O(1)$ **on average**. (In the very worst case, if every key collided into one bucket, each operation would cost $O(n)$ and the total would degrade to $O(n^2)$. Real hash functions on integer keys make that practically irrelevant, but it is worth knowing.)",
    },
    space: {
      tex: "O(n)", title: "the map can grow to n − 1 entries", short: "in the worst case every element is stored before the answer is found",
      derive: [
        "S(n) = \\underbrace{|\\text{seen}|}_{\\le\\, n-1} \\cdot (s_{\\text{key}} + s_{\\text{value}}) || each stored element costs one key and one value",
        "S(n) \\le (n-1)\\cdot c' || at most $n-1$ elements are stored (the last one is the lookup that succeeds)",
        "!S(n) = O(n) || linear extra memory",
      ],
      where: "The extra memory is the hash map. In the worst case (the answer is the last pair, as in the corner case above) all but one element are stored. The brute force needed only $O(1)$ extra space: **we bought speed with memory**, which is the classic time–space trade.",
    },
    limit: "For an **unsorted** array you cannot beat $O(n)$ time: every element might be part of the answer, so each must be looked at at least once. You *can* trade the other way: sorting + two pointers uses $O(1)$ extra space but costs $O(n \\log n)$ time, and it loses the original indices unless you carry them along (see the follow-ups).",
    measure: { label: "n = nums.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Storing the number **before** looking up its complement", what: "Writing `seen[nums[i]] = i` first, then checking `seen.count(need)`.", why: "It feels natural to \"record the number, then use the map\", and it even passes most examples.", breaks: "When `nums[i]` is exactly half of `target`, the lookup finds the element **itself**, so `[5, 1, 9]` with target `10` wrongly returns `[0, 0]`: the same element used twice.", avoid: "Always **look up first, then store**. The map must describe only the elements to the *left* of `i`." },
    { title: "Using `seen[need]` to test for presence in C++", what: "Writing `if (seen[need])` or comparing `seen[need] != 0`.", why: "`operator[]` on a map **inserts** a default value `0` when the key is missing, and index `0` is a valid answer.", breaks: "A missing key silently becomes `need → 0`, which pollutes the map and makes later lookups report index `0` for numbers that never appeared.", avoid: "Use `seen.find(need)` or `seen.count(need)` to test presence, and `seen[x] = i` only to write." },
    { title: "Sorting first and returning positions from the sorted array", what: "Sorting `nums` so you can use two pointers, then returning the pointers.", why: "Sorted + two pointers is a real technique for the *sorted* version of this problem.", breaks: "Sorting **moves the elements**, so the indices you return refer to the sorted array, not the original one, and the answer is wrong.", avoid: "If you sort, sort a copy of `(value, original index)` pairs, or just use the hash map, which keeps indices for free." },
    { title: "Returning the values instead of the indices", what: "Returning `[2, 7]` instead of `[0, 1]`.", why: "The pair of numbers is what you compare with `target`, so it is easy to return it by reflex.", breaks: "Fails every test: the problem asks *where* the numbers are.", avoid: "Store the **index** as the map value and return `[seen[need], i]`." },
    { title: "Integer overflow in `target − nums[i]` when limits are larger", what: "Computing the complement in `int` when values can reach about $\\pm 2 \\times 10^9$ or more.", why: "With the limits of this problem the result still fits in 32 bits (just), so the bug stays hidden.", breaks: "On a variant with bigger values, the subtraction wraps around and you look up the wrong key, which is undefined behaviour in C++.", avoid: "Read the constraints and use `long long` when a sum or difference could exceed about $2.1 \\times 10^9$." },
  ],

  followUps: [
    {
      q: "The array is already **sorted**. Can you solve it using $O(1)$ extra space?",
      a: "Yes: use **two pointers**. Put `l` at the start and `r` at the end. If `nums[l] + nums[r]` is too small, only moving `l` right can increase the sum (the array is sorted), so `l++`. If it is too big, `r--`. Each step discards one element that **cannot** be part of any answer, so we do at most `n` steps and need no map.",
      cpp: `vector<int> twoSumSorted(vector<int>& nums, int target) {
    int l = 0, r = (int)nums.size() - 1;
    while (l < r) {
        long long s = (long long)nums[l] + nums[r];
        if (s == target) return {l, r};
        if (s < target) l++;     // need a bigger sum
        else r--;                // need a smaller sum
    }
    return {};
}`,
      js: `function twoSumSorted(nums, target) {
  let l = 0, r = nums.length - 1;
  while (l < r) {
    const s = nums[l] + nums[r];
    if (s === target) return [l, r];
    if (s < target) l++;   // need a bigger sum
    else r--;              // need a smaller sum
  }
  return [];
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "What if there can be **many** valid pairs and you must return all **unique value pairs**?",
      a: "Sort the array, then run two pointers. When you find a pair, record it and move **both** pointers, skipping over equal neighbours so the same value pair is not reported twice. This is the engine inside **3Sum**. The sort costs $O(n \\log n)$ and dominates; the scan is $O(n)$.",
      time: "O(n \\log n)", space: "O(1)",
    },
    {
      q: "The numbers arrive as a **stream** and you must answer *\"does any pair sum to `target`?\"* after each new number. What changes?",
      a: "The hash-map approach is already online: keep `seen` as a set of values, and for each new number `x` check whether `target − x` is in `seen` **before** inserting `x`. Each arrival is processed in $O(1)$ on average, so the whole stream costs $O(n)$. Memory grows with the number of distinct values seen so far.",
      time: "O(1) per number", space: "O(n)",
    },
    {
      q: "The array is too large to fit in memory. How would you find a pair?",
      a: "Partition by value so that a number and its complement land in the same place. For example, hash each value `x` into one of `k` files by `min(x, target − x) mod k`. A pair $(x, \\text{target}-x)$ has the same `min`, so both sit in the same file. Then each file is small enough to solve in memory with the hash-map method. The partition pass is $O(n)$ with sequential disk reads.",
      time: "O(n)", space: "O(n / k)",
    },
  ],

  related: [
    { id: "contains-duplicate", why: "The same \"have I seen this value?\" question, with a hash **set**: the simplest use of the pattern." },
    { id: "valid-anagram", why: "Instead of one remembered value, remember **counts** per character and compare them." },
    { id: "group-anagrams", why: "The hash map **key** becomes a signature (sorted letters) so equal groups collide on purpose." },
    { id: "longest-consecutive-sequence", why: "Put everything in a set, then use $O(1)$ lookups to extend runs only from their starting numbers." },
    { id: "3sum", why: "Two Sum nested one level deeper: fix one number, then solve Two Sum on the rest (with two pointers)." },
  ],
  patternNote: "**The Hash Map pattern** swaps a repeated *search* for a *remembered answer*. Whenever your brute force has an inner loop whose only job is to find something by its value, ask: \"what could I store while I walk past, so this becomes a lookup?\" The price is $O(n)$ extra memory; the gain is usually a full factor of $n$ in time.",
  takeaways: [
    "The partner of each number is **fixed**: `target − x`. That single observation removes the inner loop.",
    "A hash map stores *value → index* for elements already passed, turning a scan into an average $O(1)$ lookup.",
    "**Look up first, then store**: it keeps the two elements of a pair different.",
    "Time $O(n)$, space $O(n)$: we trade memory for speed. In C++ use `find`/`count`, not `operator[]`, to test for presence.",
    "Recognise the pattern: *\"have I seen the value I need?\"*, a fixed partner, and a nested loop that only searches.",
  ],
});
