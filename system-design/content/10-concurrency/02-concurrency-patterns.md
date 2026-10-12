---
title: Concurrency Patterns — Queues, Pools, Readers–Writers
level: advanced
time: 55
summary: The building blocks of concurrent LLD answers — a bounded blocking queue (producer–consumer) with condition variables, a thread pool returning futures, reader–writer locks for read-heavy data, and their JavaScript counterparts: async queues, a promise pool that limits concurrency, and semaphores.
---

Most concurrent designs are built from a handful of patterns. Interviewers ask for them directly ("implement a thread-safe bounded queue", "build a thread pool") or expect them inside larger problems (a job scheduler, a logger that writes asynchronously, a web crawler with N workers). This lesson implements each one in C++ and shows the JavaScript equivalent.

## Producer–consumer with a bounded blocking queue

:::def Producer–consumer
Producers put work items into a shared **queue**; consumers take items out and process them. The queue decouples the two sides' speeds. A **bounded** queue blocks producers when it's full (backpressure) and blocks consumers when it's empty.
:::

```viz algo=arch title="Producers, a bounded queue, consumers" dir=right
p1   Producer 1 [service]
p2   Producer 2 [service]
q    Bounded queue | capacity 4 [queue]
c1   Consumer 1 [worker]
c2   Consumer 2 [worker]
--
p1 -> q : put (blocks when full)
p2 -> q
q -> c1 : take (blocks when empty)
q -> c2
```

:::tabs A bounded blocking queue
```cpp run
#include <bits/stdc++.h>
using namespace std;

template <class T>
class BlockingQueue {
    mutex m_;
    condition_variable notFull_, notEmpty_;
    deque<T> items_;
    size_t capacity_;
    bool closed_ = false;
public:
    explicit BlockingQueue(size_t capacity) : capacity_(capacity) {}

    bool put(T item) {                                       // blocks while full; false if closed
        unique_lock lock(m_);
        notFull_.wait(lock, [&] { return items_.size() < capacity_ || closed_; });
        if (closed_) return false;
        items_.push_back(std::move(item));
        notEmpty_.notify_one();
        return true;
    }
    optional<T> take() {                                     // blocks while empty; nullopt when closed and drained
        unique_lock lock(m_);
        notEmpty_.wait(lock, [&] { return !items_.empty() || closed_; });
        if (items_.empty()) return nullopt;
        T item = std::move(items_.front());
        items_.pop_front();
        notFull_.notify_one();
        return item;
    }
    void close() {                                           // no more puts; wake everyone
        { lock_guard lock(m_); closed_ = true; }
        notFull_.notify_all();
        notEmpty_.notify_all();
    }
};

int main() {
    BlockingQueue<int> q(4);
    mutex printM;
    vector<int> processed;
    vector<thread> consumers;
    for (int c = 0; c < 2; c++)
        consumers.emplace_back([&] {
            while (auto job = q.take()) {                    // stops when the queue is closed and empty
                this_thread::sleep_for(chrono::milliseconds(2));   // "work"
                lock_guard lock(printM);
                processed.push_back(*job);
            }
        });
    vector<thread> producers;
    for (int p = 0; p < 2; p++)
        producers.emplace_back([&, p] { for (int i = 0; i < 10; i++) q.put(p * 100 + i); });
    for (auto& t : producers) t.join();
    q.close();
    for (auto& t : consumers) t.join();

    sort(processed.begin(), processed.end());
    cout << "processed " << processed.size() << " jobs, none lost or duplicated: "
         << boolalpha << (adjacent_find(processed.begin(), processed.end()) == processed.end()) << "\n";
}
```
```js run
// An async bounded queue: put() waits while full, take() waits while empty.
class AsyncQueue {
  #items = []; #takers = []; #putters = []; #closed = false;
  constructor(capacity) { this.capacity = capacity; }
  async put(item) {
    while (this.#items.length >= this.capacity && !this.#closed) await new Promise((r) => this.#putters.push(r));
    if (this.#closed) return false;
    this.#items.push(item);
    this.#takers.shift()?.();                                 // wake one waiting consumer
    return true;
  }
  async take() {
    while (this.#items.length === 0 && !this.#closed) await new Promise((r) => this.#takers.push(r));
    if (this.#items.length === 0) return undefined;           // closed and drained
    const item = this.#items.shift();
    this.#putters.shift()?.();                                // wake one waiting producer
    return item;
  }
  close() { this.#closed = true; this.#takers.splice(0).forEach((r) => r()); this.#putters.splice(0).forEach((r) => r()); }
}

const q = new AsyncQueue(4), processed = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const consumer = async (name) => { for (let job; (job = await q.take()) !== undefined; ) { await sleep(2); processed.push(job); } };
const producer = async (p) => { for (let i = 0; i < 10; i++) await q.put(p * 100 + i); };

const consumers = [consumer("c1"), consumer("c2")];
await Promise.all([producer(0), producer(1)]);
q.close();
await Promise.all(consumers);
console.log(`processed ${processed.length} jobs, none lost or duplicated: ${new Set(processed).size === processed.length}`);
```
:::

Note the **close** (shutdown) protocol: without it, consumers would wait forever after the last job. Real queues also need a policy for what happens when full: **block** (above), **reject** (return false / 429), or **drop the oldest** (for telemetry).

## Thread pool

:::def Thread pool
A fixed set of **worker threads** that take tasks from a shared queue. It avoids creating a thread per task (thread creation is expensive, and thousands of threads thrash the CPU), and it **bounds** concurrency.
:::

:::tabs A thread pool that returns futures
```cpp run
#include <bits/stdc++.h>
using namespace std;

class ThreadPool {
    vector<thread> workers_;
    queue<function<void()>> tasks_;
    mutex m_;
    condition_variable cv_;
    bool stopping_ = false;
public:
    explicit ThreadPool(size_t n) {
        for (size_t i = 0; i < n; i++)
            workers_.emplace_back([this] {
                for (;;) {
                    function<void()> task;
                    {
                        unique_lock lock(m_);
                        cv_.wait(lock, [this] { return stopping_ || !tasks_.empty(); });
                        if (stopping_ && tasks_.empty()) return;          // drain, then exit
                        task = std::move(tasks_.front());
                        tasks_.pop();
                    }
                    task();                                                // run OUTSIDE the lock
                }
            });
    }
    template <class F>
    auto submit(F f) -> future<invoke_result_t<F>> {
        auto task = make_shared<packaged_task<invoke_result_t<F>()>>(std::move(f));
        auto fut = task->get_future();
        { lock_guard lock(m_); tasks_.push([task] { (*task)(); }); }
        cv_.notify_one();
        return fut;
    }
    ~ThreadPool() {
        { lock_guard lock(m_); stopping_ = true; }
        cv_.notify_all();
        for (auto& w : workers_) w.join();
    }
};

bool isPrime(long n) { if (n < 2) return false; for (long d = 2; d * d <= n; d++) if (n % d == 0) return false; return true; }

int main() {
    ThreadPool pool(4);
    vector<future<int>> results;
    for (int chunk = 0; chunk < 8; chunk++)                       // 8 tasks on 4 threads
        results.push_back(pool.submit([chunk] {
            int count = 0;
            for (long n = chunk * 25000; n < (chunk + 1) * 25000; n++) count += isPrime(n);
            return count;
        }));
    int total = 0;
    for (auto& f : results) total += f.get();                    // get() waits for each result
    cout << "primes below 200000: " << total << "\n";

    auto failing = pool.submit([]() -> int { throw runtime_error("task failed"); });
    try { failing.get(); } catch (const exception& e) { cout << "exception propagated through the future: " << e.what() << "\n"; }
}
```
```js run
// JavaScript's equivalent concern is limiting how many async operations run at once
// (e.g. 1,000 API calls, but at most 4 in flight). A promise pool:
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0, active = 0, maxActive = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;                                // safe: no await between read and increment
      active++; maxActive = Math.max(maxActive, active);
      try { results[i] = await fn(items[i]); } finally { active--; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { results, maxActive };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchPrice = async (sku) => { await sleep(5 + (sku.length % 3)); return `${sku}:₹${sku.length * 100}`; };

const skus = Array.from({ length: 12 }, (_, i) => `sku-${"x".repeat(i % 4)}${i}`);
const t0 = performance.now();
const { results, maxActive } = await mapWithConcurrency(skus, 4, fetchPrice);
console.log(results.slice(0, 4).join("  "), "…");
console.log(`${results.length} calls done, at most ${maxActive} in flight at once`);
```
:::

Sizing a pool: for **CPU-bound** work, about the number of cores; for **I/O-bound** work, more threads (they mostly wait), roughly cores × (1 + wait time ÷ compute time). In LLD answers, a thread pool appears in the **job scheduler**, **web crawler**, **async logger** and **parallel file processor** problems.

## Reader–writer locks

:::def Reader–writer lock
Allows **many readers at once** or **one writer alone**. Readers don't block each other, which helps when reads vastly outnumber writes (configuration, caches, routing tables).
:::

:::tabs A read-mostly cache with shared_mutex
```cpp run
#include <bits/stdc++.h>
using namespace std;

class ConfigStore {
    mutable shared_mutex m_;
    unordered_map<string, string> values_;
public:
    optional<string> get(const string& key) const {
        shared_lock lock(m_);                         // many readers in parallel
        auto it = values_.find(key);
        return it == values_.end() ? nullopt : optional<string>(it->second);
    }
    void set(const string& key, string value) {
        unique_lock lock(m_);                         // one writer, no readers
        values_[key] = std::move(value);
    }
};

int main() {
    ConfigStore cfg;
    cfg.set("feature.newCheckout", "off");
    atomic<int> reads{0}, sawOn{0};
    vector<thread> readers;
    for (int r = 0; r < 6; r++)
        readers.emplace_back([&] {
            for (int i = 0; i < 20000; i++) {
                if (cfg.get("feature.newCheckout") == "on") sawOn++;
                reads++;
            }
        });
    thread writer([&] { this_thread::sleep_for(chrono::milliseconds(5)); cfg.set("feature.newCheckout", "on"); });
    for (auto& t : readers) t.join();
    writer.join();
    cout << "reads: " << reads << ", final value: " << *cfg.get("feature.newCheckout")
         << ", every read saw either 'off' or 'on' (never a torn value)\n";
}
```
```js run
// On a single JS thread there's nothing to lock for in-memory reads/writes.
// The reader-writer idea still matters for ASYNC operations that span awaits,
// e.g. "readers may refresh concurrently, but a reload must run alone".
class AsyncRWLock {
  #readers = 0; #writer = false; #queue = [];
  #sleep() { return new Promise((r) => this.#queue.push(r)); }
  #wake() { this.#queue.splice(0).forEach((r) => r()); }
  // The check and the update must happen with NO await in between, or two tasks could both pass the check.
  async read(fn) {
    while (this.#writer) await this.#sleep();
    this.#readers++;
    try { return await fn(); } finally { this.#readers--; this.#wake(); }
  }
  async write(fn) {
    while (this.#writer || this.#readers > 0) await this.#sleep();
    this.#writer = true;
    try { return await fn(); } finally { this.#writer = false; this.#wake(); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lock = new AsyncRWLock(), timeline = [];
let config = { version: 1 };
const reader = (id) => lock.read(async () => { timeline.push(`R${id} start v${config.version}`); await sleep(5); timeline.push(`R${id} end`); });
const reload = () => lock.write(async () => { timeline.push("W start"); await sleep(5); config = { version: 2 }; timeline.push("W end (v2)"); });

await Promise.all([reader(1), reader(2), reload(), reader(3)]);
console.log(timeline.join(" | "));
console.log("(R3 overtook the waiting writer: readers can starve writers unless the lock queues fairly)");
```
:::

Caveats: reader–writer locks have more overhead than plain mutexes, so they only pay off with many readers and long-ish read sections; and some implementations can **starve writers** under a constant stream of readers. For read-mostly data that changes rarely, **copy-on-write** (readers use an immutable snapshot; a writer builds a new version and swaps a pointer atomically) often beats any lock.

## Semaphores

:::def Semaphore
A counter of available **permits**. `acquire` takes a permit (waiting if none are left); `release` returns one. A semaphore with N permits lets at most N tasks into a section at once. (A mutex is like a semaphore with one permit, plus ownership.)
:::

Use cases: cap concurrent database connections, limit parallel downloads, bound in-flight requests to a fragile partner API. C++20 has `std::counting_semaphore`; in JavaScript, the promise pool above plays the same role.

```quiz
? Why does a thread pool run each task OUTSIDE the lock that protects its task queue?
+ Holding the lock while running a long task would block every other worker from taking tasks
- Tasks can't access locks
- To make tasks run in order
> Hold locks only for the brief queue operations; do the real work unlocked.

? A bounded blocking queue is full. What happens to a producer calling put()?
+ It waits (blocks) until a consumer takes an item, which applies backpressure to producers
- The oldest item is silently overwritten
- It throws immediately
> Blocking is one policy; others reject or drop, but the default bounded queue blocks.

? When does a reader–writer lock beat a plain mutex?
+ When reads vastly outnumber writes and read sections aren't trivial, so concurrent readers save real time
- When writes are frequent
- Always
> With frequent writes or tiny critical sections, its extra overhead makes it slower than a mutex.

? You must call an API for 10,000 items, but the partner allows at most 5 concurrent requests. What do you build in JavaScript?
+ A promise pool / semaphore with 5 permits (at most 5 calls in flight)
- `await Promise.all` over all 10,000 calls at once
- A for loop awaiting one call at a time
> Promise.all would open 10,000 requests; one at a time is too slow; a bounded pool is right.
```

:::keypoints
- **Producer–consumer** with a **bounded blocking queue** (mutex + two condition variables, plus a close protocol) decouples speeds and gives backpressure.
- A **thread pool** reuses a fixed set of workers pulling from a task queue; return results via **futures**; run tasks outside the lock; size by CPU vs I/O.
- **Reader–writer locks** (`shared_mutex`) let readers run together; consider copy-on-write for read-mostly data.
- **Semaphores** cap concurrency. In JavaScript, async queues, **promise pools** and async locks play these roles across `await` points.
:::
