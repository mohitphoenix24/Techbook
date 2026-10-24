---
title: std::async, future, promise and packaged_task
level: intermediate
time: 30
summary: How to get a result (or an error) back from another thread. Learn futures, std::async, promise and future for one-time hand-offs, packaged_task, running many tasks in parallel, and waiting with a time limit.
---

A plain `std::thread` is low-level. You start it, but you cannot easily get a **return value** or an **error** back from it.

A **future** solves this. Think of it as a **token** you get when you order food. You go and do other things. Later you show the token and get your food. In C++, a `std::future<T>` is a handle to a value that **will exist later**.

## `std::async`

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

Things to know:

- `future::get()` **waits** until the result is ready and gives it to you. You can call it **only once** on a normal future.
- `launch::async` forces a **new thread**. `launch::deferred` runs the task **later**, on the calling thread, when you call `get()` or `wait()`. The default may choose either, so always write the policy you mean.
- The destructor of a future returned by `async` **waits** for the task to finish. This is a trap: if you call `async(...)` and do not keep the future, the call runs like a normal blocking call.
- Use `ref` or `cref` to pass arguments by reference.

## Errors travel through the future

If the task throws an error, the error is stored in the future and **thrown again by `get()`**.

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

## promise and future: a one-time channel

A **promise** is the **writing** end. Its **future** is the **reading** end. One thread calls `set_value`, the other calls `get`. Use it when the work is not a simple function call.

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

## packaged_task: a function tied to a future

`packaged_task` wraps a function so that **running it fills a future**. It is the building block of thread pools: you put the task in a queue, and give the caller the future.

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

## Many futures: a parallel map

Start many tasks, then collect all results.

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

## shared_future and waiting with a time limit

A normal `future` can be read once. A `shared_future` can be read by **many threads**. `wait_for` lets you **give up** after some time.

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

| You need | Use |
|---|---|
| Run a function in the background and get the result | `std::async` |
| Pass one value from one thread to another | `promise` and `future` |
| Queue work for a pool and give callers a future | `packaged_task` |
| Many readers of one result | `shared_future` |
| Many results over time (a stream) | a blocking queue |
| Workers that live for a long time | `std::thread` or a thread pool |

## Short answer to say in an interview

:::interview What is a future, and what are the traps of std::async?
"A future is a handle to a result that will be ready later. get() waits, and returns the value or throws the task's error. std::async runs a task on another thread. The traps are that the default launch policy may delay the task, so I pass launch::async explicitly, and that the destructor of an async future waits for the task, so if I throw the future away, the call becomes effectively synchronous."
:::

```quiz
? What does future::get() do?
- Starts the task
+ Waits for the result and returns it, or throws the task's error
- Cancels the task
> It can be called only once on a normal future.
? What happens if you call async(launch::async, f) and do not keep the future?
- The task runs in the background forever
+ The temporary future's destructor waits for the task, so it behaves like a normal call
- Nothing
> Always keep the future if you want real concurrency.
? Which one wraps a function so that running it fills a future?
- promise
+ packaged_task
- shared_future
> It is the building block of thread pools.
```

:::keypoints
- `std::async` with a `future` gives back values and errors from other threads. Choose `launch::async` and keep the future.
- `promise` and `future` is a one-time channel. `packaged_task` ties a function to a future. `shared_future` allows many readers.
- `wait_for` gives a time limit. For a stream of results, use a blocking queue.
:::
