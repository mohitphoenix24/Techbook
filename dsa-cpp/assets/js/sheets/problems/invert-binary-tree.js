SHEETS.define({
  id: "invert-binary-tree",
  viz: "tree",
  io: { fn: "invertTree", params: [["root", "tree"]], ret: "tree", labels: { root: "root (tree in level order)" } },
  legend: [["cur", "node being processed"], ["win", "on the call path"], ["ok", "subtree already inverted"], ["dim", "not visited yet"]],

  statement: `Given the \`root\` of a binary tree, **invert the tree**, and return its root.

Inverting means mirroring it: for every node, its left and right children trade places.

*(In the lab, a tree is written in **level order**: row by row from left to right, with \`null\` for a missing child. The answer is printed in the same format.)*`,
  examples: [
    { input: "root = [4, 2, 7, 1, 3, 6, 9]", output: "[4, 7, 2, 9, 6, 3, 1]", explain: "Every node's two subtrees are swapped, all the way down, so the picture is mirrored left to right." },
    { input: "root = [2, 1, 3]", output: "[2, 3, 1]", explain: "The root's children 1 and 3 trade places." },
    { input: "root = []", output: "[]", explain: "An empty tree stays empty." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[0, 100]$", "$-100 \\le$ `Node.val` $\\le 100$"],
  check(input) { return input.root.filter((x) => x !== null).length > 12 ? "for the animation use at most 12 nodes" : null; },

  intuition: {
    find: "A **mirror image** of the tree: at every node the left and right subtrees exchange places, and so do the subtrees inside them.",
    beginner: "Build a brand-new tree: for every node of the original, create a copy whose left child is the (mirrored) copy of the original's right child, and vice versa.",
    works: "The copy is the mirror image by construction, and the original is left untouched, which is sometimes exactly what you want.",
    slow: "It is $O(n)$ in time, but it allocates $n$ new nodes, so it needs $O(n)$ **extra memory**, and the question says to *invert the tree*, which suggests changing it where it stands.",
    repeat: "Nothing is computed twice, but every node is copied when it could simply be **re-linked**: all we ever change is which child sits on which side.",
    remember: "Inverting a tree means swapping the two children of **every** node. Whatever hangs under a child moves with it, so the subtrees must be inverted too. A tree is a root with two smaller trees, so the same operation applies to each of them.",
    observation: "To invert a tree: invert the left subtree, invert the right subtree, then **swap the two pointers** at the root. An empty tree is already inverted. The work happens as the calls return, so each node is touched once.",
    leads: "`if (!root) return nullptr;` then `left = invertTree(root->left); right = invertTree(root->right); root->left = right; root->right = left; return root;`. No new nodes, $O(n)$ time, $O(h)$ stack space.",
  },

  flow: [
    "Build a new tree whose left child is the mirror of the old right child, and vice versa.",
    "The copy is a mirror image by construction.",
    "$O(n)$ time but $n$ new nodes of $O(n)$ extra memory.",
    "Inverting = swapping the children at every node.",
    "Invert both subtrees first, then swap the two pointers at this node.",
    "In place: $O(n)$ time, $O(h)$ stack, no new nodes.",
  ],

  brute: {
    idea: "**Brute force:** make a **mirrored copy**: for each node create a new node with the same value, whose left child is the mirrored copy of the original *right* child and whose right child is the mirrored copy of the original *left* child. Return the root of the copy.",
    why: "It is $O(n)$ in time but allocates $n$ new nodes: $O(n)$ extra memory, plus the cost of freeing the old tree in C++. The in-place version re-links the pointers that already exist.",
    time: "O(n)", space: "O(n)",
    cpp: `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* copy = new TreeNode(root->val);
        copy->left = invertTree(root->right);
        copy->right = invertTree(root->left);
        return copy;
    }
};`,
    js: `function invertTree(root) {
  if (!root) return null;
  const copy = new TreeNode(root.val);
  copy.left = invertTree(root.right);
  copy.right = invertTree(root.left);
  return copy;
}`,
  },

  pattern: {
    name: "Tree Recursion (transform in place)",
    why: "Many tree problems are a *one-step change at the root* plus the same change in each subtree. The recursion handles the walk; the code you write is only the one step (here: swap two pointers) and the base case for the empty tree.",
    recognize: [
      "Something must be done to **every node** (swap, copy, relabel, count).",
      "The change at a node does not depend on anything outside its own subtree.",
      "An empty subtree needs no work (the base case).",
      "The result can be assembled as the calls return (post-order) or as they go down (pre-order).",
    ],
  },

  optimal: {
    idea: "A recursive function returns the root of the inverted subtree. For an empty tree return `null`. Otherwise invert the left subtree and the right subtree (recursively), then make the inverted right subtree the new left child and the inverted left subtree the new right child. Return the same root.",
    steps: [
      "If `root` is `null`, return `null`.",
      "Recursively invert the left subtree and keep the result in `left`.",
      "Recursively invert the right subtree and keep the result in `right`.",
      "Swap: `root.left = right` and `root.right = left`.",
      "Return `root`.",
    ],
    invariant: "**`invertTree(node)` returns the root of the mirror image of the subtree rooted at `node`, built from the same nodes, and when it returns every node below `node` has had its children swapped exactly once.**",
    correct: "By induction on the size of the subtree. The empty tree is its own mirror image. For a node with subtrees $L$ and $R$, the mirror image has the (mirrored $R$) on the left and the (mirrored $L$) on the right, with the same root value. The recursive calls return mirrored $L$ and mirrored $R$ by the induction hypothesis (they are smaller trees), and the swap places them on the correct sides. The two results are saved in local variables before the swap, so the assignment does not lose either subtree. Each node is swapped exactly once, when its own call finishes.",
  },

  cpp: `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;              // an empty tree is already inverted //@base
        TreeNode* left = invertTree(root->left);   // mirror the left subtree //@goLeft
        TreeNode* right = invertTree(root->right); // mirror the right subtree //@goRight
        root->left = right; root->right = left; // swap the two sides //@swap
        return root;                            //@ret
    }
};`,
  js: `function invertTree(root) {
  if (!root) return null;                // an empty tree is already inverted //@base
  const left = invertTree(root.left);    // mirror the left subtree //@goLeft
  const right = invertTree(root.right);  // mirror the right subtree //@goRight
  root.left = right; root.right = left;  // swap the two sides //@swap
  return root;                           //@ret
}`,

  tests: [
    { name: "Example 1: a perfect tree of 7 nodes", kind: "normal", input: { root: [4, 2, 7, 1, 3, 6, 9] } },
    { name: "Example 2: three nodes", kind: "normal", input: { root: [2, 1, 3] } },
    { name: "Example 3: empty tree", kind: "normal", input: { root: [] } },
    { name: "A single node", kind: "edge", input: { root: [1] }, why: "Both children are `null`; the swap exchanges two `null`s, which changes nothing. The base case returns `null` twice and the node comes back unchanged." },
    { name: "Only a left child", kind: "edge", input: { root: [1, 2] }, why: "After the swap the child sits on the **right**: `[1, null, 2]`. The swap must work when one side is `null`; that is why both subtrees are saved in variables before the assignments." },
    { name: "Only a right child", kind: "edge", input: { root: [1, null, 2] }, why: "The mirror of the previous case: the right child moves to the left, giving `[1, 2]`." },
    { name: "A left chain", kind: "edge", input: { root: [1, 2, null, 3] }, why: "A degenerate tree (each node has one child). Every node's single child changes side, so the whole chain leans the other way: `[1, null, 2, null, 3]`. The recursion depth equals the number of nodes." },
    { name: "An unbalanced tree with gaps", kind: "corner", input: { root: [1, 2, 3, 4, 5, null, 6] }, why: "Nodes have different numbers of children, so the level-order output changes shape, not only order. Every subtree is swapped, not just the top level." },
    { name: "A symmetric tree stays the same", kind: "corner", input: { root: [1, 2, 2, 3, 4, 4, 3] }, why: "A tree that is its own mirror image is unchanged by inversion. The nodes are still swapped (look at the arrows in the lab), but equal subtrees trade places with each other." },
    { name: "Negative and repeated values", kind: "corner", input: { root: [0, -1, -1, 5, null, null, 5] }, why: "Values never influence what happens: the algorithm moves whole subtrees, never inspecting the numbers. Equal values must not be mistaken for equal subtrees." },
  ],

  trace(input, T, K) {
    const { nodes, root } = K.tree(input.root);
    const cs = K.callStack();
    const path = [], done = {};
    let whyBase = false, whySave = false, whyOnce = false;
    const copyNodes = () => JSON.parse(JSON.stringify(nodes));
    const S = (cur, note) => () => {
      const hl = {}, sub = {};
      path.forEach((id) => (hl[id] = "win"));
      for (const id in done) { hl[id] = "ok"; sub[id] = "swapped"; }
      if (cur != null) hl[cur] = "cur";
      return { nodes: copyNodes(), root, hl, sub, calls: cs.snapshot(), label: "binary tree", gy: 62, note };
    };
    const nm = (id) => (id == null ? "null" : nodes[id].v);
    function inv(id) {
      const f = cs.push("invertTree", id == null ? "null" : `node=${nodes[id].v}`, "", "");
      T.step("base", { vars: { node: nm(id) }, state: S(id), say: id == null ? "A call for a **`null` child**: the subtree is empty, so there is nothing to invert. Return `null`." : `A new call for node **${nodes[id].v}**. It is not \`null\`, so both its subtrees must be inverted and then swapped.`, op: `root == nullptr  →  ${id == null}`, act: id == null ? "EMPTY" : "CALL",
        why: id == null && !whyBase ? { title: "Why is the empty tree the base case?", text: "An empty subtree has no nodes, so its mirror image is itself. Returning `null` here lets the parent swap a real subtree with an empty one, and it stops the recursion." } : null });
      if (id == null) { whyBase = true; f.ret = "null"; cs.pop(); return null; }
      path.push(id);
      T.step("goLeft", { vars: { node: nodes[id].v, left: "?", right: "?" }, state: S(id), say: `Invert the **left** subtree of ${nodes[id].v} first: \`left = invertTree(root->left)\`. This call pauses until the mirrored subtree comes back.`, op: "left = invertTree(root.left)", act: "GO_LEFT" });
      const L = inv(nodes[id].l);
      f.locals = `left=${nm(L)}`;
      T.step("goRight", { vars: { node: nodes[id].v, left: nm(L), right: "?" }, state: S(id), say: `The left subtree is inverted (its root is **${nm(L)}**). Now invert the **right** subtree of ${nodes[id].v}.`, op: "right = invertTree(root.right)", act: "GO_RIGHT",
        why: whySave ? null : { title: "Why keep the results in variables?", text: "After `root.left = right`, the old left child is no longer reachable from the root. Saving `left` and `right` first means the swap can be done in two plain assignments, without a temporary." } });
      whySave = true;
      const R = inv(nodes[id].r);
      f.locals = `left=${nm(L)}, right=${nm(R)}`;
      const l0 = L, r0 = R;
      nodes[id].l = r0; nodes[id].r = l0;
      done[id] = true;
      T.step("swap", { vars: { node: nodes[id].v, left: nm(L), right: nm(R) }, state: S(id), say: `Both subtrees are inverted. Now **swap**: ${nodes[id].v}'s left child becomes ${nm(r0)} and its right child becomes ${nm(l0)}.`, op: "root.left = right;  root.right = left", act: "SWAP",
        why: whyOnce ? null : { title: "Is each node swapped exactly once?", text: "Yes: a node is swapped only when its own call finishes, after its subtrees were handled by their own calls. The whole tree is inverted by $n$ swaps, one per node." } });
      whyOnce = true;
      T.step("ret", { vars: { node: nodes[id].v, "return": nodes[id].v }, state: S(id), say: `Return node **${nodes[id].v}** itself: its parent will attach it on the opposite side.`, op: "return root", act: "RETURN" });
      path.pop(); f.ret = nodes[id].v; cs.pop();
      return id;
    }
    T.phase("Invert both subtrees, then swap");
    const r = inv(root);
    const out = K.treeArr(nodes, r);
    T.step("ret", { vars: { "return": `[${out.map((x) => (x === null ? "null" : x)).join(", ")}]` }, state: S(null), say: root == null ? "The tree is empty and stays empty." : `The first call has returned. The inverted tree in level order is **[${out.map((x) => (x === null ? "null" : x)).join(", ")}]**.`, op: "return root", act: "DONE" });
    T.result(out);
  },
  fuzz(rnd) { return { root: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 10)) }; },
  gen(n) { return { root: SHEETS.K.balanced(n) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one call per node and per empty child, a swap per node", short: "2n + 1 calls, n swaps",
      derive: [
        "\\#\\text{calls} = n + (n+1) = 2n + 1 || every node, plus one call for each of the $n + 1$ empty child slots",
        "T(n) = (2n + 1)\\, c_{\\text{call}} + n\\, c_{\\text{swap}} || constant work per call and one swap per real node",
        "\\text{recurrence: } T(n) = T(a) + T(n - 1 - a) + c,\\; T(0) = c_0 || the shape of the split does not matter",
        "!T(n) = O(n) || a node must be touched to be swapped, so linear is the best possible",
      ],
      where: "Balanced or a chain, the number of calls is always $2n + 1$. The measured table uses a balanced tree and counts the five steps per node (call, left, right, swap, return) plus one for every empty child.",
    },
    space: {
      tex: "O(h)", title: "the call stack only", short: "h = height of the tree",
      derive: [
        "\\text{stack depth} \\le h + 1 || one frame per ancestor of the current node, plus the call on a null child",
        "S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ for a balanced tree},\\; O(n) \\text{ for a chain} || no new nodes are allocated",
        "!S = O(h) || the mirrored-copy version needs $O(n)$ for the new nodes as well",
      ],
      where: "Re-linking the existing nodes means no allocation at all; the only memory is the stack. A breadth-first version with a queue would need $O(w)$ for the widest level $w$.",
    },
    limit: "Every node has to be visited and swapped, so $\\Omega(n)$ time is necessary and the recursion is optimal.",
    measure: { label: "n = number of nodes (balanced tree)", fTex: "n", f: (n) => n, sizes: [7, 15, 31, 63, 127, 255], growth: "linear" },
  },

  mistakes: [
    { title: "Losing a subtree in the swap", what: "`root->left = root->right; root->right = root->left;`", why: "Two assignments look like a swap.", breaks: "After the first line both pointers refer to the old right subtree, so the left subtree is lost and the tree is corrupted.", avoid: "Save the children first (`left`, `right`) or use a temporary / `swap`." },
    { title: "Swapping only at the root", what: "`swap(root->left, root->right); return root;` with no recursion.", why: "\"Invert\" sounds like a single swap.", breaks: "Only the top two subtrees trade places; their insides keep their original orientation.", avoid: "Invert **both** subtrees too (recursively)." },
    { title: "No base case for `null`", what: "Dereferencing `root->left` when `root` is `null`.", why: "The recursive line looks complete.", breaks: "A leaf calls itself on its `null` children and crashes on the dereference.", avoid: "`if (!root) return nullptr;` first." },
    { title: "Forgetting to return the root", what: "A function that swaps but returns nothing, or returns `nullptr` at the end.", why: "The tree is changed in place, so the return value seems irrelevant.", breaks: "The caller (or the parent in the recursion) receives garbage, and the inverted tree is lost.", avoid: "Return `root` (the same node, now with swapped children)." },
    { title: "Inverting values instead of structure", what: "Negating or reversing the values stored in the nodes.", why: "\"Invert\" can mean \"reverse the numbers\" in other contexts.", breaks: "The shape stays the same and the expected output (a mirror image) does not match.", avoid: "Only the child pointers change; the values never do." },
  ],

  followUps: [
    {
      q: "Invert the tree **iteratively** with a queue (or a stack).",
      a: "Put the root in a queue. While it is not empty, remove a node, swap its two children, and push the children that exist. Every node is swapped exactly once, in breadth-first order. It avoids recursion (so a very deep tree cannot overflow the stack) and uses $O(w)$ extra space.",
      cpp: `TreeNode* invertIter(TreeNode* root) {
    if (!root) return nullptr;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* n = q.front(); q.pop();
        swap(n->left, n->right);
        if (n->left) q.push(n->left);
        if (n->right) q.push(n->right);
    }
    return root;
}`,
      js: `function invertIter(root) {
  if (!root) return null;
  const q = [root];
  for (let h = 0; h < q.length; h++) {
    const n = q[h];
    [n.left, n.right] = [n.right, n.left];
    if (n.left) q.push(n.left);
    if (n.right) q.push(n.right);
  }
  return root;
}`,
      time: "O(n)", space: "O(w)",
    },
    {
      q: "Check whether a tree is **symmetric** without building the mirror.",
      a: "Compare the left and the right subtrees as mirror images: `mirror(a, b)` is true if both are null, or both exist with equal values and `mirror(a.left, b.right)` and `mirror(a.right, b.left)` hold. This is the Same Tree comparison with the sides crossed.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Why is inverting a **binary search tree** interesting?",
      a: "After inversion the in-order traversal becomes descending: the tree is a BST for the *reversed* order. It is a quick way to turn a min-first structure into a max-first one, but it breaks the usual search rule (`left < root < right`), so a normal BST search would fail on it.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Invert only the nodes at **odd levels**.",
      a: "Pass the depth down the recursion and swap only when it is odd; or, to reverse the *values* on odd levels of a perfect tree, swap the values of mirror nodes with a paired traversal. The walk is unchanged, only the condition at the swap differs.",
      time: "O(n)", space: "O(h)",
    },
  ],

  related: [
    { id: "same-tree", why: "Another recursion over two sides; comparing a tree with its inverted copy tests symmetry." },
    { id: "maximum-depth-of-binary-tree", why: "The smallest example of the same recursion: answer from the two children, base case on `null`." },
    { id: "subtree-of-another-tree", why: "Uses a tree comparison at every node." },
    { id: "reverse-linked-list", why: "The same \"re-link instead of copy\" idea: change the pointers, keep the nodes." },
  ],
  patternNote: "**Post-order transform.** Let the recursion deal with both children first, then do the one step that belongs to this node (here: swap the pointers) and hand the node back. Because the base case is the empty tree and each node is changed once, the whole tree is rewritten in $O(n)$ with no extra nodes.",
  takeaways: [
    "Inverting a tree = swapping the two children at **every** node, so recurse into both subtrees.",
    "Base case: `null` returns `null`. Then `left = invert(root.left)`, `right = invert(root.right)`, swap, return `root`.",
    "Save both results before assigning, or one subtree is lost.",
    "No new nodes are needed: $O(n)$ time, $O(h)$ stack space (a queue gives an iterative $O(w)$ version).",
    "A symmetric tree is unchanged by inversion, so test with asymmetric inputs too.",
  ],
});
