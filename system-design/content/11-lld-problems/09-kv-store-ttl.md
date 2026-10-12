---
title: Design an In-Memory Key-Value Store (TTL + Transactions)
level: advanced
time: 60
summary: A popular machine-coding round — a Redis-like store with SET/GET/DEL, per-key expiry (lazy checks plus an active sweep driven by a min-heap), and nested transactions with BEGIN/COMMIT/ROLLBACK implemented as a stack of overlay layers, driven by a small command interpreter, in C++ and JavaScript.
---

:::problem Design an In-Memory Key-Value Store {level=hard tags="LLD,Command,transactions,TTL"}
Build an in-memory key-value store that supports `SET key value [EX seconds]`, `GET`, `DEL`, keys that expire, and **nested transactions**: `BEGIN` starts a transaction, `ROLLBACK` discards the innermost one, `COMMIT` applies it to the level below. Process commands from a script and print results.

:::hint Hint
Model each open transaction as an overlay map on top of the store: writes go to the top overlay; reads look through the overlays from top to bottom, then the base. A deletion inside a transaction must be recorded as a "tombstone". For expiry, check the deadline on read (lazy) and keep a min-heap of deadlines for a periodic sweep.
:::
:::

## Requirements

| Command | Meaning |
|---|---|
| `SET k v [EX s]` | set k to v, optionally expiring after s seconds |
| `GET k` | value or `(nil)`; expired keys behave as missing |
| `DEL k` | delete; returns 1 if a key was removed |
| `TTL k` | seconds left, −1 if no expiry, −2 if missing |
| `BEGIN` / `COMMIT` / `ROLLBACK` | nested transactions |
| `TICK s` | (test helper) advance the clock by s seconds |

Assumptions: single-threaded command processing (like Redis); time is injectable for tests; transactions are local to one client session.

## Design

```viz algo=uml title="Key-value store design"
class Interpreter
  + run(line): string
interface Command
  + execute(store): string
class SetCommand
class GetCommand
class DelCommand
class TxCommand
class KVStore
  - base: map<string, Entry>
  - layers: Overlay[]
  - expiryHeap: minheap<time, key>
  - clock: Clock
  + set(k, v, ttl)
  + get(k): optional
  + del(k): bool
  + begin() / commit() / rollback()
  + sweepExpired()
class Entry
  - value: string
  - expiresAt: time
Interpreter ..> Command : parses into
SetCommand ..|> Command
GetCommand ..|> Command
DelCommand ..|> Command
TxCommand ..|> Command
Command --> KVStore
KVStore *-- Entry
```

### Expiry: lazy + active

- **Lazy**: every read checks `expiresAt`; an expired key is treated as missing and deleted. Correct, but a key that's never read again would stay in memory forever.
- **Active**: a **min-heap** of `(expiresAt, key)`; a periodic `sweepExpired()` pops everything already due. Heap entries can be stale (the key was overwritten or deleted), so the sweep verifies against the current entry before deleting. Redis combines both (it samples random keys with TTLs instead of a heap).

### Nested transactions: a stack of overlays

```text
base:      { a: "1", b: "2" }
BEGIN  →   layer 1: { }
SET a 5 →  layer 1: { a: "5" }
BEGIN  →   layer 2: { }
DEL b  →   layer 2: { b: ⊗ (tombstone) }
GET b  →   (nil)       — layer 2 says deleted
ROLLBACK → layer 2 discarded; GET b → "2"
COMMIT  →  layer 1 merged into base: { a: "5", b: "2" }
```

Reads walk the layers **top-down** and stop at the first layer that mentions the key (a value or a tombstone), then fall back to the base. `COMMIT` merges the top layer into the one below it (or the base). `ROLLBACK` just pops it: O(1). An alternative is an **undo log** per transaction (record the previous value of each key you overwrite and replay it backwards on rollback); overlays make reads slightly slower but rollback trivial.

## Implementation

:::tabs KV store with TTL and nested transactions
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Entry { string value; long expiresAt = 0; };          // 0 = never expires
using Layer = map<string, optional<Entry>>;                  // nullopt = tombstone (deleted in this transaction)

class KVStore {
    unordered_map<string, Entry> base_;
    vector<Layer> layers_;                                     // open transactions, innermost last
    priority_queue<pair<long, string>, vector<pair<long, string>>, greater<>> expiry_;   // min-heap by deadline
    function<long()> now_;

    bool expired(const Entry& e) const { return e.expiresAt && e.expiresAt <= now_(); }
    optional<Entry> lookup(const string& k) const {           // top layer first, then the base
        for (auto it = layers_.rbegin(); it != layers_.rend(); ++it)
            if (auto f = it->find(k); f != it->end()) return f->second;
        if (auto f = base_.find(k); f != base_.end()) return f->second;
        return nullopt;
    }
    void write(const string& k, optional<Entry> e) {
        if (!layers_.empty()) { layers_.back()[k] = std::move(e); return; }
        if (e) base_[k] = *e; else base_.erase(k);
    }
public:
    explicit KVStore(function<long()> clock) : now_(std::move(clock)) {}

    void set(const string& k, string v, long ttl = 0) {
        Entry e{std::move(v), ttl ? now_() + ttl : 0};
        if (e.expiresAt) expiry_.push({e.expiresAt, k});
        write(k, e);
    }
    optional<string> get(const string& k) {
        auto e = lookup(k);
        if (!e) return nullopt;
        if (expired(*e)) { if (layers_.empty()) base_.erase(k); return nullopt; }   // lazy expiry
        return e->value;
    }
    bool del(const string& k) { bool had = get(k).has_value(); if (had) write(k, nullopt); return had; }
    long ttl(const string& k) {
        auto e = lookup(k);
        if (!e || expired(*e)) return -2;
        return e->expiresAt ? e->expiresAt - now_() : -1;
    }
    void begin() { layers_.emplace_back(); }
    bool rollback() { if (layers_.empty()) return false; layers_.pop_back(); return true; }
    bool commit() {
        if (layers_.empty()) return false;
        Layer top = std::move(layers_.back());
        layers_.pop_back();
        for (auto& [k, e] : top) write(k, e);                  // merge into the layer below (or the base)
        return true;
    }
    int sweepExpired() {                                       // active expiry, e.g. every 100 ms
        int removed = 0;
        while (!expiry_.empty() && expiry_.top().first <= now_()) {
            auto [when, k] = expiry_.top(); expiry_.pop();
            auto it = base_.find(k);
            if (it != base_.end() && it->second.expiresAt == when) { base_.erase(it); removed++; }   // skip stale heap entries
        }
        return removed;
    }
    size_t baseSize() const { return base_.size(); }
};

class Interpreter {                                            // parses lines into operations (Command pattern, inlined)
    KVStore& s_; long& clock_;
public:
    Interpreter(KVStore& s, long& clock) : s_(s), clock_(clock) {}
    string run(const string& line) {
        istringstream in(line);
        string cmd, k, v, ex; long secs = 0;
        in >> cmd >> k;
        if (cmd == "SET") { in >> v >> ex >> secs; s_.set(k, v, ex == "EX" ? secs : 0); return "OK"; }
        if (cmd == "GET") { auto r = s_.get(k); return r ? "\"" + *r + "\"" : "(nil)"; }
        if (cmd == "DEL") return s_.del(k) ? "(integer) 1" : "(integer) 0";
        if (cmd == "TTL") return "(integer) " + to_string(s_.ttl(k));
        if (cmd == "BEGIN") { s_.begin(); return "OK"; }
        if (cmd == "COMMIT") return s_.commit() ? "OK" : "(error) no transaction";
        if (cmd == "ROLLBACK") return s_.rollback() ? "OK" : "(error) no transaction";
        if (cmd == "TICK") { clock_ += stol(k); return "(clock +" + k + "s)"; }
        if (cmd == "SWEEP") return "(swept " + to_string(s_.sweepExpired()) + " keys)";
        return "(error) unknown command";
    }
};

int main() {
    long clock = 0;
    KVStore store([&] { return clock; });
    Interpreter repl(store, clock);
    const char* script[] = {
        "SET a 1", "SET b 2", "BEGIN", "SET a 5", "BEGIN", "DEL b", "GET b", "ROLLBACK", "GET b", "COMMIT", "GET a",
        "ROLLBACK",
        "SET session xyz EX 10", "TTL session", "TICK 4", "TTL session", "TICK 7", "GET session",
        "SET temp1 v EX 2", "SET temp2 v EX 3", "SET keep v", "TICK 5", "SWEEP", "GET keep",
    };
    for (auto line : script) cout << left << setw(24) << line << " -> " << repl.run(line) << "\n";
    cout << "keys left in the base map: " << store.baseSize() << "\n";
}
```
```js run
class KVStore {
  #base = new Map();                         // key → { value, expiresAt }   (expiresAt 0 = never)
  #layers = [];                              // open transactions: Map(key → entry | null), null = tombstone
  #heap = [];                                // min-heap of [expiresAt, key]
  constructor(clock) { this.now = clock; }

  #expired(e) { return e.expiresAt && e.expiresAt <= this.now(); }
  #lookup(k) {                               // top layer first, then the base
    for (let i = this.#layers.length - 1; i >= 0; i--) if (this.#layers[i].has(k)) return this.#layers[i].get(k);
    return this.#base.get(k) ?? null;
  }
  #write(k, e) {
    if (this.#layers.length) return void this.#layers.at(-1).set(k, e);
    if (e) this.#base.set(k, e); else this.#base.delete(k);
  }
  #heapPush(item) {
    const h = this.#heap; h.push(item);
    for (let i = h.length - 1; i > 0; ) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  }
  #heapPop() {
    const h = this.#heap, top = h[0], last = h.pop();
    if (h.length) { h[0] = last; for (let i = 0; ; ) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
    return top;
  }

  set(k, value, ttl = 0) {
    const e = { value, expiresAt: ttl ? this.now() + ttl : 0 };
    if (e.expiresAt) this.#heapPush([e.expiresAt, k]);
    this.#write(k, e);
  }
  get(k) {
    const e = this.#lookup(k);
    if (!e) return null;
    if (this.#expired(e)) { if (!this.#layers.length) this.#base.delete(k); return null; }   // lazy expiry
    return e.value;
  }
  del(k) { const had = this.get(k) !== null; if (had) this.#write(k, null); return had; }
  ttl(k) { const e = this.#lookup(k); if (!e || this.#expired(e)) return -2; return e.expiresAt ? e.expiresAt - this.now() : -1; }
  begin() { this.#layers.push(new Map()); }
  rollback() { return this.#layers.pop() !== undefined; }
  commit() {
    const top = this.#layers.pop();
    if (!top) return false;
    for (const [k, e] of top) this.#write(k, e);      // merge into the layer below (or the base)
    return true;
  }
  sweepExpired() {                                     // active expiry
    let removed = 0;
    while (this.#heap.length && this.#heap[0][0] <= this.now()) {
      const [when, k] = this.#heapPop();
      if (this.#base.get(k)?.expiresAt === when) { this.#base.delete(k); removed++; }   // skip stale heap entries
    }
    return removed;
  }
  get baseSize() { return this.#base.size; }
}

let clock = 0;
const store = new KVStore(() => clock);
function run(line) {                                   // a tiny interpreter: each line becomes a command
  const [cmd, k, v, ex, secs] = line.split(" ");
  switch (cmd) {
    case "SET": store.set(k, v, ex === "EX" ? Number(secs) : 0); return "OK";
    case "GET": { const r = store.get(k); return r === null ? "(nil)" : `"${r}"`; }
    case "DEL": return `(integer) ${store.del(k) ? 1 : 0}`;
    case "TTL": return `(integer) ${store.ttl(k)}`;
    case "BEGIN": store.begin(); return "OK";
    case "COMMIT": return store.commit() ? "OK" : "(error) no transaction";
    case "ROLLBACK": return store.rollback() ? "OK" : "(error) no transaction";
    case "TICK": clock += Number(k); return `(clock +${k}s)`;
    case "SWEEP": return `(swept ${store.sweepExpired()} keys)`;
    default: return "(error) unknown command";
  }
}

const script = [
  "SET a 1", "SET b 2", "BEGIN", "SET a 5", "BEGIN", "DEL b", "GET b", "ROLLBACK", "GET b", "COMMIT", "GET a",
  "ROLLBACK",
  "SET session xyz EX 10", "TTL session", "TICK 4", "TTL session", "TICK 7", "GET session",
  "SET temp1 v EX 2", "SET temp2 v EX 3", "SET keep v", "TICK 5", "SWEEP", "GET keep",
];
for (const line of script) console.log(`${line.padEnd(24)} -> ${run(line)}`);
console.log("keys left in the base map:", store.baseSize);
```
:::

## Design discussion

- **Command interpreter**: each line becomes an operation object (here a switch for brevity; with more commands, a `Command` class per verb in a registry: the Command + Factory patterns). That also gives a natural place for an **append-only file**: write every mutating command to a log, and replay it on startup for durability (Redis AOF).
- **Tombstones** are essential in overlays: without them, a delete inside a transaction couldn't hide the base value.
- **Expiry inside transactions**: here a key's expiry is evaluated at read time against the current clock, also inside transactions. Real systems define this precisely (Redis `MULTI/EXEC` isn't a rollback-capable transaction at all: it queues commands and runs them atomically).
- **Concurrency**: a single thread processing commands sequentially (an event loop, as Redis does) makes every command atomic without locks. For multi-threaded access, either a global lock, sharding the keyspace (a lock per shard), or one thread per shard. Transactions across shards then need the distributed techniques from earlier modules.
- **Memory limits**: combine with the LRU lesson (evict when `maxmemory` is reached).

| Extension | How |
|---|---|
| Persistence | append-only command log + periodic snapshots; replay on start |
| `INCR`, lists, sets, sorted sets | new value types and commands |
| Pub/sub | the next problem in this module |
| Optimistic transactions (`WATCH`) | record key versions at `WATCH`; abort `EXEC` if any changed |
| Replication | stream the command log to replicas |

```quiz
? Inside a transaction, `DEL b` is executed. Why must the top layer store a tombstone instead of simply removing b from the layer?
+ The base (or a lower layer) still has b; only a tombstone can hide it from reads until the transaction commits or rolls back
- Removing keys from maps is slow
- Tombstones make the key expire faster
> Overlays need an explicit "deleted here" marker to shadow lower values.

? Why combine lazy expiry with an active sweep?
+ Lazy checks keep reads correct, but keys that are never read again would stay in memory; the sweep reclaims them
- Lazy expiry alone returns expired values
- Active sweeps make reads faster
> Correctness comes from the lazy check; memory reclamation from the sweep.

? What does ROLLBACK cost with the overlay design?
+ O(1): pop the top layer
- O(number of keys in the store)
- O(number of committed transactions)
> Changes live only in the overlay until commit, so discarding is trivial.
```

:::keypoints
- SET/GET/DEL/TTL over a hash map; values carry an optional `expiresAt`.
- **Expiry**: lazy check on every read + an **active sweep** from a min-heap of deadlines (ignoring stale entries).
- **Nested transactions** as a **stack of overlay maps** with **tombstones**; reads go top-down; COMMIT merges down; ROLLBACK pops.
- A small **command interpreter** (Command pattern) drives it and is the hook for an append-only log.
- Single-threaded command processing makes commands atomic; scale with sharding.
:::
