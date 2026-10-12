---
title: Design Ticketmaster (Ticket Booking)
level: advanced
time: 50
summary: Selling a fixed inventory to a stampede — the event/seat data model, temporary seat holds with expiry, atomic conditional updates so a seat is never sold twice, the booking and payment flow with idempotency, a virtual waiting room for on-sale spikes, caching the seat map, and search for events.
---

:::problem Design Ticketmaster {level=hard tags="HLD,contention,consistency,waiting room"}
Design a ticketing platform like Ticketmaster or BookMyShow: users browse events, view a venue's seat map, pick seats, hold them for a few minutes while paying, and receive tickets. A popular concert puts **50,000 seats** on sale while **2 million fans** arrive in the first minutes. **No seat may ever be sold twice.**

:::hint Hint
This is a **contention** problem, not a scale-of-data problem. Make the seat state change atomic (a conditional update or a lock with a TTL), introduce a **hold** state with expiry so abandoned checkouts free seats, and put a **waiting room** in front so the booking system only sees as many users as it can serve.
:::
:::

## 1. Requirements

**Functional**: search/browse events; view the seat map with availability; select seats → **hold** for ~10 minutes → pay → confirmed tickets; release seats on timeout or payment failure; general-admission (count-only) and reserved seating.

**Non-functional**
- **Strong consistency** for seat inventory: never oversell, never double-sell.
- Survive **on-sale spikes** (millions of users in minutes) without collapsing; be fair (first come, first served, bots limited).
- Browsing and the seat map can be slightly stale (seconds); booking cannot.

## 2. Estimates

:::derive The on-sale spike
2 \times 10^6\ \text{users in 10 min} \Rightarrow \sim 3{,}300\ \text{arrivals/s},\ \text{each refreshing the seat map} || bursts far above that
\text{only } 50{,}000 \text{ seats} \Rightarrow \text{at most } 50{,}000 \text{ successful checkouts} ||
!\text{the booking DB must handle a few thousand writes/s for one event: fine if access is controlled} || the problem is the herd, not the data
:::

## 3. Data model and API

```text
events   (event_id, venue_id, starts_at, on_sale_at, …)
seats    (event_id, seat_id, section, row, price_tier,
          status: free | held | sold, hold_id, held_until, version)     ← one row per seat per event
holds    (hold_id, user_id, event_id, seat_ids[], expires_at)
orders   (order_id, hold_id, user_id, amount, status, idempotency_key)

GET  /v1/events/{id}/seatmap                        → availability (cached, seconds stale)
POST /v1/events/{id}/holds {seatIds}                → 201 {holdId, expiresAt} | 409 seats taken
POST /v1/holds/{holdId}/checkout {paymentToken}     Idempotency-Key header → {orderId, tickets}
DELETE /v1/holds/{holdId}                           → release
```

## 4. High-level design

```viz algo=arch title="Ticket booking" dir=down
fans     Fans [users] @0,1
cdn      CDN | event pages [cdn] @1,0
wr       Waiting room | queue + tokens [shield] @1,1
browse   Event + search service [search] @2,0
book     Booking service | holds, checkout [service*3] @2,1
map      Seat-map cache | availability [cache] @3,0
db       Inventory DB | seats, holds, orders [sql] @3,1
pay      Payment provider [pay] @3,2
exp      Hold expiry worker [clock] @4,1
--
fans -> cdn : browse
fans -> wr : join the queue
wr -> book : admitted users only
cdn -> browse
browse -> map
book -> db : conditional updates
book -> pay : charge
db ~> map : seat changes
exp -> db : release expired holds
--
flow On-sale day
fans > wr : At 10:00, 2 M fans join the waiting room; each gets a random/arrival position and a signed token.
wr > book : The room admits users at the rate the booking service can handle (e.g. 2,000/min), each with a short-lived access token.
book > db : An admitted user selects 2 seats: UPDATE seats SET status='held', hold_id=…, held_until=now+10min WHERE seat_id IN (…) AND status='free'. Both rows updated → hold created.
book > pay : At checkout, the payment is charged with an idempotency key…
book > db : …and in one transaction: seats held by this hold → sold, order → confirmed. If the hold expired, the seats aren't sold and the payment is refunded/voided.
db > map : Changes stream to the seat-map cache, so other users see the seats disappear within seconds.
exp > db : Holds past held_until are released back to free (lazily on read, plus a sweeper).
```

## 5. Deep dives

### A. Never sell a seat twice

"Read: is it free? → write: sold" is a race: many buyers read "free" before anyone writes. The state change must be **atomic** in the database:

- **Conditional update** (optimistic): `UPDATE … SET status='held' WHERE seat_id=? AND status='free'`, and check the affected row count; or a `version` column (compare-and-set).
- **Row locks** (`SELECT … FOR UPDATE`) in a short transaction: also correct, but holds locks during the transaction.
- A **distributed lock** per seat (Redis `SET seat:X holder NX PX 600000`): fast, but the database must still enforce the final state (fencing / conditional update), since locks can expire.

```js run title="Check-then-write vs atomic holds during an on-sale stampede"
// 100 seats, 2,000 buyers arriving at once. A "database" call takes a little time (await = a network hop).
let seed = 13;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hop = async () => { for (let i = Math.floor(rand() * 20); i >= 0; i--) await null; };   // variable, deterministic delay

function makeDb() {
  const seats = new Map(Array.from({ length: 100 }, (_, i) => [i, { status: "free", holder: null, until: 0 }]));
  return {
    seats,
    async read(id) { await hop(); return { ...seats.get(id) }; },
    async write(id, v) { await hop(); seats.set(id, { ...seats.get(id), ...v }); },
    // UPDATE seats SET status='held', holder=?, until=? WHERE id=? AND (status='free' OR until < now)
    async holdIf(id, holder, now, ttl) {
      await hop();
      const s = seats.get(id);
      if (s.status === "sold" || (s.status === "held" && s.until > now)) return false;
      seats.set(id, { status: "held", holder, until: now + ttl }); return true;
    },
    async sellIf(id, holder, now) {                        // ... WHERE id=? AND status='held' AND holder=? AND until >= now
      await hop();
      const s = seats.get(id);
      if (s.status !== "held" || s.holder !== holder || s.until < now) return false;
      seats.set(id, { status: "sold", holder, until: 0 }); return true;
    },
  };
}
const wanted = () => Math.floor(Math.pow(rand(), 2) * 100);   // everyone wants the front rows

// 1) Naive: read, check, then write. Two buyers can both see "free".
{
  const db = makeDb(), sales = new Map();
  await Promise.all(Array.from({ length: 2000 }, async (_, b) => {
    const seat = wanted(), s = await db.read(seat);
    if (s.status === "free") { await db.write(seat, { status: "sold", holder: b }); sales.set(seat, (sales.get(seat) || 0) + 1); }
  }));
  const doubled = [...sales.values()].filter((n) => n > 1).length;
  console.log(`naive check-then-write: ${[...sales.values()].reduce((a, b) => a + b, 0)} tickets sold for ${sales.size} seats → ${doubled} seats sold more than once`);
}

// 2) Atomic hold with a TTL, then pay, then a conditional sale. 20% of payments fail and the hold expires.
{
  const db = makeDb();
  let sold = 0, holdsLost = 0, payFailed = 0, now = 0;
  const buyers = Array.from({ length: 2000 }, (_, b) => b);
  // the waiting room admits 200 buyers per "minute" instead of all 2,000 at once
  for (let wave = 0; wave < 10 && sold < 100; wave++, now += 60) {
    await Promise.all(buyers.slice(wave * 200, wave * 200 + 200).map(async (b) => {
      for (let attempt = 0; attempt < 3; attempt++) {     // seat taken? try another seat
        const seat = wanted();
        if (!(await db.holdIf(seat, b, now, 600))) { holdsLost++; continue; }
        if (rand() < 0.2) { payFailed++; await db.write(seat, { status: "free", holder: null }); return; }   // release on failure
        if (await db.sellIf(seat, b, now)) sold++;
        return;
      }
    }));
  }
  const soldSeats = [...db.seats.values()].filter((s) => s.status === "sold").length;
  console.log(`atomic holds: ${sold} tickets sold, ${soldSeats} seats marked sold (always equal), ${payFailed} failed payments released their seat, ${holdsLost} hold attempts lost a race`);
}
```

Holding **multiple seats** must be all-or-nothing: update them in one transaction (and in a consistent order, to avoid deadlocks), or roll back the ones you got if any is taken.

### B. Holds and expiry

A hold reserves seats without payment for a short time. Expiry is **lazy** (a hold whose `held_until` has passed counts as free in the conditional update) plus a **sweeper** that resets expired rows, so the seat map stays accurate. A Redis key with a TTL per hold is a common alternative, with the database as the final arbiter at checkout.

### C. The waiting room

Letting 2 M users hit the booking path at once causes timeouts, retries and a meltdown. A **virtual waiting room** (a queue at the edge) gives each user a position, admits them at a controlled rate with signed, short-lived tokens, and shows progress. It provides **fairness** and **back-pressure**, and it's a good place for bot detection (CAPTCHA, purchase limits per account and payment card).

### D. The seat map under load

Thousands of users refreshing the seat map would hammer the inventory DB. Serve it from a **cache** updated from the DB's change stream (or polled every second), possibly pushed to clients over WebSockets/SSE. A seat that looks free may already be held, and that's fine: the **hold request** is the moment of truth, and it fails cleanly with 409 ("someone just took it").

### E. Payments

Charge with an **idempotency key** so client retries never double-charge. Order of operations: verify the hold is still valid → charge → mark seats sold + order confirmed in one transaction; if that last step fails (hold expired during payment), **void/refund** automatically and tell the user. Reconcile with the payment provider's records daily (see the payment system case study).

## 6. Wrap-up

A **waiting room** limits concurrency; **atomic conditional updates** move seats free → held → sold; **holds expire** (lazy + sweeper); checkout charges **idempotently** then confirms seats and order **transactionally**; the **seat map** is served from a cache fed by the change stream; search and event pages are cached at the CDN. Monitor hold success/conflict rates, checkout latency, expired holds, queue length and admission rate, and payment failures.

```quiz
? Why is "SELECT status; if free then UPDATE to sold" unsafe?
+ Concurrent buyers can all read "free" before any of them writes, so the seat is sold several times
- SELECT is too slow
- UPDATE can't change status
> Make the check and the change one atomic conditional update.

? A user holds seats but closes the browser. What frees the seats?
+ The hold's expiry: expired holds count as free in conditional updates, and a sweeper resets them
- Nothing; an admin must release them
- The seats stay held until the event
> Holds are leases.

? What problem does a virtual waiting room solve?
+ It caps how many users reach the booking system at once, giving fairness and protecting it from collapse during spikes
- It prevents double-booking by itself
- It speeds up payments
> Correctness comes from atomic updates; the waiting room provides back-pressure.
```

:::keypoints
- Seat inventory needs **strong consistency**: atomic **conditional updates** (or row locks) for free → held → sold; multi-seat holds all-or-nothing.
- **Holds with expiry** (lazy check + sweeper) free abandoned seats.
- A **virtual waiting room** admits users at a sustainable rate: fairness, back-pressure, bot control.
- Seat map from a **cache** fed by changes; the hold request is the moment of truth (409 on conflict).
- Payments with **idempotency keys**; confirm seats and order in one transaction; refund if the hold expired.
:::
