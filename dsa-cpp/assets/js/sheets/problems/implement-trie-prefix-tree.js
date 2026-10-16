SHEETS.define({
  id: "implement-trie-prefix-tree",
  viz: "trie",
  io: {
    fn: "Trie", params: [["ops", "ops"], ["args", "any"]], ret: "any",
    labels: { ops: "ops (method names, like LeetCode)", args: "args (one list of arguments per call)" },
    design: SHEETS.design({ cls: "Trie", ctor: [], methods: { insert: { args: ["str"], ret: "void" }, search: { args: ["str"], ret: "bool" }, startsWith: { args: ["str"], ret: "bool" } } }),
  },
  legend: [["cur", "node being visited"], ["win", "prefix matched so far"], ["ok", "end of a stored word"], ["hit", "word found"], ["bad", "no such child / not a whole word"]],

  statement: `A **trie** (pronounced "try") or **prefix tree** is a tree data structure used to efficiently store and retrieve keys in a dataset of strings. There are various applications of this data structure, such as autocomplete and spellchecker.

Implement the \`Trie\` class:
- \`Trie()\` initialises the trie object.
- \`void insert(String word)\` inserts the string \`word\` into the trie.
- \`boolean search(String word)\` returns \`true\` if the string \`word\` is in the trie (i.e., was inserted before), and \`false\` otherwise.
- \`boolean startsWith(String prefix)\` returns \`true\` if there is a previously inserted string \`word\` that has the prefix \`prefix\`, and \`false\` otherwise.

*(In the lab, the calls are written like LeetCode does: a list of method names in \`ops\`, and a list of argument lists in \`args\`. The result is the list of return values, with \`null\` for methods that return nothing.)*`,
  examples: [
    { input: `ops = ["Trie", "insert", "search", "search", "startsWith", "insert", "search"], args = [[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]]`, output: "[null, null, true, false, true, null, true]", explain: "`apple` is stored; `app` is only a **prefix** at first (`search` says false, `startsWith` says true); after inserting `app`, `search(\"app\")` is true." },
  ],
  constraints: ["$1 \\le$ `word.length`, `prefix.length` $\\le 2000$", "`word` and `prefix` consist only of lowercase English letters", "At most $3 \\cdot 10^4$ calls will be made to `insert`, `search` and `startsWith`"],
  check(input) {
    const ops = input.ops, args = input.args;
    if (!Array.isArray(args) || !Array.isArray(ops) || ops.length !== args.length) return "ops and args must have the same length (one argument list per call)";
    if (ops[0] !== "Trie" || (args[0] || []).length !== 0) return 'the first call must be "Trie" with an empty argument list []';
    if (ops.length > 9) return "for the animation use at most 9 calls (including Trie)";
    let letters = 0;
    for (let k = 1; k < ops.length; k++) {
      if (!["insert", "search", "startsWith"].includes(ops[k])) return `call ${k + 1}: the method must be insert, search or startsWith`;
      const a = args[k];
      if (!Array.isArray(a) || a.length !== 1 || typeof a[0] !== "string" || !/^[a-z]{1,6}$/.test(a[0])) return `call ${k + 1}: the argument must be a list with one lowercase word of 1 to 6 letters, e.g. ["app"]`;
      letters += a[0].length;
    }
    if (letters > 22) return "for the animation use at most 22 letters in total";
    return null;
  },

  intuition: {
    find: "A structure that can answer two questions about a growing set of words: *is this exact word stored?* and *does any stored word start with this prefix?*, both quickly, however many words there are.",
    beginner: "Keep all inserted words in a list (or a set). `search` looks for the exact word; `startsWith` scans every stored word and checks whether it begins with the prefix.",
    works: "A scan over all words answers both questions correctly: an exact match for `search`, a prefix comparison for `startsWith`.",
    slow: "`startsWith` has to look at every stored word: $O(N \\cdot L)$ for $N$ words of length $L$, and a list `search` costs $O(N \\cdot L)$ too (a hash set makes `search` fast, but `startsWith` is still slow). With $3 \\cdot 10^4$ calls and thousands of words, that is a lot of repeated scanning.",
    repeat: "Words that share a beginning (`apple`, `app`, `application`) store and compare the same letters again and again, and each `startsWith` re-reads those shared letters for every word.",
    remember: "Words that begin with the same letters can **share one path**. Store the first letters of all such words only once, and branch where the words differ. Each letter of a query then moves you one step along that shared path, so the cost depends only on the **length of the query**.",
    observation: "A **trie** is a tree where every node stands for a prefix and each edge is a letter. A word is a path from the root; a flag on the last node marks that **a word ends here** (so that `app` is a stored word even when `apple` continues below it). To insert: follow the letters, creating missing children, and mark the end. To search: follow the letters; the word exists if the path exists *and* the end flag is set. For `startsWith`: the path must exist; the flag does not matter.",
    leads: "Each node has up to 26 children (an array indexed by the letter, or a map) and a boolean `end`. `insert`: walk and create. `walk(s)`: follow the letters, return the final node or `null`. `search(w)`: `walk(w)` is not null and `end`. `startsWith(p)`: `walk(p)` is not null. Each operation is $O(L)$.",
  },

  flow: [
    "Keep a list of words; `search` and `startsWith` scan it.",
    "A scan with an exact or prefix comparison answers both questions.",
    "$O(N \\cdot L)$ per query: all words are re-read, including their shared beginnings.",
    "Words with a common beginning can share one path: a tree of letters.",
    "Mark the node where a word ends: `search` needs the flag, `startsWith` does not.",
    "Every operation follows one path of length $L$: $O(L)$, whatever the number of words.",
  ],

  brute: {
    idea: "**Brute force:** keep all inserted words in a `vector<string>`. `insert` appends. `search` scans the list for an equal word. `startsWith` scans the list and checks whether some word begins with the prefix.",
    why: "`search` and `startsWith` compare the query with **every stored word**: $O(N \\cdot L)$ per call, where $N$ is the number of words. Words with a shared beginning are compared letter by letter many times. A trie reads each letter of the query once and does not depend on $N$.",
    time: "O(N · L) per query", space: "O(N · L)",
    cpp: `class Trie {
    vector<string> words;
public:
    Trie() {}
    void insert(string word) { words.push_back(word); }
    bool search(string word) {
        for (const string& w : words) if (w == word) return true;
        return false;
    }
    bool startsWith(string prefix) {
        for (const string& w : words) if (w.compare(0, prefix.size(), prefix) == 0) return true;
        return false;
    }
};`,
    js: `class Trie {
  constructor() { this.words = []; }
  insert(word) { this.words.push(word); }
  search(word) { return this.words.includes(word); }
  startsWith(prefix) { return this.words.some((w) => w.startsWith(prefix)); }
}`,
  },

  pattern: {
    name: "Trie (prefix tree)",
    why: "A trie turns **prefix questions** into walks along a path. Words that share a beginning share nodes, so storage is compact for similar words, and every query costs $O(L)$ in the length of the *query*, no matter how many words are stored. It is the data structure behind autocomplete, spell checkers and word-search solvers.",
    recognize: [
      "You must test many strings for **being stored** or for **being a prefix** of stored strings.",
      "Many strings share beginnings (words of a dictionary, URLs, phone numbers, IP prefixes).",
      "You want all words with a given prefix, or the longest stored prefix of a string.",
      "A hash set answers exact lookups but cannot answer prefix queries quickly.",
    ],
  },

  optimal: {
    idea: "Build a tree of letters. The root stands for the empty prefix. Each node has up to 26 children, one per letter, and a flag `end` that says whether a stored word finishes at this node. `insert(word)` follows the letters from the root, creating a child where one is missing, and sets `end` on the last node. A helper `walk(s)` follows the letters of `s` and returns the node reached, or `null` if some letter has no child. `search(word)` is true when `walk(word)` exists and has `end`; `startsWith(prefix)` is true when `walk(prefix)` exists.",
    steps: [
      "Create the root node (no letter, `end = false`).",
      "**insert(word):** `cur = root`; for each letter `c`: if `cur` has no child for `c`, create it; move to that child. At the end set `cur.end = true`.",
      "**walk(s):** `cur = root`; for each letter `c`: `cur = cur.child[c]`; if it is missing, return `null`. Return `cur`.",
      "**search(word):** `node = walk(word)`; return `node != null && node.end`.",
      "**startsWith(prefix):** return `walk(prefix) != null`.",
    ],
    invariant: "**The path from the root spelled by a string `s` exists in the trie if and only if `s` is a prefix of some inserted word, and the node at the end of that path has `end = true` if and only if `s` itself was inserted.**",
    correct: "Insertion creates exactly the nodes along the path of the word (missing ones only) and marks the last as an end. So the set of paths from the root equals the set of prefixes of inserted words, and the end flags are set exactly at the inserted words (two words that share a prefix share its nodes and keep their own flags). `walk(s)` follows the path of `s`; it fails exactly when some prefix of `s` is not a prefix of any inserted word, i.e. when `s` is not a prefix of an inserted word. Hence `startsWith` (path exists) and `search` (path exists *and* flag) return the correct answers. Each step handles one letter, so every operation takes time proportional to the length of its argument.",
  },

  cpp: `class Trie {
    struct Node {                               // one node = one prefix
        Node* kid[26] = {};
        bool end = false;                       // does a stored word end here?
    };
    Node* root;
    Node* walk(const string& s) {               // follow the letters of s
        Node* cur = root;
        for (char c : s) {
            cur = cur->kid[c - 'a']; if (!cur) return nullptr;   // next letter, or fall off //@wStep
        }
        return cur;                             // the node of the whole string //@wRet
    }
public:
    Trie() { root = new Node(); }               // the empty prefix //@ctor
    void insert(string word) {
        Node* cur = root;                       // start at the root //@iStart
        for (char c : word) {
            int k = c - 'a';
            if (!cur->kid[k]) cur->kid[k] = new Node();   // create the missing letter //@iMake
            cur = cur->kid[k];                  // step down //@iStep
        }
        cur->end = true;                        // a word ends here //@iEnd
    }
    bool search(string word) {
        Node* cur = walk(word);                 //@sWalk
        return cur && cur->end;                 // the path must exist AND a word must end //@sRet
    }
    bool startsWith(string prefix) {
        Node* cur = walk(prefix);               //@pWalk
        return cur != nullptr;                  // the path alone is enough //@pRet
    }
};`,
  js: `class Trie {
  constructor() { this.root = { kid: {}, end: false }; }   // the empty prefix //@ctor
  walk(s) {                              // follow the letters of s
    let cur = this.root;
    for (const c of s) {
      cur = cur.kid[c]; if (!cur) return null;   // next letter, or fall off //@wStep
    }
    return cur;                          // the node of the whole string //@wRet
  }
  insert(word) {
    let cur = this.root;                 // start at the root //@iStart
    for (const c of word) {
      if (!cur.kid[c]) cur.kid[c] = { kid: {}, end: false };   // create the missing letter //@iMake
      cur = cur.kid[c];                  // step down //@iStep
    }
    cur.end = true;                      // a word ends here //@iEnd
  }
  search(word) {
    const cur = this.walk(word);         //@sWalk
    return !!cur && cur.end;             // the path must exist AND a word must end //@sRet
  }
  startsWith(prefix) {
    const cur = this.walk(prefix);       //@pWalk
    return cur !== null;                 // the path alone is enough //@pRet
  }
}`,

  tests: [
    { name: "Example: apple and app", kind: "normal", input: { ops: ["Trie", "insert", "search", "search", "startsWith", "insert", "search"], args: [[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]] } },
    { name: "Two words sharing a prefix", kind: "normal", input: { ops: ["Trie", "insert", "insert", "search", "startsWith", "startsWith"], args: [[], ["car"], ["cat"], ["car"], ["ca"], ["cab"]] } },
    { name: "Searching for a prefix that is not a word", kind: "edge", input: { ops: ["Trie", "insert", "search"], args: [[], ["dog"], ["do"]] }, why: "The path `d → o` exists, but no word ends at `o`, so `end` is false and `search` answers `false`. This is exactly why the end flag exists; without it `search(\"do\")` would be `true`." },
    { name: "startsWith with the whole word", kind: "edge", input: { ops: ["Trie", "insert", "startsWith"], args: [[], ["go"], ["go"]] }, why: "A word is a prefix of itself. `walk(\"go\")` reaches the last node, which is not null, so `startsWith` is `true` (it never looks at the end flag)." },
    { name: "Querying an empty trie", kind: "edge", input: { ops: ["Trie", "search", "startsWith"], args: [[], ["a"], ["a"]] }, why: "The root has no children yet, so `walk` falls off at the first letter and returns `null`: both calls answer `false`." },
    { name: "Inserting the same word twice", kind: "edge", input: { ops: ["Trie", "insert", "insert", "search"], args: [[], ["hi"], ["hi"], ["hi"]] }, why: "The second insertion finds both nodes already present (nothing is created) and sets the end flag again. Words are not duplicated: the trie stores each prefix once." },
    { name: "A longer query than the stored word", kind: "edge", input: { ops: ["Trie", "insert", "search"], args: [[], ["app"], ["apple"]] }, why: "`walk(\"apple\")` follows `a, p, p` and then falls off at `l` (no such child), returning `null`: `false`. A stored word is **not** a match for a longer query." },
    { name: "A word that is a prefix of an earlier word", kind: "corner", input: { ops: ["Trie", "insert", "insert", "search", "search"], args: [[], ["tea"], ["team"], ["tea"], ["team"]] }, why: "`tea` ends at an inner node (it has a child `m`), and `team` ends one level below. Both flags are set on one path, so both searches succeed." },
    { name: "Words that diverge at the root", kind: "corner", input: { ops: ["Trie", "insert", "insert", "search", "search"], args: [[], ["a"], ["b"], ["a"], ["c"]] }, why: "The root gets two children, `a` and `b`. Searching `c` falls off at the root's missing child: `false`. Different first letters mean separate branches from the very top." },
  ],

  trace(input, T, K) {
    const ops = input.ops, args = input.args;
    const nodes = { r: { ch: "", kids: {}, end: false } };
    let nid = 0;
    const results = [], stored = [];
    let whyEnd = false, whyShare = false, whyMiss = false, whyPrefix = false;
    const fmtR = (x) => (x === null ? "null" : String(x));
    const S = (o = {}) => () => ({
      nodes: JSON.parse(JSON.stringify(nodes)), root: "r", hl: o.hl || {}, word: o.word, wordLabel: o.wordLabel, whl: o.whl, i: o.i,
      found: stored.slice(), foundLabel: "words stored", gx: 46,
      note: o.note !== undefined ? o.note : `results so far: [${results.map(fmtR).join(", ")}]`,
    });
    const pathHl = (ids, last, cls) => { const h = {}; ids.forEach((id) => (h[id] = "win")); if (last) h[last] = cls || "cur"; return h; };
    function callLabel(op, a) { return a.length ? `${op}(“${a[0]}”)` : `${op}()`; }
    function walk(word, label, entryTag) {
      let cur = "r"; const ids = ["r"];
      for (let i = 0; i < word.length; i++) {
        const c = word[i], nxt = nodes[cur].kids[c];
        const whl = Object.fromEntries(Array.from({ length: i }, (_, k) => [k, "ok"]));
        if (nxt == null) {
          T.step("wStep", { vars: { letter: c, i, result: "null" }, state: S({ word, wordLabel: label, whl: Object.assign(whl, { [i]: "bad" }), i, hl: pathHl(ids, cur, "bad"), note: `no child “${c}” below the highlighted node` }), say: `Letter **${c}**: the current node has **no child** for it, so \`cur\` becomes \`null\` and the walk stops: \`return nullptr\`.`, op: `cur = cur->kid['${c}']  →  null;  return nullptr`, act: "FALL_OFF",
            why: whyMiss ? null : { title: "What does falling off mean?", text: "The path for this string does not exist: no stored word has this prefix. So the string is neither a word nor a prefix of one, and both `search` and `startsWith` answer `false`." } });
          whyMiss = true;
          return null;
        }
        cur = nxt; ids.push(cur);
        T.step("wStep", { vars: { letter: c, i }, state: S({ word, wordLabel: label, whl: Object.assign(whl, { [i]: "cur" }), i, hl: pathHl(ids.slice(0, -1), cur, "cur") }), say: `Letter **${c}**: the current node has a child for it, so move down to it. The prefix “${word.slice(0, i + 1)}” exists in the trie.`, op: `cur = cur->kid['${c}']`, act: "STEP" });
      }
      T.step("wRet", { vars: { node: word, end: nodes[cur].end }, state: S({ word, wordLabel: label, whl: Object.fromEntries(Array.from({ length: word.length }, (_, k) => [k, "ok"])), hl: pathHl(ids.slice(0, -1), cur, "cur"), note: nodes[cur].end ? "a stored word ends at this node" : "this node is only a prefix of longer words" }), say: `All ${word.length} letters were followed: the node for “${word}” exists. ${nodes[cur].end ? "Its **end** flag is set, so “" + word + "” is a stored word." : "Its **end** flag is **not** set: “" + word + "” is only a prefix of longer stored words."}`, op: "return cur", act: "REACHED_END" });
      return { id: cur, ids };
    }
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k], a = args[k] || [], label = callLabel(op, a);
      T.phase(label);
      if (op === "Trie") {
        T.step("ctor", { vars: { calls: 1 }, state: S({ note: "an empty trie: just the root" }), say: "`Trie()` creates the **root**: a node that stands for the empty prefix. It has no children yet and no word ends there.", op: "root = new Node()", act: "CREATE_ROOT" });
        results.push(null);
      } else if (op === "insert") {
        const w = a[0]; let cur = "r"; const ids = ["r"];
        T.step("iStart", { vars: { word: w }, state: S({ word: w, wordLabel: label, hl: { r: "cur" } }), say: `Insert **${w}**: start at the root and follow its letters, creating nodes only where they are missing.`, op: "cur = root", act: "START_INSERT" });
        for (let i = 0; i < w.length; i++) {
          const c = w[i], had = nodes[cur].kids[c] != null;
          if (!had) { const id = "n" + ++nid; nodes[id] = { ch: c, kids: {}, end: false }; nodes[cur].kids[c] = id; }
          const nxt = nodes[cur].kids[c];
          T.step("iMake", { vars: { letter: c, i, created: !had }, state: S({ word: w, wordLabel: label, whl: Object.assign(Object.fromEntries(Array.from({ length: i }, (_, q) => [q, "ok"])), { [i]: "cur" }), i, hl: pathHl(ids, nxt, "cur") }), say: had ? `The node for “${w.slice(0, i + 1)}” **already exists** (an earlier word has the same beginning): nothing to create. Words that share a prefix share these nodes.` : `There is no child **${c}** here yet, so **create** it: the prefix “${w.slice(0, i + 1)}” now exists.`, op: had ? `kid['${c}'] exists  →  reuse` : `kid['${c}'] = new Node()`, act: had ? "REUSE_NODE" : "CREATE_NODE",
            why: had && !whyShare ? { title: "Why reuse existing nodes?", text: "This is the whole idea of a trie: words that begin the same way share one path. Storing the shared beginning once saves memory, and queries about it cost the same however many words use it." } : null });
          if (had) whyShare = true;
          cur = nxt; ids.push(cur);
          T.step("iStep", { vars: { letter: c, i }, state: S({ word: w, wordLabel: label, whl: Object.fromEntries(Array.from({ length: i + 1 }, (_, q) => [q, "ok"])), i, hl: pathHl(ids.slice(0, -1), cur, "cur") }), say: `Step down to the node for “${w.slice(0, i + 1)}”.`, op: `cur = cur->kid['${c}']`, act: "STEP_DOWN" });
        }
        nodes[cur].end = true;
        if (!stored.includes(w)) stored.push(w);
        T.step("iEnd", { vars: { word: w }, state: S({ word: w, wordLabel: label, whl: Object.fromEntries(Array.from({ length: w.length }, (_, q) => [q, "ok"])), hl: pathHl(ids.slice(0, -1), cur, "hit") }), say: `All the letters are in place. Mark this node as the **end of a word**: “${w}” is now stored.`, op: "cur->end = true", act: "MARK_END",
          why: whyEnd ? null : { title: "Why the end flag?", text: "A node only says that some stored word *passes through* it. The flag says that a word **ends** here. Without it, inserting `apple` would make `app` look like a stored word." } });
        whyEnd = true;
        results.push(null);
      } else {
        const w = a[0], isSearch = op === "search";
        T.step(isSearch ? "sWalk" : "pWalk", { vars: { [isSearch ? "word" : "prefix"]: w }, state: S({ word: w, wordLabel: label, hl: { r: "cur" } }), say: isSearch ? `\`search("${w}")\`: first **walk** along the letters of “${w}” from the root.` : `\`startsWith("${w}")\`: **walk** along the letters of “${w}” from the root.`, op: `cur = walk("${w}")`, act: "WALK" });
        const r = walk(w, label);
        const found = r != null;
        const ans = isSearch ? found && nodes[r.id].end : found;
        const ids = found ? r.ids : [];
        T.step(isSearch ? "sRet" : "pRet", { vars: { "return": ans }, state: S({ word: w, wordLabel: label, whl: found ? Object.fromEntries(Array.from({ length: w.length }, (_, q) => [q, "ok"])) : undefined, hl: found ? pathHl(ids.slice(0, -1), r.id, ans ? "hit" : "bad") : {} }), say: isSearch ? (!found ? `The walk fell off the trie, so “${w}” is not stored: return **false**.` : nodes[r.id].end ? `The path exists **and** the end flag is set: “${w}” is a stored word. Return **true**.` : `The path exists, but **no word ends** here: “${w}” is only a prefix. Return **false**.`) : (found ? `The path for “${w}” exists, so some stored word starts with it. Return **true** (the end flag does not matter).` : `The walk fell off the trie: no stored word starts with “${w}”. Return **false**.`), op: isSearch ? `return cur && cur->end  →  ${ans}` : `return cur != nullptr  →  ${ans}`, act: ans ? "TRUE" : "FALSE",
          why: !isSearch && found && !nodes[r.id].end && !whyPrefix ? { title: "search and startsWith differ here", text: "`startsWith` only needs the **path**; `search` also needs a word to **end** at the last node. A prefix of a stored word passes the first test but not the second." } : null });
        if (!isSearch && found && !nodes[r.id].end) whyPrefix = true;
        results.push(ans);
      }
    }
    T.result(results.slice());
  },
  fuzz(rnd) {
    const al = "abc", ops = ["Trie"], args = [[]];
    const n = 1 + Math.floor(rnd() * 7);
    for (let i = 0; i < n; i++) {
      ops.push(["insert", "search", "startsWith"][Math.floor(rnd() * 3)]);
      args.push([Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => al[Math.floor(rnd() * 3)]).join("")]);
    }
    return { ops, args };
  },
  gen(n) { const w = "a".repeat(n); return { ops: ["Trie", "insert", "search"], args: [[], [w], [w]] }; },

  complexity: {
    time: {
      tex: "O(L)", title: "each operation follows one path of length L", short: "L = length of the word or prefix; independent of the number of stored words",
      derive: [
        "T_{\\text{insert}}(L) = L\\,(c_{\\text{make}} + c_{\\text{step}}) + c_{\\text{end}} || at most one node is created per letter",
        "T_{\\text{walk}}(L) \\le L\\, c_{\\text{step}} + c || one child lookup per letter; it stops early at the first missing child",
        "T_{\\text{search}} = T_{\\text{startsWith}} = T_{\\text{walk}}(L) + O(1)",
        "!T(L) = O(L) || the number of stored words $N$ does not appear",
      ],
      where: "Every step follows an array slot (`kid[c - 'a']`), an $O(1)$ operation. The brute force costs $O(N \\cdot L)$ per query. The measured table uses one insert and one search of a word of $L$ letters, so the count grows linearly with $L$.",
    },
    space: {
      tex: "O(N \\cdot L \\cdot \\sigma)", title: "one node per distinct prefix, each with a table of children", short: "at most N·L nodes; σ = 26 child slots per node with arrays",
      derive: [
        "\\#\\text{nodes} \\le 1 + \\sum_{w} |w| \\le 1 + N L || at most one new node per letter inserted",
        "\\text{each node} = \\sigma \\text{ pointers} + 1 \\text{ flag} || with a fixed array of size $\\sigma = 26$",
        "!S = O(N \\cdot L \\cdot \\sigma) \\;\\text{ in the worst case} || shared prefixes make it smaller, often much smaller",
      ],
      where: "Using a map per node instead of an array stores only the children that exist ($O(N L)$ entries in total). With many words that share prefixes the trie is far smaller than the sum of the word lengths.",
    },
    limit: "Reading the query takes $\\Omega(L)$, so $O(L)$ per operation is optimal. The price of the trie is memory for the nodes.",
    measure: { label: "L = length of the word (one insert, one search)", fTex: "L", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "No end-of-word flag", what: "Treating every existing path as a stored word.", why: "A trie is \"a tree of the words\".", breaks: "After inserting `apple`, `search(\"app\")` returns `true`, but `app` was never inserted.", avoid: "Keep a boolean `end` on the node where a word finishes, and require it in `search`." },
    { title: "Requiring the end flag in startsWith", what: "`return cur && cur->end;` for the prefix check.", why: "Copying the body of `search`.", breaks: "`startsWith(\"app\")` is false when only `apple` was inserted.", avoid: "`startsWith` needs only the path: `return cur != nullptr;`." },
    { title: "Forgetting to stop when a child is missing", what: "Calling `cur->kid[c - 'a']->…` without a null check.", why: "The loop looks like it always follows an existing path.", breaks: "A query that leaves the trie dereferences a null pointer and crashes.", avoid: "After each step, if `cur` is `null`, return `null` / `false`." },
    { title: "Overwriting an existing child on insert", what: "`cur->kid[k] = new Node();` without checking.", why: "It creates the node, which is what insert should do.", breaks: "Inserting `app` after `apple` replaces the `p` node and throws away the subtree of `apple`.", avoid: "Create the child only when it is missing: `if (!cur->kid[k]) …`." },
    { title: "Indexing with the character instead of its offset", what: "`kid[c]` in an array of 26.", why: "A `char` is a number.", breaks: "`'a'` is 97, far outside the array: out-of-bounds access.", avoid: "Use `c - 'a'` (or a map from character to node)." },
  ],

  followUps: [
    {
      q: "Store the children in a **hash map** instead of a 26-slot array.",
      a: "Each node holds a map from letter to child (`unordered_map<char, Node*>`). Memory is proportional to the letters actually stored, which matters for large alphabets (Unicode) or sparse tries; the operations stay $O(L)$ on average, with slightly bigger constants.",
      cpp: `class TrieMap {
    struct Node { unordered_map<char, Node*> kid; bool end = false; };
    Node* root = new Node();
public:
    void insert(const string& w) {
        Node* cur = root;
        for (char c : w) {
            if (!cur->kid.count(c)) cur->kid[c] = new Node();
            cur = cur->kid[c];
        }
        cur->end = true;
    }
    bool search(const string& w) {
        Node* cur = root;
        for (char c : w) { auto it = cur->kid.find(c); if (it == cur->kid.end()) return false; cur = it->second; }
        return cur->end;
    }
};`,
      js: `class TrieMap {
  constructor() { this.root = { kid: new Map(), end: false }; }
  insert(w) {
    let cur = this.root;
    for (const c of w) {
      if (!cur.kid.has(c)) cur.kid.set(c, { kid: new Map(), end: false });
      cur = cur.kid.get(c);
    }
    cur.end = true;
  }
  search(w) {
    let cur = this.root;
    for (const c of w) { cur = cur.kid.get(c); if (!cur) return false; }
    return cur.end;
  }
}`,
      time: "O(L)", space: "O(N · L)",
    },
    {
      q: "Return **all words** that start with a given prefix (autocomplete).",
      a: "Walk to the node of the prefix, then do a depth-first search below it, collecting the words whenever an `end` flag is met. The cost is $O(L + \\text{size of the subtree})$, i.e. proportional to the output.",
      time: "O(L + size of subtree)", space: "O(L + output)",
    },
    {
      q: "Support **delete(word)**.",
      a: "Walk to the word's last node and clear its `end` flag. Then, going back up, remove each node that has no children and no `end` flag (so unused branches disappear). Keep the path (or parent pointers) to climb back. $O(L)$.",
      time: "O(L)", space: "O(L)",
    },
    {
      q: "Search with a **wildcard** (`.` matches any letter).",
      a: "Walk the letters as usual, but on a `.` try **every** child with a recursive call and succeed if any of them succeeds. It is the next-but-one problem on the sheet (Design Add and Search Words), and the worst case is exponential in the number of dots: $O(26^d \\cdot L)$ for $d$ dots.",
      time: "O(26^d · L)", space: "O(L)",
    },
  ],

  related: [
    { id: "design-add-and-search-words-data-structure", why: "The same trie with a wildcard `.` in the search, which needs recursion over children." },
    { id: "word-search-ii", why: "A trie of the words lets one DFS over the board look for all of them at once." },
    { id: "encode-and-decode-strings", why: "Another design problem: choose a representation that makes queries or decoding simple." },
    { id: "group-anagrams", why: "Another string problem solved by choosing the right key/structure instead of comparing strings pairwise." },
  ],
  patternNote: "**A trie shares prefixes.** Each node is a prefix, each edge a letter, and a flag marks where a word ends. Insert, search and prefix queries are all walks along one path, so their cost depends on the length of the *query*, not on how many words are stored.",
  takeaways: [
    "A trie is a tree of letters: words sharing a beginning share nodes.",
    "Each node needs an **end flag**: `search` requires it, `startsWith` does not.",
    "`insert` creates only the missing children; a walk that falls off (null child) means the string is not a prefix of any word.",
    "Index children by `c - 'a'` (array of 26) or with a map; never overwrite an existing child.",
    "Every operation is $O(L)$ for the length $L$ of the argument; memory is $O(N \\cdot L)$ nodes (times the child table).",
  ],
});
