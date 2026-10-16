SHEETS.define({
  id: "clone-graph",
  viz: "graph",
  io: { fn: "cloneGraph", params: [["node", "graph"]], ret: "graph", labels: { node: "graph as an adjacency list (node i+1 has the neighbours in row i)" } },

  statement: `You are given a reference to a node in a **connected, undirected graph**. Return a **deep copy** (clone) of the whole graph: new nodes with the same values and the same connections, sharing no node with the original.

Each node has an integer \`val\` (unique, from 1 to the number of nodes) and a list \`neighbors\`. *(In the lab the graph is written as an adjacency list: row \`i\` lists the neighbours of node \`i + 1\`, and the function receives node 1. The program prints the clone's adjacency list, or a warning if the clone shares nodes with the original.)*`,
  examples: [
    { input: "adjList = [[2, 4], [1, 3], [2, 4], [1, 3]]", output: "[[2, 4], [1, 3], [2, 4], [1, 3]]", explain: "A square: 1–2, 2–3, 3–4, 4–1. The clone has the same shape with brand-new nodes." },
    { input: "adjList = [[]]", output: "[[]]", explain: "One node with no neighbours." },
    { input: "adjList = []", output: "[]", explain: "An empty graph: there is no node to start from, so the answer is `null`." },
  ],
  constraints: ["The number of nodes is in the range $[0, 100]$", "$1 \\le$ `Node.val` $\\le 100$ and values are unique", "There are no repeated edges and no self-loops.", "The graph is connected and every node is reachable from the given node."],
  check(input) {
    const adj = input.node, n = adj.length;
    if (n > 7) return "for the animation use at most 7 nodes";
    for (let i = 0; i < n; i++) for (const v of adj[i]) { if (v < 1 || v > n || v === i + 1) return "neighbours must be node numbers between 1 and the number of nodes, and not the node itself"; if (!adj[v - 1].includes(i + 1)) return `the graph is undirected: node ${v} must list node ${i + 1} as a neighbour too`; }
    return null;
  },

  intuition: {
    find: "A **new** graph with the same shape: one fresh node for each original node, and an edge between two fresh nodes exactly when the originals are connected.",
    beginner: "Walk the graph from the start node. For each node, make a new node with the same value and recursively clone each of its neighbours, attaching the clones as the new node's neighbours.",
    works: "On a *tree* this is exactly right: every node is reached once, and the recursion mirrors the structure.",
    slow: "It is not about speed: on a graph with a **cycle** it never stops. Node 1's neighbour is 2, whose neighbour is 1 again, which clones 2 again, forever (and even without infinite recursion it would create several copies of the same node).",
    repeat: "The same original node is reached again and again, through different edges, and each time the naive recursion creates a **new** copy instead of reusing the one it already made.",
    remember: "Remember which original nodes already have a clone: a **hash map** from `original → clone`. Before cloning a node, check the map; if there is an entry, reuse that clone.",
    observation: "Two rules make it correct: **(1)** create the clone and **register it in the map *before* recursing into the neighbours**, so a cycle that returns to this node finds the existing clone and stops; **(2)** every edge is created by pushing the neighbour's clone (from the recursion) onto the current clone's list.",
    leads: "`dfs(node)`: if the node is in the map, return its clone; otherwise create the clone, store it in the map, then for every neighbour push `dfs(neighbour)` into the clone's neighbour list; return the clone. Each node is cloned once and each edge is processed once: $O(V + E)$.",
  },

  flow: [
    "Recursively clone each node, then its neighbours.",
    "Right for trees: each node is reached once.",
    "On a cycle it never ends (and would make duplicate copies).",
    "Remember which originals already have a clone: a map `original → clone`.",
    "Register the clone **before** recursing, so cycles find it and stop.",
    "DFS/BFS with the map: $O(V + E)$ time, $O(V)$ space.",
  ],

  brute: {
    idea: "**Two passes with an explicit order:** pass 1, a BFS from the start node, discovers every node and creates its (edge-less) clone, storing it in a map. Pass 2 walks the same nodes again and, for each original neighbour, appends the neighbour's clone to the clone's list.",
    why: "It is correct and also $O(V + E)$. It is the *safe but clumsy* version: it needs two traversals and an extra list of nodes, while the one-pass DFS with a map builds the clone and its edges at the same time. (The truly naive recursion with no map is what fails on cycles.)",
    time: "O(V + E)", space: "O(V)",
    cpp: `class Solution {
public:
    Node* cloneGraph(Node* node) {
        if (!node) return nullptr;
        unordered_map<Node*, Node*> copy;
        vector<Node*> order;
        queue<Node*> q; q.push(node); copy[node] = new Node(node->val);
        while (!q.empty()) {                                  // pass 1: nodes only
            Node* u = q.front(); q.pop(); order.push_back(u);
            for (Node* v : u->neighbors)
                if (!copy.count(v)) { copy[v] = new Node(v->val); q.push(v); }
        }
        for (Node* u : order)                                 // pass 2: edges
            for (Node* v : u->neighbors) copy[u]->neighbors.push_back(copy[v]);
        return copy[node];
    }
};`,
    js: `function cloneGraph(node) {
  if (!node) return null;
  const copy = new Map(), order = [], q = [node];
  copy.set(node, new Node(node.val));
  for (let h = 0; h < q.length; h++) {                        // pass 1: nodes only
    const u = q[h]; order.push(u);
    for (const v of u.neighbors) if (!copy.has(v)) { copy.set(v, new Node(v.val)); q.push(v); }
  }
  for (const u of order)                                      // pass 2: edges
    for (const v of u.neighbors) copy.get(u).neighbors.push(copy.get(v));
  return copy.get(node);
}`,
  },

  pattern: {
    name: "DFS (with a visited map)",
    why: "Copying a graph means visiting every node and edge exactly once. Depth-first search does that, and the **visited memory** (here a map from original to clone) is what stops it from looping forever on cycles *and* guarantees one clone per node. The map serves two purposes at once: *visited set* and *lookup of the already-built clone*.",
    recognize: [
      "You must **traverse a graph** (possibly with cycles) and build or compute something per node.",
      "A node can be reached by **several routes**, but should be processed once.",
      "The answer needs to **refer back** to a result created earlier for the same node (a clone, a cached value): use a map, not just a boolean `visited`.",
      "Words like *copy*, *clone*, *deep copy*, *serialize a graph*.",
    ],
  },

  optimal: {
    idea: "Keep a map `copy: original → clone`. `dfs(node)` returns the clone of `node`: if it is already in the map, return it; otherwise create the clone, **record it right away**, then clone each neighbour with a recursive call and append the result to the clone's neighbour list. Start with `dfs(startNode)`.",
    steps: [
      "If `node` is `null`, return `null` (empty graph).",
      "If `node` is already in `copy`, return `copy[node]` (it has been cloned).",
      "Create `clone = new Node(node.val)` and store `copy[node] = clone` **before** looking at the neighbours.",
      "For each neighbour `nb` of `node`: `clone.neighbors.push_back(dfs(nb))`.",
      "Return `clone`.",
    ],
    invariant: "**Every original node reached so far has exactly one clone, registered in the map, and every edge examined so far has been reproduced between the corresponding clones.**",
    correct: "*One clone per node:* a node is cloned only when it is absent from the map, and it is put into the map immediately, so any later visit (including along a cycle back to it) finds and reuses it. *All edges are copied:* for every original node, the loop visits each neighbour once and pushes that neighbour's clone, so the clone's neighbour list is the same list (in the same order) as the original's. *Termination:* every recursive call either returns at once (already cloned) or marks a new node, and there are finitely many nodes. Since the graph is connected, every node is reached from the start.",
  },

  cpp: `class Solution {
    unordered_map<Node*, Node*> copy;                       // original -> clone //@map
    Node* dfs(Node* node) {
        if (!node) return nullptr;                          //@null
        auto it = copy.find(node);
        if (it != copy.end()) return it->second;            // already cloned: reuse it //@seen
        Node* clone = new Node(node->val);                  // a brand-new node //@make
        copy[node] = clone;                                 // register BEFORE recursing //@register
        for (Node* nb : node->neighbors)                    //@loop
            clone->neighbors.push_back(dfs(nb));            // clone the neighbour, then link //@link
        return clone;                                       //@ret
    }
public:
    Node* cloneGraph(Node* node) { return dfs(node); }      //@start
};`,
  js: `function cloneGraph(node) {
  const copy = new Map();                                   // original -> clone //@map
  const dfs = (n) => {
    if (n === null) return null;                            //@null
    if (copy.has(n)) return copy.get(n);                    // already cloned: reuse it //@seen
    const clone = new Node(n.val);                          // a brand-new node //@make
    copy.set(n, clone);                                     // register BEFORE recursing //@register
    for (const nb of n.neighbors)                           //@loop
      clone.neighbors.push(dfs(nb));                        // clone the neighbour, then link //@link
    return clone;                                           //@ret
  };
  return dfs(node);                                         //@start
}`,

  tests: [
    { name: "Example 1: a square", kind: "normal", input: { node: [[2, 4], [1, 3], [2, 4], [1, 3]] } },
    { name: "Example 2: a single node", kind: "normal", input: { node: [[]] } },
    { name: "Example 3: an empty graph", kind: "normal", input: { node: [] } },
    { name: "A triangle (a cycle)", kind: "edge", input: { node: [[2, 3], [1, 3], [1, 2]] }, why: "Every node is a neighbour of every other, so each node is reached **several times**. Without the map the recursion would loop forever. The map makes the later visits return the existing clone, which is the whole point of the problem." },
    { name: "A path (no cycle)", kind: "edge", input: { node: [[2], [1, 3], [2, 4], [3]] }, why: "A tree-shaped graph: the DFS goes straight down. Even here an *undirected* edge `1–2` is seen from both ends, so node 2 is asked to clone node 1 again on the way back: the map is needed even without cycles." },
    { name: "Neighbour order is preserved", kind: "edge", input: { node: [[3, 2], [1, 3], [2, 1]] }, why: "The clone's neighbour lists must be in the **same order** as the original's (`[3, 2]` for node 1, not `[2, 3]`). Pushing neighbours in the order of the loop keeps that." },
    { name: "A star", kind: "corner", input: { node: [[2, 3, 4], [1], [1], [1]] }, why: "The hub reaches each leaf once; each leaf sees the hub already cloned. It checks that registering the clone *before* the loop lets the leaves link back to the existing hub clone." },
    { name: "Two nodes", kind: "corner", input: { node: [[2], [1]] }, why: "The smallest graph with an edge: `dfs(1)` clones 2, and `dfs(2)` finds 1 in the map and returns it, so the two clones point at each other." },
  ],

  trace(input, T) {
    const adj = input.node, n = adj.length;
    const ctr = (cx, cy, i) => ({ x: cx + 78 * Math.cos((2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2), y: cy + 78 * Math.sin((2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2) });
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ id: "o" + (i + 1), label: String(i + 1), ...ctr(110, 110, i) });
    const cloneNodes = [], cloneEdges = [], mapped = {};
    const origEdges = [];
    for (let i = 0; i < n; i++) for (const v of adj[i]) if (i + 1 < v) origEdges.push(["o" + (i + 1), "o" + v]);
    const visiting = [], done = {}, stack = [];
    let callId = 0, whyReg = false, whySeen = false, whyLink = false;
    const S = (cur, o = {}) => () => {
      const allNodes = nodes.concat(Object.keys(mapped).map((v) => ({ id: "c" + v, label: v + "′", ...ctr(400, 110, +v - 1) })));
      const hl = {};
      Object.keys(mapped).forEach((v) => (hl["c" + v] = "hit"));
      Object.keys(done).forEach((v) => (hl["o" + v] = "ok"));
      visiting.forEach((v) => (hl["o" + v] = "win"));
      if (cur != null) hl["o" + cur] = "cur";
      if (o.nb != null) hl["o" + o.nb] = o.nbCls || "cmp";
      if (o.cloneCur != null) hl["c" + o.cloneCur] = "cur";
      const ehl = {};
      if (o.edge) ehl["o" + o.edge[0] + "-o" + o.edge[1]] = "hot";
      return { nodes: allNodes, edges: origEdges.concat(cloneEdges.map(([a, b]) => ["c" + a, "c" + b, true])), hl, ehl, stack: stack.map((s) => ({ t: s.t, id: s.id })), stackTitle: "recursion", arrs: [{ label: "copy map  (original → clone)", arr: Object.keys(mapped).map((v) => `${v}→${v}′`), hl: {}, cw: 52, size: 12 }], note: o.note, label: "left: the original graph       right: the clone being built" };
    };
    T.step("start", { vars: { nodes: n }, state: S(null, { note: n ? undefined : "the graph is empty" }), phase: "Clone with a DFS and a map", say: n ? `The original graph has **${n}** node${n === 1 ? "" : "s"}. We will build a clone on the right, one node at a time, remembering in a map which original already has a clone.` : "The graph is **empty**: there is no node to start from, so the answer is `null`.", op: n ? "copy = { }" : "node == null  →  return null", act: n ? "START" : "EMPTY_GRAPH" });
    if (!n) { T.result([]); return; }
    const dfs = (v) => {
      const id = callId++;
      stack.push({ t: `dfs(${v})`, id });
      visiting.push(v);
      T.step("seen", { vars: { node: v, "copy.size": Object.keys(mapped).length }, state: S(v), say: `\`dfs(${v})\`: is node **${v}** already in the map?`, op: `copy.find(${v}) ?  ${mapped[v] ? "found" : "not found"}`, act: "LOOKUP_IN_MAP" });
      if (mapped[v]) {
        T.step("seen", { vars: { node: v }, state: S(v, { cloneCur: v }), say: `Yes: node ${v} already has a clone (**${v}′**). **Reuse it**: return it without creating anything new. This is what stops a cycle from looping forever.`, op: `return copy[${v}]`, act: "REUSE_CLONE",
          why: whySeen ? null : { title: "Why reuse instead of cloning again?", text: "Cloning again would create a *second* copy of the same node (and, on a cycle, recurse forever). The map guarantees exactly one clone per original." } });
        whySeen = true;
        visiting.pop(); stack.pop();
        return;
      }
      mapped[v] = true;
      T.step("make", { vars: { node: v }, state: S(v, { cloneCur: v }), say: `Not in the map: create a **new node ${v}′** with the same value. It has no neighbours yet.`, op: `clone = new Node(${v})`, act: "CREATE_CLONE" });
      T.step("register", { vars: { node: v, "copy.size": Object.keys(mapped).length }, state: S(v, { cloneCur: v }), say: `Record \`copy[${v}] = ${v}′\` **before** looking at the neighbours. If a neighbour's recursion comes back to ${v}, it will find this entry and stop.`, op: `copy[${v}] = ${v}′`, act: "REGISTER_CLONE",
        why: whyReg ? null : { title: "Why register BEFORE the loop?", text: `A neighbour of ${v} may have ${v} as one of its own neighbours (every undirected edge works both ways). If the entry were created after the loop, that recursive call would not find it and would start cloning ${v} again: infinite recursion.` } });
      whyReg = true;
      for (const nb of adj[v - 1]) {
        T.step("loop", { vars: { node: v, neighbour: nb }, state: S(v, { nb, nbCls: "cmp", cloneCur: v, edge: [Math.min(v, nb), Math.max(v, nb)] }), say: `Clone the neighbour **${nb}** of ${v} (a recursive call), then attach its clone to ${v}′.`, op: `clone->neighbors.push_back(dfs(${nb}))`, act: "VISIT_NEIGHBOUR" });
        dfs(nb);
        cloneEdges.push([v, nb]);
        T.step("link", { vars: { node: v, neighbour: nb }, state: S(v, { nb, nbCls: "hit", cloneCur: v, edge: [Math.min(v, nb), Math.max(v, nb)] }), say: `Back in \`dfs(${v})\`: the call returned ${nb}′. Link it: **${v}′ → ${nb}′**. (The arrow on the right shows the neighbour list of ${v}′ growing.)`, op: `${v}′.neighbors += ${nb}′`, act: "LINK_CLONES",
          why: whyLink ? null : { title: "Why does the edge appear only after the call returns?", text: "`push_back(dfs(nb))` first evaluates the recursive call, which returns the clone of nb (existing or new), and only then appends it. The arrows are therefore added in the order the recursion unwinds." } });
        whyLink = true;
      }
      delete done[v]; done[v] = true; visiting.pop();
      T.step("ret", { vars: { node: v }, state: S(v, { cloneCur: v }), say: `All neighbours of ${v} are linked: \`dfs(${v})\` returns **${v}′**.`, op: `return ${v}′`, act: "RETURN_CLONE" });
      stack.pop();
    };
    dfs(1);
    const rows = Array.from({ length: n }, () => []);
    for (const [a, b] of cloneEdges) rows[a - 1].push(b);
    T.step("start", { vars: { nodes: n }, state: S(null, { note: "the clone is complete" }), say: `Done: the clone has **${n}** node${n === 1 ? "" : "s"} and the same connections: **${JSON.stringify(rows)}**. No node is shared with the original.`, op: "return copy[node]", act: "DONE" });
    T.result(rows);
  },
  fuzz(rnd) {
    const n = Math.floor(rnd() * 7);
    if (n === 0) return { node: [] };
    const adj = Array.from({ length: n }, () => []);
    for (let i = 1; i < n; i++) { const j = Math.floor(rnd() * i); adj[i].push(j + 1); adj[j].push(i + 1); }
    for (let k = 0; k < n; k++) { const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n); if (a !== b && !adj[a].includes(b + 1)) { adj[a].push(b + 1); adj[b].push(a + 1); } }
    adj.forEach((r) => { for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } });
    return { node: adj };
  },
  gen(n) { const k = Math.max(3, n); return { node: Array.from({ length: k }, (_, i) => [((i + 1) % k) + 1, ((i - 1 + k) % k) + 1]) }; },

  complexity: {
    time: {
      tex: "O(V + E)", title: "each node is cloned once, each edge handled twice", short: "V nodes, E undirected edges",
      derive: [
        "\\text{each node is created exactly once (map guard)} \\;\\Rightarrow\\; V \\text{ creations} || later visits return immediately",
        "\\text{each node's neighbour loop runs once; an undirected edge appears in two lists} \\;\\Rightarrow\\; \\sum_v \\deg(v) = 2E \\text{ loop steps} || handshake lemma",
        "\\text{every loop step makes one call; calls on cloned nodes cost } O(1) || the map lookup",
        "T(V, E) = O(V) + O(2E) = c\\,(V + 2E)",
        "!T(V, E) = O(V + E) || the optimal bound: every node and edge must be read",
      ],
      where: "The total number of calls is $1 + 2E$ (the start plus one per neighbour entry), and each costs a constant amount. In the lab a ring of $n$ nodes has $E = n$, so the steps grow linearly with $n$.",
    },
    space: {
      tex: "O(V)", title: "the map and the recursion stack (beyond the output)", short: "the clone itself is the required output",
      derive: [
        "S_{\\text{map}} = V \\cdot (s_{\\text{key}} + s_{\\text{value}}) || one entry per node",
        "S_{\\text{stack}} \\le V \\cdot s_{\\text{frame}} || the recursion can be as deep as the longest simple path",
        "!S_{\\text{extra}} = O(V) || (the output graph, $O(V + E)$, is not counted)",
      ],
      where: "A BFS version replaces the recursion stack with a queue of the same worst-case size. The map is unavoidable: it is what makes each node cloned once.",
    },
    limit: "Any algorithm must read all $V + E$ items of the graph and write a graph of the same size, so $\\Theta(V + E)$ is optimal.",
    measure: { label: "n = number of nodes (a ring)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Registering the clone after the neighbour loop", what: "`copy[node] = clone;` placed after the `for` loop.", why: "\"First build the node completely, then store it\".", breaks: "A neighbour that links back finds no entry and clones the node again: **infinite recursion** on any cycle or undirected edge.", avoid: "Store `copy[node] = clone` immediately after creating it, before recursing." },
    { title: "A shallow copy: reusing the original neighbours", what: "`clone->neighbors = node->neighbors;`", why: "It copies the whole list in one line.", breaks: "The clone points at the **original** nodes, not at clones: the two graphs are tangled (the lab's check prints \"NOT A DEEP COPY\").", avoid: "Clone each neighbour (`dfs(nb)`) and push the *clone*." },
    { title: "Using a boolean `visited` set instead of a map", what: "A `set<Node*> visited`.", why: "It is enough to stop the infinite recursion.", breaks: "When you reach an already visited node you have no way to get *its clone* to link to.", avoid: "Use `map<original, clone>`: it is both the visited set and the lookup." },
    { title: "Forgetting the `null` input", what: "Calling `node->val` on an empty graph.", why: "The examples all have nodes.", breaks: "Null pointer dereference: a crash for the empty graph.", avoid: "`if (!node) return nullptr;`" },
    { title: "Keying the map by value on a graph where values repeat", what: "`map<int, Node*>` by `node->val`.", why: "Values are unique in this problem, so it works.", breaks: "In graphs where values may repeat, distinct nodes would collide and be merged.", avoid: "Key by the node pointer (identity), as the lesson does." },
  ],

  followUps: [
    {
      q: "Write the **BFS** version.",
      a: "Start with a queue holding the start node and a map containing its clone. Pop a node `u`; for each neighbour `v`: if `v` has no clone, create and register one and enqueue `v`; then append `copy[v]` to `copy[u].neighbors`. It avoids deep recursion (so it is safe for very long paths) with the same $O(V + E)$.",
      cpp: `Node* cloneGraphBFS(Node* node) {
    if (!node) return nullptr;
    unordered_map<Node*, Node*> copy;
    copy[node] = new Node(node->val);
    queue<Node*> q; q.push(node);
    while (!q.empty()) {
        Node* u = q.front(); q.pop();
        for (Node* v : u->neighbors) {
            if (!copy.count(v)) { copy[v] = new Node(v->val); q.push(v); }
            copy[u]->neighbors.push_back(copy[v]);
        }
    }
    return copy[node];
}`,
      js: `function cloneGraphBFS(node) {
  if (!node) return null;
  const copy = new Map([[node, new Node(node.val)]]), q = [node];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const v of u.neighbors) {
      if (!copy.has(v)) { copy.set(v, new Node(v.val)); q.push(v); }
      copy.get(u).neighbors.push(copy.get(v));
    }
  }
  return copy.get(node);
}`,
      time: "O(V + E)", space: "O(V)",
    },
    {
      q: "The nodes are numbered `1..n`. Can you avoid the hash map?",
      a: "Yes: use a **vector indexed by node value** (`vector<Node*> copy(n + 1, nullptr)`), which is a direct-address table with $O(1)$ lookups and better constants. It only works when node values are small, unique integers (here they are: 1 to 100).",
      time: "O(V + E)", space: "O(V)",
    },
    {
      q: "Clone a **linked list with random pointers** (a graph with out-degree 2).",
      a: "The same idea: map every original node to its clone, then wire `next` and `random`. A neat $O(1)$-extra-space variant weaves each clone right after its original in the list, sets `clone.random = original.random.next`, then unweaves the two lists. Both are $O(n)$.",
      time: "O(n)", space: "O(n) or O(1)",
    },
    {
      q: "How would you **serialize** a graph to text and rebuild it?",
      a: "Number the nodes (BFS order), then write the adjacency lists (what the lab prints). To rebuild, create all nodes first, then connect them by index. It is the same \"visited map\" idea: the node numbering is the map from node to a stable id.",
      time: "O(V + E)", space: "O(V)",
    },
  ],

  related: [
    { id: "number-of-islands", why: "A graph traversal (on a grid) with a visited mark to avoid repeats." },
    { id: "course-schedule", why: "A graph traversal with per-node bookkeeping (in-degrees)." },
    { id: "number-of-connected-components-in-an-undirected-graph", why: "Visiting every node of a graph exactly once, here to count components." },
    { id: "serialize-and-deserialize-binary-tree", why: "Turning a linked structure into a flat list and back: the tree version of the same idea." },
  ],
  patternNote: "**DFS with a visited map** is the standard way to process a graph that may contain cycles: record each node *when you first see it* (before exploring its neighbours), so any return trip finds the record. Using a *map* instead of a plain set lets the record carry a result (here: the clone).",
  takeaways: [
    "Keep `copy: original → clone`; `dfs(node)` returns the clone, creating it only if the map has no entry.",
    "Register the clone **before** recursing into neighbours: this is what makes cycles terminate.",
    "Push the **clone** of each neighbour (not the original) to get a deep copy; keep the neighbour order.",
    "Handle the `null` (empty graph) input; key by node identity.",
    "Time $O(V + E)$, extra space $O(V)$ (map + stack); BFS is the iterative alternative.",
  ],
});
