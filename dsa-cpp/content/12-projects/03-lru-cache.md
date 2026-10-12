---
title: LRU & LFU Caches
level: advanced
time: 60
icon: zap
cover: #0ea5e9,#6366f1
tags: design, hash map, doubly linked list, O(1) operations
summary: Build the most-asked design question — an LRU cache with O(1) get/put from a hash map plus a doubly linked list (with splice) — then the harder LFU cache with O(1) operations using frequency buckets, plus a simulation comparing their hit rates on a realistic access pattern.
---

Caches sit in front of every slow thing: databases, disks, networks, CPUs. When the cache is full, an **eviction policy** decides what to throw away. "Design an LRU cache" is one of the most frequent interview questions of all, because it tests whether you can **combine two data structures** so that every operation is $O(1)$.

:::def LRU (Least Recently Used)
When the cache is full, evict the entry that hasn't been **used** (read or written) for the longest time. The bet is that recently used data is likely to be used again soon (temporal locality).
:::

:::def LFU (Least Frequently Used)
Evict the entry with the **fewest** uses. Ties are broken by least recently used.
:::

## Why two data structures?

| Need | Structure | Cost |
|---|---|---|
| find a key's entry fast | hash map `key → node` | $O(1)$ |
| know the recency order, move a node to the front, drop the oldest | doubly linked list | $O(1)$ given the node |

Neither does both alone. A list can't find a key in $O(1)$, and a map doesn't know the order. Together, the **map stores iterators into the list**, so we can jump straight to a node and move it.

:::flow LRU operations
get(key) | look it up in the map; move its node to the front; return the value
put(key, v) | if present: update it and move to the front; else push to the front
evict | if over capacity: remove the back node and erase its key from the map
:::

:::problem LRU Cache {level=medium lc=lru-cache tags="design,hash map,linked list"}
Implement `LRUCache(capacity)`, `get(key)` (−1 if missing) and `put(key, value)`, each in $O(1)$ average time.

:::hint Hint
`std::list<pair<int,int>>` holds (key, value) in recency order, and `unordered_map<int, list<...>::iterator>` maps a key to its node. `list::splice` moves a node to the front in $O(1)$ without invalidating iterators.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class LRUCache {
public:
    explicit LRUCache(int capacity) : cap_(capacity) {}
    int get(int key) {
        auto it = pos_.find(key);
        if (it == pos_.end()) return -1;
        items_.splice(items_.begin(), items_, it->second);   // move to the front: most recent
        return it->second->second;
    }
    void put(int key, int value) {
        auto it = pos_.find(key);
        if (it != pos_.end()) {
            it->second->second = value;
            items_.splice(items_.begin(), items_, it->second);
            return;
        }
        items_.emplace_front(key, value);
        pos_[key] = items_.begin();
        if ((int)items_.size() > cap_) {                      // evict the least recent (the back)
            pos_.erase(items_.back().first);
            items_.pop_back();
        }
    }
private:
    int cap_;
    list<pair<int, int>> items_;                              // front = most recent
    unordered_map<int, list<pair<int, int>>::iterator> pos_;
};

int main() {
    LRUCache c(2);
    c.put(1, 1); c.put(2, 2);
    cout << c.get(1) << ' ';     // 1  (now 2 is the least recent)
    c.put(3, 3);                 // evicts 2
    cout << c.get(2) << ' ';     // -1
    c.put(4, 4);                 // evicts 1
    cout << c.get(1) << ' ' << c.get(3) << ' ' << c.get(4) << '\n';   // -1 3 4
}
```

:::complexity
Time | O(1) | average per operation
Space | O(\text{capacity}) |
:::
:::
:::

:::tip Doing it without std::list
Interviewers sometimes ask you to write the doubly linked list yourself. Use **sentinel head and tail nodes**, so insert and remove never deal with nulls: `remove(node)` is `node->prev->next = node->next; node->next->prev = node->prev;`, and `addFront(node)` links the node after `head`.
:::

## LFU in O(1)

LFU needs the **least frequently used** key, with recency as the tie-breaker. The $O(1)$ design keeps:

- `key → (value, freq, iterator)`,
- `freq → list of keys` (each list in recency order),
- `minFreq`: the smallest frequency that currently has keys.

On access, move the key from list `f` to list `f + 1`. If list `f` becomes empty and `f == minFreq`, increment `minFreq`. A **new** key always has frequency 1, so `minFreq = 1`. To evict, drop the back of `lists[minFreq]`.

:::problem LFU Cache {level=hard lc=lfu-cache tags="design,hash map,linked list"}
Implement `LFUCache(capacity)` with `get` and `put` in $O(1)$. Evict the least frequently used key, breaking ties by least recently used.

:::hint Hint
Frequency buckets: `unordered_map<int, list<int>>`. Each key stores its frequency and its iterator inside its bucket list. Track `minFreq`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class LFUCache {
public:
    explicit LFUCache(int capacity) : cap_(capacity) {}
    int get(int key) {
        auto it = node_.find(key);
        if (it == node_.end()) return -1;
        touch(it->second, key);
        return it->second.value;
    }
    void put(int key, int value) {
        if (cap_ == 0) return;
        auto it = node_.find(key);
        if (it != node_.end()) { it->second.value = value; touch(it->second, key); return; }
        if ((int)node_.size() == cap_) {                        // evict: least frequent, then least recent
            int victim = buckets_[minFreq_].back();
            buckets_[minFreq_].pop_back();
            node_.erase(victim);
        }
        buckets_[1].push_front(key);
        node_[key] = {value, 1, buckets_[1].begin()};
        minFreq_ = 1;                                           // a new key has the lowest frequency
    }
private:
    struct Entry { int value, freq; list<int>::iterator pos; };
    int cap_, minFreq_ = 0;
    unordered_map<int, Entry> node_;
    unordered_map<int, list<int>> buckets_;                     // freq -> keys, most recent first
    void touch(Entry& e, int key) {                             // freq++ and move to the new bucket
        auto& oldList = buckets_[e.freq];
        oldList.erase(e.pos);
        if (oldList.empty() && minFreq_ == e.freq) minFreq_++;
        e.freq++;
        buckets_[e.freq].push_front(key);
        e.pos = buckets_[e.freq].begin();
    }
};

int main() {
    LFUCache c(2);
    c.put(1, 1); c.put(2, 2);
    cout << c.get(1) << ' ';          // 1   (freq: key1=2, key2=1)
    c.put(3, 3);                      // evicts key 2 (lowest frequency)
    cout << c.get(2) << ' ' << c.get(3) << ' ';   // -1 3
    c.put(4, 4);                      // keys 1 and 3 both have freq 2: evict the least recent, which is 1
    cout << c.get(1) << ' ' << c.get(3) << ' ' << c.get(4) << '\n';   // -1 3 4
}
```

:::complexity
Time | O(1) | average per operation
Space | O(\text{capacity}) |
:::
:::
:::

## Experiment: which policy wins?

It depends on the access pattern. Below, 80% of requests go to a small "hot" set, but the hot set **shifts** halfway through (as when a new item goes viral). LFU clings to the old favourites, while LRU adapts.

```cpp run title="Hit rate simulation: LRU vs LFU under a shifting workload"
#include <bits/stdc++.h>
using namespace std;

struct LRU {
    int cap; list<int> order; unordered_map<int, list<int>::iterator> pos;
    bool access(int k) {
        auto it = pos.find(k);
        if (it != pos.end()) { order.splice(order.begin(), order, it->second); return true; }
        order.push_front(k); pos[k] = order.begin();
        if ((int)order.size() > cap) { pos.erase(order.back()); order.pop_back(); }
        return false;
    }
};
struct LFU {
    int cap, minF = 0; unordered_map<int, pair<int, list<int>::iterator>> info; unordered_map<int, list<int>> b;
    bool access(int k) {
        auto it = info.find(k);
        if (it != info.end()) {
            auto& [f, p] = it->second;
            b[f].erase(p); if (b[f].empty() && minF == f) minF++;
            f++; b[f].push_front(k); p = b[f].begin();
            return true;
        }
        if ((int)info.size() == cap) { int v = b[minF].back(); b[minF].pop_back(); info.erase(v); }
        b[1].push_front(k); info[k] = {1, b[1].begin()}; minF = 1;
        return false;
    }
};

int main() {
    mt19937 rng(9);
    LRU lru{50, {}, {}};
    LFU lfu{50, 0, {}, {}};
    int hitsL1 = 0, hitsF1 = 0, hitsL2 = 0, hitsF2 = 0, N = 100000;
    for (int t = 0; t < N; t++) {
        bool hot = rng() % 100 < 80;
        int base = t < N / 2 ? 0 : 1000;                          // the hot set moves halfway through
        int key = hot ? base + rng() % 40 : 5000 + rng() % 5000;
        bool a = lru.access(key), b = lfu.access(key);
        if (t < N / 2) { hitsL1 += a; hitsF1 += b; } else { hitsL2 += a; hitsF2 += b; }
    }
    cout << fixed << setprecision(1);
    cout << "first half:  LRU " << 100.0 * hitsL1 / (N / 2) << "%   LFU " << 100.0 * hitsF1 / (N / 2) << "%\n";
    cout << "second half: LRU " << 100.0 * hitsL2 / (N / 2) << "%   LFU " << 100.0 * hitsF2 / (N / 2) << "%\n";
}
```

Real systems often use hybrids: LRU-K, 2Q, ARC, or TinyLFU (Caffeine) with a "window" LRU, to get the best of both.

:::keypoints
- LRU = hash map (key → list iterator) + doubly linked list (recency). `splice` moves a node in $O(1)$.
- LFU = key → (value, freq, iterator) + frequency → list + `minFreq`. A new key resets `minFreq` to 1.
- "Combine structures so each one covers the other's weakness" is the core skill in design questions.
- The best policy depends on the workload. Measure it.
:::
