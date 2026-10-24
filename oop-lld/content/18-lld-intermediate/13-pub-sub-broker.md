---
title: Design an In-Memory Pub/Sub Message Broker
level: intermediate
time: 60
summary: A small message broker like a mini Kafka. Learn topics, a log of messages for each topic, where each consumer is up to (offsets), groups that share work, retries with acknowledgements, a thread for each subscriber, and what delivery promises you can make.
---

:::problem Design an In-Memory Pub/Sub Message Broker {level=medium tags="messaging,Observer,concurrency,queues,Kafka-like"}
Design a broker like a tiny Kafka or RabbitMQ. Publishers send messages to named topics. Subscribers get every message published after they subscribe. Consumers in the same **group** share the messages (each message goes to one member of the group). Different groups each see all messages. Messages are delivered in order for a topic, and a failed delivery is tried again. A slow subscriber must not slow down a fast one.
:::

:::hint Hint
Keep each topic as an **append-only log** (new messages are only added at the end), with a number (offset) for each message that keeps growing. Each consumer group remembers its own **offset**, like a bookmark. Delivering is then: "read the next message from my bookmark, process it, and move the bookmark when it is done". This one idea gives ordering, replay, different speeds and retries.
:::

## What is pub/sub?

Think of a newspaper. **Publishers** (the newsroom) write articles. **Subscribers** (readers) subscribe to a section (a **topic**) like Sports. The newsroom does not know who the readers are, and the readers do not know who wrote the articles. A **broker** sits in between and delivers.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | Topic, Message, Publisher, Subscriber, ConsumerGroup |
| Order? | for each topic (one log). Inside a group member, in the order of the log |
| Delivery? | **at-least-once**: a message that is not acknowledged is sent again. So handlers must be safe to run twice (idempotent) |
| Groups? | members of one group split the messages (sharing the work). Different groups each get all messages |
| Slow consumers? | each has its own offset and (in a real system) its own thread. A slow one does not block others |
| Keeping messages? | we keep all in this version. A rule to delete old ones is an extension |
| Many threads? | many publishers and consumers. The log is thread-safe |
| Not needed | saving to disk, splitting across machines, exactly-once |

## Step 2: How it works

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

Each group's offset is its **bookmark**. Many consumers in one group take turns claiming the next message that nobody has claimed yet.

## Step 3: Find the classes

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

## Step 4: Design decisions

- **A log for each topic, and a `GroupState` for each group.** `nextOffset` (the next message never given out), `inFlight` (given out but not yet acknowledged), and `retryQueue` (refused with a "no", to be sent again first).
- **`claim(group)`** gives the next message to **exactly one waiting member** of the group (while holding the topic lock): first from the retry queue, otherwise `nextOffset++`. A new group starts at offset 0 (it replays everything) or at the end (it only gets new messages), as the policy says.
- **Acknowledgement:** the handler returns success or failure. On failure the offset goes to `retryQueue` (a limited number of tries, then a dead-letter list).
- **Each subscription has its own worker thread** that loops: wait for a message (a condition variable on the topic), claim it, run the handler, ack or nack. A slow handler slows only its own thread.
- **Blocking wait** uses a `condition_variable` (notified on `append`), plus a `stop` flag so unsubscribing is clean (the same closable queue idea you saw before).
- **Compared with Observer:** plain Observer pushes to every observer at once, in the same thread. A broker puts a **log in between**, so it supports replay, back-pressure, order and failure handling.

## Step 5: The code

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

## Delivery promises (say them exactly)

| Promise | In this design |
|---|---|
| **Order** | messages are added in order. Each message goes to one member of a group. Order for each key across members needs splitting by key (partitions) |
| **At-least-once** | a message is sent again until acknowledged, so handlers must be **idempotent** |
| **At-most-once** | would mean acknowledging *before* processing (messages can be lost) |
| **Exactly-once** | needs transactions on offsets or idempotent processing. Not provided |
| **Slow consumers do not block others** | each has its own thread and offset. The log keeps growing, so a rule to delete old messages is needed |

## Edge cases

| Case | What happens |
|---|---|
| Subscribing to a topic that does not exist | create it, or refuse (a policy) |
| A consumer crashes in the middle of a message | in-flight offsets time out and go back to the retry queue (not shown. Track `inFlight` with deadlines) |
| Poison messages (always fail) | a maximum number of tries, then a dead-letter list to look at |
| Unsubscribe while processing | the `stop` flag and a wake-up. The current message finishes |
| Memory grows | delete by size or time. Compact by key |
| Publisher faster than consumers | a limited log that pushes back, or drop the oldest (a policy) |
| Two members in a group, and order | not guaranteed between members. Use partitions keyed by the entity id |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Partitions for speed with order for each key" | a topic has N partitions. The producer picks `hash(key) % N`. A group gives partitions to members (and rebalances) |
| "Save to disk, recover after a crash" | write the log to files (append-only) and save offsets safely |
| "Filter what a subscriber gets" | a yes/no function, or topic patterns (`orders.*`) |
| "Request and reply, delayed messages" | reply topics. A scheduler for delayed publishing |
| "Back-pressure and flow control" | a limited window of in-flight messages for each subscriber |
| "Message formats and versions" | typed messages with a schema registry |
| "Brokers on many machines" | copy each partition (leader and followers, consensus): HLD |
| "Watching" | the lag (log size minus offset) for each group is the main health number |

## Short answer to say in an interview

:::interview How does a pub/sub broker let groups share messages but still let every group see everything?
"Each topic is an append-only log. Every consumer group keeps its own offset in that log, like a bookmark. Different groups have different bookmarks, so each sees every message. Inside a group, members claim the next message under a lock, so each message goes to exactly one member. If a handler fails, the message goes to a retry queue, so delivery is at-least-once and handlers must be idempotent. Each subscriber has its own thread, so a slow one does not block others."
:::

```quiz
? What lets two groups each see every message, while the members of one group share them?
- Two copies of every message
+ One shared log, with an offset for each group, and one claim for each message inside a group
- Two threads
> Offsets belong to a consumer group. Claiming moves the group's offset forward.
? Why must handlers be idempotent with at-least-once delivery?
- Because threads are fast
+ A message may be delivered more than once (a retry after a failure or a lost ack)
- Because of ordering
> The broker cannot know whether the processing worked before the failure.
```

:::keypoints
- An append-only log for each topic, and an offset for each consumer group: order, replay and different speeds come for free.
- Groups share messages. Different groups each get all. Ack and nack with retries and a dead-letter list: at-least-once.
- A worker thread for each subscription, woken by a condition variable, with a clean stop flag. Partitions give scale and order for each key.
:::
