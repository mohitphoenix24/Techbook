SHEETS.define({
  id: "rotate-image",
  viz: "matrix",
  io: { fn: "rotate", params: [["matrix", "int[][]"]], ret: "void", inplace: "matrix", labels: { matrix: "matrix (an n × n grid)" } },
  legend: [["cur", "the two cells being swapped"], ["dim", "on the diagonal: stays put"], ["win", "row being reversed"], ["ok", "already settled"]],

  statement: `You are given an \`n x n\` 2D \`matrix\` representing an image. **Rotate the image by 90 degrees (clockwise).**

You have to rotate the image **in place**, which means you have to modify the input 2D matrix directly. **Do not** allocate another 2D matrix and do the rotation.`,
  examples: [
    { input: "matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]", output: "[[7, 4, 1], [8, 5, 2], [9, 6, 3]]", explain: "The first row `1 2 3` becomes the last column, read top to bottom." },
    { input: "matrix = [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]", output: "[[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]]", explain: "The same rule for a 4 × 4 image." },
  ],
  constraints: ["`n == matrix.length == matrix[i].length`", "$1 \\le n \\le 20$", "$-1000 \\le$ `matrix[i][j]` $\\le 1000$"],
  check(input) {
    const m = input.matrix, n = m.length;
    if (!n) return "the matrix needs at least one row";
    if (m.some((r) => r.length !== n)) return "the matrix must be square: as many columns as rows";
    if (n > 6) return "for the animation use at most 6 rows and columns";
    if (m.some((r) => r.some((v) => Math.abs(v) > 99))) return "keep the values between -99 and 99";
    return null;
  },

  intuition: {
    find: "Where does every cell go? After a clockwise quarter turn, the cell at row `i`, column `j` lands at row `j`, column `n − 1 − i`. That one formula describes the whole rotation.",
    beginner: "Make a new `n × n` matrix and write each element to its new place: `out[j][n-1-i] = m[i][j]`. Then copy the new matrix back over the old one.",
    works: "The formula is exactly the definition of the rotation, so every cell ends up where it belongs.",
    slow: "Time is optimal ($O(n^2)$, every cell must move), but the second matrix needs $O(n^2)$ **extra memory**, which the statement explicitly forbids.",
    repeat: "We move every element twice (into the new matrix, then back). We want to put each element straight into its final place without a buffer.",
    remember: "A rotation can be built from simpler moves we already understand. A **transpose** (mirror over the main diagonal) sends `(i, j)` to `(j, i)`. A **reversal of every row** sends `(j, i)` to `(j, n − 1 − i)`. Together: `(i, j) → (j, i) → (j, n − 1 − i)`, which is exactly the rotation formula.",
    observation: "**Clockwise rotation = transpose, then reverse each row.** Both steps are done in place with plain swaps: the transpose swaps `m[i][j]` with `m[j][i]` for `j > i` (each pair once), and the reversal swaps the first and last cell of each row, moving inwards. No extra matrix is needed.",
    leads: "For `i` from 0, for `j` from `i + 1`: `swap(m[i][j], m[j][i])`. Then for each row, swap `m[i][j]` with `m[i][n-1-j]` for `j < n/2`.",
  },

  flow: [
    "Allocate a new matrix and write each element to `out[j][n-1-i]`.",
    "The index formula is the definition of a clockwise quarter turn.",
    "$O(n^2)$ time, but a whole second matrix of $O(n^2)$ extra memory.",
    "Split the rotation into two simple moves: mirror over the diagonal, then flip each row.",
    "`(i, j) → (j, i) → (j, n−1−i)`: transpose then reverse rows equals the rotation.",
    "Only swaps, no buffer: $O(n^2)$ time, $O(1)$ extra space.",
  ],

  brute: {
    idea: "**Brute force:** create a new `n × n` matrix `t` and write every element to its rotated position, `t[j][n − 1 − i] = m[i][j]`. Finally copy `t` back into `m`.",
    why: "The new matrix is $O(n^2)$ **extra memory**. The statement forbids allocating another 2D matrix, and in memory-tight programs (images!) a second copy of the picture is a real cost. Each element is also copied twice.",
    time: "O(n²)", space: "O(n²)",
    cpp: `class Solution {
public:
    void rotate(vector<vector<int>>& m) {
        int n = m.size();
        vector<vector<int>> t(n, vector<int>(n));
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                t[j][n - 1 - i] = m[i][j];
        m = t;
    }
};`,
    js: `function rotate(m) {
  const n = m.length;
  const t = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      t[j][n - 1 - i] = m[i][j];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) m[i][j] = t[i][j];
}`,
  },

  pattern: {
    name: "Matrix (in-place transform by composing simple moves)",
    why: "Geometric transformations of a grid (rotate, flip, transpose) are compositions of a few elementary moves. Finding the right composition turns a confusing four-way index juggling into two loops of plain swaps.",
    recognize: [
      "An $n \\times n$ grid must be **rotated or reflected in place**.",
      "You can write the index formula `(i, j) → (…)` and it factors into simpler formulas.",
      "Every swap puts two elements in their final (or intermediate) correct places.",
      "A second matrix would be easy, but the statement bans it.",
    ],
  },

  optimal: {
    idea: "A clockwise quarter turn sends `(i, j)` to `(j, n − 1 − i)`. This equals a **transpose** `(i, j) → (j, i)` followed by a **reversal of each row** `(j, i) → (j, n − 1 − i)`. Do the transpose by swapping `m[i][j]` and `m[j][i]` for every pair above the diagonal, then reverse each row by swapping its mirrored ends.",
    steps: [
      "Transpose: for `i` from `0` to `n − 1` and `j` from `i + 1` to `n − 1`: `swap(m[i][j], m[j][i])`.",
      "Reverse each row: for every row `i`, with `j = 0` and `k = n − 1`: while `j < k`, `swap(m[i][j], m[i][k])`, then `j++`, `k--`.",
      "The matrix has been rotated 90° clockwise, in place.",
    ],
    invariant: "**After the transpose, `m[j][i]` holds the original `m[i][j]`; after reversing a row, each of its cells holds the value that belongs there, and rows not yet reversed are still transposed.**",
    correct: "Let the original matrix be $A$. The transpose gives $B$ with $B[j][i] = A[i][j]$, every off-diagonal pair is swapped exactly once (because $j > i$) and the diagonal is already in place. Reversing row $r$ of $B$ gives $C[r][c] = B[r][n - 1 - c]$. Substituting, $C[r][c] = A[n - 1 - c][r]$, i.e. the element now in row $r$, column $c$ came from row $n - 1 - c$, column $r$. Renaming $i = n - 1 - c$ and $j = r$, the element $A[i][j]$ is at row $j$, column $n - 1 - i$, which is exactly the clockwise rotation. Both phases use only swaps of two cells, so no element is lost or duplicated.",
  },

  cpp: `class Solution {
public:
    void rotate(vector<vector<int>>& m) {
        int n = m.size();                       //@init
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                swap(m[i][j], m[j][i]);         // mirror over the diagonal //@transpose
        for (int i = 0; i < n; i++)
            for (int j = 0, k = n - 1; j < k; j++, k--)
                swap(m[i][j], m[i][k]);         // flip every row //@reverse
    }
};`,
  js: `function rotate(m) {
  const n = m.length;                    //@init
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      [m[i][j], m[j][i]] = [m[j][i], m[i][j]];   // mirror over the diagonal //@transpose
  for (let i = 0; i < n; i++)
    for (let j = 0, k = n - 1; j < k; j++, k--)
      [m[i][j], m[i][k]] = [m[i][k], m[i][j]];   // flip every row //@reverse
}`,

  tests: [
    { name: "Example 1: a 3 × 3 image", kind: "normal", input: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] } },
    { name: "Example 2: a 4 × 4 image", kind: "normal", input: { matrix: [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]] } },
    { name: "A 2 × 2 image", kind: "normal", input: { matrix: [[1, 2], [3, 4]] } },
    { name: "A single cell", kind: "edge", input: { matrix: [[7]] }, why: "The transpose loop has no pairs (`j` starts at 1 = `n`) and the row reversal has `j < k` false, so nothing moves: a 1 × 1 image is its own rotation." },
    { name: "All values equal", kind: "edge", input: { matrix: [[5, 5], [5, 5]] }, why: "The result is identical to the input, so values cannot show whether the swaps happened. Check the lab: the swaps still run, they just exchange equal numbers." },
    { name: "A symmetric matrix", kind: "edge", input: { matrix: [[1, 2, 3], [2, 4, 5], [3, 5, 6]] }, why: "This matrix equals its own transpose, so the first phase changes nothing visible. The whole rotation is done by the row reversal. A solution that forgot the transpose would still pass this test, so always include non-symmetric inputs as well." },
    { name: "Zero and negative values", kind: "edge", input: { matrix: [[0, -1], [-2, 3]] }, why: "Values are only moved, never inspected, so zero and negatives rotate like any other numbers. This guards against a solution that uses `0` as an \"empty\" marker." },
    { name: "A 5 × 5 image (odd size)", kind: "corner", input: { matrix: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]] }, why: "With odd `n` the centre cell (13) lies on the diagonal and in the middle of its row, so neither phase touches it. The row reversal runs `j < k`, which stops *before* the middle element; using `j <= k` would swap it with itself (harmless) but `j < n` would undo the reversal." },
    { name: "The identity matrix", kind: "corner", input: { matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, why: "The ones start on the main diagonal and end on the **anti-diagonal**, which makes the rotation easy to see. The transpose leaves the identity unchanged; the row reversal then flips each `1` to the other end of its row." },
  ],

  trace(input, T) {
    const M = input.matrix.map((r) => r.slice());
    const n = M.length;
    let swaps = 0, whyT = false, whyR = false, whyFlip = false;
    const S = (o = {}) => () => {
      const hl = {};
      if (o.phase === 1) for (let i = 0; i < n; i++) hl[i + "," + i] = "dim";
      (o.done || []).forEach((k) => (hl[k] = "ok"));
      (o.cur || []).forEach(([r, c]) => (hl[r + "," + c] = "cur"));
      const rects = o.row !== undefined ? [{ r0: o.row, c0: 0, r1: o.row, c1: n - 1, cls: "win", label: "" }] : [];
      const arrows = o.cur && o.cur.length === 2 ? [{ from: o.cur[0], to: o.cur[1], cls: "hot", curve: 16 }, { from: o.cur[1], to: o.cur[0], cls: "hot", curve: 16 }] : [];
      return { cells: M.map((r) => r.slice()), hl, rects, arrows, regs: [{ k: "swaps so far", v: swaps, cls: "hit" }], numbered: true, title: o.title || "matrix", note: o.note, cw: 46 };
    };
    const swap = (a, b) => { const t = M[a[0]][a[1]]; M[a[0]][a[1]] = M[b[0]][b[1]]; M[b[0]][b[1]] = t; swaps++; };
    T.step("init", { vars: { n }, state: S({ title: "matrix (before)" }), phase: "Transpose: mirror over the diagonal", say: `The image is ${n} × ${n}. A clockwise quarter turn sends the cell at row i, column j to row j, column ${n - 1} − i. We get there in two steps: **transpose**, then **reverse every row**.`, op: `n = ${n}`, act: "START" });
    const doneT = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = M[i][j], b = M[j][i];
      swap([i, j], [j, i]);
      doneT.push(i + "," + j, j + "," + i);
      T.step("transpose", { vars: { i, j, swaps }, state: S({ phase: 1, cur: [[i, j], [j, i]], done: doneT.slice(0, -2), title: "matrix: transposing" }), say: `Swap \`m[${i}][${j}]\` (${a}) with \`m[${j}][${i}]\` (${b}): the two cells trade places across the diagonal. Each pair is swapped **once** (only when \`j > i\`).`, op: `swap(m[${i}][${j}], m[${j}][${i}])`, act: "SWAP",
        why: whyT ? null : { title: "Why only cells above the diagonal?", text: "The pair `(i, j)` and `(j, i)` is one pair. If we looped over every cell, each pair would be swapped twice and everything would be put back. The diagonal cells (grey) are their own mirror images and never move." } });
      whyT = true;
    }
    if (n === 1) T.step("transpose", { vars: { swaps }, state: S({ phase: 1 }), say: "A 1 × 1 matrix has no cell above the diagonal: the transpose has nothing to do.", op: "(no pairs)", act: "NOTHING" });
    T.phase("Reverse every row");
    const doneRows = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0, k = n - 1; j < k; j++, k--) {
        const a = M[i][j], b = M[i][k];
        swap([i, j], [i, k]);
        T.step("reverse", { vars: { i, j, k, swaps }, state: S({ cur: [[i, j], [i, k]], row: i, done: doneRows.slice(), title: "matrix: reversing rows" }), say: `Row ${i}: swap the ends \`m[${i}][${j}]\` (${a}) and \`m[${i}][${k}]\` (${b}), then move both inwards.`, op: `swap(m[${i}][${j}], m[${i}][${k}])`, act: "SWAP_ENDS",
          why: whyR ? null : { title: "Why does reversing finish the rotation?", text: "After the transpose, the *original column* `i` sits in row `i`, but reading from the top. A clockwise turn wants it read from the bottom, so each row only needs flipping." } });
        whyR = true;
      }
      for (let c = 0; c < n; c++) doneRows.push(i + "," + c);
    }
    T.step("reverse", { vars: { swaps }, state: S({ done: doneRows.slice(), title: "matrix (rotated)" }), say: `Every row has been flipped: the image is rotated 90° clockwise, using **${swaps}** swaps and no second matrix.`, op: "done", act: "DONE",
      why: whyFlip ? null : { title: "Check one cell", text: "The original top-left cell moves to the top-right corner, and the original top-right moves to the bottom-right: that is a clockwise quarter turn." } });
    T.result(M.map((r) => r.slice()));
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 5);
    return { matrix: Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 21) - 10)) };
  },
  gen(n) { return { matrix: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i * n + j)) }; },

  complexity: {
    time: {
      tex: "O(n^2)", title: "every cell is swapped a constant number of times", short: "n(n−1)/2 transpose swaps and n·⌊n/2⌋ reversal swaps",
      derive: [
        "T_{\\text{transpose}} = \\sum_{i=0}^{n-1} (n - 1 - i)\\, c = \\frac{n(n-1)}{2}\\, c || one swap per pair above the diagonal",
        "T_{\\text{reverse}} = n \\cdot \\lfloor n/2 \\rfloor\\, c || each of $n$ rows has $\\lfloor n/2 \\rfloor$ swaps",
        "T(n) = c\\Big(\\frac{n(n-1)}{2} + n\\lfloor \\tfrac n2 \\rfloor\\Big) \\le c\\, n^2 || adding the two counts",
        "!T(n) = O(n^2) || linear in the number $n^2$ of cells",
      ],
      where: "Here $n$ is the side of the matrix and the number of cells is $n^2$. Every cell must move (except the centre), so the work is linear in the size of the image. Doubling $n$ multiplies the work by about 4.",
    },
    space: {
      tex: "O(1)", title: "swaps through one temporary", short: "a few loop variables and one temporary",
      derive: [
        "S = |i| + |j| + |k| + |\\text{tmp}| = c || no second matrix",
        "!S = O(1) || constant extra space",
      ],
      where: "The brute force needs a whole second $n \\times n$ matrix. Here every swap uses one temporary value.",
    },
    limit: "Every cell except possibly the centre has to move, so $\\Omega(n^2)$ time is required. $O(1)$ space is optimal.",
    measure: { label: "n = side of the matrix", fTex: "n^2", f: (n) => n * n, sizes: [4, 8, 16, 32], growth: "quadratic", reading: "Doubling the side multiplies the number of swaps by about **4**: the work is linear in the number of cells." },
  },

  mistakes: [
    { title: "Transposing the whole matrix", what: "`for (j = 0; j < n; j++) swap(m[i][j], m[j][i])` for every `i`.", why: "It looks like the obvious double loop.", breaks: "Each pair is swapped twice (once from each side), so the matrix is put back exactly as it was.", avoid: "Start the inner loop at `j = i + 1` so that each pair is swapped once." },
    { title: "Reversing columns, or reversing first", what: "Reverse each row *before* the transpose, or reverse columns after it.", why: "Both sound like \"the other half\" of the rotation.", breaks: "The result is a **counter-clockwise** rotation (or a reflection), which fails the tests even though it looks plausible.", avoid: "Clockwise = transpose, **then** reverse rows. (Counter-clockwise = reverse rows, then transpose.)" },
    { title: "Reversing a row with `j < n`", what: "`for (j = 0; j < n; j++) swap(m[i][j], m[i][n-1-j])`.", why: "Confusing a loop over all cells with a loop over half.", breaks: "Every pair is swapped twice, so the row is unchanged.", avoid: "Walk two indices towards the middle (`j < k`), or loop `j < n / 2`." },
    { title: "Allocating a second matrix", what: "Building `t` and copying back.", why: "The index formula is easy to apply directly.", breaks: "It violates the in-place requirement and costs $O(n^2)$ memory.", avoid: "Use swaps only." },
    { title: "Using the wrong index formula", what: "`out[i][n-1-j] = m[i][j]` or `out[n-1-j][i] = m[i][j]`.", why: "Mixing up which index is flipped.", breaks: "The result is a mirror image or a counter-clockwise turn.", avoid: "Check on a small example: the first row must become the **last** column." },
  ],

  followUps: [
    {
      q: "Rotate in place with **one pass of four-way swaps**, ring by ring.",
      a: "For each ring (layer) from the outside in, and for each cell `i` along its top side, move four cells at once in a cycle: left → top → right → bottom → left. Each cell is touched once, so it is still $O(n^2)$ time and $O(1)$ space, but with a single pass and more delicate indices.",
      cpp: `void rotateRings(vector<vector<int>>& m) {
    int n = m.size();
    for (int layer = 0; layer < n / 2; layer++) {
        int first = layer, last = n - 1 - layer;
        for (int i = first; i < last; i++) {
            int off = i - first;
            int top = m[first][i];
            m[first][i] = m[last - off][first];
            m[last - off][first] = m[last][last - off];
            m[last][last - off] = m[i][last];
            m[i][last] = top;
        }
    }
}`,
      js: `function rotateRings(m) {
  const n = m.length;
  for (let layer = 0; layer < Math.floor(n / 2); layer++) {
    const first = layer, last = n - 1 - layer;
    for (let i = first; i < last; i++) {
      const off = i - first;
      const top = m[first][i];
      m[first][i] = m[last - off][first];
      m[last - off][first] = m[last][last - off];
      m[last][last - off] = m[i][last];
      m[i][last] = top;
    }
  }
}`,
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "Rotate **counter-clockwise** instead.",
      a: "Reverse every row first and then transpose (or transpose, then reverse the *columns* by swapping `m[i][j]` with `m[n-1-i][j]`). In index terms `(i, j) → (n − 1 − j, i)`.",
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "Rotate by **180 degrees**.",
      a: "Apply the clockwise rotation twice, or directly: `(i, j) → (n − 1 − i, n − 1 − j)`. Reverse every row and then reverse the order of the rows. $O(n^2)$ time, $O(1)$ space.",
      time: "O(n²)", space: "O(1)",
    },
    {
      q: "The image is **not square** (`m × n`). Can it be rotated in place?",
      a: "Not in the same array: the rotated image has the shape `n × m`, so a different layout is needed. If the data is stored as one flat array, the rotation is a permutation of positions that can be done in place by following its cycles (with a visited bit per cell), or simply written to a new buffer in $O(mn)$ time.",
      time: "O(mn)", space: "O(mn) or O(1) with cycle following",
    },
  ],

  related: [
    { id: "spiral-matrix", why: "Also treats the matrix ring by ring from the outside in." },
    { id: "set-matrix-zeroes", why: "Another in-place matrix problem where the order of operations matters." },
    { id: "reverse-bits", why: "Reversal again: reversing the order of the elements of a row is the same idea as reversing the bits of a number." },
    { id: "number-of-islands", why: "Another grid problem, where index arithmetic and bounds are the main source of bugs." },
  ],
  patternNote: "**Compose simple moves.** A rotation is a transpose followed by a reversal, and the same idea gives reflections, counter-clockwise turns and 180° turns. Whenever an in-place grid transformation looks like intricate index juggling, write its index formula and try to factor it into two or three elementary swaps.",
  takeaways: [
    "Clockwise 90°: `(i, j) → (j, n − 1 − i)`, which equals **transpose, then reverse each row**.",
    "Transpose swaps `m[i][j]` and `m[j][i]` only for `j > i` (each pair once).",
    "Reverse a row by swapping inward from both ends (`j < k`), never with `j < n`.",
    "Counter-clockwise = reverse rows then transpose; 180° = both reversals.",
    "Time $O(n^2)$, space $O(1)$: only swaps, no second matrix.",
  ],
});
