---
title: Iterative Traversals, Construction & Serialization
level: intermediate
time: 55
summary: Traversals without recursion (explicit stacks for pre/in/post order), Morris inorder traversal in O(1) space, zigzag level order, rebuilding a tree from preorder + inorder (and why the pair determines the tree), flattening to a list, and serializing/deserializing a tree to a string.
---

Interviewers often follow "traverse this tree" with "**now do it without recursion**", or "**in O(1) space**". This lesson covers those follow-ups, and the closely related problems of rebuilding and serializing trees.

## Iterative traversals with a stack

Recursion uses the call stack implicitly. An explicit `stack<TreeNode*>` does the same job without the depth limit.

```cpp run level=intermediate title="Iterative preorder, inorder and postorder"
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

vector<int> preorder(TreeNode* root) {
    vector<int> out; stack<TreeNode*> st;
    if (root) st.push(root);
    while (!st.empty()) {
        TreeNode* t = st.top(); st.pop();
        out.push_back(t->val);
        if (t->right) st.push(t->right);      // push right first so left is processed first
        if (t->left) st.push(t->left);
    }
    return out;
}

vector<int> inorder(TreeNode* root) {
    vector<int> out; stack<TreeNode*> st;
    TreeNode* cur = root;
    while (cur || !st.empty()) {
        while (cur) { st.push(cur); cur = cur->left; }   // go as far left as possible
        cur = st.top(); st.pop();
        out.push_back(cur->val);                        // visit
        cur = cur->right;                               // then the right subtree
    }
    return out;
}

vector<int> postorder(TreeNode* root) {                 // reverse of (node, right, left)
    vector<int> out; stack<TreeNode*> st;
    if (root) st.push(root);
    while (!st.empty()) {
        TreeNode* t = st.top(); st.pop();
        out.push_back(t->val);
        if (t->left) st.push(t->left);
        if (t->right) st.push(t->right);
    }
    reverse(out.begin(), out.end());
    return out;
}

int main() {
    TreeNode* root = build({1, 2, 3, 4, 5, N, 6, N, N, 7});
    for (auto& [name, v] : vector<pair<string, vector<int>>>{{"pre ", preorder(root)}, {"in  ", inorder(root)}, {"post", postorder(root)}}) {
        cout << name << ": ";
        for (int x : v) cout << x << ' ';
        cout << '\n';
    }
}
```

:::tip The postorder trick
Preorder with the children pushed in the opposite order gives (node, right, left). Reversing that gives (left, right, node), which is postorder. It's much easier to remember than the "one stack with a last-visited pointer" version.
:::

## Morris traversal: inorder in O(1) space

Every node's **inorder predecessor** (the rightmost node of its left subtree) has a null `right` pointer. Morris traversal **temporarily points it back** at the node, using it as a thread to climb back up without a stack, and removes the thread afterwards.

```cpp run level=advanced title="Morris inorder traversal"
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

vector<int> morrisInorder(TreeNode* root) {
    vector<int> out;
    TreeNode* cur = root;
    while (cur) {
        if (!cur->left) { out.push_back(cur->val); cur = cur->right; continue; }
        TreeNode* pred = cur->left;                          // find the inorder predecessor
        while (pred->right && pred->right != cur) pred = pred->right;
        if (!pred->right) { pred->right = cur; cur = cur->left; }               // make a thread, go left
        else { pred->right = nullptr; out.push_back(cur->val); cur = cur->right; } // remove it, visit, go right
    }
    return out;
}

int main() {
    TreeNode* root = build({4, 2, 6, 1, 3, 5, 7});
    for (int x : morrisInorder(root)) cout << x << ' ';
    cout << "\n(the tree is unchanged afterwards: root->left->right = " << root->left->right->val << ")\n";
}
```

:::complexity
Time | O(n) | each edge is walked a constant number of times (about 3)
Space | O(1) | no stack and no recursion
:::

## Problems

:::problem Binary Tree Zigzag Level Order Traversal {level=medium lc=binary-tree-zigzag-level-order-traversal tags="tree,BFS"}
Level order, but alternate the direction on each level: left→right, then right→left, and so on.

Example: `[3,9,20,null,null,15,7]` → `[[3],[20,9],[15,7]]`.

:::hint Hint
Ordinary BFS by level. Write each value into position `k` or `sz−1−k` of the level's array depending on the direction (or reverse every other level).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

vector<vector<int>> zigzagLevelOrder(TreeNode* root) {
    vector<vector<int>> out;
    queue<TreeNode*> q;
    if (root) q.push(root);
    bool leftToRight = true;
    while (!q.empty()) {
        int sz = q.size();
        vector<int> level(sz);
        for (int k = 0; k < sz; k++) {
            TreeNode* x = q.front(); q.pop();
            level[leftToRight ? k : sz - 1 - k] = x->val;
            if (x->left) q.push(x->left);
            if (x->right) q.push(x->right);
        }
        out.push_back(level);
        leftToRight = !leftToRight;
    }
    return out;
}

int main() {
    for (auto& lv : zigzagLevelOrder(build({3, 9, 20, 1, 2, 15, 7}))) { cout << '['; for (int x : lv) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(w) |
:::
:::
:::

:::problem Construct Binary Tree from Preorder and Inorder Traversal {level=medium lc=construct-binary-tree-from-preorder-and-inorder-traversal tags="tree,divide and conquer,hash map"}
Rebuild a tree (with distinct values) from its preorder and inorder sequences.

Example: `pre=[3,9,20,15,7]`, `in=[9,3,15,20,7]` → `[3,9,20,null,null,15,7]`.

:::hint Hint 1
`pre[0]` is the root. Find it in the inorder sequence: everything to its left is the left subtree and everything to its right is the right subtree. Their sizes tell you how to split the preorder sequence too.
:::

:::hint Hint 2
Use a hash map from value to inorder index, so finding the root is O(1). That gives O(n) in total.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };

TreeNode* buildTree(const vector<int>& pre, const vector<int>& in) {
    unordered_map<int, int> pos;
    for (int i = 0; i < (int)in.size(); i++) pos[in[i]] = i;
    int p = 0;                                          // next root in preorder
    function<TreeNode*(int, int)> go = [&](int lo, int hi) -> TreeNode* {   // build from in[lo..hi]
        if (lo > hi) return nullptr;
        TreeNode* root = new TreeNode(pre[p++]);
        int m = pos[root->val];
        root->left = go(lo, m - 1);                     // preorder lists the whole left subtree first
        root->right = go(m + 1, hi);
        return root;
    };
    return go(0, in.size() - 1);
}

void printPost(TreeNode* t) { if (!t) return; printPost(t->left); printPost(t->right); cout << t->val << ' '; }

int main() {
    TreeNode* t = buildTree({3, 9, 20, 15, 7}, {9, 3, 15, 20, 7});
    cout << "postorder of the rebuilt tree: "; printPost(t); cout << '\n';
}
```

:::proof Why preorder + inorder determine the tree (with distinct values)
By induction on the size. The root is `pre[0]`. Its position in the inorder sequence splits the remaining values into exactly the left-subtree set and the right-subtree set. In preorder, the left subtree's values come next as one block of the same size, followed by the right subtree's block. So both subtrees get their own (preorder, inorder) pair, which by induction determines them uniquely. Preorder + postorder **doesn't** work in general: a node with a single child could have it on either side.
:::

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Flatten Binary Tree to Linked List {level=medium lc=flatten-binary-tree-to-linked-list tags="tree,in-place,Morris-like"}
Flatten the tree in place into a "linked list" that follows preorder, using the `right` pointers (all `left` pointers become null).

Example: `[1,2,5,3,4,null,6]` → `1→2→3→4→5→6`.

:::hint Hint
For each node with a left subtree: find the rightmost node of the left subtree, attach the node's right subtree there, move the left subtree to the right, and set left to null. Then continue down the right side. That's O(1) space.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

void flatten(TreeNode* root) {
    for (TreeNode* cur = root; cur; cur = cur->right) {
        if (!cur->left) continue;
        TreeNode* pred = cur->left;
        while (pred->right) pred = pred->right;    // rightmost node of the left subtree
        pred->right = cur->right;                  // hang the right subtree after it
        cur->right = cur->left;                    // move the left subtree to the right
        cur->left = nullptr;
    }
}

int main() {
    TreeNode* t = build({1, 2, 5, 3, 4, N, 6});
    flatten(t);
    for (; t; t = t->right) cout << t->val << (t->left ? "(left not null!)" : "") << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) | each node is the "rightmost of a left subtree" at most once
Space | O(1) |
:::
:::
:::

:::problem Serialize and Deserialize Binary Tree {level=hard lc=serialize-and-deserialize-binary-tree tags="tree,DFS,design"}
Design `serialize(root) → string` and `deserialize(string) → root` so that a tree survives the round trip.

:::hint Hint
A preorder traversal **with null markers** (`#`) determines the tree uniquely. To deserialize, read the tokens in the same preorder, recursively: a token is either `#` (null) or a value followed by its left and right subtrees.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

class Codec {
public:
    string serialize(TreeNode* root) {
        string s;
        function<void(TreeNode*)> go = [&](TreeNode* t) {
            if (!t) { s += "# "; return; }
            s += to_string(t->val) + ' ';
            go(t->left); go(t->right);
        };
        go(root);
        return s;
    }
    TreeNode* deserialize(const string& data) {
        istringstream in(data);
        function<TreeNode*()> go = [&]() -> TreeNode* {
            string tok; in >> tok;
            if (tok == "#") return nullptr;
            TreeNode* t = new TreeNode(stoi(tok));
            t->left = go();
            t->right = go();
            return t;
        };
        return go();
    }
};

int main() {
    Codec c;
    string s = c.serialize(build({1, 2, 3, N, N, 4, 5, -6}));
    cout << "serialized:   " << s << '\n';
    cout << "round trip:   " << c.serialize(c.deserialize(s)) << '\n';
}
```

:::complexity
Time | O(n) | both directions
Space | O(n) |
:::

**Why the null markers are needed:** a preorder alone (`1 2 3`) fits several different trees. With the markers there's exactly one way to parse the token stream.
:::
:::

## Check yourself

```quiz
? In iterative preorder with a stack, which child do you push first?
+ The right child, so the left child is popped (processed) first
- The left child
- Either; the order doesn't matter
> A stack is LIFO.

? What makes Morris traversal O(1) space?
+ Temporary threads from inorder predecessors back to their ancestors replace the stack
- It skips half the nodes
- It uses recursion instead of a stack
> The threads are removed again, so the tree is restored.

? Which pair of traversals determines a binary tree with distinct values?
+ Preorder + inorder
- Preorder + postorder
- Level order alone
> Inorder separates left from right; preorder identifies the roots.
```

:::keypoints
- Iterative traversals: preorder (push right then left), inorder (go left, pop, visit, go right), postorder = reversed (node, right, left).
- Morris traversal threads predecessors back to their nodes, giving inorder in $O(1)$ space.
- Zigzag = BFS levels plus alternating write positions.
- Preorder + inorder rebuild a tree in $O(n)$ with a value→index map. Preorder with null markers serializes any tree.
:::
