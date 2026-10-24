---
title: Singleton
level: intermediate
time: 35
summary: A class that has only one object and can be used from anywhere. See how to write it safely in modern C++, how to prove it works, why many people dislike it, and what to do instead.
---

## What is a Singleton?

Don't memorise the definition yet. Think of it like this:

> "Some things in a program should exist **only once**. For example, one logger, one settings object. Everyone should use the **same one**."

:::def Singleton
A class that has **exactly one object**, and gives **one place** from where everyone can get it.
:::

Real examples: a logger, a configuration (settings) object, a connection pool, an id generator. The need is real: some things should not be created twice.

:::analogy Think of the principal of a school
A school has only one principal. Anyone who needs the principal goes to the same person. You cannot create a second principal.
:::

## The modern C++ way (Meyers Singleton)

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

Let's understand it step by step:

1. The constructor is **private**. So nobody outside can write `Config c;`.
2. Copying is **deleted**. So nobody can make a second copy.
3. `instance()` returns a **function-local `static`** object. C++ guarantees that this object is created **exactly once**, even if many threads call `instance()` at the same time. So you do not need a lock.
4. It is created **only when first used** (lazy), and destroyed automatically when the program ends.

That is the whole pattern. Six lines.

## Proof that there is only one

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

Eight threads all called `instance()` at the same time. The constructor still ran **only once**. All 8000 ids are different, because `next()` is safe to call from many threads.

## Other ways (but not recommended)

| Version | Problem |
|---|---|
| `if (!instance_) instance_ = new T;` | **not thread-safe**. Two threads can both create one. Also leaks memory. |
| Double-checked locking with a raw pointer | very hard to get right |
| `std::call_once` | works, but longer than the Meyers way |
| A global `static Config instance_;` | created before `main`, and can cause start-up order bugs |

So: **use the Meyers Singleton.** It is the simplest correct version.

## Why many developers dislike Singleton

Singleton is the most **overused** pattern. It is basically a global variable with a nice name.

| Problem | In simple words |
|---|---|
| **Hidden dependency** | `Order::pay()` quietly uses `Config::instance()`. Nobody can see that from the outside. |
| **Hard to test** | you cannot replace it with a fake, and its state leaks from one test to the next |
| **Tight coupling** | every user depends on this exact class |
| **Threads** | if it holds changing data, you must lock it yourself |
| **Order of destruction** | at program exit, one singleton may be destroyed before another that still needs it |
| **Does two jobs** | it does its own work and also controls its own count |

## A better way: one object, but passed in

Most of the time you do not need "the language forces one object". You only need "my program uses one object". So **create it once in `main` and pass it to whoever needs it.**

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

## If you must have a global: hide it behind an interface

Then a test can replace the real thing with a fake.

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

## When is Singleton okay?

- The thing is **truly** one per process (the logger, a hardware device).
- It is mostly **read-only**, or it protects itself with a lock.
- It is hidden behind an **interface**, or passed explicitly in most places.

## Short answer to say in an interview

:::interview How do you write a thread-safe Singleton in C++? What are its drawbacks?
"I make the constructor private, delete copying, and return a reference to a function-local static from instance(). Since C++11 that static is created exactly once, safely, so I do not need a mutex. The drawbacks are that it is global state with hidden dependencies, it is hard to test, and every user depends on the concrete class. So I prefer creating one object in main and passing it in. I use a Singleton only for real process-wide things, behind an interface."
:::

```quiz
? Why is the Meyers Singleton thread-safe?
- It has a mutex inside instance()
+ C++ guarantees a function-local static is created exactly once, even with many threads
- It is not thread-safe
> Since C++11 the compiler adds the needed safety.
? What is the main testing problem with Singletons?
- They are slow
+ You cannot easily replace them with a fake, and their state stays between tests
- They cannot be copied
> Hidden global state makes tests depend on each other.
? What is a good alternative when you only need one object in your program?
- A static array
+ Create it in main and pass it where needed
- A macro
> You get one object without global access or hidden dependencies.
```

:::keypoints
- Singleton = one object + one place to get it. In C++: private constructor, deleted copy, function-local static.
- Creation is thread-safe since C++11. If it holds changing data, you still need your own lock.
- Problems: hidden dependencies, hard to test, tight coupling. Prefer creating one object in `main` and passing it in.
- If you need a global, put it behind an interface so tests can replace it.
:::
