---
title: Back-of-the-Envelope Estimation
level: easy
time: 35
summary: The numbers every engineer should know (powers of two, latencies, time constants) and a repeatable method to estimate QPS, storage, bandwidth, memory for caches and server counts in under five minutes, with worked examples and an interactive calculator.
---

"How many servers do we need?" "Will this fit in memory?" "Do we even need a cache?" You can't answer any of these without numbers. **Back-of-the-envelope estimation** is quick, rough arithmetic that tells you the **order of magnitude** of the load. Is it 100 requests per second or 100,000? 10 GB or 10 PB? The answer changes the design completely.

:::def Back-of-the-envelope estimate
A calculation done in a minute or two with rounded numbers, aiming to be correct within a factor of about 2–10. Its purpose is to **decide things**: which components are needed, where the bottleneck is, whether an idea is feasible.
:::

## The numbers to memorise

### Powers of two and data sizes

| Power | Exact | Approx. | Name |
|---|---|---|---|
| $2^{10}$ | 1,024 | thousand ($10^3$) | 1 KB |
| $2^{20}$ | 1,048,576 | million ($10^6$) | 1 MB |
| $2^{30}$ | | billion ($10^9$) | 1 GB |
| $2^{40}$ | | trillion ($10^{12}$) | 1 TB |
| $2^{50}$ | | quadrillion ($10^{15}$) | 1 PB |

Handy sizes: a character in ASCII is **1 byte**; a typical integer or timestamp is **4–8 bytes**; a UUID is **16 bytes** (36 as text); a tweet-sized text record with metadata is **~1 KB**; a compressed photo is **~200 KB–2 MB**; one minute of HD video is **~50–100 MB**.

### Time

:::formula A day has 86,400 seconds ≈ 10⁵ seconds
1\text{ day} \approx 10^5\text{ s} \quad\cdot\quad 1\text{ month} \approx 2.5\times10^6\text{ s} \quad\cdot\quad 1\text{ year} \approx 3\times10^7\text{ s}
:::

So **1 million requests per day ≈ 12 per second**. Memorise that one conversion and most QPS estimates become mental arithmetic:

| Per day | Per second (average) |
|---|---|
| 1 million | ~12 |
| 10 million | ~120 |
| 100 million | ~1,200 |
| 1 billion | ~12,000 |

### Latency numbers

Every engineer should have a feel for these orders of magnitude. The values are approximate (they vary by hardware), but the **ratios** are what matter. Switch to *"If 1 ns were 1 second"* to feel the gaps on a human scale.

```viz algo=latency title="Latency numbers every engineer should know"
```

What to take away:

- **Memory is ~100× faster than SSD, and SSD ~100× faster than spinning disk** for random reads. That's why caches live in RAM.
- **Reading sequentially is far faster than random access** on every medium. Log-structured storage (Kafka, LSM trees) exploits this.
- **One round trip inside a data centre (~0.5 ms) costs as much as ~5,000 RAM lookups.** Avoid chatty service-to-service calls in a loop: batch them.
- **Crossing an ocean costs ~150 ms.** Users notice anything above ~100 ms, so global apps need servers near users.

### Rough capacity of one machine

| Component | Ballpark per instance | Notes |
|---|---|---|
| Web / app server | 1,000–10,000 simple req/s | depends heavily on the work per request |
| SQL database (Postgres/MySQL) | 5,000–20,000 simple queries/s | far fewer for complex joins; writes are costlier |
| Redis / Memcached | 100,000+ ops/s | in memory, simple commands |
| Kafka broker | hundreds of MB/s | sequential disk writes |
| Server RAM | 64–512 GB | the most common sizes in clouds |
| Network card | 10–25 Gbps | ~1–3 GB/s |
| Concurrent WebSocket connections | 100K–1M | mostly idle connections, tuned server |

These numbers are deliberately rough. In an interview, state the assumption ("let's say one app server handles about 1,000 requests per second") and move on.

## The method: four estimates

Most interviews need some subset of these. Always start from **daily active users (DAU)** and **actions per user**.

:::flow The estimation recipe
Traffic (QPS) | DAU × actions ÷ 86,400, then × peak factor
Storage | new items per day × size × retention
Bandwidth | QPS × payload size
Memory / servers | hot data to cache, peak QPS ÷ per-server capacity
:::

### Worked example: a Twitter-like service

**Assumptions** (say them out loud): 200 M daily active users. Each posts 2 tweets a day and reads 100 tweets a day (the timeline). 10% of tweets have an image (~500 KB). A tweet with metadata is ~1 KB. We keep data for 5 years. Peak traffic is 3× the average.

:::derive Write traffic
\text{tweets/day} = 200\text{M} \times 2 = 400\text{M} || 2 tweets per user
\text{write QPS} = 400\text{M} / 10^5 \approx 4{,}000 || divide by ~86,400 s
!\text{peak write QPS} \approx 12{,}000 || × 3 peak factor
:::

:::derive Read traffic
\text{reads/day} = 200\text{M} \times 100 = 20\text{B} || 100 tweets viewed per user
\text{read QPS} = 20\text{B} / 10^5 \approx 200{,}000 || reads outnumber writes 50 : 1
!\text{peak read QPS} \approx 600{,}000 || this system is read-heavy: cache aggressively
:::

:::derive Storage
\text{text/day} = 400\text{M} \times 1\text{KB} = 400\text{GB} ||
\text{media/day} = 400\text{M} \times 10\% \times 500\text{KB} = 20\text{TB} || images dominate by 50×
\text{5 years} \approx 20.4\text{TB} \times 365 \times 5 \approx 37\text{PB} ||
!\text{with 3 replicas} \approx 110\text{PB} || media goes to object storage (S3), not the database
:::

:::derive Bandwidth
\text{ingress} \approx 20.4\text{TB} / 10^5\text{s} \approx 200\text{MB/s} || uploads
!\text{egress} \gg \text{ingress} || reads are 50× writes: serve media from a CDN
:::

**What did the numbers tell us?**

1. 600K peak reads/s can't come from a database alone. We need a **cache** and precomputed timelines.
2. Media is 98% of storage. It belongs in **object storage + CDN**, with only metadata in the database.
3. 400 GB of new text per day is ~150 TB per year: one database server can't hold it, so the tweets table must be **sharded**.

That's the real value of estimation: three design decisions in two minutes.

### Cache sizing: the 80/20 rule

Traffic is usually skewed: a small fraction of items gets most of the reads. A common assumption is that **20% of the data serves 80% of the reads**, so caching the hottest 20% of a day's data gives a high hit rate.

:::derive Cache memory for one day of hot tweets
\text{read requests/day} = 20\text{B} ||
\text{unique tweets read/day} \approx 400\text{M} \times \text{a few days' worth} \approx 1\text{B} || reads concentrate on recent tweets
\text{hot 20\%} = 200\text{M tweets} \times 1\text{KB} = 200\text{GB} ||
!\approx 3\text{–}4 \text{ cache servers with 64 GB each} || plus replicas for availability
:::

## Try it yourself

The calculator below runs the same recipe. Pick a preset, then change the assumptions and watch which numbers move.

```viz algo=estimate title="Back-of-the-envelope calculator"
dau = 200000000
writes = 2
ratio = 50
size = 1000
media = 0.1
msize = 500000
years = 5
peak = 3
```

Here is the same arithmetic as a small program you can adapt to any question:

```js run title="An estimation helper"
const DAY = 86_400;
const human = (n) => {
  for (const [div, unit] of [[1e15, "P"], [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "K"]])
    if (n >= div) return (n / div).toFixed(1) + " " + unit;
  return n.toFixed(1) + " ";
};

function estimate({ dau, writesPerUser, readsPerUser, recordBytes, years, peak = 2 }) {
  const writeQps = (dau * writesPerUser) / DAY;
  const readQps = (dau * readsPerUser) / DAY;
  const storage = dau * writesPerUser * recordBytes * 365 * years;
  return {
    "write QPS (avg / peak)": `${human(writeQps)} / ${human(writeQps * peak)}`,
    "read QPS (avg / peak)": `${human(readQps)} / ${human(readQps * peak)}`,
    [`storage for ${years} years`]: human(storage) + "B",
    "app servers @1K QPS each": Math.ceil((readQps + writeQps) * peak / 1000),
  };
}

console.log("URL shortener:", estimate({ dau: 10e6, writesPerUser: 0.1, readsPerUser: 10, recordBytes: 500, years: 10, peak: 3 }));
console.log("Chat app:", estimate({ dau: 500e6, writesPerUser: 40, readsPerUser: 40, recordBytes: 200, years: 5, peak: 2 }));
```

## Tips that make you look experienced

- **Round aggressively.** 86,400 → 10⁵, 365 → 400 or 300, 2.6 → 3. Say "roughly" and keep going. Nobody grades the third digit.
- **Write the assumptions down** where the interviewer can see them, so they can correct one without redoing everything.
- **Separate reads and writes.** Their ratio tells you whether to optimise for caching (read-heavy) or for write throughput (write-heavy).
- **Always apply a peak factor** (2–10×). Systems fall over at peak, not on average. Events (Black Friday, a cricket final, New Year's midnight) can be 10–100×.
- **Don't forget replication** (×3 is common) and **indexes / overhead** (×1.3–2) in storage.
- **Draw a conclusion from each number.** An estimate that doesn't change the design is wasted time. "600K reads per second, so we need a cache" is the point.

:::warn Don't over-estimate in the interview
Spend **3–5 minutes** on estimates, and only on numbers that influence the design. Some interviewers now say "skip it, assume it's big". Then just state the scale ("hundreds of thousands of reads per second, petabytes of media") and move on.
:::

:::problem Estimate a photo-sharing app {level=easy tags="estimation"}
500 M daily active users. Each uploads 1 photo every 5 days (average size 2 MB, plus a 30 KB thumbnail) and views 50 photos a day. Photos are kept forever. Estimate upload QPS, view QPS, storage per year, and egress bandwidth. What do the numbers tell you about the design?

:::hint Hint
Uploads per day = 500 M ÷ 5. Views mostly hit thumbnails in the feed, and full images only when opened.
:::

:::solution
- **Uploads**: 500 M ÷ 5 = 100 M/day → 100 M ÷ 10⁵ ≈ **1,000/s** average, ~3,000/s at peak.
- **Views**: 500 M × 50 = 25 B/day → **250,000/s** average, ~750K/s at peak. Read-heavy, 250 : 1.
- **Storage**: 100 M × ~2 MB ≈ **200 TB/day** → ~**73 PB/year**, ×3 replication ≈ 220 PB/year (erasure coding can cut that overhead to ~1.5×). Thumbnails add only 3 TB/day.
- **Egress**: say 49 of the 50 views are thumbnails (30 KB) and 1 is a full image (2 MB): 250K/s × (0.98 × 30 KB + 0.02 × 2 MB) ≈ 250K × 70 KB ≈ **17.5 GB/s** ≈ 140 Gbps.

**Design consequences:** photos go to **object storage** (never the database), and are served through a **CDN** (no origin could push 140 Gbps economically). The upload path should be **direct-to-storage with pre-signed URLs**, so app servers never handle the bytes. Generating **thumbnails** asynchronously from a queue is a must, since they carry 98% of the views. Metadata (100 M rows/day) needs a **sharded** database.
:::
:::

```quiz
? Roughly how many requests per second is 50 million requests per day?
- ~50
+ ~600
- ~6,000
- ~50,000
> 50 M ÷ ~86,400 s ≈ 580. Using 10⁵ seconds per day gives 500, which is close enough.

? Why apply a "peak factor" to average QPS?
+ Traffic isn't flat. Systems must survive the busiest hour, often 2–10× the average
- Averages are always calculated wrongly
- To account for database replication
> Capacity planning is about peaks. A system sized for the average falls over every evening.

? An estimate shows media is 98% of storage and reads are 100× writes. The most useful conclusion is…
- Use a bigger database server
+ Put media in object storage behind a CDN, and keep only metadata in the database
- Compress the metadata
> The numbers point straight at the design: blobs belong in object storage, and read-heavy media belongs on a CDN.
```

:::keypoints
- Estimates aim for the right **order of magnitude**, to decide the design: cache or not, shard or not, CDN or not.
- Memorise: **1 day ≈ 10⁵ s**, **1 M/day ≈ 12/s**, powers of two (KB→PB), and the latency ladder (RAM ≪ SSD ≪ network round trip ≪ cross-ocean).
- Recipe: **QPS** = DAU × actions ÷ 10⁵ × peak; **storage** = items/day × size × retention × replicas; **bandwidth** = QPS × payload; **servers** = peak QPS ÷ per-server capacity.
- Separate **reads from writes**. The ratio tells you what to optimise.
- State assumptions, round hard, and **turn every number into a design decision**.
:::
