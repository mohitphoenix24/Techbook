---
title: Threads, data races and why they matter
level: intermediate
time: 35
summary: Start and join threads, pass arguments safely, understand what a data race is with the lost-update example, and learn the first fixes: a mutex, an atomic, or not sharing at all.
---

Many LLD problems quietly assume **many users at the same time**: a parking lot with several gates, ticket booking, a cache, a rate limiter. Interviewers often ask: **"What if two threads do this at the same time?"**

This lesson gives you a clear mental picture and the C++ tools to answer.

## First, what is a thread?

A **thread** is one line of work running inside your program. A normal program has one thread. With more threads, several things can run **at the same time**.

:::analogy Think of a kitchen whiteboard
Several cooks write the number of remaining eggs on one shared whiteboard. The board says 10. Two cooks read "10" at the same time. Each takes 2 eggs. Each writes "8". The real answer should be 6, but the board says 8.

Neither cook did anything wrong alone. Their steps just **got mixed up**. This is called a **race condition**.
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

1. A `std::thread` **must be joined or detached** before it is destroyed. Otherwise the program stops with `std::terminate`.
2. Arguments are **copied** into the thread. To pass a reference, write `std::ref(x)`. Be careful with pointers to local variables that may disappear before the thread ends.
3. `join()` means "wait until this thread finishes". `detach()` means "let it run on its own" (usually not a good idea).
4. In C++20, `std::jthread` joins automatically when it is destroyed. It is safer.

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
Two threads use the **same memory** at the same time, **at least one of them writes**, and **nothing coordinates them**. In C++ this is **undefined behaviour**. That does not just mean "a slightly wrong number". It means anything can happen.
:::

The classic example: many threads add to one shared counter.

```cpp title="Display only: a data race (the result differs run to run)"
int counter = 0;
void addMany() { for (int i = 0; i < 100000; ++i) ++counter; }     // ++counter is NOT one step

// two threads running addMany() usually end with counter < 200000
```

Why does it go wrong? `++counter` looks like one step, but it is really **three**:

```text
Thread A               Thread B
read counter  (5)
                       read counter  (5)
add 1         (6)
                       add 1         (6)
write counter (6)
                       write counter (6)      ← one increment was LOST
```

If two threads read the same old value, one of the updates is **lost**.

If you run this under ThreadSanitizer (`-fsanitize=thread`), it reports the race at once. The fixes below make the increment **happen as one piece**, or let **only one thread at a time** do it.

## Fix 1: a mutex

A **mutex** is like a key to a room. Only the thread holding the key can go in. Others wait outside.

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

For **one** variable, `std::atomic` makes the read-add-write **one unbreakable step**, with no lock.

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
| Protects | any amount of data, even several variables together | **one** variable |
| Cost | lock and unlock, may wait | one special CPU instruction, no waiting |
| Use when | a rule connects several variables | a counter, a flag, a pointer |

## Fix 3: do not share

The best way to avoid trouble is **not to share anything**. Give each thread its **own data**, and join the results at the end.

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

(Small note: neighbouring slots of `partial` may share a CPU cache line, which slows things a bit. This is called "false sharing". It is fine for a demo.)

## Words you will hear

| Word | Meaning |
|---|---|
| **Thread-safe** | works correctly when many threads use it together |
| **Race condition** | the result depends on the timing of threads (a wider idea than a data race) |
| **Data race** | unsafe use of the same memory by many threads (undefined behaviour) |
| **Critical section** | the part of the code that touches shared data and must not run in parallel |
| **Atomic operation** | unbreakable: others see it as done or not done, never half done |
| **Deadlock** | threads wait for each other forever (next lesson) |
| **Starvation / livelock** | a thread never gets its turn / threads keep reacting but make no progress |

## Short answer to say in an interview

:::interview What is a data race, and how do you prevent it?
"A data race is when two threads use the same memory at the same time without any coordination, and at least one of them writes. In C++ it is undefined behaviour. I prevent it in three ways: do not share the data at all, protect it with a mutex using lock_guard, or use std::atomic for a single variable. I check my code with ThreadSanitizer."
:::

```quiz
? Why is ++counter not safe with many threads?
- It is a function call
+ It is three steps (read, add, write) that can get mixed up, so updates are lost
- Integers are slow
> Another thread can read the old value before you write the new one.
? What happens if a std::thread is destroyed without join or detach?
- Nothing
+ std::terminate is called
- It joins automatically
> Use join, or std::jthread in C++20.
? When is an atomic better than a mutex?
- To protect several related variables
+ For one counter or one flag
- Never
> An atomic works on a single value. Several related values need a mutex.
```

:::keypoints
- A `std::thread` must be joined or detached. Arguments are copied (use `ref` for references).
- A data race is unsafe shared use of memory, and it is undefined behaviour. `++x` is read, add, write, and it is not atomic.
- Fix it by not sharing, by using a mutex (`lock_guard`), or by using `std::atomic` for one variable. Test with ThreadSanitizer.
:::
