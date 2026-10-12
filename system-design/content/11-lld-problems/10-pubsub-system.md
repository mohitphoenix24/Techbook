---
title: Design a Pub/Sub Message Broker
level: advanced
time: 60
summary: An in-memory message broker as an LLD problem — topics as append-only logs, subscriptions that each track their own offset, ordered delivery per subscription, acknowledgements with retries and a dead-letter queue, replay from an offset, and one delivery thread per subscription so a slow subscriber can't block the others — in C++ (threads + condition variables) and JavaScript (async workers).
---

:::problem Design a Pub/Sub System {level=hard tags="LLD,Observer,concurrency,queues"}
Design an in-process message broker: publishers publish messages to topics; subscribers subscribe to topics and receive every message published after (or from a chosen point before) they subscribed, in order. Failed deliveries are retried and eventually dead-lettered. A slow subscriber must not delay the others.

:::hint Hint
Store each topic as an append-only list of messages and give each subscription its own read offset (like Kafka) instead of copying messages into per-subscriber queues. Then each subscription is just "a worker that delivers messages from my offset onwards and advances it on ack".
:::
:::

This brings the Messaging module down to the class level, and interviewers who ask it want to see the same ideas: **decoupling**, **ordering**, **delivery guarantees**, **backpressure**, and **isolation** between consumers.

## Requirements

- `createTopic(name)`, `publish(topic, message)`.
- `subscribe(topic, name, handler, fromOffset = latest)` → every message delivered **in order** to that subscription.
- **At-least-once**: a handler returns ack/nack (or throws); nacked messages are retried with a limit, then moved to a **dead-letter** topic.
- **Isolation**: each subscription is delivered independently; a slow or failing subscriber doesn't block others.
- **Replay**: reset a subscription's offset to re-read history.
- Unsubscribe; graceful shutdown.

## Design

```viz algo=uml title="Broker classes"
class Broker
  - topics: map<string, Topic>
  + createTopic(name)
  + publish(topic, payload): offset
  + subscribe(topic, name, handler, from): Subscription
class Topic
  - name: string
  - log: Message[]
  - lock: mutex
  + append(payload): offset
  + read(offset): Message
class Message
  - offset: long
  - payload: string
  - publishedAt
class Subscription
  - offset: long
  - attempts: int
  - handler: Handler
  - worker: thread
  + seek(offset)
  + close()
interface Handler
  + handle(m: Message): bool
Broker *-- Topic : 1..*
Topic *-- Message : log
Subscription --> Topic : reads
Subscription --> Handler
Broker o-- Subscription : manages
```

**Why a log with offsets instead of per-subscriber queues?** Publishing is O(1) no matter how many subscribers there are (no fan-out copies); each subscriber's progress is just a number; replay is "set the offset back"; a new subscriber can start from the beginning. This is exactly Kafka's design (Messaging module), shrunk into one process.

```viz algo=arch title="One log, independent readers" dir=right
pub     Publisher [service]
topic   Topic "orders" | log: 0 1 2 3 4 5 [stream]
billing Subscription billing | offset 6 (caught up) [worker]
email   Subscription email | offset 3 (slow) [worker]
dlq     Dead-letter topic [queue]
--
pub -> topic : append
topic -> billing : deliver from its offset
topic -> email : deliver from its offset
email ~> dlq : after 3 failed attempts
```

Delivery loop per subscription (on its own thread):

:::flow One subscription's worker
Wait | until the topic has a message at my offset (or I'm closed)
Deliver | call the handler with that message
Ack | advance my offset by one
Nack / throw | retry up to N times with backoff; then publish to the DLQ and advance
:::

Ordering is preserved because each subscription processes **one message at a time** in offset order; the price is that a poison message blocks its own subscription until it's dead-lettered (but never anyone else's).

## Implementation

:::tabs Broker with offsets, retries, a DLQ and per-subscription workers
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Message { long offset; string payload; };

class Topic {
    string name_;
    vector<Message> log_;
    mutable mutex m_;
    condition_variable cv_;
public:
    explicit Topic(string n) : name_(std::move(n)) {}
    const string& name() const { return name_; }
    long append(string payload) {
        long off;
        { lock_guard l(m_); off = log_.size(); log_.push_back({off, std::move(payload)}); }
        cv_.notify_all();                                   // wake subscriptions waiting for new messages
        return off;
    }
    long end() const { lock_guard l(m_); return log_.size(); }
    // blocks until a message exists at `offset`, or `stop` becomes true
    optional<Message> waitFor(long offset, const atomic<bool>& stop) {
        unique_lock l(m_);
        cv_.wait(l, [&] { return offset < (long)log_.size() || stop.load(); });
        if (offset < (long)log_.size()) return log_[offset];
        return nullopt;
    }
    void wakeAll() { cv_.notify_all(); }
};

using Handler = function<bool(const Message&)>;             // true = ack, false/throw = nack

class Subscription {
    Topic& topic_; Topic& dlq_;
    string name_; Handler handler_;
    atomic<long> offset_;
    atomic<bool> stop_{false};
    int maxAttempts_;
    thread worker_;
public:
    Subscription(Topic& t, Topic& dlq, string name, Handler h, long from, int maxAttempts)
        : topic_(t), dlq_(dlq), name_(std::move(name)), handler_(std::move(h)), offset_(from), maxAttempts_(maxAttempts),
          worker_([this] { run(); }) {}
    ~Subscription() { close(); }
    void close() { if (!stop_.exchange(true)) { topic_.wakeAll(); if (worker_.joinable()) worker_.join(); } }
    long offset() const { return offset_; }
private:
    void run() {
        while (!stop_) {
            auto m = topic_.waitFor(offset_, stop_);
            if (!m) return;
            bool ok = false;
            for (int attempt = 1; attempt <= maxAttempts_ && !ok; attempt++) {
                try { ok = handler_(*m); } catch (...) { ok = false; }
                if (!ok) this_thread::sleep_for(chrono::milliseconds(attempt));     // backoff (tiny for the demo)
            }
            if (!ok) dlq_.append(topic_.name() + "#" + to_string(m->offset) + " -> " + name_ + ": " + m->payload);
            offset_++;                                       // ack (or dead-lettered): move on, in order
        }
    }
};

class Broker {
    map<string, unique_ptr<Topic>> topics_;
    Topic dlq_{"dead-letters"};                             // declared before subs_: destroyed after them
    vector<unique_ptr<Subscription>> subs_;
public:
    Topic& createTopic(const string& n) { return *(topics_[n] = make_unique<Topic>(n)); }
    long publish(const string& topic, string payload) { return topics_.at(topic)->append(std::move(payload)); }
    Subscription& subscribe(const string& topic, const string& name, Handler h, long from = -1, int maxAttempts = 3) {
        Topic& t = *topics_.at(topic);
        subs_.push_back(make_unique<Subscription>(t, dlq_, name, std::move(h), from < 0 ? t.end() : from, maxAttempts));
        return *subs_.back();
    }
    Topic& deadLetters() { return dlq_; }
    void shutdown() { for (auto& s : subs_) s->close(); }
};

int main() {
    Broker broker;
    broker.createTopic("orders");
    broker.publish("orders", "o-1 created");                 // published before anyone subscribed

    mutex outM;
    vector<string> billingSeen, emailSeen, auditSeen;
    auto& billing = broker.subscribe("orders", "billing", [&](const Message& m) { lock_guard l(outM); billingSeen.push_back(m.payload); return true; });
    auto& email = broker.subscribe("orders", "email", [&](const Message& m) {
        this_thread::sleep_for(chrono::milliseconds(15));    // a slow subscriber
        if (m.payload.find("bad-address") != string::npos) throw runtime_error("SMTP rejected");   // a poison message
        lock_guard l(outM); emailSeen.push_back(m.payload); return true;
    });
    auto& audit = broker.subscribe("orders", "audit", [&](const Message& m) { lock_guard l(outM); auditSeen.push_back(m.payload); return true; }, 0);   // replay from the start

    for (string p : {"o-2 created", "o-2 paid", "o-3 created (bad-address)", "o-2 shipped"}) broker.publish("orders", p);
    while (email.offset() < 5 || billing.offset() < 5 || audit.offset() < 5) this_thread::sleep_for(chrono::milliseconds(5));
    broker.shutdown();

    auto show = [](const string& who, const vector<string>& v) { cout << who << " (" << v.size() << "):"; for (auto& s : v) cout << " [" << s << "]"; cout << "\n"; };
    show("billing", billingSeen);
    show("email  ", emailSeen);
    show("audit  ", auditSeen);
    cout << "dead letters: " << broker.deadLetters().end() << " -> " << broker.deadLetters().waitFor(0, atomic<bool>{true})->payload << "\n";
}
```
```js run
class Topic {
  #log = []; #waiters = [];
  constructor(name) { this.name = name; }
  append(payload) {
    const offset = this.#log.length;
    this.#log.push({ offset, payload });
    this.#waiters.splice(0).forEach((wake) => wake());   // wake subscriptions waiting for new messages
    return offset;
  }
  get end() { return this.#log.length; }
  async waitFor(offset, sub) {                            // resolves when a message exists at offset (or sub closes)
    while (offset >= this.#log.length && !sub.closed) await new Promise((r) => this.#waiters.push(r));
    return offset < this.#log.length ? this.#log[offset] : null;
  }
  wakeAll() { this.#waiters.splice(0).forEach((wake) => wake()); }
}

class Subscription {
  closed = false;
  constructor(topic, dlq, name, handler, from, maxAttempts = 3) {
    Object.assign(this, { topic, dlq, name, handler, offset: from, maxAttempts });
    this.done = this.#run();                              // each subscription runs its own async worker
  }
  async #run() {
    while (!this.closed) {
      const m = await this.topic.waitFor(this.offset, this);
      if (!m) return;
      let ok = false;
      for (let attempt = 1; attempt <= this.maxAttempts && !ok; attempt++) {
        try { ok = (await this.handler(m)) !== false; } catch { ok = false; }
        if (!ok) await new Promise((r) => setTimeout(r, attempt));        // backoff (tiny for the demo)
      }
      if (!ok) this.dlq.append(`${this.topic.name}#${m.offset} -> ${this.name}: ${m.payload}`);
      this.offset++;                                      // ack (or dead-lettered): move on, in order
    }
  }
  seek(offset) { this.offset = offset; }
  close() { this.closed = true; this.topic.wakeAll(); return this.done; }
}

class Broker {
  #topics = new Map(); #subs = []; deadLetters = new Topic("dead-letters");
  createTopic(name) { const t = new Topic(name); this.#topics.set(name, t); return t; }
  publish(topic, payload) { return this.#topics.get(topic).append(payload); }
  subscribe(topic, name, handler, from = null) {
    const t = this.#topics.get(topic);
    const s = new Subscription(t, this.deadLetters, name, handler, from ?? t.end);
    this.#subs.push(s);
    return s;
  }
  shutdown() { return Promise.all(this.#subs.map((s) => s.close())); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const broker = new Broker();
broker.createTopic("orders");
broker.publish("orders", "o-1 created");                  // before anyone subscribed

const seen = { billing: [], email: [], audit: [] };
const billing = broker.subscribe("orders", "billing", (m) => { seen.billing.push(m.payload); });
const email = broker.subscribe("orders", "email", async (m) => {
  await sleep(15);                                        // a slow subscriber
  if (m.payload.includes("bad-address")) throw new Error("SMTP rejected");   // a poison message
  seen.email.push(m.payload);
});
const audit = broker.subscribe("orders", "audit", (m) => { seen.audit.push(m.payload); }, 0);   // replay from the start

for (const p of ["o-2 created", "o-2 paid", "o-3 created (bad-address)", "o-2 shipped"]) broker.publish("orders", p);
await sleep(5);
console.log("5 ms later, the slow email subscriber is at offset", email.offset, "while billing is at", billing.offset);
while (email.offset < 5) await sleep(5);
await broker.shutdown();
for (const [who, list] of Object.entries(seen)) console.log(`${who.padEnd(7)} (${list.length}): ${list.map((s) => `[${s}]`).join(" ")}`);
console.log(`dead letters: ${broker.deadLetters.end} -> ${(await broker.deadLetters.waitFor(0, { closed: true })).payload}`);
```
:::

What the run shows: **billing** gets the 4 messages published after it subscribed, **audit** (subscribed at offset 0) also gets the earlier one, **email** is slower and skips the poison message after 3 attempts, which lands in the **dead-letter** topic. None of them waited for the others.

## Design discussion

- **Per-subscription workers** give isolation; a thread per subscription is fine for tens of subscriptions. For thousands, use a **shared pool** with one "in-progress" flag per subscription (to keep per-subscription ordering).
- **Ordering vs throughput**: one message at a time per subscription preserves order. To parallelise, partition the topic by key (Kafka's partitions) and give each partition its own worker.
- **At-least-once**: if the process crashes after the handler ran but before the offset advanced, the message is redelivered on restart (persist offsets); handlers must be **idempotent**.
- **Backpressure / memory**: the log grows forever here. Add **retention** (drop messages below the minimum offset of all subscriptions, or older than N hours) and **bounded** in-memory buffers.
- **Push vs pull**: this is push (the broker calls handlers). A pull API (`poll(sub, maxMessages)`) lets consumers control their pace and batch; Kafka is pull-based for exactly that reason.
- **Filtering**: subscribe with a predicate or to topic patterns (`orders.*`).

```quiz
? Why store messages once per topic with an offset per subscription, rather than copying each message into every subscriber's queue?
+ Publishing stays O(1) regardless of subscriber count, progress is just a number, and replay is setting the offset back
- Copies are not allowed in C++
- Offsets make delivery exactly-once
> It's the log-based design (Kafka): cheap fan-out, replay, and late subscribers starting from history.

? A message makes the email subscriber's handler throw every time. What should happen?
+ Retry a few times with backoff, then move it to a dead-letter topic and continue with the next message
- Retry forever
- Drop it silently
> Poison messages must not block the subscription forever, and must not be lost without a trace.

? How does this design keep a slow subscriber from delaying others?
+ Each subscription has its own worker and offset, so others keep consuming the log at their own pace
- It drops messages for slow subscribers
- All subscribers share one queue
> Isolation comes from independent readers over a shared, immutable log.
```

:::keypoints
- Topics as **append-only logs**; subscriptions as **independent offsets** with their own workers (Observer, done like Kafka).
- Per-subscription **in-order** delivery; **ack** advances the offset; **nack/throw** → retries with backoff → **DLQ**.
- **Replay** = seek the offset; late subscribers can start from history.
- At-least-once → idempotent handlers and persisted offsets; add retention, partitions (parallelism with per-key order), and pull APIs as extensions.
:::
