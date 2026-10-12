---
title: Grid Problems as Graphs
level: intermediate
time: 55
summary: Grids are graphs in disguise — direction arrays, bounds checks, marking visited in place, flood fill and counting islands (DFS/BFS), multi-source BFS (Rotting Oranges, distance to nearest 0) and why it's correct, reverse thinking (Pacific Atlantic, Surrounded Regions), and 8-directional shortest paths.
---

"Islands", "rotting oranges", "walls and gates", "flood fill": grid problems are among the most frequent interview questions. They're plain graph traversals where **cells are vertices and adjacent cells are edges**. The skill is writing the boilerplate cleanly and choosing BFS or DFS correctly.

## The grid traversal toolkit

:::syntax
```cpp
int R = grid.size(), C = grid[0].size();
const int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};   // down, up, right, left
auto inside = [&](int r, int c) { return r >= 0 && r < R && c >= 0 && c < C; };

for (int k = 0; k < 4; k++) {
    int nr = r + dr[k], nc = c + dc[k];
    if (!inside(nr, nc) || seen[nr][nc] || grid[nr][nc] == WALL) continue;
    ...
}
```
:::

:::tip Mark visited in place
If you're allowed to modify the grid, overwrite visited cells (`'1'` → `'0'`, `1` → `2`) instead of keeping a separate `seen` array. It's less memory and less code. Mention it in an interview, and offer to restore the grid if needed.
:::

:::warn Recursive DFS on big grids
A 1000×1000 grid that is all land means a DFS recursion up to 10⁶ deep, which can overflow the stack in C++. BFS (or DFS with an explicit stack) is safe at any size.
:::

```viz algo=grid-bfs
```

## Multi-source BFS

To find, for every cell, the distance to the **nearest** source (the nearest rotten orange, the nearest 0, the nearest gate), don't run one BFS per source. Put **all sources in the queue at distance 0** and run one BFS.

:::proof Why multi-source BFS gives the distance to the nearest source
Add an imaginary "super source" with an edge of length 0 to every real source. A BFS from it is exactly a BFS that starts with all real sources in the queue. Shortest paths from the super source equal the minimum over the real sources. BFS computes shortest paths, so each cell gets its distance to the nearest source. The cost is a single $O(RC)$ pass, instead of $O(RC)$ per source.
:::

## Problems

:::problem Flood Fill {level=easy lc=flood-fill tags="grid,DFS,BFS"}
Starting from pixel `(sr, sc)`, recolor it and every 4-connected pixel with the **same original color** to `color`.

:::hint Hint
DFS from the start. Guard against `color == original`, or the DFS will loop forever, because recolored cells would still match.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> floodFill(vector<vector<int>> img, int sr, int sc, int color) {
    int orig = img[sr][sc];
    if (orig == color) return img;
    int R = img.size(), C = img[0].size();
    function<void(int, int)> dfs = [&](int r, int c) {
        if (r < 0 || r >= R || c < 0 || c >= C || img[r][c] != orig) return;
        img[r][c] = color;                                     // recoloring also marks it visited
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1);
    };
    dfs(sr, sc);
    return img;
}

int main() {
    for (auto& row : floodFill({{1, 1, 1}, {1, 1, 0}, {1, 0, 1}}, 1, 1, 2)) { for (int x : row) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(RC) |
Space | O(RC) | recursion depth in the worst case
:::
:::
:::

:::problem Number of Islands {level=medium lc=number-of-islands tags="grid,DFS,BFS,connected components"}
Count the islands in a grid of `'1'` (land) and `'0'` (water). An island is a 4-connected group of land cells.

Example: `["11000","11000","00100","00011"]` → `3`.

:::hint Hint
Scan every cell. When you find unvisited land, that's a new island: count it, then sink the whole island (BFS/DFS that turns `'1'` into `'0'`).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int numIslands(vector<string> g) {
    int R = g.size(), C = g[0].size(), islands = 0;
    const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++) {
            if (g[r][c] != '1') continue;
            islands++;
            queue<pair<int, int>> q; q.push({r, c}); g[r][c] = '0';     // BFS sinks the island
            while (!q.empty()) {
                auto [x, y] = q.front(); q.pop();
                for (int k = 0; k < 4; k++) {
                    int nx = x + dr[k], ny = y + dc[k];
                    if (nx >= 0 && nx < R && ny >= 0 && ny < C && g[nx][ny] == '1') { g[nx][ny] = '0'; q.push({nx, ny}); }
                }
            }
        }
    return islands;
}

int main() {
    cout << numIslands({"11110", "11010", "11000", "00000"}) << ' ' << numIslands({"11000", "11000", "00100", "00011"}) << '\n';
}
```

:::complexity
Time | O(RC) | every cell is processed once
Space | O(\min(R, C)) | the BFS frontier of a grid is at most about the width of the diagonal
:::
:::
:::

:::problem Max Area of Island {level=medium lc=max-area-of-island tags="grid,DFS"}
Return the area (number of cells) of the largest island in a 0/1 grid.

:::hint Hint
Same as counting islands, but the DFS returns the size of what it sinks.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxAreaOfIsland(vector<vector<int>> g) {
    int R = g.size(), C = g[0].size(), best = 0;
    function<int(int, int)> area = [&](int r, int c) -> int {
        if (r < 0 || r >= R || c < 0 || c >= C || g[r][c] != 1) return 0;
        g[r][c] = 0;
        return 1 + area(r + 1, c) + area(r - 1, c) + area(r, c + 1) + area(r, c - 1);
    };
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) best = max(best, area(r, c));
    return best;
}

int main() {
    cout << maxAreaOfIsland({{0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0},
                             {0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0},
                             {0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0},
                             {0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0}}) << '\n';
}
```

:::complexity
Time | O(RC) |
Space | O(RC) | recursion, worst case
:::
:::
:::

:::problem Rotting Oranges {level=medium lc=rotting-oranges tags="grid,multi-source BFS"}
`2` = rotten, `1` = fresh, `0` = empty. Every minute, fresh oranges next to a rotten one become rotten. Return the minutes until no fresh orange is left, or −1 if that never happens.

Example: `[[2,1,1],[1,1,0],[0,1,1]]` → `4`.

:::hint Hint
Multi-source BFS: queue **every** rotten orange at minute 0. Each BFS level is one minute. At the end, check whether any fresh orange is left.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int orangesRotting(vector<vector<int>> g) {
    int R = g.size(), C = g[0].size(), fresh = 0, minutes = 0;
    queue<pair<int, int>> q;
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) {
        if (g[r][c] == 2) q.push({r, c});
        else if (g[r][c] == 1) fresh++;
    }
    const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    while (!q.empty() && fresh > 0) {
        minutes++;
        for (int k = q.size(); k > 0; k--) {                 // one minute = one BFS level
            auto [r, c] = q.front(); q.pop();
            for (int d = 0; d < 4; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr < 0 || nr >= R || nc < 0 || nc >= C || g[nr][nc] != 1) continue;
                g[nr][nc] = 2; fresh--; q.push({nr, nc});
            }
        }
    }
    return fresh == 0 ? minutes : -1;
}

int main() { cout << orangesRotting({{2, 1, 1}, {1, 1, 0}, {0, 1, 1}}) << ' ' << orangesRotting({{2, 1, 1}, {0, 1, 1}, {1, 0, 1}}) << ' ' << orangesRotting({{0, 2}}) << '\n'; }
```

:::complexity
Time | O(RC) |
Space | O(RC) |
:::
:::
:::

:::problem 01 Matrix {level=medium lc=01-matrix tags="grid,multi-source BFS"}
For each cell of a 0/1 matrix, return the distance to the **nearest 0**.

:::hint Hint
Don't BFS from every 1. Start from **all 0s** at once (multi-source BFS).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> updateMatrix(const vector<vector<int>>& m) {
    int R = m.size(), C = m[0].size();
    vector<vector<int>> dist(R, vector<int>(C, -1));
    queue<pair<int, int>> q;
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) if (m[r][c] == 0) { dist[r][c] = 0; q.push({r, c}); }
    const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && dist[nr][nc] == -1) { dist[nr][nc] = dist[r][c] + 1; q.push({nr, nc}); }
        }
    }
    return dist;
}

int main() { for (auto& row : updateMatrix({{0, 0, 0}, {0, 1, 0}, {1, 1, 1}})) { for (int x : row) cout << x << ' '; cout << '\n'; } }
```

:::complexity
Time | O(RC) |
Space | O(RC) |
:::

A DP alternative does two passes (top-left → bottom-right, then the reverse), taking the min of neighbours + 1. That's also $O(RC)$.
:::
:::

:::problem Pacific Atlantic Water Flow {level=medium lc=pacific-atlantic-water-flow tags="grid,reverse BFS/DFS"}
Water flows from a cell to a neighbour with **equal or lower** height. The Pacific touches the top and left edges, the Atlantic the bottom and right edges. Return the cells from which water can reach **both** oceans.

:::hint Hint
Searching from every cell is $O((RC)^2)$. Reverse the flow: from each ocean's border, walk **uphill** (to neighbours with height ≥ the current one). Mark what each ocean can reach, then intersect.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<pair<int, int>> pacificAtlantic(const vector<vector<int>>& h) {
    int R = h.size(), C = h[0].size();
    auto flood = [&](vector<pair<int, int>> starts) {
        vector<vector<char>> ok(R, vector<char>(C, 0));
        queue<pair<int, int>> q;
        for (auto [r, c] : starts) if (!ok[r][c]) { ok[r][c] = 1; q.push({r, c}); }
        const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
        while (!q.empty()) {
            auto [r, c] = q.front(); q.pop();
            for (int d = 0; d < 4; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr < 0 || nr >= R || nc < 0 || nc >= C || ok[nr][nc] || h[nr][nc] < h[r][c]) continue;  // uphill only
                ok[nr][nc] = 1; q.push({nr, nc});
            }
        }
        return ok;
    };
    vector<pair<int, int>> pac, atl;
    for (int r = 0; r < R; r++) { pac.push_back({r, 0}); atl.push_back({r, C - 1}); }
    for (int c = 0; c < C; c++) { pac.push_back({0, c}); atl.push_back({R - 1, c}); }
    auto P = flood(pac), A = flood(atl);
    vector<pair<int, int>> out;
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) if (P[r][c] && A[r][c]) out.push_back({r, c});
    return out;
}

int main() {
    for (auto [r, c] : pacificAtlantic({{1, 2, 2, 3, 5}, {3, 2, 3, 4, 4}, {2, 4, 5, 3, 1}, {6, 7, 1, 4, 5}, {5, 1, 1, 2, 4}}))
        cout << '[' << r << ',' << c << "] ";
    cout << '\n';
}
```

:::complexity
Time | O(RC) | two BFS passes
Space | O(RC) |
:::
:::
:::

:::problem Surrounded Regions {level=medium lc=surrounded-regions tags="grid,reverse DFS"}
Capture every region of `'O'` that is completely surrounded by `'X'` (flip it to `'X'`). Regions of `'O'` connected to the **border** survive.

:::hint Hint
Reverse thinking again: mark every `'O'` reachable from a border `'O'` as safe (e.g. `'S'`). Then flip the remaining `'O'`s to `'X'` and the `'S'`s back to `'O'`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void solve(vector<string>& b) {
    int R = b.size(), C = b[0].size();
    function<void(int, int)> mark = [&](int r, int c) {
        if (r < 0 || r >= R || c < 0 || c >= C || b[r][c] != 'O') return;
        b[r][c] = 'S';
        mark(r + 1, c); mark(r - 1, c); mark(r, c + 1); mark(r, c - 1);
    };
    for (int r = 0; r < R; r++) { mark(r, 0); mark(r, C - 1); }
    for (int c = 0; c < C; c++) { mark(0, c); mark(R - 1, c); }
    for (auto& row : b) for (char& ch : row) ch = (ch == 'S') ? 'O' : 'X';
}

int main() {
    vector<string> b = {"XXXX", "XOOX", "XXOX", "XOXX"};
    solve(b);
    for (auto& row : b) cout << row << '\n';
}
```

:::complexity
Time | O(RC) |
Space | O(RC) | recursion, worst case
:::
:::
:::

:::problem Shortest Path in Binary Matrix {level=medium lc=shortest-path-in-binary-matrix tags="grid,BFS,8 directions"}
Return the length (number of cells) of the shortest path from the top-left to the bottom-right cell, moving **8-directionally** through 0-cells only, or −1.

:::hint Hint
BFS with 8 directions. Check the start and the end cells first.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int shortestPathBinaryMatrix(vector<vector<int>> g) {
    int n = g.size();
    if (g[0][0] || g[n - 1][n - 1]) return -1;
    queue<pair<int, int>> q; q.push({0, 0}); g[0][0] = 1;          // store the path length in the grid
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        if (r == n - 1 && c == n - 1) return g[r][c];
        for (int dr = -1; dr <= 1; dr++)
            for (int dc = -1; dc <= 1; dc++) {
                int nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= n || nc < 0 || nc >= n || g[nr][nc] != 0) continue;
                g[nr][nc] = g[r][c] + 1;
                q.push({nr, nc});
            }
    }
    return -1;
}

int main() { cout << shortestPathBinaryMatrix({{0, 1}, {1, 0}}) << ' ' << shortestPathBinaryMatrix({{0, 0, 0}, {1, 1, 0}, {1, 1, 0}}) << ' ' << shortestPathBinaryMatrix({{1, 0, 0}, {1, 1, 0}, {1, 1, 0}}) << '\n'; }
```

:::complexity
Time | O(n^2) |
Space | O(n^2) |
:::
:::
:::

## Check yourself

```quiz
? "Distance from each cell to the nearest gate" is best solved with…
- One BFS per cell
- One BFS per gate
+ One multi-source BFS starting from all gates
> A single O(RC) pass.

? Why search from the ocean borders in Pacific Atlantic?
+ Reversing the flow turns "from every cell" into "from the borders", so there are two traversals instead of RC
- Water flows uphill
- DFS can't start from the inside
> Walk uphill from the oceans and intersect.

? A recursive DFS on a 2000×2000 grid of land might…
+ Overflow the call stack
- Run in O(n²) with a crash-free guarantee
- Skip cells
> Use BFS or an explicit stack for big grids.
```

:::keypoints
- Grid = implicit graph: direction arrays, bounds checks, mark visited (in place if allowed).
- Count components (islands) by launching a search from each unvisited land cell.
- Nearest-source distances → multi-source BFS (all sources at distance 0).
- Reverse thinking: search from the boundary or the targets instead of from every cell.
- Prefer BFS or an explicit stack on large grids to avoid stack overflow.
:::
