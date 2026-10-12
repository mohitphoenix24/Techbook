---
title: Probabilistic Data Structures — Bloom Filters, Count-Min, HyperLogLog
level: advanced
time: 45
summary: Trading a little accuracy for enormous memory savings — Bloom filters for "have I seen this?" (with an interactive filter and C++/JS code), Count-Min Sketch for frequencies and heavy hitters, and HyperLogLog for counting unique items in kilobytes, with their error formulas and where real systems use them.
---

Some questions are expensive to answer exactly at scale: *Has this URL already been crawled?* (billions of URLs) *How many unique visitors did we have today?* (hundreds of millions of ids) *Which search terms are trending right now?* (an endless stream). **Probabilistic data structures** answer them approximately, with a **known, tunable error**, using a tiny fraction of the memory. They show up in crawlers, databases, caches, analytics and streaming systems, and naming the right one is a strong signal in an interview.

| Question | Structure | Error type | Memory |
|---|---|---|---|
| Is X in the set? | **Bloom filter** | false positives only | ~10 bits per item for 1% error |
| How often did X occur? | **Count-Min Sketch** | over-estimates only | fixed table, independent of the number of items |
| How many distinct items? | **HyperLogLog** | ± ~1–2% | ~12 KB for billions of items |

## Bloom filters

:::def Bloom filter
A bit array of **m** bits plus **k** hash functions. To **add** an item, set the k bits it hashes to. To **check** an item, look at its k bits: if **any** is 0, the item was **definitely never added**; if all are 1, it was **probably** added (they may have been set by other items).
:::

The key property: **no false negatives**, and a false-positive rate you choose by sizing m and k. Try it below. Add the 8 fruits, then check words that were never added, such as `kiwi`, `pear` or `melon`, and watch for false positives. Shrink `m` to make them common.

```viz algo=bloom title="A Bloom filter"
m = 32
k = 3
```

### Sizing

For n items and m bits, the false-positive rate with k hash functions is approximately:

:::formula False-positive probability
p \approx \left(1 - e^{-kn/m}\right)^{k}, \qquad k_{\text{opt}} = \frac{m}{n}\ln 2, \qquad m = -\frac{n \ln p}{(\ln 2)^2}
:::

```js run title="How many bits for a given error rate?"
function bloomSize(n, p) {
  const m = Math.ceil((-n * Math.log(p)) / Math.LN2 ** 2);
  const k = Math.round((m / n) * Math.LN2);
  return { m, k };
}
const fmt = (bits) => bits >= 8e9 ? `${(bits / 8e9).toFixed(2)} GB` : bits >= 8e6 ? `${(bits / 8e6).toFixed(1)} MB` : `${(bits / 8e3).toFixed(1)} KB`;
for (const [n, p] of [[1e6, 0.01], [1e6, 0.001], [1e9, 0.01], [1e9, 0.0001]]) {
  const { m, k } = bloomSize(n, p);
  console.log(`${n.toExponential(0)} items at ${p * 100}% error: ${fmt(m).padStart(9)} (${(m / n).toFixed(1)} bits/item), k = ${k}`);
}
console.log("compare: storing 1e9 URLs of ~60 bytes each would take", 1e9 * 60 / 1e9, "GB");
```

About **10 bits per item gives 1% error**, regardless of how big the items are. One billion URLs fit in ~1.2 GB instead of ~60 GB.

:::tabs A Bloom filter (double hashing for the k positions)
```cpp run
#include <bits/stdc++.h>
using namespace std;

class BloomFilter {
    vector<bool> bits_;
    int k_;
    static uint64_t fnv1a(const string& s, uint64_t seed) {
        uint64_t h = 1469598103934665603ULL ^ seed;
        for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
        h ^= h >> 33; h *= 0xff51afd7ed558ccdULL; h ^= h >> 33;   // mix the bits well
        return h;
    }
    // Kirsch–Mitzenmacher: position_i = h1 + i*h2 behaves like k independent hashes
    vector<size_t> positions(const string& item) const {
        uint64_t h1 = fnv1a(item, 0), h2 = fnv1a(item, 0x9e3779b97f4a7c15ULL) | 1;
        vector<size_t> out;
        for (int i = 0; i < k_; i++) out.push_back((h1 + i * h2) % bits_.size());
        return out;
    }
public:
    BloomFilter(size_t n, double p) {
        size_t m = ceil(-double(n) * log(p) / (log(2) * log(2)));
        bits_.assign(m, false);
        k_ = max(1, (int)round(double(m) / n * log(2)));
    }
    void add(const string& item) { for (auto i : positions(item)) bits_[i] = true; }
    bool mightContain(const string& item) const {
        for (auto i : positions(item)) if (!bits_[i]) return false;   // definitely not present
        return true;                                                  // probably present
    }
    size_t bits() const { return bits_.size(); }
    int k() const { return k_; }
};

int main() {
    BloomFilter seen(10000, 0.01);                 // a crawler's "already visited" set
    for (int i = 0; i < 10000; i++) seen.add("https://example.com/page/" + to_string(i));
    cout << "m = " << seen.bits() << " bits (" << seen.bits() / 8 / 1024 << " KB), k = " << seen.k() << "\n";

    int falseNegatives = 0;
    for (int i = 0; i < 10000; i++) falseNegatives += !seen.mightContain("https://example.com/page/" + to_string(i));
    int falsePositives = 0;
    for (int i = 0; i < 100000; i++) falsePositives += seen.mightContain("https://other.org/item/" + to_string(i));
    cout << "false negatives: " << falseNegatives << " (always 0)\n";
    cout << "false positives: " << falsePositives << " of 100000 = " << fixed << setprecision(2)
         << falsePositives / 1000.0 << "% (target 1%)\n";
}
```
```js run
class BloomFilter {
  constructor(n, p) {
    this.m = Math.ceil((-n * Math.log(p)) / Math.LN2 ** 2);
    this.k = Math.max(1, Math.round((this.m / n) * Math.LN2));
    this.bits = new Uint8Array(Math.ceil(this.m / 8));
  }
  static hash(s, seed) {                       // FNV-1a + a final mix
    let h = 0x811c9dc5 ^ seed;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  // Kirsch–Mitzenmacher: position_i = h1 + i*h2 behaves like k independent hashes
  *positions(item) {
    const h1 = BloomFilter.hash(item, 0), h2 = (BloomFilter.hash(item, 0x9e3779b9) | 1) >>> 0;   // `| 1` gives a signed int: >>> 0 makes it unsigned again
    for (let i = 0; i < this.k; i++) yield (h1 + i * h2) % this.m;
  }
  add(item) { for (const i of this.positions(item)) this.bits[i >> 3] |= 1 << (i & 7); }
  mightContain(item) {
    for (const i of this.positions(item)) if (!(this.bits[i >> 3] & (1 << (i & 7)))) return false;   // definitely not
    return true;                                                                                      // probably yes
  }
}

const seen = new BloomFilter(10_000, 0.01);   // a crawler's "already visited" set
for (let i = 0; i < 10_000; i++) seen.add(`https://example.com/page/${i}`);
console.log(`m = ${seen.m} bits (${Math.floor(seen.m / 8 / 1024)} KB), k = ${seen.k}`);

let falseNegatives = 0, falsePositives = 0;
for (let i = 0; i < 10_000; i++) if (!seen.mightContain(`https://example.com/page/${i}`)) falseNegatives++;
for (let i = 0; i < 100_000; i++) if (seen.mightContain(`https://other.org/item/${i}`)) falsePositives++;
console.log(`false negatives: ${falseNegatives} (always 0)`);
console.log(`false positives: ${falsePositives} of 100000 = ${(falsePositives / 1000).toFixed(2)}% (target 1%)`);
```
:::

**Limitations:** you can't **remove** items (clearing a bit might remove other items too; a **counting Bloom filter** uses small counters instead of bits to allow deletes), you can't list the items, and the filter must be sized for the expected n (or use **scalable Bloom filters** that add layers as they fill). **Cuckoo filters** are a modern alternative supporting deletes with similar space.

**Where they're used:**

- **LSM-tree databases** (Cassandra, RocksDB, HBase, Bigtable): one filter per SSTable, so reads skip files that can't contain the key (from the storage engines lesson).
- **Web crawlers**: "have we already seen this URL?" (web crawler case study).
- **Cache penetration** protection: reject lookups for keys that don't exist (caching-at-scale lesson).
- **CDNs**: Akamai caches an object only on its second request ("one-hit wonders" never take cache space), using a Bloom filter of first requests.
- **Chrome's old Safe Browsing**, Medium's "already recommended" checks, and username-availability pre-checks.

## Count-Min Sketch

:::def Count-Min Sketch
A **d × w** table of counters with d hash functions. To **count** an item, increment one counter per row (the one its row hash points to). To **estimate** an item's count, take the **minimum** of its d counters. Collisions only ever **add**, so the estimate is never too low, and taking the minimum discards the worst collisions.
:::

Error bound: with width $w = \lceil e/\varepsilon \rceil$ and depth $d = \lceil \ln(1/\delta) \rceil$, the estimate exceeds the true count by at most $\varepsilon \cdot N$ (N = total events) with probability $1 - \delta$. Memory is **fixed**, no matter how many distinct items stream past.

:::tabs Count-Min Sketch for trending hashtags
```js run
class CountMinSketch {
  constructor(width, depth) {
    this.w = width; this.d = depth;
    this.table = Array.from({ length: depth }, () => new Uint32Array(width));
  }
  #h(item, row) {
    let h = 0x811c9dc5 ^ (row * 0x9e3779b9);
    for (let i = 0; i < item.length; i++) { h ^= item.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) % this.w;
  }
  add(item, count = 1) { for (let r = 0; r < this.d; r++) this.table[r][this.#h(item, r)] += count; }
  estimate(item) { let min = Infinity; for (let r = 0; r < this.d; r++) min = Math.min(min, this.table[r][this.#h(item, r)]); return min; }
}

// A stream of 200,000 hashtags: a few are hot, the long tail is huge
let seed = 17;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const exact = new Map();
const cms = new CountMinSketch(2000, 5);              // 10,000 counters ≈ 40 KB, whatever the stream size
for (let i = 0; i < 200_000; i++) {
  const r = rand();
  const tag = r < 0.05 ? "#worldcup" : r < 0.08 ? "#election" : r < 0.10 ? "#newphone" : `#tag${Math.floor(rand() * 50_000)}`;
  cms.add(tag);
  exact.set(tag, (exact.get(tag) ?? 0) + 1);
}
console.log(`distinct tags seen: ${exact.size.toLocaleString("en-US")} (an exact map needs one entry each)`);
for (const tag of ["#worldcup", "#election", "#newphone", "#tag123"]) {
  console.log(`${tag.padEnd(10)} exact ${String(exact.get(tag) ?? 0).padStart(6)}   sketch ${String(cms.estimate(tag)).padStart(6)}`);
}
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

class CountMinSketch {
    int w_, d_;
    vector<vector<uint32_t>> table_;
    uint32_t h(const string& item, int row) const {
        uint32_t x = 2166136261u ^ (uint32_t)(row * 0x9e3779b9u);
        for (unsigned char c : item) { x ^= c; x *= 16777619u; }
        x ^= x >> 15; x *= 0x2c1b3c6du; x ^= x >> 12;
        return x % w_;
    }
public:
    CountMinSketch(int width, int depth) : w_(width), d_(depth), table_(depth, vector<uint32_t>(width)) {}
    void add(const string& item, uint32_t count = 1) { for (int r = 0; r < d_; r++) table_[r][h(item, r)] += count; }
    uint32_t estimate(const string& item) const {
        uint32_t m = UINT32_MAX;
        for (int r = 0; r < d_; r++) m = min(m, table_[r][h(item, r)]);
        return m;
    }
};

int main() {
    uint64_t seed = 17;
    auto rnd = [&] { seed = seed * 16807 % 2147483647; return seed / 2147483647.0; };
    CountMinSketch cms(2000, 5);                           // fixed 10,000 counters
    unordered_map<string, int> exact;
    for (int i = 0; i < 200000; i++) {
        double r = rnd();
        string tag = r < 0.05 ? "#worldcup" : r < 0.08 ? "#election" : r < 0.10 ? "#newphone"
                                                                      : "#tag" + to_string((int)(rnd() * 50000));
        cms.add(tag);
        exact[tag]++;
    }
    cout << "distinct tags seen: " << exact.size() << "\n";
    for (string tag : {"#worldcup", "#election", "#newphone", "#tag123"})
        cout << left << setw(10) << tag << " exact " << right << setw(6) << exact[tag]
             << "   sketch " << setw(6) << cms.estimate(tag) << "\n";
}
```
:::

Heavy hitters (big counts) come out almost exact; rare items get inflated a little by collisions, which rarely matters because you only care about the top. Combine a Count-Min Sketch with a small **min-heap of the current top-k** to track trending items in a stream (top-K case study). Also used for network traffic analysis, query frequency in databases, and rate limiting by approximate counts.

## HyperLogLog

:::def HyperLogLog (HLL)
Estimates the number of **distinct** items (cardinality) using the observation that in random hashes, a run of **k leading zeros** appears about once every 2ᵏ items. It splits items into m buckets by their first bits, keeps the **maximum leading-zero run** seen per bucket, and combines them with a harmonic mean. With m = 16,384 buckets (~12 KB), the standard error is about **0.8%** (so most estimates land within ±2%), for billions of items.
:::

```js run title="Counting unique visitors with HyperLogLog (simplified)"
class HyperLogLog {
  constructor(b = 14) { this.b = b; this.m = 1 << b; this.reg = new Uint8Array(this.m); }
  static hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  add(item) {
    const h = HyperLogLog.hash(item);
    const bucket = h >>> (32 - this.b);                       // first b bits pick the register
    const rest = (h << this.b) >>> 0;                         // remaining bits
    const rank = rest === 0 ? 32 - this.b + 1 : Math.clz32(rest) + 1;   // position of the first 1-bit
    if (rank > this.reg[bucket]) this.reg[bucket] = rank;
  }
  count() {
    const alpha = 0.7213 / (1 + 1.079 / this.m);
    let sum = 0, zeros = 0;
    for (const r of this.reg) { sum += 2 ** -r; if (r === 0) zeros++; }
    let est = (alpha * this.m * this.m) / sum;
    if (est <= 2.5 * this.m && zeros > 0) est = this.m * Math.log(this.m / zeros);   // small-range correction
    return Math.round(est);
  }
  merge(other) { for (let i = 0; i < this.m; i++) this.reg[i] = Math.max(this.reg[i], other.reg[i]); return this; }
}

const monday = new HyperLogLog(), tuesday = new HyperLogLog();
for (let i = 0; i < 300_000; i++) monday.add(`user-${i}`);           // 300K unique visitors
for (let i = 200_000; i < 650_000; i++) tuesday.add(`user-${i}`);    // 450K, 100K overlapping
for (let i = 0; i < 100_000; i++) monday.add(`user-${i}`);           // repeat visits don't change the count

const pct = (est, truth) => `${((est - truth) / truth * 100).toFixed(2)}%`;
console.log(`Monday:  est ${monday.count()}  true 300000  error ${pct(monday.count(), 300000)}`);
console.log(`Tuesday: est ${tuesday.count()}  true 450000  error ${pct(tuesday.count(), 450000)}`);
const both = new HyperLogLog().merge(monday).merge(tuesday);
console.log(`Union (Mon ∪ Tue): est ${both.count()}  true 650000  error ${pct(both.count(), 650000)}`);
console.log(`memory: ${monday.m} registers × 1 byte = ${monday.m / 1024} KB per counter`);
```

HLLs **merge** losslessly (take the per-register maximum), so you can count uniques per hour and combine them into days, or per server and combine them cluster-wide. Redis has them built in (`PFADD`, `PFCOUNT`, `PFMERGE`), and analytics databases (BigQuery's `APPROX_COUNT_DISTINCT`, Presto, Druid, ClickHouse) use them for distinct counts.

:::interview When to name these
- "Has this URL / username / key been seen?" with billions of items → **Bloom filter**.
- "Top trending items in a stream" or "approximate counts per key" → **Count-Min Sketch** (+ a heap).
- "Unique visitors / distinct users per day" at scale → **HyperLogLog** (Redis `PFADD`).
Always say the error and why it's acceptable: *"a 0.8% error on a unique-visitor dashboard is invisible, and it saves terabytes of id sets."*
:::

```quiz
? A Bloom filter says an item is NOT present. How sure can you be?
+ Completely sure: Bloom filters have no false negatives
- About 99% sure
- Not sure at all; it may be a false negative
> If any of the item's bits is 0, it was never added. Only "present" answers can be wrong.

? You need to count unique daily users across 50 servers, with ~1% error acceptable and tiny memory. Which structure?
- Bloom filter
- Count-Min Sketch
+ HyperLogLog (one per server, merged)
> HLL estimates cardinality in ~12 KB with ~1% error and merges across servers by taking register maxima.

? Why does a Count-Min Sketch return the MINIMUM of the item's counters?
+ Collisions only add to counters, so every counter over-estimates; the minimum is the least inflated
- To favour rare items
- Because the maximum overflows
> Each row's counter is true count + collisions. The smallest one has the fewest collisions.

? Roughly how many bits per item does a Bloom filter need for a 1% false-positive rate?
- 1
+ about 10
- about 100
> m/n = −ln(0.01)/(ln 2)² ≈ 9.6 bits per item, independent of item size.
```

:::keypoints
- Probabilistic structures trade a small, **known error** for **huge memory savings** at scale.
- **Bloom filter**: set membership, **no false negatives**, ~10 bits/item for 1% false positives; used by LSM stores, crawlers, caches, CDNs. Can't delete (use counting or cuckoo filters).
- **Count-Min Sketch**: frequency estimates with fixed memory, only ever over-estimating; with a heap, it tracks **heavy hitters**/trending items.
- **HyperLogLog**: distinct counts with ~0.8% error in ~12 KB, **mergeable**; Redis `PFADD/PFCOUNT`, `APPROX_COUNT_DISTINCT` in warehouses.
- In interviews, name the structure, its error type, and why that error is acceptable for the feature.
:::
