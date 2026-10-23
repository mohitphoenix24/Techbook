---
title: "LLD interview: concurrency in design"
level: hard
time: 35
summary: The concurrency questions asked inside LLD rounds: where to put locks, thread-safe singletons and caches, producer-consumer, deadlock avoidance, lock granularity, atomics, immutability, thread pools and how to make a booking or counter safe.
---

See the concurrency module for the code. Here is what you must be able to say.

:::qa Where do concurrency issues appear in LLD problems? {level=easy}
Anywhere shared mutable state is touched by several requests: booking a seat or parking slot, updating an account balance, a cache, a rate limiter, a counter, a job queue, a pub/sub broker, an order book. Name the **shared state**, the **invariant** and the **critical section**.
:::

:::qa How do you make "book a seat" safe for concurrent users? {level=medium}
The check ("is it free?") and the update ("mark taken") must be **one atomic step**. Lock per seat or per show (`lock_guard`), or use compare-and-swap on the seat state. Add a temporary **hold with expiry** for payment. Return a clear result (`BOOKED`, `ALREADY_TAKEN`).
:::

:::qa What is a race condition vs a data race? {level=medium}
A **data race** is unsynchronised access to the same memory with at least one write (undefined behaviour in C++). A **race condition** is a logic bug where the result depends on timing (check-then-act), which can exist even with locks. Fix with atomic operations or larger critical sections.
:::

:::qa Coarse-grained vs fine-grained locking? {level=medium}
Coarse: one lock for the whole structure (simple, safe, limits parallelism). Fine: a lock per element/bucket/shard (more parallelism, more complexity and deadlock risk). Start coarse, measure, then shard (for example by key hash).
:::

:::qa How do you avoid deadlock in design? {level=medium}
Avoid holding a lock while calling unknown code, lock in a **fixed global order**, acquire multiple locks together with `std::scoped_lock`, use `try_lock` with timeouts and back-off, and reduce shared state. For transfers, order by account id.
:::

:::qa What is the difference between `mutex`, `shared_mutex`, `recursive_mutex` and `atomic`? {level=medium}
`mutex`: exclusive lock. `shared_mutex`: many readers or one writer (good for read-heavy caches). `recursive_mutex`: the same thread may lock again (usually a design smell). `atomic<T>`: lock-free operations on a single variable (counters, flags), not for multi-variable invariants.
:::

:::qa How do you implement a thread-safe counter or rate limiter? {level=medium}
A counter: `std::atomic<long>` with `fetch_add`. A limiter with several fields (tokens + last refill time) needs a mutex around the whole check-and-update, or a single atomic state with a CAS loop.
:::

:::qa How do you design a thread-safe LRU cache? {level=hard}
A hash map plus a doubly linked list guarded by one mutex (a `get` also reorders the list, so it is a write!). For more throughput, shard the cache by key hash with one lock per shard, or use `try_lock` on hits and approximate LRU (clock algorithm).
:::

:::qa What is the producer-consumer pattern and how do you build it? {level=medium}
Producers push work into a queue and consumers pop it. A **blocking queue** has a mutex, a condition variable and a queue; `push` notifies, `pop` waits with a predicate; add a `close()` flag for shutdown and optionally a capacity for back-pressure.
:::

:::qa What is a thread pool and why use one? {level=medium}
A fixed set of worker threads that take tasks from a shared queue. Creating a thread per task costs time and memory and can exhaust the machine; a pool bounds concurrency and reuses threads. Needs: task queue, graceful shutdown, exception handling inside tasks, optional futures for results.
:::

:::qa How do you shut down worker threads cleanly? {level=medium}
Set a `stopping` flag under the lock, `notify_all`, let workers finish queued tasks (drain) or exit immediately, then `join` every thread. In C++20 use `jthread` + `stop_token`. Never `detach` threads that use objects about to be destroyed.
:::

:::qa What is a condition variable's "spurious wakeup" and how do you handle it? {level=medium}
A waiting thread may wake without a notification. Always wait with a predicate (`cv.wait(lock, [&]{ return !q.empty() || stop; })`) so it re-checks the condition.
:::

:::qa Why is double-checked locking dangerous and what do you use instead? {level=hard}
Reading a pointer without synchronisation while another thread publishes it is a data race (even if the pointer looks set, the object may be half constructed). In C++ use `std::call_once`, a function-local static, or `std::atomic` with acquire/release.
:::

:::qa How does immutability help concurrency? {level=medium}
Objects that never change after construction can be shared freely across threads without locks. Design value types and snapshots (copy-on-write, persistent structures); publish them safely (atomic `shared_ptr` swap).
:::

:::qa How do you make an Observer/event bus thread-safe? {level=hard}
Protect the subscriber list with a mutex, **copy the list under the lock and call observers outside it** (so observers can call back into the bus without deadlock), and hold subscribers by `weak_ptr` to avoid calls on destroyed objects. Decide if notifications run on the publisher's thread or a dispatcher thread.
:::

:::qa What is the difference between a mutex-protected object and a monitor? {level=hard}
A monitor bundles the data, its mutex and its condition variables inside a class whose public methods lock internally ("thread-safe object"). Clients cannot forget the lock, but compound operations (check then act across two calls) still need a method that does both under one lock.
:::

:::qa What is thread confinement / the actor model, and when use it? {level=hard}
Keep each piece of mutable state owned by **one thread** and communicate by messages (queues). It avoids locks around the state and fits event loops, game loops and order books. Costs: queue latency and design discipline.
:::

:::qa Future, promise and `async`: when do you use them in a design? {level=medium}
When a caller needs a **result later** from work done elsewhere: `std::async` for simple parallel tasks, `std::promise`/`future` to hand a result across threads, `packaged_task` in a pool. Always handle exceptions via the future.
:::

:::qa How would you make `Singleton` initialisation thread-safe? {level=easy}
Use a function-local static (guaranteed once-only by the standard), or `std::call_once`. Do not hand-roll double-checked locking.
:::

:::qa What are memory orders and when do they matter? {level=hard}
They control how atomic operations order other memory operations. Default `seq_cst` is simplest and safe. `acquire`/`release` suffices for publishing data with a flag; `relaxed` for independent counters. In interviews: use the default unless you can justify weaker orders.
:::

:::qa What is false sharing? {level=hard}
Two independent variables on the same cache line, written by different threads, make the cores keep invalidating that line, slowing both. Fix by padding or aligning hot variables to separate cache lines (`alignas(64)`).
:::

:::qa How do you test concurrent code? {level=hard}
Run stress tests with many threads and repeated iterations, use ThreadSanitizer (`-fsanitize=thread`) to detect races, inject deterministic schedules where possible (fake clock, controlled executors), and assert invariants (total money unchanged, no double bookings).
:::

:::qa How do you handle transactions across two accounts without deadlock and without losing atomicity? {level=hard}
Lock both with `std::scoped_lock(a.m, b.m)` (or in id order), check funds, debit and credit, then unlock. Distributed versions need two-phase commit or sagas, which are out of scope for LLD.
:::

:::qa What is optimistic vs pessimistic concurrency control? {level=hard}
**Pessimistic:** lock before touching (safe, may block). **Optimistic:** read a version, work, then commit only if the version is unchanged (CAS or version column), retrying on conflict. Optimistic suits low-contention workloads like editing a record.
:::

:::qa Idempotency: why does it matter in concurrent/retrying systems? {level=medium}
A retry or duplicate request must not repeat a side effect (charge twice). Use an **idempotency key** stored with the result; a second request with the same key returns the stored result.
:::

```quiz
? A check-then-act bug: two threads see seat 7 free and both book it. What is the fix?
- Add sleep between check and act
+ Make check and act one atomic step under a lock (or CAS)
- Use volatile
> The invariant must be protected as a unit.
? Which structure gives many readers and occasional writers?
- recursive_mutex
+ shared_mutex
- lock_guard on a single bool
> Readers share the lock; writers take it exclusively.
```

:::keypoints
- Identify shared state, invariant and critical section; make check-and-update atomic.
- Lock ordering or `scoped_lock`; notify outside locks; shut down workers cleanly.
- Immutability, confinement and sharding reduce locking; test with sanitizers.
:::
