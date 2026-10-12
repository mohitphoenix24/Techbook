---
title: Binary Search Trees & Balancing
level: intermediate
time: 60
summary: The BST property and why inorder traversal is sorted, search/insert/delete in O(h) (including the two-children delete), validating with ranges, why unbalanced BSTs degrade to O(n), rotations and AVL trees (with the Fibonacci proof that AVL height ≤ 1.44 log₂ n), red–black trees behind std::set/map, and six classic problems.
---

A binary search tree keeps data **sorted** while supporting fast insertions and deletions, which neither a sorted array nor a linked list does. It's the structure behind `std::set` and `std::map`, and the source of many interview questions.

:::def Binary search tree (BST)
A binary tree where, for **every** node, all keys in its left subtree are **smaller** and all keys in its right subtree are **larger** (or ≥, depending on how duplicates are handled).
:::

:::warn It's about whole subtrees, not just children
Checking only `left->val < node->val < right->val` is **not** enough. In the tree `5 → (left 4 → right 6)`, the node 6 is in 5's left subtree but larger than 5. It's a classic bug in "validate BST".
:::

:::proof Inorder traversal of a BST is sorted
By induction on the tree. Inorder visits the whole left subtree (sorted, by induction, and all smaller than the root), then the root, then the whole right subtree (sorted and all larger). Concatenating these three gives a sorted sequence.
:::

## Search, insert, delete: O(h)

Search and insert walk one path from the root, going left if smaller and right if larger.

```viz algo=bst
```

**Delete** has three cases:

| Node to delete has… | Do |
|---|---|
| no children | just remove it |
| one child | replace the node with that child |
| two children | copy its **inorder successor** (the minimum of the right subtree) into it, then delete the successor from the right subtree. The successor has at most one child, so that delete is easy |

```cpp run level=intermediate title="A small BST: insert, search, delete, inorder"
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };

TreeNode* insert(TreeNode* t, int x) {
    if (!t) return new TreeNode(x);
    if (x < t->val) t->left = insert(t->left, x);
    else if (x > t->val) t->right = insert(t->right, x);   // ignore duplicates
    return t;
}
bool contains(TreeNode* t, int x) {
    while (t && t->val != x) t = x < t->val ? t->left : t->right;
    return t != nullptr;
}
TreeNode* erase(TreeNode* t, int x) {
    if (!t) return nullptr;
    if (x < t->val) t->left = erase(t->left, x);
    else if (x > t->val) t->right = erase(t->right, x);
    else {
        if (!t->left)  { TreeNode* r = t->right; delete t; return r; }   // 0 or 1 child
        if (!t->right) { TreeNode* l = t->left;  delete t; return l; }
        TreeNode* s = t->right;                                         // 2 children: the successor
        while (s->left) s = s->left;
        t->val = s->val;
        t->right = erase(t->right, s->val);
    }
    return t;
}
void inorder(TreeNode* t) { if (!t) return; inorder(t->left); cout << t->val << ' '; inorder(t->right); }

int main() {
    TreeNode* root = nullptr;
    for (int x : {50, 30, 70, 20, 40, 60, 80, 35}) root = insert(root, x);
    inorder(root); cout << "| has 35? " << contains(root, 35) << '\n';
    root = erase(root, 30);                 // a node with two children
    inorder(root); cout << "| root is still " << root->val << '\n';
    root = erase(root, 50);                 // delete the root
    inorder(root); cout << "| new root " << root->val << '\n';
}
```

## Why balance matters

Insert `1, 2, 3, …, n` in order and every node gets only a right child. The "tree" is a linked list with height $n - 1$, so every operation is $O(n)$. Random insertion order gives an expected height of about $2.99 \ln n$, but you can't rely on the input being random.

:::def Self-balancing BST
A BST that restructures itself (with **rotations**) after inserts and deletes, so that its height stays $O(\log n)$ no matter the input order. AVL trees and red–black trees are the classic examples.
:::

:::def Rotation
A local re-wiring of three subtrees that **keeps the BST order** but changes the heights. A right rotation at `y` with left child `x` makes `x` the new root of that subtree: `y` becomes `x`'s right child, and `x`'s old right subtree becomes `y`'s left subtree. It takes $O(1)$.
:::

### AVL trees and their height bound

An **AVL tree** requires that, at every node, the heights of the two subtrees differ by at most 1. After each insert or delete, at most $O(\log n)$ rotations restore this.

:::derive AVL height is at most about 1.44 log₂ n
N(h) = \text{minimum number of nodes in an AVL tree of height } h || the sparsest legal tree
N(h) = 1 + N(h-1) + N(h-2) || one subtree of height h−1, the other as short as allowed: h−2
N(h) + 1 = (N(h-1)+1) + (N(h-2)+1) || a Fibonacci recurrence: N(h) + 1 = F(h+3)
N(h) \ge \varphi^{h} \text{ (roughly)} || Fibonacci numbers grow like φʰ, φ ≈ 1.618
n \ge N(h) \Rightarrow h \le \log_\varphi n = \frac{\log_2 n}{\log_2 \varphi} || take logs
! h \le 1.44\,\log_2 n = O(\log n) || at most 44% taller than a perfect tree
:::

**Red–black trees** use a looser rule (no path is more than twice as long as any other, so $h \le 2\log_2(n+1)$). They do fewer rotations per update, which is why `std::set`, `std::map`, Java's `TreeMap` and Linux's scheduler use them.

:::interview
You'll almost never have to code an AVL or red–black tree in an interview. Do know: (1) why plain BSTs degrade to $O(n)$, (2) that rotations rebalance in $O(1)$ each, and (3) that `std::set`/`std::map` are red–black trees with guaranteed $O(\log n)$ operations and `lower_bound`.
:::

## Problems

:::problem Validate Binary Search Tree {level=medium lc=validate-binary-search-tree tags="BST,top-down DFS,ranges"}
Return whether a tree is a valid BST (strictly increasing, no duplicates).

:::hint Hint 1
Top-down: each node must lie in an **open range** `(lo, hi)` inherited from its ancestors. Going left sets `hi = node`, going right sets `lo = node`.
:::

:::hint Hint 2
Alternatively: an inorder traversal must be strictly increasing. Just compare each value with the previous one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

bool valid(TreeNode* t, long long lo, long long hi) {      // long long: node values can be INT_MIN/INT_MAX
    if (!t) return true;
    if (t->val <= lo || t->val >= hi) return false;
    return valid(t->left, lo, t->val) && valid(t->right, t->val, hi);
}
bool isValidBST(TreeNode* root) { return valid(root, LLONG_MIN, LLONG_MAX); }

int main() { cout << boolalpha << isValidBST(build({2, 1, 3})) << ' ' << isValidBST(build({5, 1, 4, N, N, 3, 6})) << ' ' << isValidBST(build({5, 4, 6, N, N, 3, 7})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Kth Smallest Element in a BST {level=medium lc=kth-smallest-element-in-a-bst tags="BST,inorder"}
Return the `k`-th smallest value (1-indexed) in a BST.

:::hint Hint
Inorder visits the values in sorted order. Stop at the `k`-th one. Iteratively, this takes $O(h + k)$.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int kthSmallest(TreeNode* root, int k) {
    stack<TreeNode*> st;
    TreeNode* cur = root;
    while (true) {
        while (cur) { st.push(cur); cur = cur->left; }
        cur = st.top(); st.pop();
        if (--k == 0) return cur->val;
        cur = cur->right;
    }
}

int main() { cout << kthSmallest(build({3, 1, 4, N, 2}), 1) << ' ' << kthSmallest(build({5, 3, 6, 2, 4, N, N, 1}), 3) << '\n'; }
```

:::complexity
Time | O(h + k) |
Space | O(h) |
:::

**Follow-up:** if the BST changes often and you query k-th often, store **subtree sizes** in each node. Then k-th smallest is $O(h)$: compare `k` with the size of the left subtree to decide which way to go. That's an *order-statistic tree*.
:::
:::

:::problem Lowest Common Ancestor of a Binary Search Tree {level=medium lc=lowest-common-ancestor-of-a-binary-search-tree tags="BST"}
Find the LCA of `p` and `q` in a **BST**.

:::hint Hint
Use the ordering. If both values are smaller than the node, go left. If both are larger, go right. Otherwise they split here (or one of them *is* this node), so this is the LCA.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

TreeNode* lcaBST(TreeNode* t, int p, int q) {
    while (t) {
        if (p < t->val && q < t->val) t = t->left;
        else if (p > t->val && q > t->val) t = t->right;
        else return t;                      // they split here
    }
    return nullptr;
}

int main() {
    TreeNode* root = build({6, 2, 8, 0, 4, 7, 9, N, N, 3, 5});
    cout << lcaBST(root, 2, 8)->val << ' ' << lcaBST(root, 2, 4)->val << ' ' << lcaBST(root, 3, 5)->val << '\n';
}
```

:::complexity
Time | O(h) |
Space | O(1) |
:::
:::
:::

:::problem Delete Node in a BST {level=medium lc=delete-node-in-a-bst tags="BST"}
Delete the node with a given key and return the (possibly new) root.

:::hint Hint
The three cases above. For two children, replace the value with the inorder successor's, then delete the successor from the right subtree.
:::

:::solution
See `erase` in the example at the top of this lesson. It's exactly the expected answer, $O(h)$ time and $O(h)$ recursion.

```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }
void inorder(TreeNode* t) { if (!t) return; inorder(t->left); cout << t->val << ' '; inorder(t->right); }

TreeNode* deleteNode(TreeNode* t, int key) {
    if (!t) return nullptr;
    if (key < t->val) { t->left = deleteNode(t->left, key); return t; }
    if (key > t->val) { t->right = deleteNode(t->right, key); return t; }
    if (!t->left) return t->right;
    if (!t->right) return t->left;
    TreeNode* s = t->right;
    while (s->left) s = s->left;
    t->val = s->val;
    t->right = deleteNode(t->right, s->val);
    return t;
}

int main() { TreeNode* r = deleteNode(build({5, 3, 6, 2, 4, N, 7}), 3); inorder(r); cout << "| root " << r->val << '\n'; }
```

:::complexity
Time | O(h) |
Space | O(h) |
:::
:::
:::

:::problem Convert Sorted Array to Binary Search Tree {level=easy lc=convert-sorted-array-to-binary-search-tree tags="BST,divide and conquer"}
Build a **height-balanced** BST from a sorted array.

:::hint Hint
The middle element is the root; recursively build the left half and the right half.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };

TreeNode* build(const vector<int>& a, int lo, int hi) {          // a[lo..hi]
    if (lo > hi) return nullptr;
    int mid = lo + (hi - lo) / 2;
    TreeNode* t = new TreeNode(a[mid]);
    t->left = build(a, lo, mid - 1);
    t->right = build(a, mid + 1, hi);
    return t;
}
int height(TreeNode* t) { return t ? 1 + max(height(t->left), height(t->right)) : 0; }

int main() {
    vector<int> a(1000); iota(a.begin(), a.end(), 0);
    TreeNode* t = build(a, 0, a.size() - 1);
    cout << "1000 sorted values -> height " << height(t) << " (ceil(log2(1001)) = 10), root " << t->val << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(\log n) | recursion
:::
:::
:::

:::problem Binary Search Tree Iterator {level=medium lc=binary-search-tree-iterator tags="BST,stack,design"}
Implement an iterator over a BST in ascending order: `next()` returns the next smallest value and `hasNext()` reports whether one exists. Use $O(h)$ memory and amortized $O(1)$ time per call.

:::hint Hint
This is the iterative inorder traversal, paused between steps. The stack holds the "left spine" still to be visited.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

class BSTIterator {
public:
    explicit BSTIterator(TreeNode* root) { pushLeft(root); }
    int next() {
        TreeNode* t = st.top(); st.pop();
        pushLeft(t->right);                 // the next values come from t's right subtree
        return t->val;
    }
    bool hasNext() const { return !st.empty(); }
private:
    stack<TreeNode*> st;
    void pushLeft(TreeNode* t) { for (; t; t = t->left) st.push(t); }
};

int main() {
    BSTIterator it(build({7, 3, 15, N, N, 9, 20}));
    while (it.hasNext()) cout << it.next() << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(1) | amortized per call: every node is pushed and popped once
Space | O(h) |
:::
:::
:::

## Check yourself

```quiz
? Why is checking only `left < node < right` not enough to validate a BST?
+ The rule applies to whole subtrees: a deeper node can violate an ancestor's bound
- Because of duplicates only
- It is enough
> Use (lo, hi) ranges or a sorted inorder.

? Inserting 1, 2, …, n in order into a plain BST gives height…
- log n
+ n − 1
- √n
> Each new key becomes the right child of the previous one.

? Deleting a node with two children: copy in its…
+ Inorder successor (min of the right subtree), then delete the successor
- Parent's value
- Left child's value always
> The successor has at most one child, so its delete is easy.

? The height of an AVL tree with n nodes is at most about…
+ 1.44 log₂ n
- 2 log₂ n
- log₂ n exactly
> The minimal AVL trees grow like Fibonacci numbers.
```

:::keypoints
- BST: left subtree < node < right subtree, for **whole subtrees**. Inorder = sorted.
- Search, insert, delete are $O(h)$. Delete with two children uses the inorder successor.
- Plain BSTs can degenerate to $O(n)$. AVL and red–black trees use rotations to keep $h = O(\log n)$ (AVL: $h \le 1.44\log_2 n$).
- `std::set`/`std::map` are red–black trees: guaranteed $O(\log n)$ and `lower_bound`.
- Patterns: ranges to validate, inorder for k-th / iterators, ordering for LCA, the middle element for building balanced trees.
:::
