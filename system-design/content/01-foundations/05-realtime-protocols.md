---
title: Real-Time Communication — Polling, SSE, WebSockets, Webhooks
level: easy
time: 30
summary: How a server can send data to a client the moment something happens: short polling, long polling, Server-Sent Events, WebSockets and webhooks, with the cost of each at a million users, and how WebSocket servers are scaled.
---

HTTP is client-driven: the browser asks, the server answers. But chat messages, live scores, driver locations, stock prices and notifications must reach the user **when they happen**, not when the user next asks. There are five standard ways to get there, and choosing between them is a frequent interview question.

## 1. Short polling

The client asks again and again on a timer: "anything new?"

```viz algo=seq title="Short polling every 5 seconds"
participant c Client [mobile]
participant s Server [server]
c -> s : GET /messages?since=100
s --> c : [] (nothing new)
c -> s : GET /messages?since=100 | 5 seconds later
s --> c : []
c -> s : GET /messages?since=100 | 5 seconds later
s --> c : [msg 101] | The message arrived 4 s ago: that's the delay the user saw.
```

**Pros:** trivial to build, works everywhere, stateless servers. **Cons:** most requests return nothing, yet each one costs a full HTTP request (headers, auth, a database check). Messages are delayed by up to one polling interval.

## 2. Long polling

The client asks, and the server **holds the request open** until there's something to send (or a timeout of ~30 s passes). As soon as the client gets a response, it immediately asks again.

```viz algo=seq title="Long polling"
participant c Client [mobile]
participant s Server [server]
c -> s : GET /messages?since=100 | The server doesn't answer yet…
note s : waiting… (up to ~30 s)
s --> c : [msg 101] | …it answers the instant a message arrives.
c -> s : GET /messages?since=101 | The client re-asks immediately.
note s : waiting… nothing for 30 s
s --> c : 204 (timeout, try again)
c -> s : GET /messages?since=101
```

**Pros:** near-instant delivery, still plain HTTP, works through every proxy and firewall. **Cons:** each waiting client holds a connection on the server. There's a reconnection gap after every message, so bursty traffic causes many requests. Ordering and missed messages need care (that's why the `since` parameter matters).

## 3. Server-Sent Events (SSE)

:::def Server-Sent Events
A standard where the client opens **one long-lived HTTP response** and the server keeps writing events into it, as text lines of the form `data: …`. The browser's `EventSource` API reconnects automatically and resumes from the last event id.
:::

```text
GET /events                     →   HTTP/1.1 200 OK
Accept: text/event-stream           Content-Type: text/event-stream

                                    id: 101
                                    data: {"type":"score","home":2,"away":1}

                                    id: 102
                                    data: {"type":"score","home":3,"away":1}
```

**Pros:** real push over plain HTTP, automatic reconnection with resume, very simple on both ends. **Cons:** **one direction only** (server → client); the client sends data with normal requests. It's text-only. It's perfect for **feeds, live scores, notifications, progress bars, and streaming LLM tokens**: ChatGPT-style token streaming uses SSE.

## 4. WebSockets

:::def WebSocket
A protocol that starts as an HTTP request with an `Upgrade: websocket` header and then turns the TCP connection into a **persistent, two-way, low-overhead channel**. Either side can send messages (text or binary) at any time, with only 2–14 bytes of framing per message.
:::

```viz algo=seq title="WebSocket: upgrade once, then talk both ways"
participant c Client [browser]
participant s Server [server]
c -> s : GET /chat (Upgrade: websocket) | A normal HTTP request asking to switch protocols.
s --> c : 101 Switching Protocols | From now on, the TCP connection carries WebSocket frames.
c -> s : {"send": "hi Bob"}
s --> c : {"from": "Bob", "text": "hey!"} | The server pushes whenever it wants.
s --> c : {"typing": "Bob"}
c -> s : ping
s --> c : pong | Heartbeats detect dead connections behind NATs and mobile networks.
```

**Pros:** true real-time in both directions with tiny overhead. It's the standard for **chat, multiplayer games, collaborative editing, live trading**. **Cons:** the connection is **stateful**: a particular server holds each client. That changes how you scale and deploy (see below). Some corporate proxies interfere, and you must handle reconnects and missed messages yourself.

## 5. Webhooks

The previous four push data to **users**. Webhooks push data to **other servers**.

:::def Webhook
An HTTP callback: system A lets you register a URL, and when an event happens, A sends an HTTP `POST` to that URL. Stripe tells your server "payment succeeded", GitHub tells your CI "code was pushed".
:::

Receiving webhooks well means: **verify the signature** (anyone can POST to your URL), **respond 2xx quickly** and process asynchronously, and **be idempotent**, because senders retry on failure and may deliver the same event more than once.

## Comparing the costs at scale

Suppose 1 million users have the app open, and each receives about one message per minute.

```js run title="Requests per second needed to keep 1M clients up to date"
const clients = 1_000_000;
const msgsPerClientPerMin = 1;

const shortPoll = (intervalSec) => clients / intervalSec;              // every client asks every interval
const longPoll = () => (clients * msgsPerClientPerMin) / 60 + clients / 30;   // one re-ask per message + per 30 s timeout
const push = () => (clients * msgsPerClientPerMin) / 60;             // only real messages travel

const fmt = (n) => Math.round(n).toLocaleString("en-US").padStart(9);
console.log(`short poll every 2 s : ${fmt(shortPoll(2))} req/s  (avg delay 1 s)`);
console.log(`short poll every 30 s: ${fmt(shortPoll(30))} req/s  (avg delay 15 s)`);
console.log(`long polling         : ${fmt(longPoll())} req/s  (near-instant)`);
console.log(`SSE / WebSocket push : ${fmt(push())} msgs/s (instant, but ${clients.toLocaleString("en-US")} open connections)`);
```

Short polling forces a choice between **wasted load** and **slow delivery**. Push protocols send only real data, but you pay with **a million open connections** to manage. That's a much better problem: one tuned server can hold hundreds of thousands of idle connections.

| | Short poll | Long poll | SSE | WebSocket | Webhook |
|---|---|---|---|---|---|
| Direction | client pulls | client pulls (server delays) | server → client | both ways | server → server |
| Latency | up to the interval | near-instant | instant | instant | instant |
| Connection | new each time | held until data | one long response | one persistent socket | new each event |
| Complexity | lowest | low | low | higher (stateful) | medium (retries, signatures) |
| Typical use | dashboards refreshing every minute | legacy chat, fallback | feeds, notifications, LLM streaming | chat, games, collaboration | payment and CI events |

## Scaling WebSocket servers

Stateless HTTP servers are easy to scale: any server can handle any request. WebSockets break that: user Alice's socket lives on **gateway 3**, so a message for Alice must reach gateway 3. The standard architecture separates **connection handling** from **business logic** and uses a pub/sub layer to route messages to the right gateway:

```viz algo=arch title="Routing a chat message to the right WebSocket gateway"
alice     Alice [mobile]
bob       Bob [mobile]
lb        Load balancer | L4, long-lived connections [lb]
gw1       Gateway 1 | holds Bob's socket [server]
gw3       Gateway 3 | holds Alice's socket [server]
chat      Chat service [service]
reg       Connection registry | user → gateway [cache]
pubsub    Pub/sub | e.g. Redis, Kafka [queue]
db        Message store [db]
--
bob <-> lb
alice <-> lb
lb <-> gw1
lb <-> gw3
gw1 -> chat
chat -> db
chat -> reg
chat -> pubsub
pubsub -> gw3
--
flow Bob sends "hi" to Alice
bob > gw1 : Bob's message arrives on the socket held by gateway 1.
gw1 > chat : The gateway hands it to the stateless chat service.
chat > db : Persist the message first, so it's never lost.
chat > reg : Where is Alice connected? → gateway 3.
chat > pubsub : Publish to gateway 3's channel.
pubsub > gw3 : Gateway 3 receives it…
gw3 > alice : …and writes it to Alice's open socket.
```

Key points to mention in an interview:

- **Gateways are thin**: they only hold sockets, authenticate, and forward. Business logic lives in stateless services you can scale and deploy separately.
- A **connection registry** (user → gateway, with a TTL refreshed by heartbeats) or **topic-based pub/sub** routes messages to the right gateway.
- **Load balancers** must support long-lived connections. They balance by connection count, not by request.
- **Deploys and failures** drop sockets. Clients must **reconnect with exponential backoff and jitter** (or a million phones reconnect in the same second), then **resync** missed messages using a last-seen id. The socket is a fast path, the database is the truth.
- **Heartbeats** (ping/pong every 20–30 s) detect dead connections, which mobile networks and NAT gateways create silently.

:::tip Mobile apps in the background
When a phone app is in the background, the OS kills its sockets. Notifications then go through **platform push services** (Apple APNs, Google FCM). A complete chat design uses the WebSocket when the app is open and APNs/FCM when it isn't.
:::

:::problem Live sports scores for 10 million viewers {level=easy tags="real-time,SSE,fan-out"}
During a cricket final, 10 million people have the score page open. The score changes about once every 30 seconds, and the page only displays data. Which delivery mechanism would you choose, and what does the architecture look like?

:::hint Hint
The data flows one way, and everyone receives the same update. Think about what makes fan-out to 10 million cheap.
:::

:::solution
**SSE** (or long polling as a fallback). The data is one-directional and the same for everyone, so the bidirectional WebSocket adds complexity without benefit.

Architecture: the score service publishes each update to a pub/sub topic. A fleet of SSE edge servers subscribes to the topic, and each holds ~100–200K open connections, so 10 M viewers need roughly 50–100 servers. Each update is written to every connection by the edge server that holds it.

An even cheaper alternative, since the payload is identical for everyone and 30 seconds is slow-moving: **short polling a tiny JSON file through a CDN** with a short cache time (`Cache-Control: max-age=5`). 10 M clients polling every 10 s is 1 M requests/s, but the CDN absorbs nearly all of it and the origin sees only a few requests per second. The trade-off is up to ~10–15 s of delay. Saying both options with their trade-offs is the strong answer.
:::
:::

```quiz
? An AI chat app streams the model's answer token by token to the browser. The user sends prompts with normal requests. Which protocol is the simplest good fit?
+ Server-Sent Events
- Short polling every 100 ms
- Webhooks
> The stream only flows server → client, and SSE gives push over plain HTTP with automatic reconnection. That's exactly how most LLM APIs stream.

? What makes WebSocket servers harder to scale than normal HTTP servers?
- WebSockets use more bandwidth per message
+ Each connection lives on a specific server, so messages must be routed to the server holding the recipient's socket
- WebSockets can't pass through load balancers
> Persistent connections make the gateways stateful. A registry or pub/sub layer is needed to route messages to the right gateway.

? Stripe sends your server a "payment succeeded" webhook twice. What should your handler do?
- Process both, because Stripe never sends duplicates by mistake
+ Process it idempotently (deduplicate by event id), because webhook senders retry and may deliver the same event more than once
- Return an error on the second one
> Webhook delivery is at-least-once. Handlers must verify signatures and deduplicate by event id.
```

:::keypoints
- **Short polling** is simple but wasteful or slow. **Long polling** holds the request open until there's data.
- **SSE**: one long HTTP response, server → client only, auto-reconnect. Great for feeds, notifications and LLM token streams.
- **WebSockets**: one persistent, two-way, low-overhead channel. The standard for chat, games and collaboration.
- **Webhooks**: server-to-server HTTP callbacks. Verify signatures, reply fast, process idempotently.
- Push trades request load for **open connections**. Scale WebSockets with thin gateways, a connection registry or pub/sub for routing, heartbeats, and client reconnects with backoff plus resync.
:::
