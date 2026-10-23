---
title: Null Object
level: easy
time: 25
summary: Replacing null checks with an object that does nothing safely: a null logger, null discount and null customer, how it differs from optional, and when a silent default hides a real error.
---

:::def Null Object
Provide an object that **implements the expected interface but does nothing** (or returns neutral defaults), so clients can use it **without checking for null**.
:::

## The problem: null checks everywhere

```cpp run title="Every caller must remember to check"
#include <iostream>
#include <string>
using namespace std;

struct Logger { virtual ~Logger() = default; virtual void log(const string& m) = 0; };
struct ConsoleLogger : Logger { void log(const string& m) override { cout << "  [log] " << m << "\n"; } };

class Service {
    Logger* log_;                                          // may be null if the caller does not want logging
public:
    explicit Service(Logger* l = nullptr) : log_(l) {}
    void a() { if (log_) log_->log("a started"); cout << "  doing a\n"; if (log_) log_->log("a finished"); }
    void b() { if (log_) log_->log("b started"); cout << "  doing b\n"; }     // forgot the second check? it is easy to miss one
};

int main() {
    ConsoleLogger c;
    Service withLog(&c), without;
    withLog.a();
    without.b();
}
```

Every use needs `if (log_)`. Miss one and you crash. The logic of the service is buried under defensive checks.

## The Null Object

```cpp run title="A logger that logs nothing"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Logger { virtual ~Logger() = default; virtual void log(const string& m) = 0; };
struct ConsoleLogger : Logger { void log(const string& m) override { cout << "  [log] " << m << "\n"; } };
struct NullLogger : Logger { void log(const string&) override {} };           // the null object: valid, harmless

class Service {
    Logger& log_;                                          // never null: no checks
public:
    explicit Service(Logger& l) : log_(l) {}
    void a() { log_.log("a started"); cout << "  doing a\n"; log_.log("a finished"); }
};

int main() {
    ConsoleLogger console; NullLogger quiet;
    Service loud(console), silent(quiet);
    loud.a();
    silent.a();                                            // same code path, no output from the logger
}
```

```viz algo=uml title="Null Object"
interface Logger
  + log(msg: string): void
class ConsoleLogger
class NullLogger
class Service
  - log: Logger
ConsoleLogger ..|> Logger
NullLogger ..|> Logger
Service --> Logger
```

The calling code has **no branching**. Polymorphism handles the "absent" case.

## More examples

### A null discount

```cpp run title="No discount is still a discount"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Discount { virtual ~Discount() = default; virtual double apply(double total) const = 0; };
struct TenPercent : Discount { double apply(double t) const override { return t * 0.9; } };
struct NoDiscount : Discount { double apply(double t) const override { return t; } };          // null object

unique_ptr<Discount> discountFor(const string& code) {
    if (code == "SAVE10") return make_unique<TenPercent>();
    return make_unique<NoDiscount>();                       // never return nullptr
}

int main() {
    for (const char* code : {"SAVE10", "BOGUS", ""})
        cout << "code '" << code << "': " << discountFor(code)->apply(1000) << "\n";
}
```

### A null customer (a "guest")

```cpp run title="Guest customer instead of nullptr"
#include <iostream>
#include <memory>
#include <string>
#include <map>
using namespace std;

struct Customer {
    virtual ~Customer() = default;
    virtual string name() const = 0;
    virtual double loyaltyDiscount() const = 0;
    virtual bool isReal() const = 0;
};
struct RealCustomer : Customer {
    string n; double d;
    RealCustomer(string n, double d) : n(move(n)), d(d) {}
    string name() const override { return n; }
    double loyaltyDiscount() const override { return d; }
    bool isReal() const override { return true; }
};
struct GuestCustomer : Customer {                           // the null object
    string name() const override { return "guest"; }
    double loyaltyDiscount() const override { return 0; }
    bool isReal() const override { return false; }
};

class Directory {
    map<int, shared_ptr<Customer>> byId_{{1, make_shared<RealCustomer>("Asha", 0.10)}};
public:
    shared_ptr<Customer> find(int id) const {
        auto it = byId_.find(id);
        return it == byId_.end() ? make_shared<GuestCustomer>() : it->second;
    }
};

int main() {
    Directory d;
    for (int id : {1, 99}) {
        auto c = d.find(id);                                // no null check anywhere below
        cout << "customer " << id << ": " << c->name() << ", discount " << c->loyaltyDiscount() << "\n";
    }
}
```

## Null Object vs std::optional vs nullptr

| | `nullptr` | `std::optional<T>` | Null Object |
|---|---|---|---|
| Caller must check | yes | yes | **no** |
| Forgetting to check | crash (UB) | exception or UB | n/a |
| Works with polymorphic types | yes (pointer) | awkward (`optional<unique_ptr<T>>`) | **yes** |
| Expresses "absent" | explicitly | explicitly | **hides** it behind a harmless default |
| Best for | non-owning optional link | "maybe a value" of a value type | **a collaborator with a sensible do-nothing behaviour** |

## When NOT to use it

A null object makes absence **invisible**. That is wonderful for a logger or a discount, and **dangerous** when absence is an error that must be noticed.

- A `NullPaymentMethod` that "succeeds" without charging would quietly lose money.
- `GuestCustomer` is fine for pricing but wrong for "send the order confirmation to the customer's email".
- If the caller **needs to know** whether it got a real object, prefer `optional`, an error result, or an explicit `isReal()` query (as above).

**Rule:** use a Null Object where "do nothing" is a correct, expected behaviour, not where it would hide a bug.

## Design tips

- Make the null object **stateless**, share one instance (it can be a `static` or singleton).
- Give it a clear name: `NullLogger`, `NoDiscount`, `GuestUser`, `NoOpCommand`.
- Return it from factories and finders instead of `nullptr` so callers never see null.
- The Standard Library has them too: `std::ostream` with a null `streambuf` discards output; an empty `std::function` throws on call (the opposite!), so check or wrap it.

:::interview What is the Null Object pattern, and when is it a bad idea?
"A null object implements the interface with do-nothing or neutral behaviour, so clients can call it without null checks. Examples: a null logger, a no-discount strategy, a guest user. It removes branching, but it hides absence, so I would not use it where a missing object is an error that must be reported, such as a payment method. There I use `optional`, an error result or an exception."
:::

```quiz
? What does Null Object let callers avoid?
- Using interfaces
+ Checking for null before every call
- Constructors
> Polymorphism handles the absent case with harmless behaviour.
? When is Null Object a poor choice?
- For logging
+ When absence is an error that must not be hidden (for example a missing payment method)
- For discounts
> A silent default can mask real bugs.
```

:::keypoints
- Null Object: a harmless, do-nothing implementation of the interface, used instead of `nullptr`. Removes `if (x)` checks.
- Good for logger, discount, command, guest user. Bad where silence would hide an error: use `optional` or a result type.
- Make it stateless and shareable; return it from finders/factories.
:::
