---
title: Chain of Responsibility
level: intermediate
time: 35
summary: Passing a request along a chain of handlers until one handles it: support-ticket escalation, a logger with levels, an ATM cash dispenser, a validation and middleware pipeline, building and ordering the chain, and the two variants (first handler wins vs everyone processes).
---

:::def Chain of Responsibility
Avoid coupling the **sender** of a request to its **receiver** by giving **more than one object a chance to handle the request**. Chain the receiving objects and pass the request along the chain until an object handles it.
:::

:::analogy Think of it like this
A customer-support escalation. You call the helpline (level 1). If they cannot solve it, they pass you to a senior agent (level 2), then a manager (level 3). You do not choose who answers; the request travels up until someone can resolve it.
:::

Where it appears: servlet filters and web **middleware** (authentication, logging, rate limiting), event bubbling in GUIs, logging frameworks, approval workflows, exception handling (catch blocks), ATM note dispensers, request validation.

## Structure

```viz algo=uml title="Chain of Responsibility"
abstract class Handler
  # next: Handler
  + setNext(h: Handler): Handler
  + handle(req: Request): void
class Level1Support
class Level2Support
class ManagerSupport
Level1Support --|> Handler
Level2Support --|> Handler
ManagerSupport --|> Handler
Handler o-- Handler : next
```

## Example: expense approval

Small expenses are approved by a team lead; larger ones by a manager; larger still by a director.

```cpp run title="Each handler decides: handle it, or pass it on"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Approver {
    unique_ptr<Approver> next_;
public:
    virtual ~Approver() = default;
    Approver* setNext(unique_ptr<Approver> n) { next_ = move(n); return next_.get(); }   // returns the new tail for fluent chaining
    void handle(long amount) {
        if (canApprove(amount)) approve(amount);
        else if (next_) next_->handle(amount);              // pass it on
        else cout << "  nobody can approve Rs" << amount << ": rejected\n";
    }
protected:
    virtual bool canApprove(long amount) const = 0;
    virtual void approve(long amount) const = 0;
};

class TeamLead : public Approver {
    bool canApprove(long a) const override { return a <= 5000; }
    void approve(long a) const override { cout << "  Team Lead approved Rs" << a << "\n"; }
};
class Manager : public Approver {
    bool canApprove(long a) const override { return a <= 50000; }
    void approve(long a) const override { cout << "  Manager approved Rs" << a << "\n"; }
};
class Director : public Approver {
    bool canApprove(long a) const override { return a <= 500000; }
    void approve(long a) const override { cout << "  Director approved Rs" << a << "\n"; }
};

int main() {
    auto head = make_unique<TeamLead>();                   // build the chain once
    head->setNext(make_unique<Manager>())->setNext(make_unique<Director>());

    for (long amount : {2000L, 20000L, 200000L, 9000000L}) head->handle(amount);
}
```

The client sends the request to the **head** and does not know who will handle it. Adding a `VicePresident` level is a new class inserted into the chain; nothing else changes.

## Example: logging levels

A log message goes to every logger whose level is at or above a threshold. Here the variant is "**everyone who is interested processes it**" (the chain continues even after handling).

```cpp run title="Console, file and alert loggers in a chain"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

enum class Level { Debug = 1, Info = 2, Error = 3 };

class Logger {
    Level threshold_;
    unique_ptr<Logger> next_;
public:
    explicit Logger(Level t) : threshold_(t) {}
    virtual ~Logger() = default;
    Logger* setNext(unique_ptr<Logger> n) { next_ = move(n); return next_.get(); }
    void log(Level level, const string& msg) {
        if (level >= threshold_) write(msg);               // handle...
        if (next_) next_->log(level, msg);                 // ...and ALWAYS pass on
    }
protected:
    virtual void write(const string& msg) = 0;
};
class ConsoleLogger : public Logger {
public:
    ConsoleLogger() : Logger(Level::Debug) {}
    void write(const string& m) override { cout << "  [console] " << m << "\n"; }
};
class FileLogger : public Logger {
public:
    FileLogger() : Logger(Level::Info) {}
    void write(const string& m) override { cout << "  [file]    " << m << "\n"; }
};
class AlertLogger : public Logger {
public:
    AlertLogger() : Logger(Level::Error) {}
    void write(const string& m) override { cout << "  [ALERT]   " << m << "\n"; }
};

int main() {
    auto chain = make_unique<ConsoleLogger>();
    chain->setNext(make_unique<FileLogger>())->setNext(make_unique<AlertLogger>());
    cout << "debug message:\n"; chain->log(Level::Debug, "cache miss");
    cout << "info message:\n";  chain->log(Level::Info, "user logged in");
    cout << "error message:\n"; chain->log(Level::Error, "payment failed");
}
```

## Example: ATM cash dispenser

Each handler dispenses as many notes of its denomination as it can, then passes the **remainder** on.

```cpp run title="Dispense Rs 3,770 with 2000, 500, 100 notes"
#include <iostream>
#include <memory>
using namespace std;

class NoteDispenser {
    int denomination_;
    unique_ptr<NoteDispenser> next_;
public:
    explicit NoteDispenser(int d) : denomination_(d) {}
    NoteDispenser* setNext(unique_ptr<NoteDispenser> n) { next_ = move(n); return next_.get(); }
    void dispense(int amount) {
        int notes = amount / denomination_;
        if (notes > 0) cout << "  " << notes << " x Rs" << denomination_ << "\n";
        int remainder = amount % denomination_;
        if (remainder > 0) {
            if (next_) next_->dispense(remainder);
            else cout << "  cannot dispense the last Rs" << remainder << "\n";
        }
    }
};

int main() {
    NoteDispenser head(2000);
    head.setNext(make_unique<NoteDispenser>(500))->setNext(make_unique<NoteDispenser>(100));
    head.dispense(3770);
}
```

## Pipelines and middleware with std::function

In modern C++ a chain of `std::function` steps is often simpler than classes. Each step receives the request and a `next` callback, and decides whether to continue (like Express.js or ASP.NET middleware).

```cpp run title="Middleware: authenticate, rate-limit, then handle"
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Request { string user; string path; int callsToday; };
using Next = function<string(const Request&)>;
using Middleware = function<string(const Request&, const Next&)>;

string runChain(const vector<Middleware>& chain, size_t i, const Request& r, const function<string(const Request&)>& handler) {
    if (i == chain.size()) return handler(r);
    Next next = [&, i](const Request& req) { return runChain(chain, i + 1, req, handler); };
    return chain[i](r, next);
}

int main() {
    vector<Middleware> chain{
        [](const Request& r, const Next& next) { cout << "  [log] " << r.path << "\n"; return next(r); },
        [](const Request& r, const Next& next) { if (r.user.empty()) return string("401 unauthorised"); return next(r); },
        [](const Request& r, const Next& next) { if (r.callsToday > 100) return string("429 too many requests"); return next(r); },
    };
    auto handler = [](const Request& r) { return "200 hello " + r.user; };

    for (Request r : {Request{"asha", "/home", 5}, Request{"", "/home", 5}, Request{"ravi", "/home", 500}}) {
        string response = runChain(chain, 0, r, handler);         // run first (it prints the [log] line), then show the result
        cout << "  -> " << response << "\n";
    }
}
```

Any link can **short-circuit** the chain (return early), as authentication does here.

## Design decisions

| Question | Options |
|---|---|
| Who stops the chain? | the **first** handler that handles it (approval, ATM remainder), or **none** (logging: all interested handlers act) |
| What if nobody handles it? | a default handler at the end, an error, or ignore |
| Who builds the chain? | the client or a factory; the **order** matters, so document it |
| Handlers hold `next` how? | `unique_ptr` (owned chain), or the chain lives in a `vector` and the runner loops |
| Request passed how? | an object (`Request`) so handlers can read and annotate it |

## Pitfalls

- A request may **fall off the end** unhandled: always decide the default.
- **Long chains** are hard to debug and slow: keep them short, or log each hop.
- Cycles in the chain cause infinite loops.
- Handlers with hidden dependence on order are fragile. Make each independent where possible.

:::interview Chain of Responsibility: when and why?
"When more than one object may handle a request and the handler is not known in advance. The sender hands the request to the first object in a chain; each handler either handles it or passes it to the next. It decouples senders from receivers, and handlers can be added or reordered. Examples: approval limits, logging levels, middleware pipelines, event bubbling. I decide whether the first handler stops the chain or all interested handlers act, and what happens if no one handles the request."
:::

```quiz
? What does the sender know about the handlers?
- Every concrete handler
+ Only the first one in the chain
- Nothing at all
> It sends to the head; the chain decides who handles it.
? In a logging chain, why does each logger pass the message on even after handling it?
- A bug
+ Because several loggers (console, file, alert) may each be interested
- To avoid recursion
> This is the "everyone processes" variant, as opposed to "first handler wins".
? What is a risk of long chains?
- Compile errors
+ Hard-to-debug flow and a request that falls off the end unhandled
- They use more templates
> Always define a default and keep chains short and well-logged.
```

:::keypoints
- Chain of Responsibility: handlers linked in order; each handles the request or passes it on; the sender knows only the head.
- Two variants: first handler wins (approvals, ATM) or all interested act (logging, middleware).
- Decide the default for unhandled requests, the chain order, and how to avoid cycles.
:::
