---
title: Design a Task Scheduler
level: intermediate
time: 60
summary: Run tasks now, after a delay, at a set time, or again and again. Learn priorities, cancelling, a pool of workers, a priority queue of timers driven by a clock, a step-by-step simulation for tests, and the Command pattern at the centre.
---

:::problem Design a Task Scheduler {level=medium tags="Command,priority queue,timers,concurrency,scheduling,cron-like"}
Design an in-program task scheduler like `ScheduledExecutorService` or a tiny cron. Clients submit tasks to run **once at a time**, **after a delay**, or **again and again at a fixed rate**. Tasks have priorities and can be cancelled. A pool of workers runs the tasks that are due. The design must not busy-wait, and it must be testable without real time.
:::

:::hint Hint
A scheduled task is a **Command** with a due time. Keep tasks in a **priority queue ordered by due time** (then by priority). One scheduler loop waits until the earliest task is due, and gives the due tasks to a worker pool. Pass in the **clock**, and let tests move time forward by hand.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Kinds of task? | once at time T, once after a delay D, or again every P (fixed rate) |
| Priority? | when several tasks are due at the same time, the higher priority runs first |
| Cancel? | `cancel(id)` stops a task (and its later repeats) |
| Running? | a pool of workers. A slow task must not block the timer |
| Failures? | an error in a task is caught and logged. Repeating tasks go on |
| Time? | a clock that we pass in. Real use sleeps until the next due time |
| Many threads? | submit and cancel from any thread |
| Not needed | saving to disk, cron expressions (an extension), scheduling across machines |

## Step 2: How time is handled

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **A task is a Command** (`run()`), wrapped in an **Entry** with a due time, priority, period and a cancelled flag.
- **A `priority_queue` ordered by `(due time first, priority high first, id small first)`.** The id makes the order exact, and first-come-first-served among equals.
- **Cancel with a shared flag** (`shared_ptr<atomic<bool>>`), not by removing from the heap (a heap cannot remove from the middle). Cancelled entries are skipped when they reach the top (lazy deletion).
- **Fixed rate** sets the next time as `due += period` (not `now + period`), so small delays do not build up. If the scheduler falls far behind, it skips the missed runs (a policy).
- **The timer and the running are separate.** The scheduler thread only hands entries to the pool. The tasks run on workers.
- **The part we test is `runDue(now)`.** It takes the time and returns which tasks ran. The real scheduler thread is a thin loop that waits and then calls it. In the demo, we drive `runDue` with a hand-moved clock, so the output is the same every time.
- **Waking up:** if a task is scheduled earlier than the current earliest, the loop must wake up (a condition variable notify).

## Step 5: The code

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

## The real-time loop (how it looks in real use)

```text
loop:
    lock
    while queue empty:                    wait(cv)                      // sleep until something is scheduled
    next = top.due
    if now() < next:                      wait_until(cv, next)          // wake when due OR when a new, earlier task arrives
    else:                                 pop due entries, schedule recurrences, unlock, submit to the pool
```

`wait_until` with the earliest due time is the key. There is **no polling**. And `schedule*` calls `cv.notify_one()`, so a task that is due earlier wakes the loop so it can sleep for a shorter time.

## Edge cases

| Case | What happens |
|---|---|
| Two tasks at the same time | by priority, then by the order they were submitted (the id) |
| A task takes longer than its period | with a fixed rate, runs may overlap (a policy: skip, queue, or one at a time for each task) |
| The scheduler falls far behind | skip the missed runs, or catch up (a policy). Do not run 1,000 times at once |
| Cancelling a task that is running | future runs stop. The current run finishes (for long tasks, use a `stop_token` to ask politely) |
| An error in a task | caught and logged. Repeating tasks stay scheduled |
| The clock jumps (NTP) | use a steady clock for delays. Use the wall clock only for "at 9:00" tasks |
| Shutdown | stop the loop, let running tasks finish, and run or drop the waiting ones |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Cron expressions (`0 9 * * MON`)" | a `Schedule` interface with `nextAfter(time)`. `CronSchedule` and `FixedRate` follow it (Strategy) |
| "Tasks that depend on each other (B after A)" | a DAG runner on top (see the workflow engine problem) |
| "Retry with waiting time" | a decorator task that schedules itself again on failure |
| "Keep schedules after a restart" | save them safely and load at start |
| "Many machines, exactly one runs it" | pick a leader, or use a lock service. Jobs are claimed with a lease |
| "Fairness and quotas for each customer" | a queue for each customer, taken in turns with weights |
| "Watching it" | measure lateness (start time minus due time) and queue size |
| "Use C++ time types" | `std::chrono::steady_clock::time_point` for due times |

## Short answer to say in an interview

:::interview How do you design a task scheduler without busy-waiting?
"Each task is a Command with a due time, kept in a priority queue ordered by due time, then priority, then id. One scheduler thread waits on a condition variable until the earliest due time, using wait_until, so it does not poll. When tasks are due, it hands them to a worker pool. Scheduling an earlier task notifies the condition variable to wake the loop. Repeating tasks are rescheduled at due plus period. Cancel is a shared flag that is checked when the entry reaches the top. I pass the clock in, so tests move time by hand."
:::

```quiz
? Why keep tasks in a priority queue ordered by due time?
- To sort alphabetically
+ The earliest task is always on top, so the scheduler knows exactly how long to sleep
- Heaps are thread-safe
> It avoids scanning every task and avoids busy waiting.
? How can you cancel a task in a heap that cannot remove from the middle?
- Rebuild the heap
+ Mark it cancelled and skip it when it reaches the top (lazy deletion)
- You cannot
> A shared flag is checked when the entry is taken out.
```

:::keypoints
- A task is a Command. An Entry = task + due time + priority + period + cancel flag. A heap ordered by due time.
- A loop waits until the earliest due time (a condition variable with a deadline), runs due tasks on workers, and sets repeats at `due + period`.
- Lazy cancel, a clock passed in, and a testable `runDue(now)`. Cron expressions are a `Schedule` strategy.
:::
