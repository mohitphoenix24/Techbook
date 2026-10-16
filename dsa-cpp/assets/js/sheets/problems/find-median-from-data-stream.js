SHEETS.define({
  id: "find-median-from-data-stream",
  viz: "heap",
  io: {
    fn: "MedianFinder", params: [["ops", "ops"], ["args", "any"]], ret: "any",
    labels: { ops: "ops (method names, like LeetCode)", args: "args (one list of arguments per call)" },
    design: SHEETS.design({ cls: "MedianFinder", ctor: [], methods: { addNum: { args: ["int"], ret: "void" }, findMedian: { args: [], ret: "double" } } }),
  },
  legend: [["cur", "number just placed"], ["cmp", "root of each heap (the two middle candidates)"], ["bad", "number being moved"], ["win", "in the heap"]],

  statement: `The **median** is the middle value in an ordered integer list. If the size of the list is even, there is no middle value, and the median is the mean of the two middle values.

- For example, for \`arr = [2, 3, 4]\`, the median is \`3\`.
- For example, for \`arr = [2, 3]\`, the median is \`(2 + 3) / 2 = 2.5\`.

Implement the \`MedianFinder\` class:
- \`MedianFinder()\` initialises the \`MedianFinder\` object.
- \`void addNum(int num)\` adds the integer \`num\` from the data stream to the data structure.
- \`double findMedian()\` returns the median of all elements so far.

*(In the lab, the calls are written like LeetCode does: a list of method names in \`ops\` and a list of argument lists in \`args\`. The result is the list of return values, with \`null\` for methods that return nothing. \`findMedian\` is never called before the first \`addNum\`.)*`,
  examples: [
    { input: `ops = ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"], args = [[], [1], [2], [], [3], []]`, output: "[null, null, null, 1.5, null, 2.0]", explain: "After adding 1 and 2 the median is (1 + 2) / 2 = 1.5; after adding 3 the list is [1, 2, 3] and the median is 2." },
  ],
  constraints: ["$-10^5 \\le$ `num` $\\le 10^5$", "There will be at least one element in the data structure before calling `findMedian`", "At most $5 \\cdot 10^4$ calls will be made to `addNum` and `findMedian`"],
  check(input) {
    const ops = input.ops, args = input.args;
    if (!Array.isArray(args) || !Array.isArray(ops) || ops.length !== args.length) return "ops and args must have the same length (one argument list per call)";
    if (ops[0] !== "MedianFinder" || (args[0] || []).length !== 0) return 'the first call must be "MedianFinder" with an empty argument list []';
    if (ops.length > 11) return "for the animation use at most 11 calls (including MedianFinder)";
    let count = 0;
    for (let k = 1; k < ops.length; k++) {
      if (ops[k] === "addNum") {
        const a = args[k];
        if (!Array.isArray(a) || a.length !== 1 || !Number.isInteger(a[0]) || Math.abs(a[0]) > 99) return `call ${k + 1}: addNum needs one integer between -99 and 99, e.g. [5]`;
        count++;
      } else if (ops[k] === "findMedian") {
        if ((args[k] || []).length !== 0) return `call ${k + 1}: findMedian takes no arguments: []`;
        if (count < 1) return `call ${k + 1}: add at least one number before calling findMedian`;
      } else return `call ${k + 1}: the method must be addNum or findMedian`;
    }
    return null;
  },

  intuition: {
    find: "A structure that accepts numbers one at a time and can always tell, immediately, the **middle value** of everything received so far.",
    beginner: "Keep every number in a list. When the median is asked for, sort the list and take the middle element (or the mean of the two middle ones).",
    works: "After sorting, the middle position holds the median by definition, so the answer is always right.",
    slow: "Every `findMedian` sorts the whole list: $O(n \\log n)$, and with many queries interleaved with insertions that is far too slow. Keeping the list sorted by inserting each number in place costs $O(n)$ per insertion.",
    repeat: "Between two queries only **one new number** arrives, but the sort re-orders everything, including all the numbers whose relative order is already known and whose order inside each half does not matter.",
    remember: "The median depends only on the **two middle values**, not on the order inside the lower half or inside the upper half. If we split the numbers into a **smaller half** and a **larger half** of (almost) equal size, the median is determined by the *largest* of the smaller half and the *smallest* of the larger half.",
    observation: "Keep two heaps: `lo`, a **max-heap** with the smaller half (its top is the largest of the smaller numbers), and `hi`, a **min-heap** with the larger half (its top is the smallest of the larger numbers). Keep their sizes equal, or `lo` one larger. Then the median is `lo.top()` (odd count) or the mean of `lo.top()` and `hi.top()` (even count), found in $O(1)$.",
    leads: "To add `num`: push it into `lo`, then move `lo`'s top to `hi` (this guarantees every number of `lo` is ≤ every number of `hi`), then if `hi` became larger than `lo`, move `hi`'s top back to `lo`. Each step is a heap operation: $O(\\log n)$.",
  },

  flow: [
    "Keep all numbers; sort when the median is requested.",
    "The middle of the sorted list is the median.",
    "$O(n \\log n)$ per query: the whole list is sorted again after every insertion.",
    "Only the two middle values matter, not the order inside each half.",
    "A max-heap for the smaller half and a min-heap for the larger half, balanced in size.",
    "`addNum` is $O(\\log n)$ (a few heap operations); `findMedian` is $O(1)$.",
  ],

  brute: {
    idea: "**Brute force:** store all the numbers in a `vector`. `addNum` appends. `findMedian` sorts a copy of the vector and returns the middle element (or the mean of the two middle elements).",
    why: "Each `findMedian` costs $O(n \\log n)$ for the sort, although the data has barely changed since the previous query (one number was added). With many queries this is quadratic or worse. The two heaps maintain the middle incrementally.",
    time: "O(n log n) per findMedian", space: "O(n)",
    cpp: `class MedianFinder {
    vector<int> nums;
public:
    MedianFinder() {}
    void addNum(int num) { nums.push_back(num); }
    double findMedian() {
        vector<int> v = nums;
        sort(v.begin(), v.end());
        int n = v.size();
        if (n % 2) return v[n / 2];
        return (v[n / 2 - 1] + v[n / 2]) / 2.0;
    }
};`,
    js: `class MedianFinder {
  constructor() { this.nums = []; }
  addNum(num) { this.nums.push(num); }
  findMedian() {
    const v = this.nums.slice().sort((a, b) => a - b), n = v.length;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  }
}`,
  },

  pattern: {
    name: "Two Heaps",
    why: "A **max-heap of the smaller half** and a **min-heap of the larger half** put the two middle values on top of their heaps. The structure answers \"what is the middle?\" in $O(1)$ and absorbs a new number in $O(\\log n)$, because the *order inside each half is never needed*.",
    recognize: [
      "You need the **median** (or any fixed percentile) of a changing collection.",
      "Numbers arrive in a stream and queries are interleaved with insertions.",
      "The answer depends only on the boundary between the lower and the upper half.",
      "Sorting after every insertion would be too slow.",
    ],
  },

  optimal: {
    idea: "Keep two heaps: `lo` is a max-heap holding the smaller half of the numbers, `hi` is a min-heap holding the larger half. Their sizes differ by at most one (`lo` may hold one extra), and every number in `lo` is at most every number in `hi`. To add a number, push it into `lo`, move the largest element of `lo` to `hi` (so that the halves stay ordered), and if `hi` now has more elements than `lo`, move the smallest of `hi` back. The median is `lo.top()` when the count is odd, otherwise the mean of `lo.top()` and `hi.top()`.",
    steps: [
      "`lo` = max-heap (smaller half), `hi` = min-heap (larger half), both empty.",
      "**addNum(num):** push `num` into `lo`.",
      "Move the top of `lo` to `hi` (pop from `lo`, push into `hi`).",
      "If `hi.size() > lo.size()`, move the top of `hi` back to `lo`.",
      "**findMedian():** if `lo.size() > hi.size()`, return `lo.top()`; otherwise return `(lo.top() + hi.top()) / 2.0`.",
    ],
    invariant: "**Every element of `lo` is ≤ every element of `hi`, and `lo.size() == hi.size()` or `lo.size() == hi.size() + 1`.**",
    correct: "Suppose the invariant holds before `addNum(x)`. Pushing `x` into `lo` and then moving `lo`'s maximum to `hi` places the larger of `x` and the old maximum of `lo` into `hi`; all the remaining elements of `lo` are at most that value, and the old elements of `hi` are at least the old maximum of `lo`, but possibly smaller than `x`, so we must check: if `x` was large, it ends up *in `hi`* (it was moved as the maximum) and the order `lo ≤ hi` still holds; if `x` was small, the moved element is the old maximum of `lo`, which is ≤ every element of `hi`. In both cases `lo ≤ hi` holds. The sizes are now `|lo|` and `|hi| + 1`; if `hi` is now larger, moving its minimum back to `lo` restores the size rule and the ordering (that minimum is ≥ everything in `lo` and ≤ the rest of `hi`). With the sizes balanced, the sorted list is `lo` (in order) followed by `hi`, so for an odd count the middle is the maximum of `lo` and for an even count the two middle values are the maximum of `lo` and the minimum of `hi`.",
  },

  cpp: `class MedianFinder {
    priority_queue<int> lo;                     // max-heap: the smaller half
    priority_queue<int, vector<int>, greater<int>> hi;   // min-heap: the larger half
public:
    MedianFinder() {}                           //@ctor
    void addNum(int num) {
        lo.push(num);                           // first into the smaller half //@toLo
        hi.push(lo.top()); lo.pop();            // its largest goes to the larger half //@move
        if (hi.size() > lo.size()) { lo.push(hi.top()); hi.pop(); }   // keep lo the bigger one //@balance
    }
    double findMedian() {
        if (lo.size() > hi.size()) return lo.top();   // odd count: the middle one //@odd
        return (lo.top() + hi.top()) / 2.0;     // even count: the two middle ones //@even
    }
};`,
  js: `class Heap {                             // binary heap; less(a, b) true means a is above b
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  top() { return this.a[0]; }
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
class MedianFinder {
  constructor() {
    this.lo = new Heap((x, y) => x > y);     // max-heap: the smaller half
    this.hi = new Heap((x, y) => x < y);     // min-heap: the larger half
  }                                      //@ctor
  addNum(num) {
    this.lo.push(num);                   // first into the smaller half //@toLo
    this.hi.push(this.lo.pop());         // its largest goes to the larger half //@move
    if (this.hi.size > this.lo.size) this.lo.push(this.hi.pop());   // keep lo the bigger one //@balance
  }
  findMedian() {
    if (this.lo.size > this.hi.size) return this.lo.top();   // odd count: the middle one //@odd
    return (this.lo.top() + this.hi.top()) / 2;   // even count: the two middle ones //@even
  }
}`,

  tests: [
    { name: "Example: 1, 2, 3", kind: "normal", input: { ops: ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"], args: [[], [1], [2], [], [3], []] } },
    { name: "Numbers arriving in decreasing order", kind: "normal", input: { ops: ["MedianFinder", "addNum", "addNum", "addNum", "findMedian", "addNum", "findMedian", "addNum", "findMedian"], args: [[], [5], [4], [3], [], [2], [], [1], []] } },
    { name: "The median changes at every insertion", kind: "normal", input: { ops: ["MedianFinder", "addNum", "findMedian", "addNum", "findMedian", "addNum", "findMedian", "addNum", "findMedian"], args: [[], [5], [], [15], [], [1], [], [3], []] } },
    { name: "A single number", kind: "edge", input: { ops: ["MedianFinder", "addNum", "findMedian"], args: [[], [7], []] }, why: "After the insertion `lo` holds the number and `hi` is empty (the number moved to `hi` and back). `lo.size() > hi.size()`, so the median is `lo.top()` = 7. The result is printed as a decimal (`7.0`)." },
    { name: "Duplicates", kind: "edge", input: { ops: ["MedianFinder", "addNum", "addNum", "addNum", "findMedian"], args: [[], [2], [2], [2], []] }, why: "Equal numbers go to either heap without any problem: the rule is `lo ≤ hi` (not `<`). The median of `[2, 2, 2]` is 2." },
    { name: "Negative numbers", kind: "edge", input: { ops: ["MedianFinder", "addNum", "addNum", "addNum", "findMedian"], args: [[], [-1], [-2], [-3], []] }, why: "The heaps are ordered by value, so negatives are fine: sorted the numbers are -3, -2, -1 and the median is -2. A median computed by integer division (`/ 2` on ints) would round wrongly for negatives; here the mean is taken in floating point." },
    { name: "An even count: the mean of two different numbers", kind: "edge", input: { ops: ["MedianFinder", "addNum", "addNum", "findMedian"], args: [[], [1], [2], []] }, why: "With two numbers the median is the mean of the roots of the two heaps: (1 + 2) / 2 = 1.5. Using integer division would give 1. The `2.0` in the code forces a floating-point division." },
    { name: "A number smaller than everything, then larger than everything", kind: "corner", input: { ops: ["MedianFinder", "addNum", "addNum", "addNum", "addNum", "findMedian"], args: [[], [10], [20], [-5], [99], []] }, why: "`-5` enters `lo` and stays in the smaller half; `99` passes through `lo`, is moved to `hi` as the largest element of `lo`, and stays there. The two-step move (push into `lo`, then pop its top) places each number in the right half whatever its size." },
    { name: "Extreme values cancel", kind: "corner", input: { ops: ["MedianFinder", "addNum", "addNum", "findMedian"], args: [[], [99], [-99], []] }, why: "The median is (−99 + 99) / 2 = 0.0. The result is a `double`: it prints as `0.0`, and a sum that overflowed `int` would be a bug for much larger values (use `/ 2.0`, or `long long` for the sum)." },
  ],

  trace(input, T) {
    const ops = input.ops, args = input.args;
    const lo = [], hi = [];       // items { id, v }
    const loLess = (a, b) => a.v > b.v, hiLess = (a, b) => a.v < b.v;
    const lg = (m) => 1 + Math.floor(Math.log2(Math.max(m, 1)));
    function push(h, less, x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(h[i], h[p])) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
    function pop(h, less) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && less(h[l], h[m])) m = l; if (r < h.length && less(h[r], h[m])) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
    const results = []; let eid = 0;
    let whyTwoStep = false, whyBalance = false, whyMedian = false, whyHalves = false;
    const fmtR = (x) => (x === null ? "null" : x && x.__dbl !== undefined ? (Number.isInteger(x.__dbl) ? x.__dbl.toFixed(1) : String(x.__dbl)) : String(x));
    const all = () => lo.length + hi.length;
    const S = (o = {}) => () => ({
      heaps: [
        { name: "lo: max-heap, the smaller half", min: false, items: lo.map((e) => ({ id: e.id, v: e.v })), hl: o.lhl || {}, levels: 3 },
        { name: "hi: min-heap, the larger half", min: true, items: hi.map((e) => ({ id: e.id, v: e.v })), hl: o.hhl || {}, levels: 3 },
      ],
      out: { label: "results so far", items: results.map(fmtR) },
      note: o.note !== undefined ? o.note : `${all()} number${all() === 1 ? "" : "s"} stored   ·   sizes: lo = ${lo.length}, hi = ${hi.length}`,
    });
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k], a = args[k] || [];
      T.phase(a.length ? `${op}(${a[0]})` : `${op}()`);
      if (op === "MedianFinder") {
        T.step("ctor", { vars: {}, state: S({ note: "two empty heaps" }), say: "`MedianFinder()` creates two empty heaps: `lo` (a **max**-heap for the smaller half) and `hi` (a **min**-heap for the larger half).", op: "lo = max-heap,  hi = min-heap", act: "CREATE_HEAPS",
          why: { title: "Why two heaps?", text: "The median needs only the *largest of the smaller half* and the *smallest of the larger half*. A max-heap puts the largest of its elements on top and a min-heap the smallest, so both candidates are available in O(1), and nothing else needs to be ordered." } });
        results.push(null);
      } else if (op === "addNum") {
        const x = a[0], id = "e" + eid++;
        push(lo, loLess, { id, v: x });
        T.step("toLo", { w: lg(lo.length), vars: { num: x, "lo size": lo.length, "hi size": hi.length }, state: S({ lhl: { [id]: "cur" } }), say: `Add **${x}**: push it into \`lo\` (the smaller half) first. Its new top is **${lo[0].v}**.`, op: `lo.push(${x})`, act: "PUSH_LO" });
        const top = pop(lo, loLess);
        push(hi, hiLess, top);
        T.step("move", { w: lg(lo.length + 1) + lg(hi.length), vars: { moved: top.v, "lo size": lo.length, "hi size": hi.length }, state: S({ hhl: { [top.id]: "bad" }, note: `${top.v}, the largest of lo, moves to hi` }), say: `Move the **largest** element of \`lo\`, **${top.v}**, to \`hi\`. Now every number in \`lo\` is ≤ every number in \`hi\`${top.id === id ? ` (${x} itself was the largest, so it goes straight to hi)` : ` (${x} stayed in lo because it was not the largest)`}.`, op: `hi.push(lo.top());  lo.pop()  →  moved ${top.v}`, act: "MOVE_LARGEST",
          why: whyTwoStep ? null : { title: "Why push into lo, then move its top?", text: "We do not need to compare the new number with the heaps ourselves. Pushing it into `lo` and moving `lo`'s maximum to `hi` always puts the larger of (the new number, the old maximum of `lo`) into `hi`, which keeps every number of `lo` below every number of `hi`." } });
        whyTwoStep = true;
        const need = hi.length > lo.length;
        let back = null;
        if (need) { back = pop(hi, hiLess); push(lo, loLess, back); }
        T.step("balance", { w: need ? lg(hi.length + 1) + lg(lo.length) : 1, vars: { "lo size": lo.length, "hi size": hi.length }, state: S({ lhl: back ? { [back.id]: "cur" } : {}, note: back ? `${back.v}, the smallest of hi, moves back to lo` : undefined }), say: need ? `\`hi\` has more elements than \`lo\`, so move its **smallest**, **${back.v}**, back to \`lo\`. The sizes are balanced again (lo has the same number, or one more).` : `\`hi\` is not larger than \`lo\` (${hi.length} ≤ ${lo.length}): the sizes are already balanced.`, op: `hi.size() > lo.size()  →  ${hi.length + (need ? 1 : 0)} > ${lo.length - (need ? 1 : 0)}  →  ${need}`, act: need ? "MOVE_SMALLEST_BACK" : "BALANCED",
          why: need && !whyBalance ? { title: "Why keep the sizes balanced?", text: "The median is at the boundary between the halves only if the halves have (almost) equal size. With `lo` holding the extra element for an odd count, the median is `lo`'s top, and for an even count the two middle values are the two tops." } : null });
        if (need) whyBalance = true;
        results.push(null);
      } else {
        const odd = lo.length > hi.length;
        T.step("odd", { vars: { "lo size": lo.length, "hi size": hi.length }, state: S({ lhl: lo.length ? { [lo[0].id]: "cmp" } : {}, hhl: hi.length ? { [hi[0].id]: "cmp" } : {} }), say: odd ? `\`lo\` has more elements than \`hi\` (${lo.length} > ${hi.length}), so the count is **odd** and the median is the top of \`lo\`: **${lo[0].v}**.` : `\`lo\` and \`hi\` have the same size (${lo.length}), so the count is **even**: the median is the mean of the two tops.`, op: `lo.size() > hi.size()  →  ${odd}`, act: odd ? "ODD_COUNT" : "EVEN_COUNT",
          why: whyMedian ? null : { title: "Why are the tops the middle?", text: "The sorted list is the whole of `lo` (all values ≤ the top of `lo`) followed by the whole of `hi` (all ≥ the top of `hi`). With balanced sizes, the middle of that list is at the boundary: the top of `lo`, and, for an even count, the top of `hi` next to it." } });
        whyMedian = true;
        let med;
        if (odd) { med = lo[0].v; }
        else {
          med = (lo[0].v + hi[0].v) / 2;
          T.step("even", { vars: { "lo.top": lo[0].v, "hi.top": hi[0].v, median: med }, state: S({ lhl: { [lo[0].id]: "cmp" }, hhl: { [hi[0].id]: "cmp" } }), say: `The two middle values are **${lo[0].v}** (top of \`lo\`) and **${hi[0].v}** (top of \`hi\`): their mean is **${med}**. The division is by \`2.0\`, so it is exact.`, op: `(${lo[0].v} + ${hi[0].v}) / 2.0  =  ${med}`, act: "MEAN_OF_TWO" });
        }
        results.push(SHEETS.dbl(med));
        if (odd) T.step("odd", { vars: { "return": med }, state: S({ lhl: { [lo[0].id]: "hit" } }), say: `Return **${Number.isInteger(med) ? med.toFixed(1) : med}**.`, op: `return lo.top()  =  ${med}`, act: "RETURN_MEDIAN" });
      }
    }
    T.result(results.slice());
  },
  fuzz(rnd) {
    const ops = ["MedianFinder"], args = [[]];
    let count = 0;
    const n = 1 + Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) {
      if (count > 0 && rnd() < 0.4) { ops.push("findMedian"); args.push([]); }
      else { ops.push("addNum"); args.push([Math.floor(rnd() * 21) - 10]); count++; }
    }
    return { ops, args };
  },
  gen(n) {
    const ops = ["MedianFinder"], args = [[]];
    for (let i = 0; i < n; i++) { ops.push("addNum"); args.push([(i * 37) % 97 - 40]); }
    ops.push("findMedian"); args.push([]);
    return { ops, args };
  },

  complexity: {
    time: {
      tex: "O(\\log n) \\text{ per } \\texttt{addNum},\\quad O(1) \\text{ per } \\texttt{findMedian}", title: "a constant number of heap operations on heaps of size at most n/2 + 1", short: "each heap push or pop costs O(log n)",
      derive: [
        "|lo|, |hi| \\le \\lceil n/2 \\rceil \\;\\Rightarrow\\; c_{\\text{push}}, c_{\\text{pop}} = O(\\log n) || both heaps hold about half of the numbers",
        "T_{\\text{addNum}} = 1 \\text{ push} + 1\\text{ pop} + 1 \\text{ push} + (\\text{at most } 1 \\text{ pop} + 1 \\text{ push}) \\le 5\\,O(\\log n) || three or five heap operations",
        "T_{\\text{findMedian}} = c || read one or two tops",
        "!T_{\\text{addNum}} = O(\\log n),\\;\\; T_{\\text{findMedian}} = O(1) || and $n$ insertions cost $O(n \\log n)$ in total",
      ],
      where: "Compare with the brute force: its `findMedian` sorts in $O(n \\log n)$ on every query. The measured table adds $n$ numbers (a single median query at the end), counting each heap operation as $\\log_2$ of the heap size, so it follows $n \\log_2 n$.",
    },
    space: {
      tex: "O(n)", title: "all the numbers are stored, once, in one of the two heaps", short: "n numbers in total",
      derive: [
        "|lo| + |hi| = n || every number lives in exactly one heap",
        "!S = O(n) || no extra copy and no sorting buffer",
      ],
      where: "Any exact median structure must remember all the numbers (or approximate): $\\Omega(n)$ memory in general.",
    },
    limit: "Reading each number takes $\\Omega(1)$ and a comparison-based structure needs $\\Omega(\\log n)$ per insertion in the worst case to maintain order information, so $O(\\log n)$ per insertion is optimal. (If the numbers come from a small known range, a counting array gives $O(1)$ insertion.)",
    measure: { label: "n = numbers added (then one findMedian)", fTex: "n \\log_2 n", f: (n) => n * Math.log2(n), sizes: [8, 16, 32, 64, 128, 256], growth: "n log n" },
  },

  mistakes: [
    { title: "Using two max-heaps (or two min-heaps)", what: "Both halves in the same kind of heap.", why: "`priority_queue` is a max-heap by default, so it is used twice.", breaks: "The root of the larger half is its *largest* element, not its smallest, so the second middle value is unavailable.", avoid: "`lo` is a **max**-heap (its top is the largest of the smaller half); `hi` is a **min**-heap." },
    { title: "Letting the sizes drift apart", what: "Pushing into the right heap by comparison, but never re-balancing.", why: "The halves are \"ordered\", so they look correct.", breaks: "If one heap grows far larger, its top is no longer the middle: the median is wrong.", avoid: "After every insertion keep `lo.size() == hi.size()` or `lo.size() == hi.size() + 1`." },
    { title: "Integer division for the mean", what: "`(lo.top() + hi.top()) / 2`.", why: "Both tops are `int`.", breaks: "`(1 + 2) / 2` gives `1` instead of `1.5`.", avoid: "Divide by `2.0` (a `double`), and consider `long long` for the sum with large values." },
    { title: "Breaking the order between the heaps", what: "Pushing the new number into `lo` or `hi` without comparing with the other heap's top.", why: "Pushing into the smaller heap keeps the sizes balanced.", breaks: "A number larger than some element of `hi` can sit in `lo`, so `lo.top()` is no longer ≤ `hi.top()` and the median is wrong.", avoid: "Push into `lo`, then move `lo`'s top to `hi` (or compare with the tops first)." },
    { title: "Calling `top()` on an empty heap", what: "Reading `hi.top()` when only one number has been added.", why: "The even-count branch is written for two numbers.", breaks: "Undefined behaviour (crash) when `hi` is empty.", avoid: "Check the sizes first: with an odd count, return `lo.top()` only." },
  ],

  followUps: [
    {
      q: "All numbers are between **0 and 100**. Can you do better?",
      a: "Keep a counting array `cnt[0..100]` and the total `n`. `addNum` is $O(1)$. To find the median, walk the array accumulating counts until the running total reaches `(n + 1) / 2` (and `n / 2 + 1` for the second middle): $O(101) = O(1)$. It uses constant memory.",
      cpp: `class MedianFinderSmall {
    int cnt[101] = {0}, n = 0;
    int kth(int k) { int s = 0; for (int v = 0; v <= 100; v++) { s += cnt[v]; if (s >= k) return v; } return -1; }
public:
    void addNum(int num) { cnt[num]++; n++; }
    double findMedian() {
        if (n % 2) return kth(n / 2 + 1);
        return (kth(n / 2) + kth(n / 2 + 1)) / 2.0;
    }
};`,
      js: `class MedianFinderSmall {
  constructor() { this.cnt = new Array(101).fill(0); this.n = 0; }
  addNum(num) { this.cnt[num]++; this.n++; }
  kth(k) { let s = 0; for (let v = 0; v <= 100; v++) { s += this.cnt[v]; if (s >= k) return v; } return -1; }
  findMedian() {
    const n = this.n;
    return n % 2 ? this.kth((n + 1) / 2) : (this.kth(n / 2) + this.kth(n / 2 + 1)) / 2;
  }
}`,
      time: "O(1) per call", space: "O(1)",
    },
    {
      q: "**99%** of the numbers are in [0, 100], the rest are outside. How do you adapt?",
      a: "Keep the counting array for the common range, plus two counters for the numbers below 0 and above 100, and the (rare) outliers in a sorted list or two small heaps. The median falls in the array almost always; it falls in the outliers only if they make up half of the data, which the 99% bound excludes.",
      time: "O(1) typical", space: "O(1 + outliers)",
    },
    {
      q: "Maintain a **sliding-window median** (the last `k` numbers).",
      a: "Use the two heaps with *lazy deletion*: when a number leaves the window, mark it in a hash map of pending removals and drop it only when it reaches the top of a heap; keep size counters that exclude the marked elements. Each step costs $O(\\log k)$ amortised. A balanced ordered structure also works.",
      time: "O(log k) per step", space: "O(k)",
    },
    {
      q: "Find the **K-th largest** element of a stream.",
      a: "A single min-heap of size $K$: its top is the $K$-th largest. Push each number and pop when the size exceeds $K$: $O(\\log K)$ per number. It is the one-heap relative of this problem.",
      time: "O(log K) per number", space: "O(K)",
    },
  ],

  related: [
    { id: "top-k-frequent-elements", why: "The other heap problem: a single heap of size $k$ keeps the best $k$." },
    { id: "merge-k-sorted-lists", why: "A min-heap again, handing out the smallest of $k$ candidates." },
    { id: "meeting-rooms-ii", why: "A min-heap of end times: the earliest-finishing room is always on top." },
    { id: "binary-search", why: "Another way to find a middle value, when the data is already sorted and fixed." },
  ],
  patternNote: "**Two heaps split a collection at its middle.** A max-heap holds the smaller half and a min-heap the larger half, so the two values next to the median sit at the tops, ready in $O(1)$. Inserting a number only needs a push, a move and an optional move back, which is $O(\\log n)$, because the order *inside* each half never matters.",
  takeaways: [
    "`lo` = **max**-heap (smaller half), `hi` = **min**-heap (larger half); every element of `lo` ≤ every element of `hi`.",
    "`addNum`: push into `lo`, move `lo`'s top to `hi`, and if `hi` is bigger move `hi`'s top back to `lo`.",
    "Keep `lo.size() == hi.size()` or one more: the median is `lo.top()` (odd) or the mean of both tops (even, divide by `2.0`).",
    "`addNum` is $O(\\log n)$, `findMedian` is $O(1)$, space $O(n)$ (sorting on every query costs $O(n \\log n)$).",
    "For numbers in a small range, a counting array is even simpler.",
  ],
});
