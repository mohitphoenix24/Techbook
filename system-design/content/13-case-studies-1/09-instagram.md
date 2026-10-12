---
title: Design Instagram (Photo Sharing)
level: advanced
time: 50
summary: A media-heavy social app — direct-to-object-storage uploads with pre-signed URLs, an asynchronous processing pipeline for resized variants, serving images through a CDN, metadata sharded by user with time-sortable ids and logical shards, the home feed (reusing the news-feed design), likes and comments at celebrity scale, and expiring stories.
---

:::problem Design Instagram {level=hard tags="HLD,object storage,CDN,sharding"}
Design a photo-sharing app like Instagram: users upload photos with captions, follow others, see a **home feed**, like and comment, and post **stories** that disappear after 24 hours. **500 M DAU**, **100 M photo uploads per day**.

:::hint Hint
The feed is the news-feed problem you've already solved. What's new is the **media**: getting large files in cheaply (straight to object storage), processing them asynchronously into several sizes, and serving them from a CDN. And the metadata must be sharded so a user's data stays together.
:::
:::

## 1. Requirements

**Functional**: upload photos (and short videos) with captions; follow; home feed; like and comment; profile grid; stories that expire after 24 h.

**Non-functional**
- **Read-heavy**: each photo is viewed many times; images must load fast worldwide.
- **Durable**: uploaded photos are never lost.
- **Available** over consistent: a like count that lags by seconds is fine.
- Upload feels instant (processing can finish in the background, in seconds).

## 2. Estimates

:::derive Storage and bandwidth
10^8\ \text{uploads/day} \times 2\,\text{MB original} = 200\,\text{TB/day} ||
\text{+ variants (1080, 640, 320, thumbnail)} \approx +30\% \Rightarrow \sim 260\,\text{TB/day} ||
!\approx 95\,\text{PB/year} || object storage + tiering is the only sensible home
\text{views: } 500\text{M} \times 100\ \text{images/day} \times 150\,\text{KB} = 7.5\,\text{PB/day egress} || almost all from the CDN
:::

**Conclusions:** media bytes dwarf everything else: **object storage** for files, **CDN** for delivery, **never through the app servers**. Metadata (~1 KB per photo) is large but ordinary: 100 M rows/day in a sharded database.

## 3. API and data model

```text
POST /v1/uploads                       → {uploadUrl (pre-signed PUT), mediaId}
PUT  <uploadUrl>                       (the client uploads straight to object storage)
POST /v1/posts {mediaId, caption}      → 201 {postId}
GET  /v1/feed?cursor=…   GET /v1/users/{id}/posts?cursor=…
POST /v1/posts/{id}/likes   POST /v1/posts/{id}/comments
```

| Data | Store | Notes |
|---|---|---|
| media files | object storage, CDN in front | key = `mediaId/variant`; immutable |
| posts | sharded SQL / KV, **sharded by user id** | id = time-sortable, embeds the shard |
| follows | graph store or sharded tables (both directions) | `followers(u)`, `following(u)` |
| likes, comments | wide-column, keyed by post | counts kept separately |
| feeds | Redis lists of post ids | as in the news-feed case study |
| stories | KV with **TTL 24 h** + media with lifecycle rules | |

## 4. High-level design

```viz algo=arch title="Instagram: media path and metadata path" dir=down
app      Mobile app [mobile] @0,1
api      API servers [service*3] @1,1
cdn      CDN | images + video [cdn] @1,2.3
s3       Object storage | originals + variants [storage] @2,2.3
meta     Posts DB | sharded by user [db] @2,0
q        Media events [queue] @2,1
proc     Media processors | resize, transcode [worker*3] @3,1
fan      Feed fan-out | → Redis feeds [worker] @1,0
--
app -> api : upload URL, post
app -> s3 : PUT photo
app -> cdn : view
cdn -> s3 : miss
api -> meta
api ~> q : MediaUploaded
q ~> proc
proc -> s3 : variants
api ~> fan : PostCreated
--
flow Upload a photo
app > api : The app asks for an upload URL; the API returns a pre-signed PUT URL valid for 15 minutes.
app > s3 : The app uploads the 2 MB photo straight to object storage, never through our servers (resumable for video).
api > q : The app creates the post {mediaId, caption}; the API stores it (status: processing) and emits MediaUploaded.
q > proc : Processors strip EXIF/GPS data, generate 1080/640/320/thumbnail variants (and video renditions)…
proc > s3 : …store them, then mark the post ready.
api > fan : PostCreated triggers the feed fan-out (hybrid push/pull).
flow View the feed
app > api : GET /feed returns post metadata with CDN URLs for the right variant for this screen size.
app > cdn : Images load from the nearest edge; a miss is fetched once from object storage and cached.
```

## 5. Deep dives

### A. Uploads that never touch the app servers

**Pre-signed URLs** let the client upload directly to object storage with a short-lived permission for exactly one key. App servers only handle small JSON requests, so they scale with request count, not bytes. Large videos use **multipart, resumable** uploads. The client can show the photo immediately (it has it locally) while processing completes; the post becomes visible to others once variants exist.

### B. Processing and serving media

Processing is **asynchronous** through a queue: resize into a few standard sizes, re-encode (WebP/AVIF), strip location metadata, run safety classifiers, transcode videos into adaptive bitrate renditions. Each variant is **immutable**, so it's cached by the CDN with a long `max-age` and a content-addressed URL. **Storage tiering**: recent media on standard storage; old, rarely viewed media moves to infrequent-access tiers automatically (lifecycle rules). Originals may be kept for re-processing.

### C. Sharding metadata with smart ids

Shard posts by **user id** so a profile grid ("this user's posts, newest first") is a single-shard range query. Instagram's well-known trick: a 64-bit id that is **time-sortable** and **embeds the shard**, generated inside the database, with thousands of **logical shards** mapped to a smaller number of physical databases:

```js run title="Instagram-style ids and logical shards"
// Instagram-style ids: 41 bits of milliseconds | 13 bits of logical shard | 10 bits of per-shard sequence
const EPOCH = 1293840000000n;                         // a custom epoch (2011-01-01) gives 41 bits ≈ 69 years
const LOGICAL_SHARDS = 8192;                          // 2^13 logical shards, mapped onto far fewer databases
const seqs = new Map();

function makeId(userId, nowMs) {
  const shard = userId % LOGICAL_SHARDS;              // all of a user's photos live on the user's shard
  const seq = ((seqs.get(shard) ?? -1) + 1) % 1024; seqs.set(shard, seq);
  return ((BigInt(nowMs) - EPOCH) << 23n) | (BigInt(shard) << 10n) | BigInt(seq);
}
const decode = (id) => ({ ms: Number((id >> 23n) + EPOCH), shard: Number((id >> 10n) & 8191n), seq: Number(id & 1023n) });

// Logical shards → physical databases (a lookup table; moving a logical shard = copy + update the map)
let physical = (shard) => `db${Math.floor(shard / 2048)}`;   // 4 databases, 2,048 logical shards each

const t0 = Date.UTC(2026, 9, 12, 9, 0, 0);
const photos = [
  { user: 31337, t: t0 + 5 }, { user: 42, t: t0 }, { user: 31337, t: t0 + 5 }, { user: 9001, t: t0 + 2 },
].map((p) => ({ ...p, id: makeId(p.user, p.t) }));
for (const p of photos) {
  const d = decode(p.id);
  console.log(`user ${String(p.user).padEnd(5)} id ${p.id}  shard ${d.shard} (on ${physical(d.shard)})  seq ${d.seq}  time ${new Date(d.ms).toISOString()}`);
}
console.log("sorting by id sorts by time:", [...photos].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => p.user).join(", "));

// Growth: split each database in two by moving half of its logical shards; ids never change
physical = (shard) => `db${Math.floor(shard / 1024)}`;
console.log(`after resharding to 8 databases, user 31337's shard ${31337 % LOGICAL_SHARDS} lives on ${physical(31337 % LOGICAL_SHARDS)}`);
```

Because the id contains the shard, any service can find a post's database from its id alone, and sorting by id sorts by creation time. Moving a logical shard to a new server changes only the mapping table.

### D. Feed, likes and comments

- **Feed**: the hybrid fan-out from the news-feed case study (push for normal accounts, pull for celebrities); feed entries are post ids, hydrated from a post cache with CDN image URLs.
- **Likes**: a celebrity post can get 1 M likes in minutes. Store individual likes (for "did I like this?" and the likers list) in a wide-column table keyed by post, and keep **counts** separately: sharded counters, or increments aggregated through a stream and flushed every few seconds. Show approximate counts ("1.2M").
- **Comments**: keyed by post id, ordered by time (or ranked); paginated with cursors.

### E. Stories

Stories expire after 24 h: store them with a **TTL** (a KV store expires them automatically) and an object-storage lifecycle rule for the media. The "who has stories" tray is a small per-user list built by fan-out like the feed, but short-lived. View receipts ("seen by") are appended to a per-story list.

## 6. Wrap-up

**Media path**: pre-signed direct uploads → object storage → async processors (variants, safety) → CDN with immutable URLs, tiered storage. **Metadata path**: API → posts sharded by user with time-sortable, shard-embedding ids → events → feed fan-out (hybrid) → Redis feeds; likes and comments in wide-column tables with asynchronously aggregated counts; stories with TTLs. Monitor upload success rate, processing lag, CDN hit ratio and egress, feed latency, and hot-post counters.

```quiz
? Why do clients upload photos with pre-signed URLs straight to object storage?
+ Large bytes bypass the app servers entirely, so those servers only handle small requests and scale cheaply
- Object storage is the only place that can resize images
- It encrypts the photo
> Separating the media path from the metadata path is the core idea.

? Why shard posts by user id?
+ A user's posts live on one shard, so the profile grid is a single-shard, time-ordered range query
- It spreads a celebrity's likes evenly
- Users never read other users' posts
> Choose the shard key from the main access pattern.

? A celebrity's post gets 1 M likes in 5 minutes. How should the like count be maintained?
+ Store likes individually, and aggregate counts asynchronously (sharded counters or stream aggregation), showing approximate values
- UPDATE posts SET likes = likes + 1 for each like on the post's row
- Count rows on every page view
> One hot row would serialise a million writes.
```

:::keypoints
- Separate the **media path** (pre-signed uploads → object storage → async processing → CDN) from the **metadata path** (API → sharded DB → events).
- Media variants are **immutable**: long CDN caching, content-addressed URLs, lifecycle-based storage tiering.
- Shard metadata **by user**; use **time-sortable ids that embed a logical shard** (logical → physical mapping makes resharding easy).
- Feed = the news-feed hybrid; likes/comments in wide-column tables; **counts aggregated asynchronously** for hot posts.
- Stories use **TTLs** for data and lifecycle rules for media.
:::
