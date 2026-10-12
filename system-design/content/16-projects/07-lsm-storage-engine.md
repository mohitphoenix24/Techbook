---
title: Build an LSM-Tree Storage Engine
level: advanced
time: 70
icon: stack
cover: #b45309,#f59e0b
tags: LSM tree, write-ahead log, SSTables, Bloom filters, compaction
summary: Build the storage engine inside Cassandra, RocksDB and LevelDB in C++ — a write-ahead log and memtable that flush to immutable sorted tables, newest-first reads with tombstones and crash recovery, then per-table Bloom filters, size-tiered compaction and range scans, measured for read and write amplification against a reference model.
---

B-trees update pages in place; **LSM trees** never do. They turn every write into a sequential append, buffer it in memory, and write sorted immutable files in bulk. That makes writes extremely fast, at the cost of more work on reads (check several files) and in the background (compaction). In this project you'll build one and measure exactly that trade-off.

:::flow What you'll build
WAL | append every write first: durability
Memtable | sorted map in memory
Flush | memtable → immutable sorted SSTable
Reads | memtable, then tables newest → oldest; tombstones
Bloom filters | skip tables that can't contain the key
Compaction | merge tables, drop overwritten values and tombstones
:::

## Step 1: the write path and reads

```cpp run title="WAL + memtable + SSTables + tombstones + crash recovery"
// Step 1: the LSM write path — WAL, memtable, flush to immutable sorted tables, newest-first reads
#include <bits/stdc++.h>
using namespace std;

using Value = optional<string>;                         // nullopt = tombstone (a delete marker)

struct SSTable { vector<pair<string, Value>> rows; };   // sorted by key, never modified after it's written

class LSM {
    vector<string> wal;                                 // the write-ahead log (an append-only file)
    map<string, Value> memtable;                        // sorted in memory
    vector<SSTable> tables;                             // newest last
    size_t limit;
public:
    explicit LSM(size_t memtableLimit) : limit(memtableLimit) {}

    void put(const string& k, const string& v) { write(k, v); }
    void del(const string& k) { write(k, nullopt); }

    Value get(const string& k) const {
        if (auto it = memtable.find(k); it != memtable.end()) return it->second;   // newest data first
        for (auto t = tables.rbegin(); t != tables.rend(); ++t) {                   // then newest table to oldest
            auto it = lower_bound(t->rows.begin(), t->rows.end(), k, [](auto& row, const string& key) { return row.first < key; });
            if (it != t->rows.end() && it->first == k) return it->second;          // may be a tombstone
        }
        return nullopt;
    }
    void crashAndRecover() {                            // memory is lost; the WAL survives on disk
        memtable.clear();
        for (auto& line : wal) {
            auto tab = line.find('\t');
            string op = line.substr(0, 3), k = line.substr(4, tab - 4);
            memtable[k] = op == "PUT" ? Value(line.substr(tab + 1)) : nullopt;
        }
    }
    size_t tableCount() const { return tables.size(); }
    size_t memtableSize() const { return memtable.size(); }
private:
    void write(const string& k, Value v) {
        wal.push_back((v ? "PUT " : "DEL ") + k + "\t" + v.value_or(""));         // 1) durable append
        memtable[k] = move(v);                                                      // 2) in-memory insert
        if (memtable.size() >= limit) flush();
    }
    void flush() {                                      // write the memtable out as one sorted, immutable table
        tables.push_back({{memtable.begin(), memtable.end()}});
        memtable.clear();
        wal.clear();                                    // everything in the WAL is now in an SSTable
    }
};

int main() {
    LSM db(4);                                          // flush every 4 keys so we can watch it happen
    for (string k : {"apple", "banana", "cherry", "date", "elder", "fig"}) db.put(k, k + "-v1");
    db.put("banana", "banana-v2");                      // an update: newer value in the memtable
    db.del("cherry");                                   // a delete: tombstone shadows the old value
    cout << db.tableCount() << " SSTables + " << db.memtableSize() << " keys in the memtable\n";
    for (string k : {"apple", "banana", "cherry", "fig", "grape"})
        cout << "  get(" << k << ") = " << db.get(k).value_or("(not found)") << "\n";

    db.put("grape", "grape-v1");
    db.crashAndRecover();                               // power loss: the memtable is rebuilt from the WAL
    cout << "after a crash: get(grape) = " << db.get("grape").value_or("(lost!)")
         << ", get(banana) = " << db.get("banana").value_or("(lost!)") << "\n";
}
```

Three rules make it correct: **write the WAL before** the memtable (so a crash can't lose an acknowledged write), read **newest to oldest** (the first hit wins), and represent deletes as **tombstones** (an older table still contains the key, so the delete must shadow it).

## Step 2: Bloom filters, compaction and amplification

With 77 tables, a lookup for a missing key would read 77 tables. A **Bloom filter** per table answers "definitely not here" for almost all of them. Over time the number of tables grows, and old versions and tombstones waste space: **compaction** merges tables, keeping only the newest version of each key and dropping tombstones at the bottom. It costs extra writes (**write amplification**). Every configuration is checked against a reference `map` so a bug can't hide behind good numbers.

```cpp run title="Measuring Bloom filters and compaction"
// Step 2: Bloom filters, compaction, range scans, and the read/write amplification trade-off
#include <bits/stdc++.h>
using namespace std;

using Value = optional<string>;

uint64_t hash64(const string& s, uint64_t seed) {        // FNV-1a with a seed + a 64-bit finalizer
    uint64_t h = 1469598103934665603ULL ^ seed;
    for (unsigned char c : s) h = (h ^ c) * 1099511628211ULL;
    h ^= h >> 33; h *= 0xff51afd7ed558ccdULL; h ^= h >> 33;
    return h;
}

struct Bloom {                                          // ~10 bits per key, 7 hashes → about 1% false positives
    vector<bool> bits; int k = 7;
    explicit Bloom(size_t n) : bits(max<size_t>(64, n * 10)) {}
    void add(const string& s) { uint64_t a = hash64(s, 1), b = hash64(s, 2); for (int i = 0; i < k; i++) bits[(a + i * b) % bits.size()] = true; }
    bool mayContain(const string& s) const {
        uint64_t a = hash64(s, 1), b = hash64(s, 2);
        for (int i = 0; i < k; i++)
            if (!bits[(a + i * b) % bits.size()]) return false;
        return true;
    }
};

struct SSTable {
    vector<pair<string, Value>> rows; Bloom bloom;
    explicit SSTable(vector<pair<string, Value>> r) : rows(move(r)), bloom(rows.size()) { for (auto& [k, v] : rows) bloom.add(k); }
};

struct Stats { long userBytes = 0, tableBytes = 0, gets = 0, probes = 0, bloomSkips = 0; };

class LSM {
    map<string, Value> memtable;
    vector<shared_ptr<SSTable>> tables;                 // newest last
    size_t limit; bool useBloom, compact;
public:
    Stats st;
    LSM(size_t memLimit, bool bloom, bool compaction) : limit(memLimit), useBloom(bloom), compact(compaction) {}
    void put(const string& k, Value v) {
        st.userBytes += k.size() + (v ? v->size() : 0);
        memtable[k] = move(v);
        if (memtable.size() >= limit) flush();
    }
    Value get(const string& k) {
        st.gets++;
        if (auto it = memtable.find(k); it != memtable.end()) return it->second;
        for (auto t = tables.rbegin(); t != tables.rend(); ++t) {
            if (useBloom && !(*t)->bloom.mayContain(k)) { st.bloomSkips++; continue; }   // definitely not here: skip the disk read
            st.probes++;
            auto& rows = (*t)->rows;
            auto it = lower_bound(rows.begin(), rows.end(), k, [](auto& r, const string& key) { return r.first < key; });
            if (it != rows.end() && it->first == k) return it->second;
        }
        return nullopt;
    }
    vector<pair<string, string>> scan(const string& from, const string& to) {   // k-way merge, newest source wins
        map<string, Value> merged;
        for (auto& t : tables) for (auto& [k, v] : t->rows) if (k >= from && k < to) merged[k] = v;   // oldest → newest overwrite
        for (auto& [k, v] : memtable) if (k >= from && k < to) merged[k] = v;
        vector<pair<string, string>> out;
        for (auto& [k, v] : merged) if (v) out.push_back({k, *v});                 // tombstones hide deleted keys
        return out;
    }
    size_t tableCount() const { return tables.size(); }
private:
    void write(vector<pair<string, Value>> rows) {
        for (auto& [k, v] : rows) st.tableBytes += k.size() + (v ? v->size() : 0);
        tables.push_back(make_shared<SSTable>(move(rows)));
    }
    void flush() {
        write({memtable.begin(), memtable.end()});
        memtable.clear();
        if (compact && tables.size() >= 4) compactAll();
    }
    void compactAll() {                                 // size-tiered: merge all tables into one
        map<string, Value> merged;
        for (auto& t : tables) for (auto& [k, v] : t->rows) merged[k] = v;          // newer tables overwrite older
        vector<pair<string, Value>> rows;
        for (auto& [k, v] : merged) if (v) rows.push_back({k, v});                // bottom level: drop tombstones
        tables.clear();
        write(move(rows));
    }
};

int main() {
    for (auto [bloom, compaction] : {pair{false, false}, pair{true, false}, pair{true, true}}) {
        LSM db(500, bloom, compaction);
        mt19937 rng(7);
        map<string, Value> truth;                       // a reference model to check correctness
        for (int i = 0; i < 40000; i++) {               // 40,000 writes over 8,000 keys; 10% deletes
            string k = "key" + to_string(rng() % 8000);
            Value v = rng() % 10 == 0 ? Value() : Value("v" + to_string(i));
            db.put(k, v); truth[k] = v;
        }
        int wrong = 0;
        for (int i = 0; i < 20000; i++) {               // half the reads are for keys that never existed
            string k = (i % 2 ? "key" : "nokey") + to_string(rng() % 8000);
            Value expect = truth.count(k) ? truth[k] : Value();
            if (db.get(k) != expect) wrong++;
        }
        auto range = db.scan("key100", "key101");     // string order: key100, key1000 … key1009
        string name = !bloom ? "plain LSM" : compaction ? "bloom + compaction" : "bloom filters";
        cout << left << setw(18) << name << right << ": " << setw(2) << db.tableCount() << " tables, " << fixed << setprecision(2)
             << (double)db.st.probes / db.st.gets << " table reads per get, "
             << setprecision(1) << (double)db.st.tableBytes / db.st.userBytes << "x write amplification, "
             << wrong << " wrong answers, scan [key100, key101): " << range.size() << " keys\n";
    }
}
```

Bloom filters cut table reads per lookup by about 50×; compaction cuts them roughly in half again and reclaims space, but every byte the user wrote was written about 5 times. That's the central LSM tuning question: **read amplification vs write amplification vs space amplification**.

## How it works

| Piece | Here | In RocksDB / Cassandra |
|---|---|---|
| WAL | vector of lines, cleared on flush | an fsynced log file per memtable |
| Memtable | `std::map` | a skip list (concurrent inserts) |
| SSTable | sorted vector + Bloom filter | data blocks + block index + Bloom filter + footer; compressed |
| Lookups | binary search per table | index block → one data block read (often cached) |
| Compaction | merge all tables once there are 4 | **size-tiered** (Cassandra default) or **leveled** (RocksDB/LevelDB: L0, L1… each 10× larger) |
| Tombstones | dropped when merging into one table | kept until they reach the bottom level and a grace period has passed |
| Range scans | merge all sources, newest wins | merging iterators over memtable + tables |

:::exercise Extend it
1. Implement **leveled compaction**: L0 holds flushed tables; when it has 4, merge them into L1 (one sorted run split into fixed-size tables); when L1 exceeds its size, push overlapping tables into L2. Compare write amplification and table reads per get with size-tiered.
2. Make range scans efficient with a **heap-based k-way merge** of table iterators instead of building a map.
3. Add a **block cache**: an LRU of recently read tables, and report the hit rate for a Zipf-distributed read workload.
4. Persist SSTables and the WAL to real files, then kill the process mid-write and recover.
5. Add **sequence numbers** to every write and implement snapshot reads ("read as of sequence 12,000").
:::

:::keypoints
- LSM writes: **WAL append → memtable → flush** to immutable sorted tables. Sequential I/O only, so writes are fast.
- Reads check the memtable then tables **newest first**; deletes are **tombstones**.
- **Bloom filters** skip most tables for a lookup; without them, read amplification grows with every flush.
- **Compaction** bounds read and space amplification at the cost of **write amplification**; size-tiered vs leveled choose different trade-offs.
- Verify a storage engine against a simple **reference model** under random workloads.
:::
