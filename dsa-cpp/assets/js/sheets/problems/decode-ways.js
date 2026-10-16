SHEETS.define({
  id: "decode-ways",
  viz: "dp",
  io: { fn: "numDecodings", params: [["s", "str"]], ret: "int" },

  statement: `A message of letters was encoded as digits using \`A → 1, B → 2, …, Z → 26\`. To **decode** a digit string, split it into groups and map each group back to a letter. For example \`"11106"\` can be read as \`"AAJF"\` (\`1 1 10 6\`) or \`"KJF"\` (\`11 10 6\`). A group may not have a leading zero, so \`"06"\` is invalid (and \`"6"\` is not the same as \`"06"\`).

Given a digit string \`s\`, return the **number of ways** to decode it (or \`0\` if it cannot be decoded).`,
  examples: [
    { input: 's = "12"', output: "2", explain: '"AB" (`1 2`) or "L" (`12`).' },
    { input: 's = "226"', output: "3", explain: '"BZ" (`2 26`), "VF" (`22 6`) or "BBF" (`2 2 6`).' },
    { input: 's = "06"', output: "0", explain: '`"06"` starts with a zero; `"0"` maps to no letter and `"06"` is not allowed.' },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 100$", "`s` contains only digits and may contain leading zero(s)."],
  check(input) { return !/^\d+$/.test(input.s) ? "s must consist only of digits (written in quotes, e.g. \"226\")" : input.s.length > 24 ? "for the animation use at most 24 digits" : null; },

  intuition: {
    find: "The number of different ways to cut the digit string into pieces of 1 or 2 digits, each piece being a valid letter code (`1..26`, no leading zero).",
    beginner: "Recursion on the position: at index `i` you can take one digit (if it is not `0`) and decode the rest, or take two digits (if they form `10..26`) and decode the rest. Add the two counts.",
    works: "Every decoding is a sequence of 1- and 2-digit pieces, so splitting on the *first piece* partitions all decodings; the base case is reaching the end (one complete decoding).",
    slow: "Each call makes up to two calls, so the number of calls can reach Fibonacci-like exponential growth (`\"1111111111\"` is the worst).",
    repeat: "Different splits arrive at the same position: after reading `1 1` or `11` we are at index 2 either way, yet the count for the remaining string is recomputed.",
    remember: "Let `dp[i]` be the number of ways to decode the **first `i` characters**. There are only `n + 1` of these, and each depends on at most the two before it.",
    observation: "Look at the **last piece** of a decoding of the first `i` characters. It is either the single digit `s[i−1]` (valid if it is not `'0'`), leaving a decoding of `i − 1` characters, or the two digits `s[i−2..i−1]` (valid if between 10 and 26), leaving `i − 2` characters. So `dp[i] = (single valid ? dp[i−1] : 0) + (pair valid ? dp[i−2] : 0)`. This is exactly *Climbing Stairs* with **conditions** on each step.",
    leads: "`dp[0] = 1` (the empty prefix has one decoding), `dp[1] = (s[0] != '0')`, then for `i ≥ 2` apply the two conditional additions. Return `dp[n]`. $O(n)$ time.",
  },

  flow: [
    "Recurse on the first piece: one digit or two digits.",
    "Every decoding starts with a 1- or 2-digit piece, so all are counted once.",
    "Exponentially many calls, with repeated positions.",
    "`dp[i]` = ways to decode the first `i` characters.",
    "Look at the last piece: one digit (not `0`) adds `dp[i−1]`; two digits (`10..26`) add `dp[i−2]`.",
    "A conditional Climbing Stairs: $O(n)$ time, $O(n)$ space (reducible to $O(1)$).",
  ],

  brute: {
    idea: "**Brute force (recursion):** `ways(i)` = the number of decodings of `s[i..]`. If `i == n` return 1. If `s[i] == '0'` return 0. Otherwise `ways(i + 1)`, plus `ways(i + 2)` if the two digits `s[i..i+1]` form a number from 10 to 26.",
    why: "Each call can spawn two calls, and many branches reach the same index, so the tree grows exponentially (e.g. `\"1111…1\"` gives a Fibonacci-sized tree). There are only `n + 1` distinct indices.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "\\approx \\varphi^n", f: (n) => Math.pow(1.618, n), ns: [10, 20, 30, 50, 100] },
    cpp: `class Solution {
    int ways(const string& s, int i) {
        int n = s.size();
        if (i == n) return 1;
        if (s[i] == '0') return 0;
        int r = ways(s, i + 1);
        if (i + 1 < n && (s[i] == '1' || (s[i] == '2' && s[i + 1] <= '6'))) r += ways(s, i + 2);
        return r;
    }
public:
    int numDecodings(string s) { return ways(s, 0); }
};`,
    js: `function numDecodings(s) {
  const n = s.length;
  const ways = (i) => {
    if (i === n) return 1;
    if (s[i] === "0") return 0;
    let r = ways(i + 1);
    if (i + 1 < n && (s[i] === "1" || (s[i] === "2" && s[i + 1] <= "6"))) r += ways(i + 2);
    return r;
  };
  return ways(0);
}`,
  },

  pattern: {
    name: "Dynamic Programming (1D, conditional steps)",
    why: "The structure is that of *Climbing Stairs* (the last piece has length 1 or 2), except that each piece is only allowed when it satisfies a rule (not `0`; between 10 and 26). DP handles the conditions naturally: an invalid piece simply contributes 0.",
    recognize: [
      "Counting **ways to split** a string/array into pieces of limited length.",
      "Each piece has a **validity rule** (a range, a dictionary, no leading zero).",
      "The recursion branches on *piece length* and positions repeat.",
      "The state is *the prefix length*, and the recurrence looks back by the allowed piece lengths.",
    ],
  },

  optimal: {
    idea: "`dp[i]` is the number of ways to decode the first `i` characters. The empty prefix has one decoding (`dp[0] = 1`). For `i ≥ 1`: the last character alone counts if it is not `'0'` (add `dp[i − 1]`), and the last two characters count if they form a number between 10 and 26 (add `dp[i − 2]`).",
    steps: [
      "Create `dp[0..n]` of zeros and set `dp[0] = 1`; set `dp[1] = 1` if `s[0] != '0'`, else `0`.",
      "For `i` from `2` to `n`:",
      "if `s[i − 1] != '0'`, add `dp[i − 1]` (the last character is a letter code 1–9).",
      "if the two digits `s[i − 2..i − 1]` form a number in `[10, 26]`, add `dp[i − 2]`.",
      "Return `dp[n]`.",
    ],
    invariant: "**`dp[i]` is exactly the number of valid decodings of `s[0..i−1]`**, built only from `dp[i − 1]` and `dp[i − 2]`.",
    correct: "Every decoding of the first `i` characters ends with a final piece of length 1 or 2. Length 1: the piece is `s[i − 1]`, valid iff it is `'1'..'9'`, and what remains is any decoding of the first `i − 1` characters. Length 2: the piece is `s[i − 2..i − 1]`, valid iff its value is in `10..26` (the first digit is then non-zero), and what remains is any decoding of the first `i − 2` characters. The two kinds are disjoint (different last-piece lengths) and cover all decodings, so the counts add. The empty prefix has exactly one decoding, the base for pieces that start at position 0.",
  },

  cpp: `class Solution {
public:
    int numDecodings(string s) {
        int n = s.size();
        vector<int> dp(n + 1, 0);                              // dp[i] = decodings of s[0..i) //@init
        dp[0] = 1;                                             // the empty prefix //@seed
        dp[1] = s[0] != '0' ? 1 : 0;                           //@seed1
        for (int i = 2; i <= n; i++) {                         //@loop
            if (s[i - 1] != '0') dp[i] += dp[i - 1];           // last char alone //@one
            int two = (s[i - 2] - '0') * 10 + (s[i - 1] - '0');
            if (two >= 10 && two <= 26) dp[i] += dp[i - 2];    // last two chars //@two
        }
        return dp[n];                                          //@ret
    }
};`,
  js: `function numDecodings(s) {
  const n = s.length;
  const dp = new Array(n + 1).fill(0);                         // dp[i] = decodings of s[0..i) //@init
  dp[0] = 1;                                                   // the empty prefix //@seed
  dp[1] = s[0] !== "0" ? 1 : 0;                                //@seed1
  for (let i = 2; i <= n; i++) {                               //@loop
    if (s[i - 1] !== "0") dp[i] += dp[i - 1];                  // last char alone //@one
    const two = Number(s[i - 2]) * 10 + Number(s[i - 1]);
    if (two >= 10 && two <= 26) dp[i] += dp[i - 2];            // last two chars //@two
  }
  return dp[n];                                                //@ret
}`,

  tests: [
    { name: "Example 1: \"12\"", kind: "normal", input: { s: "12" } },
    { name: "Example 2: \"226\"", kind: "normal", input: { s: "226" } },
    { name: "Example 3: \"06\"", kind: "normal", input: { s: "06" } },
    { name: "A zero that must pair: \"10\"", kind: "edge", input: { s: "10" }, why: "The `0` cannot stand alone (there is no letter for 0), so it must join the `1` to form `10` = `J`. Only one decoding exists: `dp[2] = dp[0] = 1`. The single-digit rule skips the `'0'` while the two-digit rule accepts `10`." },
    { name: "Two zeros in a row: \"100\"", kind: "edge", input: { s: "100" }, why: "`00` is not a valid piece and `0` alone is not valid, so the string cannot be decoded: `dp[3] = 0`. A zero can only be used as the second digit of `10` or `20`; the `'0'` after `10` has nothing left to pair with." },
    { name: "Pair too large: \"27\"", kind: "edge", input: { s: "27" }, why: "`27` is above 26, so it cannot be one letter; only `2 7` works: exactly 1 way. It checks the upper boundary of the two-digit rule." },
    { name: "A single zero: \"0\"", kind: "corner", input: { s: "0" }, why: "There is no letter for 0, so there are zero decodings. The seed `dp[1] = (s[0] != '0')` is what encodes this; assuming `dp[1] = 1` would be wrong." },
    { name: "A single digit: \"7\"", kind: "corner", input: { s: "7" }, why: "One digit gives one decoding. The loop (which starts at `i = 2`) never runs; the answer comes from the seed `dp[1] = 1`." },
    { name: "Many splits: \"1111111\"", kind: "corner", input: { s: "1111111" }, why: "Every position can be a 1-digit or a 2-digit piece, so the answer is a Fibonacci number (21 for seven digits): the worst case for the recursion and the same recurrence as Climbing Stairs." },
    { name: "Zeros mixed in: \"2101\"", kind: "corner", input: { s: "2101" }, why: "`2 10 1` is the only decoding: `10` must stay together, and `01` is invalid. The conditions on both rules prune everything else." },
  ],

  trace(input, T) {
    const s = input.s, n = s.length, chars = s.split("");
    const dp = Array.from({ length: n + 1 }, () => null);
    dp[0] = 1;
    let whyZero = false, whyPair = false, whyBase = false;
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i <= n; i++) if (dp[i] !== null) hl[i] = dp[i] === 0 ? "bad" : "ok";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = "cur";
      if (o.answer) hl[n] = "hit";
      const sh = {};
      if (o.win) for (let k = o.win[0]; k < o.win[1]; k++) sh[k] = o.winCls || "win";
      return { arrs: [{ label: "the digits of s", arr: chars, hl: sh }], dp: dp.slice(), hl, cur: cur ?? null, deps: deps || [], depLabels: o.depLabels || [], formula: o.formula, label: "dp[i] = number of ways to decode the first i characters" };
    };
    T.step("init", { vars: { n }, state: S(null), phase: "Set up the table", say: `\`dp[i]\` will be the number of ways to decode the **first i characters**. There are ${n} characters, so the table has ${n + 1} cells (\`dp[0] … dp[${n}]\`).`, op: `dp = vector(${n + 1}, 0)`, act: "START" });
    T.step("seed", { vars: { "dp[0]": 1 }, state: S(0, null, { formula: "dp[0] = 1   (the empty prefix has one decoding: the empty one)" }), say: "`dp[0] = 1`: there is exactly one way to decode **nothing**: the empty decoding. It is the base on which pieces that start at the beginning are built.", op: "dp[0] = 1", act: "BASE_CASE",
      why: { title: "Why is dp[0] = 1 and not 0?", text: "A decoding is a sequence of pieces. The empty prefix is decoded by the empty sequence of pieces, which is one valid way. If it were 0, every count would be multiplied away to 0." } });
    whyBase = true;
    dp[1] = s[0] !== "0" ? 1 : 0;
    T.step("seed1", { vars: { "dp[1]": dp[1], "s[0]": s[0] }, state: S(1, [0], { win: [0, 1], winCls: s[0] === "0" ? "bad" : "win", formula: `dp[1] = (s[0] != '0') ? 1 : 0 = ${dp[1]}` }), say: s[0] === "0" ? "The first character is `'0'`: there is no letter for 0, so there are **0** ways. Since everything else builds on this, the whole answer will be 0." : `The first character \`${s[0]}\` is a valid letter code, so there is **1** way to decode one character.`, op: `dp[1] = (s[0] != '0') = ${dp[1]}`, act: "FIRST_CHAR" });
    T.phase("Fill left to right: last piece = 1 or 2 characters");
    for (let i = 2; i <= n; i++) {
      dp[i] = 0;
      const c1 = chars[i - 1], two = Number(chars[i - 2]) * 10 + Number(c1);
      const okOne = c1 !== "0", okTwo = two >= 10 && two <= 26;
      T.step("loop", { vars: { i, "s[i−1]": c1, two }, state: S(i, [i - 1, i - 2], { win: [i - 2, i], formula: `dp[${i}] = [last char ≠ 0] · dp[${i - 1}] + [10 ≤ ${two} ≤ 26] · dp[${i - 2}]`, depLabels: ["1-digit piece", "2-digit piece"] }), say: `Computing **dp[${i}]**. The last piece of a decoding of the first ${i} characters is either the single digit \`${c1}\`, or the pair \`${chars[i - 2]}${c1}\` (= ${two}).`, op: `last char = ${c1},  last two = ${two}`, act: "TWO_OPTIONS" });
      T.step("one", { vars: { i, "s[i−1]": c1, [`dp[${i - 1}]`]: dp[i - 1] }, state: S(i, [i - 1], { win: [i - 1, i], winCls: okOne ? "ok" : "bad", formula: okOne ? `last digit ${c1} is a letter (1–9):  dp[${i}] += dp[${i - 1}] = ${dp[i - 1]}` : `last digit is '0': no letter, so add nothing` }), say: okOne ? `\`${c1}\` is a valid single-digit code (1–9), so every decoding of the first ${i - 1} characters extends by this letter: add \`dp[${i - 1}] = ${dp[i - 1]}\`.` : `\`${c1}\` is **0**: there is no letter for 0, so this piece is not allowed. Add nothing.`, op: okOne ? `s[${i - 1}] != '0'  ⇒  dp[${i}] += dp[${i - 1}]` : `s[${i - 1}] == '0'  ⇒  skip`, act: okOne ? "ADD_ONE_DIGIT" : "ZERO_NOT_ALLOWED",
        why: okOne || whyZero ? null : { title: "Why can a 0 not stand alone?", text: "The codes are 1–26, so there is no letter for 0 and no group may start with 0. A 0 can only be used as the second digit of 10 or 20, which the two-digit rule handles." } });
      if (!okOne) whyZero = true;
      if (okOne) dp[i] += dp[i - 1];
      T.step("two", { vars: { i, pair: two, [`dp[${i - 2}]`]: dp[i - 2] }, state: S(i, [i - 2], { win: [i - 2, i], winCls: okTwo ? "ok" : "bad", formula: okTwo ? `${two} is between 10 and 26:  dp[${i}] += dp[${i - 2}] = ${dp[i - 2]}  →  dp[${i}] = ${dp[i] + dp[i - 2]}` : `${two} is not in 10..26:  add nothing  →  dp[${i}] = ${dp[i]}` }), say: okTwo ? `\`${chars[i - 2]}${c1}\` = ${two} is between 10 and 26, a valid two-digit code. Every decoding of the first ${i - 2} characters extends by it: add \`dp[${i - 2}] = ${dp[i - 2]}\`.` : `\`${chars[i - 2]}${c1}\` = ${two} is ${two < 10 ? "below 10 (it has a leading zero)" : "above 26"}, so it is not a valid letter code. Add nothing.`, op: okTwo ? `10 ≤ ${two} ≤ 26  ⇒  dp[${i}] += dp[${i - 2}]` : `${two} not in [10, 26]  ⇒  skip`, act: okTwo ? "ADD_TWO_DIGITS" : "PAIR_NOT_VALID",
        why: whyPair ? null : { title: "Why 10..26 and not 0..26?", text: "A two-digit piece must not start with 0 (`06` is not `6`) and the largest letter is Z = 26. So the pair must be between 10 and 26 inclusive." } });
      whyPair = true;
      if (okTwo) dp[i] += dp[i - 2];
      if (dp[i] === 0 || okOne || okTwo) T.step("two", { vars: { i, "dp[i]": dp[i] }, state: S(i, null, { formula: `dp[${i}] = ${dp[i]}` }), say: dp[i] === 0 ? `Both options failed: **dp[${i}] = 0**. The first ${i} characters cannot be decoded at all.` : `Result: **dp[${i}] = ${dp[i]}** way${dp[i] === 1 ? "" : "s"} to decode the first ${i} characters.`, op: `dp[${i}] = ${dp[i]}`, act: dp[i] === 0 ? "DEAD_END" : "FILLED" });
    }
    T.step("ret", { vars: { "dp[n]": dp[n] }, state: S(n, null, { answer: true, formula: `answer = dp[${n}] = ${dp[n]}` }), say: dp[n] === 0 ? "The whole string **cannot be decoded**: the answer is **0**." : `All characters are used: there are **${dp[n]}** way${dp[n] === 1 ? "" : "s"} to decode \`${s}\`.`, op: `return dp[${n}] = ${dp[n]}`, act: "DONE" });
    T.result(dp[n]);
  },
  fuzz(rnd) { const n = 1 + Math.floor(rnd() * 9); let s = ""; for (let i = 0; i < n; i++) s += "0123456789"[rnd() < 0.3 ? 0 : Math.floor(rnd() * 10)]; return { s }; },
  gen(n) { return { s: "1".repeat(Math.max(1, n)) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one cell per character, two constant checks each", short: "n states, each with two conditional additions",
      derive: [
        "\\#\\text{states} = n + 1 || one cell per prefix length",
        "\\text{work per state} = c_1 + c_2 || a digit check and a two-digit range check, each followed by at most one addition",
        "T(n) = c_0 + (n-1)(c_1 + c_2) = c\\,n + c' || the loop runs $n - 1$ times",
        "!T(n) = O(n) || versus the exponential plain recursion",
      ],
      where: "Time is *(states) × (work per state)*: $n$ states, each $O(1)$. In the lab, the number of steps per character is constant, which the measured table confirms.",
    },
    space: {
      tex: "O(n)", title: "a table of n + 1 counts", short: "reducible to O(1): only the last two cells are read",
      derive: [
        "S(n) = (n + 1)\\cdot s_{\\text{int}} || the table",
        "!S(n) = O(n) \\;\\to\\; O(1) \\text{ with two rolling variables} || `dp[i]` reads only `dp[i−1]` and `dp[i−2]`",
      ],
      where: "Each cell uses the two before it, so two variables (`prev2`, `prev1`) are enough (first follow-up).",
    },
    limit: "Every character may change the answer, so $\\Omega(n)$ time is needed; $O(1)$ space is achievable, so both are tight.",
    measure: { label: "n = s.length", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Treating `\"0\"` or a leading-zero pair as valid", what: "Allowing `06` as 6, or `0` as a letter.", why: "Parsing the pair with `stoi` and checking `≤ 26` only.", breaks: "`\"06\"` would be counted as decodable (`6`), but it must give 0.", avoid: "The single-digit rule requires `'1'..'9'`; the pair rule requires the value in `10..26`." },
    { title: "Wrong seed `dp[1]` when `s[0] == '0'`", what: "`dp[1] = 1` unconditionally.", why: "\"One character, one way\".", breaks: "`\"0\"` or `\"06\"` would count a decoding that does not exist.", avoid: "`dp[1] = (s[0] != '0')`." },
    { title: "Using only the single-digit rule", what: "Treating the problem like counting subsequences of digits.", why: "Forgetting that two digits can form one letter.", breaks: "`\"12\"` gives 1 instead of 2 (`AB` only; the `L` is missed).", avoid: "Always consider both the 1-digit and the 2-digit last piece." },
    { title: "Using `dp[i − 1]` for the two-digit case", what: "`if (two valid) dp[i] += dp[i − 1];`", why: "Index slip.", breaks: "The pair uses two characters, so what remains is the first `i − 2` characters.", avoid: "Two-digit piece → `dp[i − 2]`." },
    { title: "Off-by-one with the empty prefix", what: "Indexing `dp` by character position instead of prefix length.", why: "Mixing `dp[i]` (first `i` characters) with `s[i]`.", breaks: "Reading `s[i]` when meaning `s[i − 1]` shifts everything by one.", avoid: "`dp[i]` is about the first `i` characters, so the last of them is `s[i − 1]`." },
  ],

  followUps: [
    {
      q: "Reduce the space to $O(1)$.",
      a: "Each cell reads only the previous two, so keep `prev2 = dp[i − 2]` and `prev1 = dp[i − 1]` and roll them: compute `cur` with the same two conditions, then `prev2 = prev1; prev1 = cur`.",
      cpp: `int numDecodingsO1(const string& s) {
    int prev2 = 1, prev1 = s[0] != '0' ? 1 : 0;       // dp[0], dp[1]
    for (int i = 2; i <= (int)s.size(); i++) {
        int cur = 0;
        if (s[i - 1] != '0') cur += prev1;
        int two = (s[i - 2] - '0') * 10 + (s[i - 1] - '0');
        if (two >= 10 && two <= 26) cur += prev2;
        prev2 = prev1; prev1 = cur;
    }
    return prev1;
}`,
      js: `function numDecodingsO1(s) {
  let prev2 = 1, prev1 = s[0] !== "0" ? 1 : 0;        // dp[0], dp[1]
  for (let i = 2; i <= s.length; i++) {
    let cur = 0;
    if (s[i - 1] !== "0") cur += prev1;
    const two = Number(s[i - 2]) * 10 + Number(s[i - 1]);
    if (two >= 10 && two <= 26) cur += prev2;
    prev2 = prev1; prev1 = cur;
  }
  return prev1;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "The string may also contain `*`, which stands for any digit `1`–`9` (*Decode Ways II*).",
      a: "The DP is the same, but each piece now contributes a *multiplier*: a single `*` can be 9 letters, `**` can form 15 valid pairs (11–19, 21–26), `1*` gives 9 pairs, `2*` gives 6, `*x` depends on `x`. The counts can be huge, so the problem asks for the result modulo $10^9 + 7$. Time $O(n)$.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return all the decodings, not just their count.",
      a: "Use **backtracking**: at each position try a 1-digit piece (if valid) and a 2-digit piece (if valid), appending letters to a path; output the path when you reach the end. The number of results can be exponential, and the DP count tells you in advance how many there are.",
      time: "O(output size)", space: "O(n)",
    },
    {
      q: "Generalise: letters are mapped to codes of any length (a dictionary). What is the shape of the DP?",
      a: "`dp[i] = Σ dp[j]` over all `j < i` such that `s[j..i)` is a valid code. That is exactly *Word Break* (counting version). With maximum code length `L` it costs $O(n \\cdot L)$ lookups.",
      time: "O(n·L)", space: "O(n)",
    },
  ],

  related: [
    { id: "climbing-stairs", why: "The same recurrence (`dp[i] = dp[i − 1] + dp[i − 2]`) without the validity conditions." },
    { id: "word-break", why: "The same prefix DP with a dictionary deciding which pieces are valid." },
    { id: "house-robber", why: "Another 1D DP that looks back one and two cells." },
    { id: "combination-sum-iv", why: "Counting ordered ways with a table indexed by the total." },
  ],
  patternNote: "**Prefix DP with conditional pieces** counts the ways to cut a sequence into valid pieces: `dp[i]` = ways for the first `i` items; for each allowed piece length `L`, if the last `L` items form a valid piece add `dp[i − L]`. The empty prefix is 1, and invalid pieces contribute 0.",
  takeaways: [
    "`dp[i]` = ways to decode the first `i` chars; `dp[0] = 1`; `dp[1] = (s[0] != '0')`.",
    "Add `dp[i−1]` if `s[i−1] != '0'`; add `dp[i−2]` if the pair is in `10..26`.",
    "`0` is only legal inside `10` or `20`; `06` is invalid; `27` is not one letter.",
    "Time $O(n)$, space $O(n)$ → $O(1)$ with two variables.",
    "It is Climbing Stairs where each step is allowed only if the piece is a valid code.",
  ],
});
