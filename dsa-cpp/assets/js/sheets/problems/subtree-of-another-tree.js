SHEETS.define({
  id: "subtree-of-another-tree",
  viz: "recursion",
  io: { fn: "isSubtree", params: [["root", "tree"], ["subRoot", "tree"]], ret: "bool", labels: { root: "root (the big tree, level order)", subRoot: "subRoot (the tree to look for)" } },
  legend: [["cur", "pair being compared"], ["ok", "pair that matched"], ["bad", "pair that differs"], ["win", "node where we try to match"]],

  statement: `Given the roots of two binary trees \`root\` and \`subRoot\`, return \`true\` if there is a subtree of \`root\` with the **same structure and node values** as \`subRoot\`, and \`false\` otherwise.

A subtree of a binary tree \`tree\` is a tree that consists of a node in \`tree\` **and all of this node's descendants**. The tree \`tree\` could also be considered as a subtree of itself.

*(In the lab, trees are written in **level order**, row by row from left to right, with \`null\` for a missing child.)*`,
  examples: [
    { input: "root = [3, 4, 5, 1, 2], subRoot = [4, 1, 2]", output: "true", explain: "The node `4` together with its children `1` and `2` is exactly `subRoot`." },
    { input: "root = [3, 4, 5, 1, 2, null, null, null, null, 0], subRoot = [4, 1, 2]", output: "false", explain: "The subtree at `4` has an extra node `0` under `2`, so it is **not** identical to `subRoot`: a subtree takes *all* the descendants." },
  ],
  constraints: ["The number of nodes in `root` is in the range $[1, 2000]$", "The number of nodes in `subRoot` is in the range $[1, 1000]$", "$-10^4 \\le$ `root.val`, `subRoot.val` $\\le 10^4$"],
  check(input) {
    const c = (a) => a.filter((x) => x !== null).length;
    if (c(input.subRoot) < 1) return "subRoot needs at least one node";
    if (c(input.root) > 9) return "for the animation use at most 9 nodes in root";
    if (c(input.subRoot) > 5) return "for the animation use at most 5 nodes in subRoot";
    return null;
  },

  intuition: {
    find: "Whether some node of the big tree, **together with everything below it**, looks exactly like `subRoot`. Matching only the top part is not enough.",
    beginner: "Write both trees as strings with a pre-order walk (with `null` markers) and ask whether the string of `subRoot` appears inside the string of `root`.",
    works: "A subtree of `root` is a contiguous piece of its pre-order text, and equal text means equal tree, so a substring search answers the question.",
    slow: "A plain substring search can take $O(n \\cdot m)$ time and the two strings need $O(n + m)$ extra memory. There is also a trap: without separators `12` and `2` look alike, so the strings need careful markers.",
    repeat: "We write whole texts of both trees although most candidate nodes can be rejected after looking at their first node or two.",
    remember: "We already know how to decide whether **two trees are identical** (the previous problem). A subtree of `root` is nothing but *one of its nodes taken as a root*. So the question is: is there a node in `root` for which `isSameTree(node, subRoot)` is true?",
    observation: "Visit every node of `root`. At each one, run the `isSameTree` comparison against `subRoot`. Most comparisons fail on the first or second pair of nodes, so they are cheap. If a node matches, return `true`; otherwise continue with the left subtree and the right subtree (with `||`).",
    leads: "`if (!root) return false; if (same(root, subRoot)) return true; return isSubtree(root->left, subRoot) || isSubtree(root->right, subRoot);`, with `same` exactly as in Same Tree.",
  },

  flow: [
    "Serialise both trees with `null` markers and look for one text inside the other.",
    "A subtree is a contiguous piece of the pre-order text.",
    "$O(n \\cdot m)$ with a naive search, two extra strings, and separators must be handled.",
    "A subtree is a node taken as a root, so reuse the identical-trees test.",
    "At every node of `root`, ask `same(node, subRoot)`; mostly it fails at once.",
    "$O(n \\cdot m)$ worst case, $O(h)$ extra space; a hash or KMP version gives $O(n + m)$.",
  ],

  brute: {
    idea: "**Brute force:** serialise both trees in pre-order, writing every value after a comma (`,v`) and every missing child as `#`. The text of `subRoot` must appear as a substring of the text of `root`. Use the library's substring search.",
    why: "A naive substring search costs $O(n \\cdot m)$, and both texts must be built and kept in memory: $O(n + m)$ extra space, against $O(h)$ for the direct recursion. The markers are also easy to get wrong (without a separator, the value `12` could be mistaken for `2` at the end of another value).",
    time: "O(n · m)", space: "O(n + m)",
    cpp: `class Solution {
    void ser(TreeNode* t, string& out) {
        if (!t) { out += ",#"; return; }
        out += "," + to_string(t->val);
        ser(t->left, out);
        ser(t->right, out);
    }
public:
    bool isSubtree(TreeNode* root, TreeNode* subRoot) {
        string a, b;
        ser(root, a);
        ser(subRoot, b);
        return a.find(b) != string::npos;
    }
};`,
    js: `function isSubtree(root, subRoot) {
  const ser = (t) => (t ? "," + t.val + ser(t.left) + ser(t.right) : ",#");
  return ser(root).includes(ser(subRoot));
}`,
  },

  pattern: {
    name: "Tree Recursion (try every node as a root)",
    why: "When the question is about *some* subtree, treat every node as a candidate root and run a simple yes/no test on it. The outer recursion walks the tree; the inner recursion (here, \"are these two trees identical?\") decides each candidate.",
    recognize: [
      "You must find **a subtree** (or a path, or a node) that satisfies a property.",
      "The property of one candidate can be tested by a function you already have.",
      "Each candidate usually fails quickly, which keeps the total work close to linear.",
      "A recursion inside a recursion: an outer walk over nodes and an inner test per node.",
    ],
  },

  optimal: {
    idea: "Walk the big tree. At every node, test whether the tree starting at that node is **identical** to `subRoot` (compare node by node, with the same recursion as the Same Tree problem). If the test succeeds anywhere, return `true`. If the walk reaches an empty node without success, return `false` for that branch, and combine the two branches with `||`.",
    steps: [
      "If `root` is `null`, return `false` (no node left to try).",
      "If `same(root, subRoot)` is `true`, return `true`.",
      "Otherwise return `isSubtree(root.left, subRoot) || isSubtree(root.right, subRoot)`.",
      "`same(a, b)`: both `null` → `true`; one `null` or different values → `false`; else `same(a.left, b.left) && same(a.right, b.right)`.",
    ],
    invariant: "**`isSubtree(node, sub)` is `true` if and only if some node of the subtree rooted at `node` is the root of a tree identical to `sub`.**",
    correct: "A tree has `sub` as a subtree exactly if the tree itself equals `sub`, or its left subtree has `sub` as a subtree, or its right subtree does. The first alternative is decided by `same`, which is correct by the argument for Same Tree (identical shape and values, including all descendants, so a node that matches only the top of `sub` is rejected). The other two alternatives are the same question on smaller trees, answered by the induction hypothesis. An empty tree has no subtree equal to a non-empty `sub`, so the base case returns `false`. The `||` returns `true` as soon as any alternative is true.",
  },

  cpp: `class Solution {
    bool same(TreeNode* a, TreeNode* b) {       // identical trees? (as in Same Tree)
        if (!a && !b) return true;              //@sBoth
        if (!a || !b || a->val != b->val) return false;   //@sDiff
        return same(a->left, b->left) && same(a->right, b->right);   //@sRec
    }
public:
    bool isSubtree(TreeNode* root, TreeNode* subRoot) {
        if (!root) return false;                // ran off the tree //@null
        if (same(root, subRoot)) return true;   // does a copy of subRoot start here? //@try
        return isSubtree(root->left, subRoot) || isSubtree(root->right, subRoot);   // keep looking //@down
    }
};`,
  js: `function isSubtree(root, subRoot) {
  function same(a, b) {                  // identical trees? (as in Same Tree)
    if (!a && !b) return true;           //@sBoth
    if (!a || !b || a.val !== b.val) return false;   //@sDiff
    return same(a.left, b.left) && same(a.right, b.right);   //@sRec
  }
  if (!root) return false;               // ran off the tree //@null
  if (same(root, subRoot)) return true;  // does a copy of subRoot start here? //@try
  return isSubtree(root.left, subRoot) || isSubtree(root.right, subRoot);   // keep looking //@down
}`,

  tests: [
    { name: "Example 1: [3, 4, 5, 1, 2] contains [4, 1, 2]", kind: "normal", input: { root: [3, 4, 5, 1, 2], subRoot: [4, 1, 2] } },
    { name: "Example 2: an extra node below", kind: "normal", input: { root: [3, 4, 5, 1, 2, null, null, null, null, 0], subRoot: [4, 1, 2] } },
    { name: "A single node as the subtree", kind: "normal", input: { root: [1, 2, 3], subRoot: [3] } },
    { name: "The tree is a subtree of itself", kind: "edge", input: { root: [1, 2, 3], subRoot: [1, 2, 3] }, why: "The very first `same(root, subRoot)` succeeds, so the answer is `true` without descending. The problem statement says a tree is a subtree of itself." },
    { name: "subRoot is larger than root", kind: "edge", input: { root: [1], subRoot: [1, 2] }, why: "The roots match, but `subRoot` has a child where `root` has none: `same` returns `false` at the `oneNull` test. Every deeper call is on `null` and returns `false`." },
    { name: "Matching only the top part is not enough", kind: "edge", input: { root: [1, 2], subRoot: [1] }, why: "`subRoot` is a single node `1`, which matches the value at the root, but the subtree at the root contains a child `2` as well. A subtree takes **all** descendants, so the answer is `false`." },
    { name: "Duplicate values: the first candidate fails", kind: "edge", input: { root: [1, 1], subRoot: [1] }, why: "The root has value 1, but it has a child, so `same(root, [1])` fails. The search goes down, and the leaf `1` matches `subRoot` exactly: `true`. Stopping after the first value match would give a wrong `false`." },
    { name: "The subtree is in the right branch", kind: "corner", input: { root: [1, 2, 3, null, null, 4, 5], subRoot: [3, 4, 5] }, why: "The left branch is searched first and fails everywhere (`||`); only then is the right branch tried, where the node `3` matches. This is why both recursive calls are needed." },
    { name: "Same values, different shape", kind: "corner", input: { root: [1, 2], subRoot: [1, null, 2] }, why: "Both trees hold the values `1` and `2`, but one has `2` on the left and the other on the right. The shape differs, so no node matches: `false`." },
    { name: "The value does not occur", kind: "corner", input: { root: [1, 2, 3, 4, 5, 6, 7], subRoot: [8] }, why: "No node has the value 8, so every `same` call fails at its value check. All 7 nodes are tried, and then the `null` children, before the answer `false`." },
  ],

  trace(input, T, K) {
    const R = K.tree(input.root), U = K.tree(input.subRoot);
    const cs = K.callStack();
    const okR = {}, okU = {};
    let tryRoot = null;
    let whySame = false, whyDown = false, whyAll = false;
    const nmR = (id) => (id == null ? "null" : R.nodes[id].v), nmU = (id) => (id == null ? "null" : U.nodes[id].v);
    const S = (cr, cu, bad) => () => {
      const hr = {}, hu = {};
      if (tryRoot != null) hr[tryRoot] = "win";
      for (const id in okR) hr[id] = "ok";
      for (const id in okU) hu[id] = "ok";
      if (cr != null) hr[cr] = bad ? "bad" : "cur";
      if (cu != null) hu[cu] = bad ? "bad" : "cur";
      return { trees: [{ label: "root", nodes: R.nodes, root: R.root, hl: hr }, { label: "subRoot", nodes: U.nodes, root: U.root, hl: hu }], calls: cs.snapshot(), gy: 58 };
    };
    function same(a, b) {
      const f = cs.push("same", `a=${nmR(a)}, b=${nmU(b)}`, "", "");
      const both = a == null && b == null;
      T.step("sBoth", { vars: { a: nmR(a), b: nmU(b) }, state: S(a, b), say: both ? "Both are **empty**: two empty trees are the same. Return `true`." : `Compare the pair (**${nmR(a)}**, **${nmU(b)}**). Both empty? No.`, op: `!a && !b  →  ${both}`, act: both ? "BOTH_EMPTY" : "CALL" });
      if (both) { f.ret = true; cs.pop(); return true; }
      const diff = a == null || b == null || R.nodes[a].v !== U.nodes[b].v;
      T.step("sDiff", { vars: { a: nmR(a), b: nmU(b) }, state: S(a, b, diff), say: diff ? (a == null || b == null ? `Only one of them exists (**${a == null ? "the big tree has no node here" : "subRoot has no node here"}**): the shapes differ. Return \`false\`.` : `The values differ (**${nmR(a)}** against **${nmU(b)}**). Return \`false\`.`) : `Both exist and both hold **${nmR(a)}**. The roots of this pair match, so compare their children.`, op: diff ? "a is null / b is null / values differ  →  true" : "a, b exist and a.val == b.val  →  continue", act: diff ? "DIFFERENT" : "MATCH" });
      if (diff) { f.ret = false; cs.pop(); return false; }
      T.step("sRec", { vars: { a: nmR(a), b: nmU(b) }, state: S(a, b), say: "Same value: the trees are identical only if the left subtrees **and** the right subtrees are identical.", op: "same(a.left, b.left) && same(a.right, b.right)", act: "CHECK_CHILDREN" });
      const l = same(R.nodes[a].l, U.nodes[b].l);
      const res = l && same(R.nodes[a].r, U.nodes[b].r);
      if (res) { okR[a] = true; okU[b] = true; }
      f.ret = res; cs.pop();
      return res;
    }
    function sub(a) {
      const f = cs.push("isSubtree", `root=${nmR(a)}`, "", "");
      T.step("null", { vars: { root: nmR(a) }, state: S(a == null ? null : a, null), say: a == null ? "A call for a **`null`** child: we ran off the tree without finding `subRoot` here. Return `false`." : `A call for node **${nmR(a)}**. It exists, so try it as the top of a copy of \`subRoot\`.`, op: `root == nullptr  →  ${a == null}`, act: a == null ? "RAN_OFF" : "CALL" });
      if (a == null) { f.ret = false; cs.pop(); return false; }
      tryRoot = a;
      for (const id in okR) delete okR[id];
      for (const id in okU) delete okU[id];
      T.step("try", { vars: { root: nmR(a) }, state: S(a, U.root), say: `Does the tree starting at **${nmR(a)}**, with all its descendants, look exactly like \`subRoot\`? Compare them node by node with \`same(root, subRoot)\`.`, op: "same(root, subRoot)", act: "TRY_MATCH",
        why: whySame ? null : { title: "Why call `same` here?", text: "A subtree of `root` is a node *together with all its descendants*. So each node of `root` is a candidate: it is a copy of `subRoot` exactly when the two trees starting there are identical." } });
      whySame = true;
      const ok = same(a, U.root);
      if (ok) {
        T.step("try", { vars: { root: nmR(a), same: true }, state: S(null, null), say: `\`same\` returned \`true\`: the subtree at **${nmR(a)}** is identical to \`subRoot\`. Return \`true\`.`, op: "same(root, subRoot) = true  →  return true", act: "FOUND" });
        f.ret = true; cs.pop(); return true;
      }
      T.step("down", { vars: { root: nmR(a), same: false }, state: S(a, null), say: `No copy of \`subRoot\` starts at ${nmR(a)}. Keep looking in its **left** subtree, and only if nothing is found there, in its **right** subtree (\`||\`).`, op: "isSubtree(root.left) || isSubtree(root.right)", act: "GO_LEFT",
        why: whyDown ? null : { title: "Why both children?", text: "The copy may be anywhere in the tree: below the left child or below the right child. The `||` tries the left side first and tries the right side only if the left side failed." } });
      whyDown = true;
      const l = sub(R.nodes[a].l);
      let res = l;
      if (!l) {
        T.step("down", { vars: { root: nmR(a), left: false }, state: S(a, null), say: "Nothing in the left subtree. Now look in the **right** subtree.", op: "false || isSubtree(root.right)", act: "GO_RIGHT" });
        res = sub(R.nodes[a].r);
      } else {
        T.step("down", { vars: { root: nmR(a), left: true }, state: S(null, null), say: "The left subtree contains `subRoot`, so `true || …` is `true` and the right subtree is **not searched**.", op: "true || …  →  true", act: "SHORT_CIRCUIT" });
      }
      f.ret = res; cs.pop();
      return res;
    }
    T.phase("Try every node as the top of a copy");
    const ans = sub(R.root);
    T.step("down", { vars: { "return": ans }, state: S(null, null), say: ans ? "The first call has returned `true`: `subRoot` is a subtree of `root`." : "Every node was tried and none matched: `subRoot` is **not** a subtree of `root`.", op: `return ${ans}`, act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) {
    const K = SHEETS.K, big = K.randomTree(rnd, 1 + Math.floor(rnd() * 7), 0, 2);
    if (rnd() < 0.4) { return { root: big, subRoot: big.length > 1 ? [big[0]] : big }; }
    return { root: big, subRoot: K.randomTree(rnd, 1 + Math.floor(rnd() * 3), 0, 2) };
  },
  gen(n) {
    const ch = (vals) => { const a = [vals[0]]; for (let i = 1; i < vals.length; i++) a.push(vals[i], null); return a; };
    const k = Math.max(2, n >> 1);
    return { root: ch(Array.from({ length: n }, () => 1)), subRoot: ch(Array.from({ length: k }, (_, i) => (i === k - 1 ? 2 : 1))) };
  },

  complexity: {
    time: {
      tex: "O(n \\cdot m)", title: "up to n candidates, each compared with at most m nodes", short: "n nodes in root, m nodes in subRoot",
      derive: [
        "\\#\\text{candidates} = n || every node of root is tried as a top",
        "\\text{one comparison } \\texttt{same} \\text{ visits at most } \\min(m, \\text{size of the candidate subtree}) \\le m \\text{ pairs} || it stops at the first difference and cannot go deeper than subRoot",
        "T(n, m) \\le n \\cdot (2m + 1)\\, c + (2n + 1)\\, c' || the comparisons plus the walk itself",
        "!T(n, m) = O(n \\cdot m) || reached when many candidates match almost all of subRoot before failing",
      ],
      where: "Here $n$ and $m$ are the sizes of `root` and `subRoot`. In most inputs a candidate fails at its first pair, so the cost is close to $O(n)$. The measured table uses the bad case: `root` is a chain of 1s and `subRoot` a chain of 1s ending in a 2, so each candidate walks nearly the length of `subRoot`.",
    },
    space: {
      tex: "O(h)", title: "the call stack of the walk plus the comparison", short: "h_root + h_sub frames at most",
      derive: [
        "\\text{depth of the walk} \\le h_{\\text{root}} + 1 || the outer recursion follows one path down root",
        "\\text{depth of one comparison} \\le h_{\\text{sub}} + 1 || the inner recursion follows one path down subRoot",
        "!S = O(h_{\\text{root}} + h_{\\text{sub}}) = O(h) || no strings or tables",
      ],
      where: "The serialising solution needs $O(n + m)$ for two strings. Reusing `same` means the only memory is the call stack.",
    },
    limit: "$O(n + m)$ is possible (serialise both trees and use KMP or a hash for the substring search, or hash every subtree), at the price of $O(n + m)$ extra memory. The recursive method trades a little time for constant extra space.",
    measure: { label: "n = nodes in root (a chain), subRoot has n/2 nodes", fTex: "n^2", f: (n) => n * n, sizes: [8, 16, 32, 64, 128], growth: "quadratic", reading: "Doubling both sizes multiplies the work by about **4**: each of the $n$ candidates compares up to $m = n/2$ nodes." },
  },

  mistakes: [
    { title: "Checking only the root value", what: "Returning `true` if some node has the same value as `subRoot->val`.", why: "A matching root *looks* like a match.", breaks: "`root = [1, 2]`, `subRoot = [1]` is reported as a subtree, although the node `1` has a child that `subRoot` does not.", avoid: "Compare the **whole** tree below the candidate with `same`." },
    { title: "Stopping at the first value match", what: "Calling `same` only on the first node whose value equals `subRoot`'s root.", why: "Values seem to identify nodes.", breaks: "With repeated values (`[1, 1]` and `[1]`) the first `1` fails but the second succeeds.", avoid: "Try **every** node as a candidate." },
    { title: "Using `&&` instead of `||` for the two branches", what: "`isSubtree(l) && isSubtree(r)`.", why: "Mixing up \"both sides\" (needed in `same`) with \"either side\" (needed here).", breaks: "`subRoot` has to be in *both* subtrees to be found.", avoid: "`||` here, `&&` inside `same`." },
    { title: "Forgetting the `null` check of the walk", what: "Calling `same(root, subRoot)` with `root == null` without returning first.", why: "`same` handles `null` nodes.", breaks: "The recursion never stops: it keeps calling `isSubtree(null->left …)` and crashes.", avoid: "`if (!root) return false;` at the top." },
    { title: "Serialising without separators", what: "Writing the values one after another (`\"12\"`, `\"2\"`) and using `find`.", why: "The strings look unambiguous for small digits.", breaks: "The tree with value `12` contains the text `2`, so `subRoot = [2]` is wrongly found.", avoid: "Put a separator before each value (`,12`) and mark `null` explicitly." },
  ],

  followUps: [
    {
      q: "Reach $O(n + m)$ with **serialisation and a linear-time substring search**.",
      a: "Serialise both trees in pre-order with a separator before every value and `#` for `null`, then search for the text of `subRoot` inside the text of `root` with KMP (or the Z-function / rolling hash). Building the texts is $O(n + m)$ and KMP is $O(n + m)$. The cost is $O(n + m)$ extra memory for the texts.",
      cpp: `bool isSubtreeKMP(TreeNode* root, TreeNode* sub) {
    function<void(TreeNode*, string&)> ser = [&](TreeNode* t, string& o) {
        if (!t) { o += ",#"; return; }
        o += "," + to_string(t->val);
        ser(t->left, o); ser(t->right, o);
    };
    string a, b;
    ser(root, a); ser(sub, b);
    vector<int> fail(b.size(), 0);
    for (int i = 1, k = 0; i < (int)b.size(); i++) {
        while (k && b[i] != b[k]) k = fail[k - 1];
        if (b[i] == b[k]) k++;
        fail[i] = k;
    }
    for (int i = 0, k = 0; i < (int)a.size(); i++) {
        while (k && a[i] != b[k]) k = fail[k - 1];
        if (a[i] == b[k]) k++;
        if (k == (int)b.size()) return true;
    }
    return false;
}`,
      js: `function isSubtreeKMP(root, sub) {
  const ser = (t) => (t ? "," + t.val + ser(t.left) + ser(t.right) : ",#");
  const a = ser(root), b = ser(sub);
  const fail = new Array(b.length).fill(0);
  for (let i = 1, k = 0; i < b.length; i++) {
    while (k && b[i] !== b[k]) k = fail[k - 1];
    if (b[i] === b[k]) k++;
    fail[i] = k;
  }
  for (let i = 0, k = 0; i < a.length; i++) {
    while (k && a[i] !== b[k]) k = fail[k - 1];
    if (a[i] === b[k]) k++;
    if (k === b.length) return true;
  }
  return false;
}`,
      time: "O(n + m)", space: "O(n + m)",
    },
    {
      q: "Make the comparison **cheaper** with subtree hashes.",
      a: "Compute for every node of both trees a hash of its subtree (from the value and the hashes of its two children, in post-order). `subRoot` is a subtree if its hash equals the hash of some node of `root` (then confirm with `same` to rule out a collision). It is $O(n + m)$ time with $O(n)$ stored hashes.",
      time: "O(n + m)", space: "O(n)",
    },
    {
      q: "Count how many times `subRoot` occurs as a subtree.",
      a: "Do not stop at the first success: add 1 whenever `same(node, subRoot)` is true and add the counts of the two children. Same complexity.",
      time: "O(n · m)", space: "O(h)",
    },
    {
      q: "Find the **lowest** (deepest) subtree that equals `subRoot`, if there is one.",
      a: "Search the children first, and test the node itself only if neither child's subtree contains a match (post-order instead of pre-order). The comparison function is the same.",
      time: "O(n · m)", space: "O(h)",
    },
  ],

  related: [
    { id: "same-tree", why: "The inner test: `isSubtree` is `isSameTree` tried at every node." },
    { id: "maximum-depth-of-binary-tree", why: "The simplest recursion on a tree; the outer walk here has the same shape." },
    { id: "serialize-and-deserialize-binary-tree", why: "The serialised-string approach is exactly the encoding developed there." },
    { id: "construct-binary-tree-from-preorder-and-inorder-traversal", why: "Another problem where a pre-order sequence with the right markers identifies a tree." },
  ],
  patternNote: "**A walk with a test at every node.** The outer recursion visits each node as a candidate root; the inner recursion answers a yes/no question about the tree that starts there. Candidates usually fail at once, so the total is close to linear. Remember `||` between candidates (any one will do) and `&&` inside the test (everything must match).",
  takeaways: [
    "A subtree is a node **with all its descendants**: compare the whole tree below a candidate, not just the root value.",
    "Try **every** node of `root` as a candidate (values may repeat): `same(root, sub) || left || right`.",
    "Reuse `isSameTree` (null checks first, `&&` over the two children) as the inner test.",
    "Time $O(n \\cdot m)$ worst case but usually near $O(n)$; space $O(h)$.",
    "For $O(n + m)$: serialise with separators and `null` markers and use KMP, or hash every subtree.",
  ],
});
