---
title: Distributed Transactions — 2PC, Sagas and the Outbox
level: advanced
time: 50
summary: Keeping data consistent when one business operation spans several services or databases — two-phase commit and why it blocks, sagas with compensating actions (orchestration vs choreography), the transactional outbox pattern and change data capture, idempotent consumers, and TCC reservations.
---

Inside one database, a transaction makes "debit the wallet, create the order, reserve the stock" all-or-nothing. But in a microservice system, the **wallet**, **orders** and **inventory** each have their own database. A single business operation now spans several independent systems, and any of them can fail halfway. How do you avoid charging a customer for an order that was never created? This is one of the most common deep dives in interviews about e-commerce, payments, travel booking and food delivery.

```viz algo=arch title="One checkout, three services, three databases"
client   Client [mobile]
order    Order service [service]
pay      Payment service [pay]
inv      Inventory service [box]
odb      Orders DB [db]
pdb      Payments DB [db]
idb      Inventory DB [db]
--
client -> order : POST /checkout
order -> odb
order -> pay : charge ₹1,299
order -> inv : reserve 1 × SKU 88
pay -> pdb
inv -> idb
```

There are two families of solutions: **atomic commit protocols** (two-phase commit), which try to make it a real transaction, and **sagas**, which accept that it isn't one and **compensate** instead.

## Two-phase commit (2PC)

:::def Two-phase commit
A protocol where a **coordinator** asks every participant to **prepare** (do all the work, write it durably, lock what's needed, and promise it *can* commit). If **all** vote yes, the coordinator tells everyone to **commit**; if **any** votes no (or times out), it tells everyone to **abort**.
:::

```viz algo=seq title="Two-phase commit"
participant c Coordinator [service]
participant o Orders DB [db]
participant p Payments DB [db]
participant i Inventory DB [db]
== phase 1: prepare ==
c -> o : PREPARE tx 77
c -> p : PREPARE tx 77
c -> i : PREPARE tx 77
o --> c : YES (locked, logged)
p --> c : YES (locked, logged)
i --> c : YES (locked, logged) | Every participant has promised it can commit; none may back out now.
c -> c : write "COMMIT tx 77" to its log | The decision point.
== phase 2: commit ==
c -> o : COMMIT
c -> p : COMMIT
c -> i : COMMIT
note c : all three commit; locks are released
```

It gives real atomicity, and it's used **inside** distributed databases (Spanner, CockroachDB, and between partitions of a single database system) and by XA transactions. But across independent services it has serious problems:

- **Blocking**: if the coordinator crashes after participants voted YES but before sending the decision, participants are stuck **holding locks**, unable to commit or abort on their own, until the coordinator recovers. That can halt a part of the system.
- **Latency and throughput**: two round trips plus forced log writes on every participant, with locks held throughout.
- **Availability**: every participant must be up; any one being slow slows everyone.
- **Coupling**: every service must support the same transaction protocol, which most modern services, queues and third-party APIs (like a card processor) don't.

(**Three-phase commit** adds a pre-commit phase to reduce blocking, but it's not safe under network partitions and is rarely used. Running the coordinator itself on consensus, as Spanner does, is the practical fix.)

:::tip Where 2PC belongs
Within a single distributed database that implements it for you, 2PC is great: you just write `BEGIN … COMMIT`. **Between microservices** you own, prefer sagas.
:::

## Sagas

:::def Saga
A sequence of **local transactions**, one per service. Each step commits on its own and triggers the next. If a step fails, the saga runs **compensating transactions** that semantically undo the steps that already committed, in reverse order.
:::

```text
Step                     Compensation (undo)
1. create order PENDING  →  mark order CANCELLED
2. reserve inventory     →  release the reservation
3. charge payment        →  refund the payment
4. mark order CONFIRMED  (no compensation needed: last step)
```

A saga gives up **isolation**: other transactions can see the intermediate states (an order that's PENDING, stock that's reserved but not sold). It gives up **atomicity** in the strict sense too, replacing it with "eventually either everything happened or everything was compensated". In exchange, nothing is blocked and every service stays independent.

:::warn Compensation is not rollback
You can't un-send an email or un-ship a parcel. Compensations are **new business actions** ("refund", "send a cancellation email"), and they must be designed per step. Order the steps so the hard-to-undo ones come **last** (charge the card only after stock is reserved; ship only after payment succeeds).
:::

### Orchestration vs choreography

**Orchestration**: a central **saga orchestrator** (a workflow engine or a dedicated service) tells each participant what to do and tracks the state.

```viz algo=seq title="Orchestrated saga: payment fails, so earlier steps are compensated"
participant o Checkout orchestrator [service]
participant od Orders [service]
participant iv Inventory [box]
participant py Payments [pay]
o -> od : create order (PENDING)
od --> o : ok
o -> iv : reserve SKU 88 × 1
iv --> o : ok (reservation r_31)
o -> py : charge ₹1,299
py --> o : DECLINED | The card was declined: undo what's done, in reverse order.
o -> iv : COMPENSATE: release r_31
o -> od : COMPENSATE: cancel order
note o : saga ends in a consistent state: no order, no reservation, no charge
```

**Choreography**: there's no conductor. Each service listens for events and reacts, publishing its own events: `OrderCreated` → inventory reserves and publishes `StockReserved` → payments charges and publishes `PaymentFailed` → inventory hears it and releases, orders hears it and cancels.

| | Orchestration | Choreography |
|---|---|---|
| Logic lives | in one place (the orchestrator) | spread across services |
| Easy to understand / debug | ✓ the workflow is explicit | ✗ hard to see the whole flow |
| Coupling | services depend on the orchestrator's commands | loose: services only know events |
| Good for | complex, many-step flows (checkout, travel booking) | simple flows with 2–3 steps |
| Tools | Temporal, AWS Step Functions, Camunda, a custom state machine | Kafka / message broker events |

Here's an orchestrator with compensation. Change `failAt` to see different failure points:

:::tabs A saga orchestrator with compensations
```js run
// Each step has an action and a compensation (its semantic undo)
const log = [];
const steps = [
  { name: "create order",      run: () => log.push("order o_1 PENDING"),        undo: () => log.push("order o_1 CANCELLED") },
  { name: "reserve inventory", run: () => log.push("reserved SKU 88 (r_31)"),   undo: () => log.push("released r_31") },
  { name: "charge payment",    run: () => log.push("charged ₹1,299 (ch_9)"),    undo: () => log.push("refunded ch_9") },
  { name: "confirm order",     run: () => log.push("order o_1 CONFIRMED"),      undo: () => {} },
];

function runSaga(steps, failAt) {
  const done = [];
  for (const step of steps) {
    try {
      if (step.name === failAt) throw new Error(`${step.name} failed`);
      step.run();
      done.push(step);                       // in production: persist saga state after every step
    } catch (err) {
      log.push(`✕ ${err.message} → compensating ${done.length} completed step(s)`);
      for (const s of done.reverse()) s.undo();   // undo in reverse order
      return "COMPENSATED";
    }
  }
  return "COMPLETED";
}

for (const failAt of [null, "charge payment"]) {
  log.length = 0;
  const result = runSaga(steps, failAt);
  console.log(`--- fail at: ${failAt ?? "nothing"} → ${result}`);
  for (const line of log) console.log("   ", line);
}
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Step {
    string name;
    function<void()> run, undo;              // action and its compensation
};

vector<string> logLines;

string runSaga(const vector<Step>& steps, const string& failAt) {
    vector<const Step*> done;
    for (auto& step : steps) {
        try {
            if (step.name == failAt) throw runtime_error(step.name + " failed");
            step.run();
            done.push_back(&step);           // in production: persist saga state after every step
        } catch (const exception& e) {
            logLines.push_back(string("x ") + e.what() + " -> compensating " + to_string(done.size()) + " completed step(s)");
            for (auto it = done.rbegin(); it != done.rend(); ++it) (*it)->undo();   // reverse order
            return "COMPENSATED";
        }
    }
    return "COMPLETED";
}

int main() {
    auto say = [](string s) { return [s] { logLines.push_back(s); }; };
    vector<Step> steps = {
        {"create order",      say("order o_1 PENDING"),       say("order o_1 CANCELLED")},
        {"reserve inventory", say("reserved SKU 88 (r_31)"),  say("released r_31")},
        {"charge payment",    say("charged 1299 (ch_9)"),     say("refunded ch_9")},
        {"confirm order",     say("order o_1 CONFIRMED"),     [] {}},
    };
    for (string failAt : {"", "charge payment"}) {
        logLines.clear();
        string result = runSaga(steps, failAt);
        cout << "--- fail at: " << (failAt.empty() ? "nothing" : failAt) << " -> " << result << "\n";
        for (auto& l : logLines) cout << "    " << l << "\n";
    }
}
```
:::

Real orchestrators **persist the saga's state after every step** (so a crashed orchestrator resumes where it left off), **retry** steps and compensations until they succeed (so both must be **idempotent**), and handle timeouts (a step whose result is unknown must be queried or retried, never assumed failed).

## The dual-write problem and the transactional outbox

Inside each saga step, a service usually has to do two things: **update its own database** and **publish an event** ("OrderCreated") to a message broker. Those are two different systems:

- Write to the DB, then publish → if the service crashes in between, the DB says "order created" but nobody is ever told.
- Publish, then write → the event announces an order that might never be saved.

:::def Transactional outbox
Write the event into an **`outbox` table in the same database transaction** as the business change. A separate **relay** process reads the outbox and publishes the events to the broker, marking them sent. The business change and the intent to publish are now atomic.
:::

```viz algo=arch title="The transactional outbox"
svc     Order service [service]
db      Orders DB | orders + outbox tables [db]
relay   Outbox relay / CDC | e.g. Debezium [worker]
bus     Message broker | Kafka [stream]
inv     Inventory service [service]
pay     Payment service [service]
--
svc -> db : ONE transaction: INSERT order + INSERT outbox event
relay -> db : read new outbox rows (or the DB's change log)
relay -> bus : publish OrderCreated
bus ~> inv
bus ~> pay
```

The relay can **poll** the outbox table, or use **change data capture (CDC)**: tail the database's replication log (e.g. with Debezium) and turn new outbox rows into messages. Either way, events are published **at least once**: after a crash, the relay may publish an event twice.

## Idempotent consumers

Because brokers and relays deliver **at least once**, every consumer must handle **duplicates**:

:::def Idempotent consumer
A message handler that produces the same result whether a message is processed once or many times. Usually implemented by recording the **ids of processed messages** in the consumer's own database, in the same transaction as the side effect, and skipping ids already seen.
:::

```text
BEGIN;
INSERT INTO processed_messages (message_id) VALUES ('evt_8812');   -- fails if already processed
UPDATE stock SET reserved = reserved + 1 WHERE sku = 88;
COMMIT;
```

Outbox + idempotent consumers together give **effectively-once** processing on top of at-least-once delivery. You'll see this combination again in the messaging module and the payment system case study.

## TCC: Try–Confirm–Cancel

A variant of sagas for **reservations**: each participant offers three operations. **Try** reserves resources tentatively (hold the seat, put a hold on the card's funds) with an expiry; **Confirm** turns the hold into the real thing; **Cancel** releases it. The coordinator calls Try on everyone, then Confirm on everyone if all Tries succeeded, otherwise Cancel. Holds that are never confirmed **expire on their own**, so a crashed coordinator doesn't leak resources. Ticket booking, hotel reservations and card authorisations (authorise now, capture later) work like this.

## Choosing

| Situation | Approach |
|---|---|
| All data in one (distributed) database | **its own transactions** (it may run 2PC internally, invisibly) |
| A flow across your microservices | **saga** (orchestrated for complex flows) + **outbox** + **idempotent consumers** |
| Reserving scarce resources across systems | **TCC** / reservations with expiry |
| External systems you don't control (payment gateways, airlines) | saga steps with **idempotency keys**, retries, and reconciliation jobs |

:::interview The phrase interviewers want to hear
*"These are separate services, so I won't use 2PC across them. Checkout is an orchestrated saga: create the order as PENDING, reserve stock with a 10-minute expiry, charge the card with an idempotency key, then confirm. If payment fails, the orchestrator releases the stock and cancels the order. Each service publishes its events through a transactional outbox, and consumers deduplicate by event id."*
:::

```quiz
? What's the main operational danger of two-phase commit across services?
+ If the coordinator fails after participants voted YES, they're stuck holding locks until it recovers
- It can't guarantee atomicity
- It only works with NoSQL databases
> Prepared participants can neither commit nor abort on their own, so they block.

? In a saga, the payment step fails after the order was created and stock reserved. What happens?
- The databases roll back automatically
+ Compensating actions run in reverse order: release the stock, then cancel the order
- The saga retries the payment forever
> Each completed step is undone by its own compensating transaction.

? What problem does the transactional outbox solve?
+ Updating the database and publishing an event atomically, so neither can happen without the other
- Making messages arrive in order
- Encrypting events
> The event is stored in the same local transaction as the change; a relay publishes it afterwards.

? Why must saga steps and their compensations be idempotent?
- To make them faster
+ Because they're retried after failures and timeouts, and messages may be delivered more than once
- Because compensations run in parallel
> At-least-once delivery and retries mean any step may run more than once; idempotency makes that harmless.
```

:::keypoints
- A business operation spanning several services can't use a normal local transaction.
- **Two-phase commit** (prepare, then commit) gives atomicity but **blocks** on coordinator failure and couples services; it's fine inside a distributed database.
- **Sagas** chain local transactions and undo completed steps with **compensating actions**; they trade isolation for availability and independence. **Orchestration** for complex flows, **choreography** for simple ones.
- Avoid the **dual-write problem** with a **transactional outbox** (plus polling or **CDC**), and make every consumer **idempotent** (dedupe by message id).
- **TCC** reservations (try, confirm, cancel) with expiry suit seat, hotel and card holds.
:::
