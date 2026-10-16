SHEETS.define({
  id: "longest-substring-without-repeating-characters",
  viz: "sliding",
  io: { fn: "lengthOfLongestSubstring", params: [["s", "str"]], ret: "int", labels: { s: "s (a string)" } },
  legend: [["win", "inside the window (all different)"], ["cur", "character just read"], ["cmp", "its earlier copy"], ["bad", "window with a repeat"], ["dim", "outside the window"]],

  statement: `Given a string \`s\`, find the length of the **longest substring** without repeating characters.

A *substring* is a contiguous part of the string (a *subsequence* may skip characters, a substring may not).`,
  examples: [
    { input: `s = "abcabcbb"`, output: "3", explain: "The longest substring without repeats is \"abc\", of length 3." },
    { input: `s = "bbbbb"`, output: "1", explain: "Every substring of two or more letters repeats `b`; the answer is \"b\", length 1." },
    { input: `s = "pwwkew"`, output: "3", explain: "\"wke\" has length 3. Note that \"pwke\" is a subsequence, not a substring." },
  ],
  constraints: ["$0 \\le$ `s.length` $\\le 5 \\cdot 10^4$", "`s` consists of English letters, digits, symbols and spaces"],
  check(input) {
    if (input.s.length > 14) return "for the animation use at most 14 characters";
    if (/[^\x20-\x7e]/.test(input.s)) return "use printable ASCII characters only";
    return null;
  },

  intuition: {
    find: "The longest **stretch of neighbouring characters in which every character is different**. We want only its length.",
    beginner: "Try every starting position. From each start, keep adding characters to a set until one is already in the set; the length reached is the best for that start. Take the maximum over all starts.",
    works: "Every substring begins somewhere, and for each start we find the longest repeat-free substring that begins there, so the overall maximum is found.",
    slow: "A start can walk far before hitting a repeat, and then the next start walks almost the same stretch again: in the worst case (all different letters) it is $O(n^2)$ steps, about 1.25 billion for $n = 5 \\cdot 10^4$.",
    repeat: "If \"abcde\" has no repeats, then starting one letter later, \"bcde\" certainly has none either. We **re-check characters we already know are fine**.",
    remember: "The window `[left, right]` that is repeat-free only ever needs to **move forward**. When a new character repeats one inside the window, the *only* thing that must change is `left`: it has to jump past the earlier copy. The right end never moves back.",
    observation: "Slide a window: `right` visits each character once. Remember, for every character, the **index where it was last seen**. When `s[right]` was last seen *inside* the window (`last[c] ≥ left`), jump `left` to `last[c] + 1`; the window is repeat-free again. Then record `last[c] = right` and update the best length.",
    leads: "For `right = 0 … n−1`: if `c = s[right]` was seen at an index `≥ left`, set `left = last[c] + 1`. Set `last[c] = right`. Best = max(best, `right − left + 1`). One pass, $O(n)$.",
  },

  flow: [
    "Try every start and extend until a character repeats.",
    "Each start finds the longest repeat-free run beginning there.",
    "Up to $O(n^2)$: starts re-walk characters that were already known to be fine.",
    "Only `left` has to move when a repeat appears: the window never needs to restart.",
    "Remember each character's last index; if it is inside the window, jump `left` past it.",
    "`right` visits every character once: $O(n)$ time, $O(\\min(n, \\sigma))$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every start index `i`, grow a set of characters while walking right (`j = i, i+1, …`) until the next character is already in the set. The distance walked is the longest repeat-free substring starting at `i`. Keep the maximum.",
    why: "Each start may walk almost to the end before it meets a repeat, so $n$ starts cost up to $n$ steps each: $O(n^2)$. Nearly all of that work revisits characters we already know are distinct, as the next start begins just one place later.",
    time: "O(n²)", space: "O(min(n, σ))",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 10000, 50000] },
    cpp: `class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        int best = 0, n = s.size();
        for (int i = 0; i < n; i++) {
            unordered_set<char> seen;
            for (int j = i; j < n; j++) {
                if (seen.count(s[j])) break;
                seen.insert(s[j]);
                best = max(best, j - i + 1);
            }
        }
        return best;
    }
};`,
    js: `function lengthOfLongestSubstring(s) {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = new Set();
    for (let j = i; j < s.length; j++) {
      if (seen.has(s[j])) break;
      seen.add(s[j]);
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
}`,
  },

  pattern: {
    name: "Sliding Window (variable size, with last-seen index)",
    why: "A **window** `[left, right]` that moves only forward turns \"check every substring\" into a single pass. For *uniqueness* constraints, remembering **where each character was last seen** lets the left edge jump straight to the right place instead of creeping one step at a time.",
    recognize: [
      "You need the **longest (or shortest) substring/subarray** that satisfies a rule about its contents.",
      "The rule is *monotone*: if a window is valid, every smaller window inside it is valid too (or the reverse).",
      "Words like *\"without repeating\"*, *\"at most k distinct\"*, *\"contiguous\"*.",
      "A brute force that restarts from every index re-reads almost the same characters.",
    ],
  },

  optimal: {
    idea: "Keep a window `[left, right]` that never contains a repeated character, and a map `last` from each character to the index where it was most recently seen. Move `right` one character at a time. If the new character was last seen inside the window, move `left` to one past that earlier copy; this removes the repeat. Record the new `last` index, and update the best length.",
    steps: [
      "Set `left = 0`, `best = 0`, and an empty map `last`.",
      "For each `right` from `0` to `n − 1`, let `c = s[right]`.",
      "If `c` is in `last` and `last[c] ≥ left` (its earlier copy is inside the window), set `left = last[c] + 1`.",
      "Set `last[c] = right`.",
      "Set `best = max(best, right − left + 1)`.",
      "Return `best`.",
    ],
    invariant: "**After processing index `right`, the substring `s[left..right]` has no repeated character, and `left` is as small as possible for that to hold.**",
    correct: "Assume the invariant before reading `s[right] = c`. A repeat appears only if `c` is already inside `s[left..right-1]`, i.e. its most recent earlier position `p = last[c]` satisfies `p ≥ left`. In that case the window must start after `p` to be repeat-free, and starting at `p + 1` is the smallest legal choice (all characters in `s[p+1..right-1]` are distinct, being part of the old window). If `p < left` (or `c` is new) no repeat appears and `left` is unchanged. Either way the new window is repeat-free with the smallest possible `left`, so `right − left + 1` is the longest repeat-free substring ending at `right`; the maximum over all `right` is the answer. `left` never decreases (the `p ≥ left` test makes `left` jump forward only), which is why a stale entry for a character that has left the window cannot move it backwards.",
  },

  cpp: `class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        unordered_map<char, int> last;          // character -> index where it was last seen //@init
        int best = 0, left = 0;
        for (int right = 0; right < (int)s.size(); right++) {   //@loop
            char c = s[right];
            if (last.count(c) && last[c] >= left) left = last[c] + 1;   // repeat inside the window //@jump
            last[c] = right;                    // remember where we saw it //@store
            best = max(best, right - left + 1); // longest so far //@best
        }
        return best;                            //@ret
    }
};`,
  js: `function lengthOfLongestSubstring(s) {
  const last = new Map();                // character -> index where it was last seen //@init
  let best = 0, left = 0;
  for (let right = 0; right < s.length; right++) {   //@loop
    const c = s[right];
    if (last.has(c) && last.get(c) >= left) left = last.get(c) + 1;   // repeat inside the window //@jump
    last.set(c, right);                  // remember where we saw it //@store
    best = Math.max(best, right - left + 1);   // longest so far //@best
  }
  return best;                           //@ret
}`,

  tests: [
    { name: "Example 1: abcabcbb", kind: "normal", input: { s: "abcabcbb" } },
    { name: "Example 2: bbbbb", kind: "normal", input: { s: "bbbbb" } },
    { name: "Example 3: pwwkew", kind: "normal", input: { s: "pwwkew" } },
    { name: "Empty string", kind: "edge", input: { s: "" }, why: "There are no characters, so the loop never runs and `best` stays `0`. The answer for an empty string is `0`, not `1`." },
    { name: "A single character", kind: "edge", input: { s: "a" }, why: "One character is its own repeat-free substring: the window `[0, 0]` has length 1." },
    { name: "All different", kind: "edge", input: { s: "abcdef" }, why: "No character repeats, so `left` never moves and the window grows to the whole string: the answer is the length of the string, 6." },
    { name: "The old copy is outside the window (abba)", kind: "edge", input: { s: "abba" }, why: "At the final `a`, its last index is 0, but `left` is already 2 (the second `b` moved it). The test `last[c] >= left` is false, so `left` stays: the answer is 2 (`ba`). Without that test, `left` would jump **back** to 1 and give a window that contains `bb`." },
    { name: "A repeat after the window moved (tmmzuxt)", kind: "edge", input: { s: "tmmzuxt" }, why: "The first `t` is far to the left, outside the window by the time the last `t` arrives. A solution that uses the *map's mere presence* of `t` would move `left` backwards and report 4 instead of the correct 5 (`mzuxt`)." },
    { name: "A repeat of the first letter (dvdf)", kind: "corner", input: { s: "dvdf" }, why: "The window `dv` is hit by the second `d`: `left` jumps to index 1 (not to the right end), keeping `v`, so the window `vdf` of length 3 is found. Restarting the window at the repeat would lose it and answer 2." },
    { name: "Spaces and symbols", kind: "corner", input: { s: "a b a!b" }, why: "Spaces and punctuation are ordinary characters (the map is keyed by any character, not just letters). Here the window `b a!` (length 4) is the best." },
    { name: "Upper and lower case differ", kind: "corner", input: { s: "aAbBaA" }, why: "`a` and `A` are different characters, so `aAbB` has no repeat: the answer is 4. Lower-casing the input would wrongly shorten it." },
  ],

  trace(input, T) {
    const s = input.s, n = s.length, chars = s.split("");
    const last = new Map();
    let left = 0, best = 0, bestL = 0, bestR = -1;
    let whyJump = false, whyStale = false, whyBest = false;
    const q = (c) => (c === " " ? "␣" : c);
    const S = (o = {}) => () => {
      const hl = {};
      const l = o.l !== undefined ? o.l : left, r = o.r;
      if (o.cur !== undefined) hl[o.cur] = "cur";
      if (o.old !== undefined) hl[o.old] = "cmp";
      return {
        arr: chars.map(q), l: r !== undefined && r >= l ? l : undefined, r: r !== undefined && r >= l ? r : undefined, bad: !!o.bad, hl,
        freq: { entries: [...last.entries()].map(([c, i]) => [q(c), i]), hl: o.fhl ? { [q(o.fhl)]: "hit" } : {}, title: "last seen index", keyLabel: "char", valLabel: "index" },
        best: { label: "longest so far", text: bestR >= 0 ? `${best}   “${s.slice(bestL, bestR + 1)}”` : "0" },
        label: `string  “${s}”`, note: o.note,
      };
    };
    const vars = (right) => ({ right: right === undefined ? "–" : right, left, best });
    T.step("init", { vars: vars(), state: S({ r: undefined }), phase: "Slide the window to the right", say: n ? `The string has ${n} character${n === 1 ? "" : "s"}. We keep a window \`[left, right]\` with no repeated character, and a map from each character to the index where it was last seen.` : "The string is empty: there are no characters to read, so the loop will not run.", op: "last = { },  left = 0,  best = 0", act: "START" });
    for (let right = 0; right < n; right++) {
      const c = s[right];
      T.step("loop", { vars: vars(right), state: S({ cur: right, r: right - 1, note: `reading “${q(c)}” at index ${right}` }), say: `\`right\` = ${right}: read the character **“${q(c)}”**. The current window is ${right - 1 >= left ? `\`s[${left}..${right - 1}]\`` : "empty"}.`, op: `c = s[${right}] = '${q(c)}'`, act: "READ" });
      const p = last.has(c) ? last.get(c) : -1;
      const inside = p >= left;
      if (inside) {
        const oldLeft = left;
        left = p + 1;
        T.step("jump", { vars: vars(right), state: S({ cur: right, old: p, r: right, l: oldLeft, bad: true, note: `“${q(c)}” was last seen at index ${p}, inside the window` }), say: `“${q(c)}” was last seen at index **${p}**, which is **inside** the window (${p} ≥ left = ${oldLeft}). The window \`s[${oldLeft}..${right}]\` would contain it twice, so \`left\` jumps to **${left}**, just past the earlier copy.`, op: `last['${q(c)}'] = ${p} >= left  →  left = ${left}`, act: "JUMP_LEFT",
          why: whyJump ? null : { title: "Why jump to p + 1?", text: "Any window that includes both copies of the character is illegal. The nearest legal start is the position right after the earlier copy. Characters between the old `left` and `p` are discarded, but nothing to the right of `p` is: those stay in the window without being re-read." } });
        whyJump = true;
      } else {
        T.step("jump", { vars: vars(right), state: S({ cur: right, r: right, note: p >= 0 ? `“${q(c)}” was seen at index ${p}, but that is outside the window` : `“${q(c)}” has not been seen before` }), say: p >= 0 ? `“${q(c)}” was last seen at index ${p}, but \`left\` is already ${left} (${p} < ${left}): the earlier copy is **outside** the window, so there is no repeat and \`left\` stays.` : `“${q(c)}” has not been seen before, so there is no repeat and \`left\` stays at ${left}.`, op: p >= 0 ? `last['${q(c)}'] = ${p} < left = ${left}  →  no jump` : `'${q(c)}' not in last  →  no jump`, act: "NO_REPEAT",
          why: p >= 0 && !whyStale ? { title: "Why must we compare with `left`?", text: "The map is never cleaned: it still holds characters that have long left the window. A stale index smaller than `left` must be ignored, otherwise `left` would move **backwards** and the window would include a repeat." } : null });
        if (p >= 0) whyStale = true;
      }
      last.set(c, right);
      T.step("store", { vars: vars(right), state: S({ cur: right, r: right, fhl: c }), say: `Record that “${q(c)}” was last seen at index **${right}**.`, op: `last['${q(c)}'] = ${right}`, act: "STORE" });
      const len = right - left + 1;
      const better = len > best;
      if (better) { best = len; bestL = left; bestR = right; }
      T.step("best", { vars: vars(right), state: S({ r: right }), say: better ? `The window \`s[${left}..${right}]\` = “${s.slice(left, right + 1)}” has length ${len}, longer than any before: **best = ${best}**.` : `The window has length ${len}, which does not beat the best (${best}).`, op: `best = max(best, ${right} - ${left} + 1) = ${best}`, act: better ? "NEW_BEST" : "KEEP_BEST" });
    }
    T.step("ret", { vars: { best }, state: S({ r: undefined }), say: n ? `The whole string has been read. The longest repeat-free substring has length **${best}**${best ? `, for example “${s.slice(bestL, bestR + 1)}”` : ""}.` : "The string is empty, so the answer is **0**.", op: `return ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { const al = "abc d"; const n = Math.floor(rnd() * 11); return { s: Array.from({ length: n }, () => al[Math.floor(rnd() * al.length)]).join("") }; },
  gen(n) { return { s: Array.from({ length: n }, (_, i) => "abcdefgh"[i % 8]).join("") }; },

  complexity: {
    time: {
      tex: "O(n)", title: "right visits every character once, left only moves forward", short: "n iterations, each a few O(1) map operations",
      derive: [
        "T(n) = \\sum_{\\text{right}=0}^{n-1} \\big(c_{\\text{read}} + c_{\\text{lookup}} + c_{\\text{jump}} + c_{\\text{store}} + c_{\\text{best}}\\big) || a constant number of hash-map operations per character",
        "\\text{left} \\text{ never decreases and } \\text{left} \\le n \\;\\Rightarrow\\; \\text{total movement of left} \\le n || the jump is a single assignment, not a loop",
        "!T(n) = c \\cdot n = O(n) || each character is read once; no character is re-scanned",
      ],
      where: "A hash map lookup is $O(1)$ on average. The brute force re-walks up to $n$ characters per start; here the left edge jumps instead of creeping, so no character is read twice. The measured table counts the four basic steps per character, so it grows in a straight line.",
    },
    space: {
      tex: "O(\\min(n, \\sigma))", title: "one map entry per distinct character", short: "σ is the size of the alphabet (about 128 for ASCII)",
      derive: [
        "|\\text{last}| \\le \\min(n, \\sigma) || a key is added only for a character not seen before",
        "!S = O(\\min(n, \\sigma)) || constant for a fixed alphabet",
      ],
      where: "For ASCII text the map has at most 128 entries, so in practice the space is constant. The brute force also used up to $\\min(n, \\sigma)$ for its set, so the improvement is in time.",
    },
    limit: "Every character must be read at least once, so $\\Omega(n)$ time is required: the window method is optimal.",
    measure: { label: "n = length of the string", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Moving `left` back with a stale index", what: "`left = last[c] + 1` without testing `last[c] >= left`.", why: "The map says the character was seen, so it seems to be a repeat.", breaks: "For `abba` the final `a` moves `left` from 2 back to 1: the window `bba` contains `bb`, and the answer 3 is wrong (the right answer is 2).", avoid: "`left = max(left, last[c] + 1)` or test `last[c] >= left` first." },
    { title: "Resetting the window to the repeat", what: "On a repeat, setting `left = right` (start again from the new character).", why: "\"The window is broken, so start a new one\".", breaks: "For `dvdf` the answer is 3 (`vdf`), but restarting at the second `d` loses `v` and gives 2.", avoid: "Move `left` only past the **earlier copy** of the character." },
    { title: "Treating the answer as the set size", what: "Returning the number of distinct characters in the string.", why: "\"No repeats\" sounds like \"distinct\".", breaks: "A substring must be contiguous: for `abcabcbb` the distinct letters are 3 (correct by luck), but for `pwwkew` they are 4 and the answer is 3.", avoid: "Measure the **window** `right − left + 1`." },
    { title: "Using `n − left` instead of `right − left + 1`", what: "Computing the length from the end of the string.", why: "Off-by-one thinking about the window.", breaks: "The best window is measured to the end of the string, not up to `right`, which over-counts.", avoid: "Window length is `right − left + 1`." },
    { title: "Forgetting the empty string", what: "Initialising `best = 1` or reading `s[0]` before the loop.", why: "A non-empty string always has an answer of at least 1.", breaks: "For `s = \"\"` the answer must be 0; `best = 1` is wrong and `s[0]` may read out of range.", avoid: "`best = 0` and let the loop handle the empty case." },
  ],

  followUps: [
    {
      q: "Use a fixed **array of 128 integers** instead of a hash map.",
      a: "For ASCII input, replace the map by `int last[128]` filled with `-1`. Look-ups become array reads, and there is no hashing at all. It is the same algorithm with a smaller constant, $O(n)$ time and $O(1)$ space (128 integers).",
      cpp: `int lengthArray(string s) {
    int last[128];
    for (int i = 0; i < 128; i++) last[i] = -1;
    int best = 0, left = 0;
    for (int right = 0; right < (int)s.size(); right++) {
        unsigned char c = s[right];
        if (last[c] >= left) left = last[c] + 1;
        last[c] = right;
        best = max(best, right - left + 1);
    }
    return best;
}`,
      js: `function lengthArray(s) {
  const last = new Array(128).fill(-1);
  let best = 0, left = 0;
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right);
    if (last[c] >= left) left = last[c] + 1;
    last[c] = right;
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
      time: "O(n)", space: "O(1)",
    },
    {
      q: "Return the **substring itself**, not only its length.",
      a: "Remember where the best window started: whenever `right − left + 1 > best`, also save `bestStart = left`. At the end return `s.substr(bestStart, best)`. This costs one extra integer.",
      time: "O(n)", space: "O(min(n, σ))",
    },
    {
      q: "Longest substring with **at most `k` distinct** characters.",
      a: "Keep counts of the characters in the window. Extend `right`; while the window has more than `k` distinct characters, remove `s[left]` and move `left`. The best length is tracked as before. Each character enters and leaves once: $O(n)$.",
      time: "O(n)", space: "O(k)",
    },
    {
      q: "Count the substrings that have **no repeated character**.",
      a: "For each `right`, the repeat-free substrings that end at `right` are exactly those starting at `left … right`: there are `right − left + 1` of them. Add that to a running total as the window slides: $O(n)$.",
      time: "O(n)", space: "O(min(n, σ))",
    },
  ],

  related: [
    { id: "longest-repeating-character-replacement", why: "A variable window again, but the validity rule counts the most common letter." },
    { id: "minimum-window-substring", why: "The same window with two pointers, but looking for the *shortest* valid window." },
    { id: "best-time-to-buy-and-sell-stock", why: "Another one-pass idea: remember the best state seen so far instead of looking back." },
    { id: "contains-duplicate", why: "The yes/no version of the same question (any repeat at all?), answered with a set." },
  ],
  patternNote: "**Sliding window** keeps a contiguous range `[left, right]` that satisfies a rule and moves each end only forward. Expand `right` to take in a new element; if the rule breaks, move `left` just far enough to repair it. Because neither end moves backwards, the whole scan is $O(n)$, whatever size the answer has.",
  takeaways: [
    "Never restart: `right` reads each character once, and `left` jumps forward to repair the window.",
    "Store each character's **last index**; on a repeat set `left = last[c] + 1`, but only if `last[c] >= left`.",
    "The answer is the window length `right − left + 1`, tracked as a maximum; the empty string gives 0.",
    "Stale map entries (characters that left the window) must be ignored: compare with `left`.",
    "Time $O(n)$, space $O(\\min(n, \\sigma))$; an array of 128 ints makes the constant tiny.",
  ],
});
