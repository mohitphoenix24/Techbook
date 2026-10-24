---
title: "D: Dependency Inversion and dependency injection"
level: intermediate
time: 40
summary: Your main business code should not be tied to small details like email or databases. Learn why creating objects inside a class is a problem, how an interface fixes it, the three ways to pass objects in, and how to test with a fake.
---

**D** in SOLID stands for **Dependency Inversion Principle**, or **DIP**.

Don't memorise the formal definition yet. Think of it like this:

> "My main code should not care *which* tool does the small job. It should only say *what* job needs to be done."

:::def Dependency Inversion Principle (DIP)
1. Your **important code** (business rules) should not depend on **small details** (email, database, files). Both should depend on an **interface**.
2. The interface should not be shaped by one detail. The details should follow the interface.
:::

Two words to keep in mind:

- **High-level code** = your business rules. Example: "remind users about overdue books".
- **Low-level code** = the small mechanics. Example: send an email using SMTP, write to MySQL, call a web API.

The business rule should not know *how* the message is sent.

:::analogy Think of a phone and a charger
Your phone does not care if the electricity comes from a plug at home, a power bank or a car. It only needs a standard charging port (the interface). Because of that, you can change the source without touching the phone.
:::

## The problem: a class that creates its own helper

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

What is wrong here?

- To send an **SMS** instead of an email, you must **edit** `OverdueReminder`.
- You cannot **test** it without really sending an email.
- Your business rule is now tied to the details of SMTP.

The arrow of dependency points like this:

```text
   OverdueReminder  ───►  EmailSender          (policy depends on mechanism)
```

The important code depends on the small detail. That is the wrong direction.

## The fix: put an interface in between

Create an **interface** (owned by the important code). Let the small details follow it.

```text
   OverdueReminder  ───►  «interface» MessageSender  ◄───  EmailSender
                                                      ◄───  SmsSender
```

Now the arrow from `EmailSender` points **up** to the interface. The direction is **inverted**. That is where the name comes from.

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

Notice that `OverdueReminder` does not change when we change the channel. Only `main` knows the real classes. The place that creates and connects all the objects is called the **composition root**. Here it is `main`.

## Why this helps most: testing

Because the dependency is an interface, a test can pass a **fake** that just remembers what was sent.

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

No real email, no network, and the test runs in a blink.

## Three ways to give a class its helper

This is called **dependency injection (DI)**. "Inject" simply means "hand it in from outside".

| Way | Code | Use when |
|---|---|---|
| **Constructor** (best) | `Reminder(MessageSender& s)` | the class cannot work without it |
| **Setter** | `reminder.setSender(&s)` | it is optional, or can change later |
| **Method parameter** | `reminder.remind(m, days, sender)` | it is different for every call |

Constructor injection is the best default. The object can never be half-ready.

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

Which type should you store? Use this simple guide:

- **A reference**: the caller keeps the helper alive for longer than the class.
- **`unique_ptr`**: only this class uses the helper, so it owns it.
- **`shared_ptr`**: several classes really share it.

## Three terms people mix up

| Term | In simple words |
|---|---|
| **Dependency Inversion (DIP)** | a **rule**: depend on interfaces, not on details |
| **Dependency Injection (DI)** | a **trick** to follow the rule: pass the helper in from outside |
| **Inversion of Control (IoC)** | a **big idea**: someone else controls the flow ("don't call us, we will call you") |
| **DI container** | a **tool** that connects objects for you (common in Java, rare in C++). In C++ we usually connect them by hand in `main` |

## Choosing the helper from a setting

Sometimes the helper is chosen from a config value, like "email" or "sms". A small factory function can return the interface.

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

## Mistakes to avoid

- **Hidden helpers (service locator, singletons everywhere).** If a class quietly calls `ServiceLocator::get<Logger>()` inside, nobody can see what it needs. Prefer clear constructor parameters.
- **An interface with only one class and no test need.** That is extra work for no gain. Add an interface when you have a second class, or when you need a fake for a test.
- **An interface copied from one detail**, like `sendViaSmtp(host, port)`. Design it from the user's side: `send(to, text)`.
- **Too many constructor parameters** (more than 4 or 5). The class probably does too much.

## Short answer to say in an interview

:::interview Explain Dependency Inversion with an example.
"The main business code should not depend on small details. Both should depend on an interface. For example, OverdueReminder should use a MessageSender interface and not EmailSender directly. I pass the real sender in through the constructor from main. Then I can switch to SMS without editing the reminder, and I can test it with a fake sender. Dependency inversion is the rule, and dependency injection is the way to follow it."
:::

```quiz
? What does "inverting" the dependency mean?
- Reversing the order of function arguments
+ Making the small details depend on an interface owned by the important code
- Using virtual inheritance
> Normally the important code depends on the details. An interface flips that arrow.
? What is the best way to give a class a helper it must have?
- A global variable
+ Through the constructor
- Set it after creating the object
> The class can never be used without it.
? What is the biggest benefit of DIP for testing?
- Faster compile times
+ You can use a fake instead of a slow or real helper
- Fewer classes
> A test can pass a fake that records calls instead of sending real messages.
```

:::keypoints
- Depend on an interface, not on a concrete detail. The important code owns the interface.
- Pass helpers in from outside (constructor first), usually from `main`. Do not create them inside the class.
- DIP is the rule, DI is the trick, IoC is the wider idea. Fakes make testing easy.
- Avoid hidden helpers and useless interfaces. Keep constructor parameter lists short.
:::
