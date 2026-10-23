---
title: Designing thread-safe classes: patterns and a checklist
level: advanced
time: 40
summary: The strategies for making a class safe under concurrency (immutability, confinement, locking, lock-free handoff), the monitor object, read-copy-update with shared_ptr, thread-safe singleton and lazy initialisation with call_once, active object, a thread-safe LRU cache, and a checklist for interview answers.
---

When an LLD problem says "many users" or "concurrent requests", you are expected to **say how the design stays correct**. This lesson collects the strategies and the checklist.

## Strategy 1: make the shared thing immutable

An object that **never changes after construction** can be read by any number of threads with no locks. This is the best option.

```cpp run title="Immutable value objects need no locking"
#include <iostream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

class Price {                                               // immutable: no setters, const members
    const long paise_;
    const string currency_;
public:
    Price(long p, string c) : paise_(p), currency_(move(c)) {}
    Price plus(const Price& o) const { return Price(paise_ + o.paise_, currency_); }   // returns a NEW object
    long paise() const { return paise_; }
};

int main() {
    const Price base(10000, "INR");
    vector<thread> ts;
    vector<long> results(4);
    for (int i = 0; i < 4; ++i)
        ts.emplace_back([&, i] { results[i] = base.plus(Price(i * 100, "INR")).paise(); });   // 4 threads read `base` freely
    for (auto& t : ts) t.join();
    for (long r : results) cout << r << " ";
    cout << "\n";
}
```

## Strategy 2: thread confinement (don't share)

If each piece of data is touched by **exactly one thread**, there is no race. Examples: per-request objects, thread-local caches, the "actor" model where one thread owns an object and others send it messages.

```cpp run title="thread_local: each thread has its own copy"
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

thread_local int perThreadCounter = 0;                      // one independent variable per thread

int main() {
    vector<int> finals(3);
    vector<thread> ts;
    for (int t = 0; t < 3; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i <= t; ++i) ++perThreadCounter; finals[t] = perThreadCounter; });
    for (auto& th : ts) th.join();
    cout << finals[0] << " " << finals[1] << " " << finals[2] << " (no locking, no interference)\n";
}
```

## Strategy 3: the monitor object (lock inside the class)

Every public method locks one internal mutex, so the object **protects itself**. Callers need no knowledge of locking. This is the default for shared mutable objects (the `Account` of the earlier lesson).

Design rules for a monitor class:

1. **All** accesses to the shared state (including `const` readers) lock the same mutex.
2. Make operations **coarse enough** that callers never need to combine two calls atomically (offer `transfer`, `withdrawIfEnough`, `putIfAbsent`, not `get` + `put`).
3. **Never return references to internal data** (callers would use them without the lock). Return copies or snapshots.
4. **Do not call out** (virtual functions, callbacks) while holding the lock.

```cpp run title="A thread-safe inventory with atomic compound operations"
#include <iostream>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

class Inventory {
    mutable mutex m_;
    map<string, int> stock_;
public:
    void add(const string& item, int qty) { lock_guard l(m_); stock_[item] += qty; }
    bool reserve(const string& item, int qty) {             // check-and-take is ONE step
        lock_guard l(m_);
        auto it = stock_.find(item);
        if (it == stock_.end() || it->second < qty) return false;
        it->second -= qty;
        return true;
    }
    int count(const string& item) const { lock_guard l(m_); auto it = stock_.find(item); return it == stock_.end() ? 0 : it->second; }
    map<string, int> snapshot() const { lock_guard l(m_); return stock_; }      // a COPY, never a reference
};

int main() {
    Inventory inv;
    inv.add("pen", 100);
    atomic<int> sold{0};
    vector<thread> buyers;
    for (int b = 0; b < 8; ++b)
        buyers.emplace_back([&] { for (int i = 0; i < 20; ++i) if (inv.reserve("pen", 1)) ++sold; });   // 160 attempts for 100 pens
    for (auto& t : buyers) t.join();
    cout << "sold " << sold << ", left " << inv.count("pen") << " (never oversold)\n";
}
```

## Strategy 4: copy-on-write snapshot (read-mostly data)

For configuration read constantly and rarely changed, keep the data in an **immutable object behind a `shared_ptr`**. Readers grab the pointer (a quick, brief lock or atomic) and then read **without any lock**. A writer builds a **new** object and swaps the pointer.

```cpp run title="Readers never block writers (and vice versa)"
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
using namespace std;

class Settings {
    using Map = map<string, string>;
    mutable mutex m_;
    shared_ptr<const Map> current_ = make_shared<const Map>();
public:
    shared_ptr<const Map> snapshot() const { lock_guard l(m_); return current_; }       // cheap: copies a pointer
    void set(const string& k, const string& v) {
        lock_guard l(m_);
        auto next = make_shared<Map>(*current_);             // copy the whole map
        (*next)[k] = v;
        current_ = move(next);                               // publish the new version; old readers keep the old one alive
    }
};

int main() {
    Settings s;
    s.set("theme", "dark");
    auto before = s.snapshot();                              // a reader takes a snapshot
    s.set("theme", "light");                                 // a writer publishes a new version
    cout << "reader's snapshot still says: " << before->at("theme") << "\n";
    cout << "new readers see: " << s.snapshot()->at("theme") << "\n";
}
```

This is the idea behind **RCU** (read-copy-update) and persistent data structures.

## Thread-safe lazy initialisation

| Need | Use |
|---|---|
| One global instance | function-local `static` (Meyers Singleton): initialisation is thread-safe |
| Lazy member initialised once | `std::call_once(flag, init)` |
| Racy "check, then create" | **never** `if (!p) p = new T;` without protection |

```cpp run title="std::call_once for a lazy member"
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

class Report {
    mutable once_flag once_;
    mutable string body_;
    void build() const { cout << "  (building the report body exactly once)\n"; body_ = "quarterly figures"; }
public:
    const string& body() const { call_once(once_, [this] { build(); }); return body_; }
};

int main() {
    Report r;
    vector<thread> ts;
    for (int i = 0; i < 4; ++i) ts.emplace_back([&] { (void)r.body(); });       // four threads race to be the first
    for (auto& t : ts) t.join();
    cout << r.body() << "\n";
}
```

The famous bug is **double-checked locking** done with a plain pointer: `if (!p) { lock; if (!p) p = new T; }`. It is broken without atomics/acquire-release because another thread may see the pointer before the object is fully constructed. Use `call_once` or a static local instead.

## Strategy 5: the active object (one owner thread)

Instead of locking, give the object **its own thread and queue**. Callers post requests (commands) and get futures; the single worker runs them one by one, so the object's state is touched by **one thread only**.

```cpp run title="An active object: a counter owned by one thread"
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
using namespace std;

class ActiveCounter {
    int value_ = 0;                                          // touched ONLY by the worker thread: no lock needed
    queue<function<void()>> inbox_;
    mutex m_; condition_variable cv_; bool stop_ = false;
    thread worker_;
    void loop() {
        for (;;) {
            function<void()> job;
            { unique_lock l(m_); cv_.wait(l, [&] { return stop_ || !inbox_.empty(); }); if (stop_ && inbox_.empty()) return; job = move(inbox_.front()); inbox_.pop(); }
            job();
        }
    }
    template <typename F> auto post(F f) -> future<decltype(f())> {
        auto t = make_shared<packaged_task<decltype(f())()>>(move(f));
        auto fut = t->get_future();
        { lock_guard l(m_); inbox_.push([t] { (*t)(); }); }
        cv_.notify_one();
        return fut;
    }
public:
    ActiveCounter() : worker_([this] { loop(); }) {}
    ~ActiveCounter() { { lock_guard l(m_); stop_ = true; } cv_.notify_all(); worker_.join(); }
    future<void> increment() { return post([this] { ++value_; }); }
    future<int> read() { return post([this] { return value_; }); }
};

int main() {
    ActiveCounter c;
    vector<thread> clients;
    for (int i = 0; i < 4; ++i) clients.emplace_back([&] { for (int k = 0; k < 250; ++k) c.increment(); });
    for (auto& t : clients) t.join();
    cout << "value = " << c.read().get() << " (expected 1000)\n";
}
```

## A thread-safe LRU cache (a common interview question)

An LRU cache needs a map for lookup and a list for recency. A single mutex protects both, and every operation is one critical section.

```cpp run title="Thread-safe LRU cache with one mutex"
#include <iostream>
#include <list>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using namespace std;

class LruCache {
    size_t capacity_;
    list<pair<int, string>> order_;                                      // front = most recent
    unordered_map<int, list<pair<int, string>>::iterator> index_;
    mutable mutex m_;
public:
    explicit LruCache(size_t c) : capacity_(c) {}
    optional<string> get(int key) {
        lock_guard l(m_);
        auto it = index_.find(key);
        if (it == index_.end()) return nullopt;
        order_.splice(order_.begin(), order_, it->second);               // move to the front: O(1)
        return it->second->second;
    }
    void put(int key, string value) {
        lock_guard l(m_);
        auto it = index_.find(key);
        if (it != index_.end()) { it->second->second = move(value); order_.splice(order_.begin(), order_, it->second); return; }
        order_.emplace_front(key, move(value));
        index_[key] = order_.begin();
        if (order_.size() > capacity_) { index_.erase(order_.back().first); order_.pop_back(); }   // evict the least recent
    }
    size_t size() const { lock_guard l(m_); return order_.size(); }
};

int main() {
    LruCache cache(100);
    vector<thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 1000; ++i) { cache.put((t * 7 + i) % 300, "v"); (void)cache.get(i % 300); } });
    for (auto& th : ts) th.join();
    cout << "size after the storm: " << cache.size() << " (never above 100)\n";
}
```

With very high contention, split the cache into **N shards** by `hash(key) % N`, each with its own lock and LRU list (lock striping).

## The thread-safety checklist

When you finish a design in an interview, say:

1. **What is shared and mutable?** Name it (the balance, the seat map, the cache).
2. **Which strategy protects each piece?** Immutable, confined, monitor (mutex), atomic, copy-on-write, or active object.
3. **What are the invariants**, and which operations must be atomic together? (check-then-act, transfers)
4. **Lock order and granularity**: one lock per structure? If several, a global order or `scoped_lock`.
5. **No calls to unknown code under a lock**; no references to internals leaking out.
6. **Waiting without spinning**: condition variables; **shutdown** path.
7. **Failure and fairness**: exceptions leave locks released (RAII); avoid starvation.
8. **How I would test it**: stress tests, ThreadSanitizer, deterministic tests with injected schedulers.

:::interview How do you make a class thread-safe?
"First I ask whether it needs to be shared and mutable at all: immutable objects and thread-confined data need no locks. Otherwise I make it a monitor: one mutex protects its invariants, every public method locks it with RAII, compound operations like check-and-reserve or transfer are single methods so there is no gap, and I never return references to internals or call out while holding the lock. For read-mostly data I use copy-on-write snapshots or a shared_mutex. I name the lock order if several locks exist, and I verify with stress tests and ThreadSanitizer."
:::

```quiz
? Why is `if (!ptr) ptr = new T;` unsafe in multithreaded code?
- It leaks memory
+ Two threads can both see null and both create an object (and a thread may see a half-built one)
- It is slow
> Use a function-local static or std::call_once.
? Why return a copy (snapshot) rather than a reference from a monitor's getter?
- Copies are faster
+ A reference would let callers read or write the data without the lock
- References cannot be returned
> The lock protects only while inside the method.
? What is the main idea of an active object?
- Using atomics
+ One owner thread executes all operations posted to a queue, so the state needs no lock
- Using more threads
> Sharing is replaced by messaging.
```

:::keypoints
- Prefer immutability and thread confinement; otherwise a monitor class with one internal mutex and atomic compound operations.
- Copy-on-write snapshots for read-mostly data; `call_once` or a static local for lazy init; an active object to avoid locks.
- Never leak references or call out under a lock. State your shared data, strategy, invariants, lock order and test plan.
:::
