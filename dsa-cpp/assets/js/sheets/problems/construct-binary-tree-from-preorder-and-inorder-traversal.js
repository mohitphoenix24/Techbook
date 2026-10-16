SHEETS.define({
  id: "construct-binary-tree-from-preorder-and-inorder-traversal",
  viz: "tree",
  io: { fn: "buildTree", params: [["preorder", "int[]"], ["inorder", "int[]"]], ret: "tree", labels: { preorder: "preorder (node, left, right)", inorder: "inorder (left, node, right)" } },
  legend: [["cur", "node being created"], ["win", "waiting for its children"], ["ok", "finished subtree"], ["hit", "the root value found in inorder"]],

  statement: `Given two integer arrays \`preorder\` and \`inorder\` where \`preorder\` is the **preorder traversal** of a binary tree and \`inorder\` is the **inorder traversal** of the same tree, construct and return the binary tree.

*Preorder* visits a node, then its left subtree, then its right subtree. *Inorder* visits the left subtree, then the node, then the right subtree. All the values are **unique**.

*(The answer is printed in **level order**, row by row from left to right, with \`null\` for a missing child.)*`,
  examples: [
    { input: "preorder = [3, 9, 20, 15, 7], inorder = [9, 3, 15, 20, 7]", output: "[3, 9, 20, null, null, 15, 7]", explain: "The first value of the preorder, `3`, is the root; in the inorder it splits `[9]` (left) from `[15, 20, 7]` (right)." },
    { input: "preorder = [-1], inorder = [-1]", output: "[-1]", explain: "A single node." },
  ],
  constraints: ["$1 \\le$ `preorder.length` $\\le 3000$", "`inorder.length == preorder.length`", "$-3000 \\le$ `preorder[i]`, `inorder[i]` $\\le 3000$", "`preorder` and `inorder` consist of **unique** values", "Each value of `inorder` also appears in `preorder`", "`preorder` and `inorder` are guaranteed to be the traversals of the same tree"],
  check(input) {
    const pre = input.preorder, ino = input.inorder, n = pre.length;
    if (n < 1) return "the traversals need at least one node";
    if (n > 7) return "for the animation use at most 7 nodes";
    if (ino.length !== n) return "preorder and inorder must have the same length";
    if (new Set(pre).size !== n || new Set(ino).size !== n) return "all the values must be different";
    const pos = new Map(ino.map((v, i) => [v, i]));
    if (pre.some((v) => !pos.has(v))) return "inorder must contain exactly the same values as preorder";
    let pi = 0;
    const tryBuild = (lo, hi) => { if (lo > hi) return true; if (pi >= n) return false; const m = pos.get(pre[pi++]); if (m < lo || m > hi) return false; return tryBuild(lo, m - 1) && tryBuild(m + 1, hi); };
    if (!tryBuild(0, n - 1) || pi !== n) return "these two lists are not the preorder and inorder of the same tree";
    return null;
  },

  intuition: {
    find: "The one binary tree whose preorder and inorder traversals are exactly the two given lists. (With unique values, the pair determines the tree completely.)",
    beginner: "The first value of the preorder is the root. Find that value in the inorder: everything to its left is the left subtree, everything to its right is the right subtree. Cut both arrays into the left part and the right part, and build each subtree the same way, with the copied sub-arrays.",
    works: "Preorder always starts with the root, and inorder puts the root exactly between its two subtrees, so one search and two cuts split the problem into two smaller problems of the same kind.",
    slow: "Searching for the root in the inorder costs $O(n)$ at every node, and copying four sub-arrays per call costs $O(n)$ more: $O(n^2)$ time and space for a degenerate tree (a chain).",
    repeat: "Each call **searches** the inorder for a value, though the position of every value is fixed and could be looked up once. And it **copies** parts of the arrays, though a part of an array can be described by two numbers.",
    remember: "Two facts remove both costs. **(1)** The position of each value in the inorder never changes: store it in a hash map once. **(2)** In the preorder, a subtree's nodes come as one block right after its root, so if we build the **left subtree first**, the preorder values are consumed in order from a single moving index.",
    observation: "Keep a pointer `pi` into the preorder, and describe the current subtree by the range `[lo, hi]` of the inorder. Take `v = preorder[pi++]` as the root, look up its inorder position `m` in the map, then build the left subtree on `[lo, m−1]` and **afterwards** the right subtree on `[m+1, hi]`. An empty range (`lo > hi`) is an empty subtree.",
    leads: "Build a map `value → inorder index`. `build(lo, hi)`: if `lo > hi` return null; `v = preorder[pi++]`; `node = new TreeNode(v)`; `m = pos[v]`; `node.left = build(lo, m−1)`; `node.right = build(m+1, hi)`; return `node`. The order of the two calls matters.",
  },

  flow: [
    "Take the first preorder value as the root, find it in inorder, split both arrays, recurse.",
    "Inorder puts the root between its subtrees, so one split gives two smaller problems.",
    "$O(n^2)$: a linear search and array copies at every node.",
    "Store each value's inorder position in a hash map; describe subtrees by index ranges.",
    "Consume the preorder with one moving index, building left before right.",
    "$O(n)$ time and $O(n)$ space (map plus recursion).",
  ],

  brute: {
    idea: "**Brute force:** the first element of `preorder` is the root. Find its position `m` in `inorder` with a linear search. Copy the four sub-arrays (preorder and inorder for the left part, and for the right part) and build the left and the right subtree from the copies, recursively.",
    why: "Each call does a linear search and copies up to $n$ elements: for a chain-shaped tree the sizes are $n, n-1, n-2, \\dots$, so the total is $O(n^2)$ time and memory. A hash map answers the search in $O(1)$, and index ranges replace the copies.",
    time: "O(n²)", space: "O(n²)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 3000] },
    cpp: `class Solution {
public:
    TreeNode* buildTree(vector<int>& pre, vector<int>& in) {
        if (pre.empty()) return nullptr;
        TreeNode* root = new TreeNode(pre[0]);
        int m = find(in.begin(), in.end(), pre[0]) - in.begin();
        vector<int> lp(pre.begin() + 1, pre.begin() + 1 + m), rp(pre.begin() + 1 + m, pre.end());
        vector<int> li(in.begin(), in.begin() + m), ri(in.begin() + m + 1, in.end());
        root->left = buildTree(lp, li);
        root->right = buildTree(rp, ri);
        return root;
    }
};`,
    js: `function buildTree(pre, ino) {
  if (!pre.length) return null;
  const root = new TreeNode(pre[0]);
  const m = ino.indexOf(pre[0]);
  root.left = buildTree(pre.slice(1, 1 + m), ino.slice(0, m));
  root.right = buildTree(pre.slice(1 + m), ino.slice(m + 1));
  return root;
}`,
  },

  pattern: {
    name: "Divide and Conquer (split on the root, with a map)",
    why: "A traversal pair is a recipe: the root comes first in the preorder, and the inorder shows where the left and right subtrees begin and end. Each step turns one problem of size $n$ into two smaller ones (*divide*), solved the same way (*conquer*), and the tree is assembled as the calls return.",
    recognize: [
      "A structure must be **rebuilt from two views** of it (preorder + inorder, or postorder + inorder).",
      "One element tells where to cut the other view into two independent parts.",
      "The cut position is looked up repeatedly, so a **hash map** from value to position makes each lookup $O(1)$.",
      "Subproblems are contiguous ranges, so indices can replace array copies.",
    ],
  },

  optimal: {
    idea: "Precompute `pos[v]`, the index of every value in the inorder. Keep a moving index `pi` into the preorder: the next unused preorder value is always the root of the next subtree to be built. `build(lo, hi)` builds the subtree whose inorder values are `inorder[lo..hi]`: take the next preorder value as its root, find its inorder index `m`, build the left subtree on `[lo, m−1]` first (these values come next in the preorder), then the right subtree on `[m+1, hi]`.",
    steps: [
      "Fill a hash map `pos` with `pos[inorder[i]] = i`; set `pi = 0`.",
      "`build(lo, hi)`: if `lo > hi`, return `null` (empty subtree).",
      "Take the root value `v = preorder[pi]` and advance `pi`.",
      "Create the node, and look up `m = pos[v]`.",
      "`node.left = build(lo, m − 1)`, then `node.right = build(m + 1, hi)` (left first, because the preorder lists the left subtree first).",
      "Return the node; call `build(0, n − 1)` for the whole tree.",
    ],
    invariant: "**When `build(lo, hi)` is called, `preorder[pi]` is the first value of the preorder of the subtree whose inorder is `inorder[lo..hi]`; when it returns, `pi` has moved past exactly the `hi − lo + 1` values of that subtree.**",
    correct: "For the whole tree the invariant holds with `pi = 0`. In the preorder of a subtree the first value is its root $r$; the inorder of the subtree puts $r$ at index $m$ with the left subtree's values at `[lo, m−1]` and the right subtree's values at `[m+1, hi]`. The preorder continues with the entire preorder of the left subtree (which has $m - lo$ values) followed by the preorder of the right subtree. The call on `[lo, m−1]` starts at the right preorder position and, by induction, consumes exactly $m - lo$ values, so afterwards `pi` points at the first value of the right subtree's preorder, which is where the call on `[m+1, hi]` must start. That is why left must be built before right. An empty range consumes nothing. So every value is used once and the tree built has the given traversals; with unique values the tree is the only one.",
  },

  cpp: `class Solution {
    unordered_map<int, int> pos;                // value -> index in inorder
    int pi = 0;                                 // next unused preorder value
    TreeNode* build(vector<int>& pre, int lo, int hi) {
        if (lo > hi) return nullptr;            // empty range: no subtree //@base
        int v = pre[pi++];                      // the next preorder value is the root //@take
        TreeNode* node = new TreeNode(v);
        int m = pos[v];                         // where the root sits in inorder //@split
        node->left = build(pre, lo, m - 1);     // left values come first in preorder //@left
        node->right = build(pre, m + 1, hi);    // then the right values //@right
        return node;                            //@ret
    }
public:
    TreeNode* buildTree(vector<int>& preorder, vector<int>& inorder) {
        for (int i = 0; i < (int)inorder.size(); i++) pos[inorder[i]] = i;   //@init
        return build(preorder, 0, (int)inorder.size() - 1);                  //@start
    }
};`,
  js: `function buildTree(preorder, inorder) {
  const pos = new Map();                 // value -> index in inorder
  inorder.forEach((v, i) => pos.set(v, i));   //@init
  let pi = 0;                            // next unused preorder value
  function build(lo, hi) {
    if (lo > hi) return null;            // empty range: no subtree //@base
    const v = preorder[pi++];            // the next preorder value is the root //@take
    const node = new TreeNode(v);
    const m = pos.get(v);                // where the root sits in inorder //@split
    node.left = build(lo, m - 1);        // left values come first in preorder //@left
    node.right = build(m + 1, hi);       // then the right values //@right
    return node;                         //@ret
  }
  return build(0, inorder.length - 1);   //@start
}`,

  tests: [
    { name: "Example 1: [3, 9, 20, 15, 7]", kind: "normal", input: { preorder: [3, 9, 20, 15, 7], inorder: [9, 3, 15, 20, 7] } },
    { name: "Example 2: a single node", kind: "normal", input: { preorder: [-1], inorder: [-1] } },
    { name: "A perfect tree of 7 nodes", kind: "normal", input: { preorder: [1, 2, 4, 5, 3, 6, 7], inorder: [4, 2, 5, 1, 6, 3, 7] } },
    { name: "A left chain", kind: "edge", input: { preorder: [3, 2, 1], inorder: [1, 2, 3] }, why: "Every root is the *last* element of its inorder range, so the right range is always empty and the left range shrinks by one. The recursion goes 3 deep, one call per node." },
    { name: "A right chain", kind: "edge", input: { preorder: [1, 2, 3], inorder: [1, 2, 3] }, why: "Every root is the *first* element of its inorder range, so the left range is empty each time. The call `build(lo, m − 1)` has `lo > m − 1` and returns `null` at once." },
    { name: "A root with only a right subtree", kind: "edge", input: { preorder: [1, 3, 2], inorder: [1, 2, 3] }, why: "The root `1` is at the start of the inorder, so its left subtree is empty; the right subtree `3, 2` is built from the rest of the preorder: `[1, null, 3, 2]`." },
    { name: "A zig-zag tree", kind: "corner", input: { preorder: [1, 2, 3, 4], inorder: [2, 4, 3, 1] }, why: "Each node's only child alternates between a right and a left subtree. The map lookup gives a different split position at each level, and `pi` advances one value per node." },
    { name: "Negative and zero values", kind: "corner", input: { preorder: [0, -1, 1], inorder: [-1, 0, 1] }, why: "Values are only keys of the map, never compared, so negative numbers and zero need no special care." },
    { name: "Left subtree larger than right", kind: "corner", input: { preorder: [5, 3, 2, 4, 6], inorder: [2, 3, 4, 5, 6] }, why: "The preorder lists the whole left subtree `3, 2, 4` before the right subtree `6`. Building left first consumes exactly those three values, so `pi` lands on `6` for the right subtree: the order of the two calls is essential." },
  ],

  trace(input, T, K) {
    const pre = input.preorder, ino = input.inorder, n = pre.length;
    const pos = {}; ino.forEach((v, i) => (pos[v] = i));
    const cs = K.callStack();
    const nodes = {}; let nid = 0, pi = 0, rootId = null;
    const path = [], done = {};
    let curRange = null, curM = null, whyMap = false, whyLeftFirst = false, whyBase = false, whyTake = false;
    const copyNodes = () => JSON.parse(JSON.stringify(nodes));
    const S = (cur, o = {}) => () => {
      const hl = {};
      path.forEach((id) => (hl[id] = "win"));
      for (const id in done) hl[id] = "ok";
      if (cur != null) hl[cur] = "cur";
      const preHl = {}; for (let i = 0; i < pi; i++) preHl[i] = "ok";
      if (pi < n && !o.noNext) preHl[pi] = "cur";
      const inHl = {};
      if (curRange) for (let i = curRange[0]; i <= curRange[1]; i++) inHl[i] = "win";
      if (curM != null && o.showM) inHl[curM] = "hit";
      return { nodes: copyNodes(), root: rootId, hl, gy: 62, label: "tree so far", calls: cs.snapshot(),
        arrs: [{ label: "preorder", arr: pre, hl: preHl, ptr: pi < n ? { pi } : {} }, { label: "inorder", arr: ino, hl: inHl }],
        map: { entries: Object.keys(pos).map((k) => [Number(k), pos[k]]), hl: o.showM && o.key != null ? { [o.key]: "hit" } : {}, title: "index in inorder", keyLabel: "value", valLabel: "index" },
        note: o.note };
    };
    T.step("init", { w: n, vars: { n, pi }, state: S(null, { noNext: false }), phase: "Build the tree top-down", say: "First, record **where every value sits in the inorder** in a hash map: that way finding a root's position later is one lookup instead of a search.", op: "pos[inorder[i]] = i  for every i", act: "BUILD_MAP",
      why: { title: "Why a hash map?", text: "Without it, every node would search the inorder array for its root: $O(n)$ each, $O(n^2)$ in total for a chain. With the map each lookup is $O(1)$." } });
    whyMap = true;
    T.step("start", { vars: { n, pi }, state: S(null), say: `Build the whole tree: the inorder range is \`[0, ${n - 1}]\`. \`pi\` = 0 points at the first preorder value, which must be the root.`, op: `build(0, ${n - 1})`, act: "START" });
    function build(lo, hi) {
      const f = cs.push("build", `lo=${lo}, hi=${hi}`, "", "");
      const saveRange = curRange;
      curRange = lo <= hi ? [lo, hi] : null;
      T.step("base", { vars: { lo, hi, pi }, state: S(null), say: lo > hi ? `\`lo\` = ${lo} is greater than \`hi\` = ${hi}: the range is **empty**, so this subtree is empty. Return \`null\`.` : `A call for the inorder range \`[${lo}, ${hi}]\` (${hi - lo + 1} value${hi - lo === 0 ? "" : "s"}). It is not empty, so it has a root.`, op: `lo > hi  →  ${lo > hi}`, act: lo > hi ? "EMPTY_RANGE" : "CALL",
        why: lo > hi && !whyBase ? { title: "What does an empty range mean?", text: "A root with no left (or right) values in the inorder has no left (or right) child. The call returns `null` and consumes no preorder values." } : null });
      if (lo > hi) { whyBase = true; f.ret = "null"; cs.pop(); curRange = saveRange; return null; }
      const v = pre[pi];
      const id = "n" + nid++;
      nodes[id] = { v, l: null, r: null };
      if (rootId == null) rootId = id;
      pi++;
      f.locals = `v=${v}`;
      T.step("take", { vars: { lo, hi, v, pi }, state: S(id, { noNext: false }), say: `The next unused preorder value is **${v}**: it is the **root** of this subtree (a preorder always starts with the root). Create the node and advance \`pi\` to ${pi}.`, op: `v = preorder[pi++]  →  ${v}`, act: "TAKE_ROOT",
        why: whyTake ? null : { title: "Why is the next preorder value the root?", text: "A preorder visits the node first, then the whole left subtree, then the whole right subtree. So the first value not yet used is always the root of the subtree we are about to build." } });
      whyTake = true;
      const m = pos[v];
      curM = m;
      T.step("split", { vars: { lo, hi, v, m }, state: S(id, { showM: true, key: v, noNext: false }), say: `Look up **${v}** in the map: it is at inorder index **m = ${m}**. In the inorder the left subtree is \`[${lo}, ${m - 1}]\` (${m - lo} value${m - lo === 1 ? "" : "s"}) and the right subtree is \`[${m + 1}, ${hi}]\` (${hi - m} value${hi - m === 1 ? "" : "s"}).`, op: `m = pos[${v}] = ${m}`, act: "FIND_SPLIT" });
      path.push(id);
      T.step("left", { vars: { lo, hi, v, m }, state: S(id, { noNext: false }), say: `Build the **left** subtree from \`[${lo}, ${m - 1}]\`. Its values come next in the preorder, so this must be done **before** the right subtree.`, op: `node.left = build(${lo}, ${m - 1})`, act: "GO_LEFT",
        why: whyLeftFirst ? null : { title: "Why left before right?", text: "The preorder lists all of the left subtree first. Building the left subtree uses up exactly those values, so `pi` is then pointing at the first value of the right subtree. Swapping the two calls would give the right subtree the wrong values." } });
      whyLeftFirst = true;
      const L = build(lo, m - 1);
      nodes[id].l = L;
      curRange = [lo, hi]; curM = m;
      T.step("right", { vars: { lo, hi, v, m, pi }, state: S(id, { showM: true, key: v, noNext: false }), say: `The left subtree is attached (${L == null ? "it is empty" : `its root is ${nodes[L].v}`}). Now \`pi\` = ${pi} points at the first value of the right subtree. Build the **right** subtree from \`[${m + 1}, ${hi}]\`.`, op: `node.right = build(${m + 1}, ${hi})`, act: "GO_RIGHT" });
      const R = build(m + 1, hi);
      nodes[id].r = R;
      path.pop(); done[id] = true;
      f.ret = v; cs.pop();
      curRange = saveRange;
      T.step("ret", { vars: { v, "return": v }, state: S(id, { noNext: false }), say: `Both subtrees of **${v}** are built. Return the node; its parent will attach it.`, op: "return node", act: "RETURN" });
      return id;
    }
    T.phase("Take the root, split the inorder, recurse");
    const r = build(0, n - 1);
    curRange = null; curM = null;
    const out = K.treeArr(nodes, r);
    T.step("start", { vars: { "return": `[${out.map((x) => (x === null ? "null" : x)).join(", ")}]` }, state: S(null, { noNext: true }), say: `All ${n} preorder values have been used (\`pi\` = ${pi}). The tree in level order is **[${out.map((x) => (x === null ? "null" : x)).join(", ")}]**.`, op: "return build(0, n - 1)", act: "DONE" });
    T.result(out);
  },
  fuzz(rnd) {
    const K = SHEETS.K, n = 1 + Math.floor(rnd() * 7);
    const vals = []; while (vals.length < n) { const v = Math.floor(rnd() * 20) - 5; if (!vals.includes(v)) vals.push(v); }
    // random tree shape over the distinct values, then its two traversals
    const nodes = []; nodes.push({ v: vals[0], l: -1, r: -1 });
    for (let i = 1; i < n; i++) for (;;) { const p = Math.floor(rnd() * nodes.length), s = rnd() < 0.5 ? "l" : "r"; if (nodes[p][s] === -1) { nodes[p][s] = nodes.length; nodes.push({ v: vals[i], l: -1, r: -1 }); break; } }
    const pre = [], ino = [];
    const go = (i) => { if (i < 0) return; pre.push(nodes[i].v); go(nodes[i].l); ino.push(nodes[i].v); go(nodes[i].r); };
    go(0);
    return { preorder: pre, inorder: ino };
  },
  gen(n) { return { preorder: Array.from({ length: n }, (_, i) => n - i), inorder: Array.from({ length: n }, (_, i) => i + 1) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "one call per node and per empty range, with O(1) work in each", short: "2n + 1 calls plus n map insertions",
      derive: [
        "T_{\\text{map}} = n\\, c || one insertion per value of the inorder",
        "\\#\\text{calls} = n + (n+1) = 2n + 1 || every value gets one call that creates its node, and every empty subtree gets one call that returns `null`",
        "T_{\\text{calls}} = (2n+1)\\,c' || each call does a constant amount of work (one map lookup, one allocation, two recursive calls)",
        "!T(n) = n\\,c + (2n+1)\\,c' = O(n) || versus $O(n^2)$ for linear searches and array copies",
      ],
      where: "Since the ranges `[lo, hi]` split the inorder into two *disjoint* parts at every call, each value becomes the root of exactly one call. The measured table uses a left chain, the deepest shape, and counts the map building as $n$ steps.",
    },
    space: {
      tex: "O(n)", title: "the map, the new tree and the recursion", short: "n map entries, n nodes, up to n stack frames",
      derive: [
        "S_{\\text{map}} = n\\,(s_{\\text{key}} + s_{\\text{idx}}) || one entry per value",
        "S_{\\text{tree}} = n\\, s_{\\text{node}} || the answer itself",
        "S_{\\text{stack}} \\le h + 1 \\le n || one frame per ancestor",
        "!S = O(n) || the brute force also copies arrays at every level: $O(n^2)$",
      ],
      where: "The output tree alone needs $O(n)$ memory, so $O(n)$ is the best possible. No sub-array is ever copied: a subtree is described by two integers.",
    },
    limit: "Every value must be read and placed in the tree, so $\\Omega(n)$ is needed and the method is optimal.",
    measure: { label: "n = number of nodes (a left chain)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Building the right subtree before the left", what: "Swapping the two recursive lines.", why: "The two calls look interchangeable.", breaks: "The preorder lists the left subtree first, so the right subtree would receive the left subtree's values; the result is a different (wrong) tree.", avoid: "Left first, then right, because the preorder index is shared." },
    { title: "Searching the inorder array at every node", what: "`find(inorder.begin(), inorder.end(), v)` inside each call.", why: "It is the simplest way to locate the root.", breaks: "It costs $O(n)$ per node, so $O(n^2)$ overall (too slow for 3000 nodes in a chain).", avoid: "Precompute a hash map from value to inorder index." },
    { title: "Copying sub-arrays", what: "Building new vectors for each recursive call.", why: "It makes the recursion read like the definition.", breaks: "Each level copies up to $n$ elements: $O(n^2)$ time and memory.", avoid: "Pass index ranges `[lo, hi]` and a shared preorder index." },
    { title: "Using the preorder index as a function argument", what: "Passing `pi` by value to the recursive calls.", why: "Everything else is a parameter.", breaks: "Both children start from the same preorder position, so the right subtree reuses the left subtree's values.", avoid: "Keep `pi` as one shared variable (a member, a reference, or a closure variable)." },
    { title: "Wrong ranges for the subtrees", what: "`build(lo, m)` and `build(m, hi)`.", why: "Off-by-one with the root's own index.", breaks: "The root `m` is included in both subtrees, so the recursion never ends or the tree has repeated nodes.", avoid: "Left: `[lo, m − 1]`; right: `[m + 1, hi]`." },
  ],

  followUps: [
    {
      q: "Build the tree from the **inorder and postorder** traversals.",
      a: "The roles are reversed: the **last** postorder value is the root, and the postorder lists the left subtree first, then the right, then the root, so reading it from the **end** gives the root, then the right subtree, then the left. Keep an index `pi` that starts at the end and decreases, and build the **right subtree first**, then the left.",
      cpp: `class SolPost {
    unordered_map<int, int> pos;
    int pi;
    TreeNode* build(vector<int>& post, int lo, int hi) {
        if (lo > hi) return nullptr;
        int v = post[pi--];
        TreeNode* node = new TreeNode(v);
        int m = pos[v];
        node->right = build(post, m + 1, hi);
        node->left = build(post, lo, m - 1);
        return node;
    }
public:
    TreeNode* buildTree(vector<int>& inorder, vector<int>& postorder) {
        for (int i = 0; i < (int)inorder.size(); i++) pos[inorder[i]] = i;
        pi = postorder.size() - 1;
        return build(postorder, 0, (int)inorder.size() - 1);
    }
};`,
      js: `function buildTreePost(inorder, postorder) {
  const pos = new Map(inorder.map((v, i) => [v, i]));
  let pi = postorder.length - 1;
  function build(lo, hi) {
    if (lo > hi) return null;
    const v = postorder[pi--];
    const node = new TreeNode(v);
    const m = pos.get(v);
    node.right = build(m + 1, hi);
    node.left = build(lo, m - 1);
    return node;
  }
  return build(0, inorder.length - 1);
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Why is the **inorder** traversal needed? Does the preorder alone determine the tree?",
      a: "No. The preorder `[1, 2]` fits a tree with `2` as the left child of `1` and one with `2` as the right child. The inorder says on which side each value lies. (With the preorder of a **binary search tree** the inorder is implied, since it is the sorted order, and the tree can be rebuilt from the preorder alone.)",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Rebuild the tree **without a hash map**, in $O(n)$ time.",
      a: "Use a stop-value technique: `build(stop)` makes the next preorder value the root, then builds the left subtree until the inorder pointer reaches that root, and the right subtree until it reaches `stop`. Two moving indices (one in each traversal) replace the map. It is shorter in memory but harder to get right.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Serialise and rebuild a tree using **one** traversal only.",
      a: "A preorder with explicit `null` markers is enough, because the markers show where each subtree ends. That is the Serialize and Deserialize Binary Tree problem, the next one on the sheet.",
      time: "O(n)", space: "O(n)",
    },
  ],

  related: [
    { id: "serialize-and-deserialize-binary-tree", why: "Rebuilds a tree from a single preorder-like string that contains `null` markers." },
    { id: "validate-binary-search-tree", why: "Another recursion on index ranges and bounds that narrow as you go down." },
    { id: "maximum-depth-of-binary-tree", why: "The basic tree recursion that this problem builds on: a tree is a root plus two subtrees." },
    { id: "kth-smallest-element-in-a-bst", why: "The inorder traversal of a BST is its sorted order, the fact used here for splitting." },
  ],
  patternNote: "**Divide on the root.** Two different traversals together pin down a tree: one tells *which* value is the root (preorder: first, postorder: last), the other tells *where to cut* the remaining values (inorder: the root splits left from right). A hash map for the cut position and a single shared index into the first traversal make each step $O(1)$.",
  takeaways: [
    "Preorder: the next unused value is the **root**. Inorder: the root splits the **left** values from the **right** values.",
    "Precompute `value → inorder index` in a hash map; describe subtrees by `[lo, hi]`; keep one shared preorder index.",
    "`node.left = build(lo, m−1)` **before** `node.right = build(m+1, hi)`: the preorder lists the left subtree first.",
    "An empty range returns `null` and consumes nothing.",
    "Time $O(n)$ and space $O(n)$ (versus $O(n^2)$ with searches and copies); unique values are essential.",
  ],
});
