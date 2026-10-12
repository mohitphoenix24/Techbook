---
title: Build an Event-Sourced Bank
level: advanced
time: 60
icon: file
cover: #1d4ed8,#22c55e
tags: event sourcing, CQRS, sagas, idempotency, optimistic concurrency
summary: Model bank accounts as streams of events instead of rows — command handlers that enforce invariants, an event store with optimistic concurrency, state rebuilt by replay, then transfers as sagas with compensation, idempotent commands, CQRS read models fed by the log, snapshots, an invariant check, and balance-as-of-any-time queries.
---

In most systems the database stores the **current state** and history is lost. **Event sourcing** stores the **history** (every fact that happened) and derives the current state from it. Banks, ledgers, carts and workflow engines love this: you get a perfect audit trail, time travel, and new read models from old data for free. You pay with more moving parts. You'll build it all and see both sides.

:::flow What you'll build
Events + replay | state = fold(apply, events)
Commands | validate invariants, then emit events
Event store | streams with expected-version appends
Sagas | transfers across two accounts with compensation
Projections | read models updated from the log
Snapshots + time travel | fast loads; balance as of any position
:::

## Step 1: an event-sourced account

Commands express **intent** ("withdraw 30") and may be rejected; events record **facts** ("30 was withdrawn") and are never changed. The account's state is whatever you get by applying its events in order. Appends carry the **expected version**, so two concurrent writers can't both succeed based on the same state.

```js run title="Commands, events, replay and optimistic concurrency"
// Step 1: an event-sourced account — commands are validated, facts are stored as events, state is a replay
class EventStore {
  streams = new Map();                                  // streamId → [event]
  append(streamId, expectedVersion, events) {           // optimistic concurrency: fail if someone wrote in between
    const s = this.streams.get(streamId) || [];
    if (s.length !== expectedVersion) throw new Error(`concurrency conflict on ${streamId}: expected v${expectedVersion}, found v${s.length}`);
    this.streams.set(streamId, [...s, ...events.map((e, i) => ({ ...e, version: expectedVersion + i + 1 }))]);
  }
  read(streamId) { return this.streams.get(streamId) || []; }
}

// The aggregate: state is derived ONLY by applying events
const initial = { open: false, balance: 0, owner: null };
function apply(state, e) {
  switch (e.type) {
    case "AccountOpened": return { ...state, open: true, owner: e.owner };
    case "MoneyDeposited": return { ...state, balance: state.balance + e.amount };
    case "MoneyWithdrawn": return { ...state, balance: state.balance - e.amount };
    case "AccountClosed": return { ...state, open: false };
  }
}
const load = (store, id) => { const events = store.read(id); return { state: events.reduce(apply, initial), version: events.length }; };

// Command handlers: check invariants against current state, then emit events (never mutate state directly)
function handle(store, id, cmd) {
  const { state, version } = load(store, id);
  const emit = (...events) => { store.append(id, version, events); return events.map((e) => e.type).join(", "); };
  switch (cmd.type) {
    case "Open": if (state.open) throw new Error("already open"); return emit({ type: "AccountOpened", owner: cmd.owner });
    case "Deposit": if (!state.open) throw new Error("account closed"); return emit({ type: "MoneyDeposited", amount: cmd.amount });
    case "Withdraw":
      if (cmd.amount > state.balance) throw new Error(`insufficient funds: balance ${state.balance}, requested ${cmd.amount}`);
      return emit({ type: "MoneyWithdrawn", amount: cmd.amount });
    case "Close": if (state.balance !== 0) throw new Error("balance must be zero to close"); return emit({ type: "AccountClosed" });
  }
}

const store = new EventStore();
const run = (cmd) => { try { console.log(`${cmd.type.padEnd(8)} → ${handle(store, "acc-1", cmd)}`); } catch (e) { console.log(`${cmd.type.padEnd(8)} ✗ ${e.message}`); } };
run({ type: "Open", owner: "Ana" });
run({ type: "Deposit", amount: 100 });
run({ type: "Withdraw", amount: 30 });
run({ type: "Withdraw", amount: 500 });
run({ type: "Close" });
console.log("events:", store.read("acc-1").map((e) => `v${e.version} ${e.type}${e.amount ? " " + e.amount : ""}`).join(" | "));
console.log("current state (replayed):", load(store, "acc-1").state);

// Two tellers load the same version and both try to withdraw 70: only one append can win
const a = load(store, "acc-1"), b = load(store, "acc-1");
store.append("acc-1", a.version, [{ type: "MoneyWithdrawn", amount: 70 }]);
try { store.append("acc-1", b.version, [{ type: "MoneyWithdrawn", amount: 70 }]); } catch (e) { console.log("teller B:", e.message, "→ reload and re-validate"); }
console.log("balance:", load(store, "acc-1").state.balance);
```

## Step 2: a bank with transfers, projections and snapshots

A transfer touches **two** accounts (two aggregates, two streams), and there is no transaction across them. It runs as a **saga**: debit the source, then credit the destination; if the credit fails, **compensate** by refunding the source. Every step has an id, so retries are harmless. Read models (**projections**) subscribe to the log; here one maintains balances and another checks that money is never created or destroyed.

```js run title="Sagas, idempotency, projections, snapshots and time travel"
// Step 2: a small bank — transfers as sagas, idempotent commands, CQRS projections, snapshots, time travel
class EventStore {
  log = [];                                             // the global, ordered log (position = index + 1)
  versions = new Map();
  subscribers = [];
  append(stream, expected, events) {
    const v = this.versions.get(stream) || 0;
    if (v !== expected) throw new Error(`conflict on ${stream}`);
    for (const e of events) {
      const rec = { ...e, stream, version: (this.versions.get(stream) || 0) + 1, position: this.log.length + 1 };
      this.versions.set(stream, rec.version);
      this.log.push(rec);
      this.subscribers.forEach((fn) => fn(rec));        // projections update asynchronously in real systems
    }
  }
  read(stream, fromVersion = 0) { return this.log.filter((e) => e.stream === stream && e.version > fromVersion); }
}

const apply = (s, e) => {
  switch (e.type) {
    case "Opened": return { ...s, open: true };
    case "Credited": return { ...s, balance: s.balance + e.amount };
    case "Debited": return { ...s, balance: s.balance - e.amount };
    case "Closed": return { ...s, open: false };
    default: return s;
  }
};
const EMPTY = { open: false, balance: 0 };

class Bank {
  constructor() { this.store = new EventStore(); this.snapshots = new Map(); this.processed = new Set(); this.replayed = 0; }
  load(id) {                                            // snapshot + the events after it
    const snap = this.snapshots.get(id) || { state: EMPTY, version: 0 };
    const tail = this.store.read(id, snap.version);
    this.replayed += tail.length;
    const state = tail.reduce(apply, snap.state);
    const version = snap.version + tail.length;
    if (tail.length >= 20) this.snapshots.set(id, { state, version });   // snapshot every ~20 events
    return { state, version };
  }
  exec(cmdId, id, fn) {                                 // idempotent: a retried command id is ignored
    if (this.processed.has(cmdId)) return "duplicate ignored";
    const { state, version } = this.load(id);
    const events = fn(state);
    this.store.append(id, version, events);
    this.processed.add(cmdId);
    return "ok";
  }
  open(id) { return this.exec(`open-${id}`, id, () => [{ type: "Opened" }]); }
  close(id) { return this.exec(`close-${id}`, id, (s) => { if (s.balance) throw new Error("balance not zero"); return [{ type: "Closed" }]; }); }
  deposit(cmdId, id, amount) { return this.exec(cmdId, id, (s) => { if (!s.open) throw new Error(`${id} is closed`); return [{ type: "Credited", amount, reason: "deposit" }]; }); }
  // A transfer touches two aggregates: no shared transaction, so run it as a saga with compensation
  transfer(tid, from, to, amount) {
    try {
      this.exec(`${tid}:debit`, from, (s) => {
        if (s.balance < amount) throw new Error(`insufficient funds in ${from}`);
        return [{ type: "Debited", amount, reason: `transfer ${tid} to ${to}` }];
      });
    } catch (e) { return `${tid} rejected: ${e.message}`; }
    try {
      this.exec(`${tid}:credit`, to, (s) => {
        if (!s.open) throw new Error(`${to} is closed`);
        return [{ type: "Credited", amount, reason: `transfer ${tid} from ${from}` }];
      });
      return `${tid} completed`;
    } catch (e) {                                       // compensate: give the money back
      this.exec(`${tid}:refund`, from, () => [{ type: "Credited", amount, reason: `refund ${tid}: ${e.message}` }]);
      return `${tid} failed at credit (${e.message}) → compensated`;
    }
  }
}

const bank = new Bank();
// Projection 1: balances (the read model a UI would query). Projection 2: money in the bank (an invariant check).
const balances = new Map();
let bankTotal = 0, externalIn = 0;
bank.store.subscribers.push((e) => {
  if (e.type === "Credited") { balances.set(e.stream, (balances.get(e.stream) || 0) + e.amount); bankTotal += e.amount; if (e.reason === "deposit") externalIn += e.amount; }
  if (e.type === "Debited") { balances.set(e.stream, (balances.get(e.stream) || 0) - e.amount); bankTotal -= e.amount; }
});

["ana", "bo", "cy"].forEach((a) => bank.open(a));
console.log(bank.deposit("dep-1", "ana", 500), bank.deposit("dep-1", "ana", 500), "(the retry of dep-1 is ignored)");
bank.deposit("dep-2", "bo", 200);
console.log(bank.transfer("t1", "ana", "bo", 120));
console.log(bank.transfer("t2", "bo", "cy", 1000));
bank.close("cy");
console.log(bank.transfer("t3", "ana", "cy", 50));
console.log(bank.transfer("t1", "ana", "bo", 120), "(retried transfer t1: both steps already processed)");
for (let i = 0; i < 60; i++) bank.transfer(`p${i}`, i % 2 ? "ana" : "bo", i % 2 ? "bo" : "ana", 1);

console.log("read model balances:", Object.fromEntries(balances));
console.log(`money in the bank ${bankTotal} = deposits ${externalIn}: ${bankTotal === externalIn ? "✓ no money created or lost" : "✗"}`);
const before = bank.replayed; bank.load("ana");
console.log(`loading ana replays ${bank.replayed - before} events thanks to a snapshot (the stream has ${bank.store.read("ana").length})`);

// Time travel: ana's balance as of any point in history, by replaying the log up to that position
const asOf = (acct, pos) => bank.store.log.filter((e) => e.stream === acct && e.position <= pos).reduce(apply, EMPTY).balance;
const t3pos = bank.store.log.find((e) => e.reason?.startsWith("refund t3")).position;
console.log(`ana as of position ${t3pos - 1}: ${asOf("ana", t3pos - 1)} (t3 debited, refund not yet applied); at ${t3pos}: ${asOf("ana", t3pos)}`);
console.log("ana's history:", bank.store.read("ana").slice(1, 5).map((e) => `${e.type} ${e.amount} (${e.reason})`).join(" · "));
```

## How it works

| Concept | Here | In production |
|---|---|---|
| Event store | array + per-stream versions | EventStoreDB, Kafka + a DB, or an `events` table with `(stream, version)` unique |
| Optimistic concurrency | `expected === current version` | conditional insert / unique constraint on (stream, version) |
| Projections | synchronous subscribers | asynchronous consumers (eventually consistent read models), rebuildable from position 0 |
| Snapshots | every ~20 events per stream | stored separately; schema-versioned |
| Sagas | try debit → credit → refund | a process manager or workflow engine (Temporal, Step Functions) with durable state |
| Idempotency | processed command ids | dedupe table / idempotency keys stored with the events |
| Time travel | replay up to a position | the same; also audits, debugging, "what-if" replays |

:::warn The costs
Event sourcing makes **schema evolution** harder (old events live forever: version them and write upcasters), **queries** need projections (you can't `SELECT … WHERE balance > 100` on events), and read models are **eventually consistent**. Use it where history and auditability matter, not for every table.
:::

:::exercise Extend it
1. Add a **daily withdrawal limit** of 1,000 per account. Which state does the aggregate need, and how is it rebuilt from events?
2. Write a new projection, **monthly statements**, and build it from the existing history without touching the write side.
3. Make projections **asynchronous**: they read the log from a stored position, and the UI shows "processing…" until the projection catches up with the command's position (read-your-writes).
4. Add **event versioning**: rename `Credited.amount` to `amountCents` and write an upcaster so old events still replay.
5. Make the saga **durable**: store its state as events in a `transfer-<id>` stream so a crash between debit and credit is resumed on restart.
:::

:::keypoints
- Store **events (facts)**, derive state by **replay**; commands are validated against current state before emitting events.
- **Expected-version appends** give optimistic concurrency per aggregate.
- Cross-aggregate operations are **sagas** with **compensation**; command ids make retries **idempotent**.
- **Projections** (CQRS read models) are built from the log and can be rebuilt any time; **snapshots** keep loading fast.
- You gain audit trails and time travel; you pay with schema evolution, projections, and eventual consistency.
:::
