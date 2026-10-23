---
title: Design a Task Scheduler
level: intermediate
time: 60
summary: Scheduling tasks to run immediately, after a delay, at a time, or repeatedly, with priorities, cancellation and a worker pool; a timer priority queue driven by a clock, a tick-based deterministic simulation, and the Command pattern at the core.
---

:::problem Design a Task Scheduler {level=medium tags="Command,priority queue,timers,concurrency,scheduling,cron-like"}
Design an in-process task scheduler like `ScheduledExecutorService` or a tiny cron. Clients submit tasks to run **once at a time**, **after a delay**, or **repeatedly at a fixed rate**. Tasks have priorities and can be cancelled. A pool of workers executes due tasks. The design must not busy-wait and must be testable without real time.
:::

:::hint Hint
A scheduled task is a **Command** with a due time. Keep tasks in a **priority queue ordered by due time** (then priority). One scheduler loop waits until the earliest task is due; due tasks are handed to a worker pool. Inject the **clock** and let tests advance time manually.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Task kinds? | one-shot at time T, one-shot after delay D, recurring every P (fixed rate) |
| Priority? | when several tasks are due at the same time, higher priority runs first |
| Cancel? | `cancel(id)` stops a task (and its future repeats) |
| Execution? | a worker pool; a slow task must not block the timer |
| Failures? | an exception in a task is caught and logged; recurring tasks continue |
| Time? | injectable clock; production uses a real sleep until the next due time |
| Concurrency? | submit/cancel from any thread |
| Out of scope | persistence, cron expressions (extension), distributed scheduling |

## Step 2: how time is handled

```viz algo=seq title="The scheduler loop"
participant c Client [user]
participant s Scheduler [box]
participant q TimerQueue [queue]
participant p WorkerPool [worker]
c -> s : schedule(task, at=T) | Adds to the queue and wakes the scheduler loop (a new earliest time may exist).
s -> q : push(Entry{due=T})
s -> s : wait until the earliest due time (or until woken) | A condition_variable wait with a deadline: no busy waiting.
s -> q : pop all entries with due <= now
s ->> p : submit(task) | Workers run tasks outside the scheduler lock.
s -> q : if recurring: push(Entry{due += period})
```

## Step 3: entities

```viz algo=uml title="Task scheduler"
class Scheduler
  + scheduleAt(t: long, task: Task, prio: int): TaskId
  + scheduleAfter(d: long, task: Task, prio: int): TaskId
  + scheduleEvery(period: long, task: Task, prio: int): TaskId
  + cancel(id: TaskId): bool
  + runDue(): int
interface Task
  + run(): void
class FunctionTask
class Entry
  - id: long
  - due: long
  - priority: int
  - period: long
  - task: Task
  - cancelled: bool
class TimerQueue
  - heap: priority_queue<Entry>
class WorkerPool
  + submit(f: function): void
interface Clock
  + now(): long
Scheduler *-- TimerQueue
Scheduler --> WorkerPool
Scheduler --> Clock
TimerQueue o-- Entry
Entry --> Task
FunctionTask ..|> Task
```

## Step 4: design decisions

- **Task = Command** (`run()`), wrapped in an **Entry** with due time, priority, period and a cancelled flag.
- **`priority_queue` ordered by `(due asc, priority desc, id asc)`**. The id makes ordering total and FIFO among equals.
- **Cancellation by a shared flag** (`shared_ptr<atomic<bool>>`) rather than removing from the heap (heaps do not support arbitrary removal): cancelled entries are skipped when popped (lazy deletion).
- **Fixed rate** reschedules `due += period` (not `now + period`) so drift does not accumulate; if the scheduler fell far behind it skips missed runs (policy).
- **Separate the timer from execution**: the scheduler thread only moves entries to the pool; tasks run on workers.
- **The testable core is `runDue(now)`**: it takes the time and returns which tasks ran. The real scheduler thread is a thin loop calling it after waiting. In the demo we drive `runDue` with a manual clock, so the output is deterministic.
- **Wake-up**: scheduling a task earlier than the current earliest must wake the loop (condition variable notify).

## Step 5: the code

```cpp run title="Timer queue, priorities, recurring tasks, cancellation"
#include <atomic>
#include <condition_variable>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Task { virtual ~Task() = default; virtual void run() = 0; };
struct FunctionTask : Task { function<void()> f; explicit FunctionTask(function<void()> f) : f(move(f)) {} void run() override { f(); } };

struct Entry {
    long id; long due; int priority; long period;            // period 0 = one-shot
    shared_ptr<Task> task;
    shared_ptr<atomic<bool>> cancelled;
};
struct Later {                                               // "greater" so the smallest due time is on top
    bool operator()(const Entry& a, const Entry& b) const {
        if (a.due != b.due) return a.due > b.due;
        if (a.priority != b.priority) return a.priority < b.priority;       // higher priority first when due at the same time
        return a.id > b.id;                                                   // FIFO among equals
    }
};

class Scheduler {
    priority_queue<Entry, vector<Entry>, Later> heap_;
    map<long, shared_ptr<atomic<bool>>> flags_;
    mutex m_;
    long nextId_ = 1;
    function<void(shared_ptr<Task>)> executor_;              // who actually runs tasks: a worker pool, or inline in tests
public:
    explicit Scheduler(function<void(shared_ptr<Task>)> exec) : executor_(move(exec)) {}

    long scheduleAt(long when, function<void()> f, int priority = 0, long period = 0) {
        lock_guard l(m_);
        long id = nextId_++;
        auto flag = make_shared<atomic<bool>>(false);
        flags_[id] = flag;
        heap_.push({id, when, priority, period, make_shared<FunctionTask>(move(f)), flag});
        return id;
    }
    long scheduleEvery(long start, long period, function<void()> f, int priority = 0) { return scheduleAt(start, move(f), priority, period); }
    bool cancel(long id) { lock_guard l(m_); auto it = flags_.find(id); if (it == flags_.end() || *it->second) return false; *it->second = true; return true; }

    // The testable core: run everything that is due at `now`. Returns how many tasks were started.
    int runDue(long now) {
        vector<Entry> due;
        {
            lock_guard l(m_);
            while (!heap_.empty() && heap_.top().due <= now) {
                Entry e = heap_.top(); heap_.pop();
                if (*e.cancelled) continue;                                    // lazy deletion
                due.push_back(e);
                if (e.period > 0) { Entry next = e; next.due += e.period; heap_.push(next); }      // fixed rate: no drift
            }
        }
        for (auto& e : due) {                                                  // run outside the lock
            executor_(shared_ptr<Task>(e.task));
        }
        return static_cast<int>(due.size());
    }
    // How long until the next task? (the real scheduler thread sleeps for this long, or until woken)
    long nextDue(long fallback) { lock_guard l(m_); while (!heap_.empty() && *heap_.top().cancelled) heap_.pop(); return heap_.empty() ? fallback : heap_.top().due; }
};

int main() {
    vector<string> log;
    mutex logM;
    long now = 0;
    auto say = [&](string s) { lock_guard l(logM); log.push_back("t=" + to_string(now) + " " + move(s)); };

    // inline executor for the deterministic demo (production: a worker pool)
    Scheduler sched([](shared_ptr<Task> t) { try { t->run(); } catch (const exception& e) { cout << "  task failed: " << e.what() << "\n"; } });

    sched.scheduleAt(5, [&] { say("report (one-shot at 5)"); });
    sched.scheduleAt(5, [&] { say("alert (HIGH priority, also at 5)"); }, 10);
    sched.scheduleAt(3, [&] { say("email (one-shot at 3)"); });
    long heartbeat = sched.scheduleEvery(2, 4, [&] { say("heartbeat (every 4, from 2)"); });
    long doomed = sched.scheduleAt(6, [&] { say("this task is cancelled and never runs"); });
    sched.scheduleAt(7, [&] { throw runtime_error("backup failed"); });

    cout << "cancel the doomed task: " << boolalpha << sched.cancel(doomed) << "; cancel again: " << sched.cancel(doomed) << "\n";
    for (now = 0; now <= 14; ++now) {
        if (now == 11) { sched.cancel(heartbeat); say("(heartbeat cancelled)"); }
        sched.runDue(now);
    }
    for (auto& l : log) cout << "  " << l << "\n";

    cout << "real scheduler thread: tasks run on a worker pool, the loop sleeps until the next due time\n";
    {
        mutex m; condition_variable cv; bool stop = false; atomic<int> ran{0};
        long clockMs = 0;                                    // a fast fake clock: 1 tick = 1 ms of real waiting
        Scheduler real([&](shared_ptr<Task> t) { thread([t, &ran] { t->run(); ++ran; }).detach(); });   // a (very) naive "pool"
        real.scheduleAt(2, [] {}); real.scheduleAt(5, [] {}); real.scheduleEvery(3, 3, [] {});
        thread loop([&] {
            unique_lock lock(m);
            while (!stop && clockMs < 12) {
                long next = real.nextDue(clockMs + 1);
                cv.wait_for(lock, chrono::milliseconds(1), [&] { return stop; });   // sleep (a real one waits until `next`; woken by new tasks)
                ++clockMs; (void)next;
                lock.unlock(); real.runDue(clockMs); lock.lock();
            }
        });
        loop.join();
        this_thread::sleep_for(chrono::milliseconds(50));
        cout << "  tasks executed by the timer loop: " << ran << " (2 one-shots + 4 repeats of the periodic task)\n";
    }
}
```

## The real-time loop (production shape)

```text
loop:
    lock
    while queue empty:                    wait(cv)                      // sleep until something is scheduled
    next = top.due
    if now() < next:                      wait_until(cv, next)          // wake when due OR when a new, earlier task arrives
    else:                                 pop due entries, schedule recurrences, unlock, submit to the pool
```

`wait_until` with the earliest due time is the key: **no polling**, and `schedule*` calls `cv.notify_one()` so an earlier task wakes the loop to re-evaluate its sleep.

## Edge cases

| Case | Handling |
|---|---|
| Two tasks at the same time | priority, then submission order (the id) |
| Task takes longer than its period | with fixed rate, runs may overlap (a policy: skip, queue, or serialise per task) |
| Scheduler falls far behind | skip missed runs or catch up (policy); do not run 1,000 times at once |
| Cancel a task that is running | cancels future runs; the current run finishes (cooperative cancellation via a `stop_token` for long tasks) |
| Exception in a task | caught and logged; recurring tasks stay scheduled |
| Clock jumps (NTP) | use a monotonic clock for delays; wall clock only for "at 9:00" tasks |
| Shutdown | stop the loop, finish running tasks, optionally run or discard pending ones |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Cron expressions (`0 9 * * MON`)" | a `Schedule` interface with `nextAfter(time)`; a `CronSchedule` and `FixedRate` implement it (Strategy) |
| "Dependencies between tasks (B after A)" | a DAG executor on top (see the workflow engine problem) |
| "Retries with backoff" | a decorator task that reschedules itself on failure |
| "Persistence across restarts" | store schedules durably; reload at start |
| "Distributed scheduling, exactly one runner" | a leader election or a lock service; jobs claimed with leases |
| "Fairness and quotas per tenant" | per-tenant queues with weighted dequeuing |
| "Observability" | metrics for lateness (start time minus due time), queue depth |
| "Use C++ time types" | `std::chrono::steady_clock::time_point` for due times |

```quiz
? Why store tasks in a priority queue ordered by due time?
- To sort alphabetically
+ The earliest task is always on top, so the scheduler knows exactly how long to sleep
- Heaps are thread-safe
> It avoids scanning all tasks and avoids busy waiting.
? How can you cancel a task in a heap that does not support removal?
- Rebuild the heap
+ Mark it cancelled and skip it when it reaches the top (lazy deletion)
- You cannot
> A shared flag is checked at pop time.
```

:::keypoints
- Task = Command; Entry = task + due time + priority + period + cancel flag; a heap ordered by due time.
- A loop waits until the earliest due time (condition variable with a deadline), runs due tasks on workers, reschedules recurrences at `due + period`.
- Lazy cancellation, an injectable clock and a testable `runDue(now)` core. Cron expressions are a `Schedule` strategy.
:::
