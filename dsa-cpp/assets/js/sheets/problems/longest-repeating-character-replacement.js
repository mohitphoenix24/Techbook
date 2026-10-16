SHEETS.define({
  id: "longest-repeating-character-replacement",
  viz: "sliding",
  io: { fn: "characterReplacement", params: [["s", "str"], ["k", "int"]], ret: "int", labels: { s: "s (capital letters)", k: "k (replacements allowed)" } },
  legend: [["win", "window that can be fixed"], ["bad", "window needing more than k changes"], ["cur", "letter just added"], ["dim", "outside the window"]],

  statement: `You are given a string \`s\` and an integer \`k\`. You can choose any character of the string and change it to **any other uppercase English character**. You can perform this operation **at most \`k\` times**.

Return the **length of the longest substring** containing the same letter you can get after performing the above operations.`,
  examples: [
    { input: `s = "ABAB", k = 2`, output: "4", explain: "Replace the two `A`s with `B`s (or the two `B`s with `A`s): the whole string becomes one letter." },
    { input: `s = "AABABBA", k = 1`, output: "4", explain: "Change the `B` in \"AABA\" into `A` to get \"AAAA\", length 4. No window of length 5 can be fixed with a single change." },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 10^5$", "`s` consists of only uppercase English letters", "$0 \\le k \\le$ `s.length`"],
  check(input) {
    if (!input.s.length) return "the string needs at least one letter";
    if (input.s.length > 12) return "for the animation use at most 12 letters";
    if (!/^[A-Z]+$/.test(input.s)) return "use capital letters A to Z only";
    if (input.k < 0 || input.k > input.s.length) return `k must be between 0 and ${input.s.length}`;
    return null;
  },

  intuition: {
    find: "The longest window in which, after changing at most `k` letters, **all letters are equal**. We never have to actually change anything: we only need to know whether it *could* be done.",
    beginner: "For every substring, count how often each letter appears. The cheapest way to make the substring uniform is to keep the **most common** letter and change all the others. If `length − (count of the most common letter) ≤ k`, the substring is allowed; keep the longest.",
    works: "Keeping the most common letter minimises the number of changes, so a substring is feasible exactly when that minimum is at most `k`. Checking every substring cannot miss the best one.",
    slow: "There are $O(n^2)$ substrings, and counting letters for each one naively makes it $O(n^3)$; even with incremental counts it is $O(n^2)$, which is about $10^{10}$ steps for $n = 10^5$.",
    repeat: "A substring and the one that is one letter longer share all but one letter, yet their counts are recomputed. And if a window is **not** feasible, every longer window around it is not feasible either.",
    remember: "Feasibility is **monotone**: if a window can be fixed with at most `k` changes, so can any smaller window inside it; if it needs more than `k`, any larger window containing it needs more too. That is the signature of a sliding window.",
    observation: "Grow the window by moving `right`, keeping the count of each letter in it. While `window length − max count > k` (too many changes needed), move `left` and remove that letter. After the repair the window is feasible, and we update the best length. The most common count only needs to be read from 26 counters, a constant.",
    leads: "For each `right`: `count[s[right]]++`. While `(right − left + 1) − max(count) > k`: `count[s[left]]--`, `left++`. Best = max(best, `right − left + 1`). Each index enters and leaves the window once: $O(26\\,n) = O(n)$.",
  },

  flow: [
    "Check every substring: keep its most common letter, change the rest, and compare the number of changes with `k`.",
    "Keeping the most common letter is the cheapest fix, so the test is exact.",
    "$O(n^2)$ substrings (more with naive counting): far too slow for $10^5$ letters.",
    "If a window needs more than `k` changes, a bigger window around it does too: it is monotone.",
    "Grow `right`, shrink `left` while `length − maxCount > k`.",
    "Each letter enters and leaves once: $O(n)$ time with 26 counters.",
  ],

  brute: {
    idea: "**Brute force:** for every start `i`, extend `j` to the right while keeping the letter counts of `s[i..j]` and the largest count seen. If `(j − i + 1) − maxCount ≤ k`, the substring can be made uniform, so update the best length.",
    why: "It looks at all $\\binom{n}{2}$ substrings: $O(n^2)$ time. Longer windows are re-examined even though a shorter window around the same place has already failed (and then every longer one fails as well).",
    time: "O(n²)", space: "O(1)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    int characterReplacement(string s, int k) {
        int best = 0, n = s.size();
        for (int i = 0; i < n; i++) {
            int count[26] = {0}, maxf = 0;
            for (int j = i; j < n; j++) {
                maxf = max(maxf, ++count[s[j] - 'A']);
                if ((j - i + 1) - maxf <= k) best = max(best, j - i + 1);
            }
        }
        return best;
    }
};`,
    js: `function characterReplacement(s, k) {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const count = new Array(26).fill(0);
    let maxf = 0;
    for (let j = i; j < s.length; j++) {
      maxf = Math.max(maxf, ++count[s.charCodeAt(j) - 65]);
      if (j - i + 1 - maxf <= k) best = Math.max(best, j - i + 1);
    }
  }
  return best;
}`,
  },

  pattern: {
    name: "Sliding Window (shrink while the budget is exceeded)",
    why: "Many window problems have a **budget** (here `k` changes). The window may grow freely on the right; when the cost of repairing it exceeds the budget, shrink from the left until the cost is acceptable again. The cost formula (`length − most common count`) is what makes this particular problem work.",
    recognize: [
      "The question is the **longest** substring that can become uniform / valid with at most `k` edits.",
      "The cost of a window can be computed from simple counts (the most frequent element).",
      "If a window is too costly, every bigger window containing it is too costly.",
      "A small, fixed alphabet (26 letters) makes the count lookups $O(1)$.",
    ],
  },

  optimal: {
    idea: "Keep a window `[left, right]` and a count of each letter inside it. For a window, the fewest changes needed to make it one letter is `length − (count of its most common letter)`. Add `s[right]`; while that number exceeds `k`, remove `s[left]` and advance `left`. After the repair, the window is allowed, so its length is a candidate answer.",
    steps: [
      "Set `left = 0`, `best = 0`, and 26 counters at zero.",
      "For each `right`: increase `count[s[right]]`.",
      "While `(right − left + 1) − (largest counter) > k`: decrease `count[s[left]]` and do `left++`.",
      "Set `best = max(best, right − left + 1)`.",
      "Return `best`.",
    ],
    invariant: "**After the shrinking loop, the window `s[left..right]` needs at most `k` changes to become one letter, and `left` is the smallest index for which that is true.**",
    correct: "For a window of length $L$ whose most frequent letter occurs $m$ times, any uniform result needs at least $L − m$ changes and exactly $L − m$ suffice (change everything else into that letter), so the window is feasible iff $L − m \\le k$. Adding a letter on the right can only keep or increase $L − m$, and removing a letter from the left can only keep or decrease it, so feasibility is monotone and the smallest feasible `left` for a given `right` never decreases as `right` grows. The `while` loop removes letters from the left until the window is feasible again, so afterwards `left` is the smallest feasible start for this `right`. Therefore `right − left + 1` is the longest feasible window ending at `right`, and the maximum over all `right` is the answer. A window with $L − m \\le k$ really can be turned into a uniform string of length $L$ using at most `k` changes, so the answer is achievable.",
  },

  cpp: `class Solution {
public:
    int characterReplacement(string s, int k) {
        int count[26] = {0};                    // letters inside the window //@init
        int best = 0, left = 0;
        for (int right = 0; right < (int)s.size(); right++) {   //@loop
            count[s[right] - 'A']++;            // take in the new letter //@add
            while ((right - left + 1) - *max_element(count, count + 26) > k) {   // too many changes? //@check
                count[s[left] - 'A']--;         // drop the oldest letter //@shrink
                left++;
            }
            best = max(best, right - left + 1); // window is allowed //@best
        }
        return best;                            //@ret
    }
};`,
  js: `function characterReplacement(s, k) {
  const count = new Array(26).fill(0);   // letters inside the window //@init
  let best = 0, left = 0;
  for (let right = 0; right < s.length; right++) {   //@loop
    count[s.charCodeAt(right) - 65]++;   // take in the new letter //@add
    while ((right - left + 1) - Math.max(...count) > k) {   // too many changes? //@check
      count[s.charCodeAt(left) - 65]--;  // drop the oldest letter //@shrink
      left++;
    }
    best = Math.max(best, right - left + 1);   // window is allowed //@best
  }
  return best;                           //@ret
}`,

  tests: [
    { name: "Example 1: ABAB, k = 2", kind: "normal", input: { s: "ABAB", k: 2 } },
    { name: "Example 2: AABABBA, k = 1", kind: "normal", input: { s: "AABABBA", k: 1 } },
    { name: "A block of B between As and Cs", kind: "normal", input: { s: "AABBBCC", k: 2 } },
    { name: "No changes allowed (k = 0)", kind: "edge", input: { s: "AABBBCC", k: 0 }, why: "With `k = 0` the window is allowed only if all its letters are already the same, so the answer is the length of the longest run: 3 (`BBB`). The check `length − maxCount > 0` shrinks the window at every different letter." },
    { name: "k as large as the string", kind: "edge", input: { s: "ABC", k: 3 }, why: "Every letter may be changed, so the whole string is allowed: the window never shrinks and the answer is 3. The check `length − maxCount > k` is never true because `length − maxCount ≤ length − 1 < k`." },
    { name: "A single letter", kind: "edge", input: { s: "A", k: 0 }, why: "The only window has length 1 and needs 0 changes: the answer is 1." },
    { name: "All letters equal", kind: "edge", input: { s: "AAAA", k: 2 }, why: "No change is ever needed: `length − maxCount = 0` for every window, so the window grows to the whole string, and the unused changes are simply not needed." },
    { name: "Alternating letters", kind: "edge", input: { s: "ABABAB", k: 1 }, why: "A window of 3 (`ABA`) needs one change; a window of 4 (`ABAB`) needs two. So the window can never exceed 3: it grows to 3, then slides along keeping that size." },
    { name: "All different with k = 0", kind: "corner", input: { s: "ABCD", k: 0 }, why: "Every letter is alone, so the best window has length 1. The window shrinks back to length 1 after every step." },
    { name: "The bad letter at the edge", kind: "corner", input: { s: "BAAAB", k: 1 }, why: "The window `BAAA` needs one change (`B → A`), so 4 is reachable; adding the last `B` would need two, so the window shrinks. The answer 4 can be reached on either side (`BAAA` or `AAAB`)." },
  ],

  trace(input, T) {
    const s = input.s, k = input.k, n = s.length, chars = s.split("");
    const count = new Array(26).fill(0);
    let left = 0, best = 0, bestL = 0, bestR = -1;
    let whyBudget = false, whyMax = false;
    const A = (c) => c.charCodeAt(0) - 65;
    const maxCount = () => Math.max(...count);
    const entries = () => count.map((v, i) => [String.fromCharCode(65 + i), v]).filter(([, v]) => v > 0);
    const S = (o = {}) => () => {
      const r = o.r;
      const len = r !== undefined ? r - left + 1 : 0, mf = maxCount();
      const hl = {};
      if (o.cur !== undefined) hl[o.cur] = "cur";
      return {
        arr: chars, l: r !== undefined && r >= left ? left : undefined, r: r !== undefined && r >= left ? r : undefined, bad: !!o.bad, hl,
        freq: { entries: entries(), hl: {}, title: "letters in the window", keyLabel: "letter", valLabel: "count" },
        regs: [{ k: "window length", v: len, cls: "" }, { k: "most common count", v: mf, cls: "cmp" }, { k: `changes needed (k = ${k})`, v: len - mf, cls: len - mf > k ? "bad" : "ok" }],
        best: { label: "longest allowed window", text: bestR >= 0 ? `${best}   “${s.slice(bestL, bestR + 1)}”` : "0" },
        label: `string  “${s}”   (at most ${k} change${k === 1 ? "" : "s"})`, note: o.note,
      };
    };
    const vars = (right) => ({ right: right === undefined ? "–" : right, left, k, best });
    T.step("init", { vars: vars(), state: S(), phase: "Grow the window, repair it when it needs too many changes", say: `We keep a window and a count of each letter in it. A window of length L whose most common letter occurs m times needs **L − m** changes; it is allowed while that is at most **k = ${k}**.`, op: "count = [0 × 26],  left = 0,  best = 0", act: "START" });
    for (let right = 0; right < n; right++) {
      const c = s[right];
      count[A(c)]++;
      T.step("loop", { vars: vars(right), state: S({ cur: right, r: right }), say: `\`right\` = ${right}: the letter **${c}** joins the window \`s[${left}..${right}]\`.`, op: `right = ${right},  c = '${c}'`, act: "READ" });
      T.step("add", { vars: vars(right), state: S({ cur: right, r: right }), say: `Increase the count of ${c} to **${count[A(c)]}**.`, op: `count['${c}']++  →  ${count[A(c)]}`, act: "COUNT" });
      for (;;) {
        const len = right - left + 1, mf = maxCount(), need = len - mf, over = need > k;
        T.step("check", { w: 26, vars: Object.assign(vars(right), { "length": len, "max count": mf, "changes needed": need }), state: S({ r: right, bad: over }), say: over ? `The window has length ${len} and its most common letter occurs ${mf} times: changing the other **${need}** letters costs more than k = ${k}. The window is **too costly**: shrink it from the left.` : `The window has length ${len} and its most common letter occurs ${mf} times, so **${need}** change${need === 1 ? "" : "s"} are needed, which is within k = ${k}. The window is allowed.`, op: `${len} - ${mf} = ${need}  ${over ? ">" : "<="}  ${k}`, act: over ? "TOO_COSTLY" : "ALLOWED",
          why: !whyMax ? { title: "Why length − (most common count)?", text: "To make a window one letter, keep the letter that is already the most frequent and change all the others: that costs the fewest changes. Reading the largest of 26 counters is a constant amount of work." } : over && !whyBudget ? { title: "Why shrink from the left?", text: "A bigger window containing this one needs at least as many changes. So the only way to become allowed again is to drop letters, and the oldest (leftmost) letters are the ones the next windows no longer contain." } : null });
        whyMax = true; if (over) whyBudget = true;
        if (!over) break;
        count[A(s[left])]--;
        left++;
        T.step("shrink", { vars: vars(right), state: S({ r: right, bad: false, note: `left moved to ${left}` }), say: `Drop **${s[left - 1]}** (the oldest letter) and move \`left\` to ${left}. The window is now \`s[${left}..${right}]\`.`, op: `count['${s[left - 1]}']--;  left++  →  left = ${left}`, act: "SHRINK" });
      }
      const len = right - left + 1, better = len > best;
      if (better) { best = len; bestL = left; bestR = right; }
      T.step("best", { vars: vars(right), state: S({ r: right }), say: better ? `The allowed window “${s.slice(left, right + 1)}” has length ${len}: a new best, **${best}**.` : `The allowed window has length ${len}; the best stays ${best}.`, op: `best = max(best, ${len}) = ${best}`, act: better ? "NEW_BEST" : "KEEP_BEST" });
    }
    T.step("ret", { vars: { best }, state: S({ r: n ? n - 1 : undefined }), say: `The whole string has been read. The longest window that can be made uniform with at most ${k} change${k === 1 ? "" : "s"} has length **${best}**.`, op: `return ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 10); const al = "ABC"; return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * 3)]).join(""), k: Math.floor(rnd() * (n + 1)) }; },
  gen(n) { return { s: Array.from({ length: n }, (_, i) => "ABCDEFGH"[i % 8]).join(""), k: 2 }; },

  complexity: {
    time: {
      tex: "O(n)", title: "each letter enters the window once and leaves at most once", short: "at most 2n window moves, each with a constant scan of 26 counters",
      derive: [
        "\\text{right moves } n \\text{ times; left moves at most } n \\text{ times} \\;\\Rightarrow\\; \\le 2n \\text{ window changes} || both pointers only move forward",
        "c_{\\text{check}} = 26\\, c || reading the largest of 26 counters",
        "T(n) \\le 2n \\cdot (26 c + c') = O(26\\,n) || one check after every window change",
        "!T(n) = O(n) || the alphabet size 26 is a constant",
      ],
      where: "The measured table counts each check as 26 basic steps (the scan of the counters), so it grows linearly. If the alphabet were large (σ letters), the cost would be $O(\\sigma n)$; keeping a running maximum instead of rescanning removes the factor.",
    },
    space: {
      tex: "O(1)", title: "26 counters", short: "one counter per letter",
      derive: [
        "S = 26 \\cdot s_{\\text{int}} + c = O(1) || independent of the length of the string",
        "!S = O(1) || a constant number of integers",
      ],
      where: "For a general alphabet of size $\\sigma$ it would be $O(\\sigma)$ (a hash map of the letters in the window).",
    },
    limit: "Every letter must be read, so $\\Omega(n)$ time is needed. The window method matches it.",
    measure: { label: "n = length of the string (k = 2)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Using the window length as the cost", what: "Comparing `right − left + 1 > k` instead of `length − maxCount > k`.", why: "\"At most k replacements\" feels like a limit on the window length.", breaks: "For `AAAA` with `k = 0` the window would be cut to length 0, even though no change is needed.", avoid: "The number of changes needed is `length − (count of the most common letter)`." },
    { title: "Making the window equal to its first letter", what: "Counting the letters of the window that differ from `s[left]`.", why: "\"Make them all the same\" is easily read as \"make them all like the first one\".", breaks: "For `ABBB` with `k = 1` the first-letter cost is 3, so the window is cut, but changing the single `A` into `B` costs only 1 and the answer is 4.", avoid: "The cheapest target is the most **frequent** letter: take the maximum of the counters." },
    { title: "Forgetting to decrease the count when `left` moves", what: "`left++` without `count[s[left]]--`.", why: "The shrinking loop looks like it only moves a pointer.", breaks: "The counters keep letters that are no longer in the window, so the largest count is too big and windows are accepted that need more than `k` changes.", avoid: "Remove the letter and move `left` together." },
    { title: "Clearing the counters when the window breaks", what: "Resetting all counters and setting `left = right` when the window needs too many changes.", why: "\"The window is spoiled, so start a new one\".", breaks: "The letters that remain in the window after dropping only the oldest one are thrown away, so a longer valid window that overlaps the old one is never found (`AABABBA`, `k = 1` would give a shorter answer).", avoid: "Remove only `s[left]` and move `left` one step at a time." },
    { title: "Returning after the first failure", what: "Stopping as soon as a window needs more than `k` changes.", why: "\"The substring is too costly, so we are done\".", breaks: "A later window may be allowed and longer.", avoid: "Shrink and keep scanning to the end of the string." },
  ],

  followUps: [
    {
      q: "Remove the factor 26: **track the maximum count** instead of rescanning.",
      a: "Keep `maxf`, the largest count *ever seen* in any window so far, and update it only when a count grows (`maxf = max(maxf, count[c])`). Never decrease it. A window is judged by `length − maxf > k`, and we shrink with a single `if` (move `left` by one) instead of a loop. The window never gets smaller, it only slides, and its size grows only when `maxf` truly grows, so the final window size equals the answer. It is a classic trick and $O(n)$ with no scan.",
      cpp: `int characterReplacementFast(string s, int k) {
    int count[26] = {0}, maxf = 0, left = 0;
    for (int right = 0; right < (int)s.size(); right++) {
        maxf = max(maxf, ++count[s[right] - 'A']);
        if ((right - left + 1) - maxf > k) count[s[left++] - 'A']--;
    }
    return s.size() - left;
}`,
      js: `function characterReplacementFast(s, k) {
  const count = new Array(26).fill(0);
  let maxf = 0, left = 0;
  for (let right = 0; right < s.length; right++) {
    maxf = Math.max(maxf, ++count[s.charCodeAt(right) - 65]);
    if (right - left + 1 - maxf > k) count[s.charCodeAt(left++) - 65]--;
  }
  return s.length - left;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Allow replacements with letters from a **larger alphabet** (any Unicode character).",
      a: "Replace the 26 counters with a hash map of counts inside the window and keep the maximum with the same running-maximum trick (or a bucketed structure). Time stays $O(n)$ on average and space becomes $O(\\sigma)$ for the distinct letters in the window.",
      time: "O(n)", space: "O(σ)",
    },
    {
      q: "**Max consecutive ones III:** flip at most `k` zeros in a binary array to make the longest run of ones.",
      a: "The same window, but the cost is simply the number of zeros inside it: grow `right`, and while zeros `> k` move `left`. It is a special case with only two symbols, and the most common symbol is always the 1.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the **start index** of the best window as well.",
      a: "Whenever `right − left + 1 > best`, record `bestStart = left`. Because windows only grow when they are valid, the saved start is the first window of the best length.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "longest-substring-without-repeating-characters", why: "A sliding window with a different validity rule: all letters distinct." },
    { id: "minimum-window-substring", why: "A window where the rule is a multiset of required letters, and we shrink to find the minimum." },
    { id: "valid-anagram", why: "The same 26 counters, used to compare two strings instead of repairing a window." },
    { id: "maximum-subarray", why: "Another \"best contiguous stretch\" problem solved in one pass." },
  ],
  patternNote: "**A sliding window with a budget** grows greedily and pays the price only when the budget breaks: then it shrinks from the left until it is affordable again. The art is the *cost formula*: here `length − most common count`. Once you can compute a window's cost from simple counts, the scan is $O(n)$.",
  takeaways: [
    "Making a window one letter costs `length − (count of its most common letter)` changes.",
    "Grow `right`; while the cost exceeds `k`, remove `s[left]` and move `left`.",
    "Feasibility is monotone, so the window never has to restart; the best length is tracked as a maximum.",
    "Update the counters on **both** ends (add on the right, subtract on the left).",
    "$O(n)$ time with 26 counters; a running maximum removes the factor 26 and allows an `if` instead of a `while`.",
  ],
});
