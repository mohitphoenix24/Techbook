---
title: Design an In-Memory Pub/Sub Message Broker
level: intermediate
time: 60
summary: Topics, publishers and subscribers, an append-only log per topic with consumer offsets, consumer groups that share the work, at-least-once delivery with acknowledgements and redelivery, per-subscriber worker threads, and the guarantees you can state.
---

:::problem Design an In-Memory Pub/Sub Message Broker {level=medium tags="messaging,Observer,concurrency,queues,Kafka-like"}
Design a broker like a tiny Kafka or RabbitMQ. Publishers send messages to named topics. Subscribers receive every message published after they subscribe. Consumers in the same **group** share the messages (each message goes to one member of the group); different groups each see all messages. Messages are delivered in order per topic, and a failed delivery is retried. Subscribers must be slow or fast without affecting each other.
:::

:::hint Hint
Store each topic as an **append-only log** with a monotonically increasing offset. Each consumer (group) tracks its own **offset**. Delivery is then "read the next message from my offset, process, acknowledge by advancing the offset". That one idea gives ordering, replay, independent speeds and retries.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | Topic, Message, Publisher, Subscriber, ConsumerGroup |
| Ordering? | per topic (a single log); within a group's member, in log order |
| Delivery? | **at-least-once**: unacknowledged messages are redelivered; handlers must be idempotent |
| Groups? | members of one group split messages (load balancing); separate groups each get all messages |
| Slow consumers? | each consumer has its own offset and (in a real system) its own thread; a slow one does not block others |
| Retention? | keep all messages in this version; a retention policy as an extension |
| Concurrency? | many publishers and consumers; thread-safe log |
| Out of scope | persistence, partitions across machines, exactly-once |

## Step 2: how it works

```text
Topic "orders" (append-only log)
  offset:   0     1     2     3     4     5
          ┌─────┬─────┬─────┬─────┬─────┬─────┐
          │ m0  │ m1  │ m2  │ m3  │ m4  │ m5  │  ← publishers append
          └─────┴─────┴─────┴─────┴─────┴─────┘
                          ▲                 ▲
   group "billing"  offset=3 ──────────────┘    (has processed 0..2, next to read is 3)
   group "email"    offset=5 (nearly caught up)
   group "audit"    offset=0 (just started: replays everything)
```

Each group's offset is its **bookmark**. Many consumers in one group take turns claiming the next unclaimed message.

## Step 3: entities

```viz algo=uml title="Pub/sub broker"
class Broker
  + createTopic(name: string): void
  + publish(topic: string, payload: string): long
  + subscribe(topic: string, group: string, handler: Handler): SubscriptionId
  + unsubscribe(id: SubscriptionId): void
class Topic
  - name: string
  - log: Message[]
  - groups: map<string, GroupState>
  + append(payload: string): long
  + claim(group: string): Message
  + ack(group: string, offset: long): void
  + nack(group: string, offset: long): void
class Message
  - offset: long
  - payload: string
class GroupState
  - nextOffset: long
  - inFlight: set<long>
  - retryQueue: deque<long>
class Subscription
  - id: int
  - group: string
  - handler: function
  - worker: thread
Broker *-- Topic
Topic *-- Message
Topic *-- GroupState
Broker *-- Subscription
Subscription ..> Topic
```

## Step 4: design decisions

- **Per-topic log + per-group `GroupState`**: `nextOffset` (the next never-delivered message), `inFlight` (delivered, not yet acknowledged) and `retryQueue` (negatively acknowledged, to redeliver first).
- **`claim(group)`** hands out the next message **to exactly one waiting member** of the group (under the topic lock): first the retry queue, then `nextOffset++`. A new group starts at offset 0 (replay) or at the end (only new messages), by policy.
- **Acknowledgement**: the consumer handler returns success or failure. Failure puts the offset on `retryQueue` (limited attempts, then a dead-letter list).
- **Each subscription owns a worker thread** that loops: wait for a message (condition variable on the topic), claim, run the handler, ack/nack. Slow handlers slow only their own thread.
- **Blocking wait** with `condition_variable` (notified on `append`), plus a `stop` flag for clean unsubscribe (the closable-queue pattern).
- **Observer vs this**: classic Observer pushes synchronously to every observer. A broker **decouples with a log**, so it supports replay, back-pressure, ordering and failure handling.

## Step 5: the code

```cpp run title="Topics, offsets, consumer groups, retries"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Message { long offset; string payload; };
using Handler = function<bool(const Message&)>;              // return true = processed (ack), false = failed (retry)

class Topic {
    mutable mutex m_;
    condition_variable cv_;
    vector<Message> log_;
    struct GroupState { long next = 0; deque<long> retry; map<long, int> attempts; };
    map<string, GroupState> groups_;
    bool closed_ = false;
public:
    long append(string payload) {
        { lock_guard l(m_); long off = static_cast<long>(log_.size()); log_.push_back({off, move(payload)}); cv_.notify_all(); return off; }
    }
    void joinGroup(const string& group, bool fromStart) {
        lock_guard l(m_);
        if (!groups_.count(group)) { groups_[group].next = fromStart ? 0 : static_cast<long>(log_.size()); }      // a new group picks its starting point
    }
    // Blocks until a message is available for the group, or the topic is closed. Each message goes to ONE claimer per group.
    optional<Message> claim(const string& group, const atomic<bool>& stop) {
        unique_lock lock(m_);
        GroupState& g = groups_.at(group);
        cv_.wait(lock, [&] { return closed_ || stop || !g.retry.empty() || g.next < static_cast<long>(log_.size()); });
        if (closed_ || stop) return nullopt;
        long off;
        if (!g.retry.empty()) { off = g.retry.front(); g.retry.pop_front(); }                 // redeliveries first
        else off = g.next++;
        ++g.attempts[off];
        return log_[off];
    }
    // returns true if the message will be redelivered
    bool nack(const string& group, long offset, int maxAttempts, vector<long>& deadLetters) {
        lock_guard l(m_);
        GroupState& g = groups_.at(group);
        if (g.attempts[offset] >= maxAttempts) { deadLetters.push_back(offset); return false; }
        g.retry.push_back(offset);
        cv_.notify_all();
        return true;
    }
    void wake() { cv_.notify_all(); }
    void close() { { lock_guard l(m_); closed_ = true; } cv_.notify_all(); }
    long size() const { lock_guard l(m_); return static_cast<long>(log_.size()); }
};

class Broker {
    map<string, unique_ptr<Topic>> topics_;
    struct Sub { string topic, group; atomic<bool> stop{false}; thread worker; };
    vector<unique_ptr<Sub>> subs_;
    mutex m_;
    mutex deadM_; vector<long> dead_;
    static constexpr int kMaxAttempts = 3;
public:
    ~Broker() { for (auto& t : topics_) t.second->close(); for (auto& s : subs_) if (s->worker.joinable()) s->worker.join(); }
    void createTopic(const string& n) { lock_guard l(m_); topics_.emplace(n, make_unique<Topic>()); }
    long publish(const string& topic, string payload) { Topic* t; { lock_guard l(m_); t = topics_.at(topic).get(); } return t->append(move(payload)); }

    int subscribe(const string& topic, const string& group, Handler handler, bool fromStart = true) {
        Topic* t; Sub* sub;
        { lock_guard l(m_); t = topics_.at(topic).get(); subs_.push_back(make_unique<Sub>()); sub = subs_.back().get(); sub->topic = topic; sub->group = group; }
        t->joinGroup(group, fromStart);
        sub->worker = thread([this, t, sub, group, h = move(handler)] {
            while (auto msg = t->claim(group, sub->stop)) {
                bool ok = false;
                try { ok = h(*msg); } catch (...) { ok = false; }
                if (!ok) { lock_guard dl(deadM_); t->nack(group, msg->offset, kMaxAttempts, dead_); }
            }
        });
        return static_cast<int>(subs_.size());
    }
    void unsubscribe(int id) { Sub* s; Topic* t; { lock_guard l(m_); s = subs_.at(id - 1).get(); t = topics_.at(s->topic).get(); } s->stop = true; t->wake(); if (s->worker.joinable()) s->worker.join(); }
    vector<long> deadLetters() { lock_guard l(deadM_); return dead_; }
    // test helper: wait until a group has consumed everything
    void drain(const string& topic, int expectedSeen, atomic<int>& seen) { for (int i = 0; i < 2000 && seen < expectedSeen; ++i) this_thread::sleep_for(chrono::milliseconds(1)); (void)topic; }
};

int main() {
    Broker broker;
    broker.createTopic("orders");

    mutex out; atomic<int> billing{0}, audit{0}, workerA{0}, workerB{0};
    long billingSum = 0;

    cout << "group 'audit' (one member) sees EVERY message; group 'billing' (two members) SHARES them\n";
    broker.subscribe("orders", "audit", [&](const Message&) { ++audit; return true; });
    int a = broker.subscribe("orders", "billing", [&](const Message& m) { ++workerA; lock_guard l(out); billingSum += stol(m.payload); return true; });
    int b = broker.subscribe("orders", "billing", [&](const Message& m) { ++workerB; lock_guard l(out); billingSum += stol(m.payload); return true; });
    (void)a; (void)b;

    for (int i = 1; i <= 100; ++i) broker.publish("orders", to_string(i));
    for (int i = 0; i < 3000 && (audit < 100 || workerA + workerB < 100); ++i) this_thread::sleep_for(chrono::milliseconds(1));
    cout << "  audit saw " << audit << " messages\n";
    cout << "  billing total handled: " << workerA + workerB << " (each message exactly once within the group), sum of payloads = " << billingSum << " (expected 5050)\n";

    cout << "retries: a handler that fails the first two times for message 5\n";
    broker.createTopic("emails");
    atomic<int> attemptsFor5{0}, processed{0};
    broker.subscribe("emails", "mailer", [&](const Message& m) {
        if (m.payload == "5" && ++attemptsFor5 <= 2) return false;       // simulate a transient failure
        ++processed; return true;
    });
    for (int i = 1; i <= 8; ++i) broker.publish("emails", to_string(i));
    for (int i = 0; i < 3000 && processed < 8; ++i) this_thread::sleep_for(chrono::milliseconds(1));
    cout << "  all " << processed << " messages processed; message 5 needed " << attemptsFor5 << " attempts (at-least-once delivery)\n";

    cout << "poison message: always fails, goes to the dead-letter list after 3 attempts\n";
    broker.createTopic("jobs");
    atomic<int> okCount{0}, failCalls{0};
    broker.subscribe("jobs", "w", [&](const Message& m) { if (m.payload == "bad") { ++failCalls; return false; } ++okCount; return true; });
    broker.publish("jobs", "good1"); broker.publish("jobs", "bad"); broker.publish("jobs", "good2");
    for (int i = 0; i < 3000 && (okCount < 2 || failCalls < 3); ++i) this_thread::sleep_for(chrono::milliseconds(1));
    this_thread::sleep_for(chrono::milliseconds(20));
    cout << "  good messages processed: " << okCount << ", attempts on the bad one: " << failCalls << ", dead letters: " << broker.deadLetters().size() << "\n";

    cout << "late subscriber: a new group starting from the beginning replays history\n";
    atomic<int> replayed{0};
    broker.subscribe("orders", "analytics", [&](const Message&) { ++replayed; return true; }, true);
    for (int i = 0; i < 3000 && replayed < 100; ++i) this_thread::sleep_for(chrono::milliseconds(1));
    cout << "  analytics replayed " << replayed << " messages\n";
}
```

## Delivery guarantees (state them precisely)

| Guarantee | In this design |
|---|---|
| **Ordering** | messages are appended in order; each message goes to one member of a group; per-key ordering across members needs partitioning by key |
| **At-least-once** | a message is redelivered until acked, so handlers must be **idempotent** |
| **At-most-once** | would need acking *before* processing (can lose messages) |
| **Exactly-once** | needs transactional offsets or idempotent processing; not provided |
| **Isolation of slow consumers** | each has its own thread and offset; the log keeps growing (retention policy needed) |

## Edge cases

| Case | Handling |
|---|---|
| Subscribe to a missing topic | create on demand or reject (policy) |
| Consumer crashes mid-message | in-flight offsets time out and return to the retry queue (not shown; track `inFlight` with deadlines) |
| Poison messages | max attempts then a dead-letter list for inspection |
| Unsubscribe while processing | `stop` flag and a wake-up; the current message finishes |
| Memory growth | retention by size or time; compaction by key |
| Publisher faster than consumers | bounded log with back-pressure, or drop oldest (policy) |
| Two members in a group, ordering | not guaranteed between members; use partitions keyed by the entity id |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Partitions for parallelism with per-key ordering" | topic = N partitions; producer picks `hash(key) % N`; a group assigns partitions to members (rebalancing) |
| "Persistence and crash recovery" | write the log to disk (append-only files), store offsets durably |
| "Filtering subscriptions" | a predicate or topic wildcard (`orders.*`) |
| "Request/reply, delayed messages" | reply topics; a scheduler for delayed publish |
| "Back-pressure and flow control" | bounded in-flight window per subscriber |
| "Message schemas and versioning" | typed payloads with a schema registry |
| "Distributed brokers" | replicate each partition (leader/followers, consensus): HLD |
| "Observability" | lag (log size minus offset) per group as the main health metric |

```quiz
? What lets two groups each see every message while members of one group share them?
- Two copies of every message
+ One shared log, with an independent offset per group and one claim per message within a group
- Two threads
> Offsets are per consumer group; claiming advances the group's offset.
? Why must handlers be idempotent under at-least-once delivery?
- Because threads are fast
+ A message may be delivered more than once (a retry after a failure or a lost ack)
- Because of ordering
> The broker cannot know whether processing succeeded before the failure.
```

:::keypoints
- Append-only log per topic + an offset per consumer group: ordering, replay and independent speeds for free.
- Groups share messages; separate groups each get all. Ack/nack with retries and a dead-letter list: at-least-once.
- Worker thread per subscription with condition-variable wake-up and a clean stop flag. Partitions give scale and per-key order.
:::
