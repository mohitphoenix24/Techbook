---
title: MVC, MVP, MVVM and the event bus
level: intermediate
time: 35
summary: Keep data, screen and user input in separate parts (MVC and its cousins), see how MVC is built from patterns you already know, and learn the event bus, where parts talk through events without knowing each other.
---

Two big ideas appear in many LLD problems (a game, a chat app, a dashboard, a stock tracker):

1. **Keep the screen separate from the data.**
2. **Let parts talk through events**, not by calling each other.

## MVC: Model, View, Controller

Don't memorise the names yet. Think of a **restaurant**:

- The **kitchen** (Model) makes the food and holds the stock. It does not care how food is served.
- The **menu and plates** (View) show things to the customer.
- The **waiter** (Controller) takes the customer's order and tells the kitchen.

| Part | Its job | What it knows |
|---|---|---|
| **Model** | holds the **data and the business rules**. Announces when something changes | nothing about the screen |
| **View** | **shows** the model on screen | reads the model |
| **Controller** | takes the **user's action** and updates the model | the model and the view |

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

MVC is built from patterns you already know: **Observer** (the model announces changes to the views), **Strategy** (the controller is the view's way of handling input), and **Composite** (views can be nested).

## Example: a console counter in MVC

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

What do we gain?

- You can add a `GraphView` without touching the model.
- You can test the model without any screen.
- You can change input from the keyboard to the network by writing a new controller.

## MVC, MVP and MVVM

These three share one aim: **keep logic out of the screen code**.

| | MVC | MVP (Presenter) | MVVM |
|---|---|---|---|
| Who handles the user's action? | Controller | the **View** passes it to the Presenter | the View is **linked** to the ViewModel |
| How does the view get data? | it watches the Model | the **Presenter** pushes data to a simple View | **data binding** to the ViewModel |
| Is the View passive? | partly | **completely** (the Presenter is easy to test with a fake View) | mostly just a layout |
| Where it is common | web frameworks, desktop | older Android, WinForms | WPF, Angular, SwiftUI |

## The event bus (publish and subscribe)

In Observer, observers must know the subject. An **event bus** puts a **middleman** between those who announce and those who listen. Now the parts know only **the kind of event**, not each other. It is like a small, in-program version of Kafka or RabbitMQ.

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

To add a loyalty-points service, it just **subscribes** to `OrderPlaced`. `OrderService` does **not change at all**. That is the "open for adding, closed for editing" idea at the level of the whole system.

## Observer vs Event Bus vs Message Queue

| | Observer | Event bus (in one program) | Message queue (Kafka, RabbitMQ) |
|---|---|---|---|
| Coupling | the subject keeps its observers | parts know only event types | the same, but across programs |
| Delivery | immediate, same thread | usually immediate | later, saved, with retries |
| If a listener fails | the caller is affected | the caller is affected unless you catch it | isolated, and the message is delivered again |
| Scope | one object | one program | many services |

## Questions to expect

- **Immediate or later (sync or async)?** Immediate is simple and ordered. Later separates the speed of the parts but needs a queue and thread safety.
- **Order and delivery promises?** At most once or at least once? Are listeners safe to run twice?
- **Errors:** one failing listener should not stop the others.
- **Unsubscribing:** use tokens (see Observer).
- **Event design:** small, unchangeable data, named in the past tense (`OrderPlaced`), carrying ids and the facts needed.
- **Danger:** "event spaghetti". If everything reacts to everything, nobody can follow the flow. Write down the main flows.

## Short answer to say in an interview

:::interview Explain MVC. How is it related to Observer?
"MVC separates the data and rules (Model), the screen (View) and the user's actions (Controller). The model knows nothing about the screen. When it changes, it announces to its observers, which are the views. That is the Observer pattern. The controller turns user actions into model changes. This lets me add views, test the model alone, and change the input source easily. MVP makes the view passive and uses a presenter. MVVM uses data binding with a view model."
:::

```quiz
? In MVC, who tells the View that the data changed?
- The Controller
+ The Model, by announcing changes (Observer)
- The user
> The model announces. The views subscribe and redraw.
? What is the main benefit of an event bus?
- Faster code
+ Those who announce and those who listen are separate and know only the event types
- Fewer events
> A new listener needs no change in the announcer.
? Which version has a completely passive view, controlled by a presenter through an interface?
- MVVM
+ MVP
- MVC
> A passive view makes the presenter easy to test with a fake view.
```

:::keypoints
- MVC: Model (data and rules, announces changes), View (shows), Controller (user action to model). Built from Observer, Strategy and Composite. MVP and MVVM are cousins.
- Event bus: publish and subscribe by event type. Parts do not know each other. Events are small facts in the past tense.
- Decide: immediate or later, order, error handling, unsubscribing.
:::
