---
title: MVC, MVP, MVVM and the event bus
level: intermediate
time: 35
summary: Separating data, display and input with Model-View-Controller and its variants, how MVC is built from Observer and Strategy, a console MVC example, and a typed publish/subscribe event bus for decoupled components.
---

Two architectural ideas appear in many LLD problems (a game, a chat app, a dashboard, a stock tracker): **separate the UI from the data**, and **let components communicate through events**.

## MVC: Model, View, Controller

| Part | Responsibility | Knows about |
|---|---|---|
| **Model** | the **data and business rules**; notifies observers when it changes | nothing about the UI |
| **View** | **displays** the model; renders; knows how to draw | reads the model |
| **Controller** | handles **user input**, updates the model | model, view |

```viz algo=seq title="One click through MVC"
participant u User [user]
participant v View [box]
participant c Controller [box]
participant m Model [db]
u -> v : clicks "+" | The view forwards input events; it does not decide what they mean.
v -> c : onIncrement()
c -> m : increment() | The controller turns the user action into a model operation.
m ->> v : changed(newValue) | The model notifies its observers (the Observer pattern).
v -> v : redraw()
```

MVC is a composition of patterns you already know: **Observer** (model notifies views), **Strategy** (the controller is the view's strategy for handling input), and **Composite** (views nest).

## A console MVC counter

```cpp run title="Model notifies views; controller handles input"
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class CounterModel {                                       // no I/O, no UI: just data and rules
    int value_ = 0;
    vector<function<void(int)>> observers_;
public:
    void subscribe(function<void(int)> f) { observers_.push_back(move(f)); }
    void increment() { setValue(value_ + 1); }
    void decrement() { if (value_ > 0) setValue(value_ - 1); }          // a rule: never negative
    int value() const { return value_; }
private:
    void setValue(int v) { value_ = v; for (auto& f : observers_) f(value_); }
};

class TextView {                                           // one way to show the model
public:
    explicit TextView(CounterModel& m) { m.subscribe([](int v) { cout << "  [text view] count = " << v << "\n"; }); }
};
class BarView {                                            // another view of the SAME model
public:
    explicit BarView(CounterModel& m) { m.subscribe([](int v) { cout << "  [bar view]  " << string(v, '#') << "\n"; }); }
};

class Controller {                                         // translates input into model operations
    CounterModel& model_;
public:
    explicit Controller(CounterModel& m) : model_(m) {}
    void handle(const string& input) {
        if (input == "+") model_.increment();
        else if (input == "-") model_.decrement();
        else cout << "  unknown command '" << input << "'\n";
    }
};

int main() {
    CounterModel model;
    TextView text(model);
    BarView bars(model);
    Controller controller(model);
    for (string in : {"+", "+", "+", "-", "x", "-", "-", "-"}) { cout << "input " << in << "\n"; controller.handle(in); }
}
```

Benefits: you can add a `GraphView` without touching the model; test the model without any UI; change input from the keyboard to a network client by writing a new controller.

## MVC, MVP and MVVM

| | MVC | MVP (Presenter) | MVVM |
|---|---|---|---|
| Who handles input? | Controller | **View** forwards to the Presenter | **View** binds to the ViewModel |
| How does the view get data? | observes the Model directly | the **Presenter** pushes data to a passive View via an interface | **data binding** to the ViewModel's properties |
| Is the View passive? | partly | **fully passive** (easy to test the Presenter with a fake View) | mostly declarative |
| Typical home | web frameworks, desktop | Android (older), WinForms | WPF, Angular, SwiftUI |

All three share the aim: keep logic out of the view.

## The event bus (publish/subscribe)

Observer needs the observers to know the subject. An **event bus** puts a broker between publishers and subscribers, so components know **only the event types**, not each other. It is the in-process cousin of Kafka or RabbitMQ topics.

```viz algo=uml title="Event bus"
class EventBus
  + subscribe(handler: Handler<E>): Subscription
  + publish(event: E): void
class OrderService
class InventoryService
class EmailService
class AnalyticsService
OrderService ..> EventBus : publishes OrderPlaced
InventoryService ..> EventBus : subscribes
EmailService ..> EventBus : subscribes
AnalyticsService ..> EventBus : subscribes
```

```cpp run title="A typed event bus"
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <typeindex>
#include <vector>
using namespace std;

class EventBus {
    map<type_index, vector<function<void(const void*)>>> handlers_;
public:
    template <typename Event>
    void subscribe(function<void(const Event&)> handler) {
        handlers_[typeid(Event)].push_back([h = move(handler)](const void* e) { h(*static_cast<const Event*>(e)); });
    }
    template <typename Event>
    void publish(const Event& e) const {
        auto it = handlers_.find(typeid(Event));
        if (it == handlers_.end()) return;
        for (const auto& h : it->second) h(&e);
    }
};

// ---- events are plain data ----
struct OrderPlaced { int orderId; string customer; double total; };
struct OrderShipped { int orderId; };

int main() {
    EventBus bus;

    // subscribers know the event types, not the publishers
    bus.subscribe<OrderPlaced>([](const OrderPlaced& e) { cout << "  [inventory] reserving stock for order " << e.orderId << "\n"; });
    bus.subscribe<OrderPlaced>([](const OrderPlaced& e) { cout << "  [email] confirmation to " << e.customer << "\n"; });
    bus.subscribe<OrderPlaced>([](const OrderPlaced& e) { if (e.total > 1000) cout << "  [fraud] reviewing large order " << e.orderId << "\n"; });
    bus.subscribe<OrderShipped>([](const OrderShipped& e) { cout << "  [email] order " << e.orderId << " is on its way\n"; });

    // the publisher knows only the bus
    cout << "placing order 1:\n";  bus.publish(OrderPlaced{1, "asha", 1500});
    cout << "shipping order 1:\n"; bus.publish(OrderShipped{1});
    cout << "an event nobody listens to:\n"; bus.publish(string("ignored"));
}
```

Adding a loyalty-points service means subscribing to `OrderPlaced`, with **no change** to `OrderService`. That is Open/Closed at the system level.

## Observer vs Event Bus vs Message Queue

| | Observer | In-process event bus | Message queue (Kafka, RabbitMQ) |
|---|---|---|---|
| Coupling | subject holds observers | publishers and subscribers know only event types | same, across processes |
| Delivery | synchronous, same thread | usually synchronous (or queued per thread) | asynchronous, persistent, retries |
| Failure of a subscriber | affects the caller | affects the caller unless caught | isolated; message redelivered |
| Scope | one object | one process | many services |

## Design questions to expect

- **Synchronous or asynchronous?** Sync is simple and ordered; async decouples latency but needs a queue and thread-safety.
- **Ordering and delivery guarantees?** At-most-once, at-least-once? Idempotent subscribers?
- **Error handling:** isolate a failing subscriber so others still run.
- **Unsubscribe and lifetime:** RAII tokens (see Observer).
- **Event design:** small immutable data objects named in the past tense (`OrderPlaced`), carrying ids and the facts needed.
- **Danger:** "event spaghetti": flows become hard to follow when everything reacts to everything. Document the main flows.

:::interview Explain MVC. How is it related to Observer?
"MVC separates data and rules (Model), presentation (View) and input handling (Controller). The model knows nothing of the UI and notifies its observers, the views, when it changes; that is the Observer pattern. The controller turns user input into model operations, which makes it a strategy for the view. This lets me add views, test the model alone, and change input sources independently. MVP makes the view passive and routes everything through a presenter; MVVM uses data binding with a view model."
:::

```quiz
? In MVC, who tells the View that the data changed?
- The Controller
+ The Model, through notifications (Observer)
- The user
> The model publishes changes; views subscribe and redraw.
? What is the main benefit of an event bus?
- Faster code
+ Publishers and subscribers are decoupled and know only the event types
- Fewer events
> New subscribers need no change to publishers.
? Which MVC variant has a fully passive view driven by a presenter through an interface?
- MVVM
+ MVP
- MVC
> A passive view makes the presenter easy to test with a fake view.
```

:::keypoints
- MVC: Model (data+rules, notifies), View (displays), Controller (input → model). Built from Observer, Strategy and Composite. MVP and MVVM are variants with a passive view or data binding.
- Event bus: typed publish/subscribe; components know event types, not each other. Events are small immutable facts in the past tense.
- Decide sync vs async, ordering, error isolation and subscription lifetime.
:::
