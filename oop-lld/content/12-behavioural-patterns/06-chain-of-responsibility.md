---
title: Chain of Responsibility
level: intermediate
time: 35
summary: Pass a request along a line of handlers until one of them deals with it. See expense approval, logging levels, an ATM note dispenser, middleware pipelines, and the choices you must make.
---

## What is Chain of Responsibility?

Don't memorise the definition yet. Think of it like this:

> "I do not know who will solve my problem. So I give it to the first person. If they can't, they pass it to the next one, and so on, until someone solves it."

:::analogy Think of customer support
You call the helpline (level 1). If they cannot solve your problem, they pass you to a senior agent (level 2), and then to a manager (level 3). You do not choose who answers. Your request moves up until someone can handle it.
:::

:::def Chain of Responsibility
Link several handlers in a line. A request goes to the first one. Each handler either **handles it** or **passes it to the next**. The sender does not need to know who will handle it.
:::

Where you will see it: web **middleware** (login check, logging, rate limit), event bubbling in UIs, logging systems, approval workflows, ATM note dispensers, request checks.

## The structure

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

A small expense is approved by the team lead. A bigger one by the manager. An even bigger one by the director.

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

The user sends the request to the **first** handler and does not know who will approve it. To add a `VicePresident` level, write one new class and put it in the chain. Nothing else changes.

## Example: logging levels

A log message goes to every logger whose level is high enough. Here, the chain **continues even after one handler has acted**, because many loggers may care.

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

Each handler gives as many notes of its type as it can, then passes the **remaining amount** to the next handler.

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

## Pipelines and middleware with `std::function`

In modern C++, a chain of small functions is often simpler than classes. Each step gets the request and a `next` function, and decides whether to continue. This is how many web frameworks work.

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

Any step can **stop the chain** early. The login check does that here.

## Choices you must make

| Question | Options |
|---|---|
| Who stops the chain? | the **first** handler that handles it (approval, ATM), or **nobody** (logging: all interested handlers act) |
| What if nobody handles it? | a default handler at the end, an error, or ignore it |
| Who builds the chain? | the user or a factory. The **order** matters, so write it down |
| How does a handler keep `next`? | with `unique_ptr`, or keep all handlers in a `vector` and loop over them |
| How is the request passed? | as an object (`Request`), so handlers can read and note things on it |

## Mistakes to avoid

- A request may **fall off the end** and nobody handles it. Always decide what happens then.
- **Long chains** are hard to debug and slow. Keep them short, or log each step.
- A chain that loops back on itself runs forever.
- If handlers depend on each other's order in hidden ways, the chain becomes fragile. Make each handler independent.

## Short answer to say in an interview

:::interview When do you use Chain of Responsibility?
"When more than one object may handle a request, and I do not know in advance which one. The sender gives the request to the first object in a chain. Each handler either handles it or passes it on. This separates the sender from the receivers, and I can add or reorder handlers easily. Examples are approval limits, logging levels and middleware. I decide whether the first handler stops the chain or all interested handlers act, and what happens if nobody handles the request."
:::

```quiz
? What does the sender know about the handlers?
- Every handler
+ Only the first one in the chain
- Nothing at all
> It sends to the first one. The chain decides who handles it.
? In a logging chain, why does each logger pass the message on after handling it?
- It is a bug
+ Because several loggers (console, file, alert) may each care about it
- To avoid recursion
> This is the "everyone acts" kind, not the "first handler wins" kind.
? What is a risk of long chains?
- Compile errors
+ Hard-to-follow flow, and a request that may fall off the end unhandled
- They use templates
> Always define a default and keep chains short.
```

:::keypoints
- Chain of Responsibility: handlers in a line. Each handles the request or passes it on. The sender knows only the first one.
- Two kinds: first handler wins (approvals, ATM), or all interested act (logging, middleware).
- Decide the default for unhandled requests, the order of the chain, and avoid loops.
:::
