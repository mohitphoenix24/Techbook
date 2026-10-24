---
title: "Designing thread-safe classes: patterns and a checklist"
level: intermediate
time: 40
summary: The main ways to make a class safe when many threads use it: unchangeable objects, keeping data in one thread, a class with its own lock, copy-on-write snapshots, call_once, an active object, a thread-safe LRU cache, and a checklist to use in interviews.
---

When an LLD problem says "many users" or "concurrent requests", the interviewer expects you to **explain how your design stays correct**. This lesson gives you the ways to do that, and a checklist to speak from.

## Way 1: make the shared thing unchangeable (immutable)

If an object **never changes after it is created**, any number of threads can read it **without any lock**. This is the best option when you can use it.

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

## Way 2: don't share (thread confinement)

If each piece of data is used by **only one thread**, there is nothing to race on. Examples: a new object for each request, a per-thread cache, or an "actor" where one thread owns the object and others send it messages.

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

## Way 3: a class that protects itself (monitor)

Every public method locks **one internal mutex**. The object looks after itself, and callers do not need to know about locks. This is the default for shared objects that change (like the `Account` from the earlier lesson).

Rules for such a class:

1. **Every** access to the shared data (even a read-only method) locks the **same** mutex.
2. Make operations **big enough** that callers never need to join two calls into one step. Offer `transfer`, `withdrawIfEnough`, `putIfAbsent`. Do not make callers do `get` and then `put`.
3. **Never give out references to the inside.** Callers could use them without the lock. Return copies.
4. **Do not call outside code** (virtual functions, callbacks) while holding the lock.

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

## Way 4: copy-on-write snapshot (for data that is read often and changed rarely)

For settings that are read all the time and changed rarely, keep the data in an **unchangeable object behind a `shared_ptr`**. A reader takes the pointer (a very short step) and then reads **with no lock**. A writer builds a **new** object and swaps the pointer.

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

## Creating something once, safely (lazy initialisation)

| You need | Use |
|---|---|
| One global object | a function-local `static` (Meyers Singleton). Its creation is thread-safe |
| A member that is created once, later | `std::call_once(flag, init)` |
| A check-then-create | **never** write `if (!p) p = new T;` without protection |

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

A famous bug is **double-checked locking** with a plain pointer: `if (!p) { lock; if (!p) p = new T; }`. It is broken, because another thread may see the pointer before the object is fully built. Use `call_once` or a static local instead.

## Way 5: the active object (one owner thread)

Instead of locking, give the object **its own thread and its own queue**. Callers **post requests** and get futures. One worker runs them one by one, so the object's data is touched by **only one thread**.

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

## A thread-safe LRU cache (a very common question)

An LRU cache needs a map (to find items fast) and a list (to remember which was used last). One mutex protects both, and every operation is one locked step.

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

If many threads fight for this one lock, split the cache into **N parts (shards)** using `hash(key) % N`. Each part has its own lock and its own LRU list.

## The thread-safety checklist

At the end of an interview design, say these eight things:

1. **What is shared and can change?** Name it (the balance, the seat map, the cache).
2. **How is each piece protected?** Immutable, one-thread only, own lock (monitor), atomic, copy-on-write, or active object.
3. **What rules must hold**, and which steps must happen together? (check then act, transfers)
4. **Locks:** one lock per structure? If several, a fixed order or `scoped_lock`.
5. **No outside code under a lock**, and no references to the inside given out.
6. **Waiting without spinning:** condition variables. And the **shutdown** path.
7. **Errors and fairness:** RAII releases locks when errors happen. Avoid starving a thread.
8. **How I would test it:** stress tests, ThreadSanitizer, and tests with a controlled scheduler.

## Short answer to say in an interview

:::interview How do you make a class thread-safe?
"First I ask whether it really needs to be shared and changeable. Unchangeable objects and data kept in one thread need no locks. Otherwise I give the class one internal mutex that protects its rules. Every public method locks it with RAII, steps like check-and-reserve or transfer are single methods so nothing can slip in between, and I never give out references to the inside or call outside code under the lock. For data that is read often and changed rarely, I use copy-on-write snapshots or shared_mutex. If there are several locks, I name the order. Then I verify with stress tests and ThreadSanitizer."
:::

```quiz
? Why is if (!ptr) ptr = new T; unsafe with many threads?
- It leaks memory
+ Two threads can both see null and both create an object (and one may see a half-built one)
- It is slow
> Use a function-local static or std::call_once.
? Why return a copy instead of a reference from a getter in a self-protecting class?
- Copies are faster
+ A reference would let callers read or write the data without the lock
- References cannot be returned
> The lock protects only while you are inside the method.
? What is the main idea of an active object?
- Using atomics
+ One owner thread runs all the requests from a queue, so the data needs no lock
- Using more threads
> Sharing is replaced by sending messages.
```

:::keypoints
- Prefer unchangeable objects and data kept in one thread. Otherwise use a class with one internal mutex and single-step compound operations.
- Copy-on-write snapshots for read-heavy data, `call_once` or a static local for lazy creation, and an active object to avoid locks.
- Never leak references or call outside code under a lock. Always say what is shared, how it is protected, the rules, the lock order and how you test.
:::
