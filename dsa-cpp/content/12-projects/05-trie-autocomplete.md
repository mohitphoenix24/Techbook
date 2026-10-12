---
title: Search Autocomplete
level: advanced
time: 60
icon: search
cover: #f59e0b,#ef4444
tags: trie, top-k, heap, design, caching
summary: Build a type-ahead engine like a search bar's — a trie of queries with frequencies, top-k suggestions per prefix (first by DFS + heap, then by caching the top-k list at every node for O(prefix) queries), live frequency updates, and a comparison of query cost between the two designs.
---

Type "dij" into a search bar and it suggests "dijkstra", "dijkstra algorithm", "dijkstra vs a*". That's **autocomplete**: given a prefix, return the most popular completions, fast, while you type. It's a classic system-design-meets-DSA interview question (LeetCode 642, *Design Search Autocomplete System*).

:::flow Plan
Trie | store every query, with how often it was searched
Naive top-k | walk the prefix, then DFS the subtree, keep the k best with a heap
Cached top-k | every node stores its own top-k list, updated on insert
Live updates | a finished search raises that query's count
Compare | nodes visited per query, naive vs cached
:::

## Version 1: DFS + heap

Walk down the prefix ($O(p)$), then visit **every** word in that subtree, keeping the best k in a min-heap of size k. Correct and simple, but a short prefix like `"a"` can have a huge subtree: $O(\text{subtree} \cdot \log k)$ per keystroke.

## Version 2: cache the top-k at every node

Each node keeps a small sorted list of the **k best completions** in its subtree. A query is then just walking the prefix and reading the list: $O(p + k)$.

On insert or update of a word with count $c$, walk down its path and, at each node, add or update the word in that node's list (re-sort, then trim to k). That costs $O(L \cdot k)$ per update. We pay at write time to make reads cheap, which is the right trade for autocomplete (reads hugely outnumber writes).

:::def Ranking order
Suggestions are ordered by **count descending**, then **alphabetically** for ties, so the output is deterministic. Both versions must use exactly the same comparison.
:::

```cpp run title="Autocomplete: naive DFS vs cached top-k, cross-checked"
#include <bits/stdc++.h>
using namespace std;

struct Suggestion { string word; long long count; };
bool better(const Suggestion& a, const Suggestion& b) {           // the ranking order
    return a.count != b.count ? a.count > b.count : a.word < b.word;
}

class Autocomplete {
public:
    explicit Autocomplete(int k) : k_(k), nodes_(1) {}

    void record(const string& q, long long times = 1) {            // insert or increase a query's count
        int cur = 0;
        vector<int> path = {0};
        for (char c : q) {
            int idx = (unsigned char)c;
            auto it = nodes_[cur].child.find(idx);
            if (it == nodes_[cur].child.end()) { nodes_[cur].child[idx] = nodes_.size(); nodes_.emplace_back(); cur = nodes_.size() - 1; }
            else cur = it->second;
            path.push_back(cur);
        }
        long long total = (nodes_[cur].count += times);
        for (int node : path) updateTop(node, {q, total});         // refresh the cached lists along the path
    }

    vector<Suggestion> suggestCached(const string& prefix) {      // O(p + k)
        int node = walk(prefix);
        return node < 0 ? vector<Suggestion>{} : nodes_[node].top;
    }

    vector<Suggestion> suggestNaive(const string& prefix, long long& visited) {   // O(subtree log k)
        int node = walk(prefix);
        if (node < 0) return {};
        auto cmp = [](const Suggestion& a, const Suggestion& b) { return better(a, b); };   // the worst on top
        priority_queue<Suggestion, vector<Suggestion>, decltype(cmp)> heap(cmp);
        string cur = prefix;
        function<void(int)> dfs = [&](int u) {
            visited++;
            if (nodes_[u].count > 0) {
                heap.push({cur, nodes_[u].count});
                if ((int)heap.size() > k_) heap.pop();             // drop the worst
            }
            for (auto& [c, v] : nodes_[u].child) { cur.push_back((char)c); dfs(v); cur.pop_back(); }
        };
        dfs(node);
        vector<Suggestion> out;
        while (!heap.empty()) { out.push_back(heap.top()); heap.pop(); }
        reverse(out.begin(), out.end());
        return out;
    }

private:
    struct Node { map<int, int> child; long long count = 0; vector<Suggestion> top; };
    int k_;
    vector<Node> nodes_;
    int walk(const string& p) {
        int cur = 0;
        for (char c : p) {
            auto it = nodes_[cur].child.find((unsigned char)c);
            if (it == nodes_[cur].child.end()) return -1;
            cur = it->second;
        }
        return cur;
    }
    void updateTop(int node, const Suggestion& s) {
        auto& top = nodes_[node].top;
        auto it = find_if(top.begin(), top.end(), [&](const Suggestion& x) { return x.word == s.word; });
        if (it != top.end()) it->count = s.count; else top.push_back(s);
        sort(top.begin(), top.end(), better);
        if ((int)top.size() > k_) top.resize(k_);
    }
};

int main() {
    Autocomplete ac(3);
    vector<pair<string, int>> log = {{"dijkstra", 50}, {"dijkstra algorithm", 30}, {"dfs", 45}, {"dp", 80}, {"dp on trees", 12},
                                     {"deque", 20}, {"dijkstra vs bfs", 30}, {"dsu", 25}, {"divide and conquer", 18}};
    for (auto& [q, c] : log) ac.record(q, c);

    for (string p : {"d", "di", "dij", "dp ", "x"}) {
        cout << '"' << p << "\" ->";
        for (auto& s : ac.suggestCached(p)) cout << "  " << s.word << " (" << s.count << ")";
        cout << '\n';
    }
    ac.record("dsu", 100);                                         // dsu goes viral
    cout << "after dsu trends: \"d\" ->";
    for (auto& s : ac.suggestCached("d")) cout << "  " << s.word;
    cout << '\n';

    // cross-check the two versions on random data
    Autocomplete big(5);
    mt19937 rng(12);
    for (int i = 0; i < 3000; i++) {
        string w; int len = 1 + rng() % 7;
        for (int j = 0; j < len; j++) w += char('a' + rng() % 4);
        big.record(w, 1 + rng() % 50);
    }
    bool same = true; long long visited = 0;
    for (string p : {"a", "ab", "c", "dd", "abc", "b"}) {
        auto x = big.suggestCached(p), y = big.suggestNaive(p, visited);
        same &= x.size() == y.size();
        for (size_t i = 0; same && i < x.size(); i++) same &= x[i].word == y[i].word && x[i].count == y[i].count;
    }
    cout << "cached == naive on random data: " << boolalpha << same << " (the naive version visited " << visited << " nodes for 6 queries)\n";
}
```

:::complexity
Time | O(p + k) | per query with cached lists; O(subtree · log k) naive
Space | O(N \cdot k) | each of the N trie nodes stores up to k suggestions
:::

## Design discussion (what interviewers ask next)

- **Memory:** caching k suggestions per node multiplies memory by about k. To save space, cache only at shallow depths (prefixes of length ≤ 3), where subtrees are huge, and run the DFS deeper down, where subtrees are small.
- **Updates at scale:** real systems rebuild the top-k caches offline (hourly or daily) from logs instead of updating on every search.
- **Typos:** add fuzzy matching (edit distance ≤ 1, from the String DP lesson) by exploring nearby branches.
- **Sharding:** split the trie by first letter across machines.

## Extensions

:::exercise Make it your own
1. Solve LeetCode 642: input characters one at a time; `#` ends a query and records it.
2. Add `remove(query)` that also cleans up the cached lists (hint: recompute a node's list from its children's lists).
3. Store the top-k as a fixed-size array and use insertion instead of a full sort, to reduce the constant factor.
:::

:::keypoints
- A trie gives prefix lookup in $O(p)$. Top-k can come from a DFS + size-k heap, or from cached per-node lists.
- Caching moves work from reads to writes: $O(p + k)$ queries, $O(L \cdot k)$ updates.
- Keep a single deterministic ranking function, and cross-check a fast version against a naive one.
:::
