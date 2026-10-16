SHEETS.define({
  id: "longest-palindromic-substring",
  viz: "twopointer",
  io: { fn: "longestPalindrome", params: [["s", "str"]], ret: "str", labels: { s: "s (letters and digits)" } },
  legend: [["cmp", "pair being compared"], ["ok", "palindrome proven so far (current centre)"], ["hit", "longest palindrome so far"], ["cur", "pointer"]],

  statement: `Given a string \`s\`, return the **longest palindromic substring** in \`s\`.

A *palindrome* reads the same forwards and backwards, and a *substring* is a contiguous part of the string. If several palindromes have the same maximum length, any of them is accepted.`,
  examples: [
    { input: `s = "babad"`, output: `"bab"`, explain: "`\"aba\"` is also a valid answer: both have length 3." },
    { input: `s = "cbbd"`, output: `"bb"`, explain: "The longest palindrome has an even length, and its centre lies between the two `b`s." },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 1000$", "`s` consists of only digits and English letters"],
  check(input) {
    if (!input.s.length) return "the string needs at least one character";
    if (input.s.length > 18) return "for the animation use at most 18 characters";
    if (!/^[A-Za-z0-9]+$/.test(input.s)) return "use letters and digits only";
    return null;
  },
  judge(input, out, exp) {
    try {
      const o = JSON.parse(out), e = JSON.parse(exp);
      const pal = typeof o === "string" && o.length > 0 && o === o.split("").reverse().join("");
      return { ok: pal && input.s.includes(o) && o.length === e.length, note: "Any longest palindromic substring is accepted: your answer must be a palindrome that occurs in `s` and has the maximum length." };
    } catch { return { ok: out === exp }; }
  },

  intuition: {
    find: "The **longest contiguous stretch** of the string that reads the same in both directions.",
    beginner: "Look at every substring (every start and every end) and test whether it is a palindrome by comparing characters from its two ends. Keep the longest one found.",
    works: "Every substring is examined, so the longest palindrome cannot be missed, and the end-to-end comparison is the definition of a palindrome.",
    slow: "There are about $n^2/2$ substrings and each test takes up to $n/2$ comparisons: $O(n^3)$. For $n = 1000$ that is hundreds of millions of steps, and much of it repeats work.",
    repeat: "Whether `s[i..j]` is a palindrome depends on whether `s[i+1..j-1]` is one. Testing each substring from scratch ignores that **the inner part was already checked** when we looked at the smaller substring.",
    remember: "A palindrome is **symmetric around its centre**. If we know the centre, we can grow outwards one pair at a time: as long as the two new characters match, the bigger string is a palindrome too. The moment they differ, no larger palindrome has this centre.",
    observation: "There are only $2n - 1$ possible centres: each character (odd length) and each gap between two characters (even length). From each centre, expand with two pointers `l` and `r` while `s[l] == s[r]`. The widest expansion from any centre gives the longest palindrome. Each expansion step does exactly one comparison, and no substring is tested from scratch.",
    leads: "For each centre `c` and each parity (`r = c` for odd, `r = c + 1` for even): `l = c`; while in range and `s[l] == s[r]`, do `l--, r++`. The palindrome is `s[l+1 .. r-1]`, of length `r - l - 1`; keep the longest. $O(n^2)$ time, $O(1)$ space.",
  },

  flow: [
    "Test every substring for being a palindrome.",
    "All substrings are covered, so the longest one is found.",
    "About $n^2$ substrings times up to $n$ comparisons: $O(n^3)$.",
    "A palindrome is symmetric around its centre; a bigger one extends a smaller one by a matching pair.",
    "There are $2n - 1$ centres (letters and gaps); expand from each while the ends match.",
    "Each expansion is one comparison: $O(n^2)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every start `i` and end `j`, check whether `s[i..j]` is a palindrome by comparing from its two ends inwards. Remember the longest palindrome found.",
    why: "There are $\\Theta(n^2)$ substrings and each check costs up to $\\Theta(n)$ comparisons: $O(n^3)$ time. A substring is tested from scratch, even though its inner part has just been tested as a shorter substring.",
    time: "O(n³)", space: "O(1)",
    measure: { fTex: "n^3", f: (n) => n * n * n, ns: [10, 100, 500, 1000] },
    cpp: `class Solution {
public:
    string longestPalindrome(string s) {
        int n = s.size(), best = 0, start = 0;
        for (int i = 0; i < n; i++)
            for (int j = i; j < n; j++) {
                bool ok = true;
                for (int a = i, b = j; a < b; a++, b--)
                    if (s[a] != s[b]) { ok = false; break; }
                if (ok && j - i + 1 > best) { best = j - i + 1; start = i; }
            }
        return s.substr(start, best);
    }
};`,
    js: `function longestPalindrome(s) {
  const n = s.length;
  let best = 0, start = 0;
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      let ok = true;
      for (let a = i, b = j; a < b; a++, b--)
        if (s[a] !== s[b]) { ok = false; break; }
      if (ok && j - i + 1 > best) { best = j - i + 1; start = i; }
    }
  return s.slice(start, start + best);
}`,
  },

  pattern: {
    name: "Expand Around Center (two pointers moving outwards)",
    why: "Palindromes are defined by symmetry, so they are *grown* from a centre rather than *checked* from outside. Two pointers that start at the centre and move apart test one new pair per step, so the work of the smaller palindrome is reused for the bigger one.",
    recognize: [
      "The question asks for **palindromic substrings**: longest, count, or whether one exists.",
      "A substring is a palindrome if its ends match **and** the inside is a palindrome.",
      "There are only $O(n)$ centres to try, and each expansion stops at the first mismatch.",
      "$O(n^2)$ is acceptable for $n$ up to a few thousand.",
    ],
  },

  optimal: {
    idea: "A palindrome has a centre: one character (odd length) or the gap between two characters (even length). For each of the $2n - 1$ centres, place `l` and `r` on the centre and expand outwards while the two characters are equal. When the expansion stops, the palindrome is `s[l+1 .. r-1]`. Keep the longest one over all centres.",
    steps: [
      "Set `best = 0` and `start = 0`.",
      "For each index `c` from `0` to `n − 1`, and for each of the two parities `k ∈ {0, 1}`: set `l = c`, `r = c + k`.",
      "While `l ≥ 0`, `r < n` and `s[l] == s[r]`: do `l--`, `r++`.",
      "The palindrome has length `r − l − 1` and starts at `l + 1`.",
      "If it is longer than `best`, update `best` and `start`.",
      "Return `s.substr(start, best)`.",
    ],
    invariant: "**Whenever the pair `(l, r)` is about to be compared, the substring `s[l+1 .. r−1]` is a palindrome centred on the chosen centre.**",
    correct: "For `k = 0`, `l = r = c`, and the inner part `s[c+1..c-1]` is empty: a palindrome. For `k = 1`, `l = c` and `r = c + 1`, and the inner part is also empty. If `s[l] == s[r]` then `s[l..r]` is a palindrome (matching ends around a palindrome), so after `l--`, `r++` the invariant holds again. When the loop stops, either a pair does not match or a pointer left the string, so no larger palindrome has this centre. Hence the maximum palindrome centred here is `s[l+1..r-1]` of length `r − l − 1`. Every palindromic substring has a centre among the $2n − 1$ tried, so the best over all centres is the longest palindromic substring.",
  },

  cpp: `class Solution {
public:
    string longestPalindrome(string s) {
        int n = s.size(), start = 0, best = 0;  //@init
        for (int c = 0; c < n; c++) {           // every centre //@loop
            for (int k = 0; k < 2; k++) {       // k = 0: odd length, k = 1: even length
                int l = c, r = c + k;           // start on the centre //@centre
                while (l >= 0 && r < n && s[l] == s[r]) { l--; r++; }   // grow while the ends match //@expand
                if (r - l - 1 > best) { best = r - l - 1; start = l + 1; }   // longest so far? //@update
            }
        }
        return s.substr(start, best);           //@ret
    }
};`,
  js: `function longestPalindrome(s) {
  const n = s.length;
  let start = 0, best = 0;               //@init
  for (let c = 0; c < n; c++) {          // every centre //@loop
    for (let k = 0; k < 2; k++) {        // k = 0: odd length, k = 1: even length
      let l = c, r = c + k;              // start on the centre //@centre
      while (l >= 0 && r < n && s[l] === s[r]) { l--; r++; }   // grow while the ends match //@expand
      if (r - l - 1 > best) { best = r - l - 1; start = l + 1; }   // longest so far? //@update
    }
  }
  return s.slice(start, start + best);   //@ret
}`,

  tests: [
    { name: "Example 1: babad", kind: "normal", input: { s: "babad" } },
    { name: "Example 2: cbbd", kind: "normal", input: { s: "cbbd" } },
    { name: "Example 3: a single letter", kind: "normal", input: { s: "a" } },
    { name: "forgeeksskeegfor", kind: "normal", input: { s: "forgeeksskeegfor" } },
    { name: "All letters equal", kind: "edge", input: { s: "aaaa" }, why: "Every substring is a palindrome, so the whole string wins. The expansion from the middle centres (odd and even) reaches the ends of the string and stops because a pointer leaves it: the bounds checks `l >= 0 && r < n` must come first." },
    { name: "No palindrome longer than one letter", kind: "edge", input: { s: "abcd" }, why: "Every even-centre expansion stops at once (neighbours differ) and every odd-centre expansion stops after one pair. The answer is a single letter; any letter is accepted, and this implementation returns the first." },
    { name: "The whole string is a palindrome", kind: "edge", input: { s: "racecar" }, why: "The centre `e` expands all the way: `e = e`, `c = c`, `a = a`, `r = r`, then `l` leaves the string. The result has length 7, the whole string." },
    { name: "An even-length palindrome", kind: "edge", input: { s: "abba" }, why: "The palindrome `abba` has no centre letter: its centre is the **gap** between the two `b`s. Only the even case (`r = c + 1`) finds it; a solution that tries only letter centres would return a single letter (`a`), because every odd centre stops after one comparison." },
    { name: "Two different letters", kind: "edge", input: { s: "ac" }, why: "The smallest string without a longer palindrome: the answer is one letter. The even centre compares `a` with `c` and stops at once." },
    { name: "A palindrome at the end", kind: "corner", input: { s: "xyzabcba" }, why: "The longest palindrome `abcba` is found only when the centre reaches `c`. The right pointer stops at the end of the string (`r < n` is false) just after matching the last `a`." },
    { name: "Two palindromes of the same length", kind: "corner", input: { s: "abacdc" }, why: "`aba` and `cdc` both have length 3. The strict test `> best` keeps the first one found (`aba`); the checker accepts either because the problem allows any longest palindrome." },
    { name: "Digits and letters", kind: "corner", input: { s: "a1b1a" }, why: "Digits and letters are ordinary characters for the comparison. The centre `b` expands over `1 = 1` and `a = a`: the whole string." },
  ],

  trace(input, T) {
    const s = input.s, n = s.length, chars = s.split("");
    let start = 0, best = 0;
    let whyCentre = false, whyEven = false, whyStop = false, whyUpdate = false;
    const S = (o = {}) => () => {
      const hl = {};
      const l = o.l, r = o.r;
      if (best > 0) for (let i = start; i < start + best; i++) hl[i] = "hit";
      if (l !== undefined && r !== undefined) {
        for (let i = l + 1; i <= r - 1; i++) hl[i] = "ok";
        if (l >= 0 && l < n) hl[l] = o.mismatch ? "bad" : "cmp";
        if (r >= 0 && r < n) hl[r] = o.mismatch ? "bad" : "cmp";
      }
      const spans = [];
      if (best > 0) spans.push({ from: start, to: start + best - 1, cls: "hit solid", label: `longest so far: ${best}` });
      return { arr: chars, l: l !== undefined && l >= 0 && l < n ? l : undefined, r: r !== undefined && r >= 0 && r < n ? r : undefined, discard: false, noSpan: true, hl, spans, regs: [{ k: "longest length", v: best, cls: "hit" }, { k: "centre", v: o.centre !== undefined ? o.centre : "–", cls: "" }], label: `“${s}”`, note: o.note };
    };
    const vars = (c, k, l, r) => ({ centre: c === undefined ? "–" : c, l: l === undefined ? "–" : l, r: r === undefined ? "–" : r, best });
    T.step("init", { vars: vars(), state: S(), phase: "Try every centre", say: `${n} character${n === 1 ? "" : "s"}, so there are ${2 * n - 1} possible centres: each character (odd palindromes) and each gap between two characters (even palindromes). From each centre we grow outwards while the two ends match.`, op: "best = 0,  start = 0", act: "START" });
    for (let c = 0; c < n; c++) {
      T.step("loop", { vars: vars(c), state: S({ centre: c, l: c, r: c }), say: `Centre index **${c}** (the letter “${s[c]}”). We will try an odd palindrome centred on it and an even one centred on the gap to its right.`, op: `c = ${c}`, act: "NEXT_CENTRE" });
      for (let k = 0; k < 2; k++) {
        let l = c, r = c + k;
        T.step("centre", { vars: vars(c, k, l, r), state: S({ centre: c, l, r }), say: k === 0 ? `**Odd** palindrome: both pointers start on the letter “${s[c]}” (\`l = r = ${c}\`).` : c + 1 < n ? `**Even** palindrome: \`l\` = ${l} and \`r\` = ${r} start on the two letters around the gap after index ${c}.` : `**Even** palindrome: \`r\` = ${r} is outside the string, so this centre cannot grow.`, op: `l = ${l},  r = ${r}`, act: k === 0 ? "ODD_CENTRE" : "EVEN_CENTRE",
          why: !whyCentre ? { title: "Why centres?", text: "A palindrome mirrors itself around its middle. Starting from the middle, each new pair of letters is one comparison, and a bigger palindrome contains the smaller one: the work already done is never repeated." } : k === 1 && !whyEven ? { title: "Why a second centre per letter?", text: "A palindrome of even length, such as `abba`, has no middle letter: its middle is the gap between the two `b`s. Those palindromes are found only by starting the pointers on two neighbouring letters (`r = c + 1`)." } : null });
        whyCentre = true; if (k === 1) whyEven = true;
        while (true) {
          const inR = l >= 0 && r < n, eq = inR && s[l] === s[r];
          T.step("expand", { vars: vars(c, k, l, r), state: S({ centre: c, l, r, mismatch: !eq && inR }), say: eq ? `Compare \`s[${l}]\` = “${s[l]}” with \`s[${r}]\` = “${s[r]}”: **equal**, so \`s[${l}..${r}]\` = “${s.slice(l, r + 1)}” is a palindrome. Grow: \`l\` → ${l - 1}, \`r\` → ${r + 1}.` : !inR ? `${l < 0 ? "\`l\` has left the string (−1)" : `\`r\` has left the string (${r} = n)`}: the expansion stops. The palindrome from this centre is “${s.slice(l + 1, r)}”.` : `Compare \`s[${l}]\` = “${s[l]}” with \`s[${r}]\` = “${s[r]}”: **different**, so the expansion stops. The palindrome from this centre is “${s.slice(l + 1, r)}”.`, op: eq ? `s[${l}] == s[${r}]  →  l--, r++` : !inR ? `${l < 0 ? "l >= 0" : `r < n`}  →  false` : `s[${l}] == s[${r}]  →  false`, act: eq ? "GROW" : "STOP",
            why: !eq && !whyStop ? { title: "Why stop at the first mismatch?", text: "Any larger palindrome around this centre would contain the pair that just failed, so none exists. The out-of-range check comes first in the condition so that `s[l]` and `s[r]` are only read when both are valid." } : null });
          if (!eq) { whyStop = true; break; }
          l--; r++;
        }
        const len = r - l - 1, better = len > best;
        if (better) { best = len; start = l + 1; }
        T.step("update", { vars: vars(c, k, l, r), state: S({ centre: c, l, r, mismatch: false, note: len > 0 ? `from this centre: “${s.slice(l + 1, r)}” (length ${len})` : "this centre gives nothing" }), say: len === 0 ? "This even centre gave no palindrome (length 0)." : better ? `The palindrome “${s.slice(l + 1, r)}” has length ${len}, longer than any before: **best = ${best}**.` : `The palindrome “${s.slice(l + 1, r)}” has length ${len}; it does not beat the best (${best}).`, op: `r - l - 1 = ${len}  ${better ? ">" : "<="}  best`, act: better ? "NEW_BEST" : "KEEP_BEST",
          why: better && !whyUpdate ? { title: "How is the answer recovered?", text: "After the loop `l` and `r` stand one step *outside* the palindrome, so it starts at `l + 1` and has `r − l − 1` letters. We only need to remember that start and that length." } : null });
        if (better) whyUpdate = true;
      }
    }
    const ans = s.slice(start, start + best);
    T.step("ret", { vars: { "return": ans }, state: S({}), say: `Every centre has been tried. The longest palindromic substring is **“${ans}”** (length ${best}).`, op: `return s.substr(${start}, ${best})`, act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) { const al = "abc"; const n = 1 + Math.floor(rnd() * 11); return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * 3)]).join("") }; },
  gen(n) { return { s: "a".repeat(n) }; },

  complexity: {
    time: {
      tex: "O(n^2)", title: "2n − 1 centres, each expanding at most n/2 steps", short: "the worst case is a string of equal letters",
      derive: [
        "\\#\\text{centres} = n + (n-1) = 2n - 1 || each letter and each gap",
        "\\text{expansions from centre } c \\le \\min(c+1,\\, n-c) \\le \\lceil n/2 \\rceil || bounded by the distance to the nearer end",
        "T(n) \\le (2n-1) \\cdot \\lceil n/2 \\rceil \\cdot c = O(n^2) || one comparison per expansion",
        "!T(n) = \\Theta(n^2) \\text{ in the worst case} || e.g. when all letters are equal",
      ],
      where: "For typical text the expansions stop after one or two steps, so the real cost is near $O(n)$; the quadratic bound is reached only when the string is highly repetitive. The measured table uses a string of equal letters, the worst case. (Manacher's algorithm achieves $O(n)$.)",
    },
    space: {
      tex: "O(1)", title: "a few integers", short: "`start`, `best`, `l`, `r`",
      derive: [
        "S = |start| + |best| + |l| + |r| + |c| = c' || only indices are stored, no table",
        "!S = O(1) || the result is built once at the end from `start` and `best`",
      ],
      where: "The dynamic-programming solution stores an $n \\times n$ table ($O(n^2)$); expanding around centres needs no table.",
    },
    limit: "$\\Omega(n)$ time is needed just to read the string, and Manacher's algorithm reaches $O(n)$. The expand-around-centre method is simpler and is optimal among the methods that use no extra memory and no clever reuse of earlier work.",
    measure: { label: "n = length of the string (all letters equal)", fTex: "n^2", f: (n) => n * n, sizes: [8, 16, 32, 64, 128], growth: "quadratic", reading: "Doubling the length multiplies the work by about **4**: there are twice as many centres and each can expand twice as far." },
  },

  mistakes: [
    { title: "Only odd centres", what: "Starting only with `l = r = c`.", why: "A palindrome \"has a middle letter\".", breaks: "Even-length palindromes such as `abba` or `bb` are missed: `\"cbbd\"` would answer `c` instead of `bb`.", avoid: "Also try `l = c`, `r = c + 1` for every `c`." },
    { title: "Reading `s[l]` or `s[r]` before the bounds check", what: "`while (s[l] == s[r] && l >= 0 && r < n)`.", why: "The comparison is the \"interesting\" part, so it is written first.", breaks: "At `l = -1` or `r = n` the comparison reads outside the string: undefined behaviour in C++, `undefined` in JavaScript.", avoid: "Put `l >= 0 && r < n` first." },
    { title: "Off-by-one when recovering the substring", what: "Returning `s.substr(l, r - l)` or `s.substr(l, best)`.", why: "After the loop `l` and `r` are one step **outside** the palindrome.", breaks: "The result includes the mismatching letters, or starts one too early.", avoid: "Start at `l + 1` and use length `r − l − 1`." },
    { title: "Remembering the length but not the start", what: "Keeping only `best` and then trying to rebuild the substring from the last `l` and `r`.", why: "The length seems to be all the question asks for (it is, in the length-only variant).", breaks: "After later centres have been tried, `l` and `r` belong to a different palindrome, so the returned substring is wrong.", avoid: "Save `start = l + 1` together with `best` at the moment a longer palindrome is found." },
    { title: "Checking all substrings with a full palindrome test", what: "Three nested loops.", why: "It follows the definition directly.", breaks: "$O(n^3)$ is too slow for $n = 1000$ in the worst case.", avoid: "Grow palindromes from their centres; the inner part is never re-tested." },
  ],

  followUps: [
    {
      q: "Solve it with **dynamic programming**.",
      a: "Let `dp[i][j]` be true if `s[i..j]` is a palindrome. Then `dp[i][j] = (s[i] == s[j]) && (j − i < 2 || dp[i+1][j−1])`. Fill the table by increasing length (or `i` downwards) and track the longest true entry. It is $O(n^2)$ time and $O(n^2)$ space, which is more memory than the centre expansion needs.",
      cpp: `string longestPalinDP(string s) {
    int n = s.size(), start = 0, best = 1;
    vector<vector<bool>> dp(n, vector<bool>(n, false));
    for (int i = n - 1; i >= 0; i--)
        for (int j = i; j < n; j++) {
            if (s[i] == s[j] && (j - i < 2 || dp[i + 1][j - 1])) {
                dp[i][j] = true;
                if (j - i + 1 > best) { best = j - i + 1; start = i; }
            }
        }
    return s.substr(start, best);
}`,
      js: `function longestPalinDP(s) {
  const n = s.length;
  let start = 0, best = 1;
  const dp = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = n - 1; i >= 0; i--)
    for (let j = i; j < n; j++) {
      if (s[i] === s[j] && (j - i < 2 || dp[i + 1][j - 1])) {
        dp[i][j] = true;
        if (j - i + 1 > best) { best = j - i + 1; start = i; }
      }
    }
  return s.slice(start, start + best);
}`,
      time: "O(n²)", space: "O(n²)",
    },
    {
      q: "Reach **$O(n)$** with Manacher's algorithm.",
      a: "Insert a separator between all letters (so every palindrome has odd length) and keep, for each centre, the radius of its palindrome. While scanning, reuse the radius of the mirror position inside the rightmost palindrome found so far, so the right boundary only moves forward and the total work is linear. It is tricky to write, and rarely required in interviews.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Count **all** the palindromic substrings instead of finding the longest.",
      a: "Use the same expansion, but add one to a counter at every successful comparison: each success is a new palindrome. That is the next problem on the sheet.",
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "The **longest palindromic subsequence** (letters need not be adjacent).",
      a: "Different problem: use dynamic programming, `dp[i][j] = dp[i+1][j-1] + 2` if the ends match, else the maximum of `dp[i+1][j]` and `dp[i][j-1]`. Equivalently, it is the longest common subsequence of `s` and its reverse: $O(n^2)$.",
      time: "O(n²)", space: "O(n²)",
    },
  ],

  related: [
    { id: "palindromic-substrings", why: "The same expansion, but counting every palindrome instead of keeping the longest." },
    { id: "valid-palindrome", why: "Checks a whole string by shrinking from the two ends." },
    { id: "longest-common-subsequence", why: "Relates to the longest palindromic subsequence (LCS of a string and its reverse)." },
    { id: "longest-substring-without-repeating-characters", why: "Another \"best substring\" problem, solved by a window instead of centres." },
  ],
  patternNote: "**Expand around centre** grows a symmetric structure outwards from its middle: each step tests one new pair and reuses all the earlier work. Remember the two kinds of centre (a letter and a gap) and put the bounds check before the comparison.",
  takeaways: [
    "A palindrome is symmetric around a **centre**: a letter (odd length) or a gap (even length): $2n − 1$ centres in all.",
    "From each centre grow `l--, r++` while `l >= 0 && r < n && s[l] == s[r]`; the palindrome is `s[l+1 .. r-1]`.",
    "Keep `start` and `best`; return `s.substr(start, best)`.",
    "Both parities are needed (`cbbd`), and the bounds check must come first.",
    "Time $O(n^2)$, space $O(1)$ (DP uses $O(n^2)$ space, Manacher $O(n)$ time).",
  ],
});
