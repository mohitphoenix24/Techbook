---
title: Geospatial Indexing — Geohash, Quadtrees, S2 and H3
level: advanced
time: 45
summary: How "find what's near me" works at scale — distance on a sphere (haversine), why a plain index fails, geohash (an interactive map plus C++/JS code), the edge problem and neighbour cells, quadtrees, Google S2 and Uber H3, Redis GEO and PostGIS, and the difference between indexing static places and moving drivers.
---

"Restaurants within 2 km", "the 10 nearest drivers", "friends nearby", "which delivery zone is this address in?" Location queries power ride-hailing, food delivery, maps, dating and local search, and they're the core of two classic case studies (Yelp/proximity service and Uber). The challenge: databases index **one-dimensional** values well, but locations are **two-dimensional**.

## Distance on a sphere

Latitude and longitude are angles, not flat coordinates; one degree of longitude is 111 km at the equator and 0 km at the poles. The **haversine formula** gives the great-circle distance between two points:

:::formula Haversine distance (R ≈ 6,371 km)
d = 2R \arcsin\sqrt{\sin^2\frac{\Delta\varphi}{2} + \cos\varphi_1\cos\varphi_2\sin^2\frac{\Delta\lambda}{2}}
:::

where φ is latitude and λ longitude, in radians. You'll use it to compute exact distances for the **final ranking**, after an index has narrowed the candidates.

## Why a normal index isn't enough

`WHERE lat BETWEEN a AND b AND lng BETWEEN c AND d` can use an index on `lat` **or** on `lng`, but a B-tree on one column returns a whole horizontal **strip** of the planet (every place at that latitude, worldwide), which then has to be filtered by longitude. With millions of places that's far too slow. We need a way to turn 2D proximity into something a 1D index (or a hash map) can handle.

## Geohash

:::def Geohash
A string encoding of a location made by **repeatedly halving** the world: alternately split the longitude range and the latitude range in two, recording 1 or 0 for which half the point is in, and write every 5 bits as one base-32 character. Each extra character makes the cell 32× smaller. Nearby points usually share a **common prefix**.
:::

| Length | Cell size (approx.) | Good for |
|---|---|---|
| 4 | 39 km × 20 km | city-level |
| 5 | 4.9 km × 4.9 km | neighbourhood search (a few km) |
| 6 | 1.2 km × 0.6 km | walking distance, ride pickup |
| 7 | 153 m × 153 m | street level |
| 8 | 38 m × 19 m | building |

Click around the map (a slice of Bengaluru with 160 drivers) and change the precision.

```viz algo=geohash title="Geohash cells and neighbour search"
precision = 5
```

### The edge problem

Two points can be 10 metres apart yet in **different cells** with **different prefixes**, if a cell boundary runs between them (worst case: across the equator or the prime meridian, where they share no prefix at all). So a proximity search never looks only at the cell containing the user: it searches **that cell and its 8 neighbours**, then filters by exact distance. Choose a precision whose cell size is at least the search radius, so the 3×3 block covers it.

:::tabs Geohash encoding, neighbours and haversine
```cpp run
#include <bits/stdc++.h>
using namespace std;

const string B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

string geohash(double lat, double lng, int precision) {
    double latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
    string out;
    int bit = 0, ch = 0;
    bool even = true;                                   // even bits split longitude
    while ((int)out.size() < precision) {
        double& lo = even ? lngLo : latLo;
        double& hi = even ? lngHi : latHi;
        double v = even ? lng : lat, mid = (lo + hi) / 2;
        if (v >= mid) { ch = ch * 2 + 1; lo = mid; } else { ch = ch * 2; hi = mid; }
        even = !even;
        if (++bit == 5) { out += B32[ch]; bit = ch = 0; }
    }
    return out;
}

double haversineKm(double lat1, double lng1, double lat2, double lng2) {
    auto rad = [](double d) { return d * M_PI / 180; };
    double dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    double a = pow(sin(dLat / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(dLng / 2), 2);
    return 2 * 6371 * asin(sqrt(a));
}

int main() {
    double lat = 12.9716, lng = 77.5946;               // central Bengaluru
    for (int p : {4, 5, 6, 7}) cout << "precision " << p << ": " << geohash(lat, lng, p) << "\n";

    // the 3x3 block of cells around the point, at precision 6
    int p = 6;
    double cellLng = 360 / pow(2, ceil(5.0 * p / 2)), cellLat = 180 / pow(2, floor(5.0 * p / 2));
    cout << "search cells:";
    for (int dy : {1, 0, -1}) for (int dx : {-1, 0, 1}) cout << " " << geohash(lat + dy * cellLat, lng + dx * cellLng, p);
    cout << "\n";

    struct Driver { string name; double lat, lng; };
    vector<Driver> drivers = {{"ravi", 12.9722, 77.5950}, {"meera", 12.9790, 77.6010}, {"arjun", 13.0350, 77.5970}};
    for (auto& d : drivers)
        cout << d.name << ": " << fixed << setprecision(2) << haversineKm(lat, lng, d.lat, d.lng) << " km, cell "
             << geohash(d.lat, d.lng, 6) << "\n";
}
```
```js run
const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function geohash(lat, lng, precision) {
  let latR = [-90, 90], lngR = [-180, 180], out = "", bit = 0, ch = 0, even = true;   // even bits split longitude
  while (out.length < precision) {
    const R = even ? lngR : latR, v = even ? lng : lat, mid = (R[0] + R[1]) / 2;
    if (v >= mid) { ch = ch * 2 + 1; R[0] = mid; } else { ch = ch * 2; R[1] = mid; }
    even = !even;
    if (++bit === 5) { out += B32[ch]; bit = ch = 0; }
  }
  return out;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const [lat, lng] = [12.9716, 77.5946];                 // central Bengaluru
for (const p of [4, 5, 6, 7]) console.log(`precision ${p}: ${geohash(lat, lng, p)}`);

// the 3x3 block of cells around the point, at precision 6
const p = 6, cellLng = 360 / 2 ** Math.ceil((5 * p) / 2), cellLat = 180 / 2 ** Math.floor((5 * p) / 2);
const cells = [];
for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) cells.push(geohash(lat + dy * cellLat, lng + dx * cellLng, p));
console.log("search cells:", cells.join(" "));

const drivers = [{ name: "ravi", lat: 12.9722, lng: 77.595 }, { name: "meera", lat: 12.979, lng: 77.601 }, { name: "arjun", lat: 13.035, lng: 77.597 }];
for (const d of drivers)
  console.log(`${d.name}: ${haversineKm(lat, lng, d.lat, d.lng).toFixed(2)} km, cell ${geohash(d.lat, d.lng, 6)}`);
```
:::

**Why geohash is popular:** a geohash is just a string, so it works with **any** database: a B-tree index on a `geohash` column answers "everything in cell `tdr1v`" as a prefix range scan (`WHERE geohash LIKE 'tdr1v%'`), and a key-value store can use it as a key. Redis's `GEOADD`/`GEOSEARCH` store locations in a sorted set using a 52-bit geohash as the score.

**Weaknesses:** cells are fixed size, so a dense downtown cell holds thousands of places while a rural one holds none; cells aren't the same size everywhere on Earth; and the edge problem requires neighbour lookups.

## Quadtrees

:::def Quadtree
A tree that recursively splits a square region into **four quadrants**, but only where it's **dense**: a node splits when it holds more than K points (say 100). Dense areas get deep, small cells; empty areas stay as large single cells.
:::

```viz algo=uml title="A quadtree node" legend=off
class QuadNode
  - bounds: Rect
  - points: Point[]   // ≤ K, in leaves only
  - children: QuadNode[4]   // NW, NE, SW, SE
  + insert(p): void
  + query(range): Point[]
```

To find nearby points, walk down to the leaf containing the user, then expand to neighbouring leaves until enough results are found. Quadtrees adapt to density, which makes "find the k nearest" efficient everywhere. They're typically built **in memory** on each search server (rebuilt from the database at startup, a few hundred MB for hundreds of millions of points) rather than stored in a database.

## S2 and H3

- **Google S2** projects the sphere onto the faces of a cube and orders cells along a **Hilbert curve**, so cells nearby on the curve are nearby on Earth. Each cell has a 64-bit id; any region (a circle, a delivery polygon) can be covered by a small set of cells of mixed sizes. Used by Google Maps, Foursquare, MongoDB and others.
- **Uber H3** tiles the Earth with **hexagons** at 16 resolutions. Hexagons have one useful property: all 6 neighbours are the **same distance** from the centre (squares have near and diagonal neighbours). That makes them good for movement, supply/demand heat maps and surge pricing zones.

| | Geohash | Quadtree | S2 | H3 |
|---|---|---|---|---|
| Shape | rectangles | squares (adaptive) | quadrilaterals on a cube | hexagons |
| Adapts to density | ✗ | ✓ | covers regions with mixed levels | ✗ (choose a resolution) |
| Storage | string, any DB | in-memory tree | 64-bit ids | 64-bit ids |
| Strength | simplicity, DB-friendly | k-nearest in dense areas | accurate coverage of shapes | uniform neighbours, analytics |

## Databases with geo support

- **PostgreSQL + PostGIS**: full spatial types, R-tree (GiST) indexes, distance and polygon queries. The default for complex geo data.
- **Redis GEO**: fast in-memory radius search on sorted sets; ideal for frequently updated positions.
- **Elasticsearch / OpenSearch**: `geo_point` and `geo_shape` fields combined with text search ("pizza near me").
- **MongoDB**: 2dsphere indexes (S2-based).

## Static places vs moving objects

| | Restaurants, shops, hotels (static) | Drivers, couriers, friends (moving) |
|---|---|---|
| Update rate | rarely (new place, closed place) | every ~4 seconds per object |
| Read pattern | very read-heavy: cache aggressively | match against fresh positions |
| Good structure | geohash in a DB, or a quadtree built in memory, plus a CDN/cache for popular areas | **in-memory** index keyed by geohash/H3 cell (Redis GEO or a custom grid), updated in place |
| Durability need | high (it's business data) | low for the live position (the next update comes in seconds) |

For moving objects, a write every 4 s from a million drivers is 250,000 updates per second. That rules out rebuilding trees or writing every update to a disk-based database: keep the **latest position in memory**, sharded by **region/cell**, and stream the location history separately for analytics (Uber case study).

:::interview Proximity search template
*"Places are indexed by geohash (precision 6 for ~1 km searches). A query computes the user's cell plus its 8 neighbours, fetches candidates from those 9 cells (a prefix query or Redis GEOSEARCH), then computes exact haversine distances, filters by radius and ranks. Since places rarely change, results for popular cells are cached. Moving drivers are different: their latest positions live in an in-memory index updated every few seconds, sharded by city."*
:::

```quiz
? Why does a proximity search look at the user's geohash cell AND its 8 neighbours?
+ A nearby point can sit just across a cell boundary, in a cell with a different prefix
- To make the search slower but safer
- Because geohashes are random
> The edge problem: proximity doesn't guarantee a shared prefix, so neighbouring cells must be checked.

? Going from geohash precision 5 to 6, cells become about…
- 2× smaller
+ 32× smaller in area
- 10× smaller
> Each character adds 5 bits, splitting the cell into 32.

? Why might a quadtree be better than a fixed geohash grid for "the 20 nearest restaurants"?
+ It subdivides dense areas more finely, so each leaf holds a manageable number of points everywhere
- Quadtrees don't have edge problems
- Quadtrees are stored in SQL
> Fixed cells are too crowded downtown and empty in the countryside; quadtrees adapt to density.

? A million drivers send their location every 4 seconds. Where should the live positions be kept?
- A quadtree rebuilt on every update and saved to disk
+ An in-memory geo index (e.g. Redis GEO or a cell-keyed map), sharded by region, updated in place
- An append-only table queried with full scans
> 250K updates/s of disposable data belong in memory; durability matters only for history and analytics.
```

:::keypoints
- Locations are 2D; plain B-tree indexes on lat/lng scan whole strips. Use a spatial index, then **haversine** for exact distance.
- **Geohash** encodes a cell as a string (prefix = containment); works with any DB; search the **cell + 8 neighbours** to handle edges; pick precision ≥ search radius.
- **Quadtrees** adapt to density (good for k-nearest), usually in memory. **S2** (Hilbert-ordered cells, region coverings) and **H3** (hexagons, uniform neighbours) are the industrial grids.
- Tools: **PostGIS**, **Redis GEO**, Elasticsearch geo fields, MongoDB 2dsphere.
- **Static places**: index + cache. **Moving objects**: in-memory index updated in place, sharded by region.
:::
