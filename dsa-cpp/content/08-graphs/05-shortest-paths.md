---
title: Shortest Paths — Dijkstra, Bellman–Ford, Floyd–Warshall
level: advanced
time: 65
summary: Weighted shortest paths end to end — relaxation, Dijkstra with a binary heap (correctness proof, O((V+E) log V), the stale-entry trick, why negative edges break it), Bellman–Ford (why V−1 rounds suffice, negative-cycle detection, "at most k edges"), Floyd–Warshall as a DP over intermediate vertices, 0-1 BFS, and five classic problems.
---

BFS finds the fewest **edges**. When edges have **weights** (distances, times, costs), you need the right shortest-path algorithm. Which one depends on the weights and on how many sources you care about.

| Situation | Algorithm | Time |
|---|---|---|
| unweighted | BFS | $O(V + E)$ |
| weights 0 or 1 only | **0-1 BFS** (deque) | $O(V + E)$ |
| non-negative weights, one source | **Dijkstra** | $O((V + E) \log V)$ |
| negative weights allowed / "at most k edges" / detect negative cycles | **Bellman–Ford** | $O(V \cdot E)$ |
| all pairs, small $V$ (≤ ~400) | **Floyd–Warshall** | $O(V^3)$ |
| DAG (any weights) | relax in topological order | $O(V + E)$ |

## Relaxation: the core operation

:::def Relaxation
Given a tentative distance `dist[u]` and an edge $u \to v$ of weight $w$: if `dist[u] + w < dist[v]`, then going through $u$ is better, so set `dist[v] = dist[u] + w` and remember `parent[v] = u`. Every shortest-path algorithm is a strategy for choosing **which edges to relax, and in what order**.
:::

## Dijkstra's algorithm

Repeatedly take the unfinished vertex with the **smallest** tentative distance, declare it final, and relax its outgoing edges. A min-heap finds that vertex quickly.

```viz algo=dijkstra
```

:::proof Dijkstra is correct when all weights are non-negative
**Claim:** when a vertex $u$ is taken from the heap, $\text{dist}[u] = \delta(u)$, its true shortest distance.

Suppose not, and let $u$ be the **first** vertex taken with $\text{dist}[u] > \delta(u)$. Look at a true shortest path $s \leadsto u$, and let $y$ be the first vertex on it that isn't finished yet, with $x$ the finished vertex just before it. $x$ was finished correctly (since $u$ is the first failure), and when $x$ was finished, edge $x \to y$ was relaxed, so $\text{dist}[y] \le \delta(x) + w(x,y) = \delta(y)$. Since weights are **non-negative**, $\delta(y) \le \delta(u)$ ($y$ comes before $u$ on the path). So $\text{dist}[y] \le \delta(u) < \text{dist}[u]$. But the heap gave us $u$ as the minimum, so $\text{dist}[u] \le \text{dist}[y]$. Contradiction.
:::

:::warn Negative edges break Dijkstra
The proof used $\delta(y) \le \delta(u)$, which fails with negative weights. Example: $s \to a$ (2), $s \to b$ (5), $b \to a$ (−4). Dijkstra finalizes $a$ at 2, but the real shortest distance is $5 - 4 = 1$. Use Bellman–Ford for negative weights.
:::

```cpp run level=intermediate title="Dijkstra with a binary heap (and path reconstruction)"
#include <bits/stdc++.h>
using namespace std;
using ll = long long;
const ll INF = LLONG_MAX / 4;

int main() {
    int n = 6;
    vector<array<int, 3>> edges = {{0, 1, 7}, {0, 2, 9}, {0, 5, 14}, {1, 2, 10}, {1, 3, 15}, {2, 3, 11}, {2, 5, 2}, {3, 4, 6}, {4, 5, 9}};
    vector<vector<pair<int, int>>> adj(n);
    for (auto [u, v, w] : edges) { adj[u].push_back({v, w}); adj[v].push_back({u, w}); }

    vector<ll> dist(n, INF);
    vector<int> parent(n, -1);
    priority_queue<pair<ll, int>, vector<pair<ll, int>>, greater<>> pq;   // (distance, vertex), min first
    dist[0] = 0; pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;                  // stale entry: u was already finalized with a smaller d
        for (auto [v, w] : adj[u])
            if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; parent[v] = u; pq.push({dist[v], v}); }
    }

    for (int v = 0; v < n; v++) {
        vector<int> path;
        for (int x = v; x != -1; x = parent[x]) path.push_back(x);
        reverse(path.begin(), path.end());
        cout << "0 -> " << v << ": dist " << setw(2) << dist[v] << "  path";
        for (int x : path) cout << ' ' << x;
        cout << '\n';
    }
}
```

:::tip Lazy deletion instead of decrease-key
`std::priority_queue` has no "decrease key" operation. So when a distance improves, just **push a new entry**. When popping, skip entries whose distance is larger than the current `dist[u]` (they're stale). The heap holds at most $O(E)$ entries, so the cost is $O(E \log E) = O(E \log V)$.
:::

## Bellman–Ford

Relax **every edge**, $V - 1$ times.

:::proof Why V − 1 rounds are enough
Some shortest path from $s$ to $v$ is **simple** (when there's no negative cycle), so it has at most $V - 1$ edges: $s = v_0, v_1, \ldots, v_k = v$. By induction: after round $i$, $\text{dist}[v_i] = \delta(v_i)$, because round $i$ relaxes the edge $v_{i-1} \to v_i$ after $v_{i-1}$ was already correct. So after $V - 1$ rounds, every distance is final. **If a $V$-th round still improves something, a negative cycle is reachable**, because then shortest paths would need more than $V - 1$ edges.
:::

This proof shows something useful: after round $i$, `dist` already includes every shortest path that uses **at most $i$ edges**. That's exactly what "cheapest flight with at most k stops" needs (as long as each round reads the previous round's distances).

## Floyd–Warshall: all pairs as a DP

:::derive Floyd–Warshall recurrence
d_k[i][j] = \text{shortest } i \to j \text{ path using only vertices } 0..k-1 \text{ in between} || the DP state
d_0[i][j] = w(i,j) \text{ (or } \infty) || no intermediates allowed
d_{k+1}[i][j] = \min\big(d_k[i][j],\; d_k[i][k] + d_k[k][j]\big) || either avoid k, or pass through k exactly once
\text{the } k \text{ dimension can be dropped: update in place} || row k and column k don't change in round k
! O(V^3) \text{ time, } O(V^2) \text{ space} || the loop order k, i, j is essential: k must be outermost
:::

```cpp run level=intermediate title="Floyd–Warshall on 4 vertices (with a negative edge)"
#include <bits/stdc++.h>
using namespace std;

int main() {
    const int INF = 1e9;
    int n = 4;
    vector<vector<int>> d = {{0, 3, INF, 7}, {8, 0, 2, INF}, {5, INF, 0, 1}, {2, INF, -1, 0}};
    for (int k = 0; k < n; k++)                       // allow k as an intermediate
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (d[i][k] < INF && d[k][j] < INF) d[i][j] = min(d[i][j], d[i][k] + d[k][j]);
    for (auto& row : d) { for (int x : row) cout << setw(4) << x; cout << '\n'; }
    bool negCycle = false;
    for (int i = 0; i < n; i++) negCycle |= d[i][i] < 0;
    cout << "negative cycle? " << boolalpha << negCycle << '\n';
}
```

## 0-1 BFS

If every weight is 0 or 1, use a **deque**: push to the **front** for weight-0 edges and to the **back** for weight-1 edges. The deque stays sorted by distance (it's a two-level priority queue), so you get Dijkstra's result in $O(V + E)$. Typical uses: "minimum walls to remove", "minimum direction changes".

## Problems

:::problem Network Delay Time {level=medium lc=network-delay-time tags="Dijkstra"}
`times[i] = (u, v, w)`: a signal takes `w` time to go from `u` to `v`. A signal is sent from `k`. How long until **all** `n` nodes receive it? Return −1 if some node never does.

:::hint Hint
Dijkstra from `k`. The answer is the **maximum** distance, or −1 if any node is unreachable.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int networkDelayTime(const vector<vector<int>>& times, int n, int k) {
    vector<vector<pair<int, int>>> adj(n + 1);
    for (auto& t : times) adj[t[0]].push_back({t[1], t[2]});
    vector<int> dist(n + 1, INT_MAX);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    dist[k] = 0; pq.push({0, k});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) if (d + w < dist[v]) { dist[v] = d + w; pq.push({dist[v], v}); }
    }
    int ans = *max_element(dist.begin() + 1, dist.end());
    return ans == INT_MAX ? -1 : ans;
}

int main() { cout << networkDelayTime({{2, 1, 1}, {2, 3, 1}, {3, 4, 1}}, 4, 2) << ' ' << networkDelayTime({{1, 2, 1}}, 2, 2) << '\n'; }
```

:::complexity
Time | O((V + E) \log V) |
Space | O(V + E) |
:::
:::
:::

:::problem Cheapest Flights Within K Stops {level=medium lc=cheapest-flights-within-k-stops tags="Bellman-Ford,shortest path with edge limit"}
Find the cheapest price from `src` to `dst` using **at most `k` stops** (so at most `k + 1` flights), or −1.

Example: `n=4, flights=[[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]], src=0, dst=3, k=1` → `700`.

:::hint Hint 1
Plain Dijkstra ignores the stop limit: the cheapest route might use too many stops.
:::

:::hint Hint 2
Bellman–Ford for `k + 1` rounds. Each round must relax from a **copy** of the previous round's distances, so one round can't chain several edges together.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findCheapestPrice(int n, const vector<vector<int>>& flights, int src, int dst, int k) {
    const int INF = 1e9;
    vector<int> dist(n, INF);
    dist[src] = 0;
    for (int round = 0; round <= k; round++) {           // round i allows paths with i+1 edges
        vector<int> next = dist;                          // relax from the PREVIOUS round only
        for (auto& f : flights)
            if (dist[f[0]] < INF && dist[f[0]] + f[2] < next[f[1]]) next[f[1]] = dist[f[0]] + f[2];
        dist = move(next);
    }
    return dist[dst] >= INF ? -1 : dist[dst];
}

int main() {
    cout << findCheapestPrice(4, {{0, 1, 100}, {1, 2, 100}, {2, 0, 100}, {1, 3, 600}, {2, 3, 200}}, 0, 3, 1) << ' '
         << findCheapestPrice(3, {{0, 1, 100}, {1, 2, 100}, {0, 2, 500}}, 0, 2, 1) << ' '
         << findCheapestPrice(3, {{0, 1, 100}, {1, 2, 100}, {0, 2, 500}}, 0, 2, 0) << '\n';
}
```

:::complexity
Time | O(k \cdot E) |
Space | O(V) |
:::
:::
:::

:::problem Path With Minimum Effort {level=medium lc=path-with-minimum-effort tags="Dijkstra,grid,minimax path"}
In a height grid, the effort of a path is the **maximum** absolute height difference between consecutive cells on it. Find the minimum effort from the top-left to the bottom-right.

:::hint Hint
Dijkstra still works when the path cost is a **max** instead of a sum: `cost(path + edge) = max(cost(path), edge)` never decreases as the path grows, which is all the proof needs. (Binary search on the answer + BFS also works.)
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minimumEffortPath(const vector<vector<int>>& h) {
    int R = h.size(), C = h[0].size();
    vector<vector<int>> eff(R, vector<int>(C, INT_MAX));
    priority_queue<tuple<int, int, int>, vector<tuple<int, int, int>>, greater<>> pq;
    eff[0][0] = 0; pq.push({0, 0, 0});
    const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    while (!pq.empty()) {
        auto [e, r, c] = pq.top(); pq.pop();
        if (e > eff[r][c]) continue;
        if (r == R - 1 && c == C - 1) return e;
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
            int ne = max(e, abs(h[nr][nc] - h[r][c]));         // a bottleneck cost, not a sum
            if (ne < eff[nr][nc]) { eff[nr][nc] = ne; pq.push({ne, nr, nc}); }
        }
    }
    return 0;
}

int main() { cout << minimumEffortPath({{1, 2, 2}, {3, 8, 2}, {5, 3, 5}}) << ' ' << minimumEffortPath({{1, 2, 1, 1, 1}, {1, 2, 1, 2, 1}, {1, 2, 1, 2, 1}, {1, 2, 1, 2, 1}, {1, 1, 1, 2, 1}}) << '\n'; }
```

:::complexity
Time | O(RC \log(RC)) |
Space | O(RC) |
:::
:::
:::

:::problem Find the City With the Smallest Number of Neighbors at a Threshold Distance {level=medium lc=find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance tags="Floyd-Warshall,all pairs"}
For each city, count the cities reachable within `distanceThreshold`. Return the city with the **fewest**, preferring the **largest** index on ties. (n ≤ 100.)

:::hint Hint
All-pairs distances with a small n: Floyd–Warshall.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findTheCity(int n, const vector<vector<int>>& edges, int T) {
    const int INF = 1e9;
    vector<vector<int>> d(n, vector<int>(n, INF));
    for (int i = 0; i < n; i++) d[i][i] = 0;
    for (auto& e : edges) d[e[0]][e[1]] = d[e[1]][e[0]] = min(d[e[0]][e[1]], e[2]);
    for (int k = 0; k < n; k++) for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
        if (d[i][k] < INF && d[k][j] < INF) d[i][j] = min(d[i][j], d[i][k] + d[k][j]);
    int best = -1, bestCount = INT_MAX;
    for (int i = 0; i < n; i++) {
        int cnt = 0;
        for (int j = 0; j < n; j++) if (i != j && d[i][j] <= T) cnt++;
        if (cnt <= bestCount) { bestCount = cnt; best = i; }     // <= prefers the larger index
    }
    return best;
}

int main() { cout << findTheCity(4, {{0, 1, 3}, {1, 2, 1}, {1, 3, 4}, {2, 3, 1}}, 4) << ' ' << findTheCity(5, {{0, 1, 2}, {0, 4, 8}, {1, 2, 3}, {1, 4, 2}, {2, 3, 1}, {3, 4, 1}}, 2) << '\n'; }
```

:::complexity
Time | O(n^3) |
Space | O(n^2) |
:::
:::
:::

:::problem Minimum Obstacle Removal to Reach Corner {level=hard lc=minimum-obstacle-removal-to-reach-corner tags="0-1 BFS,grid"}
In a grid of 0 (empty) and 1 (obstacle), moving **into** an obstacle cell costs 1 (you remove it) and moving into an empty cell costs 0. Find the minimum number of removals to get from the top-left to the bottom-right.

:::hint Hint
The edge weights are only 0 and 1, so use 0-1 BFS: a deque, with weight-0 moves pushed to the front and weight-1 moves to the back.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minimumObstacles(const vector<vector<int>>& g) {
    int R = g.size(), C = g[0].size();
    vector<vector<int>> dist(R, vector<int>(C, INT_MAX));
    deque<pair<int, int>> dq;
    dist[0][0] = 0; dq.push_front({0, 0});
    const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};
    while (!dq.empty()) {
        auto [r, c] = dq.front(); dq.pop_front();
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
            int w = g[nr][nc];
            if (dist[r][c] + w < dist[nr][nc]) {
                dist[nr][nc] = dist[r][c] + w;
                if (w == 0) dq.push_front({nr, nc}); else dq.push_back({nr, nc});
            }
        }
    }
    return dist[R - 1][C - 1];
}

int main() { cout << minimumObstacles({{0, 1, 1}, {1, 1, 0}, {1, 1, 0}}) << ' ' << minimumObstacles({{0, 1, 0, 0, 0}, {0, 1, 0, 1, 0}, {0, 0, 0, 1, 0}}) << '\n'; }
```

:::complexity
Time | O(RC) |
Space | O(RC) |
:::
:::
:::

## Check yourself

```quiz
? Why does Dijkstra fail with negative edge weights?
+ A vertex finalized early could later get a shorter path through a negative edge
- The heap can't store negative numbers
- It loops forever
> The proof needs δ(y) ≤ δ(u) for vertices earlier on the path.

? How many rounds does Bellman–Ford need (no negative cycles)?
+ V − 1
- E
- log V
> Some shortest path is simple, with at most V − 1 edges.

? In Floyd–Warshall, which loop must be outermost?
+ k (the intermediate vertex)
- i
- j
> The DP adds one allowed intermediate vertex per outer iteration.

? Weights are only 0 or 1. The fastest single-source method is…
+ 0-1 BFS with a deque, O(V + E)
- Dijkstra, O(E log V)
- Bellman–Ford, O(VE)
> Front for 0-edges, back for 1-edges.
```

:::keypoints
- Pick by weights: BFS (unweighted), 0-1 BFS, Dijkstra (non-negative), Bellman–Ford (negative / ≤ k edges), Floyd–Warshall (all pairs, small V).
- Dijkstra: min-heap + skip stale entries, $O((V+E)\log V)$. The greedy proof needs non-negative weights.
- Bellman–Ford: V−1 rounds of relaxing every edge. A V-th improvement means a negative cycle. Copy distances per round to limit the edge count.
- Floyd–Warshall: $d[i][j] = \min(d[i][j], d[i][k] + d[k][j])$ with k outermost.
- Dijkstra also works for "bottleneck" costs (max along the path), since they never decrease along a path.
:::
