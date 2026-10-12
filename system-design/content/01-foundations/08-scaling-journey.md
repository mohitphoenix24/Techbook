---
title: From One Server to Millions of Users
level: easy
time: 40
summary: The classic scaling story, one stage at a time — separating the database, vertical vs horizontal scaling, load balancers and stateless servers, read replicas, caching, CDNs, queues, multiple data centres and sharding — with the problem each step solves and the new problem it creates.
---

No large system was designed big on day one. Instagram started on one server; Twitter famously fell over (the "fail whale") while it learned to scale. This lesson walks the standard path from a single machine to a system serving millions. Every later lesson zooms into one of these steps, and the order matters: **each step solves the bottleneck the previous step exposed**.

## Stage 1: everything on one server

```viz algo=arch title="Stage 1 — one box"
user   Users [users]
dns    DNS [dns]
srv    Server | web app + database + files [server]
--
user -> dns : api.example.com?
user -> srv : HTTP
```

The web server, application code, database and uploaded files all live on one machine. That's perfect for a prototype: cheap, simple, easy to debug.

**What breaks first:** the app and the database fight over CPU and memory, and when the machine dies (or you deploy), **everything** is down. It's a **single point of failure**.

:::def Single point of failure (SPOF)
A component whose failure takes down the whole system. Finding and removing SPOFs is a constant theme in design interviews: "what happens if this box dies?"
:::

## Stage 2: separate the database

```viz algo=arch title="Stage 2 — app and data on separate machines"
user   Users [users]
app    App server [server]
db     Database server [db]
--
user -> app
app -> db
```

Now each tier can be sized and tuned for its job (the database wants RAM and fast disks; the app wants CPU), and they scale independently. The database is now the **state** of the system; the app server is just **logic**.

## Stage 3: scale up, then scale out

When the app server is overloaded, there are two options.

| | Vertical scaling (scale up) | Horizontal scaling (scale out) |
|---|---|---|
| How | a bigger machine: more CPU, RAM, faster disks | more machines of the same size |
| Code changes | none | services must be stateless; needs a load balancer |
| Limit | the biggest machine money can buy | practically none |
| Failure | still a single point of failure | survives the loss of a machine |
| Cost curve | gets expensive fast at the top end | roughly linear |
| Best for | early stages, databases (for a while) | stateless web/app tiers, anything big |

:::tip Vertical scaling is underrated
Modern servers go to hundreds of cores and terabytes of RAM. Scaling up a database is often the right **first** move: it's zero code changes. Mention it, then explain why you'd eventually go horizontal (limits, cost, and no redundancy).
:::

## Stage 4: load balancer + stateless app servers

```viz algo=arch title="Stage 4 — horizontal scaling behind a load balancer"
user   Users [users]
lb     Load balancer [lb]
app1   App server 1 [server]
app2   App server 2 [server]
app3   App server 3 [server]
sess   Session store | Redis [cache]
db     Database [db]
--
user -> lb
lb -> app1
lb -> app2
lb -> app3
app1 -> sess
app2 -> sess
app3 -> sess
app1 -> db
app2 -> db
app3 -> db
--
flow A logged-in request
user > lb : Request with a session cookie.
lb > app2 : The load balancer picks any healthy server, here server 2.
app2 > sess : Server 2 looks up the session in the shared store, so it doesn't matter which server served the previous request.
app2 > db : Then it reads the data it needs.
app2 > lb : Response…
lb > user : …back to the user.
```

A **load balancer** spreads requests across many identical servers and stops sending traffic to dead ones. Now a server can crash, or be replaced during a deploy, without users noticing.

This only works if servers are **stateless**:

:::def Stateless service
A server that keeps **no client-specific data** between requests in its own memory or disk. Sessions, carts and uploads live in shared stores (Redis, the database, object storage). Any server can handle any request, so you can add, remove or replace servers freely.
:::

:::warn Sticky sessions are a crutch
Load balancers can pin a user to one server ("sticky sessions") so in-memory sessions keep working. It breaks even load distribution, and users lose their session when that server dies. Prefer moving state out of the servers.
:::

## Stage 5: replicate the database

The app tier now scales, so the single database becomes the bottleneck and the SPOF. Most apps read far more than they write, so we add **read replicas**:

```viz algo=arch title="Stage 5 — primary for writes, replicas for reads"
lb     Load balancer [lb]
app    App servers [server*3]
pri    Primary DB | all writes [db]
rep1   Replica 1 | reads [db]
rep2   Replica 2 | reads [db]
--
lb -> app
app -> pri : writes
app -> rep1 : reads
app -> rep2 : reads
pri ~> rep1 : replication
pri ~> rep2 : replication
```

- **Reads scale out**: add more replicas.
- **Availability**: if the primary dies, a replica is **promoted** to be the new primary (failover).
- **New problem: replication lag.** Replicas are a little behind the primary (milliseconds to seconds). A user who updates their profile and immediately reloads might read from a replica that hasn't caught up and see the old version. The replication lesson covers fixes like **read-your-writes** routing.

## Stage 6: add a cache

Many reads ask for the same popular data (the home page, a celebrity's profile, a trending product). A **cache** keeps hot data in memory, so most reads never touch the database.

```viz algo=arch title="Stage 6 — cache in front of the database"
lb     Load balancer [lb]
app    App servers [server*3]
cache  Cache | Redis / Memcached [cache]
db     Database | primary + replicas [db]
--
lb -> app
app -> cache : 1. try here first
app -> db : 2. on a miss
--
flow Cache hit (most requests)
app > cache : GET product:42 → found. Answered in ~1 ms.
flow Cache miss
app > cache : GET product:42 → not there.
app > db : Read from the database (~5–20 ms)…
app > cache : …and store it in the cache with a TTL, so the next reader gets a hit.
```

A 90% hit rate means the database sees only 10% of the reads: **10× more capacity** for the same hardware, and much lower latency. **New problems:** stale data (the cache and database can disagree) and what happens when the cache is cold or dies. The two caching lessons deal with these.

## Stage 7: CDN for static content

Images, videos, JavaScript and CSS are the same for everyone and don't change often. A **content delivery network** copies them to hundreds of edge servers around the world, close to users.

```viz algo=arch title="Stage 7 — static content from the edge"
user   Users | worldwide [users]
cdn    CDN edge | nearby PoP [cdn]
lb     Load balancer [lb]
app    App servers [server*3]
store  Object storage | images, video [storage]
--
user -> cdn : images, JS, CSS
user -> lb : API
lb -> app
cdn -> store : on a miss only
app -> store : uploads
```

Users get static files from ~20 ms away instead of 150 ms, and your servers stop spending bandwidth on them. Files themselves move to **object storage** (like S3), which is cheap, durable and effectively infinite.

## Stage 8: queues for slow work

Some work is slow or can happen later: sending emails, resizing videos, generating reports, updating search indexes. Doing it inside the request makes users wait and ties up servers. A **message queue** decouples it:

```viz algo=arch title="Stage 8 — async work through a queue"
app    App servers [server*3]
q      Message queue [queue]
w      Workers | auto-scaled [worker*3]
db     Database [db]
mail   Email provider [mail]
--
app ~> q : enqueue job
q ~> w
w -> db
w -> mail
```

The API responds immediately ("Your video is processing"). Workers pull jobs at their own pace and are scaled independently, based on the queue length. Traffic spikes fill the queue instead of crashing workers.

## Stage 9: more data centres

One data centre can lose power, network, or be hit by a disaster, and users on the other side of the world suffer high latency. The next step is **several data centres or cloud regions**:

```viz algo=arch title="Stage 9 — geo-routed traffic across two regions"
user   Users [users]
geodns GeoDNS | routes to nearest region [dns]
lb1    LB · Europe [lb]
app1   Apps · Europe [server*2]
db1    DB · Europe [db]
lb2    LB · Asia [lb]
app2   Apps · Asia [server*2]
db2    DB · Asia [db]
--
user -> geodns
geodns -> lb1 : EU users
geodns -> lb2 : Asian users
lb1 -> app1
lb2 -> app2
app1 -> db1
app2 -> db2
db1 <-> db2 : cross-region replication
group Region eu-west: lb1, app1, db1
group Region ap-south: lb2, app2, db2
```

**New problems:** data must be replicated across regions (with 100+ ms between them), and writes from two regions can conflict. That's where consistency models and multi-leader replication come in. Many systems keep one **home region** per user or per data item to avoid conflicts.

## Stage 10: shard the database

Eventually the **writes**, or the total data, outgrow one primary database. Replicas don't help with that, because every replica holds a full copy and replays every write. The answer is **sharding**: split the data across several independent databases, each owning a slice.

```viz algo=arch title="Stage 10 — data split across shards by user id"
app     App servers [server*3]
router  Shard router | user_id → shard [service]
s0      Shard 0 | users A–F [db]
s1      Shard 1 | users G–P [db]
s2      Shard 2 | users Q–Z [db]
--
app -> router
router -> s0
router -> s1
router -> s2
```

Each shard handles a fraction of the reads, writes and storage, so the system scales nearly linearly. **New problems:** choosing a good shard key, queries that span shards (joins, global counts), hot shards (a celebrity user), and moving data when you add shards. Three lessons in the Databases module cover this.

## Stage 11 and beyond: split the services

As the team grows to dozens of engineers, one big codebase becomes the bottleneck: every deploy ships everyone's changes. Teams split the application into **services** (users, payments, feed, search), each owning its data and deployed independently. The microservices lesson covers when that's worth it, because it adds a lot of operational complexity.

## The whole picture

:::flow Each step and the bottleneck it removes
1 → 2 servers | app and DB stop fighting over resources
Load balancer | the app tier scales out, no SPOF
Read replicas | reads scale, DB failover
Cache | hot reads skip the DB
CDN | static files served from the edge
Queue | slow work leaves the request path
Multi-region | disaster survival, low global latency
Sharding | writes and data scale out
:::

:::interview How to use this in an interview
Interviewers love "how would you scale this?" questions. Don't jump to stage 11. Start from the **simplest design that meets the requirements**, then add components **only when you can name the bottleneck they remove**: "At 600K reads per second the database can't keep up, so I'll add a cache. With a 90% hit rate, the database sees 60K…". That's exactly the reasoning they want to hear.
:::

:::problem Scale a blogging platform {level=easy tags="scaling,architecture"}
A blogging site runs on one server with the app and a MySQL database. It has 10,000 daily readers. A celebrity starts posting and traffic jumps to 5 million daily readers, about 50 reads per write, with big spikes when a post goes viral. Walk through the changes you'd make, in order, and say why each one is needed.

:::hint Hint
It's extremely read-heavy, and the content is the same for every reader. What's the cheapest way to serve the same page millions of times?
:::

:::solution
1. **Separate the database** from the app server, and **scale up** the database first (cheap, no code changes).
2. **Load balancer + 2–3 stateless app servers** (sessions in Redis). Removes the SPOF; handles normal growth.
3. **Cache rendered posts** (or full pages) in Redis, and set `Cache-Control` headers so a **CDN caches whole pages** for anonymous readers. Blog posts change rarely and every reader sees the same page, so a viral post can be served almost entirely from the CDN edge. This is the biggest win by far.
4. **Images in object storage** behind the CDN.
5. **A read replica or two** for whatever still reaches the database (comments, admin pages), plus failover.
6. **A queue** for slow work: sending "new post" emails to millions of subscribers, updating the search index.

Not needed yet: sharding (writes are tiny), multiple regions (a CDN already gives global speed), microservices. Saying what you would **not** do, and why, is a strong signal.
:::
:::

```quiz
? Why must app servers be stateless before you put them behind a load balancer?
- Load balancers can't route to stateful servers
+ So any server can handle any request: you can add, remove or lose servers without losing user sessions
- Stateless servers use less memory
> If a session lives in one server's memory, the user is tied to that server, and loses everything when it dies.

? Read replicas help with which bottleneck?
+ Too many reads for one database
- Too many writes for one database
- Too much data to fit on one machine
> Every replica still applies every write and holds the full data set. Writes and data size need sharding.

? A user edits their profile and immediately sees the old version after refreshing. With primary/replica databases, the likely cause is…
- The cache is too large
+ Replication lag: the read went to a replica that hadn't applied the write yet
- The load balancer sent the request to the wrong region
> Asynchronous replicas are slightly behind. "Read-your-writes" techniques fix this, such as reading your own profile from the primary for a short time after an edit.

? In what order should you usually add components?
- All of them on day one, to be safe
+ Only when a concrete bottleneck appears, each one solving the problem you can measure or estimate
- Start with sharding, since it's the hardest to add later
> Every component adds cost and complexity. Interviewers want each one justified by a bottleneck.
```

:::keypoints
- Systems grow in stages, and **each component removes a specific bottleneck**: separate DB → load balancer + stateless servers → replicas → cache → CDN → queues → multi-region → sharding → services.
- **Vertical** scaling is simple but limited and stays a SPOF; **horizontal** scaling is unlimited but needs **stateless** services and load balancing.
- **Read replicas** scale reads and enable failover, at the cost of **replication lag**. **Sharding** scales writes and data size.
- **Caches** and **CDNs** take load off the origin; **queues** take slow work off the request path.
- In interviews, start simple and add each component **only with a stated reason**.
:::
