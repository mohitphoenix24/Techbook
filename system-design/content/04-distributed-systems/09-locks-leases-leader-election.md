---
title: Distributed Locks, Leases and Leader Election
level: advanced
time: 45
summary: When several machines must not do the same thing at once — distributed locks with Redis and with ZooKeeper/etcd, why every lock is really a lease, the pause problem and fencing tokens (with C++/JS code), the Redlock debate, leader election with leases, and designs that avoid locks altogether.
---

Sometimes exactly one machine must do something: only one worker should send the monthly invoice email, only one scheduler instance should run the cron job, only one replica should be the leader that accepts writes. On a single machine you'd use a mutex. Across machines you need a **distributed lock**, and it's far trickier than it looks, because machines pause, clocks drift and messages are delayed. This lesson shows the traps and the standard fixes.

## Why lock? Efficiency vs correctness

Ask first **what happens if two holders act at once**:

- **Efficiency locks**: a duplicate only wastes work (two workers compute the same report). An occasional double is acceptable, and a simple Redis lock is fine.
- **Correctness locks**: a duplicate corrupts data or money (two workers both charge a customer, two leaders both accept writes). Here you need a lock built on **consensus** plus **fencing tokens**, or, better, a design that doesn't need a lock.

## A lock in Redis

The common single-instance Redis lock:

```text
SET lock:invoice-job  <random token>  NX  PX 30000
       ↑ key              ↑ unique per holder  ↑ only if not exists  ↑ auto-expire after 30 s
```

- `NX` makes acquisition atomic: only one client can create the key.
- `PX 30000` is a **lease**: if the holder crashes, the lock frees itself after 30 s, instead of being stuck forever.
- Releasing must check the token, so a client never deletes someone else's lock. That needs an atomic compare-and-delete, done with a Lua script:

```text
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end
```

:::def Lease
A lock that **expires automatically** after a time-to-live unless the holder renews it. Every practical distributed lock is a lease: otherwise a crashed holder would block everyone forever.
:::

## The pause problem

Leases create a nasty failure mode. A holder can **pause** for longer than the lease (a long garbage-collection pause, a VM migration, a network stall) and **not know it**:

```viz algo=seq title="Two clients both believe they hold the lock"
participant c1 Client 1 [service]
participant l Lock service [lock]
participant c2 Client 2 [service]
participant s Storage [db]
c1 -> l : acquire lock (lease 10 s)
l --> c1 : granted
note c1 : stop-the-world GC pause… 15 s
note l : lease expires after 10 s
c2 -> l : acquire lock
l --> c2 : granted | The lock service did nothing wrong: the lease expired.
c2 -> s : write file (new data)
c1 -> s : write file (stale data!) | Client 1 wakes up still believing it holds the lock.
note s : corrupted: Client 1 overwrote Client 2's work
```

No amount of checking "do I still hold the lock?" before writing fixes this: the pause can happen **between** the check and the write.

## Fencing tokens

:::def Fencing token
A number the lock service returns with every grant, **strictly increasing** each time the lock is granted. The client sends it with every write, and the **storage rejects** any write carrying a token lower than the highest it has already seen.
:::

In the scenario above, client 1 got token 33 and client 2 got token 34. When client 1 wakes up and writes with token 33, the storage has already seen 34 and rejects it.

:::tabs Fencing tokens stop the paused client
```js run
class LockService {
  #token = 32;
  #holder = null;
  #expires = 0;
  acquire(client, now, leaseMs) {
    if (this.#holder && now < this.#expires) return null;        // still held
    this.#holder = client;
    this.#expires = now + leaseMs;
    return ++this.#token;                                        // monotonically increasing
  }
}

class FencedStorage {
  #highest = 0;
  data = "(empty)";
  write(value, token) {
    if (token < this.#highest) return `REJECTED "${value}" (token ${token} < ${this.#highest})`;
    this.#highest = token;
    this.data = value;
    return `accepted "${value}" (token ${token})`;
  }
}

const lock = new LockService(), storage = new FencedStorage();
let t = 0;
const t1 = lock.acquire("client-1", t, 10_000);
console.log("t=0s   client-1 acquires → token", t1);
t = 15_000;                                       // client-1 is frozen in a 15 s GC pause; its lease expired
const t2 = lock.acquire("client-2", t, 10_000);
console.log("t=15s  client-2 acquires → token", t2);
console.log("t=16s  client-2:", storage.write("report v2", t2));
console.log("t=17s  client-1 wakes up and writes:", storage.write("report v1 (stale)", t1));
console.log("final data:", storage.data);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

class LockService {
    long token_ = 32;
    string holder_;
    long expires_ = 0;
public:
    optional<long> acquire(const string& client, long now, long leaseMs) {
        if (!holder_.empty() && now < expires_) return nullopt;   // still held
        holder_ = client;
        expires_ = now + leaseMs;
        return ++token_;                                         // monotonically increasing
    }
};

class FencedStorage {
    long highest_ = 0;
public:
    string data = "(empty)";
    string write(const string& value, long token) {
        if (token < highest_)
            return "REJECTED \"" + value + "\" (token " + to_string(token) + " < " + to_string(highest_) + ")";
        highest_ = token;
        data = value;
        return "accepted \"" + value + "\" (token " + to_string(token) + ")";
    }
};

int main() {
    LockService lock;
    FencedStorage storage;
    long t1 = *lock.acquire("client-1", 0, 10000);
    cout << "t=0s   client-1 acquires -> token " << t1 << "\n";
    // client-1 is frozen in a 15 s GC pause; its lease expired
    long t2 = *lock.acquire("client-2", 15000, 10000);
    cout << "t=15s  client-2 acquires -> token " << t2 << "\n";
    cout << "t=16s  client-2: " << storage.write("report v2", t2) << "\n";
    cout << "t=17s  client-1 wakes up and writes: " << storage.write("report v1 (stale)", t1) << "\n";
    cout << "final data: " << storage.data << "\n";
}
```
:::

Fencing needs **the resource itself** to check tokens. Databases can do it with a conditional write (`UPDATE … WHERE fence_token < :token`), and some storage systems support it natively. ZooKeeper's `zxid` and etcd's revision numbers make natural fencing tokens. The leader-election version of the same idea is the **epoch** or **term** number (as in Raft): followers reject messages from a leader with an old term.

## The Redlock debate

Redis's author proposed **Redlock**: acquire the lock on a majority of 5 independent Redis nodes, to survive a Redis node failing. Martin Kleppmann's well-known critique (2016) argued it's unsafe for correctness: it relies on **timing assumptions** (bounded pauses, bounded clock drift) and provides **no fencing token**, so the pause problem above still breaks it. The practical consensus:

- For **efficiency** locks, a single Redis instance (or Redlock) is fine.
- For **correctness**, use a **consensus-based** lock service (**ZooKeeper, etcd, Consul**) **and** fencing tokens.

## Locks and leader election with ZooKeeper / etcd

Coordination services built on consensus offer exactly the primitives needed:

- **Ephemeral nodes / leases**: a key tied to the client's **session**. If the client stops heartbeating (crash, partition), the session expires and the key is deleted automatically.
- **Sequential nodes / revisions**: a globally increasing number attached to each creation, a natural **fencing token** and queue position.
- **Watches**: get notified when a key changes or disappears, so waiters don't poll.

**The standard lock / leader-election recipe:**

:::flow Leader election with a coordination service
Create | each candidate creates an ephemeral, sequential key under /election
Smallest wins | the candidate with the lowest sequence number is the leader
Watch | every other candidate watches the key just before its own (no thundering herd)
Fail over | if the leader's session dies, its key vanishes; the next candidate is notified and takes over
:::

etcd exposes this directly (`etcdctl elect`, the `concurrency` package's `Campaign`), and Kubernetes uses **Lease** objects for leader election of its controllers. The leader must still treat leadership as a **lease**: stop acting as leader if it can't renew in time, and include its term/revision as a fencing token in writes.

```viz algo=arch title="Leader election for a scheduler service"
s1   Scheduler 1 | leader (lease rev 812) [clock]
s2   Scheduler 2 | standby, watching [clock]
s3   Scheduler 3 | standby, watching [clock]
etcd etcd cluster | Raft, 3 nodes [lock]
db   Jobs DB | rejects writes with old revisions [db]
--
s1 -> etcd : keep-alive lease
s2 ~> etcd : watch /election
s3 ~> etcd : watch /election
s1 -> db : writes carry fencing token 812
```

## Avoid needing a lock

The best distributed lock is the one you don't need. Alternatives:

- **Single-writer partitioning**: route all operations for a key to one partition owner (a Kafka partition consumer, a shard's leader). Ordering and exclusion come for free.
- **Idempotency**: if two workers run the same job, make the effect happen once anyway (idempotency keys, unique constraints, "insert if not exists").
- **Optimistic concurrency**: version numbers and conditional writes (compare-and-set) in the database, from the SQL lesson.
- **Database row locks**: `SELECT … FOR UPDATE` or `UPDATE jobs SET owner = ? WHERE id = ? AND owner IS NULL` (a conditional claim) when the data already lives in one database.
- **Queues with visibility timeouts**: a message is invisible to other consumers while one processes it (the background jobs lesson).

:::interview A crisp answer
*"For this cron job, duplicates are harmless if the job is idempotent, so a Redis lock with a TTL is enough. For the payment reconciliation job, a double run would double-pay, so I'd elect a single leader through etcd and have it write with the lease revision as a fencing token; the database rejects writes from an older revision."*
:::

```quiz
? Why is a TTL (lease) on a distributed lock necessary?
+ Without it, a holder that crashes would keep the lock forever
- It makes acquiring the lock faster
- It prevents GC pauses
> Automatic expiry is how locks survive holder crashes. It also creates the pause problem, which fencing solves.

? A client holds a lock, pauses for longer than the lease, then wakes up and writes. What prevents the stale write?
- Checking the lock again before writing
+ A fencing token: the storage rejects writes with a token lower than one it has already seen
- A longer TTL
> The pause can happen right after any check. Only the resource itself can reliably reject the stale holder.

? Which is the most appropriate base for a correctness-critical distributed lock?
- A single Redis instance
+ A consensus-based coordination service such as etcd or ZooKeeper, combined with fencing tokens
- A file on a shared NFS drive
> Consensus survives node failures without split brain, and its revision numbers provide fencing tokens.

? Which design removes the need for a lock entirely?
+ Routing every operation on an account to a single partition owner that processes them in order
- Adding more Redis nodes
- Using shorter TTLs
> Single-writer partitioning gives exclusion and ordering without any lock service.
```

:::keypoints
- Ask whether a lock is for **efficiency** (duplicates waste work) or **correctness** (duplicates corrupt data).
- A Redis lock = `SET key token NX PX ttl` + token-checked release (Lua). Every distributed lock is a **lease**.
- Holders can **pause** past their lease and act on a stale lock; **fencing tokens** (monotonic numbers checked by the resource) stop them.
- For correctness, use **consensus-based** services (**etcd, ZooKeeper, Consul**): ephemeral keys, sequence numbers, watches. Leader election is the same recipe.
- Prefer designs without locks: **single-writer partitions**, **idempotency**, **optimistic concurrency**, conditional updates, queue visibility timeouts.
:::
