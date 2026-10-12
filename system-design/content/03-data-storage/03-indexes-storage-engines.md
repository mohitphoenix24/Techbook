---
title: Indexes and Storage Engines (B-Trees vs LSM Trees)
level: intermediate
time: 45
summary: How a database finds a row without scanning everything — B-tree indexes, composite indexes and the leftmost-prefix rule, covering indexes and the write cost of indexing — and the two storage engine designs behind almost every database, B+ trees and LSM trees, with their read and write trade-offs.
---

"Add an index" is the most common fix for a slow query, and "which storage engine?" explains why Cassandra is great at writes and Postgres is great at reads. Both come down to one question: **how is data laid out on disk so that the operations you care about touch as little of it as possible?**

## Why indexes exist

Without an index, finding `WHERE email = 'asha@ex.com'` in a 100-million-row table means a **full table scan**: read every row. With an index on `email`, the database jumps almost directly to the row.

:::def Index
An extra data structure that maps the values of one or more columns to the location of the matching rows, kept **sorted** (B-tree) or **hashed**, so lookups don't need a scan. It's like the index at the back of a book.
:::

```js run title="Full scan vs index lookup: how many rows are touched?"
// 1 million rows, looked up by email
const N = 1_000_000;
const rows = Array.from({ length: N }, (_, i) => ({ id: i, email: `user${String(i).padStart(7, "0")}@ex.com` }));

// No index: scan until found
function scan(email) {
  let touched = 0;
  for (const r of rows) { touched++; if (r.email === email) return { row: r, touched }; }
  return { row: null, touched };
}

// Index: a sorted list of (email, rowId); binary search it
const index = rows.map((r) => [r.email, r.id]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
function lookup(email) {
  let lo = 0, hi = index.length - 1, touched = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    touched++;
    if (index[mid][0] === email) return { row: rows[index[mid][1]], touched };
    if (index[mid][0] < email) lo = mid + 1; else hi = mid - 1;
  }
  return { row: null, touched };
}

const target = "user0987654@ex.com";
console.log("full scan touched   ", scan(target).touched.toLocaleString("en-US"), "rows");
console.log("index lookup touched", lookup(target).touched, "entries");
```

A real database index isn't a sorted array (inserting into the middle of an array is slow); it's a **B+ tree**, which keeps the same O(log n) lookups while allowing cheap inserts.

## B+ tree indexes

:::def B+ tree
A balanced tree where each node is a **disk page** (typically 4–16 KB) holding hundreds of sorted keys. Internal nodes route the search; **leaf** nodes hold the keys plus row pointers (or the rows themselves) and are linked left-to-right for range scans.
:::

With ~500 keys per node, a tree of height 4 indexes 500⁴ ≈ 60 billion rows, so **any lookup is about 3–4 page reads**, and the top levels are almost always cached in memory. Because the leaves are sorted and linked, a B+ tree also answers **range queries** (`WHERE created_at BETWEEN …`), **ordering** (`ORDER BY`), and **prefix matches** (`LIKE 'asha%'`) efficiently. That's why it's the default index type nearly everywhere.

A **hash index** answers exact-match lookups in O(1) but can't do ranges or ordering. It's used by key-value stores and in-memory indexes.

## Composite indexes and the leftmost-prefix rule

An index can cover several columns, sorted by the first column, then by the second within equal firsts, and so on, like a phone book sorted by last name, then first name.

```text
CREATE INDEX idx_orders_user_time ON orders (user_id, created_at);

-- ✓ uses the index (leftmost column)
SELECT * FROM orders WHERE user_id = 42;
-- ✓ uses both columns: equality on the first, range on the second
SELECT * FROM orders WHERE user_id = 42 AND created_at > '2026-01-01' ORDER BY created_at DESC LIMIT 20;
-- ✗ can't use it efficiently: skips the first column
SELECT * FROM orders WHERE created_at > '2026-01-01';
```

:::def Leftmost-prefix rule
A composite index on (A, B, C) helps queries filtering on A, on A and B, or on A, B and C — a leftmost prefix — but not on B or C alone. Put **equality** columns first and the **range or sort** column last.
:::

:::def Covering index
An index that contains **every column the query needs**, so the database answers from the index alone without visiting the table rows ("index-only scan"). E.g. `(user_id, created_at, status)` covers `SELECT created_at, status FROM orders WHERE user_id = 42`.
:::

### Indexes aren't free

Every index must be **updated on every write** to the table. Five indexes on a table can make inserts several times slower and use as much disk as the table itself. So:

- Index the columns used in frequent `WHERE`, `JOIN` and `ORDER BY` clauses.
- Prefer one good composite index over several single-column ones.
- Drop unused indexes. Write-heavy tables should have few indexes.
- Low-selectivity columns (a boolean, a status with 3 values) rarely benefit alone.

:::tip In an interview
When you write a data model, add the index next to the query that needs it: *"orders table, indexed on (user_id, created_at) for the order-history page."* It shows you're thinking about the access patterns, which is what data modelling is about.
:::

## Storage engines: where the bytes go

Underneath the indexes, every database has a **storage engine** deciding how data is written to disk. There are two dominant designs.

### B+ tree engines (update in place)

Used by PostgreSQL, MySQL/InnoDB, Oracle, SQL Server, and many others. The table (or its primary index) **is** a B+ tree of pages. A write finds the right page and **modifies it in place** (after first appending the change to the write-ahead log for durability).

- ✓ Reads are fast and predictable: one tree walk.
- ✓ Each key lives in exactly one place, which makes transactions and locking natural.
- ✗ Writes cause **random I/O** (each insert may touch a different page) and pages fill up unevenly; heavy random writes are the bottleneck.

### LSM tree engines (log-structured merge)

Used by Cassandra, ScyllaDB, RocksDB, LevelDB, HBase, Bigtable, and as an option in many others. The idea: **never modify data in place; turn all writes into sequential appends.**

```viz algo=arch title="The LSM tree write and read paths"
client   Write / read [client]
wal      Write-ahead log | append-only, for crash recovery [file]
mem      Memtable | sorted, in memory [cache]
l0       SSTables L0 | small, recent [storage]
l1       SSTables L1 | merged, larger [storage]
l2       SSTables L2 | oldest, largest [storage]
--
client -> wal : 1. append
client -> mem : 2. insert
mem -> l0 : flush when full
l0 -> l1 : compaction
l1 -> l2 : compaction
--
flow Write a key
client > wal : Append the write to the log (sequential, fast) so it survives a crash.
client > mem : Insert into the in-memory sorted table. Done: the write is acknowledged.
mem > l0 : When the memtable reaches ~64 MB, write it out as an immutable sorted file (SSTable).
l0 > l1 : In the background, compaction merges SSTables, drops overwritten and deleted values, and keeps files sorted.
flow Read a key
client > mem : Check the memtable first (newest data).
mem > l0 : Then the SSTables from newest to oldest. Each file's Bloom filter skips files that can't contain the key.
l0 > l1 : Stop at the first match: it's the newest version.
```

Key pieces:

- **Memtable**: an in-memory sorted structure (skip list or tree) receiving writes.
- **SSTable** (sorted string table): an immutable file of sorted key–value pairs with a small index. Created when the memtable flushes.
- **Compaction**: background merging of SSTables (like merge sort), removing overwritten values and **tombstones** (delete markers).
- **Bloom filters** per SSTable: a compact bit array that says "this key is definitely not in this file", so most reads skip most files.

Here's the idea in miniature:

```js run title="A tiny LSM tree: memtable, flushes, newest-first reads, compaction"
class TinyLSM {
  constructor(memLimit = 3) { this.memLimit = memLimit; this.mem = new Map(); this.sstables = []; }   // sstables[0] = newest
  put(k, v) {
    this.mem.set(k, v);
    if (this.mem.size >= this.memLimit) this.flush();
  }
  del(k) { this.put(k, null); }                       // a tombstone
  flush() {
    const sorted = [...this.mem.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    this.sstables.unshift(sorted);                    // immutable, sorted file
    this.mem = new Map();
  }
  get(k) {
    if (this.mem.has(k)) return this.mem.get(k);
    for (let i = 0; i < this.sstables.length; i++) {  // newest file first
      const hit = this.sstables[i].find(([key]) => key === k);
      if (hit) return hit[1];                         // null means "deleted"
    }
    return undefined;
  }
  compact() {                                         // merge all files, newest value wins, drop tombstones
    const merged = new Map();
    for (const table of [...this.sstables].reverse()) for (const [k, v] of table) merged.set(k, v);
    this.sstables = [[...merged.entries()].filter(([, v]) => v !== null).sort(([a], [b]) => (a < b ? -1 : 1))];
  }
}

const db = new TinyLSM();
db.put("apple", 1); db.put("kiwi", 2); db.put("mango", 3);    // flush #1
db.put("apple", 10); db.del("kiwi"); db.put("plum", 4);         // flush #2
db.put("fig", 5);                                               // still in the memtable
console.log("SSTables:", JSON.stringify(db.sstables));
console.log("get apple:", db.get("apple"), "| get kiwi:", db.get("kiwi"), "| get fig:", db.get("fig"));
db.compact();
console.log("after compaction:", JSON.stringify(db.sstables));
```

### Comparing them

| | B+ tree (update in place) | LSM tree (append + merge) |
|---|---|---|
| Write pattern | random page writes | sequential appends: **very high write throughput** |
| Read cost | one tree walk: fast, predictable | may check memtable + several SSTables (Bloom filters help) |
| Range scans | excellent | good (merge sorted files) |
| Space | some fragmentation | old versions until compaction; compression is very effective |
| Background work | little | compaction uses I/O and CPU, can cause latency spikes |
| **Write amplification** (bytes written per byte of data) | moderate (page + WAL) | can be high (rewritten by each compaction level) |
| **Read amplification** | low | higher |
| Typical databases | Postgres, MySQL, Oracle | Cassandra, RocksDB, HBase, Bigtable, ScyllaDB |
| Best for | read-heavy and mixed workloads, transactions | write-heavy workloads: logs, events, messages, time series |

:::note Amplification is the deep-dive vocabulary
**Write amplification**: one logical write causes several physical writes (WAL, page, compactions). **Read amplification**: one logical read causes several physical reads (several SSTables). **Space amplification**: data takes more disk than its logical size (old versions). Every storage engine trades among these three.
:::

:::interview How this shows up in designs
When you pick Cassandra for chat messages or metrics, say **why**: "it's LSM-based, so writes are sequential appends and it sustains very high write throughput; our reads are by partition and time range, which it serves well." When you pick Postgres for orders: "B-tree storage with fast indexed reads and real transactions."
:::

```quiz
? A composite index exists on (country, city, signup_date). Which query can NOT use it efficiently?
- WHERE country = 'IN'
- WHERE country = 'IN' AND city = 'Pune'
+ WHERE city = 'Pune'
- WHERE country = 'IN' AND city = 'Pune' AND signup_date > '2026-01-01'
> The leftmost-prefix rule: the index is sorted by country first, so a filter on city alone can't use the ordering.

? Why do LSM-tree databases handle heavy write loads so well?
+ Writes become sequential appends (WAL + in-memory memtable, later flushed as immutable sorted files) instead of random in-place page updates
- They skip durability
- They don't support reads
> Sequential I/O is far cheaper than random I/O. Compaction later reorganises the data in the background.

? What does a Bloom filter do for each SSTable in an LSM tree?
- Compresses the file
+ Quickly answers "this key is definitely not in this file", so reads skip most files
- Sorts the keys
> Bloom filters can have false positives but no false negatives, which is exactly what's needed to skip files safely.

? A table receives 50,000 inserts/s and has 9 indexes. Inserts are slow. What's the first thing to look at?
+ Whether all 9 indexes are needed, since each one must be updated on every insert
- Adding a tenth index
- Switching to a bigger font
> Indexes speed up reads but cost writes. Write-heavy tables should carry only the indexes their queries need.
```

:::keypoints
- An **index** keeps column values sorted (B+ tree) or hashed so lookups avoid full scans: ~3–4 page reads for billions of rows.
- **Composite indexes** follow the **leftmost-prefix rule**: equality columns first, range/sort column last. **Covering indexes** answer queries from the index alone.
- Every index **slows writes** and uses space; index for your real query patterns only.
- **B+ tree engines** (Postgres, MySQL) update pages in place: fast reads, transactions. **LSM engines** (Cassandra, RocksDB) append and compact: very fast writes, reads helped by Bloom filters.
- The trade-off triangle: **write, read and space amplification**.
:::
