---
title: Design Uber (Ride Hailing)
level: advanced
time: 55
summary: The HLD counterpart of the ride-sharing LLD — ingesting millions of driver locations per minute, an in-memory geospatial index sharded by city and cell, matching and dispatch with offers and atomic reservations, the trip state machine on a strongly consistent store, live location to riders over WebSockets, ETAs, surge pricing from supply/demand streams, and payments after the ride.
---

:::problem Design Uber {level=hard tags="HLD,geospatial,real-time,consistency"}
Design a ride-hailing service like Uber or Lyft: riders request a ride and are matched with a nearby driver within seconds; both see each other's live location; the fare is computed (with surge pricing) and charged after the trip. **5 M active drivers** at peak, **20 M trips per day**.

:::hint Hint
Two very different data problems: a flood of **ephemeral** location updates (only the latest one matters, so keep them in memory, indexed by cell), and **trips** (must never be double-assigned or lost: a strongly consistent store and a state machine). Matching connects them: find candidates in the index, then **atomically** reserve one driver.
:::
:::

The object model (Rider, Driver, Trip, strategies for matching and pricing) is covered in the ride-sharing **LLD** lesson; this is the distributed system around it.

## 1. Requirements

**Functional**: riders see nearby cars and an ETA/price estimate; request a ride; match to a driver who accepts; live tracking for both; trip lifecycle (accepted → arrived → in progress → completed/cancelled); fare with surge; payment; ratings.

**Non-functional**
- **Matching in seconds**; location updates visible within ~1–2 s.
- **Never double-assign** a driver or lose a trip (consistency for trips and payments).
- Highly available per city; degrade gracefully (location staleness is fine, trip loss is not).
- Scale: millions of location updates per minute.

## 2. Estimates

:::derive Location traffic
5 \times 10^6\ \text{drivers} / 4\,\text{s} = 1.25 \times 10^6\ \text{updates/s} || each app reports every ~4 s
\text{payload} \approx 100\,\text{B} \Rightarrow 125\,\text{MB/s ingest} ||
\text{live state} = 5 \times 10^6 \times 200\,\text{B} = 1\,\text{GB} || fits in memory, sharded by city
!\text{trips} = 2 \times 10^7/\text{day} \approx 230/\text{s} \;(\text{peak} \sim 1{,}000/\text{s}) || small, but must be correct
:::

**Conclusions:** location writes are huge but **ephemeral**: don't put them in a disk database on the hot path; keep the latest position **in memory**, partitioned geographically, and stream history to cheap storage asynchronously. Trips are few and need **strong consistency**.

## 3. API

```text
Driver app (WebSocket):  → location {lat, lng, heading, ts}      ← offer {tripId, pickup, expiresIn: 15s}
                         → accept/decline {tripId}                → status {arrived | started | completed}
Rider app:   POST /v1/trips/estimate {pickup, dropoff}  → {price, surge, eta}
             POST /v1/trips {pickup, dropoff, estimateId, idempotencyKey}  → {tripId, status: matching}
             WebSocket ← trip updates, driver location
```

## 4. High-level design

```viz algo=arch title="Ride hailing" dir=down
driver   Driver app [mobile] @0,0
rider    Rider app [mobile] @0,2
gw       WebSocket gateways [gateway*2] @1,0
api      API gateway [gateway] @1,2
loc      Location service | in-memory geo index per city [map*3] @2,0
match    Matching / dispatch [service*2] @2,1
trips    Trip service | state machine [service*2] @2,2
tdb      Trips DB | strongly consistent [sql] @3,2
stream   Location stream [stream] @3,0
price    Pricing + surge [service] @3,1
pay      Payments [pay] @4,2
--
driver -> gw : location every 4 s
gw -> loc
loc ~> stream : history, ETA, surge
rider -> api : request ride
api -> trips
trips -> match : find driver
match -> loc : nearest available
match -> gw : offer to driver
trips -> tdb
stream ~> price : supply/demand
trips ~> pay : on completion
--
flow Request and match
rider > api : The rider requests a ride (with the price estimate id and an idempotency key).
api > trips : The trip service creates trip T (status: matching) in the consistent trips DB.
trips > match : Dispatch is asked to find a driver for T.
match > loc : The location service of this city returns the nearest available drivers by ETA (cell ring search).
match > gw : Atomically reserve the best driver (available → offered) and send an offer; it expires in 15 s.
gw > driver : The driver accepts → trip T: accepted, driver: on_trip (one transaction). On decline/timeout: release and try the next candidate.
flow Live tracking
driver > gw : The driver keeps sending locations…
gw > loc : …which update the index and are forwarded to the rider's connection (via the trip's channel).
loc > stream : History is streamed asynchronously for ETAs, surge, fraud and receipts.
```

## 5. Deep dives

### A. The geospatial index

Each city (or region) is a **shard**; within it, an in-memory index from **cell** (geohash/H3/S2) to drivers. Updates move a driver between cells; queries search the rider's cell and expanding **rings** around it. Drivers whose app stops reporting are evicted after ~15 s. Shards are replicated (a replica can rebuild state from the next few seconds of updates anyway).

```js run title="A city shard's driver index: ring search, stale eviction, atomic reservation"
// The in-memory driver index of one city shard: a grid of ~1 km cells (H3 hexagons in production)
const CELL = 0.01;                                         // degrees ≈ 1.1 km
const cellOf = (lat, lng) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180));

class DriverIndex {
  cells = new Map();                                       // cell → Set(driverId)
  drivers = new Map();                                     // driverId → { lat, lng, cell, seen, status }
  update(id, lat, lng, now) {                              // every ~4 s from each driver app
    const d = this.drivers.get(id) || { status: "available" };
    const cell = cellOf(lat, lng);
    if (d.cell !== cell) {                                 // moved to another cell: re-index
      this.cells.get(d.cell)?.delete(id);
      if (!this.cells.has(cell)) this.cells.set(cell, new Set());
      this.cells.get(cell).add(id);
    }
    this.drivers.set(id, { ...d, lat, lng, cell, seen: now });
  }
  nearest(lat, lng, k, now) {                              // search rings of cells outward until we have enough
    const [r0, c0] = cellOf(lat, lng).split(":").map(Number), found = [];
    let stopAt = 5;
    for (let ring = 0; ring <= stopAt; ring++) {
      if (found.length >= k && stopAt === 5) stopAt = ring;   // one more ring: a closer driver may sit just across a cell edge
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;   // only the new ring
        for (const id of this.cells.get(`${r0 + dr}:${c0 + dc}`) || []) {
          const d = this.drivers.get(id);
          if (now - d.seen > 15_000) { this.cells.get(d.cell).delete(id); this.drivers.delete(id); continue; }  // stale: app died
          if (d.status === "available") found.push({ id, km: km({ lat, lng }, d) });
        }
      }
    }
    return found.sort((a, b) => a.km - b.km).slice(0, k);
  }
  reserve(id) {                                            // atomic compare-and-set: available → offered
    const d = this.drivers.get(id);
    if (!d || d.status !== "available") return false;
    d.status = "offered"; return true;
  }
}

let seed = 4;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const idx = new DriverIndex();
for (let i = 0; i < 2000; i++) idx.update(`d${i}`, 37.70 + rand() * 0.12, -122.50 + rand() * 0.12, 0);
idx.update("d7", 37.7752, -122.4189, -20_000);            // d7's app last reported 20 s ago

const now = 1000;
const rider = { lat: 37.7750, lng: -122.4183 };
const cands = idx.nearest(rider.lat, rider.lng, 3, now);
console.log("nearest available:", cands.map((c) => `${c.id} (${c.km.toFixed(2)} km)`).join(", "), "| d7 evicted as stale:", !idx.drivers.has("d7"));

// Two riders' matchers race for the same best driver: only one reservation succeeds
const best = cands[0].id;
console.log(`matcher A reserves ${best}:`, idx.reserve(best));
console.log(`matcher B reserves ${best}:`, idx.reserve(best), "→ B offers the next candidate:", cands[1].id, idx.reserve(cands[1].id));
console.log(`drivers indexed: ${idx.drivers.size}, cells used: ${idx.cells.size}`);
```

Note the "one more ring" rule: a driver in the next ring can be closer than one in the corner of the current ring. Production systems rank candidates by **road ETA** (from a routing engine), not straight-line distance.

### B. Dispatch without double-assignment

Several matchers may pick the same best driver for different riders. A **compare-and-set** on the driver's status (`available → offered`) in the index (or a short-lived lock with a TTL in Redis) guarantees only one offer at a time. The offer has a **timeout**; on decline or timeout, the reservation is released and the next candidate is tried. Acceptance updates the trip and driver status **together** (one transaction in the trips DB). Some systems batch requests for a second and solve a small **assignment problem** across many riders and drivers for better global efficiency.

### C. Trips: consistency and the state machine

Trips move through `requested → matching → accepted → arriving → in_progress → completed | cancelled`. Every transition is a **conditional update** (`UPDATE … WHERE status = 'accepted'`), so concurrent events (rider cancels while driver accepts) resolve deterministically. The trips DB is a **strongly consistent**, replicated store (sharded SQL or Spanner-like); trip events go to a stream for receipts, analytics and payments.

### D. Surge pricing and ETAs

The location stream and request stream feed a **stream processor** that computes supply (available drivers) and demand (requests) per cell every minute; the ratio sets a **surge multiplier**, smoothed over time and neighbouring cells. ETAs come from a routing engine over the road graph, with live traffic from the same location stream.

### E. Reliability

- **Per-city isolation**: a city's location and matching shards fail independently.
- **Idempotent** ride requests (no duplicate trips on retries).
- WebSocket gateways are stateless apart from connections; clients reconnect and resubscribe.
- **Payments** are asynchronous after completion (authorise at request, capture at the end), via the payment system's idempotent APIs.

## 6. Wrap-up

Driver apps stream locations over WebSockets → **in-memory geo index sharded by city**, stale entries evicted; history streamed for ETAs and surge. Ride requests create trips in a **strongly consistent** store; **dispatch** searches the index, **atomically reserves** a driver, sends an offer with a timeout, and commits acceptance transactionally. Monitor time-to-match, offer acceptance rates, location lag, index shard load, and trip state anomalies.

```quiz
? Why keep driver locations in memory rather than writing every update to a database?
+ Updates are huge in volume but ephemeral (only the latest matters), so an in-memory index is fast and cheap; history is streamed asynchronously
- Databases can't store coordinates
- Locations must never be persisted
> Ephemeral, high-rate data → memory; durable, low-rate data → consistent DB.

? Two matchers choose the same driver for two riders at the same moment. What prevents a double assignment?
+ An atomic compare-and-set on the driver's status (available → offered), so only one reservation succeeds
- The driver declines one manually
- Matching runs on a single thread worldwide
> Reserve atomically, offer with a timeout, release on decline.

? Which data needs strong consistency in this design?
+ Trips and driver assignment (and payments), not the stream of location updates
- Location updates
- Surge multipliers
> Choose consistency per data type.
```

:::keypoints
- **Locations**: ~1 M updates/s, ephemeral → **in-memory geo index** (cells + ring search) **sharded by city**, stale eviction, history to a stream.
- **Dispatch**: candidates by ETA → **atomic reservation** (CAS / lock with TTL) → offer with timeout → transactional accept.
- **Trips**: state machine with **conditional updates** in a strongly consistent store; idempotent requests.
- **Surge** and **ETAs** from stream processing of supply/demand and live traffic; payments asynchronous.
- Isolate failures **per city**; WebSockets for live updates.
:::
