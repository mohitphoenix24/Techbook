SHEETS.define({
  id: "palindromic-substrings",
  viz: "twopointer",
  io: { fn: "countSubstrings", params: [["s", "str"]], ret: "int", labels: { s: "s (letters and digits)" } },
  legend: [["cmp", "pair being compared"], ["ok", "palindrome just counted"], ["cur", "pointer"], ["bad", "mismatch"]],

  statement: `Given a string \`s\`, return **the number of palindromic substrings** in it.

A string is a *palindrome* when it reads the same forward and backward. A *substring* is a contiguous sequence of characters within the string. Substrings at different positions count separately, even if they contain the same letters.`,
  examples: [
    { input: `s = "abc"`, output: "3", explain: "Three palindromic substrings: \"a\", \"b\", \"c\"." },
    { input: `s = "aaa"`, output: "6", explain: "Six palindromic substrings: \"a\", \"a\", \"a\", \"aa\", \"aa\", \"aaa\" (each position counts)." },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 1000$", "`s` consists of lowercase English letters"],
  check(input) {
    if (!input.s.length) return "the string needs at least one character";
    if (input.s.length > 10) return "for the animation use at most 10 characters";
    if (!/^[A-Za-z0-9]+$/.test(input.s)) return "use letters and digits only";
    return null;
  },

  intuition: {
    find: "How many **pieces** of the string (counted by position) read the same in both directions. Every single letter already counts as one.",
    beginner: "Look at every substring, test whether it is a palindrome by comparing its ends, and add one to a counter each time the test passes.",
    works: "Every substring is tested exactly once, so the counter equals the number of palindromic substrings.",
    slow: "There are about $n^2/2$ substrings and each test costs up to $n/2$ comparisons, so $O(n^3)$: hundreds of millions of steps for $n = 1000$.",
    repeat: "A substring is a palindrome only if its inside is a palindrome too. Testing from scratch repeats the comparisons that the smaller substring just made.",
    remember: "Every palindrome has a **centre** (a letter, or the gap between two letters), and a palindrome around a centre grows by adding a matching pair on both sides. If a pair does not match, no larger palindrome has this centre.",
    observation: "From each of the $2n - 1$ centres, expand outwards with two pointers. **Every time the two ends match, the substring between them is a new palindrome**: count it and keep growing. Stop at the first mismatch or at the edge of the string. Each palindromic substring has exactly one centre, so it is counted exactly once.",
    leads: "For each centre `c` and parity `k ∈ {0, 1}`: `l = c`, `r = c + k`; `while (l ≥ 0 && r < n && s[l] == s[r]) { count++; l--; r++; }`. Return `count`. $O(n^2)$ time, $O(1)$ space.",
  },

  flow: [
    "Test every substring and count the palindromes.",
    "Each substring is tested once, so the count is exact.",
    "$O(n^3)$: every test restarts from the outside.",
    "A palindrome extends a smaller palindrome around the same centre by one matching pair.",
    "From each of the $2n - 1$ centres expand while the ends match, counting every success.",
    "One comparison per palindrome plus one per centre: $O(n^2)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every start `i` and end `j`, test whether `s[i..j]` is a palindrome by comparing its two ends moving inwards. Add one to the counter for every success.",
    why: "There are $\\Theta(n^2)$ substrings and each test needs up to $\\Theta(n)$ comparisons: $O(n^3)$. The inside of a palindrome was already tested as a shorter substring, but the test starts again from scratch.",
    time: "O(n³)", space: "O(1)",
    measure: { fTex: "n^3", f: (n) => n * n * n, ns: [10, 100, 500, 1000] },
    cpp: `class Solution {
public:
    int countSubstrings(string s) {
        int n = s.size(), count = 0;
        for (int i = 0; i < n; i++)
            for (int j = i; j < n; j++) {
                bool ok = true;
                for (int a = i, b = j; a < b; a++, b--)
                    if (s[a] != s[b]) { ok = false; break; }
                if (ok) count++;
            }
        return count;
    }
};`,
    js: `function countSubstrings(s) {
  const n = s.length;
  let count = 0;
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      let ok = true;
      for (let a = i, b = j; a < b; a++, b--)
        if (s[a] !== s[b]) { ok = false; break; }
      if (ok) count++;
    }
  return count;
}`,
  },

  pattern: {
    name: "Expand Around Center (counting every success)",
    why: "The same outward expansion that finds the *longest* palindrome also **counts** them: every successful comparison is exactly one more palindrome, because the substring between the two pointers is a palindrome centred where we started.",
    recognize: [
      "The question asks for the **number** of palindromic substrings (or whether any exist).",
      "Every success in the expansion corresponds to exactly one palindrome.",
      "Different positions with the same letters are counted separately.",
      "$O(n^2)$ is acceptable for $n$ up to a few thousand.",
    ],
  },

  optimal: {
    idea: "For each of the $2n - 1$ centres (a letter, or the gap after a letter) put `l` and `r` on the centre and expand while `s[l] == s[r]`. Each time the characters match, the substring `s[l..r]` is a palindrome: add one to the counter and continue outwards. The counter at the end is the answer.",
    steps: [
      "Set `count = 0`.",
      "For every `c` from `0` to `n − 1` and every `k ∈ {0, 1}`: set `l = c`, `r = c + k`.",
      "While `l ≥ 0`, `r < n` and `s[l] == s[r]`: increase `count`, then `l--` and `r++`.",
      "Return `count`.",
    ],
    invariant: "**At each comparison, `count` is the number of palindromic substrings whose centre is an earlier centre, plus the number already found around the current centre.**",
    correct: "A substring `s[a..b]` is a palindrome iff `s[a] == s[b]` and `s[a+1..b-1]` is a palindrome (or has length at most 1). It has a unique centre, `(a + b) / 2` (a letter if its length is odd, a gap if even). Around that centre, the expansion visits exactly the substrings `s[c-t .. c+k+t]` for `t = 0, 1, 2, …`, and it reaches step `t` only if all smaller steps matched, i.e. only if the inside is a palindrome. So the loop counts the substring at step `t` exactly when it is a palindrome. The expansion stops at the first failure, after which no larger substring with this centre is a palindrome. Summing over all centres counts every palindromic substring exactly once.",
  },

  cpp: `class Solution {
public:
    int countSubstrings(string s) {
        int n = s.size(), count = 0;            //@init
        for (int c = 0; c < n; c++) {           // every centre //@loop
            for (int k = 0; k < 2; k++) {       // k = 0: odd length, k = 1: even length
                int l = c, r = c + k;           // start on the centre //@centre
                while (l >= 0 && r < n && s[l] == s[r]) { count++; l--; r++; }   // each match is a palindrome //@expand
            }
        }
        return count;                           //@ret
    }
};`,
  js: `function countSubstrings(s) {
  const n = s.length;
  let count = 0;                         //@init
  for (let c = 0; c < n; c++) {          // every centre //@loop
    for (let k = 0; k < 2; k++) {        // k = 0: odd length, k = 1: even length
      let l = c, r = c + k;              // start on the centre //@centre
      while (l >= 0 && r < n && s[l] === s[r]) { count++; l--; r++; }   // each match is a palindrome //@expand
    }
  }
  return count;                          //@ret
}`,

  tests: [
    { name: "Example 1: abc", kind: "normal", input: { s: "abc" } },
    { name: "Example 2: aaa", kind: "normal", input: { s: "aaa" } },
    { name: "A palindrome with an even middle (abba)", kind: "normal", input: { s: "abba" } },
    { name: "A single letter", kind: "edge", input: { s: "a" }, why: "One letter is one palindrome. The odd centre matches the letter with itself (`l = r`), which counts once; the even centre has `r = n` and counts nothing." },
    { name: "No palindrome longer than one letter", kind: "edge", input: { s: "abcd" }, why: "Only the single letters count: 4. Every even centre fails at once, and every odd centre counts its own letter and then fails at the first pair." },
    { name: "Two equal letters", kind: "edge", input: { s: "aa" }, why: "`a`, `a` and `aa`: three palindromes. The even centre between the two letters matches (counting `aa`), then `l` leaves the string." },
    { name: "All letters equal", kind: "edge", input: { s: "aaaaa" }, why: "Every substring is a palindrome: $5 \\cdot 6 / 2 = 15$. The count equals $n(n+1)/2$, which also shows the $O(n^2)$ worst case: the expansions are as long as possible." },
    { name: "The whole string is a palindrome", kind: "corner", input: { s: "racecar" }, why: "Besides the 7 single letters there are `cec`, `aceca` and `racecar`: 10 in total. The centre `e` expands three times." },
    { name: "Overlapping palindromes", kind: "corner", input: { s: "aabaa" }, why: "Singles (5), `aa` twice (2), `aba` (1) and `aabaa` (1): 9. The two copies of `aa` are different substrings (different positions) and are both counted." },
    { name: "Alternating letters", kind: "corner", input: { s: "abab" }, why: "Singles (4) plus `aba` and `bab` (2) = 6. These two overlap on `ba`; the centres `b` and `a` find them independently." },
    { name: "Digits and letters", kind: "corner", input: { s: "1a1" }, why: "Digits are ordinary characters: singles (3) plus `1a1` = 4." },
  ],

  trace(input, T) {
    const s = input.s, n = s.length, chars = s.split("");
    let count = 0;
    const found = [];       // { sub, at }
    let whyCount = false, whyStop = false, whyOnce = false;
    const S = (o = {}) => () => {
      const hl = {};
      const l = o.l, r = o.r;
      if (l !== undefined && r !== undefined) {
        if (o.counted && l >= 0 && r < n) for (let i = l; i <= r; i++) hl[i] = "ok";
        if (l >= 0 && l < n) hl[l] = o.counted ? "ok" : o.mismatch ? "bad" : "cmp";
        if (r >= 0 && r < n) hl[r] = o.counted ? "ok" : o.mismatch ? "bad" : "cmp";
      }
      const latest = found.slice(-6);
      return { arr: chars, l: l !== undefined && l >= 0 && l < n ? l : undefined, r: r !== undefined && r >= 0 && r < n ? r : undefined, discard: false, noSpan: true, hl,
        pills: { label: `latest palindromes found  (${count} so far)`, items: latest.map((f) => `${f.sub} @${f.at}`) },
        regs: [{ k: "palindromes counted", v: count, cls: "hit" }, { k: "centre", v: o.centre !== undefined ? o.centre : "–", cls: "" }], label: `“${s}”`, note: o.note };
    };
    const vars = (c, l, r) => ({ centre: c === undefined ? "–" : c, l: l === undefined ? "–" : l, r: r === undefined ? "–" : r, count });
    T.step("init", { vars: vars(), state: S(), phase: "Expand from every centre", say: `${n} character${n === 1 ? "" : "s"}: ${2 * n - 1} centres (each letter and each gap). Around each centre we grow while the ends match, and **every match is one more palindromic substring**.`, op: "count = 0", act: "START" });
    for (let c = 0; c < n; c++) {
      T.step("loop", { vars: vars(c), state: S({ centre: c, l: c, r: c }), say: `Centre index **${c}** (the letter “${s[c]}”): first the odd palindromes around it, then the even ones around the gap to its right.`, op: `c = ${c}`, act: "NEXT_CENTRE" });
      for (let k = 0; k < 2; k++) {
        let l = c, r = c + k;
        T.step("centre", { vars: vars(c, l, r), state: S({ centre: c, l, r }), say: k === 0 ? `**Odd** palindromes: both pointers start on “${s[c]}”.` : c + 1 < n ? `**Even** palindromes: the pointers start on “${s[l]}” and “${s[r]}”, the two letters around the gap.` : `**Even** palindromes: \`r\` = ${r} is outside the string, so this gap has no palindrome.`, op: `l = ${l},  r = ${r}`, act: k === 0 ? "ODD_CENTRE" : "EVEN_CENTRE" });
        while (true) {
          const inR = l >= 0 && r < n, eq = inR && s[l] === s[r];
          if (eq) {
            count++; found.push({ sub: s.slice(l, r + 1), at: l });
          }
          T.step("expand", { vars: vars(c, l, r), state: S({ centre: c, l, r, counted: eq, mismatch: !eq && inR }), say: eq ? `\`s[${l}]\` = “${s[l]}” equals \`s[${r}]\` = “${s[r]}”, so **“${s.slice(l, r + 1)}”** is a palindrome: count it (**${count}** so far) and grow one step on each side.` : !inR ? `${l < 0 ? "`l` has left the string" : "`r` has left the string"}: the expansion around this centre ends.` : `\`s[${l}]\` = “${s[l]}” differs from \`s[${r}]\` = “${s[r]}”: the expansion ends. No larger substring around this centre can be a palindrome.`, op: eq ? `s[${l}] == s[${r}]  →  count++  =  ${count}` : `${inR ? `s[${l}] == s[${r}]  →  false` : "out of range  →  stop"}`, act: eq ? "COUNT" : "STOP",
            why: eq && !whyCount ? { title: "Why does every match add exactly one?", text: "The substring between the pointers is a palindrome (its ends match and its inside matched at the previous step). It is a *new* substring, never counted before, because each substring has exactly one centre." } : !eq && !whyStop ? { title: "Why stop at a mismatch?", text: "A palindrome containing the mismatching pair would need those two letters to be equal. So nothing larger around this centre can count, and the rest of the string is left to the other centres." } : null });
          if (eq && !whyCount) whyCount = true;
          if (!eq) { whyStop = true; break; }
          l--; r++;
        }
      }
    }
    T.step("ret", { vars: { "return": count }, state: S({ note: "all centres done" }), say: `Every centre has been expanded: there are **${count}** palindromic substrings in “${s}”.`, op: `return ${count}`, act: "DONE",
      why: !whyOnce ? { title: "Why is nothing counted twice?", text: "A substring has exactly one centre: its middle letter (odd length) or the middle gap (even length). It can only be reached by the expansion that starts at that centre, so it is counted once." } : null });
    T.result(count);
  },
  fuzz(rnd) { const al = "abc"; const n = 1 + Math.floor(rnd() * 11); return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * 3)]).join("") }; },
  gen(n) { return { s: "a".repeat(n) }; },

  complexity: {
    time: {
      tex: "O(n^2)", title: "2n − 1 centres, each expanding at most n/2 steps", short: "the worst case counts n(n+1)/2 palindromes",
      derive: [
        "\\#\\text{centres} = 2n - 1 || each letter and each gap",
        "\\text{steps from one centre} \\le \\lceil n/2 \\rceil + 1 || bounded by the distance to the nearer end, plus the failing comparison",
        "T(n) \\le (2n-1)\\big(\\lceil n/2 \\rceil + 1\\big)\\, c = O(n^2) || one comparison per step",
        "T_{\\text{worst}}(n) = \\Theta(n^2),\\;\\; \\text{answer} \\le \\tfrac{n(n+1)}{2} || reached when all letters are equal",
      ],
      where: "The answer itself can be as large as $n(n+1)/2$ (all letters equal), and each palindrome costs one comparison, so $\\Theta(n^2)$ is unavoidable for this method; for typical text the expansions are short. The measured table uses the all-equal string.",
    },
    space: {
      tex: "O(1)", title: "a few integers", short: "`count`, `l`, `r`, `c`, `k`",
      derive: [
        "S = |count| + |l| + |r| + |c| + |k| = c' || no table",
        "!S = O(1) || constant extra space",
      ],
      where: "A dynamic-programming table `dp[i][j]` would need $O(n^2)$ memory for the same count.",
    },
    limit: "The method must at least read the string ($\\Omega(n)$). Manacher's algorithm can *count* palindromes in $O(n)$ (by summing the radii it computes), but the centre expansion is simpler and has no extra memory.",
    measure: { label: "n = length of the string (all letters equal)", fTex: "n^2", f: (n) => n * n, sizes: [8, 16, 32, 64, 128], growth: "quadratic", reading: "Doubling the length multiplies the work by about **4**: the answer itself grows like $n^2/2$ and every palindrome costs one comparison." },
  },

  mistakes: [
    { title: "Counting only odd centres", what: "Only `l = r = c`.", why: "Single letters are the obvious palindromes.", breaks: "Even palindromes (`aa`, `abba`) are missed: `\"aa\"` would give 2 instead of 3.", avoid: "Also expand from `l = c`, `r = c + 1`." },
    { title: "Counting distinct palindromes", what: "Putting the found palindromes into a set.", why: "\"Palindromic substrings\" sounds like distinct strings.", breaks: "For `\"aaa\"` the set holds 3 strings, but the answer is 6 because substrings at different positions are counted separately.", avoid: "Count positions: add one for every successful comparison." },
    { title: "Counting after the loop instead of inside it", what: "Adding one per centre.", why: "\"One palindrome per centre\".", breaks: "A centre can produce many palindromes (`aaaaa` from the middle gives 3): only one is counted.", avoid: "`count++` inside the `while`, at each successful comparison." },
    { title: "Reading outside the string", what: "`while (s[l] == s[r] && l >= 0 && r < n)`.", why: "The comparison is written first.", breaks: "`s[-1]` or `s[n]` is read before the bounds check fails: undefined behaviour in C++.", avoid: "Check `l >= 0 && r < n` first." },
    { title: "Using three nested loops", what: "Test every substring with a palindrome function.", why: "It follows the definition.", breaks: "$O(n^3)$ is too slow for $n = 1000$.", avoid: "Expand from the centres, so each palindrome is found with one comparison." },
  ],

  followUps: [
    {
      q: "Solve it with **dynamic programming**.",
      a: "`dp[i][j]` is true when `s[i..j]` is a palindrome: `s[i] == s[j]` and (`j − i < 2` or `dp[i+1][j−1]`). Count the true entries while filling the table with `i` going downwards. $O(n^2)$ time and $O(n^2)$ space, whereas the centre expansion needs $O(1)$ space.",
      cpp: `int countDP(string s) {
    int n = s.size(), count = 0;
    vector<vector<bool>> dp(n, vector<bool>(n, false));
    for (int i = n - 1; i >= 0; i--)
        for (int j = i; j < n; j++)
            if (s[i] == s[j] && (j - i < 2 || dp[i + 1][j - 1])) { dp[i][j] = true; count++; }
    return count;
}`,
      js: `function countDP(s) {
  const n = s.length;
  let count = 0;
  const dp = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = n - 1; i >= 0; i--)
    for (let j = i; j < n; j++)
      if (s[i] === s[j] && (j - i < 2 || dp[i + 1][j - 1])) { dp[i][j] = true; count++; }
  return count;
}`,
      time: "O(n²)", space: "O(n²)",
    },
    {
      q: "Count the **distinct** palindromic substrings.",
      a: "Collect them in a hash set while expanding (each success inserts `s.substr(l, r-l+1)`), or use a palindromic tree (eertree), which finds all distinct palindromes in $O(n)$. With the set the cost is $O(n^2)$ expansions plus $O(n)$ per insertion for the hashing.",
      time: "O(n³) with a set, O(n) with an eertree", space: "O(n²) with a set, O(n) with an eertree",
    },
    {
      q: "Count in $O(n)$ with **Manacher's algorithm**.",
      a: "Manacher computes, for every centre, the radius of the longest palindrome around it in total linear time. A centre with radius `r` contributes `r` palindromes, so the answer is the sum of the radii (with the right adjustment for odd and even centres).",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Return the **longest** palindromic substring.",
      a: "Keep, in the same expansion, the largest `r − l + 1` seen and its start. That is the previous lesson: it only adds two variables to this loop.",
      time: "O(n²)", space: "O(1)",
    },
  ],

  related: [
    { id: "longest-palindromic-substring", why: "The same expansion, but keeping only the longest palindrome." },
    { id: "valid-palindrome", why: "Checks one whole string for being a palindrome." },
    { id: "decode-ways", why: "Another counting problem on a string, solved with a recurrence rather than centres." },
    { id: "climbing-stairs", why: "A counting problem where the answer grows quickly but each step is cheap." },
  ],
  patternNote: "**Count while you expand.** In expand-around-centre, every successful comparison *is* a palindrome. That turns a search for the longest one into a count of all of them with no extra work, and shows why the same loop answers both questions.",
  takeaways: [
    "Every palindromic substring has exactly one centre: a letter (odd) or a gap (even), $2n − 1$ in all.",
    "Expand with `l--, r++` while `l >= 0 && r < n && s[l] == s[r]`, and add one to `count` on every match.",
    "Count **positions** (not distinct strings): `aaa` has 6.",
    "Both parities are needed, and `count++` goes inside the loop.",
    "Time $O(n^2)$ (the answer can be $n(n+1)/2$), space $O(1)$.",
  ],
});
