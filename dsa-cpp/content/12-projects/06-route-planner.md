---
title: Route Planner — BFS vs Dijkstra vs A*
level: advanced
time: 70
icon: route
cover: #10b981,#3b82f6
tags: graphs, Dijkstra, A*, heuristics, path reconstruction
summary: Build a mini navigation engine on a terrain map — parse it, find routes with BFS (fewest steps), Dijkstra (cheapest by terrain cost) and A* (Dijkstra guided by an admissible heuristic), reconstruct and draw each path, and measure how many cells each algorithm explores.
---

Navigation apps answer "how do I get there?" millions of times a day. Underneath are the algorithms from the Graphs module, plus one more idea: **A\***, which uses a sense of direction (a *heuristic*) to explore far less of the map. In this project you'll implement all three on the same map and compare them.

:::flow Plan
Map | a grid where each cell has a terrain cost; # = impassable
BFS | the fewest steps, ignoring cost
Dijkstra | the minimum total cost
A* | Dijkstra + a heuristic toward the goal
Compare | path cost, path length, cells expanded
:::

## Terrain

| Symbol | Meaning | Cost to enter |
|---|---|---|
| `.` | road | 1 |
| `~` | swamp | 5 |
| `^` | hill | 3 |
| `#` | wall | impassable |
| `S`, `G` | start, goal | 1 |

## A* in one paragraph

Dijkstra expands cells in order of $g(v)$, the cost so far, so it spreads out in all directions like a ripple. **A\*** expands in order of $f(v) = g(v) + h(v)$, where $h(v)$ **estimates** the remaining cost to the goal. Here $h$ is the Manhattan distance times the cheapest terrain cost (1). With a good $h$, A\* heads toward the goal and ignores most of the map.

:::def Admissible heuristic
A heuristic that **never overestimates** the true remaining cost: $h(v) \le \delta(v, \text{goal})$. With an admissible (and *consistent*) heuristic, A\* returns an optimal path. Manhattan distance × the minimum step cost is admissible on a 4-neighbour grid: every remaining step costs at least 1, and you need at least the Manhattan distance in steps.
:::

:::proof Why A* with a consistent heuristic is optimal
Consistency means $h(u) \le w(u, v) + h(v)$ for every edge. Define reduced edge weights $w'(u, v) = w(u, v) + h(v) - h(u) \ge 0$. Along any path from S to G the $h$ terms telescope, so the reduced cost of a path is its real cost $+\, h(G) - h(S)$, which is the real cost minus a constant (as $h(G) = 0$). **A\* is exactly Dijkstra on the reduced weights**, which are non-negative. So it finds the path with the smallest reduced cost, which is the path with the smallest real cost. With $h \equiv 0$, A\* *is* Dijkstra.
:::

## The planner

```cpp run title="BFS vs Dijkstra vs A* on a terrain map"
#include <bits/stdc++.h>
using namespace std;

struct Result { string name; long long cost = -1; int steps = 0, expanded = 0; vector<pair<int, int>> path; };

class Planner {
public:
    explicit Planner(vector<string> map) : g_(move(map)), R_(g_.size()), C_(g_[0].size()) {
        for (int r = 0; r < R_; r++) for (int c = 0; c < C_; c++) {
            if (g_[r][c] == 'S') S_ = {r, c};
            if (g_[r][c] == 'G') G_ = {r, c};
        }
    }
    int cost(int r, int c) const { char t = g_[r][c]; return t == '~' ? 5 : t == '^' ? 3 : 1; }
    bool open(int r, int c) const { return r >= 0 && r < R_ && c >= 0 && c < C_ && g_[r][c] != '#'; }

    Result bfs() const {
        Result res; res.name = "BFS (fewest steps)";
        vector<vector<int>> par(R_, vector<int>(C_, -1));
        vector<vector<bool>> seen(R_, vector<bool>(C_, false));
        queue<pair<int, int>> q; q.push(S_); seen[S_.first][S_.second] = true;
        while (!q.empty()) {
            auto [r, c] = q.front(); q.pop(); res.expanded++;
            if (make_pair(r, c) == G_) break;
            for (int d = 0; d < 4; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (open(nr, nc) && !seen[nr][nc]) { seen[nr][nc] = true; par[nr][nc] = r * C_ + c; q.push({nr, nc}); }
            }
        }
        finish(res, par);
        return res;
    }

    Result search(bool useHeuristic) const {       // Dijkstra (h = 0) or A* (h = Manhattan)
        Result res; res.name = useHeuristic ? "A* (cheapest, guided)" : "Dijkstra (cheapest)";
        const long long INF = LLONG_MAX / 4;
        vector<vector<long long>> dist(R_, vector<long long>(C_, INF));
        vector<vector<int>> par(R_, vector<int>(C_, -1));
        auto h = [&](int r, int c) -> long long { return useHeuristic ? abs(r - G_.first) + abs(c - G_.second) : 0; };
        using T = tuple<long long, long long, int, int>;          // (f = g + h, g, r, c)
        priority_queue<T, vector<T>, greater<>> pq;
        dist[S_.first][S_.second] = 0;
        pq.push({h(S_.first, S_.second), 0, S_.first, S_.second});
        while (!pq.empty()) {
            auto [f, g, r, c] = pq.top(); pq.pop();
            if (g > dist[r][c]) continue;                           // stale entry
            res.expanded++;
            if (make_pair(r, c) == G_) break;                       // the goal is final: stop early
            for (int d = 0; d < 4; d++) {
                int nr = r + dr[d], nc = c + dc[d];
                if (!open(nr, nc)) continue;
                long long ng = g + cost(nr, nc);
                if (ng < dist[nr][nc]) { dist[nr][nc] = ng; par[nr][nc] = r * C_ + c; pq.push({ng + h(nr, nc), ng, nr, nc}); }
            }
        }
        finish(res, par);
        return res;
    }

    void draw(const Result& res) const {
        vector<string> out = g_;
        for (auto [r, c] : res.path) if (out[r][c] != 'S' && out[r][c] != 'G') out[r][c] = '*';
        cout << res.name << ": cost " << res.cost << ", " << res.steps << " steps, " << res.expanded << " cells expanded\n";
        for (auto& row : out) cout << "  " << row << '\n';
    }

private:
    vector<string> g_;
    int R_, C_;
    pair<int, int> S_, G_;
    static constexpr int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
    void finish(Result& res, const vector<vector<int>>& par) const {
        if (par[G_.first][G_.second] == -1 && S_ != G_) return;   // unreachable
        for (int cur = G_.first * C_ + G_.second; ; cur = par[cur / C_][cur % C_]) {
            res.path.push_back({cur / C_, cur % C_});
            if (cur == S_.first * C_ + S_.second) break;
        }
        reverse(res.path.begin(), res.path.end());
        res.steps = res.path.size() - 1;
        res.cost = 0;
        for (size_t i = 1; i < res.path.size(); i++) res.cost += cost(res.path[i].first, res.path[i].second);
    }
};

int main() {
    Planner p({
        "S...~~~~~~~~~~....G",
        "###.~~~~~~~~~~.####",
        "...................",
        ".#####^^^^^#######.",
        "...................",
    });
    for (auto res : {p.bfs(), p.search(false), p.search(true)}) { p.draw(res); cout << '\n'; }
}
```

Look at the three results. **BFS** takes the fewest steps but walks straight through the swamp, so its cost is high. **Dijkstra** and **A\*** find the same, cheapest cost. A\* gets there after expanding far fewer cells, because the heuristic pulls it toward G.

## Scaling up: a random 300×300 map

```cpp run title="Expanded cells on a large random map"
#include <bits/stdc++.h>
using namespace std;

int main() {
    const int N = 300;
    mt19937 rng(21);
    vector<string> g(N, string(N, '.'));
    for (auto& row : g) for (char& ch : row) { int x = rng() % 100; ch = x < 22 ? '#' : x < 30 ? '~' : x < 36 ? '^' : '.'; }
    g[0][0] = 'S'; g[N - 1][N - 1] = 'G';
    auto cost = [&](int r, int c) { char t = g[r][c]; return t == '~' ? 5 : t == '^' ? 3 : 1; };
    int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    for (bool astar : {false, true}) {
        vector<long long> dist(N * N, LLONG_MAX);
        priority_queue<tuple<long long, long long, int>, vector<tuple<long long, long long, int>>, greater<>> pq;
        auto h = [&](int v) -> long long { return astar ? (N - 1 - v / N) + (N - 1 - v % N) : 0; };
        dist[0] = 0; pq.push({h(0), 0, 0});
        int expanded = 0; long long ans = -1;
        while (!pq.empty()) {
            auto [f, d, v] = pq.top(); pq.pop();
            if (d > dist[v]) continue;
            expanded++;
            if (v == N * N - 1) { ans = d; break; }
            int r = v / N, c = v % N;
            for (int k = 0; k < 4; k++) {
                int nr = r + dr[k], nc = c + dc[k];
                if (nr < 0 || nr >= N || nc < 0 || nc >= N || g[nr][nc] == '#') continue;
                int u = nr * N + nc;
                if (d + cost(nr, nc) < dist[u]) { dist[u] = d + cost(nr, nc); pq.push({dist[u] + h(u), dist[u], u}); }
            }
        }
        cout << (astar ? "A*:       " : "Dijkstra: ") << "cost " << ans << ", expanded " << expanded << " of " << N * N << " cells\n";
    }
}
```

Both report the same optimal cost. A\* usually expands noticeably fewer cells, and the saving grows with tighter heuristics and simpler terrain. In road networks, real systems go much further, with *contraction hierarchies* and *landmarks* (ALT) giving speedups of 1000× or more.

## Extensions

:::exercise Make it your own
1. Allow **8-directional** moves (diagonal cost √2 ≈ 1.414, scale everything by 1000 to stay in integers) and use the *octile* distance as the heuristic.
2. Try an **inadmissible** heuristic (Manhattan × 3). It gets faster, but is the path still optimal? Find a map where it isn't.
3. Implement **bidirectional Dijkstra**: search from S and from G at the same time, and stop when the two frontiers meet.
:::

:::keypoints
- BFS minimizes steps, Dijkstra minimizes cost, A\* minimizes cost while exploring less.
- A\* orders by $f = g + h$. With a consistent (admissible) $h$, it equals Dijkstra on reduced weights, so it's optimal.
- Reconstruct paths with parent pointers. Stop as soon as the goal is popped.
- Heuristics trade guarantees for speed: an overestimate is faster, but can return a suboptimal path.
:::
