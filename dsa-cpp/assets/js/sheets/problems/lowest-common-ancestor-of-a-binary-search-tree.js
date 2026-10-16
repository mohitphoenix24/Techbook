SHEETS.define({
  id: "lowest-common-ancestor-of-a-binary-search-tree",
  viz: "tree",
  io: { fn: "lowestCommonAncestor", params: [["root", "tree"], ["p", "node"], ["q", "node"]], ret: "nodeval", labels: { root: "root (a BST, level order)", p: "p (value of a node in the tree)", q: "q (value of another node)" } },
  legend: [["cur", "node being examined"], ["hit", "p and q"], ["win", "path followed so far"], ["ok", "the lowest common ancestor"]],

  statement: `Given a binary search tree (BST), find the **lowest common ancestor (LCA)** node of two given nodes in the BST.

The lowest common ancestor of two nodes \`p\` and \`q\` is the **lowest** node in the tree that has both \`p\` and \`q\` as descendants (**where we allow a node to be a descendant of itself**).

*(In the lab, the tree is written in **level order**, and \`p\` and \`q\` are given by their values. The answer is the value of the LCA node. All values are unique.)*`,
  examples: [
    { input: "root = [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p = 2, q = 8", output: "6", explain: "`2` is in the left subtree of 6 and `8` is in the right subtree: 6 is the lowest node above both." },
    { input: "root = [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p = 2, q = 4", output: "2", explain: "`4` is a descendant of `2`, and a node may be its own descendant, so the LCA is `2` itself." },
    { input: "root = [2, 1], p = 2, q = 1", output: "2", explain: "The root is an ancestor of its child." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[2, 10^5]$", "$-10^9 \\le$ `Node.val` $\\le 10^9$", "All `Node.val` are **unique**", "`p != q`, and both `p` and `q` exist in the BST"],
  check(input) {
    const a = input.root, n = a.filter((x) => x !== null).length;
    if (n < 2) return "the tree needs at least two nodes";
    if (n > 11) return "for the animation use at most 11 nodes";
    const { nodes, root } = SHEETS.K.tree(a);
    const ok = (id, lo, hi) => id == null || (nodes[id].v > lo && nodes[id].v < hi && ok(nodes[id].l, lo, nodes[id].v) && ok(nodes[id].r, nodes[id].v, hi));
    if (!ok(root, -Infinity, Infinity)) return "this must be a valid BST with unique values: smaller on the left, larger on the right";
    const vals = Object.values(nodes).map((x) => x.v);
    if (!vals.includes(input.p) || !vals.includes(input.q)) return "p and q must be values that exist in the tree";
    if (input.p === input.q) return "p and q must be two different nodes";
    return null;
  },

  intuition: {
    find: "The **deepest node whose subtree contains both `p` and `q`**. For two nodes in different branches it is the point where their paths from the root split; if one is an ancestor of the other, it is that node.",
    beginner: "Find the path from the root to `p` and the path from the root to `q` (the list of nodes you pass). The LCA is the **last node the two paths have in common**.",
    works: "Both paths start at the root and follow the same nodes until the two nodes' branches separate; the last shared node is the lowest common ancestor.",
    slow: "Finding a path in a general tree means searching it, which can visit all $n$ nodes, and the two paths need $O(h)$ memory. But in a **binary search tree** we do not need to search at all: the ordering tells us which way to go at every node.",
    repeat: "We re-walk from the root to `p` and again to `q`, though they share a long beginning, and we search blindly in a structure that already tells us where each value lives.",
    remember: "In a BST, comparing a value with a node tells you exactly **which side the value is on**: smaller values are left, larger values right. So when you stand at a node and both `p` and `q` are smaller, they are both in the left subtree; when both are larger, both are in the right subtree.",
    observation: "Walk down from the root. If **both** `p` and `q` are smaller than the current node, go left. If **both** are larger, go right. Otherwise (one on each side, or one of them *is* the current node), the paths split here: **this node is the LCA**. We never leave the common part of the two paths, and each step is one comparison.",
    leads: "`cur = root`; loop: `if (p < cur && q < cur) cur = cur.left; else if (p > cur && q > cur) cur = cur.right; else return cur;`. At most one step per level: $O(h)$ time, $O(1)$ space.",
  },

  flow: [
    "Find the root-to-`p` path and the root-to-`q` path; take their last common node.",
    "Both paths share the beginning until the two nodes' branches split.",
    "A blind search can visit $O(n)$ nodes and stores two paths.",
    "In a BST a comparison says which side a value lies on.",
    "Both smaller → go left; both larger → go right; otherwise stop: the paths split here.",
    "At most one step per level: $O(h)$ time, $O(1)$ space.",
  ],

  brute: {
    idea: "**Brute force (ignores the BST order):** search the tree for `p` and record the path from the root; do the same for `q`. Walk the two paths together and return the last node that appears in both at the same position.",
    why: "Searching for a node in a general tree is a depth-first search that may visit all $n$ nodes, and the two paths are stored: $O(n)$ time and $O(h)$ space. The BST order allows going straight to the nodes, and the two paths do not need to be built at all.",
    time: "O(n)", space: "O(h)",
    measure: { fTex: "n", f: (n) => n, ns: [10, 100, 1000, 10000, 100000] },
    cpp: `class Solution {
    bool path(TreeNode* t, int target, vector<TreeNode*>& out) {
        if (!t) return false;
        out.push_back(t);
        if (t->val == target || path(t->left, target, out) || path(t->right, target, out)) return true;
        out.pop_back();
        return false;
    }
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        vector<TreeNode*> a, b;
        path(root, p->val, a);
        path(root, q->val, b);
        TreeNode* ans = nullptr;
        for (size_t i = 0; i < a.size() && i < b.size() && a[i] == b[i]; i++) ans = a[i];
        return ans;
    }
};`,
    js: `function lowestCommonAncestor(root, p, q) {
  const path = (t, target, out) => {
    if (!t) return false;
    out.push(t);
    if (t.val === target || path(t.left, target, out) || path(t.right, target, out)) return true;
    out.pop();
    return false;
  };
  const a = [], b = [];
  path(root, p.val, a);
  path(root, q.val, b);
  let ans = null;
  for (let i = 0; i < a.length && i < b.length && a[i] === b[i]; i++) ans = a[i];
  return ans;
}`,
  },

  pattern: {
    name: "Binary Search Tree (use the order to choose a side)",
    why: "The defining property of a BST (left smaller, right larger) lets every comparison discard a whole subtree, exactly like binary search discards half of an array. Questions about *where something is* are answered by walking one root-to-node path of length $h$, instead of searching the tree.",
    recognize: [
      "The tree is a **BST** and the question is about the position of values (search, insert, LCA, floor / ceiling).",
      "At each node one comparison decides whether to go left or right.",
      "Only one path from the root is ever followed, so $O(h)$ time and no recursion is needed.",
      "The answer is the **first node where two paths diverge**.",
    ],
  },

  optimal: {
    idea: "Start at the root. If both `p` and `q` are smaller than the current node, both lie in its left subtree, so move to the left child. If both are larger, move to the right child. In every other case the two nodes are on different sides of the current node (or one of them is the current node), so the current node is the lowest node that has both below it (or equal to it): it is the LCA.",
    steps: [
      "Set `cur = root`.",
      "While `cur` is not `null`: if `p.val < cur.val` **and** `q.val < cur.val`, set `cur = cur.left`.",
      "Else if `p.val > cur.val` **and** `q.val > cur.val`, set `cur = cur.right`.",
      "Otherwise return `cur`.",
    ],
    invariant: "**Both `p` and `q` are in the subtree rooted at `cur` (possibly equal to `cur`), so the LCA is `cur` or lies below it.**",
    correct: "Initially `cur` is the root, whose subtree contains every node. Suppose both nodes lie in the subtree of `cur`. If both values are smaller than `cur.val`, they lie in the left subtree (the BST rule), so the invariant holds for `cur.left`, and `cur` itself cannot be the lowest common ancestor because a node below it (`cur.left`) is also a common ancestor. The same holds for the right side. Otherwise, either one value is smaller and the other larger than `cur.val` (they are in different subtrees, so no child is a common ancestor), or one of them equals `cur.val` (the node is its own descendant, and it is an ancestor of the other node by the invariant). In both cases `cur` is a common ancestor and no child of `cur` is, so `cur` is the lowest one. The loop always terminates because `cur` goes one level deeper each time, and both nodes exist, so it stops at the latest at the shallower of the two.",
  },

  cpp: `class Solution {
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        TreeNode* cur = root;                   //@init
        while (cur) {                           //@loop
            if (p->val < cur->val && q->val < cur->val) cur = cur->left;       // both smaller: go left //@left
            else if (p->val > cur->val && q->val > cur->val) cur = cur->right; // both larger: go right //@right
            else return cur;                    // they split here (or one is cur) //@split
        }
        return nullptr;                         //@ret
    }
};`,
  js: `function lowestCommonAncestor(root, p, q) {
  let cur = root;                        //@init
  while (cur) {                          //@loop
    if (p.val < cur.val && q.val < cur.val) cur = cur.left;       // both smaller: go left //@left
    else if (p.val > cur.val && q.val > cur.val) cur = cur.right; // both larger: go right //@right
    else return cur;                     // they split here (or one is cur) //@split
  }
  return null;                           //@ret
}`,

  tests: [
    { name: "Example 1: 2 and 8 split at the root", kind: "normal", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 2, q: 8 } },
    { name: "Example 2: 4 is below 2", kind: "normal", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 2, q: 4 } },
    { name: "Example 3: a two-node tree", kind: "normal", input: { root: [2, 1], p: 2, q: 1 } },
    { name: "Two deep nodes under the same parent", kind: "normal", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 3, q: 5 } },
    { name: "One of the nodes is the root", kind: "edge", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 0, q: 6 }, why: "At the root, `q` equals `cur.val`, so `q > cur.val` is false: neither the left nor the right branch is taken, and the root is returned. This is the \"a node is its own descendant\" rule at work." },
    { name: "The two extreme leaves", kind: "edge", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 0, q: 9 }, why: "`0` is in the far left and `9` in the far right: they are on different sides of the root, so the walk stops immediately at the top." },
    { name: "Both in the right subtree", kind: "edge", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 7, q: 9 }, why: "Both are larger than 6, so the walk moves right to `8`, where `7 < 8 < 9` splits them: the answer is 8, not the root." },
    { name: "p larger than q", kind: "corner", input: { root: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 8, q: 2 }, why: "The statement does not say which of `p` and `q` is smaller. The test needs both to be smaller **or** both larger, so it works in either order: the answer is still 6." },
    { name: "A left chain", kind: "corner", input: { root: [3, 2, null, 1], p: 1, q: 3 }, why: "The tree is a straight line. The root `3` is one of the nodes, so it is returned at once, although the other node is two levels down." },
    { name: "Inner node as the ancestor in a chain", kind: "corner", input: { root: [3, 2, null, 1], p: 1, q: 2 }, why: "Both are smaller than 3, so move left to `2`; there `q` equals the node, so `2` is returned. The LCA is the shallower of the two nodes." },
    { name: "Negative values", kind: "corner", input: { root: [0, -5, 5, -7, -3, 3, 7], p: -7, q: -3 }, why: "Negative numbers compare normally: both are below 0, so go left to `-5`, where `-7 < -5 < -3` splits them." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const byVal = {}; for (const id in nodes) byVal[nodes[id].v] = id;
    const P = byVal[input.p], Q = byVal[input.q];
    const pv = input.p, qv = input.q;
    const path = [];
    let cur = root, found = null, whyLeft = false, whySplit = false, whyOne = false;
    const S = (o = {}) => () => {
      const hl = {}, sub = {};
      path.forEach((id) => (hl[id] = "win"));
      hl[P] = "hit"; hl[Q] = "hit"; sub[P] = "p"; sub[Q] = "q";
      if (found) hl[found] = "ok";
      else if (cur != null) hl[cur] = P === cur || Q === cur ? "cur" : "cur";
      return { nodes, root, hl, sub, gy: 62, label: `binary search tree   p = ${pv},  q = ${qv}`, note: o.note };
    };
    const vars = () => ({ cur: cur == null ? "null" : nodes[cur].v, p: pv, q: qv });
    T.step("init", { vars: vars(), state: S(), phase: "Walk down from the root", say: `We look for the lowest common ancestor of **p = ${pv}** and **q = ${qv}**. We start at the root; the ordering of the BST will tell us on which side each of them lies.`, op: "cur = root", act: "START" });
    while (cur != null) {
      const v = nodes[cur].v;
      T.step("loop", { vars: vars(), state: S(), say: `\`cur\` is node **${v}**. Both \`p\` and \`q\` are in its subtree (the invariant).`, op: "cur != null  →  true", act: "EXAMINE" });
      const bothSmall = pv < v && qv < v, bothBig = pv > v && qv > v;
      T.step("left", { vars: vars(), state: S(), say: bothSmall ? `**${pv}** and **${qv}** are both smaller than ${v}, so both lie in its **left** subtree. Move left.` : `Are both smaller than ${v}? ${pv < v ? `${pv} < ${v}` : `${pv} is not < ${v}`}, ${qv < v ? `${qv} < ${v}` : `${qv} is not < ${v}`}: **not both**. Check the right side next.`, op: `p < ${v} && q < ${v}  →  ${pv} < ${v} && ${qv} < ${v}  →  ${bothSmall}`, act: bothSmall ? "BOTH_SMALLER" : "NOT_BOTH_SMALLER",
        why: bothSmall && !whyLeft ? { title: "Why can we skip the right subtree?", text: "Everything in the right subtree is larger than this node, and both targets are smaller, so neither can be there. The same logic as binary search: one comparison removes a whole subtree." } : null });
      if (bothSmall) { whyLeft = true; path.push(cur); cur = nodes[cur].l; continue; }
      T.step("right", { vars: vars(), state: S(), say: bothBig ? `**${pv}** and **${qv}** are both larger than ${v}, so both lie in its **right** subtree. Move right.` : `Are both larger than ${v}? ${pv > v ? `${pv} > ${v}` : `${pv} is not > ${v}`}, ${qv > v ? `${qv} > ${v}` : `${qv} is not > ${v}`}: **not both**.`, op: `p > ${v} && q > ${v}  →  ${pv} > ${v} && ${qv} > ${v}  →  ${bothBig}`, act: bothBig ? "BOTH_LARGER" : "NOT_BOTH_LARGER" });
      if (bothBig) { path.push(cur); cur = nodes[cur].r; continue; }
      found = cur;
      const why = (pv < v && qv > v) || (pv > v && qv < v) ? `**${Math.min(pv, qv)}** is smaller and **${Math.max(pv, qv)}** is larger than ${v}: they lie in different subtrees` : `one of them equals ${v} itself (a node counts as its own descendant)`;
      T.step("split", { vars: vars(), state: S({ note: `LCA = ${v}` }), say: `Neither “both smaller” nor “both larger”: ${why}. So ${v} is a common ancestor, and no child of it can be one. **${v} is the lowest common ancestor.**`, op: `return cur  →  ${v}`, act: "FOUND",
        why: whySplit ? null : { title: "Why does the walk stop here?", text: "Below this node the two targets are separated (or one of them is this node), so no deeper node has both of them in its subtree. This is the lowest node that does." } });
      whySplit = true;
      T.result(v);
      return;
    }
    T.step("ret", { vars: { "return": "null" }, state: S(), say: "We fell off the tree: this cannot happen when both `p` and `q` exist in it.", op: "return nullptr", act: "DONE" });
    T.result(-1);
  },
  fuzz(rnd) {
    const K = SHEETS.K, n = 2 + Math.floor(rnd() * 7), vals = [];
    while (vals.length < n) { const v = Math.floor(rnd() * 20) - 5; if (!vals.includes(v)) vals.push(v); }
    const nodes = {}; let root = null;
    vals.forEach((v, i) => {
      const id = "f" + i; nodes[id] = { v, l: null, r: null };
      if (root === null) { root = id; return; }
      let c = root;
      for (;;) { if (v < nodes[c].v) { if (nodes[c].l === null) { nodes[c].l = id; break; } c = nodes[c].l; } else { if (nodes[c].r === null) { nodes[c].r = id; break; } c = nodes[c].r; } }
    });
    const i = Math.floor(rnd() * n); let j = Math.floor(rnd() * (n - 1)); if (j >= i) j++;
    return { root: K.treeArr(nodes, root), p: vals[i], q: vals[j] };
  },
  gen(n) {
    const nodes = {}; let c = 0;
    const build = (lo, hi) => { if (lo > hi) return null; const mid = (lo + hi) >> 1, id = "g" + c++; nodes[id] = { v: mid, l: null, r: null }; nodes[id].l = build(lo, mid - 1); nodes[id].r = build(mid + 1, hi); return id; };
    const root = build(1, n);
    return { root: SHEETS.K.treeArr(nodes, root), p: 1, q: 2 };
  },

  complexity: {
    time: {
      tex: "O(h)", title: "one comparison per level, never more than the height", short: "h = height of the tree",
      derive: [
        "\\text{each iteration moves } cur \\text{ one level down} || left or right child, never back up",
        "\\#\\text{iterations} \\le \\text{depth of the LCA} + 1 \\le h + 1 || the walk stops at the LCA at the latest",
        "T(h) \\le (h + 1)\\,(c_{\\text{cmp}}) = O(h) || two to four comparisons per level",
        "!T = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ for a chain} || versus $O(n)$ for the path-based method",
      ],
      where: "Here $h$ is the height. For a balanced BST of $n$ nodes $h \\approx \\log_2 n$, which is why a million nodes need only about twenty steps. The measured table uses a perfectly balanced BST, with `p` and `q` low down, and grows like $\\log_2 n$.",
    },
    space: {
      tex: "O(1)", title: "one pointer", short: "`cur` only",
      derive: [
        "S = |cur| = c || the iterative walk keeps no stack and stores no path",
        "!S = O(1) || a recursive version would use $O(h)$ stack frames",
      ],
      where: "The brute force stores two root-to-node paths ($O(h)$). The iterative walk needs just the pointer `cur`.",
    },
    limit: "The answer lies at depth up to $h$, and each node on the way must be examined to know where the paths split, so $\\Omega(\\text{depth of the LCA})$ comparisons are needed; $O(h)$ is optimal for a plain BST.",
    measure: { label: "n = number of nodes (balanced BST)", fTex: "\\log_2 n", f: (n) => Math.log2(n), sizes: [15, 63, 255, 1023, 4095, 16383], growth: "logarithmic", reading: "Making the tree **4× larger** adds only **two** more levels, so the number of steps grows by a fixed amount: logarithmic growth." },
  },

  mistakes: [
    { title: "Using the general-tree method on a BST", what: "Searching both subtrees recursively for `p` and `q`.", why: "It works for any binary tree.", breaks: "It is correct but visits up to $O(n)$ nodes, and ignores the BST property the problem was built around.", avoid: "Compare the values with the current node and go to one side only." },
    { title: "Going down when only one of them is on that side", what: "`if (p < cur || q < cur) cur = cur->left;`", why: "\"One of them is smaller, so go left\".", breaks: "When the two nodes are on different sides, the walk leaves the LCA and ends up at a node that does not contain both.", avoid: "Go left only when **both** are smaller; go right only when **both** are larger; otherwise stop." },
    { title: "Assuming `p < q`", what: "`if (q < cur->val) left; else if (p > cur->val) right;`", why: "The examples give the smaller node first.", breaks: "With `p = 8` and `q = 2` the conditions are never met and the walk goes the wrong way.", avoid: "Test both nodes against the current value, in both directions." },
    { title: "Forgetting that a node can be its own ancestor", what: "Requiring `p` and `q` to be strictly on different sides.", why: "\"Common ancestor\" sounds like a *proper* ancestor.", breaks: "When `q` is an ancestor of `p`, the answer should be `q`, not its parent.", avoid: "Stop at the first node that is not \"both smaller\" or \"both larger\" (this includes the case `val == p` or `val == q`)." },
    { title: "Comparing node pointers instead of values", what: "`p < cur` with pointers.", why: "`p` and `cur` are both `TreeNode*`.", breaks: "Pointer order has nothing to do with the stored values: a meaningless comparison.", avoid: "Compare `p->val` with `cur->val`." },
  ],

  followUps: [
    {
      q: "Solve it **recursively**.",
      a: "The same three cases as a function: if both values are smaller than `root.val`, return `lca(root.left, …)`; if both are larger, return `lca(root.right, …)`; otherwise return `root`. It uses $O(h)$ stack frames instead of the single pointer.",
      cpp: `TreeNode* lcaRec(TreeNode* root, TreeNode* p, TreeNode* q) {
    if (p->val < root->val && q->val < root->val) return lcaRec(root->left, p, q);
    if (p->val > root->val && q->val > root->val) return lcaRec(root->right, p, q);
    return root;
}`,
      js: `function lcaRec(root, p, q) {
  if (p.val < root.val && q.val < root.val) return lcaRec(root.left, p, q);
  if (p.val > root.val && q.val > root.val) return lcaRec(root.right, p, q);
  return root;
}`,
      time: "O(h)", space: "O(h)",
    },
    {
      q: "The tree is a **general binary tree** (not a BST). How do you find the LCA?",
      a: "There is no ordering to guide you, so search: `lca(node)` returns `node` if it is `p` or `q`; otherwise it asks both children. If **both** children return something, `node` is the LCA; if only one does, pass that result up. It is $O(n)$ time and $O(h)$ stack, and it is the standard solution for the general problem (a later classic).",
      cpp: `TreeNode* lcaGeneral(TreeNode* root, TreeNode* p, TreeNode* q) {
    if (!root || root == p || root == q) return root;
    TreeNode* l = lcaGeneral(root->left, p, q);
    TreeNode* r = lcaGeneral(root->right, p, q);
    return l && r ? root : (l ? l : r);
}`,
      js: `function lcaGeneral(root, p, q) {
  if (!root || root === p || root === q) return root;
  const l = lcaGeneral(root.left, p, q), r = lcaGeneral(root.right, p, q);
  return l && r ? root : (l || r);
}`,
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Answer **many** LCA queries on the same tree quickly.",
      a: "Preprocess with a table of ancestors at distances $1, 2, 4, 8, \\dots$ (**binary lifting**), or an Euler tour with a range-minimum structure. Each query then takes $O(\\log n)$ (or $O(1)$) instead of walking the tree each time.",
      time: "O(log n) per query after O(n log n) preprocessing", space: "O(n log n)",
    },
    {
      q: "Find the **distance** between two nodes of a BST.",
      a: "Compute the LCA, then add the depth of `p` below it and the depth of `q` below it (each found by a BST walk). Total $O(h)$.",
      time: "O(h)", space: "O(1)",
    },
  ],

  related: [
    { id: "validate-binary-search-tree", why: "Uses the same BST ordering, carried down as a range instead of used as a direction." },
    { id: "kth-smallest-element-in-a-bst", why: "The other classic use of the BST order: in-order traversal is sorted." },
    { id: "binary-search", why: "The same idea on an array: one comparison discards half of what remains." },
    { id: "maximum-depth-of-binary-tree", why: "The height $h$ in the running time is exactly what that problem computes." },
  ],
  patternNote: "**Let the order choose the path.** In a BST every comparison tells you which side holds the target, so a root-to-node walk of length $h$ replaces a search of the whole tree. For \"where do two paths split?\" questions, stop at the first node where the targets are no longer on the same side.",
  takeaways: [
    "In a BST the **first node where `p` and `q` are not both smaller or both larger** is their lowest common ancestor.",
    "Both smaller → go left; both larger → go right; otherwise return the current node (this includes the case where it equals one of them).",
    "Do not assume `p < q`; compare **values**, not pointers.",
    "A node is its own ancestor, so the answer can be `p` or `q` itself.",
    "Time $O(h)$ (about $\\log n$ if balanced), space $O(1)$ iteratively; a general tree needs the $O(n)$ search.",
  ],
});
