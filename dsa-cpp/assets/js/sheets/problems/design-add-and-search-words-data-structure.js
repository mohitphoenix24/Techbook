SHEETS.define({
  id: "design-add-and-search-words-data-structure",
  viz: "trie",
  io: {
    fn: "WordDictionary", params: [["ops", "ops"], ["args", "any"]], ret: "any",
    labels: { ops: "ops (method names, like LeetCode)", args: "args (one list of arguments per call)" },
    design: SHEETS.design({ cls: "WordDictionary", ctor: [], methods: { addWord: { args: ["str"], ret: "void" }, search: { args: ["str"], ret: "bool" } } }),
  },
  legend: [["cur", "node being tried"], ["win", "path followed so far"], ["ok", "end of a stored word"], ["hit", "match found"], ["bad", "dead end"]],

  statement: `Design a data structure that supports adding new words and finding if a string matches any previously added string.

Implement the \`WordDictionary\` class:
- \`WordDictionary()\` initialises the object.
- \`void addWord(word)\` adds \`word\` to the data structure; it can be matched later.
- \`bool search(word)\` returns \`true\` if there is any string in the data structure that matches \`word\`, or \`false\` otherwise. \`word\` may contain dots \`'.'\` where a dot can be matched with **any one letter**.

*(In the lab, the calls are written like LeetCode does: a list of method names in \`ops\` and a list of argument lists in \`args\`. The result is the list of return values, with \`null\` for methods that return nothing.)*`,
  examples: [
    { input: `ops = ["WordDictionary", "addWord", "addWord", "addWord", "search", "search", "search", "search"], args = [[], ["bad"], ["dad"], ["mad"], ["pad"], ["bad"], [".ad"], ["b.."]]`, output: "[null, null, null, null, false, true, true, true]", explain: "`pad` is not stored; `bad` is; `.ad` matches `bad`, `dad` and `mad`; `b..` matches `bad`." },
  ],
  constraints: ["$1 \\le$ `word.length` $\\le 25$", "`word` in `addWord` consists of lowercase English letters", "`word` in `search` consists of `'.'` or lowercase English letters", "There will be at most **2** dots in `word` for `search` queries", "At most $10^4$ calls will be made to `addWord` and `search`"],
  check(input) {
    const ops = input.ops, args = input.args;
    if (!Array.isArray(args) || !Array.isArray(ops) || ops.length !== args.length) return "ops and args must have the same length (one argument list per call)";
    if (ops[0] !== "WordDictionary" || (args[0] || []).length !== 0) return 'the first call must be "WordDictionary" with an empty argument list []';
    if (ops.length > 9) return "for the animation use at most 9 calls (including WordDictionary)";
    let letters = 0;
    for (let k = 1; k < ops.length; k++) {
      if (!["addWord", "search"].includes(ops[k])) return `call ${k + 1}: the method must be addWord or search`;
      const a = args[k];
      if (!Array.isArray(a) || a.length !== 1 || typeof a[0] !== "string") return `call ${k + 1}: the argument must be a list with one word, e.g. ["bad"]`;
      if (!(ops[k] === "addWord" ? /^[a-z]{1,5}$/ : /^[a-z.]{1,5}$/).test(a[0])) return `call ${k + 1}: ${ops[k] === "addWord" ? "a word of 1 to 5 lowercase letters" : "a pattern of 1 to 5 characters, lowercase letters or dots"}`;
      letters += a[0].length;
    }
    if (letters > 22) return "for the animation use at most 22 characters in total";
    return null;
  },

  intuition: {
    find: "A word store that can answer **\"is there a stored word matching this pattern?\"**, where a dot stands for any single letter, so a pattern can match many words at once.",
    beginner: "Keep a list of the added words. To search, compare the pattern with every stored word of the same length, letter by letter, treating a dot as matching anything.",
    works: "A direct comparison with every word is exactly the definition of a match, so every matching word is found.",
    slow: "Each search compares the pattern with **every** stored word: $O(N \\cdot L)$ for $N$ words, and the words share beginnings that are compared again each time.",
    repeat: "All words with the same first letters are compared with the same pattern letters repeatedly. The comparison of a prefix is redone for every word that starts with it.",
    remember: "A **trie** stores each shared beginning once. Following a letter of the pattern moves down exactly one edge, and all the words below that point are *candidates at once*. A dot means \"any letter\", which is simply **\"try every child\"**.",
    observation: "Store the words in a trie (as in the previous problem). To search, do a **depth-first search** over the trie, one pattern character at a time: for a letter, follow the single matching child (or fail); for a dot, try **every existing child** and succeed if any of them leads to a match. When the pattern is used up, succeed only if the current node marks the **end of a word**.",
    leads: "`dfs(node, i)`: if `node` is null return false; if `i == len` return `node.end`; if `word[i] == '.'` return true if `dfs(child, i+1)` is true for some child; otherwise return `dfs(node.child[word[i]], i + 1)`. Without dots it is one path ($O(L)$); each dot multiplies the branching.",
  },

  flow: [
    "Keep a list of words; compare the pattern with each word letter by letter.",
    "Comparing with every word applies the definition of a match.",
    "$O(N \\cdot L)$ per search: shared beginnings are re-compared word after word.",
    "A trie stores shared beginnings once; a letter is one edge, a dot is \"try every child\".",
    "Depth-first search over the trie, one pattern character per level; check the end flag at the end.",
    "$O(L)$ without dots, at most the size of the trie with many dots; adding is $O(L)$.",
  ],

  brute: {
    idea: "**Brute force:** keep all added words in a `vector<string>`. To search a pattern, scan the list: a stored word matches if it has the same length and every letter equals the pattern letter or the pattern letter is a dot.",
    why: "Each search compares the pattern with every stored word of the same length: $O(N \\cdot L)$ per call. The trie avoids re-reading the shared beginnings and cuts off whole groups of words after one failed letter.",
    time: "O(N · L) per search", space: "O(N · L)",
    cpp: `class WordDictionary {
    vector<string> words;
public:
    WordDictionary() {}
    void addWord(string word) { words.push_back(word); }
    bool search(string word) {
        for (const string& w : words) {
            if (w.size() != word.size()) continue;
            bool ok = true;
            for (size_t i = 0; i < w.size() && ok; i++)
                if (word[i] != '.' && word[i] != w[i]) ok = false;
            if (ok) return true;
        }
        return false;
    }
};`,
    js: `class WordDictionary {
  constructor() { this.words = []; }
  addWord(word) { this.words.push(word); }
  search(word) {
    return this.words.some((w) => w.length === word.length && [...word].every((c, i) => c === "." || c === w[i]));
  }
}`,
  },

  pattern: {
    name: "Trie + Backtracking (DFS with branching on wildcards)",
    why: "The trie handles shared prefixes; the wildcard adds a *choice*: a dot may be any letter, so the search must **try each child** and backtrack if it leads nowhere. It is the same recursion as exploring a decision tree, pruned by the trie (only letters that exist are tried).",
    recognize: [
      "A dictionary with **pattern matching** (`.`/`?`/`*`) or prefix queries.",
      "A wildcard means \"any of several choices\", so the search must branch and be able to give up on a branch.",
      "Most searches have few wildcards, so the branching stays small.",
      "The structure grows by insertions and is queried many times.",
    ],
  },

  optimal: {
    idea: "Store the words in a trie: each node has up to 26 children and an `end` flag. `addWord` is the usual insertion. `search` is a recursive function `dfs(node, i)` that tries to match the pattern from character `i` starting at `node`: at the end of the pattern it requires `node.end`; for a letter it follows that one child; for a dot it tries **each** existing child and returns true if any succeeds.",
    steps: [
      "**addWord(w):** walk from the root, creating missing children, and set `end` on the last node.",
      "**search(w):** return `dfs(root, 0)`.",
      "`dfs(node, i)`: if `node` is `null`, return `false`.",
      "If `i == w.length`, return `node.end`.",
      "If `w[i] == '.'`: for every child `k` of `node`, if `dfs(k, i + 1)` is true return `true`; after the loop return `false`.",
      "Otherwise return `dfs(node.child[w[i]], i + 1)`.",
    ],
    invariant: "**`dfs(node, i)` returns `true` if and only if the suffix `w[i..]`, with dots as wildcards, matches a path from `node` down to a node with the `end` flag.**",
    correct: "For `i = len` the pattern is used up, so it matches exactly when a word ends at `node` (`node.end`). For a letter `c` at position `i`, a match must continue through the child for `c` (if it does not exist, no match: `null` returns `false`) and match the rest `w[i+1..]` from there, which is what the recursive call decides. For a dot, the matching word may continue through *any* child, so the pattern matches iff at least one child leads to a match for the rest: the loop returns `true` on the first success and `false` if all fail. By induction on the length of the remaining pattern the function is correct, and `search` calls it from the root with the whole pattern. Insertion creates exactly the prefix paths of the added words, with the end flag at word ends, so the stored set is represented correctly.",
  },

  cpp: `class WordDictionary {
    struct Node { Node* kid[26] = {}; bool end = false; };
    Node* root;
    bool dfs(Node* node, const string& w, int i) {
        if (!node) return false;                // this letter does not exist //@dNull
        if (i == (int)w.size()) return node->end;   // pattern used up: a word must end here //@dEnd
        if (w[i] == '.') {                      // wildcard: any letter //@dDot
            for (Node* k : node->kid) if (dfs(k, w, i + 1)) return true;   // try every child //@dTry
            return false;                       // no child worked //@dNone
        }
        return dfs(node->kid[w[i] - 'a'], w, i + 1);   // a letter: one child only //@dLetter
    }
public:
    WordDictionary() { root = new Node(); }     //@ctor
    void addWord(string word) {
        Node* cur = root;                       //@aStart
        for (char c : word) {
            int k = c - 'a';
            if (!cur->kid[k]) cur->kid[k] = new Node();   //@aMake
            cur = cur->kid[k];                  //@aStep
        }
        cur->end = true;                        //@aEnd
    }
    bool search(string word) { return dfs(root, word, 0); }   //@sCall
};`,
  js: `class WordDictionary {
  constructor() { this.root = { kid: {}, end: false }; }   //@ctor
  dfs(node, w, i) {
    if (!node) return false;             // this letter does not exist //@dNull
    if (i === w.length) return node.end; // pattern used up: a word must end here //@dEnd
    if (w[i] === ".") {                  // wildcard: any letter //@dDot
      for (const k of Object.values(node.kid)) if (this.dfs(k, w, i + 1)) return true;   // try every child //@dTry
      return false;                      // no child worked //@dNone
    }
    return this.dfs(node.kid[w[i]], w, i + 1);   // a letter: one child only //@dLetter
  }
  addWord(word) {
    let cur = this.root;                 //@aStart
    for (const c of word) {
      if (!cur.kid[c]) cur.kid[c] = { kid: {}, end: false };   //@aMake
      cur = cur.kid[c];                  //@aStep
    }
    cur.end = true;                      //@aEnd
  }
  search(word) { return this.dfs(this.root, word, 0); }   //@sCall
}`,

  tests: [
    { name: "Example: bad, dad, mad", kind: "normal", input: { ops: ["WordDictionary", "addWord", "addWord", "addWord", "search", "search", "search", "search"], args: [[], ["bad"], ["dad"], ["mad"], ["pad"], ["bad"], [".ad"], ["b.."]] } },
    { name: "A wildcard in the middle", kind: "normal", input: { ops: ["WordDictionary", "addWord", "addWord", "addWord", "search", "search", "search"], args: [[], ["cat"], ["cot"], ["cut"], ["c.t"], ["c.."], ["..."]] } },
    { name: "A single dot", kind: "edge", input: { ops: ["WordDictionary", "addWord", "search", "search"], args: [[], ["a"], ["."], [".."]] }, why: "`.` matches exactly one letter, so it matches `a`, but `..` has two characters and `a` has one: after the dot the node `a` has no children, so `dfs` returns false. A dot never matches *zero* letters." },
    { name: "A dot cannot match nothing", kind: "edge", input: { ops: ["WordDictionary", "addWord", "search", "search", "search"], args: [[], ["ab"], ["a"], ["a."], ["a.."]] }, why: "`a` ends at a node that is not marked as a word end (`ab` continues), so `a` fails at the end check; `a.` matches `ab`; `a..` runs out of children. Lengths must match exactly." },
    { name: "Searching an empty dictionary", kind: "edge", input: { ops: ["WordDictionary", "search"], args: [[], ["."]] }, why: "The root has no children, so the loop that tries every child tries nothing and falls through to `return false`. A dot does not make the search succeed by itself." },
    { name: "A dot at the end", kind: "edge", input: { ops: ["WordDictionary", "addWord", "search", "search"], args: [[], ["abc"], ["ab."], ["abc."]] }, why: "`ab.` reaches the node `b` and then tries its only child `c`, which ends a word: `true`. `abc.` goes one step too far: the node `c` has no children, so `false`." },
    { name: "A first branch that fails (backtracking)", kind: "corner", input: { ops: ["WordDictionary", "addWord", "addWord", "search"], args: [[], ["ax"], ["by"], [".y"]] }, why: "The dot tries the child `a` first: `a` has only `x`, not `y`, so that branch is a dead end and the search **backtracks**, then tries `b`, where `y` exists: `true`. A search that picked only one child would answer `false`." },
    { name: "All dots", kind: "corner", input: { ops: ["WordDictionary", "addWord", "search", "search"], args: [[], ["hello"], ["....."], ["...."]] }, why: "Five dots match any 5-letter word, so `hello` matches. Four dots stop one level too early: the node reached is not a word end, so `false`. The pattern must use up exactly the word." },
    { name: "A word that is a prefix of another", kind: "corner", input: { ops: ["WordDictionary", "addWord", "addWord", "search", "search", "search"], args: [[], ["app"], ["apple"], ["app"], ["app.."], ["app."]] }, why: "`app` and `apple` share a path, with an end flag at the third letter and at the fifth. `app..` reaches the end of `apple`; `app.` stops after `l`, which is not a word end: `false`." },
  ],

  trace(input, T, K) {
    const ops = input.ops, args = input.args;
    const nodes = { r: { ch: "", kids: {}, end: false } };
    let nid = 0;
    const results = [], stored = [];
    let whyDot = false, whyBack = false, whyEnd = false, whyShare = false;
    const fmtR = (x) => (x === null ? "null" : String(x));
    const S = (o = {}) => () => ({
      nodes: JSON.parse(JSON.stringify(nodes)), root: "r", hl: o.hl || {}, word: o.word, wordLabel: o.wordLabel, whl: o.whl, i: o.i,
      found: stored.slice(), foundLabel: "words stored", gx: 46,
      note: o.note !== undefined ? o.note : `results so far: [${results.map(fmtR).join(", ")}]`,
    });
    const pathHl = (ids, last, cls) => { const h = {}; ids.forEach((id) => (h[id] = "win")); if (last) h[last] = cls || "cur"; return h; };
    const okMarks = (n) => Object.fromEntries(Array.from({ length: n }, (_, k) => [k, "ok"]));
    function dfs(node, w, i, ids, label) {
      // ids: the nodes on the path so far (ending at `node`)
      if (node == null) { /* only reached for a missing letter: handled by the caller */ return false; }
      if (i === w.length) {
        const ans = nodes[node].end;
        T.step("dEnd", { vars: { i, "end flag": nodes[node].end }, state: S({ word: w, wordLabel: label, whl: okMarks(i), hl: pathHl(ids.slice(0, -1), node, ans ? "hit" : "bad") }), say: ans ? `The pattern is used up (\`i\` = ${i} = its length) and a stored word **ends** at this node: it matches. Return \`true\`.` : `The pattern is used up, but **no word ends** at this node (it is only a prefix of longer words): no match on this path. Return \`false\`.`, op: `i == ${w.length}  →  return node->end  =  ${ans}`, act: ans ? "MATCH" : "NOT_A_WORD",
          why: whyEnd ? null : { title: "Why check the end flag?", text: "Using up the pattern is not enough: the path must also finish a stored word. A node in the middle of a longer word is a prefix, not a match." } });
        whyEnd = true;
        return ans;
      }
      const c = w[i];
      if (c === ".") {
        const kids = Object.keys(nodes[node].kids).sort();
        T.step("dDot", { vars: { i, pattern: c, children: kids.join(",") || "none" }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "cur" }), i, hl: pathHl(ids.slice(0, -1), node, "cur"), note: kids.length ? `the dot can be any of: ${kids.join(", ")}` : "this node has no children" }), say: kids.length ? `Pattern character **.** (a wildcard): it can be **any** letter, so we must try every child of this node: **${kids.join(", ")}**. (Letters with no child fail at once and are skipped.)` : `Pattern character **.**, but this node has **no children**: nothing can be matched.`, op: "w[i] == '.'  →  true", act: "WILDCARD",
          why: whyDot ? null : { title: "Why try every child?", text: "A dot stands for any letter, so the search cannot know which branch is right. It tries each existing child in turn and stops at the first one that leads to a match (`||`)." } });
        whyDot = true;
        let any = false;
        for (let q = 0; q < kids.length; q++) {
          const k = kids[q], child = nodes[node].kids[k];
          T.step("dTry", { vars: { i, child: k }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "cur" }), i, hl: pathHl(ids, child, "cur"), note: `trying the branch “${k}”` }), say: `Try the child **${k}**: does the rest of the pattern (\`${w.slice(i + 1) || "nothing"}\`) match below it?`, op: `dfs(kid['${k}'], w, ${i + 1})`, act: "TRY_CHILD" });
          const r = dfs(child, w, i + 1, ids.concat(child), label);
          if (r) { any = true; T.step("dTry", { vars: { i, child: k, found: true }, state: S({ word: w, wordLabel: label, whl: okMarks(w.length), hl: pathHl(ids, child, "hit") }), say: `The branch **${k}** leads to a match, so \`true\` is returned immediately: the remaining children are **not tried**.`, op: `dfs(...) = true  →  return true`, act: "BRANCH_SUCCEEDS" }); return true; }
          T.step("dTry", { vars: { i, child: k, found: false }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "cur" }), i, hl: pathHl(ids, child, "bad"), note: `the branch “${k}” is a dead end` }), say: `The branch **${k}** is a **dead end**: the rest of the pattern does not match below it. ${q < kids.length - 1 ? "Backtrack and try the next child." : "No children are left."}`, op: `dfs(...) = false  →  next child`, act: "DEAD_END",
            why: whyBack ? null : { title: "What is backtracking here?", text: "The search went down one branch, found that it cannot match, and **comes back** to try another one. Nothing needs to be undone, because the trie itself is not changed." } });
          whyBack = true;
        }
        T.step("dNone", { vars: { i }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "bad" }), i, hl: pathHl(ids.slice(0, -1), node, "bad") }), say: `Every child has been tried and none matched: return \`false\` for this position.`, op: "return false", act: "NO_CHILD_WORKED" });
        return false;
      }
      const nxt = nodes[node].kids[c];
      if (nxt == null) {
        T.step("dLetter", { vars: { i, letter: c, child: "none" }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "bad" }), i, hl: pathHl(ids.slice(0, -1), node, "bad"), note: `no child “${c}”` }), say: `Pattern letter **${c}**: this node has **no child** “${c}”, so \`dfs(null, …)\` is called and returns \`false\` at once.`, op: `dfs(kid['${c}'] = null, w, ${i + 1})  →  false`, act: "NO_SUCH_CHILD" });
        return false;
      }
      T.step("dLetter", { vars: { i, letter: c }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "cur" }), i, hl: pathHl(ids, nxt, "cur") }), say: `Pattern letter **${c}**: follow the one matching child. Only that branch can match.`, op: `dfs(kid['${c}'], w, ${i + 1})`, act: "FOLLOW_LETTER" });
      return dfs(nxt, w, i + 1, ids.concat(nxt), label);
    }
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k], a = args[k] || [], label = a.length ? `${op}(“${a[0]}”)` : `${op}()`;
      T.phase(label);
      if (op === "WordDictionary") {
        T.step("ctor", { vars: {}, state: S({ note: "an empty dictionary: just the root" }), say: "`WordDictionary()` creates the **root** of an empty trie.", op: "root = new Node()", act: "CREATE_ROOT" });
        results.push(null);
      } else if (op === "addWord") {
        const w = a[0]; let cur = "r"; const ids = ["r"];
        T.step("aStart", { vars: { word: w }, state: S({ word: w, wordLabel: label, hl: { r: "cur" } }), say: `Add **${w}**: follow its letters from the root, creating missing nodes (the same insertion as in a plain trie).`, op: "cur = root", act: "START_ADD" });
        for (let i = 0; i < w.length; i++) {
          const c = w[i], had = nodes[cur].kids[c] != null;
          if (!had) { const id = "n" + ++nid; nodes[id] = { ch: c, kids: {}, end: false }; nodes[cur].kids[c] = id; }
          const nxt = nodes[cur].kids[c];
          T.step("aMake", { vars: { letter: c, created: !had }, state: S({ word: w, wordLabel: label, whl: Object.assign(okMarks(i), { [i]: "cur" }), i, hl: pathHl(ids, nxt, "cur") }), say: had ? `The node for “${w.slice(0, i + 1)}” already exists: **reuse** it (words share their beginnings).` : `No child **${c}** yet: **create** it.`, op: had ? `kid['${c}'] exists` : `kid['${c}'] = new Node()`, act: had ? "REUSE_NODE" : "CREATE_NODE",
            why: had && !whyShare ? { title: "Shared beginnings", text: "Words such as `bad`, `dad` and `mad` share the last two letters but not the first, so they do not share nodes here; words with a common *beginning* (`app`, `apple`) do. The wildcard search is what makes both useful." } : null });
          if (had) whyShare = true;
          cur = nxt; ids.push(cur);
          T.step("aStep", { vars: { letter: c }, state: S({ word: w, wordLabel: label, whl: okMarks(i + 1), i, hl: pathHl(ids.slice(0, -1), cur, "cur") }), say: `Step down to “${w.slice(0, i + 1)}”.`, op: `cur = cur->kid['${c}']`, act: "STEP_DOWN" });
        }
        nodes[cur].end = true;
        if (!stored.includes(w)) stored.push(w);
        T.step("aEnd", { vars: { word: w }, state: S({ word: w, wordLabel: label, whl: okMarks(w.length), hl: pathHl(ids.slice(0, -1), cur, "hit") }), say: `Mark the last node as the end of a word: “${w}” is stored.`, op: "cur->end = true", act: "MARK_END" });
        results.push(null);
      } else {
        const w = a[0];
        T.step("sCall", { vars: { pattern: w }, state: S({ word: w, wordLabel: label, hl: { r: "cur" } }), say: `\`search("${w}")\`: run the recursive match \`dfs(root, "${w}", 0)\`${w.includes(".") ? ". The dots will make it branch." : ". There are no dots, so it follows one path."}`, op: `return dfs(root, "${w}", 0)`, act: "SEARCH" });
        const r = dfs("r", w, 0, ["r"], label);
        results.push(r);
        T.step("sCall", { vars: { "return": r }, state: S({ word: w, wordLabel: label, whl: r ? okMarks(w.length) : undefined }), say: r ? `The recursion returned **true**: some stored word matches “${w}”.` : `The recursion returned **false**: no stored word matches “${w}”.`, op: `return ${r}`, act: r ? "TRUE" : "FALSE" });
      }
    }
    T.result(results.slice());
  },
  fuzz(rnd) {
    const al = "abc", ops = ["WordDictionary"], args = [[]];
    const n = 1 + Math.floor(rnd() * 7);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.5) { ops.push("addWord"); args.push([Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => al[Math.floor(rnd() * 3)]).join("")]); }
      else { ops.push("search"); args.push([Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => (rnd() < 0.3 ? "." : al[Math.floor(rnd() * 3)])).join("")]); }
    }
    return { ops, args };
  },
  gen(n) { return { ops: ["WordDictionary", "addWord", "search"], args: [[], ["a".repeat(n)], [".".repeat(n)]] }; },

  complexity: {
    time: {
      tex: "O(L) \\;\\text{ (no dots)},\\quad O(\\min(26^d \\cdot L, \\text{nodes})) \\;\\text{ with } d \\text{ dots}", title: "one path without dots; each dot multiplies the branching by at most 26", short: "L = pattern length, d = number of dots",
      derive: [
        "T_{\\text{add}}(L) = L\\,(c_{\\text{make}} + c_{\\text{step}}) + c || a plain trie insertion",
        "T_{\\text{search, no dot}}(L) \\le L\\, c || one child per letter: a single path",
        "\\text{each dot: at most } \\sigma = 26 \\text{ children tried} \\;\\Rightarrow\\; \\#\\text{paths} \\le 26^d || the number of branches multiplies at every dot",
        "!T_{\\text{search}}(L, d) = O(26^d \\cdot L),\\; \\text{and never more than the size of the trie} || with at most $d \\le 2$ dots (the problem's limit) this is at most $676\\,L$",
      ],
      where: "Here $L$ is the length of the pattern, $d$ the number of dots and $\\sigma = 26$. The problem guarantees at most 2 dots, so a search costs at most about $26^2 \\cdot L$ in the worst case, and usually much less because only existing children are tried. The measured table uses a single stored word and an all-dots pattern: one child per level, so the work is linear in $L$.",
    },
    space: {
      tex: "O(N \\cdot L)", title: "the trie nodes; the recursion adds O(L)", short: "at most one node per stored letter",
      derive: [
        "\\#\\text{nodes} \\le 1 + \\sum_w |w| \\le 1 + N L || prefixes are shared",
        "S_{\\text{stack}} \\le L + 1 || the depth of the search recursion is the pattern length",
        "!S = O(N \\cdot L) || times the child table per node (26 slots with arrays)",
      ],
      where: "The search itself needs only the recursion stack, at most $L + 1$ frames. The nodes are shared by all words with a common beginning.",
    },
    limit: "Reading a pattern takes $\\Omega(L)$. Without dots $O(L)$ is optimal; with dots the cost depends on how many words could match, so an output-sensitive bound is the best possible in general.",
    measure: { label: "L = length of the word (one stored word, an all-dots search)", fTex: "L", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Treating a dot as a normal letter", what: "Looking for a child named `.`.", why: "The search loop is written for letters and `.` is just another character.", breaks: "No node has a child `.`, so every pattern with a dot fails.", avoid: "Detect `.` and try **every** child." },
    { title: "Returning after the first child", what: "`return dfs(firstChild, …)` for a dot.", why: "One recursive call looks like enough.", breaks: "A match under a later child is never found (`.y` with `ax` and `by` would say `false`).", avoid: "Loop over the children; return `true` on the first success, `false` only after all fail." },
    { title: "Forgetting the end-of-word check", what: "Returning `true` when the pattern is used up and the node exists.", why: "Reaching the end of the pattern looks like success.", breaks: "`ap` would match a dictionary that only contains `apple`.", avoid: "At `i == length` return `node->end`." },
    { title: "Passing the wrong index", what: "`dfs(k, w, i)` instead of `i + 1`.", why: "The recursive call is written by copy and paste.", breaks: "The same pattern character is matched again at the next level: infinite recursion for a dot, or a wrong match.", avoid: "Always advance the pattern index with the node: `i + 1`." },
    { title: "Using the brute-force list for large dictionaries", what: "Scanning all stored words for each search.", why: "It is the simplest correct solution.", breaks: "$O(N \\cdot L)$ per search is too slow for $10^4$ words and $10^4$ queries.", avoid: "Use the trie, which looks only at words that could still match." },
  ],

  followUps: [
    {
      q: "Support the **`*`** wildcard (zero or more letters) as well.",
      a: "On `*`, you can either skip the star (match zero letters: `dfs(node, i + 1)`) or consume one child and **stay on the star** (`dfs(child, i)`) for every child. The branching is larger, so memoise `(node, i)` pairs to avoid recomputation; the worst case is $O(\\text{nodes} \\cdot L)$ with memoisation.",
      time: "O(nodes · L) with memo", space: "O(nodes · L)",
    },
    {
      q: "Make a search with dots **faster** by bucketing words by length.",
      a: "Keep one trie per word length (or store the length at each node). A pattern then only explores the trie of its own length, so lengths that cannot match are skipped without any work. This is a simple pruning that helps when lengths vary widely.",
      time: "O(26^d · L)", space: "O(N · L)",
    },
    {
      q: "Return **all** stored words that match a pattern.",
      a: "Collect the path letters while descending, and whenever the pattern is used up at a node with the `end` flag, add the string to the answer (continue the loop over all children instead of returning at the first success). The cost is proportional to the explored part of the trie plus the output.",
      time: "O(explored + output)", space: "O(L + output)",
    },
    {
      q: "Implement the same idea **iteratively**, without recursion.",
      a: "Keep a stack (or a queue) of `(node, i)` pairs. Pop one: if `i` is at the end, check `end`; if the pattern character is a dot, push all children with `i + 1`; otherwise push the single child. The search order changes (stack: depth-first, queue: breadth-first) but not the result or the bound.",
      time: "same as the recursion", space: "O(width · L)",
    },
  ],

  related: [
    { id: "implement-trie-prefix-tree", why: "The plain trie that this problem extends with a wildcard." },
    { id: "word-search-ii", why: "A trie of words drives a DFS over a board, pruning when the prefix is not in the trie." },
    { id: "word-search", why: "Backtracking over a grid: try a branch, undo, try the next, like the dot's loop over children." },
    { id: "combination-sum-iv", why: "Another recursion that branches over choices; there memoised, here pruned by the trie." },
  ],
  patternNote: "**Trie + backtracking.** The trie answers \"which letters can come next?\" in $O(1)$. A wildcard turns that answer into a *choice*: recurse into every child, return on the first success, and let the recursion backtrack from dead ends. The trie prunes everything that does not exist, so the branching is only over real continuations.",
  takeaways: [
    "Store words in a trie with an **end flag**; `addWord` is an ordinary trie insertion.",
    "`search` is a DFS `dfs(node, i)`: end of pattern → `node.end`; letter → one child; **dot → try every child**.",
    "Return `true` on the first successful child; `false` only after all fail (backtracking).",
    "A dot matches exactly **one** letter, never zero, so lengths must agree.",
    "Time $O(L)$ without dots, at most $O(26^d \\cdot L)$ with $d$ dots; space $O(N \\cdot L)$.",
  ],
});
