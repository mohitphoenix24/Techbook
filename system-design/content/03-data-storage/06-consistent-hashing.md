---
title: Consistent Hashing
level: intermediate
time: 45
summary: Why "hash mod N" breaks when servers come and go, how the hash ring moves only about 1/N of the keys, virtual nodes for even load, replicating to the next nodes on the ring, implementations in C++ and JavaScript, and alternatives such as rendezvous and jump hashing.
---

Consistent hashing is one of the most cited techniques in system design interviews. It appears whenever data or requests are spread over a **changing** set of servers: distributed caches, Dynamo-style databases (Cassandra, DynamoDB, Riak), load balancers with affinity, CDNs, chat servers. The idea fits on a napkin, and implementing it is a common follow-up question.

## The problem with hash mod N

The obvious way to spread keys over N servers is `server = hash(key) mod N`. It distributes evenly, and lookups need no coordination. But watch what happens when **N changes** (a server is added for capacity, or one dies):

```js run title="hash mod N: how many keys move when a 5th server joins?"
// FNV-1a plus a final bit-mixing step (see the implementation below)
const hash32 = (s) => {
  let h = 0x811c9dc5;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
const keys = Array.from({ length: 100_000 }, (_, i) => `user:${i}`);

const before = keys.map((k) => hash32(k) % 4);
const after = keys.map((k) => hash32(k) % 5);
const moved = keys.filter((_, i) => before[i] !== after[i]).length;
console.log(`4 → 5 servers: ${(moved / keys.length * 100).toFixed(1)}% of keys moved to a different server`);
console.log(`ideal (only the new server's fair share): ${(100 / 5).toFixed(1)}%`);
```

About **80%** of keys change servers. For a cache, that means 80% of the cache suddenly misses and the database gets hammered (a self-inflicted avalanche). For a database, it means moving 80% of the data. We want **only the keys that the new server should own** (1/N of them) to move.

## The hash ring

:::def Consistent hashing
Map both **servers** and **keys** onto the same circular hash space (say 0 … 2³² − 1, wrapped around into a ring). Each key belongs to the **first server found by walking clockwise** from the key's position.
:::

- **Adding** a server: it takes over only the keys between itself and the previous server counter-clockwise. Everything else stays put.
- **Removing** a server: only its keys move, to the next server clockwise.

On average, a change moves **K/N** keys (K keys, N servers): the minimum possible.

Try it: add and remove servers, and watch which keys move (they're drawn bigger). Then raise the number of **virtual nodes**.

```viz algo=hashring title="The hash ring"
nodes = A,B,C
vnodes = 1
keys = 60
```

## Virtual nodes

With one point per server, the ring is divided **unevenly** by chance. One server might own 50% of the ring and another 10%. And when a server leaves, **all** its load goes to its single clockwise neighbour, possibly overloading it.

:::def Virtual nodes (vnodes)
Place each physical server on the ring **many times** (e.g. 100–256 points, by hashing `"A#0"`, `"A#1"`, …). Each server then owns many small arcs spread around the ring.
:::

Virtual nodes give:

1. **Even load**: with many small arcs, each server's total share converges to 1/N (set vnodes to 64 in the simulator and compare the "busiest server" figure).
2. **Even redistribution**: when a server leaves, its many small arcs are picked up by **many different** servers, not one neighbour.
3. **Heterogeneous servers**: give a bigger machine more vnodes, and it gets proportionally more keys.

The cost is a larger ring to store and search (N × vnodes points; fine for thousands of points, since lookup is a binary search).

## Implementation

A ring is a **sorted map** from position → server. Lookup = find the first position ≥ hash(key), wrapping to the start. In C++ that's `std::map::lower_bound`; in JavaScript a sorted array plus binary search.

:::tabs A consistent hash ring with virtual nodes
```cpp run
#include <bits/stdc++.h>
using namespace std;

// FNV-1a (fast, non-cryptographic), then MurmurHash3's finaliser so that
// similar keys ("user:1", "user:2") land far apart on the ring
uint32_t hash32(const string& s) {
    uint32_t h = 2166136261u;
    for (unsigned char c : s) { h ^= c; h *= 16777619u; }
    h ^= h >> 16; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16;
    return h;
}

class HashRing {
    map<uint32_t, string> ring_;                 // position on the ring → server
    int vnodes_;
public:
    explicit HashRing(int vnodes) : vnodes_(vnodes) {}

    void addServer(const string& s) {
        for (int i = 0; i < vnodes_; i++) ring_[hash32(s + "#" + to_string(i))] = s;
    }
    void removeServer(const string& s) {
        for (int i = 0; i < vnodes_; i++) ring_.erase(hash32(s + "#" + to_string(i)));
    }
    const string& serverFor(const string& key) const {
        auto it = ring_.lower_bound(hash32(key)); // first point clockwise from the key
        if (it == ring_.end()) it = ring_.begin(); // wrap around
        return it->second;
    }
    // The first n DISTINCT servers clockwise: where a key's replicas live
    vector<string> replicasFor(const string& key, size_t n) const {
        vector<string> out;
        auto it = ring_.lower_bound(hash32(key));
        for (size_t steps = 0; out.size() < n && steps < ring_.size(); steps++, ++it) {
            if (it == ring_.end()) it = ring_.begin();
            if (find(out.begin(), out.end(), it->second) == out.end()) out.push_back(it->second);
        }
        return out;
    }
};

int main() {
    HashRing ring(150);
    for (string s : {"cache-a", "cache-b", "cache-c", "cache-d"}) ring.addServer(s);

    vector<string> keys;
    for (int i = 0; i < 100000; i++) keys.push_back("user:" + to_string(i));

    map<string, int> load;
    unordered_map<string, string> before;
    for (auto& k : keys) { before[k] = ring.serverFor(k); load[before[k]]++; }
    cout << "load with 4 servers:";
    for (auto& [s, n] : load) cout << "  " << s << "=" << n;
    cout << "\n";

    ring.addServer("cache-e");
    int moved = 0;
    for (auto& k : keys) moved += ring.serverFor(k) != before[k];
    cout << "adding cache-e moved " << fixed << setprecision(1) << moved * 100.0 / keys.size()
         << "% of keys (ideal: 20%)\n";

    auto reps = ring.replicasFor("user:42", 3);
    cout << "user:42 -> primary " << reps[0] << ", replicas " << reps[1] << ", " << reps[2] << "\n";
}
```
```js run
// FNV-1a (fast, non-cryptographic), then MurmurHash3's finaliser so that
// similar keys ("user:1", "user:2") land far apart on the ring
const hash32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};

class HashRing {
  constructor(vnodes) { this.vnodes = vnodes; this.points = []; }    // sorted [position, server]

  addServer(s) {
    for (let i = 0; i < this.vnodes; i++) this.points.push([hash32(`${s}#${i}`), s]);
    this.points.sort((a, b) => a[0] - b[0]);
  }
  removeServer(s) { this.points = this.points.filter(([, srv]) => srv !== s); }

  #firstAtOrAfter(h) {                      // binary search on the sorted ring
    let lo = 0, hi = this.points.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.points[mid][0] < h) lo = mid + 1; else hi = mid; }
    return lo === this.points.length ? 0 : lo;   // wrap around
  }
  serverFor(key) { return this.points[this.#firstAtOrAfter(hash32(key))][1]; }

  // The first n DISTINCT servers clockwise: where a key's replicas live
  replicasFor(key, n) {
    const out = [];
    for (let i = this.#firstAtOrAfter(hash32(key)), steps = 0; out.length < n && steps < this.points.length; i = (i + 1) % this.points.length, steps++) {
      const srv = this.points[i][1];
      if (!out.includes(srv)) out.push(srv);
    }
    return out;
  }
}

const ring = new HashRing(150);
for (const s of ["cache-a", "cache-b", "cache-c", "cache-d"]) ring.addServer(s);

const keys = Array.from({ length: 100_000 }, (_, i) => `user:${i}`);
const before = new Map(keys.map((k) => [k, ring.serverFor(k)]));
const load = {};
for (const s of before.values()) load[s] = (load[s] || 0) + 1;
console.log("load with 4 servers:", load);

ring.addServer("cache-e");
const moved = keys.filter((k) => ring.serverFor(k) !== before.get(k)).length;
console.log(`adding cache-e moved ${(moved / keys.length * 100).toFixed(1)}% of keys (ideal: 20%)`);

const [primary, ...replicas] = ring.replicasFor("user:42", 3);
console.log(`user:42 -> primary ${primary}, replicas ${replicas.join(", ")}`);
```
:::

:::warn The hash function matters
Plain FNV-1a is fast but mixes its bits poorly for keys that differ only in the last characters (`user:1`, `user:2`, …): such keys cluster on the ring and the load comes out uneven even with vnodes. A cheap **finaliser** (the last steps of MurmurHash3, used above) fixes that. Production systems use well-mixed hashes such as MurmurHash3, xxHash or a cryptographic hash (Cassandra uses Murmur3).
:::

Notice the `replicasFor` method: in Dynamo-style databases, a key is stored on its owner **and the next N−1 distinct servers clockwise** (the "preference list"). Skipping vnodes that belong to a server already chosen guarantees the replicas land on different machines. Production systems also make sure they're in different **racks or availability zones**.

## Where it's used

- **Distributed caches**: client libraries (Memcached's ketama) map keys to cache nodes; adding a node invalidates only ~1/N of the cache.
- **Dynamo-style databases**: Amazon Dynamo, Cassandra, Riak, ScyllaDB partition and replicate data on a token ring.
- **Load balancers with affinity**: route a user (or a URL) to the same backend while servers come and go (Google's Maglev uses a related table-based scheme).
- **Chat and WebSocket systems**: map a user or channel to a gateway / presence server.
- **CDNs**: choose which cache server in a PoP holds a URL, maximising hit rates.

## Alternatives worth naming

- **Rendezvous (highest random weight) hashing**: for each key, compute `hash(key, server)` for every server and pick the highest. Same minimal-movement property, no ring, perfectly even with no vnodes, but O(N) per lookup (fine for tens of servers).
- **Jump consistent hash** (Google, 2014): a tiny, fast function that maps a key to one of N **numbered** buckets with minimal movement, but only when buckets are added or removed **at the end**. Great for sharded storage with numbered shards.
- **Fixed logical partitions** (from the sharding lesson): hash keys into, say, 16,384 slots, and assign slots to servers in a table. Redis Cluster and Kafka work this way. It's often simpler operationally than a ring, since moves are explicit.

:::interview The 30-second explanation
*"I'd use consistent hashing: servers and keys are hashed onto a ring, and a key goes to the next server clockwise. Adding or removing a server only moves the keys in that server's arcs, about 1/N of them, instead of almost everything as with mod N. Each server gets ~150 virtual nodes so the load is even and a failed server's keys spread over all the others. For replication, a key is stored on the next three distinct servers on the ring."*
:::

```quiz
? You have 10 cache servers using `hash(key) mod N`, and you add an 11th. Roughly what fraction of keys now map to a different server?
- about 9%
+ about 90%
- none
> Almost every key's `hash mod 10` differs from its `hash mod 11`. Consistent hashing would move only about 1/11 ≈ 9%.

? What problem do virtual nodes solve?
- They make the hash function faster
+ Uneven arcs on the ring, and dumping a failed server's entire load onto a single neighbour
- They remove the need for replication
> Many small arcs per server average out the load and spread a failed server's keys over all the others.

? In a Dynamo-style ring with replication factor 3, where are a key's replicas stored?
+ On the first three distinct servers found clockwise from the key's position
- On three random servers
- On the three least loaded servers
> The preference list walks the ring clockwise, skipping virtual nodes of servers already chosen.
```

:::keypoints
- `hash mod N` remaps almost every key when N changes, so caches go cold and data must move.
- **Consistent hashing** puts servers and keys on a ring; a key belongs to the next server clockwise. Changes move only **~1/N** of the keys.
- **Virtual nodes** (many points per server) even out the load, spread a failed server's keys widely, and allow weighting by capacity.
- Replicate a key to the **next N distinct servers** clockwise (in different racks/zones).
- Implementation: a sorted map with `lower_bound` (C++) or binary search (JS). Alternatives: rendezvous hashing, jump hash, fixed hash slots.
:::
