---
title: Event-Driven Architecture, Event Sourcing and CQRS
level: advanced
time: 45
summary: Commands vs events, the styles of event-driven systems (notification, event-carried state transfer), event sourcing — storing every change as an immutable event and rebuilding state from it, with C++/JS code — snapshots and projections, CQRS read models, change data capture, schema evolution, and when these patterns pay off.
---

In a request-driven system, services call each other: "Order service, please tell Billing to invoice this." In an **event-driven** system, services announce facts: "OrderPlaced", and whoever cares reacts. This lesson covers that style and two patterns built on it that come up in senior interviews: **event sourcing** and **CQRS**.

## Commands, events and queries

| Message | Meaning | Tense | Example | Who decides what happens |
|---|---|---|---|---|
| **Command** | "please do this" | imperative | `ChargeCard`, `ReserveSeat` | the sender; it expects one handler |
| **Event** | "this happened" | past tense | `CardCharged`, `SeatReserved` | the receivers; zero or many may react |
| **Query** | "tell me this" | question | `GetOrderStatus` | nobody changes state |

Events are **facts**: immutable, past tense, and owned by the service where they happened. Naming them well (`OrderShipped`, not `UpdateOrder`) is half the design.

## Two styles of events

- **Event notification**: a thin event (`OrderPlaced {orderId: 77}`). Consumers call back the producer's API if they need details. Small events, but more coupling at read time and extra load on the producer.
- **Event-carried state transfer**: a fat event with the data consumers need (`OrderPlaced {orderId, userId, items, total, address}`). Consumers keep their own local copy and never call back. More decoupled and resilient, at the cost of larger events and duplicated data.

```viz algo=arch title="Services reacting to one event"
order    Order service [service]
bus      Event bus | OrderPlaced [stream]
pay      Payment service [pay]
stock    Inventory service [box]
mail     Notification service [mail]
search   Search indexer [search]
recs     Recommendations [ai]
--
order -> bus : publish OrderPlaced
bus ~> pay
bus ~> stock
bus ~> mail
bus ~> search
bus ~> recs
```

**Benefits:** producers don't know their consumers (add recommendations next year without touching the order service); services keep working when others are down (events wait in the log); natural audit trail; easy fan-out. **Costs:** the overall flow is harder to see and debug ("what happens when an order is placed?" is spread over five services); eventual consistency everywhere; duplicates and ordering must be handled; you need tracing and good event schemas.

## Event sourcing

Most systems store **current state**: the `accounts` table holds `balance = 70`. How it got there is lost (or kept in a separate, incomplete audit log).

:::def Event sourcing
Store the **sequence of events** that changed an entity as the **source of truth**: `AccountOpened`, `Deposited(100)`, `Withdrew(30)`. The current state is **derived** by replaying the events in order (a left fold). The event log is append-only: you never update or delete history; corrections are new events.
:::

:::tabs An event-sourced bank account
```js run
// Events are immutable facts. State is a fold over them.
const events = [];
const append = (type, data) => events.push({ seq: events.length + 1, type, ...data });

function apply(state, e) {                      // pure: (state, event) → new state
  switch (e.type) {
    case "AccountOpened": return { owner: e.owner, balance: 0, status: "OPEN" };
    case "Deposited":     return { ...state, balance: state.balance + e.amount };
    case "Withdrew":      return { ...state, balance: state.balance - e.amount };
    case "AccountFrozen": return { ...state, status: "FROZEN" };
    default: return state;
  }
}
const replay = (evts, upTo = Infinity) => evts.filter((e) => e.seq <= upTo).reduce(apply, null);

// Commands validate against current state, then append events
function withdraw(amount) {
  const s = replay(events);
  if (s.status !== "OPEN") throw new Error("account is frozen");
  if (s.balance < amount) throw new Error(`insufficient funds: balance ${s.balance}, asked ${amount}`);
  append("Withdrew", { amount });
}

append("AccountOpened", { owner: "Asha" });
append("Deposited", { amount: 100 });
withdraw(30);
append("Deposited", { amount: 50 });
try { withdraw(500); } catch (e) { console.log("command rejected:", e.message); }

console.log("event log:");
for (const e of events) console.log("  ", JSON.stringify(e));
console.log("current state:", replay(events));
console.log("state as of event #3 (time travel):", replay(events, 3));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Event { int seq; string type; string owner; long amount = 0; };
struct Account { string owner; long balance = 0; string status = "NONE"; };

vector<Event> events;                           // the append-only source of truth
void append(string type, long amount = 0, string owner = "") {
    events.push_back({(int)events.size() + 1, std::move(type), std::move(owner), amount});
}

Account applyEvent(Account s, const Event& e) {     // pure: (state, event) -> new state
    if (e.type == "AccountOpened") return {e.owner, 0, "OPEN"};
    if (e.type == "Deposited") s.balance += e.amount;
    else if (e.type == "Withdrew") s.balance -= e.amount;
    else if (e.type == "AccountFrozen") s.status = "FROZEN";
    return s;
}
Account replay(int upTo = INT_MAX) {
    Account s;
    for (auto& e : events) if (e.seq <= upTo) s = applyEvent(s, e);
    return s;
}

void withdraw(long amount) {                   // commands validate, then append events
    Account s = replay();
    if (s.status != "OPEN") throw runtime_error("account is frozen");
    if (s.balance < amount)
        throw runtime_error("insufficient funds: balance " + to_string(s.balance) + ", asked " + to_string(amount));
    append("Withdrew", amount);
}

int main() {
    append("AccountOpened", 0, "Asha");
    append("Deposited", 100);
    withdraw(30);
    append("Deposited", 50);
    try { withdraw(500); } catch (const exception& e) { cout << "command rejected: " << e.what() << "\n"; }

    cout << "event log:\n";
    for (auto& e : events) cout << "   #" << e.seq << " " << e.type << (e.amount ? " " + to_string(e.amount) : "") << "\n";
    auto now = replay(), then = replay(3);
    cout << "current state: " << now.owner << " balance=" << now.balance << " " << now.status << "\n";
    cout << "state as of event #3 (time travel): balance=" << then.balance << "\n";
}
```
:::

**What you gain:**

- A **complete, trustworthy audit trail**: essential in finance, healthcare, logistics, and anything regulated.
- **Time travel**: rebuild the state at any past moment, debug "how did this get here?", reproduce bugs.
- **New views of old data**: a new feature can replay the entire history to build its own read model, as if it had existed from day one.
- Natural fit with event-driven integration: the events you store are the events you publish.

**What it costs:**

- **Replay cost** grows with history. Fix: **snapshots** (store the state every N events, replay only from the latest snapshot).
- **Querying**: "all accounts with balance > 1,000" can't be answered from an event log. You need **projections** (read models), which is CQRS.
- **Schema evolution**: events are stored forever, so old event formats must remain readable. Version events and **upcast** old versions when reading.
- **Deleting personal data** (GDPR) conflicts with immutability; techniques include crypto-shredding (encrypt per-user data and throw away the key).
- Conceptual complexity: teams must think in events. It's overkill for simple CRUD.

## CQRS

:::def CQRS (Command Query Responsibility Segregation)
Use **separate models** for **writes** (commands, validated against a model optimised for consistency) and **reads** (queries, served from one or more **read models** optimised for each query). Read models are updated from the write side's events, usually asynchronously.
:::

```viz algo=arch title="CQRS with event sourcing"
client   Client [client]
cmd      Command API | validates, appends events [service]
store    Event store | append-only [db]
bus      Event stream [stream]
proj1    Projector | balances [worker]
proj2    Projector | monthly statements [worker]
read1    Read model | balance by account (Redis) [cache]
read2    Read model | statements (Postgres) [sql]
query    Query API [service]
--
client -> cmd : Withdraw(30)
cmd -> store : append Withdrew
store ~> bus
bus ~> proj1
bus ~> proj2
proj1 -> read1
proj2 -> read2
client -> query : GET balance
query -> read1
query -> read2
```

CQRS **doesn't require** event sourcing (a normal database plus a search index or cache fed by CDC is a form of CQRS), but they pair naturally: the event store is the write model, and projections build any read models you like: a Redis key per balance, an Elasticsearch index for search, a warehouse table for analytics.

**The catch:** read models are **eventually consistent**. A user who withdraws and immediately looks at their balance might see the old value for a few hundred milliseconds. Fixes: return the new state in the command's response, read-your-writes routing, or have the client wait for the projection to reach the command's event sequence number.

## Change data capture (CDC)

You don't need event sourcing to get a stream of changes. **CDC** reads a regular database's **replication log** (Postgres WAL, MySQL binlog) and publishes every committed insert, update and delete as an event (Debezium is the standard tool). It's the reliable way to:

- Keep caches, search indexes and analytics stores in sync with the database.
- Implement the **outbox pattern** (previous module).
- Migrate data between systems with zero downtime.

## Event schemas and evolution

Events outlive the code that wrote them. Good practice:

- Use a **schema** (Avro, Protobuf or JSON Schema) and a **schema registry** that checks compatibility before a producer can publish a new version.
- Make changes **backward compatible**: add optional fields with defaults; don't rename or remove fields; create a new event type for a real change in meaning.
- Include an **event id** (for deduplication), an **entity id/key**, a **version or sequence number** (for ordering and idempotency), a **timestamp**, and the event **type and schema version**.

:::interview When event sourcing is worth proposing
Propose it for **ledgers, payments, order lifecycles, inventory movements, or any domain needing a full audit history** ("how did this balance come to be?"). Mention snapshots, projections (CQRS) and eventual consistency of reads. For a simple CRUD feature ("users update their bio"), say it would be overkill. Knowing when **not** to use a pattern is a senior signal.
:::

```quiz
? Which is an event rather than a command?
- ReserveSeat
- SendWelcomeEmail
+ PaymentCaptured
> Events are past-tense facts. Commands ask for something to happen.

? In an event-sourced system, how is an account's current balance obtained?
+ By replaying the account's events (optionally starting from a snapshot) or reading a projection built from them
- By reading the balance column that every command updates
- By asking the payment provider
> Events are the source of truth; state is derived from them.

? A user withdraws money and immediately sees the old balance in a CQRS system. Why?
- The command failed
+ The read model is updated asynchronously from events, so it lags slightly behind
- Event sourcing doesn't support balances
> Projections are eventually consistent. Return the new state from the command, or wait for the projection to catch up.

? What does change data capture (CDC) do?
+ Turns a database's committed changes (from its replication log) into a stream of events
- Captures screenshots of database dashboards
- Compresses database tables
> Tools like Debezium read the WAL/binlog and publish inserts, updates and deletes as events.
```

:::keypoints
- **Commands** request actions; **events** record past facts (zero or many reactors); **queries** read.
- Event-driven systems decouple producers from consumers and add resilience, at the cost of visibility and eventual consistency. Events can be thin (**notification**) or fat (**state transfer**).
- **Event sourcing** stores every change as an immutable event and derives state by replay: audit trail, time travel, new read models from history. Use **snapshots**, version events, and handle data deletion.
- **CQRS** separates the write model from read models fed by events; reads are eventually consistent.
- **CDC** turns a normal database's changes into events (for caches, search, outbox, migrations).
- Version event schemas with a registry and evolve them backward-compatibly.
:::
