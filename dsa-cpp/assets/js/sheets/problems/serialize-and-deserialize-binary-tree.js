SHEETS.define({
  id: "serialize-and-deserialize-binary-tree",
  viz: "tree",
  io: {
    fn: "Codec", params: [["root", "tree"]], ret: "tree", labels: { root: "root (the tree to send, level order)" },
    design: {
      cpp: `
int main() {
    TreeNode* root = mkTree(readJ());
    Codec codec;
    string wire = codec.serialize(root);              // the tree as one string
    TreeNode* back = codec.deserialize(wire);         // the receiver rebuilds it
    string o; pj(treeJ(back), o); cout << o << "\\n";
}
`,
      js: (a) => `(function () {
const __a = ${a};
const root = __mkTree(__a[0]);
const codec = new Codec();
const wire = codec.serialize(root);
return JSON.stringify(__treeJ(codec.deserialize(wire)));
})()`,
    },
  },
  legend: [["cur", "node being written / created"], ["win", "on the call path"], ["ok", "already written / created"]],

  statement: `Serialization is the process of converting a data structure or object into a sequence of bits so that it can be stored in a file or memory buffer, or transmitted across a network connection link to be reconstructed later in the same or another computer environment.

Design an algorithm to **serialize and deserialize a binary tree**. There is no restriction on how your serialization/deserialization algorithm should work. You just need to ensure that a binary tree can be serialized to a string and this string can be deserialized to the **original tree structure**.

Implement \`serialize(root)\` (tree → string) and \`deserialize(data)\` (string → tree). The lab runs both one after the other and checks that the tree you get back is identical to the tree you sent.

*(In the lab, a tree is written in **level order**, row by row from left to right, with \`null\` for a missing child.)*`,
  examples: [
    { input: "root = [1, 2, 3, null, null, 4, 5]", output: "[1, 2, 3, null, null, 4, 5]", explain: "One possible wire format is the pre-order `1,2,#,#,3,4,#,#,5,#,#` (`#` = empty subtree). Decoding it returns the same tree." },
    { input: "root = []", output: "[]", explain: "The empty tree serialises to `#,` and decodes back to the empty tree." },
  ],
  constraints: ["The number of nodes in the tree is in the range $[0, 10^4]$", "$-1000 \\le$ `Node.val` $\\le 1000$"],
  check(input) { return input.root.filter((x) => x !== null).length > 8 ? "for the animation use at most 8 nodes" : null; },

  intuition: {
    find: "A string that contains **enough to rebuild the exact tree**: the values *and* the shape (which child is missing where), so that the receiver, who sees only the string, gets the identical tree.",
    beginner: "Walk the tree level by level with a queue. Write each value (and `null` for every missing child, including the children of missing nodes that sit in the queue). To decode, read the tokens in order and attach them as the left and right children of the nodes waiting in a queue.",
    works: "Level order with explicit `null`s records the shape completely, and the decoder follows the same queue discipline, so the tree comes back unchanged.",
    slow: "It is $O(n)$ and correct, so it is not slow. But both directions need a **queue** and the decoder needs careful index bookkeeping: *which token belongs to which node?* (two tokens per node taken from the queue). It is easy to get off by one.",
    repeat: "Nothing is repeated, but the format ties each token to a queue position, which makes the decoder harder than it needs to be.",
    remember: "A recursive structure can be written by a recursive procedure and read by the **mirror-image** procedure. In a **pre-order** walk (node, left subtree, right subtree), if every missing child is recorded as a marker `#`, the sequence tells you at every point exactly what comes next: a value starts a node, a marker ends a branch.",
    observation: "**Serialise**: `write(node)`: if the node is empty write `#`; otherwise write its value, then `write(left)`, then `write(right)`. **Deserialise**: read tokens from left to right with a shared position: `read()`: take the next token; if it is `#` return null; otherwise create a node, set `left = read()`, then `right = read()`. The two procedures visit the nodes in exactly the same order, so they stay in step.",
    leads: "Encoder: `\"#,\"` for `null`, else `val + \",\"` followed by the encodings of the left and right subtrees. Decoder: split on commas, keep an index `i`, and rebuild recursively with the same order. $O(n)$ time and space.",
  },

  flow: [
    "Write the tree level by level with `null` markers; rebuild with a queue and index bookkeeping.",
    "Level order with `null`s fixes the shape completely.",
    "$O(n)$, but both directions need queues and delicate indexing.",
    "A recursive structure is written by a recursion and read by its mirror image.",
    "Pre-order with `#` for empty subtrees: the token stream tells the decoder exactly what is next.",
    "Encoder and decoder are almost the same function: $O(n)$ time, $O(n)$ space.",
  ],

  brute: {
    idea: "**Alternative: level-order (BFS) format.** Serialise with a queue: write each node's value, or `#` for a missing node, and enqueue both children (even missing ones). Deserialise with a queue of parents: for each queued node, the next two tokens are its left and right children.",
    why: "This also works in $O(n)$ time and space, so it is not asymptotically worse, but both directions need a queue, the decoder must keep an index into the tokens and remember to skip the missing children, and the trailing run of `#`s adds extra tokens. The pre-order version needs no queue and its decoder mirrors the encoder.",
    time: "O(n)", space: "O(n)",
    cpp: `class Codec {
public:
    string serialize(TreeNode* root) {
        string out;
        queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {
            TreeNode* n = q.front(); q.pop();
            if (!n) { out += "#,"; continue; }
            out += to_string(n->val) + ",";
            q.push(n->left);
            q.push(n->right);
        }
        return out;
    }
    TreeNode* deserialize(string data) {
        vector<string> tok;
        stringstream ss(data);
        string x;
        while (getline(ss, x, ',')) tok.push_back(x);
        if (tok.empty() || tok[0] == "#") return nullptr;
        TreeNode* root = new TreeNode(stoi(tok[0]));
        queue<TreeNode*> q;
        q.push(root);
        size_t i = 1;
        while (!q.empty() && i < tok.size()) {
            TreeNode* n = q.front(); q.pop();
            if (tok[i] != "#") { n->left = new TreeNode(stoi(tok[i])); q.push(n->left); }
            i++;
            if (i < tok.size() && tok[i] != "#") { n->right = new TreeNode(stoi(tok[i])); q.push(n->right); }
            i++;
        }
        return root;
    }
};`,
    js: `class Codec {
  serialize(root) {
    const out = [], q = [root];
    for (let h = 0; h < q.length; h++) {
      const n = q[h];
      if (!n) { out.push("#"); continue; }
      out.push(String(n.val));
      q.push(n.left, n.right);
    }
    return out.join(",");
  }
  deserialize(data) {
    const tok = data.split(",");
    if (!data.length || tok[0] === "#") return null;
    const root = new TreeNode(Number(tok[0]));
    const q = [root];
    let i = 1;
    for (let h = 0; h < q.length && i < tok.length; h++) {
      const n = q[h];
      if (tok[i] !== "#") { n.left = new TreeNode(Number(tok[i])); q.push(n.left); }
      i++;
      if (i < tok.length && tok[i] !== "#") { n.right = new TreeNode(Number(tok[i])); q.push(n.right); }
      i++;
    }
    return root;
  }
}`,
  },

  pattern: {
    name: "Design (pre-order with null markers)",
    why: "A pre-order walk with an explicit marker for every empty subtree is **self-delimiting**: reading the tokens in order, the decoder always knows whether a token starts a node or ends a branch. Encoder and decoder are the same recursion run in two directions, which keeps them in step by construction.",
    recognize: [
      "A tree (or any recursive structure) must be **flattened to a string/array and rebuilt exactly**.",
      "A single traversal is enough if the **empty positions are recorded** too.",
      "The decoder gets only the string, so the format must tell it how to proceed.",
      "The decoder consumes tokens with one shared position, mirroring the order of the encoder.",
    ],
  },

  optimal: {
    idea: "**Serialise** with a recursive pre-order walk: for an empty subtree write the marker `#`; otherwise write the node's value, then serialise the left subtree, then the right subtree. Separate tokens with commas. **Deserialise** by splitting on commas and reading the tokens left to right with a shared index `i`: read one token; if it is `#`, return `null`; else create a node from it, set its left child by recursing, then its right child by recursing, and return it.",
    steps: [
      "**serialize(node):** if `node` is `null`, append `\"#,\"` and return.",
      "Append `node.val` followed by a comma.",
      "Serialise `node.left`, then `node.right`.",
      "**deserialize(data):** split `data` on commas into tokens; set `i = 0`.",
      "**build():** take `t = tokens[i++]`; if `t == \"#\"` return `null`.",
      "Create `node` with `val = t`; set `node.left = build()`, then `node.right = build()`; return `node`.",
    ],
    invariant: "**The sequence of tokens written for a subtree is exactly the sequence that `build()` consumes to rebuild that subtree, and consuming it leaves `i` at the first token after it.**",
    correct: "By induction on the size of the subtree. For an empty subtree the encoder writes the single token `#`, and the decoder reads that token and returns `null`, consuming exactly one token. For a node with value $v$ and subtrees $L$ and $R$ the encoder writes $v$, then the tokens of $L$, then the tokens of $R$. The decoder reads $v$ (not `#`, because values are numbers) and creates the node; then, by the hypothesis, the first recursive `build()` consumes exactly the tokens of $L$ and returns it, leaving `i` at the start of the tokens of $R$, which the second `build()` consumes. So the decoder returns a node with the same value and, recursively, identical subtrees: the original tree. Every token is read once, so the decoder takes time proportional to the number of tokens, which is $2n + 1$.",
  },

  cpp: `class Codec {
public:
    string serialize(TreeNode* root) {
        string out;                             //@sInit
        function<void(TreeNode*)> go = [&](TreeNode* t) {
            if (!t) { out += "#,"; return; }    // an empty subtree is written as # //@sNull
            out += to_string(t->val) + ",";     // the value first //@sVal
            go(t->left);                        //@sLeft
            go(t->right);                       //@sRight
        };
        go(root);
        return out;                             //@sRet
    }
    TreeNode* deserialize(string data) {
        vector<string> tok;                     // split on commas
        stringstream ss(data); string x;
        while (getline(ss, x, ',')) tok.push_back(x);   //@dInit
        int i = 0;
        function<TreeNode*()> build = [&]() -> TreeNode* {
            string t = tok[i++];                // the next token //@dTake
            if (t == "#") return nullptr;       // an empty subtree //@dNull
            TreeNode* n = new TreeNode(stoi(t));   // a real node //@dNode
            n->left = build();                  // its left subtree comes next //@dLeft
            n->right = build();                 // then its right subtree //@dRight
            return n;                           //@dRet
        };
        return build();                         //@dStart
    }
};`,
  js: `class Codec {
  serialize(root) {
    const out = [];                      //@sInit
    const go = (t) => {
      if (!t) { out.push("#"); return; } // an empty subtree is written as # //@sNull
      out.push(String(t.val));           // the value first //@sVal
      go(t.left);                        //@sLeft
      go(t.right);                       //@sRight
    };
    go(root);
    return out.join(",");                //@sRet
  }
  deserialize(data) {
    const tok = data.split(",");         // split on commas //@dInit
    let i = 0;
    const build = () => {
      const t = tok[i++];                // the next token //@dTake
      if (t === "#") return null;        // an empty subtree //@dNull
      const n = new TreeNode(Number(t)); // a real node //@dNode
      n.left = build();                  // its left subtree comes next //@dLeft
      n.right = build();                 // then its right subtree //@dRight
      return n;                          //@dRet
    };
    return build();                      //@dStart
  }
}`,

  tests: [
    { name: "Example 1: [1, 2, 3, null, null, 4, 5]", kind: "normal", input: { root: [1, 2, 3, null, null, 4, 5] } },
    { name: "Example 2: an empty tree", kind: "normal", input: { root: [] } },
    { name: "A perfect tree of 7 nodes", kind: "normal", input: { root: [1, 2, 3, 4, 5, 6, 7] } },
    { name: "A single node", kind: "edge", input: { root: [1] }, why: "The wire format is `1,#,#,`: the value and two empty subtrees. The decoder reads `1`, then two `#` tokens, and the index ends exactly at the end of the token list." },
    { name: "A left chain", kind: "edge", input: { root: [1, 2, null, 3] }, why: "Every node has only a left child, so the format is `1,2,3,#,#,#,#,`: the right-hand `#`s pile up at the end. The decoder's recursion goes as deep as the tree." },
    { name: "A right chain", kind: "edge", input: { root: [1, null, 2, null, 3] }, why: "Here each node writes its left `#` immediately: `1,#,2,#,3,#,#,`. The marker before each value tells the decoder that there is no left child, so the next value is a right child." },
    { name: "Negative values and zero", kind: "edge", input: { root: [0, -1, -2] }, why: "A `-` inside a token is part of the number, not a separator. Only the comma separates tokens, and `#` can never be mistaken for a value." },
    { name: "Multi-digit values", kind: "corner", input: { root: [10, 20, 30] }, why: "Tokens are separated by commas, so `10` is read as one value, not as `1` followed by `0`. A format without separators would be ambiguous." },
    { name: "Repeated values", kind: "corner", input: { root: [1, 1, 1] }, why: "Many designs (such as pre-order plus inorder) need unique values. This format records the shape directly, so equal values are no problem." },
    { name: "A tree with a gap in the middle", kind: "corner", input: { root: [1, 2, 3, null, 4] }, why: "The node `2` has no left child but has a right child `4`. The `#` before `4` tells the decoder that `4` is a **right** child: the markers carry the shape." },
  ],

  trace(input, T, K) {
    const A = K.tree(input.root);
    const cs = K.callStack();
    const tokens = [];
    const pathS = [], doneS = {};
    let whyNull = false, whyOrder = false, whyDec = false, whyMirror = false;
    const q = (v) => (v == null ? "#" : String(v));
    const SE = (cur) => () => {
      const hl = {};
      pathS.forEach((id) => (hl[id] = "win"));
      for (const id in doneS) hl[id] = "ok";
      if (cur != null) hl[cur] = "cur";
      return { nodes: A.nodes, root: A.root, hl, calls: cs.snapshot(), gy: 62, label: "the tree to send", out: { label: "serialised so far", items: tokens.slice(), cw: 36 } };
    };
    T.step("sInit", { vars: { tokens: 0 }, state: SE(null), phase: "Serialise: pre-order, # for empty", say: "We write the tree as a list of tokens. A **pre-order** walk visits a node, then its left subtree, then its right subtree, and an empty subtree is written as **#** so that the shape is not lost.", op: 'out = ""', act: "START_ENCODE" });
    function go(id) {
      const f = cs.push("go", id == null ? "null" : `node=${A.nodes[id].v}`, "", "");
      if (id == null) {
        tokens.push("#");
        T.step("sNull", { vars: { node: "null", token: "#" }, state: SE(null), say: "An **empty** subtree: write the marker **#**. It records \"nothing is here\", so the decoder will know that a branch ends.", op: 'if (!t) { out += "#,"; return; }', act: "WRITE_MARKER",
          why: whyNull ? null : { title: "Why write the empty subtrees?", text: "Without markers, `1,2,3` could be a chain or a balanced tree: the values alone do not say where the children are missing. The `#` tokens fix the shape, so the decoder can rebuild the tree uniquely." } });
        whyNull = true; f.ret = "#"; cs.pop(); return;
      }
      const v = A.nodes[id].v;
      pathS.push(id);
      tokens.push(String(v));
      T.step("sVal", { vars: { node: v, token: v }, state: SE(id), say: `Node **${v}**: write its value **${v}** first (pre-order visits the node before its subtrees).`, op: `out += to_string(${v}) + ","`, act: "WRITE_VALUE",
        why: whyOrder ? null : { title: "Why node, then left, then right?", text: "The decoder will read the tokens in this same order. A fixed order (always left subtree before right subtree) is what lets it know which `#` belongs to which child." } });
      whyOrder = true;
      T.step("sLeft", { vars: { node: v }, state: SE(id), say: `Now write the **left** subtree of ${v}.`, op: "go(t->left)", act: "GO_LEFT" });
      go(A.nodes[id].l);
      T.step("sRight", { vars: { node: v }, state: SE(id), say: `The left subtree of ${v} is written. Now write the **right** subtree.`, op: "go(t->right)", act: "GO_RIGHT" });
      go(A.nodes[id].r);
      pathS.pop(); doneS[id] = true; f.ret = "done"; cs.pop();
    }
    go(A.root);
    const wire = tokens.join(",") + ",";
    T.step("sRet", { vars: { "return": wire }, state: SE(null), say: `Serialisation is finished: the tree is the string **“${wire}”** (${tokens.length} token${tokens.length === 1 ? "" : "s"}: ${tokens.filter((x) => x !== "#").length} value${tokens.filter((x) => x !== "#").length === 1 ? "" : "s"} and ${tokens.filter((x) => x === "#").length} marker${tokens.filter((x) => x === "#").length === 1 ? "" : "s"}). This string is all that the receiver gets.`, op: "return out", act: "SEND",
      why: { title: "How many tokens?", text: "A tree with $n$ nodes has exactly $n + 1$ empty child positions, so the string has $n$ values and $n + 1$ markers: $2n + 1$ tokens. The cost is linear." } });
    // ------------------------------------------------------------------ decode
    const B = {}; let bid = 0, i = 0, root2 = null;
    const pathD = [], doneD = {};
    const SD = (cur, note) => () => {
      const hl = {};
      pathD.forEach((id) => (hl[id] = "win"));
      for (const id in doneD) hl[id] = "ok";
      if (cur != null) hl[cur] = "cur";
      const th = {}; for (let k = 0; k < i; k++) th[k] = "ok"; if (i < tokens.length) th[i] = "cur";
      return { nodes: JSON.parse(JSON.stringify(B)), root: root2, hl, calls: cs.snapshot(), gy: 62, label: "the tree rebuilt by the receiver",
        arrs: [{ label: "tokens  (next one to read is highlighted)", arr: tokens, hl: th, ptr: i < tokens.length ? { i } : {} }], note };
    };
    T.phase("Deserialise: read the tokens in the same order");
    T.step("dInit", { w: tokens.length, vars: { tokens: tokens.length, i: 0 }, state: SD(null), say: `The receiver splits the string on commas into **${tokens.length}** tokens and keeps one shared position \`i\`, starting at 0.`, op: "tok = split(data, ',');  i = 0", act: "START_DECODE" });
    function build() {
      const f = cs.push("build", `i=${i}`, "", "");
      const t = tokens[i++];
      T.step("dTake", { vars: { token: t, i }, state: SD(null), say: `Read token **${t}** (and move \`i\` to ${i}).`, op: `t = tok[i++]  →  "${t}"`, act: "READ_TOKEN" });
      if (t === "#") {
        T.step("dNull", { vars: { token: "#" }, state: SD(null), say: "It is **#**: an empty subtree. Return `null`; this branch ends here.", op: 't == "#"  →  return nullptr', act: "EMPTY_SUBTREE" });
        f.ret = "null"; cs.pop(); return null;
      }
      const id = "r" + bid++;
      B[id] = { v: Number(t), l: null, r: null };
      if (root2 == null) root2 = id;
      pathD.push(id);
      T.step("dNode", { vars: { token: t }, state: SD(id), say: `It is a value, so create a node with value **${t}**. Its left subtree is described by the tokens that come next.`, op: `n = new TreeNode(${t})`, act: "CREATE_NODE",
        why: whyDec ? null : { title: "Why does this work?", text: "The decoder visits the nodes in the same order as the encoder wrote them: node, left subtree, right subtree. After creating a node, the next tokens *must* be its left subtree, so `build()` can simply call itself." } });
      whyDec = true;
      T.step("dLeft", { vars: { node: t }, state: SD(id), say: `Build the **left** subtree of ${t} from the next tokens.`, op: "n->left = build()", act: "GO_LEFT" });
      B[id].l = build();
      T.step("dRight", { vars: { node: t, i }, state: SD(id), say: `The left subtree of ${t} is rebuilt, and \`i\` = ${i} now points at the first token of the right subtree. Build the **right** subtree.`, op: "n->right = build()", act: "GO_RIGHT",
        why: whyMirror ? null : { title: "Why does `i` land in the right place?", text: "The left call consumed exactly the tokens the encoder wrote for the left subtree (one more than twice its nodes). So `i` is now at the first token of the right subtree, with no bookkeeping needed." } });
      whyMirror = true;
      B[id].r = build();
      pathD.pop(); doneD[id] = true;
      T.step("dRet", { vars: { node: t }, state: SD(id), say: `Both subtrees of **${t}** are attached. Return the node to its parent.`, op: "return n", act: "RETURN" });
      f.ret = Number(t); cs.pop();
      return id;
    }
    T.step("dStart", { vars: { i }, state: SD(null), say: "Call `build()` once for the whole tree: it reads the first token and everything that belongs to the root.", op: "return build()", act: "CALL_BUILD" });
    const r = build();
    const out = K.treeArr(B, r);
    T.step("dStart", { vars: { "return": `[${out.map((x) => (x === null ? "null" : x)).join(", ")}]` }, state: SD(null, `all ${tokens.length} tokens were consumed`), say: `All ${tokens.length} tokens have been consumed (\`i\` = ${i}). The rebuilt tree in level order is **[${out.map((x) => (x === null ? "null" : x)).join(", ")}]**: identical to the tree that was sent.`, op: "return build()", act: "DONE" });
    T.result(out);
  },
  fuzz(rnd) { return { root: SHEETS.K.randomTree(rnd, Math.floor(rnd() * 9), -5, 12) }; },
  gen(n) { return { root: SHEETS.K.balanced(n) }; },

  complexity: {
    time: {
      tex: "O(n)", title: "each token is written once and read once", short: "2n + 1 tokens, constant work for each",
      derive: [
        "\\#\\text{tokens} = n + (n + 1) = 2n + 1 || n values plus one `#` for each of the $n + 1$ empty child positions",
        "T_{\\text{serialize}} = (2n+1)\\, c || one call per token, writing it",
        "T_{\\text{deserialize}} = (2n+1)\\, c' + T_{\\text{split}},\\; T_{\\text{split}} = O(\\text{length of the string}) || one call per token, plus cutting the string into tokens",
        "!T(n) = O(n) || the string has $O(n)$ characters (each value has at most 5 characters here)",
      ],
      where: "A tree with $n$ nodes always has $n + 1$ empty positions, whatever its shape. The measured table counts the steps of both the encoder and the decoder for a balanced tree.",
    },
    space: {
      tex: "O(n)", title: "the string, the tokens and the rebuilt tree", short: "the output of each direction, plus the recursion",
      derive: [
        "|\\text{string}| = O(n) || at most 5 characters per value plus the commas",
        "|\\text{tokens}| = 2n + 1 || the decoder keeps the split tokens",
        "S_{\\text{stack}} \\le h + 1 || both recursions follow one root-to-leaf path",
        "!S = O(n) || the output alone has this size",
      ],
      where: "The decoded tree itself needs $O(n)$ memory; so $O(n)$ is the best possible. The recursion uses an extra $O(h)$.",
    },
    limit: "Every node must be written and read, so $\\Omega(n)$ is needed; a compact binary format could reduce the constant but not the order.",
    measure: { label: "n = number of nodes (balanced tree)", fTex: "n", f: (n) => n, sizes: [7, 15, 31, 63, 127, 255], growth: "linear" },
  },

  mistakes: [
    { title: "Leaving out the empty-subtree markers", what: "Writing only the node values in pre-order.", why: "The values seem to be \"the tree\".", breaks: "`[1, 2, null, 3]` and `[1, 2, 3]` both become `1,2,3`: the shape is lost, and many trees share one string.", avoid: "Write a marker (`#`) for every missing child." },
    { title: "No separator between tokens", what: "Concatenating values: `\"12\"` for the nodes 1 and 2.", why: "Single digits look fine.", breaks: "The nodes `1, 2` and the single node `12` give the same string; negative numbers also lose their boundaries.", avoid: "Put a comma (or another separator that cannot occur in a number) after every token." },
    { title: "Reading the left and right subtrees in the wrong order", what: "`n->right = build(); n->left = build();`", why: "The two assignments look interchangeable.", breaks: "The decoder consumes the tokens of the left subtree as the right one, so every node's children are swapped relative to the original.", avoid: "Decode in exactly the order used to encode: left, then right." },
    { title: "Losing the index between calls", what: "Passing `i` by value, or using a local `i` inside `build`.", why: "An index is a small integer, so by value feels natural.", breaks: "Every call restarts at the same token, so the decoder rebuilds the same subtree again and again (or runs out of tokens).", avoid: "Share one index (a member, a reference, or a closure variable)." },
    { title: "Using a value as the empty marker", what: "Writing `0` or `-1` for a missing child.", why: "It saves a special token.", breaks: "Those are legal node values (the range is −1000 to 1000): the decoder cannot tell a node with value `0` from an empty subtree.", avoid: "Use a marker that can never be a number, such as `#`." },
  ],

  followUps: [
    {
      q: "Serialise a **binary search tree** in the most compact way.",
      a: "For a BST you do not need any `#` markers: its **pre-order** alone determines the tree, because the BST order says where each value belongs. Decode with `build(lo, hi)`: read a value only if it lies inside `(lo, hi)`, make it the root, and build the left subtree with `(lo, v)` and the right with `(v, hi)`. That halves the size: $n$ tokens instead of $2n + 1$.",
      cpp: `string serializeBST(TreeNode* root) {
    string out;
    function<void(TreeNode*)> go = [&](TreeNode* t) {
        if (!t) return;
        out += to_string(t->val) + ",";
        go(t->left); go(t->right);
    };
    go(root);
    return out;
}
TreeNode* deserializeBST(string data) {
    vector<int> v; stringstream ss(data); string x;
    while (getline(ss, x, ',')) v.push_back(stoi(x));
    size_t i = 0;
    function<TreeNode*(long long, long long)> build = [&](long long lo, long long hi) -> TreeNode* {
        if (i >= v.size() || v[i] <= lo || v[i] >= hi) return nullptr;
        TreeNode* n = new TreeNode(v[i++]);
        n->left = build(lo, n->val);
        n->right = build(n->val, hi);
        return n;
    };
    return build(LLONG_MIN, LLONG_MAX);
}`,
      js: `function serializeBST(root) {
  const out = [];
  const go = (t) => { if (!t) return; out.push(t.val); go(t.left); go(t.right); };
  go(root);
  return out.join(",");
}
function deserializeBST(data) {
  if (!data.length) return null;
  const v = data.split(",").map(Number);
  let i = 0;
  const build = (lo, hi) => {
    if (i >= v.length || v[i] <= lo || v[i] >= hi) return null;
    const n = new TreeNode(v[i++]);
    n.left = build(lo, n.val);
    n.right = build(n.val, hi);
    return n;
  };
  return build(-Infinity, Infinity);
}`,
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Serialise in **level order** (the format LeetCode uses for its examples).",
      a: "Use a queue: write each node's value or `null`, and push both children (even missing ones). Drop the trailing `null`s. To decode, keep a queue of parents and give each the next two tokens as its children. This is the alternative shown in the brute-force section; it is $O(n)$ as well.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Serialise an **N-ary tree**.",
      a: "Write each node's value followed by the **number of its children**, in pre-order: `1,3,2,0,3,0,4,0`. The decoder reads a value, then a count `k`, then builds `k` children recursively. A count replaces the `#` markers.",
      time: "O(n)", space: "O(n)",
    },
    {
      q: "Serialise a **general graph** or a tree with shared nodes.",
      a: "Give every node an id the first time you meet it and write the edges as pairs of ids (or adjacency lists). A visited map makes sure each node is written once, so cycles and sharing are handled; this is the idea behind Clone Graph.",
      time: "O(V + E)", space: "O(V)",
    },
  ],

  related: [
    { id: "encode-and-decode-strings", why: "The same design question for a list of strings: an unambiguous format the decoder can follow." },
    { id: "construct-binary-tree-from-preorder-and-inorder-traversal", why: "Rebuilds a tree from two traversals instead of one traversal with markers." },
    { id: "binary-tree-level-order-traversal", why: "The level-order walk is the other natural way to flatten a tree." },
    { id: "subtree-of-another-tree", why: "Its brute force is exactly this serialisation, with the markers it needs." },
  ],
  patternNote: "**Encoder and decoder as mirror images.** For a recursive structure, write the encoder as a recursion in a fixed order and the decoder as the same recursion that *consumes* the tokens in that order. Explicit markers for the empty positions make the stream self-delimiting, so no extra bookkeeping is needed.",
  takeaways: [
    "Values alone do not determine a tree: record the **empty children** too (a marker such as `#`).",
    "Pre-order write: value, left subtree, right subtree; empty → `#`. Read in the same order with one shared index.",
    "Separate tokens with commas; use a marker that cannot be a number; decode left before right.",
    "A tree with $n$ nodes has $n + 1$ empty positions: $2n + 1$ tokens, $O(n)$ time and space.",
    "For a BST, the pre-order values alone are enough (use `(lo, hi)` ranges to rebuild).",
  ],
});
