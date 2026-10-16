SHEETS.define({
  id: "binary-search",
  viz: "binary",
  io: { fn: "search", params: [["nums", "int[]"], ["target", "int"]], ret: "int" },

  statement: `You are given an array \`nums\` of integers sorted in **ascending order**, with no repeated values, and an integer \`target\`.

Return the index of \`target\` in \`nums\`. If \`target\` is not present, return \`-1\`. Your solution must run in $O(\\log n)$ time.

*(This is the classic warm-up. It is not one of the Blind 75, but "Find Minimum in Rotated Sorted Array" and "Search in Rotated Sorted Array" are both built directly on it, so we start here.)*`,
  examples: [
    { input: "nums = [-1, 0, 3, 5, 9, 12], target = 9", output: "4", explain: "`nums[4] = 9`." },
    { input: "nums = [-1, 0, 3, 5, 9, 12], target = 2", output: "-1", explain: "`2` is not in the array, so we report `-1`." },
  ],
  constraints: ["$1 \\le$ `nums.length` $\\le 10^4$", "$-10^4 <$ `nums[i]`, `target` $< 10^4$", "All values in `nums` are **unique**.", "`nums` is sorted in ascending order."],
  judge(input, out, exp) { return { ok: out === exp }; },

  intuition: {
    find: "The **position** of `target` in a sorted list, or `-1` if it is not there.",
    beginner: "Look at the first element, then the second, then the third, until we meet `target` or run out of elements. This is a *linear scan*.",
    works: "It looks at every element in turn, so if `target` is there we are certain to meet it, and if we reach the end it is certainly absent. It is correct for **any** array, sorted or not.",
    slow: "In the worst case (`target` is last, or missing) it looks at all `n` elements. For $n = 10^9$ that is a billion steps. The scan **ignores the one useful fact we were given**: the array is sorted.",
    repeat: "Each comparison teaches us about exactly **one** element: `nums[i] ≠ target`. We then throw that knowledge away and ask about the next element, as if the array had no order at all.",
    remember: "We do not need to remember anything extra. What we need is to **learn more from each comparison**. In a sorted array, one comparison with the middle element also tells us about a whole side of the array.",
    observation: "Compare `target` with the **middle** element. If `nums[mid] < target`, then everything from the start up to `mid` is also `< target` (the array is sorted), so none of it can be the answer. If `nums[mid] > target`, everything from `mid` to the end is too big. **One comparison removes half of the candidates.**",
    leads: "Keep a window `[lo, hi]` of positions that could still hold `target`. Probe its middle, discard the half that cannot contain `target`, and repeat. The window halves every time, so after about $\\log_2 n$ probes it is empty or we have found the answer.",
  },

  flow: [
    "Scan from the left, checking each element against `target`.",
    "It tries every position, so it can never miss the answer.",
    "Up to `n` comparisons: it ignores that the array is sorted.",
    "In a sorted array, comparing with the middle rules out half of the elements at once.",
    "Keep a window `[lo, hi]` of possible positions and halve it with every probe.",
    "At most $\\lfloor \\log_2 n \\rfloor + 1$ probes: $O(\\log n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force (linear scan):** walk through the array from index `0` and return the first `i` with `nums[i] == target`. If the loop ends, return `-1`.",
    why: "It does not use the sorted order at all. In the worst case it compares `target` with all `n` elements, so it is $\\Theta(n)$. Every comparison only rules out **one** element, while a smarter comparison can rule out **half**.",
    time: "O(n)", space: "O(1)",
    measure: { fTex: "n", f: (n) => n },
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
    why: "The array is **sorted**, so the elements form a monotonic sequence: once an element is bigger than `target`, every element after it is bigger too. That monotonic structure is exactly what lets a single probe decide which *half* of the remaining range to keep.",
    recognize: [
      "The input is **sorted** (or *becomes* sorted by a simple idea, such as a rotated sorted array).",
      "The statement asks for $O(\\log n)$, or $n$ is huge (about $10^9$ or more) so an $O(n)$ scan is too slow.",
      "You can write a yes/no test that is **monotonic**: false, false, false, **true**, true, true (\"is this value already big enough?\").",
      "You are asked for the *first* or *last* position satisfying something, or the *smallest* value that works.",
    ],
  },

  optimal: {
    idea: "Maintain a **search space** `[lo, hi]`: the positions that could still hold `target`. Probe the middle position `mid`. Three outcomes: `nums[mid]` equals `target` (done), is smaller (the answer, if any, is in `(mid, hi]`, so `lo = mid + 1`), or is larger (the answer is in `[lo, mid)`, so `hi = mid - 1`). When `lo > hi` the search space is empty and `target` is absent.",
    steps: [
      "Set `lo = 0` and `hi = n − 1`: at the start every position is possible.",
      "While `lo <= hi` (the search space is not empty), compute `mid = lo + (hi − lo) / 2`.",
      "If `nums[mid] == target`, **return `mid`**.",
      "If `nums[mid] < target`, the answer can only be to the right: set `lo = mid + 1`.",
      "Otherwise `nums[mid] > target`, so the answer can only be to the left: set `hi = mid − 1`.",
      "If the loop ends, the search space is empty, so **return `−1`**.",
    ],
    invariant: "**If `target` is in the array, its index is always inside `[lo, hi]`.** Every update removes only positions that provably cannot hold `target` (they are on the wrong side of an element that is smaller or larger than it), so this stays true at every step.",
    correct: "*Termination:* each iteration removes at least `mid` from the window (`lo = mid + 1` or `hi = mid − 1`), so the window strictly shrinks and the loop ends. *Correctness:* by the invariant, if the loop exits because `lo > hi`, the window is empty, so `target` is not in the array. If we return early, `nums[mid] == target` by the explicit check. The `+1` and `−1` are essential: `mid` has already been tested, so excluding it is safe, and keeping it could loop forever.",
  },

  cpp: `class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = (int)nums.size() - 1;      // window = [lo, hi] //@init
        while (lo <= hi) {                          //@loop
            int mid = lo + (hi - lo) / 2;           // (lo+hi)/2 can overflow //@mid
            if (nums[mid] == target) return mid;    //@found
            if (nums[mid] < target) lo = mid + 1;   // go right //@right
            else hi = mid - 1;                      // go left //@left
        }
        return -1;                                  // window is empty //@none
    }
};`,
  js: `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;               // window = [lo, hi] //@init
  while (lo <= hi) {                              //@loop
    const mid = lo + Math.floor((hi - lo) / 2);   // same formula //@mid
    if (nums[mid] === target) return mid;         //@found
    if (nums[mid] < target) lo = mid + 1;         // go right //@right
    else hi = mid - 1;                            // go left //@left
  }
  return -1;                                      // window is empty //@none
}`,

  tests: [
    { name: "Example 1: target present", kind: "normal", input: { nums: [-1, 0, 3, 5, 9, 12], target: 9 } },
    { name: "Example 2: target absent", kind: "normal", input: { nums: [-1, 0, 3, 5, 9, 12], target: 2 } },
    { name: "Found on the very first probe", kind: "normal", input: { nums: [1, 3, 5, 7, 9], target: 5 }, why: "When the target happens to be the middle element, one probe is enough. This is the *best case* of binary search: $O(1)$." },
    { name: "Target is the first element", kind: "edge", input: { nums: [2, 4, 6, 8, 10, 12, 14], target: 2 }, why: "The target sits at the far left, so the search must walk `hi` down all the way to index `0`. If your loop used `lo < hi` instead of `lo <= hi`, or your update skipped index `0`, you would miss it." },
    { name: "Target is the last element", kind: "edge", input: { nums: [2, 4, 6, 8, 10, 12, 14], target: 14 }, why: "The mirror image: `lo` has to climb to the last index. A wrong `mid` formula or a missing `+ 1` shows up as an infinite loop or a missed answer here." },
    { name: "Target smaller than everything", kind: "edge", input: { nums: [10, 20, 30, 40], target: 5 }, why: "Every comparison says \"go left\", so `hi` falls to `−1`. The loop must stop because `lo > hi` instead of reading `nums[-1]`." },
    { name: "Target larger than everything", kind: "edge", input: { nums: [10, 20, 30, 40], target: 99 }, why: "Every comparison says \"go right\", so `lo` runs past the last index (`lo = n`). The condition `lo <= hi` must stop the loop before `nums[n]` is read." },
    { name: "Single element, found", kind: "corner", input: { nums: [7], target: 7 }, why: "With one element, `lo = hi = mid = 0`. A loop written as `while (lo < hi)` would never run and would wrongly return `−1`." },
    { name: "Single element, absent", kind: "corner", input: { nums: [7], target: 3 }, why: "One probe, then `hi = mid − 1 = −1`, so the window is empty. This is the smallest case that forces the \"not found\" exit." },
    { name: "Two elements", kind: "corner", input: { nums: [1, 2], target: 2 }, why: "Here `mid = lo + (hi − lo) / 2 = 0`, rounded **down**, so `mid` is the left element. If the code needed the right one, a `+ 1` update is what saves it: without it, `lo = mid` would loop forever." },
    { name: "Empty array (outside the constraints)", kind: "corner", input: { nums: [], target: 1 }, why: "`hi = n − 1 = −1`, so `lo <= hi` is false immediately and we return `−1` without touching the array. (The official constraints promise `n ≥ 1`, but robust code still behaves.)" },
  ],

  trace(input, T) {
    const { nums, target } = input, n = nums.length;
    let lo = 0, hi = n - 1;
    const sizes = [n];
    let whyR = false, whyL = false;
    const S = (o = {}) => () => ({ arr: nums, lo: o.lo !== undefined ? o.lo : lo, hi: o.hi !== undefined ? o.hi : hi, mid: o.mid, target, sizes: sizes.slice(), n, found: o.found, hl: o.hl });
    T.step("init", { vars: { lo, hi, target }, state: S(), phase: "Halve the search space", say: `The target **${target}** can be anywhere in positions \`[${lo}, ${hi}]\` — that is all ${n} element${n === 1 ? "" : "s"}. This window is the **search space**.`, op: `lo = 0,  hi = n − 1 = ${hi}`, act: "START" });
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      T.step("mid", { vars: { lo, hi, mid, target }, state: S({ mid }), say: `Probe the middle of the window: \`mid = lo + (hi − lo) / 2 = ${lo} + (${hi} − ${lo}) / 2 = ${mid}\`. Only one element, \`nums[${mid}] = ${nums[mid]}\`, is read.`, op: `mid = ${lo} + (${hi} − ${lo}) / 2 = ${mid}`, act: "PROBE" });
      if (nums[mid] === target) {
        T.step("found", { vars: { lo, hi, mid, target }, state: S({ mid, found: true }), say: `\`nums[${mid}] = ${nums[mid]}\` equals the target **${target}**. Return index **${mid}**.`, op: `nums[${mid}] = ${nums[mid]} == ${target}`, act: "FOUND", why: { title: "How many probes did this take?", text: `${sizes.length} probe${sizes.length === 1 ? "" : "s"} for ${n} elements. A linear scan could need up to ${n}.` } });
        T.result(mid);
        return;
      }
      T.step("found", { vars: { lo, hi, mid, target }, state: S({ mid }), say: `Is \`nums[${mid}] = ${nums[mid]}\` equal to ${target}? No. It is ${nums[mid] < target ? "smaller" : "larger"}.`, op: `nums[${mid}] = ${nums[mid]} ${nums[mid] < target ? "<" : ">"} target = ${target}`, act: "COMPARE" });
      if (nums[mid] < target) {
        const hl = {}; for (let i = lo; i <= mid; i++) hl[i] = "bad";
        T.step("right", { vars: { lo, hi, mid, target }, state: S({ mid, hl }), say: `${nums[mid]} < ${target}, so the target must be **to the right**. The array is sorted, so every element from index ${lo} to ${mid} is ≤ ${nums[mid]} and cannot equal ${target}: discard them.`, op: `${nums[mid]} < ${target}  ⇒  lo = mid + 1 = ${mid + 1}`, act: "MOVE_RIGHT", why: whyR ? null : { title: "Why can the whole left half be discarded?", text: `\`nums[mid] < target\` and the array is sorted, so every element at or before \`mid\` is also **smaller than the target**. None of them can be the answer. \`mid\` itself was already tested, so we skip it with \`+ 1\`.` } });
        whyR = true;
        lo = mid + 1;
      } else {
        const hl = {}; for (let i = mid; i <= hi; i++) hl[i] = "bad";
        T.step("left", { vars: { lo, hi, mid, target }, state: S({ mid, hl }), say: `${nums[mid]} > ${target}, so the target must be **to the left**. Every element from index ${mid} to ${hi} is ≥ ${nums[mid]} and cannot equal ${target}: discard them.`, op: `${nums[mid]} > ${target}  ⇒  hi = mid − 1 = ${mid - 1}`, act: "MOVE_LEFT", why: whyL ? null : { title: "Why can the whole right half be discarded?", text: `\`nums[mid] > target\` and the array is sorted, so every element at or after \`mid\` is also **larger than the target**. None of them can be the answer.` } });
        whyL = true;
        hi = mid - 1;
      }
      sizes.push(Math.max(0, hi - lo + 1));
      T.step("loop", { vars: { lo, hi, target }, state: S(), say: lo <= hi ? `The search space is now \`[${lo}, ${hi}]\`: **${hi - lo + 1}** element${hi - lo === 0 ? "" : "s"} left, about half of before.` : `The search space is now empty (\`lo = ${lo} > hi = ${hi}\`). There is nowhere left for the target to hide.`, op: `lo <= hi ?  ${lo} <= ${hi}  →  ${lo <= hi}`, act: lo <= hi ? "SHRINK" : "EMPTY" });
    }
    T.step("none", { vars: { lo, hi, target }, state: S(), say: `\`lo > hi\`, so no position can hold ${target}. Return **−1**.`, op: "return −1", act: "NOT_FOUND" });
    T.result(-1);
  },
  fuzz(rnd) {
    const n = Math.floor(rnd() * 14);
    const set = new Set(); while (set.size < n) set.add(Math.floor(rnd() * 61) - 30);
    const nums = [...set].sort((a, b) => a - b);
    const target = rnd() < 0.5 && n ? nums[Math.floor(rnd() * n)] : Math.floor(rnd() * 71) - 35;
    return { nums, target };
  },
  gen(n) { return { nums: Array.from({ length: n }, (_, i) => i * 2), target: n * 2 + 1 }; },

  complexity: {
    time: {
      tex: "O(\\log n)", title: "the search space halves every probe", short: "at most ⌊log₂ n⌋ + 1 probes, each a constant amount of work",
      derive: [
        "n_0 = n, \\qquad n_{k} \\le \\left\\lfloor \\frac{n_{k-1}}{2} \\right\\rfloor \\;\\Rightarrow\\; n_k \\le \\frac{n}{2^k} || after each probe at least half of the window is discarded (the probe itself is discarded too)",
        "\\text{the loop stops when } n_k < 1 \\iff \\frac{n}{2^k} < 1 \\iff 2^k > n || an empty window means the loop condition `lo <= hi` is false",
        "k > \\log_2 n \\;\\Rightarrow\\; \\text{probes} \\le \\lfloor \\log_2 n \\rfloor + 1 || the smallest whole number of halvings that empties the window",
        "T(n) = c\\,(\\lfloor \\log_2 n \\rfloor + 1) || each probe does a constant amount of work (one subtraction, one comparison, one assignment)",
        "!T(n) = O(\\log n) || drop the constant",
      ],
      where: "Each loop iteration is $O(1)$ and the loop runs at most $\\lfloor\\log_2 n\\rfloor + 1$ times. Watch the *bars* in the lab: every probe the search space bar is half as long as the one before, so the number of bars is the number of probes. For $n = 10^9$ that is only **30** probes. For $n = 10^{18}$ it is 60.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "only `lo`, `hi` and `mid`",
      derive: [
        "S(n) = \\underbrace{|\\text{lo}| + |\\text{hi}| + |\\text{mid}|}_{3 \\text{ integers}} || the loop only keeps the window boundaries and the middle",
        "S(n) = 3c || it does not depend on how many elements the array has",
        "!S(n) = O(1) || constant extra space (the recursive version would use $O(\\log n)$ stack frames)",
      ],
      where: "The iterative version never copies or stores part of the array: the \"window\" is just two numbers. A *recursive* binary search would add one stack frame per halving, i.e. $O(\\log n)$ extra space, which is a good reason to prefer the loop.",
    },
    limit: "Any algorithm that finds a value in a sorted array using only comparisons needs $\\Omega(\\log n)$ comparisons: each comparison has two outcomes, and to tell apart $n + 1$ possible answers you need at least $\\log_2(n+1)$ yes/no questions. So $O(\\log n)$ is **optimal**, not just good.",
    measure: { label: "n = nums.length", fTex: "\\lfloor \\log_2 n \\rfloor + 1", f: (n) => Math.floor(Math.log2(n)) + 1, sizes: [16, 64, 256, 1024, 4096, 16384], growth: "logarithmic", reading: "Making the array **4× longer** adds only **two** more probes: this is what logarithmic growth looks like." },
  },

  mistakes: [
    { title: "Computing the middle as `(lo + hi) / 2`", what: "Writing `int mid = (lo + hi) / 2;`.", why: "It is the first formula everyone writes and it works on small examples.", breaks: "When `lo + hi` exceeds the largest `int` (about 2.1 billion), the sum **overflows** to a negative number and `mid` becomes a nonsense index. This was a real bug that sat in the Java standard library for about nine years.", avoid: "Use `mid = lo + (hi − lo) / 2`. The subtraction `hi − lo` can never overflow." },
    { title: "Using `while (lo < hi)` with `hi = n − 1`", what: "A loop condition that stops when `lo == hi`.", why: "It is the right condition for a *different* style of binary search (half-open window `[lo, hi)`), and the two styles get mixed up.", breaks: "When the search space has exactly one element left (`lo == hi`), the loop exits **without testing it**, so a one-element array always returns `−1`.", avoid: "Pick one style and keep it consistent. With a closed window `[lo, hi]` the condition is `lo <= hi` and the updates are `mid + 1` / `mid − 1`." },
    { title: "Updating with `lo = mid` or `hi = mid`", what: "Forgetting the `+ 1` / `− 1` when moving a boundary.", why: "`mid` feels like part of the remaining range, so it seems natural to keep it.", breaks: "With `lo = 0, hi = 1` and `mid = 0`, `lo = mid` leaves the window unchanged: an **infinite loop**.", avoid: "`mid` has just been tested, so it can safely be excluded: `lo = mid + 1` or `hi = mid − 1`. The window then shrinks by at least one every time." },
    { title: "Searching an array that is not sorted", what: "Calling binary search on data without checking the order.", why: "The code *looks* right and runs without errors.", breaks: "The key step (\"everything left of `mid` is smaller\") is false, so the algorithm discards the wrong half and returns `−1` or a wrong index with no warning.", avoid: "Binary search needs a monotonic order. Check the precondition, or sort first (at a cost of $O(n \\log n)$)." },
    { title: "Moving the boundary in the wrong direction", what: "Doing `lo = mid + 1` when `nums[mid] > target`.", why: "A swapped `<` / `>` in the comparison.", breaks: "The window moves **away** from the target. On sorted data this makes the search miss every element except lucky hits.", avoid: "Say it out loud: *\"mid is too small, so I need bigger numbers, so go right.\"*" },
  ],

  followUps: [
    {
      q: "The array may contain **duplicates**. Return the index of the **first** occurrence of `target`.",
      a: "When you find `target`, do **not** stop. Remember the index as a candidate and keep searching to the **left** (`hi = mid − 1`) for an earlier one. This is the *lower bound* pattern and is the basis of many harder problems: \"first position where the condition becomes true\".",
      cpp: `int firstOccurrence(vector<int>& nums, int target) {
    int lo = 0, hi = (int)nums.size() - 1, ans = -1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) { ans = mid; hi = mid - 1; }   // keep looking left
        else if (nums[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return ans;
}`,
      js: `function firstOccurrence(nums, target) {
  let lo = 0, hi = nums.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] === target) { ans = mid; hi = mid - 1; }   // keep looking left
    else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return ans;
}`,
      time: "O(\\log n)", space: "O(1)",
    },
    {
      q: "Write the **recursive** version. What does it cost in space?",
      a: "Pass the window as parameters and recurse on the half that can still contain the target. The logic is identical, but every halving adds a **stack frame**, so the extra space is $O(\\log n)$ instead of $O(1)$. In an interview, mention that the loop is preferred for that reason.",
      cpp: `int go(vector<int>& a, int t, int lo, int hi) {
    if (lo > hi) return -1;
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == t) return mid;
    return a[mid] < t ? go(a, t, mid + 1, hi) : go(a, t, lo, mid - 1);
}`,
      js: `function go(a, t, lo, hi) {
  if (lo > hi) return -1;
  const mid = lo + Math.floor((hi - lo) / 2);
  if (a[mid] === t) return mid;
  return a[mid] < t ? go(a, t, mid + 1, hi) : go(a, t, lo, mid - 1);
}`,
      time: "O(\\log n)", space: "O(\\log n)",
    },
    {
      q: "The array is sorted but its **length is unknown** (you can only read `arr[i]`, and it is huge). How do you search it?",
      a: "Use **exponential search**: probe positions `1, 2, 4, 8, …` until `arr[i] ≥ target` (or you run out of bounds), which takes $O(\\log p)$ steps where $p$ is the position of the target. That gives you a window `[i/2, i]` of size about $p$, and you run an ordinary binary search inside it for another $O(\\log p)$. Total: $O(\\log p)$, which depends on where the target is, not on the (unknown) length.",
      time: "O(\\log p)", space: "O(1)",
    },
    {
      q: "What if you are not searching for a value but for the **smallest `x` for which a condition is true** (for example the integer square root of a number)?",
      a: "That is **binary search on the answer**. As long as the condition is *monotonic* (false, false, …, true, true), you can binary search the range of possible answers: probe `mid`, ask *\"is the condition true at `mid`?\"*, keep the left half if yes (the answer is `mid` or smaller) and the right half if no. The array does not need to exist: the condition plays the role of the comparison.",
      time: "O(\\log R \\cdot c)", space: "O(1)",
    },
  ],

  related: [
    { id: "find-minimum-in-rotated-sorted-array", why: "The array is sorted but **rotated**: you can no longer compare with the target, but you can still compare with the last element to decide which half holds the minimum." },
    { id: "search-in-rotated-sorted-array", why: "Same probing, but now you first find which half is properly sorted, then decide whether the target is inside it." },
    { id: "longest-increasing-subsequence", why: "The $O(n \\log n)$ solution keeps a sorted array of tails and uses binary search to find where each new number belongs." },
  ],
  patternNote: "**The Binary Search pattern** is about a *monotonic* structure. Whenever a yes/no question flips exactly once as you walk through the candidates (sorted array, \"big enough\" threshold, feasible capacity), one probe decides which half to keep, and $n$ candidates collapse to one in about $\\log_2 n$ steps. Spotting the monotonic question is the real skill; the loop is always the same shape.",
  takeaways: [
    "A sorted array lets **one comparison discard half** of the remaining candidates.",
    "Keep a closed window `[lo, hi]` and the invariant *\"if the target exists, it is inside the window\"*.",
    "Use `mid = lo + (hi − lo) / 2`, loop while `lo <= hi`, and move with `mid + 1` / `mid − 1`.",
    "At most $\\lfloor \\log_2 n \\rfloor + 1$ probes: $O(\\log n)$ time, $O(1)$ space, and this is optimal for comparison-based search.",
    "Recognise it by: sorted or monotonic data, a huge $n$, or *\"find the first position where …\"*.",
  ],
});
