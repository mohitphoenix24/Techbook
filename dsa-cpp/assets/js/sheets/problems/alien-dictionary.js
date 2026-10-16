SHEETS.define({
  id: "alien-dictionary",
  viz: "graph",
  io: { fn: "alienOrder", params: [["words", "str[]"]], ret: "str" },
  premium: true,

  statement: `A new alien language uses the English lowercase letters, but in an **unknown alphabetical order**. You are given a list \`words\` that is **sorted lexicographically according to that alien order**.

Return a string with the letters of the alien alphabet in a **valid order** (smallest first). If the list is inconsistent (no order can make it sorted), return the empty string \`""\`. If several orders are valid, any of them is accepted. *(The lab accepts any valid order and checks it against the rules.)*

Only letters that appear in \`words\` need to be returned.`,
  examples: [
    { input: 'words = ["wrt", "wrf", "er", "ett", "rftt"]', output: '"wertf"', explain: "`wrt` < `wrf` gives `t < f`; `wrf` < `er` gives `w < e`; `er` < `ett` gives `r < t`; `ett` < `rftt` gives `e < r`. The only order is `w, e, r, t, f`." },
    { input: 'words = ["z", "x"]', output: '"zx"', explain: "`z` comes before `x` in this language." },
    { input: 'words = ["z", "x", "z"]', output: '""', explain: "`z < x` and `x < z` contradict each other: no valid order." },
  ],
  constraints: ["$1 \\le$ `words.length` $\\le 100$", "$1 \\le$ `words[i].length` $\\le 100$", "`words[i]` consists of lowercase English letters."],
  check(input) {
    const letters = new Set(input.words.join("").split(""));
    if (input.words.some((w) => !/^[a-z]+$/.test(w))) return "words must be lowercase letters a–z";
    return letters.size > 7 || input.words.length > 8 ? "for the animation use at most 7 different letters and 8 words" : null;
  },
  judge(input, out, exp) {
    const words = input.words, letters = [...new Set(words.join("").split(""))];
    let o; try { o = JSON.parse(out); } catch { return { ok: false }; }
    let e; try { e = JSON.parse(exp); } catch { return { ok: false }; }
    if (e === "") return { ok: o === "", note: "No valid order exists, so the empty string is the right answer." };
    if (typeof o !== "string" || o.length !== letters.length || new Set(o).size !== o.length || !letters.every((c) => o.includes(c))) return { ok: false, note: "The answer must contain every letter of the words exactly once." };
    const pos = {}; [...o].forEach((c, i) => (pos[c] = i));
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i], b = words[i + 1];
      let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
      if (k < a.length && k < b.length) { if (pos[a[k]] > pos[b[k]]) return { ok: false, note: `Your order puts ${b[k]} before ${a[k]}, but "${a}" must come before "${b}".` }; }
      else if (a.length > b.length) return { ok: false };
    }
    return { ok: true, note: o === e ? "" : "A different valid order than the reference: several orders are allowed." };
  },

  intuition: {
    find: "An ordering of the letters that makes the given list of words sorted. Equivalently, a **topological order** of the rules we can read from the list.",
    beginner: "Try every ordering of the letters and test whether the word list is sorted under it. Return the first one that works.",
    works: "It checks every possible alphabet, so if a valid one exists it is found, and if none does, we return `\"\"`.",
    slow: "With $k$ letters there are $k!$ orderings: 26! is about $4 \\times 10^{26}$, and even 10 letters give 3.6 million orderings, each tested against all the words.",
    repeat: "Almost all of the orderings fail for the **same few reasons**: the words give a handful of rules (*\"t comes before f\"*), and each failed ordering violates one of the same rules again.",
    remember: "Instead of guessing orders, **collect the rules** the words give us. Comparing two *adjacent* words, the **first position where they differ** tells us exactly one rule: that letter of the first word comes before that letter of the second.",
    observation: "The rules form a **directed graph** on the letters (an arrow `a → b` means *a before b*). A valid alphabet is a **topological order** of this graph, and it exists iff there is no cycle. One more rule: if a word is **longer than the next word and has it as a prefix** (`\"abc\"` before `\"ab\"`), the list can never be sorted: return `\"\"`.",
    leads: "Collect all letters; for each adjacent pair find the first differing letters and add the arrow (once); reject the prefix case; then run **Kahn's algorithm** (in-degrees + queue). If the order produced contains every letter, return it; otherwise there was a cycle: return `\"\"`.",
  },

  flow: [
    "Try every ordering of the letters and test the word list.",
    "Every possible alphabet is checked, so a valid one is found if it exists.",
    "$k!$ orderings: hopeless beyond a handful of letters.",
    "Adjacent words give rules: the first differing letters, `a → b`.",
    "The rules form a directed graph; a valid alphabet is a topological order (and a prefix like `abc` before `ab` is impossible).",
    "Build the graph, run Kahn's algorithm; fewer letters than expected means a cycle: $O(\\text{total characters} + \\text{edges})$.",
  ],

  brute: {
    idea: "**Brute force:** collect the distinct letters and try every permutation of them (in increasing order). For each permutation, check that every adjacent pair of words is in order (by the first differing letter, and rejecting a longer word before its own prefix). Return the first valid permutation, or `\"\"` if none works.",
    why: "There are $k!$ permutations of $k$ letters, each checked against up to `words.length` pairs. The checks keep rediscovering the same constraints. With 26 letters the search is impossible; the constraints alone, read once, already determine the answer.",
    time: "O(k! · n · L)", space: "O(k)",
    measure: { fTex: "k!", f: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }, ns: [5, 8, 10, 12, 26] },
    cpp: `class Solution {
public:
    string alienOrder(vector<string>& words) {
        string letters;
        { set<char> s; for (auto& w : words) for (char c : w) s.insert(c); letters.assign(s.begin(), s.end()); }
        do {
            int pos[256] = {0};
            for (int i = 0; i < (int)letters.size(); i++) pos[(unsigned char)letters[i]] = i;
            bool ok = true;
            for (size_t i = 0; i + 1 < words.size() && ok; i++) {
                const string &a = words[i], &b = words[i + 1];
                size_t k = 0;
                while (k < a.size() && k < b.size() && a[k] == b[k]) k++;
                if (k < a.size() && k < b.size()) { if (pos[(unsigned char)a[k]] > pos[(unsigned char)b[k]]) ok = false; }
                else if (a.size() > b.size()) ok = false;
            }
            if (ok) return letters;
        } while (next_permutation(letters.begin(), letters.end()));
        return "";
    }
};`,
    js: `function alienOrder(words) {
  const letters = [...new Set(words.join("").split(""))].sort();
  const valid = (order) => {
    const pos = {}; order.forEach((c, i) => (pos[c] = i));
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i], b = words[i + 1];
      let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
      if (k < a.length && k < b.length) { if (pos[a[k]] > pos[b[k]]) return false; }
      else if (a.length > b.length) return false;
    }
    return true;
  };
  const permute = (arr, cur, used) => {
    if (cur.length === arr.length) return valid(cur) ? cur.join("") : null;
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(arr[i]);
      const r = permute(arr, cur, used);
      cur.pop(); used[i] = false;
      if (r !== null) return r;
    }
    return null;
  };
  const r = permute(letters, [], new Array(letters.length).fill(false));
  return r === null ? "" : r;
}`,
  },

  pattern: {
    name: "Topological Sort",
    why: "The words are an indirect description of a **partial order**: each comparison of adjacent words yields at most one *\"a before b\"* rule. A set of \"before\" rules is a directed graph, and an order that respects every rule is a topological order, which exists exactly when the graph is acyclic. This is *Course Schedule* with the graph hidden in the input and the order, not only feasibility, as the output.",
    recognize: [
      "The input is **sorted by an unknown rule** and you must recover the rule.",
      "You can extract many small facts of the form *\"X comes before Y\"* from the input.",
      "The output is an ordering that satisfies all those facts, or *impossible*.",
      "Contradictory facts (a cycle) mean *no valid answer*.",
    ],
  },

  optimal: {
    idea: "Build a directed graph on the letters. For every pair of adjacent words, find the first position where they differ and add the edge `letterOfFirst → letterOfSecond` (once). If the first word is longer and the second is its prefix, return `\"\"`. Then run Kahn's topological sort: queue letters with in-degree 0, pop, append to the answer, decrement the in-degree of its successors. If the answer has fewer letters than the graph has nodes, there is a cycle: return `\"\"`.",
    steps: [
      "Create `indeg[c] = 0` for every letter `c` that appears in `words` (so isolated letters are included).",
      "For each adjacent pair `a, b`: if `a` is longer and `b` is a prefix of `a`, **return `\"\"`**.",
      "Otherwise find the first `k` with `a[k] != b[k]` and add the edge `a[k] → b[k]` if it is new (`indeg[b[k]]++`); only this first difference counts.",
      "Queue all letters with in-degree 0 (in alphabetical order for a deterministic answer).",
      "While the queue is not empty: pop `c`, append it to `order`, and for each successor `nb`: `if (--indeg[nb] == 0)` push it.",
      "Return `order` if it contains **all** letters, else `\"\"`.",
    ],
    invariant: "**Every edge in the graph is a rule forced by two adjacent words, and `order` only contains letters whose predecessors are all already in `order`.**",
    correct: "*Rules are necessary and sufficient:* for sorted words, adjacent pairs `a ≤ b` are enough (sortedness is transitive). For a pair, either the first differing positions give `a[k] < b[k]` (and *no other relation is implied by this pair*, since later characters do not matter once they differ), or one word is a prefix of the other; a longer word before its own prefix is impossible. An alphabet makes the whole list sorted iff it satisfies all these rules, i.e. it is a topological order of the graph. Kahn's algorithm produces a topological order exactly when the graph is acyclic; if letters remain in a cycle, none of their in-degrees reach 0 and `order` is shorter than the number of letters.",
  },

  cpp: `class Solution {
public:
    string alienOrder(vector<string>& words) {
        map<char, set<char>> adj;                                          // letter -> letters that come after it //@init
        map<char, int> indeg;
        for (auto& w : words) for (char c : w) indeg[c];                   // every letter, in-degree 0 //@letters
        for (size_t i = 0; i + 1 < words.size(); i++) {                    //@pairs
            const string &a = words[i], &b = words[i + 1];
            if (a.size() > b.size() && a.compare(0, b.size(), b) == 0) return "";   // "abc" before "ab" //@prefix
            for (size_t k = 0; k < min(a.size(), b.size()); k++)
                if (a[k] != b[k]) {                                        // first difference = one rule //@diff
                    if (adj[a[k]].insert(b[k]).second) indeg[b[k]]++;      // new edge a[k] -> b[k] //@edge
                    break;
                }
        }
        queue<char> q; string order;
        for (auto& [c, d] : indeg) if (d == 0) q.push(c);                  // letters with no predecessor //@seed
        while (!q.empty()) {                                               //@loop
            char c = q.front(); q.pop(); order += c;                       //@pop
            for (char nb : adj[c]) if (--indeg[nb] == 0) q.push(nb);       //@relax
        }
        return order.size() == indeg.size() ? order : "";                  // a cycle leaves letters behind //@ret
    }
};`,
  js: `function alienOrder(words) {
  const adj = new Map(), indeg = new Map();                                // letter -> letters that come after it //@init
  for (const w of words) for (const c of w) { if (!indeg.has(c)) { indeg.set(c, 0); adj.set(c, new Set()); } }   //@letters
  for (let i = 0; i + 1 < words.length; i++) {                             //@pairs
    const a = words[i], b = words[i + 1];
    if (a.length > b.length && a.startsWith(b)) return "";                 // "abc" before "ab" //@prefix
    for (let k = 0; k < Math.min(a.length, b.length); k++)
      if (a[k] !== b[k]) {                                                 // first difference = one rule //@diff
        if (!adj.get(a[k]).has(b[k])) { adj.get(a[k]).add(b[k]); indeg.set(b[k], indeg.get(b[k]) + 1); }   // new edge //@edge
        break;
      }
  }
  const letters = [...indeg.keys()].sort();
  const q = letters.filter((c) => indeg.get(c) === 0);                     // letters with no predecessor //@seed
  let order = "";
  for (let h = 0; h < q.length; h++) {                                     //@loop
    const c = q[h]; order += c;                                            //@pop
    for (const nb of [...adj.get(c)].sort()) { indeg.set(nb, indeg.get(nb) - 1); if (indeg.get(nb) === 0) q.push(nb); }   //@relax
  }
  return order.length === indeg.size ? order : "";                         // a cycle leaves letters behind //@ret
}`,

  tests: [
    { name: "Example 1: wertf", kind: "normal", input: { words: ["wrt", "wrf", "er", "ett", "rftt"] } },
    { name: "Example 2: two letters", kind: "normal", input: { words: ["z", "x"] } },
    { name: "Example 3: a contradiction", kind: "normal", input: { words: ["z", "x", "z"] } },
    { name: "A longer word before its own prefix", kind: "edge", input: { words: ["abc", "ab"] }, why: "In any alphabet, `ab` is a prefix of `abc`, so `ab` must come **first**. The list says the opposite, so no order can make it sorted: the answer is `\"\"`. This case yields **no letter comparison at all**, so it must be checked separately, before the loop looks for a first difference." },
    { name: "Only the first difference counts", kind: "edge", input: { words: ["ac", "bd"] }, why: "`ac` and `bd` differ at position 0 (`a` vs `b`): the rule is `a → b`. The later letters `c` and `d` say **nothing** (once words differ, the rest is irrelevant), so there is no rule between `c` and `d`. Adding rules for later positions would be a bug and could create false cycles." },
    { name: "A cycle through three letters", kind: "edge", input: { words: ["a", "b", "c", "a"] }, why: "`a<b`, `b<c`, `c<a`: a cycle of three. Kahn's algorithm finds no letter with in-degree 0 and returns `\"\"`: the check *order length == number of letters* catches it." },
    { name: "A single word", kind: "corner", input: { words: ["abc"] }, why: "One word gives no pairs, so no rules: the letters `a`, `b`, `c` are all free. Any order is valid; the lab accepts it as long as every letter appears once. Letters that never get an edge must still be in the answer." },
    { name: "Identical words", kind: "corner", input: { words: ["z", "z"] }, why: "Equal adjacent words give no rule (no differing position, same length): the answer is just `z`." },
    { name: "A letter that appears in no rule", kind: "corner", input: { words: ["ba", "bc", "ad"] }, why: "Rules: `a → c` (from `ba` / `bc`) and `b → a` (from `bc` / `ad`). The letter `d` appears only at the end of `ad` and is in no rule, but it must still appear in the answer." },
  ],

  trace(input, T) {
    const words = input.words;
    const letters = [...new Set(words.join("").split(""))].sort();
    const idx = Object.fromEntries(letters.map((c, i) => [c, i]));
    const N = letters.length;
    const nodes = letters.map((c, i) => ({ id: c, label: c, x: 130 + 100 * Math.cos((2 * Math.PI * i) / N - Math.PI / 2), y: 120 + 100 * Math.sin((2 * Math.PI * i) / N - Math.PI / 2) }));
    const adj = Object.fromEntries(letters.map((c) => [c, []])), indeg = Object.fromEntries(letters.map((c) => [c, 0]));
    const edges = [], q = [], order = [], done = new Set();
    let whyFirst = false, whyPrefix = false, whyKahn = false, whyCycle = false;
    const S = (o = {}) => () => {
      const hl = {}, tags = {};
      for (const c of letters) { tags[c] = `in ${indeg[c]}`; if (done.has(c)) hl[c] = "ok"; }
      q.forEach((c) => { if (!done.has(c)) hl[c] = "win"; });
      if (o.cur) hl[o.cur] = "cur";
      (o.pair || []).forEach((c) => (hl[c] = o.pairCls || "cmp"));
      const ehl = {}; if (o.edge) ehl[o.edge] = "hot";
      const arrs = [];
      if (o.words) arrs.push({ label: `word ${o.wi + 1}`, arr: o.words[0].split(""), hl: o.h0 || {}, cw: 34 }, { label: `word ${o.wi + 2}`, arr: o.words[1].split(""), hl: o.h1 || {}, cw: 34 });
      return { nodes, edges: edges.map((e) => [e[0], e[1]]), directed: true, hl, ehl, tags, queue: q.filter((c) => !done.has(c)).map((c) => ({ t: c, id: c })), queueTitle: "letters with no predecessor", arrs, order: order.slice(), orderLabel: "alphabet so far", note: o.note, label: "an arrow  a → b  means  a comes before b" };
    };
    T.step("init", { vars: { words: words.length, letters: N }, state: S(), phase: "Read the rules from adjacent words", say: `The words are sorted in the alien order, so comparing **adjacent** words reveals the rules. There are **${N}** different letter${N === 1 ? "" : "s"}: ${letters.join(" ")}. Each starts with in-degree 0 (no known rule yet).`, op: `letters = { ${letters.join(", ")} }`, act: "START" });
    T.step("letters", { vars: { letters: letters.join("") }, state: S(), say: "Every letter that appears in any word becomes a node, even if no rule ever mentions it: it must still appear in the final alphabet.", op: "indeg[c] = 0  for every letter", act: "COLLECT_LETTERS" });
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i], b = words[i + 1];
      T.step("pairs", { vars: { a, b }, state: S({ words: [a, b], wi: i }), say: `Compare **"${a}"** and **"${b}"**. The first one comes first in the alien dictionary.`, op: `a = "${a}",  b = "${b}"`, act: "NEXT_PAIR" });
      if (a.length > b.length && a.startsWith(b)) {
        T.step("prefix", { vars: { a, b }, state: S({ words: [a, b], wi: i, h0: Object.fromEntries([...b].map((_, k) => [k, "bad"])), h1: Object.fromEntries([...b].map((_, k) => [k, "bad"])) }), say: `**"${b}"** is a prefix of **"${a}"**, yet "${a}" is listed first. In any alphabet a word comes **after** its own prefix, so the list can never be sorted. Return the empty string.`, op: `"${a}".startsWith("${b}") and longer  ⇒  return ""`, act: "IMPOSSIBLE_PREFIX",
          why: whyPrefix ? null : { title: "Why is this impossible?", text: `A word that is a prefix of another is always smaller (it is 'shorter' with the same start). Putting the longer word first contradicts every alphabet.` } });
        whyPrefix = true;
        T.result("");
        return;
      }
      let k = 0;
      while (k < Math.min(a.length, b.length) && a[k] === b[k]) k++;
      if (k < Math.min(a.length, b.length)) {
        const x = a[k], y = b[k];
        const h0 = {}, h1 = {};
        for (let t = 0; t < k; t++) { h0[t] = "ok"; h1[t] = "ok"; }
        h0[k] = "cur"; h1[k] = "cur";
        T.step("diff", { vars: { a, b, position: k, "a[k]": x, "b[k]": y }, state: S({ words: [a, b], wi: i, h0, h1 }), say: k === 0 ? `The words differ at the very first position: **${x}** vs **${y}**. Since "${a}" comes first, the alien alphabet must put **${x} before ${y}**.` : `The words agree up to position ${k - 1} (green) and first differ at position ${k}: **${x}** vs **${y}**. That one difference tells us **${x} comes before ${y}**.`, op: `first difference at k = ${k}:  ${x} ≠ ${y}`, act: "FIRST_DIFFERENCE",
          why: whyFirst ? null : { title: "Why only the FIRST difference?", text: "Once two words differ at some position, the dictionary order is decided right there. Later letters are never compared, so they give no information about the alphabet." } });
        whyFirst = true;
        if (!adj[x].includes(y)) { adj[x].push(y); adj[x].sort(); indeg[y]++; edges.push([x, y]); }
        T.step("edge", { vars: { rule: `${x} → ${y}`, [`indeg[${y}]`]: indeg[y] }, state: S({ words: [a, b], wi: i, h0, h1, edge: x + "-" + y, pair: [x, y] }), say: `Add the rule **${x} → ${y}**. \`indeg[${y}]\` is now **${indeg[y]}** (${y} has ${indeg[y]} letter${indeg[y] === 1 ? "" : "s"} that must come before it).`, op: `adj[${x}] += ${y};  indeg[${y}] = ${indeg[y]}`, act: "ADD_RULE" });
      } else {
        T.step("diff", { vars: { a, b }, state: S({ words: [a, b], wi: i }), say: a === b ? "The two words are identical, so they give **no rule**." : `One word is a prefix of the other in the right order (the shorter comes first): **no rule**.`, op: "no differing position  ⇒  no rule", act: "NO_RULE" });
      }
    }
    for (const c of letters) if (indeg[c] === 0) q.push(c);
    T.step("seed", { vars: { queue: q.slice() }, state: S({ note: q.length ? `no predecessor: ${q.join(", ")}` : "every letter has a predecessor: there must be a cycle" }), phase: "Topological sort", say: q.length ? `Letters with **in-degree 0** have no known predecessor, so they can be first: **${q.join(", ")}** (kept in alphabetical order so the answer is deterministic).` : "**No letter has in-degree 0**: every letter must come after another. That is a cycle, so no order exists.", op: `queue = [${q.join(", ")}]`, act: q.length ? "SEED_QUEUE" : "NOTHING_READY",
      why: whyKahn ? null : { title: "Why start with in-degree 0?", text: "A letter with no incoming rule has nothing that must precede it, so it can safely be placed first. Removing it then frees the letters that were waiting only for it." } });
    whyKahn = true;
    let h = 0;
    while (h < q.length) {
      const c = q[h++];
      order.push(c); done.add(c);
      T.step("pop", { vars: { letter: c, order: order.join("") }, state: S({ cur: c }), say: `Place **${c}** next in the alphabet: \`order = "${order.join("")}"\`.`, op: `order += '${c}'`, act: "PLACE_LETTER" });
      for (const nb of adj[c]) {
        indeg[nb]--;
        const ready = indeg[nb] === 0;
        if (ready) q.push(nb);
        T.step("relax", { vars: { from: c, to: nb, [`indeg[${nb}]`]: indeg[nb] }, state: S({ cur: c, pair: [nb], pairCls: ready ? "hit" : "cmp", edge: c + "-" + nb }), say: ready ? `The rule ${c} → ${nb} is now satisfied. \`indeg[${nb}]\` is **0**, so ${nb} may be placed: enqueue it.` : `The rule ${c} → ${nb} is satisfied; **${nb}** still waits for ${indeg[nb]} other letter${indeg[nb] === 1 ? "" : "s"}.`, op: `--indeg[${nb}] = ${indeg[nb]}${ready ? "  ⇒  push " + nb : ""}`, act: ready ? "BECOMES_READY" : "STILL_WAITING" });
      }
    }
    const ok = order.length === N;
    const stuck = letters.filter((c) => !done.has(c));
    T.step("ret", { vars: { "letters placed": order.length, letters: N }, state: S({ pair: ok ? [] : stuck, pairCls: "bad", note: ok ? undefined : `stuck: ${stuck.join(", ")}` }), say: ok ? `All **${N}** letters were placed. The alien alphabet (one valid order) is **"${order.join("")}"**.` : `Only **${order.length}** of **${N}** letters were placed. **${stuck.join(", ")}** are waiting on each other: a **cycle**, so the words contradict themselves. Return the empty string.`, op: ok ? `return "${order.join("")}"` : `order.size() ≠ indeg.size()  ⇒  return ""`, act: ok ? "ALPHABET_FOUND" : "CYCLE_FOUND",
      why: ok || whyCycle ? null : { title: "Why does a cycle mean 'no alphabet'?", text: "The letters in a cycle each need another one of them to come first, which is impossible. Their in-degrees never reach 0, so they are never placed, and the answer is shorter than the letter count." } });
    T.result(ok ? order.join("") : "");
  },
  fuzz(rnd) {
    const k = 2 + Math.floor(rnd() * 4), alpha = "abcde".slice(0, k).split("");
    const perm = alpha.slice(); for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const mk = () => { const L = 1 + Math.floor(rnd() * 3); let w = ""; for (let i = 0; i < L; i++) w += alpha[Math.floor(rnd() * k)]; return w; };
    let words = Array.from({ length: 2 + Math.floor(rnd() * 4) }, mk);
    const rank = (c) => perm.indexOf(c);
    const cmp = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; if (i < a.length && i < b.length) return rank(a[i]) - rank(b[i]); return a.length - b.length; };
    if (rnd() < 0.7) words.sort(cmp);
    return { words };
  },
  gen(n) {
    // a chain of n letters in order: words "a", "b", "c" … but only letters a..z are allowed, so use two-letter words for a long chain
    const words = []; for (let i = 0; i < n; i++) words.push(String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26)));
    return { words: Array.from({ length: Math.min(n, 26) }, (_, i) => String.fromCharCode(97 + i)) };
  },

  complexity: {
    time: {
      tex: "O(C + V + E)", title: "read every character once, then a topological sort", short: "C = total characters, V ≤ 26 letters, E ≤ min(C, 26²) rules",
      derive: [
        "T_{\\text{letters}} = O(C) || visit every character of every word once to register the letters",
        "T_{\\text{rules}} = \\sum_{i} O(\\min(|a_i|, |a_{i+1}|)) \\le O(C) || each adjacent pair is scanned only up to its first difference",
        "T_{\\text{Kahn}} = O(V + E) || each letter is queued once and each rule is relaxed once",
        "T = O(C) + O(C) + O(V + E)",
        "!T = O(C + V + E) = O(C) || since $V \\le 26$ and $E \\le C$, the character count dominates",
      ],
      where: "Compare with the brute force's $k!$ permutations. The words are read once and the graph has at most 26 nodes, so the running time is essentially linear in the size of the input. The measured table grows the number of letters in a chain.",
    },
    space: {
      tex: "O(V + E)", title: "the letter graph, in-degrees and the queue", short: "at most 26 letters and 26² rules (a constant)",
      derive: [
        "S = \\underbrace{O(V + E)}_{\\text{adjacency}} + \\underbrace{O(V)}_{\\text{in-degrees}} + \\underbrace{O(V)}_{\\text{queue and answer}} || three small structures",
        "!S = O(V + E) = O(1) \\text{ for the 26-letter alphabet} || bounded by a constant",
      ],
      where: "Because the alphabet has at most 26 letters, the graph size is bounded by a constant, regardless of the number of words (the *input* itself, of size $C$, is not counted).",
    },
    limit: "The input must be read at least once, so $\\Omega(C)$ is a lower bound; the algorithm matches it.",
    measure: { label: "n = number of letters (a chain)", fTex: "n", f: (n) => n, sizes: [4, 8, 12, 16, 20, 24], growth: "linear in the number of letters" },
  },

  mistakes: [
    { title: "Forgetting the prefix case", what: "Only looking for a differing position.", why: "Most pairs differ somewhere.", breaks: "`[\"abc\", \"ab\"]` yields no rule and the code happily returns an alphabet, but it is impossible: the answer must be `\"\"`.", avoid: "Before looking for a difference, reject the case *`a` longer than `b` and `b` is a prefix of `a`*." },
    { title: "Adding rules for every differing position", what: "Continuing the loop after the first difference.", why: "\"More information is better\".", breaks: "Letters after the first difference are unconstrained; adding rules for them invents constraints and can create **false cycles**, returning `\"\"` for valid input.", avoid: "`break` right after adding the first-difference edge." },
    { title: "Only registering letters that appear in a rule", what: "Creating nodes only when adding edges.", why: "Isolated letters seem irrelevant.", breaks: "A letter with no rule is missing from the answer (and the final length check can wrongly pass or fail).", avoid: "Register **every** letter of every word first, with in-degree 0." },
    { title: "Double-counting an edge", what: "`indeg[b]++` each time the same pair appears.", why: "The same rule (`a → b`) can come from several word pairs.", breaks: "The in-degree becomes too large and the letter is never released: a false cycle.", avoid: "Use a set per letter and increment only when the insert is new." },
    { title: "Not checking for a cycle at the end", what: "Returning `order` whatever its length.", why: "The loop ended normally.", breaks: "With a cycle, the letters in it are never placed and the answer silently misses them.", avoid: "Return `order` only if `order.size() == number of letters`, else `\"\"`." },
  ],

  followUps: [
    {
      q: "Write the **DFS** (three-colour) version.",
      a: "Build the same graph. DFS each letter with states *unvisited / in progress / done*; meeting an in-progress letter is a back edge (a cycle), so return `\"\"`. Append each letter to a list when it finishes and reverse the list at the end: that is a topological order. Same $O(C + V + E)$.",
      time: "O(C + V + E)", space: "O(V + E)",
    },
    {
      q: "Return the **lexicographically smallest** valid alphabet.",
      a: "Use a **min-heap** (or a sorted structure) instead of a plain queue for the letters with in-degree 0, always releasing the smallest available letter. Kahn with a priority queue gives the lexicographically smallest topological order in $O((V + E) \\log V)$, which is $O(V + E)$ for 26 letters.",
      time: "O(C + (V+E)log V)", space: "O(V + E)",
    },
    {
      q: "Is the alphabet **uniquely determined**? How would you check?",
      a: "It is unique exactly when, during Kahn's algorithm, the queue **never holds more than one letter** at a time (at every step only one letter is free). Track the maximum queue size: if it ever exceeds 1, there are at least two valid orders.",
      time: "O(C + V + E)", space: "O(V + E)",
    },
    {
      q: "Count **how many** valid alphabets exist.",
      a: "That is counting topological orders, which is #P-hard in general, but for at most 26 letters a **bitmask DP** over subsets works: `dp[mask]` = number of ways to order the letters in `mask` respecting the rules; add a letter whose predecessors are all inside the mask. Time $O(2^{26} \\cdot 26)$ in the worst case.",
      time: "O(2^V · V)", space: "O(2^V)",
    },
  ],

  related: [
    { id: "course-schedule", why: "The same Kahn's algorithm, with the graph given directly instead of hidden in the words." },
    { id: "graph-valid-tree", why: "Another graph property from a list of pairs (cycle detection, here for undirected graphs)." },
    { id: "clone-graph", why: "Another graph traversal with careful bookkeeping of each node." },
    { id: "number-of-connected-components-in-an-undirected-graph", why: "A graph question about groups of nodes." },
  ],
  patternNote: "**Recovering an order from sorted data:** adjacent items give *local* before/after facts; collect them into a directed graph and take a topological order. Remember the two classic traps: only the **first difference** counts, and a **prefix** violation makes the input impossible.",
  takeaways: [
    "Compare **adjacent** words; the **first differing letters** give exactly one rule `a → b`; later letters are irrelevant.",
    "A longer word before its own prefix (`abc`, `ab`) is impossible: return `\"\"`.",
    "Register every letter first (isolated letters belong in the answer); count each rule once.",
    "Kahn's algorithm gives the alphabet; `order.size() < letters` means a cycle: return `\"\"`.",
    "Time $O(C)$ in the input size (the graph has at most 26 nodes); brute force over $k!$ orders is hopeless.",
  ],
});
