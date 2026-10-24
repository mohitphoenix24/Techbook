---
title: Condition variables, blocking queues and semaphores
level: intermediate
time: 40
summary: How to make a thread wait until something is ready, without wasting CPU. Learn the wait-with-predicate rule, a blocking queue for producer and consumer, clean shutdown, and semaphores, latches and barriers.
---

A mutex answers: **"who may touch the data?"**

A **condition variable** answers a different question: **"wait until the data is ready."**

:::analogy Think of a doorbell
You are waiting for a parcel. You can keep opening the door every second to check (wasteful, this is called **spinning**). Or you can sit down and wait for the **doorbell**. A condition variable is that doorbell.
:::

Without it, a thread that waits for work would either **keep checking in a loop** (wasting CPU) or **sleep for a guessed time** (wasting time).

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

Rules to remember:

1. **Always wait with a condition**: `cv.wait(lock, condition)`. A thread can sometimes wake up for no reason (a **spurious wakeup**), and a notify can arrive before anyone is waiting. The condition makes the thread check the real situation again.
2. **Change the shared data while holding the mutex**, and then notify.
3. `wait` needs a `unique_lock`, because it must unlock while sleeping and lock again when it wakes.
4. `notify_one` wakes one waiting thread. `notify_all` wakes all of them. Use `notify_all` when several different conditions may now be true, or when shutting down.

## A bounded blocking queue (producer and consumer)

This is the most useful concurrent structure in LLD. It appears in loggers, task schedulers, thread pools, message brokers and pipelines.

- **Producers** add work to the queue.
- **Consumers** take work from the queue.
- If the queue is **empty**, consumers wait.
- If the queue is **full**, producers wait.

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

The **size limit** gives **back-pressure**. If consumers are slow, producers slow down too. Memory does not grow without limit.

## Shutting down cleanly

A consumer waiting inside `pop()` must be woken up when no more work will come. We add a **closed** flag for that.

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

This "close, then finish what is left" shape is how thread pools and pipelines shut down politely.

## Semaphores, latches and barriers (C++20)

| Tool | What it does | Example |
|---|---|---|
| `counting_semaphore<N>` | at most N threads at once. `acquire()` and `release()` | allow only 3 downloads together |
| `binary_semaphore` | a simple on/off signal that any thread may release | signal between threads |
| `latch` | a one-time countdown. Threads wait until it reaches 0 | "start when all workers are ready" |
| `barrier` | reusable. All threads wait for each other at each step | repeated parallel steps |

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

## Mistakes to avoid

- **Lost wakeup**: notifying before anyone waits, with no saved condition. Waiting with a condition fixes this, because the flag stays true.
- **Changing the data outside the mutex and then notifying**: the waiter may miss the change.
- **Using `if` instead of a condition in `wait`**: a spurious wakeup gives wrong behaviour.
- **Forgetting shutdown**: threads stay stuck in `wait` forever. Close and `notify_all`.
- **Doing slow work while holding the lock** after waking: copy the item out, unlock, then work on it.

## Short answer to say in an interview

:::interview How do you build a bounded blocking queue?
"I keep a std::queue protected by a mutex, with two condition variables: notFull and notEmpty. push waits on notFull until the size is below the limit, adds the item, and notifies notEmpty. pop waits on notEmpty until the queue is not empty, removes an item, and notifies notFull. I always wait with a condition because of spurious wakeups. For shutdown I add a closed flag and call notify_all. The size limit gives back-pressure."
:::

```quiz
? Why must cv.wait use a condition?
- It is faster
+ To handle spurious wakeups and notifications that arrive before the wait
- The compiler requires it
> The condition checks the real situation each time the thread wakes up.
? Why use two condition variables in a bounded queue?
- To confuse readers
+ One for "not full" (producers wait) and one for "not empty" (consumers wait)
- Mutexes need them
> Separate conditions avoid waking the wrong kind of thread.
? How do you stop waiting consumers at shutdown?
- Kill the thread
+ Set a closed flag and call notify_all, so they wake up, see the flag and exit
- Wait for a long time
> Waiting threads must be woken so they can notice the shutdown.
```

:::keypoints
- A condition variable lets a thread wait for a condition without spinning. Always `wait(lock, condition)`, change data under the mutex, then notify.
- A bounded blocking queue (a mutex and two condition variables) is the core producer-consumer tool, and it gives back-pressure.
- Shut down with a closed flag and `notify_all`. C++20 adds semaphores, latches and barriers.
:::
