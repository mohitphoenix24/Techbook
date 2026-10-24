---
title: "LLD interview: concurrency in design"
level: hard
time: 35
summary: Simple answers to the thread questions asked inside LLD rounds: where to put locks, safe singletons and caches, producer and consumer, avoiding deadlock, atomics, unchangeable objects and thread pools.
---

See the concurrency module for the code. Here is what you must be able to say.

A simple way to think: **concurrency** means many things happening at the same time. The danger is two threads changing the same data together. For each question, ask: *what data is shared, and what must happen as one step?*

:::qa Where do concurrency issues appear in LLD problems? {level=easy}
**Say this:** "Wherever many requests change shared data: booking a seat, a parking slot, an account balance, a cache, a rate limiter, a job queue."

**In simple words:** Name three things: the **shared data**, the **rule that must always hold** (for example, no seat sold twice), and the **part of the code** that must run as one step (the critical section).
:::

:::qa How do you make "book a seat" safe for many users? {level=medium}
**Say this:** "Checking if the seat is free and marking it taken must be one step, under a lock (or a compare-and-swap)."

**In simple words:** Use a lock for each seat or each show. Add a temporary **hold** with an expiry while the user pays. Return a clear result, like `BOOKED` or `ALREADY_TAKEN`.
:::

:::qa What is a race condition vs a data race? {level=medium}
**Say this:** "A data race is two threads using the same memory without protection, and one writes. A race condition is a logic bug that depends on timing."

**In simple words:** A data race is undefined behaviour in C++. A race condition can happen even with locks, for example "check, then act" in two separate locked steps. Fix it by making the whole check and action one step.
:::

:::qa Coarse-grained vs fine-grained locking? {level=medium}
**Say this:** "Coarse is one lock for everything: simple and safe, but slower. Fine is many small locks: faster, but harder and riskier."

**In simple words:** Start with one lock. If you measure that threads wait too much, split the lock, for example by key hash.
:::

:::qa How do you avoid deadlock in design? {level=medium}
**Say this:** "Lock in a fixed order, or take several locks together with `std::scoped_lock`. Do not call unknown code while holding a lock."

**In simple words:** A deadlock is two threads each holding a lock the other needs. For a transfer between two accounts, lock by account id order, or use `scoped_lock(a.m, b.m)`. Also try `try_lock` with a timeout, and keep shared data small.
:::

:::qa What is the difference between mutex, shared_mutex, recursive_mutex and atomic? {level=medium}
**Say this:** "`mutex` is one at a time. `shared_mutex` is many readers or one writer. `recursive_mutex` lets the same thread lock again. `atomic` is for one variable."

**In simple words:** Use `atomic` for a counter or a flag. Use a mutex for rules that connect several variables. A `recursive_mutex` is usually a warning sign.
:::

:::qa How do you implement a thread-safe counter or rate limiter? {level=medium}
**Say this:** "A counter: `std::atomic` with `fetch_add`. A limiter with several fields needs a mutex around the whole check and update."

**In simple words:** A token bucket has tokens and a last refill time, which must change together. That needs a mutex (or one atomic state with a CAS loop).
:::

:::qa How do you design a thread-safe LRU cache? {level=hard}
**Say this:** "A hash map and a linked list under one mutex. Even `get` changes the order, so it is a write."

**In simple words:** For more speed, split the cache into shards by `hash(key) % N`, each with its own lock. Some systems use an approximate LRU to avoid locking on hits.
:::

:::qa What is the producer-consumer pattern and how do you build it? {level=medium}
**Say this:** "Producers add work to a queue, consumers take it. I use a mutex, a condition variable and a queue, with a close flag for shutdown."

**In simple words:** `push` adds and notifies. `pop` waits until there is something. A size limit adds back-pressure: if the queue is full, producers wait.
:::

:::qa What is a thread pool and why use one? {level=medium}
**Say this:** "A fixed group of worker threads that take tasks from a queue. It avoids creating a thread for every task and limits the load."

**In simple words:** It needs: a task queue, clean shutdown, error handling inside tasks, and optionally futures for results.
:::

:::qa How do you shut down worker threads cleanly? {level=medium}
**Say this:** "Set a stopping flag under the lock, `notify_all`, let workers finish the queue, and `join` them all."

**In simple words:** Never `detach` threads that use objects that may be destroyed. In C++20, `jthread` and `stop_token` help.
:::

:::qa What is a condition variable's "spurious wakeup" and how do you handle it? {level=medium}
**Say this:** "A waiting thread can wake up without a notification. So I always wait with a condition."

**In simple words:** `cv.wait(lock, [&]{ return !q.empty() || stop; })` checks the real condition each time.
:::

:::qa Why is double-checked locking dangerous and what do you use instead? {level=hard}
**Say this:** "A plain pointer check is a data race, and another thread may see a half-built object. Use `std::call_once` or a function-local static."

**In simple words:** The simple, safe answer is the Meyers singleton.
:::

:::qa How does immutability help concurrency? {level=medium}
**Say this:** "An object that never changes can be shared by many threads without locks."

**In simple words:** Make value types unchangeable. To "update", build a new object and swap a pointer (an atomic `shared_ptr` swap).
:::

:::qa How do you make an Observer or event bus thread-safe? {level=hard}
**Say this:** "Protect the subscriber list with a mutex, copy the list under the lock, and call observers outside it."

**In simple words:** This way an observer can call back into the bus without a deadlock. Hold subscribers by `weak_ptr`, and decide which thread runs the callbacks.
:::

:::qa What is the difference between a mutex-protected object and a monitor? {level=hard}
**Say this:** "A monitor is a class that has its own mutex inside and locks in every public method, so callers cannot forget."

**In simple words:** Still, "check then act" over two calls is not safe. Offer one method that does both, like `putIfAbsent`.
:::

:::qa What is thread confinement / the actor model, and when use it? {level=hard}
**Say this:** "Keep each piece of data owned by one thread, and talk to it by messages."

**In simple words:** No locks around the data. Good for event loops, game loops and order books. The cost is queue delay and discipline.
:::

:::qa Future, promise and async: when do you use them in a design? {level=medium}
**Say this:** "When a caller needs a result later from work done elsewhere."

**In simple words:** `std::async` for simple parallel work. `promise` and `future` to pass a value between threads. `packaged_task` inside a pool. Errors come back through the future.
:::

:::qa How would you make Singleton initialisation thread-safe? {level=easy}
**Say this:** "A function-local static, or `std::call_once`."

**In simple words:** Do not write your own double-checked locking.
:::

:::qa What are memory orders and when do they matter? {level=hard}
**Say this:** "They say how much ordering an atomic operation gives. I use the default (`seq_cst`) unless I can explain a weaker one."

**In simple words:** `acquire` and `release` are enough to hand data from one thread to another using a flag. `relaxed` is only for stand-alone counters.
:::

:::qa What is false sharing? {level=hard}
**Say this:** "Two threads write different variables that sit on the same cache line, and they slow each other down."

**In simple words:** Fix it by putting hot variables on separate cache lines, with `alignas(64)`.
:::

:::qa How do you test concurrent code? {level=hard}
**Say this:** "Stress tests with many threads that check rules (like no double booking), ThreadSanitizer, and controlled time and scheduling."

**In simple words:** Repeat the test many times, because a race may show once in 10,000 runs. Check things that must always be true, like "total money does not change".
:::

:::qa How do you handle transactions across two accounts without deadlock and without losing atomicity? {level=hard}
**Say this:** "Lock both with `scoped_lock`, check the funds, debit and credit, then unlock."

**In simple words:** Across different machines you need a two-phase commit or a saga. That is outside LLD.
:::

:::qa What is optimistic vs pessimistic concurrency control? {level=hard}
**Say this:** "Pessimistic locks first. Optimistic works freely, and only at the end checks that nothing changed, otherwise it retries."

**In simple words:** Optimistic uses a version number (or CAS). It suits cases where clashes are rare.
:::

:::qa Idempotency: why does it matter in concurrent/retrying systems? {level=medium}
**Say this:** "A repeated request must not repeat its effect, like charging twice."

**In simple words:** Give each request an idempotency key. If the same key comes again, return the saved result.
:::

```quiz
? Two threads see seat 7 as free and both book it. What is the fix?
- Add a sleep between check and act
+ Make the check and the act one step under a lock (or compare-and-swap)
- Use volatile
> The rule must be protected as one unit.
? Which structure gives many readers and occasional writers?
- recursive_mutex
+ shared_mutex
- lock_guard on a single bool
> Readers share the lock. A writer takes it alone.
```

:::keypoints
- Name the shared data, the rule, and the critical section. Make check and act one step.
- Lock in a fixed order or use `scoped_lock`. Notify outside locks. Shut down workers cleanly.
- Unchangeable data, one-thread ownership and sharding reduce locking. Test with sanitizers.
:::
