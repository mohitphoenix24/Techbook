---
title: Atomics and the memory model
level: advanced
time: 40
summary: What std::atomic does, how compare-and-swap works, a spinlock, why lock-free code is hard, memory orders explained in plain words, why volatile is not for threads, and when to simply use a mutex.
---

:::note How much do you need from this lesson?
For most LLD interviews, you only need this: **use `atomic<int>` for simple counters and flags, and use a mutex for everything else.** The later parts of this lesson (memory order, lock-free) are optional. Read them if you want to go deeper, or if the interviewer asks.
:::

## What is an atomic?

An **atomic** variable supports operations that **cannot be seen half-done** by another thread. Think of a bank counter where a clerk serves **one customer completely** before starting the next. Nobody can cut in the middle.

## The basic operations

```cpp run title="load, store, exchange, fetch_add"
#include <atomic>
#include <iostream>
using namespace std;

int main() {
    atomic<int> x{10};
    x.store(20);                                    // atomic write
    cout << x.load() << "\n";                       // atomic read
    cout << x.fetch_add(5) << " ";                  // returns the OLD value, then adds
    cout << x.load() << "\n";
    cout << x.exchange(99) << " " << x << "\n";     // swap in a new value, get the old one
    cout << boolalpha << x.is_lock_free() << "\n";  // typically true for int: no mutex underneath
}
```

- `load` reads the value, `store` writes it.
- `exchange` writes a new value and gives back the old one.
- `fetch_add` adds and gives back the old value. All of these happen **as one step**.

## Compare-and-swap (CAS)

This is the building block of lock-free programming. In plain words:

> "If the value is still what I **expect**, change it to the new value. Otherwise, tell me what it is **now**."

```cpp run title="A CAS loop: atomic maximum"
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

atomic<int> highest{0};

void record(int v) {
    int current = highest.load();
    while (v > current && !highest.compare_exchange_weak(current, v)) {
        // on failure, 'current' is refreshed with the latest value, then we re-check v > current and retry
    }
}

int main() {
    vector<thread> ts;
    for (int t = 0; t < 4; ++t) ts.emplace_back([t] { for (int i = 0; i < 1000; ++i) record(t * 1000 + i); });
    for (auto& th : ts) th.join();
    cout << "highest = " << highest << " (expected 3999)\n";
}
```

(`compare_exchange_weak` may sometimes fail for no reason, so use it inside a loop. `compare_exchange_strong` does not fail for no reason, so use it for a single try.)

## A spinlock built from an atomic flag

A **spinlock** keeps checking in a loop until the lock is free.

```cpp run title="A spinlock: busy-wait instead of sleeping"
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

class SpinLock {
    atomic_flag flag_ = ATOMIC_FLAG_INIT;
public:
    void lock() { while (flag_.test_and_set(memory_order_acquire)) { /* spin */ } }
    void unlock() { flag_.clear(memory_order_release); }
};

int main() {
    SpinLock lock;
    long counter = 0;                               // protected by the spinlock
    vector<thread> ts;
    for (int t = 0; t < 4; ++t)
        ts.emplace_back([&] { for (int i = 0; i < 50000; ++i) { lock.lock(); ++counter; lock.unlock(); } });
    for (auto& th : ts) th.join();
    cout << "counter = " << counter << " (expected 200000)\n";
}
```

A spinlock wastes CPU while waiting. So it makes sense only for **very short** locked parts on multi-core machines. A normal `std::mutex` puts the waiting thread to sleep, which is better for anything longer.

## A lock-free stack

```cpp run title="Lock-free push and pop with CAS (single-threaded demo of the logic)"
#include <atomic>
#include <iostream>
using namespace std;

template <typename T>
class LockFreeStack {
    struct Node { T value; Node* next; };
    atomic<Node*> head_{nullptr};
public:
    void push(T v) {
        Node* n = new Node{move(v), head_.load()};
        while (!head_.compare_exchange_weak(n->next, n)) {}          // retry if another thread changed head
    }
    bool pop(T& out) {
        Node* h = head_.load();
        while (h && !head_.compare_exchange_weak(h, h->next)) {}
        if (!h) return false;
        out = move(h->value);
        delete h;                                                     // UNSAFE under concurrency: see the ABA / reclamation note below
        return true;
    }
    ~LockFreeStack() { T tmp; while (pop(tmp)) {} }
};

int main() {
    LockFreeStack<int> s;
    for (int i = 1; i <= 3; ++i) s.push(i);
    int v;
    while (s.pop(v)) cout << v << " ";
    cout << "\n";
}
```

:::warn Lock-free code is hard
This stack shows the CAS idea, and works for one thread. With many threads it has two serious problems: `delete h` is unsafe because another thread may still be reading it, and the same address can be reused so a CAS wrongly succeeds (this is called the **ABA problem**). Real lock-free code uses special tricks (hazard pointers, epoch schemes). In an interview, **mention** these problems, and then use a mutex.
:::

## Advanced (optional): memory order in plain words

:::note Optional section
Skip this on the first read. You can come back later.
:::

Modern CPUs and compilers **change the order** of operations to run faster. In a single thread you never notice. Between threads, you might. Each atomic operation lets you say how much ordering you want. This is the **memory order**.

| Order | In simple words | Cost |
|---|---|---|
| `seq_cst` (default) | everyone agrees on one global order. Easiest to think about | highest |
| `acquire` (for loads) | after this read, I will see everything the writer did before its `release` | medium |
| `release` (for stores) | everything I did before this write becomes visible to the reader that acquires it | medium |
| `acq_rel` | both of the above (for read-modify-write) | medium |
| `relaxed` | the operation is unbreakable, but **no ordering** with other variables | lowest |

### The release and acquire handshake

A common pattern: one thread **prepares data**, then sets a flag with `release`. Another thread waits for the flag with `acquire`. It is then guaranteed to see the data.

```cpp run title="Publishing data with release/acquire"
#include <atomic>
#include <iostream>
#include <string>
#include <thread>
using namespace std;

string message;                                     // ordinary, non-atomic data
atomic<bool> ready{false};

int main() {
    thread producer([] {
        message = "hello from the producer";        // 1. write the data
        ready.store(true, memory_order_release);    // 2. publish: everything above is visible to whoever acquires `ready`
    });
    thread consumer([] {
        while (!ready.load(memory_order_acquire)) {}   // wait for the flag
        cout << message << "\n";                    // guaranteed to see the full message
    });
    producer.join(); consumer.join();
}
```

If both used `relaxed`, the second thread could see `ready == true` and still read **old or half-written** data. That is why the order matters.

### Relaxed is fine for simple counters

When an atomic stands alone (like statistics or an id counter), and nobody uses it to hand over other data, `relaxed` is enough and fastest.

```cpp run title="A relaxed counter"
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

atomic<long> hits{0};

int main() {
    vector<thread> ts;
    for (int t = 0; t < 4; ++t) ts.emplace_back([] { for (int i = 0; i < 100000; ++i) hits.fetch_add(1, memory_order_relaxed); });
    for (auto& th : ts) th.join();
    cout << hits.load() << "\n";
}
```

**Rule for interviews:** use the default (`seq_cst`) unless you can explain why a weaker order is safe.

## `volatile` is NOT for threads

In C++, `volatile` only tells the compiler "do not skip this read or write" (it is meant for hardware registers). It gives **no safety between threads**. A `volatile bool done` is still a data race. Use `std::atomic<bool>`.

## False sharing

If two threads write **different** variables that sit **next to each other** in memory (the same cache line, usually 64 bytes), they slow each other down, because the CPU keeps moving that block between cores. The fix is to space them apart:

```cpp run title="alignas to avoid false sharing"
#include <iostream>
using namespace std;

struct alignas(64) PaddedCounter { long value = 0; };       // each counter gets its own cache line

int main() { cout << "sizeof(PaddedCounter) = " << sizeof(PaddedCounter) << "\n"; }
```

## Atomic or mutex?

| Situation | Choose |
|---|---|
| A counter or a flag | `atomic` |
| A rule that connects several variables (balance and history) | `mutex` |
| A shared pointer to unchanging data | `atomic<shared_ptr<T>>` (C++20) or a mutex |
| A complex data structure | `mutex` (or a ready-made concurrent container) |
| Very high speed, proven contention, and you can prove it is correct | lock-free (rarely) |

## Short answer to say in an interview

:::interview What do acquire and release mean?
"Release on a write means that everything I did before it becomes visible to a thread that later reads the same variable with acquire and sees my value. Acquire on a read means nothing after it can move before it. Together, a producer can write data and then release-store a flag, and a consumer that acquire-loads the flag will see the data. Relaxed gives only an unbreakable operation, with no ordering. I use the default seq_cst unless I can justify a weaker order."
:::

```quiz
? What does compare_exchange do?
- Compares two atomics
+ Changes the value only if it still equals the expected one, otherwise reports the current value
- Locks a mutex
> It is the base of lock-free algorithms (a CAS loop).
? Is volatile bool done; safe for signalling between threads?
- Yes
+ No. volatile gives no atomicity or ordering. Use atomic<bool>
> volatile is for hardware access, not for threads.
? When is memory_order_relaxed fine?
- Always
+ For a stand-alone counter that is not used to hand over other data
- Never
> Relaxed gives an unbreakable operation but no ordering with other variables.
```

:::keypoints
- `std::atomic` gives unbreakable operations: `load`, `store`, `exchange`, `fetch_add`, `compare_exchange`. A CAS loop is the base of lock-free updates.
- Memory orders: `seq_cst` (default and safest), `release` and `acquire` (hand over data), `relaxed` (counters only).
- `volatile` is not for threads. Watch for false sharing and the ABA problem. Use a mutex unless you really must go lock-free.
:::
