SHEETS.define({
  id: "word-search-ii",
  viz: "trie",
  io: { fn: "findWords", params: [["board", "char[][]"], ["words", "str[]"]], ret: "str[]", canon: "sort", labels: { board: "board (rows of single letters)", words: "words (the list to look for)" } },
  legend: [["cur", "cell / trie node being visited"], ["win", "current path on the board and in the trie"], ["hit", "a word was found here"], ["ok", "end of a word in the trie"]],

  statement: `Given an \`m x n\` \`board\` of characters and a list of strings \`words\`, return **all words on the board**.

Each word must be constructed from letters of sequentially adjacent cells, where adjacent cells are horizontally or vertically neighbouring. The **same letter cell may not be used more than once in a word**. The answer may be in any order.`,
  examples: [
    { input: `board = [["o","a","a","n"],["e","t","a","e"],["i","h","k","r"],["i","f","l","v"]], words = ["oath","pea","eat","rain"]`, output: `["eat", "oath"]`, explain: "`oath` and `eat` can be traced on the board; `pea` and `rain` cannot." },
    { input: `board = [["a","b"],["c","d"]], words = ["abcb"]`, output: "[]", explain: "`abcb` would need to use the cell `b` twice." },
  ],
  constraints: ["`m == board.length`, `n == board[i].length`", "$1 \\le m, n \\le 12$", "$1 \\le$ `words.length` $\\le 3 \\cdot 10^4$", "$1 \\le$ `words[i].length` $\\le 10$", "`board[i][j]` and `words[i]` consist of lowercase English letters", "All the strings of `words` are **unique**"],
  check(input) {
    const b = input.board, ws = input.words;
    if (!b.length || !b[0].length) return "the board needs at least one row and one column";
    if (b.some((r) => r.length !== b[0].length)) return "every row of the board must have the same length";
    if (b.length * b[0].length > 16) return "for the animation use at most 16 cells (for example 4 × 4)";
    if (b.some((r) => r.some((ch) => !/^[a-z]$/.test(ch)))) return "every board cell must be a single lowercase letter";
    if (ws.length < 1 || ws.length > 4) return "use 1 to 4 words for the animation";
    if (ws.some((w) => !/^[a-z]{1,5}$/.test(w))) return "every word must have 1 to 5 lowercase letters";
    if (new Set(ws).size !== ws.length) return "the words must be all different";
    return null;
  },

  intuition: {
    find: "Every word of the list that can be traced on the board, moving between neighbouring cells without reusing a cell. Several words may share the same cells and the same beginnings.",
    beginner: "For each word, run the Word Search algorithm (DFS with backtracking) on the board. Collect the words for which it succeeds.",
    works: "Each word is tested exactly as in Word Search, which is correct, so the words found are exactly the ones that exist on the board.",
    slow: "That is a **full board search for every word**: $O(W \\cdot m n \\cdot 3^L)$. For $3 \\cdot 10^4$ words that is far too much, and almost all of the work is repeated, because many words begin with the same letters.",
    repeat: "Words like `oath`, `oaten` and `oar` all start with `oa`: the board is searched for `oa` again and again, once per word. And a dead end (a prefix that exists on no path) is rediscovered for every word that starts with it.",
    remember: "A **trie** of all the words lets one search follow all the words **at the same time**: a path on the board that spells a prefix is looked up as a path in the trie. If the trie has no child for the next letter, *no* word starts with that prefix, so the whole branch of the search can be abandoned.",
    observation: "Build a trie from the words. Run one DFS from every cell, carrying the current trie node. At each cell: look up the cell's letter among the node's children; if there is none, stop (prune). If the new node ends a word, record that word (and clear it so it is not reported twice). Mark the cell as used, try the four neighbours with the new trie node, and un-mark the cell (backtrack).",
    leads: "`dfs(r, c, node)`: `next = node.child[board[r][c]]`; if null return; if `next.word` is set, add it and clear it; mark the cell, recurse into the unused neighbours with `next`, restore the cell. One DFS per cell serves all the words at once.",
  },

  flow: [
    "Run the single-word Word Search for every word of the list.",
    "Each word is checked exactly as before, so the answer is right.",
    "$O(W \\cdot mn \\cdot 3^L)$: the board is re-searched per word and shared beginnings are repeated.",
    "A trie of the words follows all of them at once; a missing child prunes every word with that prefix.",
    "One DFS per cell, carrying the trie node; record a word when its end node is reached.",
    "At most $O(mn \\cdot 3^L)$ in total (independent of $W$), plus $O(\\text{total letters})$ for the trie.",
  ],

  brute: {
    idea: "**Brute force:** for each word of the list, run the Word Search DFS from every cell of the board (mark the cell as used, try the four neighbours for the next letter, then un-mark it). If any start succeeds, add the word to the answer.",
    why: "Each word costs a full search, $O(mn \\cdot 3^L)$, so the whole list costs $O(W \\cdot mn \\cdot 3^L)$. Words with a common beginning repeat the same search of the board, and a prefix that fails for one word is rediscovered for every word that begins with it. The trie searches the board **once**, for all the words.",
    time: "O(W · mn · 3^L)", space: "O(L)",
    cpp: `class Solution {
    int R, C;
    bool dfs(vector<vector<char>>& b, const string& w, int r, int c, int k) {
        if (k == (int)w.size()) return true;
        if (r < 0 || c < 0 || r >= R || c >= C || b[r][c] != w[k]) return false;
        char keep = b[r][c];
        b[r][c] = '#';
        bool ok = dfs(b, w, r + 1, c, k + 1) || dfs(b, w, r - 1, c, k + 1)
               || dfs(b, w, r, c + 1, k + 1) || dfs(b, w, r, c - 1, k + 1);
        b[r][c] = keep;
        return ok;
    }
public:
    vector<string> findWords(vector<vector<char>>& board, vector<string>& words) {
        R = board.size(); C = board[0].size();
        vector<string> out;
        for (const string& w : words) {
            bool found = false;
            for (int r = 0; r < R && !found; r++)
                for (int c = 0; c < C && !found; c++)
                    if (dfs(board, w, r, c, 0)) found = true;
            if (found) out.push_back(w);
        }
        return out;
    }
};`,
    js: `function findWords(board, words) {
  const R = board.length, C = board[0].length;
  const dfs = (w, r, c, k) => {
    if (k === w.length) return true;
    if (r < 0 || c < 0 || r >= R || c >= C || board[r][c] !== w[k]) return false;
    const keep = board[r][c];
    board[r][c] = "#";
    const ok = dfs(w, r + 1, c, k + 1) || dfs(w, r - 1, c, k + 1) || dfs(w, r, c + 1, k + 1) || dfs(w, r, c - 1, k + 1);
    board[r][c] = keep;
    return ok;
  };
  const out = [];
  for (const w of words) {
    let found = false;
    for (let r = 0; r < R && !found; r++)
      for (let c = 0; c < C && !found; c++) if (dfs(w, r, c, 0)) found = true;
    if (found) out.push(w);
  }
  return out;
}`,
  },

  pattern: {
    name: "Trie + Backtracking (search all words at once)",
    why: "Backtracking explores a tree of choices; a trie tells you at each step **which choices can still lead to a word**. Walking the board and the trie together makes the trie the *pruning oracle*: a path on the board is abandoned the moment its letters are no longer a prefix of any word, and every word is searched in a single pass.",
    recognize: [
      "Many words must be searched in a grid, a graph or a string.",
      "A path of choices spells a **prefix** that can be rejected early (no word begins with it).",
      "Several words share beginnings, so a per-word search would repeat work.",
      "You need the **list** of words found, not just a yes/no for each.",
    ],
  },

  optimal: {
    idea: "Insert all the words into a trie, storing each complete word at its final node. Start a DFS from every board cell with the trie root. In `dfs(r, c, node)`: take the child of `node` for the letter on the board; if it does not exist, stop. If the child holds a word, add the word to the answer and erase it from the node (so it is reported once). Mark the cell as used, call `dfs` on each unused neighbour with the child node, and un-mark the cell.",
    steps: [
      "Build a trie from `words`; at the node where a word ends store the word itself.",
      "For each cell `(r, c)` call `dfs(r, c, root)`.",
      "In `dfs`: `next = node.child[board[r][c]]`; if `next` is `null`, return (prune).",
      "If `next.word` is non-empty, push it to the answer and clear it.",
      "Mark the cell (`'#'`); for the four neighbours that are on the board and not marked, call `dfs(nr, nc, next)`.",
      "Restore the letter (backtrack) and return.",
      "After all cells, return the answer.",
    ],
    invariant: "**Whenever `dfs(r, c, node)` is called, `node` is the trie node of the letters along the current board path (the cells marked `'#'`, in order), and the path is a prefix of at least one word that has not been found yet.**",
    correct: "A word is on the board iff some simple path of adjacent cells spells it. The DFS enumerates simple paths (the marks forbid reusing a cell) and follows the trie in step with the letters, so after consuming a path it stands at the trie node for that exact string. When the string equals a word, that node holds the word and it is reported, so every word that can be traced is found by the DFS that starts at the first cell of its path. A branch is abandoned only when the trie has no child for the next letter, which means that no word begins with the path plus that letter, so nothing is lost. Clearing the word after reporting ensures that a word reachable through several paths appears once. Un-marking the cell on the way back makes other paths see the original board.",
  },

  cpp: `class Solution {
    struct Node { Node* kid[26] = {}; string word; };   // word != "" marks the end of a word
    int R, C;
    vector<string> found;
    void dfs(vector<vector<char>>& b, int r, int c, Node* node) {
        char ch = b[r][c];
        Node* next = node->kid[ch - 'a'];       // does a word continue with this letter? //@step
        if (!next) return;                      // no: prune the whole branch //@prune
        if (!next->word.empty()) { found.push_back(next->word); next->word.clear(); }   // a word ends here //@hit
        b[r][c] = '#';                          // mark the cell as used //@mark
        const int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr >= 0 && nc >= 0 && nr < R && nc < C && b[nr][nc] != '#') dfs(b, nr, nc, next);   // go on //@recurse
        }
        b[r][c] = ch;                           // backtrack //@undo
    }
public:
    vector<string> findWords(vector<vector<char>>& board, vector<string>& words) {
        Node* root = new Node();                // a trie of all the words //@build
        for (const string& w : words) {
            Node* cur = root;
            for (char c : w) { if (!cur->kid[c - 'a']) cur->kid[c - 'a'] = new Node(); cur = cur->kid[c - 'a']; }
            cur->word = w;
        }
        R = board.size(); C = board[0].size();
        for (int r = 0; r < R; r++)
            for (int c = 0; c < C; c++) dfs(board, r, c, root);   // start from every cell //@start
        return found;                           //@ret
    }
};`,
  js: `function findWords(board, words) {
  const root = { kid: {}, word: "" };    // a trie of all the words //@build
  for (const w of words) {
    let cur = root;
    for (const c of w) { if (!cur.kid[c]) cur.kid[c] = { kid: {}, word: "" }; cur = cur.kid[c]; }
    cur.word = w;
  }
  const R = board.length, C = board[0].length, found = [];
  function dfs(r, c, node) {
    const ch = board[r][c];
    const next = node.kid[ch];           // does a word continue with this letter? //@step
    if (!next) return;                   // no: prune the whole branch //@prune
    if (next.word) { found.push(next.word); next.word = ""; }   // a word ends here //@hit
    board[r][c] = "#";                   // mark the cell as used //@mark
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < R && nc < C && board[nr][nc] !== "#") dfs(nr, nc, next);   // go on //@recurse
    }
    board[r][c] = ch;                    // backtrack //@undo
  }
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) dfs(r, c, root);   // start from every cell //@start
  return found;                          //@ret
}`,

  tests: [
    { name: "Example 1: oath, pea, eat, rain", kind: "normal", input: { board: [["o", "a", "a", "n"], ["e", "t", "a", "e"], ["i", "h", "k", "r"], ["i", "f", "l", "v"]], words: ["oath", "pea", "eat", "rain"] } },
    { name: "Example 2: abcb needs a cell twice", kind: "normal", input: { board: [["a", "b"], ["c", "d"]], words: ["abcb"] } },
    { name: "Several words on a 2 × 2 board", kind: "normal", input: { board: [["a", "b"], ["c", "d"]], words: ["ab", "bd", "dc", "abdc"] } },
    { name: "A one-cell board: a match", kind: "edge", input: { board: [["a"]], words: ["a"] }, why: "The single cell spells the word `a`: the trie child exists, the node holds the word, and it is reported. There are no neighbours to visit." },
    { name: "A one-cell board: a word needing the cell twice", kind: "edge", input: { board: [["a"]], words: ["aa"] }, why: "The first `a` is matched, but the cell is then marked as used, so the second `a` cannot be matched anywhere. The answer is empty: a cell can be used only once." },
    { name: "A word that is a prefix of another", kind: "edge", input: { board: [["a", "p"], ["x", "p"]], words: ["ap", "app"] }, why: "`ap` ends at an inner node of the trie, while the search carries on to `app`. Both words must be reported: the hit is checked at every node of the path, not only at leaves." },
    { name: "One word reachable by many paths", kind: "edge", input: { board: [["a", "a"], ["a", "a"]], words: ["aa"] }, why: "There are many ways to spell `aa` on this board (every pair of adjacent cells). The word is reported **once** because its node is cleared the first time it is found; without that, the answer would contain duplicates." },
    { name: "No cell reuse", kind: "corner", input: { board: [["a", "b"]], words: ["aba"] }, why: "`a → b → a` would use the first `a` twice. The mark on the cell makes the second `a` unavailable (the other `a`-start has no neighbour `b` followed by another `a`). The answer is empty." },
    { name: "Letters that are not on the board", kind: "corner", input: { board: [["a", "b"], ["c", "d"]], words: ["zz"] }, why: "At every cell the trie has no child for the letter (the only child of the root is `z`), so each of the four DFS calls returns at the first step (prune): no word is searched at all." },
    { name: "Words sharing a beginning, one of them impossible", kind: "corner", input: { board: [["c", "a", "t"], ["r", "x", "s"]], words: ["cat", "car", "cats"] }, why: "`cat` and `cats` follow the trie path `c, a, t` (and `s`), found in one walk. `car` shares `c, a` but needs an `r` next to `a`; the only `r` is diagonal, so that branch is pruned: the answer is `cat` and `cats`." },
  ],

  trace(input, T) {
    const B = input.board.map((r) => r.slice()), words = input.words;
    const R = B.length, C = B[0].length;
    const nodes = { r: { ch: "", kids: {}, end: false, word: "" } };
    let nid = 0;
    for (const w of words) {
      let cur = "r";
      for (const c of w) { if (!nodes[cur].kids[c]) { const id = "n" + ++nid; nodes[id] = { ch: c, kids: {}, end: false, word: "" }; nodes[cur].kids[c] = id; } cur = nodes[cur].kids[c]; }
      nodes[cur].end = true; nodes[cur].word = w;
    }
    const used = new Set(), found = [], hitNodes = {};
    let pathNodes = ["r"], whyPrune = false, whyHit = false, whyClear = false, whyUndo = false, whyShare = false;
    const key = (r, c) => r + "," + c;
    const S = (o = {}) => () => {
      const hl = {}, ghl = {};
      pathNodes.forEach((id) => (hl[id] = "win"));
      for (const id in hitNodes) hl[id] = "hit";
      if (o.node) hl[o.node] = o.bad ? "bad" : "cur";
      used.forEach((k) => (ghl[k] = "win"));
      if (o.cell) ghl[key(o.cell[0], o.cell[1])] = o.bad ? "bad" : "cur";
      return { nodes: JSON.parse(JSON.stringify(nodes)), root: "r", hl, grid: { cells: B, hl: ghl, title: "board" }, found: found.slice(), foundLabel: "words found", gx: 48, note: o.note };
    };
    const total = words.reduce((s, w) => s + w.length, 0);
    T.step("build", { w: total, vars: { words: words.length, "trie nodes": Object.keys(nodes).length }, state: S({ node: "r" }), phase: "Build a trie of all the words", say: `Insert the ${words.length} word${words.length === 1 ? "" : "s"} (${total} letters) into a **trie**. Words that start alike share their first nodes (${Object.keys(nodes).length - 1} nodes instead of ${total}). The end node of each word stores the word itself.`, op: "root = trie of words;  node.word = w", act: "BUILD_TRIE",
      why: { title: "Why a trie?", text: "One search of the board can follow *all* the words at once: the trie says, for the letters read so far, which words are still possible. If no word continues with the next letter, the whole branch is useless and is dropped." } });
    T.phase("Search the board from every cell");
    function dfs(r, c, nodeId) {
      const ch = B[r][c], nxt = nodes[nodeId].kids[ch];
      T.step("step", { vars: { r, c, letter: ch }, state: S({ cell: [r, c], node: nodeId, bad: !nxt }), say: nxt ? `Cell (${r}, ${c}) holds **${ch}**. The trie node has a child **${ch}**, so some word still continues this way: go on.` : `Cell (${r}, ${c}) holds **${ch}**, but the trie node has **no child ${ch}**: no word starts with this path plus “${ch}”.`, op: `next = node->kid['${ch}']  →  ${nxt ? "found" : "null"}`, act: nxt ? "TRIE_CHILD" : "NO_CHILD" });
      if (!nxt) {
        T.step("prune", { vars: { r, c }, state: S({ cell: [r, c], node: nodeId, bad: true, note: "pruned" }), say: "No word has this prefix, so the search **returns at once**: every longer path through here is skipped without being explored.", op: "if (!next) return", act: "PRUNE",
          why: whyPrune ? null : { title: "Why is pruning so powerful?", text: "Without the trie, a path would be extended until its length reaches that of the word before we notice it is wrong. With the trie, a wrong letter ends the branch immediately, for all the words at once." } });
        whyPrune = true;
        return;
      }
      const prevPath = pathNodes;
      pathNodes = pathNodes.concat(nxt);
      if (nodes[nxt].word) {
        const w = nodes[nxt].word;
        found.push(w); hitNodes[nxt] = true; nodes[nxt].word = "";
        T.step("hit", { vars: { r, c, word: w }, state: S({ cell: [r, c], node: nxt, note: `found “${w}”` }), say: `This trie node ends the word **“${w}”**: the path on the board spells it. Add it to the answer and **erase** it from the node, so that it is not reported again by another path.`, op: `found.push_back("${w}");  next->word.clear()`, act: "WORD_FOUND",
          why: !whyHit ? { title: "Why check at every node?", text: "A word can end in the middle of a longer one (`ap` inside `app`). So the test is made at every node of the path, and the search continues afterwards in case a longer word follows." } : !whyClear ? { title: "Why erase the word?", text: "The same word may be spelled by several different paths on the board. Erasing it from the trie node the first time guarantees one entry in the answer." } : null });
        whyHit = true; if (whyHit) whyClear = true;
      }
      used.add(key(r, c));
      T.step("mark", { vars: { r, c }, state: S({ cell: [r, c], node: nxt }), say: `Mark cell (${r}, ${c}) as used (the code writes \`#\` into it), so this path cannot step on it again.`, op: `b[${r}][${c}] = '#'`, act: "MARK" });
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < R && nc < C && !used.has(key(nr, nc))) {
          T.step("recurse", { vars: { r, c, "to": `(${nr}, ${nc})`, "carrying": nodes[nxt].ch }, state: S({ cell: [nr, nc], node: nxt }), say: `Try the neighbour (${nr}, ${nc}) = **${B[nr][nc]}** with the current trie node.`, op: `dfs(b, ${nr}, ${nc}, next)`, act: "GO_NEIGHBOUR" });
          dfs(nr, nc, nxt);
        }
      }
      used.delete(key(r, c));
      pathNodes = prevPath;
      T.step("undo", { vars: { r, c }, state: S({ cell: [r, c], node: nodeId, note: "backtracked" }), say: `All neighbours are done. Restore cell (${r}, ${c}) to **${ch}** (backtrack) and return to the previous cell.`, op: `b[${r}][${c}] = '${ch}'`, act: "BACKTRACK",
        why: whyUndo ? null : { title: "Why restore the cell?", text: "Other paths (from other cells or other directions) may need this cell. A mark only belongs to the path that is currently being explored." } });
      whyUndo = true;
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      T.step("start", { vars: { r, c }, state: S({ cell: [r, c], node: "r" }), say: `Start a search from cell (${r}, ${c}) = **${B[r][c]}** with the trie root: any word could begin here.`, op: `dfs(board, ${r}, ${c}, root)`, act: "START_CELL" });
      dfs(r, c, "r");
    }
    T.step("ret", { vars: { "return": `[${found.map((x) => `"${x}"`).join(", ")}]` }, state: S({ note: "all cells tried" }), say: found.length ? `Every start cell has been tried. The words found on the board: **${found.map((x) => `“${x}”`).join(", ")}**.` : "Every start cell has been tried and no word was found: the answer is empty.", op: "return found", act: "DONE" });
    T.result(found.slice());
  },
  fuzz(rnd) {
    const al = "abc", R = 1 + Math.floor(rnd() * 3), C = 1 + Math.floor(rnd() * 3);
    const board = Array.from({ length: R }, () => Array.from({ length: C }, () => al[Math.floor(rnd() * 3)]));
    const ws = new Set();
    const k = 1 + Math.floor(rnd() * 4);
    while (ws.size < k) ws.add(Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => al[Math.floor(rnd() * 3)]).join(""));
    return { board, words: [...ws] };
  },
  gen(n) { return { board: Array.from({ length: 5 }, () => new Array(5).fill("a")), words: ["a".repeat(n) + "b"] }; },

  complexity: {
    time: {
      tex: "O(mn \\cdot 3^{L})", title: "at most 4·3^(L−1) paths from each of the mn cells, independent of the number of words", short: "L = length of the longest word; plus O(total letters) to build the trie",
      derive: [
        "T_{\\text{trie}} = \\sum_w |w| \\cdot c = O(S) || S = the total number of letters of all the words",
        "\\text{paths from one cell} \\le 1 + 4 + 4\\cdot 3 + \\dots + 4\\cdot 3^{L-1} = 2\\cdot 3^{L} - 1 || a path is no longer than the longest word (trie depth $L$) and has at most 3 new choices per step",
        "T_{\\text{search}} \\le mn\\,(2\\cdot 3^{L} - 1)\\, c || one DFS from each of the $mn$ cells",
        "!T = O(S + mn \\cdot 3^{L}) || not multiplied by the number of words $W$",
      ],
      where: "Here $L$ is the length of the longest word. The bound is reached only when the board and the words are very repetitive; the trie prunes nearly everything otherwise. The measured table uses a $5 \\times 5$ board of `a` and one word `a…ab`, which explores all self-avoiding paths of length up to $L$ (roughly 2 to 2.3 times more for each extra letter).",
    },
    space: {
      tex: "O(S)", title: "the trie, plus the recursion stack and the answer", short: "S = total letters; the stack is at most L deep",
      derive: [
        "\\#\\text{trie nodes} \\le 1 + S || at most one node per letter inserted",
        "S_{\\text{stack}} \\le L + 1 || the DFS depth is bounded by the longest word",
        "!S_{\\text{total}} = O(S + \\text{output}) || the marks are written into the board and undone",
      ],
      where: "The brute force uses only $O(L)$ of working memory (no trie), but pays with time. The trie trades $O(S)$ memory for a search that is independent of the number of words.",
    },
    limit: "Finding all words can require visiting every path in the worst case (an exponential number), so the exponential factor in $L$ cannot be avoided in general; the trie removes the dependence on the number of words and prunes impossible prefixes.",
    measure: { label: "L = letters of the word that match before the failure (5 × 5 board of a)", fTex: "3^L", f: (n) => Math.pow(3, n), sizes: [3, 4, 5, 6, 7], growth: "exponential in the word length", reading: "Each extra letter multiplies the work by roughly **2 to 2.3** (never more than 3): exponential in the length of the word. The factor shrinks a little for long words because the 5 × 5 board is small." },
  },

  mistakes: [
    { title: "Searching the board once per word", what: "Calling Word Search for every word.", why: "It reuses the previous problem directly.", breaks: "The board is searched $W$ times, and shared beginnings are re-explored each time: far too slow for thousands of words.", avoid: "Build one trie and search all the words together." },
    { title: "Reporting the same word more than once", what: "Pushing the word every time a path spells it.", why: "A word on the board can be traced in several ways.", breaks: "The answer contains duplicates (`aa` on a board of `a`s).", avoid: "Clear the word in the trie node after reporting it (or use a set)." },
    { title: "Stopping at the first word found", what: "`return` right after pushing a word.", why: "The path has \"done its job\".", breaks: "A longer word that shares the path (`app` after `ap`) is never found.", avoid: "After a hit, continue the DFS: only a missing trie child ends the path." },
    { title: "Forgetting to restore the cell", what: "Marking the cell with `#` but not putting the letter back.", why: "The recursion seems to be finished.", breaks: "Cells stay blocked for later paths, so words are missed (and the caller's board is destroyed).", avoid: "Restore the letter after the neighbours have been explored." },
    { title: "Not pruning on a missing child", what: "Following the board while ignoring whether the trie has the letter.", why: "The trie is used only to check the final word.", breaks: "The search degenerates to exploring all paths: no better than the brute force.", avoid: "`if (!next) return;` as the first thing in `dfs`." },
  ],

  followUps: [
    {
      q: "**Prune the trie** as words are found, to speed up later searches.",
      a: "When a node has no children and no word left, it is useless: remove it from its parent (`parent.kid[c] = null`). Over time the trie shrinks, and cells whose letters lead only into removed branches are rejected at the first step. It does not change the worst case but makes the typical running time much smaller.",
      cpp: `class SolPrune {
    struct Node { Node* kid[26] = {}; string word; int count = 0; };
    int R, C;
    vector<string> found;
    void dfs(vector<vector<char>>& b, int r, int c, Node* parent) {
        char ch = b[r][c];
        Node* node = parent->kid[ch - 'a'];
        if (!node) return;
        if (!node->word.empty()) { found.push_back(node->word); node->word.clear(); }
        b[r][c] = '#';
        const int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr >= 0 && nc >= 0 && nr < R && nc < C && b[nr][nc] != '#') dfs(b, nr, nc, node);
        }
        b[r][c] = ch;
        bool empty = node->word.empty();
        for (Node* k : node->kid) if (k) { empty = false; break; }
        if (empty) parent->kid[ch - 'a'] = nullptr;   // remove a useless leaf
    }
public:
    vector<string> findWords(vector<vector<char>>& board, vector<string>& words) {
        Node* root = new Node();
        for (const string& w : words) {
            Node* cur = root;
            for (char c : w) { if (!cur->kid[c - 'a']) cur->kid[c - 'a'] = new Node(); cur = cur->kid[c - 'a']; }
            cur->word = w;
        }
        R = board.size(); C = board[0].size();
        for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) dfs(board, r, c, root);
        return found;
    }
};`,
      js: `function findWordsPrune(board, words) {
  const root = { kid: {}, word: "" };
  for (const w of words) {
    let cur = root;
    for (const c of w) { if (!cur.kid[c]) cur.kid[c] = { kid: {}, word: "" }; cur = cur.kid[c]; }
    cur.word = w;
  }
  const R = board.length, C = board[0].length, found = [];
  function dfs(r, c, parent) {
    const ch = board[r][c], node = parent.kid[ch];
    if (!node) return;
    if (node.word) { found.push(node.word); node.word = ""; }
    board[r][c] = "#";
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < R && nc < C && board[nr][nc] !== "#") dfs(nr, nc, node);
    }
    board[r][c] = ch;
    if (!node.word && Object.keys(node.kid).length === 0) delete parent.kid[ch];
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) dfs(r, c, root);
  return found;
}`,
      time: "O(S + mn · 3^L)", space: "O(S)",
    },
    {
      q: "Check whether a **single word** exists on the board (the previous problem).",
      a: "With one word the trie is just a chain, and the algorithm reduces to the Word Search DFS: follow the letters and back out at the first mismatch.",
      time: "O(mn · 3^L)", space: "O(L)",
    },
    {
      q: "The board is **huge** (thousands of cells per side) and the words are few.",
      a: "Start the DFS only from cells whose letter is the first letter of some word (a single lookup in the trie root), and skip the rest. With a few rare first letters most of the board is never explored.",
      time: "O(starts · 3^L)", space: "O(S)",
    },
    {
      q: "Allow **diagonal** moves as well.",
      a: "Use eight neighbours instead of four. Each step then has up to 7 new choices, so the bound becomes $O(mn \\cdot 7^L)$; the trie pruning is just as useful.",
      time: "O(mn · 7^L)", space: "O(S)",
    },
  ],

  related: [
    { id: "word-search", why: "The single-word version: the same DFS with marks and backtracking, without a trie." },
    { id: "implement-trie-prefix-tree", why: "The data structure that makes this solution fast." },
    { id: "design-add-and-search-words-data-structure", why: "A trie searched by DFS with branching, there on wildcards and here on board neighbours." },
    { id: "number-of-islands", why: "Another DFS on a grid, but with permanent marks instead of backtracking." },
  ],
  patternNote: "**The trie as a pruning oracle.** Backtracking explores partial solutions; a trie of the targets says, for each partial string, whether *any* target can still start with it. One DFS then serves every word, wrong prefixes are cut at the first wrong letter, and words that end mid-path are reported as soon as their node is reached.",
  takeaways: [
    "Build a trie of all words; store the word at its end node; search from every cell with the trie root.",
    "In `dfs`: no trie child → **prune**; a stored word → report it and **clear** it (no duplicates); then mark, explore neighbours, **restore**.",
    "Do not stop at the first hit: a longer word may share the path.",
    "One search serves all words: $O(S + mn \\cdot 3^L)$ instead of $O(W \\cdot mn \\cdot 3^L)$.",
    "Optional speed-up: remove empty trie leaves after exploring them.",
  ],
});
