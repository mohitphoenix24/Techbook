SHEETS.define({
  id: "counting-bits",
  viz: "bit",
  io: { fn: "countBits", params: [["n", "int"]], ret: "int[]" },

  statement: `Given an integer \`n\`, return an array \`ans\` of length \`n + 1\` such that for each \`i\` (\`0 ≤ i ≤ n\`), \`ans[i]\` is the **number of \`1\` bits** in the binary representation of \`i\`.`,
  examples: [
    { input: "n = 2", output: "[0, 1, 1]", explain: "`0 → 0`, `1 → 1`, `10 → 1`." },
    { input: "n = 5", output: "[0, 1, 1, 2, 1, 2]", explain: "`0 → 0`, `1 → 1`, `10 → 1`, `11 → 2`, `100 → 1`, `101 → 2`." },
  ],
  constraints: ["$0 \\le n \\le 10^5$"],
  check(input) { return input.n < 0 || input.n > 60 ? "for the animation, n must be between 0 and 60 (the real problem allows up to 100000)" : null; },

  intuition: {
    find: "For **every** number from 0 up to `n`, how many bits are set. So an array of `n + 1` answers.",
    beginner: "For each `i`, count its set bits with the Kernighan loop from the previous lesson (or by checking all bits). Store the count.",
    works: "Each `ans[i]` is computed exactly by definition, so the array is correct.",
    slow: "Each count costs up to $O(\\log n)$ (the number of bits of `i`), so the total is $O(n \\log n)$. It works, but the problem hints at a linear solution.",
    repeat: "Every `i` is processed on its own, from scratch, yet numbers are **related**: `i` and `i >> 1` (the same number with the last bit chopped off) have almost the same bits. We are recounting bits we have already counted for the smaller number.",
    remember: "Remember the answers we have already computed, in the answer array itself. For `i`, the number `i >> 1` is **smaller**, so its answer is already there.",
    observation: "`i` = (`i >> 1`) followed by one more bit, the last bit `i & 1`. So the number of ones in `i` is the number of ones in `i >> 1` plus that last bit: `ans[i] = ans[i >> 1] + (i & 1)`. Each answer is built from an earlier answer in $O(1)$.",
    leads: "Fill the array from `1` to `n`: `ans[i] = ans[i >> 1] + (i & 1)`, starting from `ans[0] = 0`. One pass, constant work per element: $O(n)$ time.",
  },

  flow: [
    "Count the set bits of each `i` separately.",
    "Every entry is computed straight from the definition.",
    "$O(\\log n)$ per number, $O(n \\log n)$ overall, recounting shared structure.",
    "`i` is `i >> 1` plus one more (the last) bit, and `i >> 1 < i` is already solved.",
    "`ans[i] = ans[i >> 1] + (i & 1)`: reuse the earlier answer.",
    "One pass filling the array: $O(n)$ time, no extra space beyond the output.",
  ],

  brute: {
    idea: "**Brute force:** for each `i` from `0` to `n`, count its set bits independently (loop over its bits, or use Kernighan's trick) and store the count in `ans[i]`.",
    why: "Counting the bits of `i` takes $O(\\log i)$ steps, so the total is $\\sum_{i=0}^{n} \\log i = \\Theta(n \\log n)$. The work for `i` is independent of the work for `i >> 1`, although the two share all but their last bit.",
    time: "O(n log n)", space: "O(1)",
    measure: { fTex: "n \\log_2 n", f: (n) => n * Math.log2(Math.max(2, n)), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    vector<int> countBits(int n) {
        vector<int> ans(n + 1, 0);
        for (int i = 0; i <= n; i++) {
            int c = 0;
            for (int x = i; x; x &= x - 1) c++;     // Kernighan
            ans[i] = c;
        }
        return ans;
    }
};`,
    js: `function countBits(n) {
  const ans = new Array(n + 1).fill(0);
  for (let i = 0; i <= n; i++) {
    let c = 0;
    for (let x = i; x; x &= x - 1) c++;           // Kernighan
    ans[i] = c;
  }
  return ans;
}`,
  },

  pattern: {
    name: "Dynamic Programming (on bits)",
    why: "The answer for `i` can be written using the answer for a **smaller** number (`i >> 1`), which is already known: that is a DP recurrence. The structure of binary numbers (each number is a shorter number plus one bit) provides the subproblem relation for free.",
    recognize: [
      "You must compute a property **for every number from 0 to n**, not just one.",
      "The property of `i` relates to the property of `i >> 1`, `i & (i − 1)`, or `i − (highest power of two ≤ i)`.",
      "The brute force recomputes a property from scratch for each number.",
      "The output array itself can serve as the DP table.",
    ],
  },

  optimal: {
    idea: "Use the array being built as a DP table. For `i ≥ 1`, `ans[i] = ans[i >> 1] + (i & 1)`: shifting right drops the last bit (which is the number `i >> 1`, already solved) and `(i & 1)` adds that dropped bit back as 0 or 1.",
    steps: [
      "Create `ans` of size `n + 1`, with `ans[0] = 0`.",
      "For `i` from `1` to `n`:",
      "set `ans[i] = ans[i >> 1] + (i & 1)`.",
      "Return `ans`.",
    ],
    invariant: "**Before computing `ans[i]`, all entries `ans[0..i−1]` are the correct popcounts.** Since `i >> 1 < i` for `i ≥ 1`, the entry we read is final.",
    correct: "Write `i` in binary as the number `i >> 1` followed by one extra bit `b = i & 1`. The ones of `i` are exactly the ones of `i >> 1` plus `b`. So `popcount(i) = popcount(i >> 1) + (i & 1)`. By induction on `i`: `popcount(0) = 0` is stored, and for `i ≥ 1` the value `ans[i >> 1]` is already correct (it is an earlier index), so `ans[i]` is correct.",
  },

  cpp: `class Solution {
public:
    vector<int> countBits(int n) {
        vector<int> ans(n + 1, 0);                  // ans[0] = 0 //@init
        for (int i = 1; i <= n; i++)                //@loop
            ans[i] = ans[i >> 1] + (i & 1);         // reuse the smaller answer //@fill
        return ans;                                 //@ret
    }
};`,
  js: `function countBits(n) {
  const ans = new Array(n + 1).fill(0);             // ans[0] = 0 //@init
  for (let i = 1; i <= n; i++)                      //@loop
    ans[i] = ans[i >> 1] + (i & 1);                 // reuse the smaller answer //@fill
  return ans;                                       //@ret
}`,

  tests: [
    { name: "Example 1: n = 2", kind: "normal", input: { n: 2 } },
    { name: "Example 2: n = 5", kind: "normal", input: { n: 5 } },
    { name: "n = 10", kind: "normal", input: { n: 10 } },
    { name: "n = 0", kind: "edge", input: { n: 0 }, why: "The array has exactly one element, `ans[0] = 0`. The loop starts at `i = 1`, so it never runs. A version that starts the loop at `0` would read `ans[0 >> 1] = ans[0]` before it is set, which is still correct, but it signals a misunderstanding of the base case." },
    { name: "n = 1", kind: "edge", input: { n: 1 }, why: "One iteration: `ans[1] = ans[0] + 1 = 1`. It confirms that the base `ans[0] = 0` really is the seed of the recurrence." },
    { name: "Crossing a power of two (n = 8)", kind: "edge", input: { n: 8 }, why: "At `i = 8 = 1000₂` the count drops back to 1 after `7 = 111₂` had 3. The recurrence handles it: `ans[8] = ans[4] + 0 = 1`. Powers of two are where the pattern \"restarts\"." },
    { name: "All ones at the end (n = 31)", kind: "corner", input: { n: 31 }, why: "`31 = 11111₂` has 5 set bits, the maximum for 5-bit numbers. It checks that `ans[i >> 1]` is read from the *table*, not recomputed, and that counts grow by at most 1 per extra bit." },
    { name: "A larger range (n = 33)", kind: "corner", input: { n: 33 }, why: "Passing `32 = 100000₂` shows the pattern restarting at the next power of two, with the second half of each block equal to the first half plus 1." },
  ],

  trace(input, T) {
    const n = input.n;
    const ans = Array.from({ length: n + 1 }, () => null);
    ans[0] = 0;
    const W = n < 16 ? 4 : n < 64 ? 6 : 8;
    let whyRec = false, whyPow = false;
    const bitsOf = (v) => v.toString(2).padStart(W, "0");
    const S = (i, o = {}) => () => {
      const half = i != null ? i >> 1 : null;
      const rows = i != null ? [
        { label: `i = ${i}`, value: i, width: W, hl: { 0: "cur" }, note: "last bit (i & 1) = " + (i & 1) },
        { label: `i >> 1 = ${half}`, value: half, width: W, hl: {}, cls: "ok", note: `already solved: ans[${half}] = ${ans[half]}` },
      ] : [{ label: "start", value: 0, width: W, hl: {} }];
      const arrHl = {};
      for (let k = 0; k <= n; k++) if (ans[k] !== null) arrHl[k] = "ok";
      if (i != null) { arrHl[half] = "cmp"; arrHl[i] = o.filled ? "hit" : "cur"; }
      return { rows, width: W, label: i != null ? `${i} = ${bitsOf(i)}₂  =  (${bitsOf(half)}₂) followed by the bit ${i & 1}` : "ans[0] = 0 (no bits set)", arr: ans.map((v) => (v === null ? "·" : v)), arrLabel: "ans  (popcount of each index)", arrHl, arrPtr: i != null ? { i } : {}, arrArcs: i != null ? [{ from: half, to: i, cls: "cmp", label: `+${i & 1}` }] : [], note: o.note };
    };
    T.step("init", { vars: { n, "ans[0]": 0 }, state: S(null), phase: "Fill the table, reusing earlier answers", say: "`ans[0] = 0`: the number 0 has no set bits. This is the seed. Every later entry is built from an entry that was computed **earlier**.", op: "ans = [0, ?, ?, …]", act: "START" });
    for (let i = 1; i <= n; i++) {
      const half = i >> 1, bit = i & 1;
      const isPow = (i & (i - 1)) === 0;
      ans[i] = ans[half] + bit;
      T.step("fill", { vars: { i, "i >> 1": half, "i & 1": bit, [`ans[${half}]`]: ans[half], "ans[i]": ans[i] }, state: S(i, { filled: true }), say: `\`${i}\` = \`${half}\` with one more bit on the right (**${bit}**). The number ${half} has **${ans[half]}** set bit${ans[half] === 1 ? "" : "s"} (already in the table), so ${i} has ${ans[half]} + ${bit} = **${ans[i]}**.`, op: `ans[${i}] = ans[${half}] + (${i} & 1) = ${ans[half]} + ${bit} = ${ans[i]}`, act: bit ? "ADD_ONE" : "COPY",
        why: !whyRec ? { title: "Why is i >> 1 enough?", text: "`i >> 1` is `i` with its last bit chopped off, so it is a smaller number, already solved. All the other bits are shared, so we only need to add the one bit that was chopped off: `i & 1`." } : (isPow && i > 2 && !whyPow ? { title: "Why does the count drop at a power of two?", text: `${i} is a power of two, so its binary form is a single 1 followed by zeros: popcount 1. The formula gives ans[${half}] + 0, and ${half} is itself a power of two with popcount 1, so it stays correct.` } : null) });
      whyRec = true; if (isPow && i > 2) whyPow = true;
    }
    T.step("ret", { vars: { n }, state: () => ({ rows: [{ label: "done", value: n, width: W, hl: {} }], width: W, label: `n = ${n}`, arr: ans.slice(), arrLabel: "ans  (popcount of each index)", arrHl: Object.fromEntries(ans.map((_, k) => [k, "ok"])), note: "every entry was computed exactly once" }), say: `The table is complete: **[${ans.join(", ")}]**. Every entry was computed from an earlier one in constant time.`, op: "return ans", act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) { return { n: Math.floor(rnd() * 40) }; },
  gen(n) { return { n }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one constant-time step per number", short: "n iterations, each: one shift, one AND, one add, one read",
      derive: [
        "T(n) = c_0 + \\sum_{i=1}^{n} \\big( c_{\\gg} + c_{\\&} + c_{+} + c_{\\text{read}} \\big) || each entry costs four constant-time operations",
        "T(n) = c_0 + n\\,c || the four constants merge into one",
        "!T(n) = O(n) || versus $\\sum_{i=1}^{n} \\log_2 i = \\Theta(n \\log n)$ for counting each number separately",
      ],
      where: "The saving comes from reuse: the brute force spends $\\log_2 i$ steps on `i`, the DP spends 1 step (reading `ans[i >> 1]`). The sum $\\sum \\log_2 i \\approx n \\log_2 n - 1.44n$ is replaced by a plain $n$.",
    },
    space: {
      tex: "O(1)", title: "no extra memory besides the required output", short: "the answer array doubles as the DP table",
      derive: [
        "S_{\\text{total}} = (n+1)\\, s_{\\text{int}} || the output array, which is required anyway",
        "S_{\\text{extra}} = |i| = c || a single loop variable",
        "!S_{\\text{extra}} = O(1) || the output is not counted as extra space",
      ],
      where: "Many DP solutions need a separate table. Here `ans` plays both roles, so nothing else is allocated.",
    },
    limit: "The output has $n + 1$ entries, so $\\Omega(n)$ time is needed just to write it. The DP matches that bound.",
    measure: { label: "n = the largest number", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Recomputing popcount for each number", what: "Calling a bit-counting function inside the loop.", why: "It is the direct translation of the statement.", breaks: "It works but costs $O(n \\log n)$; the problem expects $O(n)$.", avoid: "Reuse earlier entries: `ans[i] = ans[i >> 1] + (i & 1)`." },
    { title: "Using `i / 2` and `i % 2` with signed negatives in mind", what: "Worrying about signs, or mixing `>>` with `/` on negative numbers.", why: "Division rounds toward zero for negatives; shifts round down.", breaks: "Not an issue for non-negative `i`, but copying the code to negative inputs would break it.", avoid: "Here `i ≥ 0`, so `>>` and `/ 2` agree; stay with shifts when the topic is bits." },
    { title: "Starting the loop at 0 or reading an unset entry", what: "Reading `ans[i >> 1]` for an index that has not been filled yet.", why: "Wrong direction of dependency, e.g. using `ans[i << 1]` or `ans[i + 1]`.", breaks: "You read a zero from the freshly allocated array and get wrong answers.", avoid: "The recurrence must only look at **smaller** indices (`i >> 1`, `i & (i − 1)`)." },
    { title: "Allocating `n` instead of `n + 1` entries", what: "`vector<int> ans(n);`", why: "Forgetting that 0 is included.", breaks: "`ans[n]` is out of bounds: undefined behaviour in C++.", avoid: "The output has `n + 1` entries (`0 … n`)." },
    { title: "Forgetting `(i & 1)`", what: "`ans[i] = ans[i >> 1] + 1;`", why: "Assuming the dropped bit is always 1.", breaks: "Even numbers have a last bit of 0, so their count must not increase: every even entry would be one too large.", avoid: "Add the actual last bit: `i & 1`." },
  ],

  followUps: [
    {
      q: "Another recurrence: use `i & (i − 1)`. How does it work?",
      a: "`i & (i − 1)` clears the lowest set bit, giving a **smaller** number with exactly one fewer set bit. So `ans[i] = ans[i & (i − 1)] + 1` for `i ≥ 1`. Both recurrences are $O(n)$; this one is the Kernighan trick from the previous lesson turned into a DP.",
      cpp: `vector<int> countBits2(int n) {
    vector<int> ans(n + 1, 0);
    for (int i = 1; i <= n; i++) ans[i] = ans[i & (i - 1)] + 1;
    return ans;
}`,
      js: `function countBits2(n) {
  const ans = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) ans[i] = ans[i & (i - 1)] + 1;
  return ans;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "A third view: use the highest power of two.",
      a: "If `h` is the largest power of two with `h ≤ i`, then `i = h + (i − h)` and the bit `h` is not set in `i − h` (it is smaller than `h`), so `ans[i] = 1 + ans[i − h]`. Keep `h` and double it whenever `i` reaches the next power of two. It exposes the repeating structure: the counts for `[h, 2h)` are the counts for `[0, h)` plus 1.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Why is the pattern 0 1 1 2 1 2 2 3 1 2 2 3 2 3 3 4 … so regular?",
      a: "The block `[2^k, 2^{k+1})` has the same counts as the block `[0, 2^k)` **plus one** (each number in the block is the same number as in the earlier block with a leading 1 bit). So the sequence is built by repeatedly appending a copy of itself with every entry increased by 1. This is the *Thue–Morse*-like structure, and it is exactly what the DP recurrence computes.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the numbers `0 … n` **sorted by the number of set bits** (ties by value).",
      a: "Build `ans` with the DP above, then **counting sort** by value of `ans[i]` (the counts are at most $\\log_2 n$, so there are few buckets): $O(n)$ time, $O(n)$ extra space. A comparison sort would be $O(n \\log n)$.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "number-of-1-bits", why: "The single-number version: the popcount of one value, with Kernighan's trick." },
    { id: "climbing-stairs", why: "Another 1D DP where each entry is computed from earlier entries of the same array." },
    { id: "house-robber", why: "A 1D DP that fills a table from left to right using the previous cells." },
    { id: "missing-number", why: "Bit identities again, this time XOR's cancellation property." },
  ],
  patternNote: "**DP on bits** exploits that every number is a shorter number plus one bit (`i = (i >> 1) · 2 + (i & 1)`), or a smaller number with its lowest bit cleared (`i & (i − 1)`). Whenever you must compute a bit property for *all* numbers up to `n`, look for a smaller number that explains `i`, and store the answers in the output array.",
  takeaways: [
    "`ans[i] = ans[i >> 1] + (i & 1)`: the answer for `i` is the answer for `i` without its last bit, plus that bit.",
    "Fill from `1` to `n`; `ans[0] = 0` is the seed; every dependency is on a **smaller** index.",
    "Time $O(n)$ (vs $O(n \\log n)$ recounting), extra space $O(1)$: the output array is the DP table.",
    "Alternative recurrences: `ans[i & (i − 1)] + 1`, or `ans[i − highestPowerOfTwo] + 1`.",
    "Allocate `n + 1` entries and add `i & 1`, not a constant `1`.",
  ],
});
