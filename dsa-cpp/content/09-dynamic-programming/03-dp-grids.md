---
title: 2D Dynamic Programming on Grids
level: intermediate
time: 50
summary: DP over grid cells — counting paths (with the C(m+n−2, m−1) closed form derived), obstacles, minimum path sums, rolling a 2D table down to one row, the bottom-up triangle trick, the largest square of 1s (with why min of three neighbours works), and Dungeon Game, where the DP must run backwards.
---

In grid problems where you may only move **right/down** (or the moves otherwise never form a cycle), each cell's answer depends on cells already computed, so it's a natural 2D DP. (When moves can go in all four directions, cycles appear, and it becomes a shortest-path problem instead.)

:::pattern
State: `dp[r][c]` = the answer for reaching (or starting from) cell (r, c).
Transition: combine the cells you could have come from, usually up `(r−1, c)` and left `(r, c−1)`.
Order: row by row, left to right (or backwards when the dependency goes the other way).
Space: a row only depends on the previous row, so one 1D array is enough.
:::

## Problems

:::problem Unique Paths {level=medium lc=unique-paths tags="dynamic programming,grid,combinatorics"}
A robot at the top-left of an `m × n` grid moves only right or down. How many distinct paths lead to the bottom-right?

Example: `m=3, n=7` → `28`.

:::hint Hint
`paths[r][c] = paths[r−1][c] + paths[r][c−1]`: the last move came from above or from the left. The first row and column have exactly 1 path each.
:::

:::solution
**DP** with one rolling row, plus the **closed form**.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int uniquePaths(int m, int n) {
    vector<int> row(n, 1);                          // the first row: all 1s
    for (int r = 1; r < m; r++)
        for (int c = 1; c < n; c++) row[c] += row[c - 1];   // row[c] (from above) + row[c-1] (from the left)
    return row[n - 1];
}

long long uniquePathsFormula(int m, int n) {      // C(m+n-2, m-1), computed step by step
    long long res = 1;
    int k = min(m, n) - 1, N = m + n - 2;
    for (int i = 1; i <= k; i++) res = res * (N - k + i) / i;     // exact at every step
    return res;
}

int main() { cout << uniquePaths(3, 7) << ' ' << uniquePaths(3, 2) << ' ' << uniquePathsFormula(3, 7) << ' ' << uniquePathsFormula(10, 10) << '\n'; }
```

:::derive Why the answer is C(m+n−2, m−1)
\text{every path makes } (m-1) \text{ down moves and } (n-1) \text{ right moves} || it must reach row m−1 and column n−1
\text{total moves} = m + n - 2 || in some order
\text{a path} = \text{choosing which of those moves are "down"} || the rest are "right"
! \#\text{paths} = \binom{m+n-2}{m-1} || e.g. 3×7: C(8,2) = 28
:::

:::complexity
Time | O(mn) | DP; O(min(m, n)) with the formula
Space | O(n) |
:::
:::
:::

:::problem Unique Paths II {level=medium lc=unique-paths-ii tags="dynamic programming,grid"}
The same, but some cells are obstacles (`1`), and a path can't pass through them.

:::hint Hint
An obstacle cell has 0 paths. The first row and column are no longer all 1s: everything after an obstacle there gets 0.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int uniquePathsWithObstacles(const vector<vector<int>>& g) {
    int n = g[0].size();
    vector<long long> row(n, 0);
    row[0] = 1;
    for (auto& r : g)
        for (int c = 0; c < n; c++) {
            if (r[c] == 1) row[c] = 0;              // blocked
            else if (c > 0) row[c] += row[c - 1];   // from above (old row[c]) + from the left
        }
    return row[n - 1];
}

int main() { cout << uniquePathsWithObstacles({{0, 0, 0}, {0, 1, 0}, {0, 0, 0}}) << ' ' << uniquePathsWithObstacles({{0, 1}, {0, 0}}) << ' ' << uniquePathsWithObstacles({{1}}) << '\n'; }
```

:::complexity
Time | O(mn) |
Space | O(n) |
:::
:::
:::

:::problem Minimum Path Sum {level=medium lc=minimum-path-sum tags="dynamic programming,grid"}
Find a path from the top-left to the bottom-right (moving right or down) with the minimum sum of cell values.

Example: `[[1,3,1],[1,5,1],[4,2,1]]` → `7`.

:::hint Hint
`dp[r][c] = grid[r][c] + min(dp[r−1][c], dp[r][c−1])`, being careful at the edges.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minPathSum(const vector<vector<int>>& g) {
    int R = g.size(), C = g[0].size();
    vector<int> dp(C, INT_MAX);
    dp[0] = 0;
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++)
            dp[c] = g[r][c] + (c == 0 ? dp[0] : min(dp[c], dp[c - 1]));   // dp[c] still holds the row above
    return dp[C - 1];
}

int main() { cout << minPathSum({{1, 3, 1}, {1, 5, 1}, {4, 2, 1}}) << ' ' << minPathSum({{1, 2, 3}, {4, 5, 6}}) << '\n'; }
```

:::complexity
Time | O(RC) |
Space | O(C) |
:::
:::
:::

:::problem Triangle {level=medium lc=triangle tags="dynamic programming,bottom-up"}
Find the minimum path sum from the top of a triangle to its bottom row. From index `i` in one row you may move to `i` or `i+1` in the next row.

Example: `[[2],[3,4],[6,5,7],[4,1,8,3]]` → `11` (2+3+5+1).

:::hint Hint
Go **bottom-up**: start with the last row, and each cell becomes its value + min(the two cells below). The top cell is then the answer. No edge cases!
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minimumTotal(const vector<vector<int>>& t) {
    vector<int> dp = t.back();                               // best from each bottom cell = itself
    for (int r = (int)t.size() - 2; r >= 0; r--)
        for (int i = 0; i <= r; i++) dp[i] = t[r][i] + min(dp[i], dp[i + 1]);
    return dp[0];
}

int main() { cout << minimumTotal({{2}, {3, 4}, {6, 5, 7}, {4, 1, 8, 3}}) << ' ' << minimumTotal({{-10}}) << '\n'; }
```

:::complexity
Time | O(n^2) | n rows
Space | O(n) |
:::

Choosing the **direction** of a DP can remove all the boundary cases. Going top-down, the left and right edges of each row would need special handling.
:::
:::

:::problem Maximal Square {level=medium lc=maximal-square tags="dynamic programming,grid"}
Find the area of the largest square containing only `'1'`s in a binary matrix.

:::hint Hint
`dp[r][c]` = the side of the largest all-1 square whose **bottom-right corner** is at (r, c). It's `1 + min(up, left, up-left)` when the cell is '1'.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maximalSquare(const vector<string>& m) {
    int R = m.size(), C = m[0].size(), best = 0;
    vector<int> dp(C + 1, 0);
    for (int r = 1; r <= R; r++) {
        int diag = 0;                                       // dp[r-1][c-1]
        for (int c = 1; c <= C; c++) {
            int up = dp[c];
            dp[c] = (m[r - 1][c - 1] == '1') ? 1 + min({up, dp[c - 1], diag}) : 0;
            diag = up;
            best = max(best, dp[c]);
        }
    }
    return best * best;
}

int main() { cout << maximalSquare({"10100", "10111", "11111", "10010"}) << ' ' << maximalSquare({"01", "10"}) << '\n'; }
```

:::proof Why min of the three neighbours + 1
Let $s = \min(\text{up}, \text{left}, \text{diag})$. The squares of side $s$ ending at the up, left and diagonal cells together cover the whole $(s+1) \times (s+1)$ square ending at (r, c), except the cell (r, c) itself, which is '1'. So a square of side $s + 1$ exists. It can't be bigger: if a square of side $s + 2$ ended at (r, c), the square of side $s + 1$ ending at the smallest of the three neighbours would also exist, contradicting the minimum.
:::

:::complexity
Time | O(RC) |
Space | O(C) |
:::
:::
:::

:::problem Dungeon Game {level=hard lc=dungeon-game tags="dynamic programming,grid,backward DP"}
A knight goes from the top-left to the bottom-right (moving right or down). Each cell adds or removes health. If his health ever drops to 0 or below, he dies. Return the minimum **starting** health he needs.

Example: `[[-2,-3,3],[-5,-10,1],[10,30,-5]]` → `7`.

:::hint Hint 1
A forward DP doesn't work: the best path so far isn't enough, because you'd also need to know the lowest health along the way.
:::

:::hint Hint 2
Go **backwards**. `need[r][c]` = the minimum health on **entering** (r, c) to survive to the end: `max(1, min(need[down], need[right]) − dungeon[r][c])`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int calculateMinimumHP(const vector<vector<int>>& d) {
    int R = d.size(), C = d[0].size();
    vector<int> need(C + 1, INT_MAX);
    need[C - 1] = 1;                                   // the "cell" just past the princess needs 1 health
    for (int r = R - 1; r >= 0; r--) {
        if (r < R - 1) need[C] = INT_MAX;
        for (int c = C - 1; c >= 0; c--) {
            int next = min(need[c], need[c + 1]);        // the better of down / right
            if (r == R - 1 && c == C - 1) next = 1;
            need[c] = max(1, next - d[r][c]);
        }
    }
    return need[0];
}

int main() { cout << calculateMinimumHP({{-2, -3, 3}, {-5, -10, 1}, {10, 30, -5}}) << ' ' << calculateMinimumHP({{0}}) << ' ' << calculateMinimumHP({{100}}) << '\n'; }
```

:::complexity
Time | O(RC) |
Space | O(C) |
:::

The lesson: if the future decides what's best now, run the DP from the end. The state "minimum health needed from here on" has optimal substructure. "Health so far" doesn't.
:::
:::

## Check yourself

```quiz
? Unique Paths on a 3×3 grid (right/down moves) has how many paths?
+ 6
- 9
- 4
> C(4, 2) = 6.

? In Maximal Square, dp[r][c] = 1 + min(up, left, diag). What does dp[r][c] represent?
+ The side length of the largest all-1 square ending at (r, c) as its bottom-right corner
- The area of the largest square so far
- The number of 1s above
> The answer is the max side, squared.

? Why must Dungeon Game's DP run from the bottom-right?
+ The minimum starting health depends on what comes later on the path
- Because of the movement rules
- To save memory
> "Need from here on" has optimal substructure; "health so far" doesn't.
```

:::keypoints
- Grid DP: `dp[r][c]` from the up/left neighbours. Process row by row. One rolling row is enough.
- Counting paths: add the neighbours. Unique Paths = $\binom{m+n-2}{m-1}$.
- Choose the direction that removes edge cases (triangle bottom-up) or that has optimal substructure (dungeon backwards).
- Maximal square: `1 + min(up, left, diag)`.
:::
