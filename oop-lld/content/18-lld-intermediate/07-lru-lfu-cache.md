---
title: Design LRU and LFU Caches (generic, thread-safe)
level: intermediate
time: 60
summary: A cache that works for any key and value type, with O(1) get and put. Learn how LRU uses a list and a hash map, how LFU uses frequency buckets, how to plug in different eviction rules, expiry with a clock, hit and miss counts, and thread safety.
---

:::problem Design an LRU Cache (then LFU) {level=medium tags="caching,data structures,Strategy,generic,thread-safe,classic"}
Design an in-memory cache with a fixed size. It supports `get(key)` and `put(key, value)` in O(1). When it is full, it removes an item by a rule: **LRU** (least recently used) or **LFU** (least frequently used, and if tied, the one used least recently). Make the rule pluggable, support an optional expiry for each entry, report hit and miss counts, and make it safe for many threads.
:::

:::hint Hint
LRU = a hash map from key to a node in a **doubly linked list** that is ordered by how recently each item was used. Moving a node to the front takes O(1) with `list::splice`. LFU = a map from key to its use count, plus a list of keys for each count, and a note of the smallest count. Hide both behind one `EvictionPolicy` interface, so the cache itself does not care which one is used.
:::

## First, what is a cache?

A cache is a small, fast store that keeps **recently needed data close**, so you do not have to fetch it again from a slow place (like a database). But it has a limited size. When it is full and a new item arrives, the cache must **throw one item away**. The rule for choosing which item to throw away is the **eviction policy**.

- **LRU**: throw away the item that was **used the longest time ago**. (Like a desk: the paper you have not touched for ages goes back in the drawer.)
- **LFU**: throw away the item that has been **used the fewest times**.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Actions? | `get`, `put`, `erase`, `size`, `stats` |
| Speed? | O(1) on average for get and put |
| Eviction? | pluggable: LRU, LFU (ties: least recently used) |
| Types? | works for any types: `Cache<K, V>` |
| Expiry? | optional time to live for each `put`, checked only when the item is read, using a clock that we pass in |
| Threads? | a mutex (or several smaller caches for more speed) |
| Stats? | hits, misses, evictions |
| Not needed | saving to disk, a cache on many machines |

## Step 2: How the data structures work

```text
LRU                                         LFU
 map: key ──► iterator into the list         freq[key]  ──► count
 list (front = most recent):                 buckets[count] ──► list of keys (front = most recent at that count)
   [k5]-[k2]-[k9]-[k1]  ◄── evict from back  minFreq ──► the lowest non-empty count; evict from buckets[minFreq].back()
 get/put: splice the node to the front       get/put: move key from bucket c to c+1; fix minFreq
```

In words, for LRU:

- The **map** finds any key in O(1) and gives its place in the list.
- The **list** keeps keys in order: front is the most recently used, back is the least recently used.
- On a read, move that key to the front. When full, remove the key at the back.

## Step 3: The design

```viz algo=uml title="Generic cache with eviction policy"
class Cache
  - capacity: size_t
  - data: unordered_map<K, Entry>
  - policy: EvictionPolicy
  - clock: Clock
  - mutex: mutex
  + get(key: K): optional<V>
  + put(key: K, value: V, ttl: long): void
  + erase(key: K): bool
  + stats(): Stats
interface EvictionPolicy
  + onInsert(key: K): void
  + onAccess(key: K): void
  + onErase(key: K): void
  + victim(): K
class LruPolicy
class LfuPolicy
class Entry
  - value: V
  - expiresAt: long
class Stats
  - hits: long
  - misses: long
  - evictions: long
Cache --> EvictionPolicy
LruPolicy ..|> EvictionPolicy
LfuPolicy ..|> EvictionPolicy
Cache *-- Entry
Cache ..> Stats
```

- **Each class has one job.** `Cache` owns the values, the size limit, the expiry and the lock. The **policy only tracks keys** and answers "which one should go?". That is the Strategy pattern, and it is why LFU is just a new class and nothing else changes.
- **Expiry** is checked when you call `get` (lazily). An expired entry counts as a miss and is removed. (A background cleaner is an extension.)
- **One mutex** around every public method, because the policy and the map must change together. For heavy traffic, **split into N smaller caches** chosen by `hash(key) % N`.

## Step 4: The code

```cpp run title="Cache<K,V> with LRU and LFU policies, TTL and statistics"
#include <iostream>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using namespace std;

template <typename K>
struct EvictionPolicy {
    virtual ~EvictionPolicy() = default;
    virtual void onInsert(const K& k) = 0;
    virtual void onAccess(const K& k) = 0;
    virtual void onErase(const K& k) = 0;
    virtual K victim() const = 0;                            // only called when the cache is full
};

// ---------- LRU: doubly linked list + map to nodes ----------
template <typename K>
class LruPolicy : public EvictionPolicy<K> {
    list<K> order_;                                          // front = most recently used
    unordered_map<K, typename list<K>::iterator> pos_;
public:
    void onInsert(const K& k) override { order_.push_front(k); pos_[k] = order_.begin(); }
    void onAccess(const K& k) override { order_.splice(order_.begin(), order_, pos_.at(k)); }      // O(1): relink the node
    void onErase(const K& k) override { order_.erase(pos_.at(k)); pos_.erase(k); }
    K victim() const override { return order_.back(); }
};

// ---------- LFU: frequency buckets, O(1) ----------
template <typename K>
class LfuPolicy : public EvictionPolicy<K> {
    struct Info { int freq; typename list<K>::iterator it; };
    unordered_map<K, Info> info_;
    map<int, list<K>> buckets_;                              // freq -> keys, front = most recent at that frequency (ordered map keeps min easy)
public:
    void onInsert(const K& k) override { buckets_[1].push_front(k); info_[k] = {1, buckets_[1].begin()}; }
    void onAccess(const K& k) override {
        Info& i = info_.at(k);
        buckets_[i.freq].erase(i.it);
        if (buckets_[i.freq].empty()) buckets_.erase(i.freq);
        ++i.freq;
        buckets_[i.freq].push_front(k);
        i.it = buckets_[i.freq].begin();
    }
    void onErase(const K& k) override {
        Info& i = info_.at(k);
        buckets_[i.freq].erase(i.it);
        if (buckets_[i.freq].empty()) buckets_.erase(i.freq);
        info_.erase(k);
    }
    K victim() const override { return buckets_.begin()->second.back(); }      // lowest frequency, least recent within it
};

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };
struct ManualClock : Clock { long t = 0; long now() const override { return t; } };

struct Stats { long hits = 0, misses = 0, evictions = 0; };

template <typename K, typename V>
class Cache {
    struct Entry { V value; long expiresAt; };               // 0 = never
    size_t capacity_;
    unordered_map<K, Entry> data_;
    unique_ptr<EvictionPolicy<K>> policy_;
    const Clock& clock_;
    Stats stats_;
    mutable mutex m_;
    bool expired(const Entry& e) const { return e.expiresAt != 0 && clock_.now() >= e.expiresAt; }
public:
    Cache(size_t cap, unique_ptr<EvictionPolicy<K>> p, const Clock& c) : capacity_(cap), policy_(move(p)), clock_(c) {}

    optional<V> get(const K& key) {
        lock_guard lock(m_);
        auto it = data_.find(key);
        if (it == data_.end()) { ++stats_.misses; return nullopt; }
        if (expired(it->second)) { policy_->onErase(key); data_.erase(it); ++stats_.misses; return nullopt; }     // lazy expiry
        policy_->onAccess(key);
        ++stats_.hits;
        return it->second.value;
    }
    void put(const K& key, V value, long ttlSeconds = 0) {
        if (capacity_ == 0) return;
        lock_guard lock(m_);
        long exp = ttlSeconds > 0 ? clock_.now() + ttlSeconds : 0;
        auto it = data_.find(key);
        if (it != data_.end()) { it->second = {move(value), exp}; policy_->onAccess(key); return; }
        if (data_.size() >= capacity_) {
            K victim = policy_->victim();
            policy_->onErase(victim); data_.erase(victim); ++stats_.evictions;
        }
        data_.emplace(key, Entry{move(value), exp});
        policy_->onInsert(key);
    }
    bool erase(const K& key) { lock_guard lock(m_); auto it = data_.find(key); if (it == data_.end()) return false; policy_->onErase(key); data_.erase(it); return true; }
    size_t size() const { lock_guard lock(m_); return data_.size(); }
    Stats stats() const { lock_guard lock(m_); return stats_; }
};

int main() {
    ManualClock clock;
    cout << "LRU (capacity 3):\n";
    Cache<string, int> lru(3, make_unique<LruPolicy<string>>(), clock);
    lru.put("a", 1); lru.put("b", 2); lru.put("c", 3);
    lru.get("a");                                            // a is now the most recent; b is the least
    lru.put("d", 4);                                         // evicts b
    cout << "  b present? " << boolalpha << lru.get("b").has_value() << ", a present? " << lru.get("a").has_value() << ", c? " << lru.get("c").has_value() << ", d? " << lru.get("d").has_value() << "\n";

    cout << "LFU (capacity 3):\n";
    Cache<string, int> lfu(3, make_unique<LfuPolicy<string>>(), clock);
    lfu.put("a", 1); lfu.put("b", 2); lfu.put("c", 3);
    lfu.get("a"); lfu.get("a"); lfu.get("b");                // freq: a=3, b=2, c=1
    lfu.put("d", 4);                                         // evicts c (lowest frequency)
    cout << "  c present? " << lfu.get("c").has_value() << ", a? " << lfu.get("a").has_value() << ", b? " << lfu.get("b").has_value() << ", d? " << lfu.get("d").has_value() << "\n";

    cout << "LFU tie broken by recency:\n";
    Cache<int, int> tie(2, make_unique<LfuPolicy<int>>(), clock);
    tie.put(1, 10); tie.put(2, 20);                          // both frequency 1; key 1 is older
    tie.put(3, 30);                                          // evicts key 1
    cout << "  key1? " << tie.get(1).has_value() << ", key2? " << tie.get(2).has_value() << ", key3? " << tie.get(3).has_value() << "\n";

    cout << "TTL:\n";
    Cache<string, string> ttl(10, make_unique<LruPolicy<string>>(), clock);
    ttl.put("session", "token123", 60);
    cout << "  at t=0: " << ttl.get("session").value_or("(gone)") << "\n";
    clock.t = 61;
    cout << "  at t=61: " << ttl.get("session").value_or("(gone)") << "\n";

    auto s = lru.stats();
    cout << "LRU stats: hits=" << s.hits << " misses=" << s.misses << " evictions=" << s.evictions << "\n";

    cout << "threads: 4 x 2000 operations on a capacity-50 LRU\n";
    Cache<int, int> shared(50, make_unique<LruPolicy<int>>(), clock);
    vector<thread> ts;
    for (int t = 0; t < 4; ++t) ts.emplace_back([&, t] { for (int i = 0; i < 2000; ++i) { shared.put((t * 31 + i) % 200, i); shared.get(i % 200); } });
    for (auto& th : ts) th.join();
    cout << "  size stays within capacity: " << (shared.size() <= 50) << " (size " << shared.size() << ")\n";
}
```

## Complexity table (say this in the interview)

| Action | LRU | LFU (bucket version) |
|---|---|---|
| `get` | O(1) | O(1) (using `std::map` for the buckets makes `victim` O(log F). Keep a `minFreq` number for a strict O(1)) |
| `put` | O(1) | O(1) or O(log F) |
| Space | O(capacity) | O(capacity) |

A strict O(1) LFU keeps a number `minFreq` (set to 1 on insert, and increased when the smallest bucket becomes empty) and uses `unordered_map<int, list<K>>`. The `std::map` used here is simpler, and still fast, because the number of different counts is small.

## Edge cases

| Case | What happens |
|---|---|
| Size 0 | `put` does nothing |
| `put` on a key that already exists | the value is updated, and it counts as a use |
| Expired entries | counted as misses and removed when read. Clean up now and then |
| Reading while another thread removes it | `get` gives a **copy** while holding the lock |
| Very big values | keep `shared_ptr<const V>` to avoid copies |
| `get` on a missing key | does not change the order |
| Many misses for the same key at once | a "load through" cache with one pending load for each key (extension) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "More rules: FIFO, MRU, ARC, TinyLFU, random" | new `EvictionPolicy` classes |
| "More speed with many threads" | split into N caches by key hash, each with its own lock |
| "Write to a database too" | a `Backend` interface. `put` writes through, or marks the entry dirty |
| "Cache-aside vs read-through" | `getOrLoad(key, loader)` |
| "Size in bytes, not items" | give each entry a weight, and remove until the total fits |
| "Metrics" | an observer for hit, miss and evict that sends to monitoring |
| "A cache over many machines" | consistent hashing of keys over nodes (HLD) |
| "Keep it after restart" | save a snapshot (Memento) and load it at start |

## Short answer to say in an interview

:::interview How do you build an LRU cache with O(1) get and put?
"I use a hash map from key to a node in a doubly linked list. The list is ordered by recent use. On get or put, I move the node to the front with splice, which is O(1). When the cache is full, I remove the node at the back and erase its key from the map. To make the rule pluggable, I put it behind an eviction policy interface that only tracks keys, so LFU is a new class. A mutex protects the cache, or I split it into shards."
:::

```quiz
? What makes LRU get and put O(1)?
- Sorting on every call
+ A hash map to list nodes, plus a doubly linked list. Moving a node to the front is O(1)
- Using a vector
> list::splice moves a node without copying or searching.
? Why does the policy store only keys and not values?
- Values are big
+ The cache owns the values. The policy has one job: decide the victim (Strategy)
- Keys are smaller
> Separate jobs make policies easy to swap.
```

:::keypoints
- `Cache<K,V>` owns the data, expiry, stats and lock. `EvictionPolicy<K>` decides which key to remove.
- LRU: a list plus a map of iterators. LFU: buckets by use count with the smallest count noted, ties by recency.
- Lazy expiry with a clock passed in. Split into shards for threads. Add policies without touching the cache.
:::
