SHEETS.define({
  id: "number-of-connected-components-in-an-undirected-graph",
  viz: "unionfind",
  io: { fn: "countComponents", params: [["n", "int"], ["edges", "int[][]"]], ret: "int", labels: { n: "n (number of nodes)", edges: "edges (undirected pairs)" } },
  premium: true,

  statement: `You have a graph of \`n\` nodes labelled \`0\` to \`n − 1\` and a list of undirected \`edges\`, where \`edges[i] = [a, b]\` connects nodes \`a\` and \`b\`.

Return the number of **connected components** in the graph. A connected component is a maximal group of nodes in which every two nodes are linked by a path.`,
  examples: [
    { input: "n = 5, edges = [[0, 1], [1, 2], [3, 4]]", output: "2", explain: "`{0, 1, 2}` and `{3, 4}` are the two components." },
    { input: "n = 5, edges = [[0, 1], [1, 2], [2, 3], [3, 4]]", output: "1", explain: "All five nodes lie on one path." },
  ],
  constraints: ["$1 \\le n \\le 2000$", "$1 \\le$ `edges.length` $\\le 5000$", "$0 \\le a_i \\le b_i < n$ and $a_i \\ne b_i$", "There are no repeated edges."],
  check(input) {
    if (input.n > 10) return "for the animation use at most 10 nodes";
    for (const e of input.edges) if (e.length !== 2 || e[0] < 0 || e[1] < 0 || e[0] >= input.n || e[1] >= input.n) return "each edge must be a pair [a, b] with both numbers between 0 and n − 1";
    return null;
  },

  intuition: {
    find: "How many separate **islands of connectivity** the graph has: groups of nodes that can reach each other but not the rest.",
    beginner: "Walk the graph: for every node not visited yet, start a DFS/BFS that visits everything it can reach, and count one component each time you start.",
    works: "Each traversal finds exactly one whole component (everything reachable from its start); nodes visited earlier belong to earlier components. So the number of traversals is the number of components.",
    slow: "It is not slow: $O(V + E)$. But it needs adjacency lists, a visited array and a stack/queue, and it solves only the *static* problem: if edges are added later, you must start again.",
    repeat: "A traversal looks at the same edges every time you rerun it. If edges **arrive one at a time**, re-traversing after each one would cost $O(V + E)$ per edge.",
    remember: "Remember, for each node, **which group it belongs to**: the root of a tree of parent pointers. Merging two groups is then a single pointer change.",
    observation: "Start with `n` singleton groups, i.e. `n` components. Every edge between nodes in **different** groups merges two groups: the number of components goes **down by exactly one**. An edge inside a group changes nothing. So `components = n − (number of merging edges)`.",
    leads: "Union-Find: `parent[i] = i`, `components = n`. For each edge, `find` both endpoints; if the roots differ, set `parent[ra] = rb` and `components--`. Return `components`.",
  },

  flow: [
    "DFS/BFS from each unvisited node, counting the traversals.",
    "Each traversal covers one whole component, so the count is the answer.",
    "$O(V + E)$, but it needs adjacency lists and cannot absorb new edges cheaply.",
    "Track group membership with parent pointers (a root per group).",
    "Start with `n` groups; an edge between different groups merges them (`−1`).",
    "Union-Find: count merges as you go: $O(E \\cdot \\alpha(n))$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**The traversal approach:** build adjacency lists. For each node `i` not yet visited, increment `components` and run a DFS that marks everything reachable from `i`.",
    why: "It is correct and $O(V + E)$. Its limits are practical: it needs the adjacency structure, a visited array and a stack, and it answers only once. With **streaming** edges (add an edge, ask for the count) it would re-run for each edge, $O(E (V + E))$ in total; Union-Find updates the answer in near-constant time per edge.",
    time: "O(n + e)", space: "O(n + e)",
    cpp: `class Solution {
    void dfs(int u, vector<vector<int>>& adj, vector<bool>& seen) {
        seen[u] = true;
        for (int v : adj[u]) if (!seen[v]) dfs(v, adj, seen);
    }
public:
    int countComponents(int n, vector<vector<int>>& edges) {
        vector<vector<int>> adj(n);
        for (auto& e : edges) { adj[e[0]].push_back(e[1]); adj[e[1]].push_back(e[0]); }
        vector<bool> seen(n, false);
        int comps = 0;
        for (int i = 0; i < n; i++) if (!seen[i]) { comps++; dfs(i, adj, seen); }
        return comps;
    }
};`,
    js: `function countComponents(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const seen = new Array(n).fill(false);
  const dfs = (u) => { seen[u] = true; for (const v of adj[u]) if (!seen[v]) dfs(v); };
  let comps = 0;
  for (let i = 0; i < n; i++) if (!seen[i]) { comps++; dfs(i); }
  return comps;
}`,
  },

  pattern: {
    name: "Union Find",
    why: "*Connected components* is the textbook use of Union-Find. Each group is a tree of parent pointers; an edge either links two different groups (merge, one fewer component) or lies inside a group (nothing changes). The component count is simply `n` minus the number of successful merges.",
    recognize: [
      "You need the **number of groups / components**, or whether two items are in the same group.",
      "Links arrive as a list of pairs (edges, equivalences, friendships, accounts to merge).",
      "Groups only **merge**, never split.",
      "You may need the answer **after each new link** (dynamic connectivity, offline).",
    ],
  },

  optimal: {
    idea: "Start with every node as its own group (`components = n`). For each edge, find the roots of its two endpoints. If they differ, the edge connects two groups: link the roots and decrement `components`. If they are equal, the edge is redundant (it lies inside one group). After all edges, `components` is the answer.",
    steps: [
      "Set `parent[i] = i` for every node, and `components = n`.",
      "For each edge `[a, b]`: `ra = find(a)`, `rb = find(b)`.",
      "If `ra != rb`: `parent[ra] = rb` and `components--`.",
      "Return `components`.",
    ],
    invariant: "**`components` equals the number of distinct roots, i.e. the number of connected components of the edges processed so far.**",
    correct: "Initially there are `n` singleton groups, so `components = n` is right. Processing an edge `(a, b)`: if `a` and `b` are already connected (same root) the connectivity relation does not change. If they are not, the two components containing them become one, so the count drops by exactly one, which the code records when it links the two roots. By induction, after all edges `components` is the number of components of the whole graph.",
  },

  cpp: `class Solution {
public:
    int countComponents(int n, vector<vector<int>>& edges) {
        vector<int> parent(n);
        iota(parent.begin(), parent.end(), 0);                      // everyone is their own root //@init
        int comps = n;                                              // n groups to start with //@count
        function<int(int)> find = [&](int x) {                      // root of x, with path compression //@find
            return parent[x] == x ? x : parent[x] = find(parent[x]);
        };
        for (auto& e : edges) {                                     //@loop
            int a = find(e[0]), b = find(e[1]);                     //@find
            if (a != b) { parent[a] = b; comps--; }                 // two groups become one //@union
        }
        return comps;                                               //@ret
    }
};`,
  js: `function countComponents(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);            // everyone is their own root //@init
  let comps = n;                                                    // n groups to start with //@count
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));   // path compression //@find
  for (const [x, y] of edges) {                                     //@loop
    const a = find(x), b = find(y);                                 //@find
    if (a !== b) { parent[a] = b; comps--; }                        // two groups become one //@union
  }
  return comps;                                                     //@ret
}`,

  tests: [
    { name: "Example 1: two components", kind: "normal", input: { n: 5, edges: [[0, 1], [1, 2], [3, 4]] } },
    { name: "Example 2: one long path", kind: "normal", input: { n: 5, edges: [[0, 1], [1, 2], [2, 3], [3, 4]] } },
    { name: "Three groups", kind: "normal", input: { n: 7, edges: [[0, 1], [2, 3], [3, 4], [5, 6]] } },
    { name: "No edges at all", kind: "edge", input: { n: 4, edges: [] }, why: "Every node is its own component, so the answer is `n = 4`. The loop never runs and the initial `comps = n` is returned." },
    { name: "A cycle (a redundant edge)", kind: "edge", input: { n: 4, edges: [[0, 1], [1, 2], [2, 0], [2, 3]] }, why: "The edge `2–0` joins nodes that are already connected through `0–1–2`: the roots are equal and **nothing is decremented**. Counting edges instead of merges would give the wrong answer here (it must be 1 component, not `4 − 4`)." },
    { name: "A repeated edge", kind: "edge", input: { n: 3, edges: [[0, 1], [0, 1]] }, why: "The second `[0, 1]` finds both ends in one group and changes nothing, so the answer is 2 (`{0, 1}` and `{2}`). The merge test handles duplicates for free." },
    { name: "A single node", kind: "corner", input: { n: 1, edges: [] }, why: "One node, zero edges: one component." },
    { name: "Fully connected star", kind: "corner", input: { n: 6, edges: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] }, why: "Five merges bring 6 groups down to 1. Path compression is rarely needed here (the hub stays a root's child), but the answer is identical for any edge order." },
    { name: "Pairs that never meet", kind: "corner", input: { n: 8, edges: [[0, 1], [2, 3], [4, 5], [6, 7]] }, why: "Four disjoint pairs: `8 − 4 = 4` components. Each edge is a successful merge, and the groups stay independent." },
  ],

  trace(input, T) {
    const n = input.n, edges = input.edges;
    const parent = Array.from({ length: n }, (_, i) => i);
    const size = new Array(n).fill(1);
    let comps = n, whyCount = false, whySame = false, whyMerge = false, whyComp = false;
    const S = (idx, o = {}) => () => {
      const h = {};
      (o.path || []).forEach((i) => (h[i] = "cmp"));
      if (o.root != null) h[o.root] = "win";
      (o.bad || []).forEach((i) => (h[i] = "bad"));
      (o.ok || []).forEach((i) => (h[i] = "ok"));
      return { n, parent: parent.slice(), size: size.slice(), hl: h, edges, edgesLabel: "edges to process", edgeIdx: idx, find: o.path, count: o.count ?? comps, note: o.note };
    };
    T.step("init", { vars: { n }, state: S(0, { note: "every node is the root of its own group" }), phase: "Process the edges one by one", say: `Start with **every node in its own group**: \`parent[i] = i\`. There are ${n} groups, so \`components = ${n}\`.`, op: `parent[i] = i;  components = ${n}`, act: "START" });
    T.step("count", { vars: { components: comps }, state: S(0, {}), say: `The counter \`components\` starts at **${n}**. Every successful merge of two groups will lower it by exactly one.`, op: `components = n = ${n}`, act: "COUNT_GROUPS",
      why: whyCount ? null : { title: "Why does the count only go down on a merge?", text: "A merge joins two groups into one, so there is one group fewer. An edge inside a group joins nothing new. So the final count is n minus the number of merges." } });
    whyCount = true;
    const find = (x, i, who) => {
      const path = [x]; let r = x;
      while (parent[r] !== r) { r = parent[r]; path.push(r); }
      T.step("find", { vars: { [who]: x, root: r, path: path.join(" → ") }, state: S(i, { path: path.slice(0, -1), root: r }), say: path.length === 1 ? `\`find(${x})\`: ${x} is its own root, so its group is **${r}**.` : `\`find(${x})\`: follow ${path.join(" → ")}; the root is **${r}**.`, op: `find(${x}) = ${r}`, act: "FIND_ROOT" });
      const changed = path.slice(0, -1).filter((p) => parent[p] !== r);
      path.slice(0, -1).forEach((p) => (parent[p] = r));
      if (changed.length) {
        T.step("find", { vars: { [who]: x, root: r }, state: S(i, { path: path.slice(0, -1), root: r, note: "path compression" }), say: `**Path compression:** ${changed.join(", ")} now point straight at the root ${r}, so later finds on them are one step.`, op: `parent[${changed.join("], parent[")}] = ${r}`, act: "COMPRESS_PATH",
          why: whyComp ? null : { title: "Why compress?", text: "The nodes on the path all belong to the root's group anyway. Pointing them directly at the root flattens the tree so future finds are almost O(1)." } });
        whyComp = true;
      }
      return r;
    };
    for (let i = 0; i < edges.length; i++) {
      const [x, y] = edges[i];
      T.step("loop", { vars: { edge: `[${x}, ${y}]`, components: comps }, state: S(i, { path: [x, y] }), say: `Next edge: **${x} — ${y}**. Which groups do the two ends belong to?`, op: `edge = [${x}, ${y}]`, act: "NEXT_EDGE" });
      const a = find(x, i, "x"), b = find(y, i, "y");
      if (a === b) {
        T.step("union", { vars: { "root of x": a, "root of y": b, components: comps }, state: S(i + 1, { bad: [x, y], root: a, note: "the edge lies inside one group" }), say: `Both ends have the **same root ${a}**: ${x} and ${y} are already in one component, so this edge is **redundant**. \`components\` stays **${comps}**.`, op: `${a} == ${b}  ⇒  nothing to merge`, act: "ALREADY_CONNECTED",
          why: whySame ? null : { title: "Why do redundant edges not count?", text: "The two nodes were already connected by other edges, so this edge adds no new connectivity: the number of components cannot change." } });
        whySame = true;
        continue;
      }
      parent[a] = b; size[b] += size[a]; comps--;
      T.step("union", { vars: { "root of x": a, "root of y": b, components: comps }, state: S(i + 1, { ok: [a], root: b, note: `group ${a} merged into group ${b}` }), say: `Different roots (**${a}** and **${b}**): the edge connects two separate components. **Merge** them with \`parent[${a}] = ${b}\`, and \`components\` drops to **${comps}**.`, op: `parent[${a}] = ${b};  components = ${comps}`, act: "MERGE_GROUPS",
        why: whyMerge ? null : { title: "Why link the roots?", text: "Linking the two roots joins the two whole groups with one pointer. Linking other nodes could split a group in two." } });
      whyMerge = true;
    }
    T.step("ret", { vars: { components: comps }, state: S(edges.length, { count: comps }), say: `All edges processed. The graph has **${comps}** connected component${comps === 1 ? "" : "s"}${comps === 1 ? ": everything is linked" : ""}.`, op: `return ${comps}`, act: "DONE" });
    T.result(comps);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 8), k = Math.floor(rnd() * 8), edges = [], set = new Set();
    for (let i = 0; i < k && n >= 2; i++) { const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n); if (a === b) continue; const key = Math.min(a, b) + "," + Math.max(a, b); if (set.has(key)) continue; set.add(key); edges.push([a, b]); }
    return { n, edges };
  },
  gen(n) { return { n, edges: Array.from({ length: n - 1 }, (_, i) => [i, i + 1]) }; },

  complexity: {
    time: {
      tex: "O((n + E)\\,\\alpha(n))", title: "E edges, each two near-constant finds and at most one union", short: "plus O(n) to initialise the parent array",
      derive: [
        "T_{\\text{init}} = O(n) || set `parent[i] = i` and `components = n`",
        "\\text{per edge: } 2 \\text{ finds} + \\text{ at most } 1 \\text{ union} = O(\\alpha(n)) \\text{ amortised} || path compression (+ union by size) gives the inverse-Ackermann bound",
        "T(n, E) = O(n) + E \\cdot O(\\alpha(n)) || sum over the $E$ edges",
        "!T(n, E) = O((n + E)\\,\\alpha(n)) \\approx O(n + E) || $\\alpha(n) \\le 4$ for every practical $n$",
      ],
      where: "$\\alpha$, the inverse Ackermann function, grows so slowly that it is at most 4 for any $n$ below $10^{80}$. In practice union-find is *linear*. In the lab each find costs a frame or two, so the measured steps grow linearly with the number of nodes of a path graph.",
    },
    space: {
      tex: "O(n)", title: "the parent array", short: "one integer per node",
      derive: [
        "S(n) = |\\text{parent}| + |\\text{comps}| = n\\,s_{\\text{int}} + c || the only memory",
        "!S(n) = O(n) || no adjacency lists",
      ],
      where: "The DFS version stores adjacency lists ($O(n + E)$) plus the recursion stack. Union-Find stores one integer per node.",
    },
    limit: "Reading the input costs $\\Omega(n + E)$, so this is essentially optimal (an extra $\\alpha(n)$ factor that is provably needed for the general union-find problem).",
    measure: { label: "n = number of nodes (a path)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Decrementing the counter for every edge", what: "`comps--` inside the loop for each edge, or `n − edges.size()`.", why: "Each edge \"connects something\".", breaks: "Edges inside an existing group (cycles, duplicates) do not reduce the count: a triangle has 3 edges but reduces the count by only 2.", avoid: "Decrement only when `find(a) != find(b)`." },
    { title: "Comparing the nodes instead of their roots", what: "`if (a != b)` on the original endpoints.", why: "Forgetting `find`.", breaks: "Two different nodes can be in the same group, so you would merge (and count) again.", avoid: "Always compare `find(a)` with `find(b)`." },
    { title: "Linking non-root nodes", what: "`parent[x] = y` without the finds.", why: "It looks like the simplest connection.", breaks: "It cuts `x` off from its group, silently splitting components.", avoid: "`parent[find(x)] = find(y)`." },
    { title: "Forgetting isolated nodes", what: "Counting components by roots seen only in edges.", why: "Nodes that appear in no edge are not mentioned.", breaks: "They are components of size 1 and must be counted: the answer starts at `n`, not 0.", avoid: "Initialise `comps = n`." },
    { title: "A recursive `find` on huge chains without compression", what: "Plain recursion `find(x) = parent[x] == x ? x : find(parent[x])`.", why: "It is correct and short.", breaks: "A long chain of $10^5$ nodes overflows the stack and is $O(n)$ per call.", avoid: "Add path compression (and union by size), or use an iterative `find`." },
  ],

  followUps: [
    {
      q: "The edges come **online**: after each edge, report the current number of components.",
      a: "Union-Find shines here: keep `comps` as the structure is updated, and output it after every edge, so each answer costs one union (near $O(1)$). The DFS approach would have to recompute from scratch after every edge, $O(E (V + E))$ overall.",
      time: "O(α(n)) per edge", space: "O(n)",
    },
    {
      q: "Return the **size of the largest component**.",
      a: "Keep `size[root]`. On a merge set `size[newRoot] += size[oldRoot]` and track the maximum. Union by size makes the structure shallower at the same time. $O((n + E)\\alpha(n))$.",
      cpp: `int largestComponent(int n, vector<vector<int>>& edges) {
    vector<int> parent(n), sz(n, 1);
    iota(parent.begin(), parent.end(), 0);
    function<int(int)> find = [&](int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); };
    int best = 1;
    for (auto& e : edges) {
        int a = find(e[0]), b = find(e[1]);
        if (a == b) continue;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a; sz[a] += sz[b];
        best = max(best, sz[a]);
    }
    return best;
}`,
      js: `function largestComponent(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i), sz = new Array(n).fill(1);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  let best = 1;
  for (const [x, y] of edges) {
    let a = find(x), b = find(y);
    if (a === b) continue;
    if (sz[a] < sz[b]) [a, b] = [b, a];
    parent[b] = a; sz[a] += sz[b];
    best = Math.max(best, sz[a]);
  }
  return best;
}`,
      time: "O((n+E)α)", space: "O(n)",
    },
    {
      q: "Group **accounts** that share an e-mail address (*Accounts Merge*).",
      a: "Map each e-mail to the first account that owns it; whenever an e-mail is already owned by another account, `union` the two accounts. At the end, collect each account's e-mails under its root. The union-find does the \"connected components\" work on accounts. Time near-linear in the total number of e-mails (plus sorting each group).",
      time: "O(N·α(N))", space: "O(N)",
    },
    {
      q: "How do you find the components when the graph is **directed** (strongly connected components)?",
      a: "Union-Find only models *undirected* connectivity. For directed graphs, *strongly connected components* need Tarjan's or Kosaraju's algorithm: two DFS passes in $O(V + E)$. Weakly connected components (ignoring directions) can still be done with union-find.",
      time: "O(V + E)", space: "O(V + E)",
    },
  ],

  related: [
    { id: "graph-valid-tree", why: "The same Union-Find: a tree is the graph where every edge merges two groups and there is only one group at the end." },
    { id: "number-of-islands", why: "Counting components of a grid: with DFS flood fill (or union-find on cells)." },
    { id: "clone-graph", why: "A traversal of a graph, copying every node reachable from a start." },
    { id: "course-schedule", why: "A directed-graph question, where a topological sort replaces union-find." },
  ],
  patternNote: "**Union-Find** keeps a forest of parent pointers. `find` walks to the root (compressing the path), `union` links two roots. With the number of groups tracked as a counter, every edge costs almost constant time, which also makes it ideal when links arrive over time.",
  takeaways: [
    "Start with `components = n`; every edge that joins **different** groups merges them and does `components--`.",
    "Compare **roots** (`find(a) != find(b)`), and link **roots** (`parent[ra] = rb`).",
    "Redundant edges (cycles, duplicates) change nothing; isolated nodes count as components.",
    "Path compression (+ union by size): $O((n + E)\\,\\alpha(n))$ time, $O(n)$ space.",
    "Union-Find also handles edges arriving online; DFS/BFS would have to start over.",
  ],
});
