---
title: Binary Trees — Structure & Traversals
level: intermediate
time: 55
summary: Tree vocabulary (root, depth, height, full/complete/perfect/balanced), facts with proofs (n−1 edges, at most 2^(h+1)−1 nodes, leaves = internal + 1 in full trees, minimum height ⌊log₂ n⌋), representations, the four traversals (pre/in/post/level) with a visualizer, and six starter problems including Count Complete Tree Nodes in O(log² n).
---

Trees model hierarchies: file systems, the DOM, org charts, expression parsing, decision making. They're also the gateway to BSTs, heaps, tries and segment trees. Binary tree questions are among the most common in interviews, and most of them are solved by **one well-chosen traversal**.

## Vocabulary

:::def Tree
A connected structure of **nodes** with no cycles. One node is the **root**. Every other node has exactly one **parent**. Nodes without children are **leaves**.
:::

:::def Binary tree
A tree where each node has at most two children, called **left** and **right**.
:::

| Term | Meaning |
|---|---|
| depth of a node | number of edges from the root down to it (the root has depth 0) |
| height of a node | number of edges on the longest path down to a leaf (a leaf has height 0) |
| height of the tree | height of the root. Some sources count nodes instead; say which you mean |
| subtree | a node together with all of its descendants |
| **full** binary tree | every node has 0 or 2 children |
| **complete** binary tree | every level is full except possibly the last, which is filled from the left (heaps) |
| **perfect** binary tree | all internal nodes have 2 children and all leaves are at the same depth |
| **balanced** | the height is $O(\log n)$ (e.g. AVL: subtree heights differ by at most 1 everywhere) |

## Facts worth proving once

:::proof A tree with n nodes has exactly n − 1 edges
Every node except the root has exactly one edge going up to its parent, and every edge is the parent-edge of exactly one node. So there are $n - 1$ edges.
:::

:::derive A binary tree of height h has at most 2^(h+1) − 1 nodes
\text{level } d \text{ has at most } 2^d \text{ nodes} || each node has at most 2 children
n \le 1 + 2 + 4 + \cdots + 2^h || sum over levels 0..h
= 2^{h+1} - 1 || geometric series
! h \ge \log_2(n+1) - 1 \;\Rightarrow\; h \ge \lfloor \log_2 n \rfloor || the minimum height of n nodes is about log₂ n
:::

So a balanced tree with a million nodes has height about 20. A degenerate tree (every node has one child) has height $n - 1$, and then it's really a linked list. **Most tree algorithms are $O(h)$ per operation, which is $O(\log n)$ only if the tree is balanced.**

:::proof In a full binary tree, leaves = internal nodes + 1
Let $i$ be the number of internal nodes and $l$ the number of leaves. Each internal node has 2 children, so the number of edges is $2i$. A tree has $n - 1 = i + l - 1$ edges. So $2i = i + l - 1$, which gives $l = i + 1$.
:::

## Representation

LeetCode's node type, plus a helper to build a tree from level order (`N` = null) that the examples use:

```cpp
struct TreeNode {
    int val; TreeNode *left, *right;
    TreeNode(int x, TreeNode* l = nullptr, TreeNode* r = nullptr) : val(x), left(l), right(r) {}
};
```

**Complete** trees are stored in an array instead: the children of index `i` are `2i+1` and `2i+2`, and its parent is `(i−1)/2`. No pointers needed. That's how heaps work.

## The four traversals

| Order | Visit | Typical use |
|---|---|---|
| **Preorder** | node, left, right | copying or serializing a tree, top-down information |
| **Inorder** | left, node, right | a BST in **sorted order** |
| **Postorder** | left, right, node | bottom-up computation (heights, sizes, deleting a tree) |
| **Level order** | level by level (BFS) | shortest depth, per-level views |

```viz algo=tree-traversal
```

Every traversal visits each node once: $O(n)$ time. The recursive ones use $O(h)$ stack space, and level order uses $O(w)$ queue space, where $w$ is the maximum width.

```cpp run level=easy title="All four traversals"
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;   // marks a missing child in level-order input
TreeNode* build(const vector<int>& v) {
    if (v.empty() || v[0] == N) return nullptr;
    TreeNode* root = new TreeNode(v[0]);
    queue<TreeNode*> q; q.push(root);
    for (size_t i = 1; i < v.size(); i += 2) {        // v[i], v[i+1] are the children of cur
        TreeNode* cur = q.front(); q.pop();
        if (v[i] != N) q.push(cur->left = new TreeNode(v[i]));
        if (i + 1 < v.size() && v[i + 1] != N) q.push(cur->right = new TreeNode(v[i + 1]));
    }
    return root;
}

void pre(TreeNode* t)  { if (!t) return; cout << t->val << ' '; pre(t->left); pre(t->right); }
void in(TreeNode* t)   { if (!t) return; in(t->left); cout << t->val << ' '; in(t->right); }
void post(TreeNode* t) { if (!t) return; post(t->left); post(t->right); cout << t->val << ' '; }
void level(TreeNode* t) {
    queue<TreeNode*> q; if (t) q.push(t);
    while (!q.empty()) {
        int sz = q.size();                          // everything currently queued = one level
        for (int k = 0; k < sz; k++) {
            TreeNode* x = q.front(); q.pop();
            cout << x->val << ' ';
            if (x->left) q.push(x->left);
            if (x->right) q.push(x->right);
        }
        cout << "| ";
    }
}

int main() {
    TreeNode* root = build({1, 2, 3, 4, 5, N, 6, N, N, 7});
    cout << "pre:   "; pre(root);   cout << "\nin:    "; in(root);
    cout << "\npost:  "; post(root); cout << "\nlevel: "; level(root); cout << '\n';
}
```

:::tip The `sz = q.size()` trick
Reading the queue size at the start of each level lets you process **exactly one level** per iteration of the outer loop. You need it for "level order as lists", "right side view", "zigzag", "minimum depth" and "average of levels".
:::

## Problems

:::problem Maximum Depth of Binary Tree {level=easy lc=maximum-depth-of-binary-tree tags="tree,DFS,recursion"}
Return the number of nodes on the longest root-to-leaf path.

Example: `[3,9,20,null,null,15,7]` → `3`.

:::hint Hint
Depth of a tree = 1 + the deeper of its two subtrees. An empty tree has depth 0.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size();) { TreeNode* c = q.front(); q.pop(); if (i < v.size() && v[i] != N) q.push(c->left = new TreeNode(v[i])); i++; if (i < v.size() && v[i] != N) q.push(c->right = new TreeNode(v[i])); i++; } return r; }

int maxDepth(TreeNode* t) { return t ? 1 + max(maxDepth(t->left), maxDepth(t->right)) : 0; }

int main() { cout << maxDepth(build({3, 9, 20, N, N, 15, 7})) << ' ' << maxDepth(build({1, N, 2})) << ' ' << maxDepth(nullptr) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) | recursion
:::
:::
:::

:::problem Invert Binary Tree {level=easy lc=invert-binary-tree tags="tree,recursion"}
Mirror the tree: swap the left and right children of every node.

:::hint Hint
Swap the children of the root, then invert both subtrees (any traversal order works).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size();) { TreeNode* c = q.front(); q.pop(); if (i < v.size() && v[i] != N) q.push(c->left = new TreeNode(v[i])); i++; if (i < v.size() && v[i] != N) q.push(c->right = new TreeNode(v[i])); i++; } return r; }
void level(TreeNode* t) { queue<TreeNode*> q; if (t) q.push(t); while (!q.empty()) { TreeNode* x = q.front(); q.pop(); cout << x->val << ' '; if (x->left) q.push(x->left); if (x->right) q.push(x->right); } cout << '\n'; }

TreeNode* invertTree(TreeNode* t) {
    if (!t) return nullptr;
    swap(t->left, t->right);
    invertTree(t->left);
    invertTree(t->right);
    return t;
}

int main() { level(invertTree(build({4, 2, 7, 1, 3, 6, 9}))); }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Same Tree {level=easy lc=same-tree tags="tree,recursion"}
Return whether two binary trees are identical in structure and values.

:::hint Hint
Both null → same. Exactly one null → different. Otherwise compare the values and recurse on both pairs of children.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size();) { TreeNode* c = q.front(); q.pop(); if (i < v.size() && v[i] != N) q.push(c->left = new TreeNode(v[i])); i++; if (i < v.size() && v[i] != N) q.push(c->right = new TreeNode(v[i])); i++; } return r; }

bool isSameTree(TreeNode* p, TreeNode* q) {
    if (!p || !q) return p == q;               // both null, or exactly one
    return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
}

int main() { cout << boolalpha << isSameTree(build({1, 2, 3}), build({1, 2, 3})) << ' ' << isSameTree(build({1, 2}), build({1, N, 2})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Binary Tree Level Order Traversal {level=medium lc=binary-tree-level-order-traversal tags="tree,BFS"}
Return the node values level by level, as a list of lists.

Example: `[3,9,20,null,null,15,7]` → `[[3],[9,20],[15,7]]`.

:::hint Hint
BFS with the `sz = q.size()` trick.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size();) { TreeNode* c = q.front(); q.pop(); if (i < v.size() && v[i] != N) q.push(c->left = new TreeNode(v[i])); i++; if (i < v.size() && v[i] != N) q.push(c->right = new TreeNode(v[i])); i++; } return r; }

vector<vector<int>> levelOrder(TreeNode* root) {
    vector<vector<int>> out;
    queue<TreeNode*> q;
    if (root) q.push(root);
    while (!q.empty()) {
        out.emplace_back();
        for (int k = q.size(); k > 0; k--) {
            TreeNode* x = q.front(); q.pop();
            out.back().push_back(x->val);
            if (x->left) q.push(x->left);
            if (x->right) q.push(x->right);
        }
    }
    return out;
}

int main() {
    for (auto& lv : levelOrder(build({3, 9, 20, N, N, 15, 7}))) { cout << '['; for (int x : lv) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(w) | w = maximum width (up to about n/2)
:::
:::
:::

:::problem Binary Tree Right Side View {level=medium lc=binary-tree-right-side-view tags="tree,BFS,DFS"}
Imagine standing to the right of the tree. Return the values you can see, from top to bottom (the last node of each level).

Example: `[1,2,3,null,5,null,4]` → `[1,3,4]`.

:::hint Hint
BFS: take the last node of each level. Or DFS visiting the **right child first**: the first node you reach at each new depth is visible.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size();) { TreeNode* c = q.front(); q.pop(); if (i < v.size() && v[i] != N) q.push(c->left = new TreeNode(v[i])); i++; if (i < v.size() && v[i] != N) q.push(c->right = new TreeNode(v[i])); i++; } return r; }

void dfs(TreeNode* t, int depth, vector<int>& out) {
    if (!t) return;
    if (depth == (int)out.size()) out.push_back(t->val);   // first node seen at this depth
    dfs(t->right, depth + 1, out);                         // right side first
    dfs(t->left, depth + 1, out);
}

int main() {
    vector<int> out;
    dfs(build({1, 2, 3, N, 5, N, 4}), 0, out);
    for (int x : out) cout << x << ' ';
    out.clear(); dfs(build({1, 2, 3, 4}), 0, out);
    cout << "| "; for (int x : out) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Count Complete Tree Nodes {level=easy lc=count-complete-tree-nodes tags="tree,binary search,complete tree"}
Count the nodes of a **complete** binary tree in less than $O(n)$.

:::hint Hint 1
Measure the leftmost depth and the rightmost depth. If they're equal, the tree is **perfect**: $2^h - 1$ nodes, no traversal needed.
:::

:::hint Hint 2
Otherwise recurse on both children. One of the two subtrees is always perfect, so it finishes in a single step.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
TreeNode* buildComplete(int n) {                       // nodes 1..n in level order
    vector<TreeNode*> v(n + 1);
    for (int i = 1; i <= n; i++) v[i] = new TreeNode(i);
    for (int i = 1; i <= n; i++) { if (2 * i <= n) v[i]->left = v[2 * i]; if (2 * i + 1 <= n) v[i]->right = v[2 * i + 1]; }
    return n ? v[1] : nullptr;
}

int countNodes(TreeNode* root) {
    if (!root) return 0;
    int lh = 0, rh = 0;
    for (TreeNode* t = root; t; t = t->left) lh++;
    for (TreeNode* t = root; t; t = t->right) rh++;
    if (lh == rh) return (1 << lh) - 1;               // perfect tree
    return 1 + countNodes(root->left) + countNodes(root->right);
}

int main() { for (int n : {0, 1, 6, 7, 100, 12345}) cout << countNodes(buildComplete(n)) << ' '; cout << '\n'; }
```

:::derive Why it's O(log² n)
\text{at each node: measuring both depths costs } O(h) || walk down two edges of the tree
\text{one child's subtree is perfect, so it returns in } O(h) || the "last level boundary" passes through only one side
\text{so the recursion follows a single path of length } h ||
! T = O(h) \cdot O(h) = O(\log^2 n) || h = O(log n) for a complete tree
:::

:::complexity
Time | O(\log^2 n) |
Space | O(\log n) |
:::
:::
:::

## Check yourself

```quiz
? Which traversal of a BST outputs the keys in sorted order?
- Preorder
+ Inorder
- Level order
> Left subtree < node < right subtree.

? A binary tree with 1000 nodes has height at least…
+ 9
- 500
- 999
> ⌊log₂ 1000⌋ = 9. At most 999 (a chain).

? Most tree operations cost O(h). When is that O(log n)?
+ When the tree is balanced
- Always
- Only for complete trees
> A degenerate tree has h = n − 1.

? Why read q.size() at the start of each BFS level?
+ To process exactly the nodes of the current level before moving on
- To avoid an infinite loop
- To sort the level
> Nodes added during the loop belong to the next level.
```

:::keypoints
- Trees: $n - 1$ edges; height $h \ge \lfloor\log_2 n\rfloor$; at most $2^{h+1}-1$ nodes; full trees have leaves = internal + 1.
- Operations cost $O(h)$, which is $O(\log n)$ only if the tree is balanced.
- Traversals: pre (top-down / copy), in (sorted for BSTs), post (bottom-up), level (BFS with `sz = q.size()`).
- Complete trees fit in arrays: children `2i+1`, `2i+2`, parent `(i−1)/2`.
:::
