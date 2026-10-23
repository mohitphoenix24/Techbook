---
title: std::async, future, promise and packaged_task
level: intermediate
time: 30
summary: Getting results back from other threads with futures, std::async and launch policies, promise and future for one-shot hand-offs, packaged_task, exceptions travelling through futures, and parallelising a computation.
---

Threads are low-level: you start them and cannot easily get a **return value** or an **exception** back. **Futures** solve that. A `std::future<T>` is a handle to a value that will exist later.

## std::async

```cpp run title="async: run a function, get a future"
#include <future>
#include <iostream>
#include <numeric>
#include <vector>
using namespace std;

long sumRange(const vector<int>& v, size_t from, size_t to) {
    return accumulate(v.begin() + from, v.begin() + to, 0L);
}

int main() {
    vector<int> data(1'000'000);
    iota(data.begin(), data.end(), 1);

    size_t mid = data.size() / 2;
    auto left  = async(launch::async, sumRange, cref(data), size_t(0), mid);              // runs on another thread
    long right = sumRange(data, mid, data.size());                                         // this thread does the other half
    long total = left.get() + right;                                                       // get() waits for the result
    cout << "sum = " << total << "\n";
}
```

Facts:

- `future::get()` **blocks** until the result is ready and returns it (once; a future can be read only one time).
- `launch::async` forces a new thread. `launch::deferred` runs lazily when `get()` or `wait()` is called, on the calling thread. The **default** may choose either, so always pass the policy you mean.
- The destructor of a future from `async` **blocks** until the task finishes (a surprising trap: `async(...)` without storing the future runs synchronously).
- Use `cref`/`ref` to pass by reference.

## Exceptions cross the thread boundary

If the task throws, the exception is stored in the future and **re-thrown by `get()`**.

```cpp run title="Exceptions propagate through get()"
#include <future>
#include <iostream>
#include <stdexcept>
using namespace std;

int risky(int x) {
    if (x < 0) throw invalid_argument("negative input");
    return x * 2;
}

int main() {
    auto ok = async(launch::async, risky, 21);
    auto bad = async(launch::async, risky, -1);
    cout << "ok: " << ok.get() << "\n";
    try { bad.get(); }
    catch (const exception& e) { cout << "caught from the other thread: " << e.what() << "\n"; }
}
```

## promise and future: a one-shot channel

A **promise** is the writing end; its **future** is the reading end. One thread calls `set_value`, another calls `get`. Use it when the "task" is not a simple function call.

```cpp run title="promise/future hand-off"
#include <future>
#include <iostream>
#include <string>
#include <thread>
using namespace std;

int main() {
    promise<string> p;
    future<string> f = p.get_future();

    thread worker([&p] {
        string result = "computed by the worker";
        p.set_value(move(result));                  // or p.set_exception(std::current_exception())
    });

    cout << "waiting...\n";
    cout << f.get() << "\n";                        // blocks until set_value
    worker.join();
}
```

## packaged_task: a callable bound to a future

`packaged_task` wraps a function so that **running it** fulfils a future. It is the building block of thread pools: you queue the task and hand the caller the future.

```cpp run title="packaged_task"
#include <future>
#include <iostream>
#include <thread>
using namespace std;

int main() {
    packaged_task<int(int, int)> task([](int a, int b) { return a * b; });
    future<int> result = task.get_future();

    thread t(move(task), 6, 7);                     // the task runs on this thread
    cout << "6 x 7 = " << result.get() << "\n";
    t.join();
}
```

## Several futures: parallel map

```cpp run title="Fan out, then collect"
#include <future>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

long slowSquare(int n) { return static_cast<long>(n) * n; }     // pretend it is expensive

int main() {
    vector<future<long>> futures;
    for (int n = 1; n <= 8; ++n) futures.push_back(async(launch::async, slowSquare, n));     // start all
    long total = 0;
    for (auto& f : futures) total += f.get();                                                 // collect in order
    cout << "sum of squares 1..8 = " << total << "\n";
}
```

## shared_future and waiting with a timeout

A normal `future` can be read once. A `shared_future` can be read by several threads. `wait_for` lets you give up.

```cpp run title="shared_future and wait_for"
#include <chrono>
#include <future>
#include <iostream>
#include <thread>
using namespace std;
using namespace chrono_literals;

int main() {
    promise<int> p;
    shared_future<int> sf = p.get_future().share();         // many readers allowed

    auto reader = [sf](const char* name) { return string(name) + " saw " + to_string(sf.get()); };
    auto a = async(launch::async, reader, "reader A");
    auto b = async(launch::async, reader, "reader B");

    promise<int> neverSet;                                  // keep the promise alive, but never fulfil it
    future<int> never = neverSet.get_future();
    cout << "wait_for on an unfulfilled future: " << (never.wait_for(10ms) == future_status::timeout ? "timed out" : "ready") << "\n";

    p.set_value(7);
    cout << a.get() << ", " << b.get() << "\n";
}
```

## Which tool when?

| Need | Tool |
|---|---|
| Run a function in the background and get the result | `std::async` |
| Hand one value from one thread to another | `promise` / `future` |
| Queue work for a pool and give callers a future | `packaged_task` |
| Many readers of one result | `shared_future` |
| Many results over time (a stream) | a blocking queue |
| Long-lived worker threads | `std::thread` / thread pool |

:::interview What is a future, and what pitfalls does std::async have?
"A future is a handle to a result that will be available later; `get()` blocks and returns the value or rethrows the task's exception. `std::async` runs a task on another thread. The pitfalls are that the default launch policy may defer, so I pass `launch::async` explicitly, and that the destructor of an async future blocks until the task finishes, so discarding the future makes the call effectively synchronous."
:::

```quiz
? What does future::get() do?
- Starts the task
+ Waits for the result and returns it, or rethrows the task's exception
- Cancels the task
> It can be called only once on a normal future.
? What happens if you call `async(launch::async, f)` and do not keep the returned future?
- The task runs in the background forever
+ The temporary future's destructor blocks until the task finishes, so it runs effectively synchronously
- Nothing
> Always store the future if you want concurrency.
? Which wraps a callable so that running it fulfils a future?
- promise
+ packaged_task
- shared_future
> It is the building block for thread pools.
```

:::keypoints
- `std::async` + `future` gives return values and exceptions across threads; choose `launch::async` explicitly and keep the future.
- `promise`/`future` is a one-shot channel; `packaged_task` binds a callable to a future; `shared_future` has many readers.
- `wait_for` enables timeouts. For streams of results, use a blocking queue.
:::
