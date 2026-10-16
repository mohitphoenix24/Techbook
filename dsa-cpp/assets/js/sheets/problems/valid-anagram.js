SHEETS.define({
  id: "valid-anagram",
  viz: "hashmap",
  io: { fn: "isAnagram", params: [["s", "str"], ["t", "str"]], ret: "bool", labels: { s: "s (first word)", t: "t (second word)" } },
  legend: [["cur", "letter being counted"], ["ok", "letter already handled"], ["hit", "count changed"], ["bad", "count would go below zero"], ["key", "letter in the table"]],

  statement: `Given two strings \`s\` and \`t\`, return \`true\` if \`t\` is an **anagram** of \`s\`, and \`false\` otherwise.

An *anagram* is a word formed by rearranging the letters of another word, using **all** the original letters **exactly once**.`,
  examples: [
    { input: `s = "anagram", t = "nagaram"`, output: "true", explain: "Both words have three `a`, one `n`, one `g`, one `r`, one `m`." },
    { input: `s = "rat", t = "car"`, output: "false", explain: "`rat` has a `t`, but `car` has a `c`." },
  ],
  constraints: ["$1 \\le$ `s.length`, `t.length` $\\le 5 \\cdot 10^4$", "`s` and `t` consist of lowercase English letters"],
  check(input) {
    if (input.s.length > 10 || input.t.length > 10) return "for the animation use at most 10 letters in each word";
    if (!/^[a-z]*$/.test(input.s + input.t)) return "use lowercase letters a to z only";
    return null;
  },

  intuition: {
    find: "Whether the two words are made of **exactly the same letters with exactly the same counts**; the order of the letters does not matter.",
    beginner: "Sort the letters of both words. Anagrams become identical strings after sorting, so just compare the two sorted strings.",
    works: "Sorting puts the letters in a canonical order, so two words have the same multiset of letters if and only if their sorted forms are equal.",
    slow: "Sorting costs $O(n \\log n)$. That is fine for small words, but we only need *counts*, not an order, and counting is $O(n)$.",
    repeat: "Sorting does much more than needed: it decides the position of every letter relative to every other letter, when all we want to know is *how many of each letter there are*.",
    remember: "The alphabet is small and fixed (26 letters). A table of 26 counters is a tiny, perfect \"tally sheet\" for a word.",
    observation: "Two words are anagrams if and only if their **letter tallies are equal**. We do not even need two tallies: count the letters of `s` up, then for every letter of `t` count it **down**. If a count would go below zero, `t` has a letter that `s` does not have (or too many of it). If the lengths are equal and no count went negative, every count ends at exactly zero.",
    leads: "If the lengths differ, return `false`. Count each letter of `s` (`count[c]++`). For each letter of `t`, do `count[c]--`; if it becomes negative, return `false`. Otherwise return `true`.",
  },

  flow: [
    "Sort both words and compare them.",
    "Equal sorted strings mean equal letters with equal counts.",
    "$O(n \\log n)$: more work than needed, since only counts matter.",
    "The alphabet has only 26 letters: a tally table of 26 integers is enough.",
    "Count up with `s`, count down with `t`; a negative count or a length mismatch means no.",
    "One pass over each word: $O(n)$ time and $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** sort the letters of `s` and of `t`, and compare the two sorted strings. Anagrams give equal strings.",
    why: "Sorting costs $O(n \\log n)$ time, and the answer only depends on how many times each letter occurs, which a single pass can count. The sorted copies also need $O(n)$ extra memory in many languages.",
    time: "O(n log n)", space: "O(n)",
    measure: { fTex: "n \\log_2 n", f: (n) => n * Math.log2(Math.max(n, 2)), ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
public:
    bool isAnagram(string s, string t) {
        sort(s.begin(), s.end());
        sort(t.begin(), t.end());
        return s == t;
    }
};`,
    js: `function isAnagram(s, t) {
  const a = s.split("").sort().join("");
  const b = t.split("").sort().join("");
  return a === b;
}`,
  },

  pattern: {
    name: "Hash Map / Counting",
    why: "When only the **multiset of items** matters (how many of each, not where), replace sorting by a **count table**. For a small, known alphabet the table is just an array of counters indexed by the letter, so every update is $O(1)$.",
    recognize: [
      "The order of the elements does not matter, only **how many of each** there are.",
      "The alphabet is **small and fixed** (26 letters, digits, bytes).",
      "Two collections must be *compared* for equal contents (anagram, permutation, same multiset).",
      "Sorting would work but costs $O(n \\log n)$.",
    ],
  },

  optimal: {
    idea: "If the two words have different lengths they cannot be anagrams. Otherwise keep a table `count[26]`: add one for every letter of `s`, then subtract one for every letter of `t`. If any count would drop below zero, `t` has a letter that `s` cannot supply. If we finish without that happening, since the lengths are equal, all counts end at exactly zero: the words use the same letters the same number of times.",
    steps: [
      "If `s.length != t.length`, return `false`.",
      "Create `count[26]`, all zero.",
      "For each letter `c` of `s`: `count[c]++`.",
      "For each letter `c` of `t`: `count[c]--`; if it is now negative, return `false`.",
      "Return `true`.",
    ],
    invariant: "**While reading `t`, `count[c]` is the number of copies of `c` in `s` that have not yet been matched by a letter of `t`; it is never negative.**",
    correct: "After the first pass `count[c]` equals the number of copies of `c` in `s`. Each letter of `t` consumes one copy of that letter. If at some point a letter of `t` finds `count[c] = 0`, then `t` contains more copies of `c` than `s`, so the words differ. If no letter fails, `t` uses at most `count[c]` copies of each letter. Since the total number of letters in both words is the same ($n$), and `t` consumed $n$ letters from a total of $n$, nothing can be left over: every count is zero, so the multisets are equal. Conversely, for real anagrams no count can go negative. So the function returns `true` exactly for anagrams.",
  },

  cpp: `class Solution {
public:
    bool isAnagram(string s, string t) {
        if (s.size() != t.size()) return false;     // different lengths: impossible //@len
        int count[26] = {0};                        // tally of letters //@init
        for (char c : s) count[c - 'a']++;          // count up with s //@countS
        for (char c : t) {                          //@loopT
            if (--count[c - 'a'] < 0) return false; // count down with t //@cancel
        }
        return true;                                //@ret
    }
};`,
  js: `function isAnagram(s, t) {
  if (s.length !== t.length) return false;       // different lengths: impossible //@len
  const count = new Array(26).fill(0);           // tally of letters //@init
  for (const c of s) count[c.charCodeAt(0) - 97]++;   // count up with s //@countS
  for (const c of t) {                           //@loopT
    if (--count[c.charCodeAt(0) - 97] < 0) return false;   // count down with t //@cancel
  }
  return true;                                   //@ret
}`,

  tests: [
    { name: "Example 1: anagram / nagaram", kind: "normal", input: { s: "anagram", t: "nagaram" } },
    { name: "Example 2: rat / car", kind: "normal", input: { s: "rat", t: "car" } },
    { name: "listen / silent", kind: "normal", input: { s: "listen", t: "silent" } },
    { name: "Different lengths", kind: "edge", input: { s: "ab", t: "abc" }, why: "The words cannot have the same letters if they have different numbers of letters. The length check answers at once, and it also guarantees the final counts are all zero when no count goes negative." },
    { name: "Both words empty", kind: "edge", input: { s: "", t: "" }, why: "The empty word is an anagram of itself: the lengths match, both loops do nothing, and the function returns `true`. (The original problem forbids empty words; the logic still holds.)" },
    { name: "Same letters, different counts", kind: "edge", input: { s: "aabb", t: "abbb" }, why: "Both words use only `a` and `b` and have the same length, so a *set* comparison would say `true`. The counts differ (2 `a` against 1): the third `b` of `t` makes the `b` counter go negative, so the answer is `false`." },
    { name: "Identical words", kind: "edge", input: { s: "abc", t: "abc" }, why: "Every word is an anagram of itself. Each letter of `t` cancels exactly the letter counted from `s`." },
    { name: "A single letter that differs", kind: "edge", input: { s: "a", t: "b" }, why: "The lengths match, but `t` needs a `b` and the counter for `b` is 0, so it goes to `-1` and the function returns `false` immediately." },
    { name: "One letter repeated", kind: "corner", input: { s: "aaaa", t: "aaaa" }, why: "The counter for `a` goes up to 4 and back down to 0. This is the case where a **boolean** table (seen / not seen) would fail." },
    { name: "A longer rearrangement", kind: "corner", input: { s: "stressed", t: "desserts" }, why: "`desserts` is `stressed` read backwards. All counts match, including the doubled `s` and `e`." },
    { name: "Same length, one letter swapped for another", kind: "corner", input: { s: "abcc", t: "abbc" }, why: "Lengths match and every letter of `t` exists in `s`, but there are two `b`s in `t` and only one in `s`. The failure appears at the second `b` of `t`, not at the first position that looks different." },
  ],

  trace(input, T) {
    const s = input.s, t = input.t, sc = s.split(""), tc = t.split("");
    const count = {}, order = [];
    let whyUp = false, whyDown = false, whyNeg = false;
    const S = (o = {}) => () => ({
      arr: sc, hl: o.shl || {}, ptr: o.sptr || {}, label2: "s", label: "the two words",
      rows: [{ label: "t", arr: tc, hl: o.thl || {}, ptr: o.tptr || {} }],
      map: { entries: order.map((c) => [c, count[c]]), hl: o.mhl || {}, vhl: o.vhl || {}, title: "letter tally", keyLabel: "letter", valLabel: "count" },
      note: o.note,
    });
    const done = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, "ok"]));
    const same = s.length === t.length;
    T.step("len", { vars: { "len(s)": s.length, "len(t)": t.length }, state: S(), phase: "Count the letters of s", say: same ? `Both words have ${s.length} letter${s.length === 1 ? "" : "s"}. Different lengths would settle the question at once; equal lengths mean the final tally can only be all zeros or contain a negative.` : `\`s\` has ${s.length} letters and \`t\` has ${t.length}: two words of different lengths cannot be anagrams. Return \`false\` immediately.`, op: `s.size() != t.size()  →  ${!same}`, act: same ? "SAME_LENGTH" : "LENGTH_DIFFERS" });
    if (!same) { T.result(false); return; }
    T.step("init", { vars: {}, state: S(), say: "A tally table `count[26]` starts at zero: one counter for each letter `a` … `z`. (Only the letters that are touched are drawn.)", op: "count[26] = {0}", act: "EMPTY_TALLY" });
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!(c in count)) { count[c] = 0; order.push(c); }
      count[c]++;
      T.step("countS", { vars: { i, c, [`count['${c}']`]: count[c] }, state: S({ shl: Object.assign(done(i), { [i]: "cur" }), sptr: { i }, mhl: { [c]: "hit" }, vhl: { [c]: "hit" } }), say: `Read **${c}** from \`s\` and add one to its counter: \`count['${c}']\` is now **${count[c]}**.`, op: `count['${c}']++  →  ${count[c]}`, act: "COUNT_UP",
        why: whyUp ? null : { title: "Why count up with s?", text: "The tally is the *fingerprint* of `s`: how many copies of each letter it holds. The second word will be checked against this fingerprint, and the order of the letters has been forgotten, which is exactly right for anagrams." } });
      whyUp = true;
    }
    T.phase("Cancel them with the letters of t");
    let ok = true;
    for (let j = 0; j < t.length; j++) {
      const c = t[j];
      if (!(c in count)) { count[c] = 0; order.push(c); }
      count[c]--;
      const neg = count[c] < 0;
      T.step("cancel", { vars: { j, c, [`count['${c}']`]: count[c] }, state: S({ shl: done(s.length), thl: Object.assign(Object.fromEntries(Array.from({ length: j }, (_, i) => [i, "ok"])), { [j]: neg ? "bad" : "cur" }), tptr: { j }, mhl: { [c]: neg ? "bad" : "hit" }, vhl: { [c]: neg ? "bad" : "hit" } }), say: neg ? `Read **${c}** from \`t\` and subtract one: \`count['${c}']\` becomes **${count[c]}**, below zero. \`t\` has more copies of **${c}** than \`s\` could supply: **not an anagram**.` : `Read **${c}** from \`t\` and subtract one: \`count['${c}']\` becomes **${count[c]}** (not negative). This letter of \`t\` is matched by a letter of \`s\`.`, op: `--count['${c}'] < 0  →  ${count[c]} < 0  →  ${neg}`, act: neg ? "NEGATIVE" : "MATCHED",
        why: neg && !whyNeg ? { title: "Why does a negative count settle it?", text: "A counter below zero means `t` used a letter more often than `s` offered it. Since both words have the same length, that also means some other letter of `s` would be left unmatched. Either way the letter counts differ." } : !neg && !whyDown ? { title: "Why count down with t?", text: "Each letter of `t` uses up one copy from the tally of `s`. If every letter of `t` finds a copy to use, `t` is built only from the letters of `s`, with no letter used more often than it appears." } : null });
      if (neg) { whyNeg = true; ok = false; T.result(false); T.step("ret", { vars: { "return": false }, state: S({ mhl: { [c]: "bad" } }), say: "Return **false**: the words are not anagrams.", op: "return false", act: "DONE" }); return; }
      whyDown = true;
    }
    T.step("ret", { vars: { "return": true }, state: S({ shl: done(s.length), thl: done(t.length) }), say: s.length ? "Every letter of `t` was matched and, because both words have the same length, every counter is back to zero: the words are **anagrams**. Return `true`." : "There are no letters, so nothing can go wrong: two empty words are anagrams. Return `true`.", op: "return true", act: "DONE" });
    T.result(true);
  },
  fuzz(rnd) {
    const al = "abc", mk = (n) => Array.from({ length: n }, () => al[Math.floor(rnd() * 3)]).join("");
    const a = Math.floor(rnd() * 7);
    const s = mk(a);
    if (rnd() < 0.5) { const t = s.split("").sort(() => rnd() - 0.5).join(""); return { s, t }; }
    return { s, t: mk(rnd() < 0.8 ? a : Math.floor(rnd() * 7)) };
  },
  gen(n) { return { s: Array.from({ length: n }, (_, i) => "abcdefgh"[i % 8]).join(""), t: Array.from({ length: n }, (_, i) => "abcdefgh"[(n - 1 - i) % 8]).join("") }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one pass over s and one pass over t", short: "2n constant-time counter updates",
      derive: [
        "T_{\\text{len}} = c_0 || comparing two lengths",
        "T_{\\text{up}} = n\\, c_1 || one increment per letter of $s$",
        "T_{\\text{down}} \\le n\\, c_2 || one decrement and one sign test per letter of $t$ (it may stop early)",
        "!T(n) = c_0 + n(c_1 + c_2) = O(n) || linear in the length of the words",
      ],
      where: "Indexing the array by the letter (`c - 'a'`) is $O(1)$; no hashing or sorting is needed. The measured table uses two words that are reversals of each other, so no early exit happens.",
    },
    space: {
      tex: "O(1)", title: "26 counters", short: "the table does not grow with the words",
      derive: [
        "S = 26 \\cdot s_{\\text{int}} = c || one counter per letter",
        "!S = O(1) || constant: independent of $n$",
      ],
      where: "For a huge alphabet (Unicode) use a hash map of counts: $O(k)$ for $k$ distinct letters. The sorting solution needs $O(n)$ for its copies.",
    },
    limit: "Every letter of both words must be read to be sure, so $\\Omega(n)$ time is needed. The counting method is optimal.",
    measure: { label: "n = length of each word", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Comparing sets of letters", what: "Putting the letters of each word in a set and comparing the sets.", why: "\"Same letters\" sounds like \"same set\".", breaks: "`aabb` and `abbb` have the same set `{a, b}`, yet they are not anagrams.", avoid: "Compare **counts** of each letter, not just their presence." },
    { title: "Forgetting the length check", what: "Counting without comparing the lengths first.", why: "The final counts seem to cover everything.", breaks: "If `t` is shorter than `s`, no count ever goes negative but some counts stay positive; the function must also check the final counts (or the lengths).", avoid: "`if (s.size() != t.size()) return false;`: then no negative count means all zeros." },
    { title: "Adding the letters of both words to the same counters", what: "`count[c]++` in both loops.", why: "Counting both words feels symmetric.", breaks: "The counters then hold the *sum* of the two words, which is never zero and says nothing about whether the words match.", avoid: "Subtract for the second word (or keep two tallies and compare them)." },
    { title: "Indexing with the character itself", what: "`count[c]` instead of `count[c - 'a']` with a 26-element array.", why: "A `char` converts to an integer automatically.", breaks: "`'a'` is 97, which is far outside a 26-element array: undefined behaviour in C++ and silent wrong answers in JavaScript.", avoid: "Subtract `'a'` to get an index from 0 to 25 (or use a 128-element table)." },
    { title: "Sorting a string you must not change", what: "Sorting the caller's string in place when asked not to.", why: "Sorting is the shortest solution.", breaks: "The caller's data is changed, and the cost is $O(n \\log n)$.", avoid: "Count with a table, which leaves the strings untouched." },
  ],

  followUps: [
    {
      q: "The words may contain **Unicode characters**. What changes?",
      a: "A 26-element array is no longer enough. Use a hash map from character to count (`unordered_map<char32_t, int>` or a JavaScript `Map` over the code points). The algorithm is the same: count up with `s`, count down with `t`, fail on a negative count. It is $O(n)$ time on average and $O(k)$ space for $k$ distinct characters.",
      cpp: `bool isAnagramUnicode(const string& s, const string& t) {
    if (s.size() != t.size()) return false;
    unordered_map<char, int> count;
    for (char c : s) count[c]++;
    for (char c : t) if (--count[c] < 0) return false;
    return true;
}`,
      js: `function isAnagramUnicode(s, t) {
  const a = [...s], b = [...t];
  if (a.length !== b.length) return false;
  const count = new Map();
  for (const c of a) count.set(c, (count.get(c) || 0) + 1);
  for (const c of b) {
    const v = (count.get(c) || 0) - 1;
    if (v < 0) return false;
    count.set(c, v);
  }
  return true;
}`,
      time: "O(n)", space: "O(k)",
    },
    {
      q: "Check whether **`t` contains a permutation of `s`** as a substring (Permutation in String).",
      a: "Slide a window of length `|s|` over `t`, keeping a tally of the window and comparing it with the tally of `s` (26 comparisons or a `missing` counter). Each slide updates two counters. It is $O(|t|)$ with the counter trick, or $O(26\\,|t|)$ with direct comparison.",
      time: "O(|t|)", space: "O(1)",
    },
    {
      q: "Find **all the start indices** of anagrams of `p` in `s`.",
      a: "The same sliding window: when the window tally equals the tally of `p`, record the start index. Adding the entering letter and removing the leaving letter keeps the update $O(1)$, so the whole scan is $O(|s|)$.",
      time: "O(|s|)", space: "O(1)",
    },
    {
      q: "**Group** a list of words into anagram classes.",
      a: "Use the tally (or the sorted word) as a **key** in a hash map and collect all the words with the same key. That is the next problem in this sheet, Group Anagrams.",
      time: "O(N · L)", space: "O(N · L)",
    },
  ],

  related: [
    { id: "group-anagrams", why: "The same fingerprint (letter counts or the sorted word), used as a key to group many words." },
    { id: "minimum-window-substring", why: "A window whose tally must cover the tally of another string." },
    { id: "contains-duplicate", why: "Another \"have I seen this?\" question answered with a set or counter." },
    { id: "valid-palindrome", why: "The other classic string check: compare the word with itself instead of with another word." },
  ],
  patternNote: "**Counting replaces sorting** when only multiplicities matter. A fixed alphabet gives an array of counters indexed by the letter; count up for one collection and down for the other, and equal contents show up as all zeros, with no order to worry about.",
  takeaways: [
    "Anagrams have **equal letter counts**; the order of the letters is irrelevant.",
    "Check the lengths first; then count up with `s` and down with `t`, failing on a negative count.",
    "A `count[26]` array indexed by `c - 'a'` is constant space and $O(1)$ per update.",
    "Sets are not enough (they forget counts); sorting works but costs $O(n \\log n)$.",
    "For Unicode use a hash map of counts; the same tally works for permutation-in-string with a sliding window.",
  ],
});
