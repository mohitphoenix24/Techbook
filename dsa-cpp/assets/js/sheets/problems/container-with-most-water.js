SHEETS.define({
  id: "container-with-most-water",
  viz: "twopointer",
  io: { fn: "maxArea", params: [["height", "int[]"]], ret: "int" },

  statement: `You are given an integer array \`height\` of length \`n\`. There are \`n\` vertical lines; line \`i\` goes from \`(i, 0)\` to \`(i, height[i])\`.

Choose **two lines** that, together with the x-axis, form a container, so that the container holds the **most water**. Return that maximum amount of water. The container cannot be tilted.`,
  examples: [
    { input: "height = [1, 8, 6, 2, 5, 4, 8, 3, 7]", output: "49", explain: "The lines at indices 1 (height 8) and 8 (height 7) are 7 apart and the water level is `min(8, 7) = 7`, so the area is `7 × 7 = 49`." },
    { input: "height = [1, 1]", output: "1", explain: "Two lines of height 1, one apart: `1 × 1 = 1`." },
  ],
  constraints: ["$2 \\le n \\le 10^5$", "$0 \\le$ `height[i]` $\\le 10^4$"],
  check(input) { return input.height.length < 2 ? "height needs at least two lines" : null; },

  intuition: {
    find: "The pair of lines `(i, j)` with the largest `min(height[i], height[j]) × (j − i)`: the *water level* is the shorter line, and the *width* is the distance between them.",
    beginner: "Try every pair of lines, compute the area, and keep the largest.",
    works: "Every pair is considered, so the best one is found.",
    slow: "$\\frac{n(n-1)}{2}$ pairs: about 5 billion for $n = 10^5$.",
    repeat: "Most pairs are obviously bad (two close or two short lines), but we compute them all anyway, with no way to say *\"this whole group of pairs cannot be best\"*.",
    remember: "Start with the **widest** container (first and last line). Every other container is *narrower*, so to beat it, it must be **taller** at its limiting side. The height is limited by the **shorter** line.",
    observation: "With lines `l` and `r`, the area is capped by `min(h[l], h[r]) × width`. If we keep the *shorter* line and move the other one inwards, the width shrinks and the height is still capped by the same short line: the area can only get **worse**. So the shorter line can never be part of a better container with anything inside the current range: **discard it**.",
    leads: "Start with `l = 0`, `r = n − 1`. Compute the area, update the best, then move the pointer at the **shorter** line inwards. Each step discards one line that cannot be in a better answer, so after `n − 1` steps we have considered every pair that matters: $O(n)$.",
  },

  flow: [
    "Compute the area of every pair of lines.",
    "Every pair is covered, so the best is found.",
    "$O(n^2)$ pairs, with no way to rule out groups of pairs.",
    "Start widest. Any narrower container must be **taller** to win; the shorter line limits the height.",
    "The shorter line cannot be in a better container (width only shrinks): discard it by moving its pointer.",
    "Two pointers, one pass: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every pair `i < j`, compute `min(height[i], height[j]) × (j − i)` and keep the maximum.",
    why: "$\\frac{n(n-1)}{2} = \\Theta(n^2)$ pairs. It never uses the fact that, for a given left line, many right lines are clearly worse than others, and it cannot discard anything.",
    time: "O(n^2)", space: "O(1)",
    measure: { fTex: "\\tfrac{n(n-1)}{2}", f: (n) => (n * (n - 1)) / 2, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int maxArea(vector<int>& height) {
        int n = height.size(), best = 0;
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                best = max(best, min(height[i], height[j]) * (j - i));
        return best;
    }
};`,
    js: `function maxArea(height) {
  let best = 0;
  for (let i = 0; i < height.length; i++)
    for (let j = i + 1; j < height.length; j++)
      best = Math.max(best, Math.min(height[i], height[j]) * (j - i));
  return best;
}`,
  },

  pattern: {
    name: "Two Pointers (greedy discard)",
    why: "Two pointers from both ends work when each step lets you **prove that one candidate can be thrown away**. Here, the shorter line of the current pair cannot belong to any better pair inside the range, because its height caps the container while the width only decreases. Each discard removes a whole row/column of the $n \\times n$ pair table at once.",
    recognize: [
      "A best **pair** `(i, j)` where the value depends on both *positions* (distance) and *values* (a min or a max).",
      "Starting from the **extremes** (widest first) and moving inwards makes sense.",
      "You can justify that moving one pointer cannot lose the optimum: an **exchange / dominance argument**.",
      "The brute force is a double loop over all pairs.",
    ],
  },

  optimal: {
    idea: "Put `l` at the left end and `r` at the right end: the widest container. Repeatedly: compute the current area `min(h[l], h[r]) × (r − l)` and update the best; then move the pointer at the **shorter** line one step inwards (if the heights are equal, either one). Stop when the pointers meet.",
    steps: [
      "Set `l = 0`, `r = n − 1`, `best = 0`.",
      "While `l < r`: compute `area = min(h[l], h[r]) × (r − l)` and set `best = max(best, area)`.",
      "If `h[l] < h[r]`, move `l` right (`l++`); otherwise move `r` left (`r−−`).",
      "Return `best`.",
    ],
    invariant: "**Every pair `(i, j)` with `i < l` or `j > r` has already been compared, or is provably not better than the best found so far.** The window `[l, r]` still contains the optimal pair.",
    correct: "Suppose `h[l] ≤ h[r]` and we discard `l`. Any container using line `l` with a partner `k` inside `(l, r]` has width `k − l ≤ r − l`, and its height is at most `h[l]` (the shorter side), so its area is at most `h[l] × (r − l)`, which is exactly the area we just computed for the pair `(l, r)`. So pairing `l` with anything else cannot beat what we already recorded, and `l` can be discarded safely. The symmetric argument handles `h[r] < h[l]`. Every step discards one line, so the algorithm finishes in `n − 1` steps, having kept the optimal pair in the window until it was evaluated.",
  },

  cpp: `class Solution {
public:
    int maxArea(vector<int>& height) {
        int l = 0, r = (int)height.size() - 1, best = 0;          //@init
        while (l < r) {                                           //@loop
            best = max(best, min(height[l], height[r]) * (r - l));  //@area
            if (height[l] < height[r]) l++;                       // drop the shorter line //@move
            else r--;
        }
        return best;                                              //@ret
    }
};`,
  js: `function maxArea(height) {
  let l = 0, r = height.length - 1, best = 0;                     //@init
  while (l < r) {                                                 //@loop
    best = Math.max(best, Math.min(height[l], height[r]) * (r - l));  //@area
    if (height[l] < height[r]) l++;                               // drop the shorter line //@move
    else r--;
  }
  return best;                                                    //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { height: [1, 8, 6, 2, 5, 4, 8, 3, 7] } },
    { name: "Example 2", kind: "normal", input: { height: [1, 1] } },
    { name: "Tall walls far apart", kind: "normal", input: { height: [9, 1, 1, 1, 9] } },
    { name: "Strictly increasing", kind: "edge", input: { height: [1, 2, 3, 4, 5] }, why: "The left line is always the shorter one, so only `l` ever moves. The best container is not the widest: `(1, 5)` has area 4 but `(3, 5)`... the winner is `2 × ... ` found by the walk. It shows the answer is not always at the first step." },
    { name: "Strictly decreasing", kind: "edge", input: { height: [5, 4, 3, 2, 1] }, why: "The mirror: the right line is always shorter, so only `r` moves. The pointers must work from either side with equal ease." },
    { name: "All lines equal", kind: "edge", input: { height: [5, 5, 5, 5] }, why: "With equal heights, either pointer may move; the area is simply `height × width`, so the widest pair wins (15). Ties must not cause an infinite loop or skip the final comparison." },
    { name: "Two lines only", kind: "corner", input: { height: [4, 3] }, why: "One iteration: `min(4, 3) × 1 = 3`, then a pointer moves and the pointers meet. The loop condition `l < r` must stop before comparing a line with itself." },
    { name: "Zero-height lines", kind: "corner", input: { height: [0, 0, 0] }, why: "All areas are 0, so the answer is 0. Nothing may divide by a height, and `best` must start at 0 rather than at a negative sentinel." },
    { name: "The tallest line is useless", kind: "corner", input: { height: [8, 1, 1, 100, 1, 1, 8] }, why: "The tallest line (`100`) sits in the middle and is not part of the best container: any container using it is capped by its partner, and the closest tall partner is only 3 away (`8 × 3 = 24`). The best container is the two `8`s at the far ends: `8 × 6 = 48`. So 'always use the tallest line' is a wrong greedy." },
  ],

  trace(input, T) {
    const h = input.height, n = h.length;
    let l = 0, r = n - 1, best = 0, bl = -1, br = -1;
    let whyMove = false, whyFirst = false;
    const S = (o = {}) => () => {
      const hl = {};
      if (bl >= 0) { hl[bl] = "ok"; hl[br] = "ok"; }
      if (o.cur) { hl[l] = "cur"; hl[r] = "cur"; }
      if (o.drop != null) hl[o.drop] = "bad";
      return { arr: h, bars: true, l, r, hl, water: o.water ? true : false, label: "line heights", max: Math.max(...h, 1), regs: [{ k: "area of this pair", v: o.area ?? "–", cls: "cur" }, { k: "best area", v: best, cls: "hit" }], lName: "l", rName: "r" };
    };
    T.step("init", { vars: { l, r, best }, state: S({ cur: true }), phase: "Start widest, move the shorter side", say: "Start with the **widest** container: the first and the last line. Every other container is narrower, so it can only win if it is **taller**.", op: `l = 0,  r = n − 1 = ${r}`, act: "START" });
    while (l < r) {
      const w = r - l, mh = Math.min(h[l], h[r]), area = mh * w;
      const imp = area > best, prev = best;
      if (imp) { best = area; bl = l; br = r; }
      T.step("area", { vars: { l, r, "h[l]": h[l], "h[r]": h[r], width: w, area, best }, state: S({ cur: true, water: true, area }), say: `Water level = the **shorter** line = min(${h[l]}, ${h[r]}) = **${mh}**; width = ${r} − ${l} = **${w}**. Area = ${mh} × ${w} = **${area}**${imp ? ", a **new best**" : `, not better than ${prev}`}.`, op: `area = min(${h[l]}, ${h[r]}) × (${r} − ${l}) = ${area};  best = max(${prev}, ${area}) = ${best}`, act: imp ? "NEW_BEST" : "KEEP_BEST" });
      const moveL = h[l] < h[r];
      const drop = moveL ? l : r;
      T.step("move", { vars: { l, r, "h[l]": h[l], "h[r]": h[r] }, state: S({ cur: true, drop, area }), say: moveL ? `\`h[l] = ${h[l]}\` < \`h[r] = ${h[r]}\`: the **left** line is shorter. Moving \`r\` inwards would shrink the width and keep the height capped at ${h[l]}, so line ${l} can never be in a better container. **Discard it: \`l++\`.**` : h[l] === h[r] ? `Both lines are ${h[l]} tall. Either may go: neither can improve alone. Move \`r\` inwards.` : `\`h[r] = ${h[r]}\` < \`h[l] = ${h[l]}\`: the **right** line is shorter. Keeping it and moving \`l\` can only shrink the width without raising the cap, so line ${r} is useless from now on. **Discard it: \`r--\`.**`, op: moveL ? `h[l] < h[r]  ⇒  l = ${l + 1}` : `h[l] >= h[r]  ⇒  r = ${r - 1}`, act: moveL ? "MOVE_L_RIGHT" : "MOVE_R_LEFT",
        why: whyMove ? null : { title: "Why move the SHORTER line?", text: `The container's height is limited by its shorter side. If we kept the shorter line and moved the *taller* one, the width would shrink and the height would still be capped by the same short line: the area could only go down. Moving the short line is the only move that can possibly raise the cap.` } });
      whyMove = true;
      if (moveL) l++; else r--;
    }
    T.step("ret", { vars: { best }, state: S({ cur: false }), say: `The pointers met, so every line that could matter has been compared. The largest container holds **${best}**${bl >= 0 ? `: lines ${bl} and ${br}` : ""}.`, op: `return best = ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = 2 + Math.floor(rnd() * 9); return { height: Array.from({ length: n }, () => Math.floor(rnd() * 10)) }; },
  gen(n) { return { height: Array.from({ length: n }, (_, i) => (i * 37) % 97) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "every step moves a pointer inwards", short: "at most n − 1 iterations",
      derive: [
        "\\text{each iteration moves either } l \\text{ right or } r \\text{ left, by exactly one} || the loop body always changes `l` or `r`",
        "\\text{the gap } r - l \\text{ starts at } n - 1 \\text{ and shrinks by 1 per iteration, stopping at 0} || so the loop runs while the gap is positive",
        "\\text{iterations} = n - 1 || exactly the initial gap",
        "T(n) = (n - 1) \\cdot c || each iteration does one area computation and one comparison",
        "!T(n) = O(n) || versus $\\tfrac{n(n-1)}{2}$ pairs for the brute force",
      ],
      where: "The key is that the algorithm does **not** look at every pair: each pointer move eliminates a whole group of pairs (all containers using the discarded line) in $O(1)$. There are $\\binom{n}{2}$ pairs, but only $n - 1$ pairs are ever evaluated, and the discarding argument shows the best is among them.",
    },
    space: {
      tex: "O(1)", title: "three integers", short: "`l`, `r` and `best`",
      derive: [
        "S(n) = |l| + |r| + |\\text{best}| || the only state",
        "!S(n) = 3c = O(1) || independent of n",
      ],
      where: "No auxiliary array is needed.",
    },
    limit: "Every line could be part of the answer, so $\\Omega(n)$ time is required to read the input. $O(n)$ is optimal.",
    measure: { label: "n = height.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Moving the taller line", what: "`if (h[l] < h[r]) r--; else l--;` (the opposite of the correct rule).", why: "\"Keep the better one\" and \"drop the worse one\" sound like opposites that are easy to mix up.", breaks: "You discard the line that might be part of a better container, and the answer is wrong (for `[1, 8, 6, 2, 5, 4, 8, 3, 7]` it may miss 49).", avoid: "Remember: the **shorter** line limits the height, so it is the only one that must change." },
    { title: "Using the wrong area formula", what: "`h[l] * (r − l)` or `max(h[l], h[r]) * (r − l)`.", why: "Forgetting that water spills over the shorter side.", breaks: "The area is overestimated, so `best` is too large.", avoid: "The level is `min(h[l], h[r])`." },
    { title: "Using `<=` in the loop", what: "`while (l <= r)`.", why: "Copying the binary-search loop condition.", breaks: "When `l == r` the 'container' is a single line with width 0: harmless here (area 0) but it is an extra iteration, and with other formulas it can index wrongly.", avoid: "Use `while (l < r)`: a container needs two different lines." },
    { title: "Thinking the tallest line must be used", what: "Starting from the highest bar.", why: "Intuitively taller is better.", breaks: "Width matters too: two medium lines far apart can beat the tallest line with a short neighbour.", avoid: "Start from the widest pair and let the discard rule decide." },
    { title: "Assuming the answer is the first area computed", what: "Returning the area of `(0, n−1)`.", why: "It is the widest container.", breaks: "A narrower but taller container often has more water.", avoid: "Keep `best = max(...)` over all evaluated pairs." },
  ],

  followUps: [
    {
      q: "Prove that the two-pointer method never skips the optimal pair.",
      a: "Let `(a, b)` be an optimal pair with `a < b`. Suppose the pointers reach a state where `l = a` (or `r = b`) is about to be discarded without the other end having reached the partner. Say `l = a` and `r > b`, and `h[a] ≤ h[r]` so we move `l`. Then the pair `(a, r)` has area `h[a] × (r − a) ≥ h[a] × (b − a) ≥` the area of `(a, b)` (width larger, height the same cap), so `(a, r)` is *at least as good* as the optimum and we recorded it. The other case (`h[r] < h[a]`: we move `r`) leads to a symmetric argument. So the optimum, or an equally good pair, is always evaluated.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "**Trapping Rain Water:** compute the total water trapped between all bars (not just one container).",
      a: "Water above bar `i` is `min(maxLeft[i], maxRight[i]) − height[i]`. Two pointers again: keep `leftMax` and `rightMax`; the side with the smaller max is **fully determined** (its water level is limited by that max), so process it and move that pointer. $O(n)$ time, $O(1)$ space. The reasoning (the smaller side decides) is the same flavour as this problem.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the **indices** of the best two lines, not the area.",
      a: "Record `(l, r)` whenever `best` improves. Nothing else changes, so it is still $O(n)$ time and $O(1)$ space. (The lab highlights the best pair found so far in green.)",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "What if you may choose **three** lines, or the container must be at least `k` wide?",
      a: "For a minimum width `k`, the same two-pointer discard argument works, but stop when `r − l < k`. For three lines the problem changes shape (no simple container interpretation); a typical version is: maximise `min(h[i], h[j], h[k]) × (k − i)`, solved by fixing the shortest line and extending: $O(n \\log n)$ or $O(n)$ with monotonic stacks, but this is a different problem. The point of the follow-up is to check that you can *re-derive* the discard rule for a changed objective.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "3sum", why: "Another two-pointer scan from both ends where each comparison discards an element for good." },
    { id: "valid-palindrome", why: "The simplest two pointers: compare the ends and move inwards." },
    { id: "best-time-to-buy-and-sell-stock", why: "Also replaces an $O(n^2)$ pair search by one smart pass." },
  ],
  patternNote: "**The Two Pointers (greedy discard) pattern** replaces a search over all pairs by a walk from both ends: at each step prove that one of the two current candidates cannot be part of a better answer, discard it, and continue. The proof (an *exchange argument*) is the heart of the solution; the code is only a few lines.",
  takeaways: [
    "Area = `min(h[l], h[r]) × (r − l)`: the **shorter** line sets the water level.",
    "Start with the widest pair; **move the pointer at the shorter line** inwards: the shorter line can never be in a better container.",
    "Each step discards one line, so `n − 1` iterations suffice: $O(n)$ time, $O(1)$ space.",
    "Update `best` at every step, not only at the first; never assume the tallest line is needed.",
    "Recognise it by: best pair, a min/max of the two values times the distance, extremes first.",
  ],
});
