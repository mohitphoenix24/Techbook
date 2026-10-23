---
title: Condition variables, blocking queues and semaphores
level: advanced
time: 40
summary: Waiting for a condition without spinning, the wait-with-predicate rule and spurious wakeups, a bounded blocking queue for producer-consumer, shutdown handling, counting semaphores, latches and barriers.
---

A mutex answers "who may touch the data?". A **condition variable** answers "wait until the data is **ready**". Without it, a consumer would **spin** (loop checking a flag), burning CPU, or sleep for guessed intervals.

## The pattern

```cpp run title="One producer, one consumer, a single slot"
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <thread>
using namespace std;

mutex m;
condition_variable cv;
bool ready = false;
int payload = 0;

int main() {
    thread consumer([] {
        unique_lock<mutex> lock(m);
        cv.wait(lock, [] { return ready; });               // sleeps until ready is true; atomically releases the lock while sleeping
        cout << "consumer got " << payload << "\n";
    });
    thread producer([] {
        { lock_guard<mutex> lock(m); payload = 42; ready = true; }    // change the condition UNDER the mutex
        cv.notify_one();                                    // wake the waiter (after unlocking is fine)
    });
    producer.join(); consumer.join();
}
```

Rules (memorise these):

1. **Always wait with a predicate**: `cv.wait(lock, pred)`. A thread can wake **spuriously** (without a notify), and `notify` can come before the wait. The predicate re-checks the real condition in a loop.
2. **Change the shared condition while holding the mutex**, then notify.
3. `wait` needs a `unique_lock` (it must unlock while sleeping and relock when waking).
4. `notify_one` wakes one waiter; `notify_all` wakes all (use it when several different conditions may now be true, or on shutdown).

## A bounded blocking queue (producer-consumer)

This is the most useful concurrent data structure in LLD: logger back-ends, task schedulers, thread pools, message brokers, pipelines.

```cpp run title="BlockingQueue<T>: push blocks when full, pop blocks when empty"
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <numeric>
#include <queue>
#include <thread>
#include <vector>
using namespace std;

template <typename T>
class BlockingQueue {
    mutex m_;
    condition_variable notEmpty_, notFull_;
    queue<T> q_;
    const size_t capacity_;
public:
    explicit BlockingQueue(size_t cap) : capacity_(cap) {}

    void push(T item) {
        unique_lock lock(m_);
        notFull_.wait(lock, [&] { return q_.size() < capacity_; });      // block while full: back-pressure
        q_.push(move(item));
        notEmpty_.notify_one();
    }
    T pop() {
        unique_lock lock(m_);
        notEmpty_.wait(lock, [&] { return !q_.empty(); });               // block while empty
        T item = move(q_.front());
        q_.pop();
        notFull_.notify_one();
        return item;
    }
};

int main() {
    BlockingQueue<int> queue(3);                            // tiny capacity: producers must wait for consumers
    const int kProducers = 3, kPerProducer = 200;
    vector<thread> producers;
    for (int p = 0; p < kProducers; ++p)
        producers.emplace_back([&] { for (int i = 1; i <= kPerProducer; ++i) queue.push(i); });

    long total = 0;
    thread consumer([&] { for (int n = 0; n < kProducers * kPerProducer; ++n) total += queue.pop(); });

    for (auto& t : producers) t.join();
    consumer.join();
    cout << "consumed total = " << total << " (expected " << kProducers * (kPerProducer * (kPerProducer + 1) / 2) << ")\n";
}
```

The **capacity limit** gives **back-pressure**: if consumers are slow, producers slow down instead of memory growing without bound.

## Shutting down cleanly

A consumer blocked in `pop()` must be woken when no more work will come. Add a **closed** flag.

```cpp run title="A queue that can be closed"
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <optional>
#include <queue>
#include <thread>
#include <vector>
using namespace std;

template <typename T>
class ClosableQueue {
    mutex m_;
    condition_variable cv_;
    queue<T> q_;
    bool closed_ = false;
public:
    void push(T v) { { lock_guard l(m_); q_.push(move(v)); } cv_.notify_one(); }
    void close() { { lock_guard l(m_); closed_ = true; } cv_.notify_all(); }       // wake EVERYONE so they can exit
    optional<T> pop() {                                     // empty optional = closed and drained
        unique_lock lock(m_);
        cv_.wait(lock, [&] { return !q_.empty() || closed_; });
        if (q_.empty()) return nullopt;
        T v = move(q_.front()); q_.pop();
        return v;
    }
};

int main() {
    ClosableQueue<int> q;
    long sum = 0; mutex sumM;
    vector<thread> workers;
    for (int w = 0; w < 3; ++w)
        workers.emplace_back([&] {
            while (auto item = q.pop()) { lock_guard l(sumM); sum += *item; }      // exits when pop() returns nothing
        });
    for (int i = 1; i <= 100; ++i) q.push(i);
    q.close();
    for (auto& t : workers) t.join();
    cout << "sum = " << sum << " (expected 5050)\n";
}
```

This "close and drain" shape is how thread pools and pipelines shut down gracefully.

## Semaphores, latches and barriers (C++20)

| Tool | Meaning | Example |
|---|---|---|
| `counting_semaphore<N>` | at most N holders; `acquire()` / `release()` | limit to 3 concurrent downloads |
| `binary_semaphore` | like a mutex-ish flag that any thread may release | signal between threads |
| `latch` | one-shot countdown: threads wait until the count reaches 0 | "start when all workers are ready" |
| `barrier` | reusable: all threads wait for each other each phase | iterative parallel algorithms |

```cpp run title="A semaphore limits concurrency; a latch waits for workers"
#include <atomic>
#include <iostream>
#include <latch>
#include <semaphore>
#include <thread>
#include <vector>
using namespace std;

int main() {
    counting_semaphore<3> slots(3);                         // at most 3 "downloads" at once
    atomic<int> running{0}, peak{0};
    latch done(6);                                          // wait for 6 workers

    vector<thread> ts;
    for (int i = 0; i < 6; ++i)
        ts.emplace_back([&] {
            slots.acquire();
            int now = ++running;
            int p = peak.load();
            while (now > p && !peak.compare_exchange_weak(p, now)) {}      // track the maximum
            this_thread::sleep_for(chrono::milliseconds(10));
            --running;
            slots.release();
            done.count_down();
        });
    done.wait();                                            // returns when all 6 have counted down
    for (auto& t : ts) t.join();
    cout << "peak concurrency <= 3: " << boolalpha << (peak.load() <= 3) << "\n";
}
```

## Pitfalls

- **Lost wakeup**: notifying before anyone waits, with no persistent condition. The predicate in `wait` avoids this because the flag remains true.
- **Notify while the data isn't changed under the mutex**: the waiter may miss the change.
- **Using `if` instead of a predicate/`while`**: spurious wakeups give wrong behaviour.
- **Forgetting shutdown**: threads stuck in `wait` forever. Close and `notify_all`.
- **Holding the lock while doing slow work** after waking: copy the item out, unlock, then process.

:::interview Implement a bounded blocking queue
"A mutex protects a `std::queue`, with two condition variables: `notFull` and `notEmpty`. `push` waits on `notFull` with a predicate `size < capacity`, pushes, and notifies `notEmpty`. `pop` waits on `notEmpty` with `!empty()`, pops, and notifies `notFull`. I always wait with a predicate for spurious wakeups. For shutdown I add a closed flag and `notify_all`. The capacity gives back-pressure."
:::

```quiz
? Why must `cv.wait` use a predicate?
- It is faster
+ To handle spurious wakeups and notifications that happen before the wait
- It is required by the compiler
> The predicate re-checks the real condition each time the thread wakes.
? Why use two condition variables in a bounded queue?
- To confuse readers
+ One for "not full" (producers wait) and one for "not empty" (consumers wait)
- Because mutexes need them
> Separate conditions avoid waking the wrong kind of waiter.
? How do you stop blocked consumers at shutdown?
- Kill the thread
+ Set a closed flag and notify_all so they wake, see the flag, and exit
- Wait a long time
> Waiters must be woken to observe the shutdown condition.
```

:::keypoints
- Condition variable = wait for a condition without spinning. Always `wait(lock, predicate)`; change state under the mutex; then notify.
- A bounded blocking queue (mutex + two condition variables) is the core producer-consumer structure and gives back-pressure.
- Shut down with a closed flag + `notify_all`. C++20 adds semaphores, latches and barriers.
:::
