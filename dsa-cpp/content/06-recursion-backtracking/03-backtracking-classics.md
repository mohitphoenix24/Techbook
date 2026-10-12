---
title: Backtracking Classics — N-Queens, Sudoku, Word Search
level: advanced
time: 60
summary: Constraint-satisfaction backtracking — fast validity checks with arrays and bitmasks, N-Queens (including the bitmask version), a Sudoku solver, grid backtracking with in-place visited marks (Word Search), and generation problems (Generate Parentheses, Letter Combinations, Palindrome Partitioning).
---

The previous lesson generated *everything*. Here the goal is to find solutions that satisfy **constraints**, as fast as possible. The craft is in two things: checking validity in $O(1)$, and pruning as early as possible.

:::tip The two speed-ups for constraint backtracking
1. **O(1) validity checks.** Don't rescan the board for every placement. Keep arrays or bitmasks of what's used (columns, diagonals, rows, boxes) and update them on choose/un-choose.
2. **Prune early, and pick the most constrained spot first.** Fail fast. For Sudoku, filling the cell with the **fewest** candidates first (the MRV heuristic) shrinks the tree enormously.
:::

## N-Queens

Place `n` queens on an `n×n` board so that no two attack each other (same row, column or diagonal). Placing **one queen per row** removes the row constraint entirely. We then only need to track columns and the two diagonal directions:

- cells on the same ↘ diagonal have the same $r - c$;
- cells on the same ↙ anti-diagonal have the same $r + c$.

```viz algo=n-queens
```

:::problem N-Queens {level=hard lc=n-queens tags="backtracking,constraint satisfaction"}
Return all distinct board configurations for `n` queens.

Example: `n=4` → 2 solutions.

:::hint Hint
Row by row. `cols[c]`, `diag[r+c]`, `anti[r-c+n-1]` tell you in O(1) whether a square is attacked. Set them when placing a queen, clear them when removing it.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<string>> solveNQueens(int n) {
    vector<vector<string>> out;
    vector<string> board(n, string(n, '.'));
    vector<bool> col(n), d1(2 * n - 1), d2(2 * n - 1);
    function<void(int)> place = [&](int r) {
        if (r == n) { out.push_back(board); return; }
        for (int c = 0; c < n; c++) {
            if (col[c] || d1[r + c] || d2[r - c + n - 1]) continue;              // attacked
            col[c] = d1[r + c] = d2[r - c + n - 1] = true;  board[r][c] = 'Q';   // choose
            place(r + 1);                                                        // explore
            col[c] = d1[r + c] = d2[r - c + n - 1] = false; board[r][c] = '.';   // un-choose
        }
    };
    place(0);
    return out;
}

int main() {
    auto sols = solveNQueens(4);
    for (auto& b : sols) { for (auto& row : b) cout << row << '\n'; cout << '\n'; }
    for (int n = 1; n <= 9; n++) cout << "n=" << n << ": " << solveNQueens(n).size() << " solutions\n";
}
```

:::complexity
Time | O(n!) | upper bound: row r has at most n − r free columns; pruning makes it much faster in practice
Space | O(n) | plus the output
:::
:::
:::

### Bitmask N-Queens: counting solutions very fast

For **counting** (N-Queens II), keep three bitmasks of attacked columns. Shifting the diagonal masks by one bit per row moves the attacks down the board:

```cpp run level=advanced title="N-Queens II with bitmasks"
#include <bits/stdc++.h>
using namespace std;

int full;
long long countQ(int cols, int d1, int d2) {
    if (cols == full) return 1;                              // every column used = all queens placed
    long long total = 0;
    int avail = full & ~(cols | d1 | d2);                    // free squares in this row
    while (avail) {
        int bit = avail & -avail;                            // lowest free square
        avail -= bit;
        total += countQ(cols | bit, (d1 | bit) << 1, (d2 | bit) >> 1);
    }
    return total;
}

int main() {
    for (int n : {4, 8, 12, 13}) {
        full = (1 << n) - 1;
        cout << "n=" << n << ": " << countQ(0, 0, 0) << '\n';
    }
}
```

## Problems

:::problem Sudoku Solver {level=hard lc=sudoku-solver tags="backtracking,bitmask,MRV"}
Fill a 9×9 Sudoku (empty cells are `'.'`). The puzzle has exactly one solution.

:::hint Hint 1
Keep 9-bit masks of the digits used in each row, column and box. A cell's candidates are `~(row | col | box) & 0x1FF`.
:::

:::hint Hint 2
Always fill the empty cell with the **fewest** candidates next. It fails fast and makes the search tree tiny.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Sudoku {
    vector<string>& b;
    array<int, 9> row{}, col{}, box{};
    explicit Sudoku(vector<string>& board) : b(board) {
        for (int r = 0; r < 9; r++) for (int c = 0; c < 9; c++)
            if (b[r][c] != '.') flip(r, c, b[r][c] - '1');
    }
    void flip(int r, int c, int d) { row[r] ^= 1 << d; col[c] ^= 1 << d; box[r / 3 * 3 + c / 3] ^= 1 << d; }
    bool solve() {
        int br = -1, bc = -1, bestCount = 10, bestMask = 0;
        for (int r = 0; r < 9; r++) for (int c = 0; c < 9; c++) {
            if (b[r][c] != '.') continue;
            int mask = ~(row[r] | col[c] | box[r / 3 * 3 + c / 3]) & 0x1FF;
            int cnt = __builtin_popcount(mask);
            if (cnt < bestCount) { bestCount = cnt; br = r; bc = c; bestMask = mask; }
        }
        if (br == -1) return true;                          // no empty cell: solved
        for (int m = bestMask; m; m &= m - 1) {             // try each candidate digit
            int d = __builtin_ctz(m);
            b[br][bc] = '1' + d; flip(br, bc, d);
            if (solve()) return true;
            flip(br, bc, d); b[br][bc] = '.';
        }
        return false;                                       // dead end: backtrack
    }
};

int main() {
    vector<string> b = {"53..7....", "6..195...", ".98....6.", "8...6...3", "4..8.3..1",
                        "7...2...6", ".6....28.", "...419..5", "....8..79"};
    Sudoku s(b);
    s.solve();
    for (auto& row : b) cout << row << '\n';
}
```

:::complexity
Time | O(9^{E}) | E empty cells, the worst-case bound; MRV + bitmasks make real puzzles take milliseconds
Space | O(E) | recursion depth
:::
:::
:::

:::problem Word Search {level=medium lc=word-search tags="backtracking,grid,DFS"}
Return whether `word` can be traced in a grid of letters by moving between horizontally or vertically adjacent cells, without reusing a cell.

Example: board `["ABCE","SFCS","ADEE"]`, `"ABCCED"` → `true`, `"ABCB"` → `false`.

:::hint Hint
DFS from every cell that matches `word[0]`. Mark the current cell as visited **in place** (e.g. set it to `'#'`) and restore it when you backtrack.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool exist(vector<string>& b, const string& w) {
    int R = b.size(), C = b[0].size();
    function<bool(int, int, int)> dfs = [&](int r, int c, int k) {
        if (k == (int)w.size()) return true;
        if (r < 0 || r >= R || c < 0 || c >= C || b[r][c] != w[k]) return false;
        char saved = b[r][c];
        b[r][c] = '#';                                        // mark as visited
        bool found = dfs(r + 1, c, k + 1) || dfs(r - 1, c, k + 1) || dfs(r, c + 1, k + 1) || dfs(r, c - 1, k + 1);
        b[r][c] = saved;                                      // restore (backtrack)
        return found;
    };
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) if (dfs(r, c, 0)) return true;
    return false;
}

int main() {
    vector<string> b = {"ABCE", "SFCS", "ADEE"};
    cout << boolalpha << exist(b, "ABCCED") << ' ' << exist(b, "SEE") << ' ' << exist(b, "ABCB") << '\n';
}
```

:::complexity
Time | O(R \cdot C \cdot 3^{L}) | each step has at most 3 new directions (it can't go back); L = word length
Space | O(L) | recursion depth
:::

Searching for **many** words in the same grid? Build a trie of the words and do one DFS (*Word Search II*, in the Tries lesson).
:::
:::

:::problem Generate Parentheses {level=medium lc=generate-parentheses tags="backtracking,Catalan"}
Generate all valid strings of `n` pairs of parentheses.

Example: `n=3` → `["((()))","(()())","(())()","()(())","()()()"]`.

:::hint Hint
Track how many `(` and `)` you've used. You may add `(` while `open < n`, and `)` while `close < open`. Then every generated string is valid, and no checking is needed afterwards.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void gen(int n, int open, int close, string& cur, vector<string>& out) {
    if ((int)cur.size() == 2 * n) { out.push_back(cur); return; }
    if (open < n)     { cur.push_back('('); gen(n, open + 1, close, cur, out); cur.pop_back(); }
    if (close < open) { cur.push_back(')'); gen(n, open, close + 1, cur, out); cur.pop_back(); }
}

int main() {
    vector<string> out; string cur;
    gen(3, 0, 0, cur, out);
    for (auto& s : out) cout << s << ' ';
    cout << '\n';
    for (int n = 1; n <= 8; n++) { out.clear(); gen(n, 0, 0, cur, out); cout << out.size() << ' '; }
    cout << " <- Catalan numbers\n";
}
```

:::complexity
Time | O\!\left(\frac{4^n}{\sqrt n}\right) | about $4^n / n^{3/2}$ results (the Catalan number), O(n) each
Space | O(n) |
:::
:::
:::

:::problem Letter Combinations of a Phone Number {level=medium lc=letter-combinations-of-a-phone-number tags="backtracking"}
Map digits 2–9 to letters like a phone keypad. Return all letter combinations for a digit string.

Example: `"23"` → `["ad","ae","af","bd","be","bf","cd","ce","cf"]`.

:::hint Hint
One level per digit. At each level, branch on that digit's letters.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<string> letterCombinations(const string& digits) {
    if (digits.empty()) return {};
    const vector<string> keys = {"", "", "abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"};
    vector<string> out; string cur;
    function<void(int)> dfs = [&](int i) {
        if (i == (int)digits.size()) { out.push_back(cur); return; }
        for (char ch : keys[digits[i] - '0']) { cur.push_back(ch); dfs(i + 1); cur.pop_back(); }
    };
    dfs(0);
    return out;
}

int main() { for (auto& s : letterCombinations("23")) cout << s << ' '; cout << '\n'; }
```

:::complexity
Time | O(4^n \cdot n) | up to 4 letters per digit
Space | O(n) |
:::
:::
:::

:::problem Palindrome Partitioning {level=medium lc=palindrome-partitioning tags="backtracking,DP precompute"}
Split `s` so that every piece is a palindrome. Return all such partitions.

Example: `"aab"` → `[["a","a","b"],["aa","b"]]`.

:::hint Hint
At position `start`, try every end `e` such that `s[start..e]` is a palindrome, then recurse from `e+1`. Precompute `isPal[i][j]` with DP so each check is O(1).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<string>> partition(const string& s) {
    int n = s.size();
    vector<vector<bool>> pal(n, vector<bool>(n, false));
    for (int i = n - 1; i >= 0; i--)                         // pal[i][j]: ends match and the inside is a palindrome
        for (int j = i; j < n; j++)
            pal[i][j] = s[i] == s[j] && (j - i < 2 || pal[i + 1][j - 1]);
    vector<vector<string>> out; vector<string> cur;
    function<void(int)> dfs = [&](int start) {
        if (start == n) { out.push_back(cur); return; }
        for (int e = start; e < n; e++)
            if (pal[start][e]) {
                cur.push_back(s.substr(start, e - start + 1));
                dfs(e + 1);
                cur.pop_back();
            }
    };
    dfs(0);
    return out;
}

int main() {
    for (auto& p : partition("aab")) { cout << '['; for (auto& x : p) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot 2^n) | up to 2^(n−1) partitions, O(n) each
Space | O(n^2) | the palindrome table
:::
:::
:::

## Check yourself

```quiz
? Which quantity is constant along a ↘ diagonal of a board?
+ r − c
- r + c
- r · c
> r + c is constant along ↙ anti-diagonals.

? Why mark a Word Search cell as '#' and then restore it?
+ To forbid reusing it in the current path, while still allowing other paths to use it
- To speed up the comparison
- To count the visited cells
> Restoring it is the un-choose step.

? In Generate Parentheses, when may you add ')'?
+ When close < open
- When close < n
- Always
> Then the prefix never has more ')' than '('.
```

:::keypoints
- Constraint backtracking = place → check in $O(1)$ with arrays or bitmasks → recurse → undo.
- N-Queens: one queen per row; track columns, $r+c$ and $r-c$. Bitmask shifts make counting very fast.
- Sudoku: row/column/box masks + "fewest candidates first" (MRV).
- Grid search: mark visited cells in place and restore them on the way back.
- Generate only valid states (parentheses) instead of filtering afterwards. Precompute checks (palindrome table) to keep each step $O(1)$.
:::
