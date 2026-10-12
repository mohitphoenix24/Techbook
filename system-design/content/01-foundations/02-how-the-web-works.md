---
title: How the Web Works — the Life of a Request
level: easy
time: 30
summary: The classic interview warm-up "what happens when you type a URL and press Enter?", answered step by step: clients and servers, IP addresses, DNS resolution, TCP and TLS handshakes, HTTP requests and responses, and what happens on the server side.
---

Before designing systems with thousands of servers, you need a clear picture of what happens between **one** browser and **one** server. Every big system is this same conversation, repeated millions of times per second with more pieces in the middle.

## Clients and servers

:::def Client
A program that **asks** for something: a browser, a mobile app, another backend service, a command-line tool.
:::

:::def Server
A program (and by extension, the machine it runs on) that **listens** for requests on a network address and **answers** them. "Server" means the role, not special hardware: your laptop becomes a server the moment you run `python3 -m http.server`.
:::

The pattern is **request → response**. The client always starts the conversation. The server never calls the browser on its own initiative (the lesson on real-time protocols shows the workarounds for that).

:::def IP address
The numeric address of a machine on a network, like a phone number. **IPv4** has 32 bits, written as `93.184.215.14` (about 4.3 billion addresses, which ran out). **IPv6** has 128 bits, written as `2606:2800:21f:cb07::1`.
:::

:::def Port
A number from 0 to 65535 that picks **which program** on a machine receives the traffic. One IP can host many services: HTTPS on 443, HTTP on 80, PostgreSQL on 5432, Redis on 6379. The pair (IP, port) is one endpoint.
:::

:::analogy An apartment building
The IP address is the building's street address. The port is the apartment number. A letter (a packet) needs both to reach the right person.
:::

## What happens when you type a URL

This question is a favourite interview opener because it touches every layer. Let's take `https://shop.example.com/products?id=42`.

```js run title="Anatomy of a URL"
const url = new URL("https://shop.example.com:443/products?id=42&sort=price#reviews");

console.log("scheme:  ", url.protocol);   // which protocol to speak
console.log("host:    ", url.hostname);   // which machine (needs DNS)
console.log("port:    ", url.port || "(default for https = 443)");
console.log("path:    ", url.pathname);   // which resource on that machine
console.log("query:   ", Object.fromEntries(url.searchParams));
console.log("fragment:", url.hash, "(never sent to the server)");
```

Here is the whole journey. Press **▶** and follow each message.

```viz algo=seq title="Typing shop.example.com/products and pressing Enter"
participant b Browser [browser]
participant r DNS resolver [dns]
participant n Name servers [dns]
participant s Web server [server]
note b : 1. check browser + OS DNS cache — miss
b -> r : where is shop.example.com? | The OS asks the configured recursive resolver (your ISP's, or 8.8.8.8 / 1.1.1.1).
r -> n : root → .com → example.com | The resolver walks the hierarchy: a root server points to the .com servers, which point to example.com's authoritative server.
n --> r : A record: 203.0.113.7 (TTL 300 s) | The answer comes with a time-to-live, so it can be cached for 5 minutes.
r --> b : 203.0.113.7
== TCP handshake (1 round trip) ==
b -> s : SYN | "I'd like to open a connection."
s --> b : SYN-ACK | "OK, I'm ready."
b -> s : ACK | The connection is open. Both sides agreed on starting sequence numbers.
== TLS handshake (1 round trip with TLS 1.3) ==
b -> s : ClientHello + key share | Supported ciphers, plus the browser's half of a Diffie-Hellman key exchange.
s --> b : ServerHello + certificate + Finished | The certificate proves the server owns shop.example.com. Both sides now share a secret key.
== HTTP over the encrypted connection ==
b -> s : GET /products?id=42 | Headers: Host, Cookie, Accept, User-Agent…
s -> s : route → handler → database | The server runs the application code for this path.
s --> b : 200 OK + HTML | Headers: Content-Type, Cache-Control, Set-Cookie…
b -> s : GET /app.js, /style.css, /logo.png | The browser parses the HTML and fetches what it references, reusing the open connection.
note b : render: build DOM + CSS → layout → paint
```

Let's look at each stage more closely.

### Step 1: DNS turns the name into an IP address

Computers route by IP address, so the name must be translated first. The **Domain Name System** is a giant distributed, cached phone book. It is covered in depth in the DNS & CDN lesson. For now, three facts matter:

- It's **hierarchical**: root → top-level domain (`.com`) → the domain's own **authoritative** name servers.
- It's **heavily cached** at every level (browser, OS, resolver), controlled by each record's **TTL**. Most lookups never leave your machine or your ISP.
- A lookup that isn't cached can cost **20–120 ms**. That is why big sites keep TTLs reasonably long and browsers pre-resolve links (`dns-prefetch`).

### Step 2: TCP opens a reliable connection

:::def TCP (Transmission Control Protocol)
A protocol that turns the internet's unreliable packet delivery into a **reliable, ordered byte stream**. It numbers every byte, re-sends anything lost, puts out-of-order packets back in order, and slows down when the network is congested.
:::

The **three-way handshake** (SYN, SYN-ACK, ACK) costs one **round trip** (RTT) before any data flows. If the server is 80 ms away, that's 80 ms gone before the first byte of your request leaves.

### Step 3: TLS makes it private and authentic

:::def TLS (Transport Layer Security)
The "S" in HTTPS. It **encrypts** traffic so eavesdroppers can't read it, **protects integrity** so nobody can modify it in transit, and **authenticates** the server with a certificate signed by a trusted Certificate Authority, so you know you're really talking to `shop.example.com`.
:::

TLS 1.3 needs one extra round trip (TLS 1.2 needed two). Resumed connections can use **0-RTT** to skip it.

### Step 4: the HTTP request and response

HTTP is a text-based (HTTP/1.1) or binary-framed (HTTP/2, HTTP/3) protocol of **requests** and **responses**:

```text
GET /products?id=42 HTTP/1.1
Host: shop.example.com
Accept: text/html
Cookie: session=8f2c…
User-Agent: Mozilla/5.0 …
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: max-age=60
Content-Length: 5123

<!doctype html> …
```

| Part | What it carries |
|---|---|
| **Method** | the action: `GET` read, `POST` create, `PUT` replace, `PATCH` modify, `DELETE` remove |
| **Path + query** | which resource, plus parameters |
| **Headers** | metadata: auth tokens, cookies, content type, caching rules, compression |
| **Body** | the payload (JSON, HTML, an image…) |
| **Status code** | the outcome, in families: `2xx` success, `3xx` redirect, `4xx` client's fault, `5xx` server's fault |

Status codes you must know cold:

| Code | Meaning | When you'll use it in designs |
|---|---|---|
| `200 OK` / `201 Created` | success / a new resource was made | normal responses; `201` after a POST |
| `204 No Content` | success, empty body | a DELETE |
| `301` / `302` | moved permanently / temporarily | URL shorteners (`302` if you want to count every click) |
| `304 Not Modified` | your cached copy is still good | caching with ETags |
| `400` / `401` / `403` / `404` | bad input / not logged in / not allowed / not found | validation and auth |
| `409 Conflict` | the state changed under you | optimistic locking, double booking |
| `429 Too Many Requests` | slow down | rate limiting |
| `500` / `502` / `503` / `504` | server bug / bad upstream / overloaded / upstream timeout | failure handling at the load balancer |

### Step 5: the server side

On the server, the request usually passes through several layers before your code runs:

```viz algo=arch title="Inside 'the server'"
browser   Browser [browser]
lb        Load balancer | TLS terminates here [lb]
web       Web server | Nginx: static files, routing [gateway]
app       App server | your code: Node, Java, Go… [service*2]
cache     Cache [cache]
db        Database [db]
--
browser -> lb : HTTPS
lb -> web : HTTP
web -> app
app -> cache
app -> db
--
flow GET /products?id=42
browser > lb : Encrypted request arrives on port 443. The load balancer decrypts it.
lb > web : Plain HTTP inside the private network.
web > app : Nginx forwards /products/* to an application server.
app > cache : The handler looks up product 42 in the cache: miss.
app > db : SELECT * FROM products WHERE id = 42
app > web : The handler renders HTML or JSON…
web > browser : …and the response travels back, compressed with gzip or brotli.
```

### Step 6: the browser renders

The browser parses HTML into the **DOM**, CSS into the **CSSOM**, runs JavaScript, computes **layout**, and **paints** pixels. Every `<script>`, `<img>` and stylesheet triggers more requests. That's why CDNs, caching headers and bundling matter so much for perceived speed.

## Why round trips dominate latency

Notice how many round trips happen before the first useful byte arrives: DNS, TCP, TLS, then the request itself. Distance sets a hard floor. Light in fibre travels about **200 km per millisecond**, so a round trip from Mumbai to Virginia (~13,000 km each way) can never be faster than ~130 ms.

```js run title="Time to first byte for a new HTTPS connection"
// Every step that needs a round trip pays the full distance twice.
function firstByteMs({ rtt, dnsCached, tlsVersion, serverMs }) {
  const dns = dnsCached ? 0 : rtt;                 // resolver usually nearby; say 1 RTT
  const tcp = rtt;                                 // SYN → SYN-ACK
  const tls = tlsVersion === "1.3" ? rtt : 2 * rtt;
  const request = rtt;                             // GET → first byte back
  return dns + tcp + tls + request + serverMs;
}

for (const [where, rtt] of [["same city", 5], ["same continent", 40], ["other side of the world", 200]]) {
  const cold = firstByteMs({ rtt, dnsCached: false, tlsVersion: "1.2", serverMs: 30 });
  const warm = firstByteMs({ rtt, dnsCached: true, tlsVersion: "1.3", serverMs: 30 });
  console.log(`${where.padEnd(24)} cold: ${cold} ms   warm (cached DNS, TLS 1.3): ${warm} ms`);
}
```

This is the reason behind several big design ideas you'll meet soon:

- **CDNs and edge servers** put content physically close to users, shrinking the RTT itself.
- **Connection reuse** (keep-alive, HTTP/2 multiplexing, connection pools between services) pays the handshakes once instead of on every request.
- **Fewer round trips per page** (batching API calls, server-side rendering) matters more than raw bandwidth for most pages.

:::interview How deep should you go?
In an interview, give the short version first: *"DNS lookup, TCP handshake, TLS handshake, HTTP request, server processing, response, rendering."* Then offer to go deeper into whichever part they care about. If you're asked as a system design warm-up, mention **caching at every layer** (browser, DNS, CDN, server cache) and **load balancing**, because that's where they're heading.
:::

## Stateless HTTP, stateful apps

:::def Stateless protocol
Each HTTP request stands alone. The server doesn't remember previous requests from the same client by default. Anything that must persist between requests (who is logged in, what is in the cart) has to travel **with** each request (a cookie or token) or live in shared storage the server can look up.
:::

This property turns out to be a gift for scaling. If any server can handle any request, you can add servers freely and put a load balancer in front. You'll see this again in the scaling journey at the end of this module.

```quiz
? Which step translates `shop.example.com` into an IP address?
- TCP
+ DNS
- TLS
- HTTP
> DNS (the Domain Name System) resolves names to IP addresses, with caching at the browser, OS and resolver levels.

? Why is HTTPS to a far-away server slow even on a very fast connection?
- Encryption is very CPU-intensive
+ Each handshake (TCP, TLS) and the request itself costs a full round trip, and round-trip time is limited by the speed of light over the distance
- HTTPS packets are larger than HTTP packets
> Latency is dominated by round trips. Bandwidth doesn't help: the signal still has to cross the distance several times.

? A URL shortener wants to count every click on a short link. Which redirect status should it return?
- 301 Moved Permanently
+ 302 Found (a temporary redirect)
- 404 Not Found
> Browsers cache a 301 and skip your server on the next click. A 302 makes every click come back through your servers, so you can count it (at the cost of more traffic).

? The part of a URL after `#` (the fragment) is…
- sent to the server as a query parameter
+ handled by the browser only, and never sent to the server
- used by DNS
> Fragments identify a position inside the page. Browsers keep them client-side.
```

:::keypoints
- The web is **request → response**: clients ask, servers answer. A server is a role, identified by **IP address + port**.
- Typing a URL triggers: **DNS** lookup → **TCP** handshake → **TLS** handshake → **HTTP** request → server processing → **response** → browser **rendering**.
- Each handshake costs a **round trip**, and distance sets a hard floor on RTT. Caching, CDNs and connection reuse exist largely to cut round trips.
- Know the HTTP methods and the status-code families, especially `301/302`, `304`, `401/403/404`, `409`, `429`, `5xx`.
- HTTP is **stateless**: state travels with each request (cookies, tokens) or lives in shared storage. That's what lets you add servers freely.
:::
