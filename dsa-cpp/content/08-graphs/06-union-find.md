---
title: Union-Find (Disjoint Set Union)
level: advanced
time: 50
summary: Maintaining groups that only ever merge — find with path compression, union by size/rank, why union by size alone keeps trees O(log n) tall (with proof), the near-constant α(n) bound, and four classic problems (Redundant Connection, Number of Connected Components, Accounts Merge, Satisfiability of Equality Equations).
---

"Are these two things in the same group?" Answering that **while groups keep merging** is what Union-Find (also called a disjoint-set union, DSU) does, in practically constant time per operation. It powers Kruskal's MST, connectivity queries, image segmentation and "merge accounts" style problems.

:::def Disjoint Set Union (Union-Find)
A structure over elements `0..n−1` that keeps them partitioned into disjoint sets, with two operations:
- `find(x)`: return a **representative** (root) of x's set. Two elements are in the same set ⇔ they have the same root.
- `unite(a, b)`: merge the sets containing a and b.
Each set is a tree of parent pointers whose root is the representative.
:::

```viz algo=union-find
```

## The two optimizations

| Trick | What it does |
|---|---|
| **Union by size** (or by rank) | attach the **smaller** tree under the root of the larger one |
| **Path compression** | during `find(x)`, point every node on the path straight at the root |

:::proof Union by size alone keeps every tree O(log n) tall
Follow one element $x$. Its depth increases by 1 only when its root is attached under another root, and that happens only when its tree is the **smaller** of the two. Then the merged tree is at least **twice** the size of x's old tree. A tree can't grow beyond $n$ elements, so $x$'s tree can double at most $\log_2 n$ times. Every depth is at most $\log_2 n$, and `find` is $O(\log n)$.
:::

With **both** tricks, any sequence of $m$ operations costs $O(m \, \alpha(n))$, where $\alpha$ is the **inverse Ackermann function**. It grows so slowly that $\alpha(n) \le 4$ for any $n$ smaller than the number of atoms in the universe. In practice, every operation is effectively $O(1)$.

```cpp run level=intermediate title="A reusable DSU"
#include <bits/stdc++.h>
using namespace std;

struct DSU {
    vector<int> parent, sz;
    int components;
    explicit DSU(int n) : parent(n), sz(n, 1), components(n) { iota(parent.begin(), parent.end(), 0); }
    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];   // path halving: a simple, iterative form of compression
            x = parent[x];
        }
        return x;
    }
    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;                       // already in the same set
        if (sz[a] < sz[b]) swap(a, b);                  // union by size
        parent[b] = a; sz[a] += sz[b]; components--;
        return true;
    }
    bool same(int a, int b) { return find(a) == find(b); }
};

int main() {
    DSU d(8);
    for (auto [a, b] : vector<pair<int, int>>{{0, 1}, {2, 3}, {1, 3}, {4, 5}, {6, 7}, {5, 7}})
        d.unite(a, b);
    cout << "components: " << d.components << ", same(0,2)? " << boolalpha << d.same(0, 2)
         << ", same(0,4)? " << d.same(0, 4) << ", size of 4's set: " << d.sz[d.find(4)] << '\n';
}
```

:::tip When to use DSU vs BFS/DFS
- The graph is given all at once and you query connectivity once → BFS/DFS is fine.
- Edges arrive **over time** and you query connectivity in between → DSU.
- You need "does this edge create a cycle?" (Kruskal, redundant connection) → DSU.
- DSU **can't** split sets (no edge deletion). Process deletions offline in reverse, as additions.
:::

## Problems

:::problem Redundant Connection {level=medium lc=redundant-connection tags="union-find,cycle detection"}
A tree with `n` nodes had **one extra edge** added. Return an edge whose removal makes it a tree again (if several work, the one appearing last in the input).

Example: `[[1,2],[1,3],[2,3]]` → `[2,3]`.

:::hint Hint
Add the edges one by one with DSU. The first edge whose endpoints are **already connected** closes the cycle.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> findRedundantConnection(const vector<vector<int>>& edges) {
    vector<int> parent(edges.size() + 1);
    iota(parent.begin(), parent.end(), 0);
    function<int(int)> find = [&](int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); };
    for (auto& e : edges) {
        int a = find(e[0]), b = find(e[1]);
        if (a == b) return e;                 // already connected: this edge closes a cycle
        parent[a] = b;
    }
    return {};
}

int main() {
    auto r = findRedundantConnection({{1, 2}, {1, 3}, {2, 3}});
    auto s = findRedundantConnection({{1, 2}, {2, 3}, {3, 4}, {1, 4}, {1, 5}});
    cout << '[' << r[0] << ',' << r[1] << "] [" << s[0] << ',' << s[1] << "]\n";
}
```

:::complexity
Time | O(n \, \alpha(n)) |
Space | O(n) |
:::

Why is the **first** edge that closes a cycle also the **last** possible answer in input order? Exactly one cycle exists. Removing any of its edges works, and the one we detect is the last cycle edge to be added.
:::
:::

:::problem Number of Connected Components in an Undirected Graph {level=medium lc=number-of-connected-components-in-an-undirected-graph tags="union-find"}
Count the connected components of a graph with `n` nodes and the given edges.

:::hint Hint
Start with n components. Every successful `unite` reduces the count by one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int countComponents(int n, const vector<vector<int>>& edges) {
    vector<int> parent(n), sz(n, 1);
    iota(parent.begin(), parent.end(), 0);
    auto find = [&](int x) { while (parent[x] != x) x = parent[x] = parent[parent[x]]; return x; };
    int comps = n;
    for (auto& e : edges) {
        int a = find(e[0]), b = find(e[1]);
        if (a == b) continue;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a; sz[a] += sz[b]; comps--;
    }
    return comps;
}

int main() { cout << countComponents(5, {{0, 1}, {1, 2}, {3, 4}}) << ' ' << countComponents(5, {{0, 1}, {1, 2}, {2, 3}, {3, 4}}) << '\n'; }
```

:::complexity
Time | O((n + m)\,\alpha(n)) |
Space | O(n) |
:::
:::
:::

:::problem Accounts Merge {level=medium lc=accounts-merge tags="union-find,hash map,strings"}
Each account is `[name, email1, email2, …]`. Two accounts belong to the same person if they share **any** email. Merge them and return each person's name followed by their sorted emails.

:::hint Hint
DSU over the **accounts** (or over the emails). Map each email to the first account index that had it. If a later account has the same email, unite the two accounts. Then group the emails by root.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<string>> accountsMerge(const vector<vector<string>>& acc) {
    int n = acc.size();
    vector<int> parent(n);
    iota(parent.begin(), parent.end(), 0);
    function<int(int)> find = [&](int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); };
    unordered_map<string, int> owner;                                  // email -> first account index
    for (int i = 0; i < n; i++)
        for (int j = 1; j < (int)acc[i].size(); j++) {
            auto [it, inserted] = owner.insert({acc[i][j], i});
            if (!inserted) parent[find(i)] = find(it->second);         // shared email: same person
        }
    map<int, set<string>> groups;                                      // root -> all emails (sorted)
    for (auto& [email, i] : owner) groups[find(i)].insert(email);
    vector<vector<string>> out;
    for (auto& [root, emails] : groups) {
        vector<string> row = {acc[root][0]};
        row.insert(row.end(), emails.begin(), emails.end());
        out.push_back(row);
    }
    return out;
}

int main() {
    auto out = accountsMerge({{"John", "johnsmith@mail.com", "john_newyork@mail.com"},
                              {"John", "johnsmith@mail.com", "john00@mail.com"},
                              {"Mary", "mary@mail.com"}, {"John", "johnnybravo@mail.com"}});
    for (auto& row : out) { for (auto& s : row) cout << s << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(E \log E) | E total emails, sorting dominates
Space | O(E) |
:::
:::
:::

:::problem Satisfiability of Equality Equations {level=medium lc=satisfiability-of-equality-equations tags="union-find"}
Equations look like `"a==b"` or `"a!=b"` (single lowercase letters). Return whether all of them can be true at the same time.

:::hint Hint
Two passes: first unite every `==` pair, then check that no `!=` pair ended up in the same set.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool equationsPossible(const vector<string>& eqs) {
    array<int, 26> p;
    iota(p.begin(), p.end(), 0);
    function<int(int)> find = [&](int x) { return p[x] == x ? x : p[x] = find(p[x]); };
    for (auto& e : eqs) if (e[1] == '=') p[find(e[0] - 'a')] = find(e[3] - 'a');
    for (auto& e : eqs) if (e[1] == '!' && find(e[0] - 'a') == find(e[3] - 'a')) return false;
    return true;
}

int main() { cout << boolalpha << equationsPossible({"a==b", "b!=a"}) << ' ' << equationsPossible({"a==b", "b==c", "a==c"}) << ' ' << equationsPossible({"a==b", "b==c", "c!=a"}) << '\n'; }
```

:::complexity
Time | O(n \, \alpha(26)) |
Space | O(1) |
:::

The order matters: all `==` first. Checking each `!=` as you go would miss equalities that appear later in the list.
:::
:::

## Check yourself

```quiz
? With union by size only (no compression), the tree height is at most…
+ log₂ n
- √n
- n
> An element's depth grows only when its tree at least doubles in size.

? What does path compression do?
+ Points every node on a find path directly at the root
- Deletes nodes
- Sorts the sets
> Later finds on those nodes become one step.

? Union-Find is the natural tool when…
+ Edges arrive over time and you need connectivity or cycle checks along the way
- You need shortest paths
- You need to delete edges
> DSU only merges; it never splits.
```

:::keypoints
- DSU: `find` (root of the set) and `unite` (merge the roots). Same root ⇔ same set.
- Union by size keeps trees $O(\log n)$ tall. Add path compression and the cost is $O(\alpha(n))$, effectively constant.
- A successful unite reduces the component count. A failed unite means the edge closes a cycle.
- Use it for dynamic connectivity, cycle checks (Kruskal, redundant edges) and grouping by shared keys (accounts).
:::
