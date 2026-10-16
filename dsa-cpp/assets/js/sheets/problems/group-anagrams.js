SHEETS.define({
  id: "group-anagrams",
  viz: "hashmap",
  io: { fn: "groupAnagrams", params: [["strs", "str[]"]], ret: "str[][]", canon: "deep", labels: { strs: "strs (an array of words)" } },
  legend: [["cur", "word being filed"], ["ok", "word already filed"], ["hit", "group that just changed"], ["key", "group in the map"]],

  statement: `Given an array of strings \`strs\`, **group the anagrams together**. You can return the answer in **any order**.

An *anagram* is a word formed by rearranging the letters of another word, using all the original letters exactly once.`,
  examples: [
    { input: `strs = ["eat", "tea", "tan", "ate", "nat", "bat"]`, output: `[["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]`, explain: "`eat`, `tea`, `ate` use the same letters; so do `tan` and `nat`; `bat` is alone. The order of the groups and of the words inside a group does not matter." },
    { input: `strs = [""]`, output: `[[""]]`, explain: "The empty word forms a group of its own." },
    { input: `strs = ["a"]`, output: `[["a"]]`, explain: "A single word is a group of one." },
  ],
  constraints: ["$1 \\le$ `strs.length` $\\le 10^4$", "$0 \\le$ `strs[i].length` $\\le 100$", "`strs[i]` consists of lowercase English letters"],
  check(input) {
    if (input.strs.length > 6) return "for the animation use at most 6 words";
    if (input.strs.some((w) => w.length > 6)) return "for the animation use words of at most 6 letters";
    if (input.strs.some((w) => !/^[a-z]*$/.test(w))) return "use lowercase letters a to z only";
    return null;
  },

  intuition: {
    find: "Put words into the same group exactly when they are made of the **same letters with the same counts**. The groups may be returned in any order.",
    beginner: "Take the first unused word. Compare it with every later word: if they are anagrams (same sorted letters), put them in its group and mark them used. Repeat for the next unused word.",
    works: "Every word ends up in the group of the first word it matches, and anagram-ness is transitive, so the groups are exactly the anagram classes.",
    slow: "Each word is compared with up to every other word, and each comparison sorts two words: $O(N^2 \\cdot L \\log L)$ for $N$ words of length $L$. For $10^4$ words that is $10^8$ comparisons.",
    repeat: "Two words that are anagrams are compared again and again, and a word is sorted again for every comparison. We recompute the same *fingerprint* of a word many times.",
    remember: "Every word has a **fingerprint** that is *identical for all its anagrams and different for everything else*: its sorted letters (`eat → aet`), or its letter counts (`a1 e1 t1`). A fingerprint can be a **key in a hash map**.",
    observation: "Compute each word's fingerprint **once** and use it as the key of a hash map whose values are lists of words. Words with equal fingerprints land in the same list, with no comparisons between words at all. A count signature (26 counts) is built in $O(L)$ without sorting.",
    leads: "For each word, count its letters, turn the 26 counts into a string key (with a separator), and append the word to `groups[key]`. At the end, output all the lists. $O(N \\cdot L)$ time.",
  },

  flow: [
    "Compare each unused word with all later words using a sort-and-compare test.",
    "Anagram-ness is an equivalence, so first-match grouping gives the classes.",
    "$O(N^2 L \\log L)$: words are compared pairwise and re-sorted every time.",
    "A word's fingerprint (sorted letters or letter counts) is the same for all its anagrams.",
    "Use the fingerprint as a hash-map key and append the word to that list.",
    "One pass, no pairwise comparisons: $O(N \\cdot L)$ time, $O(N \\cdot L)$ space.",
  ],

  brute: {
    idea: "**Brute force:** for every word not yet placed, start a new group with it. Scan the remaining words: whenever a later word has the same sorted letters as the first word, add it to the group and mark it as used.",
    why: "Each of the $N$ words may be compared with all the others, and every comparison sorts two words of length $L$ ($O(L \\log L)$): $O(N^2 L \\log L)$ in total. The same word is sorted again for every comparison.",
    time: "O(N² · L log L)", space: "O(N · L)",
    measure: { fTex: "N^2", f: (n) => n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        int n = strs.size();
        vector<vector<string>> out;
        vector<bool> used(n, false);
        for (int i = 0; i < n; i++) {
            if (used[i]) continue;
            used[i] = true;
            vector<string> group = {strs[i]};
            string key = strs[i];
            sort(key.begin(), key.end());
            for (int j = i + 1; j < n; j++) {
                if (used[j]) continue;
                string other = strs[j];
                sort(other.begin(), other.end());
                if (other == key) { group.push_back(strs[j]); used[j] = true; }
            }
            out.push_back(group);
        }
        return out;
    }
};`,
    js: `function groupAnagrams(strs) {
  const n = strs.length, out = [], used = new Array(n).fill(false);
  const sorted = (w) => w.split("").sort().join("");
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = true;
    const group = [strs[i]], key = sorted(strs[i]);
    for (let j = i + 1; j < n; j++) {
      if (used[j]) continue;
      if (sorted(strs[j]) === key) { group.push(strs[j]); used[j] = true; }
    }
    out.push(group);
  }
  return out;
}`,
  },

  pattern: {
    name: "Hash Map (canonical key / fingerprint)",
    why: "When items must be grouped by a property, find a **canonical form**: a key that is equal exactly for the items you want together. A hash map from key to list then groups everything in one pass, with no pairwise comparison.",
    recognize: [
      "You must **group**, **bucket** or **deduplicate** items by an equivalence (anagrams, rotations, same digits).",
      "A comparison between two items is expensive, but a canonical form of one item is cheap.",
      "Items that belong together have an obvious *signature* (sorted letters, counts, normalised string).",
      "The output is a collection of lists, in any order.",
    ],
  },

  optimal: {
    idea: "Give each word a signature that all its anagrams share: the counts of its 26 letters, written as text (for example `a1#e1#t1#` with zeros written too). Use the signature as the key of a hash map from key to list of words. Appending every word to `groups[key]` puts anagrams together; the answer is the collection of the lists.",
    steps: [
      "Create an empty map `groups` from string to list of strings.",
      "For each word `w`: count its letters in `cnt[26]` (one pass over `w`).",
      "Build the key by writing the 26 counts with a separator: `\"1#0#0#…\"`.",
      "Append `w` to `groups[key]`.",
      "Return all the lists of the map (any order).",
    ],
    invariant: "**After processing the first `k` words, `groups` contains one list per distinct signature among those words, and each list holds exactly the processed words with that signature.**",
    correct: "Two words are anagrams if and only if their letter counts are equal, and the key is an injective encoding of the 26 counts (the separator makes `11#1` differ from `1#11`), so two words receive the same key exactly when they are anagrams. Each word is appended to the list of its key, so a list contains all and only the anagrams seen so far of one class. After the last word, every anagram class has one list, and every word is in exactly one list: the lists are the required grouping.",
  },

  cpp: `class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> groups;   // signature -> words //@init
        for (const string& w : strs) {          //@loop
            int cnt[26] = {0};
            for (char c : w) cnt[c - 'a']++;    // count the letters //@count
            string key;
            for (int x : cnt) key += to_string(x) + "#";   // signature of the word //@key
            groups[key].push_back(w);           // file the word under it //@group
        }
        vector<vector<string>> out;
        for (auto& kv : groups) out.push_back(kv.second);   // collect the groups //@collect
        return out;                             //@ret
    }
};`,
  js: `function groupAnagrams(strs) {
  const groups = new Map();              // signature -> words //@init
  for (const w of strs) {                //@loop
    const cnt = new Array(26).fill(0);
    for (const c of w) cnt[c.charCodeAt(0) - 97]++;   // count the letters //@count
    const key = cnt.join("#");           // signature of the word //@key
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);             // file the word under it //@group
  }
  const out = [...groups.values()];      // collect the groups //@collect
  return out;                            //@ret
}`,

  tests: [
    { name: "Example 1: eat, tea, tan, ate, nat, bat", kind: "normal", input: { strs: ["eat", "tea", "tan", "ate", "nat", "bat"] } },
    { name: "Example 2: one empty word", kind: "normal", input: { strs: [""] } },
    { name: "Example 3: one word", kind: "normal", input: { strs: ["a"] } },
    { name: "listen / silent / enlist / google / gogole", kind: "normal", input: { strs: ["listen", "silent", "enlist", "google", "gogole"] } },
    { name: "No two words are anagrams", kind: "edge", input: { strs: ["abc", "def", "ghi"] }, why: "Every word has its own signature, so the map ends with three lists of one word. The answer is three groups, not an empty answer." },
    { name: "All words are anagrams", kind: "edge", input: { strs: ["abc", "bca", "cab", "acb"] }, why: "All four words share one signature, so there is a single group of four. The order inside the group follows the input order, but the checker ignores order." },
    { name: "Repeated identical words", kind: "edge", input: { strs: ["a", "a", "a"] }, why: "Identical words are anagrams of each other and are all kept (not deduplicated): one group `[a, a, a]`." },
    { name: "Several empty words", kind: "edge", input: { strs: ["", ""] }, why: "The empty word has the all-zero signature `0#0#…#`. Both empty words share it, so they form one group `[\"\", \"\"]`." },
    { name: "Same letters, different counts", kind: "corner", input: { strs: ["aab", "abb", "aba", "bab"] }, why: "All four words use only `a` and `b`, so a **set** key would put them in one group. The count signatures differ (`a2 b1` against `a1 b2`), giving two groups: `{aab, aba}` and `{abb, bab}`." },
    { name: "Different lengths", kind: "corner", input: { strs: ["ab", "abc", "ba"] }, why: "Words of different lengths can never be anagrams: `ab`/`ba` form a group, and `abc` stands alone. The count signature differs because the totals differ." },
  ],

  trace(input, T) {
    const words = input.strs, n = words.length;
    const groups = new Map();
    let whyKey = false, whyMap = false;
    const label = (cnt) => cnt.map((x, i) => (x ? String.fromCharCode(97 + i) + x : "")).filter(Boolean).join(" ") || "(empty)";
    const S = (o = {}) => () => ({
      arr: words.map((w) => w || "·"), hl: o.hl || {}, ptr: o.ptr || {}, cw: 78, size: 13, label: "words", calc: o.calc,
      map: { entries: [...groups.values()].map((g) => [g.lab, g.list.map((w) => w || "“”").join(" · ")]), hl: o.mhl || {}, title: "groups  (signature → words)", keyLabel: "signature", valLabel: "words in the group", kw: 112, vw: 250 },
    });
    const done = (k) => Object.fromEntries(Array.from({ length: k }, (_, i) => [i, "ok"]));
    T.step("init", { vars: { words: n }, state: S(), phase: "File every word under its signature", say: `${n} word${n === 1 ? "" : "s"} to group. We make an empty map from a word's **letter-count signature** to the list of words that have it.`, op: "groups = { }", act: "START" });
    for (let i = 0; i < n; i++) {
      const w = words[i];
      T.step("loop", { vars: { i, word: w || "“”", groups: groups.size }, state: S({ hl: Object.assign(done(i), { [i]: "cur" }), ptr: { i } }), say: `Take word ${i + 1}: **${w || "the empty word"}**.`, op: `w = strs[${i}] = "${w}"`, act: "NEXT_WORD" });
      const cnt = new Array(26).fill(0);
      for (const c of w) cnt[c.charCodeAt(0) - 97]++;
      const lab = label(cnt);
      T.step("count", { w: Math.max(1, w.length), vars: { word: w || "“”", counts: lab }, state: S({ hl: Object.assign(done(i), { [i]: "cur" }), ptr: { i }, calc: `letter counts of “${w}”:  ${lab}` }), say: w ? `Count the letters of **${w}**: ${lab}. This takes one step per letter, so ${w.length} step${w.length === 1 ? "" : "s"}.` : "The empty word has no letters: all 26 counters are zero.", op: `cnt = counts of "${w}"`, act: "COUNT" });
      const key = cnt.join("#"), exists = groups.has(key);
      T.step("key", { w: 26, vars: { word: w || "“”", signature: lab }, state: S({ hl: Object.assign(done(i), { [i]: "cur" }), ptr: { i }, calc: `signature (26 counts written out):  ${lab}`, mhl: exists ? { [groups.get(key).lab]: "hit" } : {} }), say: exists ? `Write the 26 counts as a key. This signature **already has a group**, so the word is an anagram of a word we have filed.` : `Write the 26 counts as a key (with \`#\` between them so that \`1#11\` and \`11#1\` differ). No group has this signature yet, so a **new group** will start.`, op: "key = counts joined with '#'", act: exists ? "KNOWN_SIGNATURE" : "NEW_SIGNATURE",
        why: whyKey ? null : { title: "Why is the signature a good key?", text: "Two words are anagrams exactly when all 26 letter counts are equal. The signature is those 26 counts written out, so equal signatures mean anagrams and different signatures mean they are not. It is computed from one word alone: no word is ever compared with another." } });
      whyKey = true;
      if (!exists) groups.set(key, { lab, list: [] });
      const g = groups.get(key);
      g.list.push(w);
      T.step("group", { vars: { word: w || "“”", groups: groups.size }, state: S({ hl: done(i + 1), ptr: { i }, mhl: { [lab]: "hit" } }), say: `File **${w || "the empty word"}** under the signature (${lab}). That group now holds ${g.list.length} word${g.list.length === 1 ? "" : "s"}: ${g.list.map((x) => x || "“”").join(", ")}.`, op: `groups[key].push_back("${w}")`, act: "FILE",
        why: whyMap ? null : { title: "Why a hash map?", text: "Looking up a signature and appending to its list is $O(1)$ on average. So each word is filed in time proportional to its own length, however many words there are." } });
      whyMap = true;
    }
    const out = [...groups.values()].map((g) => g.list.slice());
    T.step("collect", { vars: { groups: out.length }, state: S({ hl: done(n) }), say: `All words are filed. The map holds **${out.length}** group${out.length === 1 ? "" : "s"}; we copy the lists into the answer (in any order).`, op: "out = all the lists of groups", act: "COLLECT" });
    T.step("ret", { vars: { "return": `${out.length} groups` }, state: S({ hl: done(n) }), say: `Return the ${out.length} group${out.length === 1 ? "" : "s"}: ${out.map((g) => "[" + g.map((x) => (x === "" ? "\"\"" : x)).join(", ") + "]").join("  ")}.`, op: "return out", act: "DONE" });
    T.result(out);
  },
  fuzz(rnd) { const al = "abc"; const n = Math.floor(rnd() * 7); return { strs: Array.from({ length: n }, () => Array.from({ length: Math.floor(rnd() * 5) }, () => al[Math.floor(rnd() * 3)]).join("")) }; },
  gen(n) { return { strs: Array.from({ length: n }, (_, i) => "abc".split("").sort((x, y) => ((x.charCodeAt(0) + i) % 3) - ((y.charCodeAt(0) + i) % 3)).join("")) }; },

  complexity: {
    time: {
      tex: "O(N \\cdot (L + \\sigma))", title: "each word is counted once and keyed once", short: "N words, L letters to count and σ = 26 counters to write per word",
      derive: [
        "T_{\\text{count}}(w) = |w| \\cdot c \\le L\\, c || one increment per letter",
        "T_{\\text{key}}(w) = 26\\, c' || writing the 26 counters into a key (a constant)",
        "T_{\\text{file}}(w) = O(L + 26) \\text{ expected} || hashing the key, then appending to a list",
        "!T(N) = N\\,(L + 26)\\,c = O(N \\cdot L) || for $L \\ge 1$ the constant 26 is absorbed",
      ],
      where: "Here $N$ is the number of words and $L$ the length of the longest word. Hashing a key of length $O(\\sigma)$ costs a constant for the 26-letter alphabet. The brute force compares word pairs and sorts each time; the sorted-key variant costs $O(N \\cdot L \\log L)$ because of the sort.",
    },
    space: {
      tex: "O(N \\cdot L)", title: "the map stores every word once", short: "plus one key of constant length per group",
      derive: [
        "S_{\\text{words}} = \\sum |w| \\le N L || every word is stored in exactly one list",
        "S_{\\text{keys}} \\le N \\cdot 26 \\cdot c || at most one key per group, and there are at most $N$ groups",
        "!S = O(N \\cdot L) || the output itself has this size",
      ],
      where: "The output alone has $N \\cdot L$ characters, so any solution needs at least this much space.",
    },
    limit: "Every letter of every word must be read once to know its class, so $\\Omega(N \\cdot L)$ time is needed: the counting-key method is optimal.",
    measure: { label: "N = number of words (3 letters each)", fTex: "N", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear in the number of words" },
  },

  mistakes: [
    { title: "A key without separators", what: "Joining the counts with nothing between them (`\"1\" + \"11\"`).", why: "The counts are just digits, so they seem to stay apart.", breaks: "The counts `(1, 11, …)` and `(11, 1, …)` both give `\"111…\"`: different words get the same key.", avoid: "Put a separator (`#`, a comma) between the counts." },
    { title: "Using the set of letters as the key", what: "Key = the distinct letters of the word.", why: "\"Same letters\" sounds like \"same set\".", breaks: "`aab` and `abb` have the same letter set but are not anagrams.", avoid: "Use the sorted word or the full letter counts." },
    { title: "Comparing every pair of words", what: "Two nested loops with an anagram test inside.", why: "It directly follows the definition.", breaks: "$O(N^2)$ comparisons, each sorting two words: too slow for $10^4$ words.", avoid: "Compute one key per word and group by key." },
    { title: "Sorting the original word in place", what: "`sort(w.begin(), w.end())` on the stored word, then pushing it.", why: "The sorted word is needed as the key.", breaks: "The group would contain the sorted words (`aet`) instead of the original words (`eat`).", avoid: "Sort a **copy** for the key and store the original word." },
    { title: "Dropping empty strings or duplicates", what: "Skipping `\"\"` or inserting words into a set.", why: "They look like noise.", breaks: "The problem expects `[[\"\"]]` for `[\"\"]` and every copy of a repeated word to appear.", avoid: "Treat the empty word as an ordinary word (signature all zeros) and keep duplicates." },
  ],

  followUps: [
    {
      q: "Use the **sorted word** as the key instead of the counts.",
      a: "For each word, sort a copy of its letters and use that as the key: `eat`, `tea` and `ate` all become `aet`. It is shorter to write and works for any alphabet, but costs $O(L \\log L)$ per word, so $O(N \\cdot L \\log L)$ in total. The counting signature is $O(L)$ for a small alphabet.",
      cpp: `vector<vector<string>> groupSorted(vector<string>& strs) {
    unordered_map<string, vector<string>> groups;
    for (const string& w : strs) {
        string key = w;
        sort(key.begin(), key.end());
        groups[key].push_back(w);
    }
    vector<vector<string>> out;
    for (auto& kv : groups) out.push_back(kv.second);
    return out;
}`,
      js: `function groupSorted(strs) {
  const groups = new Map();
  for (const w of strs) {
    const key = w.split("").sort().join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  return [...groups.values()];
}`,
      time: "O(N · L log L)", space: "O(N · L)",
    },
    {
      q: "The words may use **any Unicode letters**. How do you build the key?",
      a: "The sorted-word key still works (sort the code points). A count key needs a sparse representation: a sorted list of `(letter, count)` pairs written as text. Each word costs $O(L \\log L)$ or $O(L)$ with a hash of counts, plus the cost to normalise the order of the pairs.",
      time: "O(N · L log L)", space: "O(N · L)",
    },
    {
      q: "Use a **product of primes** as the key.",
      a: "Assign a distinct prime to each letter and multiply the primes of the word's letters: equal products mean equal letter multisets (unique factorisation). It is neat, but the product overflows fast for long words, so it needs big integers or a modulus (which risks collisions). The counting key is safer.",
      time: "O(N · L)", space: "O(N)",
    },
    {
      q: "Return the groups **sorted** (lexicographically inside and across groups).",
      a: "After grouping, sort every list, then sort the groups by their first word. The extra cost is $O(N L \\log N)$ for comparing words; the grouping itself is unchanged.",
      time: "O(N · L log N)", space: "O(N · L)",
    },
  ],

  related: [
    { id: "valid-anagram", why: "The two-word version of the same fingerprint: count the letters and compare." },
    { id: "top-k-frequent-elements", why: "Another problem where a hash map of counts is the first step, followed by a selection." },
    { id: "two-sum", why: "The original hash-map trick: remember what you have seen to answer a lookup in $O(1)$." },
    { id: "contains-duplicate", why: "A hash set that remembers the items seen so far." },
  ],
  patternNote: "**Canonical key + hash map.** To group things by an equivalence, find a cheap *signature* that is the same for every member of a class and different across classes, then bucket by signature in one pass. Sorted letters and letter counts are the two classic signatures for anagrams.",
  takeaways: [
    "Anagrams share a **signature**: sorted letters, or 26 letter counts (written with separators).",
    "Use the signature as a hash-map key and append each word to its list: one pass, no pairwise comparisons.",
    "Keep the **original** word in the list (sort a copy for the key); keep empty words and duplicates.",
    "Counting key: $O(N \\cdot L)$ time; sorted key: $O(N \\cdot L \\log L)$; both $O(N \\cdot L)$ space.",
    "The result may be in any order; the groups are the values of the map.",
  ],
});
