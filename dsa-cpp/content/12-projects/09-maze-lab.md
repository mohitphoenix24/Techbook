---
title: Maze Generator & Solver
level: intermediate
time: 55
icon: grid
cover: #6366f1,#14b8a6
tags: DFS, union-find, Kruskal, BFS, spanning trees
summary: Generate perfect mazes two ways — randomized DFS (long winding corridors) and randomized Kruskal with union-find (many short branches) — see why both produce spanning trees, render them as ASCII art, solve them with BFS to get the shortest path, and compare their structure (dead ends, solution length).
---

A **perfect maze** has exactly one path between any two cells: no loops and no unreachable areas. In graph terms that's a **spanning tree** of the grid graph. So maze generation is "build a random spanning tree", and maze solving is "find the path in that tree". This project uses DFS, union-find and BFS together in something you can actually look at.

:::flow Plan
Model | cells and walls; carving a wall = adding a tree edge
Generator 1 | randomized DFS (recursive backtracker, with an explicit stack)
Generator 2 | randomized Kruskal (shuffle the walls, union-find)
Solve | BFS from the entrance to the exit, mark the path
Compare | dead ends and solution length for each generator
:::

## Why these generators make perfect mazes

- **Randomized DFS** carves a passage into an unvisited neighbour, and backtracks when there's none. Every cell is entered exactly once, from one parent: that's a DFS tree, so it's a spanning tree.
- **Randomized Kruskal** goes through all the walls in random order and removes a wall **only if the two cells are in different components** (checked with union-find). That's exactly Kruskal's MST algorithm with random weights, so the result is a spanning tree: connected, with no cycles.

A spanning tree of an $R \times C$ grid has exactly $RC - 1$ passages. Both generators carve exactly that many, which is a nice self-check.

```cpp run title="Two maze generators + BFS solver, rendered in ASCII"
#include <bits/stdc++.h>
using namespace std;

struct Maze {
    int R, C;
    vector<vector<bool>> eastOpen, southOpen;            // passage to (r, c+1) / (r+1, c)
    Maze(int r, int c) : R(r), C(c), eastOpen(r, vector<bool>(c, false)), southOpen(r, vector<bool>(c, false)) {}
    void open(int r1, int c1, int r2, int c2) {          // carve between neighbouring cells
        if (r1 == r2) eastOpen[r1][min(c1, c2)] = true; else southOpen[min(r1, r2)][c1] = true;
    }
    bool canMove(int r, int c, int nr, int nc) const {
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) return false;
        return r == nr ? eastOpen[r][min(c, nc)] : southOpen[min(r, nr)][c];
    }
    int passages() const { int k = 0; for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) k += eastOpen[r][c] + southOpen[r][c]; return k; }
};

const int DR[4] = {-1, 1, 0, 0}, DC[4] = {0, 0, -1, 1};

Maze dfsMaze(int R, int C, mt19937& rng) {
    Maze m(R, C);
    vector<vector<bool>> seen(R, vector<bool>(C, false));
    vector<pair<int, int>> st = {{0, 0}};                 // explicit stack: no recursion depth issues
    seen[0][0] = true;
    while (!st.empty()) {
        auto [r, c] = st.back();
        vector<int> dirs;
        for (int d = 0; d < 4; d++) {
            int nr = r + DR[d], nc = c + DC[d];
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen[nr][nc]) dirs.push_back(d);
        }
        if (dirs.empty()) { st.pop_back(); continue; }   // dead end: backtrack
        int d = dirs[rng() % dirs.size()];
        int nr = r + DR[d], nc = c + DC[d];
        m.open(r, c, nr, nc);
        seen[nr][nc] = true;
        st.push_back({nr, nc});
    }
    return m;
}

Maze kruskalMaze(int R, int C, mt19937& rng) {
    Maze m(R, C);
    vector<int> parent(R * C);
    iota(parent.begin(), parent.end(), 0);
    function<int(int)> find = [&](int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); };
    vector<array<int, 4>> walls;
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) {
        if (c + 1 < C) walls.push_back({r, c, r, c + 1});
        if (r + 1 < R) walls.push_back({r, c, r + 1, c});
    }
    shuffle(walls.begin(), walls.end(), rng);             // random weights
    for (auto [r1, c1, r2, c2] : walls) {
        int a = find(r1 * C + c1), b = find(r2 * C + c2);
        if (a != b) { parent[a] = b; m.open(r1, c1, r2, c2); }   // different components: carve
    }
    return m;
}

vector<pair<int, int>> solve(const Maze& m) {             // BFS from the top-left to the bottom-right
    vector<vector<int>> par(m.R, vector<int>(m.C, -1));
    queue<pair<int, int>> q; q.push({0, 0}); par[0][0] = 0;
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + DR[d], nc = c + DC[d];
            if (m.canMove(r, c, nr, nc) && par[nr][nc] == -1) { par[nr][nc] = r * m.C + c; q.push({nr, nc}); }
        }
    }
    vector<pair<int, int>> path;
    for (int v = (m.R - 1) * m.C + m.C - 1; ; v = par[v / m.C][v % m.C]) { path.push_back({v / m.C, v % m.C}); if (v == 0) break; }
    reverse(path.begin(), path.end());
    return path;
}

void render(const Maze& m, const vector<pair<int, int>>& path) {
    set<pair<int, int>> onPath(path.begin(), path.end());
    cout << '+';
    for (int c = 0; c < m.C; c++) cout << "--+";
    cout << '\n';
    for (int r = 0; r < m.R; r++) {
        string row = "|", below = "+";
        for (int c = 0; c < m.C; c++) {
            row += onPath.count({r, c}) ? "()" : "  ";
            row += (c + 1 < m.C && m.eastOpen[r][c]) ? ' ' : '|';
            below += (r + 1 < m.R && m.southOpen[r][c]) ? "  +" : "--+";
        }
        cout << row << '\n' << below << '\n';
    }
}

int deadEnds(const Maze& m) {
    int k = 0;
    for (int r = 0; r < m.R; r++) for (int c = 0; c < m.C; c++) {
        int deg = 0;
        for (int d = 0; d < 4; d++) deg += m.canMove(r, c, r + DR[d], c + DC[d]);
        k += deg == 1;
    }
    return k;
}

int main() {
    mt19937 rng(2026);
    int R = 8, C = 14;
    Maze a = dfsMaze(R, C, rng), b = kruskalMaze(R, C, rng);
    auto pa = solve(a), pb = solve(b);
    cout << "Randomized DFS maze (" << a.passages() << " passages = R*C - 1 = " << R * C - 1 << "):\n";
    render(a, pa);
    cout << "\nRandomized Kruskal maze (" << b.passages() << " passages):\n";
    render(b, pb);

    long long dfsLen = 0, krLen = 0, dfsDead = 0, krDead = 0;    // statistics over many 30x30 mazes
    for (int t = 0; t < 30; t++) {
        Maze x = dfsMaze(30, 30, rng), y = kruskalMaze(30, 30, rng);
        dfsLen += solve(x).size(); krLen += solve(y).size(); dfsDead += deadEnds(x); krDead += deadEnds(y);
    }
    cout << "\n30x30 averages:  DFS: path " << dfsLen / 30 << " cells, " << dfsDead / 30 << " dead ends   |   Kruskal: path "
         << krLen / 30 << " cells, " << krDead / 30 << " dead ends\n";
}
```

The statistics show the different "personalities". DFS mazes have **long, winding solutions and few dead ends** (it keeps going deep). Kruskal mazes have **short solutions and many short dead ends** (they grow evenly everywhere). Same theory (spanning trees), very different feel.

## Extensions

:::exercise Make it your own
1. Implement **Prim's algorithm** as a third generator (grow from one cell, carving to a random frontier cell). How does it compare?
2. Remove a few extra walls at random to create loops (an "imperfect" maze), then compare the BFS and DFS solutions. DFS no longer finds the shortest path.
3. Add **weights** (mud cells) and solve with Dijkstra, or with A\* from the Route Planner project.
:::

:::keypoints
- Perfect maze = spanning tree of the grid graph: $RC - 1$ passages and exactly one path between any two cells.
- Randomized DFS = a random DFS tree; randomized Kruskal = an MST with random weights (union-find blocks cycles).
- BFS from the entrance gives the (unique) path with parent pointers. Use explicit stacks for big grids.
- The same structure, built by different algorithms, has measurably different properties.
:::
