---
title: Requirements — Scalability, Latency, Availability & More
level: easy
time: 35
summary: Functional vs non-functional requirements, and the vocabulary every design is judged in: scalability, latency percentiles (p50/p99) and tail latency, throughput, availability "nines" and how they compose, reliability, durability, consistency, SLAs/SLOs/SLIs and error budgets.
---

Two systems can have exactly the same features and still need completely different designs. A banking ledger and a social media "like" counter both "store a number that goes up", but one must never lose or double-count a cent, and the other can be a few seconds stale and nobody cares. The difference lives in the **non-functional requirements**.

## Functional vs non-functional

:::def Functional requirements
**What** the system does: its features, written as "users should be able to…". *Users can post a photo. Users can follow others. Users see a feed of people they follow.*
:::

:::def Non-functional requirements (NFRs)
**How well** the system does it: speed, scale, availability, consistency, durability, security, cost. *The feed loads in under 200 ms at p99. The service is available 99.99% of the time. A posted photo is never lost.*
:::

In an interview, the functional requirements set the **scope** (which boxes exist), and the non-functional requirements drive almost every **design decision** (replicas, caches, queues, consistency models). Ask about both early.

## Scalability

:::def Scalability
The ability to handle **more load** by adding resources, without redesigning the system. Load can mean more users, more requests per second, more data, or more complex work per request.
:::

There are two directions, covered in depth in the next lesson:

- **Vertical scaling (scale up):** a bigger machine. More CPU, more RAM. Simple, but limited and expensive at the top end, and it's still one machine that can fail.
- **Horizontal scaling (scale out):** more machines sharing the load. Practically unlimited, but needs load balancing, stateless services, and data partitioning.

A system "scales" when **cost grows roughly linearly with load**. If doubling the traffic needs 10× the machines, something (usually shared state, like one database or one lock) is the bottleneck.

## Latency and throughput

:::def Latency
The time to serve **one** request, from the user's point of view. Measured in milliseconds.
:::

:::def Throughput
How **many** requests (or bytes) the system handles per unit of time. Measured in requests per second (QPS / RPS) or MB/s.
:::

They're related but not the same. A highway with more lanes has more throughput; it doesn't make your drive shorter. Batching often *raises* throughput while *raising* latency (you wait for the batch to fill).

### Why averages lie: percentiles

Latency must be described with **percentiles**, not averages.

:::def Percentile latency (p50, p95, p99)
**p99 = 120 ms** means 99% of requests finished in 120 ms or less, and 1% took longer. **p50** is the median, the typical experience. **p99 / p999** describe the **tail**: the slowest 1% / 0.1%.
:::

```js run title="The average hides the users having a bad time"
// 1,000 request latencies: most are fast, a few hit a slow path (GC pause, cache miss, retry)
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const latencies = Array.from({ length: 1000 }, () => {
  const r = rand();
  if (r < 0.01) return 900 + rand() * 600;   // 1%: very slow (GC pause, timeout + retry)
  if (r < 0.06) return 200 + rand() * 150;   // 5%: cache miss → database
  return 20 + rand() * 30;                   // 94%: cache hit
});

const sorted = [...latencies].sort((a, b) => a - b);
const pct = (p) => sorted[Math.ceil((p / 100) * sorted.length) - 1];
const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;

console.log("average:", avg.toFixed(0), "ms   <- looks fine");
for (const p of [50, 90, 95, 99, 99.9]) console.log(`p${p}:`.padEnd(7), pct(p).toFixed(0).padStart(5), "ms");
```

:::def Tail latency amplification
When one user request **fans out** to many backend calls, the slowest call decides the total. If each backend has a 1% chance of being slow, a request that calls 100 of them is slow with probability $1 - 0.99^{100} \approx 63\%$. The rare tail of a single server becomes the **common case** for the whole system.
:::

This is why large systems obsess over p99 and p999, and use techniques like **hedged requests** (send a duplicate request to a second replica if the first is slow), **timeouts**, and keeping fan-out small.

:::tip Write latency requirements as percentiles
"The home feed loads in **under 200 ms at p99**" is a real requirement. "The feed should be fast" is not. Also say **which operation**: reads and writes usually have very different targets.
:::

## Availability

:::def Availability
The fraction of time the system is **up and serving requests correctly**: uptime ÷ (uptime + downtime). Usually written as a number of **nines**: 99.9% is "three nines".
:::

Each extra nine is **10× less** downtime, and usually much more than 10× the engineering cost:

| Availability | Downtime per year | per month | per day |
|---|---|---|---|
| 99% (two nines) | 3.65 days | 7.2 hours | 14.4 min |
| 99.9% (three nines) | 8.76 hours | 43.2 min | 1.44 min |
| 99.99% (four nines) | 52.6 min | 4.3 min | 8.6 s |
| 99.999% (five nines) | 5.26 min | 26 s | 0.86 s |

### How availability composes

Two rules let you reason about any architecture:

- **In series** (a request needs A **and** B and C): multiply. Three 99.9% components in a chain give $0.999^3 \approx 99.7\%$. Every dependency you add **lowers** availability.
- **In parallel** (redundant replicas, any one is enough): the system is down only if **all** replicas are down: $1 - (1 - a)^k$. Two 99% replicas give $1 - 0.01^2 = 99.99\%$.

:::formula Series vs parallel availability
A_{\text{series}} = A_1 \times A_2 \times \cdots \times A_n \qquad A_{\text{parallel}} = 1 - (1 - A)^k
:::

Play with it: a request path of several steps, where each step can be replicated.

```viz algo=nines title="How redundancy buys nines"
a = 99.9
series = 4
replicas = 1
```

Set replicas to 1 and series to 8: eight 99.9% services in a chain give only ~99.2%, about 3 days of downtime a year. Now set replicas to 2: the chain jumps above 99.999%. This is **the** argument for redundancy and for keeping the critical path short.

:::warn Redundancy only helps if failures are independent
Two replicas in the same rack, behind the same switch, running the same buggy deploy, fail **together**. Real redundancy means separate machines, racks, **availability zones**, sometimes regions, plus staged rollouts so one bad deploy can't take out every replica at once.
:::

## Reliability, durability, consistency

:::def Reliability
The system **does the right thing**, even when parts fail. A system can be "available" (it responds) yet unreliable (it responds with wrong data or loses writes). Fault tolerance is how you get reliability from unreliable parts.
:::

:::def Durability
Once the system says "saved", the data **survives**: crashes, disk failures, data-centre fires. It's achieved with write-ahead logs, replication to several machines, and backups. Object stores like S3 advertise **eleven nines** (99.999999999%) of yearly durability per object.
:::

:::def Consistency (in the NFR sense)
Do all users see the **same, latest** data? **Strong consistency**: after a write succeeds, every read sees it. **Eventual consistency**: replicas converge after a short delay, and reads may briefly be stale. You'll learn the trade-offs in the CAP lesson.
:::

Availability and consistency often **pull against each other**: keeping replicas perfectly in sync requires coordination, which adds latency and can block when the network misbehaves. Deciding which one a feature needs is one of the most important calls in a design:

| Feature | Needs | Why |
|---|---|---|
| Bank balance, payments, inventory count, seat booking | strong consistency | double-spending or overselling is unacceptable |
| Like counts, view counts, follower counts | eventual | being a few seconds stale is invisible |
| Social feed, search results, recommendations | eventual | freshness within seconds is fine |
| Username uniqueness, "only one active session" | strong (for that check) | duplicates break invariants |

## Other NFRs worth naming

- **Security & privacy**: authentication, authorisation, encryption, compliance (GDPR, PCI-DSS for cards, HIPAA for health).
- **Maintainability & operability**: can a team deploy safely, debug, and change it? (Monitoring, simple components.)
- **Cost**: cloud bills are a real constraint. Storing 100 PB on SSD vs. cheap object storage tiers is a 10× cost difference.
- **Data residency**: some data must stay in a country or region by law.

## SLI, SLO, SLA and error budgets

Big companies formalise NFRs with three related terms (popularised by Google's SRE book):

:::def SLI (Service Level Indicator)
A **measured** number: "the fraction of feed requests served successfully in under 300 ms over the last 28 days".
:::

:::def SLO (Service Level Objective)
The internal **target** for an SLI: "99.9% of feed requests succeed in under 300 ms".
:::

:::def SLA (Service Level Agreement)
A **contract** with customers, with penalties (refunds, credits) if it's broken: "99.9% monthly uptime or you get 10% back". SLAs are set looser than SLOs, so you notice problems before you owe money.
:::

:::def Error budget
$1 - \text{SLO}$: the amount of failure you're **allowed**. A 99.9% SLO allows 0.1% failed requests, about 43 minutes of downtime per month. While budget remains, teams ship features fast. When it's spent, they freeze risky launches and fix reliability.
:::

The error budget turns "reliability vs. speed of shipping" from an argument into a number. It also explains why nobody targets 100%: it's impossible, and chasing it would stop all change.

## Asking for NFRs in an interview

Interviewers often leave NFRs vague on purpose, to see if you ask. A good checklist:

1. **Scale**: how many users (DAU), requests per second, data volume? Growth?
2. **Read/write ratio**: read-heavy (feeds, URL redirects) or write-heavy (logging, metrics, chat)?
3. **Latency**: what must be fast, and how fast (p99)?
4. **Availability vs consistency**: for each core feature, is stale data acceptable? Is losing data acceptable?
5. **Durability**: can we ever lose a write?
6. **Geography**: one region or global users?

Then **write the answers down** as a short list, for example: *"200 M DAU; read-heavy 100:1; feed p99 < 200 ms; availability over consistency for the feed, but posts must never be lost; global users."* Every later decision can point back to this list.

```quiz
? The average latency is 60 ms but the p99 is 1.8 s. What does that tell you?
- The system is fast for everyone
+ 1 in 100 requests takes 1.8 s or more. For a page making many calls, many users will hit that slow tail
- The measurement is wrong
> Averages hide the tail. With fan-out, rare slow calls become a common slow page.

? A request passes through 5 services in series, each 99.9% available (no redundancy). Roughly what is the end-to-end availability?
- 99.9%
+ ~99.5%
- ~95%
> 0.999⁵ ≈ 0.995. Every dependency in series multiplies in its own downtime.

? Which feature most needs strong consistency?
- The number of likes on a photo
+ Reserving the last seat on a flight
- The "people you may know" list
> Two users must never both get the last seat. The others are fine being slightly stale.

? What's the difference between an SLO and an SLA?
+ An SLO is an internal target; an SLA is an external contract with penalties, usually set looser than the SLO
- They are the same thing
- An SLA is measured, an SLO is a contract
> SLIs are measurements, SLOs are targets, SLAs are promises to customers with consequences.
```

:::keypoints
- **Functional** requirements are the features. **Non-functional** requirements (scale, latency, availability, consistency, durability, cost) drive the design.
- Describe latency with **percentiles** (p50/p99/p999). Fan-out turns rare slow calls into common slow pages (**tail amplification**).
- **Availability** is counted in nines. Components in **series multiply** (worse); **parallel** replicas give $1-(1-a)^k$ (much better) if failures are independent.
- **Durability** = saved data survives. **Consistency** = everyone sees the latest data. Pick strong vs eventual **per feature**.
- **SLI** measures, **SLO** targets, **SLA** promises. The **error budget** ($1 - $SLO) balances reliability against shipping speed.
:::
