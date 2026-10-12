---
title: Design Search Autocomplete (Typeahead)
level: intermediate
time: 45
summary: Suggestions on every keystroke for billions of queries a day — a trie with precomputed top-k completions at each node, building it offline from query logs, serving immutable snapshots from memory, sharding by prefix, caching at the browser and CDN, freshness for trending queries, filtering and personalisation.
---

:::problem Design Search Autocomplete {level=medium tags="HLD,trie,caching,top-k"}
As a user types in a search box, show the **5 most popular queries** that start with what they've typed so far. Google-scale: **5 billion searches per day**, suggestions must appear within **100 ms**, and trending topics should show up within minutes.

:::hint Hint
A lookup must be ~O(length of the prefix), so precompute the answers: a trie where each node already stores its top-5 completions. Build it offline from the query logs; serve it read-only from memory. Every keystroke is a request, so caching matters as much as the data structure.
:::
:::

## 1. Requirements

**Functional**
- Given a prefix, return the top 5 completions ranked by popularity (later: personalisation, freshness).
- Only from the start of a query (prefix match); lowercase, normalised; offensive and unsafe suggestions removed.

**Non-functional**
- **Fast**: < 100 ms end to end, so the server itself in a few ms.
- **Highly available**; slightly stale suggestions are fine (popularity changes slowly, except trending events).
- **Scale**: 5 B searches/day, each producing several keystroke requests.

## 2. Estimates

:::derive Load
5 \times 10^9\ \text{searches} \times 6\ \text{requests} / 10^5\,\text{s} \approx 3 \times 10^5\ \text{QPS} \;(\text{peak} \sim 6 \times 10^5) || ~6 keystrokes per search after debouncing
\text{distinct popular queries} \approx 10^8,\ \text{avg 20 chars} || keep only queries above a count threshold
!\text{trie} \approx \text{a few GB to tens of GB with top-5 lists} || fits in memory per shard
:::

**Conclusions:** a very high QPS of tiny, **read-only** lookups: serve from **memory**, cache aggressively, and precompute rankings offline. Writes are not per-request: the data is rebuilt from logs.

## 3. API

```text
GET /v1/suggest?q=sys&lang=en&limit=5     → ["system design", "system design interview", "systemd", ...]
Cache-Control: public, max-age=300         (identical for every user with the same prefix, when not personalised)
```

## 4. High-level design

Two separate paths: an **offline/streaming data pipeline** that builds the trie, and an **online serving** path that only reads it.

```viz algo=arch title="Typeahead: build offline, serve from memory"
user     Browser | debounced requests [browser]
cdn      CDN / edge cache [cdn]
lb       Load balancer [lb]
sug      Suggestion servers | trie in memory [service*3]
logs     Query logs [stream]
agg      Aggregator | counts per query per week [worker]
trend    Trending counter | last 15 min [worker]
builder  Trie builder | top-k per node [worker]
snap     Trie snapshots | versioned [storage]
--
user -> cdn : q=sys
cdn -> lb : miss
lb -> sug
user ~> logs : searches
logs ~> agg
logs ~> trend
agg -> builder
trend -> builder
builder -> snap : serialised trie
snap -> sug : load new version
--
flow A keystroke
user > cdn : The user types "sys" (the client waited 50 ms after the last keystroke).
cdn > lb : Popular prefixes are answered at the edge; this one misses.
lb > sug : Route to the shard owning prefix "sy"; walk 3 nodes in the in-memory trie, return the precomputed top-5.
flow Rebuilding
user > logs : Every completed search is logged.
logs > agg : Batch job: counts per normalised query over the last weeks (with decay), drop rare and filtered queries.
logs > trend : Streaming job: counts in the last 15 minutes catch sudden spikes.
agg > builder : Build a fresh trie with top-k lists from both inputs.
builder > snap : Write an immutable, versioned snapshot.
snap > sug : Servers load the new version in the background and swap atomically.
```

## 5. Deep dives

### A. The data structure: a trie with top-k at every node

Without precomputation, answering "sy" means walking the entire subtree under "sy" (possibly millions of queries) and sorting: far too slow. Instead, every node stores the **top-k** completions of its subtree. A lookup walks `len(prefix)` nodes and returns a ready list. The cost is memory (k entries per node, usually as pointers/ids) and rebuild work, both acceptable.

```js run title="A trie with precomputed top-k completions"
// A trie where every node stores its top-k completions, so a lookup is O(prefix length)
const K = 3;
class Node { children = new Map(); top = []; }        // top: [{ q, n }] sorted by count desc

function build(counts) {
  const root = new Node();
  let nodes = 1;
  for (const [q, n] of Object.entries(counts)) {
    let cur = root;
    const path = [root];
    for (const ch of q) {
      if (!cur.children.has(ch)) { cur.children.set(ch, new Node()); nodes++; }
      cur = cur.children.get(ch); path.push(cur);
    }
    for (const node of path) {                          // offer the query to every prefix node on its path
      node.top.push({ q, n });
      node.top.sort((a, b) => b.n - a.n || a.q.localeCompare(b.q));
      if (node.top.length > K) node.top.pop();
    }
  }
  return { root, nodes };
}
function suggest(root, prefix) {
  let cur = root;
  for (const ch of prefix.toLowerCase()) { cur = cur.children.get(ch); if (!cur) return []; }
  return cur.top.map((t) => t.q);
}

// Weekly aggregated query counts (from the query logs)
const counts = {
  "system design": 9200, "system design interview": 7100, "systemd": 2300, "system of a down": 4100,
  "sydney weather": 6800, "sydney opera house": 3900, "syntax error": 1500, "symbolab": 5200,
  "spotify": 15000, "spiderman": 8800, "speed test": 12000, "sports news": 6100,
};
let { root, nodes } = build(counts);
console.log(`${Object.keys(counts).length} queries → trie with ${nodes} nodes, top-${K} stored at each`);
for (const p of ["s", "sy", "sys", "syd", "sp", "spi", "xyz"]) console.log(`  "${p}"`.padEnd(8), "→", suggest(root, p).join(" | ") || "(none)");

// A breaking event: real-time counts from the stream are merged into the next snapshot
counts["sydney fireworks"] = 25000;
({ root } = build(counts));
console.log('after a trending event, "sy" →', suggest(root, "sy").join(" | "));
```

Optimisations: compress chains of single-child nodes (a **radix tree**); store query ids instead of strings; cap the depth (prefixes longer than ~20–30 characters are rare; fall back to search); and store the trie as a compact, memory-mappable snapshot.

### B. Building and updating

Updating counts in the live trie on every search would turn a read-only, lock-free structure into a write-heavy one. Instead:
- **Batch**: aggregate the query logs (e.g. daily, weighted towards recent weeks), filter, and rebuild the trie.
- **Trending**: a streaming job counts queries in short windows (with a Count-Min Sketch + heap for heavy hitters) and feeds rising queries into a small "fresh" layer that is merged with the main results at query time, or into a more frequent rebuild.
- **Deploy** snapshots with versioning: servers load the new snapshot and swap a pointer; roll back if quality metrics drop.

### C. Sharding

One trie may not fit one machine, and QPS needs many replicas. Shard by **prefix range** (a–c, d–f, …), but ranges are very uneven (far more queries start with "s" than "x"), so split by **measured load** (e.g. "sa–sh", "si–sz") using the query statistics; a small routing table maps a prefix to its shard. Each shard is **replicated** for QPS and availability.

### D. Caching at every level

- **Client**: debounce (~50 ms), cache results per prefix within the session, and reuse "sys" results to filter "syst" locally when possible.
- **CDN / browser HTTP cache**: non-personalised suggestions for a prefix are the same for everyone: `Cache-Control: max-age` of minutes. Short prefixes (1–2 characters) are a tiny set and get near-100% hit rates.
- **Server**: the trie is already in memory; a small hot-prefix cache avoids even the walk.

### E. Quality and safety

Filter offensive, violent and personal-data queries at **build time** (blocklists + classifiers), with an emergency override list checked at serve time. **Personalisation** (recent searches of this user, location, language) is merged at serve time from a small per-user store, which reduces the cacheability of those responses. Support typo tolerance via a separate fuzzy index if required.

## 6. Wrap-up

Query logs → batch **aggregation** + **streaming trending counts** → **trie builder** (top-k per node, filtered) → versioned **snapshots** → in-memory **suggestion servers**, sharded by load-balanced prefix ranges and replicated → CDN and client caching with debouncing. Monitor latency, cache hit rates, snapshot age, suggestion click-through rate, and filter misses.

```quiz
? Why store the top-k completions at every trie node?
+ A lookup then only walks the prefix's nodes and returns a precomputed list, instead of searching and sorting a huge subtree
- It reduces memory use
- Tries can't be traversed otherwise
> Precompute at build time to make the hot path trivial.

? Why rebuild the trie from logs instead of updating counts on every search?
+ It keeps the serving structure read-only (lock-free, cache-friendly, easy to replicate) and moves heavy aggregation offline
- Searches can't be counted in real time
- Tries don't support updates
> Trending queries are handled by a separate streaming path.

? Sharding by first letter leads to hot shards. What's better?
+ Split prefix ranges by measured query load, with a routing table, and replicate each shard
- Shard by user id
- Use one giant server
> The query distribution across letters is very uneven.
```

:::keypoints
- Precompute: a **trie** (radix tree) with **top-k completions at each node** → lookups in O(prefix length).
- **Build offline** from query logs (aggregation, decay, filtering) plus a **streaming trending** path; ship versioned **immutable snapshots**; serve from memory.
- Shard by **load-balanced prefix ranges**, replicate for QPS.
- Cache everywhere: client debouncing and caching, CDN with `max-age` for non-personalised prefixes, hot-prefix caches.
- Filter unsafe suggestions at build time; merge personalisation at serve time.
:::
