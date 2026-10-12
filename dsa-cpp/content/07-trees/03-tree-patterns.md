---
title: Tree DFS Patterns
level: intermediate
time: 60
summary: The three shapes behind nearly every binary-tree interview question — bottom-up (return a value to the parent), top-down (pass information down), and "return one thing, record another" (a global answer) — plus LCA and prefix sums on root-to-node paths, through nine classic problems up to Binary Tree Maximum Path Sum.
---

There are hundreds of binary-tree problems but only a few **shapes** of solution. Once you can recognise which shape a problem needs, most tree questions take 10 lines.

## Pattern 1: bottom-up (postorder) — the children report to the parent

Each call **returns** a summary of its subtree (height, size, sum, "is it balanced?"). The parent combines its children's summaries. Ask: *"If I knew the answer for my left and right subtrees, how would I compute mine?"*

## Pattern 2: top-down (preorder) — the parent passes information down

Pass what the node needs to know about its ancestors as a **parameter**: the current depth, the path sum so far, the maximum value on the path, the allowed range. Leaves (or every node) check or record using that information.

## Pattern 3: return one thing, record another

Sometimes what the parent needs is **different** from the final answer. The diameter is the classic example: a parent needs its child's **height** (a single downward path), but the answer is the longest path **through** some node (left height + right height). So the DFS returns the height and updates a global best on the side.

:::pattern
- "Height / balanced / size / subtree sum" → **bottom-up**.
- "Root-to-leaf path with a property / depth-dependent condition / valid range" → **top-down**.
- "Longest/maximum path anywhere in the tree" (diameter, max path sum, longest univalue path) → **return a single downward chain, record the bent path** through each node.
:::

## Problems

:::problem Balanced Binary Tree {level=easy lc=balanced-binary-tree tags="tree,bottom-up DFS"}
Return whether, for every node, the heights of its two subtrees differ by at most 1.

:::hint Hint
Computing the height separately at each node is $O(n^2)$ on a skewed tree. Instead, return the height from one DFS, using −1 to mean "already unbalanced".
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int heightOrFail(TreeNode* t) {                      // -1 = unbalanced somewhere below
    if (!t) return 0;
    int l = heightOrFail(t->left);
    if (l < 0) return -1;
    int r = heightOrFail(t->right);
    if (r < 0 || abs(l - r) > 1) return -1;
    return 1 + max(l, r);
}
bool isBalanced(TreeNode* root) { return heightOrFail(root) >= 0; }

int main() { cout << boolalpha << isBalanced(build({3, 9, 20, N, N, 15, 7})) << ' ' << isBalanced(build({1, 2, 2, 3, 3, N, N, 4, 4})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Diameter of Binary Tree {level=easy lc=diameter-of-binary-tree tags="tree,global answer"}
Return the length (in edges) of the longest path between any two nodes. The path may or may not pass through the root.

Example: `[1,2,3,4,5]` → `3` (4→2→1→3).

:::hint Hint
The longest path "bends" at some node: its length is height(left) + height(right) there. The DFS returns the height, and you record the best bend as you go.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int diameterOfBinaryTree(TreeNode* root) {
    int best = 0;
    function<int(TreeNode*)> height = [&](TreeNode* t) -> int {   // returns: nodes on the longest downward chain
        if (!t) return 0;
        int l = height(t->left), r = height(t->right);
        best = max(best, l + r);                                  // record: the path bending here (edges)
        return 1 + max(l, r);                                     // return: a single chain for the parent
    };
    height(root);
    return best;
}

int main() { cout << diameterOfBinaryTree(build({1, 2, 3, 4, 5})) << ' ' << diameterOfBinaryTree(build({1, 2})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Binary Tree Maximum Path Sum {level=hard lc=binary-tree-maximum-path-sum tags="tree,global answer"}
A path is any sequence of connected nodes (each node used at most once, no need to pass through the root). Return the maximum sum of a path. Values can be **negative**.

Example: `[-10,9,20,null,null,15,7]` → `42` (15→20→7).

:::hint Hint
The same shape as the diameter. Return the best **downward** chain sum starting at the node, but clamp negative contributions from the children to 0 (it's better not to extend at all). Record `node + leftGain + rightGain` as a candidate.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int maxPathSum(TreeNode* root) {
    int best = INT_MIN;
    function<int(TreeNode*)> gain = [&](TreeNode* t) -> int {
        if (!t) return 0;
        int l = max(0, gain(t->left)), r = max(0, gain(t->right));   // drop negative branches
        best = max(best, t->val + l + r);                            // the path bending at t
        return t->val + max(l, r);                                   // a single chain upward
    };
    gain(root);
    return best;
}

int main() { cout << maxPathSum(build({1, 2, 3})) << ' ' << maxPathSum(build({-10, 9, 20, N, N, 15, 7})) << ' ' << maxPathSum(build({-3})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::

`best` starts at `INT_MIN` (not 0) so that an all-negative tree returns its largest single node.
:::
:::

:::problem Path Sum II {level=medium lc=path-sum-ii tags="tree,top-down DFS,backtracking"}
Return every **root-to-leaf** path whose values sum to `targetSum`.

Example: `[5,4,8,11,null,13,4,7,2,null,null,5,1], 22` → `[[5,4,11,2],[5,8,4,5]]`.

:::hint Hint
Top-down: pass the remaining sum and keep the current path in a vector. Check at the leaves. Pop on the way back (backtracking).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

vector<vector<int>> pathSum(TreeNode* root, int target) {
    vector<vector<int>> out; vector<int> path;
    function<void(TreeNode*, int)> dfs = [&](TreeNode* t, int remain) {
        if (!t) return;
        path.push_back(t->val);
        remain -= t->val;
        if (!t->left && !t->right && remain == 0) out.push_back(path);   // a leaf hitting the target
        dfs(t->left, remain);
        dfs(t->right, remain);
        path.pop_back();                                                 // backtrack
    };
    dfs(root, target);
    return out;
}

int main() {
    for (auto& p : pathSum(build({5, 4, 8, 11, N, 13, 4, 7, 2, N, N, 5, 1}), 22)) { cout << '['; for (int x : p) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot h) | copying a path at each matching leaf
Space | O(h) |
:::
:::
:::

:::problem Path Sum III {level=medium lc=path-sum-iii tags="tree,prefix sum,hash map"}
Count the **downward** paths (they can start and end at any node) whose sum equals `targetSum`.

Example: `[10,5,-3,3,2,null,11,3,-2,null,1], 8` → `3`.

:::hint Hint
It's *Subarray Sum Equals K* on every root-to-node path. Keep a hash map of the prefix sums **along the current path**. Add the current one on the way down and remove it on the way back up.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int pathSumIII(TreeNode* root, int target) {
    unordered_map<long long, int> seen{{0, 1}};          // prefix sums on the current root→node path
    int count = 0;
    function<void(TreeNode*, long long)> dfs = [&](TreeNode* t, long long sum) {
        if (!t) return;
        sum += t->val;
        auto it = seen.find(sum - target);
        if (it != seen.end()) count += it->second;       // paths ending at t
        seen[sum]++;
        dfs(t->left, sum);
        dfs(t->right, sum);
        if (--seen[sum] == 0) seen.erase(sum);           // leave the path: undo
    };
    dfs(root, 0);
    return count;
}

int main() { cout << pathSumIII(build({10, 5, -3, 3, 2, N, 11, 3, -2, N, 1}), 8) << ' ' << pathSumIII(build({5, 4, 8, 11, N, 13, 4, 7, 2, N, N, 5, 1}), 22) << '\n'; }
```

:::complexity
Time | O(n) | average
Space | O(h) | the map holds only the current path
:::
:::
:::

:::problem Lowest Common Ancestor of a Binary Tree {level=medium lc=lowest-common-ancestor-of-a-binary-tree tags="tree,bottom-up DFS"}
Return the lowest node that has both `p` and `q` as descendants (a node counts as its own descendant). Both are in the tree.

Example: in `[3,5,1,6,2,0,8,null,null,7,4]`, LCA(5, 1) = 3 and LCA(5, 4) = 5.

:::hint Hint
Return `p` or `q` when you find one. If both subtrees return something non-null, the current node is where they meet. Otherwise pass up whichever side is non-null.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }
TreeNode* find(TreeNode* t, int v) { if (!t || t->val == v) return t; TreeNode* l = find(t->left, v); return l ? l : find(t->right, v); }

TreeNode* lca(TreeNode* t, TreeNode* p, TreeNode* q) {
    if (!t || t == p || t == q) return t;
    TreeNode* l = lca(t->left, p, q);
    TreeNode* r = lca(t->right, p, q);
    if (l && r) return t;            // p and q are on different sides: t is the meeting point
    return l ? l : r;                // otherwise pass up what was found
}

int main() {
    TreeNode* root = build({3, 5, 1, 6, 2, 0, 8, N, N, 7, 4});
    cout << lca(root, find(root, 5), find(root, 1))->val << ' ' << lca(root, find(root, 5), find(root, 4))->val << ' '
         << lca(root, find(root, 6), find(root, 4))->val << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(h) |
:::

For **many** LCA queries on a fixed tree, *binary lifting* answers each in $O(\log n)$ after $O(n \log n)$ preprocessing.
:::
:::

:::problem Count Good Nodes in Binary Tree {level=medium lc=count-good-nodes-in-binary-tree tags="tree,top-down DFS"}
A node is **good** if no node on the path from the root to it has a greater value. Count the good nodes.

Example: `[3,1,4,3,null,1,5]` → `4`.

:::hint Hint
Top-down: pass the maximum value seen so far on the path.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

int goodNodes(TreeNode* t, int maxSoFar = INT_MIN) {
    if (!t) return 0;
    int good = t->val >= maxSoFar;
    int m = max(maxSoFar, t->val);
    return good + goodNodes(t->left, m) + goodNodes(t->right, m);
}

int main() { cout << goodNodes(build({3, 1, 4, 3, N, 1, 5})) << ' ' << goodNodes(build({3, 3, N, 4, 2})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Symmetric Tree {level=easy lc=symmetric-tree tags="tree,recursion"}
Return whether a tree is a mirror image of itself.

:::hint Hint
Compare two subtrees at once: `mirror(a, b)` holds when the values match, `mirror(a.left, b.right)` and `mirror(a.right, b.left)`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

bool mirror(TreeNode* a, TreeNode* b) {
    if (!a || !b) return a == b;
    return a->val == b->val && mirror(a->left, b->right) && mirror(a->right, b->left);
}
bool isSymmetric(TreeNode* root) { return !root || mirror(root->left, root->right); }

int main() { cout << boolalpha << isSymmetric(build({1, 2, 2, 3, 4, 4, 3})) << ' ' << isSymmetric(build({1, 2, 2, N, 3, N, 3})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::
:::
:::

:::problem Subtree of Another Tree {level=easy lc=subtree-of-another-tree tags="tree,recursion,hashing"}
Return whether `sub` appears in `root` as a complete subtree (some node of `root` plus **all** of its descendants).

:::hint Hint
At every node of `root`, run Same Tree against `sub`. That's $O(n \cdot m)$. For $O(n + m)$, serialize both trees with null markers and search for one string inside the other (KMP), or hash subtrees.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

bool same(TreeNode* a, TreeNode* b) { if (!a || !b) return a == b; return a->val == b->val && same(a->left, b->left) && same(a->right, b->right); }
bool isSubtree(TreeNode* root, TreeNode* sub) {
    if (!root) return !sub;
    return same(root, sub) || isSubtree(root->left, sub) || isSubtree(root->right, sub);
}

int main() {
    cout << boolalpha << isSubtree(build({3, 4, 5, 1, 2}), build({4, 1, 2})) << ' '
         << isSubtree(build({3, 4, 5, 1, 2, N, N, N, N, 0}), build({4, 1, 2})) << '\n';
}
```

:::complexity
Time | O(n \cdot m) | O(n + m) with serialization + KMP
Space | O(h) |
:::
:::
:::

## Check yourself

```quiz
? For the diameter, why does the DFS return the height but record left + right?
+ A parent can only extend a single downward chain, but the best path may bend at any node
- To save memory
- Because the diameter is always through the root
> Return one thing, record another.

? Max Path Sum clamps children's gains with max(0, gain). Why?
+ A negative branch would only lower the sum, so it's better not to include it
- To avoid overflow
- Because node values are positive
> Choosing "no extension" contributes 0.

? Path Sum III uses a prefix-sum map. Why remove the prefix on the way back up?
+ Paths must be downward, so prefixes from other branches must not be counted
- To save memory only
- It's not necessary
> The map must hold only the current root-to-node path.
```

:::keypoints
- **Bottom-up:** return a subtree summary (height, size, balanced?) and combine at the parent.
- **Top-down:** pass path information down (depth, running sum, max so far, valid range).
- **Global answer:** return the best single chain, record the best path that bends at each node (diameter, max path sum).
- Path problems reuse array techniques along root-to-node paths (prefix sums + a hash map, with undo).
- LCA: return p/q when found; the node where both sides report is the answer.
:::
