SHEETS.define({
  id: "validate-binary-search-tree",
  viz: "tree",
  io: { fn: "isValidBST", params: [["root", "tree"]], ret: "bool", labels: { root: "root (tree in level order)" } },
  legend: [["cur", "node being checked"], ["win", "on the call path"], ["ok", "node and subtree are valid"], ["bad", "outside its allowed range"]],

  statement: `Given the \`root\` of a binary tree, determine if it is a **valid binary search tree (BST)**.

A **valid BST** is defined as follows:
- The left subtree of a node contains only nodes with keys **strictly less than** the node's key.
- The right subtree of a node contains only nodes with keys **strictly greater than** the node's key.
- Both the left and right subtrees must also be binary search trees.

*(In the lab, a tree is written in **level order**, row by row from left to right, with \`null\` for a missing child.)*`,
  examples: [
    { input: "root = [2, 1, 3]", output: "true", explain: "`1 < 2 < 3`: the left child is smaller and the right child is larger." },
    { input: "root = [5, 1, 4, null, null, 3, 6]", output: "false", explain: "The right child `4` is smaller than the root `5`, which already breaks the rule." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[1, 10^4]$", "$-2^{31} \\le$ `Node.val` $\\le 2^{31} - 1$"],
  check(input) { return input.root.filter((x) => x !== null).length > 11 ? "for the animation use at most 11 nodes" : null; },

  intuition: {
    find: "Whether **every** node satisfies *everything above it*: it must be larger than all the nodes to its left and smaller than all the nodes to its right, **all the way up**, not only compared with its parent.",
    beginner: "For each node, scan its whole left subtree to check that every value is smaller, and its whole right subtree to check that every value is larger. Do this for every node of the tree.",
    works: "This is a literal reading of the definition: each node is compared with every node it should dominate, so any violation is found.",
    slow: "Each node triggers a scan of its entire subtree. For a tree that is a chain of $n$ nodes that is $n + (n-1) + \\dots = O(n^2)$ comparisons, and $O(n \\cdot h)$ in general.",
    repeat: "The scan for a node walks through nodes that the scan for its child will walk through again. The same values are compared with several ancestors, one ancestor at a time.",
    remember: "A node deep in the tree must obey **all of its ancestors at once**. Going down, every step adds one constraint: going left means *\"everything below is smaller than this ancestor\"*, going right means *\"larger\"*. So each node only needs to carry one **allowed range** `(low, high)` with it.",
    observation: "Pass an interval down the recursion. The root may take any value: `(−∞, +∞)`. For a node with value `v` allowed in `(lo, hi)`: its left subtree must stay in `(lo, v)` and its right subtree in `(v, hi)`. A node is valid if `lo < v < hi` and both subtrees are valid with their narrower ranges. Each node is checked once, against one interval, but that interval already contains the constraints of all its ancestors.",
    leads: "`check(node, lo, hi)`: if the node is `null`, return `true`; if `v <= lo` or `v >= hi`, return `false`; return `check(left, lo, v) && check(right, v, hi)`. Start with `(−∞, +∞)` (use a type wider than `int`, because a node may hold `INT_MIN`).",
  },

  flow: [
    "For every node, scan its whole left and right subtrees against its value.",
    "Each node is compared with everything it should dominate.",
    "$O(n \\cdot h)$ up to $O(n^2)$: subtrees are re-scanned for every ancestor.",
    "A node must obey **all** its ancestors; each step down adds one bound.",
    "Carry an allowed interval `(lo, hi)`: left child gets `(lo, v)`, right child `(v, hi)`.",
    "One check per node: $O(n)$ time, $O(h)$ stack space.",
  ],

  brute: {
    idea: "**Brute force:** for every node `x`, check that **all** values in its left subtree are less than `x.val` and **all** values in its right subtree are greater, using a helper that scans the whole subtree. Then recurse into both children and repeat.",
    why: "The helper scans a whole subtree for every node, so each node is compared once per ancestor: $O(n \\cdot h)$, which is $O(n^2)$ for a chain of $n$ nodes. The interval method keeps the information of all the ancestors in two numbers and checks each node once.",
    time: "O(n · h)", space: "O(h)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 10000] },
    cpp: `class Solution {
    bool allLess(TreeNode* t, long long v) {
        return !t || (t->val < v && allLess(t->left, v) && allLess(t->right, v));
    }
    bool allGreater(TreeNode* t, long long v) {
        return !t || (t->val > v && allGreater(t->left, v) && allGreater(t->right, v));
    }
public:
    bool isValidBST(TreeNode* root) {
        if (!root) return true;
        return allLess(root->left, root->val) && allGreater(root->right, root->val)
            && isValidBST(root->left) && isValidBST(root->right);
    }
};`,
    js: `function isValidBST(root) {
  const allLess = (t, v) => !t || (t.val < v && allLess(t.left, v) && allLess(t.right, v));
  const allGreater = (t, v) => !t || (t.val > v && allGreater(t.left, v) && allGreater(t.right, v));
  if (!root) return true;
  return allLess(root.left, root.val) && allGreater(root.right, root.val)
      && isValidBST(root.left) && isValidBST(root.right);
}`,
  },

  pattern: {
    name: "Tree Recursion (carry constraints down)",
    why: "Some tree properties cannot be decided from a node's children alone because they depend on **ancestors**. Passing the accumulated constraint (here an interval) down the recursion turns every node's check into a local one.",
    recognize: [
      "A node's validity depends on **everything above it**, not only its parent.",
      "The rule narrows as you go down (an interval, a maximum so far, a path sum remaining).",
      "A check that scans a whole subtree at every node would re-do work.",
      "Searching in a BST uses the same idea: each comparison tells you which side the answer lies on.",
    ],
  },

  optimal: {
    idea: "Walk the tree with a function `check(node, lo, hi)` meaning *\"every value in this subtree must lie strictly between `lo` and `hi`\"*. The root starts with the widest interval. A node whose value is outside `(lo, hi)` makes the tree invalid. Otherwise its left subtree gets the interval `(lo, node.val)` and its right subtree gets `(node.val, hi)`.",
    steps: [
      "Call `check(root, −∞, +∞)` (with bounds of a type wider than the node values).",
      "If `node` is `null`, return `true`: an empty tree is a valid BST.",
      "If `node.val ≤ lo` or `node.val ≥ hi`, return `false`.",
      "Return `check(node.left, lo, node.val) && check(node.right, node.val, hi)`.",
    ],
    invariant: "**`check(node, lo, hi)` returns `true` if and only if every node of the subtree at `node` has a value in `(lo, hi)` and the subtree is a binary search tree.**",
    correct: "A binary tree is a BST exactly when for every node `x`, all values in its left subtree are `< x` and all in its right subtree are `> x`. Unrolling this for a node $y$ deep in the tree, $y$ must be smaller than every ancestor of which it lies in the left subtree, and larger than every ancestor of which it lies in the right subtree. The tightest of those constraints is `lo` = the nearest ancestor that $y$ is to the right of (or $-\\infty$) and `hi` = the nearest ancestor that $y$ is to the left of (or $+\\infty$), and the recursion maintains exactly these: going left replaces `hi` by the node's value (it is the nearest such ancestor now) and going right replaces `lo`. So $y$ is accepted iff it satisfies all its ancestors' constraints, and a tree is accepted iff all of its nodes are. The check is strict (`<`, `>`), so duplicates are rejected, as the definition requires.",
  },

  cpp: `class Solution {
    bool check(TreeNode* node, long long lo, long long hi) {
        if (!node) return true;                 // an empty tree is a valid BST //@base
        if (node->val <= lo || node->val >= hi) return false;   // outside the allowed range //@range
        return check(node->left, lo, node->val) && check(node->right, node->val, hi);   // narrow the range //@recurse
    }
public:
    bool isValidBST(TreeNode* root) {
        return check(root, LLONG_MIN, LLONG_MAX);   // the root may be anything //@start
    }
};`,
  js: `function isValidBST(root) {
  function check(node, lo, hi) {
    if (!node) return true;              // an empty tree is a valid BST //@base
    if (node.val <= lo || node.val >= hi) return false;   // outside the allowed range //@range
    return check(node.left, lo, node.val) && check(node.right, node.val, hi);   // narrow the range //@recurse
  }
  return check(root, -Infinity, Infinity);   // the root may be anything //@start
}`,

  tests: [
    { name: "Example 1: [2, 1, 3]", kind: "normal", input: { root: [2, 1, 3] } },
    { name: "Example 2: [5, 1, 4, null, null, 3, 6]", kind: "normal", input: { root: [5, 1, 4, null, null, 3, 6] } },
    { name: "A larger valid BST", kind: "normal", input: { root: [5, 3, 8, 1, 4, 7, 9] } },
    { name: "A single node", kind: "edge", input: { root: [1] }, why: "One node is always a valid BST: its value lies in `(−∞, +∞)` and both children are empty." },
    { name: "Duplicate values", kind: "edge", input: { root: [1, 1] }, why: "The definition is *strictly* less / greater. The left child `1` must be in `(−∞, 1)`, but `1 >= 1` is outside it, so the answer is `false`. Using `<` instead of `<=` in the range check would wrongly accept it." },
    { name: "Three equal values", kind: "edge", input: { root: [2, 2, 2] }, why: "Both children violate the strict rule. The first violation (the left child) already ends the walk with `false`." },
    { name: "A node equal to the minimum integer", kind: "edge", input: { root: [-2147483648] }, why: "The root may hold `INT_MIN`. If the initial lower bound were an `int` equal to `INT_MIN`, the test `val <= lo` would reject a perfectly valid tree. That is why the bounds use a wider type (`long long`, or `-Infinity` in JavaScript)." },
    { name: "A violation by a grandparent, not the parent", kind: "corner", input: { root: [10, 5, 15, null, null, 6, 20] }, why: "Every node is correct relative to its **parent** (`6 < 15`, `20 > 15`), but `6` lies in the right subtree of `10`, so it must be greater than 10. The range `(10, 15)` carried down catches it. A parent-only check would answer `true`." },
    { name: "A valid zig-zag", kind: "corner", input: { root: [5, 3, null, null, 4] }, why: "`4` is the right child of `3` and lies in the left subtree of `5`: its range is `(3, 5)`, and `4` fits. Going left then right narrows both bounds, one from each ancestor." },
    { name: "An invalid zig-zag", kind: "corner", input: { root: [5, 3, null, null, 6] }, why: "`6` is larger than its parent `3`, so the local check passes, but it sits in the left subtree of `5`, so it must be less than 5: range `(3, 5)` rejects it." },
    { name: "Extreme values on both sides", kind: "corner", input: { root: [0, -2147483648, 2147483647] }, why: "Both extremes are valid here (`INT_MIN` on the left, `INT_MAX` on the right of `0`). With `long long` bounds nothing overflows or clashes with the sentinel." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const cs = K.callStack();
    const path = [], done = {}, range = {}, bad = {};
    let whyRange = false, whyNarrow = false, whyStrict = false, whyBase = false;
    const inf = (x) => (x === -Infinity ? "−∞" : x === Infinity ? "+∞" : String(x));
    const S = (cur) => () => {
      const hl = {}, sub = {};
      path.forEach((id) => (hl[id] = "win"));
      for (const id in done) hl[id] = "ok";
      for (const id in bad) hl[id] = "bad";
      for (const id in range) sub[id] = `(${inf(range[id][0])}, ${inf(range[id][1])})`;
      if (cur != null && !bad[cur]) hl[cur] = "cur";
      return { nodes, root, hl, sub, calls: cs.snapshot(), label: "binary tree  (under each node: the range it must lie in)", gy: 66 };
    };
    function check(id, lo, hi) {
      const f = cs.push("check", id == null ? "null" : `node=${nodes[id].v}, lo=${inf(lo)}, hi=${inf(hi)}`, "", "");
      T.step("base", { vars: { node: id == null ? "null" : nodes[id].v, lo: inf(lo), hi: inf(hi) }, state: S(id), say: id == null ? "A call for a **`null` child**: an empty tree has no value that could be wrong, so it is a valid BST. Return `true`." : `A call for node **${nodes[id].v}** with the allowed range **(${inf(lo)}, ${inf(hi)})**. Is it \`null\`? No.`, op: `node == nullptr  →  ${id == null}`, act: id == null ? "EMPTY_IS_VALID" : "CALL",
        why: id == null && !whyBase ? { title: "Why is the empty tree valid?", text: "There is nothing in it that could break the rule. It is also what lets a leaf return `true && true`." } : null });
      if (id == null) { whyBase = true; f.ret = true; cs.pop(); return true; }
      const v = nodes[id].v;
      range[id] = [lo, hi];
      const out = v <= lo || v >= hi;
      if (out) bad[id] = true;
      T.step("range", { vars: { val: v, lo: inf(lo), hi: inf(hi) }, state: S(id), say: out ? `**${v}** must satisfy ${inf(lo)} < ${v} < ${inf(hi)}, but ${v <= lo ? `${v} ≤ ${inf(lo)}` : `${v} ≥ ${inf(hi)}`}. The value is **outside** its allowed range: not a BST. Return \`false\`.` : `**${v}** must satisfy ${inf(lo)} < ${v} < ${inf(hi)}: it does. The node is acceptable.`, op: `val <= lo || val >= hi  →  ${v} <= ${inf(lo)} || ${v} >= ${inf(hi)}  →  ${out}`, act: out ? "OUT_OF_RANGE" : "IN_RANGE",
        why: out && !whyStrict && (v === lo || v === hi) ? { title: "Why strict inequalities?", text: "A BST here has no duplicates: the left subtree is strictly smaller and the right strictly larger. A value equal to a bound is already a violation." } : !whyRange ? { title: "Why a range and not just the parent?", text: "A node must obey all its ancestors. The two bounds carry exactly those constraints: `lo` is the nearest ancestor we went right of, `hi` the nearest ancestor we went left of. Nothing else can matter." } : null });
      whyRange = true; if (out && (v === lo || v === hi)) whyStrict = true;
      if (out) { f.ret = false; cs.pop(); return false; }
      path.push(id);
      T.step("recurse", { vars: { val: v }, state: S(id), say: `The left subtree of ${v} must lie in (${inf(lo)}, **${v}**) (smaller than ${v}); the right subtree in (**${v}**, ${inf(hi)}) (larger than ${v}). Check the **left** subtree first.`, op: `check(left, ${inf(lo)}, ${v}) && check(right, ${v}, ${inf(hi)})`, act: "GO_LEFT",
        why: whyNarrow ? null : { title: "How does the range narrow?", text: "Going **left** from a node makes that node the new upper bound (everything there must be smaller). Going **right** makes it the new lower bound. The other bound is inherited, so the ancestors' constraints are never forgotten." } });
      whyNarrow = true;
      const l = check(nodes[id].l, lo, v);
      let res = l;
      if (l) {
        T.step("recurse", { vars: { val: v, left: true }, state: S(id), say: `The left subtree is valid. Now check the **right** subtree of ${v} in the range (${v}, ${inf(hi)}).`, op: `true && check(right, ${v}, ${inf(hi)})`, act: "GO_RIGHT" });
        res = check(nodes[id].r, v, hi);
      } else {
        T.step("recurse", { vars: { val: v, left: false }, state: S(id), say: "The left subtree is **not** a valid BST, so `false && …` is `false`: the right subtree is not checked.", op: "false && …  →  false", act: "SHORT_CIRCUIT" });
      }
      path.pop();
      if (res) done[id] = true;
      f.ret = res; cs.pop();
      return res;
    }
    T.step("start", { vars: { root: root == null ? "null" : nodes[root].v }, state: S(null), phase: "Check each node against its allowed range", say: "The root may hold any value, so the first call uses the widest range, **(−∞, +∞)**. In C++ the bounds must be a type wider than `int`, since a node may hold `INT_MIN`.", op: "check(root, -∞, +∞)", act: "START" });
    const ans = check(root, -Infinity, Infinity);
    T.step("start", { vars: { "return": ans }, state: S(null), say: ans ? "Every node was inside its range: the tree **is** a valid BST." : "A node broke its range: the tree is **not** a valid BST.", op: `return ${ans}`, act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) { return { root: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 9), 0, 6) }; },
  gen(n) {
    const nodes = {}; let c = 0;
    const build = (lo, hi) => { if (lo > hi) return null; const mid = (lo + hi) >> 1, id = "g" + c++; nodes[id] = { v: mid, l: null, r: null }; nodes[id].l = build(lo, mid - 1); nodes[id].r = build(mid + 1, hi); return id; };
    const root = build(1, n);
    return { root: SHEETS.K.treeArr(nodes, root) };
  },

  complexity: {
    time: {
      tex: "O(n)", title: "each node is checked once, against one interval", short: "2n + 1 calls, each a constant amount of work",
      derive: [
        "\\#\\text{calls} \\le n + (n + 1) = 2n + 1 || every node, plus one call per empty child",
        "T(n) = (2n + 1)\\, c || each call does two comparisons and passes two numbers",
        "\\text{the walk may stop early at the first violation} || `&&` skips the rest",
        "!T(n) = O(n) || versus $O(n \\cdot h)$ for scanning a subtree at every node",
      ],
      where: "For a valid BST every node is visited, which is the worst case; an invalid tree can end earlier. The measured table uses a perfectly balanced valid BST.",
    },
    space: {
      tex: "O(h)", title: "the call stack", short: "h = height of the tree",
      derive: [
        "\\text{stack depth} \\le h + 1 || one frame per ancestor of the current node",
        "S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ for a chain} || two numbers per frame",
        "!S = O(h) || no table, no copy of the tree",
      ],
      where: "Each frame holds the node and the two bounds. The in-order approach (follow-up) needs only one extra number but the same stack.",
    },
    limit: "Every node must be examined, so $\\Omega(n)$ time is needed for a valid tree: the interval walk is optimal.",
    measure: { label: "n = number of nodes (balanced valid BST)", fTex: "n", f: (n) => n, sizes: [7, 15, 31, 63, 127, 255], growth: "linear" },
  },

  mistakes: [
    { title: "Comparing a node only with its parent", what: "`node->left->val < node->val && node->right->val > node->val` at every node.", why: "It looks like the definition (\"left is smaller, right is larger\").", breaks: "`[10, 5, 15, null, null, 6, 20]` passes locally (6 < 15), but 6 is in the right subtree of 10, so the tree is invalid.", avoid: "Carry the full allowed range `(lo, hi)` down." },
    { title: "Using non-strict comparisons", what: "Rejecting only when `val < lo` or `val > hi`.", why: "Many BST definitions allow duplicates on one side.", breaks: "`[1, 1]` and `[2, 2, 2]` are accepted, but this problem forbids equal values.", avoid: "Reject when `val <= lo` or `val >= hi`." },
    { title: "Using `int` bounds", what: "`check(root, INT_MIN, INT_MAX)`.", why: "The values are `int`, so `int` bounds seem natural.", breaks: "A tree whose root is `INT_MIN` fails the test `val <= lo`, although it is valid.", avoid: "Use `long long` (or `null` bounds / `-Infinity` and `Infinity`)." },
    { title: "Using `||` between the two subtree checks", what: "`return check(left, ...) || check(right, ...);`", why: "Mixing up \"either\" and \"both\".", breaks: "A tree is accepted if only one of its subtrees is valid.", avoid: "Both subtrees must be valid: `&&`." },
    { title: "Mixing up which bound a child inherits", what: "`check(left, node->val, hi)` (swapped bounds).", why: "The two calls look symmetrical.", breaks: "Every left subtree is judged against the wrong interval, so valid trees are rejected and invalid trees accepted.", avoid: "Left: `(lo, node.val)`. Right: `(node.val, hi)`." },
  ],

  followUps: [
    {
      q: "Check the BST property with an **in-order traversal**.",
      a: "The in-order traversal of a BST is **strictly increasing**. Walk the tree in-order (left, node, right), remembering the previously visited value, and fail the moment a value is not larger than the previous one. This needs no bounds, only one extra variable (`prev`), and shows the link between BSTs and sorted order.",
      cpp: `bool validInorder(TreeNode* root) {
    long long prev = LLONG_MIN;
    function<bool(TreeNode*)> go = [&](TreeNode* t) {
        if (!t) return true;
        if (!go(t->left)) return false;
        if (t->val <= prev) return false;
        prev = t->val;
        return go(t->right);
    };
    return go(root);
}`,
      js: `function validInorder(root) {
  let prev = -Infinity;
  const go = (t) => {
    if (!t) return true;
    if (!go(t.left)) return false;
    if (t.val <= prev) return false;
    prev = t.val;
    return go(t.right);
  };
  return go(root);
}`,
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Do it **iteratively** with an explicit stack.",
      a: "Use the in-order walk with a stack: push the left spine, pop a node, compare it with `prev`, then move to its right child. It avoids deep recursion and is $O(n)$ time and $O(h)$ space.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Find the **K-th smallest** element in a BST (the next problem on the sheet).",
      a: "The in-order walk visits values in increasing order, so the K-th node it visits is the answer; you can stop after K nodes.",
      time: "O(h + k)", space: "O(h)",
    },
    {
      q: "Recover a BST in which **two nodes were swapped** by mistake.",
      a: "Do an in-order traversal and find the places where the order breaks (a value smaller than its predecessor): there are one or two such descents, and the two offending nodes are the first larger and the last smaller node involved. Swap their values. Morris traversal makes it $O(1)$ extra space.",
      time: "O(n)", space: "O(h)",
    },
  ],

  related: [
    { id: "kth-smallest-element-in-a-bst", why: "Uses the fact that the in-order traversal of a BST is sorted." },
    { id: "lowest-common-ancestor-of-a-binary-search-tree", why: "Uses the BST ordering to decide, at each node, whether to go left or right." },
    { id: "same-tree", why: "The simplest recursion that compares nodes pairwise; here the comparison is with a range instead." },
    { id: "binary-tree-maximum-path-sum", why: "Another problem where information must flow through the recursion, here upwards." },
  ],
  patternNote: "**Carry the constraint down.** When a node's validity depends on its ancestors, pass the accumulated constraint (an interval) as parameters of the recursion. The check at each node becomes local, and every node is visited once. The same trick handles \"path sum remaining\", \"maximum so far\" and \"depth so far\".",
  takeaways: [
    "A BST needs **every** node to respect **all** its ancestors, not only its parent: carry `(lo, hi)` down.",
    "Left child: `(lo, node.val)`; right child: `(node.val, hi)`. Reject when `val <= lo` or `val >= hi` (strict).",
    "Use bounds wider than `int` (`long long`, or `±Infinity`) so that `INT_MIN` and `INT_MAX` are valid values.",
    "Both subtrees must be valid: `&&`; an empty tree is valid.",
    "Time $O(n)$, space $O(h)$; an in-order walk checking `prev < val` is an equivalent alternative.",
  ],
});
