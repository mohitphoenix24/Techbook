---
title: Object Pool, lazy initialisation and the registry
level: advanced
time: 35
summary: Reusing expensive objects instead of creating them each time (connections, threads, buffers), an RAII lease that returns the object automatically, a thread-safe blocking pool, plus lazy initialisation and the multiton registry.
---

Three smaller creational ideas that appear often in LLD problems.

## 1. Object Pool

:::def Object Pool
Keep a set of **initialised, reusable objects** ready. Clients **borrow** one, use it, and **return** it, instead of creating and destroying objects repeatedly.
:::

Use it when objects are **expensive to create** (database connections, threads, large buffers, SSL sessions) and used briefly. Examples in the wild: connection pools, thread pools, GPU buffer pools.

### A pool with an RAII lease

The easiest way to *never forget to return* an object is to hand out a **lease**: a small RAII wrapper whose destructor returns the object to the pool.

```cpp run title="Connection pool with automatic return"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

struct Connection {
    int id;
    explicit Connection(int i) : id(i) { cout << "  (opened connection " << id << ", expensive)\n"; }
    string query(const string& q) const { return "conn" + to_string(id) + " ran '" + q + "'"; }
};

class ConnectionPool {
    vector<unique_ptr<Connection>> free_;
    int created_ = 0;
    const int max_;
public:
    explicit ConnectionPool(int max) : max_(max) {}

    class Lease {                                           // RAII: returns the connection when it goes out of scope
        ConnectionPool* pool_;
        unique_ptr<Connection> conn_;
    public:
        Lease(ConnectionPool* p, unique_ptr<Connection> c) : pool_(p), conn_(move(c)) {}
        Lease(Lease&&) noexcept = default;
        Lease& operator=(Lease&&) = delete;
        ~Lease() { if (conn_) pool_->release(move(conn_)); }
        Connection* operator->() { return conn_.get(); }
    };

    Lease acquire() {
        if (!free_.empty()) {                               // reuse
            auto c = move(free_.back());
            free_.pop_back();
            return Lease(this, move(c));
        }
        if (created_ >= max_) throw runtime_error("pool exhausted");
        return Lease(this, make_unique<Connection>(++created_));   // create lazily, up to the limit
    }
    size_t idle() const { return free_.size(); }
private:
    void release(unique_ptr<Connection> c) { free_.push_back(move(c)); cout << "  (returned to pool)\n"; }
};

int main() {
    ConnectionPool pool(2);
    {
        auto a = pool.acquire();
        cout << a->query("SELECT 1") << "\n";
    }                                                       // lease destroyed: connection returns automatically
    {
        auto b = pool.acquire();                            // reuses connection 1: no "opened" message
        auto c = pool.acquire();                            // needs a second one
        cout << b->query("SELECT 2") << " / " << c->query("SELECT 3") << "\n";
        try { auto d = pool.acquire(); } catch (const exception& e) { cout << "  third request: " << e.what() << "\n"; }
    }
    cout << "idle connections: " << pool.idle() << "\n";
}
```

### A thread-safe blocking pool

When threads share a pool and it is empty, a requester should **wait** until someone returns an object.

```cpp run title="Thread-safe pool: acquire blocks until one is free"
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>
using namespace std;

class TokenPool {                                           // a pool of anonymous resources, identified by number
    mutex m_;
    condition_variable cv_;
    queue<int> free_;
public:
    explicit TokenPool(int n) { for (int i = 1; i <= n; ++i) free_.push(i); }
    int acquire() {
        unique_lock lock(m_);
        cv_.wait(lock, [&] { return !free_.empty(); });     // sleeps while empty; no busy waiting
        int t = free_.front(); free_.pop();
        return t;
    }
    void release(int t) {
        { lock_guard lock(m_); free_.push(t); }
        cv_.notify_one();                                   // wake one waiter
    }
};

int main() {
    TokenPool pool(2);                                      // only 2 resources for 6 workers
    mutex outM; int maxInUse = 0, inUse = 0;
    vector<thread> workers;
    for (int w = 0; w < 6; ++w)
        workers.emplace_back([&] {
            int t = pool.acquire();
            { lock_guard l(outM); maxInUse = max(maxInUse, ++inUse); }
            this_thread::sleep_for(chrono::milliseconds(20));      // "use" the resource
            { lock_guard l(outM); --inUse; }
            pool.release(t);
        });
    for (auto& t : workers) t.join();
    cout << "6 workers finished; at most " << maxInUse << " resources were in use at once\n";
}
```

### Pool design questions

| Question | Typical answer |
|---|---|
| What if the pool is empty? | block (with timeout), create up to a maximum, or fail fast |
| How is an object *reset* before reuse? | a `reset()` hook; for connections, validate and roll back |
| Who frees objects on shutdown? | the pool owns them (`unique_ptr`) |
| How to avoid forgetting `release`? | an RAII lease (above) |
| Dead objects (broken connections)? | validate on acquire; discard and replace |
| Thread-safety? | mutex + condition variable (above) |

## 2. Lazy initialisation

Create an expensive object **only when first needed**. The Meyers Singleton does it with a function-local static. For members, use `std::optional` or `std::call_once`.

```cpp run title="Lazy member with optional"
#include <iostream>
#include <optional>
#include <string>
using namespace std;

class Report {
    string title_;
    mutable optional<string> body_;                        // computed on first use, then cached
    string build() const { cout << "  (building the expensive report body)\n"; return "body of " + title_; }
public:
    explicit Report(string t) : title_(move(t)) {}
    const string& body() const {
        if (!body_) body_ = build();
        return *body_;
    }
};

int main() {
    Report r("Q3");
    cout << "constructed, nothing built yet\n";
    cout << r.body() << "\n";
    cout << r.body() << "\n";                              // cached: no second build
}
```

## 3. Multiton (a registry of named single instances)

A **Multiton** keeps one instance **per key** (for example one logger per name, one database per tenant).

```cpp run title="One Logger per name"
#include <iostream>
#include <map>
#include <memory>
#include <string>
using namespace std;

class Logger {
    string name_;
    explicit Logger(string n) : name_(move(n)) {}
public:
    static Logger& get(const string& name) {
        static map<string, unique_ptr<Logger>> instances;
        auto& slot = instances[name];
        if (!slot) slot = unique_ptr<Logger>(new Logger(name));         // created once per name
        return *slot;
    }
    void log(const string& m) const { cout << "  [" << name_ << "] " << m << "\n"; }
};

int main() {
    Logger::get("db").log("connected");
    Logger::get("http").log("listening");
    cout << boolalpha << (&Logger::get("db") == &Logger::get("db")) << " " << (&Logger::get("db") == &Logger::get("http")) << "\n";
}
```

(This sketch is not thread-safe: guard the map with a mutex if used from several threads.)

:::interview Design a connection pool: what do you consider?
"A bounded set of reusable connections owned by the pool. `acquire()` returns an RAII lease that returns the connection on destruction, so leaks are impossible. If none is free it blocks on a condition variable with a timeout or fails. Connections are validated on acquire and replaced if broken. A mutex protects the free list. I would expose size, in-use and wait metrics, and shut down by waiting for leases and closing everything."
:::

```quiz
? Why return a lease object from `acquire()`?
- To count objects
+ Its destructor returns the object automatically, so a borrower cannot forget
- To make acquire faster
> RAII guarantees release, even with early returns or exceptions.
? What should a thread-safe pool do when it is empty?
- Busy-wait in a loop
+ Wait on a condition variable (with a timeout) until an object is released
- Crash
> Condition variables avoid wasting CPU while waiting.
? What is a Multiton?
- A Singleton with threads
+ A registry that keeps one instance per key
- A pool of threads
> Like Singleton, but one per name or id.
```

:::keypoints
- Object Pool: reuse expensive objects. Hand out an RAII lease; bound the size; block or fail when empty; protect with a mutex and condition variable.
- Lazy initialisation: build on first use (`optional`, function-local static, `call_once`).
- Multiton: one instance per key. All three trade memory and complexity for fewer expensive creations.
:::
