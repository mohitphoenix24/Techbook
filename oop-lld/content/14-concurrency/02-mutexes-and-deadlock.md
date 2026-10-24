---
title: Mutexes, lock types and deadlock
level: intermediate
time: 40
summary: How to make a class thread-safe with a mutex, the different lock types and when to use each, what a deadlock is with the two-account transfer example, how to prevent it, reader-writer locks, and how big a locked section should be.
---

## Make a class thread-safe with its own mutex

The usual way: the class **owns a mutex** and **locks it** in every public method that touches shared data.

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

:::warn Check and act must be one locked step
Look at this: `if (acc.balance() >= x) acc.withdraw(x);` If each call locks separately, it is **still a race**. The balance can change **between** the check and the withdrawal. This bug has a name: TOCTOU (time of check, time of use).

The fix: make the whole decision **one method** (like `withdraw` above), so the check and the action happen under **one lock**.
:::

## The lock types

You do not need to remember them all at once. Start with the first row.

| Type | When to use it |
|---|---|
| `lock_guard<mutex>` | the simplest one. It locks for the whole block |
| `unique_lock<mutex>` | more flexible: unlock early, lock again, try to lock. Needed for condition variables |
| `scoped_lock(m1, m2, ...)` (C++17) | locks **several** mutexes together, safely avoiding deadlock |
| `shared_lock<shared_mutex>` | many readers at the same time |
| `recursive_mutex` | the same thread may lock it again (usually a warning sign, avoid) |
| `timed_mutex` | give up after some time: `try_lock_for(100ms)` |

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

Don't memorise the definition yet. Think of it like this:

> "Two people stand face to face in a narrow corridor. Each waits for the other to move. Nobody moves. They wait forever."

:::def Deadlock
Two or more threads each **hold a lock that the other needs**, and they **wait forever**.
:::

For a deadlock to happen, four things must be true together: only one thread can hold the lock, threads hold one lock while waiting for another, locks cannot be taken away, and there is a **circle of waiting**. If you break any one of these, deadlock cannot happen.

The classic example: moving money between two accounts, where each account has its own mutex.

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

Thread 1 holds A and wants B. Thread 2 holds B and wants A. Both wait forever.

### Fix 1: `std::scoped_lock` (take both locks together)

`scoped_lock` takes several mutexes at once, using a method that avoids deadlock.

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

### Fix 2: always lock in the same order

If you must lock one at a time, **always lock in the same order**, for example by account id.

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

### Other rules to avoid deadlock

- **Never call unknown code while holding a lock** (callbacks, virtual functions, observers). That code might take another lock.
- **Hold locks for a short time.**
- Prefer **one mutex per data structure**, not many tangled locks.
- Use **`try_lock` or a time limit** to detect problems and recover.
- Do not lock the **same ordinary mutex twice** in one thread. It deadlocks or is undefined.

## Reader-writer locks

If data is **read often and changed rarely**, let **many readers** in together, and let **one writer** in alone.

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

## How big should the locked part be?

| Style | Good | Not so good |
|---|---|---|
| **Coarse** (one lock for the whole structure) | simple, hard to get wrong | threads queue up, less parallel work |
| **Fine** (a lock for each bucket or node) | more parallel work | complex, risk of deadlock, more overhead |
| **Lock-free** (atomics only) | no waiting | very hard to get right |

Start with **coarse**. Make it finer only when you **measure** that threads are waiting too much. A common middle path is a hash map with **one lock per bucket** (called lock striping).

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

## Short answer to say in an interview

:::interview How do you avoid deadlock when transferring money between two accounts?
"A deadlock needs a circle of waiting. I break it by taking both locks together with std::scoped_lock on both mutexes, which avoids deadlock, or by always locking in a fixed order such as by account id. I also handle a transfer to the same account, keep the locked part short, and never call unknown code while holding a lock."
:::

```quiz
? What is TOCTOU?
- A type of mutex
+ A bug where something checked earlier is no longer true when you act on it
- A deadlock
> Make the check and the action one step under one lock.
? Which lock type takes several mutexes without deadlock?
- lock_guard
+ scoped_lock
- recursive_mutex
> It uses a method that avoids deadlock for all the mutexes you give it.
? When is shared_mutex useful?
- When there are mostly writes
+ When there are many reads and few writes
- With a single thread
> Many readers can go together. A writer goes alone.
```

:::keypoints
- Protect a class's rules with its own mutex, taken with RAII (`lock_guard`, `scoped_lock`). Make check and act one locked step.
- Deadlock is a circle of waiting. Prevent it with `scoped_lock`, a fixed lock order, short locked parts, and no callbacks under a lock.
- Use `shared_mutex` for read-heavy data, and lock striping for big maps. Start coarse and refine only when measured.
:::
