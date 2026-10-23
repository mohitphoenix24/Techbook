---
title: Design an In-Memory Key-Value Store with TTL and Transactions
level: advanced
time: 75
summary: A key-value store with expiring keys, nested transactions (begin, commit, rollback) implemented with an undo log, a write-ahead log for durability and recovery, thread-safety with a readers-writer lock, snapshots, and the design trade-offs with real databases.
---

:::problem Design an In-Memory Key-Value Store (Redis-like) {level=hard tags="storage,transactions,TTL,undo log,WAL,concurrency,Command"}
Design an in-memory key-value store. It supports `get`, `set`, `delete`, keys with a time to live (TTL), **nested transactions** (`begin`, `commit`, `rollback`) where changes inside a transaction are invisible to others until commit and can be rolled back, and optional durability through a write-ahead log that can rebuild the store after a crash. It must be safe for concurrent clients.
:::

:::hint Hint
Implement a transaction as an **overlay** of pending changes on top of the base map (or as an **undo log** that records inverse operations). Nested transactions are a **stack** of overlays. Durability = append every committed change to a log before applying it, and replay the log on start-up. TTL needs a clock and either lazy expiry or a min-heap of expiry times.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Operations? | `get`, `set(key, value, ttl?)`, `del`, `exists`, `ttl(key)` |
| TTL? | seconds from an injected clock; expired keys behave as absent; removed lazily and by a sweep |
| Transactions? | `begin()` may be nested; `commit()` merges the innermost into its parent (or the store); `rollback()` discards it |
| Isolation? | a transaction sees its own writes; other clients see only committed data |
| Durability? | optional WAL: committed operations are appended as text lines; recovery replays them |
| Concurrency? | readers-writer lock for plain operations; each client has its own transaction context |
| Out of scope | networking, data types beyond strings, replication |

## Step 2: how nested transactions work

```text
base store (committed):         a=1  b=2
tx1 begin   overlay1:           a=10        (set a=10)
tx2 begin   overlay2:           b=del       (delete b)           ← nested inside tx1
   get a  -> 10   (looks in overlay2, then overlay1, then base)
   get b  -> (not found)  (overlay2 says deleted)
tx2 commit  → merge overlay2 into overlay1:  overlay1 = {a=10, b=del}
tx1 rollback → drop overlay1.   base unchanged: a=1 b=2
```

Reads search the overlay stack **from the top down**, then the base. A **tombstone** marks a deletion inside an overlay.

## Step 3: entities

```viz algo=uml title="Key-value store"
class KvStore
  - base: map<string, Entry>
  - wal: WriteAheadLog
  - clock: Clock
  - lock: shared_mutex
  + set(session: Session, k: string, v: string, ttl: long): void
  + get(session: Session, k: string): optional<string>
  + del(session: Session, k: string): bool
  + begin(session: Session): void
  + commit(session: Session): bool
  + rollback(session: Session): bool
  + recover(): void
class Session
  - txStack: Overlay[]
class Overlay
  - changes: map<string, Change>
class Entry
  - value: string
  - expiresAt: long
class Change
  - kind: Set | Delete
  - value: string
  - expiresAt: long
class WriteAheadLog
  + append(op: LogRecord): void
  + replay(apply: function): void
interface Clock
KvStore *-- Entry
KvStore --> WriteAheadLog
KvStore --> Clock
Session *-- Overlay
Overlay *-- Change
KvStore ..> Session
```

## Step 4: design decisions

- **Session per client** holds a stack of `Overlay`s. Outside a transaction, operations apply directly to the base under the write lock (autocommit). Inside, they go to the top overlay and touch no shared state, so **no locking is needed for transaction-local work**.
- **Reads** consult overlays top-down (tombstones hide keys), then the base under a **shared** lock.
- **Commit of the outermost transaction** takes the **write lock once**, appends all changes to the WAL (one batch), then applies them to the base: atomic with respect to other readers/writers. Committing an inner transaction just merges into its parent overlay (cheap, no lock).
- **Isolation level**: reads see the committed state at read time plus own writes (read committed). Snapshot isolation would copy-on-write the base or use versions (MVCC): an extension.
- **TTL**: each entry has `expiresAt` (0 = none). `get` treats expired as absent (lazy deletion); a periodic `sweep()` removes expired keys. Overlays carry the TTL with the change.
- **WAL**: before applying a committed batch, append lines like `SET key value expiresAt` / `DEL key` and flush. Recovery replays the lines into an empty base. (A real system also checkpoints and truncates the log.)
- **Clock injection** for deterministic TTL tests.

## Step 5: the code

```cpp run title="Overlay transactions, TTL, WAL recovery, concurrent clients"
#include <atomic>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };
struct ManualClock : Clock { atomic<long> t{0}; long now() const override { return t; } };

struct Entry { string value; long expiresAt = 0; };           // 0 = never expires
struct Change { bool isDelete; string value; long expiresAt; };
using Overlay = map<string, Change>;

class WriteAheadLog {
    vector<string> lines_;                                     // stands in for an append-only file
public:
    void append(const string& line) { lines_.push_back(line); }
    const vector<string>& lines() const { return lines_; }
};

class Session { public: vector<Overlay> tx; bool inTransaction() const { return !tx.empty(); } };

class KvStore {
    map<string, Entry> base_;
    mutable shared_mutex m_;
    WriteAheadLog* wal_; const Clock& clock_;
    bool live(const Entry& e) const { return e.expiresAt == 0 || clock_.now() < e.expiresAt; }
    static string encode(const string& k, const Change& c) { ostringstream o; if (c.isDelete) o << "DEL " << k; else o << "SET " << k << " " << c.expiresAt << " " << c.value; return o.str(); }
    void applyLocked(const string& k, const Change& c) {
        if (c.isDelete) base_.erase(k); else base_[k] = {c.value, c.expiresAt};
    }
public:
    KvStore(WriteAheadLog* wal, const Clock& c) : wal_(wal), clock_(c) {}

    // ---- transactions ----
    void begin(Session& s) { s.tx.emplace_back(); }
    bool rollback(Session& s) { if (s.tx.empty()) return false; s.tx.pop_back(); return true; }
    bool commit(Session& s) {
        if (s.tx.empty()) return false;
        Overlay top = move(s.tx.back()); s.tx.pop_back();
        if (!s.tx.empty()) { for (auto& [k, c] : top) s.tx.back()[k] = c; return true; }      // nested: merge into the parent overlay
        unique_lock lock(m_);                                  // outermost: ONE write lock, WAL first, then apply
        if (wal_) for (auto& [k, c] : top) wal_->append(encode(k, c));
        for (auto& [k, c] : top) applyLocked(k, c);
        return true;
    }

    // ---- reads and writes ----
    void set(Session& s, const string& k, const string& v, long ttlSeconds = 0) {
        Change c{false, v, ttlSeconds > 0 ? clock_.now() + ttlSeconds : 0};
        if (s.inTransaction()) { s.tx.back()[k] = c; return; }
        unique_lock lock(m_);
        if (wal_) wal_->append(encode(k, c));
        applyLocked(k, c);
    }
    bool del(Session& s, const string& k) {
        bool existed = get(s, k).has_value();
        Change c{true, "", 0};
        if (s.inTransaction()) { s.tx.back()[k] = c; return existed; }
        unique_lock lock(m_);
        if (wal_) wal_->append(encode(k, c));
        applyLocked(k, c);
        return existed;
    }
    optional<string> get(const Session& s, const string& k) const {
        for (auto it = s.tx.rbegin(); it != s.tx.rend(); ++it) {          // innermost overlay first
            auto f = it->find(k);
            if (f == it->end()) continue;
            if (f->second.isDelete) return nullopt;                          // a tombstone hides the key
            if (f->second.expiresAt != 0 && clock_.now() >= f->second.expiresAt) return nullopt;
            return f->second.value;
        }
        shared_lock lock(m_);                                  // many readers at once
        auto it = base_.find(k);
        if (it == base_.end() || !live(it->second)) return nullopt;         // lazy expiry
        return it->second.value;
    }
    long ttl(const Session& s, const string& k) const {
        auto v = get(s, k); if (!v) return -2;                               // -2: no such key
        shared_lock lock(m_); auto it = base_.find(k);
        if (it == base_.end() || it->second.expiresAt == 0) return -1;       // -1: no expiry
        return it->second.expiresAt - clock_.now();
    }
    size_t sweep() { unique_lock lock(m_); size_t n = 0; for (auto it = base_.begin(); it != base_.end();) { if (!live(it->second)) { it = base_.erase(it); ++n; } else ++it; } return n; }
    size_t size() const { shared_lock lock(m_); return base_.size(); }

    // ---- recovery: replay the log into an empty store ----
    void recover(const WriteAheadLog& log) {
        unique_lock lock(m_);
        for (const string& line : log.lines()) {
            istringstream in(line); string op, k; in >> op >> k;
            if (op == "DEL") base_.erase(k);
            else { long exp; in >> exp; string v; getline(in >> ws, v); base_[k] = {v, exp}; }
        }
    }
};

int main() {
    ManualClock clock; WriteAheadLog wal;
    KvStore db(&wal, clock);
    Session a, b;                                              // two clients
    auto show = [](const char* what, optional<string> v) { cout << "  " << what << ": " << (v ? *v : "(none)") << "\n"; };

    cout << "autocommit and TTL:\n";
    db.set(a, "user:1", "asha"); db.set(a, "session", "xyz", 60);
    show("get user:1", db.get(b, "user:1"));
    cout << "  ttl session = " << db.ttl(b, "session") << "s, ttl user:1 = " << db.ttl(b, "user:1") << " (no expiry), ttl missing = " << db.ttl(b, "nope") << "\n";
    clock.t = 61; show("get session after 61s", db.get(b, "session"));
    cout << "  sweep removed " << db.sweep() << " expired key(s)\n";

    cout << "transaction isolation and commit:\n";
    db.begin(a);
    db.set(a, "balance", "100"); db.set(a, "user:1", "asha k");
    show("client A inside its transaction sees", db.get(a, "balance"));
    show("client B (outside) sees", db.get(b, "balance"));
    db.commit(a);
    show("after A commits, B sees", db.get(b, "balance"));

    cout << "rollback discards changes:\n";
    db.begin(a); db.set(a, "balance", "999"); db.del(a, "user:1");
    show("inside: balance", db.get(a, "balance")); show("inside: user:1", db.get(a, "user:1"));
    db.rollback(a);
    show("after rollback: balance", db.get(a, "balance")); show("after rollback: user:1", db.get(a, "user:1"));

    cout << "nested transactions:\n";
    db.begin(a); db.set(a, "x", "1");
    db.begin(a); db.set(a, "x", "2"); db.set(a, "y", "inner");
    show("innermost sees x", db.get(a, "x"));
    db.rollback(a);                                            // only the inner transaction is discarded
    show("after inner rollback x", db.get(a, "x")); show("after inner rollback y", db.get(a, "y"));
    db.begin(a); db.set(a, "z", "kept"); db.commit(a);          // inner commit merges into the outer overlay, not the store
    show("B still sees z?", db.get(b, "z"));
    db.commit(a);
    show("after the outer commit B sees x", db.get(b, "x")); show("... and z", db.get(b, "z"));

    cout << "recovery from the write-ahead log:\n";
    cout << "  log has " << wal.lines().size() << " records, e.g. \"" << wal.lines().back() << "\"\n";
    KvStore recovered(nullptr, clock); recovered.recover(wal);
    Session r;
    show("recovered balance", recovered.get(r, "balance")); show("recovered x", recovered.get(r, "x")); show("recovered user:1", recovered.get(r, "user:1"));

    cout << "concurrency: 4 clients each commit 250 increments to different keys, atomically\n";
    KvStore shared(nullptr, clock); vector<thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { Session s; for (int i = 0; i < 250; ++i) { shared.begin(s); shared.set(s, "client" + to_string(t) + ":" + to_string(i), "v"); shared.set(s, "count" + to_string(t), to_string(i + 1)); shared.commit(s); } });
    for (auto& th : ts) th.join();
    Session v; cout << "  keys stored: " << shared.size() << " (4 x 250 + 4 counters = 1004); client2's counter: " << *shared.get(v, "count2") << "\n";
}
```

## Design trade-offs to state

| Choice | Pros | Cons |
|---|---|---|
| **Overlay stack** (this design) | cheap begin/rollback (just drop a map), no lock while working | reads search several maps; large transactions use memory |
| **Undo log** (apply to base immediately, record inverse) | reads are single lookups | others would see uncommitted data unless the base is locked for the whole transaction |
| **MVCC (versions per key)** | readers never block writers; snapshot isolation | garbage collection of old versions, complexity |
| Lazy TTL only | O(1) | expired keys occupy memory until touched: add sweep |
| TTL min-heap | exact, timely eviction | extra structure to maintain on every set |
| WAL | durable and recoverable | write amplification; needs checkpoints to bound recovery time |

## Edge cases

| Case | Handling |
|---|---|
| `commit` or `rollback` with no transaction | returns false |
| Deleting a key that exists only in the base | writes a tombstone to the overlay; applied at commit |
| TTL changes inside a transaction | the change carries the absolute expiry time |
| Overwriting a key with a shorter TTL | the new entry replaces the old |
| Two committers touching the same key | the write lock serialises commits; last writer wins (no conflict detection). Optimistic checks or key locks give serialisability |
| Crash between WAL append and apply | recovery replays the log; the apply is idempotent |
| WAL growth | periodic checkpoint: write a snapshot of the map, truncate the log |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Snapshot isolation / repeatable reads" | MVCC: each commit gets a version; a transaction reads as of its start version |
| "Conflict detection (optimistic concurrency)" | record read versions; at commit fail if any key changed (like Redis WATCH) |
| "More data types (lists, sets, hashes)" | `Value` as a variant; commands per type behind a `Command` registry |
| "Pub/sub on key changes" | events after commit (Observer) |
| "Persistence formats" | binary snapshots + WAL; fsync policy (always / every second / never) |
| "Replication" | ship the WAL to followers (leader/follower); HLD |
| "Memory limit and eviction" | LRU/LFU eviction policy (see the cache lesson) |
| "Range queries and ordered keys" | `std::map` plus lower_bound scans; secondary indexes |
| "Expiry accuracy at scale" | a hierarchical timer wheel or heap with batch removal |

```quiz
? Why does the outermost commit take the write lock only once?
- Locks are expensive to create
+ The whole transaction's changes must appear to other clients atomically
- Because maps need it
> A single critical section applies the whole batch (after logging it).
? What does a tombstone in an overlay do?
- Marks a key as expiring
+ Hides a key that exists in a lower layer, representing a deletion made inside the transaction
- Stores a value
> Without it, reads would fall through to the base and find the deleted key.
```

:::keypoints
- Overlay stack per session: reads go top-down then to the base; inner commit merges up; outer commit logs to the WAL and applies under one write lock.
- TTL by lazy expiry plus a sweep; injectable clock. Recovery by replaying the WAL (idempotent applies).
- Concurrency with a readers-writer lock; MVCC or optimistic checks for stronger isolation; checkpoints bound log size.
:::
