---
title: Design a Cron-Style Job Scheduler
level: advanced
time: 75
summary: Parsing cron expressions, computing the next run time from first principles with a small calendar, a job registry with run history, policies for missed runs and overlapping runs, retries with backoff, and how to make exactly-one-runner work across many machines.
---

:::problem Design a Cron-Style Job Scheduler {level=hard tags="scheduling,cron,Strategy,time,retries,distributed locks"}
Design a job scheduler that runs registered jobs on cron schedules (for example `*/15 9-17 * * MON-FRI`). It computes the next run time for each job, runs jobs when due, keeps a run history, retries failed runs with backoff, and applies policies for runs that were missed (the scheduler was down) and for overlapping runs (the previous run is still going). Think about how it behaves with several scheduler instances running.
:::

:::hint Hint
The core is a function **`nextAfter(schedule, time)`**: given a cron schedule and a time, return the next matching minute. Build it from a tiny calendar (days since the epoch ↔ year, month, day, weekday). Jobs live in a priority queue keyed by next run; the runner is the previous lesson's scheduler loop. Everything else is policy: missed runs, overlap, retries, distribution.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Schedule syntax? | 5 fields: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, SUN=0, or names); supports `*`, lists `1,15`, ranges `9-17`, steps `*/15`, `10-50/10` |
| Day matching? | if both day-of-month and day-of-week are restricted, run when **either** matches (classic cron); if one is `*`, only the other applies |
| Time? | UTC minutes since 1970-01-01 (integers); a clock interface |
| Jobs? | id, schedule, action, retry policy, overlap policy, missed-run policy |
| History? | each run: scheduled time, start, end, status, attempt |
| Missed runs? | policy: `Skip` (ignore), `RunOnce` (one catch-up run), `RunAll` (up to N) |
| Overlap? | policy: `Skip` (don't start), `Queue` (wait), `Allow` |
| Retries? | N attempts with exponential backoff |
| Concurrency? | jobs run on workers; scheduler loop is single; multiple instances need a lock |
| Out of scope | time zones and DST, persistence format, UI |

## Step 2: computing the next run

A cron schedule is five **sets of allowed values**. To find the next match after time T, increment minute by minute? Too slow for rare schedules (yearly). The efficient way is to **jump field by field**:

```text
nextAfter(T):                       start at T + 1 minute
  loop:
    if month not allowed:            jump to the first minute of the next allowed month; continue
    if day not allowed:              jump to the next day at 00:00; continue
    if hour not allowed:             jump to the next hour at :00; continue
    if minute not allowed:           jump to the next minute; continue
    return this time
```

Each jump moves a whole month/day/hour at once, so even "February 29" schedules resolve in a handful of iterations (bounded by a few years).

## Step 3: entities

```viz algo=uml title="Cron scheduler"
class JobScheduler
  + add(job: Job): void
  + runDue(now: long): void
  + history(id: string): Run[]
class Job
  - id: string
  - schedule: CronSchedule
  - action: function
  - retry: RetryPolicy
  - overlap: OverlapPolicy
  - missed: MissedRunPolicy
  - nextRun: long
class CronSchedule
  - minutes: bitset
  - hours: bitset
  - daysOfMonth: bitset
  - months: bitset
  - daysOfWeek: bitset
  + nextAfter(t: long): long
  + parse(expr: string): CronSchedule
class Calendar
  + civilFromDays(d: long): Date
  + daysFromCivil(y: int, m: int, d: int): long
  + weekday(d: long): int
class Run
  - scheduled: long
  - started: long
  - status: RunStatus
  - attempt: int
interface RetryPolicy
class ExponentialBackoff
interface OverlapPolicy
interface MissedRunPolicy
interface Clock
interface LeaseStore
  + tryAcquire(job: string, owner: string, until: long): bool
JobScheduler *-- Job
Job --> CronSchedule
CronSchedule ..> Calendar
Job --> RetryPolicy
Job --> OverlapPolicy
Job --> MissedRunPolicy
JobScheduler --> Clock
JobScheduler --> LeaseStore
Job *-- Run
ExponentialBackoff ..|> RetryPolicy
```

## Step 4: design decisions

- **`CronSchedule` is a value object** holding five `bitset`s. `nextAfter` is a pure function, easy to test exhaustively.
- **`Calendar` helpers** convert between days-since-epoch and (year, month, day) (Hinnant's civil algorithms, no dependency on `<chrono>` calendar support) and compute the weekday.
- **Policies as Strategies**: `MissedRunPolicy` decides which of the missed scheduled times to run when the scheduler wakes after a gap; `OverlapPolicy` decides what to do if the previous run is still active; `RetryPolicy` yields delays.
- **Scheduler loop** (as in the Task Scheduler lesson): keep jobs in a min-heap by `nextRun`; `runDue(now)` pops due jobs, applies the policies, runs the action, records history, computes the new `nextRun = schedule.nextAfter(scheduledTime)`.
- **Computing `nextRun` from the scheduled time, not from `now`**, prevents drift and makes missed-run handling exact.
- **Multiple scheduler instances**: each tick, before running job J for scheduled time T, `tryAcquire("J@T")` on a **shared lease store** (a database row with unique key, Redis `SET NX`, ZooKeeper): only one instance wins. The run key makes this idempotent.
- **Injected clock** for deterministic tests.

## Step 5: the code

```cpp run title="Cron parsing, next-run computation, missed runs, overlap and retries"
#include <bitset>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <queue>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

using Minute = long;                                         // minutes since 1970-01-01 00:00 UTC

// ---------- calendar (Howard Hinnant's civil-date algorithms) ----------
struct Date { int y, m, d; };
long daysFromCivil(int y, int m, int d) { y -= m <= 2; long era = (y >= 0 ? y : y - 399) / 400; long yoe = y - era * 400; long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1; long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; return era * 146097 + doe - 719468; }
Date civilFromDays(long z) { z += 719468; long era = (z >= 0 ? z : z - 146096) / 146097; long doe = z - era * 146097; long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; long y = yoe + era * 400; long doy = doe - (365 * yoe + yoe / 4 - yoe / 100); long mp = (5 * doy + 2) / 153; int d = static_cast<int>(doy - (153 * mp + 2) / 5 + 1); int m = static_cast<int>(mp < 10 ? mp + 3 : mp - 9); return {static_cast<int>(y + (m <= 2)), m, d}; }
int weekday(long days) { return static_cast<int>(((days % 7) + 11) % 7); }        // 0 = Sunday (1970-01-01 was a Thursday)
Minute at(int y, int mo, int d, int h = 0, int mi = 0) { return daysFromCivil(y, mo, d) * 1440 + h * 60 + mi; }
string fmt(Minute t) { long days = t / 1440; int mins = static_cast<int>(t % 1440); Date dt = civilFromDays(days); static const char* wd[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}; char buf[64]; snprintf(buf, sizeof buf, "%s %04d-%02d-%02d %02d:%02d", wd[weekday(days)], dt.y, dt.m, dt.d, mins / 60, mins % 60); return buf; }

// ---------- cron schedule ----------
class CronSchedule {
    bitset<60> minutes_; bitset<24> hours_; bitset<32> dom_; bitset<13> months_; bitset<7> dow_;
    bool domStar_ = false, dowStar_ = false;
    static int nameToNumber(string s) {
        static const map<string, int> n{{"SUN", 0}, {"MON", 1}, {"TUE", 2}, {"WED", 3}, {"THU", 4}, {"FRI", 5}, {"SAT", 6}, {"JAN", 1}, {"FEB", 2}, {"MAR", 3}, {"APR", 4}, {"MAY", 5}, {"JUN", 6}, {"JUL", 7}, {"AUG", 8}, {"SEP", 9}, {"OCT", 10}, {"NOV", 11}, {"DEC", 12}};
        for (char& c : s) c = static_cast<char>(toupper(c));
        auto it = n.find(s); return it != n.end() ? it->second : stoi(s);
    }
    template <size_t N> static void parseField(const string& f, int lo, int hi, bitset<N>& out, bool& star) {
        star = f == "*";
        stringstream ss(f); string part;
        while (getline(ss, part, ',')) {
            int step = 1; size_t slash = part.find('/');
            if (slash != string::npos) { step = stoi(part.substr(slash + 1)); part = part.substr(0, slash); if (step <= 0) throw invalid_argument("bad step"); }
            int a = lo, b = hi;
            if (part != "*") { size_t dash = part.find('-'); if (dash == string::npos) { a = nameToNumber(part); b = slash == string::npos ? a : hi; } else { a = nameToNumber(part.substr(0, dash)); b = nameToNumber(part.substr(dash + 1)); } }
            if (a < lo || b > hi || a > b) throw invalid_argument("value out of range in '" + f + "'");
            for (int v = a; v <= b; v += step) out.set(v);
        }
    }
public:
    static CronSchedule parse(const string& expr) {
        stringstream ss(expr); vector<string> f; string t; while (ss >> t) f.push_back(t);
        if (f.size() != 5) throw invalid_argument("a cron expression has 5 fields");
        CronSchedule c; bool ignore;
        parseField(f[0], 0, 59, c.minutes_, ignore); parseField(f[1], 0, 23, c.hours_, ignore);
        parseField(f[2], 1, 31, c.dom_, c.domStar_); parseField(f[3], 1, 12, c.months_, ignore); parseField(f[4], 0, 6, c.dow_, c.dowStar_);
        return c;
    }
    bool dayMatches(long days) const {
        Date d = civilFromDays(days); bool domOk = dom_.test(d.d), dowOk = dow_.test(weekday(days));
        if (domStar_ && dowStar_) return true;
        if (domStar_) return dowOk; if (dowStar_) return domOk;
        return domOk || dowOk;                                // both restricted: either matches (classic cron)
    }
    // the first matching minute strictly after t; jumps whole months/days/hours instead of looping minute by minute
    Minute nextAfter(Minute t) const {
        Minute cur = t + 1;
        for (int guard = 0; guard < 100000; ++guard) {
            long days = cur / 1440; int minOfDay = static_cast<int>(cur % 1440); Date d = civilFromDays(days);
            if (!months_.test(d.m)) { cur = daysFromCivil(d.y + (d.m == 12), d.m % 12 + 1, 1) * 1440; continue; }       // jump to the 1st of the next month
            if (!dayMatches(days)) { cur = (days + 1) * 1440; continue; }                                                // jump to the next day
            int h = minOfDay / 60, m = minOfDay % 60;
            if (!hours_.test(h)) { cur = days * 1440 + (h + 1) * 60; continue; }                                         // jump to the next hour
            if (!minutes_.test(m)) { cur = cur + 1; continue; }
            return cur;
        }
        throw runtime_error("no matching time within the search limit");
    }
};

// ---------- policies ----------
enum class Overlap { Skip, Allow };
enum class Missed { Skip, RunOnce };
struct RetryPolicy { int maxAttempts = 3; long delayFor(int attempt) const { return 1L << (attempt - 1); } };    // minutes: 1, 2, 4

enum class RunStatus { Succeeded, Failed, SkippedOverlap, SkippedMissed };
const char* name(RunStatus s) { static const char* n[] = {"succeeded", "failed", "skipped (previous run still active)", "skipped (missed while the scheduler was down)"}; return n[static_cast<int>(s)]; }
struct Run { Minute scheduled; RunStatus status; int attempts; };

struct Job {
    string id; CronSchedule schedule; function<bool(int attempt)> action;   // returns true on success
    RetryPolicy retry; Overlap overlap = Overlap::Skip; Missed missed = Missed::RunOnce;
    Minute nextRun = 0; bool running = false; vector<Run> history;
};

class JobScheduler {
    map<string, unique_ptr<Job>> jobs_;
public:
    void add(unique_ptr<Job> j, Minute now) { j->nextRun = j->schedule.nextAfter(now); jobs_[j->id] = move(j); }
    // Run everything due at `now`. If we were away, several scheduled times may be due: apply the missed-run policy.
    void runDue(Minute now) {
        for (auto& [id, job] : jobs_) {
            vector<Minute> due;
            while (job->nextRun <= now) { due.push_back(job->nextRun); job->nextRun = job->schedule.nextAfter(job->nextRun); }      // advance from the SCHEDULED time: no drift
            if (due.empty()) continue;
            if (job->missed == Missed::RunOnce && due.size() > 1) {
                for (size_t i = 0; i + 1 < due.size(); ++i) job->history.push_back({due[i], RunStatus::SkippedMissed, 0});
                due = {due.back()};                                                                                                // one catch-up run
            }
            for (Minute scheduled : due) execute(*job, scheduled);
        }
    }
    const vector<Run>& history(const string& id) const { return jobs_.at(id)->history; }
    Job& job(const string& id) { return *jobs_.at(id); }
private:
    void execute(Job& job, Minute scheduled) {
        if (job.running && job.overlap == Overlap::Skip) { job.history.push_back({scheduled, RunStatus::SkippedOverlap, 0}); return; }
        job.running = true;
        int attempt = 0; bool ok = false;
        while (attempt < job.retry.maxAttempts && !ok) { ++attempt; ok = job.action(attempt); }          // (a real scheduler schedules the retry after delayFor(attempt) minutes)
        job.running = false;
        job.history.push_back({scheduled, ok ? RunStatus::Succeeded : RunStatus::Failed, attempt});
    }
};

int main() {
    cout << "calendar sanity: 2024-02-29 is a " << fmt(at(2024, 2, 29)) << "\n";
    cout << "\ncron next-run computation (from " << fmt(at(2025, 1, 15, 10, 7)) << "):\n";
    for (const char* e : {"*/15 * * * *", "0 9 * * MON-FRI", "30 2 1 * *", "0 0 29 2 *", "0 12 * * 0,6", "5 4 * * 1"}) {
        auto c = CronSchedule::parse(e);
        Minute t = at(2025, 1, 15, 10, 7);
        cout << "  '" << e << "'  ->";
        for (int i = 0; i < 3; ++i) { t = c.nextAfter(t); cout << "  " << fmt(t); }
        cout << "\n";
    }
    cout << "invalid expressions:\n";
    for (const char* e : {"* * * *", "61 * * * *", "*/0 * * * *"}) { try { CronSchedule::parse(e); } catch (const exception& ex) { cout << "  '" << e << "' -> " << ex.what() << "\n"; } }

    cout << "\njob scheduling with policies:\n";
    JobScheduler sched; Minute now = at(2025, 3, 3, 8, 59);               // Monday
    int reportRuns = 0, flakyCalls = 0;
    auto report = make_unique<Job>(); report->id = "report"; report->schedule = CronSchedule::parse("0 9 * * MON-FRI");
    report->action = [&](int) { ++reportRuns; return true; };
    sched.add(move(report), now);

    auto flaky = make_unique<Job>(); flaky->id = "sync"; flaky->schedule = CronSchedule::parse("*/30 9-10 * * *");
    flaky->action = [&](int attempt) { ++flakyCalls; return attempt >= 3; };                      // fails twice, succeeds on the third try
    sched.add(move(flaky), now);

    auto slow = make_unique<Job>(); slow->id = "backup"; slow->schedule = CronSchedule::parse("*/10 9 * * *");
    slow->action = [&](int) { return true; };
    sched.add(move(slow), now);

    auto beat = make_unique<Job>(); beat->id = "heartbeat"; beat->schedule = CronSchedule::parse("*/15 * * * *");
    beat->action = [&](int) { return true; };
    sched.add(move(beat), now);

    for (Minute t = now + 1; t <= at(2025, 3, 3, 10, 0); ++t) sched.runDue(t);                  // minute by minute, nothing missed
    cout << "  report ran " << reportRuns << " time(s) by 10:00; sync made " << flakyCalls << " calls (retries: attempt 3 succeeded)\n";
    for (auto& r : sched.history("sync")) cout << "    sync scheduled " << fmt(r.scheduled) << ": " << name(r.status) << ", attempts " << r.attempts << "\n";

    cout << "\nthe scheduler was down from 10:01 until 10:45 on Monday: 'heartbeat' (every 15 minutes) missed 10:15 and 10:30\n";
    sched.runDue(at(2025, 3, 3, 10, 45));
    for (auto& r : sched.history("heartbeat")) if (r.scheduled > at(2025, 3, 3, 10, 0)) cout << "    heartbeat scheduled " << fmt(r.scheduled) << ": " << name(r.status) << "\n";
    cout << "  with the RunOnce policy only the latest due time runs; the earlier ones are recorded as missed\n";

    cout << "\noverlap policy: a run still active when the next is due is skipped\n";
    sched.job("backup").running = true;
    sched.job("backup").nextRun = at(2025, 3, 4, 9, 0);
    sched.runDue(at(2025, 3, 4, 9, 0));
    for (auto& r : sched.history("backup")) if (r.status == RunStatus::SkippedOverlap) cout << "    backup scheduled " << fmt(r.scheduled) << ": " << name(r.status) << "\n";
}
```

## Distributed operation: exactly one runner

If three scheduler instances run for high availability, each would fire the same job. Fix with a **lease on the run, not on the job**:

```text
for each due (job J, scheduled time T):
    key = J + "@" + T
    if store.tryAcquire(key, myInstanceId, ttl):     // INSERT unique row / SET NX PX in Redis
        execute()                                    // exactly one instance wins per (J, T)
        store.markDone(key)
    else:
        skip                                         // another instance has it
```

Because the key contains the scheduled time, a crash after acquiring leaves a lease that **expires** (ttl), and another instance can retry; the job must be idempotent or write its own completion record.

## Edge cases

| Case | Handling |
|---|---|
| `0 0 29 2 *` (Feb 29) | the month/day jumps find the next leap year within a few iterations |
| Both day-of-month and day-of-week restricted | OR semantics (classic cron); document it |
| DST gaps/overlaps and time zones | schedule in UTC; or convert local schedule times with a time-zone library and decide policy for skipped/duplicated hours |
| Clock changes (NTP) | use a monotonic clock for waits, wall-clock for matching |
| Long-running job and `Allow` overlap | concurrent runs: the action must be re-entrant; limit concurrency per job |
| Very many jobs | heap keyed by `nextRun`; one timer for the earliest |
| Job removed or schedule edited | recompute `nextRun` from "now"; keep history |
| Retry exhausted | status Failed, alert; optional dead-letter |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Run once at a specific time" | a `OneShot` schedule implementing the same `nextAfter` interface (`Schedule` strategy) |
| "Dependencies between jobs" | hand off to the workflow engine (next lessons) |
| "Pause/resume, manual trigger, run now" | job states and commands via an admin API |
| "Persist jobs and history" | a `JobRepository`; reload `nextRun` on start-up (applying the missed-run policy) |
| "Jitter to avoid thundering herds" | add a random offset to start times |
| "Timeouts and cancellation" | a stop token passed to the action; the runner enforces a deadline |
| "Metrics" | lateness (start − scheduled), duration, failure rate |
| "Cron extensions (`@daily`, `L` last day, `#` nth weekday)" | extra parse cases producing the same bitsets or a richer `Schedule` |

```quiz
? Why jump by month/day/hour when computing the next run?
- It looks cleverer
+ Searching minute by minute could take millions of steps for rare schedules; jumping skips whole non-matching units
- Cron requires it
> Each jump advances to the next candidate at the coarsest non-matching field.
? Why compute the next run from the scheduled time rather than from "now"?
- It is simpler
+ It avoids drift and makes missed-run handling exact (every scheduled time is accounted for)
- Because clocks are unreliable
> The sequence of scheduled times is a property of the schedule, not of when the scheduler happens to wake.
```

:::keypoints
- `CronSchedule` = five bitsets + `nextAfter`, which jumps by month, day and hour using a small calendar.
- Policies (missed, overlap, retry) are strategies; advance from the scheduled time; history per run.
- Multiple instances: a lease on (job, scheduled time) so exactly one executes; actions should be idempotent.
:::
