---
title: Design a Notification System
level: intermediate
time: 45
summary: One service that sends push, SMS and email for every product team — the request API, user preferences, templates, quiet hours and frequency caps, per-channel queues with priorities, workers that talk to APNs/FCM/Twilio/SES with retries and provider failover, idempotency, broadcast fan-out to millions, and delivery tracking.
---

:::problem Design a Notification System {level=medium tags="HLD,queues,fan-out,reliability"}
Design a notification platform used by all teams in a company to send **push notifications, SMS and email**: one-time passwords, order updates, social activity and marketing campaigns. About **50 million notifications per day**, with campaign bursts to **20 million users** at once.

:::hint Hint
Separate *deciding* (who, which channel, is it allowed now?) from *delivering* (talking to slow, flaky third-party providers). Queues between them give you buffering, retries and priorities. Then think about duplicates, urgency (an OTP can't wait behind a campaign) and user preferences.
:::
:::

## 1. Requirements

**Functional**
- Send to a user (or a segment) on one or more **channels**: push (iOS/Android), SMS, email; in-app later.
- **Templates** with parameters and localisation.
- **User preferences**: opt-outs per channel and category; **quiet hours**; **frequency caps** for marketing.
- **Scheduling** (send at 9 am local time) and **delivery tracking** (sent, delivered, opened, failed).

**Non-functional**
- **Reliable**: at-least-once; never lose an OTP or a payment receipt. No duplicates in practice (idempotency).
- **Low latency for urgent messages**: OTPs within seconds even during a 20 M-user campaign.
- **Scalable** to bursts; tolerant of provider outages and rate limits.

## 2. Estimates

:::derive Volume
50 \times 10^6 / 10^5\,\text{s} \approx 500/\text{s average} || roughly 10⁵ seconds in a day
\text{campaign: } 2 \times 10^7 \text{ in 30 min} \approx 11{,}000/\text{s} || bursts dominate sizing
!\text{log: } 5 \times 10^7 \times 500\,\text{B} \approx 25\,\text{GB/day} || delivery records, kept ~90 days
:::

**Conclusions:** throughput is moderate but **bursty**: queues absorb campaigns. The external providers (APNs, FCM, Twilio, SES) have their own rate limits and outages, so delivery is where reliability is won or lost.

## 3. API

```text
POST /v1/notifications
  { idempotencyKey, userId | segmentId, category: "otp" | "transactional" | "social" | "marketing",
    channels: ["push","sms","email"], template: "order_shipped", params: {...}, sendAt? }
  → 202 { notificationId }
GET  /v1/notifications/{id}          → status per channel (queued, sent, delivered, failed)
PUT  /v1/users/{id}/preferences      → opt-outs, quiet hours, time zone
POST /v1/devices                     → register a push token { userId, platform, token }
```

**Data**: `preferences` (user → channel/category opt-ins, tz, quiet hours), `devices` (user → push tokens; a user has several devices), `templates` (versioned, per locale), and a `notification_log` (id, user, channel, status, timestamps) in a wide-column store for tracking.

## 4. High-level design

```viz algo=arch title="Notification platform" dir=down
svc      Product services | orders, auth, social [service*3] @0,1
api      Notification API | validate, idempotency [gateway] @1,1
prefs    Preferences + devices [db] @2,2
plan     Planner | prefs, templates, caps [service*2] @2,1
qp       Push queue | high / low priority [queue] @3,0
qs       SMS queue | high / low [queue] @3,1
qe       Email queue | high / low [queue] @3,2
wp       Push workers [worker*2] @4,0
ws       SMS workers [worker] @4,1
we       Email workers [worker] @4,2
apns     APNs / FCM [ext] @5,0
sms      SMS providers | Twilio, Vonage [ext] @5,1
ses      Email provider | SES [ext] @5,2
log      Delivery log + analytics [chart] @6,1
--
svc -> api : send(...)
api -> plan
plan -> prefs
plan -> qp
plan -> qs
plan -> qe
qp -> wp
qs -> ws
qe -> we
wp -> apns
ws -> sms
we -> ses
apns ~> log : receipts
sms ~> log
ses ~> log
--
flow An OTP during a marketing campaign
svc > api : Auth service: send OTP to user 42 by SMS, idempotencyKey otp-42-7781.
api > plan : The API stores the key (a retry with the same key returns the same id) and passes the request on.
plan > prefs : OTPs ignore quiet hours and caps; the user's phone number is looked up.
plan > qs : Rendered from the template and enqueued on the **high-priority** SMS queue, ahead of campaign traffic.
qs > ws : An SMS worker picks it up within milliseconds…
ws > sms : …and calls the primary provider; on error or timeout it fails over to the secondary.
flow A 20 M-user campaign
svc > api : Marketing: send template "spring_sale" to segment S (20 M users), category marketing.
api > plan : The planner expands the segment in batches (pages of user ids) instead of one giant request.
plan > prefs : Per user: opted in? in quiet hours (defer to 8 am local)? over the weekly cap?
plan > qp : Allowed messages go to the **low-priority** push queue, rate-limited to what APNs/FCM accept.
qp > wp : Workers send in batches; dead tokens reported by APNs/FCM are deleted from the device table.
```

## 5. Deep dives

### A. Decide, then deliver

The **planner** applies the rules: preferences and opt-outs (legal requirements for marketing email and SMS), quiet hours in the user's time zone, frequency caps, template rendering and localisation. It writes one job per (user, channel) onto that channel's queue. **Channel workers** only deliver. Each part scales separately, and a slow SMS provider never blocks push or email.

```js run title="Preferences, quiet hours, caps, dedup, priority and provider failover"
// The notification service's decision pipeline, then channel workers with retry + provider failover
const users = {
  u1: { tz: 0, channels: { push: true, email: true, sms: true }, devices: ["ios:abc"], email: "ana@example.com", phone: "+15550001" },
  u2: { tz: 0, channels: { push: true, email: false, sms: false }, devices: ["android:xyz"], email: "bo@example.com" },
};
const PRIORITY = { otp: 0, transactional: 1, marketing: 2 };       // lower = more urgent
const DAILY_CAP = { marketing: 2 };                                 // frequency caps per category
const seenIds = new Set(), sentToday = new Map(), queues = { push: [], email: [], sms: [] };

function submit(n, hourUtc) {
  const u = users[n.user], why = (r) => console.log(`  ✗ ${n.id} ${n.category} → ${n.user}: ${r}`);
  if (seenIds.has(n.id)) return why("duplicate request (same idempotency id) ignored");
  seenIds.add(n.id);
  const local = (hourUtc + u.tz + 24) % 24;
  if (n.category === "marketing" && (local >= 22 || local < 8)) return why(`quiet hours (${local}:00 local), deferred to 08:00`);
  const capKey = `${n.user}:${n.category}`, count = sentToday.get(capKey) || 0;
  if (count >= (DAILY_CAP[n.category] ?? Infinity)) return why(`daily ${n.category} cap of ${DAILY_CAP[n.category]} reached`);
  const chans = n.channels.filter((c) => u.channels[c]);
  if (!chans.length) return why("user opted out of all requested channels");
  sentToday.set(capKey, count + 1);
  for (const c of chans) queues[c].push({ ...n, channel: c, attempts: 0 });
  console.log(`  ✓ ${n.id} ${n.category} → ${n.user} queued on ${chans.join(", ")}`);
}

// Providers: the primary SMS provider is having an outage
const providers = {
  push: [{ name: "APNs/FCM", ok: () => true }],
  email: [{ name: "SES", ok: () => true }],
  sms: [{ name: "Twilio", ok: () => false }, { name: "Vonage", ok: () => true }],
};
function drain(channel) {
  const q = queues[channel].sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category]);   // urgent first
  while (q.length) {
    const job = q.shift();
    for (const p of providers[channel]) {
      job.attempts++;
      if (p.ok()) { console.log(`  ${channel}: "${job.text}" → ${job.user} via ${p.name} (attempt ${job.attempts})`); break; }
      console.log(`  ${channel}: ${p.name} failed for ${job.id}, failing over`);
    }
  }
}

console.log("submit at 23:00 UTC:");
const reqs = [
  { id: "n1", user: "u1", category: "marketing", channels: ["push", "email"], text: "50% off shoes" },
  { id: "n2", user: "u1", category: "otp", channels: ["sms"], text: "Your code is 481920" },
  { id: "n2", user: "u1", category: "otp", channels: ["sms"], text: "Your code is 481920" },
];
reqs.forEach((r) => submit(r, 23));
console.log("submit at 12:00 UTC:");
[
  { id: "n3", user: "u1", category: "marketing", channels: ["push"], text: "New arrivals" },
  { id: "n4", user: "u1", category: "marketing", channels: ["push"], text: "Weekend sale" },
  { id: "n5", user: "u1", category: "marketing", channels: ["push"], text: "Last chance!" },
  { id: "n6", user: "u2", category: "transactional", channels: ["push", "email"], text: "Your order shipped" },
  { id: "n7", user: "u1", category: "transactional", channels: ["push"], text: "Payment received" },
].forEach((r) => submit(r, 12));
console.log("channel workers:");
["push", "email", "sms"].forEach(drain);
```

### B. Priorities

Use **separate queues per priority** (or per category) and give the urgent ones dedicated workers or strict precedence. A FIFO shared with a 20 M campaign would delay OTPs by many minutes. Campaign traffic is also **throttled** to stay within provider rate limits.

### C. Reliability and duplicates

- **At-least-once** everywhere: the API persists the request before acknowledging; queue messages are acknowledged only after the provider accepts them; failures are retried with **exponential backoff + jitter**, then go to a **dead-letter queue**.
- Retries cause duplicates, so deduplicate at two places: the **idempotency key** on the API (the caller retried), and a per-(notification, channel) "sent" record checked by workers before sending (the worker crashed after sending but before acking).
- **Provider failover**: keep two SMS/email providers and a circuit breaker per provider; route around an outage automatically.

### D. Big fan-out

A broadcast to 20 M users is a **batch job**, not a request: the planner pages through the segment (e.g. 10K users per batch), enqueues batch tasks, and workers expand and send them, rate-limited per provider. For "everyone who follows X" (social), use the same fan-out-in-batches approach. FCM topics or email list sends can offload some fan-outs to the provider.

### E. Tracking

Workers log `sent`; providers report `delivered` (APNs/FCM feedback, SMS delivery receipts, email bounces via webhooks); the app reports `opened`. All are events into a stream, aggregated for dashboards and used to clean up: delete invalid push tokens, suppress bouncing emails.

## 6. Wrap-up

Product services → **notification API** (validation, idempotency) → **planner** (preferences, quiet hours, caps, templates, segment fan-out in batches) → **per-channel, per-priority queues** → **channel workers** with retries, DLQ, circuit breakers and provider failover → providers; delivery events feed tracking and cleanup. Monitor queue depth and age per priority, provider error rates and latency, OTP end-to-end latency, and opt-out/bounce rates.

```quiz
? A 20 M-user campaign is being sent when a user requests a login OTP. How does the design keep the OTP fast?
+ Separate high-priority queues (and workers) for urgent categories, so OTPs never wait behind campaign messages
- Send campaigns more slowly by hand
- Put everything in one FIFO and add more workers
> Priority isolation, plus throttling campaigns to provider limits.

? A worker sends an SMS, then crashes before acknowledging the queue message. What prevents a duplicate SMS on redelivery?
+ The worker checks a per-(notification, channel) sent record before sending
- Exactly-once delivery from the queue
- Nothing can prevent it
> At-least-once delivery plus an idempotency check before the side effect.

? Where should quiet hours and frequency caps be enforced?
+ In the planner, before messages are enqueued per channel
- In each provider
- In the client app only
> Deciding is separated from delivering; the planner applies all user-facing rules.
```

:::keypoints
- Split **deciding** (planner: preferences, quiet hours, caps, templates, fan-out) from **delivering** (channel workers + providers), connected by **queues**.
- **Per-channel, per-priority queues** keep OTPs fast during campaigns and isolate slow providers.
- Reliability: persist before ack, retries with backoff, DLQ, **idempotency keys** + sent records against duplicates, **provider failover** with circuit breakers.
- Large broadcasts are **batched fan-out jobs**, throttled to provider limits.
- Track sent/delivered/opened events; use feedback to remove dead tokens and bouncing addresses.
:::
