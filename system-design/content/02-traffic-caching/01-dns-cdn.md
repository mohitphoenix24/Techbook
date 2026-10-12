---
title: DNS and CDNs — the Edge of Your System
level: intermediate
time: 35
summary: How DNS resolution really works (records, TTLs, caching, GeoDNS, anycast) and how it's used for routing and failover; then CDNs — pull vs push, cache keys, cache-control headers, invalidation and versioned assets, and what CDNs do beyond caching.
---

Before a request ever reaches your load balancer, two systems at the edge of the internet have already shaped it: **DNS** decided which IP address (and often which region) it goes to, and a **CDN** may have answered it without touching your servers at all. Both are huge levers in real designs.

## DNS: the internet's phone book

:::def DNS (Domain Name System)
A distributed, hierarchical, heavily cached database that maps names (`api.example.com`) to records such as IP addresses. No single server knows every name. Each level knows who to ask next.
:::

```viz algo=arch title="Resolving api.example.com (cold cache)"
client   Your laptop | stub resolver [client]
rec      Recursive resolver | ISP, 8.8.8.8, 1.1.1.1 [dns]
root     Root servers | 13 named, anycast [dns]
tld      .com TLD servers [dns]
auth     Authoritative NS | example.com [dns]
--
client -> rec
rec -> root
rec -> tld
rec -> auth
--
flow Cold lookup
client > rec : "What's the IP of api.example.com?" The OS asks its configured resolver.
rec > root : The resolver asks a root server…
root > rec : …which only knows who runs .com.
rec > tld : The .com servers know who is authoritative for example.com.
tld > rec : "Ask ns1.example-dns.com."
rec > auth : The authoritative server has the actual record.
auth > rec : A 203.0.113.7, TTL 300 s.
rec > client : The resolver caches the answer for 300 s and replies.
```

In practice almost every lookup is answered from a **cache**: the browser's, the OS's, or the recursive resolver's (which serves millions of users, so popular names are always warm).

### Record types you should know

| Record | Maps | Example |
|---|---|---|
| `A` / `AAAA` | name → IPv4 / IPv6 address | `api.example.com → 203.0.113.7` |
| `CNAME` | name → another name (an alias) | `www.example.com → example.cdn-provider.net` |
| `NS` | domain → its authoritative name servers | `example.com → ns1.dnsprovider.com` |
| `MX` | domain → mail servers | `example.com → mx1.mailhost.com` |
| `TXT` | arbitrary text (domain ownership proofs, email security like SPF/DKIM) | |
| `SRV` | service → host + port (used for service discovery) | `_sip._tcp.example.com` |

### TTL: the dial between agility and load

:::def TTL (time to live)
How many seconds a resolver may cache a record before asking again.
:::

- **Long TTL** (hours): fewer lookups, faster for users, less load on DNS. But a change (moving to a new IP, failing over) takes hours to reach everyone.
- **Short TTL** (30–60 s): changes propagate quickly, which matters for failover. But more lookups and slightly slower first requests.

:::warn DNS failover is slower than you think
Even with a 60 s TTL, some resolvers and clients ignore TTLs and cache for longer, and long-lived connections never re-resolve at all. DNS is a fine **coarse** traffic switch (shift a region over minutes), not a way to fail over in seconds. For fast failover, use load balancers with health checks behind a stable IP.
:::

### DNS as a traffic router

DNS answers can depend on **who is asking**, which makes it a powerful, cheap routing tool:

- **Round-robin DNS**: return several IPs, rotating their order. Crude load spreading; no health awareness on its own.
- **GeoDNS / latency-based routing**: return the IP of the region closest to the resolver ("Europeans get the Frankfurt IP"). This is how users are steered to the nearest data centre.
- **Weighted routing**: send 5% of users to the new stack (a coarse canary).
- **Health-checked failover**: the DNS provider monitors your endpoints and stops returning IPs of dead regions.

:::def Anycast
Many servers in different places announce the **same IP address** via internet routing (BGP). Each user's packets reach the **nearest** one, as decided by the network itself. DNS root servers, public resolvers like 1.1.1.1, and most CDNs use anycast. It also soaks up DDoS attacks, since attack traffic is split across all locations.
:::

## CDNs: serve it from next door

:::def CDN (Content Delivery Network)
A globally distributed network of **edge servers** (in hundreds of "points of presence", PoPs) that cache your content close to users. Requests go to a nearby edge. Only on a cache miss does the edge fetch from your server, the **origin**.
:::

```viz algo=arch title="A CDN in front of an origin"
userA   User in Mumbai [mobile]
userB   User in São Paulo [mobile]
edgeA   Edge PoP · Mumbai [cdn]
edgeB   Edge PoP · São Paulo [cdn]
shield  Origin shield | regional cache [cdn]
origin  Origin | your servers or S3 [storage]
--
userA -> edgeA : ~10 ms
userB -> edgeB : ~10 ms
edgeA -> shield : on miss
edgeB -> shield : on miss
shield -> origin : on miss
--
flow First request for logo.png (miss everywhere)
userA > edgeA : GET /static/logo.v42.png. The Mumbai edge doesn't have it.
edgeA > shield : Ask the regional shield cache. Also a miss.
shield > origin : Fetch it from the origin, once.
origin > shield : 200 + Cache-Control: max-age=31536000, immutable
shield > edgeA : The shield and the edge both store a copy…
edgeA > userA : …and the user gets it.
flow Later requests (hits)
userA > edgeA : Every later user near Mumbai is served from the edge in ~10 ms. The origin never sees them.
```

**Why it's so effective:**

1. **Latency**: content travels ~10–30 ms instead of 150+ ms across an ocean.
2. **Origin offload**: a 99% hit rate means your servers handle 1% of the traffic. Video sites like YouTube and Netflix would be impossible without this.
3. **Bandwidth cost**: serving from the edge is cheaper than from your origin.
4. **Resilience**: edges absorb traffic spikes and DDoS attacks, and can serve stale content if the origin is down.

:::def Origin shield
An extra caching layer between the edges and the origin. Without it, a new file requested in 300 PoPs causes 300 origin fetches. With a shield, all edges ask the shield, and the origin sees one request.
:::

### Pull vs push CDNs

| | Pull (origin pull) | Push |
|---|---|---|
| How content gets there | the edge fetches from the origin on the first miss | you upload content to the CDN ahead of time |
| Setup | point the CDN at your origin; done | upload pipeline, manage storage |
| First request | slow (a miss) | fast |
| Best for | websites, APIs, long-tail content | large files known in advance: video libraries, game patches, software releases |

Most websites use **pull**. Netflix famously **pushes** its catalogue to servers inside ISPs (Open Connect) overnight, before people watch.

### Controlling the cache: headers and keys

The origin tells caches what to do through HTTP headers:

```text
Cache-Control: public, max-age=31536000, immutable      ← versioned static file: cache 1 year
Cache-Control: public, max-age=60, stale-while-revalidate=30   ← a news page: 60 s, then refresh in the background
Cache-Control: private, no-store                        ← a bank statement: never cache in shared caches
ETag: "9f2c1a"                                          ← a version tag for revalidation (→ 304 Not Modified)
Vary: Accept-Encoding                                   ← keep separate copies for gzip / brotli
```

:::def Cache key
What a cache uses to decide two requests are "the same": by default the URL (host + path + query). Adding unnecessary parts (every cookie, tracking query parameters like `?utm_source=`) splits the cache into many copies and kills the hit rate. Leaving needed parts out (the language, or which user) serves the wrong content.
:::

:::warn Never let personal data into a shared cache
If `/account` responses are cached by URL alone, the next user may see the previous user's account page. Mark personalised responses `private` or `no-store`, and only cache them at the edge with the user identity in the cache key, if at all. This is a real, recurring cause of data leaks.
:::

### Invalidation: the hard part

Once content is cached in 300 PoPs, how do you change it?

1. **Wait for the TTL** to expire. Simple, but slow for long TTLs.
2. **Purge** through the CDN's API (`purge /static/app.css`). Takes seconds to minutes to reach every PoP, and some CDNs rate-limit purges.
3. **Versioned URLs** (the best practice for static assets): put a version or content hash in the file name, `app.3f9c2e.js`. A new deploy references a **new URL**, so nothing needs purging, and old files can be cached "forever" (`immutable`).

```js run title="Content-hashed file names: change the file, change the URL"
// Build tools do this for every asset: the name changes only when the content changes.
async function hashedName(name, content) {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const dot = name.lastIndexOf(".");
  return `${name.slice(0, dot)}.${hex.slice(0, 8)}${name.slice(dot)}`;
}

console.log(await hashedName("app.js", "console.log('v1')"));
console.log(await hashedName("app.js", "console.log('v1')"));   // same content → same URL → cache hit
console.log(await hashedName("app.js", "console.log('v2')"));   // changed → new URL → no purge needed
```

The HTML page that references these files is given a **short** TTL (or none), so it always points at the latest asset names.

### What to put on a CDN

| Content | CDN? | Notes |
|---|---|---|
| Images, video, JS, CSS, fonts | ✓ always | versioned URLs, long TTLs |
| Software downloads, game patches | ✓ | often pushed |
| Public pages the same for everyone (blog, product page for logged-out users) | ✓ | short TTL + stale-while-revalidate |
| Public API responses (exchange rates, top stories) | ✓ often | seconds-long TTLs still cut origin load enormously |
| Personalised pages, carts, account data | ✗ (or with care) | `private` |
| Writes (POST) | ✗ for caching | but CDNs can still terminate TLS and route them |

### CDNs today do more than cache

Modern CDNs (Cloudflare, Akamai, Fastly, CloudFront) are general **edge platforms**:

- **TLS termination** close to users (the expensive handshake happens 10 ms away).
- **DDoS protection** and a **web application firewall (WAF)**.
- **Edge compute**: run small functions at the PoP (auth checks, A/B routing, image resizing, personalisation).
- **Dynamic acceleration**: even uncacheable API calls benefit, because the edge keeps warm, optimised connections to your origin.
- **Video streaming** of segmented adaptive-bitrate files (covered in the YouTube case study).

:::interview When to bring up a CDN
Whenever the system serves **media or static files**, has **global users**, or has **hot, identical, read-heavy responses**. Say what goes on the CDN, the TTL strategy (versioned URLs for assets, short TTLs for semi-dynamic data), and how you'd invalidate. For a video or photo system, the CDN carries the vast majority of the traffic and is often the biggest cost line.
:::

```quiz
? You must move your API to new IP addresses. The DNS record has a 24-hour TTL. What's the safe plan?
+ Lower the TTL to ~60 s a day or more in advance, wait for the old TTL to expire, then switch the record
- Change the record and restart the DNS server
- Use a CNAME instead, which has no TTL
> Resolvers keep the old answer until its TTL runs out. Lower it first, then make the change once everyone holds the short TTL.

? A new JavaScript bundle is deployed but users keep getting the old one from the CDN. What's the robust fix for the future?
- Purge the whole CDN after every deploy
+ Use content-hashed file names (app.3f9c2e.js), cache them forever, and give the HTML a short TTL
- Set max-age=0 on every file
> Versioned URLs make every change a new URL, so caches never have to be invalidated.

? Why add an "origin shield" layer to a CDN?
- To encrypt traffic between edges
+ So a cache miss across hundreds of edge locations turns into a single request to the origin
- To store user sessions
> Without a shield, each PoP fetches from the origin separately on a miss.

? Which is the riskiest thing to cache at a shared CDN edge?
- A product image
- The site's logo
+ The response of GET /account/settings
> Personalised responses cached by URL can be served to other users. Mark them private or no-store.
```

:::keypoints
- **DNS** resolves names through a hierarchy (root → TLD → authoritative) and is cached everywhere, governed by **TTL**: short TTLs give agility, long TTLs give speed.
- DNS doubles as a **traffic router**: GeoDNS/latency routing, weighted splits, health-checked failover. It's coarse, though; caches and clients delay changes.
- **Anycast** sends users to the nearest of many servers sharing one IP.
- A **CDN** caches content at edges near users: lower latency, huge origin offload, DDoS protection. **Pull** is the default; **push** suits large known content.
- Control CDN caching with `Cache-Control`, careful **cache keys**, and **versioned URLs** instead of purges. Never cache personalised data in shared caches.
:::
