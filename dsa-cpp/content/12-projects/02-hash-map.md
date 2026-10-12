---
title: Build a Hash Map (Two Ways)
level: advanced
time: 75
icon: database
cover: #8b5cf6,#ec4899
tags: hashing, chaining, open addressing, load factor, benchmarks
summary: Implement a hash map twice — separate chaining and open addressing with linear probing (including tombstones for deletion) — with automatic resizing, then measure probe lengths against the theory (½(1 + 1/(1−α))) and race both against std::unordered_map.
---

Hash maps are the most important data structure for interviews, and "design a hash map" is a real interview question (LeetCode 706). This project builds two complete implementations and **measures** how load factor affects their speed, so the theory from the Hashing lesson becomes something you've seen with your own eyes.

:::flow Plan
Hashing | a good mixing function + power-of-two buckets
Chaining | an array of buckets, each a small vector of key/value pairs
Open addressing | one flat array; on a collision, probe the next slot
Deletion | tombstones, so probe chains don't break
Resizing | grow when the load factor gets too high
Measure | probe counts vs theory; speed vs std::unordered_map
:::

## Two collision strategies

| | Separate chaining | Open addressing (linear probing) |
|---|---|---|
| storage | `vector<vector<pair<K,V>>>` | `vector<Slot>`, each slot EMPTY / FULL / DELETED |
| collision | append to the bucket's list | try slot `h+1, h+2, …` |
| load factor α | can exceed 1 | must stay below 1 (we use ≤ 0.7) |
| cache behaviour | chases separate allocations | contiguous, very cache-friendly |
| delete | erase from the bucket list | mark a **tombstone** (DELETED) |

:::def Tombstone
A marker left in a deleted open-addressing slot. A lookup must keep probing **past** it (the key it's searching for might have been placed after the deleted one), but an insert may reuse it. If you simply emptied the slot, later keys in the same probe chain would become unreachable.
:::

## Theory you'll verify

For linear probing with load factor $\alpha$ (under idealised random hashing), Knuth showed that the expected number of probes is about:

$$\text{successful search} \approx \tfrac12\Big(1 + \tfrac{1}{1-\alpha}\Big), \qquad \text{unsuccessful search} \approx \tfrac12\Big(1 + \tfrac{1}{(1-\alpha)^2}\Big)$$

At $\alpha = 0.5$ that's 1.5 and 2.5 probes. At $\alpha = 0.9$ it's 5.5 and 50.5. Performance falls off a cliff as the table fills up. For chaining, a successful search checks about $1 + \alpha/2$ entries.

## The implementation

```cpp run title="Chaining map + linear-probing map, cross-checked with std::unordered_map"
#include <bits/stdc++.h>
using namespace std;

inline uint64_t mix64(uint64_t x) {                     // splitmix64 finalizer: spreads the bits well
    x += 0x9e3779b97f4a7c15ULL;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
    return x ^ (x >> 31);
}

// ------------------------------------------------------------ separate chaining
template <typename K, typename V>
class ChainMap {
public:
    ChainMap() : buckets_(8) {}
    void put(const K& k, const V& v) {
        auto& b = bucket(k);
        for (auto& [key, val] : b) if (key == k) { val = v; return; }
        b.push_back({k, v});
        if (++size_ > buckets_.size()) rehash(buckets_.size() * 2);      // keep α ≤ 1
    }
    V* get(const K& k) {
        for (auto& [key, val] : bucket(k)) if (key == k) return &val;
        return nullptr;
    }
    bool erase(const K& k) {
        auto& b = bucket(k);
        for (size_t i = 0; i < b.size(); i++)
            if (b[i].first == k) { b[i] = b.back(); b.pop_back(); size_--; return true; }   // swap-remove
        return false;
    }
    size_t size() const { return size_; }
private:
    vector<vector<pair<K, V>>> buckets_;
    size_t size_ = 0;
    vector<pair<K, V>>& bucket(const K& k) { return buckets_[mix64(hash<K>()(k)) & (buckets_.size() - 1)]; }
    void rehash(size_t n) {
        vector<vector<pair<K, V>>> old(n);
        swap(old, buckets_);
        for (auto& b : old) for (auto& kv : b) bucket(kv.first).push_back(kv);
    }
};

// ------------------------------------------------------------ open addressing, linear probing
template <typename K, typename V>
class ProbeMap {
public:
    ProbeMap() : slots_(8) {}
    void put(const K& k, const V& v) {
        if ((used_ + 1) * 10 > slots_.size() * 7) rehash(slots_.size() * 2);   // keep (live + tombstones) ≤ 70%
        size_t i = home(k), firstTomb = SIZE_MAX;
        while (slots_[i].state != EMPTY) {
            if (slots_[i].state == FULL && slots_[i].key == k) { slots_[i].val = v; return; }
            if (slots_[i].state == DELETED && firstTomb == SIZE_MAX) firstTomb = i;
            i = (i + 1) & (slots_.size() - 1);
        }
        if (firstTomb != SIZE_MAX) i = firstTomb; else used_++;   // reuse a tombstone if we passed one
        slots_[i] = {k, v, FULL};
        size_++;
    }
    V* get(const K& k) {
        size_t i = find(k);
        return i == SIZE_MAX ? nullptr : &slots_[i].val;
    }
    bool erase(const K& k) {
        size_t i = find(k);
        if (i == SIZE_MAX) return false;
        slots_[i].state = DELETED;                         // a tombstone: keeps probe chains intact
        size_--;
        return true;
    }
    size_t size() const { return size_; }
    long long probes = 0;                                  // instrumentation
private:
    enum State : char { EMPTY, FULL, DELETED };
    struct Slot { K key{}; V val{}; State state = EMPTY; };
    vector<Slot> slots_;
    size_t size_ = 0, used_ = 0;                           // used_ = FULL + DELETED slots
    size_t home(const K& k) const { return mix64(hash<K>()(k)) & (slots_.size() - 1); }
    size_t find(const K& k) {
        size_t i = home(k);
        while (slots_[i].state != EMPTY) {
            probes++;
            if (slots_[i].state == FULL && slots_[i].key == k) return i;
            i = (i + 1) & (slots_.size() - 1);
        }
        probes++;
        return SIZE_MAX;
    }
    void rehash(size_t n) {
        vector<Slot> old(n);
        swap(old, slots_);
        size_ = used_ = 0;                                 // tombstones disappear on rehash
        for (auto& s : old) if (s.state == FULL) put(s.key, s.val);
    }
};

int main() {
    mt19937_64 rng(7);
    ChainMap<long long, int> cm;
    ProbeMap<long long, int> pm;
    unordered_map<long long, int> ref;
    for (int step = 0; step < 200000; step++) {
        long long k = rng() % 5000;
        int op = rng() % 3, v = rng() % 1000;
        if (op == 0) { cm.put(k, v); pm.put(k, v); ref[k] = v; }
        else if (op == 1) { bool a = cm.erase(k), b = pm.erase(k), c = ref.erase(k); if (a != c || b != c) { cout << "erase mismatch\n"; return 1; } }
        else {
            auto it = ref.find(k);
            int* a = cm.get(k); int* b = pm.get(k);
            bool ok = (it == ref.end()) ? (!a && !b) : (a && b && *a == it->second && *b == it->second);
            if (!ok) { cout << "get mismatch at step " << step << '\n'; return 1; }
        }
    }
    cout << "200000 random put/get/erase operations: both maps agree with std::unordered_map\n";
    cout << "final sizes: chain " << cm.size() << ", probe " << pm.size() << ", std " << ref.size() << '\n';

    ChainMap<string, int> words;
    for (string w : {"the", "cat", "the", "hat", "the"}) { int* c = words.get(w); words.put(w, c ? *c + 1 : 1); }
    cout << "count(the) = " << *words.get("the") << '\n';
}
```

## Experiment 1: probe length vs load factor

```cpp run title="Measured probes vs Knuth's formula"
#include <bits/stdc++.h>
using namespace std;

// a bare linear-probing table with a FIXED size, to control α exactly
int main() {
    const int M = 1 << 20;
    mt19937_64 rng(3);
    cout << " alpha   successful(measured / theory)   unsuccessful(measured / theory)\n";
    for (double alpha : {0.25, 0.5, 0.7, 0.8, 0.9}) {
        vector<uint64_t> table(M, 0);                        // 0 = empty (keys are nonzero)
        vector<uint64_t> keys;
        int n = alpha * M;
        while ((int)keys.size() < n) {
            uint64_t k = rng() | 1;
            size_t i = k & (M - 1);                          // random keys: use the low bits directly
            while (table[i]) i = (i + 1) & (M - 1);
            table[i] = k; keys.push_back(k);
        }
        long long hit = 0, miss = 0;
        for (int t = 0; t < 200000; t++) {
            uint64_t k = keys[rng() % keys.size()];          // a successful search
            size_t i = k & (M - 1); hit++;
            while (table[i] != k) { i = (i + 1) & (M - 1); hit++; }
            uint64_t q = (rng() | 1) ^ (1ULL << 63);         // an (almost surely) absent key
            size_t j = q & (M - 1); miss++;
            while (table[j]) { j = (j + 1) & (M - 1); miss++; }
        }
        double s = hit / 200000.0, u = miss / 200000.0;
        cout << fixed << setprecision(2) << "  " << alpha << "      " << setw(6) << s << " / " << setw(6) << 0.5 * (1 + 1 / (1 - alpha))
             << "                  " << setw(6) << u << " / " << setw(6) << 0.5 * (1 + 1 / ((1 - alpha) * (1 - alpha))) << '\n';
    }
}
```

The measurements track the formulas closely. That's why real tables resize at around 70–80% full: past that point, unsuccessful lookups explode.

## Experiment 2: speed

```cpp run timing title="ProbeMap vs ChainMap vs std::unordered_map (insert + lookup 10⁶ keys)"
#include <bits/stdc++.h>
using namespace std;
inline uint64_t mix64(uint64_t x) { x += 0x9e3779b97f4a7c15ULL; x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL; x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL; return x ^ (x >> 31); }

struct Probe {                                  // a minimal int->int linear-probing map for the race
    vector<uint64_t> k; vector<int> v; vector<char> used; size_t n = 0;
    Probe() : k(16), v(16), used(16) {}
    void grow() { Probe b; b.k.assign(k.size() * 2, 0); b.v.assign(k.size() * 2, 0); b.used.assign(k.size() * 2, 0); for (size_t i = 0; i < k.size(); i++) if (used[i]) b.put(k[i], v[i]); *this = move(b); }
    void put(uint64_t key, int val) {
        if ((n + 1) * 10 > k.size() * 7) grow();
        size_t i = mix64(key) & (k.size() - 1);
        while (used[i] && k[i] != key) i = (i + 1) & (k.size() - 1);
        if (!used[i]) { used[i] = 1; k[i] = key; n++; }
        v[i] = val;
    }
    int* get(uint64_t key) { size_t i = mix64(key) & (k.size() - 1); while (used[i]) { if (k[i] == key) return &v[i]; i = (i + 1) & (k.size() - 1); } return nullptr; }
};

int main() {
    const int N = 1'000'000;
    mt19937_64 rng(5);
    vector<uint64_t> keys(N);
    for (auto& x : keys) x = rng();
    auto timeIt = [](auto&& f) { auto t0 = chrono::steady_clock::now(); long long r = f(); return make_pair(chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count(), r); };

    auto [tp, sp] = timeIt([&] { Probe m; for (int i = 0; i < N; i++) m.put(keys[i], i); long long s = 0; for (int i = 0; i < N; i++) s += *m.get(keys[i]); return s; });
    auto [ts, ss] = timeIt([&] { unordered_map<uint64_t, int> m; for (int i = 0; i < N; i++) m[keys[i]] = i; long long s = 0; for (int i = 0; i < N; i++) s += m[keys[i]]; return s; });
    auto [tr, sr] = timeIt([&] { unordered_map<uint64_t, int> m; m.reserve(N); for (int i = 0; i < N; i++) m[keys[i]] = i; long long s = 0; for (int i = 0; i < N; i++) s += m[keys[i]]; return s; });
    cout << fixed << setprecision(1);
    cout << "linear probing map:          " << tp << " ms\n";
    cout << "std::unordered_map:          " << ts << " ms\n";
    cout << "std::unordered_map+reserve:  " << tr << " ms\n";
    cout << "checksums equal: " << boolalpha << (sp == ss && ss == sr) << '\n';
}
```

Typically the flat linear-probing table wins clearly. `std::unordered_map` must use separate chaining (one allocation per node), because the standard guarantees that references to elements stay valid across rehashes. That design choice costs it cache misses.

## Extensions

:::exercise Make it your own
1. Add **iteration** over all entries, and an `operator[]` that inserts a default value.
2. Implement **Robin Hood hashing**: on a collision, the key that's farther from its home slot takes the spot. It evens out probe lengths.
3. Shrink the table when it drops below 20% full, and prove the shrinking rule keeps operations amortized $O(1)$.
4. Solve LeetCode 706 (*Design HashMap*) with your ProbeMap.
:::

:::keypoints
- Chaining: buckets of lists, α can exceed 1, simple deletes. Open addressing: one flat array, α < 1, tombstones for deletes.
- Expected linear-probing cost grows like $\frac{1}{(1-\alpha)^2}$ for misses, so resize at about 70%.
- Mix the bits of the hash (splitmix64) and use power-of-two sizes for cheap masking.
- Flat, cache-friendly tables usually beat node-based `std::unordered_map`.
:::
