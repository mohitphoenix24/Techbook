SHEETS.define({
  id: "binary-tree-maximum-path-sum",
  viz: "recursion",
  io: { fn: "maxPathSum", params: [["root", "tree"]], ret: "int", labels: { root: "root (tree in level order)" } },
  legend: [["cur", "node being processed"], ["win", "on the call path"], ["ok", "finished (its gain is shown below it)"], ["hit", "the best path so far"]],

  statement: `A **path** in a binary tree is a sequence of nodes where each pair of adjacent nodes in the sequence has an edge connecting them. A node can only appear in the sequence **at most once**. Note that the path does **not** need to pass through the root.

The **path sum** of a path is the sum of the node's values in the path.

Given the \`root\` of a binary tree, return the **maximum path sum** of any **non-empty** path.

*(In the lab, a tree is written in **level order**, row by row from left to right, with \`null\` for a missing child.)*`,
  examples: [
    { input: "root = [1, 2, 3]", output: "6", explain: "The best path is `2 → 1 → 3`, with sum 2 + 1 + 3 = 6." },
    { input: "root = [-10, 9, 20, null, null, 15, 7]", output: "42", explain: "The best path is `15 → 20 → 7` with sum 42. It does not pass through the root, and it avoids the negative `-10`." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[1, 3 \\cdot 10^4]$", "$-1000 \\le$ `Node.val` $\\le 1000$"],
  check(input) {
    const n = input.root.filter((x) => x !== null).length;
    if (n < 1) return "the tree needs at least one node (a path must be non-empty)";
    if (n > 9) return "for the animation use at most 9 nodes";
    return null;
  },

  intuition: {
    find: "The path with the largest sum, anywhere in the tree. Such a path goes **up and then down**: it has one *highest* node (its top), with a chain going down the left and a chain going down the right.",
    beginner: "Treat every node as the top of a path. From that node, find the best chain going down on the left and the best going down on the right (ignore a side if it is negative), and add them to the node's value. Take the maximum over all nodes.",
    works: "Every path has exactly one top node, so by trying every node as the top and taking the best way down on each side, the best path overall is found.",
    slow: "For every node we recompute the best downward chains by walking its two subtrees again: $O(n)$ per node, $O(n \\cdot h)$ in total (quadratic for a chain).",
    repeat: "The best downward chain from a node is needed twice: as part of the answer *through* that node, and again by its **parent** when the parent looks down. Each subtree is re-walked for every ancestor.",
    remember: "Let `gain(node)` be the best sum of a chain that **starts at `node` and goes down** (it can stop at any depth). Then `gain(node) = node.val + max(0, gain(left), gain(right))`: a chain continues into at most one child, and only if that is positive. This is the number the parent needs.",
    observation: "A single post-order recursion can compute both things at once. At each node, `l = max(0, gain(left))` and `r = max(0, gain(right))`. The best path whose **top is this node** has sum `node.val + l + r`: record it in a global maximum. But what a node **returns to its parent** is only `node.val + max(l, r)`: a path going further up can use only one of the two children.",
    leads: "`gain(node)`: if null return 0; `l = max(0, gain(left))`; `r = max(0, gain(right))`; `best = max(best, node.val + l + r)`; `return node.val + max(l, r)`. Start with `best = −∞` and call `gain(root)`. Each node is visited once: $O(n)$.",
  },

  flow: [
    "Treat each node as the top of a path and compute its best downward chains by walking its subtrees.",
    "Every path has exactly one top node, so trying every node as the top covers all paths.",
    "$O(n \\cdot h)$: the downward chains are recomputed for every ancestor.",
    "`gain(node)` = best chain starting at `node` going down; the parent needs exactly this number.",
    "At each node: record `val + l + r` as a candidate, but return only `val + max(l, r)` upwards.",
    "One post-order pass: $O(n)$ time, $O(h)$ stack space.",
  ],

  brute: {
    idea: "**Brute force:** for every node `t` taken as the top of the path, compute with a helper `down` the best chain going down on its left and on its right (a chain may stop at any node, and negative chains are ignored); the candidate is `t.val + left + right`. Keep the maximum over all nodes.",
    why: "The helper `down` walks the whole subtree below `t`, so the total work is the sum of all subtree sizes: $O(n \\cdot h)$ ($O(n^2)$ for a chain). The numbers computed for a subtree are exactly what its parent needs, but they are thrown away and recomputed.",
    time: "O(n · h)", space: "O(h)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
    int down(TreeNode* t) {
        if (!t) return 0;
        return t->val + max(0, max(down(t->left), down(t->right)));
    }
    void visit(TreeNode* t, int& best) {
        if (!t) return;
        int l = max(0, down(t->left)), r = max(0, down(t->right));
        best = max(best, t->val + l + r);
        visit(t->left, best);
        visit(t->right, best);
    }
public:
    int maxPathSum(TreeNode* root) {
        int best = INT_MIN;
        visit(root, best);
        return best;
    }
};`,
    js: `function maxPathSum(root) {
  const down = (t) => (t ? t.val + Math.max(0, down(t.left), down(t.right)) : 0);
  let best = -Infinity;
  const visit = (t) => {
    if (!t) return;
    const l = Math.max(0, down(t.left)), r = Math.max(0, down(t.right));
    best = Math.max(best, t.val + l + r);
    visit(t.left);
    visit(t.right);
  };
  visit(root);
  return best;
}`,
  },

  pattern: {
    name: "Tree DP (post-order: return one thing, record another)",
    why: "Some tree problems need two different quantities from each subtree: the value **returned upwards** (a chain, usable by the parent) and the value **recorded globally** (a path bending at this node, not usable by the parent). Computing both in one post-order pass is a form of dynamic programming on the tree.",
    recognize: [
      "The answer is a **path** (or a pair, or a diameter) that can bend at any node.",
      "The best \"downward\" quantity of a subtree is what the parent needs.",
      "A candidate that uses *both* children cannot be extended upwards.",
      "Negative values may be better left out (`max(0, …)`).",
    ],
  },

  optimal: {
    idea: "Define `gain(node)` as the largest sum of a path that starts at `node` and goes only downwards (it may stop at any point). Compute it recursively: `gain(node) = node.val + max(0, gain(left), gain(right))`. While doing so, at each node the best path **that bends here** has sum `node.val + max(0, gain(left)) + max(0, gain(right))`; remember the maximum of these over all nodes in a variable `best`. The answer is `best`.",
    steps: [
      "Set `best = −∞` (the path must be non-empty, so start lower than any value).",
      "`gain(null) = 0`.",
      "For a node: `l = max(0, gain(left))` and `r = max(0, gain(right))` (a negative chain is worse than none).",
      "Update `best = max(best, node.val + l + r)`: the best path whose top is this node.",
      "Return `node.val + max(l, r)` to the parent: only one side can continue upwards.",
      "Call `gain(root)` and return `best`.",
    ],
    invariant: "**When `gain(node)` returns, it equals the best sum of a downward path starting at `node`, and `best` is at least the best path sum whose top lies in the subtree of `node` (and equals the true maximum once the root call returns).**",
    correct: "Every path has a unique topmost node $t$. The path consists of $t$, plus at most one downward chain into the left child and at most one into the right child. Its sum is $t.val + a + b$ where $a$ and $b$ are chain sums (or 0 if the side is empty), and to maximise it we should choose, on each side, the best chain starting at that child, or nothing if the best chain is negative: exactly `max(0, gain(child))`. So the best path with top $t$ has sum $t.val + l + r$, computed at $t$ and recorded in `best`. For the parent, any path continuing upwards through $t$ can use only **one** child chain (otherwise the path would branch), so the best chain starting at $t$ is $t.val + \\max(l, r)$, which is what `gain` returns. Taking the maximum of the candidates over all $t$ gives the best path in the tree, and `best` starts at $-\\infty$ so that an all-negative tree returns its largest single value.",
  },

  cpp: `class Solution {
    int best;
    int gain(TreeNode* node) {
        if (!node) return 0;                    // an empty subtree contributes nothing //@base
        int l = max(0, gain(node->left));       // best chain down the left (or none) //@left
        int r = max(0, gain(node->right));      // best chain down the right (or none) //@right
        best = max(best, node->val + l + r);    // the best path that bends at this node //@through
        return node->val + max(l, r);           // the parent can use only one side //@up
    }
public:
    int maxPathSum(TreeNode* root) {
        best = INT_MIN;                         // the path must be non-empty //@init
        gain(root);                             //@start
        return best;                            //@ret
    }
};`,
  js: `function maxPathSum(root) {
  let best = -Infinity;                  // the path must be non-empty //@init
  function gain(node) {
    if (!node) return 0;                 // an empty subtree contributes nothing //@base
    const l = Math.max(0, gain(node.left));    // best chain down the left (or none) //@left
    const r = Math.max(0, gain(node.right));   // best chain down the right (or none) //@right
    best = Math.max(best, node.val + l + r);   // the best path that bends at this node //@through
    return node.val + Math.max(l, r);    // the parent can use only one side //@up
  }
  gain(root);                            //@start
  return best;                           //@ret
}`,

  tests: [
    { name: "Example 1: [1, 2, 3]", kind: "normal", input: { root: [1, 2, 3] } },
    { name: "Example 2: [-10, 9, 20, null, null, 15, 7]", kind: "normal", input: { root: [-10, 9, 20, null, null, 15, 7] } },
    { name: "The best path avoids the root", kind: "normal", input: { root: [-1, 5, -2, 4, 6] } },
    { name: "A single negative node", kind: "edge", input: { root: [-3] }, why: "A path must contain at least one node, so the answer is `-3`, not `0`. This is why `best` starts at the lowest possible value (`INT_MIN` or `-Infinity`) and not at 0." },
    { name: "A single positive node", kind: "edge", input: { root: [5] }, why: "Both children are empty (gain 0): `best = 5 + 0 + 0 = 5`." },
    { name: "All values negative", kind: "edge", input: { root: [-2, -1] }, why: "Extending a path with a negative chain only makes it worse, so each `max(0, …)` drops it. The best path is the single node `-1`, so the answer is `-1`: the largest value in the tree." },
    { name: "A negative child is dropped", kind: "edge", input: { root: [2, -1] }, why: "`gain(-1) = -1`, and `max(0, -1) = 0`: the path stays `2` alone, sum 2. Taking the child would give 1." },
    { name: "A path with a bend at the root", kind: "edge", input: { root: [1, -2, 3] }, why: "The root joins its right child: `1 + 3 = 4` (the negative left side is ignored). The path bends *at the root* using one child only." },
    { name: "The best path bends deep in the tree", kind: "corner", input: { root: [0, 3, -5, 4, 6] }, why: "The node `3` joins its children `4` and `6`: `4 + 3 + 6 = 13`. Its parent could use only one of them (`3 + 6 = 9` upwards), and the root adds nothing positive." },
    { name: "Zeros everywhere", kind: "corner", input: { root: [0, 0, 0] }, why: "Every path sums to 0. Comparing with `0` (not with a value like `-1`) keeps the answer at 0, and the dropped zero-gain children cost nothing." },
    { name: "Large positive values", kind: "corner", input: { root: [1000, 1000, 1000] }, why: "The sum 3000 is the sum of the whole tree: the root bends with both children. A sum can exceed the largest single value." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const cs = K.callStack();
    const path = [], done = {}, chain = {};
    let best = -Infinity, bestSet = [];
    let whyZero = false, whyThrough = false, whyUp = false, whyBase = false;
    const fmt = (x) => (x === -Infinity ? "−∞" : String(x));
    const S = (cur) => () => {
      const hl = {}, sub = {};
      path.forEach((id) => (hl[id] = "win"));
      for (const id in done) { hl[id] = "ok"; sub[id] = `gain ${done[id]}`; }
      bestSet.forEach((id) => (hl[id] = "hit"));
      if (cur != null) hl[cur] = "cur";
      return { nodes, root, hl, sub, calls: cs.snapshot(), label: `binary tree      best path so far: ${fmt(best)}`, gy: 66 };
    };
    const nm = (id) => (id == null ? "null" : nodes[id].v);
    T.step("init", { vars: { best: "−∞" }, state: S(null), phase: "One post-order pass", say: "`best` is the largest path sum seen so far. It starts at **−∞**, not 0, because a path must contain at least one node (all values may be negative).", op: "best = INT_MIN", act: "START" });
    T.step("start", { vars: { best: "−∞" }, state: S(null), say: "Call `gain(root)`. Its return value (the best chain going down from the root) is not needed: the answer is collected in `best` along the way.", op: "gain(root)", act: "CALL_ROOT" });
    function gain(id) {
      const f = cs.push("gain", id == null ? "null" : `node=${nodes[id].v}`, "", "");
      T.step("base", { vars: { node: nm(id), best: fmt(best) }, state: S(id), say: id == null ? "A call for an **empty child**: it contributes nothing. Return `0`." : `A new call for node **${nodes[id].v}**. It is not \`null\`, so ask both children for their best downward chain.`, op: `node == nullptr  →  ${id == null}`, act: id == null ? "EMPTY" : "CALL",
        why: id == null && !whyBase ? { title: "Why return 0 for an empty child?", text: "A missing child offers no chain. Returning 0 means \"adding nothing\", which is exactly what the parent should do (and is the same as dropping a negative chain)." } : null });
      if (id == null) { whyBase = true; f.ret = 0; cs.pop(); return 0; }
      path.push(id);
      T.step("left", { vars: { node: nodes[id].v, l: "?", r: "?" }, state: S(id), say: `Ask the **left** child for its best downward chain: \`l = max(0, gain(node->left))\`.`, op: "l = max(0, gain(node.left))", act: "GO_LEFT" });
      const gl = gain(nodes[id].l);
      const l = Math.max(0, gl);
      f.locals = `l=${l}`;
      T.step("right", { vars: { node: nodes[id].v, l, r: "?" }, state: S(id), say: gl < 0 ? `The left side offers **${gl}**, which is negative: \`max(0, ${gl})\` = **0**, so we **leave the left side out**. Now ask the right child.` : `The left side offers **${gl}**: \`l = ${l}\`. Now ask the **right** child.`, op: `l = max(0, ${gl}) = ${l};  r = max(0, gain(node.right))`, act: "GO_RIGHT",
        why: gl < 0 && !whyZero ? { title: "Why max(0, …)?", text: "A chain with a negative sum would make the path worse, so we are free to stop before it, which is the same as adding 0. The `max` with 0 means \"use this side only if it helps\"." } : null });
      if (gl < 0) whyZero = true;
      const gr = gain(nodes[id].r);
      const r = Math.max(0, gr);
      f.locals = `l=${l}, r=${r}`;
      const cand = nodes[id].v + l + r;
      const better = cand > best;
      const cl = l > 0 && nodes[id].l != null ? chain[nodes[id].l] : [], cr = r > 0 && nodes[id].r != null ? chain[nodes[id].r] : [];
      if (better) { best = cand; bestSet = [...cl.slice().reverse(), id, ...cr]; }
      T.step("through", { vars: { node: nodes[id].v, l, r, candidate: cand, best: fmt(best) }, state: S(id), say: `The best path whose **top** is node ${nodes[id].v} goes down both sides: ${nodes[id].v} + ${l} + ${r} = **${cand}**. ${better ? `That is larger than the best so far, so **best = ${best}**.` : `That does not beat the best so far (${fmt(best)}).`}`, op: `best = max(best, ${nodes[id].v} + ${l} + ${r})  →  ${fmt(best)}`, act: better ? "NEW_BEST" : "KEEP_BEST",
        why: whyThrough ? null : { title: "Why add both sides here?", text: "A path has one highest node. At that node it can go down **both** the left and the right chain, so this is the place to count both. Each node is tried as the top exactly once." } });
      whyThrough = true;
      const res = nodes[id].v + Math.max(l, r);
      chain[id] = [id, ...(l >= r ? cl : cr)];
      f.ret = res;
      T.step("up", { vars: { node: nodes[id].v, l, r, "return": res }, state: S(id), say: `Return **${nodes[id].v} + max(${l}, ${r}) = ${res}** to the parent. Only **one** side can be passed up: a path that continues above this node cannot branch into both children.`, op: `return ${nodes[id].v} + max(${l}, ${r}) = ${res}`, act: "RETURN_ONE_SIDE",
        why: whyUp ? null : { title: "Why only one side upwards?", text: "A path is a line. If it came up from both children into this node and then continued to the parent, the node would have three neighbours on the path. So the parent may extend only one chain, the better one." } });
      whyUp = true;
      path.pop(); done[id] = res; cs.pop();
      return res;
    }
    T.phase("Compute gains from the leaves up");
    gain(root);
    T.step("ret", { vars: { "return": best }, state: S(null), say: `The root call is done. The largest path sum is **${best}**.`, op: `return best = ${best}`, act: "DONE" });
    T.result(best);
  },
  fuzz(rnd) { return { root: SHEETS.K.randomTree(rnd, 1 + Math.floor(rnd() * 9), -6, 8) }; },
  gen(n) { return { root: SHEETS.K.balanced(n) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one call per node and per empty child", short: "2n + 1 calls, a constant amount of work each",
      derive: [
        "\\#\\text{calls} = n + (n+1) = 2n + 1 || every node and every empty child slot",
        "T(n) = (2n + 1)\\, c_{\\text{call}} + n\\,(c_{\\text{max}} + c_{\\text{add}}) || two `max(0, …)`, one candidate and one return per node",
        "\\text{recurrence: } T(n) = T(a) + T(n-1-a) + c,\\; T(0) = c_0 || the shape of the tree does not matter",
        "!T(n) = O(n) || versus $O(n \\cdot h)$ when the chains are recomputed for every node",
      ],
      where: "Every node is visited exactly once; the downward gain of a subtree is computed once and reused by its parent. The measured table uses a balanced tree and counts the five steps per node.",
    },
    space: {
      tex: "O(h)", title: "the recursion stack, plus one integer", short: "h = height of the tree",
      derive: [
        "\\text{stack depth} \\le h + 1 || one frame per ancestor of the current node",
        "S = O(h) + O(1)\\;(\\text{for } best) || the global maximum is a single number",
        "!S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ for a chain} || no table",
      ],
      where: "Nothing is stored per node: the gains live in the stack frames and are consumed when each call returns.",
    },
    limit: "Every node can change the answer, so all $n$ must be examined: $\\Omega(n)$ time. The single pass is optimal.",
    measure: { label: "n = number of nodes (balanced tree)", fTex: "n", f: (n) => n, sizes: [7, 15, 31, 63, 127, 255], growth: "linear" },
  },

  mistakes: [
    { title: "Returning `val + l + r` to the parent", what: "`return node->val + l + r;`", why: "The path sum through the node is what the problem asks for.", breaks: "The parent would extend a path that already uses both children, producing a branching shape that is not a path; sums come out too large.", avoid: "Record `val + l + r` in `best`, but return `val + max(l, r)`." },
    { title: "Starting `best` at 0", what: "`best = 0` (or `int best = 0;`).", why: "A sum of zero looks like a harmless starting point.", breaks: "For an all-negative tree (`[-3]`) the answer must be `-3`; with `best = 0` the function returns `0`, a path of no nodes.", avoid: "Start at `INT_MIN` / `-Infinity`." },
    { title: "Not dropping negative chains", what: "`l = gain(left)` without `max(0, …)`.", why: "\"Always include the children, it is a path\".", breaks: "A large positive node is dragged down by a negative neighbour: `[2, -1]` would give 1 instead of 2.", avoid: "`l = max(0, gain(left))`." },
    { title: "Requiring the path to pass through the root", what: "Returning the value computed at the root.", why: "Many tree recursions answer at the root.", breaks: "The best path can lie entirely inside a subtree (`[-10, 9, 20, null, null, 15, 7]`: the answer 42 avoids the root).", avoid: "Update `best` at **every** node and return `best`." },
    { title: "Using a local `best` that is not shared", what: "Passing `best` by value to the recursive calls.", why: "It looks like an ordinary parameter.", breaks: "Updates made deep in the recursion are lost when the calls return.", avoid: "Use a member variable, a reference, or a closure variable." },
  ],

  followUps: [
    {
      q: "Find the **diameter** of a binary tree (the number of edges on the longest path).",
      a: "The same idea with all values equal to 1 and counting edges: `height(node) = 1 + max(height(left), height(right))`, and at each node the longest path bending there has `height(left) + height(right)` edges. Record the maximum over all nodes. $O(n)$ time and $O(h)$ space.",
      cpp: `int diameterOfBinaryTree(TreeNode* root) {
    int best = 0;
    function<int(TreeNode*)> height = [&](TreeNode* t) -> int {
        if (!t) return 0;
        int l = height(t->left), r = height(t->right);
        best = max(best, l + r);
        return 1 + max(l, r);
    };
    height(root);
    return best;
}`,
      js: `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (t) => {
    if (!t) return 0;
    const l = height(t.left), r = height(t.right);
    best = Math.max(best, l + r);
    return 1 + Math.max(l, r);
  };
  height(root);
  return best;
}`,
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Return the **path itself**, not only its sum.",
      a: "Alongside `gain` keep, for each node, which child its best chain uses (or none). When a new `best` is found at node `t`, record `t` as the top, and afterwards follow the saved choices to the left and to the right to list the nodes. The extra memory is $O(n)$ for the choices (or $O(h)$ if only the top is saved and the chains are recomputed).",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "The path must go **from a leaf to a leaf**.",
      a: "Only count a candidate at a node that has **both** children; a node with a single child returns `val + gain(child)` without recording. The recursion is otherwise unchanged, and a tree with a single child chain has a special case.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Find the **maximum path sum going only downwards** (no bends), starting at the root or at any node.",
      a: "That is simply the maximum of `gain(node)` over all nodes: the same recursion, but record `gain` instead of `val + l + r`.",
      time: "O(n)", space: "O(h)",
    },
  ],

  related: [
    { id: "maximum-depth-of-binary-tree", why: "The simplest version of this recursion: combine the answers of both children into one number." },
    { id: "maximum-subarray", why: "The same \"extend or restart\" choice (take a neighbour only if it helps), on an array." },
    { id: "house-robber", why: "Another problem where each position chooses between using or ignoring what is nearby." },
    { id: "validate-binary-search-tree", why: "Another tree recursion where information flows through the calls: a range down there, a gain up here." },
  ],
  patternNote: "**Return one thing, record another.** In tree DP, the value a node returns must be something its parent can *extend*, while the answer may be a shape (a bend) that the parent cannot extend. Compute the candidate at the node, store it in a global, and return only the extendable part.",
  takeaways: [
    "A path has one highest node: try every node as the top, using the best chain down each side.",
    "`gain(node) = val + max(0, gain(left), gain(right))`: the chain the parent can extend (one side only).",
    "At each node record `val + max(0, gain(left)) + max(0, gain(right))` in a global `best`.",
    "Start `best` at `-∞` (a path is non-empty); drop negative chains with `max(0, …)`.",
    "Time $O(n)$, space $O(h)$; diameter and leaf-to-leaf paths are small variations.",
  ],
});
