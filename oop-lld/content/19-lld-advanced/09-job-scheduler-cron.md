---
title: Design a Cron-Style Job Scheduler
level: advanced
time: 75
summary: A scheduler that runs jobs using cron expressions like */15 9-17 * * MON-FRI. Learn how to read a cron expression, how to find the next run time, rules for missed runs and overlapping runs, retries with waiting time, and how to make sure only one machine runs a job.
---

:::problem Design a Cron-Style Job Scheduler {level=hard tags="scheduling,cron,Strategy,time,retries,distributed locks"}
Design a job scheduler that runs registered jobs on cron schedules (for example `*/15 9-17 * * MON-FRI`). It works out the next run time of each job, runs jobs when they are due, keeps a history of runs, retries failed runs with waiting time, and has rules for runs that were missed (the scheduler was down) and for overlapping runs (the last run is still going). Think about what happens when several scheduler copies are running.
:::

:::hint Hint
The heart is a function **`nextAfter(schedule, time)`**: given a cron schedule and a time, it returns the next matching minute. Build it from a tiny calendar (days since 1970, turned into year, month, day, weekday). Jobs live in a priority queue ordered by next run, and the runner is the scheduler loop from the previous lesson. Everything else is a rule (policy): missed runs, overlap, retries, many machines.
:::

## First, what is cron?

Cron is the classic Unix tool that runs jobs on a schedule. A schedule has 5 fields:

```text
minute  hour  day-of-month  month  day-of-week
```

For example, `*/15 9-17 * * MON-FRI` means: every 15 minutes, between 9:00 and 17:59, on weekdays. `*` means "any". `1,15` is a list. `9-17` is a range. `*/15` is "every 15".

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| The syntax? | 5 fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-6, SUN=0, or names). Supports `*`, lists `1,15`, ranges `9-17`, steps `*/15`, `10-50/10` |
| Matching the day? | if both day-of-month and day-of-week are set, run when **either** matches (classic cron). If one is `*`, only the other counts |
| Time? | UTC minutes since 1970-01-01 (integers). A clock interface |
| Jobs? | id, schedule, action, retry rule, overlap rule, missed-run rule |
| History? | for each run: the scheduled time, start, end, status, attempt |
| Missed runs? | a rule: `Skip` (ignore), `RunOnce` (one catch-up run), `RunAll` (up to N) |
| Overlap? | a rule: `Skip` (do not start), `Queue` (wait), `Allow` |
| Retries? | N tries with longer and longer waiting |
| Many threads? | jobs run on workers. The scheduler loop is one thread. Several copies need a lock |
| Not needed | time zones and daylight saving, the save format, a screen |

## Step 2: Finding the next run

A cron schedule is five **sets of allowed values**. To find the next match after time T, we could go minute by minute, but that is too slow for rare schedules (like once a year). The fast way is to **jump field by field**:

```text
nextAfter(T):                       start at T + 1 minute
  loop:
    if month not allowed:            jump to the first minute of the next allowed month; continue
    if day not allowed:              jump to the next day at 00:00; continue
    if hour not allowed:             jump to the next hour at :00; continue
    if minute not allowed:           jump to the next minute; continue
    return this time
```

Each jump moves a whole month, day or hour at once. So even a "February 29" schedule is found in a few steps (within a few years).

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`CronSchedule` is a value** that holds five `bitset`s. `nextAfter` is a pure function, so it is easy to test fully.
- **`Calendar` helpers** change between days-since-1970 and (year, month, day) (Hinnant's civil date methods, which do not depend on `<chrono>` calendar support), and give the weekday.
- **The rules are Strategies:** `MissedRunPolicy` decides which of the missed times to run when the scheduler wakes after a gap. `OverlapPolicy` decides what to do if the last run is still going. `RetryPolicy` gives the delays.
- **The scheduler loop** (as in the Task Scheduler lesson): keep jobs in a min-heap by `nextRun`. `runDue(now)` takes out the due jobs, applies the rules, runs the action, saves history, and works out the new `nextRun = schedule.nextAfter(scheduledTime)`.
- **Work out `nextRun` from the scheduled time, not from `now`.** This stops drift and makes missed-run handling exact.
- **Several scheduler copies:** each tick, before running job J for scheduled time T, call `tryAcquire("J@T")` on a **shared lease store** (a database row with a unique key, Redis `SET NX`, ZooKeeper). Only one copy wins. The run key makes it safe to repeat.
- **A clock passed in** for predictable tests.

## Step 5: The code

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

## Many machines: exactly one runner

If three scheduler copies run for high availability, each would start the same job. The fix is a **lease on the run, not on the job**:

```text
for each due (job J, scheduled time T):
    key = J + "@" + T
    if store.tryAcquire(key, myInstanceId, ttl):     // INSERT unique row / SET NX PX in Redis
        execute()                                    // exactly one instance wins per (J, T)
        store.markDone(key)
    else:
        skip                                         // another instance has it
```

The key contains the scheduled time. If a copy crashes after getting the lease, the lease **expires** (ttl), and another copy can try again. So the job must be safe to repeat (idempotent), or write its own "done" record.

## Edge cases

| Case | What happens |
|---|---|
| `0 0 29 2 *` (Feb 29) | the month and day jumps find the next leap year in a few steps |
| Both day-of-month and day-of-week are set | OR rule (classic cron). Write it down |
| Daylight saving and time zones | schedule in UTC. Or convert local schedule times with a time-zone library and decide a rule for skipped or repeated hours |
| Clock changes (NTP) | use a steady clock for waiting, and the wall clock for matching |
| A long job with `Allow` overlap | runs happen together. The action must be safe to run together. Limit how many for each job |
| Very many jobs | a heap by `nextRun`. One timer for the earliest |
| A job removed or a schedule edited | work out `nextRun` again from "now". Keep the history |
| Retries used up | status Failed, send an alert. Optionally a dead-letter list |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Run once at a given time" | a `OneShot` schedule with the same `nextAfter` interface (a `Schedule` strategy) |
| "Jobs that depend on each other" | pass it to the workflow engine (the next lessons) |
| "Pause, resume, run now" | job states and commands through an admin API |
| "Save jobs and history" | a `JobRepository`. Load `nextRun` at start (applying the missed-run rule) |
| "Spread out start times (jitter)" | add a random shift to start times |
| "Time limits and cancelling" | a stop token passed to the action. The runner enforces a deadline |
| "Numbers to watch" | lateness (start minus scheduled), how long it ran, failure rate |
| "Cron extras (`@daily`, `L` last day, `#` nth weekday)" | extra parse cases that give the same bitsets, or a richer `Schedule` |

## Short answer to say in an interview

:::interview How do you compute the next run time of a cron job?
"A cron schedule is five sets of allowed values: minute, hour, day, month, weekday. To find the next run after a time, I start one minute later and jump field by field. If the month is not allowed, I jump to the start of the next allowed month. Then the same for the day, the hour and the minute. Each jump skips a whole unit, so even rare schedules like February 29 take only a few steps. I work out the next run from the scheduled time, not from now, so there is no drift and missed runs can be counted exactly."
:::

```quiz
? Why jump by month, day and hour when finding the next run?
- It looks clever
+ Going minute by minute could take millions of steps for rare schedules. Jumping skips whole units that do not match
- Cron requires it
> Each jump goes to the next candidate at the biggest field that does not match.
? Why work out the next run from the scheduled time and not from "now"?
- It is simpler
+ It stops drift and makes missed-run handling exact (every scheduled time is counted)
- Clocks are not reliable
> The list of scheduled times belongs to the schedule, not to when the scheduler happens to wake up.
```

:::keypoints
- `CronSchedule` = five bitsets plus `nextAfter`, which jumps by month, day and hour using a small calendar.
- Rules (missed, overlap, retry) are strategies. Move forward from the scheduled time. Keep a history for each run.
- Several copies: a lease on (job, scheduled time), so exactly one runs it. Actions should be safe to repeat.
:::
