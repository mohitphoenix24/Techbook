---
title: Minimum Spanning Trees — Kruskal & Prim
level: advanced
time: 45
summary: Connecting everything at minimum total cost — spanning trees, the cut property (with the exchange-argument proof that makes every MST algorithm correct), Kruskal (sort + union-find, O(E log E)), Prim (heap, O(E log V), and the O(V²) version for dense graphs), and two problems including Min Cost to Connect All Points.
---

Connect a set of cities with roads, computers with cable, or points with wires, so that **everything is connected and the total cost is as small as possible**. The answer is always a tree: any cycle would contain a redundant edge.

:::def Spanning tree
A subset of the edges that connects **all** $V$ vertices with no cycles. It always has exactly $V - 1$ edges.
:::

:::def Minimum spanning tree (MST)
A spanning tree whose total edge weight is as small as possible. (It's unique when all weights are distinct.)
:::

## The cut property: why greedy works

:::def Cut
A split of the vertices into two non-empty groups $S$ and $V \setminus S$. An edge **crosses** the cut if its endpoints are on different sides.
:::

:::proof Cut property: the lightest edge crossing any cut belongs to some MST
Let $e = (u, v)$ be a minimum-weight edge crossing a cut $(S, V \setminus S)$, and let $T$ be any MST. If $e \in T$, we're done. Otherwise, adding $e$ to $T$ creates a cycle. That cycle crosses the cut at $e$, so it must cross back somewhere else, using another crossing edge $f$. Remove $f$: $T' = T + e - f$ is still a spanning tree, and $w(T') = w(T) + w(e) - w(f) \le w(T)$, because $e$ is the lightest crossing edge. So $T'$ is also an MST, and it contains $e$. (This is an **exchange argument**, the same proof technique used for greedy algorithms.)
:::

Both classic algorithms just apply the cut property again and again with different cuts.

## Kruskal's algorithm

Sort the edges by weight. Take each edge **if it connects two different components** (check with union-find).

```viz algo=kruskal
```

Why it's correct: when Kruskal accepts edge $(u, v)$, take the cut "$u$'s current component versus everything else". No lighter edge crosses this cut, since any lighter crossing edge would have been examined earlier and accepted. So $(u, v)$ is the lightest crossing edge and is safe by the cut property.

## Prim's algorithm

Grow **one** tree from a start vertex. Repeatedly add the cheapest edge leaving the tree (a min-heap of frontier edges). This is the cut property with $S$ = the current tree. It looks very similar to Dijkstra, but the heap key is the **edge weight**, not the distance from the start.

| | Kruskal | Prim (binary heap) | Prim (array) |
|---|---|---|---|
| time | $O(E \log E)$ | $O(E \log V)$ | $O(V^2)$ |
| best for | sparse graphs, an edge list | adjacency lists | **dense** graphs (e.g. all pairs of points) |

```cpp run level=intermediate title="Kruskal and Prim agree"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 7;
    vector<array<int, 3>> edges = {{7, 0, 1}, {5, 0, 3}, {8, 1, 2}, {9, 1, 3}, {7, 1, 4}, {5, 2, 4}, {15, 3, 4},
                                   {6, 3, 5}, {8, 4, 5}, {9, 4, 6}, {11, 5, 6}};   // (w, u, v)
    // Kruskal: sort + DSU
    sort(edges.begin(), edges.end());
    vector<int> p(n); iota(p.begin(), p.end(), 0);
    function<int(int)> find = [&](int x) { return p[x] == x ? x : p[x] = find(p[x]); };
    long long kTotal = 0; int taken = 0;
    for (auto [w, u, v] : edges)
        if (find(u) != find(v)) { p[find(u)] = find(v); kTotal += w; taken++; }

    // Prim: grow from vertex 0 with a min-heap of (weight, vertex)
    vector<vector<pair<int, int>>> adj(n);
    for (auto [w, u, v] : edges) { adj[u].push_back({w, v}); adj[v].push_back({w, u}); }
    vector<bool> inTree(n, false);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    pq.push({0, 0});
    long long pTotal = 0;
    while (!pq.empty()) {
        auto [w, u] = pq.top(); pq.pop();
        if (inTree[u]) continue;                   // stale: u was already added more cheaply
        inTree[u] = true; pTotal += w;
        for (auto [w2, v] : adj[u]) if (!inTree[v]) pq.push({w2, v});
    }
    cout << "Kruskal: " << kTotal << " using " << taken << " edges | Prim: " << pTotal << '\n';
}
```

## Problems

:::problem Min Cost to Connect All Points {level=medium lc=min-cost-to-connect-all-points tags="MST,Prim,dense graph"}
Connect all the points in the plane. The cost of an edge is the Manhattan distance `|x1−x2| + |y1−y2|`. Return the minimum total cost.

Example: `[[0,0],[2,2],[3,10],[5,2],[7,0]]` → `20`.

:::hint Hint
It's a **complete** graph with about n²/2 edges. Kruskal's sort costs $O(n^2 \log n)$. The array version of Prim is $O(n^2)$ with no heap and no edge list at all.
:::

:::solution
Array Prim: keep `best[v]` = the cheapest connection from the tree to v. Each round, pick the unvisited v with the smallest `best[v]` (an $O(n)$ scan), add it, and update the others.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int minCostConnectPoints(const vector<vector<int>>& pts) {
    int n = pts.size(), total = 0;
    vector<int> best(n, INT_MAX);
    vector<bool> in(n, false);
    best[0] = 0;
    for (int round = 0; round < n; round++) {
        int u = -1;
        for (int v = 0; v < n; v++) if (!in[v] && (u == -1 || best[v] < best[u])) u = v;   // cheapest to attach
        in[u] = true; total += best[u];
        for (int v = 0; v < n; v++)
            if (!in[v]) best[v] = min(best[v], abs(pts[u][0] - pts[v][0]) + abs(pts[u][1] - pts[v][1]));
    }
    return total;
}

int main() { cout << minCostConnectPoints({{0, 0}, {2, 2}, {3, 10}, {5, 2}, {7, 0}}) << ' ' << minCostConnectPoints({{3, 12}, {-2, 5}, {-4, 1}}) << '\n'; }
```

:::complexity
Time | O(n^2) | optimal for a dense graph: there are Θ(n²) edges
Space | O(n) |
:::
:::
:::

:::problem Connecting Cities With Minimum Cost {level=medium lc=connecting-cities-with-minimum-cost tags="MST,Kruskal"}
Cities `1..n` and possible roads `[x, y, cost]`. Return the minimum cost to connect all the cities, or −1 if that's impossible.

:::hint Hint
Kruskal. If you end up with fewer than `n − 1` edges, the graph is disconnected.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minimumCost(int n, vector<vector<int>> conn) {
    sort(conn.begin(), conn.end(), [](auto& a, auto& b) { return a[2] < b[2]; });
    vector<int> p(n + 1); iota(p.begin(), p.end(), 0);
    function<int(int)> find = [&](int x) { return p[x] == x ? x : p[x] = find(p[x]); };
    int cost = 0, used = 0;
    for (auto& c : conn) {
        int a = find(c[0]), b = find(c[1]);
        if (a == b) continue;
        p[a] = b; cost += c[2];
        if (++used == n - 1) return cost;         // a spanning tree is complete
    }
    return n == 1 ? 0 : -1;
}

int main() { cout << minimumCost(3, {{1, 2, 5}, {1, 3, 6}, {2, 3, 1}}) << ' ' << minimumCost(4, {{1, 2, 3}, {3, 4, 4}}) << '\n'; }
```

:::complexity
Time | O(E \log E) |
Space | O(V) |
:::
:::
:::

## Check yourself

```quiz
? Every spanning tree of a connected graph with V vertices has…
+ V − 1 edges
- V edges
- E − V edges
> A tree on V vertices.

? The cut property says the lightest edge crossing a cut…
+ Belongs to some minimum spanning tree
- Must be excluded from every MST
- Is part of every shortest path
> Proved with an exchange argument.

? For a complete graph on 5000 points, which MST approach is best?
+ Prim with an O(V²) array scan
- Kruskal with sorting all 12.5 million edges
- Bellman–Ford
> In dense graphs, O(V²) beats O(E log E).
```

:::keypoints
- An MST connects all vertices at minimum total weight using $V-1$ edges.
- The cut property (an exchange argument) justifies greedy MST algorithms.
- Kruskal: sort the edges + DSU, $O(E\log E)$; good for sparse graphs and edge lists.
- Prim: grow one tree with a heap, $O(E\log V)$; the array version is $O(V^2)$ for dense graphs.
- Fewer than $V-1$ accepted edges means the graph is disconnected.
:::
