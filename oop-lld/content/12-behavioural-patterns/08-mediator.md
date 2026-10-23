---
title: Mediator
level: intermediate
time: 30
summary: Centralising communication between many objects so they no longer refer to each other directly: a chat room, an air-traffic tower and a UI dialog, the many-to-many to many-to-one reduction, the risk of a god mediator, and how Mediator differs from Observer and Facade.
---

:::def Mediator
Define an object that **encapsulates how a set of objects interact**. Mediator promotes **loose coupling** by keeping objects from referring to each other explicitly, and lets you vary their interaction independently.
:::

:::analogy Think of it like this
An air-traffic control tower. Aircraft do not talk to each other to decide who lands first (n planes would need n × (n-1) conversations). Every pilot talks only to the tower, and the tower coordinates the runway.
:::

## The problem: a web of dependencies

In a dialog box: when the "Country" dropdown changes, the "State" list must refill; when the "Agree" checkbox is ticked, the "Submit" button must enable; when "Submit" is pressed, all fields validate. If every widget refers to the others, you get a tangle where each widget knows about several siblings, and none can be reused alone.

```text
Without a mediator (many-to-many):         With a mediator (many-to-one):

   A ──── B                                    A ─┐
   │ ╲  ╱ │                                    B ─┼──► Mediator
   │  ╲╱  │                                    C ─┤
   │  ╱╲  │                                    D ─┘
   C ──── D                         
```

## Structure

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

## A chat room

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

`User` knows **only the mediator**. To add rules (mute lists, private messages, profanity filters, history), you change `ChatRoom` only, and no user class.

## A UI dialog mediator

The classic use: widgets coordinate through a dialog object.

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

The widgets are plain and reusable: none mentions another widget. The business rule "submit is enabled only with an email and accepted terms" lives in **one** place.

## An air-traffic tower: coordination logic

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

Planes would never coordinate this safely by talking to each other. The mediator holds the **shared state** (runway, queue) and the policy.

## Mediator vs Observer vs Facade

| | Mediator | Observer | Facade |
|---|---|---|---|
| Direction | peers talk **through** a hub, in both directions | a subject **broadcasts** one way | clients call **in** to a subsystem |
| Colleagues know it? | **yes** (they hold the mediator) | observers know the subject interface | the subsystem does **not** know the facade |
| Has logic? | **yes**: coordination rules | no: just notifies | orchestrates calls |
| Typical use | dialog boxes, chat, tower | model→view updates, events | simplified API |

In practice the two combine: colleagues may notify the mediator through an Observer-like callback.

## The danger: a god mediator

All the interaction logic moves into the mediator, which can grow into a huge, tangled class. Keep it healthy by:

- splitting it into several mediators by area;
- making colleagues emit **events** and the mediator route them through small handlers;
- letting each rule be a small object the mediator consults (Strategy / Chain).

:::interview Mediator vs Observer?
"With Observer, one subject broadcasts changes to many observers who do not interact; the subject keeps a list. With Mediator, many peers communicate with each other *through* a central object that holds the interaction rules, so peers do not know each other. Mediator centralises coordination logic and turns many-to-many dependencies into many-to-one; the cost is that the mediator can become a god class."
:::

```quiz
? What does a Mediator reduce?
- Memory usage
+ Direct dependencies among peer objects (many-to-many becomes many-to-one)
- The number of classes
> Colleagues talk only to the mediator.
? Where does the coordination logic live?
- In each colleague
+ In the mediator
- In a base class
> That is its job: encapsulate how the objects interact.
? What is the main risk of the pattern?
- Too many interfaces
+ The mediator grows into a god class
- It breaks encapsulation of the colleagues
> Split it by area or delegate rules to small objects.
```

:::keypoints
- Mediator: colleagues talk only to a central object that encapsulates their interaction; many-to-many becomes many-to-one.
- Use for dialog widgets, chat rooms, air-traffic style coordination, workflow orchestration.
- Watch for a god mediator. Differs from Observer (one-way broadcast) and Facade (simplified entry; subsystem unaware).
:::
