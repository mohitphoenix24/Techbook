SHEETS.define({
  id: "number-of-islands",
  viz: "matrix",
  io: { fn: "numIslands", params: [["grid", "char[][]"]], ret: "int", labels: { grid: "grid (rows of \"1\" land / \"0\" water)" } },

  statement: `You are given an \`m × n\` grid \`grid\` whose cells are the characters \`"1"\` (land) or \`"0"\` (water). Return the number of **islands**.

An island is a group of land cells connected **horizontally or vertically** (up, down, left, right; diagonals do **not** count). You may assume that everything outside the grid is water.`,
  examples: [
    { input: 'grid = [["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]', output: "1", explain: "All the land cells are connected to each other, so there is exactly one island." },
    { input: 'grid = [["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]', output: "3", explain: "The 2×2 block, the single cell in row 2 and the pair at the bottom right are three separate islands." },
  ],
  constraints: ["`m == grid.length`, `n == grid[i].length`", "$1 \\le m, n \\le 300$", "`grid[i][j]` is `'0'` or `'1'`."],

  intuition: {
    find: "How many separate **groups** of connected land cells there are. We are counting *groups*, not cells.",
    beginner: "For every land cell, run a complete search to find everything connected to it, and remember the *smallest cell index* of that group. Count how many different smallest indices there are.",
    works: "Two cells are in the same island exactly when a search from each reaches the same cells, so they share the same smallest index. Counting distinct indices counts the islands.",
    slow: "With $N = m \\cdot n$ cells, we run a full search (up to $N$ steps) from **every** land cell: $O(N^2)$. On a $300 \\times 300$ grid ($N = 90{,}000$) that is about 8 billion steps.",
    repeat: "When we search from one land cell we discover its whole island. Then we start again from the **next cell of the same island** and rediscover exactly the same cells. Each island is explored once per cell it contains.",
    remember: "Remember which cells we have already seen. Once an island has been explored, none of its cells should ever start a new search. (A neat trick: **turn each visited land cell into water**, so the grid itself is the memory.)",
    observation: "If we scan the grid cell by cell, the **first** time we meet an unvisited land cell, it must belong to a *brand new* island, because every cell of an older island was already marked. So: count it, then flood-fill (visit) the whole island so that we never count it again.",
    leads: "Loop over all cells. Whenever you find `'1'`: `count++`, then run DFS (or BFS) from it that marks every connected land cell as visited. Each cell is marked once and examined a constant number of times, so the total work is $O(m \\cdot n)$.",
  },

  flow: [
    "From every land cell run a full search; count distinct islands by their smallest cell.",
    "Cells in one island find the same set, so distinct results = islands.",
    "A full search from every land cell is $O(N^2)$ for $N = mn$ cells.",
    "Once an island is explored, its cells never need to start another search.",
    "Scan the grid; on the first unvisited land cell, `count++` and flood-fill its whole island.",
    "Each cell is marked once and checked a constant number of times: $O(mn)$.",
  ],

  brute: {
    idea: "**Brute force:** for every land cell, run a BFS with a **fresh** `visited` array to collect its island, and record the smallest cell index in it (`r * n + c`). The number of *distinct* smallest indices is the number of islands.",
    why: "Every cell of an island runs its own full search over that island, and each search allocates and clears a new `visited` array of size $N$. For a grid that is one big island of $N$ cells this is $N$ searches of $N$ steps: $O(N^2)$ with $N = mn$, i.e. $O((mn)^2)$.",
    time: "O((mn)^2)", space: "O(mn)",
    measure: { fTex: "n^4", f: (n) => Math.pow(n, 4), ns: [10, 30, 100, 300] },
    cpp: `class Solution {
public:
    int numIslands(vector<vector<char>>& grid) {
        int m = grid.size(), n = m ? grid[0].size() : 0;
        set<int> islands;                                    // smallest cell id of each island
        for (int r = 0; r < m; r++)
            for (int c = 0; c < n; c++) {
                if (grid[r][c] != '1') continue;
                vector<vector<bool>> seen(m, vector<bool>(n, false));   // fresh every time
                queue<pair<int,int>> q; q.push({r, c}); seen[r][c] = true;
                int smallest = r * n + c;
                while (!q.empty()) {
                    auto [x, y] = q.front(); q.pop();
                    smallest = min(smallest, x * n + y);
                    int dx[4] = {1, -1, 0, 0}, dy[4] = {0, 0, 1, -1};
                    for (int d = 0; d < 4; d++) {
                        int a = x + dx[d], b = y + dy[d];
                        if (a < 0 || b < 0 || a >= m || b >= n || grid[a][b] != '1' || seen[a][b]) continue;
                        seen[a][b] = true; q.push({a, b});
                    }
                }
                islands.insert(smallest);
            }
        return islands.size();
    }
};`,
    js: `function numIslands(grid) {
  const m = grid.length, n = m ? grid[0].length : 0;
  const islands = new Set();
  for (let r = 0; r < m; r++)
    for (let c = 0; c < n; c++) {
      if (grid[r][c] !== "1") continue;
      const seen = Array.from({ length: m }, () => new Array(n).fill(false));   // fresh every time
      const q = [[r, c]]; seen[r][c] = true;
      let smallest = r * n + c;
      for (let h = 0; h < q.length; h++) {
        const [x, y] = q[h];
        smallest = Math.min(smallest, x * n + y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = x + dx, b = y + dy;
          if (a < 0 || b < 0 || a >= m || b >= n || grid[a][b] !== "1" || seen[a][b]) continue;
          seen[a][b] = true; q.push([a, b]);
        }
      }
      islands.add(smallest);
    }
  return islands.size;
}`,
  },

  pattern: {
    name: "DFS Flood Fill",
    why: "A grid of land and water is secretly a **graph**: each land cell is a node and neighbouring land cells are connected by an edge. The question *\"how many islands?\"* is *\"how many connected components?\"*. The standard way to count components is to scan the nodes and, at each unvisited one, run a traversal (DFS or BFS) that visits the whole component: that traversal is called a **flood fill**.",
    recognize: [
      "A **grid** or graph where cells/nodes are connected to neighbours, and you must count, measure or label **connected groups**.",
      "Words like *island*, *region*, *component*, *connected*, *enclosed*, *flood*, *paint*.",
      "Each group should be processed **once**, and visiting one cell of a group means visiting all of it.",
      "A `visited` marker (a boolean array, or overwriting the input) is needed so no cell is processed twice.",
    ],
  },

  optimal: {
    idea: "Scan every cell. When you meet a `'1'`, that cell belongs to an island that has **not been counted yet** (all cells of earlier islands were erased). Count it, then run a DFS that turns every land cell connected to it into `'0'`. After the DFS returns, the entire island is gone, so the scan can never count it again.",
    steps: [
      "Set `count = 0`.",
      "Scan rows and columns. If `grid[r][c] == '1'`: `count++`, then call `dfs(r, c)`.",
      "`dfs(r, c)`: if the cell is outside the grid or not `'1'`, return (nothing to do).",
      "Otherwise sink the cell: `grid[r][c] = '0'` (so we never visit it again).",
      "Recurse into the four neighbours: down, up, right, left.",
      "After the scan, return `count`.",
    ],
    invariant: "**Every `'1'` still in the grid belongs to an island that has not been counted, and `count` is the number of islands already completely erased.** The DFS erases a whole island or nothing, so the invariant holds after every call.",
    correct: "*Each island is counted exactly once:* the first scanned cell of an island is found as `'1'` (nothing before it in the island was erased, since erasing only happens inside a DFS that started from an island cell, and a DFS erases *entire* islands), so it triggers `count++` and erases the full island. Every later cell of that island is `'0'` and does not trigger a count. *No island is missed:* a surviving `'1'` is eventually reached by the scan. *DFS erases the entire island:* by induction on the distance from the start cell, every land cell connected to it is reached, because each erased cell recurses into all of its four neighbours.",
  },

  cpp: `class Solution {
    void dfs(vector<vector<char>>& g, int r, int c) {
        if (r < 0 || c < 0 || r >= (int)g.size() || c >= (int)g[0].size() || g[r][c] != '1')   //@bounds
            return;
        g[r][c] = '0';                                   // sink it: now it is "visited" //@sink
        dfs(g, r + 1, c); dfs(g, r - 1, c);              //@recurse
        dfs(g, r, c + 1); dfs(g, r, c - 1);
    }
public:
    int numIslands(vector<vector<char>>& grid) {
        int count = 0;                                   //@init
        for (int r = 0; r < (int)grid.size(); r++)       //@loop
            for (int c = 0; c < (int)grid[0].size(); c++)
                if (grid[r][c] == '1') {                 //@scan
                    count++;                             // a new island //@count
                    dfs(grid, r, c);                     // erase all of it //@flood
                }
        return count;                                    //@ret
    }
};`,
  js: `function numIslands(grid) {
  const dfs = (r, c) => {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] !== "1")   //@bounds
      return;
    grid[r][c] = "0";                                  // sink it: now it is "visited" //@sink
    dfs(r + 1, c); dfs(r - 1, c);                      //@recurse
    dfs(r, c + 1); dfs(r, c - 1);
  };
  let count = 0;                                       //@init
  for (let r = 0; r < grid.length; r++)                //@loop
    for (let c = 0; c < grid[0].length; c++)
      if (grid[r][c] === "1") {                        //@scan
        count++;                                       // a new island //@count
        dfs(r, c);                                     // erase all of it //@flood
      }
  return count;                                        //@ret
}`,

  tests: [
    { name: "Example 1: one big island", kind: "normal", input: { grid: [["1", "1", "1", "1", "0"], ["1", "1", "0", "1", "0"], ["1", "1", "0", "0", "0"], ["0", "0", "0", "0", "0"]] } },
    { name: "Example 2: three islands", kind: "normal", input: { grid: [["1", "1", "0", "0", "0"], ["1", "1", "0", "0", "0"], ["0", "0", "1", "0", "0"], ["0", "0", "0", "1", "1"]] } },
    { name: "Two bays and a ring", kind: "normal", input: { grid: [["1", "0", "1", "1"], ["1", "0", "0", "1"], ["0", "1", "1", "1"]] } },
    { name: "Diagonals do not connect", kind: "edge", input: { grid: [["1", "0"], ["0", "1"]] }, why: "The two land cells touch only at a corner. The problem says islands connect **up, down, left, right** only, so this is **2** islands. A DFS that also tries the four diagonal neighbours would wrongly say 1." },
    { name: "A lake inside an island", kind: "edge", input: { grid: [["1", "1", "1"], ["1", "0", "1"], ["1", "1", "1"]] }, why: "The water cell in the middle does not create a second island: only land is counted. The ring of land is **one** connected island (all the cells reach each other around the lake)." },
    { name: "Checkerboard", kind: "edge", input: { grid: [["1", "0", "1"], ["0", "1", "0"], ["1", "0", "1"]] }, why: "Every land cell is isolated (its up/down/left/right neighbours are water), so the answer equals the number of land cells: **5**. It is the most islands a grid of this size can have." },
    { name: "All water", kind: "edge", input: { grid: [["0", "0"], ["0", "0"]] }, why: "No `'1'` is ever found, so `count` stays `0` and the DFS never runs. A solution that assumes at least one island would crash or return 1." },
    { name: "A single land cell", kind: "corner", input: { grid: [["1"]] }, why: "A 1×1 grid: all four neighbours are outside the grid. The bounds check must run **before** reading `grid[r][c]`, otherwise the DFS reads out of range." },
    { name: "A single row", kind: "corner", input: { grid: [["1", "0", "1", "1", "0", "1"]] }, why: "With one row, `up` and `down` are always out of bounds. The islands are the runs of consecutive `1`s: 3 of them." },
    { name: "A snake (deepest recursion)", kind: "corner", input: { grid: [["1", "1", "1", "1"], ["0", "0", "0", "1"], ["1", "1", "1", "1"], ["1", "0", "0", "0"], ["1", "1", "1", "1"]] }, why: "One long winding island of 15 cells: the DFS goes 15 calls deep before it starts returning. On a $300 \\times 300$ grid shaped like this, the recursion would be 90,000 deep and can overflow the stack, which is why an explicit queue/stack is sometimes used." },
  ],

  trace(input, T) {
    const g = input.grid.map((r) => r.slice());
    const R = g.length, C = R ? g[0].length : 0;
    const orig = input.grid;
    const vis = {};            // "r,c" -> island index
    const stack = []; let callId = 0;
    let count = 0, whyCount = false, whySink = false, whyDir = false;
    const cellsOf = () => g.map((row, r) => row.map((_, c) => orig[r][c]));
    const S = (o = {}) => () => {
      const hl = {};
      for (const k in vis) hl[k] = "isl" + (vis[k] % 6);
      if (o.scan) hl[o.scan[0] + "," + o.scan[1]] = "cur";
      if (o.cur) hl[o.cur[0] + "," + o.cur[1]] = "cur";
      if (o.cmp) hl[o.cmp[0] + "," + o.cmp[1]] = o.cmpCls || "cmp";
      return { cells: cellsOf(), hl, valCls: { 1: "land", 0: "water" }, stack: stack.map((s) => ({ t: s.t, id: s.id, cls: s.cls })), stackTitle: "DFS call stack", regs: [{ k: "islands counted", v: count, cls: "hit" }], note: o.note, numbered: true, title: "grid  (land = 1, water = 0)" };
    };
    const isl = () => count - 1;
    function dfs(r, c, from) {
      const id = callId++;
      const inB = r >= 0 && c >= 0 && r < R && c < C;
      const t = `(${r}, ${c})`;
      stack.push({ t, id, cls: "cmp" });
      const land = inB && g[r][c] === "1";
      const reason = !inB ? "off the grid" : g[r][c] === "0" ? (vis[r + "," + c] !== undefined ? "already visited (sunk)" : "water") : "land";
      T.step("bounds", {
        vars: { r, c, "stack depth": stack.length }, state: S({ cur: from || undefined, cmp: inB ? [r, c] : undefined, cmpCls: land ? "cmp" : "bad", note: !inB ? `${t} is outside the grid` : undefined }),
        say: land ? `\`dfs${t}\`: inside the grid, and the cell is **land** that has not been visited. Keep going.` : `\`dfs${t}\`: ${reason}, so there is nothing to explore. Return immediately.`,
        op: land ? `in bounds and g[${r}][${c}] == '1'  →  true` : !inB ? `${t} is out of bounds  →  return` : `g[${r}][${c}] != '1'  →  return`, act: land ? "LAND" : !inB ? "OFF_GRID" : "STOP",
      });
      if (!land) { stack.pop(); return; }
      g[r][c] = "0"; vis[r + "," + c] = isl();
      stack[stack.length - 1].cls = "cur";
      T.step("sink", {
        vars: { r, c, count }, state: S({ cur: [r, c] }), say: `Sink the cell: \`g[${r}][${c}] = '0'\`. It now belongs to island ${count} and will never be explored again, so the DFS cannot loop forever.`, op: `g[${r}][${c}] = '0'`, act: "SINK",
        why: whySink ? null : { title: "Why turn the land into water?", text: "That one assignment *is* the `visited` set. Without it, each cell would call its neighbours, which would call it back, forever. Sinking also guarantees the scan will not count this island again." },
      });
      whySink = true;
      T.step("recurse", { vars: { r, c }, state: S({ cur: [r, c] }), say: `Spread to the four neighbours of ${t}: **down, up, right, left**. Each call checks its own cell first.`, op: `dfs(r+1,c); dfs(r−1,c); dfs(r,c+1); dfs(r,c−1)`, act: "SPREAD",
        why: whyDir ? null : { title: "Why only four directions?", text: "The problem defines connection as sharing an **edge**. Diagonal cells touch only at a corner, so they are separate islands." } });
      whyDir = true;
      dfs(r + 1, c, [r, c]); dfs(r - 1, c, [r, c]); dfs(r, c + 1, [r, c]); dfs(r, c - 1, [r, c]);
      stack.pop();
    }
    T.step("init", { vars: { count: 0 }, state: S(), phase: "Scan the grid, flood-fill each new island", say: "We scan the grid cell by cell (row by row). Every time we meet **unvisited land**, we have found a new island; a flood fill will then erase it completely.", op: "count = 0", act: "START" });
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const isLand = g[r][c] === "1";
      T.step("scan", { vars: { r, c, count }, state: S({ scan: [r, c] }), say: isLand ? `Scan reaches (${r}, ${c}): **land that is not visited yet**. It cannot belong to an earlier island, because every cell of an earlier island was already sunk.` : orig[r][c] === "1" ? `Scan reaches (${r}, ${c}): land, but it was already visited by an earlier flood fill, so it is not a new island.` : `Scan reaches (${r}, ${c}): water. Skip it.`, op: `g[${r}][${c}] == '1'  →  ${isLand}`, act: isLand ? "NEW_LAND" : "SKIP" });
      if (isLand) {
        count++;
        T.step("count", { vars: { r, c, count }, state: S({ scan: [r, c] }), say: `New island! \`count\` becomes **${count}**.`, op: `count = ${count}`, act: "COUNT",
          why: whyCount ? null : { title: "Why is this guaranteed to be a NEW island?", text: "Every land cell of an island we already counted was erased by that island's flood fill. So any `'1'` we still see belongs to an island nobody has counted yet." } });
        whyCount = true;
        T.step("flood", { vars: { r, c, count }, state: S({ scan: [r, c] }), say: `Flood-fill from (${r}, ${c}): \`dfs(${r}, ${c})\` will visit **every** land cell connected to it.`, op: `dfs(grid, ${r}, ${c})`, act: "FLOOD" });
        dfs(r, c, null);
      }
    }
    T.step("ret", { vars: { count }, state: S(), say: `The scan is finished. Every island was counted once and erased: the answer is **${count}**.`, op: `return ${count}`, act: "DONE" });
    T.result(count);
  },
  fuzz(rnd) {
    const R = 1 + Math.floor(rnd() * 5), C = 1 + Math.floor(rnd() * 5), p = 0.25 + rnd() * 0.5;
    return { grid: Array.from({ length: R }, () => Array.from({ length: C }, () => (rnd() < p ? "1" : "0"))) };
  },
  gen(n) { return { grid: Array.from({ length: n }, () => Array.from({ length: n }, () => "1")) }; },

  complexity: {
    time: {
      tex: "O(m \\cdot n)", title: "every cell is scanned once and sunk at most once", short: "a bounded number of calls per cell",
      derive: [
        "T_{\\text{scan}} = m \\cdot n \\cdot c_1 || the double loop looks at each of the $mn$ cells exactly once",
        "L \\le mn \\;\\text{ land cells, each sunk once} || a cell is turned to `'0'` the first time dfs reaches it as land, and never reacts again",
        "\\text{dfs calls} \\le \\underbrace{L}_{\\text{starts}} \\cdot 1 + \\underbrace{4L}_{\\text{neighbour calls}} \\le 5mn || a sunk cell makes exactly 4 calls; calls on water/outside return at once in $O(1)$",
        "T(m,n) = c_1 mn + c_2 \\cdot 5mn = (c_1 + 5c_2)\\, mn || every call does $O(1)$ work besides its own recursive calls",
        "!T(m,n) = O(m \\cdot n) || linear in the number of cells",
      ],
      where: "The scan visits each cell once, and the DFS part does **not** multiply that cost: an island's cells are processed only by the *one* DFS that discovers it, because they are sunk immediately. Compare with the brute force, which re-explores an island once for each of its cells.",
    },
    space: {
      tex: "O(m \\cdot n)", title: "the recursion can go as deep as one island is large", short: "worst case: one snake-shaped island of mn cells",
      derive: [
        "S = \\text{max stack depth} \\cdot s_{\\text{frame}} || only the chain of calls currently open occupies memory",
        "\\text{depth} \\le \\text{size of the largest island} \\le mn || each open call is a different cell (cells are sunk before recursing, so none repeats)",
        "!S = O(m \\cdot n) \\text{ worst case} || a plain all-land grid or a snake; typical grids are far shallower",
      ],
      where: "The grid is modified **in place**, so there is no separate `visited` array (a boolean array would add another $mn$ cells). The cost is the recursion stack. A BFS with a queue needs $O(\\min(m, n))$ extra space on an all-land grid instead, because the queue holds only a frontier (see the follow-ups).",
    },
    limit: "Every cell has to be looked at at least once (a single unseen `'1'` could be an island of its own), so $\\Omega(mn)$ time is unavoidable. The DFS is optimal in time.",
    measure: { label: "n = side of an n × n grid (so mn = n²)", fTex: "n^2", f: (n) => n * n, sizes: [4, 8, 12, 16, 24, 32], growth: "quadratic in the side, i.e. linear in the number of cells", reading: "Doubling the side multiplies the work by about **4**, because the number of cells $n^2$ grows 4×: the work is **linear in the number of cells**." },
  },

  mistakes: [
    { title: "Not marking visited cells", what: "Calling the four neighbours without sinking (or marking) the current cell first.", why: "The recursive structure feels like it explores \"outward\" naturally.", breaks: "Cell A calls its neighbour B, which calls A again, forever: **infinite recursion** and a stack overflow. If you mark *after* the recursive calls, the same happens.", avoid: "Mark the cell **before** recursing: `g[r][c] = '0'` right after the bounds check." },
    { title: "Comparing the cell with the number `1` instead of the character `'1'`", what: "Writing `grid[r][c] == 1`.", why: "The cells look like numbers, but the grid is a `vector<vector<char>>`.", breaks: "In C++, `'1'` is the code 49, so `== 1` is never true: the count is always 0. In JS `\"1\" === 1` is false, with the same silent failure.", avoid: "Compare with `'1'` (C++) / `\"1\"` (JS), the type the problem gives you." },
    { title: "Reading the cell before checking the bounds", what: "`if (g[r][c] != '1' || r < 0 || …) return;`", why: "The conditions are all in the right place, just in the wrong *order*.", breaks: "`g[-1][c]` or `g[r][n]` is read **before** the bounds test can reject it: undefined behaviour (crash) in C++, `TypeError` in JS.", avoid: "Put the bounds checks first; `||` short-circuits, so the grid is only read when the indices are valid." },
    { title: "Counting inside the DFS instead of at the start", what: "Doing `count++` in every DFS call, or whenever a land cell is seen.", why: "Counting *\"each time we see land\"* feels natural.", breaks: "You count cells, not islands: a 5-cell island gives 5.", avoid: "Increment **once per island**: only in the scan loop, right before starting the flood fill." },
    { title: "Including diagonal neighbours", what: "Looping over all 8 neighbours.", why: "Habit from other grid problems (like Game of Life).", breaks: "Diagonally touching islands merge into one, so `[[\"1\",\"0\"],[\"0\",\"1\"]]` returns 1 instead of 2.", avoid: "Use exactly four directions: `(±1, 0)` and `(0, ±1)`." },
  ],

  followUps: [
    {
      q: "Do it with **BFS** and a queue instead of recursion. Why would you?",
      a: "Start the same scan. For each unvisited land cell, push it into a queue and mark it; repeatedly pop a cell and push its unvisited land neighbours (marking each *when it is pushed*). The queue replaces the call stack, so there is no risk of a stack overflow on huge islands, and the extra space is only the BFS frontier. The count and the complexity are the same: $O(mn)$ time.",
      cpp: `int numIslandsBFS(vector<vector<char>>& g) {
    int m = g.size(), n = g[0].size(), count = 0;
    for (int r = 0; r < m; r++)
        for (int c = 0; c < n; c++) {
            if (g[r][c] != '1') continue;
            count++;
            queue<pair<int,int>> q; q.push({r, c}); g[r][c] = '0';
            while (!q.empty()) {
                auto [x, y] = q.front(); q.pop();
                int dx[4] = {1, -1, 0, 0}, dy[4] = {0, 0, 1, -1};
                for (int d = 0; d < 4; d++) {
                    int a = x + dx[d], b = y + dy[d];
                    if (a >= 0 && b >= 0 && a < m && b < n && g[a][b] == '1') { g[a][b] = '0'; q.push({a, b}); }
                }
            }
        }
    return count;
}`,
      js: `function numIslandsBFS(g) {
  const m = g.length, n = g[0].length;
  let count = 0;
  for (let r = 0; r < m; r++)
    for (let c = 0; c < n; c++) {
      if (g[r][c] !== "1") continue;
      count++;
      const q = [[r, c]]; g[r][c] = "0";
      for (let h = 0; h < q.length; h++) {
        const [x, y] = q[h];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = x + dx, b = y + dy;
          if (a >= 0 && b >= 0 && a < m && b < n && g[a][b] === "1") { g[a][b] = "0"; q.push([a, b]); }
        }
      }
    }
  return count;
}`,
      time: "O(mn)", space: "O(min(m, n))",
    },
    {
      q: "You must **not modify** the input grid. What do you change?",
      a: "Use a separate `visited` matrix of booleans (same size as the grid) and check it in the bounds test. Time stays $O(mn)$, but space grows by $mn$ booleans. Alternatively, run the algorithm on a *copy*, or sink cells and **restore** them (turn them back into `'1'`) after counting, at the price of a second pass.",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Return the **area of the largest island** instead of the count.",
      a: "Let `dfs` return the number of cells it sinks: `1 + dfs(down) + dfs(up) + dfs(right) + dfs(left)` for land, `0` otherwise. Take the maximum over all starts. The traversal is identical; only what each call *returns* changes (the same trick as `maxDepth`: combine the answers of the sub-calls).",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Land is added **one cell at a time** and after each addition you must report the current number of islands. How would you do it?",
      a: "Re-running the flood fill after every addition would cost $O(mn)$ per update. Use **Union-Find** (disjoint sets) instead: each new land cell starts as its own island (`count++`) and is *unioned* with each land neighbour; every union that actually merges two different islands does `count--`. Each update costs almost $O(1)$ (inverse-Ackermann), so $k$ updates cost about $O(k)$.",
      time: "O(k·α(mn))", space: "O(mn)",
    },
  ],

  related: [
    { id: "pacific-atlantic-water-flow", why: "A grid flood fill again, but started from the *borders* and run twice, then intersected." },
    { id: "number-of-connected-components-in-an-undirected-graph", why: "The same \"count components with DFS\" idea on an explicit graph (adjacency list) instead of a grid." },
    { id: "clone-graph", why: "Another graph DFS that needs a `visited` memory (a hash map from old node to its copy)." },
    { id: "word-search", why: "A grid DFS where the visited mark is **undone** afterwards (backtracking): the cousin of this problem." },
  ],
  patternNote: "**The DFS Flood Fill pattern** turns \"count/measure the groups\" into: *scan; at each unvisited item, start a traversal that consumes its whole group; count one per traversal*. The two ingredients are a **visited mark** (so nothing is processed twice) and a **neighbour rule** (here: four directions). The same skeleton counts components in a graph, paints regions, and finds enclosed areas.",
  takeaways: [
    "A grid of land and water is a graph; islands are **connected components**.",
    "Scan every cell; on the first unvisited land cell, `count++` and **flood-fill** its whole island (DFS or BFS).",
    "Mark cells visited **before** recursing; sinking land to `'0'` is a free `visited` set.",
    "Bounds check first, then `'1'` check; only four directions (no diagonals); compare with the **character** `'1'`.",
    "Time $O(mn)$ (each cell handled a constant number of times), space $O(mn)$ for the recursion in the worst case.",
  ],
});
