---
title: Tries (Prefix Trees)
level: intermediate
time: 50
summary: Tries for fast prefix queries — structure and O(L) operations, array vs hash-map children and memory trade-offs, counting words by prefix, wildcard search with DFS, Word Search II (trie + grid backtracking with pruning), and the binary trie that finds a maximum XOR pair greedily bit by bit.
---

A hash set answers "is this exact word present?" A **trie** also answers "which words **start with** this prefix?" in time proportional to the prefix length, no matter how many words are stored. Autocomplete, spell checkers, IP routing and word games all use tries.

:::def Trie
A tree where each edge is labelled with a character and each node represents the **prefix** spelled by the path from the root to it. Nodes where a word ends are marked. Words that share a prefix share the path for it.
:::

```viz algo=trie
```

## Operations

| Operation | Cost |
|---|---|
| insert a word of length $L$ | $O(L)$ |
| search an exact word | $O(L)$ |
| does any word start with prefix $P$? | $O(\lvert P\rvert)$ |
| list all words with prefix $P$ | $O(\lvert P\rvert + \text{output size})$ |
| memory | $O(\text{total characters} \times \Sigma)$ with arrays of size $\Sigma$ |

:::tip Arrays vs maps for children
`Node* child[26]` is fast and simple, but uses $26 \times 8 = 208$ bytes per node even when most slots are empty. `unordered_map<char, Node*>` (or `map`) saves memory for large or sparse alphabets but is slower. For interviews with lowercase words, use the array. In performance-critical code, store nodes in a `vector` and use `int` indexes instead of pointers.
:::

## Problems

:::problem Implement Trie (Prefix Tree) {level=medium lc=implement-trie-prefix-tree tags="trie,design"}
Implement `insert(word)`, `search(word)` (is the exact word present?) and `startsWith(prefix)`.

:::hint Hint
Each node has 26 child pointers and an `end` flag. `search` and `startsWith` walk the same path. The only difference is whether the final node must have `end` set.
:::

:::solution
Nodes live in a `vector` and children are `int` indexes. This is cache-friendly and needs no manual `delete`.

```cpp run
#include <bits/stdc++.h>
using namespace std;

class Trie {
public:
    Trie() : nodes(1) {}
    void insert(const string& w) {
        int cur = 0;
        for (char c : w) {
            int& nxt = nodes[cur].child[c - 'a'];
            if (nxt == 0) { nxt = nodes.size(); nodes.emplace_back(); }   // careful: emplace_back may reallocate,
            cur = nodes[cur].child[c - 'a'];                              // so re-read rather than reuse `nxt`
        }
        nodes[cur].end = true;
    }
    bool search(const string& w) const { int n = walk(w); return n >= 0 && nodes[n].end; }
    bool startsWith(const string& p) const { return walk(p) >= 0; }
private:
    struct Node { array<int, 26> child{}; bool end = false; };     // child index 0 = "none" (0 is the root)
    vector<Node> nodes;
    int walk(const string& s) const {
        int cur = 0;
        for (char c : s) { cur = nodes[cur].child[c - 'a']; if (cur == 0) return -1; }
        return cur;
    }
};

int main() {
    Trie t;
    t.insert("apple");
    cout << boolalpha << t.search("apple") << ' ' << t.search("app") << ' ' << t.startsWith("app") << ' ';
    t.insert("app");
    cout << t.search("app") << '\n';
}
```

:::warn Reference invalidation
Writing to `nxt` after `nodes.emplace_back()` would be a bug: the reference points into the vector's **old** buffer if it reallocated. The code assigns to `nxt` **before** growing the vector, then re-reads the child index. AddressSanitizer catches the wrong version immediately. Try it.
:::

:::complexity
Time | O(L) | per operation
Space | O(N \cdot 26) | N = total nodes ≤ total characters inserted
:::
:::
:::

:::problem Design Add and Search Words Data Structure {level=medium lc=design-add-and-search-words-data-structure tags="trie,DFS,wildcard"}
Support `addWord(word)` and `search(pattern)`, where the pattern may contain `.`, which matches any single letter.

Example: add "bad", "dad", "mad"; `search(".ad")` → true, `search("b..")` → true, `search("pad")` → false.

:::hint Hint
A normal trie walk, except that on `.` you try **every** existing child (DFS with backtracking).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class WordDictionary {
public:
    WordDictionary() : nodes(1) {}
    void addWord(const string& w) {
        int cur = 0;
        for (char c : w) {
            if (!nodes[cur].child[c - 'a']) { nodes[cur].child[c - 'a'] = nodes.size(); nodes.emplace_back(); }
            cur = nodes[cur].child[c - 'a'];
        }
        nodes[cur].end = true;
    }
    bool search(const string& p) const { return dfs(p, 0, 0); }
private:
    struct Node { array<int, 26> child{}; bool end = false; };
    vector<Node> nodes;
    bool dfs(const string& p, int i, int cur) const {
        if (i == (int)p.size()) return nodes[cur].end;
        if (p[i] != '.') { int n = nodes[cur].child[p[i] - 'a']; return n && dfs(p, i + 1, n); }
        for (int n : nodes[cur].child) if (n && dfs(p, i + 1, n)) return true;   // wildcard: try all
        return false;
    }
};

int main() {
    WordDictionary d;
    for (string w : {"bad", "dad", "mad"}) d.addWord(w);
    cout << boolalpha << d.search("pad") << ' ' << d.search("bad") << ' ' << d.search(".ad") << ' ' << d.search("b..") << ' ' << d.search("...") << ' ' << d.search("..") << '\n';
}
```

:::complexity
Time | O(L) | without dots; O(26^L) worst case with all dots
Space | O(N \cdot 26) |
:::
:::
:::

:::problem Word Search II {level=hard lc=word-search-ii tags="trie,backtracking,grid"}
Return all words from a list that can be traced in a letter grid (adjacent cells, no cell reused in one word).

Example: board `[["o","a","a","n"],["e","t","a","e"],["i","h","k","r"],["i","f","l","v"]]`, words `["oath","pea","eat","rain"]` → `["eat","oath"]`.

:::hint Hint 1
Running Word Search I once per word repeats the same grid exploration many times. Put all the words in a trie and do **one** DFS from each cell, walking the trie alongside the grid.
:::

:::hint Hint 2
Stop as soon as the current path isn't a prefix of any word. Store the complete word at its end node, and clear it once found (no duplicate results).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<string> findWords(vector<vector<char>>& b, const vector<string>& words) {
    struct Node { array<int, 26> ch{}; int word = -1; };
    vector<Node> t(1);
    for (int w = 0; w < (int)words.size(); w++) {
        int cur = 0;
        for (char c : words[w]) {
            if (!t[cur].ch[c - 'a']) { t[cur].ch[c - 'a'] = t.size(); t.emplace_back(); }
            cur = t[cur].ch[c - 'a'];
        }
        t[cur].word = w;
    }
    int R = b.size(), C = b[0].size();
    vector<string> out;
    function<void(int, int, int)> dfs = [&](int r, int c, int node) {
        if (r < 0 || r >= R || c < 0 || c >= C || b[r][c] == '#') return;
        int nxt = t[node].ch[b[r][c] - 'a'];
        if (!nxt) return;                                   // no word continues this way: prune
        if (t[nxt].word >= 0) { out.push_back(words[t[nxt].word]); t[nxt].word = -1; }
        char saved = b[r][c];
        b[r][c] = '#';
        dfs(r + 1, c, nxt); dfs(r - 1, c, nxt); dfs(r, c + 1, nxt); dfs(r, c - 1, nxt);
        b[r][c] = saved;
    };
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++) dfs(r, c, 0);
    sort(out.begin(), out.end());
    return out;
}

int main() {
    vector<vector<char>> b = {{'o', 'a', 'a', 'n'}, {'e', 't', 'a', 'e'}, {'i', 'h', 'k', 'r'}, {'i', 'f', 'l', 'v'}};
    for (auto& w : findWords(b, {"oath", "pea", "eat", "rain"})) cout << w << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(R \cdot C \cdot 4 \cdot 3^{L-1}) | worst case; trie pruning makes it far smaller in practice
Space | O(\text{total word length}) | the trie
:::

A further optimization: delete leaf trie nodes after their word is found, so finished branches aren't explored again.
:::
:::

:::problem Maximum XOR of Two Numbers in an Array {level=medium lc=maximum-xor-of-two-numbers-in-an-array tags="binary trie,bit manipulation,greedy"}
Return the maximum `a[i] XOR a[j]`.

Example: `[3,10,5,25,2,8]` → `28` (5 XOR 25).

:::hint Hint 1
Put every number in a **binary trie** (one level per bit, from the most significant bit down).
:::

:::hint Hint 2
For each number, walk the trie greedily: at every bit, go to the **opposite** bit if that child exists. A 1 in a higher bit beats anything in the lower bits.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findMaximumXOR(const vector<int>& a) {
    vector<array<int, 2>> t(1, {0, 0});
    auto insert = [&](int x) {
        int cur = 0;
        for (int b = 30; b >= 0; b--) {
            int bit = (x >> b) & 1;
            if (!t[cur][bit]) { t[cur][bit] = t.size(); t.push_back({0, 0}); }
            cur = t[cur][bit];
        }
    };
    auto bestWith = [&](int x) {
        int cur = 0, res = 0;
        for (int b = 30; b >= 0; b--) {
            int want = ((x >> b) & 1) ^ 1;                 // the opposite bit makes this XOR bit 1
            if (t[cur][want]) { res |= 1 << b; cur = t[cur][want]; }
            else cur = t[cur][want ^ 1];
        }
        return res;
    };
    for (int x : a) insert(x);
    int best = 0;
    for (int x : a) best = max(best, bestWith(x));
    return best;
}

int main() { cout << findMaximumXOR({3, 10, 5, 25, 2, 8}) << ' ' << findMaximumXOR({14, 70, 53, 83, 49, 91, 36, 80, 92, 51, 66, 70}) << '\n'; }
```

:::proof Why the greedy walk finds the maximum
Comparing two numbers, the highest bit where they differ decides which is bigger. Setting XOR bit $b$ to 1 is worth $2^b$, which is more than all lower bits combined ($2^b - 1$). So at each level, taking the opposite bit whenever it exists can never be beaten by any choice in the lower bits.
:::

:::complexity
Time | O(n \cdot 31) |
Space | O(n \cdot 31) |
:::
:::
:::

## Check yourself

```quiz
? Checking whether any stored word starts with prefix P in a trie costs…
+ O(|P|)
- O(number of words)
- O(log n)
> Independent of how many words are stored.

? Why is Word Search II much faster with a trie than one search per word?
+ One DFS explores the grid for all words at once and stops when no word continues
- Tries are always faster than arrays
- It avoids recursion
> Shared prefixes are explored once.

? In the binary trie for max XOR, why insert from the most significant bit down?
+ So the greedy choice at higher bits is made first, and higher bits dominate lower ones
- To save memory
- The order doesn't matter
> 2^b > 2^b − 1 = all lower bits together.
```

:::keypoints
- A trie stores strings by shared prefixes: $O(L)$ insert/search/prefix query, independent of the number of words.
- Children: `array<int,26>` (fast) or a hash map (sparse alphabets). Index-based node pools avoid manual memory management.
- Wildcards → DFS over all children. Many grid words → trie + backtracking with pruning.
- Binary tries answer XOR-maximization greedily, bit by bit, from the most significant bit.
:::
