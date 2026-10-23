---
title: Atomics and the memory model
level: advanced
time: 40
summary: std::atomic operations, compare-and-swap loops, a spinlock and a lock-free stack, the meaning of relaxed, acquire, release and sequentially consistent memory orders in plain words, why volatile is not for threads, and when to prefer a mutex.
---

An **atomic** variable supports operations that no other thread can observe half-done. This lesson goes from the simple (a counter) to the subtle (memory ordering). For most LLD answers, `atomic<int>` for counters and flags, and mutexes for everything else, is enough. But you should know what lies underneath.

## Basic operations

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

## Compare-and-swap (CAS)

The building block of lock-free programming: "if the value is still what I expect, replace it; otherwise tell me what it is now."

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

`compare_exchange_weak` may fail spuriously, so it belongs in a loop; `compare_exchange_strong` does not fail spuriously (for single attempts).

## A spinlock from an atomic flag

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

A spinlock burns CPU while waiting, so it only makes sense for **very short** critical sections on multi-core machines. A `std::mutex` sleeps the waiting thread instead, which is better for anything longer.

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

:::warn Lock-free is hard
This stack is correct for a single thread and shows the CAS idea. With several threads, `delete h` is unsafe: another thread may still be reading `h->next` (a **memory-reclamation** problem), and the pointer may be recycled with the same address (the **ABA problem**). Real lock-free structures use hazard pointers, epoch reclamation or tagged pointers. In interviews: *mention* these, then use a mutex.
:::

## Memory ordering, in plain words

Modern CPUs and compilers **reorder** operations for speed. Within one thread you never notice. Between threads you can, unless you tell the machine what order matters. Each atomic operation takes a **memory order**:

| Order | What it guarantees | Cost |
|---|---|---|
| `memory_order_seq_cst` (default) | all threads agree on one global order of all atomic operations | highest, simplest to reason about |
| `memory_order_acquire` (loads) | nothing after this load can move **before** it; sees everything the releasing thread wrote before its release | medium |
| `memory_order_release` (stores) | nothing before this store can move **after** it | medium |
| `memory_order_acq_rel` (read-modify-write) | both | medium |
| `memory_order_relaxed` | only atomicity, **no ordering** between different variables | lowest |

### The release/acquire handshake

The standard idiom: one thread **publishes** data and sets a flag with `release`; another waits for the flag with `acquire`, and is then guaranteed to see the data.

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

If both operations were `relaxed`, the consumer could see `ready == true` and still read an **old or partial** `message`. This is why the ordering matters.

### Relaxed is fine for plain counters

When the atomic is **independent** and nobody uses it to publish other data (statistics, id generators), `relaxed` is enough and fastest.

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

**Rule for interviews:** use the default (`seq_cst`) unless you can explain why a weaker order is correct.

## volatile is NOT for threads

In C++, `volatile` tells the compiler "do not optimise accesses away" (for hardware registers). It gives **no atomicity and no ordering** between threads. A `volatile bool done` is still a data race. Use `std::atomic<bool>`.

## False sharing

Two threads writing **different** variables that sit in the **same CPU cache line** (typically 64 bytes) slow each other down, because the line bounces between cores. Pad hot variables apart:

```cpp run title="alignas to avoid false sharing"
#include <iostream>
using namespace std;

struct alignas(64) PaddedCounter { long value = 0; };       // each counter gets its own cache line

int main() { cout << "sizeof(PaddedCounter) = " << sizeof(PaddedCounter) << "\n"; }
```

## Choosing between mutex and atomic

| Situation | Choose |
|---|---|
| A counter or flag | `atomic` |
| An invariant over several variables (balance and history) | `mutex` |
| Publishing a pointer to immutable data | `atomic<shared_ptr<T>>` (C++20) or a mutex |
| Complex data structure | `mutex` (or a library's concurrent container) |
| Performance critical, proven contended, you can prove correctness | lock-free (rarely) |

:::interview What does memory_order_acquire/release mean?
"Release on a store means all my earlier writes become visible to a thread that later does an acquire load of that same variable and sees my value. Acquire on a load means reads and writes after it cannot be moved before it. Together they give a happens-before edge, so a producer can publish data by writing it and then release-storing a flag, and a consumer that acquire-loads the flag sees the data. Relaxed gives atomicity only. I default to seq_cst unless I can justify weaker."
:::

```quiz
? What does compare_exchange do?
- Compares two atomics
+ Replaces the value only if it still equals the expected one, otherwise reports the current value
- Locks a mutex
> It is the building block for lock-free algorithms (a CAS loop).
? Is `volatile bool done;` safe for signalling between threads?
- Yes
+ No: volatile gives no atomicity or ordering; use atomic<bool>
> volatile is for hardware access, not synchronisation.
? When is memory_order_relaxed acceptable?
- Always
+ For an independent counter that is not used to publish other data
- Never
> Relaxed provides atomicity without ordering relative to other variables.
```

:::keypoints
- `std::atomic` gives indivisible operations: `load`, `store`, `exchange`, `fetch_add`, `compare_exchange`. CAS loops build lock-free updates.
- Memory orders: seq_cst (default, safest), release/acquire (publish/consume), relaxed (counters only).
- `volatile` is not synchronisation. Beware false sharing, ABA and memory reclamation. Prefer a mutex unless you must go lock-free.
:::
