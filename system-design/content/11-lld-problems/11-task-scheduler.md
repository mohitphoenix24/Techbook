---
title: Design a Task Scheduler
level: advanced
time: 60
summary: A delayed and recurring task scheduler like Java's ScheduledExecutorService — a min-heap ordered by run time and priority, a scheduler thread that sleeps until the next task is due (wait_until), a worker pool that runs tasks, cancellation, fixed-rate recurring tasks, and retries with backoff — in C++ (threads) and JavaScript (timers + a concurrency limit).
---

:::problem Design a Task Scheduler {level=hard tags="LLD,heap,concurrency,thread pool"}
Design a component that runs tasks at a given time in the future (`schedule(task, delay)`), repeatedly (`scheduleAtFixedRate(task, initialDelay, period)`), supports priorities when several tasks are due at once, cancellation, and retries for failing tasks, executing them on a bounded pool of worker threads.

:::hint Hint
Keep pending tasks in a min-heap ordered by (run time, priority). One scheduler thread waits on a condition variable until the earliest task is due (or until a new, earlier task arrives), then hands due tasks to a worker pool. Recurring tasks re-insert themselves with the next run time.
:::
:::

This is the single-machine core of cron, Celery beat, Quartz, `setTimeout` itself, and the distributed job scheduler case study.

## Requirements

- `schedule(task, delay, priority)` → task id; runs once, after `delay`.
- `scheduleAtFixedRate(task, initialDelay, period)` → runs repeatedly.
- `cancel(id)`: a pending task never runs (a running one finishes).
- Several tasks due at the same moment run in **priority** order.
- Tasks run on a **bounded worker pool**; the scheduler thread itself never runs task code (a slow task must not delay others' start times).
- A failing task is retried with exponential backoff, up to N attempts.
- Graceful shutdown.

## Design

```viz algo=uml title="Scheduler classes"
class Scheduler
  - queue: minheap<ScheduledTask>
  - lock: mutex
  - wake: condition_variable
  - pool: ThreadPool
  - cancelled: set<id>
  + schedule(task, delay, priority): id
  + scheduleAtFixedRate(task, initial, period): id
  + cancel(id): bool
  + shutdown()
  - loop()
class ScheduledTask
  - id: long
  - runAt: Time
  - priority: int
  - period: Duration
  - attempt: int
  - fn: Task
class ThreadPool
  + submit(job)
interface Task
  + run(): bool
Scheduler *-- ScheduledTask : heap
Scheduler *-- ThreadPool
ScheduledTask --> Task
```

```viz algo=seq title="The scheduler loop"
participant c Caller [service]
participant s Scheduler thread [clock]
participant h Min-heap [box]
participant p Worker pool [worker]
c -> s : schedule(sendReport, +200 ms)
s -> h : push(runAt = t+200)
note s : wait_until(heap top's runAt), or until notified
c -> s : schedule(urgentAlert, +50 ms) | An EARLIER task: notify the condition variable so the wait is recomputed.
s -> h : pop due tasks (runAt ≤ now), skipping cancelled ones
s -> p : submit(urgentAlert) | The scheduler only dispatches; workers run task code.
p -> p : run → fails → reschedule at now + backoff (attempt 2)
s -> p : submit(sendReport) at t+200
```

The subtle part is **waking up early**: the scheduler sleeps until the earliest known deadline, so when a caller schedules something even earlier, it must **notify** the condition variable to recompute. Using `wait_until` with a predicate handles spurious wake-ups and missed notifications.

## Implementation

:::tabs Scheduler with a heap, a scheduler thread and a worker pool
```cpp run
#include <bits/stdc++.h>
using namespace std;
using Clock = chrono::steady_clock;
using ms = chrono::milliseconds;

class ThreadPool {                                           // from the concurrency lesson, trimmed
    vector<thread> workers_; queue<function<void()>> q_; mutex m_; condition_variable cv_; bool stop_ = false;
public:
    explicit ThreadPool(int n) {
        for (int i = 0; i < n; i++) workers_.emplace_back([this] {
            for (;;) {
                function<void()> job;
                { unique_lock l(m_); cv_.wait(l, [this] { return stop_ || !q_.empty(); }); if (stop_ && q_.empty()) return; job = std::move(q_.front()); q_.pop(); }
                job();
            }
        });
    }
    void submit(function<void()> job) { { lock_guard l(m_); q_.push(std::move(job)); } cv_.notify_one(); }
    ~ThreadPool() { { lock_guard l(m_); stop_ = true; } cv_.notify_all(); for (auto& w : workers_) w.join(); }
};

class Scheduler {
    struct Item {
        Clock::time_point runAt; int priority; long id; int attempt; ms period; function<bool()> fn;
        bool operator>(const Item& o) const { return tie(runAt, priority, id) > tie(o.runAt, o.priority, o.id); }   // earlier, then lower number = higher priority
    };
    priority_queue<Item, vector<Item>, greater<Item>> heap_;
    set<long> cancelled_;
    mutex m_; condition_variable cv_;
    bool stop_ = false;
    long nextId_ = 1;
    static constexpr int MAX_ATTEMPTS = 3;
    ThreadPool pool_{3};
    thread loop_;

    void push(Item it) { { lock_guard l(m_); heap_.push(std::move(it)); } cv_.notify_one(); }   // may be earlier: wake the loop
    void loop() {
        unique_lock l(m_);
        while (!stop_) {
            if (heap_.empty()) { cv_.wait(l, [this] { return stop_ || !heap_.empty(); }); continue; }
            auto due = heap_.top().runAt;
            if (cv_.wait_until(l, due, [&] { return stop_ || heap_.top().runAt < due; })) continue;   // woken: re-evaluate
            while (!heap_.empty() && heap_.top().runAt <= Clock::now()) {
                Item it = heap_.top(); heap_.pop();
                if (cancelled_.count(it.id)) continue;               // skip cancelled tasks
                pool_.submit([this, it]() mutable { execute(std::move(it)); });   // workers run the task code
            }
        }
    }
    void execute(Item it) {
        bool ok = false;
        try { ok = it.fn(); } catch (...) { ok = false; }
        if (!ok && it.attempt < MAX_ATTEMPTS) {                      // retry with exponential backoff
            it.attempt++;
            it.runAt = Clock::now() + ms(10 << it.attempt);
            push(std::move(it));
        } else if (it.period.count() > 0) {                         // recurring: schedule the next run (fixed rate)
            it.attempt = 1;
            it.runAt += it.period;
            lock_guard l(m_);
            if (!cancelled_.count(it.id) && !stop_) { heap_.push(std::move(it)); cv_.notify_one(); }
        }
    }
public:
    Scheduler() : loop_([this] { loop(); }) {}
    ~Scheduler() { shutdown(); }
    long schedule(function<bool()> fn, ms delay, int priority = 5) {
        long id; { lock_guard l(m_); id = nextId_++; }
        push({Clock::now() + delay, priority, id, 1, ms(0), std::move(fn)});
        return id;
    }
    long scheduleAtFixedRate(function<bool()> fn, ms initial, ms period) {
        long id; { lock_guard l(m_); id = nextId_++; }
        push({Clock::now() + initial, 5, id, 1, period, std::move(fn)});
        return id;
    }
    void cancel(long id) { lock_guard l(m_); cancelled_.insert(id); }
    void shutdown() { { lock_guard l(m_); if (stop_) return; stop_ = true; } cv_.notify_all(); if (loop_.joinable()) loop_.join(); }
};

int main() {
    mutex logM;
    vector<string> log;
    auto record = [&](string s) { lock_guard l(logM); log.push_back(std::move(s)); };
    atomic<int> flaky{0}, heartbeats{0};
    {
        Scheduler s;
        s.schedule([&] { record("report (+120ms)"); return true; }, ms(120));
        s.schedule([&] { record("alert (+30ms)"); return true; }, ms(30));                       // scheduled later, runs earlier
        long cancelled = s.schedule([&] { record("SHOULD NOT RUN"); return true; }, ms(60));
        s.schedule([&] { int n = ++flaky; record("flaky attempt " + to_string(n)); return n >= 3; }, ms(40));   // fails twice
        s.scheduleAtFixedRate([&] { ++heartbeats; return true; }, ms(20), ms(50));
        s.cancel(cancelled);
        this_thread::sleep_for(ms(300));
    }                                                                // shutdown: stop the loop, drain the pool
    cout << "ran:";
    for (auto& l : log) cout << " [" << l << "]";
    cout << "\nheartbeats in ~300 ms at a 50 ms period: " << (heartbeats >= 4 ? "5-6 (as expected)" : to_string(heartbeats.load())) << "\n";
}
```
```js run
// A min-heap ordered by (runAt, priority, id)
class MinHeap {
  #a = [];
  constructor(less) { this.less = less; }
  get size() { return this.#a.length; }
  peek() { return this.#a[0]; }
  push(x) { const a = this.#a; a.push(x); for (let i = a.length - 1; i > 0; ) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() {
    const a = this.#a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; for (let i = 0; ; ) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r;
      if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}

class Scheduler {
  #heap = new MinHeap((x, y) => (x.runAt - y.runAt || x.priority - y.priority || x.id - y.id) < 0);   // must return a boolean
  #cancelled = new Set(); #timer = null; #nextId = 1; #running = 0; #ready = []; #stopped = false;
  constructor({ now, workers = 3, maxAttempts = 3 }) { Object.assign(this, { now, workers, maxAttempts }); }

  schedule(fn, delay, priority = 5) { return this.#add({ fn, runAt: this.now() + delay, priority, period: 0 }); }
  scheduleAtFixedRate(fn, initial, period) { return this.#add({ fn, runAt: this.now() + initial, priority: 5, period }); }
  cancel(id) { this.#cancelled.add(id); }
  shutdown() { this.#stopped = true; clearTimeout(this.#timer); }

  #add(task) { const t = { id: this.#nextId++, attempt: 1, ...task }; this.#heap.push(t); this.#arm(); return t.id; }
  #arm() {                                       // (re)arm ONE timer for the earliest task: like wait_until
    clearTimeout(this.#timer);
    if (this.#stopped || !this.#heap.size) return;
    this.#timer = setTimeout(() => this.#tick(), Math.max(0, this.#heap.peek().runAt - this.now()));
  }
  #tick() {
    while (this.#heap.size && this.#heap.peek().runAt <= this.now()) {
      const t = this.#heap.pop();
      if (!this.#cancelled.has(t.id)) this.#ready.push(t);
    }
    this.#drain();
    this.#arm();
  }
  #drain() {                                     // a worker pool: at most `workers` tasks running at once
    while (this.#running < this.workers && this.#ready.length) {
      const t = this.#ready.shift();
      this.#running++;
      Promise.resolve().then(() => t.fn()).catch(() => false).then((ok) => {
        this.#running--;
        if (ok === false && t.attempt < this.maxAttempts) this.#add({ ...t, attempt: t.attempt + 1, runAt: this.now() + (10 << (t.attempt + 1)) });   // backoff 40, 80 ms…
        else if (t.period && !this.#cancelled.has(t.id) && !this.#stopped) this.#heap.push({ ...t, attempt: 1, runAt: t.runAt + t.period });
        this.#arm();
        this.#drain();
      });
    }
  }
}

const start = Date.now(), log = [];
const s = new Scheduler({ now: () => Date.now() - start });
let flaky = 0, heartbeats = 0;
s.schedule(() => { log.push("report (+120ms)"); }, 120);
s.schedule(() => { log.push("alert (+30ms)"); }, 30);                         // scheduled later, runs earlier
const cancelled = s.schedule(() => { log.push("SHOULD NOT RUN"); }, 60);
s.schedule(() => { flaky++; log.push(`flaky attempt ${flaky}`); return flaky >= 3; }, 40);   // fails twice
s.scheduleAtFixedRate(() => { heartbeats++; }, 20, 50);
s.cancel(cancelled);

await new Promise((r) => setTimeout(r, 300));
s.shutdown();
console.log("ran:", log.map((l) => `[${l}]`).join(" "));
console.log(`heartbeats in ~300 ms at a 50 ms period: ${heartbeats >= 4 ? "5-6 (as expected)" : heartbeats}`);
```
:::

## Design discussion

- **Heap ordering** `(runAt, priority, id)`: earliest first; ties by priority; then insertion order for fairness.
- **Scheduler thread vs workers**: the loop only pops and dispatches, so a long task never delays the start of another. With all workers busy, due tasks wait in the pool's queue (bounded pools apply backpressure).
- **Cancellation** is lazy (a `cancelled` set checked when popping): O(1) cancel, no heap surgery. Clean the set when the task is skipped.
- **Fixed rate vs fixed delay**: fixed **rate** schedules the next run at `previousRunAt + period` (keeps cadence, may run back-to-back if a run overruns); fixed **delay** schedules it `period` after the previous run **finishes** (never overlaps itself). Offer both.
- **Retries** re-enter the heap with exponential backoff; after `MAX_ATTEMPTS`, report to a dead-letter list or an alert.
- **Time**: use a **monotonic clock** (`steady_clock`) for delays (from the time lesson), never the wall clock.
- **Persistence and distribution** (survive restarts, run on many machines, exactly one runner per job) turn this into the **distributed job scheduler** case study: tasks in a database, workers claiming due tasks with leases (`SELECT … FOR UPDATE SKIP LOCKED`), and idempotent jobs.

```quiz
? The scheduler is sleeping until a task due in 200 ms, and a caller schedules a task due in 50 ms. What must happen?
+ The scheduler thread is notified so it recomputes its wait for the new, earlier deadline
- Nothing; it will run the new task after the 200 ms one
- The new task runs immediately on the caller's thread
> Waking the condition variable on every insert (wait_until with a predicate) handles earlier arrivals.

? Why shouldn't the scheduler thread run task code itself?
+ A slow task would delay the start of every other due task; workers isolate execution from scheduling
- Threads can't call functions
- To use less memory
> Scheduling stays punctual; execution parallelism is bounded by the pool.

? A fixed-rate task (period 1 s) takes 1.5 s to run. What happens, compared with fixed delay?
+ Fixed rate tries to keep the cadence, so runs start back-to-back (or overlap if allowed); fixed delay waits 1 s after each run finishes
- Both behave the same
- Fixed rate skips the task forever
> Pick the semantics deliberately; fixed delay never overlaps a task with itself.
```

:::keypoints
- Pending tasks in a **min-heap** by (runAt, priority, id); a **scheduler thread** uses `wait_until` + notify to wake for the earliest deadline, including newly inserted earlier ones.
- Due tasks go to a **bounded worker pool**; the scheduler never runs task code.
- **Lazy cancellation**, **recurring** tasks (fixed rate vs fixed delay), **retries** with exponential backoff, monotonic time.
- Distributed version: tasks in a DB, workers claim with leases, idempotent jobs (case study later).
:::
