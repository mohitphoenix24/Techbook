---
title: Design a Web Crawler
level: advanced
time: 50
summary: Crawling a billion pages a month — the crawl loop, a URL frontier that balances priority and politeness (Mercator's front and back queues), robots.txt and DNS caching, URL and content deduplication with Bloom filters and SimHash, crawler traps, distributing the work by host, recrawl scheduling for freshness, and checkpointing so crashes lose nothing.
---

:::problem Design a Web Crawler {level=hard tags="HLD,queues,Bloom filter,politeness"}
Design a crawler for a search engine that downloads **1 billion pages per month**, discovers new pages by following links, revisits pages to keep them fresh, and never overloads any website.

:::hint Hint
The loop is simple (fetch → parse → extract links → enqueue). The design is in the **frontier**: which URL to fetch next, so that important pages come first and no host is hit too often. Then deduplication at two levels (URLs and content) and traps.
:::
:::

## 1. Requirements

**Functional**
- Start from **seed URLs**; fetch pages, extract links, follow them.
- Store page content for the indexer; **recrawl** pages based on how often they change.
- Respect **robots.txt** and crawl-delay; HTML only (images, PDFs out of scope, or later).

**Non-functional**
- **Scale**: 1 B pages/month, scaling out by adding machines.
- **Politeness**: at most ~1 request per second per host (less if robots.txt says so).
- **Robustness**: malformed HTML, slow or hostile servers, **crawler traps**, crashes (resume without losing the frontier).
- **Priority**: important pages (high PageRank, news front pages) crawled first and more often.
- Extensible: new content types and processing steps can be plugged in.

## 2. Estimates

:::derive Throughput and storage
\text{fetch rate} = 10^9 / (30 \times 86{,}400\,\text{s}) \approx 400\,\text{pages/s} \;(\text{peak} \sim 800) || one month
\text{bandwidth} \approx 400 \times 100\,\text{KB} = 40\,\text{MB/s} \approx 320\,\text{Mbit/s} || 100 KB average page
\text{storage} = 10^9 \times 100\,\text{KB} = 100\,\text{TB/month} \;(\sim 25\,\text{TB compressed}) ||
!\text{URLs seen: } 10^{10} \text{ URLs} \times 10 \text{ bits (Bloom)} \approx 12\,\text{GB} || fits in memory across a few nodes
:::

**Conclusions:** 400 fetches/s is modest per machine count, but each fetch **waits** on a remote server (hundreds of ms), so we need thousands of **concurrent** connections (async I/O); storage goes to object storage; the URL-seen set needs a compact structure.

## 3. The crawl loop and the components

```viz algo=arch title="Web crawler" dir=down
seeds    Seed URLs [list] @0,1
front    URL frontier | priority + politeness [queue] @1,1
dns      DNS cache [dns] @2,0
fetch    Fetchers | async HTTP [worker*3] @2,1
robots   robots.txt cache [shield] @2,2
store    Content store | object storage [storage] @3,0
parse    Parser | extract links [worker*2] @3,1
dedup    Content dedup | hash / SimHash [filter] @4,0
seen     URL seen? | Bloom filter + DB [filter] @4,2
index    Indexer pipeline [search] @5,0
--
seeds -> front
front -> fetch : next URL
fetch -> dns
fetch -> robots
fetch -> store
fetch -> parse
parse -> dedup
dedup ~> index
parse -> seen : extracted links
seen -> front : new URLs only
--
flow One page through the crawler
front > fetch : The frontier hands out https://site.example/a: its host's politeness timer has expired.
fetch > robots : robots.txt for site.example is cached: /a is allowed, crawl-delay 1 s.
fetch > dns : The IP comes from the local DNS cache (DNS lookups are a classic crawler bottleneck).
fetch > store : The response (HTML, headers, fetch time) is saved to object storage.
fetch > parse : Parse the HTML, extract and normalise 60 links.
parse > dedup : Is this content a duplicate or near-duplicate of a page we already have? If not, send it to the indexer.
parse > seen : For each link: filter (blocked types, traps), then "seen before?"
seen > front : 12 of the 60 are new; they enter the frontier with a priority.
```

## 4. Deep dives

### A. The URL frontier: priority and politeness

A plain FIFO queue fails both goals: it ignores importance, and because pages link mostly within their own site, consecutive URLs hit the **same host**, hammering it. The classic **Mercator** design has two layers:

- **Front queues (priority)**: a prioritiser scores each URL (PageRank, site importance, change rate, depth) and puts it into one of F priority queues. A selector picks from higher queues more often.
- **Back queues (politeness)**: B queues, each holding URLs of **one host only**, plus a min-heap of "earliest time this host may be fetched again". A fetcher takes the host at the top of the heap, fetches one URL, and reinserts the host with `now + delay`.

```js run title="FIFO vs per-host queues: same work, very different load on sites"
// A synthetic web: 40 hosts, links mostly stay on the same host (like real sites)
const HOSTS = Array.from({ length: 40 }, (_, i) => `site${i}.example`);
const hash = (str) => {                         // FNV-1a + Murmur3 finalizer
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
const links = (url) => {                         // 4 deterministic out-links per page, 70% on the same host
  const host = url.split("/")[0];
  return [0, 1, 2, 3].map((i) => {
    const h = hash(url + "#" + i);
    return `${h % 10 < 7 ? host : HOSTS[(h >>> 4) % HOSTS.length]}/p${(h >>> 12) % 50}`;
  });
};

const FETCH_MS = 100, POLITE_GAP_MS = 1000, WORKERS = 4, LIMIT = 300;

function crawl(polite) {
  const seen = new Set(), queues = new Map(), fifo = [];   // per-host queues (polite) or one FIFO (naive)
  const nextAllowed = new Map(), hits = new Map();         // host → earliest next fetch; host → fetch times
  const enqueue = (u) => {
    if (seen.has(u)) return;                               // "URL seen?" test (a Bloom filter at scale)
    seen.add(u);
    if (!polite) return fifo.push(u);
    const host = u.split("/")[0];
    if (!queues.has(host)) queues.set(host, []);
    queues.get(host).push(u);
  };
  ["site0.example/p0", "site1.example/p0"].forEach(enqueue);
  const workerFree = new Array(WORKERS).fill(0);
  let fetched = 0, now = 0;
  while (fetched < LIMIT) {
    const w = workerFree.indexOf(Math.min(...workerFree));
    now = Math.max(now, workerFree[w]);
    let url;
    if (polite) {                                          // pick the host whose politeness timer expires first
      let best = null;
      for (const [host, q] of queues) if (q.length && (!best || (nextAllowed.get(host) || 0) < (nextAllowed.get(best) || 0))) best = host;
      if (!best) break;
      now = Math.max(now, nextAllowed.get(best) || 0);
      url = queues.get(best).shift();
      nextAllowed.set(best, now + FETCH_MS + POLITE_GAP_MS);
    } else {
      if (!fifo.length) break;
      url = fifo.shift();
    }
    const host = url.split("/")[0];
    (hits.get(host) || hits.set(host, []).get(host)).push(now);
    workerFree[w] = now + FETCH_MS;
    fetched++;
    links(url).forEach(enqueue);
  }
  // politeness check: the busiest host's worst 1-second window
  let worst = 0, worstHost = "";
  for (const [h, ts] of hits) for (let i = 0; i < ts.length; i++) {
    const inWindow = ts.filter((t) => t >= ts[i] && t < ts[i] + 1000).length;
    if (inWindow > worst) { worst = inWindow; worstHost = h; }
  }
  return { fetched, seconds: (Math.max(...workerFree) / 1000).toFixed(1), hosts: hits.size, worst, worstHost, discovered: seen.size };
}

for (const polite of [false, true]) {
  const r = crawl(polite);
  console.log(`${polite ? "per-host queues" : "single FIFO    "}: ${r.fetched} pages in ${r.seconds}s, ${r.hosts} hosts, ` +
    `${r.discovered} URLs discovered; worst: ${r.worst} requests/second to ${r.worstHost}`);
}
```

The per-host frontier is only slightly slower overall because, with many hosts, there is almost always **some** host whose timer has expired. Politeness costs little when you crawl broadly, which is why real crawlers keep many thousands of hosts active at once.

### B. Deduplication at two levels

- **URL seen?** Normalise first (lowercase host, remove default ports, fragments and tracking parameters, resolve relative links), then check a **Bloom filter** (fast, memory-light; a false positive just skips a page, which is acceptable), backed by a URL database for exact state such as last crawl time.
- **Content seen?** About 30% of the web is duplicate content (mirrors, the same article on many URLs). Exact duplicates: a hash of the normalised content. **Near**-duplicates (different ads, timestamps): **SimHash** fingerprints, where similar documents have fingerprints differing in only a few bits.

### C. Distributing the crawl

Partition the frontier **by host** (`hash(host) mod M` or consistent hashing): each crawler node owns a set of hosts, so politeness is enforced locally without coordination, and its DNS and robots.txt caches stay warm. Discovered links for other hosts are batched and sent to their owner nodes. Place crawler nodes in several regions to fetch from nearby servers.

### D. Traps and hostile content

Crawler traps generate infinite URLs: calendars with "next month" forever, session ids in URLs, `/a/b/a/b/a/b/…` paths. Defences: maximum URL length and path depth, a **per-host page budget**, detecting repeating path segments, and normalising away session parameters. Also cap download size and time, and treat spam/link-farm sites with low priority.

### E. Freshness: recrawling

Pages change at very different rates (a news front page every minute, an old blog post never). Track each page's observed change rate (did the content hash change since the last fetch?) and schedule the next crawl accordingly; use **conditional requests** (`If-Modified-Since`, `ETag`) so unchanged pages cost a `304` with no body. Sitemaps and RSS feeds give hints about new and updated pages.

### F. Robustness

Store the frontier in durable storage (queues spilled to disk/Kafka, URL state in a database), **checkpoint** progress, and make fetches idempotent (refetching a page is harmless). Use timeouts on every connection and isolate parsers (malformed HTML can crash them).

## 5. Wrap-up

The design: seeds → a **frontier** with priority (front) and per-host politeness (back) queues → **async fetchers** with DNS and robots caches → raw pages in object storage → parser → **content dedup** (hash + SimHash) → link extraction, normalisation and filtering → **Bloom filter** URL-seen test → back into the frontier; partitioned by host across crawler nodes; recrawls scheduled by change rate. Monitor pages/s, errors by type, per-host request rates, frontier size and the duplicate rate.

```quiz
? Why does a simple FIFO frontier overload websites?
+ Pages link mostly within their own site, so consecutive URLs in the queue tend to hit the same host
- FIFO queues are slow
- FIFO ignores robots.txt
> Per-host back queues with a "next allowed time" fix this.

? How should a distributed crawler split work between nodes?
+ Partition by host, so each node enforces politeness for its hosts locally and keeps DNS/robots caches warm
- Round-robin URLs across nodes
- Each node crawls the whole web independently
> Host-based partitioning avoids cross-node coordination for politeness.

? What detects near-duplicate pages that differ only in ads or timestamps?
+ SimHash fingerprints compared by Hamming distance
- An MD5 of the raw HTML
- A Bloom filter of URLs
> Exact hashes only catch byte-identical content.
```

:::keypoints
- Loop: frontier → fetch (async, DNS + robots caches) → store → parse → dedup → extract and normalise links → URL-seen filter → frontier.
- The **frontier** is the heart: **front queues for priority**, **back queues per host** with a heap of next-allowed times for **politeness**.
- **URL dedup** with normalisation + Bloom filter; **content dedup** with hashes and **SimHash** for near-duplicates.
- Scale out by **partitioning hosts** across nodes; defend against **traps** with depth/length/per-host budgets.
- **Freshness** via change-rate-based recrawls and conditional GETs; durable frontier + checkpoints for crash recovery.
:::
