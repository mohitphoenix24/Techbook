---
title: Bridge
level: advanced
time: 30
summary: Splitting a class that varies in two independent ways into two hierarchies connected by composition, avoiding the class explosion of subclassing both, with a messages-and-channels example and the comparison with Adapter and Strategy.
---

:::def Bridge
**Decouple an abstraction from its implementation** so that the two can vary independently.
:::

## The problem: a class explosion

Suppose notifications can be of several **kinds** (alert, reminder) and sent over several **channels** (email, SMS). If you subclass for every combination:

```text
Notification
 ├─ AlertEmail     ├─ AlertSms
 ├─ ReminderEmail  ├─ ReminderSms
 └─ ... add Push channel: AlertPush, ReminderPush
 └─ ... add Promo kind: PromoEmail, PromoSms, PromoPush
```

With *k* kinds and *c* channels you write **k × c** classes. Every new kind or channel multiplies the work. Two **independent dimensions of change** are tangled in one hierarchy.

## The Bridge solution

Make each dimension its own hierarchy. The **abstraction** (the kind of message) holds a **reference to an implementor** (the channel) and delegates the low-level work. Now you write **k + c** classes, and any pairing works.

```viz algo=uml title="Bridge: two hierarchies joined by a reference"
abstract class Notification
  # sender: MessageSender
  + send(to: string): void
class Alert
  + send(to: string): void
class Reminder
  + send(to: string): void
interface MessageSender
  + deliver(to: string, text: string): void
class EmailSender
class SmsSender
class PushSender
Alert --|> Notification
Reminder --|> Notification
Notification o-- MessageSender : bridge
EmailSender ..|> MessageSender
SmsSender ..|> MessageSender
PushSender ..|> MessageSender
```

```cpp run title="Notifications x channels: k + c classes, k x c combinations"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

// ---- the implementation hierarchy (HOW to deliver) ----
class MessageSender {
public:
    virtual ~MessageSender() = default;
    virtual void deliver(const string& to, const string& text) = 0;
};
class EmailSender : public MessageSender {
public:
    void deliver(const string& to, const string& text) override { cout << "  EMAIL to " << to << ": " << text << "\n"; }
};
class SmsSender : public MessageSender {
public:
    void deliver(const string& to, const string& text) override { cout << "  SMS   to " << to << ": " << text.substr(0, 30) << "\n"; }
};
class PushSender : public MessageSender {
public:
    void deliver(const string& to, const string& text) override { cout << "  PUSH  to " << to << ": " << text << "\n"; }
};

// ---- the abstraction hierarchy (WHAT to say) ----
class Notification {
protected:
    shared_ptr<MessageSender> sender_;                    // the bridge
public:
    explicit Notification(shared_ptr<MessageSender> s) : sender_(move(s)) {}
    virtual ~Notification() = default;
    virtual void send(const string& to) = 0;
    void setSender(shared_ptr<MessageSender> s) { sender_ = move(s); }     // the channel can change at run time
};
class Alert : public Notification {
    string what_;
public:
    Alert(shared_ptr<MessageSender> s, string what) : Notification(move(s)), what_(move(what)) {}
    void send(const string& to) override { sender_->deliver(to, "ALERT! " + what_); }
};
class Reminder : public Notification {
    string event_;
public:
    Reminder(shared_ptr<MessageSender> s, string event) : Notification(move(s)), event_(move(event)) {}
    void send(const string& to) override { sender_->deliver(to, "Reminder: " + event_ + " is tomorrow"); }
};

int main() {
    auto email = make_shared<EmailSender>();
    auto sms = make_shared<SmsSender>();
    auto push = make_shared<PushSender>();

    Alert a(email, "server down");
    Reminder r(sms, "team meeting");
    a.send("ops@example.com");
    r.send("+91-98765");

    r.setSender(push);                                     // same Reminder, a different channel: no new class
    r.send("asha-device-7");
}
```

Adding a **new channel** (`WhatsAppSender`) is one class and works with every notification. Adding a **new kind** (`Promo`) is one class and works over every channel.

## A second example: a shape with a renderer

```cpp run title="Shape (abstraction) x Renderer (implementation)"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Renderer {                                          // implementor
    virtual ~Renderer() = default;
    virtual void circle(double r) = 0;
    virtual void rect(double w, double h) = 0;
};
struct VectorRenderer : Renderer {
    void circle(double r) override { cout << "  <circle r=\"" << r << "\"/>\n"; }
    void rect(double w, double h) override { cout << "  <rect w=\"" << w << "\" h=\"" << h << "\"/>\n"; }
};
struct AsciiRenderer : Renderer {
    void circle(double r) override { cout << "  ( ) circle of radius " << r << "\n"; }
    void rect(double w, double h) override { cout << "  [ ] rectangle " << w << "x" << h << "\n"; }
};

class Shape {                                              // abstraction
protected:
    Renderer& r_;
public:
    explicit Shape(Renderer& r) : r_(r) {}
    virtual ~Shape() = default;
    virtual void draw() = 0;
    virtual void resize(double k) = 0;
};
class Circle : public Shape {
    double radius_;
public:
    Circle(Renderer& r, double radius) : Shape(r), radius_(radius) {}
    void draw() override { r_.circle(radius_); }
    void resize(double k) override { radius_ *= k; }
};
class Rectangle : public Shape {
    double w_, h_;
public:
    Rectangle(Renderer& r, double w, double h) : Shape(r), w_(w), h_(h) {}
    void draw() override { r_.rect(w_, h_); }
    void resize(double k) override { w_ *= k; h_ *= k; }
};

int main() {
    VectorRenderer svg; AsciiRenderer text;
    Circle c1(svg, 5); Circle c2(text, 5);
    Rectangle rc(svg, 2, 3);
    c1.draw(); c2.draw(); rc.resize(2); rc.draw();
}
```

## Bridge vs Adapter vs Strategy

| | Bridge | Adapter | Strategy |
|---|---|---|---|
| When it appears | **designed up front** to separate two dimensions | **retrofitted** to make incompatible things work | designed to swap one algorithm |
| Structure | two parallel hierarchies, abstraction holds an implementor | wraps one existing class | a context holds a strategy |
| Intent | structure: avoid a class explosion | compatibility | behaviour: choose an algorithm |
| Number of "varying dimensions" | two (abstraction, implementation) | one adaptee | one algorithm |

The code of Bridge and Strategy looks almost the same (an object holding an interface pointer). The difference is **intent and scale**: Strategy swaps one algorithm inside a class; Bridge splits a whole hierarchy into two so that both sides can grow.

## When to use Bridge

- A class varies along **two orthogonal dimensions** (kind × channel, shape × renderer, remote × device, platform × feature).
- You want to switch the implementation **at run time**.
- You want to hide implementation details from clients, and avoid recompiling the abstraction when the implementation changes (PIMPL is a special bridge with one implementor).

:::interview What is the Bridge pattern? When would you pick it over inheritance?
"Bridge splits a class that varies in two independent ways into two hierarchies, an abstraction and an implementor, connected by composition. With inheritance I would need one class per combination, k times c. With a bridge I write k plus c classes and can pair them freely, even changing the implementor at run time. I use it for things like notification kind by channel, or shapes by renderer."
:::

```quiz
? What problem does Bridge solve?
- Converting incompatible interfaces
+ The class explosion when something varies along two independent dimensions
- Creating one instance
> Two hierarchies joined by a reference replace a combinatorial subclass tree.
? In a Bridge, what does the abstraction hold?
- A copy of the implementor's code
+ A reference to an implementor interface, to which it delegates
- A pointer to its parent
> That reference is the "bridge" between the two hierarchies.
? How does Bridge differ from Adapter?
- They are identical
+ Bridge is designed up front to separate dimensions; Adapter is applied later to make existing classes compatible
> The shapes of the code are similar, the intent differs.
```

:::keypoints
- Bridge = two independent hierarchies (abstraction and implementation) linked by composition.
- It turns k × c subclasses into k + c and allows swapping the implementation at run time.
- It is designed up front; Adapter is retrofitted. Strategy is the one-dimension cousin.
:::
