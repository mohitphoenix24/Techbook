---
title: Build a CRDT Collaborative Editor
level: advanced
time: 65
icon: puzzle
cover: #db2777,#8b5cf6
tags: CRDTs, eventual consistency, Lamport clocks, offline-first, collaborative editing
summary: Build conflict-free replicated data types from scratch — G-counters, PN-counters, last-writer-wins registers and observed-remove sets that merge in any order — then a sequence CRDT (RGA) for collaborative text with Lamport ids, tombstones and causal buffering, fuzzed across three replicas with shuffled delivery until they always converge.
---

The Google Docs case study used **operational transformation** with a central server. CRDTs take the other road: design the data so that **concurrent updates commute**. Replicas can edit offline and exchange updates in any order, any number of times, with no coordinator, and still end up identical. That's what powers Figma-style multiplayer, Automerge/Yjs apps, Riak data types and Redis Enterprise's active-active replication.

:::flow What you'll build
Counters | G-Counter, PN-Counter: merge = per-replica max
Register | last-writer-wins with tie-breaks
Set | observed-remove set: add wins over unseen removes
Sequence | RGA: unique ids, insert-after, tombstones
Delivery | buffer ops until their dependencies arrive
Fuzzing | 3 replicas, shuffled delivery, always converge
:::

## Step 1: state-based CRDTs

A state-based CRDT has a **merge** that is commutative, associative and idempotent (a join on a semilattice), so the order and repetition of merges don't matter:

```js run title="Counters, a register and a set, merged in any order"
// Step 1: state-based CRDTs — replicas update independently and merge in ANY order to the same state
class GCounter {                                       // grow-only counter: one slot per replica, merge = max
  constructor(id) { this.id = id; this.n = {}; }
  inc(k = 1) { this.n[this.id] = (this.n[this.id] || 0) + k; }
  value() { return Object.values(this.n).reduce((a, b) => a + b, 0); }
  merge(o) { for (const [r, v] of Object.entries(o.n)) this.n[r] = Math.max(this.n[r] || 0, v); }
}
class PNCounter {                                      // increments and decrements = two G-counters
  constructor(id) { this.p = new GCounter(id); this.m = new GCounter(id); }
  inc() { this.p.inc(); } dec() { this.m.inc(); }
  value() { return this.p.value() - this.m.value(); }
  merge(o) { this.p.merge(o.p); this.m.merge(o.m); }
}
class LWWRegister {                                    // last-writer-wins: highest (timestamp, replica) wins
  constructor(id) { this.id = id; this.v = null; this.ts = [0, ""]; }
  set(v, t) { this.v = v; this.ts = [t, this.id]; }
  merge(o) { if (o.ts[0] > this.ts[0] || (o.ts[0] === this.ts[0] && o.ts[1] > this.ts[1])) { this.v = o.v; this.ts = o.ts; } }
}
class ORSet {                                          // observed-remove set: each add has a unique tag
  constructor(id) { this.id = id; this.adds = new Map(); this.removed = new Set(); this.seq = 0; }
  add(x) { const tag = `${this.id}:${++this.seq}`; (this.adds.get(x) || this.adds.set(x, new Set()).get(x)).add(tag); }
  remove(x) { for (const tag of this.adds.get(x) || []) this.removed.add(tag); }       // removes only the adds it has SEEN
  has(x) { return [...(this.adds.get(x) || [])].some((t) => !this.removed.has(t)); }
  values() { return [...this.adds.keys()].filter((x) => this.has(x)).sort(); }
  merge(o) {
    for (const [x, tags] of o.adds) for (const t of tags) (this.adds.get(x) || this.adds.set(x, new Set()).get(x)).add(t);
    for (const t of o.removed) this.removed.add(t);
  }
}

// Three replicas of a shopping cart edit offline, then sync in different orders
const make = (id) => ({ likes: new PNCounter(id), title: new LWWRegister(id), cart: new ORSet(id) });
const [A, B, C] = ["A", "B", "C"].map(make);
A.likes.inc(); A.likes.inc(); B.likes.inc(); C.likes.dec();
A.title.set("Groceries", 1); B.title.set("Weekend shopping", 2);
A.cart.add("milk"); A.cart.add("eggs"); B.cart.add("bread");
// C has seen A's "eggs" and removes it; concurrently B (who hasn't seen that remove) adds eggs again
C.cart.merge(A.cart); C.cart.remove("eggs"); B.cart.add("eggs");

const mergeAll = (target, order) => { for (const r of order) for (const k of ["likes", "title", "cart"]) target[k].merge(r[k]); return target; };
const view = (r) => `likes=${r.likes.value()} title="${r.title.v}" cart=[${r.cart.values()}]`;
const x = mergeAll(make("X"), [A, B, C]), y = mergeAll(make("Y"), [C, B, A]), z = mergeAll(mergeAll(make("Z"), [B]), [C, A, B]);
console.log("merge order A,B,C:   ", view(x));
console.log("merge order C,B,A:   ", view(y));
console.log("B, then C,A,B again: ", view(z), "(merging twice changes nothing: idempotent)");
console.log("all equal:", view(x) === view(y) && view(y) === view(z));
```

Notice the cart: C removed "eggs" after seeing A's add, while B concurrently added eggs again. The OR-set keeps eggs, because a remove only cancels the **adds it has observed** ("add wins" for concurrent operations). The title shows the LWW trade-off: one concurrent write is silently discarded.

## Step 2: a sequence CRDT for text

Text needs positions that survive concurrent edits. **RGA** (Replicated Growable Array) gives every character a unique id `[lamport, site]` and records the id of the character it was inserted **after**. To integrate an insert, find that character, then skip over neighbours with **larger** ids (concurrent inserts at the same spot), so every replica orders them the same way. Deletes only mark **tombstones**, because others may still insert after a deleted character. Operations wait in a buffer until the character they depend on has arrived.

```js run title="RGA text editing: same text on every replica"
// Step 2: a collaborative text editor on a sequence CRDT (RGA) — any delivery order, same text everywhere
let seed = 99;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const cmp = (a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);   // ids: [lamport, site]
const key = (id) => `${id[0]}@${id[1]}`;

class Replica {
  constructor(site) {
    this.site = site; this.clock = 0;
    this.chars = [{ id: [0, ""], ch: "", deleted: true }];   // a head sentinel
    this.index = new Map([["0@", 0]]);
    this.buffer = [];                                    // ops waiting for what they depend on
  }
  text() { return this.chars.filter((c) => !c.deleted).map((c) => c.ch).join(""); }
  visibleId(n) {                                         // id of the n-th visible character (n = 0 → the head)
    if (n === 0) return this.chars[0].id;
    let seen = 0;
    for (const c of this.chars) if (!c.deleted && ++seen === n) return c.id;
  }
  // local edits produce operations to broadcast
  insert(pos, ch) { const op = { type: "ins", id: [++this.clock, this.site], after: this.visibleId(pos), ch }; this.apply(op); return op; }
  delete(pos) { const op = { type: "del", target: this.visibleId(pos + 1) }; this.apply(op); return op; }
  receive(op) { this.buffer.push(op); this.drain(); }
  drain() {                                              // apply every buffered op whose dependency has arrived
    for (let progress = true; progress;) {
      progress = false;
      for (let i = 0; i < this.buffer.length; i++) {
        const op = this.buffer[i], dep = op.type === "ins" ? op.after : op.target;
        if (this.index.has(key(dep))) { this.buffer.splice(i--, 1); this.apply(op); progress = true; }
      }
    }
  }
  apply(op) {
    if (op.type === "del") { this.chars[this.index.get(key(op.target))].deleted = true; return; }
    if (this.index.has(key(op.id))) return;              // already applied (idempotent)
    this.clock = Math.max(this.clock, op.id[0]);
    let i = this.index.get(key(op.after)) + 1;
    while (i < this.chars.length && cmp(this.chars[i].id, op.id) > 0) i++;   // skip concurrent inserts with bigger ids
    this.chars.splice(i, 0, { id: op.id, ch: op.ch, deleted: false });
    this.index = new Map(this.chars.map((c, j) => [key(c.id), j]));           // (a real editor uses a tree here)
  }
}

// 1) Two people type at the same spot at the same time
const ana = new Replica("ana"), bo = new Replica("bo");
const base = [..."Hi !"].map((ch, i) => ana.insert(i, ch));
base.forEach((op) => bo.receive(op));
const opsA = [..."Ana"].map((ch, i) => ana.insert(3 + i, ch));     // both insert at position 3, concurrently
const opsB = [..."Bo"].map((ch, i) => bo.insert(3 + i, ch));
opsB.forEach((op) => ana.receive(op)); [...opsA].reverse().forEach((op) => bo.receive(op));   // even out of order
console.log(`ana: "${ana.text()}"   bo: "${bo.text()}"   (words stay intact, same order on both)`);

// 2) Three replicas, 300 random edits each, every op delivered to the others in a different random order
const reps = ["r1", "r2", "r3"].map((s) => new Replica(s));
const outbox = reps.map(() => []);
for (let step = 0; step < 900; step++) {
  const r = step % 3, rep = reps[r], len = rep.text().length;
  const op = len > 0 && rand() < 0.3 ? rep.delete(Math.floor(rand() * len)) : rep.insert(Math.floor(rand() * (len + 1)), "abcdefghij"[Math.floor(rand() * 10)]);
  outbox[r].push(op);
  if (rand() < 0.1) {                                    // occasionally deliver a random subset of pending ops, shuffled
    for (let to = 0; to < 3; to++) for (let from = 0; from < 3; from++) if (from !== to) {
      const batch = outbox[from].filter(() => rand() < 0.5);
      for (let i = batch.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [batch[i], batch[j]] = [batch[j], batch[i]]; }   // shuffle
      batch.forEach((o) => reps[to].receive(o));
    }
  }
}
for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) if (from !== to)        // final sync, reversed order
  [...outbox[from]].reverse().forEach((o) => reps[to].receive(o));
const texts = reps.map((r) => r.text());
console.log(`3 replicas × 300 edits: converged = ${texts.every((t) => t === texts[0])}, length ${texts[0].length}, ` +
  `tombstones ${reps[0].chars.filter((c) => c.deleted).length - 1}, starts "${texts[0].slice(0, 24)}…"`);
```

## How it works

| Property | How it's achieved |
|---|---|
| Convergence | merges commute (state CRDTs) or operations commute (RGA's deterministic ordering by id) |
| Idempotence | merges use max/union; operations are keyed by unique ids and applied once |
| Causality | a buffer delays ops until their dependency (the `after` or delete target) exists |
| Intention | an insert stays right after the character the user saw; concurrent runs stay intact |
| Cost | ids per element and **tombstones** that grow forever unless garbage-collected |

| | OT (Google Docs) | CRDT (this project) |
|---|---|---|
| Coordination | a central server orders operations | none: any topology, offline-first |
| Metadata | positions only | ids per element, tombstones |
| Typical use | server-centric editors | local-first apps, multi-region replication, peer-to-peer |

:::exercise Extend it
1. Make the editor efficient: replace the array + rebuilt index with a **balanced tree** or a list of runs (consecutive characters from the same site), as Yjs does.
2. Implement **tombstone garbage collection**: once every replica has acknowledged an operation (track a version vector per replica), physically remove tombstones older than that.
3. Add an **LWW-element map** (a JSON object CRDT) and use it for document title and settings.
4. Write a **delta-state** version of the G-Counter that ships only changed slots, and measure bandwidth.
5. Add **undo**: implement it as a new inverse operation (re-insert or delete), never by removing history.
:::

:::keypoints
- CRDTs converge without coordination because merges/operations are **commutative, associative and idempotent**.
- Counters merge per-replica maxima; **OR-sets** let adds win over unseen removes; **LWW** registers are simple but drop concurrent writes.
- Sequence CRDTs (RGA, YATA) use **unique ids + insert-after + deterministic ordering**, with **tombstones** for deletes.
- Ops need **causal delivery** (buffer until dependencies arrive); duplicates are harmless.
- The cost is metadata and tombstones; real libraries compress runs and garbage-collect.
:::
