---
title: Null Object
level: easy
time: 25
summary: Use a do-nothing object instead of null, so you do not need null checks everywhere. See a null logger, a no-discount and a guest customer, how it differs from optional, and when it can hide a real problem.
---

## What is the Null Object pattern?

Don't memorise the definition yet. Think of it like this:

> "Instead of giving the user **nothing** (null) and forcing them to check, I give them a **do-nothing object** that is always safe to use."

:::analogy Think of a silent phone
You do not need to ask "do I have a ringtone or not?" before every call. If there is no ringtone, you set it to silent. The phone still works the same way, it just makes no sound.
:::

:::def Null Object
An object that **follows the same interface** as the real one but **does nothing** (or gives a neutral answer). The user can call it **without checking for null**.
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

Every place that uses the logger needs `if (log_)`. If you forget even one, the program crashes. The real logic of the service is buried under these safety checks.

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

Now the calling code has **no `if`**. The "no logger" case is handled by the object itself.

## More examples

### A "no discount"

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

### A guest customer

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

A guest is a real object with neutral behaviour. The code does not need `nullptr` for "not logged in".

## Null Object vs `std::optional` vs `nullptr`

| | `nullptr` | `std::optional<T>` | Null Object |
|---|---|---|---|
| User must check | yes | yes | **no** |
| What if they forget? | crash | error or undefined behaviour | not applicable |
| Works with polymorphic types | yes (pointer) | awkward | **yes** |
| Shows "absent" clearly | yes | yes | **hides it** behind a harmless default |
| Best for | an optional link that you don't own | "maybe a value" for simple types | **a helper that can safely do nothing** |

## When NOT to use it

A null object makes "missing" **invisible**. That is great for a logger or a discount. But it is **dangerous** when "missing" is an error you must notice.

- A `NullPaymentMethod` that says "success" without charging would quietly lose money.
- A `GuestCustomer` is fine for prices, but wrong for "send the order confirmation to the customer's email".
- If the user **needs to know** whether the object is real, use `optional`, an error result, or an explicit check like `isReal()`.

**Simple rule:** use a Null Object when "do nothing" is a **correct and expected** behaviour. Do not use it where it would hide a bug.

## Tips

- Make the null object **stateless**, and share one copy.
- Give it a clear name: `NullLogger`, `NoDiscount`, `GuestUser`, `NoOpCommand`.
- Return it from factories and finders instead of `nullptr`, so callers never see null.
- Careful: an empty `std::function` **throws** when called. That is the opposite of a null object, so check it or wrap it.

## Short answer to say in an interview

:::interview What is the Null Object pattern, and when is it a bad idea?
"A null object follows the same interface but does nothing, so the user can call it without checking for null. Examples are a null logger, a no-discount rule and a guest user. It removes extra if statements. But it hides that something is missing, so I would not use it where a missing object is an error, like a payment method. There I use optional, an error result or an exception."
:::

```quiz
? What does Null Object help callers avoid?
- Using interfaces
+ Checking for null before every call
- Constructors
> The object itself handles the "nothing here" case safely.
? When is Null Object a poor choice?
- For logging
+ When a missing object is an error that must not be hidden, like a missing payment method
- For discounts
> A silent default can hide real bugs.
```

:::keypoints
- Null Object = a safe, do-nothing object that follows the interface, used instead of `nullptr`. It removes `if (x)` checks.
- Good for a logger, a discount, a command, a guest user. Bad where silence would hide an error. Use `optional` or a result type there.
- Keep it stateless and shared. Return it from finders and factories.
:::
