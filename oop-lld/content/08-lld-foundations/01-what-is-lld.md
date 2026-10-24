---
title: What is low-level design? The 8-step method
level: easy
time: 30
summary: What LLD means in simple words, how it differs from system design, what a good LLD answer contains, an 8-step method you can use for every problem, and one small worked example (a notification system) from idea to running code.
---

Let's start with the basics, step by step.

## What is LLD in simple words?

Imagine you want to build a house.

- **High-level design (HLD)** is the map of the whole colony: where the roads, the water tank and the electricity lines go.
- **Low-level design (LLD)** is the plan of **one house**: which rooms, how big, and how the doors connect them.

In software:

- **HLD** answers: "Which servers, databases and services do we need?"
- **LLD** answers: "Inside one service, which **classes** do we write, what does each class do, and how do they talk to each other?"

LLD is also called **OOD** (object-oriented design). Same thing.

| | HLD | LLD |
|---|---|---|
| Question | "How do we build Uber for millions of users?" | "How do we write the code for the ride-matching part?" |
| What you draw | boxes for servers and databases | classes, interfaces and the links between them |
| What you care about | speed, scale, availability | clean code, easy to change, easy to test |
| What you write | diagrams | diagrams **plus real code** |

:::note One-line difference
HLD = the big boxes. LLD = what is inside one box.
:::

## What should a complete LLD answer have?

Interviewers look for these seven things, in this order:

1. **Requirements**: what we will build, and what we will not.
2. **Classes** (called entities) and how they are related.
3. **Methods**: what each class can do.
4. **Flow**: how the objects work together for the main use case.
5. **Design choices**: which pattern you used and why.
6. **Code** for the important parts.
7. **Extra cases**: what if a new feature comes? What if two users act at the same time?

## The 8-step method

Use the **same 8 steps every time**. Having a fixed routine stops you from freezing in front of a blank page.

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

:::tip Say the step out loud
Say "Now I will list the classes." It shows the interviewer you have a plan, and it stops you from jumping to code too early.
:::

## A small worked example: notification service

**Question:** "Design a system that sends a message to a user by email, SMS or push notification. Each user picks the channels they like. Later we may add WhatsApp or Slack."

### Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Which channels now? | email, SMS, push |
| One channel or many per user? | many; each user has a list of favourites |
| What if one channel fails? | try the others, and tell the caller what happened |
| Do we send real emails? | no, we will just print (simulate) |
| Will new channels come? | yes, **adding one should not touch old code** |

That last line is the most important one. It tells us where the design must be flexible.

### Steps 2 to 4: Find the classes

- **User**: has a name and a list of preferred channels.
- **Message**: has a title and a body.
- **Channel**: "something that can send a message". `EmailChannel`, `SmsChannel` and `PushChannel` are different kinds of it.
- **NotificationService**: takes a user and a message and sends it through each of the user's channels.

Here is the picture:

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

### Steps 5 to 7: How does it flow, and which pattern?

1. Someone calls `service.send(user, message)`.
2. The service goes through the user's channels one by one.
3. For each channel it calls `channel.send(...)`.
4. It collects the results and returns them.

Why is `Channel` an **interface** (a class that only says *what* to do, not *how*)? Because the channels are **different ways of doing the same job**. This is the **Strategy pattern**: many ways to do one thing, and you can swap them. In plain words: the service says "send this", and each channel knows its own way.

### Step 8: The code

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

Notice one thing: `NotificationService` never mentions `EmailChannel`, `SmsChannel` or `PushChannel` by name. To add WhatsApp you write one new class and register it. **You do not edit any old code.** That is what interviewers mean by "easy to extend".

### What the interviewer may ask next

| Follow-up | Simple answer |
|---|---|
| "What if sending fails? Retry?" | Wrap the channel in a `RetryingChannel` that tries again (Decorator pattern). |
| "What if there are millions of users?" | Put messages in a queue and let worker threads send them. |
| "Different text for each channel?" | Add a small formatter for each channel. |
| "Don't disturb users at night?" | Add a rule check before sending. |
| "Log every send?" | Let the service announce "sent" or "failed" events that a logger listens to (Observer pattern). |

## Mistakes beginners make

- Starting to code at once, then finding a missing requirement at minute 30.
- Making a class for everything, like `NotificationManagerHelperUtil`. Every class needs one clear job.
- Using `if (type == EMAIL) ... else if (type == SMS) ...` instead of an interface.
- Drawing a nice diagram and then writing code that does not match it.

## Short answer to say in an interview

:::interview What is LLD, and how do you start?
"LLD means designing the classes and code inside one component. I first clarify the requirements, then list the classes and their jobs, decide how they connect, put an interface wherever things can vary, and then write the main flow in code. Finally I talk about edge cases and extensions."
:::

```quiz
? Which of these is an LLD question?
- Which database should the whole system use?
+ Which classes and interfaces should we write inside one service?
- How many load balancers do we need?
> LLD is about the structure of the code inside one part of the system.
? In the notification example, why is Channel an interface?
- C++ forces us to
+ Channels are different ways of doing the same job, and new ones will come later
- To avoid pointers
> It lets us add a new channel without touching the service.
```

:::keypoints
- LLD = the classes, interfaces and code **inside** one part. HLD = the big boxes **between** parts.
- Always follow the same steps: ask, find classes, give each a job, connect them, add interfaces where things vary, code, then extend.
- Spot "things that can change" early. Each one becomes an interface, so a new case means a **new class**, not an edit.
:::
