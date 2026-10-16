SHEETS.define({
  id: "top-k-frequent-elements",
  viz: "heap",
  io: { fn: "topKFrequent", params: [["nums", "int[]"], ["k", "int"]], ret: "int[]", canon: "sort", labels: { nums: "nums (an array of integers)", k: "k (how many values to return)" } },
  legend: [["cur", "node just pushed"], ["cmp", "root: the least frequent kept so far"], ["bad", "removed from the heap"], ["win", "in the heap"]],

  statement: `Given an integer array \`nums\` and an integer \`k\`, return **the \`k\` most frequent elements**. You may return the answer in **any order**.

The answer is guaranteed to be **unique**: there is no tie between the \`k\`-th and the \`(k+1)\`-th most frequent values.`,
  examples: [
    { input: "nums = [1, 1, 1, 2, 2, 3], k = 2", output: "[1, 2]", explain: "`1` appears 3 times, `2` appears twice, `3` once: the two most frequent values are 1 and 2." },
    { input: "nums = [1], k = 1", output: "[1]", explain: "There is only one value." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 10^5$", "$-10^4 \\le$ `nums[i]` $\\le 10^4$", "`k` is in the range $[1,$ the number of **unique** elements$]$", "The answer is **unique**"],
  check(input) {
    const a = input.nums;
    if (a.length < 1) return "nums needs at least one element";
    if (a.length > 12) return "for the animation use at most 12 numbers";
    if (a.some((v) => Math.abs(v) > 99)) return "keep the values between -99 and 99";
    const cnt = {}; a.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
    const cs = Object.values(cnt).sort((x, y) => y - x), d = cs.length;
    if (input.k < 1 || input.k > d) return `k must be between 1 and ${d} (the number of different values)`;
    if (input.k < d && cs[input.k - 1] === cs[input.k]) return "the answer must be unique: the k-th and the (k+1)-th most frequent values have the same count";
    return null;
  },

  intuition: {
    find: "The `k` values that occur most often. We need the **counts** first, and then a way to pick the largest `k` of them.",
    beginner: "Count how often each value appears (a hash map), put all the (value, count) pairs in a list, sort the list by count from largest to smallest, and take the first `k` values.",
    works: "After sorting by frequency, the first `k` entries are by definition the `k` most frequent values.",
    slow: "Sorting all $d$ distinct values costs $O(d \\log d)$, which is $O(n \\log n)$ when most values are different. But we only want the top `k`, and `k` may be tiny (say 10) while $d$ is a hundred thousand: sorting the whole list does far more work than needed.",
    repeat: "Everything below the top `k` is ordered for nothing. The sort compares and arranges thousands of entries whose relative order does not matter to the answer.",
    remember: "To keep the **best `k` of a stream**, you do not need everything sorted: you only need to know the **weakest of the current best `k`**, so that a better newcomer can replace it. A **min-heap** of size `k` gives exactly that: its top is the weakest member, available in $O(1)$.",
    observation: "Count with a hash map. Then walk over the distinct (value, count) pairs and keep a **min-heap ordered by count, never larger than `k`**. Push each pair; if the heap now holds more than `k`, pop the top (the least frequent of the `k + 1`). At the end the heap holds exactly the `k` most frequent values. Each push or pop costs $O(\\log k)$, not $O(\\log d)$.",
    leads: "`freq[x]++` for every number; `heap` is a min-heap of `(count, value)`; for each pair `heap.push(pair); if (heap.size() > k) heap.pop();`. Finally read the values out of the heap. $O(n + d \\log k)$.",
  },

  flow: [
    "Count the values, sort all pairs by count, take the first `k`.",
    "The first `k` after sorting are the `k` most frequent.",
    "$O(d \\log d)$: the whole list is sorted although only the top `k` matter.",
    "To keep the best `k`, we only need to know the weakest of them: a min-heap of size `k`.",
    "Push each pair; when the heap exceeds `k`, remove the root (the weakest).",
    "$O(n + d \\log k)$ time, $O(d)$ space for the counts plus $O(k)$ for the heap.",
  ],

  brute: {
    idea: "**Brute force:** count the occurrences with a hash map; copy the (value, count) pairs into a vector; **sort the whole vector** by count in decreasing order; return the values of the first `k` pairs.",
    why: "Sorting all $d$ distinct values costs $O(d \\log d)$ (up to $O(n \\log n)$), although only the best `k` are needed. A heap of size `k` does the selection in $O(d \\log k)$, which is much smaller when `k` is small.",
    time: "O(n log n)", space: "O(n)",
    cpp: `class Solution {
public:
    vector<int> topKFrequent(vector<int>& nums, int k) {
        unordered_map<int, int> freq;
        for (int x : nums) freq[x]++;
        vector<pair<int, int>> v(freq.begin(), freq.end());
        sort(v.begin(), v.end(), [](const pair<int, int>& a, const pair<int, int>& b) { return a.second > b.second; });
        vector<int> out;
        for (int i = 0; i < k; i++) out.push_back(v[i].first);
        return out;
    }
};`,
    js: `function topKFrequent(nums, k) {
  const freq = new Map();
  for (const x of nums) freq.set(x, (freq.get(x) || 0) + 1);
  const v = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return v.slice(0, k).map((p) => p[0]);
}`,
  },

  pattern: {
    name: "Heap (top K with a heap of size K)",
    why: "A heap of size $k$ keeps the **best $k$ seen so far**, with the weakest of them on top. A newcomer is compared only with that weakest member: if it is better, it replaces it. So selecting the top $k$ of $d$ items costs $O(d \\log k)$, and the memory is $O(k)$ for the heap.",
    recognize: [
      "The question asks for the **top / bottom k** (most frequent, largest, closest, smallest) of a large collection.",
      "You need the elements, not a fully sorted list.",
      "$k$ is much smaller than the number of items.",
      "A **min-heap** for the *largest* $k$ (and a max-heap for the smallest $k$): the root is the member that would be evicted first.",
    ],
  },

  optimal: {
    idea: "Count the occurrences of every value with a hash map. Then keep a **min-heap of at most `k` pairs `(count, value)`**, ordered by count. Go through the distinct values: push the pair; if the heap holds more than `k` pairs, remove the smallest (the root). Once all values have been processed, the heap contains the `k` pairs with the largest counts.",
    steps: [
      "Build `freq`: for each `x` in `nums`, `freq[x]++`.",
      "Create an empty min-heap of `(count, value)`.",
      "For each `(value, count)` of `freq`: push `(count, value)`.",
      "If the heap size exceeds `k`, pop the root (the pair with the smallest count).",
      "Read all the values out of the heap: these are the `k` most frequent values (in any order).",
    ],
    invariant: "**After processing some pairs, the heap holds exactly the `min(k, #processed)` pairs with the largest counts among those processed.**",
    correct: "Initially the heap is empty. Suppose the invariant holds before a new pair $p$ is processed. After pushing $p$ the heap holds the best $k$ of the previous pairs plus $p$, i.e. $k + 1$ candidates (or fewer). The overall best $k$ of the processed pairs are among these candidates (a pair that was already not among the best $k$ stays out, since $p$ can only push the boundary up). Removing the pair with the smallest count leaves exactly the $k$ best, which restores the invariant. When the pairs are exhausted, the heap holds the $k$ most frequent values; the uniqueness guarantee removes any ambiguity at the boundary.",
  },

  cpp: `class Solution {
public:
    vector<int> topKFrequent(vector<int>& nums, int k) {
        unordered_map<int, int> freq;           // value -> how often it occurs //@init
        for (int x : nums) freq[x]++;           // count the occurrences //@count
        priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> heap;   // min-heap of (count, value) //@heap
        for (auto& [val, cnt] : freq) {         //@loop
            heap.push({cnt, val});              // newcomer joins //@push
            if ((int)heap.size() > k) heap.pop();   // drop the least frequent of k + 1 //@evict
        }
        vector<int> out;
        while (!heap.empty()) { out.push_back(heap.top().second); heap.pop(); }   // read the survivors //@collect
        return out;                             //@ret
    }
};`,
  js: `class MinHeap {                          // binary min-heap of [count, value] pairs
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
  push(x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
function topKFrequent(nums, k) {
  const freq = new Map();                // value -> how often it occurs //@init
  for (const x of nums) freq.set(x, (freq.get(x) || 0) + 1);   // count the occurrences //@count
  const heap = new MinHeap();            // min-heap of [count, value] //@heap
  for (const [val, cnt] of freq) {       //@loop
    heap.push([cnt, val]);               // newcomer joins //@push
    if (heap.size > k) heap.pop();       // drop the least frequent of k + 1 //@evict
  }
  const out = [];
  while (heap.size) out.push(heap.pop()[1]);   // read the survivors //@collect
  return out;                            //@ret
}`,

  tests: [
    { name: "Example 1: [1, 1, 1, 2, 2, 3], k = 2", kind: "normal", input: { nums: [1, 1, 1, 2, 2, 3], k: 2 } },
    { name: "Example 2: a single value", kind: "normal", input: { nums: [1], k: 1 } },
    { name: "Four distinct values, k = 2", kind: "normal", input: { nums: [4, 4, 4, 6, 6, 7, 7, 7, 7, 9], k: 2 } },
    { name: "k equals the number of distinct values", kind: "edge", input: { nums: [1, 2, 3, 2, 3, 3], k: 3 }, why: "Every value is wanted, so nothing is ever evicted: the heap never exceeds `k` and ends with all three pairs. The answer is all the distinct values." },
    { name: "All elements equal", kind: "edge", input: { nums: [5, 5, 5, 5], k: 1 }, why: "There is only one distinct value, so the map has one entry and the heap one pair `(4, 5)`. The answer is `[5]`." },
    { name: "Negative values and zero", kind: "edge", input: { nums: [-1, -1, 0, 0, 0, 2], k: 2 }, why: "Zero and negatives are ordinary map keys; only the counts are compared. The two most frequent are `0` (three times) and `-1` (twice)." },
    { name: "The most frequent value comes last", kind: "edge", input: { nums: [1, 2, 2, 3, 3, 3], k: 1 }, why: "The heap holds one pair at a time. Each new value with a larger count replaces the previous winner; only the last pair `(3, 3)` survives. The order of arrival does not matter." },
    { name: "Many singletons and one winner", kind: "corner", input: { nums: [9, 8, 7, 7, 6], k: 1 }, why: "Four values occur once and one occurs twice. The heap evicts the weaker pair every time a pair is pushed, and the pair `(2, 7)` is the only survivor." },
    { name: "A tie below the cut", kind: "corner", input: { nums: [1, 1, 2, 2, 3, 4], k: 2 }, why: "`3` and `4` both occur once (a tie), but they are *below* the cut, so the answer `[1, 2]` is unique. The uniqueness guarantee only concerns the boundary between the k-th and the (k+1)-th." },
  ],

  trace(input, T) {
    const nums = input.nums, k = input.k, n = nums.length;
    const freq = new Map(), heap = [];
    const less = (a, b) => a.cnt < b.cnt || (a.cnt === b.cnt && a.val < b.val);
    const lg = (m) => 1 + Math.floor(Math.log2(Math.max(m, 1)));
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const levels = Math.max(2, Math.ceil(Math.log2(k + 2)));
    const out = [];
    let whyHeap = false, whyEvict = false, whyMin = false;
    const S = (o = {}) => () => ({
      arr: nums, hl: o.ahl || {}, ptr: o.ptr || {}, arrLabel: "nums",
      heaps: [{ name: `min-heap of  value:count   (at most k = ${k})`, min: true, items: heap.map((h) => ({ id: "v" + h.val, v: h.cnt, t: `${h.val}:${h.cnt}` })), hl: o.hhl || {}, levels }],
      map: { entries: [...freq.entries()], hl: o.mhl || {}, title: "frequency of each value", keyLabel: "value", valLabel: "count" },
      out: out.length || o.showOut ? { label: "answer", items: out.slice() } : undefined,
      note: o.note,
    });
    T.step("init", { vars: { n, k }, state: S(), phase: "Count the occurrences", say: `We look for the **${k}** most frequent value${k === 1 ? "" : "s"} of ${n} number${n === 1 ? "" : "s"}. First, a hash map \`freq\` from each value to how many times it occurs.`, op: "freq = { }", act: "START" });
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      freq.set(x, (freq.get(x) || 0) + 1);
      T.step("count", { vars: { i, x, [`freq[${x}]`]: freq.get(x) }, state: S({ ahl: Object.fromEntries(Array.from({ length: i + 1 }, (_, q) => [q, q === i ? "cur" : "ok"])), ptr: { i }, mhl: { [x]: "hit" } }), say: freq.get(x) === 1 ? `**${x}** is new: \`freq[${x}] = 1\`.` : `**${x}** was seen before: \`freq[${x}]\` becomes **${freq.get(x)}**.`, op: `freq[${x}]++  →  ${freq.get(x)}`, act: "COUNT" });
    }
    T.phase("Keep only the k most frequent");
    T.step("heap", { vars: { distinct: freq.size, k }, state: S({ note: `${freq.size} distinct value${freq.size === 1 ? "" : "s"} counted` }), say: `The counts are done: **${freq.size}** distinct value${freq.size === 1 ? "" : "s"}. Now a **min-heap** of \`(count, value)\` pairs, ordered by count, that will never hold more than **k = ${k}** pairs. Its top is always the *least frequent* of the pairs it keeps.`, op: "heap = min-heap of (count, value)", act: "EMPTY_HEAP",
      why: { title: "Why a min-heap to keep the largest?", text: "We want to throw away the *weakest* member of the best `k` whenever a better one arrives. The weakest is the smallest, and a **min**-heap puts the smallest at the top, ready to be removed in $O(\\log k)$." } });
    whyHeap = true;
    for (const [val, cnt] of freq) {
      T.step("loop", { vars: { value: val, count: cnt, "heap size": heap.length }, state: S({ mhl: { [val]: "cur" } }), say: `Next distinct value: **${val}**, which occurs **${cnt}** time${cnt === 1 ? "" : "s"}.`, op: `(val, cnt) = (${val}, ${cnt})`, act: "NEXT_PAIR" });
      push({ cnt, val });
      T.step("push", { w: lg(heap.length), vars: { pushed: `${val}:${cnt}`, "heap size": heap.length }, state: S({ mhl: { [val]: "cur" }, hhl: { ["v" + val]: "cur" } }), say: `Push the pair **${val}:${cnt}**. The heap now holds ${heap.length} pair${heap.length === 1 ? "" : "s"}${heap.length > k ? `, which is **more than k = ${k}**` : ""}.`, op: `heap.push({${cnt}, ${val}})`, act: "PUSH" });
      const over = heap.length > k;
      let gone = null;
      if (over) gone = pop();
      T.step("evict", { w: over ? lg(heap.length + 1) : 1, vars: { "heap size": heap.length, k, removed: gone ? `${gone.val}:${gone.cnt}` : "–" }, state: S({ mhl: gone ? { [gone.val]: "bad" } : {}, note: gone ? `removed ${gone.val}:${gone.cnt}, the least frequent of the ${k + 1}` : undefined }), say: over ? `The heap has more than ${k} pairs, so **pop the root**: **${gone.val}:${gone.cnt}** has the smallest count of the ${k + 1}, so it cannot be among the ${k} most frequent. The heap is back to ${k}.` : `The heap holds ${heap.length} pair${heap.length === 1 ? "" : "s"}, not more than k = ${k}: nothing to remove.`, op: `heap.size() > k  →  ${heap.length + (over ? 1 : 0)} > ${k}  →  ${over}`, act: over ? "EVICT_ROOT" : "KEEP_ALL",
        why: over && !whyEvict ? { title: "Why is the popped pair safe to drop?", text: "The root is the pair with the smallest count among the `k + 1` now in the heap. At least `k` other pairs have a count at least as large, so it can never be in the top `k`, however many more values arrive. And this removal costs only $O(\\log k)$." } : null });
      if (over) whyEvict = true;
    }
    while (heap.length) { const t = pop(); out.push(t.val); }
    T.step("collect", { w: Math.max(1, out.length * lg(Math.max(out.length, 1))), vars: { k }, state: S({ showOut: true, note: "emptied the heap" }), say: `All values have been processed. Pop the survivors out of the heap: the **${out.length}** most frequent value${out.length === 1 ? " is" : "s are"} **${out.map((x) => x).join(", ")}** (in increasing order of count).`, op: "while (!heap.empty()) out.push_back(heap.top().second)", act: "COLLECT" });
    T.step("ret", { vars: { "return": `[${out.join(", ")}]` }, state: S({ showOut: true }), say: `Return **[${out.join(", ")}]**: the order does not matter.`, op: "return out", act: "DONE" });
    T.result(out.slice());
  },
  fuzz(rnd) {
    for (let tries = 0; tries < 50; tries++) {
      const n = 1 + Math.floor(rnd() * 11), nums = Array.from({ length: n }, () => Math.floor(rnd() * 6) - 2);
      const cnt = {}; nums.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
      const cs = Object.values(cnt).sort((x, y) => y - x), d = cs.length, k = 1 + Math.floor(rnd() * d);
      if (k === d || cs[k - 1] !== cs[k]) return { nums, k };
    }
    return { nums: [1, 1, 2], k: 1 };
  },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i), k: 3 }; },

  complexity: {
    time: {
      tex: "O(n + d \\log k)", title: "n counts plus d heap operations on a heap of size at most k + 1", short: "d = number of distinct values ≤ n",
      derive: [
        "T_{\\text{count}} = n\\, c || one hash-map increment per number",
        "|\\text{heap}| \\le k + 1 \\;\\Rightarrow\\; c_{\\text{push}}, c_{\\text{pop}} = O(\\log k) || the heap never grows beyond $k + 1$ entries",
        "T_{\\text{heap}} = d\\,(c_{\\text{push}} + c_{\\text{pop}}) = O(d \\log k) || one push and at most one pop per distinct value",
        "!T(n, k) = O(n + d \\log k) \\le O(n \\log k) || since $d \\le n$; versus $O(d \\log d)$ for sorting everything",
      ],
      where: "For small $k$ the log factor is tiny (for $k = 10$, $\\log_2 10 \\approx 3$), so the whole algorithm is close to linear. In the measured table $k = 3$ is fixed and the values are all different, so $d = n$ and the cost grows linearly with $n$.",
    },
    space: {
      tex: "O(d + k)", title: "the frequency map plus the heap", short: "d entries in the map, at most k + 1 in the heap",
      derive: [
        "|\\text{freq}| = d \\le n || one entry per distinct value",
        "|\\text{heap}| \\le k + 1 || never larger",
        "!S = O(d + k) = O(n) || the map dominates",
      ],
      where: "The heap itself is tiny; the counting map is the main memory. A bucket sort (follow-up) also uses $O(n)$.",
    },
    limit: "Counting needs $\\Omega(n)$ to read the input. Selecting the top $k$ can be done in $O(n)$ with bucket sort (counts are at most $n$) or with quickselect on average, so the heap's extra $\\log k$ is not strictly necessary.",
    measure: { label: "n = number of elements (all different, k = 3)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Using a max-heap of size k", what: "A max-heap holding the `k` best.", why: "\"We want the largest\" suggests a max-heap.", breaks: "The root is the *best* member, so the one that must be evicted (the weakest) is buried at the bottom and cannot be removed cheaply.", avoid: "For the largest `k`, use a **min**-heap (the weakest on top)." },
    { title: "Putting all the values in a heap and popping k times", what: "A max-heap of all `d` pairs, then `k` pops.", why: "It is the simplest heap solution.", breaks: "It is correct but costs $O(d + k \\log d)$ time and $O(d)$ memory: the point of the size-`k` heap is lost.", avoid: "Keep the heap at size `k`: push, then pop when it exceeds `k`." },
    { title: "Comparing by value instead of by count", what: "A heap (or sort) ordered by the numbers themselves.", why: "The default order of a pair, or of an `int`.", breaks: "It returns the `k` largest *numbers*, not the `k` most frequent.", avoid: "Order the heap by **count**: store `(count, value)` with the count first." },
    { title: "Counting again for every element", what: "Counting occurrences with an inner loop.", why: "Avoiding a hash map.", breaks: "$O(n^2)$ time.", avoid: "One pass with a hash map." },
    { title: "Forgetting the order does not matter", what: "Sorting the answer or insisting on a particular order.", why: "The expected output in the example looks sorted.", breaks: "No error, but wasted work (and a wrong result if tests compare an exact order).", avoid: "The statement allows any order; compare the answers as sets." },
  ],

  followUps: [
    {
      q: "Reach **$O(n)$ time** with a bucket sort on the counts.",
      a: "A count is at most `n`, so make `n + 1` buckets: `bucket[c]` is the list of the values that occur exactly `c` times. Fill the buckets from the frequency map, then walk the buckets from the highest count downwards, collecting values until `k` are taken. Every step is linear, so the total is $O(n)$.",
      cpp: `vector<int> topKBucket(vector<int>& nums, int k) {
    unordered_map<int, int> freq;
    for (int x : nums) freq[x]++;
    vector<vector<int>> bucket(nums.size() + 1);
    for (auto& [val, cnt] : freq) bucket[cnt].push_back(val);
    vector<int> out;
    for (int c = (int)nums.size(); c >= 1 && (int)out.size() < k; c--)
        for (int v : bucket[c]) { out.push_back(v); if ((int)out.size() == k) break; }
    return out;
}`,
      js: `function topKBucket(nums, k) {
  const freq = new Map();
  for (const x of nums) freq.set(x, (freq.get(x) || 0) + 1);
  const bucket = Array.from({ length: nums.length + 1 }, () => []);
  for (const [val, cnt] of freq) bucket[cnt].push(val);
  const out = [];
  for (let c = nums.length; c >= 1 && out.length < k; c--)
    for (const v of bucket[c]) { out.push(v); if (out.length === k) break; }
  return out;
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Use **quickselect** (partial partitioning) instead.",
      a: "Partition the list of distinct (value, count) pairs around a pivot count, like quicksort, but recurse only into the side that contains the boundary between the top `k` and the rest. On average it is $O(d)$ (worst case $O(d^2)$ without a good pivot rule).",
      time: "O(n) average", space: "O(n)",
    },
    {
      q: "The numbers arrive as a **stream** and you must report the top `k` at any moment.",
      a: "Keep the frequency map up to date for every arrival. For the top `k`, maintain a heap with *lazy deletion* (a stale entry is ignored when popped), or use an ordered structure of counts. Each update costs $O(\\log d)$, and a query costs $O(k)$ to list the heap or ordered map.",
      time: "O(log d) per update", space: "O(d)",
    },
    {
      q: "Find the **k-th largest element** in an array (the heap idea on raw values).",
      a: "Keep a min-heap of size `k` over the values themselves: the root at the end is the $k$-th largest. It is the same algorithm without the counting phase: $O(n \\log k)$ time and $O(k)$ space.",
      time: "O(n log k)", space: "O(k)",
    },
  ],

  related: [
    { id: "find-median-from-data-stream", why: "Another heap problem: two heaps keep the middle of a changing set available." },
    { id: "merge-k-sorted-lists", why: "A min-heap again: it hands out the smallest of $k$ candidates." },
    { id: "meeting-rooms-ii", why: "A min-heap that keeps the earliest finishing time on top." },
    { id: "group-anagrams", why: "Counting with a hash map is the first step here, and a grouping key there." },
  ],
  patternNote: "**Top K with a size-K heap.** To keep the best $k$ of a large collection, hold them in a heap whose root is the *weakest* of the kept ones. Each newcomer is compared with the root only: if better, it replaces it. The work is $O(d \\log k)$ and the extra memory $O(k)$, whatever the size of the input.",
  takeaways: [
    "Count with a hash map first: `freq[x]++`.",
    "Largest `k` → **min**-heap of size `k` of `(count, value)`: push, and pop the root when the size exceeds `k`.",
    "Order the heap by **count**, not by value; any order of the final answer is fine.",
    "Time $O(n + d \\log k)$, space $O(d + k)$; sorting costs $O(d \\log d)$.",
    "For $O(n)$ use a bucket sort indexed by count.",
  ],
});
