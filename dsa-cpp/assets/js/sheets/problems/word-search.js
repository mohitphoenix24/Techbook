SHEETS.define({
  id: "word-search",
  viz: "backtracking",
  io: { fn: "exist", params: [["board", "char[][]"], ["word", "str"]], ret: "bool", labels: { board: "board (rows of single letters)", word: "word to find" } },
  legend: [["cur", "cell being tried"], ["win", "on the current path"], ["ok", "part of the solution"], ["dim", "tried and abandoned"], ["bad", "wrong letter or off the board"]],

  statement: `Given an \`m x n\` grid of characters \`board\` and a string \`word\`, return \`true\` if \`word\` exists in the grid.

The word can be constructed from letters of **sequentially adjacent cells**, where adjacent cells are horizontally or vertically neighbouring. The **same letter cell may not be used more than once** in a word.`,
  examples: [
    { input: `board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCCED"`, output: "true", explain: "A → B → C (top row), down to C, then D and E: every step moves to a neighbouring cell." },
    { input: `board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "SEE"`, output: "true", explain: "S, then the E below it, then the E below that." },
    { input: `board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCB"`, output: "false", explain: "After A → B → C, the only B is the one already used, and a cell cannot be reused." },
  ],
  constraints: ["`m == board.length`, `n = board[i].length`", "$1 \\le m, n \\le 6$", "$1 \\le$ `word.length` $\\le 15$", "`board` and `word` consist of only lowercase and uppercase English letters"],
  check(input) {
    const b = input.board, w = input.word;
    if (!b.length || !b[0].length) return "the board needs at least one row and one column";
    if (b.some((r) => r.length !== b[0].length)) return "every row of the board must have the same length";
    if (b.length > 4 || b[0].length > 4) return "for the animation use at most 4 rows and 4 columns";
    if (b.some((r) => r.some((ch) => !/^[A-Za-z]$/.test(ch)))) return "every board cell must be a single English letter";
    if (!/^[A-Za-z]{1,8}$/.test(w)) return "the word must have 1 to 8 English letters";
    // would the drawn search tree be too large? (upper bound: every matching call, ignoring the early exit)
    const R = b.length, C = b[0].length, used = b.map((r) => r.map(() => false));
    let calls = 0;
    (function d(r, c, k) {
      if (calls > 150 || k === w.length || r < 0 || c < 0 || r >= R || c >= C || used[r][c] || b[r][c] !== w[k]) return;
      calls++; used[r][c] = true;
      d(r + 1, c, k + 1); d(r - 1, c, k + 1); d(r, c + 1, k + 1); d(r, c - 1, k + 1);
      used[r][c] = false;
    });
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) (function d(r, c, k) {
      if (calls > 150 || k === w.length || r < 0 || c < 0 || r >= R || c >= C || used[r][c] || b[r][c] !== w[k]) return;
      calls++; used[r][c] = true;
      d(r + 1, c, k + 1); d(r - 1, c, k + 1); d(r, c + 1, k + 1); d(r, c - 1, k + 1);
      used[r][c] = false;
    })(r, c, 0);
    if (calls > 150) return "this board and word would draw a search tree with too many branches: use a shorter word or a board with more varied letters";
    return null;
  },

  intuition: {
    find: "A **path of neighbouring cells** that spells the word, using each cell at most once. The path can start anywhere and turn at every step, so we cannot simply scan.",
    beginner: "Generate every possible path of the right length from every cell (moving up, down, left, right, never reusing a cell), write down the letters of each path, and check whether any path spells the word.",
    works: "It covers every candidate path, so if the word can be built, one of the generated paths will be it.",
    slow: "The number of paths grows by up to **3 times per step** (about $3^L$ for a word of length $L$) from every cell, and this version keeps building each path *even after a letter has already gone wrong*. A path that starts with the wrong letter is still extended to full length.",
    repeat: "All the paths that begin with the same wrong letters are generated again and again, although we already know they cannot spell the word.",
    remember: "We do not need to build the whole path before judging it: at every step the next cell must hold **exactly the next letter of the word**. As soon as it does not, the entire family of paths below that point is hopeless and can be skipped.",
    observation: "Do a **depth-first search with backtracking**: from a cell, if it holds the right letter, **mark it as used**, try its four neighbours for the next letter, and then **unmark it** (backtrack) so that other paths may use it. Wrong letters, cells off the board and cells already on the path **stop the search immediately** (pruning).",
    leads: "For every cell as a start, call `dfs(r, c, k)`: if `k` equals the word length, succeed; if the cell is off the board or its letter differs from `word[k]`, fail; otherwise mark it, try the four neighbours with `k + 1`, undo the mark, and return what they found.",
  },

  flow: [
    "List every path of neighbouring cells and compare each one with the word.",
    "Every possible spelling is covered, so a real path will be found.",
    "About $3^L$ paths from each cell, and wrong prefixes are extended all the way to full length.",
    "A path can be judged letter by letter: the next cell must hold `word[k]`.",
    "DFS with a used-mark and an undo: wrong letters cut the whole branch.",
    "Mismatches prune almost everything: $O(mn \\cdot 3^L)$ in the worst case, $O(L)$ space.",
  ],

  brute: {
    idea: "**Brute force:** from every cell, enumerate all simple paths of exactly `L` cells (moving to unused neighbours), building the string of letters as we go. Only when a path has `L` letters do we compare it with `word`.",
    why: "A mismatch in the *first* letter does not stop the enumeration: every path that begins with a wrong letter is still extended to full length. That wastes the work of a whole subtree each time. Pruning on every letter, as backtracking does, avoids all of it on typical inputs.",
    time: "O(mn · 3^L)", space: "O(L)",
    cpp: `class Solution {
    int R, C;
    bool go(vector<vector<char>>& b, const string& w, int r, int c, string& cur, vector<vector<bool>>& used) {
        cur.push_back(b[r][c]);
        used[r][c] = true;
        bool found = false;
        if (cur.size() == w.size()) found = (cur == w);
        else {
            int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
            for (int d = 0; d < 4 && !found; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr >= 0 && nc >= 0 && nr < R && nc < C && !used[nr][nc])
                    found = go(b, w, nr, nc, cur, used);
            }
        }
        cur.pop_back();
        used[r][c] = false;
        return found;
    }
public:
    bool exist(vector<vector<char>>& b, string w) {
        R = b.size(); C = b[0].size();
        vector<vector<bool>> used(R, vector<bool>(C, false));
        string cur;
        for (int r = 0; r < R; r++)
            for (int c = 0; c < C; c++)
                if (go(b, w, r, c, cur, used)) return true;
        return false;
    }
};`,
    js: `function exist(b, w) {
  const R = b.length, C = b[0].length;
  const used = Array.from({ length: R }, () => new Array(C).fill(false));
  const go = (r, c, cur) => {
    cur += b[r][c];
    used[r][c] = true;
    let found = false;
    if (cur.length === w.length) found = cur === w;
    else {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < R && nc < C && !used[nr][nc] && go(nr, nc, cur)) { found = true; break; }
      }
    }
    used[r][c] = false;
    return found;
  };
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (go(r, c, "")) return true;
  return false;
}`,
  },

  pattern: {
    name: "Backtracking (DFS on a grid, choose / explore / un-choose)",
    why: "Whenever you must find *some* path or arrangement among exponentially many, and a partial choice can already be rejected, **backtracking** explores one choice at a time, goes deeper, and **undoes** the choice on the way back. The undo step is what lets the same cell serve many different paths.",
    recognize: [
      "A path or sequence must be built **step by step** under rules (adjacent, unused, in order).",
      "A partial solution can be **rejected early** (a wrong letter ends the branch).",
      "The same resource (a cell) may be used by many candidates but only **once per candidate**.",
      "Words like *\"exists\"*, *\"all paths\"*, *\"all combinations\"* appear on a small input.",
    ],
  },

  optimal: {
    idea: "Treat every cell as a possible start. `dfs(r, c, k)` asks: *can the letters `word[k..]` be spelled by a path that starts at cell `(r, c)`?* If `k` equals the length of the word, yes. If the cell is outside the board or does not hold `word[k]`, no. Otherwise temporarily mark the cell as used (`'#'`), try the four neighbours for letter `k + 1`, then restore the cell and report whether any neighbour succeeded.",
    steps: [
      "For each cell `(r, c)` of the board, call `dfs(r, c, 0)`; return `true` as soon as one call succeeds.",
      "In `dfs`: if `k == word.length`, return `true` (every letter has been matched).",
      "If `(r, c)` is off the board or `board[r][c] != word[k]`, return `false` (this includes cells already marked `'#'`).",
      "Mark the cell: save its letter and set it to `'#'`.",
      "Try the neighbours `(r+1, c)`, `(r−1, c)`, `(r, c+1)`, `(r, c−1)` with `k + 1`; stop at the first success.",
      "Restore the cell's letter (**backtrack**) and return the result.",
    ],
    invariant: "**When `dfs(r, c, k)` is called, the cells marked `'#'` form exactly the path that spells `word[0..k-1]`, so a cell already on the path can never match again; when the call returns, the board is exactly as it was when the call started.**",
    correct: "By induction on `L − k`. For `k = L` there is nothing left to match and the function is right to return `true`. For `k < L` a valid continuation must start at a cell that is on the board, holds `word[k]` and is not on the current path; the guard returns `false` otherwise. If the cell passes, any valid way to spell `word[k..]` from it must continue into one of its four neighbours for `word[k+1..]`, with this cell now forbidden: exactly what the recursive calls decide (each is correct by the induction hypothesis because the marked cell is excluded). The `||` returns `true` if and only if some neighbour succeeds. Restoring the letter afterwards makes the call leave no trace, so sibling branches and later start cells see the original board. The outer loop tries every start cell, so a spelling exists if and only if some start succeeds.",
  },

  cpp: `class Solution {
    int R, C;
    bool dfs(vector<vector<char>>& b, const string& w, int r, int c, int k) {
        if (k == (int)w.size()) return true;        // every letter matched //@done
        if (r < 0 || c < 0 || r >= R || c >= C || b[r][c] != w[k]) return false;   // off board or wrong letter //@check
        char keep = b[r][c];                        // remember the letter
        b[r][c] = '#';                              // mark: used on this path //@mark
        bool ok = dfs(b, w, r + 1, c, k + 1) || dfs(b, w, r - 1, c, k + 1)   // four neighbours //@explore
               || dfs(b, w, r, c + 1, k + 1) || dfs(b, w, r, c - 1, k + 1);
        b[r][c] = keep;                             // undo the mark //@undo
        return ok;
    }
public:
    bool exist(vector<vector<char>>& b, string w) {
        R = b.size(); C = b[0].size();              //@init
        for (int r = 0; r < R; r++)
            for (int c = 0; c < C; c++)
                if (dfs(b, w, r, c, 0)) return true;   // try every start //@start
        return false;                               //@none
    }
};`,
  js: `function exist(b, w) {
  const R = b.length, C = b[0].length;           //@init
  function dfs(r, c, k) {
    if (k === w.length) return true;             // every letter matched //@done
    if (r < 0 || c < 0 || r >= R || c >= C || b[r][c] !== w[k]) return false;   // off board or wrong letter //@check
    const keep = b[r][c];                        // remember the letter
    b[r][c] = "#";                               // mark: used on this path //@mark
    const ok = dfs(r + 1, c, k + 1) || dfs(r - 1, c, k + 1)   // four neighbours //@explore
            || dfs(r, c + 1, k + 1) || dfs(r, c - 1, k + 1);
    b[r][c] = keep;                              // undo the mark //@undo
    return ok;
  }
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (dfs(r, c, 0)) return true;             // try every start //@start
  return false;                                  //@none
}`,

  tests: [
    { name: "Example 1: ABCCED", kind: "normal", input: { board: [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], word: "ABCCED" } },
    { name: "Example 2: SEE", kind: "normal", input: { board: [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], word: "SEE" } },
    { name: "Example 3: ABCB (needs a cell twice)", kind: "normal", input: { board: [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], word: "ABCB" } },
    { name: "A dead end before the right path", kind: "normal", input: { board: [["a", "b", "c"], ["b", "x", "x"]], word: "abc" }, why: "From `a` the search tries *down* first: that `b` matches, but all of its neighbours fail. The search **backtracks** (un-marks that `b`) and then tries *right*, whose `b` leads to the `c`. Without the undo step the first `b` would stay blocked." },
    { name: "A single cell: match", kind: "edge", input: { board: [["a"]], word: "a" }, why: "`dfs(0, 0, 0)` matches the only letter, then `dfs(.., 1)` is called with `k == 1 == word.length` and returns `true` before touching the board (the neighbours are off-board but never inspected)." },
    { name: "A single cell: mismatch", kind: "edge", input: { board: [["a"]], word: "b" }, why: "The only cell holds the wrong letter, so `dfs` fails on its first check; after trying every start the answer is `false`." },
    { name: "The word is longer than the number of cells", kind: "edge", input: { board: [["a", "b"]], word: "aba" }, why: "`a → b → a` would need the first `a` twice. The first `a` is marked `'#'`, so the last step fails. The answer is `false` even though the letters are right next to each other." },
    { name: "Repeated letters, not enough cells", kind: "edge", input: { board: [["a", "a"], ["a", "a"]], word: "aaaaa" }, why: "Every cell is an `a`, but the word needs **five** distinct cells and there are four. All paths fail only at the last step, so this shows the full search space being explored and the marks being undone." },
    { name: "A path that turns at every step", kind: "edge", input: { board: [["a", "b"], ["d", "c"]], word: "abcd" }, why: "The spelling goes right, down, left: it runs around the 2 × 2 board. Each cell is entered from a different side, so all four directions are used somewhere." },
    { name: "Diagonal neighbours do not count", kind: "corner", input: { board: [["a", "x"], ["x", "b"]], word: "ab" }, why: "`a` and `b` touch only at a corner. Adjacency means a shared **edge**, and the search only moves in four directions, so the answer is `false`." },
    { name: "Found only from the last start cell", kind: "corner", input: { board: [["x", "y"], ["z", "a"]], word: "ay" }, why: "The first three starts fail at once (wrong first letter). Only the start at the bottom-right `a` finds the `y` above it. It shows why the outer loop must try every cell and not stop after the first." },
  ],

  trace(input, T) {
    const B = input.board.map((r) => r.slice()), word = input.word;
    const R = B.length, C = B[0].length, L = word.length;
    const used = new Set();
    const nodes = { root: { v: "•", kids: [], via: null } };
    let nid = 0;
    const path = [];          // [{r,c,id}]
    let sol = null;           // the path that spelled the word (kept on screen while the calls return)
    let whyMark = false, whyUndo = false, whyPrune = false, phased = false, solved = false;
    const key = (r, c) => r + "," + c;
    const shown = () => sol || path;
    const letters = () => shown().map((p) => B[p.r][p.c]);
    const S = (o = {}) => () => {
      const hl = {}, ghl = {};
      shown().forEach((p) => { hl[p.id] = solved ? "ok" : "win"; ghl[key(p.r, p.c)] = solved ? "ok" : "win"; });
      if (o.cur !== undefined) { hl[o.cur] = "cur"; }
      if (o.cell) ghl[key(o.cell[0], o.cell[1])] = "cur";
      if (o.probe) ghl[key(o.probe[0], o.probe[1])] = o.probeCls || "bad";
      return {
        dtree: { root: "root", nodes: JSON.parse(JSON.stringify(nodes)) }, hl,
        grid: { cells: B.map((r) => r.slice()), hl: ghl, title: `board  (word: “${word}”)`, note: o.gnote },
        treeLabel: "search tree  (one node = one matching cell; edge = direction)",
        path: letters(), pathLabel: `letters matched so far  (${shown().length} of ${L})`,
        regs: [{ k: "matched", v: `${shown().length} of ${L}`, cls: shown().length === L ? "ok" : "" }],
        note: o.note,
      };
    };
    const vars = (extra) => Object.assign({ path: letters().join("") || "∅" }, extra || {});
    const dirs = [[1, 0, "↓", "down"], [-1, 0, "↑", "up"], [0, 1, "→", "right"], [0, -1, "←", "left"]];
    function dfs(r, c, k, parent, via, from) {
      if (k === L) {
        T.step("done", { vars: vars({ k }), state: S({ cur: path.length ? path[path.length - 1].id : undefined }), say: `\`k\` = ${k} equals the word length ${L}: **every letter has been matched**. Return \`true\`.`, op: `k == ${L}  →  return true`, act: "ALL_MATCHED" });
        solved = true; sol = path.slice();
        return true;
      }
      const inB = r >= 0 && c >= 0 && r < R && c < C;
      const isUsed = inB && used.has(key(r, c));
      const match = inB && !isUsed && B[r][c] === word[k];
      const where = `(${r}, ${c})`;
      const reason = !inB ? `${where} is off the board` : isUsed ? `${where} is already on the path (it holds \`#\`)` : `${where} holds **${B[r][c]}**, but the word needs **${word[k]}**`;
      if (!match && !whyPrune && k > 0) { /* shown on the frame below */ }
      T.step("check", {
        vars: vars({ r, c, k, "needed": word[k] }),
        state: S({ cell: from, probe: inB ? [r, c] : undefined, probeCls: match ? "cur" : "bad", cur: path.length ? path[path.length - 1].id : undefined }),
        say: match ? `Cell ${where} holds **${B[r][c]}**, which is exactly the letter needed (\`word[${k}]\` = ${word[k]}). Keep going.` : `${reason}: this call **fails at once** and nothing below it is explored.`,
        op: match ? `b[${r}][${c}] == w[${k}]  →  ${B[r][c]} == ${word[k]}` : !inB ? `${where} out of the board  →  return false` : isUsed ? `b[${r}][${c}] is '#'  →  return false` : `b[${r}][${c}] != w[${k}]  →  ${B[r][c]} != ${word[k]}  →  return false`,
        act: match ? "MATCH" : "PRUNE",
        why: !match && !whyPrune && k > 0 ? { title: "Why stop at the first wrong letter?", text: "Every path that continues from a wrong letter is hopeless, however it carries on. Cutting the branch here removes the whole subtree below it without looking at it: this is the **pruning** that makes backtracking fast." } : null,
      });
      if (!match) { if (k > 0) whyPrune = true; return false; }
      if (!phased) { phased = true; T.phase("Follow the letters, backtrack at dead ends"); }
      const id = ++nid;
      nodes[id] = { v: B[r][c], kids: [], via };
      nodes[parent].kids.push(id);
      path.push({ r, c, id });
      used.add(key(r, c));
      T.step("mark", { vars: vars({ r, c, k }), state: S({ cur: id, gnote: "the code writes '#' into these cells" }), say: `Mark ${where} as used: save the letter \`${B[r][c]}\` and write \`#\` into the cell. No later step on this path can match it, because \`#\` is never a letter.`, op: `keep = b[${r}][${c}];  b[${r}][${c}] = '#'`, act: "MARK",
        why: whyMark ? null : { title: "Why mark the cell?", text: "The rules allow each cell only once per word. Writing `#` into the cell makes every later check on this path fail on it, with no extra `visited` table." } });
      whyMark = true;
      T.step("explore", { vars: vars({ r, c, k }), state: S({ cur: id }), say: k + 1 === L ? "This was the last letter: the four neighbour calls will immediately report that the word is complete." : `Now look for \`word[${k + 1}]\` = **${word[k + 1]}** in the four neighbours, in the order down, up, right, left. The first success stops the rest (\`||\`).`, op: "dfs(↓) || dfs(↑) || dfs(→) || dfs(←)", act: "EXPLORE" });
      let ok = false;
      for (const [dr, dc, ar] of dirs) { if (dfs(r + dr, c + dc, k + 1, id, ar, [r, c])) { ok = true; break; } }
      used.delete(key(r, c));
      T.step("undo", { vars: vars({ r, c, k }), state: S({ cur: id, cell: [r, c], note: ok ? undefined : "dead end: this cell is released for other paths" }), say: ok ? `A neighbour succeeded, so this call returns \`true\`. The cell ${where} is restored to \`${B[r][c]}\` on the way out.` : `No neighbour could continue the word from ${where}: this branch is a **dead end**. Restore the letter \`${B[r][c]}\` (backtrack) and return \`false\`.`, op: `b[${r}][${c}] = keep  →  return ${ok}`, act: ok ? "RETURN_TRUE" : "BACKTRACK",
        why: whyUndo || ok ? null : { title: "Why restore the letter?", text: "This cell may belong to a different path that the search has not tried yet (another direction, or another start). If the `#` stayed, those paths would wrongly see the cell as used." } });
      if (!ok) whyUndo = true;
      path.pop();
      nodes[id].cls = ok ? "ok" : "dim";
      return ok;
    }
    T.step("init", { vars: vars({ rows: R, cols: C }), state: S(), phase: "Try every cell as the start", say: `The board is ${R} × ${C}; the word “${word}” has ${L} letter${L === 1 ? "" : "s"}. The word could begin at any cell, so we try each one as a start.`, op: `R = ${R},  C = ${C}`, act: "START" });
    let found = false;
    outer: for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      T.step("start", { vars: vars({ r, c }), state: S({ cell: [r, c] }), say: `Try cell (${r}, ${c}) = **${B[r][c]}** as the first letter: call \`dfs(${r}, ${c}, 0)\`.`, op: `dfs(${r}, ${c}, 0)`, act: "TRY_START" });
      if (dfs(r, c, 0, "root", "", null)) { found = true; break outer; }
    }
    if (found) T.step("start", { vars: vars({ found: true }), state: S(), say: `\`dfs\` returned \`true\`: the word “${word}” exists. The path is highlighted on the board and in the search tree.`, op: "return true", act: "FOUND" });
    else T.step("none", { vars: vars({ found: false }), state: S(), say: `Every start cell was tried and none could spell “${word}”. Return \`false\`.`, op: "return false", act: "NOT_FOUND" });
    T.result(found);
  },
  fuzz(rnd) {
    const R = 1 + Math.floor(rnd() * 3), C = 1 + Math.floor(rnd() * 3), al = "abc";
    const board = Array.from({ length: R }, () => Array.from({ length: C }, () => al[Math.floor(rnd() * 3)]));
    const word = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => al[Math.floor(rnd() * 3)]).join("");
    return { board, word };
  },
  gen(n) { return { board: Array.from({ length: 5 }, () => new Array(5).fill("a")), word: "a".repeat(n) + "b" }; },

  complexity: {
    time: {
      tex: "O(mn \\cdot 3^L)", title: "at most mn starts, each exploring at most 4 · 3^(L−1) paths", short: "after the first step there are at most 3 unused neighbours",
      derive: [
        "N_{\\text{calls}}(\\text{one start}) \\le 1 + 4 + 4\\cdot 3 + \\dots + 4\\cdot 3^{L-1} || the first step has 4 choices, afterwards 3 (we cannot go back to the cell we came from, it is marked)",
        "1 + 4\\sum_{j=0}^{L-1} 3^{j} = 1 + 4\\cdot\\frac{3^{L}-1}{2} = 2\\cdot 3^{L} - 1 || a geometric series",
        "T(m,n,L) \\le mn \\cdot c\\,(2\\cdot 3^{L} - 1) || one such search from each of the $mn$ cells",
        "!T(m,n,L) = O(mn \\cdot 3^L) || exponential in the word length, linear in the board size",
      ],
      where: "Here $L$ is the length of the word and $mn$ the number of cells. The bound is reached when most letters match (a board full of the same letter and a word that fails only at the end). The measured table uses exactly that: a $5 \\times 5$ board of `a` and the word `a…ab`. Each extra letter multiplies the work by about **2.6**, at most 3, because the number of self-avoiding paths grows slightly slower than 3 per step.",
    },
    space: {
      tex: "O(L)", title: "the recursion stack (the marks are made in the board itself)", short: "at most L nested calls",
      derive: [
        "\\text{depth} \\le L \\;\\Rightarrow\\; S = L \\cdot s_{\\text{frame}} || one frame per matched letter",
        "!S = O(L) || the used-marks are written into the board and undone, so no `visited` table is needed",
      ],
      where: "A separate `visited` table would add $O(mn)$. Writing `#` into the board and restoring it is the standard way to avoid it (it needs a board that may be modified).",
    },
    limit: "The problem is a path search in a grid and no polynomial-time algorithm is known in general (it is related to Hamiltonian-path-type problems for long words); pruning helps in practice, but the worst-case time is exponential in $L$.",
    measure: { label: "L = number of letters that match before the failure (5 × 5 board of a)", fTex: "3^L", f: (n) => Math.pow(3, n), sizes: [3, 4, 5, 6, 7, 8], growth: "exponential in the word length", reading: "Each extra letter multiplies the work by roughly **2.6** (never more than 3): exponential growth in the length of the word." },
  },

  mistakes: [
    { title: "Forgetting to undo the mark", what: "Setting `b[r][c] = '#'` but never restoring it.", why: "The recursion seems to work on the first examples.", breaks: "After one failed path, the cells it used stay blocked, so later paths (and later start cells) cannot use them: a word that exists is reported missing.", avoid: "Restore the letter after the four recursive calls, whatever they returned." },
    { title: "Reusing a cell", what: "No used-mark at all.", why: "The adjacency rule seems to be enough.", breaks: "`board = [[\"a\", \"b\"]]`, `word = \"aba\"` is reported as found by walking `a → b → a` on the same two cells.", avoid: "Mark the cell on entry (or keep a `visited` table) and unmark on exit." },
    { title: "Trying only one start cell", what: "Calling `dfs(0, 0, 0)` once.", why: "The word \"starts at the top-left\" in the examples.", breaks: "Words that begin elsewhere are missed.", avoid: "Loop over every cell as a start, and stop only when one succeeds." },
    { title: "Checking the letter after recursing", what: "Calling the neighbours first and testing `b[r][c] == w[k]` afterwards.", why: "It seems symmetrical.", breaks: "The recursion explores wrong branches fully before rejecting them (back to the brute force), and may index outside the board.", avoid: "Check bounds and letter **first**; only then mark and recurse." },
    { title: "Using `&&` instead of `||` between the four calls", what: "`dfs(down) && dfs(up) && ...`.", why: "Mixing up \"all directions\" with \"any direction\".", breaks: "The result is true only if the word can continue in all four directions at once.", avoid: "`||`: any one successful direction is enough, and it stops the rest." },
  ],

  followUps: [
    {
      q: "The board must stay **read-only**. How do you mark the cells then?",
      a: "Keep a separate `visited[m][n]` table and set and clear `visited[r][c]` around the recursive calls exactly as the `#` was set and restored. The logic is identical; the price is $O(mn)$ extra space.",
      cpp: `bool existRO(const vector<vector<char>>& b, const string& w) {
    int R = b.size(), C = b[0].size();
    vector<vector<bool>> vis(R, vector<bool>(C, false));
    function<bool(int, int, int)> dfs = [&](int r, int c, int k) -> bool {
        if (k == (int)w.size()) return true;
        if (r < 0 || c < 0 || r >= R || c >= C || vis[r][c] || b[r][c] != w[k]) return false;
        vis[r][c] = true;
        bool ok = dfs(r + 1, c, k + 1) || dfs(r - 1, c, k + 1) || dfs(r, c + 1, k + 1) || dfs(r, c - 1, k + 1);
        vis[r][c] = false;
        return ok;
    };
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++)
            if (dfs(r, c, 0)) return true;
    return false;
}`,
      js: `function existRO(b, w) {
  const R = b.length, C = b[0].length;
  const vis = Array.from({ length: R }, () => new Array(C).fill(false));
  const dfs = (r, c, k) => {
    if (k === w.length) return true;
    if (r < 0 || c < 0 || r >= R || c >= C || vis[r][c] || b[r][c] !== w[k]) return false;
    vis[r][c] = true;
    const ok = dfs(r + 1, c, k + 1) || dfs(r - 1, c, k + 1) || dfs(r, c + 1, k + 1) || dfs(r, c - 1, k + 1);
    vis[r][c] = false;
    return ok;
  };
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (dfs(r, c, 0)) return true;
  return false;
}`,
      time: "O(mn · 3^L)", space: "O(mn + L)",
    },
    {
      q: "How can you **prune before searching** at all?",
      a: "Count the letters of the board once. If the word needs more of some letter than the board has, return `false` immediately. Also, if the first letter of the word is more common on the board than the last, search for the **reversed** word: fewer starts mean fewer searches. Neither changes the worst case, but both remove most of the work on typical tests.",
      time: "O(mn + search)", space: "O(1) for 52 letter counters",
    },
    {
      q: "Allow **diagonal** moves as well.",
      a: "Use eight directions instead of four. The number of unused neighbours after the first step becomes at most 7, so the bound becomes $O(mn \\cdot 7^L)$. Nothing else in the algorithm changes.",
      time: "O(mn · 7^L)", space: "O(L)",
    },
    {
      q: "Find **many words** in the board at once (Word Search II).",
      a: "Searching for each word separately repeats the same exploration. Build a **trie** of all the words and walk the board once: the DFS moves along the trie as it moves along the board, and prunes a branch the moment the current prefix is not in the trie. That is the next problem on the sheet (a trie of the words combined with this exact DFS).",
      time: "O(mn · 3^L)", space: "O(total letters in the words)",
    },
  ],

  related: [
    { id: "word-search-ii", why: "The same grid DFS, driven by a trie so that many words are searched in one sweep." },
    { id: "number-of-islands", why: "Another DFS on a grid, but with no undo: visited cells stay visited." },
    { id: "implement-trie-prefix-tree", why: "The data structure that makes the multi-word version fast." },
    { id: "combination-sum-iv", why: "Another problem where a counting recursion is made efficient: here by pruning, there by memoising." },
  ],
  patternNote: "**Backtracking = choose, explore, un-choose.** Make one choice (mark the cell), recurse to extend the partial answer, and undo the choice on the way back so the next candidate starts clean. Pair it with **early rejection** (a wrong letter ends the branch at once) and the exponential search tree shrinks to the few branches that can possibly succeed.",
  takeaways: [
    "Try every cell as a start; `dfs(r, c, k)` asks whether `word[k..]` can be spelled from `(r, c)`.",
    "Check bounds and `board[r][c] == word[k]` first: every mismatch **prunes** the whole branch.",
    "Mark the cell (`#`) before exploring and **restore it afterwards**: the undo is what makes backtracking correct.",
    "Four neighbours joined with `||`; diagonal cells are not adjacent.",
    "Time $O(mn \\cdot 3^L)$ in the worst case, space $O(L)$ for the recursion.",
  ],
});
