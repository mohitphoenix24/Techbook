---
title: Design LRU and LFU Caches (generic, thread-safe)
level: intermediate
time: 60
summary: A generic cache with O(1) get and put, an eviction policy abstraction with LRU (list plus hash map) and LFU (frequency buckets), time-to-live support through an injected clock, hit/miss statistics and a thread-safe wrapper, with the reasoning interviewers expect about complexity.
---

:::problem Design an LRU Cache (then LFU) {level=medium tags="caching,data structures,Strategy,generic,thread-safe,classic"}
Design an in-memory cache with fixed capacity supporting `get(key)` and `put(key, value)` in O(1). When full, evict according to a policy: **LRU** (least recently used) or **LFU** (least frequently used, ties broken by recency). Make the policy pluggable, support optional per-entry expiry, report hit/miss statistics, and make it thread-safe.
:::

:::hint Hint
LRU = a hash map from key to a node in a **doubly linked list** ordered by recency; moving a node to the front is O(1) with `list::splice`. LFU = a map from key to its frequency plus a list of keys per frequency, and a tracked minimum frequency. Hide both behind one `EvictionPolicy` interface so the cache itself does not care.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Operations? | `get`, `put`, `erase`, `size`, `stats` |
| Complexity? | O(1) average for get/put |
| Eviction? | pluggable policy: LRU, LFU (ties: least recently used) |
| Types? | generic `Cache<K, V>` |
| Expiry? | optional TTL per `put`, checked lazily with an injected clock |
| Thread-safety? | a mutex (or sharded caches for scale) |
| Stats? | hits, misses, evictions |
| Out of scope | persistence, distributed caching |

## Step 2: how the data structures work

```text
LRU                                         LFU
 map: key ──► iterator into the list         freq[key]  ──► count
 list (front = most recent):                 buckets[count] ──► list of keys (front = most recent at that count)
   [k5]-[k2]-[k9]-[k1]  ◄── evict from back  minFreq ──► the lowest non-empty count; evict from buckets[minFreq].back()
 get/put: splice the node to the front       get/put: move key from bucket c to c+1; fix minFreq
```

## Step 3: design

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

- **Separation of concerns**: `Cache` owns values, capacity, TTL and locking. The **policy only tracks keys** and answers "who is the victim?". That is the Strategy pattern, and it is why LFU is a new class and nothing else.
- **TTL** checks happen on `get` (lazy). An expired entry counts as a miss and is erased. (A background sweeper is an extension.)
- **One mutex** around every public method: policy and map must change together. For high contention, **shard**: N independent caches chosen by `hash(key) % N`.

## Step 4: the code

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

| Operation | LRU | LFU (bucket version) |
|---|---|---|
| `get` | O(1) | O(1) (`std::map` for buckets makes `victim` O(log F); keep `minFreq` for strict O(1)) |
| `put` | O(1) | O(1) / O(log F) |
| Space | O(capacity) | O(capacity) |

The strictly O(1) LFU keeps an integer `minFreq` (reset to 1 on insert, incremented when the min bucket empties on access) and uses `unordered_map<int, list<K>>`. The `std::map` used here is simpler and still fast because the number of distinct frequencies is small.

## Edge cases

| Case | Handling |
|---|---|
| Capacity 0 | `put` does nothing |
| `put` on an existing key | updates value and counts as an access |
| Expired entries | counted as misses and erased on access; sweep occasionally |
| Reading a value while another thread evicts it | `get` returns a **copy** under the lock |
| Large values | store `shared_ptr<const V>` to avoid copies |
| Recency bumped by `get` on a missing key | no effect |
| Thundering herd (many misses for the same key) | a "load through" cache with per-key in-flight futures (extension) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "More policies: FIFO, MRU, ARC, TinyLFU, random" | new `EvictionPolicy` classes |
| "Higher concurrency" | shard into N caches by key hash; each with its own lock |
| "Write-through / write-back with a database" | a `Backend` interface; `put` writes through or marks dirty |
| "Cache-aside vs read-through" | `getOrLoad(key, loader)` |
| "Size-based capacity (bytes)" | weigh entries; evict until total weight fits |
| "Metrics" | observer for hit/miss/evict to a monitoring system |
| "Distributed cache" | consistent hashing of keys over nodes (HLD) |
| "Persistence" | snapshot (Memento) and reload at start-up |

```quiz
? What makes LRU `get` and `put` O(1)?
- Sorting on every call
+ A hash map to list nodes plus a doubly linked list: relinking a node to the front is O(1)
- Using a vector
> `list::splice` moves a node without copying or searching.
? Why does the policy store only keys, not values?
- Values are big
+ The cache owns values; the policy's single job is to decide the victim (Strategy)
- Keys are smaller
> Separation of concerns makes policies interchangeable.
```

:::keypoints
- `Cache<K,V>` owns data, TTL, stats and the lock; `EvictionPolicy<K>` decides victims.
- LRU: list + map of iterators. LFU: frequency buckets (min frequency), ties by recency.
- Lazy expiry via an injected clock; shard for concurrency; add policies without touching the cache.
:::
