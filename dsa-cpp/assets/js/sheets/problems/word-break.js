SHEETS.define({
  id: "word-break",
  viz: "dp",
  io: { fn: "wordBreak", params: [["s", "str"], ["wordDict", "str[]"]], ret: "bool" },

  statement: `Given a string \`s\` and a dictionary of words \`wordDict\`, return \`true\` if \`s\` can be split into a sequence of one or more **dictionary words**. The same word may be reused any number of times.`,
  examples: [
    { input: 's = "leetcode", wordDict = ["leet", "code"]', output: "true", explain: '`"leetcode"` = `"leet"` + `"code"`.' },
    { input: 's = "applepenapple", wordDict = ["apple", "pen"]', output: "true", explain: '`"apple"` + `"pen"` + `"apple"` (reusing "apple").' },
    { input: 's = "catsandog", wordDict = ["cats", "dog", "sand", "and", "cat"]', output: "false", explain: 'No split works: `"cats" + "and" + "og"` leaves `"og"`, and `"cat" + "sand" + "og"` too.' },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 300$", "$1 \\le$ `wordDict.length` $\\le 1000$", "$1 \\le$ `wordDict[i].length` $\\le 20$", "Lowercase English letters; all dictionary words are **unique**."],
  check(input) { return input.s.length > 14 || input.wordDict.length > 6 ? "for the animation use |s| up to 14 and at most 6 words" : null; },

  intuition: {
    find: "A yes/no answer: can the whole string be cut into pieces that are **all** dictionary words?",
    beginner: "Recursion: try every prefix of `s`; if the prefix is a word, recursively check the rest. If the rest is empty, success.",
    works: "Every segmentation starts with some first word, and trying each possible first word covers them all.",
    slow: "On inputs like `\"aaaaaaaa…ab\"` with words `a, aa, aaa, …`, the recursion tries every way to cut the string: exponentially many (about $2^{n}$) paths, almost all failing.",
    repeat: "The same **suffix** is examined again and again: after cutting `\"aa\" + \"a\"` or `\"a\" + \"aa\"` we are at the same position and re-check the same rest of the string.",
    remember: "Let `dp[i]` be *\"the first `i` characters can be segmented\"*. There are only `n + 1` of these, and once known they never change.",
    observation: "The prefix `s[0..i)` can be segmented if there is a split point `j < i` such that the prefix `s[0..j)` can be segmented (`dp[j]` is true) **and** the piece `s[j..i)` is a word. So `dp[i] = OR over j of (dp[j] AND s[j..i) is in the dictionary)`, with `dp[0] = true` (the empty prefix).",
    leads: "Put the words in a hash set. For each end `i` from `1` to `n`, try each start `j < i`: if `dp[j]` and `s.substr(j, i − j)` is in the set, set `dp[i] = true` and stop. The answer is `dp[n]`. $O(n^2)$ substring checks.",
  },

  flow: [
    "Try every prefix that is a word and recurse on the rest.",
    "Every segmentation has a first word, so all are tried.",
    "Exponentially many cuts of the same suffixes, nearly all failing.",
    "`dp[i]` = the first `i` characters can be segmented.",
    "`dp[i]` is true if some `dp[j]` is true and `s[j..i)` is a word.",
    "Fill `dp` left to right: $O(n^2)$ checks (each a hash lookup of a substring).",
  ],

  brute: {
    idea: "**Brute force (recursion):** `can(start)` returns `true` if `start == n`; otherwise for every `end > start`, if `s[start..end)` is a word and `can(end)` is true, return `true`. Return `false` if none works.",
    why: "From each position the recursion tries every word that fits, and the same positions are reached by many different earlier cuts. For a string like `\"aaaa…ab\"` the number of calls is exponential, though only `n` distinct start positions exist.",
    time: "O(2^n)", space: "O(n)",
    measure: { fTex: "\\approx 2^{n}", f: (n) => Math.pow(2, n), ns: [10, 20, 30, 40, 100] },
    cpp: `class Solution {
    bool can(const string& s, unordered_set<string>& dict, int start) {
        int n = s.size();
        if (start == n) return true;
        for (int end = start + 1; end <= n; end++)
            if (dict.count(s.substr(start, end - start)) && can(s, dict, end)) return true;
        return false;
    }
public:
    bool wordBreak(string s, vector<string>& wordDict) {
        unordered_set<string> dict(wordDict.begin(), wordDict.end());
        return can(s, dict, 0);
    }
};`,
    js: `function wordBreak(s, wordDict) {
  const dict = new Set(wordDict), n = s.length;
  const can = (start) => {
    if (start === n) return true;
    for (let end = start + 1; end <= n; end++)
      if (dict.has(s.slice(start, end)) && can(end)) return true;
    return false;
  };
  return can(0);
}`,
  },

  pattern: {
    name: "Dynamic Programming (prefix, split point)",
    why: "The question *\"can this prefix be segmented?\"* has the same shape as its sub-questions on shorter prefixes: a prefix is segmentable if a shorter segmentable prefix is followed by one word. The state is the prefix length; the transition ranges over the possible last word. A boolean DP of this kind is the cleanest answer to *can I cut a string into valid pieces?*",
    recognize: [
      "You must decide whether a string/array can be **partitioned into valid pieces**.",
      "Validity of a piece is a simple lookup (dictionary, palindrome test, range check).",
      "The recursion tries every first/last piece and the same suffix/prefix repeats.",
      "The table is indexed by the **prefix length**, with `dp[0] = true`.",
    ],
  },

  optimal: {
    idea: "Let `dp[i]` mean *the first `i` characters of `s` can be split into dictionary words*. Start with `dp[0] = true`. For each `i` from 1 to `n`, look for a split point `j < i` where `dp[j]` is true and the piece `s[j..i)` is in the dictionary. If found, `dp[i] = true` and we can stop looking. The answer is `dp[n]`.",
    steps: [
      "Put all words in a hash set `dict`.",
      "Create `dp[0..n]` of `false` and set `dp[0] = true` (the empty prefix).",
      "For `i` from `1` to `n`, for `j` from `0` to `i − 1`:",
      "if `dp[j]` and `s.substr(j, i − j)` is in `dict`: set `dp[i] = true` and `break`.",
      "Return `dp[n]`.",
    ],
    invariant: "**`dp[i]` is true exactly when `s[0..i)` can be split into dictionary words**, and it is only ever read after it is final.",
    correct: "If `s[0..i)` can be segmented, look at its last word `s[j..i)`: the rest `s[0..j)` is segmented too, so `dp[j]` is true (by induction, as `j < i`), and the piece is a word, so the loop finds this `j` and sets `dp[i]`. Conversely, if the loop sets `dp[i]` because `dp[j]` is true and `s[j..i)` is a word, then appending that word to a segmentation of `s[0..j)` segments `s[0..i)`. The empty prefix is segmentable (zero words), which lets a first word start at index 0.",
  },

  cpp: `class Solution {
public:
    bool wordBreak(string s, vector<string>& wordDict) {
        unordered_set<string> dict(wordDict.begin(), wordDict.end());   //@dict
        int n = s.size();
        vector<bool> dp(n + 1, false);                                  // dp[i]: s[0..i) splits //@init
        dp[0] = true;                                                   // the empty prefix //@seed
        for (int i = 1; i <= n; i++)                                    //@loopi
            for (int j = 0; j < i; j++)                                 //@loopj
                if (dp[j] && dict.count(s.substr(j, i - j))) {          // s[0..j) ok and s[j..i) is a word //@check
                    dp[i] = true; break;                                //@set
                }
        return dp[n];                                                   //@ret
    }
};`,
  js: `function wordBreak(s, wordDict) {
  const dict = new Set(wordDict);                                       //@dict
  const n = s.length;
  const dp = new Array(n + 1).fill(false);                              // dp[i]: s[0..i) splits //@init
  dp[0] = true;                                                         // the empty prefix //@seed
  for (let i = 1; i <= n; i++)                                          //@loopi
    for (let j = 0; j < i; j++)                                         //@loopj
      if (dp[j] && dict.has(s.slice(j, i))) {                           // s[0..j) ok and s[j..i) is a word //@check
        dp[i] = true; break;                                            //@set
      }
  return dp[n];                                                         //@ret
}`,

  tests: [
    { name: "Example 1: \"leetcode\"", kind: "normal", input: { s: "leetcode", wordDict: ["leet", "code"] } },
    { name: "Example 2: reuse a word", kind: "normal", input: { s: "applepenapple", wordDict: ["apple", "pen"] } },
    { name: "Example 3: a near miss", kind: "normal", input: { s: "catsandog", wordDict: ["cats", "dog", "sand", "and", "cat"] } },
    { name: "A greedy prefix is a trap", kind: "edge", input: { s: "cars", wordDict: ["car", "ca", "rs"] }, why: "Taking the longest word first (`car`) leaves `s`, which is not a word: greedy fails. The right split is `ca` + `rs`. The DP tries **every** split point, so it finds it." },
    { name: "Overlapping words", kind: "edge", input: { s: "aaaaaaa", wordDict: ["aaaa", "aaa"] }, why: "`7 = 4 + 3`, but `aaaa` fits at several places. This is the kind of input that makes the plain recursion explode, while the table stays small." },
    { name: "No dictionary word matches", kind: "edge", input: { s: "abc", wordDict: ["d", "e"] }, why: "No piece is ever a word, so only `dp[0]` is true and the answer is `false`." },
    { name: "A single character, found", kind: "corner", input: { s: "a", wordDict: ["a"] }, why: "`dp[1]`: `dp[0]` is true and `s[0..1) = \"a\"` is a word, so `true`. It shows how the base case `dp[0] = true` lets the first word start." },
    { name: "A single character, not found", kind: "corner", input: { s: "a", wordDict: ["b"] }, why: "The only piece `\"a\"` is not a word, so `dp[1]` stays `false`." },
    { name: "Whole string is one word", kind: "corner", input: { s: "internet", wordDict: ["inter", "net", "internet"] }, why: "There are two valid ways: `internet`, or `inter` + `net`. One is enough for `true`; the `break` stops at the first split that works." },
  ],

  trace(input, T) {
    const { s, wordDict } = input, n = s.length, chars = s.split("");
    const dict = new Set(wordDict);
    const dp = Array.from({ length: n + 1 }, () => null);
    dp[0] = true;
    let whyJ = false, whyFalse = false, whyBreak = false;
    const view = (v) => (v === null ? null : v ? "T" : "F");
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let i = 0; i <= n; i++) if (dp[i] !== null) hl[i] = dp[i] ? "ok" : "bad";
      if (deps) deps.forEach((d) => (hl[d] = "cmp"));
      if (cur != null) hl[cur] = "cur";
      if (o.answer) hl[n] = "hit";
      const sh = {};
      if (o.slice) for (let k = o.slice[0]; k < o.slice[1]; k++) sh[k] = o.sliceCls || "win";
      const wh = {};
      if (o.word != null) wh[o.word] = o.wordCls || "cur";
      return { arrs: [{ label: "the string s", arr: chars, hl: sh }, { label: "dictionary words", arr: wordDict, hl: wh, cw: 76, size: 12 }], dp: dp.map(view), hl, cur: cur ?? null, deps: deps || [], depLabels: deps ? deps.map(() => "start of the last word") : [], formula: o.formula, label: "dp[i] = the first i characters can be split into words   (T = yes, F = no)" };
    };
    T.step("dict", { vars: { n, words: wordDict.length }, state: S(null), phase: "Set up", say: `Put the ${wordDict.length} dictionary word${wordDict.length === 1 ? "" : "s"} in a hash set so \"is this piece a word?\" is one lookup.`, op: `dict = { ${wordDict.join(", ")} }`, act: "START" });
    T.step("seed", { vars: { "dp[0]": "T" }, state: S(0, null, { formula: "dp[0] = true   (the empty prefix is split into zero words)" }), say: "`dp[0] = true`: the empty prefix needs no words. This is what allows the **first** word to start at index 0.", op: "dp[0] = true", act: "BASE_CASE" });
    T.phase("For each end i, look for a split point j");
    for (let i = 1; i <= n; i++) {
      dp[i] = false;
      T.step("loopi", { vars: { i, "s[0..i)": s.slice(0, i) }, state: S(i, null, { slice: [0, i], formula: `can "${s.slice(0, i)}" be split?  look for a j < ${i} with dp[j] = T and s[j..${i}) a word` }), say: `Is the prefix **"${s.slice(0, i)}"** (first ${i} characters) a concatenation of words? We look for a last word \`s[j..${i})\` whose beginning \`s[0..j)\` is already known to be splittable.`, op: `dp[${i}] = ?`, act: "NEW_END" });
      for (let j = 0; j < i; j++) {
        const piece = s.slice(j, i), isWord = dict.has(piece);
        const wi = wordDict.indexOf(piece);
        const good = dp[j] && isWord;
        T.step("check", { vars: { i, j, "dp[j]": dp[j] ? "T" : "F", piece, "in dict?": isWord }, state: S(i, [j], { slice: [j, i], sliceCls: good ? "ok" : "bad", word: isWord ? wi : null, wordCls: good ? "hit" : "cmp", formula: `split at j = ${j}:  dp[${j}] = ${dp[j] ? "T" : "F"},  "${piece}" ${isWord ? "is" : "is not"} a word  →  ${good ? "YES" : "no"}` }),
          say: !dp[j] ? `Split at **j = ${j}**: the prefix \`s[0..${j})\` is **not** splittable (\`dp[${j}] = F\`), so whatever the last piece is, this split cannot work.` : !isWord ? `Split at **j = ${j}**: \`s[0..${j})\` is splittable, but the piece **"${piece}"** is not in the dictionary.` : `Split at **j = ${j}**: \`s[0..${j})\` is splittable **and** "${piece}" is a dictionary word. So the first ${i} characters can be split!`,
          op: `dp[${j}] && "${piece}" in dict  →  ${dp[j] ? "T" : "F"} && ${isWord ? "T" : "F"}  →  ${good ? "T" : "F"}`, act: good ? "SPLIT_FOUND" : !dp[j] ? "PREFIX_FAILS" : "NOT_A_WORD",
          why: good && !whyJ ? { title: "Why must BOTH conditions hold?", text: `The first ${i} characters are split correctly only if (1) the part before the last word is itself split correctly (dp[j]) and (2) the last word really is a word. If either fails, this j is useless.` } : (!dp[j] && !whyFalse ? { title: "Why look at dp[j] first?", text: "dp[j] is the answer to a smaller problem we already solved. If it is false, no choice of last word can repair it, so we can skip the dictionary lookup (the code's && short-circuits)." } : null) });
        if (good) whyJ = true; if (!dp[j]) whyFalse = true;
        if (good) {
          dp[i] = true;
          T.step("set", { vars: { i, "dp[i]": "T" }, state: S(i, [j], { slice: [j, i], sliceCls: "ok", word: wi, formula: `dp[${i}] = true   (found split j = ${j}: "${s.slice(0, j)}" + "${piece}")` }), say: `Set **dp[${i}] = true** and \`break\`: one valid split is enough, so there is no need to try the remaining split points.`, op: `dp[${i}] = true;  break`, act: "SET_TRUE",
            why: whyBreak ? null : { title: "Why break?", text: "dp[i] only records whether a split exists, not how many. Once one is found, further split points cannot change the answer, so we stop to save time." } });
          whyBreak = true;
          break;
        }
      }
      if (!dp[i]) T.step("set", { vars: { i, "dp[i]": "F" }, state: S(i, null, { slice: [0, i], sliceCls: "bad", formula: `dp[${i}] = false   (no split point worked)` }), say: `Every split point failed: **dp[${i}] = false**. The prefix "${s.slice(0, i)}" cannot be written as a sequence of dictionary words.`, op: `dp[${i}] = false`, act: "SET_FALSE" });
    }
    T.step("ret", { vars: { "dp[n]": dp[n] ? "T" : "F" }, state: S(n, null, { answer: true, formula: `answer = dp[${n}] = ${dp[n]}` }), say: dp[n] ? `\`dp[${n}] = true\`: the whole string can be split into dictionary words.` : `\`dp[${n}] = false\`: no way to split the whole string into dictionary words.`, op: `return dp[${n}] = ${dp[n]}`, act: "DONE" });
    T.result(dp[n]);
  },
  fuzz(rnd) {
    const alpha = "ab", words = new Set(), k = 1 + Math.floor(rnd() * 3);
    while (words.size < k) { let w = ""; const L = 1 + Math.floor(rnd() * 3); for (let i = 0; i < L; i++) w += alpha[Math.floor(rnd() * 2)]; words.add(w); }
    let s = ""; const n = 1 + Math.floor(rnd() * 9); for (let i = 0; i < n; i++) s += alpha[Math.floor(rnd() * 2)];
    return { s, wordDict: [...words] };
  },
  gen(n) { return { s: "a".repeat(n - 1) + "b", wordDict: ["a", "aa"] }; },

  complexity: {
    time: {
      tex: "O(n^2 \\cdot L)", title: "n²/2 split points, each a substring lookup", short: "L = the cost of hashing one substring (at most n)",
      derive: [
        "\\#\\text{pairs } (j, i) \\le \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} || for each end $i$, at most $i$ split points $j$",
        "\\text{each pair costs one substring + one hash lookup} = O(i - j) \\le O(n) || copying and hashing the piece reads its characters",
        "T(n) \\le \\frac{n(n+1)}{2} \\cdot O(n) = O(n^3) \\text{ in character operations} || worst case when no early `break` happens",
        "!T(n) = O(n^2) \\text{ lookups}, \\; O(n^3) \\text{ character steps} || limiting the split to the longest word length $L_{\\max}$ gives $O(n \\cdot L_{\\max}^2)$",
      ],
      where: "The table has $n + 1$ states and each tries up to $n$ split points: $O(n^2)$ dictionary lookups. Each lookup hashes a substring of length up to $n$, so the character work is $O(n^3)$ in the worst case. Limiting `j` to the longest dictionary word (follow-up) reduces it a lot. The measured table below counts the $(j, i)$ pairs examined.",
    },
    space: {
      tex: "O(n + W)", title: "the dp table plus the dictionary set", short: "W = total characters stored in the dictionary",
      derive: [
        "S = (n + 1) \\cdot 1\\text{ bit} + |\\text{dict}| || the boolean table and the hash set of words",
        "!S = O(n + W) || W = total length of all words",
      ],
      where: "The table is tiny (booleans). The hash set holds the words once.",
    },
    limit: "For a general dictionary this DP is the standard answer. A **trie** over the dictionary avoids creating substrings and gives $O(n \\cdot L_{\\max})$ time (follow-up).",
    measure: { label: "n = s.length (worst case: no split ever works)", fTex: "n^2", f: (n) => n * n, sizes: [8, 16, 24, 32, 48, 64], growth: "quadratic", reading: "Doubling the length multiplies the number of examined split points by about **4**: quadratic growth in the number of (j, i) pairs." },
  },

  mistakes: [
    { title: "Greedy: take the longest (or first) matching word", what: "Repeatedly removing the longest dictionary word from the front.", why: "It works on the examples.", breaks: "`\"cars\"` with `[car, ca, rs]` fails: `car` leaves `s`, but `ca + rs` works.", avoid: "Try all split points: dynamic programming." },
    { title: "Forgetting `dp[0] = true`", what: "All cells start `false`.", why: "\"Nothing is splittable yet\".", breaks: "No piece can ever start at index 0, so every answer is `false`.", avoid: "`dp[0] = true`: the empty prefix is splittable." },
    { title: "Looping `j` up to `i` (inclusive) or using `substr(j, i)`", what: "`s.substr(j, i)` instead of `s.substr(j, i − j)`.", why: "Mixing the (start, length) signature of `substr` with (start, end).", breaks: "The second argument is the **length**; passing `i` reads past the intended piece (or past the end), checking the wrong substring.", avoid: "`s.substr(j, i − j)` in C++; `s.slice(j, i)` in JS." },
    { title: "Plain recursion without memo", what: "`can(start)` with no cache.", why: "It is the first idea and passes small tests.", breaks: "`\"aaaa…ab\"` with words `a, aa` takes exponential time (a time-limit error around length 40).", avoid: "Memoise `can(start)` or fill `dp` bottom-up." },
    { title: "Using a vector of words and scanning it for every piece", what: "`find(wordDict.begin(), wordDict.end(), piece)`.", why: "It avoids creating a set.", breaks: "Each lookup becomes $O(|\\text{dict}|)$, multiplying the cost by up to 1000.", avoid: "Hash set (average $O(1)$ per lookup)." },
  ],

  followUps: [
    {
      q: "Speed it up by limiting `j` to the **maximum word length**.",
      a: "A dictionary word is at most `L` long, so only splits with `i − j ≤ L` can match: loop `j` from `max(0, i − L)` to `i − 1`. The work becomes $O(n \\cdot L)$ lookups (each of length $\\le L$), i.e. $O(n \\cdot L^2)$ character operations. For the problem's limits ($L \\le 20$) this is much faster than $O(n^2)$.",
      cpp: `bool wordBreakFast(string s, vector<string>& wordDict) {
    unordered_set<string> dict(wordDict.begin(), wordDict.end());
    int n = s.size(), L = 0;
    for (auto& w : wordDict) L = max(L, (int)w.size());
    vector<bool> dp(n + 1, false);
    dp[0] = true;
    for (int i = 1; i <= n; i++)
        for (int j = max(0, i - L); j < i; j++)
            if (dp[j] && dict.count(s.substr(j, i - j))) { dp[i] = true; break; }
    return dp[n];
}`,
      js: `function wordBreakFast(s, wordDict) {
  const dict = new Set(wordDict), n = s.length;
  const L = Math.max(...wordDict.map((w) => w.length));
  const dp = new Array(n + 1).fill(false);
  dp[0] = true;
  for (let i = 1; i <= n; i++)
    for (let j = Math.max(0, i - L); j < i; j++)
      if (dp[j] && dict.has(s.slice(j, i))) { dp[i] = true; break; }
  return dp[n];
}`,
      time: "O(n·L²)", space: "O(n + W)",
    },
    {
      q: "Return **all** the sentences (*Word Break II*), not just a yes/no.",
      a: "First run the boolean DP to prune (only explore positions from which a split to the end is possible), then use **backtracking** with memoisation (`memo[start]` = list of sentences from `start`). The output can be exponentially large (`\"aaaa…\"` with words `a, aa`), so the time is $O(\\text{output size})$ plus the DP. The yes/no DP is what prevents exploring dead ends.",
      time: "O(output)", space: "O(output)",
    },
    {
      q: "Count the **number of ways** to split the string.",
      a: "Replace `OR` by `+`: `dp[i] = Σ dp[j]` over all `j` with `s[j..i)` a word, with `dp[0] = 1`, and no `break`. It is the counting version of the same table (compare *Decode Ways* and *Climbing Stairs*), taken modulo something if the answer is large.",
      time: "O(n²·L)", space: "O(n)",
    },
    {
      q: "Use a **trie** instead of a hash set. What is gained?",
      a: "From each start `j` with `dp[j] = true`, walk the trie along `s[j], s[j+1], …`: every time you pass a terminal node at position `i`, set `dp[i] = true`; stop when the trie has no matching child. No substrings are ever created, and the walk is bounded by the longest word, so the cost is $O(n \\cdot L_{\\max})$ character steps.",
      time: "O(n·L)", space: "O(W)",
    },
  ],

  related: [
    { id: "decode-ways", why: "The same prefix DP, counting ways where a piece is valid if it is a code from 1 to 26." },
    { id: "coin-change", why: "A table indexed by a total, built from smaller totals reached by one more item." },
    { id: "implement-trie-prefix-tree", why: "A trie replaces the hash set for dictionary lookups and removes substring creation." },
    { id: "longest-palindromic-substring", why: "Another \"is this piece valid?\" DP, with palindromes instead of words." },
  ],
  patternNote: "**The prefix-split DP** answers *\"can/how can the first `i` items be cut into valid pieces?\"* by combining an already solved shorter prefix with one more valid piece. Base case: the empty prefix. Switch the combining operation to fit the question: `OR` for feasibility, `+` for counting, `min` for the fewest pieces.",
  takeaways: [
    "`dp[i]` = the first `i` characters can be split; `dp[0] = true`; `dp[i] = OR over j of (dp[j] && s[j..i) is a word)`.",
    "Use a **hash set** for the dictionary; `s.substr(j, i − j)` (start, *length*).",
    "Greedy (longest word first) fails: `\"cars\"` with `{car, ca, rs}`.",
    "Time $O(n^2)$ lookups ($O(n \\cdot L^2)$ if `j` is limited to the longest word), space $O(n)$.",
    "Swap `OR` for `+` to count splits (Decode Ways) or for `min` to find the fewest pieces.",
  ],
});
