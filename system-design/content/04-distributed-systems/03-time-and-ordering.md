---
title: Time, Clocks and Ordering Events
level: advanced
time: 45
summary: Why you can't trust timestamps across machines (clock skew, drift, NTP jumps), wall-clock vs monotonic time, the happens-before relation, Lamport clocks and vector clocks implemented in C++ and JavaScript, hybrid logical clocks, and Google's TrueTime.
---

"Just sort the events by timestamp" is one of the most dangerous sentences in distributed systems. Each machine has its own clock, and those clocks disagree, sometimes by milliseconds, sometimes by seconds. Ordering events correctly across machines needs different tools: **logical clocks**. They underpin last-write-wins conflict resolution, version vectors in Dynamo, causal consistency, and distributed tracing.

## Why physical clocks lie

Each server's clock is a quartz oscillator that **drifts** (typically 10–100 parts per million, i.e. up to ~8 seconds a day if never corrected). **NTP** (Network Time Protocol) corrects it against reference servers, but only to within a few milliseconds on a good network, and much worse on a bad one. Worse:

- NTP can **step the clock backwards** when it corrects a fast clock.
- **Leap seconds** have caused real outages (2012, Reddit and others).
- VMs can **pause** for seconds (live migration, GC, stop-the-world), and their clocks then jump.
- A misconfigured machine may be minutes or hours off.

:::def Clock skew
The difference between two machines' clocks at the same instant. Even with NTP, assume tens of milliseconds between machines, more across regions.
:::

:::warn Last-write-wins with skewed clocks loses the newer write
Server A's clock runs 50 ms fast. A client writes `x = 1` on A (stamped 10:00:00.050), then 10 ms later a client writes `x = 2` on B (stamped 10:00:00.010). Last-write-wins keeps `x = 1`, the **older** write, and silently discards the newer one. Cassandra uses LWW by default, which is why its documentation insists on well-synchronised clocks.
:::

### Two kinds of clocks on every machine

| | Wall clock (time-of-day) | Monotonic clock |
|---|---|---|
| Example | `Date.now()`, `system_clock` | `performance.now()`, `steady_clock` |
| Meaning | the current date and time | time since some arbitrary point (e.g. boot) |
| Can jump backwards? | **yes** (NTP corrections, manual changes) | **never** |
| Comparable across machines? | roughly (± skew) | **no** |
| Use for | timestamps shown to users, logs | **measuring durations**: timeouts, latency, rate limiting, leases |

Rule: **measure elapsed time with a monotonic clock**, never by subtracting wall-clock readings.

## Happens-before

Leslie Lamport's 1978 paper (one of the most cited in computer science) reframed the problem: instead of asking *when* events happened, ask *which events could have influenced which*.

:::def Happens-before (→)
Event **a → b** if (1) a and b are on the same process and a came first, or (2) a is the **sending** of a message and b is its **receipt**, or (3) there's a chain a → c → b (transitivity). If neither a → b nor b → a, the events are **concurrent** (a ‖ b): neither could have known about the other.
:::

```viz algo=seq title="Happens-before across three processes"
participant p1 P1 [server]
participant p2 P2 [server]
participant p3 P3 [server]
p1 -> p1 : a: local event
p1 -> p2 : b → c (message)
p2 -> p2 : d: local event
p3 -> p3 : e: local event | e is concurrent with a, b, c and d: no message chain connects them.
p2 -> p3 : f → g (message)
note p3 : a → b → c → d → f → g, and e → g, but e ‖ a
```

## Lamport clocks

:::def Lamport clock
Each process keeps an integer counter. **Before each event**, increment it. **Send** the counter with every message. On **receive**, set `counter = max(local, received) + 1`.
:::

Guarantee: if a → b then `L(a) < L(b)`. Breaking ties by process id gives a **total order** consistent with causality, which is useful for things like ordering requests in a distributed mutex or in a replicated log.

The limitation: the converse doesn't hold. `L(a) < L(b)` does **not** mean a happened before b; they might be concurrent. Lamport clocks can't **detect** concurrency, which is exactly what conflict detection needs.

## Vector clocks

:::def Vector clock
Each process keeps a **vector of counters, one per process**. On a local event, increment your own entry. Send the whole vector with messages. On receive, take the **element-wise maximum** with the received vector, then increment your own entry.
:::

Comparing two vectors V and W:

- V ≤ W (every entry ≤) and V ≠ W → **V happened before W**.
- W ≤ V → W happened before V.
- Neither → **concurrent**: a genuine conflict.

That's exactly what Dynamo-style databases use (as **version vectors**, one entry per replica) to decide whether a new write **supersedes** an old one or **conflicts** with it and both must be kept.

:::tabs Lamport and vector clocks
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct LamportClock {
    long t = 0;
    long tick() { return ++t; }                      // local event or send
    long receive(long remote) { t = max(t, remote) + 1; return t; }
};

struct VectorClock {
    map<string, long> v;
    void tick(const string& me) { v[me]++; }
    void merge(const VectorClock& o) { for (auto& [k, n] : o.v) v[k] = max(v[k], n); }
    // -1: this happened before o, 1: after, 0: equal, 2: concurrent
    int compare(const VectorClock& o) const {
        bool less = false, greater = false;
        set<string> keys;
        for (auto& [k, _] : v) keys.insert(k);
        for (auto& [k, _] : o.v) keys.insert(k);
        for (auto& k : keys) {
            long a = v.count(k) ? v.at(k) : 0, b = o.v.count(k) ? o.v.at(k) : 0;
            if (a < b) less = true;
            if (a > b) greater = true;
        }
        if (less && greater) return 2;
        return less ? -1 : greater ? 1 : 0;
    }
    string str() const {
        string s = "{";
        for (auto& [k, n] : v) s += k + ":" + to_string(n) + " ";
        if (s.size() > 1) s.pop_back();
        return s + "}";
    }
};

int main() {
    // Lamport: P1 sends to P2
    LamportClock p1, p2;
    long a = p1.tick();                   // event a on P1
    long sendTs = p1.tick();              // P1 sends a message
    long recvTs = p2.receive(sendTs);     // P2 receives it
    cout << "Lamport: a=" << a << " send=" << sendTs << " receive=" << recvTs << "\n";

    // Vector clocks: two replicas update the same cart
    VectorClock base;  base.tick("A");                // v1 written on replica A
    VectorClock onA = base;  onA.tick("A");           // A adds "milk"
    VectorClock onB = base;  onB.tick("B");           // B adds "eggs" at the same time
    const char* names[] = {"happened before", "equal", "happened after", "CONCURRENT (conflict!)"};
    auto name = [&](int c) { return c == -1 ? names[0] : c == 0 ? names[1] : c == 1 ? names[2] : names[3]; };
    cout << "base " << base.str() << " vs onA " << onA.str() << ": base " << name(base.compare(onA)) << "\n";
    cout << "onA " << onA.str() << " vs onB " << onB.str() << ": " << name(onA.compare(onB)) << "\n";

    VectorClock merged = onA;  merged.merge(onB);  merged.tick("A");   // a client resolves both
    cout << "merged " << merged.str() << " supersedes both: "
         << (onA.compare(merged) == -1 && onB.compare(merged) == -1 ? "yes" : "no") << "\n";
}
```
```js run
class LamportClock {
  t = 0;
  tick() { return ++this.t; }                               // local event or send
  receive(remote) { this.t = Math.max(this.t, remote) + 1; return this.t; }
}

class VectorClock {
  constructor(v = {}) { this.v = { ...v }; }
  tick(me) { this.v[me] = (this.v[me] ?? 0) + 1; return this; }
  merge(o) { for (const [k, n] of Object.entries(o.v)) this.v[k] = Math.max(this.v[k] ?? 0, n); return this; }
  copy() { return new VectorClock(this.v); }
  compare(o) {                                              // "before" | "after" | "equal" | "concurrent"
    let less = false, greater = false;
    for (const k of new Set([...Object.keys(this.v), ...Object.keys(o.v)])) {
      const a = this.v[k] ?? 0, b = o.v[k] ?? 0;
      if (a < b) less = true;
      if (a > b) greater = true;
    }
    return less && greater ? "concurrent" : less ? "before" : greater ? "after" : "equal";
  }
  toString() { return JSON.stringify(this.v); }
}

// Lamport: P1 sends to P2
const p1 = new LamportClock(), p2 = new LamportClock();
const a = p1.tick(), sendTs = p1.tick(), recvTs = p2.receive(sendTs);
console.log(`Lamport: a=${a} send=${sendTs} receive=${recvTs}`);

// Vector clocks: two replicas update the same cart
const base = new VectorClock().tick("A");          // v1 written on replica A
const onA = base.copy().tick("A");                 // A adds "milk"
const onB = base.copy().tick("B");                 // B adds "eggs" at the same time
console.log(`base ${base} vs onA ${onA}: base happened ${base.compare(onA)}`);
console.log(`onA ${onA} vs onB ${onB}: ${onA.compare(onB).toUpperCase()} (conflict!)`);

const merged = onA.copy().merge(onB).tick("A");    // a client resolves both versions
console.log(`merged ${merged} supersedes both:`, onA.compare(merged) === "before" && onB.compare(merged) === "before");
```
:::

The cost of vector clocks is **size**: one entry per participant. Dynamo-style stores keep one entry per **replica** (not per client), and prune old entries.

## Hybrid logical clocks and TrueTime

Two production-grade answers combine physical and logical time:

:::def Hybrid logical clock (HLC)
A timestamp made of the **physical time** plus a small **logical counter**. It stays close to wall-clock time (useful for humans and for "as of" queries) while still never going backwards and always respecting causality. Used by CockroachDB, YugabyteDB and MongoDB.
:::

:::def TrueTime (Google Spanner)
An API returning time as an **interval** `[earliest, latest]` with a known bound on uncertainty (typically a few milliseconds), backed by GPS receivers and atomic clocks in every data centre. Spanner **waits out the uncertainty** before committing ("commit wait"), which guarantees that commit timestamps respect real-time order globally: externally consistent (linearizable) transactions across continents.
:::

TrueTime shows the deep trade-off neatly: better clocks mean shorter commit waits, which means lower latency for strong consistency.

## Practical guidance

- **Never** rely on wall-clock timestamps from different machines for **correctness** (ordering writes, deciding who wins). Use a **single sequencer** (the leader, a database sequence, a Kafka partition offset), **logical clocks**, or **version numbers**.
- Use **monotonic clocks** for timeouts, leases, latency, and rate limiting.
- Wall-clock timestamps are fine for **display**, logs, and **approximate** ordering where small errors are harmless (sorting a feed).
- Time-ordered ids (Snowflake, next-but-four lesson) embed wall-clock time, so they need guards against clocks moving backwards.

```quiz
? Why shouldn't you measure a request timeout as `Date.now() - start`?
+ The wall clock can jump (e.g. an NTP correction), making the measured duration wrong or even negative; a monotonic clock never goes backwards
- Date.now() is too slow to call
- It only works in browsers
> Durations should come from a monotonic clock such as performance.now() or steady_clock.

? Lamport timestamps L(a) = 3 and L(b) = 7. What can you conclude?
- a happened before b
+ b did not happen before a; a and b may be causally related or concurrent
- a and b are concurrent
> Lamport clocks guarantee a → b implies L(a) < L(b), but not the converse, so they can't detect concurrency.

? Two versions of a cart have vector clocks {A:2, B:1} and {A:1, B:2}. What does the database do?
- Keep the one with the higher total
+ Treat them as concurrent (a conflict) and keep both for the application or a merge rule to resolve
- Keep the first one received
> Neither vector dominates the other, so neither write saw the other.

? What does Spanner's commit wait achieve?
+ Commit timestamps that respect real-time order globally, by waiting out the known clock uncertainty
- Faster writes
- Eventual consistency across regions
> Waiting until TrueTime's uncertainty interval has passed guarantees no later transaction can get an earlier timestamp.
```

:::keypoints
- Physical clocks **drift and skew** (NTP keeps them within milliseconds at best) and can **jump backwards**. Never use cross-machine timestamps to decide correctness.
- Use **monotonic clocks** for durations, timeouts and leases; wall clocks for display and logs.
- **Happens-before** defines causality: same-process order, send → receive, transitivity. Otherwise events are **concurrent**.
- **Lamport clocks**: a total order consistent with causality, but can't detect concurrency. **Vector clocks**: detect "before / after / concurrent", the basis of conflict detection in Dynamo-style stores.
- **Hybrid logical clocks** (CockroachDB, MongoDB) and **TrueTime** (Spanner) combine physical and logical time in production.
:::
