---
title: Graphs — Vocabulary & Representations
level: intermediate
time: 40
summary: What graphs are and the words used to describe them, the handshake lemma and edge-count bounds (with proofs), adjacency matrix vs adjacency list vs edge list (and when to use each), building graphs from typical inputs, implicit graphs (grids, puzzles, word ladders), and degree problems.
---

Maps, social networks, the web, course prerequisites, game states, dependency managers: all of them are **graphs**. Recognizing that a problem *is* a graph problem is often the hardest step. After that, a handful of algorithms do the rest.

:::def Graph
A set of **vertices** (nodes) $V$ and a set of **edges** $E$, each connecting two vertices. We write $n = |V|$ and $m = |E|$.
:::

## Vocabulary

| Term | Meaning |
|---|---|
| **undirected** / **directed** | edges go both ways / have a direction $u \to v$ |
| **weighted** | each edge has a number (cost, distance, time) |
| **degree** | number of edges at a vertex (for directed graphs: in-degree and out-degree) |
| **path** | a sequence of vertices joined by edges. *Simple* means no repeated vertices |
| **cycle** | a path that returns to its start |
| **connected** | every vertex can reach every other (undirected) |
| **connected component** | a maximal connected piece |
| **DAG** | **d**irected **a**cyclic **g**raph: directed, with no cycles (dependencies, schedules) |
| **tree** | a connected undirected graph with no cycles ($m = n - 1$) |
| **dense** / **sparse** | $m$ close to $n^2$ / $m$ close to $n$ |
| **bipartite** | the vertices can be split into two groups, with every edge going between the groups |

## Two counting facts

:::proof Handshake lemma: the sum of all degrees = 2m
Every edge $\{u, v\}$ adds 1 to the degree of $u$ and 1 to the degree of $v$. So summing the degrees counts every edge exactly twice. A consequence: the number of odd-degree vertices is always **even**.
:::

:::derive The maximum number of edges
\text{undirected, simple: one edge per unordered pair} || no self-loops, no duplicate edges
m \le \binom n2 = \frac{n(n-1)}{2} ||
\text{directed: one edge per ordered pair} ||
! m \le n(n-1) = O(n^2) \;\Rightarrow\; \log m = O(\log n) || that's why O(m log m) = O(m log n)
:::

## Representations

| | Adjacency **matrix** | Adjacency **list** | Edge **list** |
|---|---|---|---|
| structure | `n × n` booleans or weights | `vector<vector<int>> adj(n)` | `vector<array<int,3>> edges` |
| memory | $O(n^2)$ | $O(n + m)$ | $O(m)$ |
| is $u$–$v$ an edge? | $O(1)$ | $O(\deg u)$ | $O(m)$ |
| iterate over neighbours of $u$ | $O(n)$ | $O(\deg u)$ | $O(m)$ |
| best for | dense graphs, Floyd–Warshall | **almost everything** (BFS, DFS, Dijkstra) | Kruskal, Bellman–Ford |

:::tip Default to adjacency lists
Interview graphs usually have $n$ up to $10^5$, and a $10^5 \times 10^5$ matrix (10 GB) is impossible. Adjacency lists make BFS and DFS $O(n + m)$.
:::

```cpp run level=easy title="Building all three representations"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 5;
    vector<array<int, 3>> edges = {{0, 1, 4}, {0, 2, 1}, {1, 3, 2}, {2, 3, 5}, {3, 4, 3}};   // (u, v, weight)

    vector<vector<int>> mat(n, vector<int>(n, 0));               // adjacency matrix
    vector<vector<pair<int, int>>> adj(n);                        // adjacency list: (neighbour, weight)
    for (auto [u, v, w] : edges) {
        mat[u][v] = mat[v][u] = w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});                                 // undirected: add both directions
    }

    cout << "neighbours of 3:";
    for (auto [v, w] : adj[3]) cout << ' ' << v << "(w=" << w << ")";
    cout << "\nedge 1-2? " << (mat[1][2] ? "yes" : "no") << ", edge 1-3 weight " << mat[1][3] << '\n';

    int degSum = 0;
    for (int u = 0; u < n; u++) degSum += adj[u].size();
    cout << "sum of degrees = " << degSum << " = 2 * " << edges.size() << " edges\n";
}
```

## Implicit graphs

Many graph problems never mention a graph. The vertices are **states** and the edges are **moves**:

| Problem | Vertices | Edges |
|---|---|---|
| grid maze / islands | cells | moves to the 4 (or 8) neighbours |
| word ladder | words | words differing in one letter |
| open the lock | 4-digit codes | turning one wheel by ±1 |
| sliding puzzle | board configurations | sliding a tile |
| course prerequisites | courses | "must take A before B" |

You don't need to build these graphs explicitly. Generate the neighbours on the fly inside BFS or DFS.

:::interview
Say it out loud: "This is a graph problem: the states are …, and the moves are …. I need the shortest number of moves, so BFS." Naming the graph is half the solution, and interviewers listen for it.
:::

## Problems

:::problem Find the Town Judge {level=easy lc=find-the-town-judge tags="graph,degree"}
There are `n` people. `trust[i] = [a, b]` means `a` trusts `b`. The judge trusts **nobody** and is trusted by **everybody else**. Return the judge's label, or −1.

Example: `n=3, [[1,3],[2,3]]` → `3`.

:::hint Hint
This is directed degrees: the judge has out-degree 0 and in-degree n − 1. A single score `in − out == n − 1` captures both.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findJudge(int n, const vector<vector<int>>& trust) {
    vector<int> score(n + 1, 0);
    for (auto& t : trust) { score[t[0]]--; score[t[1]]++; }   // out-degree -1, in-degree +1
    for (int p = 1; p <= n; p++) if (score[p] == n - 1) return p;
    return -1;
}

int main() { cout << findJudge(2, {{1, 2}}) << ' ' << findJudge(3, {{1, 3}, {2, 3}}) << ' ' << findJudge(3, {{1, 3}, {2, 3}, {3, 1}}) << '\n'; }
```

:::complexity
Time | O(n + m) |
Space | O(n) |
:::

Why does `score == n − 1` force out-degree 0? `in ≤ n − 1` (nobody trusts themselves), so reaching `n − 1` needs `in = n − 1` **and** `out = 0`.
:::
:::

:::problem Find Center of Star Graph {level=easy lc=find-center-of-star-graph tags="graph,degree"}
A star graph has one center connected to every other node. Given its edges, return the center.

:::hint Hint
The center is in **every** edge, so it's the vertex shared by the first two edges. $O(1)$!
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findCenter(const vector<vector<int>>& e) {
    return (e[0][0] == e[1][0] || e[0][0] == e[1][1]) ? e[0][0] : e[0][1];
}

int main() { cout << findCenter({{1, 2}, {2, 3}, {4, 2}}) << ' ' << findCenter({{1, 2}, {5, 1}, {1, 3}, {1, 4}}) << '\n'; }
```

:::complexity
Time | O(1) |
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? In any undirected graph, the number of odd-degree vertices is…
+ Always even
- Always odd
- Equal to the number of edges
> The degree sum is 2m (even), so the odd degrees must pair up.

? A graph has 10⁵ vertices and 2·10⁵ edges. Best representation?
+ An adjacency list
- An adjacency matrix
- A sorted edge list only
> A matrix would need 10¹⁰ cells.

? Why is O(m log m) the same as O(m log n) for simple graphs?
+ m ≤ n², so log m ≤ 2 log n
- Because m = n
- It isn't
> Constant factors inside logs disappear.
```

:::keypoints
- Graph = vertices + edges: directed or undirected, weighted or not. Trees and DAGs are special cases.
- Handshake: Σ degree = 2m. Simple graphs have $m \le n(n-1)/2$.
- Adjacency list = the default ($O(n+m)$). Matrix for dense graphs and $O(1)$ edge checks. Edge list for Kruskal and Bellman–Ford.
- Many problems are **implicit graphs**: name the states and the moves, then run BFS or DFS.
:::
