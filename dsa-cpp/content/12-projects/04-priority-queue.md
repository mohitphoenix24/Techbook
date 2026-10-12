---
title: An Indexed Priority Queue (with decrease-key)
level: advanced
time: 60
icon: gauge
cover: #22c55e,#0ea5e9
tags: binary heap, templates, decrease-key, Dijkstra, testing
summary: Implement a generic binary heap with a custom comparator, then extend it into an indexed priority queue that supports decreaseKey/update in O(log n) by tracking each item's position in the heap — and use it to run Dijkstra without stale entries, compared against the lazy-deletion version.
---

`std::priority_queue` is great, but it can't **change the priority** of an item that's already inside. Dijkstra's algorithm, Prim's algorithm, schedulers and event simulators all want to say "this item is now more urgent". The usual workaround is pushing duplicates and skipping stale ones (*lazy deletion*). This project builds the real thing: an **indexed priority queue** with $O(\log n)$ `decreaseKey`.

:::flow Plan
Heap | an array-based binary heap with a comparator
Index | pos[item] = where the item sits in the heap array
Operations | push, pop, top, decreaseKey/update, contains
Test | random operations against a brute-force reference
Use it | Dijkstra with exactly V entries in the heap
:::

## The idea

The heap array holds **item ids** (0 … n−1), ordered by `key[id]`. A second array `pos[id]` records each item's **current index** in the heap. Every swap updates both, so finding an item is $O(1)$, and changing its key is a sift-up or sift-down from that position: $O(\log n)$.

:::def Indexed priority queue
A priority queue over a fixed universe of ids, where each id has a key that can be **updated in place**. It supports `push(id, key)`, `pop()`, `top()`, `contains(id)` and `update(id, newKey)`, all in $O(\log n)$ (top and contains in $O(1)$).
:::

## The implementation

```cpp run title="IndexedPQ<Key, Compare>, verified against brute force"
#include <bits/stdc++.h>
using namespace std;

template <typename Key, typename Compare = less<Key>>      // less: the smallest key on top (a min-PQ)
class IndexedPQ {
public:
    explicit IndexedPQ(int n) : key_(n), pos_(n, -1) {}
    bool empty() const { return heap_.empty(); }
    int size() const { return heap_.size(); }
    bool contains(int id) const { return pos_[id] != -1; }
    int top() const { return heap_[0]; }
    const Key& keyOf(int id) const { return key_[id]; }

    void push(int id, const Key& k) {
        key_[id] = k;
        pos_[id] = heap_.size();
        heap_.push_back(id);
        siftUp(pos_[id]);
    }
    int pop() {
        int id = heap_[0];
        swapAt(0, heap_.size() - 1);
        heap_.pop_back();
        pos_[id] = -1;
        if (!heap_.empty()) siftDown(0);
        return id;
    }
    void update(int id, const Key& k) {              // works for both decrease and increase
        bool better = cmp_(k, key_[id]);
        key_[id] = k;
        better ? siftUp(pos_[id]) : siftDown(pos_[id]);
    }

private:
    vector<Key> key_;
    vector<int> pos_, heap_;
    Compare cmp_;
    bool before(int i, int j) const { return cmp_(key_[heap_[i]], key_[heap_[j]]); }
    void swapAt(int i, int j) { swap(heap_[i], heap_[j]); pos_[heap_[i]] = i; pos_[heap_[j]] = j; }
    void siftUp(int i) { while (i > 0 && before(i, (i - 1) / 2)) { swapAt(i, (i - 1) / 2); i = (i - 1) / 2; } }
    void siftDown(int i) {
        int n = heap_.size();
        while (true) {
            int l = 2 * i + 1, r = l + 1, best = i;
            if (l < n && before(l, best)) best = l;
            if (r < n && before(r, best)) best = r;
            if (best == i) return;
            swapAt(i, best);
            i = best;
        }
    }
};

int main() {
    const int N = 200;
    mt19937 rng(4);
    IndexedPQ<int> pq(N);
    map<int, int> ref;                                 // id -> key (brute-force reference)
    for (int step = 0; step < 50000; step++) {
        int op = rng() % 4, id = rng() % N, k = rng() % 1000;
        if (op == 0 && !pq.contains(id)) { pq.push(id, k); ref[id] = k; }
        else if (op == 1 && pq.contains(id)) { pq.update(id, k); ref[id] = k; }
        else if (op == 2 && !pq.empty()) {
            int minKey = INT_MAX;
            for (auto& [i, kk] : ref) minKey = min(minKey, kk);
            int got = pq.pop();
            if (ref[got] != minKey) { cout << "WRONG at step " << step << '\n'; return 1; }
            ref.erase(got);
        }
    }
    cout << "50000 random push/update/pop operations match brute force. Remaining: " << pq.size() << '\n';

    IndexedPQ<string, greater<string>> maxPQ(3);       // works for any key type and order
    maxPQ.push(0, "pear"); maxPQ.push(1, "apple"); maxPQ.push(2, "fig");
    maxPQ.update(1, "zucchini");
    cout << "max after update: " << maxPQ.keyOf(maxPQ.top()) << '\n';
}
```

## Using it: Dijkstra with decrease-key

With an indexed PQ, every vertex is in the heap **at most once**, so there are no stale entries to skip. Let's compare it with the lazy-deletion version on a random graph:

```cpp run title="Dijkstra: indexed PQ vs lazy deletion"
#include <bits/stdc++.h>
using namespace std;
using ll = long long;

template <typename Key>
struct MinIPQ {                                       // a compact min indexed PQ (same idea as above)
    vector<Key> key; vector<int> pos, h;
    explicit MinIPQ(int n) : key(n), pos(n, -1) {}
    bool empty() const { return h.empty(); }
    bool contains(int i) const { return pos[i] != -1; }
    void sw(int a, int b) { swap(h[a], h[b]); pos[h[a]] = a; pos[h[b]] = b; }
    void up(int i) { while (i && key[h[i]] < key[h[(i - 1) / 2]]) { sw(i, (i - 1) / 2); i = (i - 1) / 2; } }
    void down(int i) { for (int n = h.size();;) { int l = 2 * i + 1, r = l + 1, b = i; if (l < n && key[h[l]] < key[h[b]]) b = l; if (r < n && key[h[r]] < key[h[b]]) b = r; if (b == i) return; sw(i, b); i = b; } }
    void push(int i, Key k) { key[i] = k; pos[i] = h.size(); h.push_back(i); up(pos[i]); }
    void decrease(int i, Key k) { key[i] = k; up(pos[i]); }
    int pop() { int t = h[0]; sw(0, h.size() - 1); h.pop_back(); pos[t] = -1; if (!h.empty()) down(0); return t; }
};

int main() {
    int n = 20000, m = 100000;
    mt19937 rng(8);
    vector<vector<pair<int, int>>> adj(n);
    for (int i = 0; i < m; i++) { int u = rng() % n, v = rng() % n, w = rng() % 100 + 1; adj[u].push_back({v, w}); adj[v].push_back({u, w}); }
    const ll INF = LLONG_MAX / 4;

    vector<ll> d1(n, INF); d1[0] = 0;                 // indexed PQ
    MinIPQ<ll> pq(n); pq.push(0, 0);
    long long maxHeap1 = 1;
    while (!pq.empty()) {
        int u = pq.pop();
        for (auto [v, w] : adj[u]) if (d1[u] + w < d1[v]) {
            d1[v] = d1[u] + w;
            if (pq.contains(v)) pq.decrease(v, d1[v]); else pq.push(v, d1[v]);
            maxHeap1 = max<long long>(maxHeap1, pq.h.size());
        }
    }

    vector<ll> d2(n, INF); d2[0] = 0;                 // lazy deletion
    priority_queue<pair<ll, int>, vector<pair<ll, int>>, greater<>> q; q.push({0, 0});
    long long pushes = 1, stale = 0, maxHeap2 = 1;
    while (!q.empty()) {
        auto [d, u] = q.top(); q.pop();
        if (d > d2[u]) { stale++; continue; }
        for (auto [v, w] : adj[u]) if (d + w < d2[v]) { d2[v] = d + w; q.push({d2[v], v}); pushes++; maxHeap2 = max<long long>(maxHeap2, q.size()); }
    }
    cout << "distances identical: " << boolalpha << (d1 == d2) << '\n';
    cout << "indexed PQ:    max heap size " << maxHeap1 << " (at most V = " << n << ")\n";
    cout << "lazy deletion: " << pushes << " pushes, " << stale << " stale pops, max heap size " << maxHeap2 << '\n';
}
```

In practice the lazy version is often just as fast: its operations are simpler, even though the heap can grow to $O(E)$. Decrease-key really pays off for dense graphs, or when memory is tight. Knowing **both**, and why, is the point.

## Extensions

:::exercise Make it your own
1. Add `erase(id)`: swap the item with the last one, pop it, then sift the moved item up **or** down.
2. Turn it into a **d-ary heap** (4 children per node): shallower trees mean faster decrease-key but slower pops. Measure the effect on Dijkstra.
3. Use the IPQ for **Prim's MST**, with keys = the cheapest edge connecting each vertex to the tree.
:::

:::keypoints
- An indexed PQ adds `pos[id]`, so items can be found in $O(1)$ and re-prioritised in $O(\log n)$.
- Every swap must update both the heap array and `pos`. Most bugs live there.
- With decrease-key, Dijkstra keeps at most V entries. With lazy deletion it may hold O(E), but its code is simpler.
- Test data structures against a brute-force reference on thousands of random operations.
:::
