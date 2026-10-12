---
title: Concurrency Basics — Threads, Races, Locks and the Event Loop
level: advanced
time: 55
summary: What can go wrong when work runs at the same time — concurrency vs parallelism, race conditions and lost updates demonstrated in C++ threads and in single-threaded JavaScript async code, critical sections, mutexes, atomics, condition variables, and how JavaScript's event loop, promises and workers fit in.
---

LLD interviewers love the follow-up "what if two users do this at the same time?". Two people book the last seat, two ATMs withdraw from one account, two workers pick the same job. Answering well needs a clear model of what concurrency breaks and which tool fixes it. This module covers that, in C++ (real threads sharing memory) and JavaScript (one thread, many interleaved async tasks). Both have races.

## Concurrency vs parallelism

:::def Concurrency
Structuring a program as several tasks **in progress at the same time**, whose steps may **interleave** (a web server handling many requests, each waiting on I/O at different moments). Possible on a single CPU core.
:::

:::def Parallelism
Actually **executing** several computations **simultaneously** on multiple cores, to finish CPU-heavy work faster.
:::

C++ threads give you both. JavaScript's main thread gives you **concurrency without parallelism**: one thread interleaves many tasks at `await` points. (Web Workers and Node's worker threads add parallelism, with separate memory.)

## Race conditions

:::def Race condition
A bug where the result depends on the **timing or interleaving** of operations by concurrent tasks. The classic form is **read-modify-write** on shared data: two tasks read the same old value, each computes a new value, and one overwrites the other (a **lost update**).
:::

:::def Critical section
A piece of code that accesses shared state and must not be executed by more than one task at a time.
:::

### In C++: two threads, one counter

Four threads each add 1 to a shared counter 100,000 times. The read and the write are separate steps, so increments get lost. (This version uses an `atomic` with separate `load` and `store` so the demo is well-defined; with a plain `int` it would be a data race, which is **undefined behaviour** in C++.)

:::tabs Lost updates and three fixes (C++)
```cpp run
#include <bits/stdc++.h>
using namespace std;

constexpr int THREADS = 4, ITERS = 100000;

template <class Fn>
long runThreads(Fn work) {
    vector<thread> ts;
    for (int t = 0; t < THREADS; t++) ts.emplace_back(work);
    for (auto& t : ts) t.join();
    return 0;
}

int main() {
    // ✗ read-modify-write as two separate steps: increments get lost
    atomic<long> racy{0};
    runThreads([&] { for (int i = 0; i < ITERS; i++) { long v = racy.load(); this_thread::yield(); racy.store(v + 1); } });

    // ✓ fix 1: a mutex makes the whole read-modify-write a critical section
    long guarded = 0; mutex m;
    runThreads([&] { for (int i = 0; i < ITERS; i++) { lock_guard<mutex> lock(m); guarded++; } });

    // ✓ fix 2: one indivisible atomic operation
    atomic<long> atomicCount{0};
    runThreads([&] { for (int i = 0; i < ITERS; i++) atomicCount.fetch_add(1); });

    // ✓ fix 3: don't share — each thread counts locally, combine at the end
    vector<long> partial(THREADS);
    vector<thread> ts;
    for (int t = 0; t < THREADS; t++) ts.emplace_back([&partial, t] { for (int i = 0; i < ITERS; i++) partial[t]++; });
    for (auto& t : ts) t.join();
    long confined = accumulate(partial.begin(), partial.end(), 0L);

    long expected = (long)THREADS * ITERS;
    cout << "expected:        " << expected << "\n";
    cout << "racy:            " << (racy < expected ? "LOST UPDATES (" + to_string(expected - racy.load()) + " missing; varies per run)" : "no loss this run (lucky timing)") << "\n";
    cout << "mutex:           " << guarded << "\n";
    cout << "atomic fetch_add: " << atomicCount << "\n";
    cout << "thread-local:    " << confined << "\n";
}
```
```js run
// JavaScript has no data races on the main thread (one thread, run-to-completion),
// but async code can still lose updates: every `await` is a point where other tasks run.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = { balance: 100 };
async function readBalance() { await sleep(1); return db.balance; }
async function writeBalance(v) { await sleep(1); db.balance = v; }

// ✗ read, await, write: two withdrawals interleave
async function withdrawRacy(amount) {
  const b = await readBalance();
  if (b < amount) return "insufficient";
  await writeBalance(b - amount);
  return "ok";
}
console.log("racy:", await Promise.all([withdrawRacy(70), withdrawRacy(70)]), "→ balance", db.balance, "(both succeeded on a balance of 100!)");

// ✓ serialize access with a simple async mutex (a promise chain)
class AsyncMutex {
  #tail = Promise.resolve();
  async run(fn) {
    const release = this.#tail;
    let unlock;
    this.#tail = new Promise((r) => (unlock = r));
    await release;
    try { return await fn(); } finally { unlock(); }
  }
}
db.balance = 100;
const mutex = new AsyncMutex();
const withdrawSafe = (amount) => mutex.run(() => withdrawRacy(amount));
console.log("with mutex:", await Promise.all([withdrawSafe(70), withdrawSafe(70)]), "→ balance", db.balance);
```
:::

The JavaScript half shows the most common misconception: "JavaScript is single-threaded, so it has no race conditions." It has no **data races** (two threads touching memory at the same instant), but it absolutely has **race conditions** wherever logic spans an `await`. In real systems the shared state is usually a database, and the same pattern (read, decide, write) breaks across requests and across servers. That's why the SQL lesson's atomic updates and version checks matter.

## The C++ toolbox

| Tool | What it does | Use for |
|---|---|---|
| `std::thread`, `std::jthread` | run a function on a new thread (`jthread` joins automatically) | parallel work, background tasks |
| `std::mutex` + `std::lock_guard` / `std::unique_lock` | mutual exclusion; RAII locking (unlocks on scope exit, even on exceptions) | protecting critical sections |
| `std::scoped_lock(m1, m2)` | locks several mutexes at once without deadlock | operations on two accounts |
| `std::shared_mutex` + `shared_lock` | many readers or one writer | read-heavy shared data |
| `std::atomic<T>` | indivisible operations on one value (`fetch_add`, `compare_exchange`) | counters, flags, lock-free structures |
| `std::condition_variable` | sleep until another thread signals a condition | queues, waiting for work |
| `std::future` / `std::promise` / `std::async` | a value that will be available later | returning results from threads |
| `std::counting_semaphore`, `std::latch`, `std::barrier` (C++20) | limit concurrency, wait for N events | throttling, phases |

:::warn Rules that prevent most C++ concurrency bugs
1. Every piece of shared mutable data is protected by **one** specific mutex (document which).
2. Always lock with **RAII** (`lock_guard`, `scoped_lock`), never manual `lock()`/`unlock()`.
3. Keep critical sections **short**: never do I/O, sleeps or callbacks to unknown code while holding a lock.
4. Never return references or pointers to protected data out of the lock's scope.
5. Prefer **not sharing**: immutable data, thread-local results, message passing.
:::

## Condition variables: waiting without spinning

A thread that must wait for something ("the queue is not empty", "the elevator arrived") shouldn't loop checking a flag (that burns CPU). A **condition variable** lets it sleep until another thread **notifies** it:

:::tabs A condition variable: a worker waits for an order
```cpp run
#include <bits/stdc++.h>
using namespace std;

int main() {
    mutex m;
    condition_variable cv;
    optional<string> order;                       // shared state, protected by m
    bool done = false;

    thread kitchen([&] {
        unique_lock lock(m);
        cv.wait(lock, [&] { return order.has_value(); });   // sleeps; re-checks the predicate on wake-up
        cout << "kitchen: cooking " << *order << "\n";
        done = true;
        lock.unlock();
        cv.notify_one();
    });

    this_thread::sleep_for(chrono::milliseconds(50));      // the customer takes a while to decide
    {
        lock_guard lock(m);
        order = "masala dosa";
        cout << "waiter: order placed\n";
    }
    cv.notify_one();                                         // wake the kitchen

    unique_lock lock(m);
    cv.wait(lock, [&] { return done; });
    cout << "waiter: order served\n";
    lock.unlock();
    kitchen.join();
}
```
```js run
// In JavaScript, "wait until something happens" is a Promise that someone else resolves.
function createSignal() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { wait: () => promise, notify: resolve };
}

const orderPlaced = createSignal(), orderServed = createSignal();

const kitchen = (async () => {
  const order = await orderPlaced.wait();                    // suspends without blocking the thread
  console.log(`kitchen: cooking ${order}`);
  orderServed.notify();
})();

setTimeout(() => {                                           // the customer takes a while to decide
  console.log("waiter: order placed");
  orderPlaced.notify("masala dosa");
}, 50);

await orderServed.wait();
console.log("waiter: order served");
await kitchen;
```
:::

Always wait **with a predicate** (`cv.wait(lock, [&]{ return ready; })`): condition variables can wake up **spuriously**, and a notification sent before the waiter started waiting would otherwise be missed.

## JavaScript's model: the event loop

:::def Event loop
JavaScript runs your code on **one thread**. Work is split into **tasks** (timers, I/O callbacks, events) and **microtasks** (promise reactions). The loop runs one task to completion, then all pending microtasks, then the next task. Code between two `await`s never interleaves with other JavaScript.
:::

```js run title="Run-to-completion, microtasks before tasks"
console.log("1 sync start");
setTimeout(() => console.log("5 timer (task)"), 0);
Promise.resolve().then(() => console.log("3 promise reaction (microtask)"));
queueMicrotask(() => console.log("4 another microtask"));
(async () => {
  console.log("2 async function runs synchronously until its first await");
  await null;
  console.log("4b after await (microtask)");
})();
console.log("2b sync end");
```

Consequences:

- **No locks needed** for code without `await` in between: a synchronous block is effectively a critical section.
- **Every `await` is a yield point** where other tasks may change shared state: re-check assumptions after it, or serialise with an async mutex / per-key queue.
- **CPU-heavy work blocks everything** (no other request is served while a loop runs for 2 seconds). Move it to **worker threads** (Node `worker_threads`, browser Web Workers), which run in parallel with **separate memory** and communicate by **messages** (optionally sharing a `SharedArrayBuffer` with `Atomics`).
- For **parallel I/O**, start operations together and `await Promise.all([...])` instead of awaiting one by one.

## Choosing the tool in an interview

| Situation | C++ | JavaScript |
|---|---|---|
| Increment a shared counter | `atomic::fetch_add` | plain `++` (single thread), or an atomic DB update |
| Update several fields consistently | `mutex` + `lock_guard` | no `await` inside the update, or an async mutex |
| Two accounts in one transfer | `scoped_lock(a.m, b.m)` | per-key async locks in a fixed order, or a DB transaction |
| Wait for work | `condition_variable` | a Promise / async queue |
| Many readers, rare writers | `shared_mutex` | (not needed in one thread) |
| CPU-heavy parallel work | `std::thread` pool | worker threads |
| Across processes / servers | — | — : use the **database** (transactions, conditional updates) or distributed locks |

:::interview Saying it out loud
*"`bookSeat` is a read-check-write on shared state, so it's a critical section. In the in-memory version I guard each show's seat map with its own mutex. In production the state is in the database, so I'd do it with a conditional update (`UPDATE seats SET booked_by = ? WHERE id = ? AND booked_by IS NULL`) and check the affected rows: that's atomic across servers."*
:::

```quiz
? Two threads run `count = count + 1` on a shared int 1,000 times each. Why might the result be less than 2,000?
+ The read and the write are separate steps; both threads can read the same old value, so one increment overwrites the other
- Integers overflow at 1,000
- Threads can't share variables
> It's a read-modify-write race (and in C++, a data race on a plain int is undefined behaviour). Use a mutex or an atomic fetch_add.

? "JavaScript is single-threaded, so my async code can't have race conditions." Is that true?
- True: one thread means no races
+ False: other tasks run at every await, so read–await–write logic can interleave and lose updates
- True, unless you use setTimeout
> No data races, but plenty of race conditions across await points (and across requests sharing a database).

? Why should a condition variable wait use a predicate (`cv.wait(lock, [&]{ return ready; })`)?
+ Waits can wake spuriously, and a notification before waiting would be missed; the predicate re-checks the real condition
- It makes the wait faster
- Predicates are required to compile
> Always re-check the condition under the lock after waking.

? Which is the safest way to lock two mutexes for a transfer between two accounts in C++?
+ `std::scoped_lock lock(a.m, b.m);`, which acquires both with a deadlock-avoidance algorithm
- Lock a.m, then b.m, in whatever order the arguments arrive
- Don't lock at all
> Locking in argument order can deadlock when two transfers go in opposite directions.
```

:::keypoints
- **Concurrency** = interleaved tasks; **parallelism** = simultaneous execution. C++ threads give both; JS's main thread gives concurrency only.
- **Race conditions** come from read-modify-write on shared state; protect **critical sections**. C++ data races are undefined behaviour.
- C++ tools: `mutex` + RAII locks, `scoped_lock` for several, `atomic` for single values, `condition_variable` (with a predicate), `shared_mutex`, futures, semaphores.
- JavaScript: run-to-completion, microtasks before tasks; **every `await` is a yield point**; use async mutexes/queues, `Promise.all` for parallel I/O, workers for CPU.
- Prefer **not sharing** (immutability, confinement, messages); across servers, rely on the **database** or distributed locks.
:::
