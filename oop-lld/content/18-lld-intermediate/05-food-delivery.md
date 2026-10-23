---
title: Design a Food Delivery App
level: intermediate
time: 60
summary: Restaurants and menus, carts, an order lifecycle state machine, assigning delivery partners with a pluggable strategy, delivery fee and pricing, status notifications through observers, and cancellation rules that depend on the order state.
---

:::problem Design a Food Delivery App {level=medium tags="State,Strategy,Observer,e-commerce,Swiggy,order lifecycle"}
Design the core of a food delivery platform like Swiggy or Zomato. Customers browse restaurants and menus, place an order from a single restaurant, and pay. The restaurant accepts and prepares the order; a delivery partner is assigned, picks it up and delivers it. Customers get status updates and can cancel while it is still allowed.

:::hint Hint
An order has a clear lifecycle, so model it as a **state machine** with guarded transitions. Assigning a partner is a **strategy**. Status updates go to subscribers (**observer**). Keep restaurants, orders and delivery partners as separate aggregates that talk through the service.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | Customer, Restaurant (menu items with price and availability), Order, DeliveryPartner |
| Ordering? | one restaurant per order; items with quantities; unavailable items rejected |
| Pricing? | items + delivery fee (distance based) + taxes; a promo code optional |
| Lifecycle? | Placed → Accepted → Preparing → ReadyForPickup → PickedUp → Delivered; Cancelled/Rejected |
| Assignment? | when the order is accepted, find a partner: nearest free partner within 5 km |
| Cancellation? | by customer until the restaurant starts preparing (free); after that not allowed |
| Notifications? | customer, restaurant and partner are told about relevant transitions |
| Out of scope | payments (interface), maps/routing (distance function), ratings |

## Step 2: the order lifecycle

```viz algo=state title="Order states"
state Placed "Placed" [initial] @0,1
state Accepted "Accepted" @1,0
state Preparing "Preparing" @2,0
state Ready "Ready for pickup" @3,0
state PickedUp "Picked up" @4,0
state Delivered "Delivered" @5,0
state Cancelled "Cancelled" @1,2
Placed -> Accepted : restaurant accepts
Placed -> Cancelled : customer cancels / restaurant rejects
Accepted -> Preparing : kitchen starts
Accepted -> Cancelled : customer cancels
Preparing -> Ready : food ready
Ready -> PickedUp : partner picks up
PickedUp -> Delivered : delivered
play: restaurant accepts, kitchen starts, customer cancels, food ready, partner picks up, delivered
```

(The play sequence shows a rejected action: after the kitchen starts, a customer cancel is **not allowed**.)

## Step 3: entities

```viz algo=uml title="Food delivery"
class DeliveryService
  + placeOrder(cart: Cart, customer: string): Result<Order>
  + advance(orderId: int, event: Event): Result
  + cancel(orderId: int): Result
class Restaurant
  - id: int
  - menu: map<string, MenuItem>
  - location: Point
class MenuItem
  - name: string
  - price: Money
  - available: bool
class Order
  - id: int
  - restaurant: int
  - lines: Line[]
  - state: OrderState
  - partner: int
  - total: Money
class DeliveryPartner
  - id: int
  - location: Point
  - busy: bool
interface AssignmentStrategy
  + choose(partners: DeliveryPartner[], pickup: Point): DeliveryPartner
class NearestFree
interface OrderListener
  + onStatus(o: Order, from: State, to: State): void
class PricingService
  + deliveryFee(distanceKm: double): Money
DeliveryService o-- Restaurant
DeliveryService o-- DeliveryPartner
DeliveryService o-- Order
DeliveryService --> AssignmentStrategy
DeliveryService --> OrderListener
NearestFree ..|> AssignmentStrategy
Restaurant *-- MenuItem
Order --> DeliveryPartner
```

## Step 4: design decisions

- **Transition table** (`allowed(from, event)`) centralises the rules; invalid transitions return a clear refusal. A full State-class design is possible, but the table keeps the lifecycle in one readable place for ~7 states (use classes if each state has lots of behaviour).
- **Assignment Strategy**: `NearestFree` picks the closest non-busy partner within a radius. Swap in "least busy" or batching without touching the service.
- **Observer**: `OrderListener` receives `(order, from, to)`; customer app, restaurant tablet and partner app each subscribe.
- **Price computed once at placement** and stored on the order (menu prices may change later).
- **Atomic partner claim**: a partner flagged `busy` under a lock when assigned, so two orders cannot grab the same partner.
- **Restaurant availability** is checked when the order is placed (and could be re-checked at accept).

## Step 5: the code

```cpp run title="Orders, lifecycle, partner assignment, notifications"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
using namespace std;

using Money = long;                                          // rupees
struct Point { double x, y; };
double distanceKm(Point a, Point b) { return hypot(a.x - b.x, a.y - b.y); }

enum class State { Placed, Accepted, Preparing, Ready, PickedUp, Delivered, Cancelled };
enum class Event { Accept, StartPreparing, FoodReady, PickUp, Deliver, Cancel, Reject };
const char* name(State s) { static const char* n[] = {"Placed", "Accepted", "Preparing", "Ready", "PickedUp", "Delivered", "Cancelled"}; return n[static_cast<int>(s)]; }

// the transition table: the single source of truth for the lifecycle
optional<State> transition(State s, Event e) {
    switch (s) {
        case State::Placed:    if (e == Event::Accept) return State::Accepted; if (e == Event::Cancel || e == Event::Reject) return State::Cancelled; break;
        case State::Accepted:  if (e == Event::StartPreparing) return State::Preparing; if (e == Event::Cancel) return State::Cancelled; break;
        case State::Preparing: if (e == Event::FoodReady) return State::Ready; break;
        case State::Ready:     if (e == Event::PickUp) return State::PickedUp; break;
        case State::PickedUp:  if (e == Event::Deliver) return State::Delivered; break;
        default: break;
    }
    return nullopt;
}

struct MenuItem { string name; Money price; bool available = true; };
struct Restaurant { int id; string name; Point location; map<string, MenuItem> menu; };
struct DeliveryPartner { int id; string name; Point location; bool busy = false; };

struct OrderLine { string item; int qty; Money unitPrice; };
struct Order {
    int id; string customer; int restaurant; vector<OrderLine> lines; Money itemsTotal, deliveryFee, total;
    State state = State::Placed; int partner = 0;
};

struct OrderListener { virtual ~OrderListener() = default; virtual void onStatus(const Order& o, State from, State to) = 0; };
struct Console : OrderListener {
    string who;
    explicit Console(string w) : who(move(w)) {}
    void onStatus(const Order& o, State from, State to) override { cout << "    [" << who << "] order #" << o.id << ": " << name(from) << " -> " << name(to) << "\n"; }
};

struct AssignmentStrategy { virtual ~AssignmentStrategy() = default; virtual DeliveryPartner* choose(vector<DeliveryPartner>& partners, Point pickup) = 0; };
struct NearestFree : AssignmentStrategy {
    double radiusKm; explicit NearestFree(double r) : radiusKm(r) {}
    DeliveryPartner* choose(vector<DeliveryPartner>& partners, Point pickup) override {
        DeliveryPartner* best = nullptr; double bestD = radiusKm;
        for (auto& p : partners) if (!p.busy && distanceKm(p.location, pickup) <= bestD) { best = &p; bestD = distanceKm(p.location, pickup); }
        return best;
    }
};

class DeliveryService {
    map<int, Restaurant> restaurants_;
    vector<DeliveryPartner> partners_;
    map<int, Order> orders_;
    vector<OrderListener*> listeners_;
    unique_ptr<AssignmentStrategy> assign_;
    int nextOrder_ = 1;
    mutex m_;
    Money deliveryFee(double km) const { return km <= 2 ? 20 : 20 + static_cast<Money>(ceil(km - 2)) * 8; }
public:
    explicit DeliveryService(unique_ptr<AssignmentStrategy> a) : assign_(move(a)) {}
    void addRestaurant(Restaurant r) { restaurants_[r.id] = move(r); }
    void addPartner(DeliveryPartner p) { partners_.push_back(move(p)); }
    void subscribe(OrderListener* l) { listeners_.push_back(l); }

    optional<int> placeOrder(const string& customer, Point where, int restaurantId, const vector<pair<string, int>>& items, string& why) {
        lock_guard lock(m_);
        auto rit = restaurants_.find(restaurantId);
        if (rit == restaurants_.end()) { why = "unknown restaurant"; return nullopt; }
        Order o{nextOrder_, customer, restaurantId, {}, 0, 0, 0};
        for (auto& [item, qty] : items) {
            auto it = rit->second.menu.find(item);
            if (it == rit->second.menu.end() || !it->second.available) { why = item + " is not available at " + rit->second.name; return nullopt; }
            if (qty <= 0) { why = "invalid quantity"; return nullopt; }
            o.lines.push_back({item, qty, it->second.price});
            o.itemsTotal += it->second.price * qty;
        }
        if (o.lines.empty()) { why = "empty order"; return nullopt; }
        o.deliveryFee = deliveryFee(distanceKm(rit->second.location, where));
        o.total = o.itemsTotal + o.deliveryFee;
        orders_.emplace(nextOrder_, o);
        cout << "  order #" << nextOrder_ << " placed at " << rit->second.name << ": items Rs " << o.itemsTotal << " + delivery Rs " << o.deliveryFee << " = Rs " << o.total << "\n";
        return nextOrder_++;
    }

    bool handle(int orderId, Event e, string& why) {
        lock_guard lock(m_);
        auto it = orders_.find(orderId);
        if (it == orders_.end()) { why = "no such order"; return false; }
        Order& o = it->second;
        auto next = transition(o.state, e);
        if (!next) { why = string("not allowed in state ") + name(o.state); return false; }
        State from = o.state;
        if (*next == State::Accepted) {                                           // when accepted, find a delivery partner
            DeliveryPartner* p = assign_->choose(partners_, restaurants_.at(o.restaurant).location);
            if (!p) { why = "no delivery partner nearby; order stays placed"; return false; }
            p->busy = true; o.partner = p->id;
            cout << "    (assigned partner " << p->name << ")\n";
        }
        if (*next == State::Cancelled && o.partner != 0) for (auto& p : partners_) if (p.id == o.partner) p.busy = false;     // free the partner
        if (*next == State::Delivered) for (auto& p : partners_) if (p.id == o.partner) p.busy = false;
        o.state = *next;
        for (auto* l : listeners_) l->onStatus(o, from, *next);
        return true;
    }
};

int main() {
    DeliveryService svc(make_unique<NearestFree>(5.0));
    svc.addRestaurant({1, "Spice Hub", {2, 2}, {{"biryani", {"biryani", 250}}, {"naan", {"naan", 40}}, {"lassi", {"lassi", 60, false}}}});
    svc.addPartner({1, "Kiran", {3, 2}});
    svc.addPartner({2, "Meera", {9, 9}});
    Console customer("customer app"), kitchen("restaurant tablet");
    svc.subscribe(&customer); svc.subscribe(&kitchen);
    string why;

    auto id = svc.placeOrder("Asha", {6, 5}, 1, {{"biryani", 2}, {"naan", 4}}, why);
    svc.placeOrder("Asha", {6, 5}, 1, {{"lassi", 1}}, why); cout << "  refused: " << why << "\n";

    auto step = [&](Event e, const char* label) { string w; cout << "  " << label << ":\n"; if (!svc.handle(*id, e, w)) cout << "    refused: " << w << "\n"; };
    step(Event::Accept, "restaurant accepts");
    step(Event::StartPreparing, "kitchen starts");
    step(Event::Cancel, "customer tries to cancel");
    step(Event::FoodReady, "food ready");
    step(Event::PickUp, "partner picks up");
    step(Event::Deliver, "delivered");

    cout << "second order: cancelled while still allowed\n";
    auto id2 = svc.placeOrder("Ravi", {3, 3}, 1, {{"naan", 2}}, why);
    svc.handle(*id2, Event::Accept, why);
    svc.handle(*id2, Event::Cancel, why);
    cout << "third order: partner freed after the cancellation, so the same partner can be assigned again\n";
    auto id3 = svc.placeOrder("Meera", {3, 3}, 1, {{"naan", 1}}, why);
    svc.handle(*id3, Event::Accept, why);
}
```

## Edge cases

| Case | Handling |
|---|---|
| No partner available when accepted | the order stays `Placed` with a message (or waits in a queue and retries) |
| Cancel after preparing starts | refused by the transition table |
| Restaurant rejects | `Reject` from Placed leads to Cancelled; the customer is refunded (payment interface) |
| Item sold out between cart and order | availability checked at placement (and again at accept) |
| Partner cancels mid-way | reassign: a `Reassign` event back to Ready with the partner cleared |
| Two orders, one partner | the `busy` flag is set under the service lock |
| Prices changed after placing | the order stores unit prices |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Batch two nearby orders for one partner" | a different `AssignmentStrategy` and a partner capacity > 1 |
| "Surge pricing and promo codes" | `PricingStrategy` / rule chain (like the shopping cart lesson) |
| "Live location tracking" | partner publishes locations; customers subscribe (pub/sub) |
| "Estimated delivery time" | an `EtaEstimator` strategy using distance and kitchen load |
| "Restaurant ratings and search/ranking" | read models and a ranking strategy |
| "Scale: city-level sharding" | partition restaurants/partners by geo-cell; matching within a cell |
| "Persist/event-source orders" | store events; derive state |
| "Concurrency" | per-order lock instead of one global mutex |

```quiz
? Why centralise transitions in one table?
- It is shorter
+ The lifecycle rules live in one place and invalid transitions are refused uniformly
- Maps are faster
> One source of truth for what may happen next.
? Why is partner assignment a Strategy?
- Because strategies are popular
+ Nearest, least-busy or batching policies change independently of the order flow
- C++ requires it
> It is the variation point of the problem.
```

:::keypoints
- Order = state machine with a transition table; assignment strategy; observers for status updates.
- Store prices at placement; claim partners atomically; free them on cancel or delivery.
- Extensions: pricing rules, ETA, batching, geo-sharding.
:::
