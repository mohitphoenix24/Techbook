SHEETS.define({
  id: "maximum-depth-of-binary-tree",
  viz: "recursion",
  io: { fn: "maxDepth", params: [["root", "tree"]], ret: "int", labels: { root: "root (tree in level order)" } },

  statement: `Given the \`root\` of a binary tree, return its **maximum depth**.

The maximum depth is the number of nodes on the longest path that starts at the root and ends at a leaf. An empty tree has depth \`0\`.

*(In the lab, a tree is written in **level order**: read the nodes row by row from left to right, using \`null\` for a missing child. For example \`[3, 9, 20, null, null, 15, 7]\`.)*`,
  examples: [
    { input: "root = [3, 9, 20, null, null, 15, 7]", output: "3", explain: "The longest path is `3 → 20 → 15` (or `3 → 20 → 7`): three nodes." },
    { input: "root = [1, null, 2]", output: "2", explain: "The root has only a right child, giving a path of two nodes." },
  ],
  constraints: ["The number of nodes is in the range $[0, 10^4]$", "$-100 \\le$ `Node.val` $\\le 100$"],

  intuition: {
    find: "How many nodes lie on the **longest root-to-leaf path**. Only the *shape* of the tree matters; the values are irrelevant.",
    beginner: "List every root-to-leaf path (keep a copy of the path at each leaf), then take the length of the longest one.",
    works: "Every path from the root to a leaf is examined, so the longest is certainly among them. It is correct.",
    slow: "Each leaf stores its **own copy** of the whole path. A tree with $n$ nodes and height $h$ can need $O(n \\cdot h)$ time and memory just for copying (a long \"broom\" shape makes it $O(n^2)$).",
    repeat: "Paths **share prefixes**: the first few nodes are copied again for every leaf below them. We rebuild the same beginning of the path over and over, yet all we want at the end is *one number*.",
    remember: "We do not need the paths, only their lengths, and the depth of a tree is built from the depths of its parts: **a tree is a root plus two smaller trees**. If we knew the depth of the left subtree and the right subtree, we would know the answer.",
    observation: "The depth of any tree is `1 + max(depth of left subtree, depth of right subtree)`, and an empty tree has depth `0`. This is **self-similar**: the same question asked of smaller trees, ending at the empty tree.",
    leads: "Write that sentence as a function: `if (!node) return 0; return 1 + max(maxDepth(node->left), maxDepth(node->right));`. Each node asks its children, waits for their answers (the call stack remembers where it was), then combines them. Every node is visited exactly once.",
  },

  flow: [
    "Collect every root-to-leaf path and take the longest.",
    "Every leaf is covered, so the longest path cannot be missed.",
    "Each leaf copies its whole path: $O(n \\cdot h)$ time and memory, mostly repeated prefixes.",
    "A tree's depth depends only on the depths of its two subtrees.",
    "Define `depth(node) = 1 + max(depth(left), depth(right))` with `depth(null) = 0`.",
    "A one-line recursion visits each node once: $O(n)$ time, $O(h)$ stack space.",
  ],

  brute: {
    idea: "**Brute force:** run a depth-first search that keeps the current path in a vector. At every **leaf**, push a *copy* of the path into a list of all paths. Finally return the length of the longest stored path.",
    why: "Each stored path is a full copy, so for a tree of height $h$ every leaf costs $O(h)$ to copy: $O(n \\cdot h)$ time **and** memory. For a degenerate \"broom\" tree (a long handle plus many leaves hanging at the end) that is $O(n^2)$. We keep far more information than the single number the question asks for.",
    time: "O(n \\cdot h)", space: "O(n \\cdot h)",
    cpp: `class Solution {
    void dfs(TreeNode* node, vector<int>& path, vector<vector<int>>& all) {
        if (!node) return;
        path.push_back(node->val);
        if (!node->left && !node->right) all.push_back(path);   // a full copy
        dfs(node->left, path, all);
        dfs(node->right, path, all);
        path.pop_back();
    }
public:
    int maxDepth(TreeNode* root) {
        vector<vector<int>> all;
        vector<int> path;
        dfs(root, path, all);
        size_t best = 0;
        for (auto& p : all) best = max(best, p.size());
        return (int)best;
    }
};`,
    js: `function maxDepth(root) {
  const all = [];
  function dfs(node, path) {
    if (!node) return;
    path.push(node.val);
    if (!node.left && !node.right) all.push(path.slice());   // a full copy
    dfs(node.left, path);
    dfs(node.right, path);
    path.pop();
  }
  dfs(root, []);
  let best = 0;
  for (const p of all) best = Math.max(best, p.length);
  return best;
}`,
  },

  pattern: {
    name: "Tree Recursion (DFS)",
    why: "A binary tree is defined recursively: *a tree is either empty, or a node with a left tree and a right tree*. So the natural algorithm follows the same definition: solve the question for the two subtrees, then combine the two answers with the current node. This \"base case + combine the children\" shape is the engine behind most tree problems.",
    recognize: [
      "The question is about a **tree** (or any recursive structure) and the answer for a node can be built from the answers for its children.",
      "You can say *\"the answer for this subtree is …the answers for its left and right subtrees…\"*.",
      "A natural base case exists: the empty tree / a null node (here: depth `0`).",
      "You need to visit **every node once**; order matters only for pre-/in-/post-order variations (here: **post-order**, children before parent).",
    ],
  },

  optimal: {
    idea: "Let `maxDepth(node)` return the depth of the subtree rooted at `node`. If `node` is `null`, the subtree is empty and the depth is `0`. Otherwise, ask for the depth of the left and of the right subtree, and the answer for this node is one more than the larger of the two (the `+1` counts the node itself).",
    steps: [
      "**Base case:** if `node` is `null`, return `0`.",
      "Recursively compute `l = maxDepth(node.left)`.",
      "Recursively compute `r = maxDepth(node.right)`.",
      "Return `1 + max(l, r)`: this node plus the deeper side.",
      "Call it on `root` to get the depth of the whole tree.",
    ],
    invariant: "**When `maxDepth(node)` returns, its value is the exact number of nodes on the longest downward path from `node`.** The call stack always holds the chain of ancestors currently waiting for an answer.",
    correct: "By induction on the height of the subtree. *Base:* a null subtree has no nodes, so depth `0` is correct. *Step:* assume the calls on both children return their true depths `l` and `r`. A longest downward path from `node` must go through `node` and then continue into the left or the right subtree along a longest path there, so its length is `1 + max(l, r)`. The recursion terminates because every call moves to a strictly smaller subtree and null stops it.",
  },

  cpp: `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (root == nullptr) return 0;           // empty tree //@base
        int l = maxDepth(root->left);            // depth of left //@left
        int r = maxDepth(root->right);           // depth of right //@right
        return 1 + max(l, r);                    // this node + deeper side //@ret
    }
};`,
  js: `function maxDepth(root) {
  if (root === null) return 0;                 // empty tree //@base
  const l = maxDepth(root.left);               // depth of left //@left
  const r = maxDepth(root.right);              // depth of right //@right
  return 1 + Math.max(l, r);                   // this node + deeper side //@ret
}`,

  tests: [
    { name: "Example 1", kind: "normal", input: { root: [3, 9, 20, null, null, 15, 7] } },
    { name: "Example 2: only a right child", kind: "normal", input: { root: [1, null, 2] } },
    { name: "A perfect tree", kind: "normal", input: { root: [1, 2, 3, 4, 5, 6, 7] } },
    { name: "Left-leaning chain", kind: "edge", input: { root: [1, 2, null, 3, null, 4] }, why: "A tree that is really a linked list: depth equals the number of nodes (4), and the recursion goes 4 calls deep **before anything returns**. This is the worst case for stack space: $O(n)$. A tree with 100,000 nodes like this would overflow the C++ stack." },
    { name: "Right-leaning chain", kind: "edge", input: { root: [1, null, 2, null, 3] }, why: "The mirror image. The left recursion hits `null` immediately every time (returning `0`), so all the work happens on the right side. It shows that `max(l, r)` must really compare both sides." },
    { name: "Uneven branches", kind: "edge", input: { root: [1, 2, 3, 4, null, null, null, 5] }, why: "The left subtree is much deeper (4) than the right (2). A solution that only follows `root->left`, or adds the two depths, would be wrong. The `max` is what picks the deeper side." },
    { name: "Empty tree", kind: "corner", input: { root: [] }, why: "`root` is `null`. The base case must return `0` before touching `root->left`, otherwise we dereference a null pointer. (Strictly the constraints allow an empty tree.)" },
    { name: "A single node", kind: "corner", input: { root: [7] }, why: "Both children are `null`, so we compute `1 + max(0, 0) = 1`. The `+ 1` is what counts the node itself: forgetting it would return `0` for every tree." },
    { name: "Only a left child", kind: "corner", input: { root: [1, 2] }, why: "One side is empty (depth 0) and the other has depth 1, so the answer is `1 + max(1, 0) = 2`. This catches code that treats a missing child as an error instead of as depth 0." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const cs = K.callStack();
    const path = [], done = {};
    const total = Object.keys(nodes).length;
    let whyBase = false, whyRet = false, whyBack = false;
    const S = (cur) => () => {
      const hl = {}, sub = {};
      path.forEach((id) => (hl[id] = "win"));
      for (const id in done) { hl[id] = "ok"; sub[id] = `depth ${done[id]}`; }
      if (cur != null) hl[cur] = "cur";
      return { nodes, root, hl, sub, calls: cs.snapshot(), label: "binary tree", gy: 62 };
    };
    const vars = (f, extra) => Object.assign({ node: f.args.replace("node=", "") }, extra);
    function depth(id) {
      const f = cs.push("maxDepth", id == null ? "null" : `node=${nodes[id].v}`, "", "");
      T.step("base", { vars: { node: id == null ? "null" : nodes[id].v }, state: S(id), say: id == null ? "A new call, this time for a **`null` child**. There is no node here." : `A new call for node **${nodes[id].v}**. First the base case: is it \`null\`? No, so we have to ask its children.`, op: `root == nullptr ?  ${id == null}`, act: id == null ? "NULL_NODE" : "CALL" });
      if (id == null) {
        f.ret = 0;
        T.step("base", { vars: { node: "null", "return": 0 }, state: S(null), say: "An empty tree has depth **0**. Return it: nothing below this point.", op: "return 0", act: "RETURN_0",
          why: whyBase ? null : { title: "Why does a null node return 0?", text: "It is the **base case**: an empty subtree contains no nodes, so its depth is 0. Without it the recursion would never stop (and would dereference `null`)." } });
        whyBase = true;
        cs.pop();
        return 0;
      }
      path.push(id);
      f.locals = "l=?, r=?"; f.pending = "";
      T.step("left", { vars: { node: nodes[id].v, l: "?", r: "?" }, state: S(id), say: `Ask the **left** subtree of ${nodes[id].v} for its depth: \`maxDepth(root->left)\`. This call pauses until the answer comes back.`, op: `l = maxDepth(node.left)`, act: "GO_LEFT" });
      const l = depth(nodes[id].l);
      f.locals = `l=${l}, r=?`;
      T.step("right", { vars: { node: nodes[id].v, l, r: "?" }, state: S(id), say: `The left subtree answered **${l}**; the call for ${nodes[id].v} wakes up with \`l = ${l}\`. Now ask the **right** subtree.`, op: `l = ${l},  r = maxDepth(node.right)`, act: "GO_RIGHT",
        why: whyBack ? null : { title: "Where did the call go?", text: "The call for this node is still on the **call stack**, waiting, with `l` saved in its frame. When the child call returns, execution continues here: the stack is the memory of \"where we were\"." } });
      whyBack = true;
      const r = depth(nodes[id].r);
      f.locals = `l=${l}, r=${r}`;
      const res = 1 + Math.max(l, r);
      f.ret = res;
      T.step("ret", { vars: { node: nodes[id].v, l, r, "return": res }, state: S(id), say: `Both answers are in: \`l = ${l}\`, \`r = ${r}\`. The deeper side is ${l >= r ? "left" : "right"} (${Math.max(l, r)}), plus **1 for node ${nodes[id].v} itself** = **${res}**.`, op: `return 1 + max(${l}, ${r}) = ${res}`, act: "RETURN",
        why: whyRet ? null : { title: "Why 1 + max(l, r)?", text: `The longest path through this node goes down the *deeper* child (so \`max\`), and the node itself adds one more step (so \`1 +\`). Taking the **max**, not the sum, is what keeps it a *path*.` } });
      whyRet = true;
      path.pop(); done[id] = res; cs.pop();
      return res;
    }
    T.phase("Recurse on both children");
    const d = depth(root);
    T.step("ret", { vars: { "return": d }, state: S(null), say: root == null ? "The tree is empty, so the answer is **0**." : `The first call (on the root) has returned. The tree has **${total}** node${total === 1 ? "" : "s"} and maximum depth **${d}**.`, op: `maxDepth(root) = ${d}`, act: "DONE" });
    T.result(d);
  },
  fuzz(rnd, k) { return { root: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 12)) }; },
  gen(n) { return { root: SHEETS.K.chain(n, "l") }; },

  complexity: {
    time: {
      tex: "O(n)", title: "every node is visited exactly once", short: "2n + 1 calls in total, each doing a constant amount of work",
      derive: [
        "\\text{calls} = \\underbrace{n}_{\\text{real nodes}} + \\underbrace{(n+1)}_{\\text{null children}} || a binary tree with n nodes has exactly n + 1 empty child slots, and each gets one call that returns 0",
        "T(n) = (2n + 1) \\cdot c || every call does $O(1)$ work besides its recursive calls: one comparison, one `max`, one addition",
        "\\text{as a recurrence: } T(n) = T(a) + T(n-1-a) + c,\\; T(0) = c_0 || the left subtree has $a$ nodes and the right one $n-1-a$",
        "\\text{check by induction: } T(n) \\le (2c)\\,n + c_0 \\;\\Rightarrow\\; T(a)+T(n-1-a)+c \\le 2c(n-1) + 2c_0 + c \\le 2cn + c_0 \\text{ when } c_0 \\le c || the split does not matter, the bound is linear for every tree shape",
        "!T(n) = O(n) || we cannot avoid looking at every node",
      ],
      where: "It does not matter whether the tree is balanced or a chain: the **sum** of the sizes of the two subtrees is always $n - 1$, so the total number of calls is fixed at $2n + 1$. This is why the lab's step counter always grows linearly with the number of nodes.",
    },
    space: {
      tex: "O(h)", title: "the call stack is as deep as the tree is tall", short: "h is the height: ⌊log₂ n⌋ for a balanced tree, n for a chain",
      derive: [
        "S = \\max_t \\,\\text{stack depth}_t \\cdot s_{\\text{frame}} || only the chain of ancestors of the current node is on the stack",
        "\\text{stack depth} \\le h + 1 || h edges down to the deepest node, plus the final call on a null child",
        "S = O(h) \\;\\text{ where }\\; \\lfloor \\log_2 n \\rfloor \\le h \\le n - 1 || balanced tree at best, a chain at worst",
        "!S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ worst} || no other memory is used",
      ],
      where: "The recursion itself uses **no data structure**, only the call stack: one frame per ancestor of the current node. Watch the call-stack panel in the lab: its tallest moment equals the answer plus one (the last `null` call). That is why a degenerate tree of $10^5$ nodes can overflow the stack, and why an explicit-stack or BFS version is sometimes preferred.",
    },
    limit: "Any algorithm must look at every node (an unseen node could be the deepest), so $\\Omega(n)$ time is unavoidable and the recursion is optimal in time. Space $O(h)$ is the cost of depth-first order; a breadth-first (level-order) version needs $O(w)$ instead, where $w$ is the widest level.",
    measure: { label: "n = number of nodes", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Forgetting the base case for `null`", what: "Writing `return 1 + max(maxDepth(root->left), maxDepth(root->right));` without `if (!root) return 0;`.", why: "The recursive line looks like the whole solution.", breaks: "The recursion eventually calls `maxDepth(nullptr)` and dereferences `root->left` on a null pointer: crash (segmentation fault) or `TypeError` in JS.", avoid: "Always write the base case **first**: an empty tree has depth `0`." },
    { title: "Returning `max(l, r)` without the `+ 1`", what: "`return max(l, r);`", why: "Counting *edges* in your head instead of nodes, or forgetting the current node.", breaks: "Every leaf would return `0`, so the whole tree reports depth `0` (or one less than the truth if the base case returns `1`).", avoid: "A node on the path counts. Say it out loud: *this node* plus *the deeper child*." },
    { title: "Using the base case `return 1` for a leaf and also for null", what: "Returning `1` when `root == nullptr`.", why: "Mixing up the null-based and the leaf-based way of writing the recursion.", breaks: "Every null child contributes an extra 1, so the answer is too big by one (or worse).", avoid: "Pick one style: null → `0`, then `1 + max(l, r)` always. Or treat leaves specially, but not both." },
    { title: "Adding the depths instead of taking the maximum", what: "`return 1 + l + r;`", why: "Thinking of the total number of nodes seen.", breaks: "That counts nodes in both subtrees, not along a single path, so a perfect tree of 7 nodes would report 7 instead of 3.", avoid: "Depth is the length of **one path** going down: it can only follow one child, so take the `max`." },
    { title: "Stack overflow on very deep trees", what: "Using the recursive solution on a chain with about $10^5$ nodes.", why: "On balanced trees recursion depth is tiny, so it is never noticed.", breaks: "Each call needs a stack frame; a chain of 100,000 nodes can exceed the typical 1–8 MB stack and crash.", avoid: "For adversarial inputs, use an **iterative** BFS (count levels) or DFS with an explicit stack, as in the follow-ups." },
  ],

  followUps: [
    {
      q: "Solve it **without recursion** using a queue (breadth-first search).",
      a: "Process the tree **level by level**: put the root in a queue; for each level, remove exactly the nodes currently in the queue (their count is `queue.size()` at the start of the level) and add their children. Each time a level is finished, increment the depth. The answer is the number of levels. Space is $O(w)$ where $w$ is the maximum width, instead of $O(h)$.",
      cpp: `int maxDepthBFS(TreeNode* root) {
    if (!root) return 0;
    queue<TreeNode*> q;
    q.push(root);
    int depth = 0;
    while (!q.empty()) {
        for (int k = q.size(); k > 0; k--) {       // exactly one level
            TreeNode* n = q.front(); q.pop();
            if (n->left) q.push(n->left);
            if (n->right) q.push(n->right);
        }
        depth++;
    }
    return depth;
}`,
      js: `function maxDepthBFS(root) {
  if (!root) return 0;
  let level = [root], depth = 0;
  while (level.length) {
    const nextLevel = [];
    for (const n of level) {
      if (n.left) nextLevel.push(n.left);
      if (n.right) nextLevel.push(n.right);
    }
    level = nextLevel;
    depth++;
  }
  return depth;
}`,
      time: "O(n)", space: "O(w)",
    },
    {
      q: "Do it with an explicit **stack** (iterative depth-first search).",
      a: "Push pairs `(node, depth)`. Pop one, update `best = max(best, depth)`, then push its children with `depth + 1`. This simulates the recursion's call stack by hand, so a deep tree cannot overflow the machine stack (the explicit stack lives on the heap).",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "What is the **minimum** depth (the shortest path from the root to a **leaf**)?",
      a: "It looks like a one-word change (`min` instead of `max`) but is a classic trap: if a node has only one child, the missing side must **not** count as depth 0, because a path must end at a *leaf*. Use: if `left` is null return `1 + minDepth(right)`; if `right` is null return `1 + minDepth(left)`; otherwise `1 + min(both)`. A BFS stops at the first leaf it meets, which is even simpler.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Check whether the tree is **height-balanced** (the heights of the two subtrees of every node differ by at most 1).",
      a: "Compute the height bottom-up (this lesson's function), but return a **sentinel** such as `-1` as soon as any subtree is unbalanced, so the answer propagates up without recomputing heights. Calling `height()` separately at every node would repeat work and cost $O(n^2)$ on a chain; the sentinel version stays $O(n)$ because each node is visited once.",
      time: "O(n)", space: "O(h)",
    },
  ],

  related: [
    { id: "same-tree", why: "The same recursion shape: ask both children, then combine (here with `&&` instead of `max`)." },
    { id: "invert-binary-tree", why: "Recurse on both children and swap them: the identical skeleton with a different combine step." },
    { id: "binary-tree-maximum-path-sum", why: "The hard cousin: each call returns the best *downward* path, and also updates a global best that bends through the node." },
    { id: "binary-tree-level-order-traversal", why: "The breadth-first version: process one whole level at a time with a queue, the iterative way to measure depth." },
  ],
  patternNote: "**The Tree Recursion pattern** says: *trust the function for the smaller trees, and fix up the current node.* Decide the base case (a null node), decide what the function returns for a subtree, and write down how to combine the left result, the right result and the node itself. Almost every tree question is this shape, with a different return value and a different combine step.",
  takeaways: [
    "A tree is a root plus two smaller trees, so `depth(node) = 1 + max(depth(left), depth(right))` and `depth(null) = 0`.",
    "Write the **base case first**; trust the recursive calls to return the right answer for the subtrees.",
    "The **call stack** remembers where each ancestor was waiting; its height is the tree's height.",
    "Time $O(n)$ (2n + 1 calls); space $O(h)$: $O(\\log n)$ balanced, $O(n)$ for a chain.",
    "Count nodes along **one path**: use `max`, never the sum; and do not forget the `+ 1` for the node itself.",
  ],
});
