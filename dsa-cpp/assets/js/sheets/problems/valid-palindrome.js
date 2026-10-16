SHEETS.define({
  id: "valid-palindrome",
  viz: "twopointer",
  io: { fn: "isPalindrome", params: [["s", "str"]], ret: "bool", labels: { s: "s (a sentence)" } },
  legend: [["cur", "pointer"], ["ok", "pair already matched"], ["dim", "skipped (not a letter or digit)"], ["bad", "mismatch"], ["elim", "already checked"]],

  statement: `A phrase is a **palindrome** if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string \`s\`, return \`true\` if it is a palindrome, or \`false\` otherwise.`,
  examples: [
    { input: `s = "A man, a plan, a canal: Panama"`, output: "true", explain: "After cleaning it is \"amanaplanacanalpanama\", which reads the same both ways." },
    { input: `s = "race a car"`, output: "false", explain: "After cleaning it is \"raceacar\", which is not the same backwards (\"racecar\" would be)." },
    { input: `s = " "`, output: "true", explain: "After removing the space, the string is empty, and an empty string reads the same both ways." },
  ],
  constraints: ["$1 \\le$ `s.length` $\\le 2 \\cdot 10^5$", "`s` consists only of printable ASCII characters"],
  check(input) {
    if (input.s.length > 30) return "for the animation use at most 30 characters";
    if (/[^\x20-\x7e]/.test(input.s)) return "use printable ASCII characters only";
    return null;
  },

  intuition: {
    find: "Whether the **letters and digits** of the phrase, ignoring case, read the same from both ends. Spaces and punctuation are simply not part of the question.",
    beginner: "Build a clean copy: keep only letters and digits, make them lower case. Reverse the clean copy and compare it with the original clean copy.",
    works: "The definition of a palindrome is exactly that the clean text equals its reverse, so the check is correct.",
    slow: "Time is optimal, $O(n)$, but it builds two extra strings of length up to $n$: $O(n)$ **extra memory**, and several passes (clean, reverse, compare) where one is enough.",
    repeat: "A palindrome is symmetric, so after we compare the first and last letters, the same question is asked about the **middle part**. Building whole copies repeats information that is already in the string.",
    remember: "We can compare the first letter with the last letter directly in the original string, if we **skip anything that is not a letter or digit** on the way. Then move both ends inwards and ask the same question about the smaller middle part.",
    observation: "Two pointers: `l` at the start and `r` at the end. Move `l` right past any character that is not alphanumeric; move `r` left past the same. Compare the two characters ignoring case: if they differ, it is not a palindrome. Otherwise step both inwards. When the pointers meet or cross, every pair matched.",
    leads: "`while (l < r)`: skip non-alphanumerics on both sides (always keeping `l < r`), compare `tolower(s[l])` with `tolower(s[r])`, return `false` on a mismatch, then `l++`, `r--`. If the loop ends, return `true`. No extra memory.",
  },

  flow: [
    "Clean the string, reverse it and compare the two copies.",
    "A palindrome equals its reverse after cleaning.",
    "$O(n)$ time, but two extra strings of $O(n)$ memory.",
    "Compare the outer characters directly and shrink inwards: the middle is the same question again.",
    "Two pointers skip non-alphanumerics and compare ignoring case.",
    "One pass, no copies: $O(n)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** make a cleaned string `t` that keeps only the letters and digits of `s`, all in lower case. Compare `t` with its reverse.",
    why: "It is $O(n)$ in time but builds a cleaned string and then another string for the reverse, so it needs $O(n)$ extra memory, and it makes three passes over the data. The two-pointer version needs neither.",
    time: "O(n)", space: "O(n)",
    cpp: `class Solution {
public:
    bool isPalindrome(string s) {
        string t;
        for (char c : s)
            if (isalnum((unsigned char)c)) t.push_back(tolower((unsigned char)c));
        string r(t.rbegin(), t.rend());
        return t == r;
    }
};`,
    js: `function isPalindrome(s) {
  let t = "";
  for (const c of s) if (/[a-z0-9]/i.test(c)) t += c.toLowerCase();
  return t === t.split("").reverse().join("");
}`,
  },

  pattern: {
    name: "Two Pointers (from both ends)",
    why: "Symmetry questions (palindrome, reverse, pair sums on a sorted array) are answered by two pointers that start at the **two ends** and walk towards each other. Each step either confirms a matching pair or finds a mismatch, and the unchecked part keeps shrinking.",
    recognize: [
      "The question is about **symmetry** or pairs at opposite ends of a sequence.",
      "Some characters must be **ignored** (the skip loops), so you cannot just index `i` and `n − 1 − i`.",
      "An in-place check is wanted: no cleaned or reversed copy.",
      "After checking the two ends, the rest is the same problem on a smaller range.",
    ],
  },

  optimal: {
    idea: "Put `l` on the first character and `r` on the last. Repeat while `l < r`: move `l` forward over characters that are not letters or digits; move `r` backward over the same kind of characters; then compare the two characters ignoring case. A difference means the phrase is not a palindrome. If they are equal, move both pointers one step inwards. When the pointers meet, all the pairs matched.",
    steps: [
      "Set `l = 0` and `r = n − 1`.",
      "While `l < r`: advance `l` while `l < r` and `s[l]` is not alphanumeric.",
      "Retreat `r` while `l < r` and `s[r]` is not alphanumeric.",
      "If `lower(s[l]) != lower(s[r])`, return `false`.",
      "Do `l++` and `r--`.",
      "If the loop ends, return `true`.",
    ],
    invariant: "**All the alphanumeric characters outside `[l, r]` form matching pairs (first with last, second with second-last, …), ignoring case.**",
    correct: "The cleaned phrase is a palindrome iff its $k$-th letter equals its $k$-th letter from the end for every $k$. Skipping non-alphanumerics moves `l` to the next cleaned character from the left and `r` to the next from the right, so after the skips the pair `(s[l], s[r])` is exactly the next pair that must match, unless `l` and `r` have met (then the same character is compared with itself, which is always equal). A mismatch proves the phrase is not a palindrome; matches extend the invariant by one pair. Each step moves at least one pointer inwards, so the loop ends, and when it ends every pair has been confirmed, so the phrase is a palindrome.",
  },

  cpp: `class Solution {
public:
    bool isPalindrome(string s) {
        int l = 0, r = (int)s.size() - 1;       //@init
        while (l < r) {                         //@loop
            while (l < r && !isalnum((unsigned char)s[l])) l++;   // skip punctuation on the left //@skipL
            while (l < r && !isalnum((unsigned char)s[r])) r--;   // skip punctuation on the right //@skipR
            if (tolower((unsigned char)s[l]) != tolower((unsigned char)s[r])) return false;   // ignore case //@cmp
            l++; r--;                           // this pair matches: go inwards //@move
        }
        return true;                            //@ret
    }
};`,
  js: `function isPalindrome(s) {
  const isAlnum = (c) => /[a-z0-9]/i.test(c);
  let l = 0, r = s.length - 1;           //@init
  while (l < r) {                        //@loop
    while (l < r && !isAlnum(s[l])) l++;       // skip punctuation on the left //@skipL
    while (l < r && !isAlnum(s[r])) r--;       // skip punctuation on the right //@skipR
    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;   // ignore case //@cmp
    l++; r--;                            // this pair matches: go inwards //@move
  }
  return true;                           //@ret
}`,

  tests: [
    { name: "Example 1: A man, a plan, a canal: Panama", kind: "normal", input: { s: "A man, a plan, a canal: Panama" } },
    { name: "Example 2: race a car", kind: "normal", input: { s: "race a car" } },
    { name: "Example 3: a single space", kind: "normal", input: { s: " " } },
    { name: "No lemon, no melon", kind: "normal", input: { s: "No lemon, no melon" } },
    { name: "Empty string", kind: "edge", input: { s: "" }, why: "`r = -1`, so `l < r` is false at once and the function returns `true`. Nothing to compare means nothing can differ." },
    { name: "A single character", kind: "edge", input: { s: "a" }, why: "`l == r`, so the loop does not run: one letter reads the same both ways." },
    { name: "Only punctuation", kind: "edge", input: { s: ".," }, why: "Both characters are skipped (`l < r` stops the left skip, and the right skip moves `r` onto `l`), then the same character is compared with itself. The cleaned text is empty, so the answer is `true`." },
    { name: "A digit and a letter that look alike in ASCII (0P)", kind: "edge", input: { s: "0P" }, why: "`'0'` is 48 and `'P'` is 80, which differ by exactly 32, the gap between upper and lower case letters: a shortcut that treats two characters 32 apart as the same letter would wrongly call them equal. The correct `tolower` leaves `0` unchanged, so `0` and `p` differ: `false`." },
    { name: "Upper and lower case", kind: "edge", input: { s: "Aa" }, why: "`A` and `a` are the same letter ignoring case, so the pair matches: `true`. A case-sensitive comparison would say `false`." },
    { name: "Underscore is not alphanumeric", kind: "corner", input: { s: "ab_a" }, why: "`_` is not a letter or digit, so it is removed. The cleaned text `aba` is a palindrome. (A solution that treats `_` as a character, as some regex classes do, would say `false`.)" },
    { name: "Digits only", kind: "corner", input: { s: "12 3 21" }, why: "Digits count as alphanumeric: the cleaned text `12321` is a palindrome. The space in the middle is skipped by the left or right pointer." },
    { name: "Punctuation at both ends", kind: "corner", input: { s: "!ab2a?" }, why: "The leading `!` and trailing `?` are skipped, leaving `ab2a`, which is not a palindrome (`b` against `2`): `false`." },
  ],

  trace(input, T) {
    const s = input.s, n = s.length, chars = s.split("");
    const isAl = (c) => /[a-z0-9]/i.test(c);
    const q = (c) => (c === " " ? "␣" : c);
    let l = 0, r = n - 1, pairs = 0;
    const skipped = new Set(), matched = new Set();
    let whySkip = false, whyCase = false, whyMeet = false;
    const S = (o = {}) => () => {
      const hl = {};
      skipped.forEach((i) => (hl[i] = "dim"));
      matched.forEach((i) => (hl[i] = "ok"));
      (o.bad || []).forEach((i) => (hl[i] = "bad"));
      return { arr: chars.map(q), l: n ? l : undefined, r: n ? r : undefined, hl, label: `“${s}”`, regs: [{ k: "pairs matched", v: pairs, cls: "ok" }], note: o.note, cw: n > 20 ? 32 : 40, ch: n > 20 ? 34 : 42, size: n > 20 ? 13 : 15 };
    };
    const vars = () => ({ l, r, pairs });
    T.step("init", { vars: vars(), state: S(), phase: "Compare from both ends", say: n ? `The phrase has ${n} character${n === 1 ? "" : "s"}. \`l\` starts on the first character and \`r\` on the last. We compare pairs from the outside in, ignoring everything that is not a letter or digit, and ignoring case.` : "The phrase is empty: `r` starts at −1, before `l`, so there is no pair to compare.", op: `l = 0,  r = ${n - 1}`, act: "START" });
    while (true) {
      const go = l < r;
      T.step("loop", { vars: vars(), state: S(), say: go ? `\`l\` (${l}) < \`r\` (${r}): at least two characters are left, so there is another pair to check.` : `\`l\` (${l}) ${l === r ? "=" : ">"} \`r\` (${r}): the pointers have met or crossed, so nothing is left to compare.`, op: `l < r  →  ${go}`, act: go ? "CONTINUE" : "POINTERS_MET",
        why: !go && !whyMeet && n > 1 ? { title: "Why is it enough to stop when they meet?", text: "Every character to the left of `l` has been matched with its mirror to the right of `r`. A single character in the middle (or none) has no partner to disagree with, so it cannot break the palindrome." } : null });
      if (!go) break;
      const l0 = l;
      while (l < r && !isAl(s[l])) { skipped.add(l); l++; }
      if (l !== l0) T.step("skipL", { vars: vars(), state: S({ note: `skipped ${l - l0} character${l - l0 === 1 ? "" : "s"} on the left` }), say: `\`s[${l0}]\` = “${q(s[l0])}” is not a letter or digit: skip it. \`l\` moves to **${l}**${l - l0 > 1 ? ` (${l - l0} characters skipped)` : ""}.`, op: `!isalnum(s[${l0}])  →  l = ${l}`, act: "SKIP_LEFT",
        why: whySkip ? null : { title: "Why skip them?", text: "Spaces, commas and colons are not part of the phrase for this problem: only letters and digits count. Skipping them with the pointer avoids building a cleaned copy of the string." } });
      if (l !== l0) whySkip = true;
      const r0 = r;
      while (l < r && !isAl(s[r])) { skipped.add(r); r--; }
      if (r !== r0) T.step("skipR", { vars: vars(), state: S({ note: `skipped ${r0 - r} character${r0 - r === 1 ? "" : "s"} on the right` }), say: `\`s[${r0}]\` = “${q(s[r0])}” is not a letter or digit: skip it. \`r\` moves to **${r}**${r0 - r > 1 ? ` (${r0 - r} characters skipped)` : ""}.`, op: `!isalnum(s[${r0}])  →  r = ${r}`, act: "SKIP_RIGHT" });
      const a = s[l].toLowerCase(), b = s[r].toLowerCase(), eq = a === b;
      T.step("cmp", { vars: Object.assign(vars(), { "s[l]": q(s[l]), "s[r]": q(s[r]) }), state: S({ bad: eq ? [] : [l, r], note: l === r ? "the pointers met on one character" : undefined }), say: eq ? (l === r ? `Both pointers are on “${q(s[l])}”: a character always equals itself, so this pair matches.` : `Compare “${q(s[l])}” and “${q(s[r])}”${s[l] !== s[r] ? " ignoring case" : ""}: they are the same letter. The pair **matches**.`) : `Compare “${q(s[l])}” and “${q(s[r])}” (as “${a}” and “${b}” in lower case): they **differ**. The phrase is not a palindrome. Return \`false\`.`, op: `tolower(s[${l}]) != tolower(s[${r}])  →  '${a}' != '${b}'  →  ${!eq}`, act: eq ? "MATCH" : "MISMATCH",
        why: eq && s[l] !== s[r] && !whyCase ? { title: "Why lower-case both?", text: "The problem ignores case, so `A` and `a` are the same letter. Converting both to lower case before comparing gives that. Comparing digits needs no conversion: `tolower('0')` is still `'0'`." } : null });
      if (eq && s[l] !== s[r]) whyCase = true;
      if (!eq) { T.result(false); return; }
      matched.add(l); matched.add(r); pairs++;
      l++; r--;
      T.step("move", { vars: vars(), state: S(), say: `The pair matched: move both pointers inwards, \`l\` = ${l} and \`r\` = ${r}. The characters outside them are confirmed.`, op: "l++;  r--", act: "STEP_IN" });
    }
    T.step("ret", { vars: { "return": true }, state: S(), say: n ? "Every pair matched: the cleaned phrase reads the same both ways. Return `true`." : "An empty phrase reads the same both ways. Return `true`.", op: "return true", act: "DONE" });
    T.result(true);
  },
  fuzz(rnd) { const al = "aAb,. 1"; const n = Math.floor(rnd() * 11); return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * al.length)]).join("") }; },
  gen(n) { const h = "abcdefgh"; const half = Array.from({ length: Math.floor(n / 2) }, (_, i) => h[i % 8]); return { s: half.join("") + (n % 2 ? "x" : "") + half.slice().reverse().join("") }; },

  complexity: {
    time: {
      tex: "O(n)", title: "the two pointers together cross the string once", short: "each character is looked at at most once",
      derive: [
        "\\text{each iteration moves } l \\text{ right, } r \\text{ left, or both} || skipping and matching both advance a pointer",
        "\\#\\text{moves} \\le r_0 - l_0 = n - 1 || the gap $r - l$ starts at $n - 1$ and shrinks every move",
        "T(n) \\le (n-1)\\, c + c' || a constant amount of work per move",
        "!T(n) = O(n) || a single pass",
      ],
      where: "The nested `while` loops that skip characters do not make it quadratic: they move the same two pointers, which can only travel $n$ steps in total.",
    },
    space: {
      tex: "O(1)", title: "two integers", short: "`l` and `r`",
      derive: [
        "S = |l| + |r| = 2c || no cleaned or reversed copy",
        "!S = O(1) || constant extra space",
      ],
      where: "The brute force builds a cleaned string and a reversed copy: $O(n)$.",
    },
    limit: "Every alphanumeric character must be compared with its mirror, so $\\Omega(n)$ time is needed; the algorithm is optimal.",
    measure: { label: "n = length of the string (a palindrome)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Skipping without keeping `l < r`", what: "`while (!isalnum(s[l])) l++;` with no `l < r` check.", why: "The skip loop looks self-contained.", breaks: "For `\".,\"` or `\"!!\"` the pointer runs past the end of the string: out-of-bounds read in C++, `undefined` in JavaScript.", avoid: "Write `while (l < r && !isalnum(s[l])) l++;` (and the same on the right)." },
    { title: "Comparing case-sensitively", what: "`s[l] != s[r]`.", why: "Forgetting the \"ignoring case\" part of the statement.", breaks: "`\"Aa\"` and `\"A man, a plan…\"` are wrongly rejected.", avoid: "Convert both characters to lower case before comparing." },
    { title: "Treating characters 32 apart as the same letter", what: "`a == b || abs(a - b) == 32` as the case-insensitive test.", why: "Upper and lower case letters differ by 32 in ASCII, so it looks like a neat shortcut.", breaks: "It also equates non-letters: `'0'` (48) and `'P'` (80) are 32 apart, so `\"0P\"` would be judged a palindrome.", avoid: "Compare `tolower(a)` with `tolower(b)` after you have checked that both are alphanumeric." },
    { title: "Treating `_` or spaces as characters", what: "Using a regex class like `\\w` (which includes `_`) or keeping spaces.", why: "\"Word characters\" sounds like the right filter.", breaks: "`\"ab_a\"` becomes `ab_a`, which is not a palindrome, but the expected cleaned text is `aba`.", avoid: "Letters and digits only: `[a-z0-9]` ignoring case." },
    { title: "Building the reversed string and forgetting the cleanup", what: "Reversing `s` itself and comparing.", why: "Palindrome means \"equal to its reverse\".", breaks: "`\"A man, a plan\"` reversed contains the same punctuation in other places, so equal phrases are rejected.", avoid: "Clean first (or skip while comparing)." },
  ],

  followUps: [
    {
      q: "**Valid Palindrome II:** return `true` if the string can become a palindrome after deleting **at most one** character.",
      a: "Run the same two pointers. At the first mismatch `s[l] != s[r]`, you may delete either `s[l]` or `s[r]`: check whether `s[l+1..r]` or `s[l..r-1]` is a palindrome (plain palindrome checks). Only one mismatch is ever handled, so it is still $O(n)$.",
      cpp: `bool validPalindromeII(string s) {
    auto pal = [&](int l, int r) { while (l < r) if (s[l++] != s[r--]) return false; return true; };
    int l = 0, r = (int)s.size() - 1;
    while (l < r) {
        if (s[l] != s[r]) return pal(l + 1, r) || pal(l, r - 1);
        l++; r--;
    }
    return true;
}`,
      js: `function validPalindromeII(s) {
  const pal = (l, r) => { while (l < r) if (s[l++] !== s[r--]) return false; return true; };
  let l = 0, r = s.length - 1;
  while (l < r) {
    if (s[l] !== s[r]) return pal(l + 1, r) || pal(l, r - 1);
    l++; r--;
  }
  return true;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Check a **linked list** for being a palindrome in $O(1)$ space.",
      a: "A singly linked list has no `r` pointer that moves left. Find the middle with slow and fast pointers, reverse the second half in place, and compare the two halves from their heads. This is the same \"compare from both ends\" idea, built from two list-pointer moves you already know.",
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Find the **longest palindromic substring**.",
      a: "Treat every position (and every gap between two positions) as a centre and **expand** outwards while the two characters match. There are $2n - 1$ centres and each expansion costs $O(n)$ at most, so it is $O(n^2)$; Manacher's algorithm achieves $O(n)$. This is the next problem on the sheet.",
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "Count how many **characters** must be inserted to make a string a palindrome.",
      a: "That is $n$ minus the length of the longest palindromic subsequence, which is the LCS of the string with its reverse: dynamic programming in $O(n^2)$ time.",
      time: "O(n²)", space: "O(n²)",
    },
  ],

  related: [
    { id: "longest-palindromic-substring", why: "Grows a palindrome outwards from a centre, the mirror image of shrinking from both ends." },
    { id: "palindromic-substrings", why: "Counts all palindromic substrings with the same expand-around-centre idea." },
    { id: "container-with-most-water", why: "Two pointers from both ends of an array, moving inwards by a rule." },
    { id: "valid-anagram", why: "The other basic string check: same letters rather than same order." },
  ],
  patternNote: "**Two pointers from both ends** check symmetric conditions without copying: compare, then step inwards. When some elements must be ignored, skip them with an inner loop that always keeps `l < r`. The total movement of the two pointers is at most $n$, so the nested loops are still linear.",
  takeaways: [
    "A palindrome check ignoring punctuation and case: `l` and `r` skip non-alphanumerics, compare lower-cased characters, step inwards.",
    "Every skip loop must keep `l < r`, or the pointers run off the string (try `\".,\"`).",
    "Digits count; underscores and spaces do not; convert case with `tolower`, not by adding 32.",
    "The empty or all-punctuation phrase is a palindrome.",
    "Time $O(n)$, space $O(1)$: no cleaned or reversed copy is needed.",
  ],
});
