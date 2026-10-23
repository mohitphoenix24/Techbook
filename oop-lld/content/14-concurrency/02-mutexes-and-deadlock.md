---
title: Mutexes, lock types and deadlock
level: intermediate
time: 40
summary: lock_guard, unique_lock and scoped_lock, protecting a class's invariant, the deadlock in a two-account transfer and how scoped_lock and lock ordering fix it, readers-writer locks, recursive and timed mutexes, and how big a critical section should be.
---

## Make a class thread-safe with an internal mutex

The standard approach: the class owns a `mutex` and locks it in every public method that touches shared state.

```cpp run title="A thread-safe bank account"
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
using namespace std;

class Account {
    mutable mutex m_;                                       // mutable: so const methods can lock
    long balance_;
public:
    explicit Account(long b) : balance_(b) {}
    void deposit(long x) { lock_guard<mutex> lock(m_); balance_ += x; }
    bool withdraw(long x) {
        lock_guard<mutex> lock(m_);
        if (x > balance_) return false;                     // check and change happen under ONE lock: no gap for another thread
        balance_ -= x;
        return true;
    }
    long balance() const { lock_guard<mutex> lock(m_); return balance_; }
};

int main() {
    Account acc(1000);
    vector<thread> ts;
    for (int i = 0; i < 4; ++i) ts.emplace_back([&] { for (int k = 0; k < 1000; ++k) { acc.deposit(5); (void)acc.withdraw(5); } });
    for (auto& t : ts) t.join();
    cout << "balance = " << acc.balance() << " (unchanged: 1000)\n";
}
```

:::warn Check-then-act must be one critical section
`if (acc.balance() >= x) acc.withdraw(x);` with two separate locked calls is **still a race**: the balance can change between them (TOCTOU: time of check to time of use). Make the whole decision one method (`withdraw` above) so the check and the action share one lock.
:::

## The lock types

| Type | Use |
|---|---|
| `lock_guard<mutex>` | simplest RAII lock for a whole scope |
| `unique_lock<mutex>` | flexible: unlock early, relock, try-lock, deferred lock, needed by condition variables |
| `scoped_lock(m1, m2, ...)` (C++17) | locks **several** mutexes at once, deadlock-free |
| `shared_lock<shared_mutex>` | many readers at once |
| `recursive_mutex` | the same thread may lock it again (a smell: avoid) |
| `timed_mutex` | `try_lock_for(100ms)` |

```cpp run title="unique_lock: unlock early, relock later"
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
using namespace std;

mutex m;
string log_;

void process(const string& item) {
    unique_lock<mutex> lock(m);
    log_ += item + ";";                                     // short critical section
    lock.unlock();                                          // release BEFORE the slow part
    this_thread::sleep_for(chrono::milliseconds(5));        // pretend slow work, not holding the lock
    lock.lock();
    log_ += item + "-done;";
}

int main() {
    thread a(process, "a"), b(process, "b");
    a.join(); b.join();
    cout << (log_.find("a;") != string::npos && log_.find("b-done;") != string::npos ? "both items logged" : "missing") << "\n";
}
```

## Deadlock

:::def Deadlock
Two or more threads each hold a lock the other needs, and **wait forever**. The four conditions: mutual exclusion, hold and wait, no pre-emption, **circular wait**. Break any one to prevent deadlock.
:::

The textbook case: transferring money between two accounts, each with its own mutex.

```cpp title="Display only: this can deadlock"
void transfer(Account& from, Account& to, long x) {
    lock_guard<mutex> a(from.m_);       // thread 1: transfer(A, B)  locks A, then wants B
    lock_guard<mutex> b(to.m_);         // thread 2: transfer(B, A)  locks B, then wants A  → both wait forever
    from.balance_ -= x;
    to.balance_ += x;
}
```

```text
Thread 1: holds A ──wants──► B
Thread 2: holds B ──wants──► A        a cycle: nobody can proceed
```

### Fix 1: std::scoped_lock (lock all at once)

`scoped_lock` acquires several mutexes using a deadlock-avoidance algorithm.

```cpp run title="transfer() with scoped_lock: safe in both directions"
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
using namespace std;

struct Account {
    mutex m;
    long balance;
    explicit Account(long b) : balance(b) {}
};

bool transfer(Account& from, Account& to, long x) {
    if (&from == &to) return true;                          // locking the same mutex twice would deadlock!
    scoped_lock lock(from.m, to.m);                         // both or neither, in a safe order
    if (from.balance < x) return false;
    from.balance -= x;
    to.balance += x;
    return true;
}

int main() {
    Account a(1000), b(1000);
    vector<thread> ts;
    for (int i = 0; i < 4; ++i) {
        ts.emplace_back([&] { for (int k = 0; k < 2000; ++k) transfer(a, b, 1); });     // A -> B
        ts.emplace_back([&] { for (int k = 0; k < 2000; ++k) transfer(b, a, 1); });     // B -> A (the opposite direction!)
    }
    for (auto& t : ts) t.join();
    cout << "total money: " << a.balance + b.balance << " (must stay 2000)\n";
}
```

### Fix 2: a global lock order

If you must lock one at a time, always lock in the **same global order**, for example by account id or by address:

```cpp run title="Lock ordering by id"
#include <iostream>
#include <mutex>
using namespace std;

struct Account { int id; mutex m; long balance; Account(int i, long b) : id(i), balance(b) {} };

void transfer(Account& from, Account& to, long x) {
    Account& first = from.id < to.id ? from : to;           // everyone locks the lower id first
    Account& second = from.id < to.id ? to : from;
    lock_guard<mutex> l1(first.m);
    lock_guard<mutex> l2(second.m);
    from.balance -= x; to.balance += x;
}

int main() {
    Account a(1, 100), b(2, 100);
    transfer(a, b, 30);
    transfer(b, a, 10);
    cout << a.balance << " " << b.balance << "\n";
}
```

### Other deadlock rules

- **Never call unknown code while holding a lock** (callbacks, virtual functions, observers). It may try to take another lock.
- **Hold locks for as short a time as possible.**
- Prefer **one mutex per data structure**, not a tangle of locks.
- Use **`try_lock` or timeouts** to detect and recover.
- Do not lock the **same non-recursive mutex twice** in one thread (undefined behaviour or deadlock).

## Readers-writer locks

If data is read often and written rarely, allow **many readers at once** and **one exclusive writer**.

```cpp run title="shared_mutex: concurrent reads, exclusive writes"
#include <iostream>
#include <map>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

class Config {
    mutable shared_mutex m_;
    map<string, string> kv_;
public:
    string get(const string& k) const {
        shared_lock lock(m_);                               // many threads may hold this together
        auto it = kv_.find(k);
        return it == kv_.end() ? "" : it->second;
    }
    void set(const string& k, const string& v) {
        unique_lock lock(m_);                               // exclusive: waits for all readers to leave
        kv_[k] = v;
    }
};

int main() {
    Config c;
    c.set("mode", "fast");
    vector<thread> readers;
    int hits[4] = {0, 0, 0, 0};
    for (int i = 0; i < 4; ++i) readers.emplace_back([&, i] { for (int k = 0; k < 1000; ++k) hits[i] += c.get("mode") == "fast"; });
    for (auto& t : readers) t.join();
    cout << hits[0] + hits[1] + hits[2] + hits[3] << " successful reads\n";
}
```

## Granularity: how big should a critical section be?

| Style | Pros | Cons |
|---|---|---|
| **Coarse** (one lock for the whole structure) | simple, hard to get wrong | threads queue up; low parallelism |
| **Fine** (a lock per bucket/node) | more parallelism | complex; deadlock risk; more overhead |
| **Lock-free** (atomics) | no blocking | very hard to get right |

Start coarse. Make it finer only when you measure contention. A concurrent hash map with **one lock per bucket** (striping) is a common compromise.

```cpp run title="Lock striping: 8 buckets, 8 locks"
#include <functional>
#include <iostream>
#include <list>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

class ConcurrentMap {
    static constexpr size_t kStripes = 8;
    struct Bucket { mutable mutex m; list<pair<string, int>> items; };
    Bucket buckets_[kStripes];
    Bucket& bucketFor(const string& k) { return buckets_[hash<string>{}(k) % kStripes]; }
public:
    void put(const string& k, int v) {
        Bucket& b = bucketFor(k);
        lock_guard<mutex> lock(b.m);                        // only this bucket is locked: other keys proceed in parallel
        for (auto& [key, val] : b.items) if (key == k) { val = v; return; }
        b.items.emplace_back(k, v);
    }
    size_t size() const { size_t n = 0; for (const auto& b : buckets_) { lock_guard<mutex> l(b.m); n += b.items.size(); } return n; }
};

int main() {
    ConcurrentMap map;
    vector<thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&, t] { for (int i = 0; i < 250; ++i) map.put("k" + to_string(t * 250 + i), i); });
    for (auto& th : ts) th.join();
    cout << "entries: " << map.size() << " (expected 1000)\n";
}
```

:::interview How do you avoid deadlock in a transfer between two accounts?
"Deadlock needs a circular wait. I break it by acquiring both locks atomically with `std::scoped_lock(a.m, b.m)`, which uses a deadlock-avoidance algorithm, or by always locking in a fixed global order such as by account id. I also handle the self-transfer case, keep critical sections short, and never call unknown code while holding a lock."
:::

```quiz
? What is TOCTOU?
- A kind of mutex
+ A race where a condition checked earlier is no longer true when acted upon
- A deadlock
> Make the check and the action one atomic step under a single lock.
? Which lock type acquires multiple mutexes without deadlock?
- lock_guard
+ scoped_lock
- recursive_mutex
> It uses a deadlock-avoidance algorithm for all the mutexes given.
? When is shared_mutex useful?
- Writes dominate
+ Reads dominate and writes are rare
- Single thread
> Many readers can proceed together; a writer is exclusive.
```

:::keypoints
- Protect invariants with an internal mutex taken via RAII (`lock_guard`, `scoped_lock`). Make check-then-act one critical section.
- Deadlock = circular wait. Prevent with `scoped_lock`, a fixed lock order, short critical sections, and no callbacks under a lock.
- `shared_mutex` for read-mostly data; lock striping for scalable maps. Start coarse, refine only when measured.
:::
