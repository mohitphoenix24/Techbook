SHEETS.define({
  id: "same-tree",
  viz: "recursion",
  io: { fn: "isSameTree", params: [["p", "tree"], ["q", "tree"]], ret: "bool", labels: { p: "p (tree in level order)", q: "q (tree in level order)" } },
  legend: [["cur", "the pair being compared"], ["ok", "pair already matched"], ["bad", "pair that differs"], ["win", "on the call path"]],

  statement: `Given the roots of two binary trees \`p\` and \`q\`, write a function to check if they are **the same** or not.

Two binary trees are considered the same if they are **structurally identical**, and the nodes have the **same value**.

*(In the lab, a tree is written in **level order**, row by row from left to right, with \`null\` for a missing child, for example \`[1, 2, 3]\`.)*`,
  examples: [
    { input: "p = [1, 2, 3], q = [1, 2, 3]", output: "true", explain: "Same shape and the same values at every position." },
    { input: "p = [1, 2], q = [1, null, 2]", output: "false", explain: "The values are the same, but in `p` the `2` is a **left** child and in `q` it is a **right** child: the structures differ." },
    { input: "p = [1, 2, 1], q = [1, 1, 2]", output: "false", explain: "The shapes agree, but the left children (2 and 1) have different values." },
  ],
  constraints: ["The number of nodes in both trees is in the range $[0, 100]$", "$-10^4 \\le$ `Node.val` $\\le 10^4$"],
  check(input) {
    const count = (a) => a.filter((x) => x !== null).length;
    if (count(input.p) > 9 || count(input.q) > 9) return "for the animation use at most 9 nodes in each tree";
    return null;
  },

  intuition: {
    find: "Whether the two trees have **exactly the same shape and exactly the same value at every position**. Position matters: the left child of one tree must be matched with the left child of the other.",
    beginner: "Turn each tree into a text by walking it (pre-order) and writing `null` for every missing child. Two trees are the same if and only if their texts are equal.",
    works: "A pre-order walk with explicit `null` markers records both the values and the shape, so equal texts mean identical trees and different texts mean different trees.",
    slow: "It is $O(n + m)$ in time, which is fine, but it builds two whole strings: $O(n + m)$ **extra memory**. It also always reads both trees completely, even when the roots already differ.",
    repeat: "Nothing is computed twice, but the texts are written only to be compared afterwards. The comparison could have happened *while* walking, and it could have stopped at the first difference.",
    remember: "Two trees are the same exactly when **their roots match and their left subtrees are the same and their right subtrees are the same**. That is the same question asked of smaller trees, which is what recursion is for.",
    observation: "Walk both trees **together**: compare the pair `(p, q)`. If both are empty, they match. If only one is empty, they differ. If the values differ, they differ. Otherwise the answer is `same(p.left, q.left) && same(p.right, q.right)`. The `&&` stops at the first difference, so nothing more is looked at.",
    leads: "`if (!p && !q) return true; if (!p || !q) return false; if (p->val != q->val) return false; return isSameTree(p->left, q->left) && isSameTree(p->right, q->right);` No extra memory except the call stack.",
  },

  flow: [
    "Serialise both trees with `null` markers and compare the two strings.",
    "The text records values and shape, so equality of texts is equality of trees.",
    "$O(n + m)$ time but two extra strings, and no early exit.",
    "Same trees = same roots + same left subtrees + same right subtrees.",
    "Walk the two trees together; stop at the first pair that differs.",
    "$O(\\min(n, m))$ time and $O(h)$ stack space, with no copies.",
  ],

  brute: {
    idea: "**Brute force:** write each tree as a string using a pre-order walk, with a marker such as `#` for every missing child, and with a separator after each value. Two trees are the same if and only if the two strings are equal.",
    why: "It is correct, and $O(n + m)$ in time, but it builds two complete strings in memory ($O(n + m)$) and walks both trees fully, even if the two roots already differ. The recursive comparison can stop at the first mismatch and needs no strings.",
    time: "O(n + m)", space: "O(n + m)",
    cpp: `class Solution {
    void ser(TreeNode* t, string& out) {
        if (!t) { out += "#,"; return; }
        out += to_string(t->val) + ",";
        ser(t->left, out);
        ser(t->right, out);
    }
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        string a, b;
        ser(p, a);
        ser(q, b);
        return a == b;
    }
};`,
    js: `function isSameTree(p, q) {
  const ser = (t) => (t ? t.val + "," + ser(t.left) + ser(t.right) : "#,");
  return ser(p) === ser(q);
}`,
  },

  pattern: {
    name: "Tree Recursion (two trees at once)",
    why: "A binary tree is a root plus two smaller binary trees, so most questions about a tree become *one comparison at the root* plus *the same question on the two children*. Walking **two** trees in step turns \"are they equal?\" into a pair of recursive calls on matching positions.",
    recognize: [
      "You must compare, merge or combine **two trees** position by position.",
      "A question about a tree can be answered from the answers for its left and right subtrees.",
      "An early exit is possible: the first difference decides the answer.",
      "The base cases are about `null` (empty) subtrees, which have to be handled before touching `->val`.",
    ],
  },

  optimal: {
    idea: "Compare the two trees node by node, with a recursive function on a pair `(p, q)`. If both nodes are `null` the (empty) subtrees are the same. If exactly one is `null`, or the values differ, they are different. Otherwise the subtrees are the same exactly when the left subtrees are the same **and** the right subtrees are the same.",
    steps: [
      "If `p` and `q` are both `null`: return `true`.",
      "If exactly one of them is `null`: return `false`.",
      "If `p.val != q.val`: return `false`.",
      "Return `isSameTree(p.left, q.left) && isSameTree(p.right, q.right)`.",
    ],
    invariant: "**`isSameTree(p, q)` returns `true` if and only if the subtree rooted at `p` and the subtree rooted at `q` have identical shape and identical values.**",
    correct: "By induction on the total number of nodes in the two subtrees. If both are empty they are identical (the base case). If exactly one is empty their shapes differ. If both exist and the values differ, they are not identical. If both exist with equal values, two trees are identical exactly when their left subtrees are identical and their right subtrees are identical (the root contributes nothing else); both smaller subtree pairs are decided correctly by the induction hypothesis, so the `&&` of the two answers is correct. The short-circuit only skips the right pair when the left pair already differs, which already makes the answer `false`.",
  },

  cpp: `class Solution {
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        if (!p && !q) return true;              // both empty: same //@bothNull
        if (!p || !q) return false;             // only one is empty: different //@oneNull
        if (p->val != q->val) return false;     // values differ //@val
        return isSameTree(p->left, q->left) && isSameTree(p->right, q->right);   // both sides must match //@recurse
    }
};`,
  js: `function isSameTree(p, q) {
  if (!p && !q) return true;             // both empty: same //@bothNull
  if (!p || !q) return false;            // only one is empty: different //@oneNull
  if (p.val !== q.val) return false;     // values differ //@val
  return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);   // both sides must match //@recurse
}`,

  tests: [
    { name: "Example 1: identical trees", kind: "normal", input: { p: [1, 2, 3], q: [1, 2, 3] } },
    { name: "Example 2: same values, different shape", kind: "normal", input: { p: [1, 2], q: [1, null, 2] } },
    { name: "Example 3: same shape, different values", kind: "normal", input: { p: [1, 2, 1], q: [1, 1, 2] } },
    { name: "Both trees empty", kind: "edge", input: { p: [], q: [] }, why: "Both roots are `null`, so the very first check returns `true`: two empty trees are the same. The order of the checks matters: testing `p->val` first would crash." },
    { name: "One tree empty", kind: "edge", input: { p: [], q: [1] }, why: "`p` is `null` but `q` is not, so the shapes differ and the second check returns `false` before any `->val` is read." },
    { name: "Single equal nodes", kind: "edge", input: { p: [5], q: [5] }, why: "The values match; the recursive calls compare four `null` children and all return `true`." },
    { name: "Single different nodes", kind: "edge", input: { p: [5], q: [6] }, why: "The roots already differ, so the function returns `false` at the value check and never makes a recursive call." },
    { name: "A difference deep at the bottom", kind: "corner", input: { p: [1, 2, 3, 4], q: [1, 2, 3, 5] }, why: "Everything matches down to the leaves of the left subtree, where `4` meets `5`. The mismatch travels back up through `&&`, and the right subtree (3 against 3) is never examined." },
    { name: "Mirror images", kind: "corner", input: { p: [1, 2, 3], q: [1, 3, 2] }, why: "The two trees contain the same values, but mirrored. Position matters: the left children `2` and `3` differ, so the answer is `false`. A solution that compared sorted values or sets would say `true`." },
    { name: "A missing leaf on one side only", kind: "corner", input: { p: [1, 2, 3, null, 4], q: [1, 2, 3] }, why: "Down the left subtree, `p` has a right child `4` where `q` has none (`null`). The `oneNull` check catches this: exactly one of the pair is empty." },
  ],

  trace(input, T, K) {
    const P = K.tree(input.p), Q = K.tree(input.q);
    const cs = K.callStack();
    const okP = {}, okQ = {};
    let whyOne = false, whyVal = false, whyAnd = false;
    const nm = (T_, id) => (id == null ? "null" : T_.nodes[id].v);
    const S = (cur, bad) => () => {
      const hp = {}, hq = {};
      for (const id in okP) hp[id] = "ok";
      for (const id in okQ) hq[id] = "ok";
      if (cur) { if (cur[0] != null) hp[cur[0]] = bad ? "bad" : "cur"; if (cur[1] != null) hq[cur[1]] = bad ? "bad" : "cur"; }
      return { trees: [{ label: "p", nodes: P.nodes, root: P.root, hl: hp }, { label: "q", nodes: Q.nodes, root: Q.root, hl: hq }], calls: cs.snapshot(), gy: 62 };
    };
    const argText = (a, b) => `p=${nm(P, a)}, q=${nm(Q, b)}`;
    function same(a, b, via) {
      const f = cs.push("isSameTree", argText(a, b), "", "");
      const bothNull = a == null && b == null;
      T.step("bothNull", { vars: { p: nm(P, a), q: nm(Q, b) }, state: S([a, b]), say: bothNull ? "A call for a pair of **`null`** children: both subtrees are empty. Two empty trees are the same, so return `true`." : `A new call for the pair (**${nm(P, a)}**, **${nm(Q, b)}**). Are both of them \`null\`? No, so keep checking.`, op: `!p && !q  →  ${bothNull}`, act: bothNull ? "BOTH_EMPTY" : "CALL" });
      if (bothNull) { f.ret = true; cs.pop(); return true; }
      const one = a == null || b == null;
      T.step("oneNull", { vars: { p: nm(P, a), q: nm(Q, b) }, state: S([a, b], one), say: one ? `Only **${a == null ? "p" : "q"}** is empty here: one tree has a node where the other has none, so the **shapes differ**. Return \`false\`.` : "Neither is empty: both trees have a node at this position. Now compare the values.", op: `!p || !q  →  ${one}`, act: one ? "SHAPE_DIFFERS" : "BOTH_EXIST",
        why: one && !whyOne ? { title: "Why test for null before the value?", text: "Reading `p->val` on a `null` pointer would crash. The two `null` checks come first, so by the time we read a value both nodes are known to exist." } : null });
      if (one) { whyOne = true; f.ret = false; cs.pop(); return false; }
      const eq = P.nodes[a].v === Q.nodes[b].v;
      T.step("val", { vars: { "p.val": P.nodes[a].v, "q.val": Q.nodes[b].v }, state: S([a, b], !eq), say: eq ? `Both values are **${P.nodes[a].v}**: the roots of this pair match.` : `The values differ (**${P.nodes[a].v}** against **${Q.nodes[b].v}**): the trees are not the same. Return \`false\`.`, op: `p->val != q->val  →  ${P.nodes[a].v} != ${Q.nodes[b].v}  →  ${!eq}`, act: eq ? "VALUES_MATCH" : "VALUE_DIFFERS",
        why: !eq && !whyVal ? { title: "One difference is enough", text: "Two trees are the same only if *every* position matches. As soon as one pair differs, the answer is `false` for everything above it too, so there is no need to look at the rest." } : null });
      if (!eq) { whyVal = true; f.ret = false; cs.pop(); return false; }
      T.step("recurse", { vars: { p: P.nodes[a].v, q: Q.nodes[b].v }, state: S([a, b]), say: `The roots match, so the trees are the same exactly when the **left** subtrees are the same **and** the **right** subtrees are the same. Compare the left pair first.`, op: "isSameTree(p.left, q.left) && isSameTree(p.right, q.right)", act: "GO_LEFT" });
      const l = same(P.nodes[a].l, Q.nodes[b].l);
      let res;
      if (!l) {
        T.step("recurse", { vars: { left: false }, state: S([a, b], true), say: "The left subtrees are **different**, so `false && …` is `false` whatever the right side holds: the right subtrees are **not even visited**. Return `false`.", op: "false && …  →  false (short-circuit)", act: "SHORT_CIRCUIT",
          why: whyAnd ? null : { title: "Why does && skip the right side?", text: "In C++ and JavaScript `A && B` evaluates `B` only if `A` is true. Once the left subtrees differ, the answer is already known, so the right subtrees are skipped: this is the early exit." } });
        whyAnd = true; res = false;
      } else {
        T.step("recurse", { vars: { left: true }, state: S([a, b]), say: "The left subtrees are the same. Now compare the **right** pair.", op: "true && isSameTree(p.right, q.right)", act: "GO_RIGHT" });
        const r = same(P.nodes[a].r, Q.nodes[b].r);
        res = r;
        T.step("recurse", { vars: { left: true, right: r }, state: S([a, b], !r), say: r ? "Both the left and the right subtrees are the same: return `true`." : "The right subtrees are different: return `false`.", op: `true && ${r}  →  ${r}`, act: r ? "RETURN_TRUE" : "RETURN_FALSE" });
      }
      if (res) { okP[a] = true; okQ[b] = true; }
      f.ret = res; cs.pop();
      return res;
    }
    T.phase("Compare the two trees together");
    const ans = same(P.root, Q.root);
    T.step("recurse", { vars: { "return": ans }, state: S(null), say: ans ? "The first call has returned `true`: the two trees are **the same**." : "The first call has returned `false`: the two trees are **different**.", op: `return ${ans}`, act: "DONE" });
    T.result(ans);
  },
  fuzz(rnd) {
    const a = SHEETS.K.randomTree(rnd, Math.floor(rnd() * 7), 0, 2);
    if (rnd() < 0.4) return { p: a, q: a.slice() };
    return { p: a, q: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 7), 0, 2) };
  },
  gen(n) { return { p: SHEETS.K.chain(n, "l"), q: SHEETS.K.chain(n, "l") }; },

  complexity: {
    time: {
      tex: "O(\\min(n, m))", title: "one call per pair of nodes that exist in both trees", short: "at most 2·min(n, m) + 1 calls, each doing O(1) work",
      derive: [
        "\\text{each call compares one pair; it recurses only if both nodes exist and match} || the recursion follows the part where the trees overlap",
        "\\#\\text{calls} \\le 2k + 1 \\;\\text{ where } k = \\#\\text{pairs of existing matching nodes} \\le \\min(n, m) || every matched pair makes at most two child calls",
        "T(n, m) \\le (2\\min(n, m) + 1)\\, c || constant work per call: two null tests, one comparison",
        "!T(n, m) = O(\\min(n, m)) || and often much less, since the first difference stops the walk",
      ],
      where: "Here $n$ and $m$ are the numbers of nodes of $p$ and $q$. When the two trees are identical every node is visited (the worst case) and the work is linear in $n$; the measured table uses two identical chains. A difference near the root ends the whole thing early.",
    },
    space: {
      tex: "O(h)", title: "the call stack follows one path down both trees", short: "h = the smaller of the two heights",
      derive: [
        "\\text{stack depth} \\le \\min(h_p, h_q) + 1 || the calls go down both trees in step, and stop where one ends",
        "S = O(\\min(h_p, h_q)) || only the chain of ancestors is stored",
        "!S = O(h) \\;\\Rightarrow\\; O(\\log n) \\text{ balanced},\\; O(n) \\text{ for a chain} || no other memory",
      ],
      where: "The serialising solution needs two strings of size $O(n + m)$ on top of the stack; the direct comparison uses only the stack.",
    },
    limit: "To be sure two trees are the same, every node must be examined at least once, so $\\Omega(n)$ is needed in the worst case (when they are equal). The recursion is optimal.",
    measure: { label: "n = number of nodes in each tree (a chain)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Reading `->val` before the null checks", what: "`if (p->val != q->val) return false;` as the first line.", why: "The value comparison is the \"real\" test.", breaks: "A `null` child gives a null dereference: crash in C++, `TypeError` in JavaScript.", avoid: "Handle the `null` cases first: both null → `true`, exactly one null → `false`." },
    { title: "Treating a single `null` as equal", what: "`if (!p || !q) return true;`", why: "\"One of them is empty, nothing to compare\".", breaks: "A node on one side with no counterpart on the other makes the trees different: `[1,2]` and `[1]` would be the same.", avoid: "Both null → `true`; exactly one null → `false`." },
    { title: "Using `||` instead of `&&`", what: "`return isSameTree(l, l) || isSameTree(r, r);`", why: "Mixing up \"either side\" with \"both sides\".", breaks: "Trees that match on one side only are reported as the same.", avoid: "Both subtrees must match: `&&`." },
    { title: "Comparing only the values", what: "Collecting the values of both trees (in-order or as sets) and comparing.", why: "Equal values look like equal trees.", breaks: "`[1,2]` and `[1,null,2]` have the same values in the same order but different shapes.", avoid: "Compare position by position: left with left and right with right (or serialise with `null` markers)." },
    { title: "Matching the left child of `p` with the right child of `q`", what: "`isSameTree(p->left, q->right)`.", why: "Confusing this problem with *Symmetric Tree*.", breaks: "Mirrored trees are accepted as equal.", avoid: "Left with left, right with right." },
  ],

  followUps: [
    {
      q: "Check whether a tree is **symmetric** (a mirror image of itself).",
      a: "Almost the same function, but compare `p.left` with `q.right` and `p.right` with `q.left`. Start with the pair `(root.left, root.right)`. The null checks and the value check are unchanged.",
      cpp: `bool mirror(TreeNode* a, TreeNode* b) {
    if (!a && !b) return true;
    if (!a || !b || a->val != b->val) return false;
    return mirror(a->left, b->right) && mirror(a->right, b->left);
}
bool isSymmetric(TreeNode* root) { return !root || mirror(root->left, root->right); }`,
      js: `function mirror(a, b) {
  if (!a && !b) return true;
  if (!a || !b || a.val !== b.val) return false;
  return mirror(a.left, b.right) && mirror(a.right, b.left);
}
function isSymmetric(root) { return !root || mirror(root.left, root.right); }`,
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Do it **iteratively**, without recursion.",
      a: "Keep a stack (or queue) of pairs of nodes. Pop a pair; apply the same three tests; if both nodes exist and match, push the pair of left children and the pair of right children. Return `false` at the first failure, and `true` when the stack is empty. The explicit stack replaces the call stack, so a very deep tree cannot overflow it.",
      time: "O(n)", space: "O(h)",
    },
    {
      q: "Is `q` a **subtree** of `p`? (the next problem on the sheet)",
      a: "Try every node of `p` as a possible root and ask `isSameTree(node, q)`. That costs $O(n \\cdot m)$ in the worst case. It reuses this function exactly as written.",
      time: "O(n · m)", space: "O(h)",
    },
    {
      q: "Compare the trees **ignoring the left/right order** of children (isomorphic trees).",
      a: "Two nodes match if their values are equal and *either* (left↔left and right↔right) *or* (left↔right and right↔left) match. That adds a second recursive pairing, so the work can multiply: in the worst case it needs memoisation or a canonical form (sort the children's serialisations).",
      time: "O(n log n) with canonical forms", space: "O(n)",
    },
  ],

  related: [
    { id: "subtree-of-another-tree", why: "Applies `isSameTree` at every node of the bigger tree." },
    { id: "invert-binary-tree", why: "Another two-child recursion: swap the children instead of comparing them." },
    { id: "maximum-depth-of-binary-tree", why: "The simplest tree recursion: `1 + max(left, right)`." },
    { id: "serialize-and-deserialize-binary-tree", why: "The brute force here is exactly a serialisation, which that problem builds in full." },
  ],
  patternNote: "**Tree recursion on a pair.** Solve the question for one pair of matching nodes (null checks first, then the value) and delegate the rest to the same function on the two child pairs. `&&` gives an early exit, so the walk ends at the first difference and the extra memory is only the call stack.",
  takeaways: [
    "Same tree = same shape **and** same values: compare position by position (left with left, right with right).",
    "Null checks first: both null → `true`; exactly one null → `false`; then compare the values.",
    "Combine the two subtree answers with `&&`: the first difference stops everything.",
    "Comparing values or sets alone misses shape differences; serialising with `null` markers works but costs memory.",
    "Time $O(\\min(n, m))$, space $O(h)$ for the call stack.",
  ],
});
