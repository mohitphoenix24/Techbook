---
title: Decorator
level: intermediate
time: 40
summary: Adding responsibilities to an object dynamically by wrapping it in objects with the same interface: coffee with add-ons, layered data streams (compress, encrypt), logging and retry decorators, why order matters, and the contrast with inheritance and Proxy.
---

:::def Decorator
Attach **additional responsibilities to an object dynamically**. Decorators provide a flexible alternative to subclassing for extending functionality.
:::

A decorator **wraps** an object, **implements the same interface**, forwards calls to the wrapped object, and adds behaviour before or after. Because it has the same interface, decorators can be **stacked** like layers of an onion.

:::analogy Think of it like this
Ordering coffee. You start with a plain coffee. Add milk, add sugar, add whipped cream. Each addition wraps the previous drink, changes the price and the description, and is still "a coffee". You do not need a class `CoffeeWithMilkAndSugarAndCream` for each combination.
:::

## The problem: subclass explosion

For a coffee with optional milk, sugar, whip, you would need `Coffee`, `CoffeeWithMilk`, `CoffeeWithSugar`, `CoffeeWithMilkAndSugar`, ... (2³ = 8 classes for 3 add-ons, and doubling for each new one). Decorator solves this with **n** small classes that combine freely.

```viz algo=uml title="Decorator"
interface Beverage
  + cost(): double
  + description(): string
class Espresso
class Tea
abstract class AddOn
  # inner: Beverage
class Milk
class Sugar
class WhippedCream
Espresso ..|> Beverage
Tea ..|> Beverage
AddOn ..|> Beverage
AddOn o-- Beverage : wraps
Milk --|> AddOn
Sugar --|> AddOn
WhippedCream --|> AddOn
```

## Coffee with add-ons

```cpp run title="Stacking decorators"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Beverage {
public:
    virtual ~Beverage() = default;
    virtual double cost() const = 0;
    virtual string description() const = 0;
};

class Espresso : public Beverage {
public:
    double cost() const override { return 100; }
    string description() const override { return "Espresso"; }
};
class Tea : public Beverage {
public:
    double cost() const override { return 60; }
    string description() const override { return "Tea"; }
};

class AddOn : public Beverage {                          // base decorator: holds and forwards to the wrapped beverage
protected:
    unique_ptr<Beverage> inner_;
public:
    explicit AddOn(unique_ptr<Beverage> b) : inner_(move(b)) {}
};
class Milk : public AddOn {
public:
    using AddOn::AddOn;
    double cost() const override { return inner_->cost() + 20; }
    string description() const override { return inner_->description() + " + milk"; }
};
class Sugar : public AddOn {
public:
    using AddOn::AddOn;
    double cost() const override { return inner_->cost() + 5; }
    string description() const override { return inner_->description() + " + sugar"; }
};
class WhippedCream : public AddOn {
public:
    using AddOn::AddOn;
    double cost() const override { return inner_->cost() + 30; }
    string description() const override { return inner_->description() + " + whipped cream"; }
};

int main() {
    unique_ptr<Beverage> order = make_unique<Espresso>();
    order = make_unique<Milk>(move(order));              // wrap...
    order = make_unique<Sugar>(move(order));             // ...and wrap again
    order = make_unique<WhippedCream>(move(order));
    cout << order->description() << " = Rs" << order->cost() << "\n";

    unique_ptr<Beverage> simple = make_unique<Sugar>(make_unique<Tea>());
    cout << simple->description() << " = Rs" << simple->cost() << "\n";
}
```

The client code holds a plain `unique_ptr<Beverage>` and never knows how many wrappers are inside. Adding a `Caramel` add-on is one class and does not touch the others.

## A realistic example: data streams

Real systems stack decorators on I/O: compress, then encrypt, then log. Each layer transforms data and passes it on.

```cpp run title="Compress, encrypt and log, in any order"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class DataSink {
public:
    virtual ~DataSink() = default;
    virtual void write(const string& data) = 0;
};

class FileSink : public DataSink {                        // the real destination
public:
    void write(const string& data) override { cout << "  FILE <- \"" << data << "\"\n"; }
};

class SinkDecorator : public DataSink {
protected:
    unique_ptr<DataSink> next_;
public:
    explicit SinkDecorator(unique_ptr<DataSink> n) : next_(move(n)) {}
};

class Compressing : public SinkDecorator {                // (toy compression: run-length for repeated chars)
public:
    using SinkDecorator::SinkDecorator;
    void write(const string& d) override {
        string out;
        for (size_t i = 0; i < d.size();) {
            size_t j = i;
            while (j < d.size() && d[j] == d[i]) ++j;
            out += (j - i > 2) ? string(1, d[i]) + to_string(j - i) : d.substr(i, j - i);
            i = j;
        }
        next_->write(out);
    }
};
class Encrypting : public SinkDecorator {                 // (toy "cipher": every character becomes two hex digits)
public:
    using SinkDecorator::SinkDecorator;
    void write(const string& d) override {
        static const char* hex = "0123456789abcdef";
        string out;
        for (unsigned char c : d) { out += hex[c >> 4]; out += hex[c & 15]; }
        next_->write(out);
    }
};
class Logging : public SinkDecorator {
public:
    using SinkDecorator::SinkDecorator;
    void write(const string& d) override {
        cout << "  [log] writing " << d.size() << " chars\n";
        next_->write(d);
    }
};

int main() {
    cout << "log -> compress -> encrypt -> file:\n";
    unique_ptr<DataSink> a = make_unique<Logging>(make_unique<Compressing>(make_unique<Encrypting>(make_unique<FileSink>())));
    a->write("aaaaabbbbbc");

    cout << "encrypt -> compress -> file (the order changes the result):\n";
    unique_ptr<DataSink> b = make_unique<Encrypting>(make_unique<Compressing>(make_unique<FileSink>()));
    b->write("aaaaabbbbbc");
}
```

**Order matters.** Compressing then encrypting differs from encrypting then compressing: compression works well on plain data, but encrypted data looks random, so there is nothing left to compress. (Run it: compress-first turns the 11 characters into 10 hex digits; encrypt-first gives 22, with no saving at all.) When you design decorators, document which orders are valid.

## Behaviour decorators: logging, caching, retry

Decorators are excellent for **cross-cutting concerns** that you do not want inside business logic.

```cpp run title="Retry and timing decorators around a service"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

class PaymentService {
public:
    virtual ~PaymentService() = default;
    virtual bool charge(int amount) = 0;
};

class FlakyService : public PaymentService {              // fails the first two times
    int calls_ = 0;
public:
    bool charge(int amount) override {
        ++calls_;
        cout << "  attempt " << calls_ << ": charging " << amount << "\n";
        if (calls_ < 3) throw runtime_error("network error");
        return true;
    }
};

class RetryingService : public PaymentService {           // adds retry, without touching FlakyService
    unique_ptr<PaymentService> inner_;
    int maxAttempts_;
public:
    RetryingService(unique_ptr<PaymentService> s, int n) : inner_(move(s)), maxAttempts_(n) {}
    bool charge(int amount) override {
        for (int attempt = 1; attempt <= maxAttempts_; ++attempt) {
            try { return inner_->charge(amount); }
            catch (const exception& e) { cout << "  retrying after: " << e.what() << "\n"; }
        }
        return false;
    }
};

class AuditingService : public PaymentService {           // adds auditing
    unique_ptr<PaymentService> inner_;
public:
    explicit AuditingService(unique_ptr<PaymentService> s) : inner_(move(s)) {}
    bool charge(int amount) override {
        bool ok = inner_->charge(amount);
        cout << "  [audit] charge of " << amount << (ok ? " succeeded" : " failed") << "\n";
        return ok;
    }
};

int main() {
    unique_ptr<PaymentService> svc =
        make_unique<AuditingService>(make_unique<RetryingService>(make_unique<FlakyService>(), 3));
    svc->charge(250);
}
```

Callers use a `PaymentService` and have no idea about retry or auditing. Each concern is separately testable and reusable.

## Decorator with lambdas (functional style)

When the interface is a single function, decorators are just functions that take and return `std::function`.

```cpp run title="Decorating a function"
#include <functional>
#include <iostream>
#include <string>
using namespace std;

using Handler = function<string(const string&)>;

Handler withLogging(Handler h) {
    return [h](const string& in) { cout << "  -> request: " << in << "\n"; string out = h(in); cout << "  <- response: " << out << "\n"; return out; };
}
Handler withUppercase(Handler h) {
    return [h](const string& in) { string out = h(in); for (char& c : out) c = toupper(c); return out; };
}

int main() {
    Handler base = [](const string& in) { return "hello " + in; };
    Handler decorated = withLogging(withUppercase(base));
    decorated("asha");
}
```

## Decorator vs inheritance vs Proxy

| | Inheritance | Decorator | Proxy |
|---|---|---|---|
| Extends behaviour | at compile time, fixed | at **run time**, combinable | no, controls **access** |
| Number of classes for n features | up to 2ⁿ | n | 1 per kind |
| Interface | inherited | **same as wrapped** | **same as wrapped** |
| Intent | specialise | **add responsibility** | **control access** (lazy, auth, remote, cache) |

Decorator and Proxy look similar (both wrap and implement the same interface). The difference is intent: a decorator *adds* behaviour the client wants (and the client usually builds the stack); a proxy *controls* access to the subject and usually manages its lifecycle itself.

## Pitfalls

- **Many small objects** and long chains are hard to debug (use clear names, log the chain).
- Identity: a decorated object is **not the same object**; `==` and `dynamic_cast` on the wrapper do not reach the inner type.
- Order dependence: document it.
- Wide interfaces make decorators tedious (you must forward every method). Keep the component interface **small**.

:::interview Decorator vs inheritance, and Decorator vs Proxy?
"Inheritance fixes extensions at compile time and creates a class per combination. A decorator wraps an object that has the same interface and adds behaviour at run time; decorators can be stacked in any order, so n features need n classes, not 2 to the n. Both Decorator and Proxy wrap and share the interface, but a decorator adds responsibilities the client chooses, whereas a proxy controls access to the real subject: lazy creation, security checks, caching, remote calls."
:::

```quiz
? What does a decorator share with the object it wraps?
- Its data members
+ The same interface
- Its constructor
> That is what allows decorators to be stacked and used wherever the component is expected.
? Why is Decorator better than subclassing for optional add-ons?
- It is faster
+ It avoids a class for every combination and combines behaviour at run time
- It needs fewer includes
> n decorators give 2ⁿ combinations without writing 2ⁿ classes.
? In a stack of decorators, what should you watch for?
- Nothing
+ The order of wrapping can change the behaviour
- That they must all be singletons
> For example, compress-then-encrypt differs from encrypt-then-compress.
```

:::keypoints
- Decorator wraps a component with the same interface, adds behaviour before/after forwarding, and can be stacked.
- n decorators replace 2ⁿ subclasses; behaviour is chosen at run time; order matters.
- Great for cross-cutting concerns (logging, retry, caching, auditing, compression, encryption). Keep the component interface small.
- Distinguish from Proxy (controls access) and Adapter (changes the interface).
:::
