SHEETS.define({
  id: "set-matrix-zeroes",
  viz: "matrix",
  io: { fn: "setZeroes", params: [["matrix", "int[][]"]], ret: "void", inplace: "matrix", labels: { matrix: "matrix (rows of integers)" } },
  legend: [["cur", "cell being looked at"], ["cmp", "cells being read"], ["hit", "a zero in the input"], ["win", "marker (row or column to clear)"], ["bad", "cleared to zero"]],

  statement: `Given an \`m x n\` integer matrix \`matrix\`, if an element is \`0\`, set its **entire row and column** to \`0\`.

You must do it **in place**: the function changes \`matrix\` itself and returns nothing.`,
  examples: [
    { input: "matrix = [[1, 1, 1], [1, 0, 1], [1, 1, 1]]", output: "[[1, 0, 1], [0, 0, 0], [1, 0, 1]]", explain: "The single zero is in row 1 and column 1, so both are cleared." },
    { input: "matrix = [[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]", output: "[[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]", explain: "Zeros at (0, 0) and (0, 3) clear row 0 and columns 0 and 3." },
  ],
  constraints: ["`m == matrix.length`, `n == matrix[0].length`", "$1 \\le m, n \\le 200$", "$-2^{31} \\le$ `matrix[i][j]` $\\le 2^{31} - 1$"],
  check(input) {
    const m = input.matrix;
    if (!m.length || !m[0].length) return "the matrix needs at least one row and one column";
    if (m.some((r) => r.length !== m[0].length)) return "every row must have the same length";
    if (m.length > 6 || m[0].length > 6) return "for the animation use at most 6 rows and 6 columns";
    if (m.some((r) => r.some((v) => Math.abs(v) > 99))) return "keep the values between -99 and 99";
    return null;
  },

  intuition: {
    find: "Every row and every column that contains a zero **in the original matrix** becomes all zeros. The word *original* is the whole difficulty.",
    beginner: "Take a copy of the matrix. Look at each cell of the copy; whenever it is `0`, clear that cell's row and column in the real matrix.",
    works: "The copy never changes, so we always look at the original zeros. Zeros we create in the real matrix cannot trigger more clearing.",
    slow: "The copy costs $O(mn)$ **extra memory**, and clearing a row and a column for every zero costs $O(m + n)$ each, up to $O(mn(m+n))$ in total (a matrix full of zeros).",
    repeat: "The same row or column is cleared again and again when it holds several zeros. We only need *one bit per row* (\"has a zero\") and *one bit per column*.",
    remember: "Those two lists of bits (`rowHasZero[m]`, `colHasZero[n]`) fit in $O(m + n)$ memory. Better still, the matrix **already has a row and a column that can store them**: the first row and the first column.",
    observation: "Use `matrix[i][0]` as the flag for row `i`, and `matrix[0][j]` as the flag for column `j`. Scan the inner cells once to **set the flags**, then scan again to **clear** every inner cell whose row flag or column flag is zero. Because the first row and column are now flags, remember *before* starting whether they held a zero of their own (two booleans), and clear them last.",
    leads: "(1) Record `row0` and `col0` (does the first row / column contain a zero?). (2) For `i, j ≥ 1`: if `m[i][j] == 0`, set `m[i][0] = 0` and `m[0][j] = 0`. (3) For `i, j ≥ 1`: if `m[i][0] == 0` or `m[0][j] == 0`, set `m[i][j] = 0`. (4) If `row0`, clear row 0; if `col0`, clear column 0.",
  },

  flow: [
    "Copy the matrix; for each zero in the copy, clear its row and column in the original.",
    "The copy keeps the original zeros safe from the zeros we create.",
    "$O(mn)$ extra memory and $O(mn(m+n))$ time: rows and columns are cleared repeatedly.",
    "One bit per row and per column is enough: $O(m + n)$ memory.",
    "The first row and first column of the matrix can hold those bits; save their own status in two booleans.",
    "Mark, then clear the inner cells, then the first row and column: $O(mn)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force:** copy the whole matrix. For every cell that is `0` **in the copy**, set the whole row and the whole column to `0` in the real matrix.",
    why: "It costs $O(mn)$ extra memory for the copy. Each zero triggers $O(m + n)$ writes, so a matrix with many zeros needs $O(mn(m+n))$ time. Both are far more than necessary, because we only need to know *which* rows and columns contain a zero.",
    time: "O(mn(m+n))", space: "O(mn)",
    measure: { fTex: "n^3", f: (n) => n * n * n, ns: [5, 10, 20, 50, 100] },
    cpp: `class Solution {
public:
    void setZeroes(vector<vector<int>>& m) {
        int R = m.size(), C = m[0].size();
        auto copy = m;
        for (int i = 0; i < R; i++)
            for (int j = 0; j < C; j++)
                if (copy[i][j] == 0) {
                    for (int k = 0; k < C; k++) m[i][k] = 0;
                    for (int k = 0; k < R; k++) m[k][j] = 0;
                }
    }
};`,
    js: `function setZeroes(m) {
  const R = m.length, C = m[0].length;
  const copy = m.map((row) => row.slice());
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++)
      if (copy[i][j] === 0) {
        for (let k = 0; k < C; k++) m[i][k] = 0;
        for (let k = 0; k < R; k++) m[k][j] = 0;
      }
}`,
  },

  pattern: {
    name: "Matrix (in-place, reuse the matrix as storage)",
    why: "When a problem forbids extra memory, look for **space you already own**. Here the first row and first column are used as the \"to be cleared\" flags, a trick that appears whenever one pass must *record* information and a second pass must *use* it without the information being overwritten.",
    recognize: [
      "A matrix must be changed **in place** and each change depends on the *original* values.",
      "A first pass records facts (which rows / columns), a second pass applies them.",
      "The statement asks for $O(1)$ extra space, after you can already see an $O(m + n)$ solution.",
      "Changing a cell immediately would affect decisions made later (so order matters).",
    ],
  },

  optimal: {
    idea: "Use the first row and first column of the matrix as the flag arrays. First save, in two booleans, whether the first row and the first column contain a zero themselves. Then, for every inner cell (`i, j ≥ 1`) that is zero, put a `0` marker at the start of its row (`m[i][0]`) and the top of its column (`m[0][j]`). Next, clear each inner cell whose row marker or column marker is zero. Finally clear the first row and/or column if the booleans say so.",
    steps: [
      "`row0` = does row 0 contain a `0`?  `col0` = does column 0 contain a `0`?",
      "For `i, j ≥ 1`: if `m[i][j] == 0`, set `m[i][0] = 0` and `m[0][j] = 0` (mark row `i` and column `j`).",
      "For `i, j ≥ 1`: if `m[i][0] == 0` **or** `m[0][j] == 0`, set `m[i][j] = 0`.",
      "If `row0`, set the whole first row to `0`.",
      "If `col0`, set the whole first column to `0`.",
    ],
    invariant: "**After the marking pass, `m[i][0] == 0` or `m[0][j] == 0` holds for an inner cell exactly when row `i` or column `j` contained an inner zero; the first row and column are read as markers only, and the original status of those two lines is saved in `row0` and `col0`.**",
    correct: "A cell must become `0` iff its row or column contained an original zero. For inner cells (`i, j ≥ 1`) the marking pass sets `m[i][0]` and `m[0][j]` for every inner zero, so the clearing pass finds exactly the rows and columns with an inner zero. A zero in the **first row** (or **first column**) must clear its column (or row): such a zero is already in `m[0][j]` (or `m[i][0]`), which acts as that column's (row's) marker, so the clearing pass handles it. A zero in the first row also requires the **first row itself** to be cleared, which is why `row0` was saved before the markers overwrote the row, and similarly for `col0`. The first row and column are cleared last so the markers are not destroyed before they are used. Every cell is written only when it should become zero, and nothing already marked is lost, so the result is correct.",
  },

  cpp: `class Solution {
public:
    void setZeroes(vector<vector<int>>& m) {
        int R = m.size(), C = m[0].size();      //@init
        bool row0 = false, col0 = false;        // does row 0 / column 0 hold a zero?
        for (int j = 0; j < C; j++) if (m[0][j] == 0) row0 = true;   //@scanrow
        for (int i = 0; i < R; i++) if (m[i][0] == 0) col0 = true;   //@scancol
        for (int i = 1; i < R; i++)
            for (int j = 1; j < C; j++)
                if (m[i][j] == 0) { m[i][0] = 0; m[0][j] = 0; }      // leave markers //@mark
        for (int i = 1; i < R; i++)
            for (int j = 1; j < C; j++)
                if (m[i][0] == 0 || m[0][j] == 0) m[i][j] = 0;       // read markers //@fill
        if (row0) for (int j = 0; j < C; j++) m[0][j] = 0;           //@zrow
        if (col0) for (int i = 0; i < R; i++) m[i][0] = 0;           //@zcol
    }
};`,
  js: `function setZeroes(m) {
  const R = m.length, C = m[0].length;   //@init
  let row0 = false, col0 = false;        // does row 0 / column 0 hold a zero?
  for (let j = 0; j < C; j++) if (m[0][j] === 0) row0 = true;   //@scanrow
  for (let i = 0; i < R; i++) if (m[i][0] === 0) col0 = true;   //@scancol
  for (let i = 1; i < R; i++)
    for (let j = 1; j < C; j++)
      if (m[i][j] === 0) { m[i][0] = 0; m[0][j] = 0; }          // leave markers //@mark
  for (let i = 1; i < R; i++)
    for (let j = 1; j < C; j++)
      if (m[i][0] === 0 || m[0][j] === 0) m[i][j] = 0;          // read markers //@fill
  if (row0) for (let j = 0; j < C; j++) m[0][j] = 0;            //@zrow
  if (col0) for (let i = 0; i < R; i++) m[i][0] = 0;            //@zcol
}`,

  tests: [
    { name: "Example 1: one zero in the middle", kind: "normal", input: { matrix: [[1, 1, 1], [1, 0, 1], [1, 1, 1]] } },
    { name: "Example 2: zeros in the first row", kind: "normal", input: { matrix: [[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]] } },
    { name: "A zero in a tall matrix", kind: "normal", input: { matrix: [[1, 2, 3], [4, 0, 6], [7, 8, 9], [10, 11, 12]] } },
    { name: "No zeros at all", kind: "edge", input: { matrix: [[1, 2, 3], [4, 5, 6]] }, why: "Nothing triggers any clearing, so the matrix must come back **unchanged**. A solution that uses a sentinel such as `-1` as a marker would corrupt a matrix that has no zeros but contains `-1`." },
    { name: "A zero only in the first row", kind: "edge", input: { matrix: [[1, 0, 3], [4, 5, 6], [7, 8, 9]] }, why: "The zero lives in the row that holds the column markers. Column 1 must be cleared (the marker `m[0][1]` is already `0`) **and** row 0 must be cleared; the saved `row0` flag is what remembers the second part." },
    { name: "A zero only in the first column", kind: "edge", input: { matrix: [[1, 2], [0, 4], [5, 6]] }, why: "The mirror case: the zero is in the column of row markers. Row 1 is cleared by its marker and the saved `col0` flag clears the first column." },
    { name: "A zero in the top-left corner", kind: "edge", input: { matrix: [[0, 2, 3], [4, 5, 6]] }, why: "The corner cell belongs to both the first row and the first column, so both flags are set and **both** lines are cleared. Looping `i, j` from 0 instead of 1 would mistake the corner marker for an inner cell." },
    { name: "All zeros", kind: "edge", input: { matrix: [[0, 0], [0, 0]] }, why: "Everything is already zero. The answer is the same matrix; it checks that markers placed on already-zero cells do no harm." },
    { name: "A single cell", kind: "corner", input: { matrix: [[0]] }, why: "A 1 × 1 matrix: the inner loops (`i, j ≥ 1`) do not run at all. `row0` and `col0` are both true and the first row and column (the one cell) are cleared; for `[[5]]` both flags would be false." },
    { name: "A single row", kind: "corner", input: { matrix: [[1, 0, 3, 4]] }, why: "With one row, the zero clears the **entire** row (`row0`) and its column (just itself). There are no inner cells, so every clearing comes from the saved flags." },
    { name: "A single column", kind: "corner", input: { matrix: [[1], [0], [3]] }, why: "The mirror of a single row: `col0` is true and the whole column becomes zero." },
    { name: "Zeros on the diagonal", kind: "corner", input: { matrix: [[0, 1, 1], [1, 0, 1], [1, 1, 0]] }, why: "Every row and every column contains a zero, so the whole matrix becomes zero. This is the case where clearing immediately (without markers) would give the same answer *by luck*; check the lab to see the markers do the work." },
    { name: "Negative values", kind: "corner", input: { matrix: [[-1, 2], [3, 0]] }, why: "Only the value `0` matters; `-1` and other negatives are ordinary values to keep. The zero at (1, 1) clears row 1 and column 1, leaving `-1` untouched." },
  ],

  trace(input, T) {
    const M = input.matrix.map((r) => r.slice());
    const R = M.length, C = M[0].length;
    const cls = {};
    M.forEach((row, r) => row.forEach((v, c) => { if (v === 0) cls[r + "," + c] = "hit"; }));
    let row0 = null, col0 = null;
    let whySave = false, whyMark = false, whyOrder = false;
    const S = (o = {}) => () => {
      const hl = Object.assign({}, cls);
      (o.read || []).forEach(([r, c]) => (hl[r + "," + c] = hl[r + "," + c] === "hit" ? "hit" : "cmp"));
      if (o.cur) hl[o.cur[0] + "," + o.cur[1]] = "cur";
      const regs = [];
      if (row0 !== null) regs.push({ k: "row 0 has a zero", v: row0, cls: row0 ? "hit" : "" });
      if (col0 !== null) regs.push({ k: "column 0 has a zero", v: col0, cls: col0 ? "hit" : "" });
      const rects = [];
      if (o.markers) { rects.push({ r0: 0, c0: 0, r1: 0, c1: C - 1, cls: "win", label: "" }); rects.push({ r0: 0, c0: 0, r1: R - 1, c1: 0, cls: "win", label: "" }); }
      return { cells: M.map((r) => r.slice()), hl, rects, arrows: o.arrows, regs, note: o.note, numbered: true, title: "matrix  (first row and column = the flags)" };
    };
    const set0 = (r, c, k) => { M[r][c] = 0; if (cls[r + "," + c] !== "hit") cls[r + "," + c] = k; };
    T.step("init", { vars: { rows: R, cols: C }, state: S(), phase: "Remember the first row and column", say: `The matrix has ${R} row${R === 1 ? "" : "s"} and ${C} column${C === 1 ? "" : "s"}. We will use the **first row** and **first column** as flag storage, so first we must remember whether they held zeros of their own.`, op: `R = ${R},  C = ${C}`, act: "START" });
    row0 = M[0].some((v) => v === 0);
    T.step("scanrow", { vars: { row0 }, state: S({ read: M[0].map((_, c) => [0, c]) }), say: row0 ? "Row 0 contains a zero, so row 0 will have to be cleared at the end. Save that fact in `row0`." : "Row 0 contains no zero: `row0` is false.", op: `row0 = ${row0}`, act: row0 ? "ROW0_HAS_ZERO" : "ROW0_CLEAN",
      why: whySave ? null : { title: "Why save this first?", text: "In a moment the first row and column will be overwritten with markers. After that, a zero there could be a real zero or just a marker, and we could not tell which. So we record the truth now, in two booleans." } });
    whySave = true;
    col0 = M.some((r) => r[0] === 0);
    T.step("scancol", { vars: { row0, col0 }, state: S({ read: M.map((_, r) => [r, 0]) }), say: col0 ? "Column 0 contains a zero, so column 0 will have to be cleared at the end. Save that in `col0`." : "Column 0 contains no zero: `col0` is false.", op: `col0 = ${col0}`, act: col0 ? "COL0_HAS_ZERO" : "COL0_CLEAN" });
    T.phase("Mark the rows and columns");
    for (let i = 1; i < R; i++) for (let j = 1; j < C; j++) {
      if (M[i][j] === 0) {
        set0(i, 0, "win"); set0(0, j, "win");
        T.step("mark", { vars: { i, j }, state: S({ cur: [i, j], markers: true, arrows: [{ from: [i, j], to: [i, 0], cls: "hot" }, { from: [i, j], to: [0, j], cls: "hot", curve: 12 }] }), say: `\`m[${i}][${j}]\` is **0**: leave a marker at the start of its row (\`m[${i}][0] = 0\`) and at the top of its column (\`m[0][${j}] = 0\`). Nothing else changes yet.`, op: `m[${i}][${j}] == 0  →  m[${i}][0] = 0,  m[0][${j}] = 0`, act: "MARK",
          why: whyMark ? null : { title: "Why only mark, not clear?", text: "If we cleared row and column right away, the new zeros would look like original zeros when the scan reached them, and the clearing would spread over the whole matrix. Marking changes only the flag cells, which the inner scan never reads." } });
        whyMark = true;
      } else {
        T.step("mark", { vars: { i, j }, state: S({ cur: [i, j], markers: true }), say: `\`m[${i}][${j}]\` = ${M[i][j]} is not zero: nothing to record.`, op: `m[${i}][${j}] == 0  →  false`, act: "SKIP" });
      }
    }
    T.phase("Clear the inner cells");
    for (let i = 1; i < R; i++) for (let j = 1; j < C; j++) {
      const hit = M[i][0] === 0 || M[0][j] === 0;
      const was = M[i][j];
      if (hit && M[i][j] !== 0) set0(i, j, "bad");
      T.step("fill", { vars: { i, j, "row flag": M[i][0], "column flag": M[0][j] }, state: S({ cur: [i, j], read: [[i, 0], [0, j]], markers: true }), say: hit ? `The row flag \`m[${i}][0]\` = ${M[i][0]} or the column flag \`m[0][${j}]\` = ${M[0][j]} is zero, so \`m[${i}][${j}]\` ${was === 0 ? "is already 0" : "is **cleared** to 0"}.` : `Both flags (\`m[${i}][0]\` = ${M[i][0]}, \`m[0][${j}]\` = ${M[0][j]}) are non-zero: the cell keeps its value ${M[i][j]}.`, op: `m[${i}][0] == 0 || m[0][${j}] == 0  →  ${hit}`, act: hit ? "CLEAR" : "KEEP",
        why: whyOrder ? null : { title: "Why do the first row and column wait?", text: "They hold the markers we are reading right now. If we cleared them first, every flag would become 0 and every cell would be wiped. They are cleared **last**, once nobody needs the markers any more." } });
      whyOrder = true;
    }
    T.phase("Clear the first row and column");
    if (row0) for (let j = 0; j < C; j++) set0(0, j, "bad");
    T.step("zrow", { vars: { row0 }, state: S({ read: row0 ? [] : undefined }), say: row0 ? "`row0` is true: the first row held a zero originally, so the **whole first row** is cleared." : "`row0` is false: the first row is left as the marking pass left it (only columns that need clearing have a 0 in it).", op: `row0 == ${row0}  →  ${row0 ? "clear row 0" : "skip"}`, act: row0 ? "CLEAR_ROW0" : "SKIP_ROW0" });
    if (col0) for (let i = 0; i < R; i++) set0(i, 0, "bad");
    T.step("zcol", { vars: { col0 }, state: S(), say: col0 ? "`col0` is true: the first column held a zero originally, so the **whole first column** is cleared. The matrix is finished." : "`col0` is false: the first column is left as it is. The matrix is finished.", op: `col0 == ${col0}  →  ${col0 ? "clear column 0" : "skip"}`, act: col0 ? "CLEAR_COL0" : "DONE" });
    T.result(M.map((r) => r.slice()));
  },
  fuzz(rnd) {
    const R = 1 + Math.floor(rnd() * 5), C = 1 + Math.floor(rnd() * 5);
    return { matrix: Array.from({ length: R }, () => Array.from({ length: C }, () => (rnd() < 0.22 ? 0 : 1 + Math.floor(rnd() * 8)))) };
  },
  gen(n) { const m = Array.from({ length: n }, () => new Array(n).fill(1)); m[n >> 1][n >> 1] = 0; return { matrix: m }; },

  complexity: {
    time: {
      tex: "O(mn)", title: "a constant number of passes over the matrix", short: "four passes, each visiting at most every cell once",
      derive: [
        "T_{\\text{scan}} = (n + m)\\, c_1 || the two flag scans of the first row and column",
        "T_{\\text{mark}} = (m-1)(n-1)\\, c_2 || one visit per inner cell",
        "T_{\\text{fill}} = (m-1)(n-1)\\, c_3 || another visit per inner cell",
        "T_{\\text{edges}} \\le (n + m)\\, c_4 || clearing the first row and column",
        "!T(m,n) \\le 2mn\\,c + 2(m+n)\\,c = O(mn) || since $m + n \\le 2mn$ for $m, n \\ge 1$",
      ],
      where: "Here $m$ is the number of rows and $n$ the number of columns. The measured table uses an $N \\times N$ matrix, so the number of cells is $N^2$; doubling the side multiplies the work by about 4.",
    },
    space: {
      tex: "O(1)", title: "two booleans", short: "`row0` and `col0`",
      derive: [
        "S = |\\text{row0}| + |\\text{col0}| + |R| + |C| = c || two flags and two loop bounds",
        "!S = O(1) || the markers live inside the matrix itself",
      ],
      where: "The simple solution uses two arrays of $m$ and $n$ booleans: $O(m + n)$. Reusing the first row and column for them removes even that.",
    },
    limit: "Every cell may have to change, and each cell must be read to find the zeros, so $\\Omega(mn)$ time is needed. $O(1)$ space is optimal.",
    measure: { label: "N = side of an N × N matrix", fTex: "N^2", f: (n) => n * n, sizes: [4, 8, 16, 32, 64], growth: "quadratic in the side, i.e. linear in the number of cells", reading: "Doubling the side multiplies the work by about **4**: the work is linear in the number of cells." },
  },

  mistakes: [
    { title: "Clearing the row and column immediately", what: "Setting `m[i][k] = 0` and `m[k][j] = 0` as soon as a zero is found.", why: "It is the direct translation of the statement.", breaks: "The new zeros are read as original zeros later in the scan, so the clearing cascades and often wipes the whole matrix.", avoid: "Record first (markers), clear in a second pass." },
    { title: "Using the first row and column without saving their status", what: "Skipping `row0` and `col0`.", why: "Once they hold markers, it feels natural to treat every zero there as a marker.", breaks: "A matrix like `[[1,0],[2,3]]` loses the fact that row 0 itself must be cleared, or clears row 0 when it holds only markers.", avoid: "Save the two booleans **before** writing any marker." },
    { title: "Clearing the first row or column too early", what: "Zeroing row 0 or column 0 before the inner cells are processed.", why: "They look like \"just another row\".", breaks: "All the markers turn into zeros at once, so every inner cell is cleared: an all-zero matrix.", avoid: "Process the inner cells first; clear the first row and column last." },
    { title: "Looping from 0 instead of 1 in the inner passes", what: "`for (i = 0 ...) for (j = 0 ...)` in the marking or clearing pass.", why: "Habit: matrices are scanned from the origin.", breaks: "Marker cells are read as data (and a marker at `m[0][0]` mixes row and column flags).", avoid: "Inner passes start at 1; the first row and column have their own handling." },
    { title: "Using a sentinel value as the marker", what: "Writing `-1` or `INT_MIN` instead of `0` for \"to be cleared\".", why: "It keeps the original zeros distinct from the marks.", breaks: "The matrix may legitimately contain that value, which would be cleared by mistake (the constraints allow any 32-bit integer).", avoid: "Use the markers as designed (zeros in the first row/column) with the saved booleans." },
  ],

  followUps: [
    {
      q: "Do it with $O(m + n)$ extra space using two boolean arrays. When is that enough?",
      a: "Record which rows and which columns contain a zero in `row[m]` and `col[n]`, then clear every cell whose row or column is flagged. It is $O(mn)$ time and $O(m + n)$ space and much easier to get right; in an interview this is the usual first answer, and the first-row/first-column version is the follow-up.",
      cpp: `void setZeroesSimple(vector<vector<int>>& m) {
    int R = m.size(), C = m[0].size();
    vector<bool> row(R), col(C);
    for (int i = 0; i < R; i++)
        for (int j = 0; j < C; j++)
            if (m[i][j] == 0) { row[i] = true; col[j] = true; }
    for (int i = 0; i < R; i++)
        for (int j = 0; j < C; j++)
            if (row[i] || col[j]) m[i][j] = 0;
}`,
      js: `function setZeroesSimple(m) {
  const R = m.length, C = m[0].length;
  const row = new Array(R).fill(false), col = new Array(C).fill(false);
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++)
      if (m[i][j] === 0) { row[i] = true; col[j] = true; }
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++)
      if (row[i] || col[j]) m[i][j] = 0;
}`,
      time: "O(mn)", space: "O(m + n)",
    },
    {
      q: "The matrix is **huge and sparse** (very few zeros). Can we do better than touching every cell?",
      a: "Keep only the *sets* of rows and columns that contain a zero (found while reading the non-zero entries from a sparse representation). Clearing then costs $O(\\text{zeros} \\cdot (m + n))$ in the worst case, but in a sparse format the cleared rows and columns can simply be recorded as \"all zero\" without writing each cell.",
      time: "O(number of zeros · (m + n))", space: "O(m + n)",
    },
    {
      q: "**Game of Life:** compute the next generation of a board in place.",
      a: "It has the same difficulty: every cell's new value depends on the *old* values of its neighbours. Encode both states in each cell (for example `0 = dead→dead`, `1 = live→live`, `2 = live→dead`, `3 = dead→live`), update in one pass, then decode in a second pass. Again, two passes and in-place encoding replace an extra copy.",
      time: "O(mn)", space: "O(1)",
    },
    {
      q: "Set the **diagonal and anti-diagonal** to zero instead (the cells of a zero's row and column replaced by its diagonals).",
      a: "The same mark-then-clear idea works with different markers: an array of size $m + n - 1$ for each of the two diagonal directions (index $i - j + n - 1$ and $i + j$). First pass sets the markers, second pass clears cells whose diagonal marker is set.",
      time: "O(mn)", space: "O(m + n)",
    },
  ],

  related: [
    { id: "rotate-image", why: "Another in-place matrix problem: the order in which you overwrite cells is what makes it correct." },
    { id: "spiral-matrix", why: "A different way of walking a matrix, with boundaries instead of markers." },
    { id: "number-of-islands", why: "Also changes the grid while scanning it (sinking land): the same \"mark as you go\" idea." },
    { id: "product-of-array-except-self", why: "Another case of reusing the output (or input) storage to remember information for a second pass." },
  ],
  patternNote: "**Reuse the input as storage.** When a second pass needs facts that the first pass finds, and extra memory is forbidden, look for space you may overwrite safely (the first row and column here). Save the information those cells already hold, use them as flags, and restore or clear them **last**.",
  takeaways: [
    "Every zero in the **original** matrix clears its row and column; clearing instantly would cascade.",
    "Mark first, clear second: the first row and column serve as the flag arrays.",
    "Save `row0` and `col0` **before** writing markers, and clear the first row and column **last**.",
    "Inner passes run from index 1; single rows, single columns and `[[0]]` work through the saved flags.",
    "Time $O(mn)$, space $O(1)$ (the simple version uses $O(m + n)$).",
  ],
});
