SHEETS.define({
  id: "graph-valid-tree",
  viz: "unionfind",
  io: { fn: "validTree", params: [["n", "int"], ["edges", "int[][]"]], ret: "bool", labels: { n: "n (number of nodes)", edges: "edges (undirected pairs)" } },
  premium: true,

  statement: `You have \`n\` nodes labelled \`0\` to \`n − 1\` and a list of undirected \`edges\`, where \`edges[i] = [a, b]\` joins nodes \`a\` and \`b\`.

Return \`true\` if these edges form a **valid tree**, and \`false\` otherwise. A graph is a tree when it is **connected** (every node can reach every other) and has **no cycles**.`,
  examples: [
    { input: "n = 5, edges = [[0, 1], [0, 2], [0, 3], [1, 4]]", output: "true", explain: "Five nodes, four edges, all connected, no cycle." },
    { input: "n = 5, edges = [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]", output: "false", explain: "The edges `1–2`, `2–3`, `1–3` form a cycle." },
  ],
  constraints: ["$1 \\le n \\le 2000$", "$0 \\le$ `edges.length` $\\le 5000$", "$0 \\le a_i, b_i < n$ and $a_i \\ne b_i$", "There are no repeated edges."],
  check(input) {
    if (input.n > 10) return "for the animation use at most 10 nodes";
    for (const e of input.edges) if (e.length !== 2 || e[0] < 0 || e[1] < 0 || e[0] >= input.n || e[1] >= input.n) return "each edge must be a pair [a, b] with both numbers between 0 and n − 1";
    return null;
  },

  intuition: {
    find: "A yes/no answer about the **shape** of the graph: is it connected and cycle-free? (Equivalently: one component and exactly `n − 1` edges.)",
    beginner: "Build the adjacency lists, run a DFS from node 0 while remembering the parent, and check two things: no already-visited neighbour other than the parent (no cycle), and every node got visited (connected).",
    works: "A DFS that never meets a visited non-parent neighbour has found no cycle, and visiting all `n` nodes proves connectivity. Those are exactly the two defining properties of a tree.",
    slow: "It is not slow ($O(V + E)$), but it needs the full adjacency structure and a traversal with parent bookkeeping, and the cycle test (*\"visited but not my parent\"*) is easy to get wrong on undirected graphs.",
    repeat: "The DFS rediscovers connectivity from scratch. A different way to look at it: **add the edges one at a time** and watch the components merge, which is exactly what Union-Find tracks.",
    remember: "Remember, for every node, **which group (component) it belongs to**, as a pointer to a representative (the *root* of its group).",
    observation: "Add the edges one by one. If an edge joins two nodes that are **already in the same group**, it closes a cycle: not a tree. Otherwise it **merges** two groups, which is what a tree edge does. A tree on `n` nodes has exactly `n − 1` edges, so if the count differs the answer is immediately `false` (too few edges leave the graph disconnected; too many force a cycle).",
    leads: "Check `edges.size() == n − 1`. Then Union-Find: for each edge find the roots of both endpoints; if they are equal return `false` (cycle), else link one root to the other. If all edges merge groups, the `n − 1` merges leave exactly one group: a tree.",
  },

  flow: [
    "Build adjacency lists and DFS from node 0 with parent tracking.",
    "No visited non-parent neighbour means no cycle; all nodes visited means connected.",
    "Correct and linear, but needs the adjacency lists and careful parent logic.",
    "Think of adding edges one at a time and tracking which group each node is in.",
    "An edge inside one group closes a cycle; an edge between groups merges them.",
    "Check `edges == n − 1`, then Union-Find: any edge joining the same group → `false`. Near $O(n)$.",
  ],

  brute: {
    idea: "**The standard graph traversal:** build adjacency lists, check `edges.size() == n − 1`, then BFS/DFS from node 0 and count the visited nodes. With exactly `n − 1` edges, the graph is a tree if and only if all `n` nodes are reachable from node 0.",
    why: "It is correct and also $O(V + E)$, so the weakness is practical rather than asymptotic: it needs adjacency lists, a queue and a visited array, and it answers only a *static* question. Union-Find needs only an array of parents, detects a cycle **the instant** the offending edge is processed, and extends to edges arriving one at a time.",
    time: "O(n + e)", space: "O(n + e)",
    cpp: `class Solution {
public:
    bool validTree(int n, vector<vector<int>>& edges) {
        if ((int)edges.size() != n - 1) return false;
        vector<vector<int>> adj(n);
        for (auto& e : edges) { adj[e[0]].push_back(e[1]); adj[e[1]].push_back(e[0]); }
        vector<bool> seen(n, false);
        queue<int> q; q.push(0); seen[0] = true;
        int visited = 0;
        while (!q.empty()) {
            int u = q.front(); q.pop(); visited++;
            for (int v : adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); }
        }
        return visited == n;
    }
};`,
    js: `function validTree(n, edges) {
  if (edges.length !== n - 1) return false;
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const seen = new Array(n).fill(false), q = [0];
  seen[0] = true;
  for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (!seen[v]) { seen[v] = true; q.push(v); }
  return q.length === n;
}`,
  },

  pattern: {
    name: "Union Find",
    why: "Union-Find (disjoint sets) answers *\"are these two nodes already connected?\"* and *\"merge their groups\"* in almost constant time. A tree is a graph in which **every edge merges two different groups**: the first edge that links two nodes of the same group is a cycle. So tree validation is a direct application of Union-Find.",
    recognize: [
      "Questions about **connectivity** or **components** when edges arrive or can be processed one by one.",
      "You need to detect that an edge would create a **cycle** in an undirected graph.",
      "The state is *which group each node belongs to*, and groups only ever **merge**.",
      "Counting components, grouping equivalent items (accounts, equations), Kruskal's minimum spanning tree.",
    ],
  },

  optimal: {
    idea: "A tree on `n` nodes has exactly `n − 1` edges, so reject any other edge count first. Then keep a `parent` array where each group is a tree of pointers ending at a root (initially every node is its own root). For each edge, `find` the roots of both endpoints (compressing paths as you go): if the roots are the same, the edge closes a cycle: return `false`. Otherwise link one root under the other.",
    steps: [
      "If `edges.size() != n − 1`, return `false`.",
      "Set `parent[i] = i` for all nodes (each node is a group of its own).",
      "For each edge `[a, b]`: `ra = find(a)`, `rb = find(b)`.",
      "If `ra == rb`: **return `false`** (a cycle).",
      "Otherwise merge: `parent[ra] = rb`.",
      "After all edges, return `true`.",
    ],
    invariant: "**The groups of the union-find structure are exactly the connected components of the edges processed so far, and those edges contain no cycle.**",
    correct: "*Edge count:* a tree has `n − 1` edges (it is connected and acyclic), so any other count is impossible. *Cycle detection:* an undirected edge `(a, b)` closes a cycle exactly when `a` and `b` are already connected by the earlier edges, i.e. when they are in the same group (same root). *Connectivity:* if there is no cycle, each of the `n − 1` edges merges two different groups, so `n` singleton groups become `n − (n − 1) = 1` group: connected. So `n − 1` edges with no cycle imply a connected acyclic graph, a tree. `find` with path compression and linking roots keep the structure consistent.",
  },

  cpp: `class Solution {
public:
    bool validTree(int n, vector<vector<int>>& edges) {
        if ((int)edges.size() != n - 1) return false;                 // a tree has n-1 edges //@count
        vector<int> parent(n);
        iota(parent.begin(), parent.end(), 0);                        // everyone is their own root //@init
        function<int(int)> find = [&](int x) {                        // root of x, compressing the path //@find
            return parent[x] == x ? x : parent[x] = find(parent[x]);
        };
        for (auto& e : edges) {                                       //@loop
            int a = find(e[0]), b = find(e[1]);                       //@find
            if (a == b) return false;                                 // already connected: cycle //@cycle
            parent[a] = b;                                            // merge the groups //@union
        }
        return true;                                                  //@ret
    }
};`,
  js: `function validTree(n, edges) {
  if (edges.length !== n - 1) return false;                           // a tree has n-1 edges //@count
  const parent = Array.from({ length: n }, (_, i) => i);              // everyone is their own root //@init
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));   // path compression //@find
  for (const [x, y] of edges) {                                       //@loop
    const a = find(x), b = find(y);                                   //@find
    if (a === b) return false;                                        // already connected: cycle //@cycle
    parent[a] = b;                                                    // merge the groups //@union
  }
  return true;                                                        //@ret
}`,

  tests: [
    { name: "Example 1: a tree", kind: "normal", input: { n: 5, edges: [[0, 1], [0, 2], [0, 3], [1, 4]] } },
    { name: "Example 2: a cycle", kind: "normal", input: { n: 5, edges: [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]] } },
    { name: "A path", kind: "normal", input: { n: 5, edges: [[0, 1], [1, 2], [2, 3], [3, 4]] } },
    { name: "Disconnected (too few edges)", kind: "edge", input: { n: 4, edges: [[0, 1], [2, 3]] }, why: "Two separate pairs have no cycle but are **not connected**: `n − 1 = 3` edges are needed and there are only 2. The edge-count check rejects it immediately; without it you would also need a connectivity test." },
    { name: "Right edge count but a cycle and an orphan", kind: "edge", input: { n: 4, edges: [[0, 1], [1, 2], [0, 2]] }, why: "There are `n − 1 = 3` edges, so the count check passes, yet nodes 0-1-2 form a triangle and node 3 is isolated. Union-Find catches it at the third edge: `find(0) == find(2)`. This is why the count alone is not enough." },
    { name: "Repeated edge", kind: "edge", input: { n: 3, edges: [[0, 1], [0, 1]] }, why: "The same pair twice is a (tiny) cycle: the second `[0, 1]` joins two nodes that are already in the same group. Also node 2 is isolated. The statement says repeats do not occur, but robust code returns `false`." },
    { name: "A single node", kind: "corner", input: { n: 1, edges: [] }, why: "`n − 1 = 0` edges and nothing to merge: one node is a valid tree. The loop never runs." },
    { name: "Two nodes, no edge", kind: "corner", input: { n: 2, edges: [] }, why: "`n − 1 = 1` edge needed, 0 given: disconnected, so `false`. The count check handles it." },
    { name: "A star", kind: "corner", input: { n: 6, edges: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] }, why: "Every edge merges a leaf into the hub: five merges, one group. The groups form a single tree of pointers." },
  ],

  trace(input, T) {
    const n = input.n, edges = input.edges;
    const parent = Array.from({ length: n }, (_, i) => i);
    const size = new Array(n).fill(1);
    const hlOf = (o) => { const h = {}; (o.path || []).forEach((i) => (h[i] = "cmp")); if (o.root != null) h[o.root] = "win"; (o.bad || []).forEach((i) => (h[i] = "bad")); (o.ok || []).forEach((i) => (h[i] = "ok")); return h; };
    const S = (idx, o = {}) => () => ({ n, parent: parent.slice(), size: size.slice(), hl: hlOf(o), edges, edgesLabel: "edges to process", edgeIdx: idx, find: o.path, count: o.count, note: o.note });
    let whyCount = false, whyCycle = false, whyUnion = false, whyComp = false;
    if (edges.length !== n - 1) {
      T.step("count", { vars: { n, edges: edges.length, "n − 1": n - 1 }, state: S(0, {}), phase: "Edge count", say: `A tree with **${n}** node${n === 1 ? "" : "s"} must have exactly **${n - 1}** edges, but there ${edges.length === 1 ? "is" : "are"} **${edges.length}**. ${edges.length < n - 1 ? "Too few edges cannot connect all the nodes." : "Too many edges force a cycle."} Return \`false\`.`, op: `edges.size() = ${edges.length}  ≠  n − 1 = ${n - 1}  ⇒  return false`, act: "WRONG_COUNT",
        why: { title: "Why exactly n − 1 edges?", text: "A connected graph needs at least n − 1 edges (each new node needs an edge to join), and an acyclic graph has at most n − 1 edges (one more would close a cycle). A tree is both, so it has exactly n − 1." } });
      T.result(false);
      return;
    }
    T.step("count", { vars: { n, edges: edges.length }, state: S(0, {}), phase: "Edge count", say: `The edge count ${edges.length} equals \`n − 1 = ${n - 1}\`: a necessary condition for a tree. It is not sufficient (a cycle plus a separate node has the same count), so we still check every edge.`, op: `edges.size() == n − 1  →  true`, act: "COUNT_OK",
      why: whyCount ? null : { title: "Is the count enough?", text: "No. 3 nodes in a triangle plus a 4th isolated node also has n − 1 = 3 edges, but it is neither connected nor acyclic. Union-Find checks the edges themselves." } });
    whyCount = true;
    T.step("init", { vars: { parent: parent.slice() }, state: S(0, { note: "every node is the root of its own group" }), say: "Start with **every node in its own group**: \`parent[i] = i\` (an arrow from a node to itself means *I am a root*). There are as many groups as nodes.", op: "parent[i] = i  for all i", act: "SINGLETONS" });
    T.phase("Process the edges one by one");
    const find = (x, emit, who) => {
      const path = [x]; let r = x;
      while (parent[r] !== r) { r = parent[r]; path.push(r); }
      if (emit) T.step("find", { vars: { [who]: x, root: r, path: path.join(" → ") }, state: S(emit.i, { path: path.slice(0, -1), root: r }), say: path.length === 1 ? `\`find(${x})\`: node ${x} is its own root, so its group is **${r}**.` : `\`find(${x})\`: follow the parent pointers ${path.join(" → ")}. The root (an arrow to itself) is **${r}**, so ${x} belongs to the group of ${r}.`, op: `find(${x}) = ${r}`, act: "FIND_ROOT" });
      const changed = path.slice(0, -1).filter((p) => parent[p] !== r);
      path.slice(0, -1).forEach((p) => (parent[p] = r));
      if (emit && changed.length) T.step("find", { vars: { [who]: x, root: r }, state: S(emit.i, { path: path.slice(0, -1), root: r, note: "path compression: every node on the path now points straight at the root" }), say: `**Path compression:** ${changed.join(", ")} now point directly at the root ${r}, so the next \`find\` on any of them takes one step.`, op: `parent[${changed.join("], parent[")}] = ${r}`, act: "COMPRESS_PATH",
        why: whyComp ? null : { title: "Why compress the path?", text: "After a find, we may as well rewire every node we walked through to point at the root. The tree becomes flatter, so future finds are faster; amortised, find costs almost O(1)." } });
      if (emit && changed.length) whyComp = true;
      return r;
    };
    for (let i = 0; i < edges.length; i++) {
      const [x, y] = edges[i];
      T.step("loop", { vars: { edge: `[${x}, ${y}]`, i }, state: S(i, { path: [x, y] }), say: `Next edge: **${x} — ${y}**. Are these two nodes already in the same group?`, op: `edge = [${x}, ${y}]`, act: "NEXT_EDGE" });
      const a = find(x, { i }, "x"), b = find(y, { i }, "y");
      if (a === b) {
        T.step("cycle", { vars: { "find(x)": a, "find(y)": b }, state: S(i, { bad: [x, y], root: a }), say: `Both endpoints have the **same root ${a}**: ${x} and ${y} are already connected through earlier edges. Adding **${x} — ${y}** would close a **cycle**. Not a tree: return \`false\`.`, op: `find(${x}) == find(${y}) = ${a}  ⇒  return false`, act: "CYCLE_FOUND",
          why: whyCycle ? null : { title: "Why does 'same root' mean a cycle?", text: "The earlier edges already give a path between the two nodes (they are in one group). A new edge between them makes a second route: a cycle." } });
        whyCycle = true;
        T.result(false);
        return;
      }
      parent[a] = b; size[b] += size[a];
      T.step("union", { vars: { "root of x": a, "root of y": b }, state: S(i + 1, { ok: [a], root: b, note: `group ${a} now hangs under group ${b}` }), say: `Different roots (**${a}** and **${b}**), so the edge joins two separate groups. **Merge** them: \`parent[${a}] = ${b}\`. The number of groups drops by one.`, op: `parent[${a}] = ${b}`, act: "MERGE_GROUPS",
        why: whyUnion ? null : { title: "Why link the roots, not the nodes?", text: "Linking the roots joins the two whole groups with a single pointer. Linking an arbitrary node would leave the old root pointing elsewhere and split a group." } });
      whyUnion = true;
    }
    T.step("ret", { vars: { edges: edges.length }, state: S(edges.length, { note: "one group left" }), say: `All **${edges.length}** edges merged different groups, so no cycle appeared. Starting from ${n} groups, ${n - 1} merges leave exactly **one** group: the graph is connected. It is a valid tree: \`true\`.`, op: "return true", act: "VALID_TREE" });
    T.result(true);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 6), k = Math.floor(rnd() * (n + 2)), set = new Set(), edges = [];
    if (n >= 2) for (let i = 0; i < k * 2 && edges.length < k; i++) { const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n); if (a === b) continue; const key = Math.min(a, b) + "," + Math.max(a, b); if (!set.has(key)) { set.add(key); edges.push([a, b]); } }
    // half of the time build a real tree
    if (rnd() < 0.5 && n >= 2) { const e2 = []; for (let i = 1; i < n; i++) e2.push([Math.floor(rnd() * i), i]); return { n, edges: e2 }; }
    return { n, edges };
  },
  gen(n) { return { n, edges: Array.from({ length: n - 1 }, (_, i) => [i, i + 1]) }; },

  complexity: {
    time: {
      tex: "O(n \\cdot \\alpha(n))", title: "n − 1 edges, each two near-constant finds and a union", short: "α is the inverse Ackermann function (at most 4 in practice)",
      derive: [
        "T_{\\text{check}} = O(1) || the edge-count test",
        "\\text{each edge: } 2 \\text{ finds} + 1 \\text{ union}; \\text{ with path compression a find costs } O(\\alpha(n)) \\text{ amortised} || the amortised bound of Tarjan",
        "T(n) = O(1) + (n-1)\\cdot O(\\alpha(n)) || at most $n - 1$ edges are processed (more would have been rejected)",
        "!T(n) = O(n \\cdot \\alpha(n)) \\approx O(n) || $\\alpha(n) \\le 4$ for any input that fits in the universe",
      ],
      where: "Because the edge count is checked first, at most $n - 1$ edges are processed. In the lab the number of steps grows linearly with the number of nodes of a path graph (the measured table counts steps, where each `find` is one frame).",
    },
    space: {
      tex: "O(n)", title: "the parent array", short: "one integer per node",
      derive: [
        "S(n) = |\\text{parent}| = n \\cdot s_{\\text{int}} || no adjacency lists",
        "!S(n) = O(n) || plus $O(n)$ stack in the worst case for a recursive `find` (iterative `find` needs none)",
      ],
      where: "The BFS version needs adjacency lists (about $2E$ entries), a queue and a visited array. The union-find structure is just `parent[]` (and optionally `size[]`).",
    },
    limit: "Each node and each edge must be read, so $\\Omega(n)$ is a lower bound. The inverse-Ackermann factor is also known to be optimal for the general union-find problem (Fredman–Saks).",
    measure: { label: "n = number of nodes (a path)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Checking only for cycles", what: "Running Union-Find and returning `true` if no cycle was found.", why: "\"A tree is acyclic\" is the famous half of the definition.", breaks: "A forest (several trees) has no cycle but is **not connected**, e.g. `n = 4`, edges `[[0,1],[2,3]]` would return `true`.", avoid: "Also require `edges.size() == n − 1` (or count components): acyclic + `n − 1` edges ⇒ connected." },
    { title: "Checking only the edge count", what: "Returning `edges.size() == n − 1`.", why: "It is a necessary condition and cheap.", breaks: "A cycle plus an isolated node has the same count: `[[0,1],[1,2],[0,2]]` with `n = 4` is not a tree.", avoid: "Combine the count with cycle detection (or a connectivity check)." },
    { title: "Linking the nodes instead of their roots", what: "`parent[x] = y` instead of `parent[find(x)] = find(y)`.", why: "It looks like the obvious way to connect two nodes.", breaks: "If `x` is not a root, you cut it off from its old group's root and silently split a group; later finds give wrong answers.", avoid: "Always `parent[rootX] = rootY`." },
    { title: "Forgetting path compression (or recursing without a base case)", what: "A `find` that never flattens the tree.", why: "The simplest `find` is just a loop.", breaks: "A long chain makes each `find` $O(n)$, so $n$ edges cost $O(n^2)$; for a recursive `find` on 10⁵ nodes it can overflow the stack.", avoid: "Compress paths (and union by size/rank for the best bounds)." },
    { title: "Treating the graph as directed in the traversal approach", what: "Adding only `adj[a].push_back(b)`.", why: "The edge is written as a pair `[a, b]`.", breaks: "Undirected edges must be added in both directions; otherwise a BFS from 0 misses nodes and reports \"not connected\".", avoid: "Push both `a → b` and `b → a`." },
  ],

  followUps: [
    {
      q: "Count the **connected components** instead (*Number of Connected Components*).",
      a: "Same structure: start with `components = n`, and for every edge whose endpoints have different roots, merge them and decrement `components`. The answer is `components`. That is the next lesson.",
      time: "O(n·α(n))", space: "O(n)",
    },
    {
      q: "Use **union by size** as well as path compression. What is gained?",
      a: "When merging, attach the *smaller* group's root under the *larger* one. That keeps the trees shallow (depth $O(\\log n)$ even without compression), and combined with path compression gives the optimal $O(\\alpha(n))$ amortised bound.",
      cpp: `struct DSU {
    vector<int> p, sz;
    DSU(int n) : p(n), sz(n, 1) { iota(p.begin(), p.end(), 0); }
    int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }
    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;           // already connected
        if (sz[a] < sz[b]) swap(a, b);
        p[b] = a; sz[a] += sz[b];           // smaller under larger
        return true;
    }
};`,
      js: `class DSU {
  constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); this.sz = new Array(n).fill(1); }
  find(x) { return this.p[x] === x ? x : (this.p[x] = this.find(this.p[x])); }
  unite(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;              // already connected
    if (this.sz[a] < this.sz[b]) [a, b] = [b, a];
    this.p[b] = a; this.sz[a] += this.sz[b]; // smaller under larger
    return true;
  }
}`,
      time: "O(α(n)) per op", space: "O(n)",
    },
    {
      q: "Edges arrive **one at a time**; find the edge that makes the graph stop being a tree (*Redundant Connection*).",
      a: "Process the edges in order with Union-Find and return the **first edge** whose endpoints already have the same root: that edge closes the first cycle. It is the same cycle test as in this lesson, returned instead of a boolean, in $O(n \\alpha(n))$.",
      time: "O(n·α(n))", space: "O(n)",
    },
    {
      q: "Build a **minimum spanning tree** of a weighted graph.",
      a: "**Kruskal's algorithm:** sort the edges by weight; go through them smallest first and use Union-Find to add an edge only if it joins two different groups (exactly this lesson's cycle test). Stop after `n − 1` edges. Time $O(E \\log E)$ for the sort; the union-find work is almost linear.",
      time: "O(E log E)", space: "O(n)",
    },
  ],

  related: [
    { id: "number-of-connected-components-in-an-undirected-graph", why: "The same Union-Find, counting how many groups remain instead of testing for cycles." },
    { id: "course-schedule", why: "A directed-graph cycle question (solved with topological sort, since union-find only handles undirected graphs)." },
    { id: "number-of-islands", why: "Counting components on a grid with DFS instead of Union-Find." },
    { id: "clone-graph", why: "Another graph question about traversing every node exactly once." },
  ],
  patternNote: "**The Union-Find pattern** maintains groups that only merge. `find` returns a group's representative, `union` merges two groups, and *\"same representative\"* means *already connected*. Cycle detection in undirected graphs, counting components, Kruskal and equivalence grouping are all one idea: process the links one by one and merge.",
  takeaways: [
    "A tree = **connected + acyclic** = connected with exactly `n − 1` edges = acyclic with exactly `n − 1` edges.",
    "Check `edges.size() == n − 1` first, then Union-Find over the edges.",
    "An edge whose endpoints already share a **root** closes a cycle: return `false`; otherwise link `parent[rootA] = rootB`.",
    "Use path compression (and union by size) for almost-constant `find`: $O(n\\,\\alpha(n))$ total, $O(n)$ space.",
    "Count alone or cycle test alone is not enough: you need both ideas together.",
  ],
});
