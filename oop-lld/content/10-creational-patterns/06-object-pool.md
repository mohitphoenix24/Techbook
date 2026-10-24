---
title: Object Pool, lazy initialisation and the registry
level: intermediate
time: 35
summary: Three small but useful ideas. An object pool (reuse costly objects like database connections), lazy initialisation (create only when needed) and the multiton (one object per name).
---

Here are three smaller creation ideas. They come up often in LLD problems.

## 1. Object Pool

Don't memorise the definition yet. Think of it like this:

> "Making a new database connection is slow. So keep a few ready, let people **borrow** one, and **return** it when done."

It is like a **library**. You borrow a book, use it, and give it back. The library does not print a new book for each reader.

:::def Object Pool
Keep a set of **ready-made, reusable objects**. Users **borrow** one, use it, and **return** it. We do not create and destroy objects again and again.
:::

Use it when objects are **costly to create** and used for a short time. For example: database connections, threads, big buffers. You may know thread pools and connection pools already. They are object pools.

### A pool that returns objects automatically

The main risk is **forgetting to return** the object. The easy fix: hand out a small wrapper called a **lease**. When the lease goes out of scope, its destructor returns the object to the pool by itself. (This is the RAII idea you saw earlier.)

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

### A pool that is safe for many threads

When many threads share a pool and it is empty, the thread that asks should **wait** until someone returns an object.

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

### Questions to think about

| Question | Typical answer |
|---|---|
| What if the pool is empty? | wait (with a time limit), create more up to a limit, or fail quickly |
| How do we clean an object before reuse? | a `reset()` step; for connections, check them and roll back |
| Who frees the objects at the end? | the pool owns them (`unique_ptr`) |
| How do we avoid forgetting to return? | use the lease (RAII) |
| What if an object is broken? | check it when borrowed; throw it away and make a new one |
| Many threads? | mutex plus condition variable |

## 2. Lazy initialisation

**Lazy** means "do it only when needed". Create a costly object **the first time** someone asks for it, not at start-up.

The Meyers Singleton you saw earlier is lazy. For a member variable, use `std::optional` or `std::call_once`.

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

## 3. Multiton

A Singleton gives **one** object. A **Multiton** gives **one object per key**. For example, one logger per name, or one database per customer.

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

(This small version is not thread-safe. If many threads use it, protect the map with a mutex.)

## Short answer to say in an interview

:::interview How would you design a connection pool?
"The pool owns a fixed number of ready connections. acquire() gives out a lease, which returns the connection automatically when it goes out of scope, so nothing can leak. If no connection is free, the caller waits with a time limit, or fails. I check a connection when it is borrowed and replace it if it is broken. A mutex protects the list. I would also track how many are in use and how long people wait."
:::

```quiz
? Why does acquire() return a lease object?
- To count objects
+ Its destructor returns the object automatically, so nobody can forget
- To make acquire faster
> RAII makes sure the object comes back even when there is an early return or an error.
? What should a thread-safe pool do when it is empty?
- Keep looping and checking
+ Wait on a condition variable (with a time limit) until an object is returned
- Crash
> Waiting properly does not waste CPU.
? What is a Multiton?
- A Singleton with threads
+ A registry that keeps one object per key
- A pool of threads
> Like a Singleton, but one per name or id.
```

:::keypoints
- Object pool = reuse costly objects. Give out a lease that returns the object automatically. Set a size limit. Wait or fail when empty. Use a mutex and a condition variable.
- Lazy initialisation = create it only when first used (`optional`, a function-local static, `call_once`).
- Multiton = one object per key. All of these save work at the cost of some extra code.
:::
