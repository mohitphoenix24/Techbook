---
title: Matrix Techniques
level: intermediate
time: 50
summary: Working with 2D grids — row-major indexing and flattening, layer-by-layer traversal (spiral), in-place rotation by transpose + reverse (with proof), using the first row/column as O(1) markers, staircase search in a sorted matrix (with proof), encoding two states in one cell, and hashing rows/columns/boxes for Sudoku.
---

Matrix problems look visual and tricky, but they come down to a few techniques: **indexing**, **traversal order**, **in-place transformations**, and **storing extra state cleverly**.

## Indexing and flattening

An $R \times C$ matrix stored row by row (row-major, like C++ arrays) maps cell $(r, c)$ to the 1D index $k = r \cdot C + c$, and back with $r = k / C$, $c = k \bmod C$. This lets you **binary-search a sorted matrix as if it were a 1D array**.

| Useful relation | Formula |
|---|---|
| main diagonal | $r = c$ |
| anti-diagonal | $r + c = n - 1$ |
| same diagonal (↘) | $r - c$ is constant |
| same anti-diagonal (↙) | $r + c$ is constant |
| transpose | $(r, c) \to (c, r)$ |
| rotate 90° clockwise | $(r, c) \to (c,\, n-1-r)$ |

## Rotating in place: transpose + reverse

:::derive Why transpose then reverse each row rotates 90° clockwise
(r, c) \xrightarrow{\text{transpose}} (c, r) || swap row and column
(c, r) \xrightarrow{\text{reverse row}} (c,\, n-1-r) || mirror each row left to right
! (r, c) \to (c,\, n-1-r) \text{ is exactly a 90° clockwise rotation} || e.g. the top-left corner (0,0) goes to the top-right (0, n−1)
:::

Other rotations: counter-clockwise = transpose, then reverse each **column** (or reverse the rows, then transpose). 180° = reverse the rows, then reverse each row.

## Problems

:::problem Rotate Image {level=medium lc=rotate-image tags="matrix,in-place"}
Rotate an $n \times n$ matrix 90° clockwise **in place**.

Example: `[[1,2,3],[4,5,6],[7,8,9]]` → `[[7,4,1],[8,5,2],[9,6,3]]`.

:::hint Hint
A rotation is a transpose followed by a mirror. Both can be done in place by swapping.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void rotate(vector<vector<int>>& m) {
    int n = m.size();
    for (int r = 0; r < n; r++)
        for (int c = r + 1; c < n; c++) swap(m[r][c], m[c][r]);   // transpose (upper triangle only)
    for (auto& row : m) reverse(row.begin(), row.end());          // mirror each row
}

int main() {
    vector<vector<int>> m = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    rotate(m);
    for (auto& row : m) { for (int x : row) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(n^2) | every cell is touched a constant number of times
Space | O(1) |
:::

Swapping only the upper triangle (`c = r + 1`) matters: swapping every pair twice would undo the transpose.
:::
:::

:::problem Spiral Matrix {level=medium lc=spiral-matrix tags="matrix,simulation"}
Return all elements of an $R \times C$ matrix in spiral order (clockwise, starting top-left).

Example: `[[1,2,3],[4,5,6],[7,8,9]]` → `[1,2,3,6,9,8,7,4,5]`.

:::hint Hint
Keep four boundaries: `top`, `bottom`, `left`, `right`. Walk one side, then shrink that boundary. Check the boundaries again before walking back along the bottom and left sides, because a single remaining row or column must not be printed twice.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> spiralOrder(const vector<vector<int>>& m) {
    vector<int> out;
    int top = 0, bottom = m.size() - 1, left = 0, right = m[0].size() - 1;
    while (top <= bottom && left <= right) {
        for (int c = left; c <= right; c++) out.push_back(m[top][c]);
        top++;
        for (int r = top; r <= bottom; r++) out.push_back(m[r][right]);
        right--;
        if (top <= bottom) { for (int c = right; c >= left; c--) out.push_back(m[bottom][c]); bottom--; }
        if (left <= right) { for (int r = bottom; r >= top; r--) out.push_back(m[r][left]); left++; }
    }
    return out;
}

int main() {
    for (int x : spiralOrder({{1, 2, 3, 4}, {5, 6, 7, 8}, {9, 10, 11, 12}})) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(RC) |
Space | O(1) | besides the output
:::
:::
:::

:::problem Set Matrix Zeroes {level=medium lc=set-matrix-zeroes tags="matrix,in-place,O(1) space"}
If a cell is 0, set its entire row and column to 0, in place. Follow-up: use $O(1)$ extra space.

:::hint Hint 1
$O(R + C)$ space is easy: record which rows and columns contain a zero, then clear them.
:::

:::hint Hint 2
For $O(1)$ space, use the **first row and first column** as those markers. Remember separately whether the first row and column themselves need clearing.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void setZeroes(vector<vector<int>>& m) {
    int R = m.size(), C = m[0].size();
    bool firstRow = false, firstCol = false;
    for (int c = 0; c < C; c++) if (m[0][c] == 0) firstRow = true;
    for (int r = 0; r < R; r++) if (m[r][0] == 0) firstCol = true;
    for (int r = 1; r < R; r++)
        for (int c = 1; c < C; c++)
            if (m[r][c] == 0) m[r][0] = m[0][c] = 0;              // mark the row and column
    for (int r = 1; r < R; r++)
        for (int c = 1; c < C; c++)
            if (m[r][0] == 0 || m[0][c] == 0) m[r][c] = 0;
    if (firstRow) for (int c = 0; c < C; c++) m[0][c] = 0;
    if (firstCol) for (int r = 0; r < R; r++) m[r][0] = 0;
}

int main() {
    vector<vector<int>> m = {{0, 1, 2, 0}, {3, 4, 5, 2}, {1, 3, 1, 5}};
    setZeroes(m);
    for (auto& row : m) { for (int x : row) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(RC) |
Space | O(1) |
:::
:::
:::

:::problem Search a 2D Matrix II {level=medium lc=search-a-2d-matrix-ii tags="matrix,staircase search"}
Every row is sorted left to right and every column is sorted top to bottom. Return whether `target` is in the matrix.

:::hint Hint 1
Binary-searching each row is $O(R \log C)$. Can you use both orderings at once?
:::

:::hint Hint 2
Start at the **top-right** corner. Everything to its left is smaller and everything below it is larger. Each comparison removes a whole row or a whole column.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool searchMatrix(const vector<vector<int>>& m, int target) {
    int r = 0, c = (int)m[0].size() - 1;
    while (r < (int)m.size() && c >= 0) {
        if (m[r][c] == target) return true;
        if (m[r][c] > target) c--;      // the whole column below is even bigger
        else r++;                       // the whole row to the left is even smaller
    }
    return false;
}

int main() {
    vector<vector<int>> m = {{1, 4, 7, 11, 15}, {2, 5, 8, 12, 19}, {3, 6, 9, 16, 22}, {10, 13, 14, 17, 24}, {18, 21, 23, 26, 30}};
    cout << boolalpha << searchMatrix(m, 5) << ' ' << searchMatrix(m, 20) << '\n';
}
```

:::proof Why staircase search is correct
Invariant: if `target` is in the matrix, it lies in the sub-matrix of rows `r..R−1` and columns `0..c`. If `m[r][c] > target`, every cell in column `c` from row `r` down is ≥ `m[r][c] > target`, so column `c` can be dropped. If `m[r][c] < target`, every cell in row `r` from column `c` leftward is ≤ `m[r][c] < target`, so row `r` can be dropped. Each step drops a row or a column, so there are at most $R + C$ steps.
:::

:::complexity
Time | O(R + C) |
Space | O(1) |
:::

**Search a 2D Matrix (I)**, where each row starts after the previous row ends, is simpler: treat it as one sorted array of length $RC$ and binary-search it using $k \to (k / C, k \bmod C)$, which is $O(\log RC)$.
:::
:::

:::problem Valid Sudoku {level=medium lc=valid-sudoku tags="matrix,hashing,bitmask"}
Check whether a partially filled 9×9 Sudoku board is valid: no digit repeats in any row, column or 3×3 box. Empty cells are `'.'`.

:::hint Hint
Box index: `(r / 3) * 3 + c / 3`. Keep "seen" sets for the 9 rows, 9 columns and 9 boxes. A 9-bit mask per unit is enough.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isValidSudoku(const vector<string>& b) {
    array<int, 9> row{}, col{}, box{};             // bit d set = digit d+1 already seen
    for (int r = 0; r < 9; r++)
        for (int c = 0; c < 9; c++) {
            if (b[r][c] == '.') continue;
            int bit = 1 << (b[r][c] - '1'), k = (r / 3) * 3 + c / 3;
            if ((row[r] | col[c] | box[k]) & bit) return false;
            row[r] |= bit; col[c] |= bit; box[k] |= bit;
        }
    return true;
}

int main() {
    vector<string> b = {"53..7....", "6..195...", ".98....6.", "8...6...3", "4..8.3..1",
                        "7...2...6", ".6....28.", "...419..5", "....8..79"};
    cout << boolalpha << isValidSudoku(b) << ' ';
    b[0][0] = '8';                                   // now column 0 has two 8s
    cout << isValidSudoku(b) << '\n';
}
```

:::complexity
Time | O(81) | constant: the board is fixed size
Space | O(1) |
:::
:::
:::

:::problem Game of Life {level=medium lc=game-of-life tags="matrix,in-place,state encoding"}
Update a grid of live (1) and dead (0) cells to the next generation **in place**, using Conway's rules: a live cell with 2 or 3 live neighbours survives; a dead cell with exactly 3 becomes alive; every other cell dies or stays dead. All cells update **simultaneously**.

:::hint Hint
You need the old and the new state at the same time. Encode both in one integer: bit 0 = the current state, bit 1 = the next state. Shift right at the end.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void gameOfLife(vector<vector<int>>& g) {
    int R = g.size(), C = g[0].size();
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++) {
            int live = 0;
            for (int dr = -1; dr <= 1; dr++)
                for (int dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    int nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < R && nc >= 0 && nc < C) live += g[nr][nc] & 1;   // bit 0 = the OLD state
                }
            if ((g[r][c] & 1) && (live == 2 || live == 3)) g[r][c] |= 2;   // survives
            if (!(g[r][c] & 1) && live == 3) g[r][c] |= 2;                  // born
        }
    for (auto& row : g) for (int& x : row) x >>= 1;                         // next state becomes current
}

int main() {
    vector<vector<int>> g = {{0, 1, 0}, {0, 0, 1}, {1, 1, 1}, {0, 0, 0}};
    gameOfLife(g);
    for (auto& row : g) { for (int x : row) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(RC) | 8 neighbours per cell
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? Rotating an n×n matrix 90° clockwise in place can be done by…
+ Transposing, then reversing each row
- Reversing each row, then each column
- Swapping the two diagonals
> (r,c) → (c,r) → (c, n−1−r).

? Staircase search in a row- and column-sorted matrix starts at…
+ The top-right (or bottom-left) corner
- The center
- The top-left corner
> Only from those corners does one comparison rule out a whole row or column.

? In Game of Life in place, why keep two bits per cell?
+ Neighbours must see the OLD state while we write the NEW state
- To save time
- Because cells have four states in the rules
> Bit 0 = old, bit 1 = new, shift at the end.
```

:::keypoints
- Flatten with $k = rC + c$; diagonals have constant $r - c$ or $r + c$; box index `(r/3)*3 + c/3`.
- Rotate 90° clockwise = transpose + reverse rows.
- Spiral: four shrinking boundaries, with re-checks before the bottom and left sides.
- $O(1)$-space marking: reuse the first row/column, or extra bits in each cell.
- Sorted rows and columns: staircase search from a corner, $O(R + C)$.
:::
