---
title: BFS & DFS
level: intermediate
time: 60
summary: The two fundamental graph searches — breadth-first search (and why it finds shortest paths in unweighted graphs, with proof), depth-first search (recursive and iterative), the O(V + E) analysis, visited-marking rules, connected components, and BFS over implicit state spaces — through five classic problems including Clone Graph and Word Ladder.
---

Almost every graph algorithm is built on one of two ways of exploring: **breadth-first** (ripples spreading out from a stone dropped in a pond) or **depth-first** (one path explored as far as possible before backtracking).

## Breadth-first search

:::def BFS
Explore the graph **level by level** from a source: first the source, then all vertices one edge away, then all vertices two edges away, and so on. It uses a **queue**.
:::

```viz algo=bfs
```

:::proof BFS finds shortest paths in unweighted graphs
**Claim:** vertices leave the queue in non-decreasing order of `dist`, and when $v$ is discovered from $u$, $\text{dist}[v] = \text{dist}[u] + 1$ is its true shortest distance $\delta(v)$.

The queue always holds vertices of distance $d$ followed by vertices of distance $d + 1$, never anything else: a vertex at distance $d$ only adds vertices at distance $d + 1$. Now suppose some $v$ got $\text{dist}[v] > \delta(v)$, and take such a $v$ with the smallest $\delta(v)$. Let $u$ be the vertex before $v$ on a shortest path, so $\delta(u) = \delta(v) - 1$ and $u$ was labelled correctly. $u$ leaves the queue before any vertex with a larger distance. When $u$ is processed, $v$ is either still undiscovered, in which case it gets $\delta(u) + 1 = \delta(v)$, a contradiction; or it was already discovered by a vertex that left the queue no later than $u$, which gives it a label of at most $\delta(v)$, again a contradiction.
:::

:::warn Mark visited when you ENQUEUE, not when you dequeue
If you mark a vertex only when it's popped, it can be pushed many times by different neighbours before that. The queue then grows to $O(m)$ duplicates, and some judges time out. Set `dist[v]` (or `visited[v]`) at the moment you push `v`.
:::

## Depth-first search

:::def DFS
Go as **deep** as possible along one path, then backtrack and try the next branch. It's naturally recursive (or uses an explicit stack). DFS doesn't find shortest paths, but it reveals structure: connected components, cycles, topological order, bridges.
:::

```viz algo=dfs
```

## Why both are O(V + E)

:::derive Running time of BFS/DFS with adjacency lists
\text{each vertex is marked once, and enqueued/visited once} || O(V)
\text{each vertex's neighbour list is scanned once, when it's processed} || Σ deg(u)
\sum_{u} \deg(u) = 2E \text{ (undirected) or } E \text{ (directed)} || the handshake lemma
! T = O(V + E) || with an adjacency MATRIX it would be O(V²)
:::

```cpp run level=easy title="BFS distances and DFS components"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 8;
    vector<pair<int, int>> edges = {{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {5, 6}};   // 7 is isolated
    vector<vector<int>> adj(n);
    for (auto [u, v] : edges) { adj[u].push_back(v); adj[v].push_back(u); }

    // BFS from 0: shortest number of edges
    vector<int> dist(n, -1);
    queue<int> q; q.push(0); dist[0] = 0;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        for (int v : adj[u]) if (dist[v] == -1) { dist[v] = dist[u] + 1; q.push(v); }   // mark on push
    }
    cout << "dist from 0:"; for (int d : dist) cout << ' ' << d; cout << '\n';

    // DFS to label connected components
    vector<int> comp(n, -1);
    int c = 0;
    function<void(int)> dfs = [&](int u) {
        comp[u] = c;
        for (int v : adj[u]) if (comp[v] == -1) dfs(v);
    };
    for (int u = 0; u < n; u++) if (comp[u] == -1) { dfs(u); c++; }
    cout << c << " components:"; for (int x : comp) cout << ' ' << x; cout << '\n';
}
```

| Use **BFS** when you need… | Use **DFS** when you need… |
|---|---|
| shortest path in **unweighted** graphs (fewest moves) | any path / reachability (both work) |
| level-by-level processing | cycle detection, topological sort |
| the nearest something (multi-source) | connected components (both work) |
| to avoid deep recursion | to explore every path (backtracking) |

## Problems

:::problem Number of Provinces {level=medium lc=number-of-provinces tags="graph,DFS,connected components"}
`isConnected` is an `n × n` adjacency matrix of cities. A province is a group of directly or indirectly connected cities. Count the provinces.

:::hint Hint
Count the connected components: start a DFS from each unvisited city and count how many times you start one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findCircleNum(const vector<vector<int>>& g) {
    int n = g.size(), provinces = 0;
    vector<bool> seen(n, false);
    function<void(int)> dfs = [&](int u) {
        seen[u] = true;
        for (int v = 0; v < n; v++) if (g[u][v] && !seen[v]) dfs(v);
    };
    for (int u = 0; u < n; u++) if (!seen[u]) { dfs(u); provinces++; }
    return provinces;
}

int main() { cout << findCircleNum({{1, 1, 0}, {1, 1, 0}, {0, 0, 1}}) << ' ' << findCircleNum({{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}) << '\n'; }
```

:::complexity
Time | O(n^2) | the input is a matrix
Space | O(n) |
:::

Union-find solves it too: union every connected pair, then count the roots.
:::
:::

:::problem Keys and Rooms {level=medium lc=keys-and-rooms tags="graph,DFS,reachability"}
Room 0 is open. `rooms[i]` lists the keys found in room `i`. Can you visit every room?

:::hint Hint
Rooms are vertices and keys are directed edges. The question is "is every vertex reachable from 0?".
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canVisitAllRooms(const vector<vector<int>>& rooms) {
    vector<bool> seen(rooms.size(), false);
    vector<int> st = {0};
    seen[0] = true;
    int count = 1;
    while (!st.empty()) {
        int u = st.back(); st.pop_back();
        for (int key : rooms[u]) if (!seen[key]) { seen[key] = true; count++; st.push_back(key); }
    }
    return count == (int)rooms.size();
}

int main() { cout << boolalpha << canVisitAllRooms({{1}, {2}, {3}, {}}) << ' ' << canVisitAllRooms({{1, 3}, {3, 0, 1}, {2}, {0}}) << '\n'; }
```

:::complexity
Time | O(n + k) | k total keys
Space | O(n) |
:::
:::
:::

:::problem Clone Graph {level=medium lc=clone-graph tags="graph,BFS,hash map"}
Return a deep copy of a connected undirected graph, given a reference to one node. Each node has a value and a list of neighbours.

:::hint Hint
Keep a map `original → copy`. When you first see a node, create its copy and schedule it. When you process a node, link its copy to the copies of its neighbours.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct Node { int val; vector<Node*> neighbors; explicit Node(int v) : val(v) {} };

Node* cloneGraph(Node* start) {
    if (!start) return nullptr;
    unordered_map<Node*, Node*> copy;
    copy[start] = new Node(start->val);
    queue<Node*> q; q.push(start);
    while (!q.empty()) {
        Node* u = q.front(); q.pop();
        for (Node* v : u->neighbors) {
            if (!copy.count(v)) { copy[v] = new Node(v->val); q.push(v); }   // first time: clone it
            copy[u]->neighbors.push_back(copy[v]);
        }
    }
    return copy[start];
}

int main() {
    vector<Node*> g; for (int i = 1; i <= 4; i++) g.push_back(new Node(i));
    auto link = [&](int a, int b) { g[a - 1]->neighbors.push_back(g[b - 1]); g[b - 1]->neighbors.push_back(g[a - 1]); };
    link(1, 2); link(2, 3); link(3, 4); link(4, 1);
    Node* c = cloneGraph(g[0]);
    cout << "clone of 1 (new object: " << boolalpha << (c != g[0]) << ") has neighbours:";
    for (Node* v : c->neighbors) cout << ' ' << v->val;
    cout << '\n';
}
```

:::complexity
Time | O(V + E) |
Space | O(V) |
:::
:::
:::

:::problem Open the Lock {level=medium lc=open-the-lock tags="BFS,implicit graph"}
A lock has 4 wheels with digits 0–9, starting at `"0000"`. One move turns one wheel by ±1 (wrapping around). Some combinations are `deadends` (you can't pass through them). Return the minimum number of moves to reach `target`, or −1.

Example: deadends `["0201","0101","0102","1212","2002"]`, target `"0202"` → `6`.

:::hint Hint
States are 4-digit strings (10⁴ vertices), and each has 8 neighbours. Fewest moves = BFS.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int openLock(const vector<string>& deadends, const string& target) {
    unordered_set<string> dead(deadends.begin(), deadends.end());
    if (dead.count("0000")) return -1;
    unordered_map<string, int> dist{{"0000", 0}};
    queue<string> q; q.push("0000");
    while (!q.empty()) {
        string s = q.front(); q.pop();
        if (s == target) return dist[s];
        for (int i = 0; i < 4; i++)
            for (int d : {1, 9}) {                            // +1 or -1 (mod 10)
                string t = s;
                t[i] = char('0' + (t[i] - '0' + d) % 10);
                if (!dead.count(t) && !dist.count(t)) { dist[t] = dist[s] + 1; q.push(t); }
            }
    }
    return -1;
}

int main() {
    cout << openLock({"0201", "0101", "0102", "1212", "2002"}, "0202") << ' '
         << openLock({"8888"}, "0009") << ' '
         << openLock({"8887", "8889", "8878", "8898", "8788", "8988", "7888", "9888"}, "8888") << '\n';
}
```

:::complexity
Time | O(10^4 \cdot 8) | states × moves
Space | O(10^4) |
:::

**Bidirectional BFS** (searching from both ends at once and meeting in the middle) shrinks the explored area a lot for large state spaces.
:::
:::

:::problem Word Ladder {level=hard lc=word-ladder tags="BFS,implicit graph,strings"}
Transform `beginWord` into `endWord` by changing one letter at a time. Every intermediate word must be in `wordList`. Return the number of words in the shortest such sequence, or 0.

Example: `hit → hot → dot → dog → cog` gives `5`.

:::hint Hint 1
Words are vertices, and words differing in one letter are neighbours. Shortest path = BFS.
:::

:::hint Hint 2
Don't compare all pairs of words ($O(n^2 L)$). For each word, try changing each position to `a`–`z` and look the result up in a hash set: $O(26L)$ per word.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int ladderLength(const string& begin, const string& end, const vector<string>& list) {
    unordered_set<string> words(list.begin(), list.end());
    if (!words.count(end)) return 0;
    queue<string> q; q.push(begin);
    words.erase(begin);
    for (int steps = 1; !q.empty(); steps++) {
        for (int k = q.size(); k > 0; k--) {               // one BFS level
            string w = q.front(); q.pop();
            if (w == end) return steps;
            for (int i = 0; i < (int)w.size(); i++) {
                char orig = w[i];
                for (char c = 'a'; c <= 'z'; c++) {
                    w[i] = c;
                    if (words.count(w)) { words.erase(w); q.push(w); }   // erase = mark visited
                }
                w[i] = orig;
            }
        }
    }
    return 0;
}

int main() {
    cout << ladderLength("hit", "cog", {"hot", "dot", "dog", "lot", "log", "cog"}) << ' '
         << ladderLength("hit", "cog", {"hot", "dot", "dog", "lot", "log"}) << '\n';
}
```

:::complexity
Time | O(n \cdot L \cdot 26) | n words of length L (plus hashing cost O(L) per lookup)
Space | O(n \cdot L) |
:::
:::
:::

## Check yourself

```quiz
? Which search finds the fewest-edges path in an unweighted graph?
+ BFS
- DFS
- Either one
> BFS processes vertices in order of distance.

? When should BFS mark a vertex as visited?
+ When it's pushed onto the queue
- When it's popped
- After all its neighbours are processed
> Otherwise the same vertex can be queued many times.

? BFS/DFS with an adjacency list costs…
+ O(V + E)
- O(V²)
- O(E log V)
> Each vertex once, each adjacency list once.
```

:::keypoints
- BFS = queue, level by level, shortest paths in unweighted graphs. DFS = stack or recursion, deep first, structure.
- Both run in $O(V + E)$ with adjacency lists. Mark vertices visited when you **discover** them.
- Count components by starting a search from each unvisited vertex.
- Implicit graphs (locks, words, boards): generate the neighbours on the fly. Use BFS for minimum moves.
:::
