---
title: What is low-level design? The 8-step framework
level: easy
time: 30
summary: Low-level design versus high-level design, what a complete LLD answer contains, an 8-step framework you can apply to any problem, and a full worked mini example (a notification system) from requirements to running code.
---

**High-level design (HLD)** decides the big boxes: services, databases, queues, how they talk and scale. **Low-level design (LLD)**, also called **object-oriented design (OOD)**, decides what happens **inside one of those boxes**: the classes, their responsibilities, their relationships, and the code structure.

| | HLD | LLD |
|---|---|---|
| Question | "How do we build and scale Uber?" | "How do we structure the code for the ride-matching module?" |
| Output | architecture diagram, data stores, APIs between services | class diagram, interfaces, patterns, key methods, working code |
| Concerns | scale, latency, availability, consistency | readability, extensibility, testability, correctness, concurrency inside a process |
| Tools | boxes and arrows, estimates | UML, SOLID, design patterns, C++/Java code |

## What a complete LLD answer contains

1. **Requirements** (what is in scope, what is not).
2. **Entities** (the classes) and **relationships** between them.
3. **Interfaces and public APIs**: the methods each class offers.
4. **Flows**: how the objects collaborate for the main use cases.
5. **Design decisions**: which patterns, and why.
6. **Code** for the core pieces (often runnable in a machine-coding round).
7. **Extensions and edge cases**: what changes easily, what does not, and concurrency.

## The 8-step framework

```viz algo=seq title="The framework, as a conversation"
participant you You [user]
participant spec Problem [box]
you -> spec : 1. Clarify requirements | Ask questions. Agree on scope, actors and must-haves. Write 5 to 8 bullet points.
you -> spec : 2. Find the entities | Underline nouns: they become classes, enums or value objects.
you -> spec : 3. Assign responsibilities | One job per class. Who owns what data? Who makes which decision?
you -> spec : 4. Draw the relationships | is-a, has-a (owns or just refers), uses. Mark multiplicities.
you -> spec : 5. Define the interfaces | Public methods only. Names that read like the problem statement.
you -> spec : 6. Walk the main flows | Sequence of calls for each use case. Fix the gaps you find.
you -> spec : 7. Add patterns where things vary | Strategy, Factory, Observer, State... only where change is likely.
you -> spec : 8. Code, then extend | Core code, a demo, then edge cases, concurrency and "what if" changes.
```

Use the same eight steps every time. A stable routine is the best defence against blank-page panic.

:::tip Pro habit
Say the step you are on: "Now I will list the entities." It shows structure, helps the interviewer follow, and stops you from jumping ahead.
:::

## Worked mini example: a notification service

**Prompt:** "Design a notification service that can send a message to a user by email, SMS or push. Users choose their preferred channels. We may add channels (WhatsApp, Slack) later."

### Step 1: requirements

| Question | Answer (assumed) |
|---|---|
| Channels now? | email, SMS, push |
| One or many channels per user? | a user has a **set** of preferred channels |
| Failure handling? | if one channel fails, continue with the others, and report the result |
| Delivery details (real SMTP etc.)? | out of scope: simulate sending |
| Extensibility? | **new channels without changing existing code** |

### Steps 2 to 4: entities, responsibilities, relationships

- **User**: name and preferred channels (data).
- **Message**: title and body (a value object).
- **Channel** (interface): knows how to `send(user, message)`. `EmailChannel`, `SmsChannel`, `PushChannel` implement it. *This is the variation point.*
- **NotificationService**: given a user and message, sends through each of the user's channels, collects results.

```viz algo=uml title="Notification service: class diagram"
class NotificationService
  - channels: map<ChannelType, Channel>
  + send(user: User, msg: Message): vector<Result>
class User
  - name: string
  - preferred: set<ChannelType>
class Message
  - title: string
  - body: string
interface Channel
  + send(user: User, msg: Message): bool
  + type(): ChannelType
class EmailChannel
class SmsChannel
class PushChannel
enum ChannelType
NotificationService --> Channel : uses 1..*
NotificationService ..> User
NotificationService ..> Message
EmailChannel ..|> Channel
SmsChannel ..|> Channel
PushChannel ..|> Channel
User --> ChannelType
```

### Steps 5 to 7: flow and pattern

The flow: `service.send(user, msg)` → for each preferred channel type → look up the `Channel` → `channel.send(...)` → record the result. Because *channels vary*, `Channel` is an interface (the **Strategy** pattern). Adding WhatsApp = one new class + one registration line.

### Step 8: the code

```cpp run title="Notification service: complete"
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>
using namespace std;

enum class ChannelType { Email, Sms, Push };
string toString(ChannelType t) {
    switch (t) { case ChannelType::Email: return "email"; case ChannelType::Sms: return "sms"; case ChannelType::Push: return "push"; }
    return "?";
}

struct Message { string title, body; };

class User {
    string name_;
    set<ChannelType> preferred_;
public:
    User(string name, set<ChannelType> prefs) : name_(move(name)), preferred_(move(prefs)) {}
    const string& name() const { return name_; }
    const set<ChannelType>& preferred() const { return preferred_; }
};

// The variation point: one interface, many implementations
class Channel {
public:
    virtual ~Channel() = default;
    virtual ChannelType type() const = 0;
    virtual bool send(const User& u, const Message& m) = 0;
};

class EmailChannel : public Channel {
public:
    ChannelType type() const override { return ChannelType::Email; }
    bool send(const User& u, const Message& m) override {
        cout << "  [email] to " << u.name() << ": " << m.title << " - " << m.body << "\n";
        return true;
    }
};
class SmsChannel : public Channel {
public:
    ChannelType type() const override { return ChannelType::Sms; }
    bool send(const User& u, const Message& m) override {
        if (m.body.size() > 40) { cout << "  [sms] message too long for " << u.name() << "\n"; return false; }
        cout << "  [sms] to " << u.name() << ": " << m.body << "\n";
        return true;
    }
};
class PushChannel : public Channel {
public:
    ChannelType type() const override { return ChannelType::Push; }
    bool send(const User& u, const Message& m) override {
        cout << "  [push] to " << u.name() << ": " << m.title << "\n";
        return true;
    }
};

struct Result { ChannelType channel; bool ok; };

class NotificationService {
    map<ChannelType, unique_ptr<Channel>> channels_;
public:
    void registerChannel(unique_ptr<Channel> c) { auto t = c->type(); channels_[t] = move(c); }   // open for extension
    vector<Result> send(const User& u, const Message& m) {
        vector<Result> results;
        for (ChannelType t : u.preferred()) {
            auto it = channels_.find(t);
            if (it == channels_.end()) { results.push_back({t, false}); continue; }   // channel not configured
            results.push_back({t, it->second->send(u, m)});                           // one failure does not stop the rest
        }
        return results;
    }
};

int main() {
    NotificationService svc;
    svc.registerChannel(make_unique<EmailChannel>());
    svc.registerChannel(make_unique<SmsChannel>());
    svc.registerChannel(make_unique<PushChannel>());

    User asha("Asha", {ChannelType::Email, ChannelType::Push});
    User ravi("Ravi", {ChannelType::Sms, ChannelType::Email});

    Message shortMsg{"Order shipped", "Your order #42 is on its way"};
    for (const User* u : {&asha, &ravi}) {
        cout << "to " << u->name() << ":\n";
        for (const Result& r : svc.send(*u, shortMsg)) cout << "  -> " << toString(r.channel) << (r.ok ? " ok" : " FAILED") << "\n";
    }

    cout << "a long message to Ravi (sms refuses it, email still goes):\n";
    Message longMsg{"Statement", "Your monthly statement for October is ready to view in the app"};
    for (const Result& r : svc.send(ravi, longMsg)) cout << "  -> " << toString(r.channel) << (r.ok ? " ok" : " FAILED") << "\n";
}
```

Look at what the design gives us: `NotificationService` never mentions `EmailChannel`, `SmsChannel` or `PushChannel`. To add `WhatsAppChannel`, write one class and call `registerChannel`. Nothing else changes. That is what an interviewer means by "extensible".

### What an interviewer would ask next (and your answers)

| Follow-up | Answer sketch |
|---|---|
| "Retry failed sends?" | Wrap a channel in a **Decorator** (`RetryingChannel`) or give the service a retry policy. |
| "Send asynchronously, many users?" | Put messages on a queue; worker threads call `send` (concurrency module). |
| "Different templates per channel?" | A `Formatter` strategy per channel, or a `MessageBuilder`. |
| "Users can mute a channel at night?" | A `DeliveryRule` chain (Chain of Responsibility) checked before `send`. |
| "Log every send?" | **Observer**: the service publishes `Sent`/`Failed` events. |

## Common mistakes in the first LLD round

- Jumping to code and discovering missing requirements at minute 30.
- Creating a class for everything (`NotificationManagerHelperUtil`). Classes need a clear *job*.
- Forgetting an **interface at the variation point**, then using `if (type == EMAIL)` chains.
- Drawing a beautiful diagram that the code does not follow.

```quiz
? Which of these belongs to LLD rather than HLD?
- Choosing between SQL and NoSQL for the whole system
+ Deciding the classes, interfaces and relationships inside one service
- Sizing the load balancer
> LLD is about the structure of code within a component.
? In the notification example, why is `Channel` an interface?
- Because C++ requires it
+ Channels vary and new ones will be added; the service should not change when they do
- To avoid using pointers
> It is the variation point: the Strategy pattern keeps the service closed for modification and open for extension.
```

:::keypoints
- LLD = the classes, interfaces, relationships and code inside a component. HLD = the big boxes between components.
- Use the same 8 steps: clarify, entities, responsibilities, relationships, interfaces, flows, patterns where things vary, code and extend.
- Find the **variation points** early: they become interfaces (strategies) so that new cases mean new classes, not edits.
:::
