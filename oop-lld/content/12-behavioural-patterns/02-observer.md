---
title: Observer
level: intermediate
time: 40
summary: When one object changes, many others should know automatically. Learn subject and observers, push and pull, lambdas as observers, safe unsubscribing, avoiding dangling observers, and the common problems.
---

## What is the Observer pattern?

Don't memorise the definition yet. Think of it like this:

> "Something changes in one place. Many other places want to know. Instead of each place asking again and again, the changing object **tells everyone** who signed up."

:::analogy Think of a YouTube channel
You **subscribe**. When a new video is published, you get a notification. The channel does not know who you are or what you do with it. It just tells everyone on its list. You can unsubscribe any time.
:::

:::def Observer
One object (the **subject**) keeps a list of other objects (the **observers**). When the subject changes, it **notifies all of them automatically**.
:::

Where you will see it: button clicks in a UI, stock price tickers, notification systems, game events, spreadsheet cells, event-driven systems.

## The basic structure

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

The subject knows only the **Observer interface**, nothing more. A new observer needs **no change** in the subject. This keeps the two sides loosely joined.

## Push or pull?

| Style | What the subject sends | Good | Not so good |
|---|---|---|---|
| **Push** | the new data itself (`update(symbol, price)`) | simple, the observer does not need to ask | everyone gets data, even if they don't need it |
| **Pull** | only "something changed"; the observer asks for what it needs | the observer takes only what it wants | the observer must know the subject's methods |

## Modern C++: use lambdas as observers

If an observer is just "run this code", you do not need a class. Give back a **subscription token**. When the token goes out of scope, it unsubscribes automatically (RAII). This way a callback can never outlive its owner.

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

## What if an observer dies first?

If the subject holds **raw pointers** and an observer is destroyed without unsubscribing, the subject will call a dead object. Two fixes:

1. a subscription token (shown above), or
2. store a `weak_ptr` to the observer, and skip the ones that have expired.

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

## Problems that interviewers ask about

1. **Changing the list while notifying.** An observer subscribes or unsubscribes in the middle of the loop. Fix: loop over a **copy** of the list.
2. **Order of notification** is usually not guaranteed. Do not depend on it.
3. **Chain reactions.** Observer A changes the subject again, which notifies everyone again, maybe forever. Use a flag, or batch the changes.
4. **An observer throws an error.** It should not stop the others. Catch and log it.
5. **Threads.** Which thread runs the callbacks? Lock the list, but do **not** hold the lock while calling the observers (this can cause a deadlock).
6. **Forgotten listeners** (memory leaks). If observers never unsubscribe, the subject keeps them alive (with `shared_ptr`) or points to dead ones (with raw pointers). Use tokens or `weak_ptr`.

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

## Observer vs Pub/Sub vs Mediator

| | Observer | Pub/Sub (event bus) | Mediator |
|---|---|---|---|
| Does the subject know its observers? | yes (keeps a list) | **no**, a broker is in the middle | the colleagues know the mediator |
| Direction | one to many | many to many | many to many, with coordination logic |
| Typical use | UI events, model changes | service events, message queues | dialog boxes, chat rooms |

## Short answer to say in an interview

:::interview Implement the Observer pattern. What problems can happen?
"The subject keeps a list of observers. When its state changes, it calls update on each of them. Observers can subscribe and unsubscribe. In C++ I would use std::function callbacks with a subscription token that unsubscribes automatically, or weak_ptr to avoid dangling pointers. Problems: changing the list during notification (loop over a copy), no guaranteed order, chain reactions, exceptions in handlers, threads (do not hold the lock while calling out), and leaks from observers that never unsubscribe."
:::

```quiz
? What does the subject know about its observers?
- Their exact classes
+ Only the Observer interface
- Nothing, not even that they exist
> That keeps the coupling loose.
? What is a safe way to handle observers that unsubscribe during notification?
- Hold a lock forever
+ Loop over a copy of the observer list
- Ignore it
> Changing a list while looping over it is undefined behaviour.
? What is the "forgotten listener" problem?
- A listener that is too slow
+ Observers that never unsubscribe, so the subject keeps them alive or later calls dead ones
- Listeners without an interface
> Use tokens or weak_ptr to tie the subscription to the observer's life.
```

:::keypoints
- Observer: a subject notifies a changing list of subscribers through an interface. Loose coupling.
- In C++, prefer `std::function` observers with a subscription token, or `weak_ptr`.
- Handle changes during notification (copy), errors, order, threads and chain reactions.
:::
