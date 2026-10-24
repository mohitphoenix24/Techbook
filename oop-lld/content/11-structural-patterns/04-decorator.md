---
title: Decorator
level: intermediate
time: 40
summary: Add extra features to an object by wrapping it, like adding milk and sugar to coffee. See the class explosion problem, coffee add-ons, stacking data layers, retry and logging wrappers, and why order matters.
---

## What is the Decorator pattern?

Don't memorise the definition yet. Think of it like this:

> "I have an object. I want to add one more feature to it, without changing its class. So I **wrap** it in another object that looks the same from outside."

:::analogy Think of ordering a coffee
You start with a plain coffee. Add milk. Add sugar. Add whipped cream. Each add-on wraps the previous drink, changes the price and the description, and it is still "a coffee". You do not need a separate class for `CoffeeWithMilkAndSugarAndCream`.
:::

:::def Decorator
A **wrapper** that has the **same interface** as the object inside it. It passes calls to the inner object and adds some behaviour before or after. Because the interface is the same, you can wrap again and again, like layers of an onion.
:::

## The problem: too many subclasses

For a coffee with optional milk, sugar and whip, using inheritance we would need `Coffee`, `CoffeeWithMilk`, `CoffeeWithSugar`, `CoffeeWithMilkAndSugar`... That is **8 classes for 3 add-ons**, and it doubles with every new add-on.

With Decorator, we write only **one small class per add-on**, and combine them freely.

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

The user code holds a plain `unique_ptr<Beverage>`. It does not know how many layers are inside. To add Caramel later, write one class. Nothing else changes.

## A real example: data layers

Real systems often stack layers: compress the data, then encrypt it, then log it. Each layer changes the data and passes it on.

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

**Order matters!** Compress-then-encrypt is not the same as encrypt-then-compress. Compression works well on normal text, but encrypted data looks random, so there is nothing left to shrink. (Run the example: compress-first turns the 11 characters into 10 hex digits. Encrypt-first gives 22, with no saving.) So when you build decorators, write down which orders are valid.

## Wrappers for logging, caching and retry

Decorators are great for things like logging, retrying and timing. These are jobs you do **not** want mixed into your business code.

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

The code that uses `PaymentService` has no idea about retry or audit. Each feature is separate, reusable and easy to test.

## Decorator with functions (lambdas)

If the interface is just one function, a decorator can simply be a function that takes a function and returns a new one.

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
| When the feature is added | while compiling, fixed | **while running**, can combine | not about adding features, it **controls access** |
| Classes for n features | up to 2ⁿ | n | one per kind |
| Interface | inherited | **same as the inner object** | **same as the inner object** |
| Purpose | specialise | **add a feature** | **control access** (lazy, permission, remote) |

Decorator and Proxy look alike, because both wrap an object with the same interface. The difference is the purpose. A decorator **adds** something the user wants (and the user usually builds the stack). A proxy **controls** access to the real object.

## Things to watch out for

- Many small objects and long chains can be hard to debug. Use clear names.
- A wrapped object is **not the same object**. Comparisons and `dynamic_cast` on the wrapper do not reach the inner type.
- The order can change the result, so document it.
- If the interface has many methods, forwarding every one is boring. Keep the interface **small**.

## Short answer to say in an interview

:::interview Decorator vs inheritance, and Decorator vs Proxy?
"With inheritance, features are fixed at compile time and I need a class for every combination. A decorator wraps an object that has the same interface and adds a feature at run time. Decorators can be stacked in any order, so n features need n classes. Decorator and Proxy both wrap with the same interface, but a decorator adds a feature the user chooses, and a proxy controls access to the real object, for example lazy loading, permission checks or caching."
:::

```quiz
? What does a decorator share with the object it wraps?
- Its data
+ The same interface
- Its constructor
> That is why decorators can be stacked and used anywhere the original is used.
? Why is Decorator better than subclassing for optional add-ons?
- It is faster
+ It avoids a class for every combination and lets us combine features at run time
- It needs fewer includes
> n decorators give 2ⁿ combinations without writing 2ⁿ classes.
? What should you watch for in a stack of decorators?
- Nothing
+ The order of wrapping can change the result
- They must all be singletons
> Compress-then-encrypt is different from encrypt-then-compress.
```

:::keypoints
- Decorator wraps an object with the same interface, adds behaviour before or after, and can be stacked.
- n decorators replace 2ⁿ subclasses. Features are chosen at run time. Order matters.
- Good for logging, retry, caching, audit, compression, encryption. Keep the interface small.
- Do not mix it up with Proxy (controls access) or Adapter (changes the interface).
:::
