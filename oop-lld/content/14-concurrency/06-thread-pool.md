---
title: Building a thread pool
level: advanced
time: 45
summary: A complete, correct thread pool in C++: a task queue, worker threads, submit returning a future, graceful shutdown and draining, a parallel map on top of it, design choices (queue bound, exceptions, work stealing), and what interviewers look for.
---

A **thread pool** keeps a fixed set of worker threads alive and feeds them tasks from a queue. It avoids the cost of creating a thread per task, bounds the number of threads, and gives a natural place for scheduling policy. It is a favourite LLD/machine-coding problem, and it uses almost everything from the concurrency module.

## Design

```viz algo=uml title="Thread pool"
class ThreadPool
  - workers: thread[]
  - tasks: queue<function>
  - mutex: mutex
  - cv: condition_variable
  - stopping: bool
  + ThreadPool(n: int)
  + submit(f, args): future
  + ~ThreadPool()
class Worker
  + run(): void
ThreadPool *-- Worker
```

```viz algo=seq title="What happens when you submit a task"
participant c Caller [user]
participant p ThreadPool [box]
participant q TaskQueue [queue]
participant w Worker [worker]
c -> p : submit(task) | The caller gets a future immediately.
p -> q : push(task) | Under the pool mutex.
p ->> w : notify_one() | Wake one sleeping worker.
w -> q : pop() | The worker wakes, takes the task.
w -> w : run task | Outside the lock, so other workers continue.
w --> c : fulfil the future | The caller's future.get() now returns.
```

## Implementation

```cpp run title="ThreadPool with submit() returning a future"
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <memory>
#include <mutex>
#include <queue>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>
using namespace std;

class ThreadPool {
    vector<thread> workers_;
    queue<function<void()>> tasks_;
    mutex m_;
    condition_variable cv_;
    bool stopping_ = false;
public:
    explicit ThreadPool(size_t n) {
        for (size_t i = 0; i < n; ++i)
            workers_.emplace_back([this] {
                for (;;) {
                    function<void()> task;
                    {
                        unique_lock lock(m_);
                        cv_.wait(lock, [this] { return stopping_ || !tasks_.empty(); });
                        if (stopping_ && tasks_.empty()) return;          // drain the queue first, THEN exit
                        task = move(tasks_.front());
                        tasks_.pop();
                    }                                                      // the lock is released BEFORE running the task
                    task();
                }
            });
    }

    template <typename F, typename... Args>
    auto submit(F&& f, Args&&... args) -> future<invoke_result_t<F, Args...>> {
        using R = invoke_result_t<F, Args...>;
        auto task = make_shared<packaged_task<R()>>(bind(forward<F>(f), forward<Args>(args)...));
        future<R> result = task->get_future();
        {
            lock_guard lock(m_);
            if (stopping_) throw runtime_error("submit on a stopped pool");
            tasks_.push([task] { (*task)(); });                           // type-erase to function<void()>
        }
        cv_.notify_one();
        return result;
    }

    ~ThreadPool() {
        { lock_guard lock(m_); stopping_ = true; }
        cv_.notify_all();                                                  // wake every worker so it can exit
        for (auto& w : workers_) w.join();                                 // wait until all queued tasks have run
    }
    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;
};

long fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

int main() {
    ThreadPool pool(4);

    vector<future<long>> results;
    for (int n = 20; n < 28; ++n) results.push_back(pool.submit(fib, n));       // 8 tasks on 4 workers
    for (size_t i = 0; i < results.size(); ++i) cout << "fib(" << 20 + i << ") = " << results[i].get() << "\n";

    auto greeting = pool.submit([](const string& who) { return "hello " + who; }, string("pool"));   // any callable, any arguments
    cout << greeting.get() << "\n";

    auto failing = pool.submit([]() -> int { throw runtime_error("task failed"); });
    try { failing.get(); } catch (const exception& e) { cout << "exception travelled through the future: " << e.what() << "\n"; }
}
```

## Why each detail matters

| Detail | Reason |
|---|---|
| Tasks stored as `function<void()>` | one uniform queue element type; type-erased |
| `packaged_task` + `shared_ptr` | `function` requires copyable callables; `packaged_task` is move-only, so a `shared_ptr` carries it |
| `cv_.wait(lock, predicate)` | handles spurious wakeups; workers sleep when idle (no spinning) |
| Run the task **after unlocking** | other workers can take tasks while this one works |
| `stopping_ && tasks_.empty()` | on shutdown, workers **finish queued tasks** before exiting (drain) |
| `notify_all()` in the destructor | every sleeping worker must wake to see `stopping_` |
| `join` in the destructor (RAII) | no thread outlives the pool; no tasks lost |
| `submit` after stop throws | a clear error instead of a task that never runs |
| Exceptions land in the future | a throwing task does not kill the worker thread |

## A parallel map on top of the pool

```cpp run title="parallelMap: split the work, collect the results in order"
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>
using namespace std;

class ThreadPool {                                          // (same pool, condensed)
    vector<thread> workers_; queue<function<void()>> tasks_; mutex m_; condition_variable cv_; bool stop_ = false;
public:
    explicit ThreadPool(size_t n) {
        for (size_t i = 0; i < n; ++i) workers_.emplace_back([this] {
            for (;;) {
                function<void()> t;
                { unique_lock l(m_); cv_.wait(l, [this] { return stop_ || !tasks_.empty(); }); if (stop_ && tasks_.empty()) return; t = move(tasks_.front()); tasks_.pop(); }
                t();
            }
        });
    }
    template <typename F> auto submit(F f) -> future<decltype(f())> {
        auto task = make_shared<packaged_task<decltype(f())()>>(move(f));
        auto fut = task->get_future();
        { lock_guard l(m_); tasks_.push([task] { (*task)(); }); }
        cv_.notify_one();
        return fut;
    }
    ~ThreadPool() { { lock_guard l(m_); stop_ = true; } cv_.notify_all(); for (auto& w : workers_) w.join(); }
};

template <typename T, typename F>
auto parallelMap(ThreadPool& pool, const vector<T>& in, F f) {
    using R = decltype(f(in[0]));
    vector<future<R>> futs;
    for (const T& x : in) futs.push_back(pool.submit([&f, &x] { return f(x); }));
    vector<R> out;
    for (auto& fu : futs) out.push_back(fu.get());          // results come back in the input order
    return out;
}

int main() {
    ThreadPool pool(3);
    vector<int> in{1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    auto squares = parallelMap(pool, in, [](int x) { return x * x; });
    for (int s : squares) cout << s << " ";
    cout << "\n";
}
```

## Design questions an interviewer may ask

| Question | Good answer |
|---|---|
| How many threads? | CPU-bound work: about the number of cores. I/O-bound: more (threads mostly wait). Make it configurable. |
| What if the queue grows without limit? | A **bounded** queue with back-pressure: `submit` blocks or rejects (a rejection policy: block, drop oldest, run in the caller, throw). |
| How to shut down? | Stop accepting, drain queued tasks, join workers. Offer an immediate `shutdownNow()` that discards the queue. |
| What if a task throws? | Capture it in the future (as above); never let it escape the worker thread. |
| Task priorities? | Replace the `queue` with a `priority_queue`. |
| Scheduling delayed tasks? | A timer thread and a priority queue ordered by time, which feeds the pool. |
| Worker threads blocking on each other's futures? | Danger of **pool starvation deadlock**: all workers wait for tasks that cannot start. Avoid waiting on pool futures from inside the pool, or use separate pools. |
| Many cores contending on one queue lock? | Per-worker queues with **work stealing**; the standard answer for high-performance pools. |
| Cancel a task? | Cooperative: check an atomic stop flag or `stop_token` inside the task. |

:::interview Implement a thread pool
"A fixed vector of worker threads, a mutex-protected queue of `function<void()>`, and a condition variable. Workers loop: wait until the queue is non-empty or the pool is stopping; pop a task; unlock; run it. `submit` wraps the callable in a `packaged_task`, pushes a lambda that runs it, notifies one worker, and returns the future. The destructor sets `stopping`, notifies all, and joins; workers drain remaining tasks before exiting. Exceptions are captured in the future. For production I would bound the queue, support priorities and use work stealing."
:::

```quiz
? Why must a worker run its task outside the lock?
- To make the lock smaller
+ So other workers can take tasks while this one is busy
- Because tasks are not thread-safe
> Holding the lock while running would serialise all work.
? How does the pool return a result to the caller?
- Through a global variable
+ The task is wrapped in a packaged_task and the caller holds its future
- By polling
> The future carries the value or the exception.
? What happens to queued tasks when the pool is destroyed in the code above?
- They are discarded
+ Workers drain them before exiting (the queue is emptied, then threads join)
- They are run on the destructor's thread
> That is the graceful-shutdown behaviour.
```

:::keypoints
- Thread pool = fixed workers + task queue (mutex + condition variable) + `submit` returning a future via `packaged_task`.
- Run tasks outside the lock; wait with a predicate; shut down by `stopping`, `notify_all`, drain, `join`.
- Discuss queue bounds, rejection policy, exceptions, priorities, work stealing and starvation deadlock.
:::
