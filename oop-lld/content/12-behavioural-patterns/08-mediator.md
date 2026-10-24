---
title: Mediator
level: intermediate
time: 30
summary: Put one object in the middle so that many objects can work together without knowing each other. See a chat room, a sign-up form and an air-traffic tower, the danger of a giant mediator, and how Mediator differs from Observer and Facade.
---

## What is the Mediator pattern?

Don't memorise the definition yet. Think of it like this:

> "If everyone talks to everyone, it becomes a mess. So everyone talks to **one person in the middle**, and that person coordinates."

:::analogy Think of an air-traffic control tower
Planes do not talk to each other to decide who lands first. With 10 planes, that would need 90 conversations! Each pilot talks only to the tower, and the tower decides who uses the runway.
:::

:::def Mediator
An object in the middle that **controls how a group of objects talk to each other**. The objects no longer need to know about each other.
:::

## The problem: a web of connections

Take a sign-up form. When the "Country" dropdown changes, the "State" list must refill. When the "Agree" checkbox is ticked, the "Submit" button must turn on. When "Submit" is pressed, all fields must be checked.

If every widget knows about the others, you get a tangled web. No widget can be reused alone.

```text
Without a mediator (many-to-many):         With a mediator (many-to-one):

   A ──── B                                    A ─┐
   │ ╲  ╱ │                                    B ─┼──► Mediator
   │  ╲╱  │                                    C ─┤
   │  ╱╲  │                                    D ─┘
   C ──── D                         
```

## The structure

```viz algo=uml title="Mediator"
interface ChatMediator
  + send(from: User, msg: string): void
  + join(u: User): void
class ChatRoom
  - users: User[]
class User
  - name: string
  - room: ChatMediator
  + say(msg: string): void
  + receive(from: string, msg: string): void
ChatRoom ..|> ChatMediator
ChatRoom o-- User
User --> ChatMediator
```

## Example: a chat room

```cpp run title="Users talk to the room, never to each other"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class User;

class ChatMediator {
public:
    virtual ~ChatMediator() = default;
    virtual void join(User* u) = 0;
    virtual void send(const User& from, const string& msg) = 0;
};

class User {
    string name_;
    ChatMediator& room_;
public:
    User(string n, ChatMediator& r) : name_(move(n)), room_(r) { room_.join(this); }
    const string& name() const { return name_; }
    void say(const string& msg) { cout << name_ << " says: " << msg << "\n"; room_.send(*this, msg); }
    void receive(const string& from, const string& msg) { cout << "   [" << name_ << " sees] " << from << ": " << msg << "\n"; }
};

class ChatRoom : public ChatMediator {
    vector<User*> users_;
public:
    void join(User* u) override { users_.push_back(u); }
    void send(const User& from, const string& msg) override {
        for (User* u : users_) if (u != &from) u->receive(from.name(), msg);     // the room decides who gets what
    }
};

int main() {
    ChatRoom room;
    User asha("Asha", room), ravi("Ravi", room), meera("Meera", room);
    asha.say("hello everyone");
    ravi.say("hi Asha");
}
```

A `User` knows **only the room**. To add new rules (mute lists, private messages, a bad-word filter, history), you change only `ChatRoom`. No user class changes.

## Example: a sign-up form

```cpp run title="A sign-up form with a mediator"
#include <iostream>
#include <string>
using namespace std;

class Widget;
class Mediator {
public:
    virtual ~Mediator() = default;
    virtual void notify(Widget* sender, const string& event) = 0;
};
class Widget {
protected:
    Mediator* m_ = nullptr;
public:
    void setMediator(Mediator* m) { m_ = m; }
    virtual ~Widget() = default;
};

class Checkbox : public Widget {
    bool checked_ = false;
public:
    void toggle() { checked_ = !checked_; if (m_) m_->notify(this, checked_ ? "checked" : "unchecked"); }
    bool checked() const { return checked_; }
};
class TextBox : public Widget {
    string text_;
public:
    void type(const string& t) { text_ = t; if (m_) m_->notify(this, "changed"); }
    const string& text() const { return text_; }
};
class Button : public Widget {
    bool enabled_ = false;
public:
    void setEnabled(bool e) { enabled_ = e; cout << "  [Submit button " << (e ? "enabled" : "disabled") << "]\n"; }
    void click() { if (!enabled_) { cout << "  click ignored: button is disabled\n"; return; } if (m_) m_->notify(this, "clicked"); }
};

class SignupDialog : public Mediator {                      // all the interaction logic lives HERE
    TextBox email_; Checkbox terms_; Button submit_;
public:
    SignupDialog() { email_.setMediator(this); terms_.setMediator(this); submit_.setMediator(this); }
    TextBox& email() { return email_; } Checkbox& terms() { return terms_; } Button& submit() { return submit_; }
    void notify(Widget*, const string& event) override {
        bool ready = !email_.text().empty() && terms_.checked();           // the rule is in one place
        static bool last = false;
        if (event != "clicked" && ready != last) { submit_.setEnabled(ready); last = ready; }
        if (event == "clicked") cout << "  submitting " << email_.text() << "\n";
    }
};

int main() {
    SignupDialog d;
    d.submit().click();
    d.email().type("asha@example.com");
    d.terms().toggle();
    d.submit().click();
    d.terms().toggle();
}
```

The widgets are simple and reusable. None of them mentions another. The rule "Submit is enabled only if there is an email and the terms are accepted" lives in **one** place.

## Example: an air-traffic tower

```cpp run title="The tower owns the single runway"
#include <iostream>
#include <queue>
#include <string>
using namespace std;

class Tower {
    bool runwayBusy_ = false;
    queue<string> waiting_;
public:
    void requestLanding(const string& flight) {
        if (!runwayBusy_) { runwayBusy_ = true; cout << "  tower: " << flight << " cleared to land\n"; }
        else { waiting_.push(flight); cout << "  tower: " << flight << " hold, " << waiting_.size() << " in the queue\n"; }
    }
    void landed(const string& flight) {
        cout << "  " << flight << " has landed\n";
        runwayBusy_ = false;
        if (!waiting_.empty()) { string next = waiting_.front(); waiting_.pop(); requestLanding(next); }
    }
};

int main() {
    Tower t;
    t.requestLanding("AI-101");
    t.requestLanding("6E-202");
    t.requestLanding("SG-303");
    t.landed("AI-101");
    t.landed("6E-202");
}
```

The planes could never do this safely by talking to each other. The tower keeps the **shared information** (the runway and the waiting line) and the **rules**.

## Mediator vs Observer vs Facade

| | Mediator | Observer | Facade |
|---|---|---|---|
| Direction | peers talk **through** the middle, both ways | a subject **announces** one way | users call **into** a group of classes |
| Do they know it? | **yes**, they hold the mediator | observers know the subject's interface | the inner classes do **not** know the facade |
| Does it have rules? | **yes**, coordination rules | no, it only notifies | it only organises calls |
| Typical use | dialog boxes, chat, tower | model to view updates, events | a simpler API |

In real systems they are often used together.

## The danger: a giant mediator

All the interaction rules move into the mediator, so it can grow into a huge tangled class. To keep it healthy:

- split it into several mediators by area,
- let objects send **events**, and let the mediator send each event to a small handler,
- keep each rule in a small object (Strategy or Chain).

## Short answer to say in an interview

:::interview What is the difference between Mediator and Observer?
"In Observer, one subject announces changes to many observers, and the observers do not talk to each other. In Mediator, many objects talk to each other through a central object that holds the rules, so they do not know each other. Mediator turns many-to-many links into many-to-one. The risk is that the mediator becomes a giant class."
:::

```quiz
? What does a Mediator reduce?
- Memory use
+ Direct links between objects (many-to-many becomes many-to-one)
- The number of classes
> Objects talk only to the mediator.
? Where do the coordination rules live?
- In each object
+ In the mediator
- In a base class
> That is its job: it controls how the objects work together.
? What is the main risk of this pattern?
- Too many interfaces
+ The mediator grows into a giant class
- It breaks the other objects' privacy
> Split it by area or give rules to small objects.
```

:::keypoints
- Mediator: objects talk only to a central object that holds their interaction rules. Many-to-many becomes many-to-one.
- Use it for dialog widgets, chat rooms, air-traffic style coordination and workflows.
- Watch out for a giant mediator. It is different from Observer (one-way announcement) and Facade (a simple front door).
:::
