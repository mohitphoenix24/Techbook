SHEETS.define({
  id: "spiral-matrix",
  viz: "matrix",
  io: { fn: "spiralOrder", params: [["matrix", "int[][]"]], ret: "int[]", labels: { matrix: "matrix (rows of integers)" } },
  legend: [["cur", "cell being read"], ["ok", "already in the output"], ["win", "block still to be read"]],

  statement: `Given an \`m x n\` \`matrix\`, return **all elements of the matrix in spiral order**: start at the top-left corner, go right along the top row, then down the last column, then left along the bottom row, then up the first column, and keep spiralling inwards.`,
  examples: [
    { input: "matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]", output: "[1, 2, 3, 6, 9, 8, 7, 4, 5]", explain: "Right along the top (1, 2, 3), down the right side (6, 9), left along the bottom (8, 7), up the left side (4), then the centre (5)." },
    { input: "matrix = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]", output: "[1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]", explain: "A rectangle: the outer ring first, then the inner row 6, 7." },
  ],
  constraints: ["`m == matrix.length`, `n == matrix[i].length`", "$1 \\le m, n \\le 10$", "$-100 \\le$ `matrix[i][j]` $\\le 100$"],
  check(input) {
    const m = input.matrix;
    if (!m.length || !m[0].length) return "the matrix needs at least one row and one column";
    if (m.some((r) => r.length !== m[0].length)) return "every row must have the same length";
    if (m.length > 6 || m[0].length > 6) return "for the animation use at most 6 rows and 6 columns";
    if (m.some((r) => r.some((v) => Math.abs(v) > 99))) return "keep the values between -99 and 99";
    return null;
  },

  intuition: {
    find: "Every cell exactly once, in the order a spiral visits them. There is no calculation: the whole problem is **bookkeeping** of where we are and when to turn.",
    beginner: "Walk like a robot: start at the top-left facing right. Keep a `seen` table. Move forward while the next cell exists and is unseen; otherwise turn right (clockwise) and continue.",
    works: "A robot that always turns right when blocked traces exactly the spiral, and the `seen` table guarantees no cell is read twice.",
    slow: "Time is already optimal, $O(mn)$, but the `seen` table costs $O(mn)$ **extra memory** and each step does a bounds check *and* a table lookup. There is a neater way: remember the **edges** instead of the visited cells.",
    repeat: "Nothing is computed twice. But the table stores one bit for each cell, when four numbers (the current boundaries) describe everything that is already done.",
    remember: "After the top row is read, the whole row is finished and can be forgotten: the unread cells are again a rectangle, one row smaller. The same holds after the right column, the bottom row and the left column.",
    observation: "Keep four boundaries `top`, `bottom`, `left`, `right` that enclose the **cells not yet read**. Read the top row left to right and move `top` down; read the right column top to bottom and move `right` left; read the bottom row right to left and move `bottom` up; read the left column bottom to top and move `left` right. Repeat while the rectangle is not empty. The last two sides need a **guard** because the rectangle may already have shrunk to a single row or column.",
    leads: "`while (top <= bottom && left <= right)`: read the four sides, shrinking the matching boundary after each. Guard the bottom side with `top <= bottom` and the left side with `left <= right`, so a single remaining row or column is not read twice.",
  },

  flow: [
    "Simulate a robot that turns right at walls and visited cells.",
    "Turning when blocked traces the spiral; the `seen` table prevents repeats.",
    "$O(mn)$ time but $O(mn)$ extra memory for `seen`.",
    "After a side is read it is finished: the rest is a smaller rectangle.",
    "Four boundaries describe the unread rectangle; read a side, move that boundary.",
    "Guard the last two sides for single rows or columns: $O(mn)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Simulation with a visited table:** start at `(0, 0)` facing right. Read the cell and mark it as seen. Try to step forward; if the next cell is outside the matrix or already seen, turn 90° clockwise first. Repeat $m \\cdot n$ times.",
    why: "It does the right amount of work in time, $O(mn)$, but needs an $m \\times n$ `seen` table: $O(mn)$ extra memory. It also repeats a bounds check and a table lookup on every single step.",
    time: "O(mn)", space: "O(mn)",
    cpp: `class Solution {
public:
    vector<int> spiralOrder(vector<vector<int>>& m) {
        int R = m.size(), C = m[0].size();
        vector<vector<bool>> seen(R, vector<bool>(C, false));
        int dr[4] = {0, 1, 0, -1}, dc[4] = {1, 0, -1, 0};
        vector<int> out;
        int r = 0, c = 0, d = 0;
        for (int k = 0; k < R * C; k++) {
            out.push_back(m[r][c]);
            seen[r][c] = true;
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nr >= R || nc < 0 || nc >= C || seen[nr][nc]) {
                d = (d + 1) % 4;
                nr = r + dr[d]; nc = c + dc[d];
            }
            r = nr; c = nc;
        }
        return out;
    }
};`,
    js: `function spiralOrder(m) {
  const R = m.length, C = m[0].length;
  const seen = Array.from({ length: R }, () => new Array(C).fill(false));
  const dr = [0, 1, 0, -1], dc = [1, 0, -1, 0];
  const out = [];
  let r = 0, c = 0, d = 0;
  for (let k = 0; k < R * C; k++) {
    out.push(m[r][c]);
    seen[r][c] = true;
    let nr = r + dr[d], nc = c + dc[d];
    if (nr < 0 || nr >= R || nc < 0 || nc >= C || seen[nr][nc]) {
      d = (d + 1) % 4;
      nr = r + dr[d]; nc = c + dc[d];
    }
    r = nr; c = nc;
  }
  return out;
}`,
  },

  pattern: {
    name: "Matrix (boundary simulation)",
    why: "Walking a matrix in an unusual order (spiral, zig-zag, diagonals) is best done by keeping the **boundaries of what is left** instead of marking what is done. Four integers replace a whole table, and the loop mirrors the picture: one side per step.",
    recognize: [
      "The matrix must be traversed in a **fixed geometric pattern** (spiral, layers, diagonals).",
      "A visited table works but you want $O(1)$ extra space.",
      "The region left to process is always a **rectangle** that shrinks after each side.",
      "Single-row and single-column inputs must not produce duplicates (needs guards).",
    ],
  },

  optimal: {
    idea: "Keep four boundaries `top`, `bottom`, `left`, `right` around the cells that are not yet read. Read the top row (then `top++`), the right column (then `right--`), the bottom row if one is left (then `bottom--`), and the left column if one is left (then `left++`). Repeat until the rectangle is empty.",
    steps: [
      "Set `top = 0`, `bottom = m − 1`, `left = 0`, `right = n − 1`.",
      "While `top ≤ bottom` and `left ≤ right`: read row `top` from `left` to `right`, then `top++`.",
      "Read column `right` from `top` to `bottom`, then `right--`.",
      "If `top ≤ bottom`: read row `bottom` from `right` down to `left`, then `bottom--`.",
      "If `left ≤ right`: read column `left` from `bottom` up to `top`, then `left++`.",
      "When the loop ends, return the collected list.",
    ],
    invariant: "**The cells with `top ≤ row ≤ bottom` and `left ≤ col ≤ right` are exactly the cells not yet in the output, and everything before them in the spiral has been appended in order.**",
    correct: "Initially the rectangle is the whole matrix. In each round the first cells of the spiral inside the rectangle are, in order, its top row, then its right column (below the top row), then its bottom row (right to left, left of the right column) and finally its left column (bottom to top, between the top and bottom rows). Reading them and moving the four boundaries inwards leaves exactly the inner rectangle unread, so the invariant is kept. The two guards (`top ≤ bottom`, `left ≤ right`) stop the bottom row or the left column from being read when the rectangle has shrunk to a single row or column, whose cells were already read by the top row or the right column. Each round removes at least one row or column, so the loop ends, and every cell is read exactly once.",
  },

  cpp: `class Solution {
public:
    vector<int> spiralOrder(vector<vector<int>>& m) {
        vector<int> out;
        int top = 0, bottom = m.size() - 1;     //@init
        int left = 0, right = m[0].size() - 1;
        while (top <= bottom && left <= right) {     //@loop
            for (int j = left; j <= right; j++) out.push_back(m[top][j]);        // → along the top //@top
            top++;                              //@topdone
            for (int i = top; i <= bottom; i++) out.push_back(m[i][right]);      // ↓ down the right //@right
            right--;                            //@rightdone
            if (top <= bottom) {                // a bottom row is left? //@botcheck
                for (int j = right; j >= left; j--) out.push_back(m[bottom][j]); // ← along the bottom //@bottom
                bottom--;                       //@botdone
            }
            if (left <= right) {                // a left column is left? //@leftcheck
                for (int i = bottom; i >= top; i--) out.push_back(m[i][left]);   // ↑ up the left //@left
                left++;                         //@leftdone
            }
        }
        return out;                             //@ret
    }
};`,
  js: `function spiralOrder(m) {
  const out = [];
  let top = 0, bottom = m.length - 1;    //@init
  let left = 0, right = m[0].length - 1;
  while (top <= bottom && left <= right) {     //@loop
    for (let j = left; j <= right; j++) out.push(m[top][j]);        // → along the top //@top
    top++;                               //@topdone
    for (let i = top; i <= bottom; i++) out.push(m[i][right]);      // ↓ down the right //@right
    right--;                             //@rightdone
    if (top <= bottom) {                 // a bottom row is left? //@botcheck
      for (let j = right; j >= left; j--) out.push(m[bottom][j]);   // ← along the bottom //@bottom
      bottom--;                          //@botdone
    }
    if (left <= right) {                 // a left column is left? //@leftcheck
      for (let i = bottom; i >= top; i--) out.push(m[i][left]);     // ↑ up the left //@left
      left++;                            //@leftdone
    }
  }
  return out;                            //@ret
}`,

  tests: [
    { name: "Example 1: a 3 × 3 matrix", kind: "normal", input: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] } },
    { name: "Example 2: a 3 × 4 rectangle", kind: "normal", input: { matrix: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] } },
    { name: "A 4 × 4 square (two rings)", kind: "normal", input: { matrix: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]] } },
    { name: "A single cell", kind: "edge", input: { matrix: [[7]] }, why: "The first round reads the only cell in the top row. Then `top++` makes `top > bottom`, the right-column loop is empty, and both guards are false. Without the guards the cell could be read again." },
    { name: "A single row", kind: "edge", input: { matrix: [[1, 2, 3, 4]] }, why: "The top row reads everything. After `top++`, `top > bottom`, so the **bottom-row guard** prevents reading the same row backwards: without `if (top <= bottom)` the output would be `[1,2,3,4,3,2,1]` (duplicates)." },
    { name: "A single column", kind: "edge", input: { matrix: [[1], [2], [3]] }, why: "The top row reads `1`; the right column reads `2, 3`. Then `right--` makes `right < left`, so the **left-column guard** stops the left column from being read upwards again (which would duplicate `3, 2`)." },
    { name: "A 2 × 2 matrix", kind: "edge", input: { matrix: [[1, 2], [3, 4]] }, why: "One full ring and nothing inside: right `1, 2`, down `4`, left `3`. After the ring `top > bottom` and `left > right`, so the loop ends cleanly." },
    { name: "Tall and thin (4 × 2)", kind: "corner", input: { matrix: [[1, 2], [3, 4], [5, 6], [7, 8]] }, why: "After the first ring the leftover rectangle is empty even though the matrix is not square. The final left-column read walks *up* from the bottom: `5, 3`." },
    { name: "Short and wide (2 × 5)", kind: "corner", input: { matrix: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]] }, why: "After the top row and the right column, the bottom row is read right to left, and `bottom--` leaves `top > bottom`; the left-column walk is `for (i = bottom; i >= top ...)`, which is empty here." },
    { name: "Tall rectangle (5 × 3)", kind: "corner", input: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15]] }, why: "The inner rectangle after the first ring is a single column (`5, 8, 11`). It must be read **once**, by the next round's top row and right column, and the guards stop the left column from re-reading it." },
    { name: "Zero and negative values", kind: "corner", input: { matrix: [[0, -1, 2], [-3, 4, -5]] }, why: "Values are never inspected, so zero and negatives are read like any others. This only guards against a solution that uses `0` as a visited mark." },
  ],

  trace(input, T) {
    const M = input.matrix, R = M.length, C = M[0].length;
    let top = 0, bottom = R - 1, left = 0, right = C - 1;
    const out = [], seen = new Set();
    let whyGuard = false, whyShrink = false;
    const dirs = { top: "→ along the top row", right: "↓ down the right column", bottom: "← along the bottom row", left: "↑ up the left column" };
    const S = (o = {}) => () => {
      const hl = {};
      seen.forEach((k) => (hl[k] = "ok"));
      if (o.cur) hl[o.cur[0] + "," + o.cur[1]] = "cur";
      const rects = top <= bottom && left <= right ? [{ r0: top, c0: left, r1: bottom, c1: right, cls: "win", label: "" }] : [];
      return {
        cells: M, hl, rects, numbered: true, title: "matrix", cw: 40,
        arrs: [{ label: "output (spiral order)", arr: out.length ? out.slice() : ["–"], hl: out.length ? { [out.length - 1]: "cur" } : { 0: "empty" }, cw: R * C > 16 ? 32 : 38, size: 13 }],
        regs: [{ k: "top", v: top, cls: "cmp" }, { k: "bottom", v: bottom, cls: "cmp" }, { k: "left", v: left, cls: "cmp" }, { k: "right", v: right, cls: "cmp" }],
        note: o.note,
      };
    };
    const vars = () => ({ top, bottom, left, right, read: out.length });
    const take = (tag, r, c) => {
      out.push(M[r][c]); seen.add(r + "," + c);
      T.step(tag, { vars: vars(), state: S({ cur: [r, c], note: dirs[tag] }), say: `Read \`m[${r}][${c}]\` = **${M[r][c]}** and add it to the output (${dirs[tag]}). ${out.length} of ${R * C} cells read.`, op: `out.push(m[${r}][${c}])  →  ${M[r][c]}`, act: "READ" });
    };
    const shrink = (tag, name, text, why) => {
      T.step(tag, { vars: vars(), state: S(), say: text, op: name, act: "SHRINK", why: why ? null : { title: "Why move the boundary?", text: "The side we just read is finished: none of its cells will ever be read again. Moving the boundary one step inwards makes the unread rectangle (the blue block) one row or column smaller." } });
    };
    T.step("init", { vars: vars(), state: S(), phase: "Spiral inwards, ring by ring", say: `The matrix has ${R} row${R === 1 ? "" : "s"} and ${C} column${C === 1 ? "" : "s"}. Four boundaries enclose the cells that are **not yet read**; at the start that is the whole matrix (the blue block).`, op: `top = 0, bottom = ${R - 1}, left = 0, right = ${C - 1}`, act: "START" });
    while (top <= bottom && left <= right) {
      T.step("loop", { vars: vars(), state: S(), say: `The unread block has rows ${top}..${bottom} and columns ${left}..${right}: it is not empty, so there is another ring to read.`, op: "top <= bottom && left <= right  →  true", act: "RING" });
      for (let j = left; j <= right; j++) take("top", top, j);
      top++;
      shrink("topdone", "top++", `The top row is finished: \`top\` becomes **${top}**.`, whyShrink); whyShrink = true;
      for (let i = top; i <= bottom; i++) take("right", i, right);
      right--;
      shrink("rightdone", "right--", `The right column is finished: \`right\` becomes **${right}**.`, true);
      const hasBottom = top <= bottom;
      T.step("botcheck", { vars: vars(), state: S(), say: hasBottom ? `\`top\` (${top}) ≤ \`bottom\` (${bottom}): a bottom row is still unread.` : `\`top\` (${top}) > \`bottom\` (${bottom}): no row is left, so the bottom row **must not** be read again (it was the top row already).`, op: `top <= bottom  →  ${hasBottom}`, act: hasBottom ? "READ_BOTTOM" : "SKIP_BOTTOM",
        why: whyGuard ? null : { title: "Why this guard?", text: "When the block has shrunk to one row, the top-row pass has already read it. Reading `m[bottom]` right to left would visit the same cells a second time and produce duplicates." } });
      whyGuard = true;
      if (hasBottom) {
        for (let j = right; j >= left; j--) take("bottom", bottom, j);
        bottom--;
        shrink("botdone", "bottom--", `The bottom row is finished: \`bottom\` becomes **${bottom}**.`, true);
      }
      const hasLeft = left <= right;
      T.step("leftcheck", { vars: vars(), state: S(), say: hasLeft ? `\`left\` (${left}) ≤ \`right\` (${right}): a left column is still unread.` : `\`left\` (${left}) > \`right\` (${right}): no column is left, so the left column **must not** be read again.`, op: `left <= right  →  ${hasLeft}`, act: hasLeft ? "READ_LEFT" : "SKIP_LEFT" });
      if (hasLeft) {
        for (let i = bottom; i >= top; i--) take("left", i, left);
        left++;
        shrink("leftdone", "left++", `The left column is finished: \`left\` becomes **${left}**.`, true);
      }
    }
    T.step("loop", { vars: vars(), state: S(), say: "The unread block is empty (a boundary has crossed its opposite), so every cell has been read.", op: "top <= bottom && left <= right  →  false", act: "LOOP_ENDS" });
    T.step("ret", { vars: { "return": `${out.length} values` }, state: S(), say: `Return the output: **[${out.join(", ")}]**.`, op: "return out", act: "DONE" });
    T.result(out.slice());
  },
  fuzz(rnd) {
    const R = 1 + Math.floor(rnd() * 5), C = 1 + Math.floor(rnd() * 5);
    return { matrix: Array.from({ length: R }, () => Array.from({ length: C }, () => Math.floor(rnd() * 21) - 10)) };
  },
  gen(n) { return { matrix: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i * n + j)) }; },

  complexity: {
    time: {
      tex: "O(mn)", title: "every cell is read exactly once", short: "the four sides of all rings partition the matrix",
      derive: [
        "\\text{ring } k \\text{ has } 2(m_k + n_k) - 4 \\text{ cells, with } m_k = m - 2k,\\; n_k = n - 2k || the perimeter of the $k$-th rectangle",
        "\\sum_{k} \\big(2(m_k + n_k) - 4\\big) = mn || the rings partition the matrix (guards stop single rows/columns being read twice)",
        "T(m,n) = c \\cdot mn + c' \\cdot \\lceil \\min(m,n)/2 \\rceil || one read per cell, plus a few boundary updates per ring",
        "!T(m,n) = O(mn) || since $\\min(m,n) \\le mn$",
      ],
      where: "Here $m$ is the number of rows and $n$ the number of columns. The measured table uses an $N \\times N$ matrix, so $mn = N^2$ and doubling $N$ multiplies the work by about 4.",
    },
    space: {
      tex: "O(1)", title: "four integers (the output is not counted)", short: "`top`, `bottom`, `left`, `right`",
      derive: [
        "S_{\\text{extra}} = |\\text{top}| + |\\text{bottom}| + |\\text{left}| + |\\text{right}| = 4c || the boundaries",
        "!S_{\\text{extra}} = O(1) || the output list of $mn$ values is required by the problem and is not extra space",
      ],
      where: "The visited-table simulation needs an $m \\times n$ table: $O(mn)$ extra. The boundary version replaces it with four integers.",
    },
    limit: "Every element must be written to the output, so $\\Omega(mn)$ time is needed, and the algorithm meets it.",
    measure: { label: "N = side of an N × N matrix", fTex: "N^2", f: (n) => n * n, sizes: [4, 8, 16, 32], growth: "quadratic in the side, i.e. linear in the number of cells", reading: "Doubling the side multiplies the work by about **4**: the work is linear in the number of cells." },
  },

  mistakes: [
    { title: "Missing the guard for the bottom row", what: "Reading the bottom row without checking `top <= bottom`.", why: "The four sides look symmetric.", breaks: "For a single row (or when the rings shrink to a single row) the same cells are read twice: `[[1,2,3]]` gives `[1,2,3,2,1]`.", avoid: "`if (top <= bottom)` before the bottom row." },
    { title: "Missing the guard for the left column", what: "Reading the left column without `left <= right`.", why: "Copying the bottom-row code and forgetting the matching check.", breaks: "A single column is read down (right column) and then up again, duplicating all but the first element.", avoid: "`if (left <= right)` before the left column." },
    { title: "Updating a boundary too early or too late", what: "`top++` before reading the top row, or `right--` after the bottom row.", why: "Order of statements.", breaks: "The right column starts one row too high (re-reading the corner) or the bottom row starts one column too far right.", avoid: "Read a side, then immediately move the boundary that belongs to it, in the order top, right, bottom, left." },
    { title: "Loop condition with `||` instead of `&&`", what: "`while (top <= bottom || left <= right)`.", why: "\"Keep going while anything is left\".", breaks: "A rectangle can have rows but no columns (or the reverse): the loop continues and indexes a row or column that does not exist.", avoid: "Both dimensions must be non-empty: `&&`." },
    { title: "Using a value as the visited mark", what: "Overwriting read cells with `0` or `INT_MIN` in the visited-table version.", why: "It avoids the extra table.", breaks: "It changes the caller's matrix, and any value equal to the marker is skipped by mistake.", avoid: "Use the boundary method, which needs no marks." },
  ],

  followUps: [
    {
      q: "**Spiral Matrix II:** given `n`, fill an `n × n` matrix with `1 … n²` in spiral order.",
      a: "The same four boundaries, but writing a counter instead of reading: `m[top][j] = k++` along the top, and so on. Because the matrix is square the guards are only needed for the last (centre) cell when `n` is odd.",
      cpp: `vector<vector<int>> generateMatrix(int n) {
    vector<vector<int>> m(n, vector<int>(n));
    int top = 0, bottom = n - 1, left = 0, right = n - 1, k = 1;
    while (top <= bottom && left <= right) {
        for (int j = left; j <= right; j++) m[top][j] = k++;
        top++;
        for (int i = top; i <= bottom; i++) m[i][right] = k++;
        right--;
        if (top <= bottom) { for (int j = right; j >= left; j--) m[bottom][j] = k++; bottom--; }
        if (left <= right) { for (int i = bottom; i >= top; i--) m[i][left] = k++; left++; }
    }
    return m;
}`,
      js: `function generateMatrix(n) {
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  let top = 0, bottom = n - 1, left = 0, right = n - 1, k = 1;
  while (top <= bottom && left <= right) {
    for (let j = left; j <= right; j++) m[top][j] = k++;
    top++;
    for (let i = top; i <= bottom; i++) m[i][right] = k++;
    right--;
    if (top <= bottom) { for (let j = right; j >= left; j--) m[bottom][j] = k++; bottom--; }
    if (left <= right) { for (let i = bottom; i >= top; i--) m[i][left] = k++; left++; }
  }
  return m;
}`,
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "Return the elements in **diagonal order** (zig-zag) instead.",
      a: "Group the cells by `i + j` (cells on the same anti-diagonal share it). Walk the sums from `0` to `m + n − 2`, reversing the direction on every other sum. Each cell is visited once: $O(mn)$ time. With a simulation you track the direction and flip it when you hit a wall.",
      time: "O(mn)", space: "O(1)",
    },
    {
      q: "What if the matrix is **very large and stored in a file**?",
      a: "The boundary algorithm accesses cells by `(row, column)` at the end of each side, so it needs random access to rows. If only sequential reads are possible, read the file once into row-major blocks and extract each ring in $O(\\text{perimeter})$ time, or process the matrix in tiles that fit in memory.",
      time: "O(mn)", space: "O(block)",
    },
    {
      q: "Where is the **`k`-th element** of the spiral, without building it?",
      a: "Count ring by ring: ring `r` has $2(m_r + n_r) - 4$ cells (with the single row/column special cases). Skip whole rings while `k` is larger than their size, then locate the side and offset inside the ring: $O(\\min(m, n))$ time and $O(1)$ space.",
      time: "O(min(m, n))", space: "O(1)",
    },
  ],

  related: [
    { id: "rotate-image", why: "Also processes a matrix ring by ring, from the outside in, but swaps four cells at a time." },
    { id: "set-matrix-zeroes", why: "Another in-place matrix problem where the order of operations is what makes it correct." },
    { id: "number-of-islands", why: "Walks a grid with explicit boundary checks for every step." },
    { id: "word-search", why: "Moves through a grid in four directions with a visited mark, but by backtracking." },
  ],
  patternNote: "**Boundary simulation** replaces a visited table with the *edges of what is left*. Whenever a traversal peels a rectangle layer by layer, keep `top`, `bottom`, `left`, `right`; read a side, move its boundary, and guard each later side so that a rectangle that has collapsed to one row or one column is not read twice.",
  takeaways: [
    "Spiral order = repeat: top row →, right column ↓, bottom row ←, left column ↑, shrinking the rectangle.",
    "Four boundaries (`top`, `bottom`, `left`, `right`) replace a `seen` table: $O(1)$ extra space.",
    "The **two guards** (`top <= bottom`, `left <= right`) prevent duplicates for a single row or column.",
    "The loop condition is `top <= bottom && left <= right` (and, not or).",
    "Time $O(mn)$: every cell is read exactly once. The same loop generates a spiral matrix.",
  ],
});
