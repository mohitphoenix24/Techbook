SHEETS.define({
  id: "binary-tree-level-order-traversal",
  viz: "queue",
  io: { fn: "levelOrder", params: [["root", "tree"]], ret: "int[][]", labels: { root: "root (tree in level order)" } },
  legend: [["cur", "node just taken from the queue"], ["win", "waiting in the queue"], ["ok", "already visited"], ["dim", "not reached yet"]],

  statement: `Given the \`root\` of a binary tree, return the **level order traversal** of its nodes' values: from left to right, level by level, as a list of lists (one list per level).

*(In the lab, a tree is written in **level order**: row by row from left to right, with \`null\` for a missing child. Do not confuse that input format with the answer you must compute: the answer groups the values into one list per level.)*`,
  examples: [
    { input: "root = [3, 9, 20, null, null, 15, 7]", output: "[[3], [9, 20], [15, 7]]", explain: "Level 0 is the root, level 1 its two children, level 2 their children." },
    { input: "root = [1]", output: "[[1]]", explain: "A single node forms one level." },
    { input: "root = []", output: "[]", explain: "An empty tree has no levels." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[0, 2000]$", "$-1000 \\le$ `Node.val` $\\le 1000$"],
  check(input) { return input.root.filter((x) => x !== null).length > 12 ? "for the animation use at most 12 nodes" : null; },

  intuition: {
    find: "The nodes **grouped by their distance from the root**, each group read from left to right.",
    beginner: "For level 0, then level 1, then level 2, and so on: walk the whole tree with a depth-first search, remembering the depth of each node, and collect the nodes whose depth equals the level you are after. Stop when a level is empty.",
    works: "Each level is collected completely and in left-to-right order (the DFS visits left before right), so the lists are exactly the levels.",
    slow: "Each level costs a **full walk** of the tree, and a tree with $h$ levels needs $h$ walks: $O(n \\cdot h)$. For a chain of 2000 nodes that is 4 million steps, and it is wasted: most walks pass through nodes that are not on the wanted level.",
    repeat: "The walk for level `d` goes through all levels above it again, which the previous walks already did. The tree is re-visited from the root for every level.",
    remember: "Nodes at the same level can be handled **together**, in the order they were discovered: first the root, then the root's children, then *their* children. That is the behaviour of a **queue**: first in, first out.",
    observation: "Use a queue. Put the root in it. Repeat: note how many nodes are in the queue right now (`size`): they are exactly the current level. Take that many nodes out, one by one, record their values in a list, and push their children at the back (those children make up the next level). When the queue is empty, every level has been collected.",
    leads: "`q = [root]`. While `q` is not empty: `size = q.size()`; `level = []`; repeat `size` times: pop the front node, add its value to `level`, push its left child and right child if they exist. Append `level` to the answer. One pass: $O(n)$ time.",
  },

  flow: [
    "For each level, do a depth-first walk of the whole tree and keep the nodes at that depth.",
    "Every level is collected in left-to-right order.",
    "$O(n \\cdot h)$: the tree is re-walked once per level.",
    "Nodes of a level are discovered in the order the previous level produced them: a queue (FIFO) does exactly that.",
    "Count the queue (`size`) = the current level; pop that many nodes; push their children.",
    "One visit per node: $O(n)$ time, $O(w)$ space for the widest level.",
  ],

  brute: {
    idea: "**Brute force:** for `d = 0, 1, 2, …` run a depth-first search from the root that carries the current depth and collects every node whose depth equals `d` (left subtree before right subtree). Stop as soon as a level comes back empty.",
    why: "Each level needs a full traversal of the tree (the depth-first walk cannot skip the levels above), and there are $h + 1$ levels: $O(n \\cdot h)$ time, which is quadratic for a degenerate tree. A queue visits every node exactly once.",
    time: "O(n · h)", space: "O(h)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 2000] },
    cpp: `class Solution {
    void collect(TreeNode* n, int depth, int target, vector<int>& level) {
        if (!n) return;
        if (depth == target) { level.push_back(n->val); return; }
        collect(n->left, depth + 1, target, level);
        collect(n->right, depth + 1, target, level);
    }
public:
    vector<vector<int>> levelOrder(TreeNode* root) {
        vector<vector<int>> out;
        for (int d = 0; ; d++) {
            vector<int> level;
            collect(root, 0, d, level);
            if (level.empty()) break;
            out.push_back(level);
        }
        return out;
    }
};`,
    js: `function levelOrder(root) {
  const collect = (n, depth, target, level) => {
    if (!n) return;
    if (depth === target) { level.push(n.val); return; }
    collect(n.left, depth + 1, target, level);
    collect(n.right, depth + 1, target, level);
  };
  const out = [];
  for (let d = 0; ; d++) {
    const level = [];
    collect(root, 0, d, level);
    if (!level.length) break;
    out.push(level);
  }
  return out;
}`,
  },

  pattern: {
    name: "Breadth-First Search (queue, level by level)",
    why: "A depth-first search dives down one branch before the next, but many questions are about **layers**: the nearest nodes first, the shortest path, the nodes at distance $k$. A **queue** visits nodes in the order they were discovered, so all nodes at distance $d$ are handled before any node at distance $d + 1$. Processing exactly `size` nodes per round marks the layer boundaries.",
    recognize: [
      "The answer is grouped **by level / distance** (level order, right-side view, zig-zag, minimum depth).",
      "The nearest or shallowest thing must be found first (shortest path in an unweighted graph).",
      "A spreading process in rounds (rotting oranges, walls and gates).",
      "A depth-first solution would need the depth passed around and all levels at once.",
    ],
  },

  optimal: {
    idea: "Keep a queue of the nodes that are waiting to be visited, starting with the root. In each round, `size = queue.size()` is the number of nodes in the current level. Remove exactly that many nodes from the front; record their values in one list; and push their existing children at the back (the next level). Append the list to the answer, and repeat until the queue is empty.",
    steps: [
      "If the tree is empty, return `[]`.",
      "Push the root into a queue.",
      "While the queue is not empty: let `size` be the current size of the queue (the number of nodes in this level).",
      "Repeat `size` times: pop the front node, add its value to `level`, and push its left child and right child if they exist.",
      "Append `level` to the answer.",
      "Return the answer.",
    ],
    invariant: "**At the start of each round the queue contains exactly the nodes of one level, from left to right, and all earlier levels are already in the answer.**",
    correct: "Initially the queue holds the root, which is level 0. In a round we remove exactly the `size` nodes that were in the queue at its start, which is the whole level, in left-to-right order (the queue preserves insertion order and the level was inserted left to right). The children pushed during the round are appended behind the nodes of the current level, and the children of the leftmost node are pushed first, so after the round the queue holds exactly the next level, again left to right. The count `size` taken *before* the round isolates the current level from the children being added during it. When the queue empties there are no deeper nodes, so every node was visited exactly once, in level order.",
  },

  cpp: `class Solution {
public:
    vector<vector<int>> levelOrder(TreeNode* root) {
        vector<vector<int>> out;                //@init
        if (!root) return out;                  //@empty
        queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {                    //@loop
            int size = q.size();                // how many nodes are in this level //@size
            vector<int> level;
            for (int i = 0; i < size; i++) {
                TreeNode* n = q.front(); q.pop(); level.push_back(n->val);   // visit the front node //@pop
                if (n->left) q.push(n->left);   // children wait for the next round //@pushL
                if (n->right) q.push(n->right); //@pushR
            }
            out.push_back(level);               // one finished level //@level
        }
        return out;                             //@ret
    }
};`,
  js: `function levelOrder(root) {
  const out = [];                        //@init
  if (!root) return out;                 //@empty
  const q = [root];
  let head = 0;
  while (head < q.length) {              //@loop
    const size = q.length - head;        // how many nodes are in this level //@size
    const level = [];
    for (let i = 0; i < size; i++) {
      const n = q[head++]; level.push(n.val);   // visit the front node //@pop
      if (n.left) q.push(n.left);        // children wait for the next round //@pushL
      if (n.right) q.push(n.right);      //@pushR
    }
    out.push(level);                     // one finished level //@level
  }
  return out;                            //@ret
}`,

  tests: [
    { name: "Example 1: [3, 9, 20, null, null, 15, 7]", kind: "normal", input: { root: [3, 9, 20, null, null, 15, 7] } },
    { name: "Example 2: a single node", kind: "normal", input: { root: [1] } },
    { name: "Example 3: an empty tree", kind: "normal", input: { root: [] } },
    { name: "A perfect tree of 7 nodes", kind: "normal", input: { root: [1, 2, 3, 4, 5, 6, 7] } },
    { name: "A left chain", kind: "edge", input: { root: [1, 2, null, 3] }, why: "Every level has exactly one node, so the answer is a list of one-element lists and the queue never holds more than one node. The number of levels equals the number of nodes." },
    { name: "A right chain", kind: "edge", input: { root: [1, null, 2, null, 3] }, why: "The mirror case: the single child is on the right each time. The code checks `n->left` first, finds `null`, and pushes only the right child." },
    { name: "Gaps in the middle of the tree", kind: "corner", input: { root: [1, 2, 3, null, 4, 5] }, why: "The first node of level 2 is a *right* child (`4`), because the left child of `2` is missing. The queue only contains nodes that exist, so the level is `[4, 5]` with no marker for the missing node." },
    { name: "A zig-zag path", kind: "corner", input: { root: [1, 2, null, null, 3] }, why: "The path goes left, then right: again one node per level. This checks that children are taken from whichever side exists." },
    { name: "Negative and repeated values", kind: "corner", input: { root: [0, -1, -1, null, 2] }, why: "Values are only recorded, never compared, so negatives and duplicates do not matter. Equal values on different nodes stay separate entries in the level." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const q = [], visited = {}, out = [];
    let cur = null, whySize = false, whyQ = false, whyKids = false;
    const total = Object.keys(nodes).length;
    const S = (o = {}) => () => {
      const hl = {};
      for (const id in visited) hl[id] = "ok";
      q.forEach((id) => (hl[id] = "win"));
      if (o.cur) hl[o.cur] = "cur";
      const rows = out.map((r) => r.slice());
      if (o.level) rows.push(o.level.slice());
      return { nodes, root, hl, queue: q.map((id) => ({ id, t: nodes[id].v, cls: "win" })), queueTitle: "queue  (front → back)", out: { label: "levels so far", items: rows, nested: true }, label: "binary tree", gy: 62, note: o.note };
    };
    T.step("init", { vars: { levels: 0 }, state: S(), phase: "Process the tree level by level", say: root == null ? "The tree is empty, so the answer will be an empty list of levels." : "`out` is the list of levels, empty for now.", op: "out = [ ]", act: "START" });
    if (root == null) {
      T.step("empty", { vars: { "return": "[]" }, state: S(), say: "The tree is empty: return the empty list.", op: "root == nullptr  →  return out", act: "EMPTY" });
      T.result([]); return;
    }
    T.step("empty", { vars: { node: nodes[root].v }, state: S(), say: "The root exists, so there is at least one level. The queue will start with it.", op: "root != nullptr", act: "NOT_EMPTY" });
    q.push(root);
    T.step("loop", { vars: { "queue size": q.length, levels: out.length }, state: S({ note: "the root is queued" }), say: `Put the root **${nodes[root].v}** in the queue. A queue serves nodes in the order they arrived (first in, first out).`, op: "q.push(root)", act: "ENQUEUE_ROOT",
      why: { title: "Why a queue?", text: "Children are added at the **back** and nodes are served from the **front**, so a whole level is served before any of the next level's nodes. A stack (last in, first out) would dive down one branch instead." } });
    whyQ = true;
    while (q.length) {
      const size = q.length;
      T.step("loop", { vars: { "queue size": q.length, levels: out.length }, state: S(), say: `The queue is not empty (${q.length} node${q.length === 1 ? "" : "s"} waiting), so there is another level to process.`, op: "!q.empty()  →  true", act: "NEXT_LEVEL" });
      T.step("size", { vars: { size, levels: out.length }, state: S({ note: `level ${out.length}: ${size} node${size === 1 ? "" : "s"}` }), say: `\`size = q.size()\` = **${size}**: exactly these ${size} node${size === 1 ? " is" : "s are"} the current level. Nodes pushed during this round belong to the *next* level, so we must not mix them in.`, op: `size = q.size() = ${size}`, act: "COUNT_LEVEL",
        why: whySize ? null : { title: "Why read the size before the loop?", text: "While we process the level we also push its children. If we asked `q.size()` again, the number would keep growing and we would drift into the next level. Reading it once fixes how many nodes belong to this level." } });
      whySize = true;
      const level = [];
      for (let i = 0; i < size; i++) {
        const id = q.shift(); cur = id; level.push(nodes[id].v);
        T.step("pop", { vars: { node: nodes[id].v, "i": i, size }, state: S({ cur: id, level }), say: `Take **${nodes[id].v}** from the front of the queue (node ${i + 1} of ${size} in this level) and add it to the level list: **[${level.join(", ")}]**.`, op: `n = q.front(); q.pop(); level.push_back(${nodes[id].v})`, act: "DEQUEUE" });
        visited[id] = true;
        const L = nodes[id].l, R = nodes[id].r;
        if (L != null) q.push(L);
        T.step("pushL", { vars: { node: nodes[id].v }, state: S({ cur: id, level }), say: L != null ? `${nodes[id].v} has a left child, **${nodes[L].v}**: it joins the back of the queue for the next level.` : `${nodes[id].v} has no left child: nothing to queue.`, op: L != null ? `q.push(n.left)  (${nodes[L].v})` : "n.left is null  →  skip", act: L != null ? "ENQUEUE_LEFT" : "NO_LEFT",
          why: L != null && !whyKids ? { title: "Why left before right?", text: "The queue keeps the order of arrival, so pushing the left child first makes the next level come out left to right." } : null });
        if (L != null) whyKids = true;
        if (R != null) q.push(R);
        T.step("pushR", { vars: { node: nodes[id].v }, state: S({ cur: id, level }), say: R != null ? `${nodes[id].v} has a right child, **${nodes[R].v}**: it joins the back of the queue behind the left one.` : `${nodes[id].v} has no right child: nothing to queue.`, op: R != null ? `q.push(n.right)  (${nodes[R].v})` : "n.right is null  →  skip", act: R != null ? "ENQUEUE_RIGHT" : "NO_RIGHT" });
      }
      out.push(level);
      cur = null;
      T.step("level", { vars: { levels: out.length, "queue size": q.length }, state: S({ note: `level ${out.length - 1} finished` }), say: `All ${size} node${size === 1 ? "" : "s"} of the level are done: append **[${level.join(", ")}]** to the answer. The queue now holds the next level (${q.length} node${q.length === 1 ? "" : "s"}).`, op: "out.push_back(level)", act: "LEVEL_DONE" });
    }
    T.step("loop", { vars: { "queue size": 0, levels: out.length }, state: S(), say: "The queue is empty: there are no deeper nodes, so every level has been collected.", op: "!q.empty()  →  false", act: "QUEUE_EMPTY" });
    T.step("ret", { vars: { "return": `${out.length} levels` }, state: S(), say: `Return the levels: **${JSON.stringify(out).replace(/,/g, ", ")}**. All ${total} node${total === 1 ? "" : "s"} were visited exactly once.`, op: "return out", act: "DONE" });
    T.result(out.map((r) => r.slice()));
  },
  fuzz(rnd) { return { root: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 11), -5, 5) }; },
  gen(n) { return { root: SHEETS.K.balanced(n) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "every node enters and leaves the queue once", short: "n pops and at most n pushes, plus one list per level",
      derive: [
        "\\text{each node is pushed once (by its parent) and popped once} \\Rightarrow n \\text{ pushes and } n \\text{ pops} || the root is pushed at the start",
        "T(n) = n\\,(c_{\\text{pop}} + c_{\\text{visit}} + 2c_{\\text{child}}) + (\\#\\text{levels})\\, c_{\\text{level}} || two child tests per node, one list per level",
        "\\#\\text{levels} \\le n \\Rightarrow T(n) \\le n\\, c' || a constant per node",
        "!T(n) = O(n) || versus $O(n \\cdot h)$ for re-walking the tree once per level",
      ],
      where: "Each node is looked at exactly once, whether the tree is a chain (n levels of one node) or perfectly balanced (about $\\log_2 n$ levels). The measured table uses a balanced tree and counts every dequeue, child test and level step.",
    },
    space: {
      tex: "O(w)", title: "the queue holds at most one level, plus the output", short: "w = the width of the widest level",
      derive: [
        "|\\text{queue}| \\le w_{\\max} || the queue holds the unfinished part of one level and the start of the next, at most two consecutive levels",
        "w_{\\max} \\le \\lceil n/2 \\rceil \\text{ (the bottom level of a perfect tree)} || a level can hold half the nodes",
        "!S = O(w) \\;\\Rightarrow\\; O(n) \\text{ worst},\\; O(1) \\text{ for a chain} || plus the answer itself, $O(n)$",
      ],
      where: "The answer needs $O(n)$ space whatever we do. The *working* memory is the queue: for a chain it is $O(1)$, for a perfect tree about $n/2$. A depth-first approach would use $O(h)$ instead.",
    },
    limit: "Every node must be visited, so $\\Omega(n)$ time is needed: the queue solution is optimal.",
    measure: { label: "n = number of nodes (balanced tree)", fTex: "n", f: (n) => n, sizes: [7, 15, 31, 63, 127, 255], growth: "linear" },
  },

  mistakes: [
    { title: "Using `q.size()` inside the loop condition", what: "`for (int i = 0; i < q.size(); i++)`.", why: "It looks the same as using a stored `size`.", breaks: "The queue grows while the loop runs, so the level boundary is lost: levels run together, and the output is a single flat level.", avoid: "Store `int size = q.size();` before the loop." },
    { title: "Pushing `null` children", what: "`q.push(n->left); q.push(n->right);` without testing.", why: "It saves two `if` lines.", breaks: "Null pointers enter the queue, and the next pop dereferences a null (`n->val`).", avoid: "Push a child only if it exists." },
    { title: "Using a stack instead of a queue", what: "Replacing the queue by a `stack` or by popping from the back.", why: "Both containers have `push` and `pop`.", breaks: "The traversal becomes depth-first and right-to-left, so the levels come out in the wrong order.", avoid: "Take from the **front**, add at the **back**: first in, first out." },
    { title: "Forgetting the empty tree", what: "Pushing `root` without checking it.", why: "The examples have nodes.", breaks: "A `null` root is pushed and dereferenced immediately: crash.", avoid: "`if (!root) return {};` first." },
    { title: "Pushing the right child before the left", what: "`push(right)` first.", why: "The order of two lines was swapped.", breaks: "Every level comes out right to left, which is the *zig-zag* variant, not this problem.", avoid: "Left child first, then right child." },
  ],

  followUps: [
    {
      q: "Return the **right side view** (the last node of each level).",
      a: "Run the same loop, but from each level keep only the value of the node popped **last** (`i == size − 1`). Same $O(n)$ time, and the queue still defines the levels.",
      cpp: `vector<int> rightSideView(TreeNode* root) {
    vector<int> out;
    if (!root) return out;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        int size = q.size();
        for (int i = 0; i < size; i++) {
            TreeNode* n = q.front(); q.pop();
            if (i == size - 1) out.push_back(n->val);
            if (n->left) q.push(n->left);
            if (n->right) q.push(n->right);
        }
    }
    return out;
}`,
      js: `function rightSideView(root) {
  const out = [];
  if (!root) return out;
  const q = [root];
  let head = 0;
  while (head < q.length) {
    const size = q.length - head;
    for (let i = 0; i < size; i++) {
      const n = q[head++];
      if (i === size - 1) out.push(n.val);
      if (n.left) q.push(n.left);
      if (n.right) q.push(n.right);
    }
  }
  return out;
}`,
      time: "O(n)", space: "O(w)",
    },
    {
      q: "Return the **zig-zag** level order (alternate left-to-right and right-to-left).",
      a: "Collect each level as before and **reverse** every second level (or fill the list from the back). The traversal itself is unchanged, so it is still $O(n)$.",
      time: "O(n)", space: "O(w)",
    },
    {
      q: "Solve it with **depth-first search** instead.",
      a: "Carry the depth down the recursion: `dfs(node, depth)` appends `node.val` to `out[depth]` (creating the list when `depth == out.size()`), then calls the left and right children with `depth + 1`. Visiting left before right keeps each level in order. It uses $O(h)$ stack space instead of the queue's $O(w)$.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Find the **minimum depth** of a tree.",
      a: "Level-order traversal is the natural way: the first time a node with no children is dequeued, its level number is the answer, and the search stops without reading the deeper levels.",
      time: "O(n)", space: "O(w)",
    },
  ],

  related: [
    { id: "maximum-depth-of-binary-tree", why: "The number of levels this traversal produces is exactly the depth of the tree." },
    { id: "number-of-islands", why: "Breadth-first search on a grid uses the same queue and the same \"process a round at a time\" idea." },
    { id: "clone-graph", why: "BFS with a queue over a graph instead of a tree (with a visited map)." },
    { id: "serialize-and-deserialize-binary-tree", why: "A level-order walk with `null` markers is one way to serialise a tree." },
  ],
  patternNote: "**BFS with the `size` trick.** A queue gives level-by-level order; reading `q.size()` once at the start of a round tells you how many nodes belong to the current level, so the rounds line up with the levels. The same loop answers shortest-path, right-view, zig-zag and minimum-depth questions with a small tweak.",
  takeaways: [
    "Level order = **breadth-first search**: a queue serves nodes in the order they arrived.",
    "At the start of each round `size = q.size()` is the number of nodes in the current level: pop exactly that many.",
    "Push the **left child first**, only if it exists; the next level then appears left to right.",
    "Handle the empty tree first; a stack instead of a queue gives the wrong order.",
    "Time $O(n)$, space $O(w)$ for the widest level (DFS with depth gives $O(h)$).",
  ],
});
