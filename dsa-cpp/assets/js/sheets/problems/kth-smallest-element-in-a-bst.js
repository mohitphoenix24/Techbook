SHEETS.define({
  id: "kth-smallest-element-in-a-bst",
  viz: "tree",
  io: { fn: "kthSmallest", params: [["root", "tree"], ["k", "int"]], ret: "int", labels: { root: "root (a BST, level order)", k: "k (1 = the smallest)" } },
  legend: [["cur", "node being visited"], ["win", "on the stack (waiting for its turn)"], ["ok", "already visited, in sorted order"], ["hit", "the k-th smallest"]],

  statement: `Given the \`root\` of a **binary search tree**, and an integer \`k\`, return the \`k\`-th smallest value (**1-indexed**) of all the values of the nodes in the tree.

*(In the lab, a tree is written in **level order**, row by row from left to right, with \`null\` for a missing child. The tree must be a valid BST, with no equal values.)*`,
  examples: [
    { input: "root = [3, 1, 4, null, 2], k = 1", output: "1", explain: "The values in sorted order are 1, 2, 3, 4; the 1st is 1." },
    { input: "root = [5, 3, 6, 2, 4, null, null, 1], k = 3", output: "3", explain: "Sorted: 1, 2, 3, 4, 5, 6; the 3rd smallest is 3." },
  ],
  constraints: ["The number of nodes in the tree is `n`", "$1 \\le k \\le n \\le 10^4$", "$0 \\le$ `Node.val` $\\le 10^4$"],
  check(input) {
    const a = input.root, n = a.filter((x) => x !== null).length;
    if (n < 1) return "the tree needs at least one node";
    if (n > 9) return "for the animation use at most 9 nodes";
    if (input.k < 1 || input.k > n) return `k must be between 1 and ${n} (the number of nodes)`;
    const { nodes, root } = SHEETS.K.tree(a);
    const ok = (id, lo, hi) => id == null || (nodes[id].v > lo && nodes[id].v < hi && ok(nodes[id].l, lo, nodes[id].v) && ok(nodes[id].r, nodes[id].v, hi));
    if (!ok(root, -Infinity, Infinity)) return "this must be a valid BST: smaller values on the left, larger on the right, no repeated values";
    return null;
  },

  intuition: {
    find: "The value that has exactly `k − 1` smaller values in the tree. In a BST that is the node you meet at position `k` when you list the values from smallest to largest.",
    beginner: "Collect every value of the tree in a list, sort the list, and return the element at position `k − 1`.",
    works: "Sorting the values gives them in increasing order, so the element at position `k − 1` has exactly `k − 1` smaller elements before it.",
    slow: "Sorting costs $O(n \\log n)$ and the list needs $O(n)$ memory. But we are given a **BST**, whose structure already contains the order: sorting throws that information away.",
    repeat: "The tree is already sorted in a clever way: for every node, everything on its left is smaller and everything on its right is larger. Sorting rediscovers this order from scratch.",
    remember: "A walk that visits **left subtree, then the node, then right subtree** (an *in-order* traversal) meets the values of a BST in **increasing order**. The k-th node visited is the k-th smallest.",
    observation: "Do an in-order traversal and **stop at the k-th node**. With an explicit stack: dive to the leftmost node, pushing every node on the way; pop one (it is the next smallest), count it; if it is the k-th, return it; otherwise continue with its right subtree. We only visit `k` nodes and the part of the tree needed to reach them.",
    leads: "`cur = root`. While `cur` or the stack is non-empty: push the whole left spine (`while (cur) { push(cur); cur = cur->left; }`), pop the top into `cur`, decrease `k`; if `k == 0` return `cur->val`; then `cur = cur->right`.",
  },

  flow: [
    "Collect all the values, sort them, take position `k − 1`.",
    "Position `k − 1` of the sorted list has exactly `k − 1` smaller values.",
    "$O(n \\log n)$ time and $O(n)$ memory: the order stored in the BST is ignored.",
    "An in-order traversal (left, node, right) of a BST visits values in increasing order.",
    "Walk in-order with a stack and stop at the `k`-th visit.",
    "$O(h + k)$ time, $O(h)$ space: only the first `k` nodes are visited.",
  ],

  brute: {
    idea: "**Brute force:** walk the whole tree in any order and collect all the values in a `vector`; sort it; return the element at index `k − 1`.",
    why: "It visits all $n$ nodes and then sorts them: $O(n \\log n)$ time and $O(n)$ memory. A BST is *already sorted*: an in-order walk produces the values in order, so the sort is unnecessary, and the walk can stop after `k` nodes.",
    time: "O(n log n)", space: "O(n)",
    cpp: `class Solution {
    void collect(TreeNode* t, vector<int>& v) {
        if (!t) return;
        v.push_back(t->val);
        collect(t->left, v);
        collect(t->right, v);
    }
public:
    int kthSmallest(TreeNode* root, int k) {
        vector<int> v;
        collect(root, v);
        sort(v.begin(), v.end());
        return v[k - 1];
    }
};`,
    js: `function kthSmallest(root, k) {
  const v = [];
  const collect = (t) => { if (!t) return; v.push(t.val); collect(t.left); collect(t.right); };
  collect(root);
  v.sort((a, b) => a - b);
  return v[k - 1];
}`,
  },

  pattern: {
    name: "Tree Traversal (in-order on a BST, with a stack)",
    why: "The in-order traversal is the bridge between a BST and a sorted list. Doing it with an **explicit stack** lets you pause after any number of visited nodes (here `k`), which a plain recursion makes awkward, and uses only $O(h)$ memory.",
    recognize: [
      "The input is a **binary search tree** and the question is about **order** (k-th smallest, sorted output, validity, closest value).",
      "You need only the first few elements in sorted order, so a complete sort is wasteful.",
      "Recursion would work but you want to **stop early** or keep an iterator.",
      "The nodes on the way down (the left spine) must wait until their left subtree is finished.",
    ],
  },

  optimal: {
    idea: "Simulate an in-order traversal with a stack. Push the current node and move left until there is no left child: the node on top of the stack is the smallest not yet visited. Pop it, count it as the next visit (decrease `k`), and if `k` reached 0 it is the answer. Otherwise move to its right child and repeat. Everything pushed after a node is smaller than it, so nodes leave the stack in increasing order.",
    steps: [
      "Set `cur = root` and create an empty stack.",
      "While `cur` is not `null` or the stack is not empty:",
      "Push `cur` and move left, until `cur` is `null` (this pushes the left spine).",
      "Pop the top of the stack into `cur`: it is the next smallest value.",
      "Decrease `k`; if `k == 0`, return `cur.val`.",
      "Move to the right child: `cur = cur.right`.",
    ],
    invariant: "**The nodes already popped are exactly the smallest values of the tree in increasing order, and the stack holds the ancestors of `cur` that are still waiting (all larger than the nodes in the subtree being explored, and not yet visited).**",
    correct: "In a BST, the smallest unvisited value is always the leftmost node of the unvisited part: the walk down the left spine finds it, and everything on the spine above it is larger, so those nodes stay on the stack in the right order (top = smallest). When a node is popped, all smaller values are already visited, so it is the next one in sorted order. Its remaining unvisited relatives that are larger than it but smaller than the next stack entry are exactly in its right subtree, which is explored next (dive into the right child's left spine). By induction the pops produce the values in increasing order, so the $k$-th pop is the $k$-th smallest. Each node is pushed once and popped once, and the walk ends after $k$ pops.",
  },

  cpp: `class Solution {
public:
    int kthSmallest(TreeNode* root, int k) {
        stack<TreeNode*> st;                    //@init
        TreeNode* cur = root;
        while (cur || !st.empty()) {            //@loop
            while (cur) { st.push(cur); cur = cur->left; }   // dive down the left spine //@dive
            cur = st.top(); st.pop();           // the next smallest value //@pop
            if (--k == 0) return cur->val;      // the k-th visit is the answer //@count
            cur = cur->right;                   // then explore the right subtree //@right
        }
        return -1;                              // not reached when 1 <= k <= n //@ret
    }
};`,
  js: `function kthSmallest(root, k) {
  const st = [];                         //@init
  let cur = root;
  while (cur || st.length) {             //@loop
    while (cur) { st.push(cur); cur = cur.left; }   // dive down the left spine //@dive
    cur = st.pop();                      // the next smallest value //@pop
    if (--k === 0) return cur.val;       // the k-th visit is the answer //@count
    cur = cur.right;                     // then explore the right subtree //@right
  }
  return -1;                             // not reached when 1 <= k <= n //@ret
}`,

  tests: [
    { name: "Example 1: [3, 1, 4, null, 2], k = 1", kind: "normal", input: { root: [3, 1, 4, null, 2], k: 1 } },
    { name: "Example 2: [5, 3, 6, 2, 4, null, null, 1], k = 3", kind: "normal", input: { root: [5, 3, 6, 2, 4, null, null, 1], k: 3 } },
    { name: "The root is the 4th smallest", kind: "normal", input: { root: [5, 3, 8, 1, 4, 7, 9], k: 4 } },
    { name: "A single node", kind: "edge", input: { root: [1], k: 1 }, why: "The stack gets the one node, it is popped, `k` becomes 0 and its value is returned: the first (and only) visit is the answer." },
    { name: "k is the largest (k = n)", kind: "edge", input: { root: [5, 3, 8, 1, 4, 7, 9], k: 7 }, why: "All 7 nodes must be visited before the answer appears, so this is the slowest case: the whole tree is walked. The last node visited is the rightmost one, `9`." },
    { name: "A left chain (deep dive first)", kind: "edge", input: { root: [3, 2, null, 1], k: 1 }, why: "The tree leans left, so the first dive pushes all 3 nodes before the first pop, and the stack is as tall as the tree. The smallest value `1` is the deepest node." },
    { name: "A right chain", kind: "edge", input: { root: [1, null, 2, null, 3], k: 3 }, why: "Each node has no left child, so every dive pushes only one node, and the stack never holds more than one entry. The walk follows the right spine, visiting `1`, `2`, `3`." },
    { name: "The answer is an inner node with a right subtree", kind: "corner", input: { root: [4, 2, 6, 1, 3, 5, 7], k: 2 }, why: "The 2nd smallest is `2`, which has a left child `1` (visited first) and a right child `3` (visited later). The walk returns before `3` is ever pushed." },
    { name: "Negative values", kind: "corner", input: { root: [0, -3, 3, -5, -1], k: 2 }, why: "In-order gives -5, -3, -1, 0, 3, so the 2nd smallest is -3. Negative numbers order like any others; there is nothing special about zero." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const k0 = input.k;
    let k = k0, cur = root;
    const stack = [], visited = [];
    let hit = null, whyStack = false, whyPop = false, whyStop = false;
    const total = Object.keys(nodes).length;
    const S = (o = {}) => () => {
      const hl = {}, sub = {};
      visited.forEach((id, i) => { hl[id] = "ok"; sub[id] = `#${i + 1}`; });
      stack.forEach((id) => (hl[id] = "win"));
      if (hit) hl[hit] = "hit";
      else if (o.cur != null) hl[o.cur] = "cur";
      return {
        nodes, root, hl, sub, gy: 62, label: "binary search tree",
        arrs: [{ label: "stack  (top = right end)", arr: stack.length ? stack.map((id) => nodes[id].v) : ["∅"], hl: stack.length ? { [stack.length - 1]: "cur" } : { 0: "empty" } }],
        out: { label: `visited in increasing order  (we want number ${k0})`, items: visited.map((id) => nodes[id].v), hl: hit ? { [visited.length - 1]: "hit" } : {} },
        note: o.note,
      };
    };
    const vars = () => ({ k, cur: cur == null ? "null" : nodes[cur].v, "stack size": stack.length, visited: visited.length });
    T.step("init", { vars: vars(), state: S(), phase: "Walk the tree in order", say: `We look for the **${k0}${k0 === 1 ? "st" : k0 === 2 ? "nd" : k0 === 3 ? "rd" : "th"} smallest** value. In a BST, visiting the left subtree, then the node, then the right subtree gives the values in increasing order. We use a stack so that we can **stop** after ${k0} visit${k0 === 1 ? "" : "s"}.`, op: "st = empty stack,  cur = root", act: "START" });
    while (cur != null || stack.length) {
      T.step("loop", { vars: vars(), state: S({ cur }), say: cur != null ? `\`cur\` is node **${nodes[cur].v}**, so there is still a subtree to explore.` : `\`cur\` is \`null\` but the stack still holds ${stack.length} waiting node${stack.length === 1 ? "" : "s"}: the next one to visit is on top.`, op: `cur || !st.empty()  →  true`, act: "KEEP_GOING" });
      let first = true;
      while (cur != null) {
        stack.push(cur);
        T.step("dive", { vars: vars(), state: S({ cur }), say: first ? `Dive down the **left spine**: push **${nodes[cur].v}** and move to its left child${nodes[cur].l == null ? " (there is none)" : ""}.` : `Push **${nodes[cur].v}** and keep going left${nodes[cur].l == null ? " (no left child: the dive ends)" : ""}.`, op: `st.push(${nodes[cur].v});  cur = cur.left`, act: "PUSH_LEFT_SPINE",
          why: whyStack ? null : { title: "Why push the nodes on the way down?", text: "A node must be visited **after** everything in its left subtree. So when we pass a node going left, it has to wait. The stack remembers the waiting nodes, with the nearest one (the smallest) on top." } });
        whyStack = true; first = false;
        cur = nodes[cur].l;
      }
      const top = stack.pop();
      cur = top;
      visited.push(top);
      T.step("pop", { vars: vars(), state: S({ cur: top }), say: `\`cur\` is now \`null\`: no smaller value is left on this path. Pop the top of the stack: **${nodes[top].v}** is the **next smallest** value (number ${visited.length}).`, op: `cur = st.top();  st.pop()  →  ${nodes[top].v}`, act: "POP_NEXT_SMALLEST",
        why: whyPop ? null : { title: "Why is the popped node the smallest?", text: "Everything smaller than it lies in its left subtree (already finished, since we went all the way down) or among nodes already popped. Everything still waiting on the stack is larger." } });
      whyPop = true;
      k--;
      const done = k === 0;
      if (done) hit = top;
      T.step("count", { vars: vars(), state: S({ cur: top }), say: done ? `\`k\` drops to **0**: this was visit number ${k0}, so **${nodes[top].v}** is the ${k0}${k0 === 1 ? "st" : k0 === 2 ? "nd" : k0 === 3 ? "rd" : "th"} smallest value. Return it.` : `\`k\` drops to **${k}**: ${k} more visit${k === 1 ? "" : "s"} to go. This was not the one.`, op: `--k == 0  →  ${k} == 0  →  ${done}`, act: done ? "FOUND" : "NOT_YET",
        why: done && !whyStop ? { title: "Why can we stop here?", text: "The walk has seen exactly the `k` smallest values, in order, and nothing else. The rest of the tree (the larger values) is never visited, so the time depends on `k` and the height, not on `n`." } : null });
      if (done) { T.result(nodes[top].v); T.step("count", { vars: { "return": nodes[top].v }, state: S(), say: `Return **${nodes[top].v}**. Only ${visited.length} of the ${total} node${total === 1 ? "" : "s"} had to be visited.`, op: `return ${nodes[top].v}`, act: "DONE" }); return; }
      cur = nodes[top].r;
      T.step("right", { vars: vars(), state: S({ cur, note: cur == null ? "no right child: the next node comes from the stack" : undefined }), say: cur == null ? `${nodes[top].v} has no right child, so \`cur\` becomes \`null\` and the next smallest value is on top of the stack.` : `Move to the **right** child of ${nodes[top].v}, which is **${nodes[cur].v}**. Its left spine holds the values between ${nodes[top].v} and the next waiting node.`, op: "cur = cur.right", act: cur == null ? "NO_RIGHT" : "GO_RIGHT" });
    }
    T.result(-1);
    T.step("ret", { vars: { "return": -1 }, state: S(), say: "The tree has fewer than `k` nodes: return −1 (this does not happen when `1 ≤ k ≤ n`).", op: "return -1", act: "DONE" });
  },
  fuzz(rnd) {
    const K = SHEETS.K, n = 1 + Math.floor(rnd() * 8), vals = [];
    while (vals.length < n) { const v = Math.floor(rnd() * 20) - 5; if (!vals.includes(v)) vals.push(v); }
    const nodes = {}; let root = null;
    vals.forEach((v, i) => {
      const id = "f" + i; nodes[id] = { v, l: null, r: null };
      if (root === null) { root = id; return; }
      let c = root;
      for (;;) { if (v < nodes[c].v) { if (nodes[c].l === null) { nodes[c].l = id; break; } c = nodes[c].l; } else { if (nodes[c].r === null) { nodes[c].r = id; break; } c = nodes[c].r; } }
    });
    return { root: K.treeArr(nodes, root), k: 1 + Math.floor(rnd() * n) };
  },
  gen(n) { const a = [n]; for (let i = n - 1; i >= 1; i--) a.push(i, null); return { root: a, k: n }; },

  complexity: {
    time: {
      tex: "O(h + k)", title: "dive to the smallest node, then visit k nodes", short: "h pushes to reach the first node, then about k pops and the pushes they cause",
      derive: [
        "T_{\\text{first dive}} = h\\, c || the first dive pushes the left spine: at most $h$ nodes",
        "T_{\\text{visits}} = k \\text{ pops} + (\\text{pushes of right spines}) \\le k + k = 2k\\; c || every visited node was pushed once and popped once; pushes happen only for nodes that will be visited or wait on the stack",
        "T(h, k) \\le (h + 2k)\\, c = O(h + k) || the walk stops at the $k$-th pop",
        "!T = O(h + k) \\le O(n) \\;\\;\\text{ (worst case: a chain with } k = n) || much less than $O(n \\log n)$",
      ],
      where: "For a balanced tree $h \\approx \\log_2 n$, so finding a small `k` takes only $O(\\log n + k)$ steps. In the worst case (`k = n`, or a chain) the whole tree is visited and the time is $O(n)$. The measured table uses a left chain with `k = n`.",
    },
    space: {
      tex: "O(h)", title: "the stack holds one root-to-node path", short: "h = height of the tree",
      derive: [
        "|\\text{stack}| \\le h || it holds the ancestors of `cur` that are still waiting, one per level",
        "!S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ for a chain} || no copy of the values",
      ],
      where: "The brute force keeps all $n$ values in a vector. The in-order walk keeps only the waiting ancestors, which is the height of the tree.",
    },
    limit: "Any method must at least descend to the smallest value ($\\Omega(h)$) and then produce `k` values ($\\Omega(k)$), so $O(h + k)$ is optimal for a plain BST. If the query is repeated many times, store the subtree size in each node and find the $k$-th element in $O(h)$.",
    measure: { label: "n = number of nodes (a left chain, k = n)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Sorting all the values", what: "Collecting the values and calling `sort`.", why: "It is the first idea that works.", breaks: "It ignores that the tree is a BST: $O(n \\log n)$ time and $O(n)$ memory instead of $O(h + k)$ and $O(h)$.", avoid: "Use the in-order traversal: it already produces sorted values." },
    { title: "A pre-order or post-order walk", what: "Visiting the node before (or after) both subtrees.", why: "All three traversals look alike.", breaks: "Only the **in-order** walk (left, node, right) gives increasing values. Pre-order gives the root first, so the 1st \"smallest\" would be the root.", avoid: "Visit the node between the two subtrees." },
    { title: "Off-by-one in `k`", what: "Returning when `k == 1` after decrementing, or counting from 0.", why: "Mixing 1-based and 0-based counting.", breaks: "The answer is one position too early or too late (for `k = 1` it returns the second smallest).", avoid: "`if (--k == 0) return cur->val;` with `k` starting at the given 1-based value." },
    { title: "Forgetting to move to the right child", what: "Popping a node and returning to the loop without `cur = cur->right`.", why: "The pop already gives the node we want.", breaks: "The right subtrees are never explored, so only the left spine and ancestors are ever visited and larger values are missed.", avoid: "After counting a node, continue with `cur = cur->right`." },
    { title: "Continuing after the answer", what: "Collecting all `n` values, then indexing.", why: "The loop is written as a full traversal.", breaks: "Not a wrong answer, but the stop-early advantage ($O(h + k)$ instead of $O(n)$) is lost.", avoid: "Return as soon as `k` reaches 0." },
  ],

  followUps: [
    {
      q: "Solve it with a **recursive** in-order traversal.",
      a: "A recursive helper visits the left subtree, then counts the node (decrease a counter; when it hits 0, remember the value), then visits the right subtree. It is shorter to write but the early stop needs a flag or an exception-like return. $O(h + k)$ time with the early exit, and $O(h)$ stack space.",
      cpp: `int kthRec(TreeNode* root, int k) {
    int ans = -1;
    function<void(TreeNode*)> go = [&](TreeNode* t) {
        if (!t || k == 0) return;
        go(t->left);
        if (k == 0) return;
        if (--k == 0) { ans = t->val; return; }
        go(t->right);
    };
    go(root);
    return ans;
}`,
      js: `function kthRec(root, k) {
  let ans = -1;
  const go = (t) => {
    if (!t || k === 0) return;
    go(t.left);
    if (k === 0) return;
    if (--k === 0) { ans = t.val; return; }
    go(t.right);
  };
  go(root);
  return ans;
}`,
      time: "O(h + k)", space: "O(h)",
    },
    {
      q: "The tree is **modified often** and `k` changes between queries. Can you answer faster than $O(h + k)$?",
      a: "Store in each node the **size of its left subtree** (or of the whole subtree). To find the $k$-th smallest: if `k ≤ leftSize` go left; if `k == leftSize + 1` the node itself is the answer; otherwise go right with `k − leftSize − 1`. Each query is $O(h)$, and the sizes are updated along the path on insertions and deletions.",
      time: "O(h) per query", space: "O(n) for the sizes",
    },
    {
      q: "Find the **k-th largest** instead.",
      a: "Mirror the walk: go right first (reverse in-order) so that values come in decreasing order, and stop at the $k$-th. Or find the $(n - k + 1)$-th smallest if $n$ is known.",
      time: "O(h + k)", space: "O(h)",
    },
    {
      q: "Do it with **O(1) extra space** (no stack, no recursion).",
      a: "Morris traversal: temporarily link the in-order predecessor of each node back to the node (a *thread*) so that the walk can return without a stack, and remove the thread on the way back. Each edge is visited at most twice, so it is $O(n)$ time overall, with the tree restored at the end.",
      time: "O(n)", space: "O(1)",
    },
  ],

  related: [
    { id: "validate-binary-search-tree", why: "The in-order traversal of a valid BST is strictly increasing: the same fact, used for checking." },
    { id: "lowest-common-ancestor-of-a-binary-search-tree", why: "Another problem solved by following the BST ordering instead of searching blindly." },
    { id: "binary-tree-level-order-traversal", why: "A different traversal of the same tree: level by level instead of left to right." },
    { id: "top-k-frequent-elements", why: "Another \"the k-th / the top k\" problem, solved with a heap or a bucket structure." },
  ],
  patternNote: "**In-order traversal = sorted order for a BST.** Doing the traversal with an explicit stack gives a pausable iterator: dive down the left spine, pop the next smallest, move right. Anything that needs \"the first `k` in order\" can stop early and cost only $O(h + k)$.",
  takeaways: [
    "In a BST, **left, node, right** (in-order) visits the values in increasing order: the k-th visited node is the k-th smallest.",
    "Iterative version: push the left spine, pop the next smallest, `--k`, then go to its right child.",
    "Stop as soon as `k` reaches 0: $O(h + k)$ time, $O(h)$ space (not $O(n \\log n)$ for sorting).",
    "Use `--k == 0` for the 1-indexed rank; do not forget `cur = cur->right`.",
    "For repeated queries on a changing tree, store subtree sizes to answer in $O(h)$.",
  ],
});
