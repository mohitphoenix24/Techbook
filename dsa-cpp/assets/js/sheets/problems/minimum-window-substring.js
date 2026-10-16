SHEETS.define({
  id: "minimum-window-substring",
  viz: "sliding",
  io: { fn: "minWindow", params: [["s", "str"], ["t", "str"]], ret: "str", labels: { s: "s (the text)", t: "t (letters that must all appear)" } },
  legend: [["win", "window (still missing letters)"], ["ok", "window that has every letter of t"], ["cur", "letter just added"], ["dim", "outside the window"]],

  statement: `Given two strings \`s\` and \`t\` of lengths \`m\` and \`n\` respectively, return the **minimum window substring** of \`s\` such that **every character in \`t\` (including duplicates) is included in the window**. If there is no such substring, return the empty string \`""\`.

The testcases will be generated such that the answer is **unique**. Letters are case-sensitive.`,
  examples: [
    { input: `s = "ADOBECODEBANC", t = "ABC"`, output: `"BANC"`, explain: "The smallest window of `s` containing `A`, `B` and `C` is \"BANC\"." },
    { input: `s = "a", t = "a"`, output: `"a"`, explain: "The whole string is the window." },
    { input: `s = "a", t = "aa"`, output: `""`, explain: "`t` needs two `a`s but `s` has only one: no window exists." },
  ],
  constraints: ["`m == s.length`, `n == t.length`", "$1 \\le m, n \\le 10^5$", "`s` and `t` consist of uppercase and lowercase English letters"],
  check(input) {
    if (!input.s.length || !input.t.length) return "both strings need at least one letter";
    if (input.s.length > 14) return "for the animation use at most 14 letters in s";
    if (input.t.length > 5) return "for the animation use at most 5 letters in t";
    if (!/^[A-Za-z]+$/.test(input.s + input.t)) return "use English letters only";
    return null;
  },
  judge(input, out, exp) {
    try {
      const o = JSON.parse(out), e = JSON.parse(exp);
      if (e === "") return { ok: o === "", note: "No window exists, so the answer must be the empty string." };
      const have = (w) => { const c = {}; for (const ch of w) c[ch] = (c[ch] || 0) + 1; return c; };
      const need = have(input.t), hv = have(o);
      const contains = typeof o === "string" && input.s.includes(o) && Object.keys(need).every((k) => (hv[k] || 0) >= need[k]);
      return { ok: contains && o.length === e.length, note: "Any shortest valid window is accepted (if two windows tie, either one is fine)." };
    } catch { return { ok: out === exp }; }
  },

  intuition: {
    find: "The **shortest stretch of `s`** that contains every letter of `t`, with the right number of copies of each.",
    beginner: "Try every substring of `s`. For each one, count its letters and check whether it covers `t`. Keep the shortest that does.",
    works: "Every possible window is tried, so the shortest valid one cannot be missed.",
    slow: "There are $O(m^2)$ substrings and each check costs up to the size of the alphabet, giving $O(m^2 \\cdot \\sigma)$: for $m = 10^5$ that is far beyond reach.",
    repeat: "The windows `s[i..j]` and `s[i..j+1]` differ by one letter, but we count everything again. And once a window is valid, any longer window with the same start is valid too and **cannot be shorter**, so scanning it is wasted work.",
    remember: "Validity is monotone: if a window covers `t`, a bigger window containing it covers `t` as well. So for each right end there is a *shortest* valid left end, and as `right` moves right, that left end never moves left.",
    observation: "Slide a window with two pointers and keep a count of what is **still missing** (`missing` = number of letters of `t`, with repeats, not yet covered). Move `right` to include letters until `missing` becomes 0: the window is now valid. Then **shrink from the left** as long as the window stays valid, recording the shortest. When shrinking removes a needed letter, `missing` rises above 0 and we go back to expanding.",
    leads: "`need[c]` = how many more copies of `c` are required (negative = surplus). For each `right`: if `need[s[right]]-- > 0` then `missing--`. While `missing == 0`: record the window, then drop `s[left]`: `++need[s[left]] > 0` means a required letter left, so `missing++`; `left++`. Both pointers move only forward: $O(m + n)$.",
  },

  flow: [
    "Check every substring of `s` for whether it covers `t`.",
    "All windows are tried, so the shortest valid one is found.",
    "$O(m^2 \\cdot \\sigma)$: each window is re-counted from scratch.",
    "If a window is valid, a longer one with the same start can never be better.",
    "Expand `right` until nothing is missing, then shrink `left` while the window stays valid.",
    "Both pointers only move forward: $O(m + n)$ time, $O(\\sigma)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every start `i`, extend `j` to the right, counting the letters of `s[i..j]`. After each extension check, for every letter, whether the window contains at least as many copies as `t` requires. Keep the shortest window that passes (the leftmost one on a tie).",
    why: "There are $\\binom{m}{2}$ windows and each check scans all $\\sigma$ letter counts: $O(m^2 \\sigma)$ time. Windows that are already valid are extended further for nothing, and nothing is reused from window to window.",
    time: "O(m² · σ)", space: "O(σ)",
    measure: { fTex: "m^2", f: (n) => n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
public:
    string minWindow(string s, string t) {
        int need[128] = {0};
        for (char c : t) need[(int)c]++;
        int n = s.size(), bestLen = INT_MAX, bestL = 0;
        for (int i = 0; i < n; i++) {
            int have[128] = {0};
            for (int j = i; j < n; j++) {
                have[(int)s[j]]++;
                bool ok = true;
                for (int c = 0; c < 128 && ok; c++) if (have[c] < need[c]) ok = false;
                if (ok && j - i + 1 < bestLen) { bestLen = j - i + 1; bestL = i; }
            }
        }
        return bestLen == INT_MAX ? "" : s.substr(bestL, bestLen);
    }
};`,
    js: `function minWindow(s, t) {
  const need = new Array(128).fill(0);
  for (const c of t) need[c.charCodeAt(0)]++;
  let bestLen = Infinity, bestL = 0;
  for (let i = 0; i < s.length; i++) {
    const have = new Array(128).fill(0);
    for (let j = i; j < s.length; j++) {
      have[s.charCodeAt(j)]++;
      let ok = true;
      for (let c = 0; c < 128 && ok; c++) if (have[c] < need[c]) ok = false;
      if (ok && j - i + 1 < bestLen) { bestLen = j - i + 1; bestL = i; }
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);
}`,
  },

  pattern: {
    name: "Sliding Window (expand to become valid, shrink to become minimal)",
    why: "When you want the **shortest** window that satisfies a requirement, the window alternates between two moods: **expand** until it is valid, then **shrink** while it stays valid. A single counter of what is still missing makes the validity test $O(1)$.",
    recognize: [
      "The goal is the **smallest** substring or subarray that contains / sums to / covers something.",
      "Validity is monotone: a bigger window around a valid window is also valid.",
      "A requirement with **multiplicities** (letters and their counts) can be tracked with one `missing` counter.",
      "Brute force re-counts every window from scratch.",
    ],
  },

  optimal: {
    idea: "Count the letters required by `t` in `need[]` and let `missing` be the total number still needed (`|t|`). Move `right` across `s`: taking a letter that is still needed reduces `missing`. As soon as `missing == 0` the window covers `t`: record it, then try to shrink it from the left. Dropping a letter that the window needs again raises `missing`, which ends the shrinking. Repeat until `right` reaches the end.",
    steps: [
      "Fill `need[c]` with the number of copies of each letter in `t`; set `missing = |t|`, `left = 0`, `bestLen = ∞`.",
      "For each `right`: if `need[s[right]] > 0` then `missing--`; always do `need[s[right]]--` (a negative value means a surplus).",
      "While `missing == 0`: if the window `[left, right]` is shorter than `bestLen`, record it.",
      "Drop `s[left]`: `need[s[left]]++`; if it became positive, a required letter has left the window, so `missing++`. Then `left++`.",
      "After the scan, return the recorded window, or `\"\"` if none was recorded.",
    ],
    invariant: "**For every letter, `need[c]` equals (copies of `c` in `t`) minus (copies of `c` in the window), and `missing` is the total number of required copies the window still lacks (the sum of the positive `need` values).**",
    correct: "The window `s[left..right]` covers `t` exactly when `missing == 0`. For a fixed `right`, the loop shrinks `left` as far as the window stays valid, so at the last valid moment the window is the shortest valid window ending at `right`; every candidate is recorded, so the minimum over all `right` is found. Because validity is monotone, no valid window is skipped: any shortest window `[a, b]` is reached when `right = b` (the window `[left, b]` is valid with `left ≤ a`, and shrinking continues until `left` passes `a`, at which time the window `[a, b]` was recorded). Each pointer only moves forward, so every letter is added once and removed once. `need` and `missing` are updated together with the window, so the invariant holds after each move.",
  },

  cpp: `class Solution {
public:
    string minWindow(string s, string t) {
        int need[128] = {0};                    // copies of each letter still required //@init
        for (char c : t) need[(int)c]++;
        int missing = t.size(), left = 0, bestL = 0, bestLen = INT_MAX;
        for (int right = 0; right < (int)s.size(); right++) {   //@loop
            if (need[(int)s[right]]-- > 0) missing--;    // a needed letter arrived //@take
            while (missing == 0) {              // the window covers t //@valid
                if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestL = left; }   // record //@record
                if (++need[(int)s[left++]] > 0) missing++;   // drop the oldest letter //@drop
            }
        }
        return bestLen == INT_MAX ? "" : s.substr(bestL, bestLen);   //@ret
    }
};`,
  js: `function minWindow(s, t) {
  const need = new Array(128).fill(0);   // copies of each letter still required //@init
  for (const c of t) need[c.charCodeAt(0)]++;
  let missing = t.length, left = 0, bestL = 0, bestLen = Infinity;
  for (let right = 0; right < s.length; right++) {   //@loop
    if (need[s.charCodeAt(right)]-- > 0) missing--;  // a needed letter arrived //@take
    while (missing === 0) {              // the window covers t //@valid
      if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestL = left; }   // record //@record
      if (++need[s.charCodeAt(left++)] > 0) missing++;   // drop the oldest letter //@drop
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);   //@ret
}`,

  tests: [
    { name: "Example 1: ADOBECODEBANC", kind: "normal", input: { s: "ADOBECODEBANC", t: "ABC" } },
    { name: "Example 2: a and a", kind: "normal", input: { s: "a", t: "a" } },
    { name: "Example 3: not enough letters", kind: "normal", input: { s: "a", t: "aa" } },
    { name: "Duplicates in t", kind: "edge", input: { s: "abbbaa", t: "aab" }, why: "`t` needs two `a`s and one `b`. A window with one `a` is not enough even though both letters appear, so the counters (`need`), not a set, are required. The shortest window is the last three letters, `baa`." },
    { name: "The whole string is needed", kind: "edge", input: { s: "abc", t: "cba" }, why: "Order does not matter, only the counts: the window must be the entire `s`. The window becomes valid only when `right` reaches the last letter, and then `left` cannot shrink at all." },
    { name: "Many windows of the same length", kind: "edge", input: { s: "aaaa", t: "a" }, why: "Every single letter is a valid window of length 1. The first one is recorded (strictly shorter windows only replace the best), so the leftmost window is the answer: `a`." },
    { name: "A letter of t is missing", kind: "edge", input: { s: "abcdef", t: "xyz" }, why: "None of the needed letters occurs, so `missing` never reaches 0, nothing is recorded and the function returns the empty string (not a window of length 0)." },
    { name: "t is longer than s", kind: "edge", input: { s: "ab", t: "abc" }, why: "`s` cannot hold three letters, so no window exists. `missing` stays at least 1 until the end of the scan." },
    { name: "Surplus letters inside the window", kind: "corner", input: { s: "aaabbbc", t: "abc" }, why: "The window becomes valid at the `c`, with many surplus `a`s and `b`s. Shrinking must remove the surplus first (negative `need` values), and stops when the next removal would drop a needed letter: the answer is `abbbc`." },
    { name: "Upper and lower case are different", kind: "corner", input: { s: "abAB", t: "aB" }, why: "The letters are case-sensitive: `a` is needed in lower case and `B` in upper case. Only the whole string contains both, so the answer is `abAB` (a case-insensitive solution would answer `ab`)." },
    { name: "The answer is at the end", kind: "corner", input: { s: "xxxabc", t: "abc" }, why: "The first three letters are not needed and are skipped by the shrinking loop; the window `abc` is found only when `right` reaches the last position." },
  ],

  trace(input, T) {
    const s = input.s, t = input.t, n = s.length, chars = s.split("");
    const need = {};
    for (const c of t) need[c] = (need[c] || 0) + 1;
    const letters = [...new Set(t.split(""))];
    let missing = t.length, left = 0, bestL = 0, bestLen = Infinity;
    let whyMissing = false, whyShrink = false, whySurplus = false;
    const val = (c) => need[c] || 0;
    const S = (o = {}) => () => {
      const r = o.r, hl = {};
      if (o.cur !== undefined) hl[o.cur] = "cur";
      if (r !== undefined && r >= left && missing === 0) for (let i = left; i <= r; i++) if (i !== o.cur) hl[i] = "ok";
      return {
        arr: chars, l: r !== undefined && r >= left ? left : undefined, r: r !== undefined && r >= left ? r : undefined, hl,
        freq: { entries: letters.map((c) => [c, val(c)]), hl: Object.fromEntries(letters.filter((c) => val(c) <= 0).map((c) => [c, "hit"])), title: "still needed", keyLabel: "letter", valLabel: "need" },
        regs: [{ k: "letters still missing", v: missing, cls: missing === 0 ? "ok" : "bad" }, { k: "window length", v: r !== undefined && r >= left ? r - left + 1 : 0, cls: "" }],
        best: { label: "shortest window so far", text: bestLen === Infinity ? "none yet" : `${bestLen}   “${s.slice(bestL, bestL + bestLen)}”` },
        label: `s = “${s}”,   t = “${t}”`, note: o.note,
      };
    };
    const vars = (right) => ({ right: right === undefined ? "–" : right, left, missing, "best length": bestLen === Infinity ? "∞" : bestLen });
    T.step("init", { vars: vars(), state: S(), phase: "Expand until valid, then shrink", say: `\`t\` = “${t}” needs ${t.length} letter${t.length === 1 ? "" : "s"} in total. \`need\` records how many copies of each are still required; \`missing\` = ${missing} counts them all.`, op: `need = counts of t,  missing = ${t.length}`, act: "START" });
    for (let right = 0; right < n; right++) {
      const c = s[right];
      T.step("loop", { vars: vars(right), state: S({ cur: right, r: right }), say: `\`right\` = ${right}: the letter **${c}** joins the window \`s[${left}..${right}]\`.`, op: `c = s[${right}] = '${c}'`, act: "READ" });
      const had = val(c);
      need[c] = had - 1;
      if (had > 0) missing--;
      T.step("take", { vars: vars(right), state: S({ cur: right, r: right }), say: had > 0 ? `**${c}** is still needed (need was ${had}): it counts. \`need['${c}']\` becomes ${need[c]} and \`missing\` drops to **${missing}**.` : `**${c}** is ${t.includes(c) ? "already covered (a surplus copy)" : "not in `t` at all"} (need was ${had}). \`need['${c}']\` becomes ${need[c]}; \`missing\` stays **${missing}**.`, op: `need['${c}']-- > 0  →  ${had > 0}${had > 0 ? ";  missing--" : ""}`, act: had > 0 ? "NEEDED" : "NOT_NEEDED",
        why: whyMissing ? null : { title: "Why a single `missing` counter?", text: "Instead of comparing all letter counts after every step, `missing` records how many required letters the window still lacks. The window covers `t` exactly when it is 0, and it changes only when a needed letter enters or leaves." } });
      whyMissing = true;
      for (;;) {
        const valid = missing === 0;
        T.step("valid", { vars: vars(right), state: S({ r: right }), say: valid ? `\`missing\` is 0: the window \`s[${left}..${right}]\` = “${s.slice(left, right + 1)}” **covers t**. See whether it is the shortest so far, then try to shrink it.` : `\`missing\` = ${missing}: the window does not cover \`t\` yet, so read more letters.`, op: `missing == 0  →  ${valid}`, act: valid ? "VALID" : "KEEP_EXPANDING" });
        if (!valid) break;
        const len = right - left + 1, prev = bestLen, better = len < bestLen;
        if (better) { bestLen = len; bestL = left; }
        T.step("record", { vars: vars(right), state: S({ r: right }), say: better ? `The window has length ${len}, ${prev === Infinity ? "and no window has been recorded yet" : `shorter than the best so far (${prev})`}: **record** “${s.slice(left, right + 1)}”.` : `The window has length ${len}, not shorter than the best (${bestLen}): nothing to record.`, op: `${len} < bestLen  →  ${better}`, act: better ? "RECORD" : "NOT_SHORTER" });
        const out = s[left];
        need[out] = val(out) + 1;
        const lost = need[out] > 0;
        if (lost) missing++;
        left++;
        T.step("drop", { vars: vars(right), state: S({ r: right, note: lost ? `“${out}” was needed: the window is no longer valid` : `“${out}” was surplus: the window is still valid` }), say: lost ? `Drop **${out}** from the left: \`need['${out}']\` becomes ${need[out]} (> 0), so a **required** letter has left the window and \`missing\` rises to **${missing}**. \`left\` = ${left}.` : `Drop **${out}** from the left: \`need['${out}']\` becomes ${need[out]} (≤ 0), so it was a surplus (or not needed) letter and the window is **still valid**. \`left\` = ${left}.`, op: `++need['${out}'] > 0  →  ${lost}${lost ? ";  missing++" : ""};  left++`, act: lost ? "LOST_NEEDED" : "DROP_SURPLUS",
          why: !lost && !whySurplus ? { title: "Why keep shrinking?", text: "The window is still valid without this letter, so a shorter valid window exists. We keep dropping from the left until a needed letter would be lost; that is the shortest valid window for this `right`." } : lost && !whyShrink ? { title: "Why stop here?", text: "Without this letter the window no longer covers `t`. The shortest valid window for this `right` was the one just recorded. Now we go back to reading letters on the right." } : null });
        if (!lost) whySurplus = true; else whyShrink = true;
      }
    }
    const ans = bestLen === Infinity ? "" : s.slice(bestL, bestL + bestLen);
    T.step("ret", { vars: { "return": ans === "" ? '""' : ans }, state: S({ r: n ? n - 1 : undefined }), say: ans === "" ? "No window ever covered `t`, so return the empty string." : `The shortest window that covers every letter of \`t\` is **“${ans}”** (length ${bestLen}).`, op: bestLen === Infinity ? 'return ""' : `return s.substr(${bestL}, ${bestLen})`, act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) {
    const al = "abc", n = 1 + Math.floor(rnd() * 10), m = 1 + Math.floor(rnd() * 3);
    return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * 3)]).join(""), t: Array.from({ length: m }, () => al[Math.floor(rnd() * 3)]).join("") };
  },
  gen(n) { return { s: Array.from({ length: n }, (_, i) => "abc"[i % 3]).join(""), t: "abc" }; },

  complexity: {
    time: {
      tex: "O(m + n)", title: "right visits each letter once and left follows once", short: "m letters enter and at most m letters leave, plus n to count t",
      derive: [
        "T_{\\text{count}} = n \\cdot c || building `need` from `t`",
        "\\text{right advances } m \\text{ times and } \\text{left advances} \\le m \\text{ times} || neither pointer moves backwards",
        "T_{\\text{slide}} \\le 2m \\cdot c' || each move does $O(1)$ work thanks to the `missing` counter",
        "!T(m, n) = O(m + n) || linear in the lengths of both strings",
      ],
      where: "The inner `while` looks like a nested loop, but `left` only moves forward and never past `right`, so over the whole run it executes at most $m$ times in total. The measured table uses $t$ = \"abc\" and a long $s$; it grows linearly with the length of $s$.",
    },
    space: {
      tex: "O(\\sigma)", title: "one counter per letter of the alphabet", short: "128 counters for ASCII",
      derive: [
        "S = |\\text{need}| = \\sigma = 128 || independent of the length of the strings",
        "!S = O(\\sigma) = O(1) || constant for a fixed alphabet",
      ],
      where: "For a huge alphabet use a hash map of only the letters in `t`, which is $O(n)$ in the worst case.",
    },
    limit: "Every letter of `s` must be examined to be sure no shorter window exists, so $\\Omega(m)$ time is needed; the window method is optimal.",
    measure: { label: "m = length of s  (t = “abc”)", fTex: "m", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Using a set instead of counts", what: "Checking that every distinct letter of `t` appears in the window.", why: "\"Contains all characters of t\" sounds like a set test.", breaks: "For `t = \"aab\"`, a window with one `a` and one `b` passes but is wrong: `t` needs **two** `a`s.", avoid: "Count copies: `need[c]` and a `missing` total." },
    { title: "Shrinking only once", what: "`if (missing == 0)` instead of `while`.", why: "One removal looks enough.", breaks: "Surplus letters at the left stay in the window, so the recorded window is longer than necessary (`aaabbbc` would not give `abbbc`).", avoid: "`while (missing == 0)`: shrink as long as the window remains valid." },
    { title: "Forgetting to restore `missing` when a needed letter leaves", what: "`need[s[left]]++` without checking whether it became positive.", why: "The drop looks symmetrical to the take.", breaks: "`missing` stays 0, so the loop shrinks past the point where the window stopped being valid and returns windows that do not cover `t`.", avoid: "`if (++need[c] > 0) missing++`." },
    { title: "Decreasing `missing` for every letter", what: "`missing--` whenever a letter of `t` enters, even if it is already covered.", why: "Counting letters instead of counting the *missing* copies.", breaks: "A surplus `a` is counted again, so `missing` reaches 0 before `t` is really covered.", avoid: "Only decrease `missing` when `need[c] > 0` before the decrement." },
    { title: "Returning the wrong thing when no window exists", what: "Returning `s` or a window of length `INT_MAX`.", why: "`bestLen` is still at its initial value.", breaks: "The answer should be the empty string; `s.substr(0, INT_MAX)` returns the entire string.", avoid: "Check `bestLen == INT_MAX` and return `\"\"`." },
  ],

  followUps: [
    {
      q: "Return the **length** of the shortest window only, or `-1` if none exists.",
      a: "Run the same loop and return `bestLen` (or `-1`). There is no need for `bestL`, so it saves one integer, and the logic is identical.",
      time: "O(m + n)", space: "O(σ)",
    },
    {
      q: "Find the **shortest subarray with sum at least `k`** (positive numbers).",
      a: "The same expand-then-shrink window: add `nums[right]` to a running sum; while the sum is `≥ k`, record the window and subtract `nums[left]`. The positivity of the numbers gives the monotonicity that makes it work. For arrays with negative numbers you need a prefix-sum and a monotonic deque.",
      cpp: `int minSubArrayLen(int k, vector<int>& nums) {
    int left = 0, sum = 0, best = INT_MAX;
    for (int right = 0; right < (int)nums.size(); right++) {
        sum += nums[right];
        while (sum >= k) {
            best = min(best, right - left + 1);
            sum -= nums[left++];
        }
    }
    return best == INT_MAX ? 0 : best;
}`,
      js: `function minSubArrayLen(k, nums) {
  let left = 0, sum = 0, best = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];
    while (sum >= k) {
      best = Math.min(best, right - left + 1);
      sum -= nums[left++];
    }
  }
  return best === Infinity ? 0 : best;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Find the shortest window of `s` that contains `t` **as a subsequence** (in order, not necessarily adjacent).",
      a: "The window method no longer works, because order matters. Use dynamic programming: `dp[i][j]` = the start of the shortest window that ends at `s[i]` and matches the first `j` letters of `t` as a subsequence. It is $O(mn)$.",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Find **all** the minimum windows, not just one.",
      a: "Record the start every time `right − left + 1` equals the current best (and reset the list when a strictly smaller window appears). The scan is unchanged, so it is still $O(m + n)$ plus the size of the output.",
      time: "O(m + n + output)", space: "O(σ + output)",
    },
  ],

  related: [
    { id: "longest-substring-without-repeating-characters", why: "A window that is *maximised*, with left jumping forward on a repeat." },
    { id: "longest-repeating-character-replacement", why: "A window with a cost formula and a budget `k`." },
    { id: "valid-anagram", why: "The same counting idea, used to compare two whole strings." },
    { id: "group-anagrams", why: "Another use of letter counts: the counts are the key that groups words together." },
  ],
  patternNote: "**Expand to become valid, shrink to become minimal.** One pointer enlarges the window until the requirement is met; the other then discards everything that is not needed, recording the best at every valid moment. A single `missing` counter turns the validity test into a constant-time check, so both pointers only walk forward.",
  takeaways: [
    "`need[c]` = copies of `c` still required (negative = surplus); `missing` = total copies still lacking.",
    "Take: `if (need[s[right]]-- > 0) missing--`. Drop: `if (++need[s[left++]] > 0) missing++`.",
    "While `missing == 0`, record the window and shrink: use `while`, not `if`.",
    "Count copies, not a set; letters are case-sensitive; return `\"\"` when nothing was recorded.",
    "Time $O(m + n)$, space $O(\\sigma)$: each letter is added once and removed at most once.",
  ],
});
