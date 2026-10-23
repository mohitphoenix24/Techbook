---
title: Threads, data races and why they matter
level: intermediate
time: 35
summary: Starting and joining threads with std::thread, passing arguments safely, what a data race is and why it is undefined behaviour, the lost-update bug explained step by step, and the first fixes: mutex and atomic.
---

Most LLD problems with "many users" (a parking lot with several gates, a ticket booking system, a cache, a rate limiter) quietly assume **concurrency**. Interviewers ask: "What if two threads do this at the same time?" You need a clear mental model and the C++ tools.

:::analogy Think of it like this
A shared whiteboard in a kitchen where several cooks note the remaining eggs. Two cooks read "10", each takes 2, each writes "8". The true answer is 6, but the board says 8. They did not do anything wrong individually; they just interleaved their steps. That is a **race condition**.
:::

## Starting threads

```cpp run title="std::thread: start, then join"
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

void work(int id, int& result) { result = id * id; }           // each thread writes to its OWN slot

int main() {
    vector<int> results(4, 0);
    vector<thread> workers;
    for (int i = 0; i < 4; ++i)
        workers.emplace_back(work, i + 1, ref(results[i]));    // ref(): pass by reference explicitly
    for (auto& t : workers) t.join();                          // wait for all of them

    for (int r : results) cout << r << " ";
    cout << "\n";
    cout << "hardware threads: " << (thread::hardware_concurrency() > 0 ? "available" : "unknown") << "\n";
}
```

Rules to remember:

1. A `std::thread` **must be joined or detached** before it is destroyed, otherwise the program calls `std::terminate`.
2. Arguments are **copied** into the thread. Use `std::ref(x)` for a reference. Pointers and references to locals that die before the thread finishes are dangling.
3. `join()` waits for the thread to finish. `detach()` lets it run on its own (rarely a good idea).
4. Threads are RAII-unfriendly by default. C++20's `std::jthread` joins automatically in its destructor and supports cancellation tokens.

```cpp run title="Lambdas capture by value to be safe"
#include <iostream>
#include <string>
#include <thread>
using namespace std;

int main() {
    string greeting = "hello from a thread";
    int answer = 0;
    thread t([greeting, &answer] {                  // greeting copied; answer deliberately shared by reference
        answer = static_cast<int>(greeting.size());
    });
    t.join();                                       // after join, reading answer is safe
    cout << answer << "\n";
}
```

## The data race

:::def Data race
Two threads access the **same memory location** at the same time, **at least one is a write**, and there is **no synchronisation** between them. In C++ a data race is **undefined behaviour**: not "slightly wrong numbers", but anything may happen, including the compiler optimising your loop away.
:::

The classic example: many threads increment a shared counter.

```cpp title="Display only: a data race (the result differs run to run)"
int counter = 0;
void addMany() { for (int i = 0; i < 100000; ++i) ++counter; }     // ++counter is NOT one step

// two threads running addMany() usually end with counter < 200000
```

Why is it wrong? `++counter` is really three steps:

```text
Thread A               Thread B
read counter  (5)
                       read counter  (5)
add 1         (6)
                       add 1         (6)
write counter (6)
                       write counter (6)      ← one increment was LOST
```

Run under ThreadSanitizer (`-fsanitize=thread`), this program is reported as a data race at once. The fixes below all make the increment **indivisible** or **mutually exclusive**.

## Fix 1: a mutex

```cpp run title="Protect the shared data with a mutex"
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
using namespace std;

int main() {
    int counter = 0;
    mutex m;
    auto addMany = [&] {
        for (int i = 0; i < 100000; ++i) {
            lock_guard<mutex> lock(m);                      // only one thread at a time may be in this block
            ++counter;
        }
    };
    vector<thread> ts;
    for (int i = 0; i < 4; ++i) ts.emplace_back(addMany);
    for (auto& t : ts) t.join();
    cout << "counter = " << counter << " (expected 400000)\n";
}
```

## Fix 2: an atomic

For a single variable, `std::atomic` makes the read-modify-write **one indivisible operation** with no lock.

```cpp run title="atomic<int>"
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>
using namespace std;

int main() {
    atomic<int> counter{0};
    auto addMany = [&] { for (int i = 0; i < 100000; ++i) counter.fetch_add(1); };   // or ++counter
    vector<thread> ts;
    for (int i = 0; i < 4; ++i) ts.emplace_back(addMany);
    for (auto& t : ts) t.join();
    cout << "counter = " << counter << " (expected 400000)\n";
}
```

| | `mutex` | `atomic` |
|---|---|---|
| Protects | any amount of data, several variables together | **one** variable (or one small struct) |
| Cost | lock/unlock, may sleep waiting | a special CPU instruction, no sleeping |
| Use when | an invariant spans several variables | a counter, flag or pointer |

## Fix 3: avoid sharing

The best synchronisation is **none**: give each thread **its own** data, then combine at the end.

```cpp run title="Each thread sums its own range"
#include <iostream>
#include <numeric>
#include <thread>
#include <vector>
using namespace std;

int main() {
    vector<int> data(1000);
    iota(data.begin(), data.end(), 1);                       // 1..1000
    const int parts = 4;
    vector<long> partial(parts, 0);                          // one slot per thread: no two threads write the same slot
    vector<thread> ts;
    size_t chunk = data.size() / parts;
    for (int p = 0; p < parts; ++p)
        ts.emplace_back([&, p] {
            auto begin = data.begin() + p * chunk;
            partial[p] = accumulate(begin, begin + chunk, 0L);
        });
    for (auto& t : ts) t.join();
    cout << "total = " << accumulate(partial.begin(), partial.end(), 0L) << " (expected 500500)\n";
}
```

(Adjacent slots of `partial` can share a CPU cache line, which slows things down: "false sharing". Fine for a demo.)

## The vocabulary

| Term | Meaning |
|---|---|
| **Thread-safe** | correct when used from several threads at once, without extra locking by the caller |
| **Race condition** | the outcome depends on the timing of threads (broader than a data race) |
| **Data race** | unsynchronised conflicting access to the same memory (undefined behaviour) |
| **Critical section** | code that touches shared data and must not run in parallel |
| **Atomic operation** | indivisible: other threads see it done or not done, never half done |
| **Deadlock** | threads wait for each other forever (next lesson) |
| **Starvation / livelock** | a thread never gets its turn / threads keep reacting without progress |

:::interview What is a data race and how do you prevent it?
"A data race is two threads accessing the same memory without synchronisation, with at least one writing. In C++ it is undefined behaviour. I prevent it by not sharing (thread confinement, immutable data), by protecting shared state with a mutex through `lock_guard`, or by using `std::atomic` for single variables. I check with ThreadSanitizer."
:::

```quiz
? Why is `++counter` not safe from several threads?
- It is a function call
+ It is three steps (read, add, write) that can interleave, losing updates
- Integers are slow
> Another thread can read the old value between your read and your write.
? What happens if a std::thread is destroyed without join or detach?
- Nothing
+ std::terminate is called
- It joins automatically
> Use join (or std::jthread in C++20).
? When is atomic preferable to a mutex?
- For protecting several related variables
+ For a single counter or flag
- Never
> Atomics are lock-free for single values; multi-variable invariants need a mutex.
```

:::keypoints
- `std::thread` must be joined or detached; arguments are copied (use `ref` for references).
- A data race (conflicting unsynchronised access) is undefined behaviour. `++x` is read-modify-write and not atomic.
- Fix by: not sharing, a mutex (`lock_guard`), or `std::atomic` for single variables. Test with ThreadSanitizer.
:::
