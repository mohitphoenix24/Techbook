---
title: Build a Job Scheduler
level: advanced
time: 65
icon: clock
cover: #475569,#f97316
tags: thread pools, condition variables, timers, retries, back-pressure
summary: Build a multi-threaded job scheduler in C++ — a thread pool on a bounded blocking queue with futures, back-pressure and graceful shutdown, then a timer thread over a priority queue that releases delayed and periodic jobs on time, honours priorities, retries failures with exponential backoff, dead-letters hopeless jobs and supports cancellation.
---

The distributed job scheduler case study split the problem into planning, claiming and executing. This project builds the **execution engine** inside each node: real threads, real timers, real synchronisation. It's also the canonical LLD concurrency interview problem ("design a task scheduler").

:::flow What you'll build
Thread pool | N workers, a bounded queue, futures
Back-pressure | producers wait when the queue is full
Shutdown | finish queued work, then join
Timer thread | priority queue by due time; wait_until
Job features | delays, periods, priorities, retries, cancellation
Verification | ASan/UBSan, ThreadSanitizer, repeated runs
:::

## Step 1: a thread pool

Workers sleep on a **condition variable** until a task arrives; a task runs **outside** the lock; `submit` returns a `future` for the result. The queue is **bounded**: when it's full, producers wait instead of letting memory grow without limit.

```cpp run title="Thread pool with a bounded queue, futures and graceful shutdown"
// Step 1: a thread pool on a bounded blocking queue — the engine under every job scheduler
#include <bits/stdc++.h>
using namespace std;

class ThreadPool {
    vector<thread> workers;
    queue<function<void()>> tasks;
    mutex m;
    condition_variable notEmpty, notFull;
    size_t capacity;
    bool stopping = false;
public:
    ThreadPool(int n, size_t queueCapacity) : capacity(queueCapacity) {
        for (int i = 0; i < n; i++) workers.emplace_back([this] {
            for (;;) {
                function<void()> task;
                {
                    unique_lock lk(m);
                    notEmpty.wait(lk, [this] { return stopping || !tasks.empty(); });
                    if (tasks.empty()) return;              // stopping and drained: exit
                    task = move(tasks.front()); tasks.pop();
                }
                notFull.notify_one();
                task();                                     // run outside the lock
            }
        });
    }
    template <class F> auto submit(F f) -> future<decltype(f())> {
        auto job = make_shared<packaged_task<decltype(f())()>>(move(f));
        {
            unique_lock lk(m);
            notFull.wait(lk, [this] { return tasks.size() < capacity; });   // back-pressure: producers wait when full
            tasks.push([job] { (*job)(); });
        }
        notEmpty.notify_one();
        return job->get_future();
    }
    ~ThreadPool() {                                         // graceful shutdown: finish queued work, then join
        { lock_guard lk(m); stopping = true; }
        notEmpty.notify_all();
        for (auto& w : workers) w.join();
    }
};

bool isPrime(long n) { if (n < 2) return false; for (long d = 2; d * d <= n; d++) if (n % d == 0) return false; return true; }

int main() {
    atomic<int> maxConcurrent = 0, running = 0;
    vector<future<long>> results;
    {
        ThreadPool pool(4, 8);                              // 4 workers, at most 8 queued tasks
        for (long chunk = 0; chunk < 40; chunk++)
            results.push_back(pool.submit([chunk, &running, &maxConcurrent] {
                int now = ++running;
                for (int seen = maxConcurrent; now > seen && !maxConcurrent.compare_exchange_weak(seen, now);) {}
                long count = 0;
                for (long n = chunk * 25'000; n < (chunk + 1) * 25'000; n++) count += isPrime(n);
                --running;
                return count;
            }));
        long total = 0;
        for (auto& f : results) total += f.get();          // futures deliver each task's result (or exception)
        cout << "primes below 1,000,000: " << total << " (computed in 40 tasks)\n";
    }                                                       // pool destructor: drain and join
    cout << "never more than 4 tasks ran at once: " << boolalpha << (maxConcurrent <= 4) << "\n";
}
```

## Step 2: the scheduler

A **timer thread** keeps jobs in a priority queue ordered by due time (then priority) and sleeps with `wait_until` until the earliest one is due. A new, earlier job wakes it up (`notify`), so it re-checks. Due jobs move to a ready queue served by worker threads. Failures are rescheduled with **exponential backoff** until `maxAttempts`; periodic jobs schedule their next run from the **planned** time (so they don't drift).

```cpp run title="Delays, periodic jobs, priorities, retries and cancellation"
// Step 2: a job scheduler — delayed and periodic jobs, priorities, retries with backoff, cancellation
#include <bits/stdc++.h>
using namespace std;
using Clock = chrono::steady_clock;
using ms = chrono::milliseconds;

struct Job {
    int id; string name; int priority;                  // higher priority runs first when several are due
    Clock::time_point runAt;
    function<bool(int attempt)> work;                    // returns false on failure
    int maxAttempts = 3, attempt = 0;
    ms period{0}; int repeatsLeft = 0;                   // periodic jobs: run again `repeatsLeft` more times
};
struct Record { int id; string name; int attempt; long lateMs; bool ok; };

class Scheduler {
    struct Later { bool operator()(const Job& a, const Job& b) const {
        return a.runAt != b.runAt ? a.runAt > b.runAt : a.priority < b.priority; } };
    priority_queue<Job, vector<Job>, Later> timeline;    // ordered by due time, then priority
    deque<Job> ready;                                    // due jobs waiting for a worker
    set<int> cancelled;
    mutex m; condition_variable timerCv, readyCv;
    bool stopping = false;
    int inFlight = 0;
    vector<thread> threads;
public:
    vector<Record> log;                                  // written under the mutex, read after shutdown

    explicit Scheduler(int workers) {
        threads.emplace_back([this] { timerLoop(); });
        for (int i = 0; i < workers; i++) threads.emplace_back([this] { workerLoop(); });
    }
    void schedule(Job j) { { lock_guard lk(m); timeline.push(move(j)); } timerCv.notify_one(); }
    void cancel(int id) { lock_guard lk(m); cancelled.insert(id); }
    void waitIdle() {                                    // until nothing is scheduled, ready or running
        unique_lock lk(m);
        readyCv.wait(lk, [this] { return timeline.empty() && ready.empty() && inFlight == 0; });
    }
    ~Scheduler() {
        { lock_guard lk(m); stopping = true; }
        timerCv.notify_all(); readyCv.notify_all();
        for (auto& t : threads) t.join();
    }
private:
    void timerLoop() {                                   // sleeps until the earliest job is due, then releases it
        unique_lock lk(m);
        while (!stopping) {
            if (timeline.empty()) { timerCv.wait(lk); continue; }
            auto due = timeline.top().runAt;
            if (Clock::now() < due) { timerCv.wait_until(lk, due); continue; }   // woken early by a new job? re-check
            Job j = timeline.top(); timeline.pop();
            if (cancelled.count(j.id)) { readyCv.notify_all(); continue; }
            // among jobs due at the same moment, keep priority order in the ready queue
            auto pos = find_if(ready.begin(), ready.end(), [&](const Job& r) { return r.priority < j.priority; });
            ready.insert(pos, move(j));
            readyCv.notify_all();
        }
    }
    void workerLoop() {
        for (;;) {
            Job j;
            {
                unique_lock lk(m);
                readyCv.wait(lk, [this] { return stopping || !ready.empty(); });
                if (stopping) return;
                j = move(ready.front()); ready.pop_front(); inFlight++;
            }
            j.attempt++;
            long late = chrono::duration_cast<ms>(Clock::now() - j.runAt).count();
            bool ok = j.work(j.attempt);                 // run without holding the lock
            {
                lock_guard lk(m);
                log.push_back({j.id, j.name, j.attempt, late, ok});
                if (!ok && j.attempt < j.maxAttempts) {  // retry with exponential backoff: 10 ms, 20 ms, …
                    j.runAt = Clock::now() + ms(10 << (j.attempt - 1));
                    timeline.push(j);
                } else if (ok && j.repeatsLeft > 0) {    // periodic: schedule the next run from the planned time
                    j.repeatsLeft--; j.attempt = 0; j.runAt += j.period;
                    timeline.push(j);
                }
                inFlight--;
            }
            timerCv.notify_one(); readyCv.notify_all();
        }
    }
};

int main() {
    auto t0 = Clock::now();
    atomic<int> flakyCalls = 0;
    {
        Scheduler s(2);
        s.schedule({1, "send-report", 1, t0 + ms(30), [](int) { return true; }});
        s.schedule({2, "flaky-payment", 1, t0 + ms(10), [&](int attempt) { flakyCalls++; return attempt >= 3; }});   // fails twice
        s.schedule({3, "always-fails", 1, t0 + ms(10), [](int) { return false; }});
        Job tick{4, "refresh-cache", 1, t0 + ms(5), [](int) { return true; }};
        tick.period = ms(15); tick.repeatsLeft = 4;                                                  // 5 runs total
        s.schedule(tick);
        s.schedule({5, "cancelled-email", 1, t0 + ms(60), [](int) { return true; }});
        s.cancel(5);
        for (int i = 0; i < 6; i++)                      // six jobs due at the same instant: 2 urgent, 4 batch
            s.schedule({10 + i, i < 2 ? "urgent" : "batch", i < 2 ? 9 : 0, t0 + ms(80), [](int) { this_thread::sleep_for(ms(5)); return true; }});
        s.waitIdle();

        map<int, vector<Record>> byJob;
        for (auto& r : s.log) byJob[r.id].push_back(r);
        for (auto& [id, recs] : byJob) {
            if (id >= 10) continue;
            cout << "job " << id << " " << left << setw(14) << recs[0].name << right << ": " << recs.size() << " run(s), "
                 << count_if(recs.begin(), recs.end(), [](auto& r) { return r.ok; }) << " succeeded"
                 << (recs.back().ok ? "" : " → gave up after 3 attempts (dead letter)") << "\n";
        }
        cout << "job 5 cancelled-email : " << byJob.count(5) << " runs (cancelled before it was due)\n";
        vector<string> order;
        for (auto& r : s.log) if (r.id >= 10) order.push_back(r.name);
        cout << "same-instant jobs started in order: ";
        for (auto& o : order) cout << o << " ";
        cout << "\nno job ever started early: " << boolalpha
             << all_of(s.log.begin(), s.log.end(), [](auto& r) { return r.lateMs >= 0; }) << "\n";
    }
    cout << "flaky-payment was called " << flakyCalls << " times (2 failures, then success)\n";
}
```

:::note Testing concurrent code
Both programs were run under AddressSanitizer + UndefinedBehaviorSanitizer and ThreadSanitizer, and repeated under CPU load to check that the printed results never change. One TSan report turned out to be a known false positive: GCC 11's ThreadSanitizer doesn't intercept `pthread_cond_clockwait`, which `wait_until` uses with `steady_clock`. Switching the clock to `system_clock` (which uses the intercepted call) made every warning disappear, confirming there was no real race. Know your tools' blind spots.
:::

## How it works

| Concern | Technique |
|---|---|
| Waiting without spinning | `condition_variable::wait` with a predicate (handles spurious wake-ups) |
| Sleeping until a deadline | `wait_until(earliest due time)`; any new job notifies, so the timer re-checks |
| Correct timing | `steady_clock` (never jumps with wall-clock changes); periodic runs scheduled from planned time |
| No lock during work | pop the job under the lock, run it unlocked, record the result under the lock |
| Back-pressure | a bounded queue: producers block when it's full |
| Retries | exponential backoff (10, 20, 40 ms…), then dead-letter |
| Shutdown | set `stopping`, notify everyone, join all threads (RAII destructor) |

:::exercise Extend it
1. Add **per-job timeouts**: if a job runs longer than its limit, mark it failed (cooperatively, with a cancellation flag the job checks).
2. Add **cron-style schedules** ("every day at 02:00") by computing the next run time from a simple cron parser.
3. Add **jitter** to retries and periodic jobs, and show how it spreads out a thundering herd of 1,000 jobs due at the same instant.
4. Persist the timeline to a file (an append-only log of schedule/complete events) and **recover** pending jobs after a restart.
5. Implement **work stealing**: one deque per worker; idle workers steal from the back of others' deques.
:::

:::keypoints
- A **thread pool** = workers + a **bounded** blocking queue + condition variables; run tasks outside the lock; futures return results.
- A **timer thread** sleeps with `wait_until` on the earliest due job and is woken when an earlier job arrives.
- Use `steady_clock` for timers; schedule periodic jobs from the **planned** time; retry with **exponential backoff** and dead-letter after N attempts.
- **Graceful shutdown**: stop accepting, drain, notify, join.
- Test concurrency with **sanitizers and repetition**, and understand their false positives.
:::
