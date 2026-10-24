---
title: Design an In-Memory Key-Value Store with TTL and Transactions
level: advanced
time: 75
summary: A small Redis-like store. Learn keys that expire (TTL), transactions that can be nested and rolled back, a log file for recovery after a crash, safe use from many threads, and how it compares with real databases.
---

:::problem Design an In-Memory Key-Value Store (Redis-like) {level=hard tags="storage,transactions,TTL,undo log,WAL,concurrency,Command"}
Design an in-memory key-value store. It supports `get`, `set`, `delete`, keys with a time to live (TTL), and **nested transactions** (`begin`, `commit`, `rollback`). Changes made inside a transaction are not visible to others until commit, and can be rolled back. Optionally, it keeps a write-ahead log (a log of changes written first) that can rebuild the store after a crash. It must be safe for many clients at the same time.
:::

:::hint Hint
Make a transaction an **overlay** (a layer of pending changes on top of the main map). Or use an **undo log** that records the opposite of each change. Nested transactions are a **stack** of overlays. For durability, write every committed change to a log first, and replay the log at start-up. TTL needs a clock, and either lazy expiry or a min-heap of expiry times.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Actions? | `get`, `set(key, value, ttl?)`, `del`, `exists`, `ttl(key)` |
| TTL? | seconds from a clock that we pass in. Expired keys act as if they are not there. They are removed when touched and by a sweep |
| Transactions? | `begin()` can be nested. `commit()` joins the innermost one into its parent (or into the store). `rollback()` throws it away |
| Isolation? | a transaction sees its own writes. Other clients see only committed data |
| Durability? | optional WAL: committed actions are added as lines of text. Recovery replays them |
| Many threads? | a reader-writer lock for plain actions. Each client has its own transaction state |
| Not needed | networking, data types other than strings, copies on other machines |

## Step 2: How nested transactions work

```text
base store (committed):         a=1  b=2
tx1 begin   overlay1:           a=10        (set a=10)
tx2 begin   overlay2:           b=del       (delete b)           ← nested inside tx1
   get a  -> 10   (looks in overlay2, then overlay1, then base)
   get b  -> (not found)  (overlay2 says deleted)
tx2 commit  → merge overlay2 into overlay1:  overlay1 = {a=10, b=del}
tx1 rollback → drop overlay1.   base unchanged: a=1 b=2
```

Reads look through the stack of overlays **from the top to the bottom**, and then in the main map. A **tombstone** (a marker that says "deleted") hides a key that was removed inside an overlay.

## Step 3: Find the classes

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

## Step 4: Design decisions

- **A session for each client** holds a stack of `Overlay`s. Outside a transaction, actions apply directly to the main map under the write lock (autocommit). Inside one, they go to the top overlay and touch nothing shared, so **work inside a transaction needs no locking**.
- **Reads** look at the overlays from the top, where tombstones hide keys, then at the main map under a **shared** lock.
- **Committing the outermost transaction** takes the **write lock once**, adds all the changes to the WAL (as one batch), then applies them to the main map. To other readers and writers it is one atomic step. Committing an inner transaction just joins it into its parent overlay (cheap, no lock).
- **Isolation level:** reads see the committed state at the time of the read, plus the transaction's own writes ("read committed"). Snapshot isolation would need copy-on-write or versions (MVCC). That is an extension.
- **TTL:** each entry has `expiresAt` (0 means never). `get` treats an expired key as missing (lazy deletion). A regular `sweep()` removes expired keys. Overlays carry the TTL with the change.
- **WAL:** before applying a committed batch, add lines like `SET key value expiresAt` or `DEL key` and flush. Recovery replays the lines into an empty map. (A real system also takes checkpoints and cuts the log.)
- **A clock passed in** for predictable TTL tests.

## Step 5: The code

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

## Trade-offs to say out loud

| Choice | Good | Not so good |
|---|---|---|
| **Overlay stack** (this design) | begin and rollback are cheap (just drop a map). No lock while working | reads look in several maps. Big transactions use memory |
| **Undo log** (apply to the main map at once, record the opposite) | reads are one lookup | others would see uncommitted data, unless the map is locked for the whole transaction |
| **MVCC (versions for each key)** | readers never block writers. Snapshot isolation | cleaning up old versions, and more complexity |
| Lazy TTL only | O(1) | expired keys use memory until touched. Add a sweep |
| A min-heap for TTL | exact, on-time removal | one more structure to keep updated on every set |
| WAL | safe and recoverable | extra writes. Needs checkpoints to keep recovery time short |

## Edge cases

| Case | What happens |
|---|---|
| `commit` or `rollback` without a transaction | returns false |
| Deleting a key that is only in the main map | a tombstone is written in the overlay, and applied at commit |
| TTL changes inside a transaction | the change carries the exact expiry time |
| Overwriting a key with a shorter TTL | the new entry replaces the old one |
| Two commits touching the same key | the write lock puts them in a line. The last writer wins (no conflict check). Optimistic checks or key locks give full safety |
| A crash between the WAL write and the apply | recovery replays the log. Applying twice is safe (idempotent) |
| The WAL keeps growing | checkpoint now and then: write a snapshot of the map and cut the log |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Snapshot isolation, repeatable reads" | MVCC: each commit gets a version. A transaction reads as of its start version |
| "Conflict detection (optimistic)" | record the versions that were read. At commit, fail if any key changed (like Redis WATCH) |
| "More data types (lists, sets, hashes)" | `Value` as a variant. Commands for each type in a `Command` registry |
| "Messages when keys change" | events after commit (Observer) |
| "File formats" | binary snapshots plus WAL. An fsync policy (always, every second, never) |
| "Copies on other machines" | send the WAL to followers (leader and follower), HLD |
| "A memory limit and removing keys" | an LRU or LFU policy (see the cache lesson) |
| "Range queries and ordered keys" | `std::map` with `lower_bound` scans, and extra indexes |
| "Exact expiry at a big scale" | a hierarchical timer wheel, or a heap that removes in batches |

## Short answer to say in an interview

:::interview How do you implement nested transactions in a key-value store?
"Each client session has a stack of overlays, which are maps of pending changes, and a deletion is a tombstone. A read checks the overlays from the top, then the main map. Rollback just drops the top overlay. Committing an inner transaction merges it into its parent. Committing the outermost one takes the write lock once, writes all the changes to the write-ahead log, and applies them to the main map, so other clients see them all at once. TTL uses lazy expiry plus a sweep, with a clock passed in."
:::

```quiz
? Why does the outermost commit take the write lock only once?
- Locks are costly to create
+ All the transaction's changes must show up to other clients as one atomic step
- Maps need it
> One locked step applies the whole batch (after logging it).
? What does a tombstone in an overlay do?
- Marks a key as expiring
+ It hides a key that exists in a lower layer, showing a deletion made inside the transaction
- Stores a value
> Without it, a read would fall through to the main map and find the deleted key.
```

:::keypoints
- A stack of overlays for each session. Reads go from the top down to the main map. An inner commit merges up. The outer commit writes the WAL and applies under one write lock.
- TTL with lazy expiry plus a sweep, and a clock passed in. Recovery replays the WAL (applying twice is safe).
- A reader-writer lock for threads. MVCC or optimistic checks for stronger isolation. Checkpoints keep the log small.
:::
