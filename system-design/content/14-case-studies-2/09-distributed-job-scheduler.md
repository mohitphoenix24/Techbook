---
title: Design a Distributed Job Scheduler
level: advanced
time: 50
summary: Cron for a whole company — job definitions and run records, turning schedules into due runs, partitioned schedulers that never fire a run twice, claiming work with leases, at-least-once execution made safe by idempotency, retries with backoff and dead-letter, priorities and fairness between tenants, and observability for millions of runs a day.
---

:::problem Design a Distributed Job Scheduler {level=hard tags="HLD,leases,at-least-once,queues"}
Design a platform that runs scheduled and delayed jobs for every team in a company (like Airflow's scheduler, AWS EventBridge Scheduler, or Uber's Cherami/Cadence timers): "every day at 02:00 send invoices", "in 30 minutes, cancel this unpaid order", "every 5 minutes, refresh this cache". **100 M job runs per day**, fired within **a few seconds** of their due time, **never lost**, and not run concurrently twice.

:::hint Hint
Separate *when* (turning schedules into concrete runs with due times) from *who runs it* (workers claiming due runs). A run must be claimed **atomically with a lease**, so a crashed worker's run is picked up again, which means jobs execute **at least once**: make their effects idempotent. Partition everything by time and job id so no single scheduler is a bottleneck.
:::
:::

The LLD lesson on a task scheduler covered the in-process design (priority queue, worker threads). This is the distributed version.

## 1. Requirements

**Functional**: register jobs (cron expression, one-off delay, or fixed rate) with a payload and a target (HTTP endpoint, queue, container); pause/resume/delete; run history and logs; retries with backoff; per-job timeout; manual "run now".

**Non-functional**
- **Reliable**: a due run is never lost (durable), and doesn't run twice concurrently.
- **Timely**: starts within seconds of its due time.
- **Scalable** to 100 M runs/day with spiky peaks (everyone schedules at the top of the hour); **fair** between tenants.

## 2. Estimates

:::derive Load
10^8\ \text{runs/day} / 10^5\,\text{s} \approx 1{,}200\ \text{runs/s average} ||
\text{peak: many cron jobs at :00} \Rightarrow 20\text{–}50\times \text{ burst for a few seconds} || spread with jitter where allowed
!\text{run records: } 10^8 \times 500\,\text{B} = 50\,\text{GB/day} \Rightarrow \text{partition by time, expire after 30–90 days} ||
:::

## 3. Data model and API

```text
jobs   (job_id, tenant, schedule: cron | at | every, payload, target, timeout, max_attempts, priority, enabled)
runs   (run_id = job_id@scheduled_time, job_id, due_at, status: scheduled | running | done | failed | dead,
        owner, lease_until, attempts, result)          ← partitioned/indexed by due_at

POST /v1/jobs {schedule, target, payload, …}   → job_id
POST /v1/jobs/{id}/run                         → run_id (manual trigger)
GET  /v1/jobs/{id}/runs?from=…                 → history
```

`run_id = job_id@scheduled_time` is deterministic: generating the same run twice is a no-op (unique key), and it doubles as the **idempotency key** for the job's effects.

## 4. High-level design

```viz algo=arch title="Distributed job scheduler" dir=down
api      Job API [service] @0,1
jobs     Jobs DB | definitions [sql] @1,1
planner  Planner | cron → next runs [clock*2] @2,0
runs     Runs store | indexed by due time [db] @2,1
disp     Dispatchers | claim due runs, partitioned [service*3] @3,1
q        Ready queues | per priority / tenant [queue] @4,1
workers  Workers / targets [worker*3] @5,1
mon      History + alerts [chart] @2,2.1
--
api -> jobs
planner -> jobs : read schedules
planner -> runs : insert next runs
disp -> runs : claim with lease
disp -> q : enqueue
q -> workers
workers ~> runs : done / failed
runs ~> mon
--
flow A cron job fires
api > jobs : A team registers "send-invoices", cron 0 2 * * *.
planner > runs : The planner materialises upcoming runs ahead of time: send-invoices@2026-10-13T02:00 (unique run id).
disp > runs : At 02:00:00 the dispatcher owning this time/partition claims due runs: status scheduled → running, lease 60 s (conditional update).
disp > q : It enqueues the run on the tenant's priority queue.
q > workers : A worker executes it with the run id as idempotency key, extending the lease while it works…
workers > runs : …and marks the run done (or failed → rescheduled with backoff).
flow A worker dies
workers > runs : The worker crashes mid-run; its lease is not renewed.
disp > runs : After lease_until passes, the run is claimable again and is re-dispatched (attempt 2). Idempotent effects make the re-run safe.
```

## 5. Deep dives

### A. From schedules to runs

The **planner** converts schedules into concrete run rows a short horizon ahead (e.g. the next hour), using the deterministic run id so re-planning is harmless. One-off delayed jobs ("cancel order in 30 min") are inserted directly as runs. Due-time lookups use an index on `(partition, due_at)`; alternatives at very high scale are **time-bucketed** tables (one per minute) or a **timing wheel** in memory backed by the durable store.

### B. Never fire twice concurrently: claims and leases

Multiple dispatchers poll for due runs. Each claim is a **conditional update** (`status='scheduled'` or an expired lease → `running` with a new lease); only one wins. Dispatchers own **partitions** (by hash of job id) via leases in a coordination service, so they don't even compete in the normal case. A worker **renews** the lease while running; if it dies, the lease expires and the run is reclaimed.

### C. At-least-once, made safe

A worker can finish the work and crash before recording success, so the run is executed again. Exactly-once execution is impossible here; **effectively-once** comes from idempotent jobs: the run id is passed to the job, which uses it as a deduplication key for its side effects (or the work is naturally idempotent, like "rebuild index").

```js run title="Leases, a crash after the effect, retries with backoff, and dead-lettering"
// Job runs stored by due time; workers claim them with a lease; a crashed worker's run is retried after expiry
const runs = [];                                     // the "job runs" table: one row per (jobId, scheduledAt)
const effects = new Map();                           // the downstream system, with an idempotency check
const log = (t, m) => console.log(`t=${String(t).padStart(3)}s  ${m}`);

function schedule(jobId, at, maxAttempts = 3) {
  runs.push({ id: `${jobId}@${at}`, jobId, at, status: "scheduled", leaseUntil: 0, owner: null, attempts: 0, maxAttempts });
}
// UPDATE runs SET status='running', owner=?, lease_until=now+30 WHERE id=? AND (status='scheduled' OR (status='running' AND lease_until < now))
function claim(worker, now, limit = 2) {
  const due = runs.filter((r) => r.at <= now && (r.status === "scheduled" || (r.status === "running" && r.leaseUntil < now)))
    .sort((a, b) => a.at - b.at).slice(0, limit);
  for (const r of due) {
    if (r.status === "running") log(now, `lease of ${r.owner} on ${r.id} expired → reclaimed by ${worker}`);
    Object.assign(r, { status: "running", owner: worker, leaseUntil: now + 30, attempts: r.attempts + 1 });
  }
  return due;
}
function execute(r, now, { crash = false, fail = false } = {}) {
  if (crash) {                                       // the work was done, but the worker died before marking the run done
    effects.set(r.id, r.owner);
    return log(now, `${r.owner} applied ${r.id}'s effect, then crashed before recording success`);
  }
  if (fail) {
    if (r.attempts >= r.maxAttempts) { r.status = "dead"; return log(now, `${r.id} failed ${r.attempts}× → dead-letter, alert the owner`); }
    Object.assign(r, { status: "scheduled", at: now + 10 * 2 ** r.attempts });   // retry with exponential backoff
    return log(now, `${r.id} failed (attempt ${r.attempts}) → retry at t=${r.at}`);
  }
  // the job's effect is keyed by run id, so a re-execution after a crash can't double-apply
  if (effects.has(r.id)) log(now, `${r.owner} re-ran ${r.id}: effect already applied, skipped (idempotent)`);
  else { effects.set(r.id, r.owner); log(now, `${r.owner} completed ${r.id}`); }
  r.status = "done";
}

schedule("send-invoices", 0); schedule("rebuild-index", 0); schedule("charge-subscriptions", 5);
let [a, b] = claim("worker-A", 0);
execute(a, 2);
execute(b, 3, { crash: true });                      // worker-A dies at the worst possible moment
let [c] = claim("worker-B", 5);
execute(c, 6, { fail: true });                       // payment provider down: retry later
for (const now of [20, 35, 40, 80]) for (const r of claim("worker-B", now)) execute(r, now + 1, { fail: r.jobId === "charge-subscriptions" });
console.log("final:", runs.map((r) => `${r.jobId}=${r.status}`).join(", "));
```

### D. Retries, timeouts and dead letters

Failures are retried with **exponential backoff + jitter** up to `max_attempts`, then the run goes to a **dead-letter** state and the owning team is alerted. A **timeout** per job bounds how long a lease can be extended. "Catch-up" policy after an outage: run all missed runs, only the latest, or skip (configurable per job).

### E. Fairness, priorities and bursts

Ready runs go to **queues per priority and tenant**, with weighted fair scheduling and per-tenant concurrency limits, so one team scheduling a million runs at 02:00 can't starve everyone else. Jobs that tolerate it get **jitter** (spread over the minute) to flatten the top-of-the-hour spike.

## 6. Wrap-up

Job API → definitions; **planner** materialises runs with **deterministic ids**; partitioned **dispatchers** claim due runs with **conditional updates + leases**; per-tenant/priority **queues**; workers renew leases and report results; crashes lead to reclaim and **at-least-once** re-execution, made safe by **idempotency on the run id**; backoff, timeouts, dead letters and catch-up policies. Monitor scheduling delay (due → started), lease expiries, retry and dead-letter rates, queue depth per tenant.

```quiz
? Why is the run id job_id@scheduled_time useful?
+ It's deterministic: re-planning can't create duplicates, and it serves as the idempotency key for the job's effects
- It's shorter than a UUID
- It sorts alphabetically
> One logical run = one id everywhere.

? A worker completed a job's work but crashed before marking it done. What happens, and what makes it safe?
+ The lease expires, the run is claimed and executed again; idempotent effects keyed by the run id prevent double effects
- The run is lost
- The scheduler guarantees exactly-once execution
> At-least-once execution + idempotency.

? Many tenants schedule jobs at exactly 02:00. How do you keep one tenant from starving the others?
+ Per-tenant/priority queues with weighted fair scheduling and concurrency limits, plus jitter for jobs that allow it
- Run all jobs in submission order
- Reject jobs scheduled at :00
> Isolation and fairness at the queue level.
```

:::keypoints
- Split **planning** (schedules → run rows with **deterministic ids**) from **dispatching** (claiming due runs).
- Claim runs with **conditional updates + leases**; partition dispatchers by job id; workers renew leases.
- Execution is **at-least-once**: make effects **idempotent** using the run id.
- Retries with backoff + jitter, timeouts, **dead letters**, catch-up policies.
- **Fairness**: queues per tenant/priority, weighted scheduling, concurrency limits, jitter for top-of-the-hour bursts.
:::
