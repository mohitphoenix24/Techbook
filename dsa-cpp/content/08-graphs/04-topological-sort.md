---
title: Cycles, Topological Sort & Bipartite Graphs
level: advanced
time: 60
summary: Detecting cycles (undirected: a visited neighbour that isn't the parent; directed: the three-colour DFS and why a "grey" neighbour means a cycle), topological ordering by Kahn's algorithm and by DFS finishing times (both with proofs), checking bipartiteness by 2-colouring (and the odd-cycle theorem), and five problems from Course Schedule to Alien Dictionary.
---

Dependencies are everywhere: courses and prerequisites, build systems, spreadsheet formulas, package managers, task pipelines. The questions are always the same: "**Is there a valid order?**" (is the graph a DAG?) and "**What is one?**" (a topological sort).

:::def Topological order
An ordering of the vertices of a directed graph such that for **every edge $u \to v$, $u$ comes before $v$**. It exists **if and only if the graph has no directed cycle** (it's a DAG).
:::

## Cycle detection

### Undirected graphs

During DFS, reaching an already visited vertex that is **not the parent** you came from means there's a cycle. (Union-find also works: an edge whose endpoints are already connected closes a cycle.)

### Directed graphs: three colours

In a directed graph, reaching a visited vertex isn't enough. It might belong to a branch that's already finished, which is fine. Give each vertex one of three states:

| Colour | Meaning |
|---|---|
| **white** (0) | not visited yet |
| **grey** (1) | visit in progress: on the current DFS path (the recursion stack) |
| **black** (2) | finished: it and everything reachable from it are done |

:::proof A grey neighbour means a directed cycle (and vice versa)
If DFS at $u$ finds an edge $u \to v$ with $v$ grey, then $v$ is an ancestor of $u$ on the current path. The path $v \to \cdots \to u$ plus the edge $u \to v$ is a cycle. Conversely, if there's a cycle, let $v$ be its first vertex DFS reaches. Every other vertex of the cycle is reachable from $v$, so it's visited while $v$ is still grey. The cycle's edge back into $v$ is then examined while $v$ is grey, so it's detected.
:::

## Topological sort, method 1: Kahn's algorithm (BFS)

```viz algo=topo-sort
```

:::proof Kahn's algorithm is correct
**Order is valid:** a vertex is output only when its in-degree has dropped to 0, i.e. after all its predecessors were output. **Detects cycles:** in a DAG there's always a vertex with in-degree 0 (otherwise you could walk backwards forever and repeat a vertex, which is a cycle), so the queue never runs dry before every vertex is output. On a cycle, no vertex on the cycle ever reaches in-degree 0, so fewer than $n$ vertices are output. That's exactly the test: `order.size() < n` ⇔ a cycle exists.
:::

## Topological sort, method 2: DFS finishing order

Run DFS. When a vertex **finishes** (all its descendants are done), push it onto a list. **Reverse** the list.

:::proof Reverse finishing order is a topological order
Take any edge $u \to v$ in a DAG. If DFS reaches $v$ from inside $u$'s visit, $v$ finishes before $u$. If $v$ was already finished (black) when $u$ looked at it, it also finished before $u$. And $v$ can't be grey: that would be a cycle. In every case $v$ finishes first, so in the **reversed** finishing order $u$ comes before $v$.
:::

## Bipartite graphs

:::def Bipartite graph
A graph whose vertices can be coloured with **two colours** so that every edge joins different colours. Examples: jobs and workers, students and courses.
:::

:::proof A graph is bipartite if and only if it has no odd-length cycle
**(⇒)** Walking along a cycle, the colours alternate, so you only get back to the starting colour after an even number of steps. **(⇐)** BFS-colour each component by the parity of the distance from its start. If some edge joined two vertices of the same parity, then their two BFS paths plus that edge would form a closed walk of odd length, which contains an odd cycle. So with no odd cycles, the parity colouring works.
:::

The algorithm: BFS or DFS, colouring each new vertex opposite to its parent. If you find an edge between two vertices of the same colour, the graph isn't bipartite. $O(V + E)$.

## Problems

:::problem Course Schedule {level=medium lc=course-schedule tags="graph,topological sort,cycle detection"}
There are `numCourses` courses, and `prerequisites[i] = [a, b]` means you must take `b` before `a`. Can you finish all of them?

:::hint Hint
Edge `b → a`. You can finish everything if and only if there's no directed cycle. Use Kahn's algorithm and compare the count with n, or the three-colour DFS.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canFinish(int n, const vector<vector<int>>& pre) {
    vector<vector<int>> adj(n);
    vector<int> indeg(n, 0);
    for (auto& p : pre) { adj[p[1]].push_back(p[0]); indeg[p[0]]++; }
    queue<int> q;
    for (int u = 0; u < n; u++) if (indeg[u] == 0) q.push(u);
    int taken = 0;
    while (!q.empty()) {
        int u = q.front(); q.pop(); taken++;
        for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);
    }
    return taken == n;                       // fewer means some courses are stuck in a cycle
}

int main() { cout << boolalpha << canFinish(2, {{1, 0}}) << ' ' << canFinish(2, {{1, 0}, {0, 1}}) << '\n'; }
```

:::complexity
Time | O(V + E) |
Space | O(V + E) |
:::
:::
:::

:::problem Course Schedule II {level=medium lc=course-schedule-ii tags="graph,topological sort,DFS"}
Return a valid order to take all the courses, or an empty list if it's impossible.

:::hint Hint
Kahn's output order **is** the answer. Here's the DFS version with three colours instead, so you've seen both.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> findOrder(int n, const vector<vector<int>>& pre) {
    vector<vector<int>> adj(n);
    for (auto& p : pre) adj[p[1]].push_back(p[0]);
    vector<int> color(n, 0), order;                          // 0 white, 1 grey, 2 black
    function<bool(int)> dfs = [&](int u) {                   // returns false if a cycle is found
        color[u] = 1;
        for (int v : adj[u]) {
            if (color[v] == 1) return false;                  // back edge: cycle
            if (color[v] == 0 && !dfs(v)) return false;
        }
        color[u] = 2;
        order.push_back(u);                                   // finished
        return true;
    };
    for (int u = 0; u < n; u++) if (color[u] == 0 && !dfs(u)) return {};
    reverse(order.begin(), order.end());
    return order;
}

int main() {
    for (int x : findOrder(4, {{1, 0}, {2, 0}, {3, 1}, {3, 2}})) cout << x << ' ';
    cout << "| cycle -> size " << findOrder(2, {{0, 1}, {1, 0}}).size() << '\n';
}
```

:::complexity
Time | O(V + E) |
Space | O(V + E) |
:::
:::
:::

:::problem Is Graph Bipartite? {level=medium lc=is-graph-bipartite tags="graph,BFS,2-coloring"}
Given an undirected graph as an adjacency list (possibly disconnected), return whether it's bipartite.

:::hint Hint
BFS-colour each component, alternating colours. A conflict on any edge means it's not bipartite.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isBipartite(const vector<vector<int>>& g) {
    int n = g.size();
    vector<int> color(n, -1);
    for (int s = 0; s < n; s++) {
        if (color[s] != -1) continue;                 // a new component
        queue<int> q; q.push(s); color[s] = 0;
        while (!q.empty()) {
            int u = q.front(); q.pop();
            for (int v : g[u]) {
                if (color[v] == -1) { color[v] = color[u] ^ 1; q.push(v); }
                else if (color[v] == color[u]) return false;   // same colour on both ends of an edge
            }
        }
    }
    return true;
}

int main() { cout << boolalpha << isBipartite({{1, 2, 3}, {0, 2}, {0, 1, 3}, {0, 2}}) << ' ' << isBipartite({{1, 3}, {0, 2}, {1, 3}, {0, 2}}) << '\n'; }
```

:::complexity
Time | O(V + E) |
Space | O(V) |
:::
:::
:::

:::problem Find Eventual Safe States {level=medium lc=find-eventual-safe-states tags="graph,cycle detection,DFS"}
A node is **safe** if every path from it leads to a terminal node (one with no outgoing edges), i.e. it can never get into a cycle. Return all safe nodes in sorted order.

:::hint Hint
With three-colour DFS: a node is safe exactly when it finishes black without ever touching a grey (cycle) node. Remember the result per node so each is computed once.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> eventualSafeNodes(const vector<vector<int>>& g) {
    int n = g.size();
    vector<int> color(n, 0);                       // 0 unvisited, 1 visiting (or on a cycle), 2 safe
    function<bool(int)> safe = [&](int u) {
        if (color[u]) return color[u] == 2;
        color[u] = 1;
        for (int v : g[u]) if (!safe(v)) return false;   // u stays 1: it can reach a cycle
        color[u] = 2;
        return true;
    };
    vector<int> out;
    for (int u = 0; u < n; u++) if (safe(u)) out.push_back(u);
    return out;
}

int main() { for (int x : eventualSafeNodes({{1, 2}, {2, 3}, {5}, {0}, {5}, {}, {}})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(V + E) |
Space | O(V) |
:::
:::
:::

:::problem Alien Dictionary {level=hard lc=alien-dictionary tags="graph,topological sort,strings"}
Words are sorted according to an unknown alphabet. Find one valid order of the letters, or `""` if the input is inconsistent.

Example: `["wrt","wrf","er","ett","rftt"]` → `"wertf"`.

:::hint Hint 1
Compare **adjacent** words only. The first position where they differ gives one edge: `w1[i] → w2[i]`.
:::

:::hint Hint 2
Invalid cases: a word followed by its own proper prefix (`"abc"` before `"ab"`), or a cycle among the letters. Topologically sort the letters with Kahn's algorithm.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string alienOrder(const vector<string>& words) {
    map<char, set<char>> adj;
    map<char, int> indeg;
    for (auto& w : words) for (char c : w) { adj[c]; indeg[c]; }          // register every letter
    for (int i = 0; i + 1 < (int)words.size(); i++) {
        const string &a = words[i], &b = words[i + 1];
        int k = 0;
        while (k < (int)min(a.size(), b.size()) && a[k] == b[k]) k++;
        if (k == (int)min(a.size(), b.size())) { if (a.size() > b.size()) return ""; continue; }   // "abc" before "ab"
        if (adj[a[k]].insert(b[k]).second) indeg[b[k]]++;                  // edge a[k] -> b[k] (no duplicates)
    }
    queue<char> q;
    for (auto& [c, d] : indeg) if (d == 0) q.push(c);
    string order;
    while (!q.empty()) {
        char c = q.front(); q.pop(); order += c;
        for (char nx : adj[c]) if (--indeg[nx] == 0) q.push(nx);
    }
    return order.size() == indeg.size() ? order : "";                       // short means a cycle
}

int main() {
    cout << '"' << alienOrder({"wrt", "wrf", "er", "ett", "rftt"}) << "\" \"" << alienOrder({"z", "x"}) << "\" \""
         << alienOrder({"z", "x", "z"}) << "\" \"" << alienOrder({"abc", "ab"}) << "\"\n";
}
```

:::complexity
Time | O(C + \Sigma) | C = total characters across the words, Σ = alphabet size
Space | O(\Sigma^2) | edges between letters
:::
:::
:::

## Check yourself

```quiz
? In a directed DFS, reaching a GREY vertex means…
+ A cycle: that vertex is an ancestor on the current path
- A cross edge, which is harmless
- The vertex is finished
> Black vertices are harmless; grey ones close a cycle.

? Kahn's algorithm outputs fewer than n vertices. That means…
+ The graph has a directed cycle
- The graph is disconnected
- The graph is bipartite
> Vertices on a cycle never reach in-degree 0.

? A graph is bipartite if and only if…
+ It has no odd-length cycle
- It has no cycle at all
- It's a tree
> Even cycles are fine (a square is bipartite).
```

:::keypoints
- Topological order exists ⇔ DAG. Kahn's algorithm (in-degree-0 queue) or reversed DFS finishing order; both are $O(V+E)$.
- Cycle detection: undirected → a visited non-parent neighbour; directed → reaching a **grey** vertex (three colours).
- Kahn's algorithm doubles as a cycle check: fewer than $n$ vertices output.
- Bipartite ⇔ 2-colourable ⇔ no odd cycle. BFS-colour each component.
- Ordering puzzles (alien alphabets, build orders) are topological sorts once you extract the edges.
:::
