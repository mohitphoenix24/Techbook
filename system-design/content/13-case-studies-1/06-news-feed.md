---
title: Design a News Feed (Twitter / Facebook)
level: advanced
time: 55
summary: The classic fan-out problem — posting and following, the home timeline, fan-out on write vs fan-out on read and the hybrid that handles celebrities, the feed cache, ranking, cursor pagination, media through a CDN, and how the read path stays fast for hundreds of millions of users.
---

:::problem Design a News Feed {level=hard tags="HLD,fan-out,caching,ranking"}
Design the home feed of a social network like Twitter/X or Facebook: users post short updates (text, images), follow other users, and see a feed of recent posts from the accounts they follow. **300 M daily active users**; some accounts have **100 M followers**.

:::hint Hint
The core decision is *when* to assemble a user's feed: when a post is written (push to every follower's feed) or when the feed is read (pull from every followee). Each fails for someone: push for celebrities, pull for users who follow many accounts. Combine them.
:::
:::

## 1. Requirements

**Functional**
- **Post** (text up to ~280 chars, optional media); **follow/unfollow**.
- **Home feed**: posts from followed accounts, newest or ranked first, infinitely scrollable.
- Like/reply counts shown on posts (eventually consistent is fine).

**Non-functional**
- **Read-heavy**: feeds are read far more than posts are written.
- Feed loads in **< 200 ms p99**; highly available.
- A new post appears in followers' feeds within **seconds** (eventual consistency is acceptable; a short delay is invisible).
- Scale: 300 M DAU, celebrity accounts with tens of millions of followers.

## 2. Estimates

:::derive Load
\text{posts} = 300\text{M} \times 2/\text{day} = 6 \times 10^8/\text{day} \approx 7{,}000/\text{s} || ~2 posts per user per day
\text{feed reads} = 300\text{M} \times 10/\text{day} \approx 35{,}000/\text{s} \;(\text{peak} \sim 100\text{K}) || 10 refreshes each
\text{fan-out (push)} \approx 7{,}000 \times 200 \text{ avg followers} = 1.4\text{M feed inserts/s} || the hard number
!\text{feed cache} = 300\text{M} \times 800 \text{ ids} \times 8\,\text{B} \approx 2\,\text{TB} || ids only, in a Redis cluster
:::

**Conclusions:** feeds must be **precomputed** or cheaply assembled (35K–100K reads/s); a naive push to every follower costs over a million writes per second and explodes for celebrities; store **post ids** in feeds and hydrate the posts from a cache.

## 3. API and data model

```text
POST /v1/posts                 {text, mediaIds[]}           → 201 {postId}
POST /v1/users/{id}/follow     DELETE /v1/users/{id}/follow
GET  /v1/feed?cursor=…&limit=20                              → {posts[], nextCursor}
```

| Data | Store | Key / shape |
|---|---|---|
| posts | sharded KV / wide-column, cached | `postId` (Snowflake: sortable by time) → author, text, media URLs |
| user timeline (my own posts) | wide-column | `authorId` → recent postIds |
| social graph | sharded store (by user) | `followers(userId)`, `following(userId)` |
| **home feed** | **Redis**, per user | `feed:{userId}` → list of ~800 most recent postIds |
| media | object storage + CDN | uploaded before posting |
| counters | sharded counters / stream aggregation | likes, replies per post |

## 4. High-level design

```viz algo=arch title="News feed" dir=down
user     Users [mobile] @0,1
lb       API gateway [gateway] @1,1
cdn      CDN | media [cdn] @1,2
postsvc  Post service [service*2] @2,0
feedsvc  Feed service | read path [service*3] @2,2
q        New-post events [stream] @3,0
pcache   Post cache | postId → post [cache] @3,2
fan      Fan-out workers [worker*3] @4,0
pdb      Posts DB [nosql] @3,0.9
graph    Social graph [db] @5,0
fcache   Feed cache | feed:{user} → postIds [cache] @4,1.8
--
user -> lb
lb -> postsvc : POST /posts
lb -> feedsvc : GET /feed
postsvc -> pdb
postsvc ~> q : PostCreated
q ~> fan
fan -> graph : followers
fan -> fcache : push postId
feedsvc -> fcache
feedsvc -> pcache : hydrate
pcache -> pdb : on miss
user -> cdn : images
--
flow Post (normal user)
user > lb : Ana (300 followers) posts a photo; the image was already uploaded to object storage.
lb > postsvc : The post service stores the post (Snowflake id = time-sortable).
postsvc > q : …and publishes PostCreated.
q > fan : A fan-out worker consumes it…
fan > graph : …fetches Ana's 300 followers in pages…
fan > fcache : …and pushes the post id onto each follower's feed list (trimmed to 800).
flow Read the feed
user > lb : Bo opens the app: GET /feed.
lb > feedsvc : The feed service…
feedsvc > fcache : …reads Bo's precomputed list of post ids,
feedsvc > pcache : …hydrates them (multi-get from the post cache), merges celebrity posts, ranks, and returns 20 with a cursor.
user > cdn : The images load from the CDN.
```

## 5. Deep dives

### A. Fan-out on write vs on read, and the hybrid

| | **Push** (fan-out on write) | **Pull** (fan-out on read) |
|---|---|---|
| on post | write the id into every follower's feed | append to the author's timeline only |
| on read | read one precomputed list: fast | fetch timelines of everyone you follow and merge: slow |
| fails for | **celebrities**: 100 M inserts per post, seconds to minutes of lag | users who **follow many** accounts; every refresh does a big merge |
| also wastes | work for inactive followers | nothing on write |

**Hybrid** (what Twitter/X and others do): **push** for normal accounts; for **celebrities** (above a follower threshold), **don't fan out**; at read time, merge the precomputed feed with the recent posts of the few celebrities you follow. Also skip pushing to **inactive users** and build their feed on demand when they return.

```js run title="Push vs pull vs hybrid on a power-law follow graph"
// Build a follow graph: 20,000 users each follow 50 accounts, biased towards popular ones (a power law)
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const USERS = 20000, FOLLOWS = 50;
const followees = [], followers = new Array(USERS).fill(0);
for (let u = 0; u < USERS; u++) {
  const set = new Set();
  while (set.size < FOLLOWS) { const v = Math.floor(Math.pow(rand(), 4) * USERS); if (v !== u) set.add(v); }
  followees.push([...set]);
  for (const v of set) followers[v]++;
}
const sorted = [...followers].sort((a, b) => b - a);
console.log(`followers: top account ${sorted[0].toLocaleString()}, median ${sorted[USERS / 2]}`);

// One day: 5% of users post once, popular accounts (> 5,000 followers) post 5 times; every user reads the feed 10 times
const CELEB = 5000;                                  // hybrid: accounts above this are pulled at read time
const posters = [...Array(USERS).keys()].flatMap((u) => followers[u] > CELEB ? [u, u, u, u, u] : rand() < 0.05 ? [u] : []);
const READS = USERS * 10;
const celebs = followees.map((f) => f.filter((v) => followers[v] > CELEB).length);
const avgCelebs = celebs.reduce((a, b) => a + b, 0) / USERS;

const fmt = (n) => Math.round(n).toLocaleString();
const show = (name, writes, lookupsPerRead, note) =>
  console.log(`${name.padEnd(7)} writes/day ${fmt(writes).padStart(7)} | reads/day ${fmt(READS * lookupsPerRead).padStart(9)} (${lookupsPerRead.toFixed(1)} lookups each)  ${note}`);
const pushWrites = posters.reduce((s, u) => s + followers[u], 0);
show("push", pushWrites, 1, `worst single post: ${fmt(Math.max(...posters.map((u) => followers[u])))} feed inserts`);
show("pull", posters.length, FOLLOWS, "every read merges 50 timelines");
show("hybrid", posters.reduce((s, u) => s + (followers[u] > CELEB ? 1 : followers[u]), 0), 1 + avgCelebs,
  `${followers.filter((f) => f > CELEB).length} celebrities are pulled, everyone else pushed`);

// Reading a hybrid feed: merge the precomputed (pushed) feed with recent celebrity posts, newest first
const precomputed = [{ t: 1003, by: "friend_ana" }, { t: 998, by: "friend_bo" }, { t: 990, by: "friend_cy" }];
const celebrityPosts = [{ t: 1001, by: "star_1" }, { t: 950, by: "star_1" }, { t: 995, by: "star_2" }];
const feed = [...precomputed, ...celebrityPosts].sort((a, b) => b.t - a.t).slice(0, 5);
console.log("merged feed:", feed.map((p) => `${p.by}@${p.t}`).join(" → "));
```

### B. Ranking

A chronological feed is just the merge above. A **ranked** feed takes a candidate set (the ~500 most recent ids plus celebrity posts), fetches features (author affinity, engagement so far, recency, media type) and scores them with a model, then applies rules (diversity, no two posts from the same author in a row). Ranking runs on the read path, so it must be fast: precompute features, cap the candidates, cache the ranked page briefly.

### C. Pagination

Use **cursor** pagination, never offsets: the cursor is the last seen post id (or score + id). New posts arriving at the top don't shift the pages, and a request becomes "20 items older than X", which is cheap on a sorted list.

### D. Hot posts and counters

A celebrity post is read by millions: the **post cache** holds it with replicas, and servers cache very hot posts in process. Like counts are **sharded counters** or aggregated in a stream and written periodically; showing "1.2M" a few seconds late is fine.

### E. Consistency details

- **Read-your-own-posts**: after posting, the author should see the post immediately even if fan-out is still running; the feed service merges the user's own recent posts at read time.
- **Unfollow / delete**: filter at read time (check that the author is still followed and the post still exists while hydrating), and clean up feeds lazily.
- **Feed cache loss**: feeds can be **rebuilt** from timelines (pull) on a miss, so the cache is an optimisation, not the source of truth.

## 6. Wrap-up

Post service → event → **fan-out workers** push post ids into **Redis feed lists** for normal authors; **celebrities are pulled** at read time; the feed service reads the list, merges celebrity and own posts, hydrates from the post cache, ranks, and pages with cursors; media via CDN. Monitor fan-out lag (post → visible in feeds), feed read latency, cache hit rates and the size of the fan-out queue.

```quiz
? Why does pure fan-out on write break for celebrities?
+ One post must be inserted into tens of millions of feeds, causing huge write bursts and long delivery lag
- Celebrities post too rarely
- Their posts are too large
> The hybrid pulls celebrity posts at read time instead.

? A user follows 2,000 accounts and refreshes often. Which approach hurts most for them?
+ Pure fan-out on read: every refresh merges up to 2,000 timelines
- Pure fan-out on write
- The hybrid
> Push makes reads cheap; that's why it's the default for ordinary accounts.

? Why do feeds store post ids rather than full posts?
+ Ids are small (the feed cache stays affordable), and posts are hydrated from one shared post cache, so edits and deletes apply everywhere
- Posts can't be cached
- Ids are required for ranking
> Store references in feeds; store each post once.
```

:::keypoints
- Precompute feeds (**fan-out on write**) for fast reads, but **pull celebrities** at read time and skip inactive users: the **hybrid**.
- Feeds are lists of **post ids** in Redis (~800 per user); posts are hydrated from a post cache; media via CDN.
- Fan-out runs **asynchronously** from a post event stream; the author's own posts are merged at read time.
- **Cursor pagination**; ranking on a capped candidate set; counters aggregated asynchronously.
- The feed cache can be rebuilt from timelines; deletes/unfollows are filtered at read time.
:::
