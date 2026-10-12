---
title: Design Patterns and the Singleton
level: intermediate
time: 40
summary: What design patterns are and how to use them in interviews (the GoF catalogue at a glance), then the Singleton — intent, thread-safe implementations in C++ (Meyers singleton, call_once) and JavaScript (module instances), why it's often an anti-pattern, and the dependency-injection alternative.
---

## What a design pattern is

:::def Design pattern
A named, reusable solution to a problem that keeps recurring in software design, described as a structure of classes and their collaboration. Not code to copy, but a **template** you adapt. The classic catalogue is *Design Patterns* (1994) by the "Gang of Four" (GoF): Gamma, Helm, Johnson and Vlissides.
:::

Patterns give designers a **shared vocabulary**: "pricing is a Strategy", "notifications use Observer", "the vending machine is a State machine" each convey a whole design in a few words. The 22 classic patterns in this course fall into three groups:

| Group | Concern | Patterns |
|---|---|---|
| **Creational** | how objects are created | Singleton, Factory Method, Abstract Factory, Builder, Prototype |
| **Structural** | how objects are composed into larger structures | Adapter, Facade, Decorator, Proxy, Composite, Bridge, Flyweight |
| **Behavioral** | how objects communicate and share responsibilities | Strategy, Observer, Command, Memento, State, Template Method, Chain of Responsibility, Iterator, Mediator, Visitor |

:::tip Patterns in LLD interviews
Don't start from patterns ("let me use Abstract Factory here"). Start from the **problem** (requirements, variation points), and name a pattern when it naturally fits. The most frequently useful in LLD rounds: **Strategy, State, Observer, Factory, Singleton, Decorator, Builder, Command, Chain of Responsibility, Composite**. Forcing a pattern where it doesn't belong is a common red flag.
:::

## The Singleton

:::def Singleton
Ensures a class has **only one instance** and provides a **global point of access** to it.
:::

**Typical motivations:** one configuration object, one connection pool, one logger, one ID generator per process, one hardware device handle, a cache shared by the whole process.

```viz algo=uml title="Singleton structure"
class ConfigRegistry
  - instance: ConfigRegistry  «static»
  - values: map<string, string>
  - ConfigRegistry()  «private constructor»
  + getInstance(): ConfigRegistry  «static»
  + get(key: string): string
```

The ingredients: a **private constructor** (nobody else can create one), a **static** accessor that creates the instance on first use (lazy) and returns the same one afterwards, and (in C++) deleted copy operations.

### Thread safety

The naive lazy version (`if (!instance) instance = new X();`) has a **race**: two threads can both see `nullptr` and create two instances. Fixes:

- **C++11 and later: the Meyers singleton.** A function-local `static` is initialised exactly once, and the language guarantees that initialisation is thread-safe ("magic statics"). This is the idiomatic answer.
- `std::call_once` with a `std::once_flag`, when you need explicit control.
- **Double-checked locking** (check, lock, check again) is a classic interview topic. It's correct in C++ only with atomics (`std::atomic` with acquire/release), so prefer the two above.
- **JavaScript** runs your code on one thread (per worker), so there's no race. Moreover, an **ES module is evaluated once** and cached: exporting one instance from a module already gives you a singleton.

:::tabs Singleton implementations
```cpp run
#include <bits/stdc++.h>
using namespace std;

class IdGenerator {
public:
    static IdGenerator& instance() {
        static IdGenerator inst;              // Meyers singleton: created once, thread-safe since C++11
        return inst;
    }
    IdGenerator(const IdGenerator&) = delete;             // no copies
    IdGenerator& operator=(const IdGenerator&) = delete;

    long next() { return ++counter_; }       // atomic, so many threads can call it
private:
    IdGenerator() { cout << "IdGenerator constructed (once)\n"; }
    atomic<long> counter_{0};
};

int main() {
    vector<thread> workers;
    vector<long> ids(8);
    for (int i = 0; i < 8; i++)                               // 8 threads race to use it first
        workers.emplace_back([i, &ids] { ids[i] = IdGenerator::instance().next(); });
    for (auto& t : workers) t.join();

    sort(ids.begin(), ids.end());
    cout << "ids:";
    for (long id : ids) cout << " " << id;                   // 1..8, all distinct: one shared instance
    cout << "\n";
    cout << boolalpha << "same object: " << (&IdGenerator::instance() == &IdGenerator::instance()) << "\n";
    // IdGenerator copy = IdGenerator::instance();            // compile error: copy constructor deleted
}
```
```js run
// 1) Class-based singleton (useful when you need lazy creation or a reset for tests)
class Config {
  static #instance = null;
  #values = new Map();
  constructor(token) {
    if (token !== Config.#token) throw new Error("use Config.getInstance()");
    console.log("Config constructed (once)");
  }
  static #token = Symbol("private");
  static getInstance() {
    return (Config.#instance ??= new Config(Config.#token));
  }
  get(key) { return this.#values.get(key); }
  set(key, value) { this.#values.set(key, value); return this; }
}

Config.getInstance().set("region", "ap-south-1");
console.log("region:", Config.getInstance().get("region"));
console.log("same object:", Config.getInstance() === Config.getInstance());
try { new Config(); } catch (e) { console.log("error:", e.message); }

// 2) The idiomatic JS singleton: a module exports ONE instance.
//    // logger.js
//    class Logger { log(msg) { … } }
//    export const logger = new Logger();     // modules are evaluated once and cached
//    // anywhere else:  import { logger } from "./logger.js";
```
:::

## Why Singleton is controversial

It's the most widely known pattern and the most often criticised:

- It's **global state** in disguise: any code can reach it and change it, creating hidden coupling.
- **Hidden dependencies**: a class that calls `Database::instance()` inside a method doesn't declare that it needs a database. You can't tell from its constructor.
- **Hard to test**: tests share the one instance, so state leaks between tests, and you can't substitute a fake.
- It violates **SRP**: the class manages both its job and its own lifecycle.
- "One per process" stops being true: you later need two connection pools (two databases), or one per tenant.

:::warn Prefer "one instance" over "Singleton pattern"
It's fine (and common) for an application to have **one** instance of something. Create it once in the **composition root** and **inject** it into the classes that need it (previous lesson). You get the single instance without the global access, and tests can pass a fake. Reserve the Singleton pattern for genuinely process-wide, stateless or infrastructure concerns (a logger, a metrics registry), and still consider injecting them.
:::

### In LLD interviews

Common places where interviewers expect or accept a singleton: the `ParkingLot` in a single-lot parking system, a `Logger`, an `IdGenerator`, a `ConfigManager`, the `ElevatorController`. Mention **thread safety** (Meyers singleton) and, if there's time, that you'd inject it rather than call `getInstance()` deep inside methods. That nuance is what earns the credit.

```quiz
? Why is the naive lazy singleton `if (!instance) instance = new Logger();` unsafe in multithreaded C++?
+ Two threads can both see a null instance and each create one
- `new` is not allowed in static methods
- It leaks memory on every call
> It's a check-then-act race. A function-local static (Meyers singleton) is initialised exactly once, thread-safely.

? What's the simplest way to get a single shared instance in JavaScript?
- A class with a private constructor and a mutex
+ Export one instance from an ES module, which is evaluated once and cached
- Store it on a global variable named `instance`
> Module evaluation happens once per program, so every importer gets the same object.

? Which is the strongest criticism of the Singleton pattern?
+ It hides dependencies behind global access and makes classes hard to test with fakes
- It uses too much memory
- It can't be implemented in C++
> Classes that call getInstance() don't declare their dependencies, and tests can't substitute them.

? A design needs exactly one `PaymentGatewayClient` per process. What's the more testable approach?
+ Create it once at startup and inject it into the classes that use it
- Make it a Singleton and call getInstance() wherever needed
- Create a new one in every method call
> "One instance" doesn't require global access; injection keeps the dependency explicit and replaceable.
```

:::keypoints
- Design patterns are named solutions to recurring problems: **creational**, **structural**, **behavioral**. Use them when the problem calls for them, not to show off.
- **Singleton**: one instance + global access; private constructor, static accessor, no copies.
- C++: the **Meyers singleton** (function-local static) is lazy and thread-safe; `call_once` is the explicit alternative; double-checked locking needs atomics.
- JavaScript: an **exported module instance** is a singleton.
- Singletons hide dependencies and hurt testing; prefer **one instance created at the composition root and injected**.
:::
