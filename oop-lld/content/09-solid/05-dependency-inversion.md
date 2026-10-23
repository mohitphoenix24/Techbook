---
title: D: Dependency Inversion and dependency injection
level: intermediate
time: 40
summary: High-level code should depend on abstractions, not on low-level details. The problem with new inside a class, inverting the dependency with an interface, constructor/setter/method injection, a composition root, testing with fakes, and the difference between DIP, DI and IoC.
---

:::def Dependency Inversion Principle (DIP)
1. **High-level modules should not depend on low-level modules. Both should depend on abstractions.**
2. **Abstractions should not depend on details. Details should depend on abstractions.**
:::

High-level = your business rules ("remind users about overdue books"). Low-level = the mechanics (send email through SMTP, write to MySQL, call a REST API). The business rules should not know which mechanism is used.

## The problem: a class that creates its own collaborators

```cpp run title="High-level code welded to a concrete class"
#include <iostream>
#include <string>
using namespace std;

class EmailSender {                                     // low-level detail
public:
    void send(const string& to, const string& text) { cout << "  [SMTP] to " << to << ": " << text << "\n"; }
};

class OverdueReminder {                                 // high-level business rule
    EmailSender sender_;                                // creates and depends on the concrete class
public:
    void remind(const string& member, int daysLate) {
        if (daysLate > 0) sender_.send(member, "Your book is " + to_string(daysLate) + " days overdue");
    }
};

int main() {
    OverdueReminder r;
    r.remind("asha@example.com", 3);
}
```

What is wrong?

- To use **SMS** instead of email, you must **edit** `OverdueReminder` (breaks OCP).
- You cannot **test** the reminder without really sending email.
- The business rule is tied to SMTP's header, libraries and failure modes.

The dependency arrows point from high-level to low-level:

```text
   OverdueReminder  ───►  EmailSender          (policy depends on mechanism)
```

## Inverting the dependency

Introduce an **abstraction owned by the high-level code**, and make the detail implement it.

```text
   OverdueReminder  ───►  «interface» MessageSender  ◄───  EmailSender
                                                      ◄───  SmsSender
```

Now `EmailSender` depends on the interface (it implements it): the arrow from the low-level detail **points upward**. The dependency is "inverted".

```cpp run title="Depend on an interface; inject the implementation"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class MessageSender {                                   // the abstraction, defined by what the high-level code needs
public:
    virtual ~MessageSender() = default;
    virtual void send(const string& to, const string& text) = 0;
};

class EmailSender : public MessageSender {
public:
    void send(const string& to, const string& text) override { cout << "  [email] " << to << ": " << text << "\n"; }
};
class SmsSender : public MessageSender {
public:
    void send(const string& to, const string& text) override { cout << "  [sms] " << to << ": " << text << "\n"; }
};

class OverdueReminder {
    MessageSender& sender_;                             // depends on the abstraction only
public:
    explicit OverdueReminder(MessageSender& s) : sender_(s) {}      // constructor injection
    void remind(const string& member, int daysLate) {
        if (daysLate > 0) sender_.send(member, "Your book is " + to_string(daysLate) + " days overdue");
    }
};

int main() {                                            // the "composition root": the ONE place that picks implementations
    EmailSender email;
    SmsSender sms;
    OverdueReminder byEmail(email), bySms(sms);
    byEmail.remind("asha@example.com", 3);
    bySms.remind("+91-98765-43210", 7);
}
```

`OverdueReminder` is unchanged when the channel changes. `main` (the **composition root**) is the only place that knows the concrete classes.

## Testing: the biggest practical payoff

Because the dependency is an interface, a test can pass a **fake** that records what happened.

```cpp run title="A test with a fake sender: no email, no network"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct MessageSender {
    virtual ~MessageSender() = default;
    virtual void send(const string& to, const string& text) = 0;
};

class OverdueReminder {
    MessageSender& sender_;
public:
    explicit OverdueReminder(MessageSender& s) : sender_(s) {}
    void remind(const string& member, int daysLate) {
        if (daysLate > 0) sender_.send(member, "overdue by " + to_string(daysLate) + " days");
    }
};

// The fake: records calls instead of doing real work
struct FakeSender : MessageSender {
    vector<pair<string, string>> sent;
    void send(const string& to, const string& text) override { sent.emplace_back(to, text); }
};

int main() {
    FakeSender fake;
    OverdueReminder reminder(fake);

    reminder.remind("asha", 3);          // should send
    reminder.remind("ravi", 0);          // not late: should NOT send
    reminder.remind("meera", -2);        // not late: should NOT send

    bool ok = fake.sent.size() == 1 && fake.sent[0].first == "asha" && fake.sent[0].second == "overdue by 3 days";
    cout << (ok ? "PASS" : "FAIL") << ": exactly one reminder, to asha, with the right text\n";
}
```

## Three ways to inject a dependency

| Style | Code | Use when |
|---|---|---|
| **Constructor injection** (preferred) | `Reminder(MessageSender& s)` | the dependency is required for the object to work |
| **Setter injection** | `reminder.setSender(&s)` | optional, or changeable at run time |
| **Method (parameter) injection** | `reminder.remind(m, days, sender)` | the dependency differs per call |

Constructor injection makes dependencies **visible and mandatory**: an object can never be half-configured.

```cpp run title="Ownership when injecting: reference, unique_ptr, shared_ptr"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Logger { virtual ~Logger() = default; virtual void log(const string& s) = 0; };
struct ConsoleLogger : Logger { void log(const string& s) override { cout << "  log: " << s << "\n"; } };

class ServiceA {                                  // borrows: the caller owns the logger and must keep it alive
    Logger& log_;
public:
    explicit ServiceA(Logger& l) : log_(l) {}
    void run() { log_.log("A running"); }
};
class ServiceB {                                  // owns: takes sole ownership
    unique_ptr<Logger> log_;
public:
    explicit ServiceB(unique_ptr<Logger> l) : log_(move(l)) {}
    void run() { log_->log("B running"); }
};
class ServiceC {                                  // shares: several services use one logger
    shared_ptr<Logger> log_;
public:
    explicit ServiceC(shared_ptr<Logger> l) : log_(move(l)) {}
    void run() { log_->log("C running"); }
};

int main() {
    ConsoleLogger shared;
    ServiceA a(shared);
    ServiceB b(make_unique<ConsoleLogger>());
    auto sp = make_shared<ConsoleLogger>();
    ServiceC c1(sp), c2(sp);
    a.run(); b.run(); c1.run(); c2.run();
}
```

Choose by **lifetime**: borrow (reference) when the caller outlives the service; own (`unique_ptr`) when the service is the sole user; share (`shared_ptr`) when lifetimes are genuinely shared.

## DIP, DI and IoC: three terms people mix up

| Term | What it is |
|---|---|
| **Dependency Inversion Principle** | A *design rule*: depend on abstractions, and let abstractions be owned by the high-level code |
| **Dependency Injection** | A *technique*: hand the dependencies to an object from outside (constructor/setter/parameter) instead of letting it create them |
| **Inversion of Control** | A *broader idea*: the framework or caller controls the flow ("Hollywood principle: don't call us, we'll call you"). DI is one kind |
| **DI container** | A *tool* that wires objects automatically (Spring, Guice; rare in C++). In C++ we usually do **manual DI in `main`** |

## A tiny registry-style factory (still DIP)

When the implementation is chosen from configuration, a factory function returns the abstraction:

```cpp run title="Choosing the implementation from a setting"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

struct Storage { virtual ~Storage() = default; virtual void save(const string& k) = 0; };
struct DiskStorage : Storage { void save(const string& k) override { cout << "  disk: " << k << "\n"; } };
struct CloudStorage : Storage { void save(const string& k) override { cout << "  cloud: " << k << "\n"; } };

unique_ptr<Storage> makeStorage(const string& kind) {
    if (kind == "disk")  return make_unique<DiskStorage>();
    if (kind == "cloud") return make_unique<CloudStorage>();
    throw invalid_argument("unknown storage " + kind);
}

class Archive {                                           // high-level: knows only Storage
    unique_ptr<Storage> storage_;
public:
    explicit Archive(unique_ptr<Storage> s) : storage_(move(s)) {}
    void archive(const string& doc) { storage_->save(doc); }
};

int main() {
    for (const char* setting : {"disk", "cloud"}) Archive(makeStorage(setting)).archive("report.pdf");
}
```

## Pitfalls

- **Service Locator / singletons everywhere**: a global `ServiceLocator::get<Logger>()` hides dependencies (not visible in the constructor) and makes tests brittle. Prefer explicit constructor parameters.
- **Interfaces with exactly one implementation, and no test or variation need**: abstraction without purpose. Add an interface when there is a second implementation *or* you need a fake for tests.
- **Leaky abstraction**: an interface that mirrors one implementation's quirks (`sendViaSmtp(host, port)`) is not really abstract. Design the interface from the **client's** point of view: `send(to, text)`.
- **Too many constructor parameters** (more than 4 or 5): a sign the class has too many responsibilities (SRP).

:::interview Explain Dependency Inversion with an example
"High-level business code should not depend on low-level details: both should depend on an abstraction that the high-level code owns. For example, an `OverdueReminder` should depend on a `MessageSender` interface, not on `EmailSender`. I inject the implementation through the constructor from `main`. That lets me switch to SMS without editing the reminder and test it with a fake sender. Dependency injection is the technique; dependency inversion is the principle."
:::

```quiz
? What does "inverting" the dependency mean?
- Reversing the order of function parameters
+ Making low-level details depend on an abstraction owned by the high-level code
- Using virtual inheritance
> Normally high-level code depends on low-level classes. DIP flips that arrow by introducing an interface.
? Which is the preferred way to inject a mandatory dependency?
- A global variable
+ Through the constructor
- Setting it after construction
> It makes the dependency explicit and impossible to forget.
? What is the biggest benefit of DIP for testing?
- Faster compile times
+ You can substitute fakes for slow or external collaborators
- Fewer classes
> A test passes a fake that records calls instead of sending real messages.
```

:::keypoints
- Depend on abstractions, not concrete details; the high-level code owns the interface.
- Inject dependencies (constructor first) from a composition root such as `main`; do not `new` collaborators inside the class.
- DIP is the principle, DI is the technique, IoC the wider idea. A fake implementation makes testing easy.
- Avoid service locators and speculative interfaces; keep constructor parameter lists short.
:::
