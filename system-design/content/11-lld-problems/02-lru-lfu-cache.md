---
title: Design an LRU Cache (and LFU)
level: intermediate
time: 55
summary: The classic O(1) cache question — why a hash map plus a doubly linked list gives constant-time get and put with LRU eviction, implemented in C++ (std::list + iterators) and JavaScript (an explicit linked list, and the Map-order shortcut), then LFU in O(1) with frequency buckets, plus thread safety, TTLs and eviction listeners as extensions.
---

:::problem Design an LRU Cache {level=medium tags="LLD,data structures,hash map,linked list" lc=lru-cache}
Implement a cache with a fixed capacity that supports `get(key)` and `put(key, value)` in **O(1)** time. When the cache is full, `put` evicts the **least recently used** entry. Then extend it to LFU (least frequently used) and discuss thread safety.

:::hint Hint
A hash map gives O(1) lookup but no order. A list gives order but O(n) lookup. Store list nodes in the map, and use a doubly linked list so any node can be unlinked in O(1).
:::
:::

This question sits on the border between DSA and LLD: interviewers want the O(1) data-structure insight **and** a clean class with a well-defined interface. It's also the core of every real cache (Redis approximates LRU; Memcached, CPU caches and database buffer pools use LRU variants).

## Requirements

- `get(key)`: return the value if present (and mark it **most recently used**), else "not found".
- `put(key, value)`: insert or update (also marks it most recently used); if this exceeds capacity, evict the **least recently used** entry.
- Both in **O(1)** average time.
- Extensions to discuss: thread safety, TTL expiry, eviction callbacks, LFU policy.

## The insight

| Need | Structure | Gives |
|---|---|---|
| find a key's entry in O(1) | **hash map** key → node | lookup |
| know the least recently used entry, and move any entry to "most recent" in O(1) | **doubly linked list** ordered by recency | O(1) unlink and insert at either end |

```text
 map:  { "A" → node, "B" → node, "C" → node }

 list: head ⇄ [C] ⇄ [A] ⇄ [B] ⇄ tail
        most recent        least recent  ← evict from here
 get("B") → unlink B, insert after head:  head ⇄ [B] ⇄ [C] ⇄ [A] ⇄ tail
```

Why **doubly** linked: to unlink a node in O(1) you need its predecessor. Why **sentinel** head/tail nodes: no special cases for empty lists or end nodes.

Watch the policy step by step (from the caching lesson's simulator):

```viz algo=cache title="LRU eviction"
capacity = 3
policy = LRU
sequence = A B C A D B E A
```

## Implementation

:::tabs LRU cache in O(1)
```cpp run
#include <bits/stdc++.h>
using namespace std;

template <class K, class V>
class LRUCache {
    size_t capacity_;
    list<pair<K, V>> order_;                                  // front = most recent, back = least recent
    unordered_map<K, typename list<pair<K, V>>::iterator> index_;   // key -> node in the list
    function<void(const K&, const V&)> onEvict_;
public:
    explicit LRUCache(size_t capacity, function<void(const K&, const V&)> onEvict = nullptr)
        : capacity_(capacity), onEvict_(std::move(onEvict)) {
        if (capacity == 0) throw invalid_argument("capacity must be > 0");
    }

    optional<V> get(const K& key) {
        auto it = index_.find(key);
        if (it == index_.end()) return nullopt;
        order_.splice(order_.begin(), order_, it->second);    // O(1): move the node to the front
        return it->second->second;
    }

    void put(const K& key, V value) {
        if (auto it = index_.find(key); it != index_.end()) {   // update + touch
            it->second->second = std::move(value);
            order_.splice(order_.begin(), order_, it->second);
            return;
        }
        if (index_.size() == capacity_) {                        // evict the least recently used
            auto& [oldKey, oldVal] = order_.back();
            if (onEvict_) onEvict_(oldKey, oldVal);
            index_.erase(oldKey);
            order_.pop_back();
        }
        order_.emplace_front(key, std::move(value));
        index_[key] = order_.begin();
    }
    size_t size() const { return index_.size(); }
    string keys() const { string s; for (auto& [k, v] : order_) s += k + " "; return s; }   // most -> least recent
};

int main() {
    LRUCache<string, int> cache(3, [](const string& k, const int&) { cout << "  evicted " << k << "\n"; });
    cache.put("A", 1); cache.put("B", 2); cache.put("C", 3);
    cout << "order: " << cache.keys() << "\n";
    cout << "get A -> " << *cache.get("A") << "   order: " << cache.keys() << "\n";
    cache.put("D", 4);                                           // evicts B (least recently used)
    cout << "order: " << cache.keys() << "\n";
    cout << "get B -> " << (cache.get("B") ? "hit" : "miss") << "\n";
    cache.put("C", 30);                                          // update existing: no eviction
    cout << "order: " << cache.keys() << " C=" << *cache.get("C") << "\n";
}
```
```js run
// Explicit hash map + doubly linked list with sentinels (what interviewers expect you to write)
class Node { constructor(key, value) { this.key = key; this.value = value; this.prev = this.next = null; } }

class LRUCache {
  #map = new Map();
  #head = new Node(); #tail = new Node();                   // sentinels: head.next = most recent
  constructor(capacity, onEvict = () => {}) {
    if (capacity <= 0) throw new RangeError("capacity must be > 0");
    this.capacity = capacity; this.onEvict = onEvict;
    this.#head.next = this.#tail; this.#tail.prev = this.#head;
  }
  #unlink(n) { n.prev.next = n.next; n.next.prev = n.prev; }
  #pushFront(n) { n.next = this.#head.next; n.prev = this.#head; this.#head.next.prev = n; this.#head.next = n; }

  get(key) {
    const n = this.#map.get(key);
    if (!n) return undefined;
    this.#unlink(n); this.#pushFront(n);                     // O(1) touch
    return n.value;
  }
  put(key, value) {
    let n = this.#map.get(key);
    if (n) { n.value = value; this.#unlink(n); this.#pushFront(n); return; }
    if (this.#map.size === this.capacity) {                  // evict the least recently used
      const lru = this.#tail.prev;
      this.#unlink(lru); this.#map.delete(lru.key);
      this.onEvict(lru.key, lru.value);
    }
    n = new Node(key, value);
    this.#pushFront(n); this.#map.set(key, n);
  }
  keys() { const out = []; for (let n = this.#head.next; n !== this.#tail; n = n.next) out.push(n.key); return out.join(" "); }
}

const cache = new LRUCache(3, (k) => console.log(`  evicted ${k}`));
cache.put("A", 1); cache.put("B", 2); cache.put("C", 3);
console.log("order:", cache.keys());
console.log("get A ->", cache.get("A"), "  order:", cache.keys());
cache.put("D", 4);                                           // evicts B
console.log("order:", cache.keys());
console.log("get B ->", cache.get("B") === undefined ? "miss" : "hit");
cache.put("C", 30);
console.log("order:", cache.keys(), "C=" + cache.get("C"));

// Shortcut worth mentioning: a JS Map iterates in insertion order, so delete + re-set = "move to most recent"
class TinyLRU {
  #m = new Map();
  constructor(cap) { this.cap = cap; }
  get(k) { if (!this.#m.has(k)) return undefined; const v = this.#m.get(k); this.#m.delete(k); this.#m.set(k, v); return v; }
  put(k, v) { this.#m.delete(k); this.#m.set(k, v); if (this.#m.size > this.cap) this.#m.delete(this.#m.keys().next().value); }
  keys() { return [...this.#m.keys()].reverse().join(" "); }
}
const t = new TinyLRU(2); t.put("x", 1); t.put("y", 2); t.get("x"); t.put("z", 3);
console.log("Map-based LRU keeps:", t.keys());
```
:::

In C++, `std::list::splice` moves a node to the front in O(1) **without invalidating iterators**, which is why storing list iterators in the map is safe.

## LFU in O(1)

**LFU** evicts the **least frequently used** key; ties go to the least recently used among them. The O(1) design (from a well-known 2010 paper) adds one level:

- `keyNode`: key → (value, frequency, position in its frequency list).
- `freqLists`: frequency → a **recency list** of keys with that frequency.
- `minFreq`: the smallest frequency currently present.

On access, a key moves from list `f` to list `f + 1` (front); if list `f` became empty and `f == minFreq`, then `minFreq++`. On insert, the new key has frequency 1, so `minFreq = 1`. Evict from the back of `freqLists[minFreq]`.

:::tabs LFU cache in O(1)
```cpp run
#include <bits/stdc++.h>
using namespace std;

class LFUCache {
    struct Entry { int value; int freq; list<int>::iterator pos; };
    int capacity_, minFreq_ = 0;
    unordered_map<int, Entry> entries_;
    unordered_map<int, list<int>> byFreq_;                  // freq -> keys, front = most recent

    void touch(int key) {                                   // move key from freq f to f+1
        Entry& e = entries_[key];
        auto& oldList = byFreq_[e.freq];
        oldList.erase(e.pos);
        if (oldList.empty()) { byFreq_.erase(e.freq); if (minFreq_ == e.freq) minFreq_++; }
        e.freq++;
        auto& newList = byFreq_[e.freq];
        newList.push_front(key);
        e.pos = newList.begin();
    }
public:
    explicit LFUCache(int capacity) : capacity_(capacity) {}
    int get(int key) {
        if (!entries_.count(key)) return -1;
        touch(key);
        return entries_[key].value;
    }
    void put(int key, int value) {
        if (capacity_ <= 0) return;
        if (entries_.count(key)) { entries_[key].value = value; touch(key); return; }
        if ((int)entries_.size() == capacity_) {             // evict LFU, LRU among ties
            auto& lst = byFreq_[minFreq_];
            int victim = lst.back();
            lst.pop_back();
            if (lst.empty()) byFreq_.erase(minFreq_);
            entries_.erase(victim);
            cout << "  evicted " << victim << "\n";
        }
        auto& ones = byFreq_[1];
        ones.push_front(key);
        entries_[key] = {value, 1, ones.begin()};
        minFreq_ = 1;
    }
};

int main() {
    LFUCache c(2);
    c.put(1, 10); c.put(2, 20);
    cout << "get 1 -> " << c.get(1) << "\n";                  // key 1: freq 2
    c.put(3, 30);                                            // evicts 2 (freq 1)
    cout << "get 2 -> " << c.get(2) << "\n";
    cout << "get 3 -> " << c.get(3) << "\n";                  // key 3: freq 2, tie with key 1
    c.put(4, 40);                                            // evicts 1 (freq 2, least recent among ties)
    cout << "get 1 -> " << c.get(1) << ", get 3 -> " << c.get(3) << ", get 4 -> " << c.get(4) << "\n";
}
```
```js run
class LFUCache {
  #entries = new Map();                       // key → { value, freq }
  #byFreq = new Map();                        // freq → Set of keys (Set keeps insertion order: first = least recent)
  #minFreq = 0;
  constructor(capacity) { this.capacity = capacity; }
  #touch(key) {
    const e = this.#entries.get(key);
    const set = this.#byFreq.get(e.freq);
    set.delete(key);
    if (set.size === 0) { this.#byFreq.delete(e.freq); if (this.#minFreq === e.freq) this.#minFreq++; }
    e.freq++;
    if (!this.#byFreq.has(e.freq)) this.#byFreq.set(e.freq, new Set());
    this.#byFreq.get(e.freq).add(key);
  }
  get(key) {
    if (!this.#entries.has(key)) return -1;
    this.#touch(key);
    return this.#entries.get(key).value;
  }
  put(key, value) {
    if (this.capacity <= 0) return;
    if (this.#entries.has(key)) { this.#entries.get(key).value = value; this.#touch(key); return; }
    if (this.#entries.size === this.capacity) {           // evict LFU, LRU among ties
      const set = this.#byFreq.get(this.#minFreq);
      const victim = set.values().next().value;            // oldest in the lowest-frequency set
      set.delete(victim);
      if (set.size === 0) this.#byFreq.delete(this.#minFreq);
      this.#entries.delete(victim);
      console.log(`  evicted ${victim}`);
    }
    this.#entries.set(key, { value, freq: 1 });
    if (!this.#byFreq.has(1)) this.#byFreq.set(1, new Set());
    this.#byFreq.get(1).add(key);
    this.#minFreq = 1;
  }
}

const c = new LFUCache(2);
c.put(1, 10); c.put(2, 20);
console.log("get 1 ->", c.get(1));
c.put(3, 30);                                             // evicts 2
console.log("get 2 ->", c.get(2));
console.log("get 3 ->", c.get(3));
c.put(4, 40);                                             // evicts 1 (tie at freq 2, least recent)
console.log(`get 1 -> ${c.get(1)}, get 3 -> ${c.get(3)}, get 4 -> ${c.get(4)}`);
```
:::

## Making it production-ready

**Thread safety.** `get` **mutates** the recency order, so even reads need exclusive access: a reader–writer lock doesn't help much. Options:

- One mutex around the whole cache: simple and correct; fine for moderate load.
- **Sharded / segmented** cache: N independent LRU caches, each with its own lock, choosing the shard by `hash(key) % N` (this is how Guava/Caffeine-style caches and Memcached reduce contention). LRU becomes approximate globally but exact per shard.
- Approximate recency (record accesses in a buffer and apply them in batches; Redis samples a few keys and evicts the oldest of the sample) to avoid locking on reads.

**TTL.** Store an expiry with each entry; `get` treats expired entries as missing (lazy expiry), and a periodic sweep or a min-heap of expiry times removes them proactively. (The key-value store problem in this module builds this.)

**Eviction listeners, size by bytes, metrics** (hits, misses, evictions), and **write policies** (from the caching lesson) round out a real cache.

:::interview How to present it
State the complexity target, then the two-structure insight, then code `get`/`put` with sentinels. Test aloud: capacity 1, updating an existing key (must not evict), getting a missing key, evicting after a `get` changed the order. Finish with thread safety (sharding) and LFU if time allows.
:::

```quiz
? Why does an O(1) LRU cache use a DOUBLY linked list?
+ To unlink any node in O(1), you need its previous node as well as the next one
- Singly linked lists can't store values
- To iterate backwards for printing
> With a pointer to the node (from the map), prev and next pointers allow O(1) removal.

? Capacity 2: put(A), put(B), get(A), put(C). Which key is evicted under LRU?
- A
+ B
- C
> get(A) made A most recent, so B is least recently used.

? Why don't reader–writer locks help an LRU cache much?
+ Every get() changes the recency order, so reads are also writes to the shared structure
- LRU caches never need locks
- Reader–writer locks don't exist in C++
> Reads mutate the list; sharding or approximate recency reduces contention instead.
```

:::keypoints
- O(1) LRU = **hash map** (key → node) + **doubly linked list** ordered by recency (sentinels at both ends); touch = unlink + push front; evict from the back.
- C++: `std::list` + `unordered_map` of iterators + `splice`; JS: an explicit list, or the Map insertion-order shortcut.
- **LFU** in O(1): per-frequency recency lists + `minFreq`; ties broken by recency.
- Production: thread safety via one lock or **sharding**, TTLs (lazy + sweep), eviction listeners, metrics.
:::
