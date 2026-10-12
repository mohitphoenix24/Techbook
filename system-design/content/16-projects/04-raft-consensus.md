---
title: Build Raft Consensus
level: advanced
time: 75
icon: shield
cover: #059669,#0ea5e9
tags: consensus, leader election, log replication, fault tolerance, simulation testing
summary: Implement the Raft consensus algorithm in a deterministic simulator — randomised leader elections (and what happens without randomness), then log replication with commit rules, crashes, network partitions, a stale leader that can't commit, fast log backtracking and the no-op entry, all checked against Raft's safety properties.
---

Raft is how etcd, Consul, CockroachDB, TiKV and Kafka's KRaft keep replicas consistent. Reading the paper is one thing; making it survive crashes and partitions is another. In this project you'll build Raft in a **deterministic discrete-event simulator**, the same technique (deterministic simulation testing) that FoundationDB and TigerBeetle use to find consensus bugs.

:::flow What you'll build
Simulator | an event queue with network delays, seeded randomness
Elections | terms, RequestVote, majority, randomised timeouts
Replication | AppendEntries, consistency check, commit index
Failures | leader crash, partition, healing
Safety checks | one leader per term, committed entries never change
:::

```viz algo=raft title="Raft at a glance"
```

## Step 1: leader election

Each node waits for heartbeats; if none arrive before its **election timeout**, it becomes a candidate for a new **term** and asks for votes. A node votes at most once per term; a majority makes a leader. If two candidates split the vote, nobody wins and they try again, which is why the timeout is **randomised**:

```js run title="Elections, and the effect of randomised timeouts"
// Step 1: Raft leader election only — terms, votes, heartbeats, and why timeouts are randomised
function electLeader({ jitter, seed }) {
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const events = [];                                  // [time, seq, fn] — a tiny discrete-event loop
  let now = 0, seq = 0, elections = 0, leader = null;
  const at = (t, fn) => events.push([t, seq++, fn]);
  const nodes = [0, 1, 2, 3, 4].map((id) => ({ id, term: 0, votedFor: null, votes: 0, role: "follower", timer: null }));
  const send = (fn) => at(now + 4 + rand() * 6, fn);   // 4–10 ms network delay

  function resetTimer(n) {
    const token = (n.timer = {});
    at(now + 150 + rand() * jitter, () => { if (n.timer === token && n.role !== "leader") startElection(n); });
  }
  function startElection(n) {
    elections++;
    n.role = "candidate"; n.term++; n.votedFor = n.id; n.votes = 1;
    resetTimer(n);                                     // if this election fails, try again later
    for (const p of nodes) if (p !== n) send(() => {
      if (n.term > p.term) { p.term = n.term; p.votedFor = null; p.role = "follower"; }
      const grant = n.term === p.term && (p.votedFor === null || p.votedFor === n.id);
      if (grant) { p.votedFor = n.id; resetTimer(p); }
      send(() => {                                     // the vote reply travels back
        if (grant && n.role === "candidate" && n.term === p.term && ++n.votes === 3) {
          n.role = "leader"; leader ??= { id: n.id, term: n.term, at: Math.round(now) };
        }
      });
    });
  }
  nodes.forEach(resetTimer);
  while (!leader && events.length && now < 10_000) {
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [t, , fn] = events.shift(); now = t; fn();
  }
  return { ...leader, elections };
}

console.log("first election, 5 nodes:", electLeader({ jitter: 150, seed: 7 }));
for (const jitter of [0, 5, 150]) {
  let elections = 0, time = 0, won = 0;
  for (let s = 1; s <= 200; s++) {
    const r = electLeader({ jitter, seed: s * 7919 });
    elections += r.elections; if (r.at !== undefined) { won++; time += r.at; }
  }
  console.log(`timeout 150 + random(0..${String(jitter).padEnd(3)}) ms: leader found in ${String(won).padStart(3)}/200 runs` +
    (won ? `, after ${(elections / 200).toFixed(1)} elections and ${(time / won).toFixed(0)} ms on average` : `: split votes forever (${(elections / 200).toFixed(0)} elections in 10 s)`));
}
```

With identical timeouts, all five nodes become candidates at the same moment, each votes for itself, and no one ever gets a majority. A little randomness breaks the symmetry; a range comparable to the network round trip and heartbeat interval (150–300 ms in the paper) usually elects a leader in a single round.

## Step 2: log replication, failures and safety

The leader appends client commands to its log and replicates them with **AppendEntries**, which carries the index and term of the preceding entry so followers can detect gaps and conflicts. An entry is **committed** once it's stored on a majority, and only entries from the leader's **current term** are committed by counting (older ones are committed indirectly: hence the **no-op** a new leader appends). Votes go only to candidates whose log is **at least as up to date**, which guarantees a new leader has every committed entry.

```js run title="Raft under a crash, a partition and a stale leader"
// Step 2: Raft with log replication, crashes and partitions, checked against Raft's safety properties
let seed = 2024;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

class Sim {                                           // a deterministic discrete-event simulator
  constructor() { this.now = 0; this.queue = []; this.seq = 0; }
  at(t, fn) { this.queue.push({ t, s: this.seq++, fn }); }
  run(until) {
    while (this.queue.length) {
      this.queue.sort((a, b) => a.t - b.t || a.s - b.s);
      if (this.queue[0].t > until) break;
      const e = this.queue.shift(); this.now = e.t; e.fn();
    }
    this.now = until;
  }
}

class Node {
  constructor(id, cluster) {
    Object.assign(this, { id, c: cluster, term: 0, votedFor: null, log: [], commit: 0, role: "follower", up: true, applied: [] });
    this.resetTimer();
  }
  get sim() { return this.c.sim; }
  lastTerm() { return this.log.length ? this.log[this.log.length - 1].term : 0; }
  resetTimer() {                                       // randomised election timeout: 150–300 ms
    const token = (this.timer = {});
    this.sim.at(this.sim.now + 150 + rand() * 150, () => { if (this.timer === token && this.up && this.role !== "leader") this.startElection(); });
  }
  becomeFollower(term) {
    if (this.role === "leader") this.c.event(`${this.id} sees term ${term} → steps down`);
    if (term > this.term) { this.term = term; this.votedFor = null; }
    this.role = "follower";
  }
  startElection() {
    this.role = "candidate"; this.term++; this.votedFor = this.id; this.votes = new Set([this.id]);
    this.c.event(`${this.id} times out → candidate for term ${this.term}`);
    for (const p of this.c.peers(this)) this.c.send(this, p, { type: "vote", term: this.term, lastIndex: this.log.length, lastTerm: this.lastTerm() });
    this.resetTimer();
  }
  becomeLeader() {
    this.role = "leader"; this.next = {}; this.match = {};
    for (const p of this.c.peers(this)) { this.next[p.id] = this.log.length + 1; this.match[p.id] = 0; }
    this.c.event(`${this.id} wins term ${this.term} with ${this.votes.size} votes → LEADER`);
    this.c.leaders.push({ term: this.term, id: this.id });
    this.log.push({ term: this.term, cmd: "no-op" });   // lets the new leader commit entries left over from older terms
    this.heartbeat();
  }
  heartbeat() {
    if (!this.up || this.role !== "leader") return;
    for (const p of this.c.peers(this)) this.replicate(p);
    this.sim.at(this.sim.now + 50, () => this.heartbeat());
  }
  replicate(p) {
    const prev = this.next[p.id] - 1;
    this.c.send(this, p, { type: "append", term: this.term, prev, prevTerm: prev ? this.log[prev - 1].term : 0,
      entries: this.log.slice(prev), commit: this.commit });
  }
  propose(cmd) { if (this.role !== "leader" || !this.up) return false; this.log.push({ term: this.term, cmd }); return true; }

  receive(from, m) {
    if (m.term > this.term) this.becomeFollower(m.term);
    const reply = (msg) => this.c.send(this, from, { ...msg, term: this.term });
    switch (m.type) {
      case "vote": {
        const upToDate = m.lastTerm > this.lastTerm() || (m.lastTerm === this.lastTerm() && m.lastIndex >= this.log.length);
        const grant = m.term === this.term && upToDate && (this.votedFor === null || this.votedFor === from.id);
        if (grant) { this.votedFor = from.id; this.resetTimer(); }
        return reply({ type: "voteReply", granted: grant });
      }
      case "voteReply":
        if (this.role === "candidate" && m.term === this.term && m.granted) {
          this.votes.add(from.id);
          if (this.votes.size > this.c.nodes.length / 2) this.becomeLeader();
        }
        return;
      case "append": {
        if (m.term < this.term) return reply({ type: "appendReply", ok: false });
        if (this.role !== "follower") this.becomeFollower(m.term);
        this.resetTimer();
        if (m.prev > this.log.length || (m.prev && this.log[m.prev - 1].term !== m.prevTerm)) {
          // logs don't match: hint where to retry (end of my log, or the start of the conflicting term)
          let hint = this.log.length + 1;                               // my log is too short: continue after its end
          if (m.prev <= this.log.length) {                               // term conflict: skip the whole conflicting term
            const bad = this.log[m.prev - 1].term;
            hint = m.prev;
            while (hint > 1 && this.log[hint - 2].term === bad) hint--;
          }
          return reply({ type: "appendReply", ok: false, hint });
        }
        m.entries.forEach((e, i) => {                               // drop conflicting entries, append new ones
          const idx = m.prev + i;
          if (this.log[idx] && this.log[idx].term !== e.term) this.log.length = idx;
          if (!this.log[idx]) this.log.push(e);
        });
        this.advanceCommit(Math.min(m.commit, m.prev + m.entries.length));
        return reply({ type: "appendReply", ok: true, match: m.prev + m.entries.length });
      }
      case "appendReply":
        if (this.role !== "leader" || m.term !== this.term) return;
        if (!m.ok) { this.next[from.id] = Math.max(1, Math.min(this.next[from.id] - 1, m.hint)); return; }   // back up fast
        this.match[from.id] = Math.max(this.match[from.id], m.match); this.next[from.id] = this.match[from.id] + 1;
        for (let n = this.log.length; n > this.commit; n--) {      // commit entries of MY term stored on a majority
          const count = 1 + Object.values(this.match).filter((x) => x >= n).length;
          if (count > this.c.nodes.length / 2 && this.log[n - 1].term === this.term) { this.advanceCommit(n); break; }
        }
    }
  }
  advanceCommit(n) {
    while (this.commit < n) { this.commit++; this.applied.push(this.log[this.commit - 1].cmd); this.c.checkCommitted(this, this.commit); }
  }
}

class Cluster {
  constructor(ids) { this.sim = new Sim(); this.leaders = []; this.committed = []; this.events = []; this.cut = new Set(); this.nodes = ids.map((id) => new Node(id, this)); }
  peers(n) { return this.nodes.filter((x) => x !== n); }
  event(s) { this.events.push(`${String(Math.round(this.sim.now)).padStart(5)} ms  ${s}`); }
  send(a, b, m) {
    if (!a.up || this.cut.has(`${a.id}-${b.id}`)) return;
    this.sim.at(this.sim.now + 5 + rand() * 15, () => { if (b.up && !this.cut.has(`${a.id}-${b.id}`)) b.receive(a, m); });
  }
  partition(groupA) {                                  // cut links between groupA and everyone else
    this.cut.clear();
    for (const a of this.nodes) for (const b of this.nodes) if (groupA.includes(a.id) !== groupA.includes(b.id)) this.cut.add(`${a.id}-${b.id}`);
  }
  leader() { return this.nodes.find((n) => n.up && n.role === "leader" && !this.nodes.some((m) => m.up && m.term > n.term && m.role === "leader")); }
  checkCommitted(node, idx) {                          // State Machine Safety: one value per committed index, ever
    const e = node.log[idx - 1];
    if (this.committed[idx] && this.committed[idx] !== `${e.term}:${e.cmd}`) throw new Error(`SAFETY VIOLATION at index ${idx}`);
    this.committed[idx] = `${e.term}:${e.cmd}`;
  }
}

const c = new Cluster(["n1", "n2", "n3", "n4", "n5"]);
let nextCmd = 1;
const clientWrites = (until) => {                     // a client proposes "x=k" to whoever is leader every 30 ms
  for (let t = c.sim.now; t < until; t += 30) c.sim.at(t, () => { const l = c.leader(); if (l && l.propose(`x=${nextCmd}`)) nextCmd++; });
  c.sim.run(until);
};
clientWrites(1000);
const l1 = c.leader();
c.event(`--- crash the leader ${l1.id} ---`); l1.up = false;
clientWrites(2000);
c.event(`--- partition: {n1,n2} | {n3,n4,n5}; ${l1.id} restarts ---`); l1.up = true; l1.role = "follower"; l1.resetTimer();
const l2 = c.leader();
c.partition([l2.id, l1.id]);
let stale = 0;                                        // a second client is stuck on the minority side, talking to the old leader
for (let t = c.sim.now; t < 3500; t += 30) c.sim.at(t, () => { if (l2.propose(`y=${++stale}`)) c.staleProposals = stale; });
clientWrites(3500);
c.event(`old leader ${l2.id} accepted ${stale} writes it can never commit (no majority)`);
c.event("--- heal the partition ---"); c.cut.clear();
clientWrites(5000);
c.sim.run(5500);                                      // let the last entries commit

console.log(c.events.join("\n"));
const terms = new Map();
for (const { term, id } of c.leaders) { if (terms.has(term) && terms.get(term) !== id) throw new Error("two leaders in one term"); terms.set(term, id); }
const committedCmds = c.committed.slice(1).map((x) => x.split(":")[1]);
const xs = committedCmds.filter((x) => x.startsWith("x")).length;
console.log(`\ncommitted ${xs} of ${nextCmd - 1} x-writes: the other ${nextCmd - 1 - xs} reached a leader that lost its majority before replicating them`);
console.log("(they were never acknowledged as committed, so a real client would retry them); y-writes committed:", committedCmds.filter((x) => x.startsWith("y")).length);
const minCommit = Math.min(...c.nodes.map((n) => n.commit));
console.log("logs identical on all nodes up to the commit index:", c.nodes.every((n) => JSON.stringify(n.log.slice(0, minCommit)) === JSON.stringify(c.nodes[0].log.slice(0, minCommit))));
console.log("commit index per node:", c.nodes.map((n) => `${n.id}:${n.commit}`).join(" "), "| at most one leader per term ✓ | no committed entry ever changed ✓");
```

Follow the timeline: n1 leads; when it crashes, n2 takes over in term 2. During the partition, n2 still believes it's the leader of a minority. It accepts writes, but **can never commit them**: no majority can store them. The majority side elects n4 in term 4 and keeps committing. When the partition heals, n2 sees the higher term, steps down, and its uncommitted entries are overwritten. Every committed entry stays committed, on every node.

## How it works

| Rule | Why it matters |
|---|---|
| A higher term always wins: step down and update | stale leaders stop acting as soon as they hear from the present |
| One vote per term, only for an up-to-date log | at most one leader per term, and it holds all committed entries |
| AppendEntries checks (prevIndex, prevTerm) | logs match everywhere up to the last agreed entry (Log Matching) |
| Commit by majority, own term only (+ no-op) | an entry counted as committed can never be lost by a later leader |
| Randomised election timeouts | split votes are rare and short-lived |
| Fast backtracking with a conflict hint | a follower that was away for a long time catches up in a few round trips |

:::tip Simulation testing found two real bugs here
While building this project, a fuzz test with hundreds of random crash/partition schedules found two liveness problems that the happy-path demo hid: followers with long divergent logs caught up only one entry per heartbeat (fixed with the conflict hint), and a new leader couldn't commit entries from older terms until a client happened to write (fixed with the no-op entry). Neither violated safety, but both would look like outages in production.
:::

:::exercise Extend it
1. Write the **fuzz loop** yourself: random seeds, random crashes/partitions/heals, then assert one leader per term, identical committed prefixes, and that all nodes catch up after healing.
2. Add **client sessions**: give each command a client id and sequence number, and make applying it idempotent so retried commands aren't applied twice.
3. Implement **log compaction**: snapshot the state machine every 50 entries and send `InstallSnapshot` to followers that are too far behind.
4. Add **membership changes** (joint consensus or one-server-at-a-time) to grow the cluster from 5 to 7 nodes.
5. Make reads linearizable with the **ReadIndex** technique: confirm leadership with a heartbeat round before answering.
:::

:::keypoints
- Raft = **leader election** (terms, majority votes, randomised timeouts) + **log replication** (AppendEntries consistency check, majority commit).
- **Safety**: at most one leader per term; votes only for up-to-date logs; commit only current-term entries by counting; committed entries never change.
- A **minority** leader can accept but never commit writes; a higher term makes it step down and its uncommitted entries are overwritten.
- Practical additions: **no-op on election**, **fast backtracking**, snapshots, idempotent client commands.
- **Deterministic simulation + fuzzing** finds the bugs a happy-path demo never shows.
:::
