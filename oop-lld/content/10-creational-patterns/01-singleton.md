---
title: Singleton
level: intermediate
time: 35
summary: Exactly one instance with global access. The modern thread-safe C++ implementation, how to prove there is one, the serious criticisms (hidden dependencies, testing, lifetime), and the alternatives that usually serve better.
---

:::def Singleton
Ensure a class has **exactly one instance** and provide a **global point of access** to it.
:::

Typical uses: a logger, a configuration object, a connection pool, a hardware device manager, an ID generator. The need is real: some things should exist once.

## The modern C++ implementation (Meyers Singleton)

```cpp run title="A thread-safe Singleton in six lines"
#include <iostream>
#include <string>
using namespace std;

class Config {
    string appName_ = "OOPLab";
    int maxUsers_ = 100;

    Config() { cout << "  Config constructed (once)\n"; }          // private: nobody else can create one
public:
    Config(const Config&) = delete;                                  // no copies
    Config& operator=(const Config&) = delete;

    static Config& instance() {
        static Config theOne;                                        // created on first use; thread-safe since C++11
        return theOne;
    }
    const string& appName() const { return appName_; }
    int maxUsers() const { return maxUsers_; }
    void setMaxUsers(int n) { maxUsers_ = n; }
};

int main() {
    cout << "start of main\n";
    cout << Config::instance().appName() << " " << Config::instance().maxUsers() << "\n";
    Config::instance().setMaxUsers(500);
    cout << Config::instance().maxUsers() << "\n";
    cout << boolalpha << (&Config::instance() == &Config::instance()) << " (same address: one object)\n";
}
```

How it works:

1. The constructor is **private**, so no one can write `Config c;`.
2. Copy and assignment are **deleted**, so no one can copy it.
3. `instance()` returns a reference to a **function-local `static`**. The C++ standard guarantees that it is initialised **exactly once**, even if many threads call `instance()` at the same time ("magic statics"). No manual locking is needed.
4. It is created **lazily** on the first call, and destroyed automatically at program exit, in reverse order of creation.

## Proving it is one object

```cpp run title="Counting constructions across many callers"
#include <iostream>
#include <thread>
#include <vector>
#include <atomic>
using namespace std;

atomic<int> constructions{0};

class IdGenerator {
    atomic<int> next_{1};
    IdGenerator() { ++constructions; }
public:
    IdGenerator(const IdGenerator&) = delete;
    IdGenerator& operator=(const IdGenerator&) = delete;
    static IdGenerator& instance() { static IdGenerator g; return g; }
    int next() { return next_++; }                                   // atomic: safe from many threads
};

int main() {
    vector<thread> workers;
    atomic<long> sum{0};
    for (int t = 0; t < 8; ++t)
        workers.emplace_back([&] { for (int i = 0; i < 1000; ++i) sum += IdGenerator::instance().next() > 0; });
    for (auto& w : workers) w.join();
    cout << "constructions: " << constructions << ", ids handed out: " << IdGenerator::instance().next() - 1 << "\n";
}
```

Eight threads raced to call `instance()`, and the constructor ran exactly once. All 8000 ids are unique because `next()` is atomic.

## Older and alternative implementations

| Version | Problem |
|---|---|
| `static T* instance_ = nullptr; if (!instance_) instance_ = new T;` | **not thread-safe** (two threads can both create); leaks the object |
| Double-checked locking with a raw pointer | notoriously hard to get right before C++11 memory model |
| `std::call_once(flag, [] { instance_ = ... });` | correct, but more code than the Meyers form |
| Eager: `static Config instance_;` at namespace scope | created before `main`; suffers the static initialisation order problem |

Use the **Meyers Singleton**. It is the simplest correct form.

## Why many designers dislike Singleton

Singleton is called the most **overused** pattern. It is a global variable with a nicer name.

| Problem | Why it hurts |
|---|---|
| **Hidden dependency** | `Order::pay()` secretly uses `Config::instance()`. The constructor does not say so, so readers cannot see what `Order` needs. |
| **Hard to test** | tests cannot replace the singleton with a fake, and state **leaks between tests**. |
| **Tight coupling** | every user depends on the concrete class. |
| **Concurrency** | shared mutable state needs its own locking. |
| **Lifetime** | destruction order at exit can bite: a singleton used by another's destructor may already be gone. |
| **Violates SRP** | the class manages both its job *and* its own uniqueness. |

## The better way: one instance, but injected

Often what you need is "one instance **in this program**", not "one instance **enforced by the language**". Create it once in `main` and pass it in.

```cpp run title="Same single instance, no global access"
#include <iostream>
#include <string>
using namespace std;

struct Logger {
    virtual ~Logger() = default;
    virtual void log(const string& s) = 0;
};
struct ConsoleLogger : Logger { void log(const string& s) override { cout << "  [log] " << s << "\n"; } };
struct NullLogger : Logger { void log(const string&) override {} };                    // for tests

class PaymentService {
    Logger& log_;                                                      // the dependency is explicit
public:
    explicit PaymentService(Logger& l) : log_(l) {}
    void pay(int amount) { log_.log("paid " + to_string(amount)); }
};
class RefundService {
    Logger& log_;
public:
    explicit RefundService(Logger& l) : log_(l) {}
    void refund(int amount) { log_.log("refunded " + to_string(amount)); }
};

int main() {
    ConsoleLogger logger;                                              // created ONCE, here
    PaymentService pay(logger);
    RefundService refund(logger);                                      // both share it
    pay.pay(500);
    refund.refund(100);

    NullLogger quiet;
    PaymentService silent(quiet);                                      // a test can pass a different one
    silent.pay(1);
    cout << "done\n";
}
```

## Testable Singleton: hide it behind an interface

If you must keep a global accessor, give it an interface so tests can swap the implementation.

```cpp run title="Singleton access, replaceable for tests"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Clock {
    virtual ~Clock() = default;
    virtual long now() const = 0;
};
struct SystemClock : Clock { long now() const override { return 1700000000; } };
struct FakeClock : Clock {
    long t; explicit FakeClock(long t) : t(t) {}
    long now() const override { return t; }
};

class Services {                                                      // a tiny "service holder"
    unique_ptr<Clock> clock_ = make_unique<SystemClock>();
    Services() = default;
public:
    static Services& instance() { static Services s; return s; }
    Clock& clock() { return *clock_; }
    void setClock(unique_ptr<Clock> c) { clock_ = move(c); }          // test hook
};

long secondsUntil(long deadline) { return deadline - Services::instance().clock().now(); }

int main() {
    cout << secondsUntil(1700000100) << "\n";                          // production clock
    Services::instance().setClock(make_unique<FakeClock>(1700000090)); // a test freezes time
    cout << secondsUntil(1700000100) << "\n";
}
```

## When is Singleton acceptable?

- The thing is **truly** unique and global by nature (the process's logger, a hardware device handle).
- Its use is **read-mostly** or internally synchronised.
- Access is hidden behind an **interface**, or it is passed explicitly in most code.

:::interview Implement a thread-safe Singleton in C++. What are the drawbacks?
"I write a private constructor, delete copy and move, and return a reference to a function-local static from `instance()`. Since C++11 the static is initialised exactly once, thread-safely, so no mutex is needed. Drawbacks: it is global state with hidden dependencies, hard to test and to substitute, couples every user to the concrete class, and has destruction-order risks. I prefer creating one instance in `main` and injecting it, and I use a Singleton only for genuinely process-wide resources, behind an interface."
:::

```quiz
? Why is the Meyers Singleton thread-safe?
- It uses a mutex inside instance()
+ The C++ standard guarantees function-local statics are initialised exactly once, even with concurrent callers
- It is not thread-safe
> Since C++11 the compiler generates the needed synchronisation.
? What is the main testing problem with Singletons?
- They are slow
+ Tests cannot easily substitute a fake, and state persists between tests
- They cannot be copied
> Hidden global state makes tests order-dependent and difficult to isolate.
? What is a good alternative when you only need one instance in your program?
- A static array
+ Create it in main and inject it via constructors
- A macro
> You get one instance without global access or hidden dependencies.
```

:::keypoints
- Singleton = one instance + global access. In C++: private constructor, deleted copy, function-local static (Meyers).
- It is thread-safe on creation since C++11; mutable state still needs its own locking.
- Criticisms: hidden dependencies, poor testability, coupling, lifetime. Prefer injecting a single instance created in `main`.
- If you need a global accessor, put it behind an interface so tests can substitute it.
:::
