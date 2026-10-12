---
title: A Mock Interview, Annotated — Design Pastebin
level: intermediate
time: 45
summary: A complete 45-minute system design interview for "Design Pastebin", written as a dialogue with commentary on what earns credit at each step — requirements, estimates, API, the high-level design, three deep dives (storage split, key generation, expiry and caching) — followed by the red flags that sink similar interviews.
---

Reading frameworks is not the same as hearing one applied. Here is a full interview, written as it might happen, with notes on **why** each move works. The problem is deliberately simple, so you can focus on the **process**. Every case study in the next two modules follows the same shape.

:::problem Design Pastebin {level=easy tags="HLD,mock interview,object storage,key generation"}
Users paste text and get a short link to share it. Anyone with the link can read the text. Pastes can expire. Design the system.

:::hint Hint
It's a URL-shortener cousin with a twist: the payload (the text) can be large, so where you store it matters. Reads dominate.
:::
:::

## 0:00 — Requirements

> **Interviewer:** Let's design Pastebin.
>
> **Candidate:** Sure. Let me confirm scope. Core features: a user submits text and gets a unique short URL; anyone with the URL can read it; pastes can have an expiry. Should I include user accounts, editing, or syntax highlighting?
>
> **Interviewer:** Accounts optional. No editing. Highlighting is a client concern.
>
> **Candidate:** Then functionally: **create a paste** (with optional expiry and optional "unlisted/private"), **read a paste** by its key, and **expire** pastes automatically. Non-functionally, I'd assume it's **read-heavy**, say 10 reads per paste; reads should be **fast** (< 100 ms p99 for small pastes) and **highly available**; a paste must **never be lost** before expiry; keys should be **hard to guess** for unlisted pastes; a size limit of, say, 10 MB per paste. Sound right?
>
> **Interviewer:** Yes, go with that.

:::note Why this works
Three functional requirements, explicitly scoped. Non-functional requirements are **concrete** (read-heavy ratio, latency target, durability, unguessable keys, a size limit), and each will drive a design decision later. Asked, then **proposed** assumptions instead of waiting for numbers.
:::

## 0:05 — Entities and estimates

> **Candidate:** Entities: **Paste** (key, content, created, expires, visibility, size) and optionally **User**. For scale, let me assume **1 M new pastes per day** and 10 M reads per day.
>
> - Writes: 1 M / 10⁵ s ≈ **12/s** average, maybe 50/s peak. Small.
> - Reads: ≈ **120/s** average, a few hundred at peak; viral pastes much more.
> - Storage: average paste ~10 KB → 10 GB/day → ~**3.6 TB/year**, ~18 TB over 5 years.
>
> Conclusions: the request rate is modest; the interesting parts are **storage of large blobs**, **key generation**, and **expiry**, plus caching for viral pastes.

:::note Why this works
Fast, rounded arithmetic, and every number ends in a **conclusion**. The candidate even noticed the QPS is small and redirected attention to what matters. That's judgement, which is what the estimate step is really testing.
:::

## 0:09 — API

```text
POST /v1/pastes                  {content | uploadId, expiresIn?, visibility}   → 201 {key, url}
GET  /v1/pastes/{key}            → 200 {content, createdAt, expiresAt}   (404 if missing/expired)
GET  /{key}                      → the HTML viewer (served via CDN)
DELETE /v1/pastes/{key}          (owner only, if accounts exist)
```

> **Candidate:** For big pastes, the client can upload straight to object storage with a pre-signed URL and pass the `uploadId`. POST should accept an **idempotency key** so a retried submit doesn't create two pastes.

## 0:13 — High-level design

```viz algo=arch title="Pastebin: high-level design"
user     Users [browser]
cdn      CDN | cached reads [cdn]
lb       Load balancer [lb]
api      Paste service [service*3]
keys     Key generator | pre-generated key ranges [key]
cache    Cache | hot pastes [cache]
meta     Metadata DB | key, expiry, size, s3Key [db]
s3       Object storage | paste content [storage]
sweep    Expiry worker [clock]
--
user -> cdn : GET /{key}
cdn -> lb : miss
user -> lb : POST /pastes
lb -> api
api -> keys : next key
api -> meta
api -> s3
api -> cache
sweep ~> meta : delete expired
sweep ~> s3 : delete blobs
--
flow Create a paste
user > lb : POST /v1/pastes with the text (or an uploadId for big pastes).
lb > api : Any stateless instance.
api > keys : Take a key from this instance's pre-allocated range (no collision checks).
api > s3 : Store the content as an object pastes/{key}.
api > meta : Insert {key, s3Key, size, createdAt, expiresAt}.
flow Read a paste
user > cdn : GET /k3Xa9Q2: popular pastes are served from the edge.
cdn > lb : Miss: forward to the origin.
lb > api : The service looks up the key.
api > cache : Hot pastes are in the cache…
api > meta : …else metadata from the DB (checks expiry)…
api > s3 : …and the content from object storage.
```

> **Candidate:** The service is stateless behind a load balancer. **Content** goes to **object storage** (cheap, durable, unlimited, and pastes can be large), and only **metadata** goes to the database. Reads check metadata (exists? expired?), then fetch the content, with a cache for hot pastes and a CDN in front for public ones.

:::note Why this works
Each functional requirement is walked through the boxes. The key decision (**blob vs metadata split**) is stated with its reason. The candidate hasn't over-built: no Kafka, no sharding yet.
:::

## 0:23 — Deep dive 1: key generation

> **Interviewer:** How do you generate the keys?
>
> **Candidate:** Options:
> 1. **Hash the content** (e.g. first 7 chars of base62(SHA-256)): identical pastes collide by design, and different pastes can collide in the prefix; it also leaks that two pastes are identical. Not great.
> 2. **Random 8-character base62** (62⁸ ≈ 2.2 × 10¹⁴ keys): unguessable, but needs a uniqueness check and retry on collision (rare).
> 3. **Counter + base62** with **pre-allocated ranges**: each service instance takes a block of 1,000 ids from the key service (or a DB sequence) and encodes them. No collision checks, no coordination per request. But sequential ids are **guessable**.
>
> Since unlisted pastes must be unguessable, I'd use **random keys** with a unique constraint on the key column and retry on the rare collision. At 1 M/day over 5 years we'd have ~2 × 10⁹ keys out of 2 × 10¹⁴, so collisions are about 1 in 100,000 inserts. If the interviewer prefers zero checks, I'd use counter ranges and **encrypt** the counter with a keyed permutation (e.g. a format-preserving cipher) so outputs look random but stay unique.

:::note Why this works
Three options, each with a concrete weakness tied to a **requirement** (unguessable keys), a numerical sanity check of the collision rate, and a decisive choice, plus a refinement if the interviewer pushes.
:::

## 0:31 — Deep dive 2: expiry and storage lifecycle

> **Candidate:** Expiry has two parts. **Correctness**: every read checks `expiresAt` and returns 404 if it has passed; that's lazy expiry, so an expired paste is never served even before cleanup. **Reclaiming space**: a background worker periodically deletes expired rows (indexed by `expiresAt`) in small batches, and deletes their objects. Object storage **lifecycle rules** can back this up. Cached copies get a TTL no longer than the time to expiry, so the cache never outlives the paste. Pastes without expiry could move to a cheaper storage tier after 90 days without reads.

## 0:37 — Deep dive 3: viral pastes and caching

> **Interviewer:** A paste goes viral on social media: 50,000 reads per second.
>
> **Candidate:** Pastes are **immutable**, which makes caching easy: no invalidation except expiry and deletion. Public pastes are served through the **CDN** with `Cache-Control: max-age` up to the remaining lifetime; the edge absorbs almost all of the 50K/s. Behind it, a **Redis** cache keyed by paste key holds small hot pastes (say < 1 MB); larger ones are served directly from object storage via the CDN. Request coalescing at the cache prevents a stampede on a cold key. On deletion or takedown, we **purge** that one URL from the CDN.

## 0:42 — Wrap-up

> **Candidate:** To summarise: stateless paste service; content in object storage, metadata in a database; random unguessable keys with a unique constraint; lazy expiry plus a cleanup worker; CDN and Redis for hot pastes. Remaining risks: **abuse** (spam, malware, illegal content) needs rate limiting per IP/user and content scanning; the metadata DB would need **sharding by key** after a few years (hash of the key is uniform); and I'd monitor read latency, cache hit rates, storage growth and cleanup lag.

## The red flags this candidate avoided

| Red flag | What it looks like | Better |
|---|---|---|
| Jumping to technology | "We'll use Kafka, Cassandra and Kubernetes" in minute one | requirements first; justify every component |
| Over-long estimates | 15 minutes of arithmetic | 3–5 minutes, each number → a decision |
| No data model | boxes without saying what's stored where | name the store and key for each entity |
| Ignoring the hard part | a perfect load balancer discussion, nothing about key generation or the timeline fan-out | find the problem's core difficulty and spend time there |
| No trade-offs | "I'd use X" with no alternatives | options → choice → what you give up |
| Silence | minutes of drawing without talking | narrate decisions; check in at each step |
| Ignoring hints | the interviewer asks about failures twice | follow the interviewer's questions: they're the rubric |
| Dogmatism | defending a weak choice | "good point, let me revise that" is a strength |

## Practising effectively

1. **Design first, then read**: for every case study, set a 35–45 minute timer and design it yourself on paper or a whiteboard before reading the walkthrough.
2. **Talk out loud** while practising, even alone; record yourself occasionally.
3. **Mock with a friend** using the template from the framework lesson; swap roles (interviewing someone teaches you what interviewers see).
4. **Keep a mistakes list**: every time a walkthrough covers something you missed (a hot-key problem, an idempotency issue), write it down and reread the list before interviews.

```quiz
? Why does the candidate store paste content in object storage instead of the database?
+ Pastes can be large; object storage is cheaper, effectively unlimited and durable, and the database stays small and fast with only metadata
- Databases can't store text
- Object storage has lower latency than any database
> The blob/metadata split is a standard pattern whenever payloads are large.

? Sequential counter keys are simple and collision-free. Why did the candidate reject them here?
+ They're guessable, which breaks the "unlisted pastes are hard to find" requirement
- Counters overflow quickly
- They're too long
> Choices are justified by requirements, not by general preference.

? Which behaviour is a red flag in a design interview?
+ Spending most of the time on standard components while never addressing the problem's hardest part
- Asking a few clarifying questions
- Stating assumptions and confirming them
> Find the core difficulty (here: storage split, keys, expiry, hot reads) and go deep there.
```

:::keypoints
- A strong interview has a visible structure: scoped requirements → estimates with conclusions → API → a simple high-level design → 2–3 deep dives → wrap-up.
- In each deep dive: list options, tie their weaknesses to **requirements**, check numbers, and choose decisively.
- Pastebin's core: **content in object storage, metadata in a DB**, unguessable **keys**, **lazy expiry + cleanup**, **CDN/cache** for immutable hot content, abuse controls.
- Avoid the red flags: technology-first, endless estimates, no data model, ignoring the hard part, no trade-offs, silence, ignoring hints, dogmatism.
- Practise by designing before reading, out loud, with mocks and a mistakes list.
:::
