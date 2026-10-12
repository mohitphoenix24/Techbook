---
title: Design Google Docs (Collaborative Editing)
level: advanced
time: 55
summary: Many people typing in one document at once — why naive position-based edits diverge, operational transformation (OT) with a central server ordering operations, CRDTs as the decentralised alternative, the document session server, an operation log with snapshots, cursors and presence, offline edits, and permissions.
---

:::problem Design Google Docs {level=hard tags="HLD,OT,CRDT,real-time"}
Design a collaborative document editor like Google Docs: multiple users edit the **same document at the same time** and see each other's changes and cursors within ~100 ms; everyone ends with the **same document**; full revision history; works through brief disconnections. **Tens of millions of documents**, up to ~100 simultaneous editors per document.

:::hint Hint
The hard part is not storage or scale; it's **convergence**. Two users edit "at position 4" based on different versions of the text. Either **transform** concurrent operations against each other (OT, with a server that defines one order), or use a data structure whose operations **commute** (CRDTs). Then route all editors of a document to one session server.
:::
:::

## 1. Requirements

**Functional**: real-time co-editing of rich text; see collaborators' cursors and selections; comments; revision history (view/restore); sharing with view/comment/edit permissions; short offline periods.

**Non-functional**
- **Convergence**: all replicas end in the same state; **intention preservation** (an insert lands where the user meant it).
- **Low latency**: local edits appear instantly (optimistic); remote edits within ~100–200 ms.
- **Durability**: no acknowledged edit is lost.
- Scale: many documents, each with a small number of concurrent editors.

## 2. Why naive edits break

Each user applies their own edit immediately, then sends `insert("black ", at 4)` to the others. But by the time it arrives, the receiver's text may have changed before position 4, so the same position means a different place. Replicas **diverge**. Locking the document (one editor at a time) avoids it but kills collaboration.

## 3. Operational transformation (OT)

OT keeps operations position-based, but **transforms** an incoming operation against the concurrent operations already applied, adjusting positions (and splitting deletes) so it keeps its intended effect. With a **central server** that assigns a single order to all operations of a document (the Jupiter/Google Wave approach used by Google Docs), each client only has to transform against the server's sequence:

```js run title="Naive position-based edits diverge; transformed edits converge"
// Operational transformation for plain text: insert and delete operations, transformed against each other
const apply = (doc, op) => op.type === "ins"
  ? doc.slice(0, op.pos) + op.text + doc.slice(op.pos)
  : doc.slice(0, op.pos) + doc.slice(op.pos + op.len);

// transform(a, b): rewrite op a so it can be applied AFTER op b has already been applied
function transform(a, b) {
  if (b.type === "ins") {
    // a starts after b's insertion point → shift right. Same position: a delete never swallows the new text;
    // two inserts at the same spot are ordered by site id so both sites agree.
    if (a.pos > b.pos || (a.pos === b.pos && (a.type === "del" || a.site > b.site))) return { ...a, pos: a.pos + b.text.length };
    if (a.type === "del" && a.pos < b.pos && a.pos + a.len > b.pos)                 // b inserted inside a's range: split around it
      return { ...a, parts: [{ ...a, len: b.pos - a.pos }, { ...a, pos: b.pos + b.text.length, len: a.len - (b.pos - a.pos) }] };
    return a;
  }
  // b is a delete of [b.pos, b.pos + b.len)
  const bEnd = b.pos + b.len;
  if (a.type === "ins") return a.pos <= b.pos ? a : { ...a, pos: a.pos >= bEnd ? a.pos - b.len : b.pos };
  const aEnd = a.pos + a.len;                                    // delete vs delete: remove the overlap only once
  const start = a.pos < b.pos ? a.pos : a.pos >= bEnd ? a.pos - b.len : b.pos;
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(a.pos, b.pos));
  return { ...a, pos: start, len: a.len - overlap };
}
const applyAll = (doc, op) => op.parts ? op.parts.reduceRight((d, p) => apply(d, p), doc) : apply(doc, op);

function scenario(title, base, opA, opB) {
  const naiveA = apply(apply(base, opA), opB), naiveB = apply(apply(base, opB), opA);   // apply the other's op unchanged
  const otA = applyAll(apply(base, opA), transform(opB, opA));                            // site A: my op, then theirs transformed
  const otB = applyAll(apply(base, opB), transform(opA, opB));
  console.log(`${title}\n  naive: A="${naiveA}"  B="${naiveB}" ${naiveA === naiveB ? "" : "✗ diverged"}`);
  console.log(`  OT:    A="${otA}"  B="${otB}" ${otA === otB ? "✓ converged" : "✗"}`);
}

const base = "the cat sat";
scenario("Ana inserts 'black ' at 4, Bo inserts ' down' at 11:", base,
  { type: "ins", pos: 4, text: "black ", site: 1 }, { type: "ins", pos: 11, text: " down", site: 2 });
scenario("Ana deletes 'cat ' (4..8), Bo inserts 'fat ' at 4:", base,
  { type: "del", pos: 4, len: 4, site: 1 }, { type: "ins", pos: 4, text: "fat ", site: 2 });
scenario("Both delete overlapping ranges ('the cat' and 'cat sat'):", base,
  { type: "del", pos: 0, len: 7, site: 1 }, { type: "del", pos: 4, len: 7, site: 2 });
scenario("Ana deletes 'cat sat', Bo inserts 'big ' inside it at 8:", base,
  { type: "del", pos: 4, len: 7, site: 1 }, { type: "ins", pos: 8, text: "big ", site: 2 });
```

The client protocol: apply local edits immediately; send them with the **revision number** they were based on; keep at most one operation in flight (buffer the rest); when the server acknowledges, send the next; transform incoming server operations against your pending local ones. The server transforms each incoming operation against everything committed since its base revision, assigns the next revision, persists it, and broadcasts it.

## 4. CRDTs: the decentralised alternative

A **sequence CRDT** (RGA, Logoot, YATA as used by Yjs, Automerge's list type) gives every character a **unique, ordered id** (e.g. site id + counter, placed relative to its neighbour) instead of an index. Inserts and deletes refer to ids, so they **commute**: replicas can apply them in any order and still converge, with no central server, and offline editing is natural. Costs: per-character metadata (ids, tombstones for deletes), more memory, and garbage collection of tombstones. The Project Lab builds a CRDT editor.

| | OT | CRDT |
|---|---|---|
| Needs a central order | yes (practically) | no: peer-to-peer and offline-first friendly |
| Metadata | small (positions) | ids per element, tombstones |
| Complexity | transformation functions are subtle (many edge cases) | data structure design is subtle |
| Used by | Google Docs, Office Online | Figma (CRDT-inspired), Yjs/Automerge apps, Apple Notes |

## 5. High-level design

```viz algo=arch title="Collaborative editor" dir=down
ana      Ana's browser [browser] @0,0
bo       Bo's browser [browser] @0,2
lb       Gateway | route by document id [lb] @1,1
sess     Session server | doc 42: order + transform [service] @2,1
oplog    Operation log | per document [stream] @3,0.4
snap     Snapshots | every N ops [storage] @3,1.6
meta     Docs + permissions [db] @2,2.4
--
ana <-> lb : WebSocket ops
bo <-> lb : WebSocket ops
lb -> sess : sticky to doc owner
sess -> oplog : append rev 1043
sess ~> snap : periodic snapshot
sess -> meta : check access
--
flow Concurrent edits
ana > lb : Ana types: insert("black ", 4) based on rev 1042; it's applied locally at once.
bo > lb : Bo, also at rev 1042, inserts " down" at 11.
lb > sess : Both ops reach the session server for doc 42 (one owner per document).
sess > oplog : Ana's op arrives first → rev 1043, persisted. Bo's op is transformed against 1043 (→ position 17) → rev 1044.
sess > lb : Broadcast: Bo receives 1043 (transformed against his pending op), Ana receives 1044 and acks for her own.
flow Opening a document
bo > lb : Bo opens doc 42.
lb > sess : Routed to the doc's session server (loaded on first open).
sess > snap : It loads the latest snapshot (rev 1000)…
sess > oplog : …and replays ops 1001–1044 to reach the current state, then streams new ops to Bo.
```

## 6. Deep dives

### A. One owner per document

All operations for a document must be ordered by one place. Route every connection for document 42 to the **same session server** (consistent hashing on the document id, with a lease/registry so ownership is exclusive). It keeps the document in memory, transforms and sequences operations, appends them to the **operation log** (durable before acknowledging), and broadcasts. If it dies, another server takes the lease, rebuilds from snapshot + log, and clients reconnect and resend un-acked operations (idempotent by client op id).

### B. Storage: operation log + snapshots

The **operation log** (rev → op, author, timestamp) is the source of truth and gives revision history for free. Replaying from the beginning is slow, so write a **snapshot** every N operations; loading = latest snapshot + the ops after it. Old revisions can be compacted into coarser history checkpoints.

### C. Cursors, presence and comments

Cursors and selections are **ephemeral** state broadcast through the same session (not stored in the log), throttled to a few updates per second. Cursor positions are transformed like operations, so they stay attached to the right text. Comments are anchored to ranges that are transformed as the text changes.

### D. Offline and reconnection

A client that was disconnected keeps editing locally, then sends its buffered operations based on its last known revision; the server transforms them against everything that happened since. Long offline periods with heavy concurrent changes are where CRDTs shine.

### E. Scale

Documents are independent, so the system scales by **spreading documents** across session servers; only very large meetings (hundreds of editors) stress a single document, mitigated by batching operations and throttling presence. Read-only viewers can be served from snapshots + a broadcast fan-out tier.

## 7. Wrap-up

Clients edit optimistically and exchange operations over WebSockets; a **single session server per document** orders, **transforms (OT)**, persists to an **operation log** and broadcasts; **snapshots** speed up loading; cursors are ephemeral and transformed; failover rebuilds from snapshot + log. **CRDTs** are the alternative when you need offline-first or peer-to-peer. Monitor op latency, ops/s per document, session failovers, and log/snapshot lag.

```quiz
? Two users insert text at the same moment, each based on revision 1042. Why can't the server just apply both as sent?
+ The second insert's position refers to the old text; after the first insert, it points to a different place, so replicas diverge
- Servers can only apply one operation per second
- Inserts can't be concurrent
> Transform positions (OT) or use position-independent ids (CRDT).

? Why route all editors of one document to the same session server?
+ OT needs one authority to define a single order of operations for the document
- To save memory
- WebSockets can't cross servers
> One owner per document, with leases for failover.

? What's a key advantage of CRDTs over OT?
+ Operations commute, so replicas converge without a central server, which suits offline and peer-to-peer editing
- They use less memory
- They need no metadata
> The price is per-element ids and tombstones.
```

:::keypoints
- Naive position-based edits **diverge**; collaborative editing needs **OT** or **CRDTs**.
- **OT**: transform concurrent ops (shift positions, split deletes, tie-break by site); a **central server per document** defines the order; clients keep one op in flight.
- **CRDTs**: unique ids per element make operations commute: no central order, offline-friendly, more metadata.
- Store an **operation log** (history) + periodic **snapshots**; acknowledge after persisting.
- Cursors/presence are ephemeral and transformed; failover via leases and replay; scale by spreading documents.
:::
