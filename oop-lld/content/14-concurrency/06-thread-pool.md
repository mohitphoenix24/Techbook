---
title: Building a thread pool
level: intermediate
time: 45
summary: Build a complete thread pool step by step: a task queue, worker threads, submit that returns a future, clean shutdown, a parallel map, and the questions interviewers ask about it.
---

## What is a thread pool?

Don't memorise the definition yet. Think of it like this:

> "Instead of hiring a new worker for every small job (slow and costly), I keep a **fixed team of workers** ready. Jobs wait in a queue, and any free worker picks the next job."

That team plus the queue is a **thread pool**.

A thread pool:

- avoids the cost of creating a new thread for every task,
- limits how many threads run at once,
- gives one place to decide the order and policy of work.

It is a very popular LLD and machine-coding question. It uses almost everything from this module.

## The design

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

In words:

1. The caller calls `submit(task)`. The task goes into the queue, and the caller gets a **future** back.
2. A sleeping worker is woken up.
3. The worker takes the task, **unlocks the queue**, and runs the task.
4. The result (or error) goes into the future.

## The code

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

## Why each detail is there

| Detail | Reason |
|---|---|
| Tasks stored as `function<void()>` | the queue holds one uniform kind of item |
| `packaged_task` inside a `shared_ptr` | `function` needs something copyable, but `packaged_task` can only be moved, so the `shared_ptr` carries it |
| `cv_.wait(lock, condition)` | handles spurious wakeups, and idle workers sleep (no spinning) |
| Run the task **after unlocking** | other workers can take tasks while this one is busy |
| `stopping_ && tasks_.empty()` | at shutdown, workers **finish the queued tasks** before leaving |
| `notify_all()` in the destructor | every sleeping worker must wake up to see `stopping_` |
| `join` in the destructor (RAII) | no thread outlives the pool, and no task is lost |
| `submit` after stop throws an error | a clear error, not a task that never runs |
| Errors go into the future | a failing task does not kill the worker thread |

## A parallel map on top of the pool

Split the work into pieces, send each piece to the pool, and collect the results in order.

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

## Questions an interviewer may ask

| Question | A good answer |
|---|---|
| How many threads? | For CPU-heavy work, about the number of cores. For waiting-heavy work (network, disk), more threads. Make it a setting. |
| What if the queue grows without limit? | Use a **bounded** queue. When it is full, `submit` can wait, or reject (block, drop the oldest, run in the caller, or throw). |
| How do you shut down? | Stop taking new tasks, finish the queued ones, then join the workers. Also offer an immediate stop that drops the queue. |
| What if a task throws? | Keep the error in the future. Never let it escape the worker thread. |
| Task priorities? | Use a `priority_queue` instead of a `queue`. |
| Tasks that run later? | A timer thread with a priority queue ordered by time, feeding the pool. |
| Workers waiting for each other's futures? | Risk of **starvation deadlock**: every worker waits for a task that cannot start. Do not wait on pool futures from inside the pool, or use separate pools. |
| Too much contention on one queue lock? | Give each worker its own queue and let idle workers **steal** from others (work stealing). |
| How do you cancel a task? | Politely: the task checks a stop flag (an atomic, or `stop_token`). |

## Short answer to say in an interview

:::interview How do you implement a thread pool?
"I keep a vector of worker threads, a queue of std::function<void()> protected by a mutex, and a condition variable. Each worker loops: wait until the queue has a task or the pool is stopping, take a task, unlock, and run it. submit wraps the function in a packaged_task, pushes a small function that runs it, wakes a worker, and returns the future. The destructor sets a stopping flag, wakes everyone and joins the threads, and workers finish the remaining tasks before they exit. Errors are kept in the future. For production use I would add a queue limit, priorities and work stealing."
:::

```quiz
? Why must a worker run its task outside the lock?
- To make the lock smaller
+ So other workers can take tasks while this one is busy
- Because tasks are not thread-safe
> If it held the lock while running, only one task could run at a time.
? How does the pool give the result back to the caller?
- Through a global variable
+ The task is wrapped in a packaged_task and the caller holds its future
- By polling
> The future carries the value or the error.
? What happens to queued tasks when the pool is destroyed in this code?
- They are thrown away
+ Workers finish them before leaving (the queue is emptied, then the threads join)
- They run on the destructor's thread
> This is a graceful shutdown.
```

:::keypoints
- Thread pool = fixed workers + a task queue (mutex and condition variable) + `submit` that returns a future through `packaged_task`.
- Run tasks outside the lock, wait with a condition, and shut down with `stopping`, `notify_all`, finish the queue, and `join`.
- Be ready to talk about queue limits, rejection, errors, priorities, work stealing and starvation deadlock.
:::
