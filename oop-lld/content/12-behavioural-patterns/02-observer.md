---
title: Observer
level: intermediate
time: 40
summary: One-to-many notification when state changes: subject and observers, push versus pull, lambdas as observers, safe unsubscribe with RAII tokens, avoiding dangling observers with weak_ptr, re-entrancy during notification, and an event bus.
---

:::def Observer
Define a **one-to-many dependency** between objects so that when one object (the **subject**) changes state, all its dependents (the **observers**) are **notified and updated automatically**.
:::

:::analogy Think of it like this
A YouTube channel. You **subscribe**. When a new video is published, you get a notification. The channel does not know who you are or what you do with it; it just announces to everyone on its list. You can unsubscribe any time.
:::

Where it appears: GUI events (button click), model-view-controller, stock tickers, notification systems, event-driven design, publish-subscribe, spreadsheet cells, game events.

## Basic structure

```viz algo=uml title="Observer"
interface Observer
  + update(price: double): void
class StockTicker
  - observers: Observer[]
  - price: double
  + subscribe(o: Observer): void
  + unsubscribe(o: Observer): void
  + setPrice(p: double): void
class MobileApp
class Dashboard
class AlertService
StockTicker o-- Observer
MobileApp ..|> Observer
Dashboard ..|> Observer
AlertService ..|> Observer
```

```cpp run title="A stock ticker and its observers"
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class PriceObserver {
public:
    virtual ~PriceObserver() = default;
    virtual void update(const string& symbol, double price) = 0;
};

class StockTicker {                                        // the subject
    string symbol_;
    double price_ = 0;
    vector<PriceObserver*> observers_;
public:
    explicit StockTicker(string s) : symbol_(move(s)) {}
    void subscribe(PriceObserver* o) { observers_.push_back(o); }
    void unsubscribe(PriceObserver* o) { observers_.erase(remove(observers_.begin(), observers_.end(), o), observers_.end()); }
    void setPrice(double p) {
        price_ = p;
        for (auto* o : observers_) o->update(symbol_, price_);          // notify everyone
    }
};

class Dashboard : public PriceObserver {
public:
    void update(const string& s, double p) override { cout << "  [dashboard] " << s << " = " << p << "\n"; }
};
class AlertService : public PriceObserver {
    double threshold_;
public:
    explicit AlertService(double t) : threshold_(t) {}
    void update(const string& s, double p) override { if (p > threshold_) cout << "  [alert] " << s << " crossed " << threshold_ << "!\n"; }
};

int main() {
    StockTicker infy("INFY");
    Dashboard dash;
    AlertService alert(1500);
    infy.subscribe(&dash);
    infy.subscribe(&alert);

    infy.setPrice(1480);
    infy.setPrice(1520);
    infy.unsubscribe(&dash);
    cout << "dashboard unsubscribed\n";
    infy.setPrice(1490);
}
```

The subject knows **only the Observer interface**. New observers need no change to the subject (OCP), and subject and observers are loosely coupled.

## Push vs pull

| Style | What the subject sends | Pros | Cons |
|---|---|---|---|
| **Push** | the changed data itself (`update(symbol, price)`) | simple, observers need not call back | every observer gets data it may not need |
| **Pull** | just a "changed" signal; observers **query** the subject | observers take only what they want | observers must know the subject's interface |

## Modern C++: lambdas and std::function as observers

When an observer is just "run this code", skip the class hierarchy. Return a **subscription token** (RAII) that unsubscribes in its destructor, so callbacks cannot outlive their owners.

```cpp run title="Event with lambdas and an RAII subscription"
#include <functional>
#include <iostream>
#include <map>
#include <string>
using namespace std;

template <typename... Args>
class Event {
    map<int, function<void(Args...)>> handlers_;
    int nextId_ = 1;
public:
    class Subscription {                                   // RAII: unsubscribes when destroyed
        Event* e_; int id_;
    public:
        Subscription(Event* e, int id) : e_(e), id_(id) {}
        Subscription(Subscription&& o) noexcept : e_(exchange(o.e_, nullptr)), id_(o.id_) {}
        Subscription& operator=(Subscription&&) = delete;
        ~Subscription() { if (e_) e_->handlers_.erase(id_); }
    };
    [[nodiscard]] Subscription subscribe(function<void(Args...)> h) { handlers_[nextId_] = move(h); return Subscription(this, nextId_++); }
    void emit(Args... args) const { for (auto& [id, h] : handlers_) h(args...); }
    size_t listeners() const { return handlers_.size(); }
};

int main() {
    Event<string, int> orderPlaced;
    auto logger = orderPlaced.subscribe([](const string& who, int total) { cout << "  [log] order by " << who << " total " << total << "\n"; });
    {
        auto mailer = orderPlaced.subscribe([](const string& who, int) { cout << "  [mail] thanks " << who << "\n"; });
        orderPlaced.emit("asha", 500);
        cout << "listeners: " << orderPlaced.listeners() << "\n";
    }                                                       // mailer's token dies: automatically unsubscribed
    orderPlaced.emit("ravi", 120);
    cout << "listeners: " << orderPlaced.listeners() << "\n";
    (void)logger;
}
```

## Lifetime: observers that die first

A subject holding **raw pointers** to observers will call a dead object if an observer is destroyed without unsubscribing. Two fixes: (1) RAII subscription tokens (above); (2) store `weak_ptr<Observer>` and skip the expired ones.

```cpp run title="weak_ptr observers: no dangling calls"
#include <algorithm>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Listener {
    string name;
    explicit Listener(string n) : name(move(n)) {}
    void onNews(const string& item) const { cout << "  " << name << " read: " << item << "\n"; }
};

class NewsAgency {
    vector<weak_ptr<Listener>> subs_;
public:
    void subscribe(const shared_ptr<Listener>& l) { subs_.push_back(l); }
    void publish(const string& item) {
        subs_.erase(remove_if(subs_.begin(), subs_.end(), [](auto& w) { return w.expired(); }), subs_.end());
        for (auto& w : subs_) if (auto l = w.lock()) l->onNews(item);
    }
};

int main() {
    NewsAgency agency;
    auto a = make_shared<Listener>("Asha");
    {
        auto b = make_shared<Listener>("Ravi");
        agency.subscribe(a); agency.subscribe(b);
        agency.publish("budget announced");
    }                                                      // Ravi is destroyed without unsubscribing
    agency.publish("rain expected");
}
```

## Pitfalls interviewers probe

1. **Re-entrancy:** an observer **unsubscribes or subscribes during notification**, invalidating the list being iterated. Fix: iterate over a **copy** of the list (snapshot) or mark removals and apply them afterwards.
2. **Notification order** is usually unspecified. Do not depend on it.
3. **Cascading updates:** observer A changes the subject, triggering another round of notifications (infinite loops). Guard with a flag, or batch changes.
4. **Exceptions in an observer:** one failing observer should not stop the others. Catch and log, or let it propagate by policy.
5. **Threading:** which thread runs the callbacks? Protect the list with a mutex; do not hold the lock while calling observers (deadlock risk).
6. **Memory leaks** ("lapsed listener"): observers never unsubscribe, so the subject keeps them alive (with `shared_ptr`) or dangles (with raw pointers). Use tokens or `weak_ptr`.

```cpp run title="Safe notification: iterate over a snapshot"
#include <functional>
#include <iostream>
#include <vector>
using namespace std;

class Button {
    vector<function<void()>> handlers_;
public:
    void onClick(function<void()> h) { handlers_.push_back(move(h)); }
    void click() {
        auto snapshot = handlers_;                         // a handler may add more handlers; do not iterate the live vector
        for (auto& h : snapshot) h();
    }
    size_t count() const { return handlers_.size(); }
};

int main() {
    Button b;
    b.onClick([&] { cout << "  handler 1 runs, and adds another handler\n"; b.onClick([] { cout << "  late handler\n"; }); });
    b.click();                                             // safe: the new handler only runs next time
    cout << "handlers now: " << b.count() << "\n";
    b.click();
}
```

## Observer, Mediator and Pub/Sub

| | Observer | Pub/Sub (event bus) | Mediator |
|---|---|---|---|
| Subject knows observers? | yes (holds the list) | **no**: a broker sits between | colleagues know the mediator |
| Coupling | subject ↔ observers via interface | publishers and subscribers fully decoupled (topics) | colleagues decoupled from each other |
| Direction | one-to-many | many-to-many | many-to-many, with coordination logic |
| Typical use | UI events, model changes | microservice events, message queues | dialog boxes, chat rooms |

:::interview Implement the Observer pattern. What are its problems?
"A subject keeps a list of observer interfaces and calls `update` on each when its state changes; observers subscribe and unsubscribe. In C++ I would use `std::function` callbacks with an RAII subscription token, or `weak_ptr` to avoid dangling. Issues: re-entrant subscribe or unsubscribe during notification (iterate a copy), unspecified order, cascading updates, exceptions in handlers, thread-safety (do not hold the lock while calling out), and leaks from observers that never unsubscribe."
:::

```quiz
? What does the subject know about its observers?
- Their concrete classes
+ Only the Observer interface
- Nothing, not even that they exist
> That is what keeps the coupling loose.
? What is a safe way to handle observers that may unsubscribe during notification?
- Hold a lock forever
+ Iterate over a snapshot (copy) of the observer list
- Ignore it
> Modifying a container while iterating it is undefined behaviour.
? What is the "lapsed listener" problem?
- A listener that is too slow
+ Observers that never unsubscribe, so the subject keeps them alive or later calls dead ones
- Listeners with no interface
> Use RAII tokens or weak_ptr to tie subscription to the observer's lifetime.
```

:::keypoints
- Observer: subject notifies a changing list of subscribers through an interface; loose coupling and OCP.
- In C++ prefer `std::function` observers with RAII subscription tokens or `weak_ptr`.
- Handle re-entrancy (snapshot), exceptions, ordering, threads, and cascading updates.
:::
