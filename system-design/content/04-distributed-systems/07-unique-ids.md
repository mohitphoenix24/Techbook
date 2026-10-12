---
title: Generating Unique IDs at Scale
level: intermediate
time: 40
summary: Why auto-increment breaks in distributed systems, and the alternatives — UUIDv4, time-ordered UUIDv7/ULID, ticket servers and range allocation, and Twitter's Snowflake (timestamp + machine + sequence) implemented in C++ and JavaScript, with clock-skew handling and the trade-offs of each.
---

Every tweet, order, message and photo needs an **id**. In a single database, `AUTO_INCREMENT` solves it. In a system with many servers and sharded databases, it doesn't: two shards would both hand out id 1001. "Design a unique ID generator" is a classic standalone interview question, and the answer is reused in almost every other design (URL shortener, chat, news feed).

## What we want from an ID

1. **Unique**, across all servers, forever.
2. **No coordination on the hot path**: generating an id shouldn't need a network call to a central service on every request.
3. **Roughly time-sortable**, so "newest first" and cursor pagination work on the id itself, and database indexes stay compact (new ids append at the end of the B-tree).
4. **Compact**: 64 bits fits in a `BIGINT` and is cheap to index; 128 bits is double.
5. **High throughput**: thousands to millions per second.
6. Sometimes **not guessable** (so outsiders can't enumerate your orders, `/orders/1001`, `/orders/1002`, …).

## Option 1: database auto-increment (and its variants)

- **One central DB sequence**: simple and perfectly ordered, but a single point of failure and a bottleneck, with a network hop per id.
- **Multiple DBs with offsets**: server 1 issues 1, 3, 5, …; server 2 issues 2, 4, 6, … (`auto_increment_increment = 2`). It works, but adding a server means re-configuring every step, and ids aren't time-ordered across servers.

## Option 2: UUIDs

:::def UUID (universally unique identifier)
A 128-bit identifier, written as 36 characters (`f47ac10b-58cc-4372-a567-0e02b2c3d479`). **Version 4** is 122 random bits: the chance of a collision is negligible (you'd need to generate about 2.7 × 10¹⁸ to have a 50% chance of a single duplicate).
:::

- ✓ Generated anywhere, with no coordination at all. Not guessable.
- ✗ 128 bits (twice a `BIGINT`), and **random order**: inserts land all over a B-tree index, causing page splits and poor cache locality. Large tables with UUIDv4 primary keys measurably slow down inserts.
- ✗ Not sortable by time.

:::def UUIDv7 / ULID
**Time-ordered** 128-bit ids: the first 48 bits are a millisecond Unix timestamp, the rest random. They keep UUIDs' coordination-free generation **and** sort by creation time, so they behave well in indexes. UUIDv7 was standardised in 2024 (RFC 9562). ULID is a similar earlier format with a compact 26-character text form.
:::

UUIDv7 is now a strong default when 128 bits is acceptable.

## Option 3: ticket server / range allocation

**Flickr's ticket server**: a dedicated database whose only job is to hand out increasing numbers (`REPLACE INTO tickets …; SELECT LAST_INSERT_ID()`), run as two servers issuing odd and even numbers for availability.

**Range (block) allocation** removes the per-id network call: each app server asks a central allocator (a database row or a ZooKeeper/etcd counter) for a **block** of ids, say 1,000 at a time (`UPDATE id_blocks SET next = next + 1000 … RETURNING`), then hands them out locally from memory. One coordination round trip per 1,000 ids. If a server crashes, the unused part of its block is skipped (gaps are fine). Ids are only roughly ordered across servers.

## Option 4: Snowflake

Twitter's **Snowflake** (2010) packs a timestamp, a machine id and a counter into a 64-bit integer:

```text
 0 | 41 bits: milliseconds since a custom epoch | 10 bits: machine id | 12 bits: sequence
 ↑ sign bit (always 0, so the id is a positive signed 64-bit integer)
```

| Part | Bits | Range | Meaning |
|---|---|---|---|
| timestamp | 41 | 2⁴¹ ms ≈ **69.7 years** | ids sort by creation time |
| machine id | 10 | 1,024 generators | assigned once per process (config, or leased from etcd/ZooKeeper) |
| sequence | 12 | 4,096 per millisecond | counter for ids in the same millisecond on the same machine |

So each generator can produce **4,096 ids per millisecond** (over 4 million per second), with no coordination at all after it learns its machine id. Variants are used by Discord, Instagram (with a shard id inside), Mastodon, and many others.

:::tabs A Snowflake ID generator
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Snowflake {
    static constexpr int64_t EPOCH = 1735689600000LL;      // 2025-01-01T00:00:00Z, a custom epoch
    static constexpr int MACHINE_BITS = 10, SEQ_BITS = 12;
    static constexpr int64_t MAX_SEQ = (1 << SEQ_BITS) - 1;
    int64_t machine_, lastMs_ = -1, seq_ = 0;
    function<int64_t()> now_;                               // injectable clock (ms) for testing
public:
    Snowflake(int64_t machineId, function<int64_t()> clock) : machine_(machineId), now_(std::move(clock)) {
        if (machineId < 0 || machineId >= (1 << MACHINE_BITS)) throw invalid_argument("machine id out of range");
    }
    int64_t next() {
        int64_t ms = now_();
        if (ms < lastMs_) throw runtime_error("clock moved backwards: refusing to generate ids");
        if (ms == lastMs_) {
            seq_ = (seq_ + 1) & MAX_SEQ;
            if (seq_ == 0) while ((ms = now_()) <= lastMs_) {}  // 4,096 used: wait for the next millisecond
        } else seq_ = 0;
        lastMs_ = ms;
        return ((ms - EPOCH) << (MACHINE_BITS + SEQ_BITS)) | (machine_ << SEQ_BITS) | seq_;
    }
    static void decode(int64_t id) {
        int64_t seq = id & MAX_SEQ, machine = (id >> SEQ_BITS) & ((1 << MACHINE_BITS) - 1);
        int64_t ms = (id >> (MACHINE_BITS + SEQ_BITS)) + EPOCH;
        cout << id << " -> time " << ms << " ms, machine " << machine << ", sequence " << seq << "\n";
    }
};

int main() {
    int64_t fakeNow = 1767225600000LL;                       // a fixed "now" so the output is reproducible
    Snowflake gen(42, [&] { return fakeNow; });
    vector<int64_t> ids;
    for (int i = 0; i < 3; i++) ids.push_back(gen.next());  // same millisecond: sequence 0, 1, 2
    fakeNow += 5;
    ids.push_back(gen.next());                               // 5 ms later: sequence resets
    for (auto id : ids) Snowflake::decode(id);
    cout << "sorted by time: " << boolalpha << is_sorted(ids.begin(), ids.end()) << "\n";

    fakeNow -= 100;                                          // NTP steps the clock back 100 ms
    try { gen.next(); } catch (const exception& e) { cout << "error: " << e.what() << "\n"; }
}
```
```js run
// JavaScript numbers are exact only up to 2^53, so 64-bit ids use BigInt.
class Snowflake {
  static EPOCH = 1735689600000n;                       // 2025-01-01T00:00:00Z, a custom epoch
  static MACHINE_BITS = 10n;
  static SEQ_BITS = 12n;
  static MAX_SEQ = (1n << 12n) - 1n;

  constructor(machineId, clock = () => BigInt(Date.now())) {
    if (machineId < 0 || machineId >= 1024) throw new RangeError("machine id out of range");
    this.machine = BigInt(machineId);
    this.now = clock;                                  // injectable clock (ms) for testing
    this.lastMs = -1n;
    this.seq = 0n;
  }
  next() {
    let ms = this.now();
    if (ms < this.lastMs) throw new Error("clock moved backwards: refusing to generate ids");
    if (ms === this.lastMs) {
      this.seq = (this.seq + 1n) & Snowflake.MAX_SEQ;
      if (this.seq === 0n) while ((ms = this.now()) <= this.lastMs) {}   // 4,096 used: wait for the next ms
    } else this.seq = 0n;
    this.lastMs = ms;
    return ((ms - Snowflake.EPOCH) << (Snowflake.MACHINE_BITS + Snowflake.SEQ_BITS))
      | (this.machine << Snowflake.SEQ_BITS) | this.seq;
  }
  static decode(id) {
    const seq = id & Snowflake.MAX_SEQ;
    const machine = (id >> Snowflake.SEQ_BITS) & 1023n;
    const ms = (id >> (Snowflake.MACHINE_BITS + Snowflake.SEQ_BITS)) + Snowflake.EPOCH;
    return `${id} -> time ${ms} ms, machine ${machine}, sequence ${seq}`;
  }
}

let fakeNow = 1767225600000n;                          // a fixed "now" so the output is reproducible
const gen = new Snowflake(42, () => fakeNow);
const ids = [gen.next(), gen.next(), gen.next()];      // same millisecond: sequence 0, 1, 2
fakeNow += 5n;
ids.push(gen.next());                                  // 5 ms later: sequence resets
ids.forEach((id) => console.log(Snowflake.decode(id)));
console.log("sorted by time:", ids.every((id, i) => i === 0 || ids[i - 1] < id));

fakeNow -= 100n;                                       // NTP steps the clock back 100 ms
try { gen.next(); } catch (e) { console.log("error:", e.message); }
```
:::

### The details interviewers probe

- **Clock moving backwards** (NTP corrections). Options: refuse to generate until the clock catches up (as above), wait if the jump is small, or keep using `lastMs` with the sequence. Never silently emit an id that might duplicate an earlier one.
- **Assigning machine ids**: from deployment config, or leased dynamically from etcd/ZooKeeper (with the lease renewed by heartbeat so two processes never share an id).
- **Sequence overflow**: more than 4,096 ids in one millisecond on one machine → wait for the next millisecond.
- **Ordering across machines** is only approximate (±clock skew), which is fine for feeds.
- **Information leak**: Snowflake ids reveal creation time and roughly how many ids a machine generates. Use random ids where that matters.
- **The 69-year limit**: choose a recent custom epoch (not 1970) to use the full range.
- **JavaScript clients**: 64-bit ids exceed `Number.MAX_SAFE_INTEGER` (2⁵³ − 1), so APIs often send them as **strings** in JSON (Twitter's `id_str`).

## Comparison

| Approach | Size | Sortable | Coordination | Throughput | Notes |
|---|---|---|---|---|---|
| Single DB auto-increment | 64 | ✓ exact | every id | low | SPOF |
| UUIDv4 | 128 | ✗ | none | unlimited | random index inserts |
| **UUIDv7 / ULID** | 128 | ✓ (ms) | none | unlimited | great default if 128 bits is OK |
| Ticket server | 64 | ✓ | every id | medium | simple; needs HA |
| Range allocation | 64 | roughly | once per block | very high | gaps after crashes |
| **Snowflake** | 64 | ✓ (ms, ±skew) | once (machine id) | ~4M/s per node | the classic interview answer |

:::interview A complete answer in four sentences
*"I'd use Snowflake-style 64-bit ids: 41 bits of milliseconds since a custom epoch, 10 bits of machine id, 12 bits of sequence. Each service instance gets a unique machine id leased from etcd, so generation needs no coordination and does over 4 million ids per second per instance. The ids are time-sortable, which gives us newest-first ordering and compact B-tree inserts. If the clock moves backwards we stop issuing ids until it catches up."*
:::

```quiz
? Why are random UUIDv4 primary keys slow for very large tables?
+ Inserts land at random positions in the B-tree index, causing page splits and poor cache locality
- UUIDs can't be indexed
- UUIDs often collide
> Time-ordered ids (UUIDv7, ULID, Snowflake) append near the end of the index instead.

? In the classic Snowflake layout, how many ids can one machine generate in a single millisecond?
- 1,024
+ 4,096
- 2⁴¹
> 12 sequence bits give 2¹² = 4,096 ids per millisecond per machine.

? Your Snowflake generator sees the system clock jump 50 ms backwards. What's the safe behaviour?
+ Refuse (or wait) until the clock passes the last timestamp used, so no duplicate id can be produced
- Keep generating with the new, earlier time
- Reset the sequence to 0 and continue
> Generating with an earlier timestamp could repeat an id already issued.

? Why do many APIs send 64-bit ids as strings in JSON?
- Strings are smaller
+ JavaScript numbers lose precision above 2⁵³, so large integer ids would be corrupted
- JSON doesn't support numbers
> Twitter added `id_str` for exactly this reason.
```

:::keypoints
- Distributed systems can't rely on one database's auto-increment: it's a bottleneck and a single point of failure, and per-shard counters collide.
- **UUIDv4**: coordination-free but 128 bits and random (index-unfriendly). **UUIDv7/ULID**: coordination-free **and** time-ordered.
- **Ticket servers** and **range allocation** issue increasing numbers centrally; blocks cut the coordination to one call per thousands of ids.
- **Snowflake**: 41-bit time + 10-bit machine + 12-bit sequence = 64-bit, time-sortable, ~4M ids/s per machine, coordination only to assign machine ids.
- Handle **clocks moving backwards**, machine-id assignment, sequence overflow, and JavaScript's 2⁵³ limit.
:::
