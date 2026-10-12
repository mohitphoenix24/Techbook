---
title: Design a Chat System (WhatsApp / Messenger)
level: advanced
time: 55
summary: Real-time messaging for hundreds of millions of users — WebSocket gateways and a session registry, routing a message to the right connection, per-conversation ordering with sequence numbers, idempotent sends, sent/delivered/read receipts, offline delivery and multi-device sync, group chats, presence, and the storage layout for message history.
---

:::problem Design a Chat System {level=hard tags="HLD,WebSockets,ordering,real-time"}
Design a chat app like WhatsApp or Facebook Messenger: **1:1 and group chats** (up to 500 members), **online/last-seen presence**, **delivery and read receipts**, message history synced across a user's **phone and laptop**, and messages delivered to offline users when they come back. **500 M daily active users.**

:::hint Hint
Clients keep a persistent connection (WebSocket) to one of many gateway servers. The questions are: how a message finds the recipient's gateway, how ordering and "exactly once on screen" are guaranteed despite retries and reconnects, and how an offline device catches up.
:::
:::

## 1. Requirements

**Functional**: 1:1 and group messages (text; media via object storage); sent / delivered / read receipts; presence (online, last seen); offline delivery with push notifications; history on multiple devices.

**Non-functional**
- **Low latency**: < 200 ms end to end when both users are online.
- **Reliable**: a message acknowledged to the sender is **never lost**; it appears **once**, in a consistent **order** within a conversation.
- **Scale**: 500 M DAU, ~**50 M concurrent connections**, 40 messages per user per day.
- Highly available; presence can be approximate.

## 2. Estimates

:::derive Load
500\text{M} \times 40 / 10^5\,\text{s} = 2 \times 10^5\ \text{messages/s} \;(\text{peak} \sim 10^6) ||
\text{connections: } 5 \times 10^7 / 100\text{K per gateway} = 500\ \text{gateways} || one tuned server holds ~100K idle WebSockets
\text{storage} = 2 \times 10^{10}\ \text{msgs/day} \times 100\,\text{B} = 2\,\text{TB/day} ||
!\approx 730\,\text{TB/year (before replication)} || unless messages are deleted after delivery (WhatsApp-style)
:::

**Conclusions:** hundreds of **stateful** gateway servers; a fast lookup from user → gateway; a write-heavy, time-ordered message store (wide-column, partitioned by conversation).

## 3. API

Over the WebSocket (JSON or protobuf frames):

```text
→ send      {convId, clientMsgId, body}            ← ack {clientMsgId, seq, serverTs}
← message   {convId, seq, sender, body}             → delivered {convId, seq}   → read {convId, seq}
→ sync      {convId, afterSeq}                      ← messages[]  (catch up after reconnect)
← presence  {userId, online | lastSeen}
REST: GET /v1/conversations, GET /v1/conversations/{id}/messages?before=seq, POST /v1/media (pre-signed URL)
```

**Messages table** (Cassandra/ScyllaDB/HBase): partition key `convId`, clustering key `seq` (descending): one conversation's messages are stored together in order, so "latest 50" and "everything after seq N" are single-partition range scans. Very large group conversations add a time bucket to the partition key.

## 4. High-level design

```viz algo=arch title="Chat system" dir=down
alice    Alice's phone [mobile] @0,0
bob      Bob's devices [mobile] @0,2
lb       L4 load balancer [lb] @1,1
gw1      Gateway 1 | WebSocket [gateway] @2,0
pres     Presence [cache] @2,1
gw2      Gateway 2 | WebSocket [gateway] @2,2
chat     Chat service | order, persist, route [service*3] @3,0.7
bus      Gateway pub/sub [stream] @3,2.1
sess     Session registry | user → gateways [cache] @4,0
store    Message store | partition = convId [nosql] @4,1
push     Push service | APNs / FCM [bell] @4,2
--
alice -> lb
bob -> lb
lb -> gw1
lb -> gw2
gw1 -> chat : send
chat -> store : persist
chat -> sess : where is Bob?
chat -> bus : to gateway 2
bus -> gw2
chat ~> push : if offline
gw1 ~> pres : heartbeats
--
flow Alice → Bob, both online
alice > gw1 : Alice's phone holds a WebSocket to gateway 1. She sends {conv: c1, clientMsgId: m-77, "hi"}.
gw1 > chat : The gateway forwards it to the chat service.
chat > store : The service assigns seq 1042 in conversation c1 and persists the message (replicated)…
chat > gw1 : …then acks Alice: sent ✓ (seq 1042).
chat > sess : It looks up Bob's connected devices: phone on gateway 2.
chat > bus : It publishes to gateway 2's channel…
bus > gw2 : …gateway 2 pushes the frame down Bob's socket; Bob's app replies "delivered", which flows back to Alice: ✓✓.
flow Bob is offline
chat > sess : No live connection for Bob.
chat > push : Send a push notification ("Alice: hi") through APNs/FCM.
bob > gw2 : Later Bob opens the app, connects, and sends sync {c1, afterSeq: 1037}: the gateway returns 1038–1042 from the store.
```

```viz algo=seq title="Send, ack, deliver, read"
participant A Alice [mobile]
participant G1 Gateway 1 [gateway]
participant C Chat service [service]
participant G2 Gateway 2 [gateway]
participant B Bob [mobile]
A -> G1 : send(c1, m-77, "hi")
G1 -> C : send
C -> C : seq = 1042, persist | durable before any ack
C --> G1 : ack seq 1042
G1 --> A : sent ✓
C -> G2 : deliver (via pub/sub)
G2 -> B : message 1042
B --> G2 : delivered 1042
G2 --> A : ✓✓ (routed back the same way)
B --> G2 : read up to 1042 | one receipt covers all earlier messages
```

## 5. Deep dives

### A. Ordering, idempotency and sync

- **Order**: the server assigns a **per-conversation sequence number** (a counter in the conversation's partition, or a Snowflake-style id from the conversation's owner). Clients render by `seq`, not by arrival time or device clocks. Ordering is only needed **within** a conversation, so conversations can be spread freely across servers.
- **Idempotent sends**: the client attaches a `clientMsgId`; if the ack is lost and the client retries, the server finds the existing message and returns the same `seq`. No duplicates.
- **Sync**: each device remembers the last `seq` it has per conversation; after reconnecting it asks for "everything after N". A gap in incoming seqs (1040, then 1042) also triggers a sync. This makes delivery reliable without the server tracking every device's state precisely.

```js run title="Sequence numbers, idempotent retries and multi-device sync"
// Chat core: per-conversation sequence numbers, idempotent sends, online push vs offline sync, receipts
class ChatServer {
  convs = new Map();            // convId → { seq, members, messages: [] }   (Cassandra: partition = convId)
  online = new Map();           // deviceId → callback                        (session registry: device → gateway)
  dedup = new Map();            // `${sender}:${clientMsgId}` → seq           (makes client retries safe)

  createConv(id, members) { this.convs.set(id, { seq: 0, members, messages: [] }); }
  connect(deviceId, onMessage) { this.online.set(deviceId, onMessage); }
  disconnect(deviceId) { this.online.delete(deviceId); }

  send(convId, fromDevice, clientMsgId, text) {
    const sender = fromDevice.split("/")[0], key = `${sender}:${clientMsgId}`;
    if (this.dedup.has(key)) return { seq: this.dedup.get(key), duplicate: true };   // retry after a lost ack
    const c = this.convs.get(convId);
    const msg = { seq: ++c.seq, sender, text };          // the server assigns the order
    c.messages.push(msg);                                // persist BEFORE acking the sender
    this.dedup.set(key, msg.seq);
    for (const [device, push] of this.online)            // fan out to every member's connected devices…
      if (c.members.includes(device.split("/")[0]) && device !== fromDevice) push(convId, msg);   // …except the sender's
    // offline members would get a push notification here (APNs/FCM)
    return { seq: msg.seq, duplicate: false };
  }
  sync(convId, afterSeq) {                               // a device that was offline asks: "what's after N?"
    return this.convs.get(convId).messages.filter((m) => m.seq > afterSeq);
  }
}

class Device {
  lastSeq = 0; shown = [];
  constructor(server, id) { this.server = server; this.id = id; }
  online() { this.server.connect(this.id, (conv, m) => this.receive(m)); }
  offline() { this.server.disconnect(this.id); }
  receive(m) {
    if (m.seq <= this.lastSeq) return;                   // already have it
    if (m.seq > this.lastSeq + 1) return this.catchUp();  // a gap: fetch what's missing first
    this.lastSeq = m.seq; this.shown.push(`${m.seq}:${m.text}`);
  }
  send(clientMsgId, text) {                              // retries reuse the same clientMsgId
    const ack = this.server.send("c1", this.id, clientMsgId, text);
    this.receive({ seq: ack.seq, text });                // show my own message once the server has ordered it
    return ack;
  }
  catchUp() { for (const m of this.server.sync("c1", this.lastSeq)) this.receive(m); }
}

const s = new ChatServer();
s.createConv("c1", ["ana", "bo"]);
const anaPhone = new Device(s, "ana/phone"), boPhone = new Device(s, "bo/phone"), boLaptop = new Device(s, "bo/laptop");
anaPhone.online(); boPhone.online();                     // Bo's laptop is closed

console.log("send m-1:", anaPhone.send("m-1", "hi Bo"));
console.log("send m-2:", anaPhone.send("m-2", "lunch?"));
console.log("retry m-2 (the ack was lost):", anaPhone.send("m-2", "lunch?"));
boPhone.offline();                                       // Bo's phone loses signal
console.log("send m-3:", anaPhone.send("m-3", "12:30 at the usual place"));
boPhone.online(); boPhone.catchUp();                     // reconnect: "give me everything after seq 2"
boLaptop.online(); boLaptop.catchUp();                   // a new device syncs the history from seq 0
console.log("bo replies:", boPhone.send("m-1", "see you there"));
for (const d of [anaPhone, boPhone, boLaptop]) console.log(d.id.padEnd(9), d.shown.join(" | "));
```

### B. Routing between gateways

Gateways are **stateful** (they hold the sockets). A **session registry** (Redis: `user → [(device, gateway)]`, with TTLs refreshed by heartbeats) tells the chat service where to send. Delivery to a gateway goes through **pub/sub** (a Redis/NATS channel per gateway) or direct RPC. When a gateway dies, its clients reconnect (with jittered backoff) to another one and **sync**; nothing is lost because messages were persisted before being acked.

### C. Group chats

For groups up to a few hundred members, **fan-out on write**: one stored message (in the group's partition), then delivery to each online member's devices plus pushes for offline ones. Receipts in groups are aggregated ("read by 12"). Very large channels (broadcast lists with millions of followers) switch to **fan-out on read**: clients pull from the channel instead of receiving per-member deliveries.

### D. Presence

Online status comes from the connection itself plus **heartbeats** (every ~30 s); "last seen" is written when a connection closes or heartbeats stop. Presence is **approximate and lazy**: subscribe to presence only for contacts on screen, batch updates, and never broadcast a status change to every contact of a user with thousands of contacts.

### E. Storage and retention

Messages: wide-column store partitioned by conversation (a hot, write-heavy, append-only, time-ordered workload). Media: uploaded to object storage via pre-signed URLs; the message contains only a reference (and a thumbnail). Some apps keep history server-side forever (Messenger, Slack); WhatsApp stores messages only until delivered, keeping history on devices.

### F. End-to-end encryption (good to mention)

With E2EE (the Signal protocol), the server only routes ciphertext; keys live on devices. The design above is unchanged, but server-side search and history sync are limited, and each of a user's devices is a separate recipient.

## 6. Wrap-up

Clients ↔ **WebSocket gateways** (stateful, ~100K connections each) ↔ **chat service** (assign per-conversation seq, persist, then ack) → **session registry** lookup → **pub/sub** to the recipient's gateways, or **push notifications** if offline; **sync by last seq** heals every gap; idempotent `clientMsgId`s prevent duplicates. Monitor end-to-end delivery latency, connection counts per gateway, reconnect storms, sync volume, and push failures.

```quiz
? How does the system prevent duplicate messages when a client retries after a lost ack?
+ The client sends a clientMsgId; the server deduplicates on it and returns the original sequence number
- TCP prevents duplicates
- The recipient's app hides messages with the same text
> Idempotency keys turn at-least-once sending into exactly-once storage.

? A device was offline for a day. How does it get the messages it missed?
+ It reconnects and asks for every message after the last sequence number it has, per conversation
- The server stores a queue per device forever
- Push notifications contain the full history
> Per-conversation sequence numbers make catch-up a simple range query.

? Why partition the message store by conversation id?
+ All messages of a conversation are stored together in order, so recent history and "after seq N" are single-partition range reads
- It balances load perfectly for huge groups
- It removes the need for sequence numbers
> Very large conversations add a time bucket to keep partitions bounded.
```

:::keypoints
- Persistent **WebSocket gateways**; a **session registry** maps users/devices → gateways; **pub/sub** routes messages between gateways; **push notifications** for offline devices.
- **Persist before ack**; the server assigns a **per-conversation sequence number**; **clientMsgId** deduplicates retries.
- Devices **sync by last seq** after reconnects or gaps, which also gives multi-device history.
- Receipts flow back like messages; groups fan out on write (small) or on read (huge channels); presence is lazy and approximate.
- Messages in a wide-column store partitioned by conversation; media in object storage.
:::
