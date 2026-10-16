SHEETS.define({
  id: "longest-common-subsequence",
  viz: "dp",
  io: { fn: "longestCommonSubsequence", params: [["text1", "str"], ["text2", "str"]], ret: "int" },

  statement: `Given two strings \`text1\` and \`text2\`, return the **length of their longest common subsequence**. If there is none, return \`0\`.

A **subsequence** is a string obtained from another by deleting some characters (possibly none) **without changing the order** of the rest. For example \`"ace"\` is a subsequence of \`"abcde"\`. A *common* subsequence is a subsequence of both strings.`,
  examples: [
    { input: 'text1 = "abcde", text2 = "ace"', output: "3", explain: 'The longest common subsequence is `"ace"`, of length 3.' },
    { input: 'text1 = "abc", text2 = "abc"', output: "3", explain: 'The strings are identical: `"abc"`.' },
    { input: 'text1 = "abc", text2 = "def"', output: "0", explain: "They share no character." },
  ],
  constraints: ["$1 \\le$ `text1.length`, `text2.length` $\\le 1000$", "Both strings consist of lowercase English letters."],
  check(input) { return input.text1.length > 9 || input.text2.length > 9 ? "for the animation use strings of at most 9 characters" : null; },

  intuition: {
    find: "The **length of the longest sequence of characters that appears, in the same order, in both strings** (characters may be skipped, but not reordered).",
    beginner: "Recursion on the ends of the strings: compare `text1[i]` with `text2[j]`. If they match, that character is part of a common subsequence: `1 + lcs(i+1, j+1)`. If not, skip one of them: `max(lcs(i+1, j), lcs(i, j+1))`.",
    works: "Either the first characters are equal (and matching them is never worse than skipping), or at least one of them is not in the optimal subsequence, so trying both skips covers every possibility.",
    slow: "Every mismatch branches into two calls, so the tree has up to $2^{m+n}$ nodes. Two strings of length 20 already means about a trillion calls.",
    repeat: "The call `lcs(i, j)` is reached from many different histories, and its answer depends only on the **suffixes** `text1[i..]` and `text2[j..]`. We recompute it every time.",
    remember: "There are only `(m + 1) × (n + 1)` different pairs `(i, j)`. Store the answer for each pair in a table: `dp[i][j]` = the LCS length of the **first `i`** characters of `text1` and the **first `j`** characters of `text2`.",
    observation: "Look at the last characters `a = text1[i−1]` and `b = text2[j−1]`. If **`a == b`**, they can be matched at the end of a common subsequence: `dp[i][j] = dp[i−1][j−1] + 1`. If **`a ≠ b`**, they cannot both be the final matched pair, so at least one is unused: `dp[i][j] = max(dp[i−1][j], dp[i][j−1])`. Row 0 and column 0 are 0 (an empty string shares nothing).",
    leads: "Fill an `(m+1) × (n+1)` table row by row with those two rules; the answer is the bottom-right cell. Each cell takes constant time: $O(mn)$ in total.",
  },

  flow: [
    "Recurse on the first characters: match them, or skip one of the two.",
    "A match is never worse than skipping; otherwise try both skips: all cases covered.",
    "Up to $2^{m+n}$ calls recomputing the same suffix pairs.",
    "Only $(m+1)(n+1)$ pairs: `dp[i][j]` = LCS of the first `i` and the first `j` characters.",
    "Equal last characters → `dp[i−1][j−1] + 1`; different → `max(dp[i−1][j], dp[i][j−1])`.",
    "Fill the table: $O(mn)$ time and space (a rolling row gives $O(\\min(m, n))$).",
  ],

  brute: {
    idea: "**Brute force (recursion):** `lcs(i, j)` is `0` if either string is used up; if `text1[i] == text2[j]` it is `1 + lcs(i + 1, j + 1)`; otherwise it is `max(lcs(i + 1, j), lcs(i, j + 1))`.",
    why: "Each mismatch makes two calls, so the number of calls is exponential, about $2^{m+n}$ in the worst case (when there are no matches at all). Only $(m + 1)(n + 1)$ distinct `(i, j)` pairs exist, so almost all the work is repeated.",
    time: "O(2^(m+n))", space: "O(m+n)",
    measure: { fTex: "2^{2n}", f: (n) => Math.pow(2, 2 * n), ns: [5, 10, 15, 20, 30] },
    cpp: `class Solution {
    int lcs(const string& a, const string& b, int i, int j) {
        if (i == (int)a.size() || j == (int)b.size()) return 0;
        if (a[i] == b[j]) return 1 + lcs(a, b, i + 1, j + 1);
        return max(lcs(a, b, i + 1, j), lcs(a, b, i, j + 1));
    }
public:
    int longestCommonSubsequence(string text1, string text2) { return lcs(text1, text2, 0, 0); }
};`,
    js: `function longestCommonSubsequence(text1, text2) {
  const lcs = (i, j) => {
    if (i === text1.length || j === text2.length) return 0;
    if (text1[i] === text2[j]) return 1 + lcs(i + 1, j + 1);
    return Math.max(lcs(i + 1, j), lcs(i, j + 1));
  };
  return lcs(0, 0);
}`,
  },

  pattern: {
    name: "Dynamic Programming (2D, two sequences)",
    why: "When a problem compares **two sequences** and the answer for the whole depends on the answer for **prefixes of both**, the natural state is a pair `(i, j)` = *\"the first `i` characters of A and the first `j` of B\"*. That gives a two-dimensional table whose cell depends on its top, left and top-left neighbours.",
    recognize: [
      "Two strings/arrays and a question about **alignment, matching or transforming** one into the other (common subsequence, edit distance, interleaving).",
      "The recursion advances one or both pointers and the pair `(i, j)` repeats.",
      "A **match** moves both indices diagonally; a **mismatch** moves one of them.",
      "The table has size `(m + 1) × (n + 1)` with an empty-prefix row and column.",
    ],
  },

  optimal: {
    idea: "Let `dp[i][j]` be the LCS length of the first `i` characters of `text1` and the first `j` characters of `text2`. If the last characters `text1[i−1]` and `text2[j−1]` are equal, they extend the best common subsequence of the shorter prefixes by one: `dp[i−1][j−1] + 1`. If they differ, drop one of the two last characters and take the better result: `max(dp[i−1][j], dp[i][j−1])`. Row 0 and column 0 are all 0.",
    steps: [
      "Create `dp[0..m][0..n]` filled with `0` (the empty-prefix row and column stay 0).",
      "For `i` from `1` to `m` and `j` from `1` to `n`:",
      "if `text1[i−1] == text2[j−1]`: `dp[i][j] = dp[i−1][j−1] + 1`.",
      "otherwise: `dp[i][j] = max(dp[i−1][j], dp[i][j−1])`.",
      "Return `dp[m][n]`.",
    ],
    invariant: "**`dp[i][j]` is the exact LCS length of `text1[0..i)` and `text2[0..j)`**, and the three cells it reads are already final when it is computed.",
    correct: "*If the last characters match:* some optimal common subsequence of the two prefixes can be assumed to end with that character (matching them is never worse: any optimal solution that ends elsewhere can be modified to use them), so `dp[i][j] = 1 + dp[i−1][j−1]`. *If they differ:* an optimal common subsequence cannot use both last characters (it would have to match them to each other). So it is also a common subsequence of `(i−1, j)` or of `(i, j−1)`, and `dp[i][j] = max` of those two. With an empty prefix the only common subsequence is empty. Row-major order computes the three needed neighbours first.",
  },

  cpp: `class Solution {
public:
    int longestCommonSubsequence(string a, string b) {
        int m = a.size(), n = b.size();
        vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));            // row/col 0 = empty prefix //@init
        for (int i = 1; i <= m; i++)                                     //@loopi
            for (int j = 1; j <= n; j++)                                 //@loopj
                if (a[i - 1] == b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;        // match //@match
                else dp[i][j] = max(dp[i - 1][j], dp[i][j - 1]);                  // skip one //@skip
        return dp[m][n];                                                 //@ret
    }
};`,
  js: `function longestCommonSubsequence(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));   // row/col 0 = empty prefix //@init
  for (let i = 1; i <= m; i++)                                         //@loopi
    for (let j = 1; j <= n; j++)                                       //@loopj
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;      // match //@match
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);            // skip one //@skip
  return dp[m][n];                                                     //@ret
}`,

  tests: [
    { name: "Example 1: \"abcde\" / \"ace\"", kind: "normal", input: { text1: "abcde", text2: "ace" } },
    { name: "Example 2: identical strings", kind: "normal", input: { text1: "abc", text2: "abc" } },
    { name: "Example 3: nothing in common", kind: "normal", input: { text1: "abc", text2: "def" } },
    { name: "A subsequence is not a substring", kind: "edge", input: { text1: "abcbdab", text2: "bdcaba" }, why: "The answer is 4 (`bcba` or `bdab`), made of characters that are **not contiguous** in either string. Confusing this with *Longest Common Substring* (contiguous) would give a much smaller number." },
    { name: "Repeated characters", kind: "edge", input: { text1: "aaaa", text2: "aa" }, why: "The longer string has more copies than needed, so the answer is limited by the shorter string (2). It checks that characters can be matched at most once each (the diagonal move uses both)." },
    { name: "One string inside the other", kind: "edge", input: { text1: "ace", text2: "abcde" }, why: "`text1` is a subsequence of `text2`, so the answer is the full length of `text1` (3). The table is also the transpose of the first example's: the LCS is symmetric." },
    { name: "Single equal characters", kind: "corner", input: { text1: "a", text2: "a" }, why: "A 1 × 1 table with one match: `dp[1][1] = dp[0][0] + 1 = 1`. The empty-prefix row and column are what make this base case work." },
    { name: "Single different characters", kind: "corner", input: { text1: "a", text2: "b" }, why: "One mismatch: `max(dp[0][1], dp[1][0]) = 0`." },
    { name: "An empty string (outside the constraints)", kind: "corner", input: { text1: "", text2: "abc" }, why: "With an empty string the table has only row 0, and the answer is `0`: the empty prefix shares nothing." },
  ],

  trace(input, T) {
    const a = input.text1, b = input.text2, m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));
    let whyMatch = false, whySkip = false, whyZero = false;
    const rowHead = ["ε", ...a.split("")], colHead = ["ε", ...b.split("")];
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) if (dp[i][j] !== null) hl[i + "," + j] = i === 0 || j === 0 ? "dim" : "ok";
      if (deps) deps.forEach((d) => (hl[d[0] + "," + d[1]] = "cmp"));
      if (cur) hl[cur[0] + "," + cur[1]] = "cur";
      if (o.answer) hl[m + "," + n] = "hit";
      return { dps: [{ label: `dp[i][j] = LCS length of the first i characters of "${a}" and the first j characters of "${b}"`, dp: dp.map((r) => r.slice()), hl, cur: cur || null, deps: deps || [], rowHead, colHead }], formula: o.formula };
    };
    T.step("init", { vars: { m, n }, state: S(null, null, { formula: "row 0 and column 0 are 0: an empty string shares nothing" }), phase: "Set up the table", say: `The table has ${m + 1} rows and ${n + 1} columns. \`dp[i][j]\` is the LCS length of the first **i** characters of "${a}" and the first **j** characters of "${b}". Row 0 and column 0 (an empty prefix) are **0**.`, op: `dp = (m+1) × (n+1) zeros`, act: "START",
      why: whyZero ? null : { title: "Why is row 0 and column 0 all zeros?", text: "A common subsequence of an empty string and anything else must be empty, so its length is 0. These cells are the base cases that every other cell is built on." } });
    whyZero = true;
    T.phase("Fill row by row");
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const x = a[i - 1], y = b[j - 1];
      if (x === y) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        T.step("match", { vars: { i, j, "a[i−1]": x, "b[j−1]": y, "dp[i−1][j−1]": dp[i - 1][j - 1], "dp[i][j]": dp[i][j] }, state: S([i, j], [[i - 1, j - 1]], { formula: `'${x}' = '${y}'  →  dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i - 1][j - 1]} + 1 = ${dp[i][j]}` }), say: `The last characters **'${x}'** and **'${y}'** are equal: they can be matched together at the end of a common subsequence. So \`dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}\` (the diagonal neighbour plus the new matched character).`, op: `${x} == ${y}  ⇒  dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}`, act: "MATCH",
          why: whyMatch ? null : { title: "Why the diagonal cell?", text: `Matching the last two characters uses up one character from EACH string, so what is left is the first ${i - 1} characters of the first string and the first ${j - 1} of the second: the diagonal cell dp[${i - 1}][${j - 1}].` } });
        whyMatch = true;
      } else {
        const up = dp[i - 1][j], left = dp[i][j - 1];
        dp[i][j] = Math.max(up, left);
        T.step("skip", { vars: { i, j, "a[i−1]": x, "b[j−1]": y, "dp[i−1][j]": up, "dp[i][j−1]": left, "dp[i][j]": dp[i][j] }, state: S([i, j], [[i - 1, j], [i, j - 1]], { formula: `'${x}' ≠ '${y}'  →  dp[${i}][${j}] = max(dp[${i - 1}][${j}], dp[${i}][${j - 1}]) = max(${up}, ${left}) = ${dp[i][j]}` }), say: `**'${x}'** and **'${y}'** differ, so they cannot both be the last matched pair. Either \`${x}\` is not used (look *up*: ${up}) or \`${y}\` is not used (look *left*: ${left}). Take the better: **${dp[i][j]}**.`, op: `${x} != ${y}  ⇒  dp[${i}][${j}] = max(${up}, ${left}) = ${dp[i][j]}`, act: "SKIP_ONE",
          why: whySkip ? null : { title: "Why up OR left?", text: "If the last characters differ, at least one of them is not part of the optimal common subsequence. Dropping 'a' leaves the cell above; dropping 'b' leaves the cell on the left. We do not know which is right, so we keep the larger." } });
        whySkip = true;
      }
    }
    T.step("ret", { vars: { answer: dp[m][n] }, state: S(null, null, { answer: true, formula: `answer = dp[${m}][${n}] = ${dp[m][n]}` }), say: `The bottom-right cell is the LCS length of the **whole** strings: **${dp[m][n]}**.`, op: `return dp[${m}][${n}] = ${dp[m][n]}`, act: "DONE" });
    T.result(dp[m][n]);
  },
  fuzz(rnd) { const mk = () => { const n = 1 + Math.floor(rnd() * 7); let s = ""; for (let i = 0; i < n; i++) s += "abc"[Math.floor(rnd() * 3)]; return s; }; return { text1: mk(), text2: mk() }; },
  gen(n) { return { text1: "a".repeat(n), text2: "a".repeat(n) }; },

  complexity: {
    time: {
      tex: "O(m \\cdot n)", title: "one constant-time cell per pair of prefix lengths", short: "m × n cells, each a comparison and a max",
      derive: [
        "\\#\\text{cells} = m \\cdot n \\;(\\text{plus the base row and column}) || one cell for every pair $(i, j)$ with $i, j \\ge 1$",
        "T(m, n) = c_0 + \\sum_{i=1}^{m} \\sum_{j=1}^{n} c || each cell compares two characters and reads up to two neighbours",
        "T(m, n) = c_0 + c\\,m\\,n || the double sum has $mn$ equal terms",
        "!T(m, n) = O(m \\cdot n) || versus $2^{m+n}$ for the recursion",
      ],
      where: "A DP costs *(number of states) × (work per state)*. The states are the $(m+1)(n+1)$ pairs of prefix lengths. For two strings of length 1000 that is $10^6$ cells, instant, versus $2^{2000}$ for the recursion.",
    },
    space: {
      tex: "O(m \\cdot n)", title: "the full table", short: "reducible to O(min(m, n)) with two rolling rows",
      derive: [
        "S = (m+1)(n+1) \\cdot s_{\\text{int}} || the table",
        "!S = O(mn) \\;\\to\\; O(\\min(m,n)) \\text{ with two rows} || a cell reads only the previous row and its own row",
      ],
      where: "If you only need the *length*, keep two rows. If you also need the subsequence itself you must keep the table to walk back through it (follow-up).",
    },
    limit: "For two general strings, $O(mn)$ is essentially optimal: there is no known strongly sub-quadratic algorithm (and a faster one would refute the *Strong Exponential Time Hypothesis*). Specialised algorithms exist for small alphabets or few differences.",
    measure: { label: "n = length of both strings", fTex: "n^2", f: (n) => n * n, sizes: [4, 8, 12, 16, 24, 32], growth: "quadratic", reading: "Doubling both lengths multiplies the work by about **4**: the number of cells is $n^2$." },
  },

  mistakes: [
    { title: "Confusing subsequence with substring", what: "Requiring matched characters to be contiguous.", why: "Both words sound alike.", breaks: "The `max(up, left)` rule would be replaced by resetting to 0 on a mismatch (the *Longest Common Substring* recurrence), giving smaller answers.", avoid: "Subsequence: characters may be skipped; on a mismatch carry the best of the neighbours." },
    { title: "Indexing the strings with `i` and `j` instead of `i − 1` and `j − 1`", what: "`if (a[i] == b[j])` inside a table of size `(m+1) × (n+1)`.", why: "Mixing prefix **lengths** with character **positions**.", breaks: "Off by one: it compares the *next* characters, and reads `a[m]` (out of bounds) at the end.", avoid: "`dp[i][j]` is about the first `i`, `j` characters, so their last characters are `a[i−1]`, `b[j−1]`." },
    { title: "Using the left/up cells on a match", what: "`dp[i][j] = max(dp[i−1][j], dp[i][j−1]) + 1`.", why: "Thinking \"a match adds 1 to the best so far\".", breaks: "It can reuse a character from one string twice (a character matched earlier may be counted again), overcounting.", avoid: "A match consumes one character from **each** string: `dp[i−1][j−1] + 1`." },
    { title: "Forgetting the empty-prefix row and column", what: "A table of size `m × n` with 0-based string indices.", why: "Saving one row and column.", breaks: "The first row/column need special `if` statements, and it is easy to read `dp[−1][…]`.", avoid: "Use `(m+1) × (n+1)` and let row 0 / column 0 be the zeros." },
    { title: "Plain recursion", what: "The two-call recursion without a memo.", why: "It is the direct definition.", breaks: "Exponential: strings of length 25 already take seconds.", avoid: "Memoise `(i, j)` or fill the table." },
  ],

  followUps: [
    {
      q: "Reduce the space to **two rows** (or one row).",
      a: "Row `i` depends only on row `i − 1` and itself, so keep two arrays (`prev` and `cur`) of length `n + 1` and swap them after each row. Choose `text2` as the shorter string to get $O(\\min(m, n))$ space. The time is unchanged.",
      cpp: `int lcsTwoRows(const string& a, const string& b) {
    int m = a.size(), n = b.size();
    vector<int> prev(n + 1, 0), cur(n + 1, 0);
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++)
            cur[j] = a[i - 1] == b[j - 1] ? prev[j - 1] + 1 : max(prev[j], cur[j - 1]);
        swap(prev, cur);
    }
    return prev[n];
}`,
      js: `function lcsTwoRows(a, b) {
  const m = a.length, n = b.length;
  let prev = new Array(n + 1).fill(0), cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++)
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}`,
      time: "O(mn)", space: "O(min(m,n))",
    },
    {
      q: "Return the **subsequence itself**, not just its length.",
      a: "Keep the whole table and **walk back** from `dp[m][n]`: if the characters `a[i−1]` and `b[j−1]` are equal, they belong to the answer: record the character and move to `(i−1, j−1)`; otherwise move to whichever of `(i−1, j)` or `(i, j−1)` has the larger value. Reverse the recorded characters at the end. $O(m + n)$ extra for the walk.",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Compute the **edit distance** (*Levenshtein*) between two strings.",
      a: "Same table, different recurrence: `dp[i][j]` = the minimum number of insertions, deletions and substitutions to turn the first `i` characters of `a` into the first `j` of `b`. If the characters match, `dp[i][j] = dp[i−1][j−1]`; otherwise `1 + min(dp[i−1][j] (delete), dp[i][j−1] (insert), dp[i−1][j−1] (replace))`. Base: `dp[i][0] = i`, `dp[0][j] = j`.",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Find the **longest palindromic subsequence** of a single string.",
      a: "A palindrome reads the same backwards, so its length is the LCS of the string with its **reverse**. Compute `lcs(s, reverse(s))` in $O(n^2)$. (Compare with the *Longest Palindromic Substring* lesson, which asks for a contiguous palindrome.)",
      time: "O(n²)", space: "O(n²)",
    },
  ],

  related: [
    { id: "unique-paths", why: "A 2D table where each cell is built from its top and left neighbours: the same shape." },
    { id: "longest-increasing-subsequence", why: "Another subsequence problem on one sequence (the LCS of a sequence with its sorted copy is its LIS)." },
    { id: "word-break", why: "A prefix DP deciding whether a prefix can be built from valid pieces." },
    { id: "longest-palindromic-substring", why: "Another string DP, with a table indexed by the two ends of a substring." },
  ],
  patternNote: "**Two-sequence DP** uses the pair `(i, j)` of prefix lengths as the state. Match cases advance both indices (the diagonal), mismatch cases drop one character (up or left). The same table with a different recurrence gives LCS, edit distance, interleaving strings and many alignment problems.",
  takeaways: [
    "`dp[i][j]` = LCS of the first `i` characters of A and the first `j` of B; row 0 and column 0 are 0.",
    "Last characters equal → `dp[i−1][j−1] + 1` (diagonal); different → `max(dp[i−1][j], dp[i][j−1])`.",
    "Use `a[i−1]` and `b[j−1]` for the last characters of the prefixes.",
    "Time $O(mn)$, space $O(mn)$ → $O(\\min(m, n))$ with rolling rows; walk the table back to rebuild the subsequence.",
    "A subsequence may skip characters; a substring may not.",
  ],
});
