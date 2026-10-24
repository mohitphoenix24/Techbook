---
title: Bridge
level: intermediate
time: 30
summary: When a class changes in two independent ways, do not make a subclass for every combination. Split it into two groups joined by a link. Includes a notification and channel example and a comparison with Adapter and Strategy.
---

## What problem does Bridge solve?

Don't memorise the definition yet. Think of it like this:

> "My class can vary in **two different ways** at the same time. If I make a subclass for every combination, I will soon have too many classes."

Think of a remote control and a TV. There are many kinds of remotes (basic, smart) and many kinds of TVs (Sony, LG). You do not build a separate remote for every remote-TV pair. The remote just **connects** to any TV.

:::def Bridge
Split a class into two parts, the **abstraction** (what we do) and the **implementation** (how we do it), so that **each can change on its own**.
:::

## The problem: too many classes

Suppose notifications have different **kinds** (alert, reminder) and are sent through different **channels** (email, SMS). If we make a subclass for every combination:

```text
Notification
 ├─ AlertEmail     ├─ AlertSms
 ├─ ReminderEmail  ├─ ReminderSms
 └─ ... add Push channel: AlertPush, ReminderPush
 └─ ... add Promo kind: PromoEmail, PromoSms, PromoPush
```

With *k* kinds and *c* channels, we need **k × c** classes. Adding one new channel means adding a class for every kind. That grows very fast.

## The Bridge solution

Make **two small families** instead of one big one:

- the **kind** of message (alert, reminder),
- the **channel** (email, SMS).

The kind **holds a link** (a reference) to a channel and asks it to do the actual sending. Now we write only **k + c** classes, and any kind works with any channel.

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

- Add a **new channel** (like WhatsApp): write **one class**. It works with every kind.
- Add a **new kind** (like Promo): write **one class**. It works with every channel.

## A second example: shape and renderer

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

A shape (circle, square) can be drawn by any renderer (screen, printer). The shape does not need to know how drawing works.

## Bridge vs Adapter vs Strategy

| | Bridge | Adapter | Strategy |
|---|---|---|---|
| When | **planned at the start** to keep two things apart | **added later** to make two things fit | planned to swap one algorithm |
| Shape | two families, linked by a reference | one wrapper around one class | one class holding one strategy |
| Goal | avoid too many classes | make things compatible | choose how to do one job |

The code of Bridge and Strategy looks almost the same: an object holding a pointer to an interface. The difference is the **purpose**. Strategy swaps one algorithm inside a class. Bridge splits a whole class family into two, so both sides can grow.

## When to use Bridge

- A class varies in **two independent ways** (kind × channel, shape × renderer, remote × device).
- You want to switch the implementation **while the program runs**.
- You want to hide the details of the implementation from users.

## Short answer to say in an interview

:::interview What is the Bridge pattern, and why use it instead of inheritance?
"Bridge is for a class that varies in two independent ways. I split it into two small families, an abstraction and an implementation, joined by a reference. With inheritance I would need one class for every combination, k times c. With Bridge I need only k plus c, and I can mix them freely, even at run time. For example, notification kind and sending channel."
:::

```quiz
? What problem does Bridge solve?
- Making incompatible interfaces fit
+ Too many classes when something changes in two independent ways
- Creating exactly one object
> Two small families joined by a link replace a big tree of subclasses.
? What does the "abstraction" hold in a Bridge?
- A copy of the implementation's code
+ A reference to an implementation interface, to which it passes the work
- A pointer to its parent
> That reference is the bridge.
? How is Bridge different from Adapter?
- They are the same
+ Bridge is planned at the start to keep two things apart. Adapter is added later to make existing things fit.
> The code can look similar, but the purpose is different.
```

:::keypoints
- Bridge = two families (abstraction and implementation) joined by composition.
- It turns k × c classes into k + c, and the implementation can change at run time.
- It is planned from the start. Adapter is added later. Strategy is the one-dimension cousin.
:::
