---
title: Design a Food Delivery App
level: intermediate
time: 60
summary: Restaurants, menus and orders, an order life cycle as a state machine, choosing a delivery partner with a strategy, delivery fee, status messages through observers, and cancel rules that depend on the order state.
---

:::problem Design a Food Delivery App {level=medium tags="State,Strategy,Observer,e-commerce,Swiggy,order lifecycle"}
Design the core of a food delivery platform like Swiggy or Zomato. Customers browse restaurants and menus, place an order from one restaurant, and pay. The restaurant accepts and prepares the order. A delivery partner is assigned, picks it up, and delivers it. Customers get status updates and can cancel while it is still allowed.

:::hint Hint
An order has a clear life cycle, so make it a **state machine** with checked transitions. Choosing a partner is a **strategy**. Status updates go to subscribers (**observer**). Keep restaurants, orders and partners as separate parts that talk through the service.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | Customer, Restaurant (menu items with price and availability), Order, DeliveryPartner |
| Ordering? | one restaurant for each order. Items with quantities. Items that are not available are refused |
| Price? | items + delivery fee (by distance) + taxes. A promo code is optional |
| Life cycle? | Placed, Accepted, Preparing, ReadyForPickup, PickedUp, Delivered. Or Cancelled or Rejected |
| Choosing a partner? | when the order is accepted, find the nearest free partner within 5 km |
| Cancel? | by the customer until the restaurant starts preparing (free). After that, not allowed |
| Messages? | the customer, restaurant and partner hear about the changes that matter to them |
| Not needed | payments (an interface), maps and routes (a distance function), ratings |

## Step 2: The life cycle of an order

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

(In the play sequence, one action is refused: once the kitchen has started, a customer cancel is **not allowed**.)

## Step 3: Find the classes

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

## Step 4: Design decisions

- **A transition table** (`allowed(from, event)`) keeps all the rules in one place. A wrong transition gets a clear refusal. We could use State classes, but for about 7 states a table is easier to read. Use classes if each state has a lot of behaviour.
- **Partner choice is a Strategy.** `NearestFree` picks the closest partner who is not busy, within a distance. We can swap in "least busy" or batching without touching the service.
- **Observer:** `OrderListener` receives `(order, from, to)`. The customer app, restaurant tablet and partner app each subscribe.
- **The price is worked out once when the order is placed** and saved on the order, because menu prices may change later.
- **Partners are claimed safely.** A partner is marked `busy` under a lock when assigned, so two orders cannot take the same partner.
- **Restaurant availability** is checked when the order is placed (and can be checked again at accept).

## Step 5: The code

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

| Case | What happens |
|---|---|
| No partner is free when the order is accepted | the order stays `Placed` with a message (or waits in a queue and tries again) |
| Cancel after preparing has started | refused by the transition table |
| The restaurant rejects | `Reject` from Placed leads to Cancelled, and the customer is refunded (payment interface) |
| An item sells out between cart and order | availability is checked when placing (and again at accept) |
| The partner cancels midway | reassign: a `Reassign` event goes back to Ready with the partner cleared |
| Two orders and one partner | the `busy` flag is set under the service lock |
| Prices change after placing | the order stores the unit prices |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "One partner takes two nearby orders" | a different `AssignmentStrategy` and a partner capacity above 1 |
| "Surge pricing and promo codes" | a `PricingStrategy` or a chain of rules (like the shopping cart lesson) |
| "Live location" | the partner sends locations, and customers subscribe (pub/sub) |
| "Estimated delivery time" | an `EtaEstimator` strategy using distance and how busy the kitchen is |
| "Restaurant ratings, search and ranking" | read models and a ranking strategy |
| "Big scale: city by city" | split restaurants and partners by area. Match inside one area |
| "Save orders as events" | store the events and work out the state from them |
| "Threads" | a lock for each order instead of one global mutex |

## Short answer to say in an interview

:::interview How do you model the order life cycle?
"As a state machine with a table of allowed transitions: Placed, Accepted, Preparing, ReadyForPickup, PickedUp, Delivered, and Cancelled or Rejected. A wrong action, like a customer cancel after the kitchen has started, is refused. Partner choice is a strategy, like nearest free partner, and it claims the partner safely under a lock. Status changes go to subscribers through an observer, and the price is saved on the order when it is placed."
:::

```quiz
? Why keep all transitions in one table?
- It is shorter
+ The life cycle rules are in one place, and wrong transitions are refused in the same way
- Maps are faster
> One source of truth for what may happen next.
? Why is choosing a partner a Strategy?
- Strategies are popular
+ Nearest, least busy or batching rules change independently of the order flow
- C++ requires it
> It is the part of the problem that can change.
```

:::keypoints
- Order = a state machine with a transition table. A partner-choice strategy. Observers for status messages.
- Save prices when the order is placed. Claim partners safely. Free them on cancel or delivery.
- Extensions: pricing rules, delivery time estimate, batching, splitting by area.
:::
