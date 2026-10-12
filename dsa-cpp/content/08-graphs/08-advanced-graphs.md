---
title: Advanced Graphs — Bridges, SCCs, Euler Paths
level: advanced
time: 55
summary: Three DFS-powered techniques for harder interviews — bridges and articulation points with discovery times and low-links (Tarjan), strongly connected components with Kosaraju's two-pass algorithm (and why it works), and Euler paths with Hierholzer's algorithm (Reconstruct Itinerary).
---

These topics come up less often, but they appear in senior and competitive-style interviews, and they show how much information a single DFS carries. Each one is $O(V + E)$.

## Bridges and articulation points

:::def Bridge
An edge whose removal **disconnects** the graph (or increases the number of components). These are critical links: a single cable that cuts off a whole data centre.
:::

:::def Articulation point (cut vertex)
A vertex whose removal disconnects the graph.
:::

During DFS, record two numbers for each vertex:
- `tin[u]`: the time at which `u` was discovered.
- `low[u]`: the smallest `tin` reachable from `u`'s DFS subtree using tree edges downward plus **at most one back edge**.

:::proof The bridge condition: a tree edge (u, v) is a bridge ⇔ low[v] > tin[u]
`low[v] > tin[u]` means nothing in $v$'s subtree has a back edge to $u$ or to any ancestor of $u$. So the only connection between $v$'s subtree and the rest of the graph is the edge $(u, v)$, and removing it disconnects them. Conversely, if `low[v] ≤ tin[u]`, some back edge from $v$'s subtree reaches $u$ or above, which gives a second route and so the edge isn't a bridge. (For articulation points the condition is `low[v] ≥ tin[u]`, since there the route may not pass through $u$ itself. The root is special: it's a cut vertex iff it has 2 or more DFS children.)
:::

:::problem Critical Connections in a Network {level=hard lc=critical-connections-in-a-network tags="graph,bridges,Tarjan"}
`n` servers and undirected `connections`. Return all critical connections (bridges).

Example: `n=4, [[0,1],[1,2],[2,0],[1,3]]` → `[[1,3]]`.

:::hint Hint
One DFS computing `tin` and `low`. Don't use the edge you came in on as a back edge (skip the parent). With parallel edges, skip by **edge id** instead.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> criticalConnections(int n, const vector<vector<int>>& conns) {
    vector<vector<pair<int, int>>> adj(n);                      // (neighbour, edge id)
    for (int i = 0; i < (int)conns.size(); i++) {
        adj[conns[i][0]].push_back({conns[i][1], i});
        adj[conns[i][1]].push_back({conns[i][0], i});
    }
    vector<int> tin(n, -1), low(n);
    vector<vector<int>> bridges;
    int timer = 0;
    function<void(int, int)> dfs = [&](int u, int parentEdge) {
        tin[u] = low[u] = timer++;
        for (auto [v, id] : adj[u]) {
            if (id == parentEdge) continue;                    // don't reuse the edge we came in on
            if (tin[v] != -1) low[u] = min(low[u], tin[v]);   // back edge
            else {
                dfs(v, id);
                low[u] = min(low[u], low[v]);
                if (low[v] > tin[u]) bridges.push_back({u, v});  // v's subtree can't reach u or above
            }
        }
    };
    for (int u = 0; u < n; u++) if (tin[u] == -1) dfs(u, -1);
    return bridges;
}

int main() {
    for (auto& b : criticalConnections(4, {{0, 1}, {1, 2}, {2, 0}, {1, 3}})) cout << '[' << b[0] << ',' << b[1] << "] ";
    cout << '\n';
    for (auto& b : criticalConnections(6, {{0, 1}, {1, 2}, {2, 0}, {2, 3}, {3, 4}, {4, 5}, {5, 3}})) cout << '[' << b[0] << ',' << b[1] << "] ";
    cout << '\n';
}
```

:::complexity
Time | O(V + E) |
Space | O(V + E) |
:::
:::
:::

## Strongly connected components

:::def Strongly connected component (SCC)
In a **directed** graph, a maximal set of vertices where every vertex can reach every other. Shrinking each SCC to a single node always leaves a **DAG** (the *condensation*).
:::

**Kosaraju's algorithm** uses two DFS passes:
1. DFS on the graph and record vertices in order of **finishing time**.
2. Reverse every edge. Process vertices in **decreasing finishing time**. Each DFS in the reversed graph collects exactly one SCC.

:::proof Why Kosaraju works (sketch)
The vertex that finishes last belongs to a "source" SCC $C$ of the condensation: no edges enter $C$ from other SCCs. In the **reversed** graph, $C$ becomes a "sink": no edges **leave** it. So a DFS from that vertex in the reversed graph stays inside $C$ and visits all of it, which is exactly one SCC. Mark it as done. The next unvisited vertex with the latest finishing time is in a source of the remaining condensation, and the argument repeats.
:::

```cpp run level=advanced title="Kosaraju's SCC algorithm"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 8;
    vector<pair<int, int>> edges = {{0, 1}, {1, 2}, {2, 0}, {2, 3}, {3, 4}, {4, 5}, {5, 3}, {6, 5}, {6, 7}, {7, 6}};
    vector<vector<int>> g(n), gr(n);
    for (auto [u, v] : edges) { g[u].push_back(v); gr[v].push_back(u); }

    vector<int> order;                      // pass 1: finishing order
    vector<bool> seen(n, false);
    function<void(int)> dfs1 = [&](int u) { seen[u] = true; for (int v : g[u]) if (!seen[v]) dfs1(v); order.push_back(u); };
    for (int u = 0; u < n; u++) if (!seen[u]) dfs1(u);

    vector<int> comp(n, -1);                // pass 2: reversed graph, latest finisher first
    function<void(int, int)> dfs2 = [&](int u, int c) { comp[u] = c; for (int v : gr[u]) if (comp[v] == -1) dfs2(v, c); };
    int c = 0;
    for (int i = n - 1; i >= 0; i--) if (comp[order[i]] == -1) dfs2(order[i], c++);

    vector<vector<int>> groups(c);
    for (int u = 0; u < n; u++) groups[comp[u]].push_back(u);
    cout << c << " SCCs:";
    for (auto& gp : groups) { cout << " {"; for (int u : gp) cout << u << (u == gp.back() ? "" : ","); cout << '}'; }
    cout << '\n';
}
```

SCCs are used for 2-SAT, finding mutually dependent modules, and simplifying a directed graph into a DAG before running DP on it. **Tarjan's** SCC algorithm does it in a single pass using `low` values, but Kosaraju is easier to remember.

## Euler paths

:::def Euler path / circuit
A path that uses **every edge exactly once**. A circuit also starts and ends at the same vertex. (Hamiltonian paths visit every **vertex** once. That problem is NP-hard, which is a completely different story.)
:::

| Graph | Euler **circuit** exists iff | Euler **path** exists iff |
|---|---|---|
| undirected (connected) | every degree is even | exactly 0 or 2 vertices have odd degree |
| directed (connected) | in = out for every vertex | one vertex has out = in + 1 (the start), one has in = out + 1 (the end), the rest are balanced |

**Hierholzer's algorithm:** walk edges (deleting them as you use them) until you get stuck, then backtrack, appending vertices to the path as you **leave** them. Reverse at the end. $O(E)$.

:::problem Reconstruct Itinerary {level=hard lc=reconstruct-itinerary tags="graph,Euler path,Hierholzer"}
Each ticket is `[from, to]`. Use **all** the tickets exactly once, starting from `"JFK"`. If several itineraries work, return the lexicographically smallest one.

Example: `[["MUC","LHR"],["JFK","MUC"],["SFO","SJC"],["LHR","SFO"]]` → `["JFK","MUC","LHR","SFO","SJC"]`.

:::hint Hint 1
Airports are vertices and tickets are directed edges. "Use every ticket once" means an Euler path.
:::

:::hint Hint 2
Keep each airport's destinations in a min-heap or sorted container. Hierholzer: always take the smallest available ticket; when stuck, add the airport to the route (post-order); reverse at the end.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<string> findItinerary(const vector<vector<string>>& tickets) {
    unordered_map<string, priority_queue<string, vector<string>, greater<string>>> adj;
    for (auto& t : tickets) adj[t[0]].push(t[1]);
    vector<string> route;
    function<void(const string&)> visit = [&](const string& a) {
        auto& dests = adj[a];
        while (!dests.empty()) {
            string next = dests.top(); dests.pop();   // use (delete) this ticket
            visit(next);
        }
        route.push_back(a);                            // post-order: added when we get stuck here
    };
    visit("JFK");
    reverse(route.begin(), route.end());
    return route;
}

int main() {
    for (auto& a : findItinerary({{"MUC", "LHR"}, {"JFK", "MUC"}, {"SFO", "SJC"}, {"LHR", "SFO"}})) cout << a << ' ';
    cout << '\n';
    for (auto& a : findItinerary({{"JFK", "SFO"}, {"JFK", "ATL"}, {"SFO", "ATL"}, {"ATL", "JFK"}, {"ATL", "SFO"}})) cout << a << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(E \log E) | heap operations on the tickets
Space | O(E) |
:::

**Why post-order?** Greedily taking the smallest ticket can lead into a dead end early (`JFK → KUL`, which has no way back). That dead-end airport is pushed **first**, so it ends up **last** after the reversal, exactly where a dead end must go. Meanwhile the rest of the circuit is spliced in before it.
:::
:::

## Check yourself

```quiz
? A tree edge (u, v) is a bridge exactly when…
+ low[v] > tin[u]
- low[v] ≤ tin[u]
- tin[v] > tin[u]
> v's subtree has no back edge reaching u or above.

? In Kosaraju's second pass, vertices are processed in…
+ Decreasing order of first-pass finishing time, on the reversed graph
- Increasing order of finishing time, on the original graph
- Any order
> The latest finisher lies in a source SCC, which becomes a sink in the reversed graph.

? An undirected connected graph has an Euler path iff the number of odd-degree vertices is…
+ 0 or 2
- Exactly 1
- Any even number
> 0 gives a circuit; 2 gives a path between those two vertices.
```

:::keypoints
- Bridges and articulation points: a DFS with `tin` and `low`. Bridge ⇔ `low[v] > tin[u]`. Skip the parent **edge**, not the parent vertex.
- SCCs: Kosaraju = DFS finishing order, then DFS on the reversed graph in reverse finishing order. Condensing the SCCs gives a DAG.
- Euler path: degree conditions + Hierholzer (post-order + reverse), $O(E)$. Hamiltonian paths are a different, NP-hard problem.
:::
