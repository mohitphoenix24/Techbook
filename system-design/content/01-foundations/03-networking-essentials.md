---
title: Networking Essentials for System Design
level: easy
time: 30
summary: The networking you actually need for design interviews: the layer model, TCP vs UDP and when to choose each, latency vs bandwidth, how HTTP/1.1, HTTP/2 and HTTP/3 (QUIC) differ, connection reuse, and why the network is never reliable.
---

You don't need to be a network engineer to design systems. You do need to understand a handful of networking ideas, because they explain why systems are built the way they are: why video calls use UDP, why services keep connection pools, and why "the network is reliable" is the first lie of distributed computing.

## The layer cake

Networks are built in **layers**. Each layer solves one problem and relies on the layer below. The classic OSI model has seven layers. Engineers mostly talk about four:

| Layer | Job | Examples | Address unit |
|---|---|---|---|
| **Application** (L7) | what the programs say to each other | HTTP, gRPC, DNS, SMTP, WebSocket | URLs, hostnames |
| **Transport** (L4) | deliver data between two programs | TCP, UDP, QUIC | ports |
| **Network** (L3) | route packets across networks | IP | IP addresses |
| **Link** (L2) | move frames on one physical network | Ethernet, Wi-Fi | MAC addresses |

:::tip Why the numbers matter in interviews
"**L4** vs **L7** load balancer" means: does it route by IP address and port only (layer 4, fast, can't see URLs), or does it understand HTTP (layer 7, can route `/api/*` and `/images/*` differently, can read cookies and headers)? You'll meet this in the load balancing lesson.
:::

## TCP vs UDP

The transport layer offers two very different deals.

:::def UDP (User Datagram Protocol)
"Send this packet and hope." No connection setup, no delivery guarantee, no ordering, no retransmission. Each datagram is independent. In exchange you get **minimal overhead and no waiting**.
:::

| | TCP | UDP |
|---|---|---|
| Connection | handshake first (1 RTT) | none, just send |
| Delivery | guaranteed: lost packets are re-sent | best effort: lost is lost |
| Order | bytes arrive in order | datagrams may arrive in any order |
| Flow / congestion control | yes, slows down to protect receiver and network | no (the application must behave) |
| Head-of-line blocking | yes: one lost packet stalls everything behind it | no |
| Overhead | 20+ byte header, ACKs | 8 byte header |
| Used by | web (HTTP/1.1, HTTP/2), databases, email, file transfer | video calls, online games, DNS queries, live streaming, QUIC/HTTP/3 |

:::analogy Registered mail vs. shouting across a room
TCP is registered mail: numbered, signed for, re-sent if lost, and delivered in order. It's slow to set up but nothing goes missing. UDP is shouting across a room: instant, and if someone misses a word, you just keep talking.
:::

**When to choose UDP:** when **fresh data beats complete data**. In a video call, a packet from 300 ms ago is useless, and waiting for it to be re-sent would freeze the picture. Better to skip it and show the next frame. The same goes for game state updates and live metrics.

**When to choose TCP:** almost everything else, wherever **every byte matters**: web pages, API calls, payments, database replication, file uploads.

### How TCP makes the network reliable

The internet only promises **best-effort** delivery. Routers drop packets when their queues are full, and packets can take different paths and arrive out of order. TCP hides all that:

1. **Sequence numbers** on every byte, so the receiver can reorder and detect gaps.
2. **Acknowledgements (ACKs)** from the receiver, and **retransmission** if an ACK doesn't arrive in time.
3. **Flow control**: the receiver advertises how much buffer space it has, so a fast sender can't overwhelm a slow receiver.
4. **Congestion control**: the sender starts slowly (**slow start**), grows its sending window while things go well, and backs off sharply on loss. That's why a brand-new connection can't use your full bandwidth straight away, and why reusing warm connections is faster.

Here's a tiny simulation of why retransmission and ordering matter. Packets are sent over a lossy network that sometimes drops and reorders them:

```js run title="Unreliable network: what UDP delivers vs what TCP delivers"
// A deterministic "random" generator so the output is the same every run
let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const message = ["Hel", "lo ", "fro", "m t", "he ", "oth", "er ", "sid", "e!"];

function network(packets) {           // drops ~20%, swaps neighbours ~25%
  const out = packets.filter(() => rand() > 0.2);
  for (let i = 0; i + 1 < out.length; i++) if (rand() < 0.25) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  return out;
}

// UDP: whatever arrives, in whatever order
const udp = network(message.map((data, seq) => ({ seq, data })));
console.log("UDP receiver:", JSON.stringify(udp.map((p) => p.data).join("")));

// TCP-like: buffer by sequence number, re-send what's missing until complete
const got = new Map();
let rounds = 0;
while (got.size < message.length) {
  rounds++;
  const missing = message.map((data, seq) => ({ seq, data })).filter((p) => !got.has(p.seq));
  for (const p of network(missing)) got.set(p.seq, p.data);    // ACK what arrived
}
const tcp = [...got.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d).join("");
console.log("TCP receiver:", JSON.stringify(tcp), `(complete after ${rounds} rounds of retransmission)`);
```

Notice the price of reliability: extra **round trips** whenever something is lost. On a lossy mobile network that's the latency you feel.

## Latency vs bandwidth

These two are constantly confused, and interviewers notice.

:::def Latency
How long **one** piece of data takes to get from A to B, usually measured as **round-trip time (RTT)**. It's set by distance, the number of hops and queuing. You can't buy your way below the speed of light.
:::

:::def Bandwidth (throughput)
How **much** data can flow per second, for example 1 Gbps. It's set by the capacity of the links. You *can* buy more of it.
:::

:::analogy A highway
Bandwidth is the number of lanes. Latency is the length of the road. Adding lanes lets more cars travel at once, but each car still needs the same time to drive the distance.
:::

Time to transfer a file ≈ **latency + size ÷ bandwidth**. For small things (an API response of 2 KB) latency dominates completely. For big things (a 4 GB video) bandwidth dominates.

```js run title="Small responses are latency-bound, large ones are bandwidth-bound"
const transferMs = (bytes, rttMs, mbps) => rttMs + (bytes * 8) / (mbps * 1e6) * 1000;

const sizes = [["2 KB JSON", 2e3], ["500 KB image", 500e3], ["50 MB file", 50e6]];
for (const [name, bytes] of sizes) {
  const slowFar = transferMs(bytes, 150, 1000).toFixed(1);   // 1 Gbps, far away
  const fastNear = transferMs(bytes, 10, 100).toFixed(1);    // 100 Mbps, nearby
  console.log(`${name.padEnd(13)} far + 1 Gbps: ${slowFar.padStart(7)} ms   near + 100 Mbps: ${fastNear.padStart(7)} ms`);
}
```

The 2 KB response is **15× faster** from a nearby server on a slower link. That's the whole business case for CDNs and edge computing.

## HTTP/1.1, HTTP/2 and HTTP/3

| | HTTP/1.1 (1997) | HTTP/2 (2015) | HTTP/3 (2022) |
|---|---|---|---|
| Transport | TCP | TCP | **QUIC over UDP** |
| Format | text | binary frames | binary frames |
| Requests per connection | one at a time (browsers open ~6 connections per host) | **many in parallel** (multiplexed streams) | many in parallel |
| Header compression | none | HPACK | QPACK |
| Head-of-line blocking | at the HTTP level and the TCP level | TCP level only: one lost packet stalls all streams | **none**: streams are independent |
| Handshake | TCP + TLS (2–3 RTT) | TCP + TLS | QUIC combines them (1 RTT, 0-RTT on resume) |
| Connection migration (Wi-Fi → 4G) | no, reconnect | no | **yes**, by connection ID |

:::def Head-of-line (HOL) blocking
When one slow or lost item at the front of a queue holds up everything behind it. In HTTP/1.1, a slow response blocks the next request on that connection. In HTTP/2, one lost TCP packet blocks every stream, because TCP must deliver bytes in order. QUIC fixes this by giving each stream its own ordering.
:::

:::note Why QUIC runs on UDP
QUIC re-implements reliability, ordering and congestion control **per stream**, inside the application, on top of UDP. Building it on UDP was the only practical way: every router and firewall on the internet already passes UDP, while deploying a brand-new transport protocol would take decades.
:::

## Keep connections warm

Opening a connection is expensive: TCP and TLS handshakes plus slow start. So real systems avoid doing it per request:

- **HTTP keep-alive**: reuse one TCP connection for many requests.
- **Connection pools** between services and to databases: a service keeps, say, 50 open connections to Postgres and lends them out. Opening a Postgres connection can take several milliseconds and costs memory on the database, so pools also **cap** how many connections the database must handle.
- **Long-lived multiplexed connections** (HTTP/2, gRPC) between internal services.

:::warn Connection limits are a real bottleneck
A database like PostgreSQL handles a few hundred connections comfortably, not 50,000. If 500 app servers each open 100 connections, the database falls over before CPU is the problem. The fix is a **connection pooler** (like PgBouncer) in between. It's a classic deep-dive point.
:::

## The network is not reliable

In 1994, engineers at Sun listed the **fallacies of distributed computing**, false assumptions that every newcomer makes. They are worth memorising, because every one of them causes production outages:

1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.

The practical consequence: **any remote call can fail, hang, or succeed without you hearing back.** Your design must handle all three. You'll learn the tools in later lessons: **timeouts**, **retries with backoff**, **idempotency**, and **circuit breakers**.

```viz algo=seq title="The three outcomes of every remote call"
participant a Service A [service]
participant b Service B [service]
== 1. success ==
a -> b : charge($20)
b --> a : OK
== 2. request lost: B never saw it ==
a -x b : charge($20) | The packet was dropped. B did nothing.
note a : timeout… was it charged? A can't tell
== 3. response lost: B did the work ==
a -> b : charge($20)
b -x a : OK | B charged the card, but the reply was lost.
note a : timeout… retrying would charge twice!
```

Cases 2 and 3 look **identical** to A. This is why safe retries need **idempotency keys**, which you'll learn in the API design lesson.

```quiz
? A multiplayer game sends each player's position 30 times per second. Which transport fits best?
- TCP, because positions must never be lost
+ UDP, because a newer update replaces a lost one and waiting for retransmission would add lag
- HTTP/1.1, because every browser supports it
> When fresh data beats complete data, UDP is the right choice. A lost position is immediately replaced by the next one.

? Your API responses are 3 KB, and users far from your data centre complain about slowness. What helps most?
- Buying more bandwidth for the data centre
+ Reducing round trips and serving from locations closer to users (CDN or edge, connection reuse)
- Compressing the responses harder
> Small responses are latency-bound. Latency is set by distance and round trips, not bandwidth.

? What problem does HTTP/3 (QUIC) solve that HTTP/2 still has?
- Requests can't be sent in parallel
- Headers aren't compressed
+ One lost packet stalls all streams on the connection (TCP head-of-line blocking)
> HTTP/2 multiplexes streams over one TCP connection, and TCP delivers bytes strictly in order. QUIC gives each stream its own ordering.

? Service A calls B and times out. What can A conclude?
- B never received the request
- B received it and failed
+ Nothing certain: the request may have been lost, B may have done the work and the reply was lost, or B is just slow
> A timeout is ambiguous. That's why retries must be made safe with idempotency.
```

:::keypoints
- Think in four layers: **application (L7)**, **transport (L4)**, **network (L3)**, **link (L2)**. L4 vs L7 load balancing comes straight from this.
- **TCP** is reliable and ordered but costs handshakes and suffers head-of-line blocking. **UDP** is fast and fire-and-forget. Pick UDP when fresh data beats complete data.
- **Latency** (RTT, limited by distance) and **bandwidth** (capacity) are different. Small responses are latency-bound.
- HTTP/2 multiplexes requests over one connection. HTTP/3 runs on **QUIC over UDP** to remove TCP head-of-line blocking and speed up handshakes.
- Reuse connections (keep-alive, pools). Database connection limits are a classic bottleneck.
- The network is unreliable: every remote call can succeed, fail, or **succeed silently**. Design for timeouts, retries and idempotency.
:::
