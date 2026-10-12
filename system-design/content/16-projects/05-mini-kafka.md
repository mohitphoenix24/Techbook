---
title: Build a Mini Kafka
level: intermediate
time: 60
icon: layers
cover: #0f766e,#84cc16
tags: append-only log, partitions, consumer groups, offsets, at-least-once
summary: Build the core of Apache Kafka in C++ — a partition as a segmented append-only log read by offset with size-based retention, then topics with key-based partitioning, consumer groups with a range assignor and rebalancing, committed offsets, a consumer that crashes before committing, idempotent processing, independent groups and consumer lag.
---

Kafka's big idea is simple: a **log**. Producers append records; consumers read from any offset at their own pace; records stay until retention deletes them. Everything else (partitions for scale, consumer groups for parallelism, offsets for progress) is built on that. You'll build each piece and watch at-least-once delivery happen.

:::flow What you'll build
Partition | segmented append-only log, read by offset
Retention | delete whole old segments by size
Topic | N partitions; key hash picks the partition
Consumer group | members share partitions; rebalance on join/leave
Offsets | committed after processing → at-least-once
Lag | latest offset − committed offset
:::

## Step 1: a partition is a log

Records get consecutive **offsets**. The log is split into **segments** (files on disk in real Kafka, each named after its base offset), so retention can delete old data by dropping whole files and reads can find the right segment with a binary search.

```cpp run title="A segmented, offset-addressed log with retention"
// Step 1: one Kafka partition — an append-only log split into segments, read by offset
#include <bits/stdc++.h>
using namespace std;

struct Record { long offset; string key, value; };

struct Segment {                       // a file on disk in real Kafka: <baseOffset>.log + a sparse .index
    long base;
    vector<Record> records;
    size_t bytes = 0;
};

class Partition {
    vector<Segment> segments;
    long nextOffset = 0;
    size_t segmentBytes;
public:
    explicit Partition(size_t segBytes) : segmentBytes(segBytes) { segments.push_back({0, {}, 0}); }

    long append(const string& key, const string& value) {
        if (segments.back().bytes >= segmentBytes)               // roll a new segment when the active one is full
            segments.push_back({nextOffset, {}, 0});
        segments.back().records.push_back({nextOffset, key, value});
        segments.back().bytes += key.size() + value.size() + 16;
        return nextOffset++;
    }
    // Fetch up to maxRecords starting at an offset: binary search the segment, then index inside it
    vector<Record> read(long offset, int maxRecords) const {
        vector<Record> out;
        auto it = upper_bound(segments.begin(), segments.end(), offset,
                              [](long off, const Segment& s) { return off < s.base; });
        if (it == segments.begin()) throw runtime_error("offset " + to_string(offset) + " was deleted by retention");
        for (--it; it != segments.end() && (int)out.size() < maxRecords; ++it)
            for (auto& r : it->records)
                if (r.offset >= offset && (int)out.size() < maxRecords) out.push_back(r);
        return out;
    }
    void retain(size_t maxBytes) {                               // delete whole old segments, never single records
        size_t total = 0;
        for (auto& s : segments) total += s.bytes;
        while (segments.size() > 1 && total - segments.front().bytes >= maxBytes) {
            total -= segments.front().bytes;
            segments.erase(segments.begin());
        }
    }
    long earliest() const { return segments.front().base; }
    long latest() const { return nextOffset; }
    size_t segmentCount() const { return segments.size(); }
};

int main() {
    Partition p(200);                                            // tiny 200-byte segments to see rolling
    for (int i = 0; i < 30; i++) p.append("user" + to_string(i % 3), "click#" + to_string(i));
    cout << "offsets " << p.earliest() << ".." << p.latest() - 1 << " in " << p.segmentCount() << " segments\n";

    for (auto& r : p.read(12, 4)) cout << "  offset " << r.offset << "  " << r.key << " -> " << r.value << "\n";

    p.retain(500);                                               // keep ~500 bytes: old segments go
    cout << "after retention: offsets " << p.earliest() << ".." << p.latest() - 1
         << " in " << p.segmentCount() << " segments\n";
    try { p.read(3, 1); } catch (const exception& e) { cout << "  read(3): " << e.what() << "\n"; }
    cout << "  read(" << p.earliest() << "): " << p.read(p.earliest(), 1)[0].value << " (consumers can still replay everything retained)\n";
}
```

## Step 2: topics, consumer groups and offsets

A **topic** has several partitions; the producer picks one by hashing the key, so all events for one user land in the same partition and stay **in order**. A **consumer group** divides the partitions among its members; when members join or leave, the group **rebalances**. Each group stores a **committed offset** per partition: where to resume. Committing **after** processing gives at-least-once delivery: a crash between processing and committing means the next owner reprocesses that batch, so consumers must be **idempotent**.

```cpp run title="Partitions, consumer groups, rebalancing, crash and replay"
// Step 2: topics, keyed partitioning, consumer groups with rebalancing, committed offsets, crashes and lag
#include <bits/stdc++.h>
using namespace std;

struct Record { long offset; string key, value; };

uint32_t keyHash(const string& s) {                   // stable hash (Kafka uses murmur2 on the key bytes)
    uint32_t h = 2166136261u;
    for (unsigned char c : s) h = (h ^ c) * 16777619u;   // FNV-1a…
    h ^= h >> 16; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16;   // …plus a Murmur3 finalizer to spread bits
    return h;
}

class Broker {
    map<string, vector<vector<Record>>> topics;        // topic → partitions → records
    map<pair<string, int>, long> committed;            // (group, partition) → next offset to read
public:
    void createTopic(const string& t, int partitions) { topics[t].resize(partitions); }
    int partitions(const string& t) { return topics[t].size(); }
    pair<int, long> produce(const string& t, const string& key, const string& value) {
        auto& parts = topics[t];
        int p = keyHash(key) % parts.size();               // same key → same partition → ordered
        long off = parts[p].size();
        parts[p].push_back({off, key, value});
        return {p, off};
    }
    vector<Record> fetch(const string& t, int p, long from, int max) {
        auto& log = topics[t][p];
        vector<Record> out;
        for (long o = from; o < (long)log.size() && (int)out.size() < max; o++) out.push_back(log[o]);
        return out;
    }
    long committedOffset(const string& g, int p) { return committed.count({g, p}) ? committed[{g, p}] : 0; }
    void commit(const string& g, int p, long next) { committed[{g, p}] = next; }
    long latest(const string& t, int p) { return topics[t][p].size(); }
};

class Group {                                          // the group coordinator's job, simplified
    Broker& b; string name, topic;
public:
    vector<string> members;
    map<string, vector<int>> assignment;
    Group(Broker& b, string n, string t) : b(b), name(move(n)), topic(move(t)) {}
    void rebalance(const string& why) {                // range assignor: split partitions evenly, in order
        assignment.clear();
        int P = b.partitions(topic), M = members.size();
        for (int i = 0, p = 0; i < M; i++)
            for (int k = 0; k < P / M + (i < P % M); k++) assignment[members[i]].push_back(p++);
        cout << "  rebalance (" << why << "):";
        for (auto& m : members) { cout << " " << m << "=["; for (int p : assignment[m]) cout << p << (p == assignment[m].back() ? "" : ","); cout << "]"; }
        cout << "\n";
    }
    void join(const string& m) { members.push_back(m); rebalance(m + " joined"); }
    void leave(const string& m) { erase(members, m); rebalance(m + " left"); }
    // poll one batch per assigned partition; process; commit afterwards (at-least-once) unless we crash first
    int poll(const string& m, int max, const function<void(const Record&)>& process, bool crashBeforeCommit = false) {
        int n = 0;
        for (int p : assignment[m]) {
            long from = b.committedOffset(name, p);
            auto batch = b.fetch(topic, p, from, max);
            for (auto& r : batch) { process(r); n++; }
            if (!crashBeforeCommit && !batch.empty()) b.commit(name, p, batch.back().offset + 1);
        }
        return n;
    }
    long lag() { long s = 0; for (int p = 0; p < b.partitions(topic); p++) s += b.latest(topic, p) - b.committedOffset(name, p); return s; }
};

int main() {
    Broker broker;
    broker.createTopic("orders", 4);
    vector<string> users = {"alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"};
    for (int i = 0; i < 48; i++) broker.produce("orders", users[i % 8], users[i % 8] + "#" + to_string(i / 8));
    cout << "produced 48 events for 8 users; partition sizes:";
    for (int p = 0; p < 4; p++) cout << " p" << p << "=" << broker.latest("orders", p);
    cout << "\n";

    // An idempotent consumer: remembers processed event ids ("ana#3"), so a redelivered event is skipped
    set<string> seen; int processed = 0, duplicates = 0;
    map<string, int> lastSeq; bool ordered = true;           // per user, sequence numbers must only increase
    auto billing = [&](const Record& r) {
        if (!seen.insert(r.value).second) { duplicates++; return; }
        processed++;
        int seq = stoi(r.value.substr(r.value.find('#') + 1));
        if (lastSeq.count(r.key) && seq < lastSeq[r.key]) ordered = false;
        lastSeq[r.key] = seq;
    };

    Group g(broker, "billing", "orders");
    g.join("c1"); g.join("c2");
    g.poll("c1", 3, billing); g.poll("c2", 3, billing);
    cout << "  after one poll each: processed " << processed << ", lag " << g.lag() << "\n";
    g.join("c3");
    g.poll("c2", 3, billing, /*crashBeforeCommit=*/true);
    cout << "  c2 processed a batch, then crashed before committing\n";
    g.leave("c2");
    while (g.lag() > 0) for (auto& m : g.members) g.poll(m, 3, billing);
    cout << "billing: processed " << processed << " unique events, " << duplicates
         << " redelivered duplicates skipped, per-user order kept: " << boolalpha << ordered << ", lag " << g.lag() << "\n";

    Group analytics(broker, "analytics", "orders");    // another group reads the same data independently
    analytics.members = {"a1"}; analytics.rebalance("a1 started");
    int counted = 0;
    analytics.poll("a1", 100, [&](const Record&) { counted++; });
    cout << "analytics: read all " << counted << " events from offset 0; billing's offsets untouched (lag " << g.lag() << ")\n";
}
```

c2 processed three events and crashed before committing; after the rebalance, c3 received the same three events again and the idempotent consumer skipped them. A second group (analytics) read everything from offset 0 without affecting billing: in a log, **consuming doesn't delete**.

## How it works

| Concept | Here | In Kafka |
|---|---|---|
| Partition log | vector of segments with base offsets | segment files (`.log`) + sparse offset and time indexes |
| Retention | drop oldest segments past a size | `retention.bytes` / `retention.ms`, or log **compaction** (keep the latest value per key) |
| Partitioner | FNV + finalizer, mod partitions | murmur2(key) mod partitions; sticky batching for null keys |
| Replication | (not modelled) | each partition has a leader + followers; acks=all + min.insync.replicas |
| Group assignment | range assignor on every change | range / round-robin / cooperative-sticky assignors via the group coordinator |
| Offsets | map (group, partition) → next offset | the `__consumer_offsets` compacted topic |
| Delivery | commit after processing (at-least-once) | the same by default; exactly-once with idempotent producers + transactions |

:::exercise Extend it
1. Add **replication**: a leader and two follower copies per partition, a high-water mark (the offset replicated to all in-sync replicas), and consumers that can only read below it.
2. Implement **log compaction**: keep only the latest record per key, and show that a new consumer can rebuild a table from the compacted topic.
3. Switch to the **cooperative sticky** assignor: on rebalance, move as few partitions as possible and compare how many partitions changed owner.
4. Add a **consumer lag alert**: if a group's lag grows for 3 polls in a row, print a warning with the slowest partition.
5. Add **time-based retention** and a `seekToTimestamp` using a sparse time index.
:::

:::keypoints
- A partition is an **append-only log** of offset-numbered records, stored in **segments**; retention deletes whole old segments.
- The **key** picks the partition: per-key order, and parallelism across partitions (partition count caps consumer parallelism).
- **Consumer groups** share partitions and **rebalance** on membership changes; different groups read independently.
- **Committed offsets** track progress; committing after processing = **at-least-once**, so consumers must be **idempotent**.
- **Lag** (latest − committed) is the key health metric for consumers.
:::
