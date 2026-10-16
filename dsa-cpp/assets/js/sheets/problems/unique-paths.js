SHEETS.define({
  id: "unique-paths",
  viz: "dp",
  io: { fn: "uniquePaths", params: [["m", "int"], ["n", "int"]], ret: "int", labels: { m: "m (rows)", n: "n (columns)" } },

  statement: `A robot starts at the **top-left** cell of an \`m × n\` grid and wants to reach the **bottom-right** cell. At each step it can move only **down** or **right**.

Return the number of **different paths** the robot can take.`,
  examples: [
    { input: "m = 3, n = 7", output: "28", explain: "There are 28 different down/right paths in a 3 × 7 grid." },
    { input: "m = 3, n = 2", output: "3", explain: "`right → down → down`, `down → down → right`, `down → right → down`." },
  ],
  constraints: ["$1 \\le m, n \\le 100$", "The answer is guaranteed to be at most $2 \\times 10^9$."],
  check(input) { return input.m < 1 || input.n < 1 || input.m > 12 || input.n > 12 ? "for the animation use m and n between 1 and 12" : null; },

  intuition: {
    find: "How many different sequences of **down** and **right** moves lead from the top-left to the bottom-right cell.",
    beginner: "Recursion: `paths(r, c)` = the number of ways to finish from cell `(r, c)`. From it you may go down or right, so `paths(r, c) = paths(r+1, c) + paths(r, c+1)`, and `paths = 1` when you are at the goal.",
    works: "Every path starts with either a down or a right move, so these two groups partition all paths and adding them is right.",
    slow: "Each call makes two calls: the call tree has about $\\binom{m+n-2}{m-1}$ leaves, which for a 100 × 100 grid is astronomically large.",
    repeat: "Many different routes pass through the **same cell**, and from that cell the number of ways to finish is always the same, yet we recompute it every time.",
    remember: "There are only `m × n` cells. Let `dp[r][c]` be the number of ways to reach cell `(r, c)` from the start; store it and reuse it.",
    observation: "The last move into cell `(r, c)` came **from above** `(r − 1, c)` or **from the left** `(r, c − 1)`. These are different, so `dp[r][c] = dp[r − 1][c] + dp[r][c − 1]`. The first row and the first column have a single path (all rights or all downs): `dp = 1`.",
    leads: "Fill the table row by row. Initialise the whole table with `1` (covers the first row and column), then for `r ≥ 1, c ≥ 1`: `dp[r][c] = dp[r−1][c] + dp[r][c−1]`. The answer is the bottom-right cell. $O(mn)$ time.",
  },

  flow: [
    "Recurse: from `(r, c)` go down or right, count both.",
    "Each path starts with down or right: two disjoint groups.",
    "A binomial-sized tree, re-solving the same cells again and again.",
    "Only $m \\times n$ cells; `dp[r][c]` = ways to reach that cell.",
    "It is entered from above or from the left: `dp[r][c] = dp[r−1][c] + dp[r][c−1]`.",
    "Fill the table: $O(mn)$ time and space (a single row suffices: $O(n)$).",
  ],

  brute: {
    idea: "**Brute force:** `paths(r, c)` returns `1` at the bottom-right cell, `0` if it steps outside the grid, and otherwise `paths(r + 1, c) + paths(r, c + 1)`.",
    why: "The recursion enumerates every path one by one: there are $\\binom{m+n-2}{m-1}$ of them (for 18 steps that is 48,620; for 198 steps it is about $10^{58}$). It also recomputes the count for each cell once **per path through it**, although only $mn$ distinct cells exist.",
    time: "O(2^(m+n))", space: "O(m+n)",
    measure: { fTex: "\\binom{2n}{n}", f: (n) => { let r = 1; for (let i = 1; i <= n; i++) r = (r * (n + i)) / i; return 2 * r; }, ns: [5, 10, 15, 20, 30] },
    cpp: `class Solution {
    int paths(int r, int c, int m, int n) {
        if (r >= m || c >= n) return 0;
        if (r == m - 1 && c == n - 1) return 1;
        return paths(r + 1, c, m, n) + paths(r, c + 1, m, n);
    }
public:
    int uniquePaths(int m, int n) { return paths(0, 0, m, n); }
};`,
    js: `function uniquePaths(m, n) {
  const paths = (r, c) => {
    if (r >= m || c >= n) return 0;
    if (r === m - 1 && c === n - 1) return 1;
    return paths(r + 1, c) + paths(r, c + 1);
  };
  return paths(0, 0);
}`,
  },

  pattern: {
    name: "Dynamic Programming (2D grid)",
    why: "A grid with moves in fixed directions creates a *directed acyclic* structure: each cell depends only on the cells that can reach it. That is a DP table with the same shape as the grid, filled in an order (top-to-bottom, left-to-right) that respects the dependencies.",
    recognize: [
      "A **grid** where you move in restricted directions (right/down) and count paths or minimise a cost.",
      "The answer for a cell depends only on its **top and left neighbours**.",
      "The recursive version re-solves the same cells for many different paths.",
      "A 2D table `dp[r][c]` with dimensions equal to the grid.",
    ],
  },

  optimal: {
    idea: "Let `dp[r][c]` be the number of paths from the top-left to cell `(r, c)`. The first row and column can only be reached in one way (all rights, or all downs), so they are 1. Every other cell is entered from above or from the left, so its count is the sum of those two cells' counts.",
    steps: [
      "Create an `m × n` table filled with `1` (the first row and column are 1).",
      "For `r` from `1` to `m − 1` and `c` from `1` to `n − 1`:",
      "set `dp[r][c] = dp[r − 1][c] + dp[r][c − 1]`.",
      "Return `dp[m − 1][n − 1]`.",
    ],
    invariant: "**When the loops reach `(r, c)`, `dp[r − 1][c]` and `dp[r][c − 1]` already hold the exact number of paths to those cells.**",
    correct: "Every path to `(r, c)` with `r, c ≥ 1` ends with a move from `(r − 1, c)` (a down step) or from `(r, c − 1)` (a right step), and these cases are disjoint. Removing the last step bijects the paths of each case with the paths to the earlier cell, so `dp[r][c] = dp[r − 1][c] + dp[r][c − 1]`. In the first row (or column) the only path is a straight line, so the count is 1. Row-major order guarantees both neighbours are computed before `(r, c)`.",
  },

  cpp: `class Solution {
public:
    int uniquePaths(int m, int n) {
        vector<vector<int>> dp(m, vector<int>(n, 1));     // first row/column = 1 //@init
        for (int r = 1; r < m; r++)                       //@loopr
            for (int c = 1; c < n; c++)                   //@loopc
                dp[r][c] = dp[r - 1][c] + dp[r][c - 1];   // from above + from left //@fill
        return dp[m - 1][n - 1];                          //@ret
    }
};`,
  js: `function uniquePaths(m, n) {
  const dp = Array.from({ length: m }, () => new Array(n).fill(1));   // first row/column = 1 //@init
  for (let r = 1; r < m; r++)                                         //@loopr
    for (let c = 1; c < n; c++)                                       //@loopc
      dp[r][c] = dp[r - 1][c] + dp[r][c - 1];                         // from above + from left //@fill
  return dp[m - 1][n - 1];                                            //@ret
}`,

  tests: [
    { name: "Example 1: 3 × 7", kind: "normal", input: { m: 3, n: 7 } },
    { name: "Example 2: 3 × 2", kind: "normal", input: { m: 3, n: 2 } },
    { name: "A square: 4 × 4", kind: "normal", input: { m: 4, n: 4 } },
    { name: "A single cell: 1 × 1", kind: "edge", input: { m: 1, n: 1 }, why: "Start and goal are the same cell: there is exactly **one** (empty) path. The loops never run, and the initial fill of 1 is already the answer." },
    { name: "A single row: 1 × 6", kind: "edge", input: { m: 1, n: 6 }, why: "Only right moves are possible, so exactly one path. The first row stays at 1 because it can only be entered from the left." },
    { name: "A single column: 6 × 1", kind: "edge", input: { m: 6, n: 1 }, why: "Only down moves are possible: one path. It confirms the first *column* is also initialised to 1." },
    { name: "Smallest grid with a choice: 2 × 2", kind: "corner", input: { m: 2, n: 2 }, why: "Exactly one cell, `(1, 1)`, is computed: `1 + 1 = 2` (down-then-right, or right-then-down). The smallest case where the recurrence is used." },
    { name: "Symmetry: 3 × 3 and the central binomial", kind: "corner", input: { m: 3, n: 3 }, why: "The answer 6 equals $\\binom{4}{2}$: every path is 2 downs and 2 rights in some order. The table is symmetric because swapping rows and columns is a mirror image of the grid." },
    { name: "A larger grid: 6 × 6", kind: "corner", input: { m: 6, n: 6 }, why: "The answer is 252 = $\\binom{10}{5}$. The table grows like Pascal's triangle rotated by 45 degrees." },
  ],

  trace(input, T) {
    const { m, n } = input;
    const dp = Array.from({ length: m }, () => Array.from({ length: n }, () => null));
    for (let r = 0; r < m; r++) dp[r][0] = 1;
    for (let c = 0; c < n; c++) dp[0][c] = 1;
    let whySum = false, whyEdge = false;
    const rowHead = Array.from({ length: m }, (_, i) => `r${i}`), colHead = Array.from({ length: n }, (_, i) => `c${i}`);
    const S = (cur, deps, o = {}) => () => {
      const hl = {};
      for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if (dp[r][c] !== null) hl[r + "," + c] = "ok";
      if (deps) deps.forEach((d) => (hl[d[0] + "," + d[1]] = "cmp"));
      if (cur) hl[cur[0] + "," + cur[1]] = "cur";
      if (o.answer) hl[(m - 1) + "," + (n - 1)] = "hit";
      return { dps: [{ label: "dp[r][c] = number of paths from the top-left to this cell", dp: dp.map((row) => row.slice()), hl, cur: cur || null, deps: deps || [], rowHead, colHead }], formula: o.formula };
    };
    const blank = Array.from({ length: m }, () => Array.from({ length: n }, () => null));
    T.step("init", { vars: { m, n }, state: () => ({ dps: [{ label: "dp[r][c] = number of paths from the top-left to this cell", dp: blank.map((r) => r.slice()), hl: {}, rowHead, colHead }] }), phase: "Set up the table", say: `We build a ${m} × ${n} table. \`dp[r][c]\` will be the number of down/right paths from the top-left cell to cell (r, c).`, op: `dp = ${m} × ${n} table`, act: "START" });
    T.step("init", { vars: { m, n }, state: S(null, null, { formula: "first row and first column: only ONE path (all rights / all downs)" }), say: "The **first row** can only be entered from the left and the **first column** only from above, so each of those cells has exactly **1** path. The code simply fills the whole table with 1 and overwrites the rest.", op: "dp[r][0] = dp[0][c] = 1", act: "EDGES_ARE_1",
      why: { title: "Why is every cell on the first row and column 1?", text: "To reach (0, c) you can only move right, c times: one path. To reach (r, 0) you can only move down, r times: one path. No choices means exactly one path." } });
    whyEdge = true;
    T.phase("Fill the table, row by row");
    for (let r = 1; r < m; r++) for (let c = 1; c < n; c++) {
      const up = dp[r - 1][c], left = dp[r][c - 1];
      dp[r][c] = up + left;
      T.step("fill", { vars: { r, c, "from above": up, "from left": left, "dp[r][c]": dp[r][c] }, state: S([r, c], [[r - 1, c], [r, c - 1]], { formula: `dp[${r}][${c}] = dp[${r - 1}][${c}] + dp[${r}][${c - 1}] = ${up} + ${left} = ${dp[r][c]}` }), say: `Cell (${r}, ${c}) is entered either from **above** (${up} paths reach it) or from the **left** (${left} paths). These routes are different, so add: **${dp[r][c]}**.`, op: `dp[${r}][${c}] = ${up} + ${left} = ${dp[r][c]}`, act: "ADD_ABOVE_AND_LEFT",
        why: whySum ? null : { title: "Why add the two neighbours?", text: "Every path to this cell has a last move: down (from the cell above) or right (from the cell on the left). Paths with different last moves are different paths, and every path has exactly one last move. So the counts add." } });
      whySum = true;
    }
    T.step("ret", { vars: { answer: dp[m - 1][n - 1] }, state: S(null, null, { answer: true, formula: `answer = dp[${m - 1}][${n - 1}] = ${dp[m - 1][n - 1]}` }), say: `The bottom-right cell holds the answer: there are **${dp[m - 1][n - 1]}** different paths.`, op: `return dp[${m - 1}][${n - 1}] = ${dp[m - 1][n - 1]}`, act: "DONE" });
    T.result(dp[m - 1][n - 1]);
  },
  fuzz(rnd) { return { m: 1 + Math.floor(rnd() * 7), n: 1 + Math.floor(rnd() * 7) }; },
  gen(n) { return { m: n, n }; },

  complexity: {
    time: {
      tex: "O(m \\cdot n)", title: "one constant-time addition per inner cell", short: "(m − 1)(n − 1) cells to fill",
      derive: [
        "\\#\\text{cells to compute} = (m-1)(n-1) || the first row and column are base cases",
        "T(m,n) = c_0 + \\sum_{r=1}^{m-1} \\sum_{c=1}^{n-1} c = c_0 + c\\,(m-1)(n-1) || each cell does one addition of two stored values",
        "!T(m,n) = O(m \\cdot n) || versus a recursion tree of $\\binom{m+n-2}{m-1}$ leaves",
      ],
      where: "A grid DP costs *(number of cells) × (work per cell)*. The measured table uses square grids ($m = n$): the number of steps grows with $n^2$, i.e. with the number of cells.",
    },
    space: {
      tex: "O(m \\cdot n)", title: "the full table", short: "reducible to O(n) with a single rolling row",
      derive: [
        "S(m,n) = m\\,n \\cdot s_{\\text{int}} || the table",
        "!S(m,n) = O(mn) \\;\\to\\; O(\\min(m,n)) \\text{ with one rolling row} || each row reads only the row above and its own left neighbour",
      ],
      where: "The recurrence only looks one row up, so keeping a single row (`row[c] += row[c − 1]`) is enough (follow-up).",
    },
    limit: "The answer has a closed form, $\\binom{m+n-2}{m-1}$, computable in $O(\\min(m, n))$ multiplications (follow-up), which is faster than filling the whole table.",
    measure: { label: "n = side of an n × n grid", fTex: "n^2", f: (n) => n * n, sizes: [4, 8, 12, 16, 24, 32], growth: "quadratic in the side, i.e. linear in the number of cells", reading: "Doubling the side multiplies the work by about **4**: the work is linear in the number of cells." },
  },

  mistakes: [
    { title: "Not initialising the first row and column to 1", what: "A table of zeros with only `dp[0][0] = 1`.", why: "Treating the edges like the interior.", breaks: "The recurrence adds a cell that is out of the table or 0, so every edge cell stays 0 and the answer is 0 for any grid with more than one cell.", avoid: "Fill the whole table with 1: edges can only be reached one way." },
    { title: "Swapping `m` and `n`", what: "Allocating `dp[n][m]` or iterating with the wrong bounds.", why: "\"rows × columns\" vs \"width × height\".", breaks: "The answer is symmetric ($\\binom{m+n-2}{m-1} = \\binom{m+n-2}{n-1}$), so the bug is invisible on this problem, but the table may read out of bounds on a rectangular grid.", avoid: "`m` rows, `n` columns, `dp[m][n]`." },
    { title: "Starting the loops at 0", what: "`for (r = 0; …) for (c = 0; …) dp[r][c] = dp[r−1][c] + dp[r][c−1];`", why: "Uniform loop bounds look neater.", breaks: "`dp[−1][c]` and `dp[r][−1]` are out of bounds: undefined behaviour in C++.", avoid: "Start at 1 (the edges are base cases)." },
    { title: "Integer overflow on big grids", what: "Using `int` for a 100 × 100 grid.", why: "The statement guarantees the answer fits in $2 \\times 10^9$, so it seems safe.", breaks: "Intermediate cells are *smaller* than the answer here (the table grows toward the corner), so it works; but in a variant without the guarantee `int` overflows quickly.", avoid: "Know that the count is $\\binom{m+n-2}{m-1}$, which grows fast: use `long long`/big integers if the limits are larger." },
    { title: "Plain recursion", what: "The two-call recursion without memo.", why: "It is the direct statement of the problem.", breaks: "Exponential: a 17 × 17 grid already takes seconds.", avoid: "Memoise or fill the table." },
  ],

  followUps: [
    {
      q: "Reduce the space to a **single row**.",
      a: "Row `r` depends only on row `r − 1` (the cell above) and the cell to its left in the same row. Keep one row `row[0..n−1]` initialised to 1 and update it in place: `row[c] += row[c − 1]` (here `row[c]` before the update is the value from above, `row[c − 1]` after the update is the left cell). Space becomes $O(n)$ (or $O(\\min(m, n))$ by choosing the shorter side).",
      cpp: `int uniquePathsRow(int m, int n) {
    vector<int> row(n, 1);
    for (int r = 1; r < m; r++)
        for (int c = 1; c < n; c++) row[c] += row[c - 1];
    return row[n - 1];
}`,
      js: `function uniquePathsRow(m, n) {
  const row = new Array(n).fill(1);
  for (let r = 1; r < m; r++)
    for (let c = 1; c < n; c++) row[c] += row[c - 1];
  return row[n - 1];
}`,
      time: "O(mn)", space: "O(n)",
    },
    {
      q: "Use **combinatorics**: is there a closed form?",
      a: "Every path consists of exactly `m − 1` down moves and `n − 1` right moves in some order, so the number of paths is the number of ways to choose which of the `m + n − 2` moves are the downs: $\\binom{m+n-2}{m-1}$. Compute it with a loop that multiplies and divides alternately (`res = res * (N − k + i) / i`), $O(\\min(m, n))$ time and $O(1)$ space. The multiply-then-divide order keeps every intermediate value an exact integer.",
      cpp: `long long uniquePathsFormula(int m, int n) {
    int N = m + n - 2, k = min(m, n) - 1;
    long long res = 1;
    for (int i = 1; i <= k; i++) res = res * (N - k + i) / i;   // exact at every step
    return res;
}`,
      js: `function uniquePathsFormula(m, n) {
  const N = m + n - 2, k = Math.min(m, n) - 1;
  let res = 1;
  for (let i = 1; i <= k; i++) res = (res * (N - k + i)) / i;   // exact at every step
  return res;
}`,
      time: "O(min(m,n))", space: "O(1)",
    },
    {
      q: "Some cells are **obstacles** (*Unique Paths II*). How does the table change?",
      a: "An obstacle cell has `dp = 0` (no path can pass through it). Everything else uses the same sum. The first row and column are no longer all 1: they stay 1 only until the first obstacle, and are 0 after it. Handle the edges inside the same loop by treating out-of-bounds as 0. Time $O(mn)$.",
      time: "O(mn)", space: "O(n)",
    },
    {
      q: "Find the path with the **minimum sum** of cell values instead of counting paths (*Minimum Path Sum*).",
      a: "Same table, different operation: `dp[r][c] = grid[r][c] + min(dp[r − 1][c], dp[r][c − 1])`, with the first row/column being running sums. It shows how the same DP skeleton answers *count*, *feasibility* and *optimise* questions.",
      time: "O(mn)", space: "O(n)",
    },
  ],

  related: [
    { id: "climbing-stairs", why: "The 1D ancestor: `dp[i] = dp[i − 1] + dp[i − 2]` counts ways by the last move." },
    { id: "longest-common-subsequence", why: "Another 2D table where each cell depends on its top, left and top-left neighbours." },
    { id: "coin-change", why: "A 1D table where each cell is combined from earlier cells." },
    { id: "number-of-islands", why: "Also a grid, but traversed with DFS/BFS instead of a DP table." },
  ],
  patternNote: "**The 2D grid DP** gives each cell the answer to *\"the best/number/feasibility for the sub-problem ending here\"*, computed from the neighbours that can lead into it, in an order where those neighbours are already known. Counting uses `+`, optimising uses `min`/`max`, feasibility uses `or`.",
  takeaways: [
    "`dp[r][c]` = paths from the top-left to `(r, c)`; entered from above or from the left: `dp[r][c] = dp[r−1][c] + dp[r][c−1]`.",
    "First row and column are **1** (one way to reach them); fill row by row.",
    "Time $O(mn)$, space $O(mn)$ → $O(n)$ with one row; closed form $\\binom{m+n-2}{m-1}$ in $O(\\min(m,n))$.",
    "Obstacles set a cell to 0; costs change `+` to `min`.",
    "Plain recursion enumerates every path: exponential.",
  ],
});
