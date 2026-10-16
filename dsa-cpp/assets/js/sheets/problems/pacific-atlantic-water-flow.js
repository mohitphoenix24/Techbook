SHEETS.define({
  id: "pacific-atlantic-water-flow",
  viz: "matrix",
  io: { fn: "pacificAtlantic", params: [["heights", "int[][]"]], ret: "int[][]", canon: "sort", labels: { heights: "heights (m × n matrix)" } },

  statement: `An \`m × n\` island has heights \`heights[r][c]\`. The **Pacific** ocean touches the island's **top and left** edges, and the **Atlantic** touches its **bottom and right** edges.

Rain falls on every cell. Water flows from a cell to a neighbouring cell (up, down, left, right) if the neighbour's height is **less than or equal** to its own, and a cell next to an ocean can flow into it. Return all cells \`[r, c]\` from which water can reach **both** oceans.`,
  examples: [
    { input: "heights = [[1,2,2,3,5],[3,2,3,4,4],[2,4,5,3,1],[6,7,1,4,5],[5,1,1,2,4]]", output: "[[0,4],[1,3],[1,4],[2,2],[3,0],[3,1],[4,0]]", explain: "For example `[2, 2]` (height 5) can flow left-up to the Pacific and right-down to the Atlantic." },
    { input: "heights = [[1]]", output: "[[0,0]]", explain: "The single cell touches both oceans." },
  ],
  constraints: ["`m == heights.length`, `n == heights[r].length`", "$1 \\le m, n \\le 200$", "$0 \\le$ `heights[r][c]` $\\le 10^5$"],
  check(input) {
    const h = input.heights;
    if (!h.length || h.some((r) => r.length !== h[0].length)) return "heights must be a non-empty rectangle of numbers";
    return h.length > 6 || h[0].length > 6 ? "for the animation use a grid of at most 6 × 6" : null;
  },
  judge(input, out, exp) {
    const norm = (t) => { try { return JSON.stringify(JSON.parse(t).map((x) => JSON.stringify(x)).sort()); } catch { return t; } };
    return { ok: norm(out) === norm(exp), note: "The order of the cells does not matter." };
  },

  intuition: {
    find: "Every cell from which **some** downhill-or-flat path leads off the island on the Pacific side **and** some (possibly different) such path leads off on the Atlantic side.",
    beginner: "For each cell, run a search that follows the water (to neighbours that are not higher) and see whether it can reach a Pacific border and an Atlantic border. Collect the cells for which both are true.",
    works: "It literally tests the definition for each cell, so every qualifying cell is found.",
    slow: "Each cell triggers a search that may visit the whole grid: $O((mn)^2)$. For a 200 × 200 island that is 1.6 billion steps.",
    repeat: "The searches from neighbouring cells overlap enormously. If water from cell A flows into B, then everything reachable from B is reachable from A too, yet each search rediscovers it.",
    remember: "**Reverse the question.** Instead of asking from each cell \"can I reach the ocean?\", start at the **ocean** and ask \"which cells can reach me?\". All such cells are discovered by a single flood fill per ocean.",
    observation: "Water flows *downhill (or flat)*, so reversing time it flows **uphill (or flat)**: from the Pacific border cells, walk to neighbours whose height is **greater or equal**; every cell reached can flow down to the Pacific. Do the same from the Atlantic border. The answer is the **intersection** of the two reached sets.",
    leads: "Two DFS flood fills: one seeded from all top-row and left-column cells (Pacific), one from all bottom-row and right-column cells (Atlantic), each moving to neighbours that are **not lower**. Return cells marked in both. Every cell is visited at most twice: $O(mn)$.",
  },

  flow: [
    "From every cell, search downhill for each ocean.",
    "It tests the definition literally, so it is correct.",
    "$O((mn)^2)$: the searches overlap massively.",
    "Reverse the viewpoint: start from the ocean and go **uphill**.",
    "One flood fill per ocean, seeded from its border, moving to cells that are not lower.",
    "Answer = cells reached by both: $O(mn)$ time and space.",
  ],

  brute: {
    idea: "**Brute force:** for each cell, run a DFS that moves to neighbours with height `≤` the current one, using a fresh `seen` array, and note whether it steps off the top/left edge (Pacific) and off the bottom/right edge (Atlantic). Keep the cell if both happened.",
    why: "Each of the $mn$ cells runs a search that can touch $O(mn)$ cells, so $O((mn)^2)$ in total. The searches share almost all their work: a cell that can reach the Pacific makes *every cell that flows into it* able to reach it too, but this approach rediscovers that for each start.",
    time: "O((mn)^2)", space: "O(mn)",
    measure: { fTex: "n^4", f: (n) => Math.pow(n, 4), ns: [10, 30, 100, 200] },
    cpp: `class Solution {
    int m, n;
    void go(vector<vector<int>>& h, int r, int c, vector<vector<bool>>& seen, bool& pac, bool& atl) {
        seen[r][c] = true;
        int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nc < 0) { pac = true; continue; }
            if (nr >= m || nc >= n) { atl = true; continue; }
            if (!seen[nr][nc] && h[nr][nc] <= h[r][c]) go(h, nr, nc, seen, pac, atl);
        }
    }
public:
    vector<vector<int>> pacificAtlantic(vector<vector<int>>& h) {
        m = h.size(); n = h[0].size();
        vector<vector<int>> res;
        for (int r = 0; r < m; r++)
            for (int c = 0; c < n; c++) {
                vector<vector<bool>> seen(m, vector<bool>(n, false));
                bool pac = false, atl = false;
                go(h, r, c, seen, pac, atl);
                if (pac && atl) res.push_back({r, c});
            }
        return res;
    }
};`,
    js: `function pacificAtlantic(h) {
  const m = h.length, n = h[0].length, res = [];
  for (let r = 0; r < m; r++)
    for (let c = 0; c < n; c++) {
      const seen = Array.from({ length: m }, () => new Array(n).fill(false));
      let pac = false, atl = false;
      const go = (x, y) => {
        seen[x][y] = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0) { pac = true; continue; }
          if (nx >= m || ny >= n) { atl = true; continue; }
          if (!seen[nx][ny] && h[nx][ny] <= h[x][y]) go(nx, ny);
        }
      };
      go(r, c);
      if (pac && atl) res.push([r, c]);
    }
  return res;
}`,
  },

  pattern: {
    name: "BFS/DFS (multi-source, reversed)",
    why: "Instead of one search per cell, start **one** search from *all* the border cells of an ocean at once (a *multi-source* flood fill) and walk the flow **in reverse** (uphill). Reversing the direction turns \"which cells can reach X?\" into \"which cells can X reach?\", which one traversal answers for every cell together.",
    recognize: [
      "A grid/graph question *\"which nodes can reach a target set?\"* asked for **every** node.",
      "Running a search from each node repeats work; the targets are few (a border, a set of exits).",
      "**Reverse the edges** (here: uphill instead of downhill) and search from the targets.",
      "You need the **intersection** of two reachability sets (two oceans, two conditions).",
    ],
  },

  optimal: {
    idea: "Make two boolean grids `pac` and `atl`. Flood-fill `pac` by starting a DFS from every cell in the first row and first column, and `atl` from every cell in the last row and last column. In each DFS move to a neighbour only if it is inside the grid, not yet marked, and **not lower** than the current cell (water could flow from it back down to here). The answer is every cell with `pac && atl`.",
    steps: [
      "Create `pac` and `atl`, both `m × n` of `false`.",
      "For each row `r`: `dfs(pac, r, 0)` and `dfs(atl, r, n − 1)` (left and right edges).",
      "For each column `c`: `dfs(pac, 0, c)` and `dfs(atl, m − 1, c)` (top and bottom edges).",
      "`dfs(seen, r, c)`: mark `seen[r][c]`; for each neighbour inside the grid, not yet seen, with `height ≥ current`: recurse.",
      "Return all `[r, c]` with `pac[r][c] && atl[r][c]`.",
    ],
    invariant: "**`pac[r][c]` is true exactly when water from `(r, c)` can flow to the Pacific; likewise for `atl`.** The flood fill only crosses to a neighbour that could send water back.",
    correct: "A border cell on the Pacific side flows into the ocean directly, so it is reachable. If a cell `B` can reach the ocean and a neighbour `A` has `height(A) ≥ height(B)`, then water can flow `A → B → …` to the ocean, so `A` can too. Conversely, any cell that can reach the ocean has a downhill/flat path ending at a border cell, and walking that path *backwards* is exactly a sequence of uphill/flat steps from the border: the DFS finds it. So the DFS marks precisely the cells that can reach the ocean. The intersection of the two sets is the required answer.",
  },

  cpp: `class Solution {
    int m, n;
    void dfs(vector<vector<int>>& h, vector<vector<bool>>& seen, int r, int c) {
        seen[r][c] = true;                                                    //@mark
        int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nc < 0 || nr >= m || nc >= n || seen[nr][nc] || h[nr][nc] < h[r][c]) continue;   // not lower //@skip
            dfs(h, seen, nr, nc);                                             //@go
        }
    }
public:
    vector<vector<int>> pacificAtlantic(vector<vector<int>>& h) {
        m = h.size(); n = h[0].size();
        vector<vector<bool>> pac(m, vector<bool>(n, false)), atl(m, vector<bool>(n, false));   //@init
        for (int r = 0; r < m; r++) { dfs(h, pac, r, 0); dfs(h, atl, r, n - 1); }   // left and right edges //@sideseeds
        for (int c = 0; c < n; c++) { dfs(h, pac, 0, c); dfs(h, atl, m - 1, c); }   // top and bottom edges //@topseeds
        vector<vector<int>> res;
        for (int r = 0; r < m; r++)                                           //@collect
            for (int c = 0; c < n; c++)
                if (pac[r][c] && atl[r][c]) res.push_back({r, c});
        return res;                                                           //@ret
    }
};`,
  js: `function pacificAtlantic(h) {
  const m = h.length, n = h[0].length;
  const dfs = (seen, r, c) => {
    seen[r][c] = true;                                                        //@mark
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= m || nc >= n || seen[nr][nc] || h[nr][nc] < h[r][c]) continue;   // not lower //@skip
      dfs(seen, nr, nc);                                                      //@go
    }
  };
  const pac = Array.from({ length: m }, () => new Array(n).fill(false));      //@init
  const atl = Array.from({ length: m }, () => new Array(n).fill(false));
  for (let r = 0; r < m; r++) { dfs(pac, r, 0); dfs(atl, r, n - 1); }         // left and right edges //@sideseeds
  for (let c = 0; c < n; c++) { dfs(pac, 0, c); dfs(atl, m - 1, c); }         // top and bottom edges //@topseeds
  const res = [];
  for (let r = 0; r < m; r++)                                                 //@collect
    for (let c = 0; c < n; c++) if (pac[r][c] && atl[r][c]) res.push([r, c]);
  return res;                                                                 //@ret
}`,

  tests: [
    { name: "Example 1: a 5 × 5 island", kind: "normal", input: { heights: [[1, 2, 2, 3, 5], [3, 2, 3, 4, 4], [2, 4, 5, 3, 1], [6, 7, 1, 4, 5], [5, 1, 1, 2, 4]] } },
    { name: "Example 2: one cell", kind: "normal", input: { heights: [[1]] } },
    { name: "A small hill", kind: "normal", input: { heights: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] } },
    { name: "A flat island", kind: "edge", input: { heights: [[2, 2], [2, 2]] }, why: "Water flows to neighbours of **equal** height (the rule is `≤`), so every cell reaches both oceans: all four cells are in the answer. A strict `<` rule (`h[nr][nc] <= h[r][c]` written the wrong way) would break this." },
    { name: "A single row", kind: "edge", input: { heights: [[1, 2, 3, 4]] }, why: "Every cell of a 1-row island touches both the top edge (Pacific) and the bottom edge (Atlantic), so all cells qualify. The seeds from the top and bottom rows coincide." },
    { name: "A single column", kind: "edge", input: { heights: [[3], [1], [2]] }, why: "Every cell touches both the left edge (Pacific) and the right edge (Atlantic), so all qualify, whatever the heights." },
    { name: "A valley in the middle", kind: "corner", input: { heights: [[5, 5, 5], [5, 1, 5], [5, 5, 5]] }, why: "The low centre cell (height 1) is surrounded by higher cells, so water from it can flow **nowhere**: it is a pit and reaches neither ocean. The eight ring cells all have height 5, so each can reach both oceans (equal heights flow freely). The answer is exactly the ring." },
    { name: "A staircase down to the sea", kind: "corner", input: { heights: [[9, 8, 7], [8, 7, 6], [7, 6, 5]] }, why: "Heights fall toward the bottom-right, so water everywhere reaches the Atlantic, but the Pacific is reachable only by flowing along the top row or left column. Only the five cells on the top row and the left column reach both oceans." },
  ],

  trace(input, T) {
    const h = input.heights, m = h.length, n = h[0].length;
    const pac = Array.from({ length: m }, () => new Array(n).fill(false)), atl = Array.from({ length: m }, () => new Array(n).fill(false));
    let which = null, curCell = null, skipShown = 0, whyUp = false, whyBoth = false, whyReverse = false;
    const hlOf = (g, o) => {
      const hl = {};
      for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if (g[r][c]) hl[r + "," + c] = o.final && pac[r][c] && atl[r][c] ? "hit" : "ok";
      return hl;
    };
    const S = (o = {}) => () => {
      const a = hlOf(pac, o), b = hlOf(atl, o);
      if (o.cell) (o.ocean === "pac" ? a : b)[o.cell[0] + "," + o.cell[1]] = "cur";
      if (o.nb) (o.ocean === "pac" ? a : b)[o.nb[0] + "," + o.nb[1]] = o.nbCls || "cmp";
      return { grids: [{ title: "Pacific: cells whose water reaches the Pacific (top + left)", cells: h, hl: a }, { title: "Atlantic: cells whose water reaches the Atlantic (bottom + right)", cells: h, hl: b }], numbered: true, cw: 38, ch: 34, size: 13, note: o.note };
    };
    T.step("init", { vars: { m, n }, state: S({ note: "both grids show the same heights; green = reached so far" }), phase: "Flood from the oceans, uphill", say: `Instead of asking from every cell "can I reach the ocean?", we start **at the ocean** and ask "which cells can send water here?". Water flows downhill, so going backwards we climb: move to a neighbour that is **not lower**. We do this once for each ocean.`, op: "pac = atl = all false", act: "START",
      why: { title: "Why start at the ocean?", text: "One flood fill from the whole coastline finds every cell that can reach it. Starting from each cell separately would repeat the same walks again and again." } });
    const visit = (g, r, c, ocean) => {
      g[r][c] = true;
      T.step("mark", { vars: { r, c, height: h[r][c], ocean: ocean === "pac" ? "Pacific" : "Atlantic" }, state: S({ cell: [r, c], ocean }), say: `${ocean === "pac" ? "Pacific" : "Atlantic"} flood reaches **(${r}, ${c})** (height ${h[r][c]}): water from here can flow to the ${ocean === "pac" ? "Pacific" : "Atlantic"}. Now try its four neighbours: any neighbour that is **not lower** can also flow into this cell.`, op: `seen[${r}][${c}] = true`, act: "MARK_REACHABLE" });
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= m || nc >= n || g[nr][nc]) { T.work(1); continue; }
        if (h[nr][nc] < h[r][c]) {
          if (skipShown < 2) {
            skipShown++;
            T.step("skip", { vars: { from: `(${r}, ${c}) = ${h[r][c]}`, neighbour: `(${nr}, ${nc}) = ${h[nr][nc]}` }, state: S({ cell: [r, c], ocean, nb: [nr, nc], nbCls: "bad" }), say: `Neighbour (${nr}, ${nc}) has height **${h[nr][nc]}**, lower than ${h[r][c]}. Water from it would flow *down* to here only if it were higher or equal, so it **cannot** reach the ocean through this cell. Skip it.`, op: `h[${nr}][${nc}] = ${h[nr][nc]} < ${h[r][c]}  ⇒  skip`, act: "TOO_LOW",
              why: whyUp ? null : { title: "Why must the neighbour be ≥ ?", text: "We are running the flow backwards. Water goes from a cell to a neighbour that is lower or equal. So a neighbour that can send water to this cell must itself be higher or equal." } });
            whyUp = true;
          } else T.work(1);
          continue;
        }
        visit(g, nr, nc, ocean);
      }
    };
    T.phase("Pacific flood: from the top row and the left column");
    for (let r = 0; r < m; r++) if (!pac[r][0]) visit(pac, r, 0, "pac");
    for (let c = 0; c < n; c++) if (!pac[0][c]) visit(pac, 0, c, "pac");
    T.step("sideseeds", { vars: {}, state: S({ note: "the Pacific flood is complete" }), say: "The **Pacific** flood is complete: green cells in the left grid can send water to the Pacific.", op: "pac done", act: "PACIFIC_DONE" });
    T.phase("Atlantic flood: from the bottom row and the right column");
    for (let r = 0; r < m; r++) if (!atl[r][n - 1]) visit(atl, r, n - 1, "atl");
    for (let c = 0; c < n; c++) if (!atl[m - 1][c]) visit(atl, m - 1, c, "atl");
    T.step("topseeds", { vars: {}, state: S({ note: "the Atlantic flood is complete" }), say: "The **Atlantic** flood is complete too. A cell qualifies if it is green in **both** grids.", op: "atl done", act: "ATLANTIC_DONE" });
    T.phase("Intersect");
    const res = [];
    for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if (pac[r][c] && atl[r][c]) res.push([r, c]);
    T.step("collect", { vars: { count: res.length }, state: S({ final: true, note: res.length ? `in both: ${res.map((p) => `(${p[0]},${p[1]})`).join(" ")}` : "no cell reaches both oceans" }), say: res.length ? `Cells green in **both** grids (blue now): **${res.map((p) => `(${p[0]}, ${p[1]})`).join(", ")}**. Water from each can reach both oceans.` : "No cell is reached by both floods, so the answer is empty.", op: "res = cells with pac && atl", act: "INTERSECT",
      why: whyBoth ? null : { title: "Why the intersection?", text: "The question wants cells that can reach **both** oceans. 'Reaches the Pacific' is the left grid, 'reaches the Atlantic' is the right grid, so both conditions together is the set of cells marked in both." } });
    T.step("ret", { vars: { count: res.length }, state: S({ final: true }), say: `Return **${JSON.stringify(res)}**. Each cell was visited at most once per ocean, so the whole thing took time proportional to the grid size.`, op: "return res", act: "DONE" });
    T.result(res);
  },
  fuzz(rnd) { const m = 1 + Math.floor(rnd() * 5), n = 1 + Math.floor(rnd() * 5); return { heights: Array.from({ length: m }, () => Array.from({ length: n }, () => Math.floor(rnd() * 6))) }; },
  gen(n) { return { heights: Array.from({ length: n }, () => new Array(n).fill(1)) }; },

  complexity: {
    time: {
      tex: "O(m \\cdot n)", title: "each cell is visited at most once per ocean", short: "at most 2mn visits, 4 neighbour checks each",
      derive: [
        "\\text{each DFS marks a cell the first time it reaches it, and never revisits a marked cell} \\;\\Rightarrow\\; \\le mn \\text{ visits per ocean} || the `seen` guard",
        "\\text{each visit examines 4 neighbours, each an } O(1) \\text{ test} || bounds, seen and height comparison",
        "T = 2 \\cdot mn \\cdot 4c + O(m + n) + O(mn) || two floods, plus the seeding and the final scan",
        "!T = O(m \\cdot n) || versus $O((mn)^2)$ for a search from every cell",
      ],
      where: "Each ocean's flood visits every cell at most once, no matter how many border cells seed it, because a cell that is already marked is never entered again. The measured table uses square flat grids ($m = n$, every cell reached), so steps grow with $n^2$.",
    },
    space: {
      tex: "O(m \\cdot n)", title: "two boolean grids and the recursion", short: "plus the output list",
      derive: [
        "S = 2mn \\text{ booleans} + \\text{stack depth} \\le mn || `pac`, `atl` and the DFS stack (worst case a snake-shaped climb)",
        "!S = O(m \\cdot n) || the result list is also at most $mn$ cells",
      ],
      where: "A BFS with a queue has the same worst-case size but avoids deep recursion on large grids (recursion depth up to $mn$ can overflow the stack for 200 × 200).",
    },
    limit: "Every cell's height must be read ($\\Omega(mn)$), so this is optimal.",
    measure: { label: "n = side of an n × n grid (flat island)", fTex: "n^2", f: (n) => n * n, sizes: [3, 4, 6, 8, 10, 12], growth: "quadratic in the side, i.e. linear in the number of cells", reading: "Doubling the side multiplies the work by about **4**: the work is linear in the number of cells." },
  },

  mistakes: [
    { title: "Flowing downhill from the ocean", what: "Moving to neighbours with `h[nr][nc] <= h[r][c]` in the flood fill.", why: "That is the direction the water flows in the story.", breaks: "You find the cells the ocean's water could *spread to*, not the cells that can *reach* the ocean: the answer is wrong.", avoid: "Run it **in reverse**: from the coast, move to neighbours that are **not lower** (`>=`)." },
    { title: "Using strict `>` instead of `>=`", what: "Skipping neighbours of equal height.", why: "\"uphill\" suggests strictly higher.", breaks: "Water flows along flat ground (`≤` in the statement), so flat cells must be reached too: a flat island returns too few cells.", avoid: "Reject only neighbours that are strictly **lower**: `h[nr][nc] < h[r][c]`." },
    { title: "Swapping which edges touch which ocean", what: "Seeding Pacific from the bottom/right.", why: "Mixing up the two oceans.", breaks: "The two grids are swapped, which for a symmetric input looks fine but breaks on others; the intersection is the same set, so the bug can hide.", avoid: "Pacific = top row + left column; Atlantic = bottom row + right column." },
    { title: "Using one `seen` grid for both oceans", what: "Sharing the visited array.", why: "Saving memory.", breaks: "A cell reached by the Pacific flood is then considered visited for the Atlantic flood and never marked for it.", avoid: "Two independent grids (`pac`, `atl`)." },
    { title: "Starting a search from every cell", what: "The per-cell DFS.", why: "It follows the problem statement.", breaks: "$O((mn)^2)$: too slow for 200 × 200.", avoid: "Reverse the search and flood from the coasts." },
  ],

  followUps: [
    {
      q: "Write the **BFS** version (iterative, with a queue).",
      a: "Seed a queue with *all* the border cells of an ocean (a *multi-source BFS*), mark them, and repeatedly pop a cell and push its unmarked neighbours that are not lower. No recursion, so no stack-overflow risk on big grids. $O(mn)$ time and space, run once per ocean.",
      cpp: `void floodBFS(vector<vector<int>>& h, vector<vector<bool>>& seen, queue<pair<int,int>> q) {
    int m = h.size(), n = h[0].size();
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nc < 0 || nr >= m || nc >= n || seen[nr][nc] || h[nr][nc] < h[r][c]) continue;
            seen[nr][nc] = true; q.push({nr, nc});
        }
    }
}`,
      js: `function floodBFS(h, seen, q) {
  const m = h.length, n = h[0].length;
  for (let i = 0; i < q.length; i++) {
    const [r, c] = q[i];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= m || nc >= n || seen[nr][nc] || h[nr][nc] < h[r][c]) continue;
      seen[nr][nc] = true; q.push([nr, nc]);
    }
  }
}`,
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "Water now flows only to **strictly lower** cells (flat ground blocks it). What changes?",
      a: "Reverse again: from the coast move to neighbours that are **strictly higher** (`h[nr][nc] > h[r][c]`), but note that border cells always reach their own ocean. Everything else (two floods and the intersection) stays. The strictness mostly matters on flat regions.",
      time: "O(mn)", space: "O(mn)",
    },
    {
      q: "There are **k oceans** (or exits). How do you find the cells that reach all of them?",
      a: "One flood fill per ocean ($k$ boolean grids), then intersect: $O(k \\cdot mn)$. To save memory use a single `int mask` per cell with one bit per ocean, setting bit $j$ during ocean $j$'s flood, and keep the cells whose mask equals `(1 << k) − 1`.",
      time: "O(k·mn)", space: "O(mn)",
    },
    {
      q: "How would you find the **minimum height** you would have to raise one cell to make it flow to both oceans?",
      a: "That becomes a shortest-path style problem (a *minimax / bottleneck path*): use Dijkstra from each ocean with the cost of a path being the **maximum** height step you must climb. It is a different problem, but it starts from the same reversed-search idea.",
      time: "O(mn log mn)", space: "O(mn)",
    },
  ],

  related: [
    { id: "number-of-islands", why: "Flood fill on a grid: the same DFS, with a different goal." },
    { id: "word-search", why: "Grid DFS with a more restrictive move rule and backtracking." },
    { id: "clone-graph", why: "DFS on a graph with a visited structure." },
    { id: "course-schedule", why: "Another \"reverse the edges / start from sources\" graph idea (in-degree zero nodes)." },
  ],
  patternNote: "**Multi-source reversed search:** when many starting points ask the same question (\"can I reach the target?\"), flip the problem and search *from the targets* along reversed edges. One traversal then answers for every node. Combine two such searches with an intersection for \"reach both\" questions.",
  takeaways: [
    "Don't search from each cell: **flood from the oceans** and walk the flow in reverse (uphill / not lower).",
    "Pacific seeds = top row + left column; Atlantic seeds = bottom row + right column; use a separate `seen` grid for each.",
    "Skip only neighbours that are **strictly lower** (`<`), because water flows along flat ground.",
    "Answer = cells marked in **both** grids.",
    "Time $O(mn)$ (each cell once per ocean), space $O(mn)$; use BFS if the recursion could be too deep.",
  ],
});
