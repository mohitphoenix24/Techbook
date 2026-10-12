---
title: Design Yelp (Proximity Service)
level: intermediate
time: 45
summary: "Find restaurants near me" for static places — a read-heavy service where the location index is built from a business database, geohash in the database vs an in-memory quadtree on search servers, adaptive radius, ranking and filters, replication instead of sharding, caching popular areas, and propagating business updates.
---

:::problem Design Yelp {level=medium tags="HLD,geospatial,read-heavy,quadtree"}
Design the "nearby" feature of an app like Yelp or Google Maps: given a user's location (and optional filters like "pizza, open now"), return the best matching businesses within a radius, with details, photos and reviews. **200 M businesses**, **100K searches per second** at peak. Business owners can add or update their listings; changes may take a few minutes to appear.

:::hint Hint
Compare this to Uber: places barely move, so the index can be **rebuilt or updated in batches** and replicated everywhere; the read path is everything. Pick a spatial index (geohash in a DB, or a quadtree in memory), handle dense vs sparse areas, and separate the search index from the business details.
:::
:::

## 1. Requirements

**Functional**: search by location + radius (or "best within reach") with filters (category, open now, price, rating); business details, photos, reviews; owners add/update/delete businesses.

**Non-functional**
- **Very read-heavy** (searches ≫ business updates); search latency < 200 ms.
- Highly available; business updates can be **eventually consistent** (minutes).
- 200 M businesses worldwide, 100K QPS peak.

## 2. Estimates

:::derive Sizing the index
200\text{M} \times (8\,\text{B id} + 16\,\text{B lat/lng} + 40\,\text{B filters}) \approx 13\,\text{GB} || the search index only
\text{quadtree nodes} \approx 200\text{M} / 50 \text{ per leaf} = 4\text{M leaves} || small overhead
!\text{one server holds the whole index in RAM; replicate for 100K QPS} || e.g. 30 replicas × ~4K QPS
:::

**Conclusions:** the **index fits in memory** on one machine, so no need to shard it: **replicate** it for throughput and availability (shard by region only if the index grows much larger). Business details (descriptions, photos, reviews) are much larger and live in a separate store with a cache.

## 3. API

```text
GET /v1/search?lat=37.77&lng=-122.42&radius=2km&q=pizza&open_now=true&limit=20&cursor=…
    → {results: [{businessId, name, distance, rating, priceLevel, thumbnailUrl}], nextCursor}
GET /v1/businesses/{id}                 → details (cached)
POST/PUT/DELETE /v1/businesses/{id}     → owner updates (async to the index)
```

## 4. High-level design

```viz algo=arch title="Proximity service" dir=down
user     Users [mobile] @0,0.5
lb       Load balancer [lb] @1,0.5
search   Location search | in-memory quadtree replicas [search*3] @2,0
biz      Business service | details, owners [service*2] @2,1.4
cache    Details cache [cache] @3,2
db       Business DB | primary + replicas [sql] @3,1
cdc      Change stream [stream] @4,1
build    Index builder | snapshots [worker] @4,0
owner    Business owners [users] @1,1.9
--
user -> lb
lb -> search : search near me
lb -> biz : details
biz -> cache
biz -> db
owner -> biz : update listing
db ~> cdc : changes
cdc ~> build
build ~> search : new snapshot / deltas
--
flow Search near me
user > lb : GET /search?lat=…&lng=…&q=pizza&radius=2km
lb > search : Any search replica: walk the quadtree to the cells overlapping the circle, filter by category/open-now, rank by distance + rating + relevance, return 20 ids.
lb > biz : The client (or an aggregation layer) fetches details for those ids…
biz > cache : …mostly from the cache (popular businesses are read constantly).
flow Owner updates a listing
owner > biz : An owner changes opening hours.
biz > db : The business DB is updated (source of truth).
db > cdc : The change is captured (CDC)…
cdc > build : …and applied as a delta to the index, or picked up by the next nightly rebuild.
build > search : Replicas load the new snapshot or apply deltas; changes appear within minutes.
```

## 5. Deep dives

### A. Choosing the spatial index

| Option | How | Fits when |
|---|---|---|
| **Geohash column** in SQL/NoSQL | index a geohash string; query the user's cell + 8 neighbours, filter by exact distance | simple; good when the DB already scales; fixed cell size is the weakness |
| **Quadtree in memory** | built at startup from the DB; leaves split above K places | adapts to density (downtown vs countryside); great for k-nearest |
| **Search engine** (Elasticsearch `geo_point`) | geo filter + full-text + ranking in one query | when text search and facets matter as much as distance |
| **PostGIS** (R-tree/GiST) | spatial SQL | rich polygons, moderate QPS |

For an interview, the **in-memory quadtree on replicated search servers** (or geohash + Elasticsearch) is a solid answer. A quadtree adapts to density, which matters a lot here:

```js run title="A quadtree over 200,000 places: cells adapt to density"
// A quadtree over businesses: leaves split when they hold more than K places, so dense areas get small cells
const K = 50;
class QuadNode {
  constructor(x0, y0, x1, y1, depth = 0) { Object.assign(this, { x0, y0, x1, y1, depth, points: [], kids: null }); }
  insert(p) {
    if (this.kids) return this.child(p).insert(p);
    this.points.push(p);
    if (this.points.length > K && this.depth < 16) {      // split into NW, NE, SW, SE and push points down
      const mx = (this.x0 + this.x1) / 2, my = (this.y0 + this.y1) / 2, d = this.depth + 1;
      this.kids = [new QuadNode(this.x0, my, mx, this.y1, d), new QuadNode(mx, my, this.x1, this.y1, d),
                   new QuadNode(this.x0, this.y0, mx, my, d), new QuadNode(mx, this.y0, this.x1, my, d)];
      for (const q of this.points) this.child(q).insert(q);
      this.points = [];
    }
  }
  child(p) {
    const mx = (this.x0 + this.x1) / 2, my = (this.y0 + this.y1) / 2;
    return this.kids[(p.y >= my ? 0 : 2) + (p.x >= mx ? 1 : 0)];
  }
  radius(cx, cy, r, out, stats) {                          // visit only nodes whose box touches the circle
    const dx = Math.max(this.x0 - cx, 0, cx - this.x1), dy = Math.max(this.y0 - cy, 0, cy - this.y1);
    if (dx * dx + dy * dy > r * r) return;
    stats.nodes++;
    if (this.kids) { for (const k of this.kids) k.radius(cx, cy, r, out, stats); return; }
    for (const p of this.points) { stats.checked++; if ((p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r) out.push(p); }
  }
  leaves(acc = []) { if (this.kids) this.kids.forEach((k) => k.leaves(acc)); else acc.push(this); return acc; }
}

// 200,000 businesses in a 100 km × 100 km region: a dense downtown, a few suburbs, sparse countryside
let seed = 8;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const centres = [[50, 50, 3, 0.5], [30, 70, 4, 0.2], [72, 35, 4, 0.2], [50, 50, 30, 0.1]];
const tree = new QuadNode(0, 0, 100, 100);
const all = [];
while (all.length < 200_000) {
  let u = rand(); const c = centres.find((c) => (u -= c[3]) < 0) || centres[3];
  const p = { id: all.length, x: c[0] + gauss() * c[2], y: c[1] + gauss() * c[2] };
  if (p.x < 0 || p.x >= 100 || p.y < 0 || p.y >= 100) continue;   // outside the region: draw again
  all.push(p); tree.insert(p);
}
const leaves = tree.leaves();
const size = (n) => (n.x1 - n.x0) * 1000;
console.log(`${leaves.length} leaves; smallest cell ${Math.min(...leaves.map(size)).toFixed(0)} m wide (downtown), largest ${(Math.max(...leaves.map(size)) / 1000).toFixed(1)} km (countryside)`);

for (const [where, x, y] of [["downtown", 50.2, 49.7], ["countryside", 90, 10]]) {
  for (const r of [0.5, 5]) {
    const out = [], stats = { nodes: 0, checked: 0 };
    tree.radius(x, y, r, out, stats);
    const brute = all.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r).length;
    console.log(`${where.padEnd(11)} r=${String(r).padEnd(3)}km: ${String(out.length).padStart(6)} results (scan agrees: ${out.length === brute}), checked ${stats.checked.toLocaleString()} of 200,000 points`);
  }
}
```

The search touches only the cells near the user: about 2K points checked downtown and a few hundred in the countryside, instead of 200K for a full scan.

### B. Adaptive radius and ranking

A fixed radius fails at both ends: 5 km downtown matches 76,000 places, and in the countryside 500 m matches nothing. Better: **expand the search** (ring by ring, or by walking up the quadtree) until enough **candidates** are found (say 200), then **rank** them by a mix of distance, rating, relevance to the query, open-now and personalisation, and return the top 20 with a cursor.

### C. Updates and freshness

Businesses change rarely, so the index is **rebuilt** (e.g. nightly) from the database and **patched** with deltas from a change stream (CDC). Each server can build its tree at startup in minutes, or load a prebuilt snapshot. New listings appearing a few minutes late is acceptable; that's what makes replication of a full in-memory index easy.

### D. Scaling reads

- **Replicate** search servers (stateless apart from the read-only index) behind a load balancer; add replicas per region.
- **Cache** results for popular areas and queries (geohash cell + query + filters as the key, short TTL), and business details (high hit rate).
- If the index ever outgrows one machine, **shard by region** (continent/country), with users routed to their region's shard.

## 6. Wrap-up

A read-only **spatial index** (quadtree or geohash) of business ids and filter attributes, **replicated** in memory on search servers; **adaptive radius** + **ranking**; business details in a separate DB with a cache; owner updates flow DB → CDC → index deltas / nightly rebuild. Monitor search latency, result counts (empty-result rate), index freshness, and cache hit rates.

```quiz
? The search index is ~13 GB. How do you handle 100K QPS?
+ Keep the whole index in memory on many replicated search servers; sharding isn't needed at this size
- Shard into 100 pieces
- Query the primary database directly
> Read-heavy + small index → replicate.

? Why does a quadtree suit business search better than a fixed geohash grid?
+ Its cells adapt to density: small cells downtown, large cells in sparse areas, so searches examine a similar number of points everywhere
- It uses less memory than any other structure
- It doesn't need distance calculations
> Fixed cells are either too crowded downtown or too empty in the countryside.

? Why is a fixed search radius a poor default?
+ It returns far too many results in dense areas and none in sparse ones; expanding until enough candidates are found works better
- Radii are hard to compute
- Users never move
> Find candidates adaptively, then rank.
```

:::keypoints
- Static places → **read-heavy**: build the spatial index from the business DB and **replicate** it in memory; separate details (cached) from the index.
- **Quadtree** (adapts to density) or **geohash** (DB-friendly) or a search engine with geo filters.
- **Adaptive radius** to get enough candidates, then **rank** by distance, rating, relevance and filters.
- Updates via **CDC deltas + periodic rebuilds**; minutes of staleness are fine.
- Cache popular areas and details; shard by region only if the index outgrows one machine.
:::
