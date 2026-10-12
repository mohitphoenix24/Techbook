---
title: Observer (Publish–Subscribe in Code)
level: intermediate
time: 40
summary: The Observer pattern — subjects notify subscribed observers when they change — with a stock-price and order-status example in C++ and JavaScript, unsubscribing safely, push vs pull, synchronous vs asynchronous notification, memory leaks from forgotten listeners, and how it relates to event emitters and distributed pub/sub.
---

:::def Observer
Defines a **one-to-many** dependency between objects: when one object (the **subject**, or publisher) changes state, all its **observers** (subscribers) are notified automatically. The subject knows only that observers implement a small interface, not what they do.
:::

**Problem:** when an order's status changes, the customer gets a push notification, the restaurant dashboard refreshes, analytics records the event, and the delivery ETA is recalculated. If `Order.setStatus()` called each of those directly, the order class would depend on four unrelated subsystems, and every new reaction would mean editing it. With Observer, the order just announces the change.

```viz algo=uml title="Observer"
class OrderTracker
  - observers: OrderObserver[]
  + subscribe(o: OrderObserver)
  + unsubscribe(o: OrderObserver)
  + updateStatus(orderId, status)
  - notifyAll(event)
interface OrderObserver
  + onStatusChanged(event: StatusEvent)
class PushNotifier
class RestaurantDashboard
class Analytics
OrderTracker o-- OrderObserver : notifies
PushNotifier ..|> OrderObserver
RestaurantDashboard ..|> OrderObserver
Analytics ..|> OrderObserver
```

:::tabs An order tracker with observers
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct StatusEvent { string orderId, from, to; };

class OrderObserver {
public:
    virtual ~OrderObserver() = default;
    virtual void onStatusChanged(const StatusEvent& e) = 0;
};

class OrderTracker {                                       // the subject
    map<string, string> status_;
    vector<OrderObserver*> observers_;                      // non-owning: observers manage their own lifetime
public:
    void subscribe(OrderObserver* o) { observers_.push_back(o); }
    void unsubscribe(OrderObserver* o) { observers_.erase(remove(observers_.begin(), observers_.end(), o), observers_.end()); }
    void updateStatus(const string& id, const string& to) {
        StatusEvent e{id, status_.count(id) ? status_[id] : "NEW", to};
        status_[id] = to;
        auto snapshot = observers_;                         // copy: observers may unsubscribe while being notified
        for (auto* o : snapshot) o->onStatusChanged(e);
    }
};

class PushNotifier : public OrderObserver {
public:
    void onStatusChanged(const StatusEvent& e) override { cout << "  push: your order " << e.orderId << " is " << e.to << "\n"; }
};
class RestaurantDashboard : public OrderObserver {
public:
    void onStatusChanged(const StatusEvent& e) override { cout << "  dashboard: " << e.orderId << " " << e.from << " -> " << e.to << "\n"; }
};
class Analytics : public OrderObserver {
public:
    map<string, int> counts;
    void onStatusChanged(const StatusEvent& e) override { counts[e.to]++; }
};

int main() {
    OrderTracker tracker;
    PushNotifier push; RestaurantDashboard dash; Analytics analytics;
    tracker.subscribe(&push); tracker.subscribe(&dash); tracker.subscribe(&analytics);

    cout << "order 77 accepted:\n";  tracker.updateStatus("77", "ACCEPTED");
    cout << "order 77 picked up:\n"; tracker.updateStatus("77", "PICKED_UP");
    tracker.unsubscribe(&dash);                              // the restaurant closed its dashboard
    cout << "order 77 delivered:\n"; tracker.updateStatus("77", "DELIVERED");
    cout << "analytics saw:";
    for (auto& [status, n] : analytics.counts) cout << " " << status << "=" << n;
    cout << "\n";
}
```
```js run
class OrderTracker {                                      // the subject
  #status = new Map();
  #observers = new Set();
  subscribe(fn) { this.#observers.add(fn); return () => this.#observers.delete(fn); }   // returns an unsubscribe function
  updateStatus(orderId, to) {
    const event = { orderId, from: this.#status.get(orderId) ?? "NEW", to };
    this.#status.set(orderId, to);
    for (const fn of [...this.#observers]) {             // copy: observers may unsubscribe while being notified
      try { fn(event); } catch (e) { console.log(`  (observer failed: ${e.message}; others still notified)`); }
    }
  }
}

const tracker = new OrderTracker();
tracker.subscribe((e) => console.log(`  push: your order ${e.orderId} is ${e.to}`));
const stopDashboard = tracker.subscribe((e) => console.log(`  dashboard: ${e.orderId} ${e.from} -> ${e.to}`));
const counts = {};
tracker.subscribe((e) => { counts[e.to] = (counts[e.to] ?? 0) + 1; });
tracker.subscribe((e) => { if (e.to === "PICKED_UP") throw new Error("ETA service down"); });

console.log("order 77 accepted:");  tracker.updateStatus("77", "ACCEPTED");
console.log("order 77 picked up:"); tracker.updateStatus("77", "PICKED_UP");
stopDashboard();                                        // the restaurant closed its dashboard
console.log("order 77 delivered:"); tracker.updateStatus("77", "DELIVERED");
console.log("analytics saw:", counts);
```
:::

## Design decisions inside Observer

**Push vs pull.** In the **push** model (above), the subject sends the details in the event. In the **pull** model, it sends only "I changed" and observers query what they need. Push is simpler and avoids extra calls; pull avoids sending data observers don't need.

**Failure isolation.** One misbehaving observer shouldn't stop the others (the JS version catches each observer's error). Decide whether an observer failure should fail the operation (usually not).

**Modifying the list during notification.** An observer that unsubscribes itself (or subscribes another) while the subject loops over the list can skip observers or crash. Iterate over a **copy** (as above).

**Synchronous vs asynchronous.** Synchronous notification runs every observer before `updateStatus` returns: simple, ordered, but a slow observer slows the subject. Asynchronous notification (queue the events, deliver later) decouples timing, at the cost of ordering and error-handling complexity. In-process, sync is the default; across services, it's always async (a message broker).

**Lifetimes and leaks.** The subject holds references to its observers. An observer that's "gone" (a closed UI screen) but never unsubscribed stays alive and keeps receiving events: the classic **lapsed listener** memory leak. Always provide `unsubscribe` (returning an unsubscribe function, as in the JS version, is a neat idiom); in C++, consider `weak_ptr` or RAII subscription handles that unsubscribe in their destructor.

**Ordering and re-entrancy.** Don't rely on observers being called in a particular order, and beware observers that trigger another change on the subject during notification (infinite loops). Some systems queue such changes until notification ends.

## The same idea at every scale

| Scale | Form |
|---|---|
| Inside an object graph | Observer pattern (this lesson), event emitters (`EventEmitter`, DOM `addEventListener`) |
| UI frameworks | reactive state (React re-renders subscribers; Vue/MobX track observers automatically), RxJS observables |
| Inside one service | an in-process event bus |
| Between services | **pub/sub** brokers: Kafka, SNS, Redis pub/sub (the Messaging module) |

The core trade-off is the same at every level: the publisher is **decoupled** from its subscribers (easy to add reactions), but the overall flow is **harder to follow** (who reacts to what?).

:::interview Where Observer appears in LLD problems
*Stock or auction price alerts*, *order/ride status updates*, *notification systems* (subscribers per event type), *elevator display panels* (observing the car's floor), *pub/sub system* LLD (topics with subscribers; you'll build one in the LLD Problems module), *"notify me when back in stock"*. Mention unsubscribing and failure isolation for extra credit.
:::

```quiz
? An order class directly calls the push service, the dashboard and analytics whenever its status changes. What does Observer improve?
+ The order just notifies subscribers through one interface, so new reactions are added without changing the order class
- It makes notifications faster
- It removes the need for status changes
> The subject depends only on the observer interface, not on each concrete reaction.

? A screen subscribes to price updates but never unsubscribes after it closes. What happens?
- Nothing, it's garbage-collected
+ The subject keeps a reference, so the screen object leaks and keeps receiving updates (a lapsed listener)
- The subject crashes immediately
> Subscriptions must be removed; returning an unsubscribe handle makes that easy.

? Why iterate over a copy of the observer list when notifying?
+ An observer may subscribe or unsubscribe during notification, which would otherwise corrupt or skip the iteration
- Copies are faster
- To notify each observer twice
> Mutating a collection while iterating it is a classic bug.
```

:::keypoints
- **Observer**: a subject notifies subscribed observers through a small interface; one-to-many, loosely coupled.
- Decide **push vs pull**, isolate observer **failures**, iterate over a **copy**, and choose **sync vs async** delivery.
- Always support **unsubscribe** (handles or RAII) to avoid lapsed-listener leaks; avoid relying on notification order.
- The same idea scales from event emitters and reactive UIs to distributed pub/sub.
:::
