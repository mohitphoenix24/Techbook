---
title: Build a Mini Redis
level: intermediate
time: 60
icon: database
cover: #dc2626,#f59e0b
tags: key-value store, TTL, data structures, AOF persistence, LRU eviction, pub/sub
summary: Build the in-memory data store behind half the designs in this course — a command parser and keyspace, strings, lists, hashes and sorted sets with type checking, lazy and active expiry, an append-only file you can replay, MULTI/EXEC transactions, pub/sub, and approximate-LRU eviction under a memory limit.
---

Redis appears in almost every design in this course: caches, rate limiters, sessions, leaderboards, queues, locks, pub/sub. Building a small one is the best way to understand **why** it's fast, what its commands guarantee, and where its sharp edges are (expiry, persistence, memory limits).

:::flow What you'll build
Parser + keyspace | commands like SET k v EX 10, one map of keys
Expiry | lazy on access + an active sampling cycle
Data types | strings (INCR), lists, hashes, sorted sets; WRONGTYPE errors
Persistence | an append-only file (AOF) replayed on restart
Transactions + pub/sub | MULTI/EXEC, PUBLISH/SUBSCRIBE
Eviction | a key limit with sampled LRU, like maxmemory
:::

## Step 1: a keyspace with expiry

Redis is a single-threaded loop that executes one command at a time against a hash map. Each key can have an **expiry time**. The simplest correct approach is **lazy expiry**: when a key is accessed, check whether it has expired and delete it if so.

```js run title="Commands, a keyspace and lazy expiry"
// Step 1: the heart of Redis — a command parser, a keyspace, and expiry
const clock = { now: 0 };                                  // a fake clock so the demo is repeatable
const store = new Map();                                   // key → { value, expiresAt }

function parse(line) {                                     // SET "hello world" 1 → ["SET", "hello world", "1"]
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}
function alive(key) {                                      // lazy expiry: check on every access
  const e = store.get(key);
  if (e && e.expiresAt !== null && e.expiresAt <= clock.now) { store.delete(key); return undefined; }
  return e;
}
function exec(line) {
  const [cmd, ...args] = parse(line);
  switch (cmd.toUpperCase()) {
    case "SET": {
      const [k, v, opt, n] = args;
      store.set(k, { value: v, expiresAt: opt?.toUpperCase() === "EX" ? clock.now + n * 1000 : null });
      return "OK";
    }
    case "GET": return alive(args[0])?.value ?? null;
    case "DEL": return args.filter((k) => alive(k) && store.delete(k)).length;
    case "EXPIRE": { const e = alive(args[0]); if (!e) return 0; e.expiresAt = clock.now + args[1] * 1000; return 1; }
    case "TTL": { const e = alive(args[0]); return !e ? -2 : e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - clock.now) / 1000); }
    default: return `ERR unknown command '${cmd}'`;
  }
}

for (const line of ['SET greeting "hello world"', "GET greeting", "SET session:42 alice EX 10", "TTL session:42", "TTL greeting", "FLY away"])
  console.log(`> ${line.padEnd(28)} ${JSON.stringify(exec(line))}`);
clock.now += 11_000;                                       // 11 seconds later…
for (const line of ["GET session:42", "TTL session:42", "DEL greeting session:42"])
  console.log(`> ${line.padEnd(28)} ${JSON.stringify(exec(line))}`);
```

`TTL` returns `-1` for a key without expiry and `-2` for a missing key, exactly as Redis does.

## Step 2: the complete MiniRedis

Lazy expiry alone leaks memory: keys that are never read again never get deleted. Redis adds an **active expiry cycle** that samples keys with a TTL and keeps going while more than 25% of the sample was expired. Sorted sets keep members ordered by score (Redis uses a skip list; a sorted array with binary search is enough here). The **AOF** logs every successful write; replaying it rebuilds the dataset. Expiries must be logged as **absolute** times, or a replay would bring old keys back to life.

```js run title="MiniRedis: types, expiry, AOF, transactions, pub/sub, eviction"
// Step 2: MiniRedis — types, expiry (lazy + active), AOF persistence, transactions, pub/sub, LRU eviction
let seed = 1;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const parse = (line) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
const WRITE = new Set(["SET", "DEL", "EXPIRE", "PEXPIREAT", "INCR", "LPUSH", "RPUSH", "LPOP", "HSET", "ZADD"]);

class MiniRedis {
  constructor({ maxKeys = Infinity } = {}) {
    this.db = new Map();                 // key → { type, value, expiresAt, lastUsed }
    this.now = 0;                        // fake clock (ms)
    this.aof = [];                       // append-only file: every write command, in order
    this.subs = new Map();               // channel → [callback]
    this.tx = null;                      // queued commands inside MULTI
    this.maxKeys = maxKeys;
    this.stats = { expiredActive: 0, evicted: 0 };
  }
  entry(key, type) {
    const e = this.db.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this.now) { this.db.delete(key); return undefined; }   // lazy expiry
    if (type && e.type !== type) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    e.lastUsed = this.now;
    return e;
  }
  create(key, type, value) {
    if (!this.db.has(key) && this.db.size >= this.maxKeys) this.evict();
    const e = { type, value, expiresAt: null, lastUsed: this.now };
    this.db.set(key, e);
    return e;
  }
  evict() {                              // approximate LRU like Redis: sample 5 keys, evict the least recently used
    const keys = [...this.db.keys()];
    let victim = null;
    for (let i = 0; i < 5; i++) {
      const k = keys[Math.floor(rand() * keys.length)];
      if (!victim || this.db.get(k).lastUsed < this.db.get(victim).lastUsed) victim = k;
    }
    this.db.delete(victim); this.stats.evicted++;
  }
  activeExpire() {                       // Redis's background cycle: sample keys with a TTL, repeat while >25% were expired
    for (;;) {
      const withTtl = [...this.db].filter(([, e]) => e.expiresAt !== null);
      if (!withTtl.length) return;
      let expired = 0;
      const sample = Array.from({ length: Math.min(20, withTtl.length) }, () => withTtl[Math.floor(rand() * withTtl.length)]);
      for (const [k, e] of sample) if (this.db.has(k) && e.expiresAt <= this.now) { this.db.delete(k); expired++; this.stats.expiredActive++; }
      if (expired <= sample.length / 4) return;
    }
  }
  exec(line, { replaying = false } = {}) {
    const [raw, ...a] = parse(line), cmd = raw.toUpperCase();
    if (this.tx && !["EXEC", "DISCARD"].includes(cmd)) { this.tx.push(line); return "QUEUED"; }
    try {
      this.logAs = line;
      const out = this.run(cmd, a);
      if (WRITE.has(cmd) && !replaying) this.aof.push(this.logAs);  // log only successful writes
      return out;
    } catch (err) { return err.message.startsWith("WRONGTYPE") ? err.message : `ERR ${err.message}`; }
  }
  run(cmd, a) {
    switch (cmd) {
      case "SET": {
        const e = this.create(a[0], "string", a[1]), opt = a[2]?.toUpperCase();
        if (opt === "PX" || opt === "PXAT") {
          e.expiresAt = opt === "PX" ? this.now + +a[3] : +a[3];
          this.logAs = `SET ${a[0]} "${a[1]}" PXAT ${e.expiresAt}`;   // log ABSOLUTE expiry, or a replay would revive old keys
        }
        return "OK";
      }
      case "GET": return this.entry(a[0], "string")?.value ?? null;
      case "INCR": { const e = this.entry(a[0], "string") || this.create(a[0], "string", "0");
        if (!/^-?\d+$/.test(e.value)) throw new Error("value is not an integer"); e.value = String(+e.value + 1); return +e.value; }
      case "DEL": return a.filter((k) => this.entry(k) && this.db.delete(k)).length;
      case "EXPIRE": { const e = this.entry(a[0]); if (!e) return 0; e.expiresAt = this.now + a[1] * 1000;
        this.logAs = `PEXPIREAT ${a[0]} ${e.expiresAt}`; return 1; }
      case "PEXPIREAT": { const e = this.entry(a[0]); if (!e) return 0; e.expiresAt = +a[1]; return 1; }
      case "LPUSH": case "RPUSH": { const e = this.entry(a[0], "list") || this.create(a[0], "list", []);
        for (const v of a.slice(1)) cmd === "LPUSH" ? e.value.unshift(v) : e.value.push(v); return e.value.length; }
      case "LPOP": return this.entry(a[0], "list")?.value.shift() ?? null;
      case "LRANGE": { const l = this.entry(a[0], "list")?.value || []; const end = +a[2] < 0 ? l.length + +a[2] : +a[2]; return l.slice(+a[1], end + 1); }
      case "HSET": { const e = this.entry(a[0], "hash") || this.create(a[0], "hash", new Map());
        let added = 0; for (let i = 1; i < a.length; i += 2) { if (!e.value.has(a[i])) added++; e.value.set(a[i], a[i + 1]); } return added; }
      case "HGET": return this.entry(a[0], "hash")?.value.get(a[1]) ?? null;
      case "HGETALL": return Object.fromEntries(this.entry(a[0], "hash")?.value || []);
      case "ZADD": { const e = this.entry(a[0], "zset") || this.create(a[0], "zset", []);   // sorted array of [score, member]
        const z = e.value.filter(([, m]) => m !== a[2]), isNew = z.length === e.value.length;
        let lo = 0, hi = z.length; const s = +a[1];                                            // binary search insert
        while (lo < hi) { const mid = (lo + hi) >> 1; if (z[mid][0] < s || (z[mid][0] === s && z[mid][1] < a[2])) lo = mid + 1; else hi = mid; }
        z.splice(lo, 0, [s, a[2]]); e.value = z; return isNew ? 1 : 0; }   // 0 = score updated
      case "ZREVRANGE": { const z = [...(this.entry(a[0], "zset")?.value || [])].reverse(); return z.slice(+a[1], +a[2] + 1).map(([s, m]) => `${m}:${s}`); }
      case "ZREVRANK": { const z = this.entry(a[0], "zset")?.value || []; const i = z.findIndex(([, m]) => m === a[1]); return i < 0 ? null : z.length - 1 - i; }
      case "MULTI": this.tx = []; return "OK";
      case "EXEC": { const q = this.tx; this.tx = null; return q.map((l) => this.exec(l)); }   // all at once, nothing interleaves
      case "SUBSCRIBE": { const ch = a[0]; (this.subs.get(ch) || this.subs.set(ch, []).get(ch)).push(this.onMessage); return `subscribed ${ch}`; }
      case "PUBLISH": { const cbs = this.subs.get(a[0]) || []; cbs.forEach((cb) => cb(a[0], a[1])); return cbs.length; }
      case "DBSIZE": return this.db.size;
      default: throw new Error(`unknown command '${cmd}'`);
    }
  }
}

const r = new MiniRedis();
const show = (line) => console.log(`> ${line.padEnd(36)} ${JSON.stringify(r.exec(line))}`);
console.log("— data types");
["SET visits 41", "INCR visits", "RPUSH queue job1 job2 job3", "LPOP queue", "LRANGE queue 0 -1",
 "HSET user:1 name Ana plan pro", "HGETALL user:1", "GET user:1",
 "ZADD board 300 ana", "ZADD board 450 bo", "ZADD board 120 cy", "ZADD board 500 ana", "ZREVRANGE board 0 1", "ZREVRANK board cy"].forEach(show);

console.log("— transactions and pub/sub");
const inbox = [];
r.onMessage = (ch, msg) => inbox.push(`${ch}: ${msg}`);
["MULTI", "INCR visits", "INCR visits", "EXEC", "SUBSCRIBE news", 'PUBLISH news "cache invalidated"'].forEach(show);
console.log("  subscriber received:", inbox);

console.log("— active expiry: 1,000 session keys with a 5 s TTL, never read again");
for (let i = 0; i < 1000; i++) r.exec(`SET sess:${i} x PX 5000`);
r.now += 6000;
console.log(`  before the cycle: ${r.exec("DBSIZE")} keys; after: ${(r.activeExpire(), r.exec("DBSIZE"))} keys (${r.stats.expiredActive} removed by sampling)`);

console.log("— AOF: replay the write log into a fresh instance");
const restored = new MiniRedis();
restored.now = r.now;
r.aof.forEach((line) => restored.exec(line, { replaying: true }));
console.log(`  ${r.aof.length} logged writes, e.g. ${JSON.stringify(r.aof.at(-1))}`);
console.log(`  restored: visits=${restored.exec("GET visits")}, board=${JSON.stringify(restored.exec("ZREVRANGE board 0 2"))}, sess:7=${restored.exec("GET sess:7")} (expired stays expired)`);

console.log("— maxmemory: 100-key limit with approximate LRU");
const cache = new MiniRedis({ maxKeys: 100 });
for (let i = 0; i < 300; i++) {
  cache.now = i;
  cache.exec(`SET k${i} v`);
  cache.exec(`GET k${i % 10}`);                            // keys k0..k9 are hot
}
const hotKept = Array.from({ length: 10 }, (_, i) => cache.exec(`GET k${i}`) !== null).filter(Boolean).length;
console.log(`  ${cache.stats.evicted} evictions, ${cache.exec("DBSIZE")} keys kept, hot keys still cached: ${hotKept}/10`);
```

## How it works

| Piece | Here | In real Redis |
|---|---|---|
| Execution | one command at a time | a single-threaded event loop (I/O threads optional), so every command is atomic |
| Keyspace | `Map` of key → entry | a hash table with incremental rehashing |
| Lazy + active expiry | check on access; sample 20 keys, repeat while > 25% expired | the same algorithm, 10 times per second |
| Sorted sets | sorted array + binary search (O(n) insert) | skip list + hash table (O(log n)) |
| Persistence | AOF list, replayed into a fresh instance | AOF (fsync every second) and/or RDB snapshots; AOF rewrite compacts the log |
| Transactions | queue commands, run them back to back | MULTI/EXEC: no interleaving, no rollback; WATCH for optimistic locking |
| Eviction | sample 5 keys, evict the least recently used | `maxmemory-policy allkeys-lru` with the same sampling idea |
| Pub/sub | callbacks per channel | fire-and-forget: offline subscribers miss messages (use Streams for durability) |

:::exercise Extend it
1. Add `SETNX` and `SET key value NX PX 30000`, then build a lock on top of it: acquire, release only if the value matches your token (check-and-delete atomically).
2. Implement **AOF rewrite**: generate the minimal set of commands that recreates the current dataset, and compare its length with the original log.
3. Replace the sorted array with a **skip list** and measure `ZADD` on 100,000 members.
4. Add `WATCH`: make `EXEC` fail if a watched key changed since `WATCH`.
5. Shard it: put three MiniRedis instances behind a client that routes keys by **hash slot** (CRC16 mod 16,384 in Redis Cluster; any hash works here).
:::

:::keypoints
- Redis = a **single-threaded command loop** over an in-memory hash map: every command is atomic.
- Expiry is **lazy** (on access) plus an **active sampling** cycle, so unread keys are eventually freed.
- Typed values (strings, lists, hashes, sorted sets) with `WRONGTYPE` checks; sorted sets power leaderboards.
- **AOF** persistence logs writes (with **absolute** expiry times) and replays them; transactions queue and run commands back to back.
- Under a memory limit, **approximate LRU** samples a few keys instead of tracking a perfect LRU order.
:::
