---
title: API Design — REST, GraphQL and gRPC
level: easy
time: 40
summary: How to design the contract between clients and your system: resource-oriented REST with the right methods and status codes, pagination (offset vs cursor), idempotency keys for safe retries, versioning and errors, then GraphQL and gRPC and when each one wins.
---

In every HLD interview, right after the requirements, you write down the **API**: the list of operations your system offers. It turns vague features ("users can post photos") into a precise contract (`POST /v1/photos`). A clean API also tells the interviewer which data you'll need to store and which operations must be fast.

:::def API (Application Programming Interface)
The contract between a client and a service: which operations exist, what inputs they take, what they return, and how errors are reported. A good API hides **how** the service works and exposes **what** it can do.
:::

## REST: resources and verbs

**REST** (Representational State Transfer) is the default style for public web APIs. The core idea: model your system as **resources** (nouns) identified by URLs, and act on them with the standard **HTTP methods** (verbs).

| Method | Meaning | Example | Safe? | Idempotent? |
|---|---|---|---|---|
| `GET` | read | `GET /users/42` | ✓ | ✓ |
| `POST` | create (or trigger an action) | `POST /users` | ✗ | ✗ |
| `PUT` | replace the whole resource | `PUT /users/42` | ✗ | ✓ |
| `PATCH` | modify part of it | `PATCH /users/42` | ✗ | ✗ (usually) |
| `DELETE` | remove | `DELETE /users/42` | ✗ | ✓ |

:::def Idempotent
An operation is idempotent if doing it **once or many times has the same effect**. `DELETE /users/42` twice leaves the user deleted. `PUT` with the same body twice leaves the same state. `POST /payments` twice creates **two** payments. That's the dangerous one.
:::

:::def Safe method
A method that doesn't change server state (`GET`, `HEAD`). Caches, crawlers and browsers assume safe methods can be repeated or prefetched freely. Never put an action like "delete" behind a GET link.
:::

### Designing endpoints

Let's design the API for a small photo-sharing app. Good REST endpoints use **plural nouns**, **nesting for ownership**, and **query parameters for filtering**:

```text
POST   /v1/photos                       upload a photo         → 201 Created + photo
GET    /v1/photos/{photoId}             one photo              → 200 + photo
DELETE /v1/photos/{photoId}             delete it              → 204 No Content
GET    /v1/users/{userId}/photos?limit=20&cursor=…   a user's photos, newest first
POST   /v1/photos/{photoId}/likes       like it                → 201 (or 200 if already liked)
DELETE /v1/photos/{photoId}/likes       unlike it              → 204
GET    /v1/feed?limit=20&cursor=…       my home feed
POST   /v1/users/{userId}/follow        follow someone
```

And a request/response pair:

```json
POST /v1/photos
Authorization: Bearer eyJhbGciOi…
Idempotency-Key: 7f9c2b1e-4d1a-4c4e-9a7e-0b5d2a1f3c88
Content-Type: application/json

{ "caption": "Sunset in Goa", "uploadId": "up_83hd" }

HTTP/1.1 201 Created
Location: /v1/photos/ph_19x7
{ "id": "ph_19x7", "caption": "Sunset in Goa", "url": "https://cdn.example.com/ph_19x7.jpg",
  "createdAt": "2026-03-14T10:22:31Z", "likes": 0 }
```

:::warn Common REST mistakes
- **Verbs in URLs**: `POST /createPhoto`, `GET /getUser?id=42`. The method is already the verb.
- **Returning `200` for errors** with `{"error": …}` in the body. Use status codes; clients, proxies and monitoring rely on them.
- **The user id in the body for "my" actions**. The authenticated user comes from the auth token. Putting `userId` in the request lets people act as someone else unless you double-check it.
- **Unbounded lists**: `GET /users/42/photos` returning 50,000 items. Always paginate.
:::

## Pagination: offset vs cursor

Any endpoint that returns a list must return it in **pages**. There are two main techniques.

:::def Offset pagination
`GET /photos?limit=20&offset=40` means "skip 40, give me the next 20". The database runs `ORDER BY created_at DESC LIMIT 20 OFFSET 40`.
:::

:::def Cursor (keyset) pagination
`GET /photos?limit=20&cursor=abc` where the cursor encodes **where the last page ended** (for example the last item's `created_at` and `id`). The database runs `WHERE (created_at, id) < (:t, :id) ORDER BY created_at DESC, id DESC LIMIT 20`.
:::

Offset is simple and lets users jump to page 37, but it has two problems at scale. The database still has to **walk past** all skipped rows, so page 10,000 is slow. And when new items arrive between requests, everything **shifts**, so users see duplicates or miss items. Cursor pagination fixes both. Watch it happen:

```js run title="Offset vs cursor pagination while new posts arrive"
// posts are sorted newest first; ids grow over time
let posts = Array.from({ length: 10 }, (_, i) => ({ id: 10 - i }));   // [10, 9, …, 1]

const byOffset = (offset, limit) => posts.slice(offset, offset + limit).map((p) => p.id);
const byCursor = (afterId, limit) =>
  posts.filter((p) => afterId == null || p.id < afterId).slice(0, limit).map((p) => p.id);

// The user loads page 1 with each method
const offsetPage1 = byOffset(0, 4);
const cursorPage1 = byCursor(null, 4);
console.log("page 1 (offset):", offsetPage1.join(", "));
console.log("page 1 (cursor):", cursorPage1.join(", "));

// Meanwhile, two new posts are published at the top
posts = [{ id: 12 }, { id: 11 }, ...posts];

// The user asks for page 2
console.log("page 2 (offset=4):", byOffset(4, 4).join(", "), " <- 10 and 9 again: duplicates!");
console.log("page 2 (cursor after", cursorPage1.at(-1) + "):", byCursor(cursorPage1.at(-1), 4).join(", "), " <- continues exactly");
```

| | Offset | Cursor |
|---|---|---|
| Jump to page N | ✓ | ✗ (only next / previous) |
| Speed on deep pages | slows down (scans skipped rows) | constant (uses the index) |
| Stable under inserts and deletes | ✗ duplicates and gaps | ✓ |
| Typical use | admin tables, search results with page numbers | feeds, timelines, infinite scroll, sync APIs |

:::tip Make cursors opaque
Return the cursor as an encoded string (for example base64 of `{"t": "...", "id": 812}`), not raw fields. Clients must treat it as a token, so you're free to change what's inside later.
:::

## Idempotency keys: retries without double charges

Remember the last lesson: when a call times out, the client can't know whether the server did the work. Retrying a `GET` or `DELETE` is harmless. Retrying `POST /payments` might charge the customer twice.

The standard fix, used by Stripe and most payment APIs, is an **idempotency key**. The client generates a unique id (a UUID) for each logical operation and sends it in a header. The server remembers the result for each key. A retry with the same key gets the **stored result** instead of doing the work again.

```viz algo=seq title="A retry with an idempotency key"
participant c Client [mobile]
participant a Payments API [service]
participant k Key store [cache]
participant b Bank [ext]
c -> a : POST /payments (key = K1) | The client generates K1 once per checkout click.
a -> k : K1 seen? no → mark "in progress"
a -> b : charge $20
b --> a : OK, charge ch_1
a -> k : store K1 → 201 {charge: ch_1}
a -x c : 201 Created | The response is lost on a flaky mobile network.
note c : timeout → retry with the SAME key
c -> a : POST /payments (key = K1)
a -> k : K1 seen? yes → stored result
a --> c : 201 {charge: ch_1} | Same answer, and the bank is not called again.
```

:::tabs An idempotent endpoint
```js run
// Server side: remember the outcome of every idempotency key (in production: Redis or a DB table with a TTL)
const results = new Map();
let charges = 0;

function createPayment(idempotencyKey, amount) {
  if (results.has(idempotencyKey)) {
    return { ...results.get(idempotencyKey), replayed: true };   // same answer, no new work
  }
  charges++;                                                   // the real side effect
  const response = { status: 201, chargeId: `ch_${charges}`, amount };
  results.set(idempotencyKey, response);
  return response;
}

const key = crypto.randomUUID();           // generated once per user action
console.log(createPayment(key, 20));
console.log(createPayment(key, 20));       // network retry
console.log(createPayment(key, 20));       // user double-clicked
console.log(createPayment(crypto.randomUUID(), 20));   // a genuinely new payment
console.log("cards charged:", charges);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Response { int status; string chargeId; int amount; bool replayed = false; };

// Server side: remember the outcome of every idempotency key
unordered_map<string, Response> results;   // production: Redis / DB table with a TTL
int charges = 0;

Response createPayment(const string& idempotencyKey, int amount) {
    if (auto it = results.find(idempotencyKey); it != results.end()) {
        Response r = it->second;
        r.replayed = true;                  // same answer, no new work
        return r;
    }
    ++charges;                              // the real side effect
    Response r{201, "ch_" + to_string(charges), amount};
    results[idempotencyKey] = r;
    return r;
}

void print(const Response& r) {
    cout << "{ status: " << r.status << ", chargeId: " << r.chargeId
         << ", amount: " << r.amount << (r.replayed ? ", replayed: true" : "") << " }\n";
}

int main() {
    string key = "7f9c2b1e-4d1a";           // generated once per user action
    print(createPayment(key, 20));
    print(createPayment(key, 20));          // network retry
    print(createPayment(key, 20));          // user double-clicked
    print(createPayment("a51c-new-key", 20)); // a genuinely new payment
    cout << "cards charged: " << charges << "\n";
}
```
:::

:::edge Details that make idempotency keys correct
- **Concurrent duplicates.** Two retries arrive at the same moment. Mark the key "in progress" atomically first (Redis `SET key value NX`, or a unique-constraint insert) so only one request does the work.
- **Same key, different body.** Reject it with `422` or `409`. It signals a client bug.
- **Expiry.** Keep keys for a bounded time (Stripe keeps them 24 hours) so the store doesn't grow forever.
- **Store the key with the side effect** in the same database transaction when you can. Otherwise a crash between "charge" and "remember" re-opens the window.
:::

## Versioning, errors and other conventions

- **Versioning.** Put a version in the path (`/v1/…`) or a header. Never break existing clients: add optional fields freely, and introduce `/v2` for breaking changes. Mobile apps stay installed for years.
- **Consistent errors.** One shape for every error, with a machine-readable code:

```json
HTTP/1.1 409 Conflict
{ "error": { "code": "SEAT_ALREADY_BOOKED", "message": "Seat 14C was booked by someone else.", "requestId": "req_9Hk2" } }
```

- **Authentication** in a header (`Authorization: Bearer <token>`), never in the URL, because URLs end up in logs and browser history.
- **Rate limit headers**: `429 Too Many Requests` plus `Retry-After`. Covered in the rate limiting lesson.
- **Timestamps** in UTC, ISO 8601. **Money** as integer minor units (`amount: 2000, currency: "INR"`), never floats.
- **Long-running work** returns `202 Accepted` with a job URL to poll (`GET /v1/jobs/{id}`) or a webhook, instead of holding the connection open.

## GraphQL

REST has two classic pain points for complex front-ends:

- **Over-fetching**: `GET /users/42` returns 40 fields when the screen needs 3.
- **Under-fetching**: a profile screen needs the user, their latest 10 posts, and each post's like count. That's 1 + 1 + 10 requests, the "N+1 requests" problem.

:::def GraphQL
A query language for APIs (from Facebook, 2015). There's **one endpoint**, and the client sends a query describing **exactly the shape of data it wants**. The server resolves each field and returns that shape.
:::

```text
query {
  user(id: 42) {
    name
    avatarUrl
    posts(first: 10) { id caption likeCount }
  }
}
```

**Strengths:** one round trip per screen, no over-fetching, a strongly typed schema, and front-ends can change their data needs without new backend endpoints. It's great for **aggregating many services behind one API** for many different clients.

**Costs:** HTTP caching (CDN, browser) is harder because everything is a `POST` to one URL. A malicious or naive query can be very expensive, so you need depth and complexity limits. The server can suffer the **N+1 query problem** internally (one DB query per post), which is usually fixed with batching (the DataLoader pattern). Rate limiting must count query cost, not requests.

## gRPC

:::def gRPC
A high-performance RPC (remote procedure call) framework from Google. You define services and messages in **Protocol Buffers** (a compact binary format), and code generators produce typed client and server stubs in many languages. It runs over **HTTP/2** and supports **streaming** in both directions.
:::

```text
service Payments {
  rpc Charge (ChargeRequest) returns (ChargeReply);
  rpc WatchBalance (Account) returns (stream Balance);   // server streaming
}
message ChargeRequest { string idempotency_key = 1; int64 amount_minor = 2; string currency = 3; }
```

**Strengths:** small binary payloads (often 3–10× smaller than JSON) and fast parsing, strict contracts with generated code, built-in deadlines and cancellation, and bidirectional streaming. It's the usual choice for **service-to-service** calls inside a company.

**Costs:** not human-readable, poor direct browser support (needs gRPC-Web and a proxy), and harder to debug with curl.

## Choosing

| | REST | GraphQL | gRPC |
|---|---|---|---|
| Best for | public APIs, simple CRUD, cacheable reads | rich front-ends with varied data needs, API aggregation | internal microservice calls, low latency, streaming |
| Format | JSON over HTTP | JSON over HTTP (one endpoint) | Protobuf over HTTP/2 |
| HTTP caching | excellent | hard | none built in |
| Contract | OpenAPI (optional) | schema (required) | `.proto` (required) |
| Browser-friendly | ✓ | ✓ | needs a proxy |

:::interview What to write in an interview
Spend about 5 minutes on the API. List **one endpoint per functional requirement**, with method, path, key parameters and what it returns. Mention pagination on lists and idempotency on anything that charges, books or sends. Saying *"REST for the public API, gRPC between internal services"* is a perfectly good default. Don't spend the interview debating API styles unless asked.
:::

:::problem Design the API for a ride-hailing app {level=easy tags="API design,REST"}
Riders request rides and see the driver approaching. Drivers go online, receive ride offers, and accept or decline them. Both rate each other after the trip. Write the endpoints (method, path, body, response) for the main flows. Which calls need idempotency keys, and which data should be **pushed** to the client instead of polled?

:::hint Hint
Identify the resources first: rides, drivers' availability, offers, ratings. Then go through one trip from request to rating and write each call.
:::

:::solution
```text
POST   /v1/rides                    {pickup, dropoff, rideType}   → 201 {rideId, status: "MATCHING", fareEstimate}
                                     Idempotency-Key header: a double tap must not book two cars
GET    /v1/rides/{rideId}           → {status, driver, vehicle, eta, route}
POST   /v1/rides/{rideId}/cancel    → 200 {status: "CANCELLED", fee}          (idempotent by nature)

PUT    /v1/drivers/me/status        {online: true}                            (idempotent: PUT)
POST   /v1/drivers/me/locations     {lat, lng, heading, ts}  every ~4 s       (high volume, tiny payload)
POST   /v1/offers/{offerId}/accept  → 200 {rideId}   or 409 if the offer expired / was taken
POST   /v1/offers/{offerId}/decline → 204

POST   /v1/rides/{rideId}/ratings   {stars, comment}  → 201   (one per rider/driver per ride: 409 on a duplicate)
```

**Idempotency keys:** creating a ride and anything that charges money. Accepting an offer is naturally protected because the offer can only be accepted once (the server returns `409` if it was already taken).

**Push, don't poll:** the driver's live location and ETA for the rider, and new ride offers for drivers (they expire in seconds). Use a WebSocket or a mobile push channel. The real-time protocols lesson covers the options. Driver location **uploads** can stay plain HTTP POSTs (or a lightweight UDP/WebSocket stream at large scale).
:::
:::

```quiz
? Which of these is idempotent?
- `POST /orders` with the same body twice
+ `DELETE /orders/17` sent twice
- `POST /orders/17/items`
> Deleting the same resource twice leaves the same final state. Two POSTs normally create two orders.

? A feed uses `?offset=` pagination and users report seeing the same post twice while scrolling. Why?
+ New posts were inserted at the top between page requests, shifting every item down
- The database returned rows in random order
- The client cached page 1
> Offsets count positions, and positions shift when items are inserted. A cursor ("items older than X") is stable.

? Why do internal microservices often use gRPC instead of REST/JSON?
- gRPC is easier to call from a browser
+ Compact binary messages over HTTP/2, generated typed clients, deadlines and streaming
- gRPC responses are easy to cache in a CDN
> gRPC trades human readability and browser support for efficiency and strict contracts, which suits internal service-to-service calls.

? A payment request times out and the client retries with a **new** idempotency key. What can happen?
- Nothing, because the server deduplicates by amount
+ The customer may be charged twice, since the server sees it as a new payment
- The server rejects the second request automatically
> The key must be generated once per logical operation and reused on every retry of that operation.
```

:::keypoints
- An API is the contract. Write it right after the requirements: **one endpoint per feature**.
- REST = **resources (plural nouns) + HTTP methods**. Use proper status codes. `GET`, `PUT` and `DELETE` are idempotent; `POST` is not.
- Paginate every list. **Cursor pagination** is fast and stable for feeds; offset is fine for small, page-numbered tables.
- Make unsafe operations retryable with **idempotency keys**: store the result per key and replay it.
- Version your API, use one error shape, put auth in headers, money in integer minor units, and return `202` for long-running work.
- **GraphQL** fits flexible front-end data needs. **gRPC** fits fast, typed, internal service calls. REST remains the default for public APIs.
:::
