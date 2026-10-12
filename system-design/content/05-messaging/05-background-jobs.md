---
title: Background Jobs, Retries and Scheduling
level: intermediate
time: 45
summary: Running work outside the request — task queues and workers, the job lifecycle and status APIs, retries with exponential backoff and jitter (with a retry-storm simulator and C++/JS code), idempotent jobs, heartbeats and visibility timeouts, priorities, delayed and scheduled (cron) jobs, and durable workflow engines.
---

Sending emails, resizing images, generating PDFs, charging subscriptions every month, re-indexing search, calling slow partner APIs: real systems run far more work in the **background** than in request handlers. Doing it reliably (no lost jobs, no double charges, no retry storms) is a skill interviewers look for, both in HLD ("how does the video get transcoded?") and LLD ("design a job scheduler").

## The shape of a job system

```viz algo=arch title="A background job system"
api      API server [service]
q        Job queue | Redis / SQS / RabbitMQ [queue]
w        Workers [worker*3]
jobs     Job table | status, attempts, result [db]
dlq      Dead-letter queue [queue]
ext      Slow / flaky dependency | email, payment, video encoder [ext]
--
api -> jobs : create job (PENDING)
api ~> q : enqueue job id
q ~> w
w -> ext : do the work
w -> jobs : RUNNING → SUCCEEDED / FAILED
w ~> dlq : after max attempts
--
flow A report is requested
api > jobs : POST /reports → insert job 9f2 with status PENDING.
api > q : Enqueue {jobId: 9f2}; respond 202 Accepted with /jobs/9f2 to poll.
q > w : A free worker picks the job.
w > ext : It does the slow part (here: query, render, upload a PDF).
w > jobs : Mark SUCCEEDED with the file URL. The client's next poll (or a webhook / push) shows "ready".
```

Common tools: **Sidekiq** (Ruby), **Celery** (Python), **BullMQ** (Node.js), **Hangfire** (.NET), cloud queues (SQS + Lambda/workers), and durable workflow engines like **Temporal**.

### Job lifecycle and status

Give each job an id and a status in a durable table, not just a message in a queue:

```text
PENDING → RUNNING → SUCCEEDED
              ↘ FAILED (attempt 1) → retry after backoff → RUNNING → …
                         ↘ after N attempts → DEAD (moved to the DLQ, alert)
```

The API returns **`202 Accepted`** with a job URL (`GET /jobs/9f2 → {status, progress, resultUrl}`). Clients poll it, or receive a webhook or push notification when it completes. The job table also answers support questions ("why didn't my export finish?").

## Retries, backoff and jitter

Transient failures (a timeout, a `503`, a dropped connection) usually succeed if you try again a bit later. **How** you retry matters enormously:

- **Retrying immediately** hammers a struggling dependency even harder, and keeps it down.
- **Fixed delays** synchronise clients: everyone who failed together retries together, in waves.
- **Exponential backoff** (wait 0.1 s, 0.2 s, 0.4 s, 0.8 s, …, up to a cap) backs off quickly, but if 1,000 clients failed at the same instant, they still retry at the same instants.
- **Exponential backoff with jitter** (randomise each delay) spreads the retries out, so the recovering service sees a smooth trickle instead of spikes.

:::def Thundering herd / retry storm
Many clients retrying at the same moment, overwhelming a service just as it recovers, causing it to fail again. Jitter breaks the synchronisation.
:::

Watch it: 1,000 clients hit an outage. Compare the strategies and how quickly everyone is served once the server is back.

```viz algo=backoff title="1,000 clients retrying through an outage"
strategy = immediate
clients = 1000
outage = 4
```

The widely used "**full jitter**" formula (from an AWS Architecture Blog analysis): `delay = random(0, min(cap, base × 2^attempt))`.

:::tabs Retry with exponential backoff and full jitter
```js run
// A deterministic random generator so the output is reproducible (use Math.random in real code)
let seed = 12;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const sleepMs = (attempt, { base = 100, cap = 10_000 } = {}) =>
  Math.round(random() * Math.min(cap, base * 2 ** attempt));      // full jitter

function isRetryable(err) {                                       // never retry what can't succeed
  return err.status === undefined || err.status === 429 || err.status >= 500;
}

async function withRetries(fn, { maxAttempts = 6 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isRetryable(err) || attempt + 1 >= maxAttempts) throw err;
      const wait = sleepMs(attempt);
      console.log(`  attempt ${attempt + 1} failed (${err.status ?? err.message}); retrying in ${wait} ms`);
      // await new Promise((r) => setTimeout(r, wait));   // real code sleeps here
    }
  }
}

// A flaky dependency: fails with 503 three times, then succeeds
let calls = 0;
const flakyEmailApi = async () => { calls++; if (calls <= 3) throw Object.assign(new Error("unavailable"), { status: 503 }); return "email sent"; };
console.log("result:", await withRetries(flakyEmailApi));

// A permanent error (400) is not retried
try { await withRetries(async () => { throw Object.assign(new Error("bad address"), { status: 400 }); }); }
catch (e) { console.log("gave up immediately on:", e.status, e.message); }
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct HttpError : runtime_error { int status; HttpError(int s, string m) : runtime_error(m), status(s) {} };

uint64_t seed = 12;                                  // deterministic for the demo
double randomUnit() { seed = seed * 16807 % 2147483647; return seed / 2147483647.0; }

long backoffMs(int attempt, long base = 100, long cap = 10000) {
    return lround(randomUnit() * min<double>(cap, base * pow(2, attempt)));   // full jitter
}
bool retryable(int status) { return status == 429 || status >= 500; }

template <class F>
auto withRetries(F fn, int maxAttempts = 6) {
    for (int attempt = 0;; attempt++) {
        try {
            return fn(attempt);
        } catch (const HttpError& e) {
            if (!retryable(e.status) || attempt + 1 >= maxAttempts) throw;
            long wait = backoffMs(attempt);
            cout << "  attempt " << attempt + 1 << " failed (" << e.status << "); retrying in " << wait << " ms\n";
            // this_thread::sleep_for(chrono::milliseconds(wait));   // real code sleeps here
        }
    }
}

int main() {
    int calls = 0;
    auto flakyEmailApi = [&](int) -> string {       // fails with 503 three times, then succeeds
        if (++calls <= 3) throw HttpError(503, "unavailable");
        return "email sent";
    };
    cout << "result: " << withRetries(flakyEmailApi) << "\n";

    try {
        withRetries([](int) -> string { throw HttpError(400, "bad address"); });
    } catch (const HttpError& e) {
        cout << "gave up immediately on: " << e.status << " " << e.what() << "\n";
    }
}
```
:::

Rules for retries:

1. Retry only **transient** errors (timeouts, 429, 5xx), never 4xx validation errors.
2. **Cap** the attempts and the total time; then fail to the DLQ.
3. Use **exponential backoff with jitter**, and honour `Retry-After` headers.
4. Make the retried operation **idempotent** (idempotency keys, upserts, "set" rather than "increment").
5. Retry at **one layer**. If the client, the gateway and the service each retry 3 times, one user action becomes 27 attempts against a sick dependency. Add **retry budgets** (retries ≤ 10% of requests) and **circuit breakers** (next module).

## Making jobs safe to run twice

With at-least-once delivery, a job **will** occasionally run twice (a worker crashes after doing the work but before acknowledging, or a visibility timeout expires while it's still running). Design every job to be idempotent:

- Use **natural idempotency**: "set the user's plan to PRO" rather than "add a month".
- Record completion in the same transaction as the effect (`UPDATE invoices SET status='SENT' WHERE id=? AND status='PENDING'` and only send if one row changed).
- Pass **idempotency keys** to external APIs (payment providers dedupe by them).
- For long jobs, **heartbeat** or extend the visibility timeout so the queue doesn't hand the job to a second worker.

## Priorities, fairness and rate limits

- **Separate queues by priority** (critical: password reset emails; default; bulk: newsletter). Give each its own workers, or weight polling toward higher priority, so a 10-million-email newsletter can't delay a password reset.
- **Fairness between tenants**: one big customer's 100,000 jobs shouldn't starve everyone else. Use per-tenant queues or round-robin across tenants.
- **Rate-limit jobs that call external APIs** (a token bucket per partner), and use the leaky-bucket pattern to pace them.

## Delayed and scheduled jobs

- **Delayed jobs** ("send a reminder in 24 hours", "release the seat hold after 10 minutes"): many queues support a delay directly (SQS up to 15 minutes, RabbitMQ delayed exchange, BullMQ, Redis sorted sets scored by run time). For long delays, store the job with a `run_at` time in a table and have a poller enqueue due jobs.
- **Recurring (cron) jobs** ("charge subscriptions daily at 02:00"): on one machine, cron. Across many machines you must make sure the job runs **once**, not once per server: use a **leader** (previous module) or a scheduler service that writes due runs into the job table with a unique `(job_name, scheduled_time)` constraint so duplicates are rejected. The distributed job scheduler case study designs this at scale.

## Durable workflows

When a "job" is really a **multi-step process** with waits ("charge the card; if it fails retry daily for 3 days; then email the customer; after 14 days cancel the subscription"), chaining queue messages by hand gets fragile. **Workflow engines** (Temporal, AWS Step Functions, Azure Durable Functions, Cadence) let you write the process as ordinary code; the engine persists every step's result, so the workflow survives crashes and deploys, and can sleep for weeks. They're the industrial version of the saga orchestrator from the distributed transactions lesson.

:::interview Job system checklist
For any async work in a design, cover: the **queue** (and why), **job status** stored durably with a `202 + poll/webhook` API, **at-least-once + idempotent** jobs, **retries with exponential backoff and jitter**, a **DLQ with alerting**, **priority queues** for urgent work, and **autoscaling workers on queue depth**. That list answers 90% of follow-up questions.
:::

```quiz
? Why add random jitter to exponential backoff?
+ Clients that failed at the same moment would otherwise retry at the same moments, hitting the recovering service in synchronized waves
- To make retries faster on average
- Because exponential backoff alone never stops retrying
> Jitter spreads retries over time, turning spikes into a smooth load.

? A payment-provider call returns 400 "invalid card number". What should the job do?
- Retry with exponential backoff
+ Fail without retrying (it can never succeed) and record the error
- Retry immediately 5 times
> Only transient errors (timeouts, 429, 5xx) are worth retrying.

? A recurring billing job runs on all 10 app servers via cron and charges customers 10 times. What's a sound fix?
+ Run it on one elected leader (or a scheduler service) and make each run idempotent with a unique (job, scheduled time) record
- Run it more often
- Increase the retry count
> Exactly one instance should schedule it, and idempotency protects against the occasional duplicate.

? A video transcode takes 40 minutes, and the queue's visibility timeout is 5 minutes. What goes wrong?
- Nothing
+ The message becomes visible again after 5 minutes, so other workers start the same transcode in parallel
- The video is lost
> Long jobs must extend their visibility timeout (heartbeat) or use a longer one.
```

:::keypoints
- Background jobs move slow, flaky or scheduled work off the request path: queue + workers + a durable **job status** table, exposed via `202 Accepted` + polling or webhooks.
- Retry **transient** errors only, with **exponential backoff + jitter**, capped attempts, `Retry-After`, and retries at **one** layer (retry budgets).
- Delivery is at-least-once, so jobs must be **idempotent**; heartbeat long jobs past the visibility timeout.
- Use **priority queues**, per-tenant fairness and **rate limits** for external calls; send poison jobs to a **DLQ** and alert.
- **Delayed** jobs via queue delays or a `run_at` table; **cron** across servers via a leader or unique scheduled-run records; multi-step processes via **workflow engines** (Temporal, Step Functions).
:::
