---
title: "LLD interview: creational patterns"
level: medium
time: 30
summary: Singleton, Factory Method, Abstract Factory, Builder and Prototype (plus Object Pool and Dependency Injection as alternatives): intent, when to use, C++ specifics, thread-safety and typical follow-ups.
---

:::qa What is a design pattern, and why learn them? {level=easy}
A named, reusable solution to a recurring design problem, with known trade-offs. They give a shared vocabulary ("use a Strategy here") and a catalogue of proven structures. They are not code to copy: apply only when the problem exists.
:::

:::qa How are the GoF patterns grouped? {level=easy}
**Creational** (how objects are created): Singleton, Factory Method, Abstract Factory, Builder, Prototype. **Structural** (how objects are composed): Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy. **Behavioural** (how objects interact): Strategy, Observer, Command, State, Template Method, Chain of Responsibility, Iterator, Mediator, Memento, Visitor, Interpreter.
:::

:::qa What is the Singleton pattern? How do you implement it in C++? {level=easy}
It ensures one instance and a global access point. Meyers' singleton:
```cpp
class Logger {
    Logger() = default;
public:
    static Logger& instance() { static Logger l; return l; }     // thread-safe initialisation since C++11
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
};
```
:::

:::qa What are the problems with Singleton? {level=medium}
Hidden global state and hidden dependencies, hard to test (cannot substitute), tight coupling, ordering problems at shutdown, and it mixes two responsibilities (the logic and the "only one" rule). Use only for truly single resources, and prefer passing a single instance in via DI.
:::

:::qa Is the C++11 function-local static singleton thread-safe? Is using it thread-safe? {level=hard}
The **initialisation** is thread-safe (the standard guarantees one thread initialises while others wait). But calls to the object's methods are not automatically safe; protect shared state inside it with a mutex.
:::

:::qa How would you destroy or reset a singleton for tests? {level=hard}
Meyers' singleton cannot be reset. Options: depend on an interface and inject a test double; add a test-only `reset()`; or avoid the singleton and create one instance at the composition root.
:::

:::qa What is the Factory Method pattern? {level=easy}
A method that creates objects, letting subclasses (or a parameter) decide which concrete class. `Document::createPage()` is overridden by `Resume` and `Report`. The client works with the product interface and never names concrete classes.
:::

:::qa Simple Factory vs Factory Method vs Abstract Factory? {level=medium}
- **Simple factory:** one function/class with a `switch` that returns products (not a GoF pattern; simple but violates OCP).
- **Factory Method:** a virtual creation method overridden in subclasses.
- **Abstract Factory:** an interface that creates a **family** of related products (`WinFactory` makes `WinButton` and `WinCheckbox`) so they always match.
:::

:::qa How do you make a factory open for extension in C++? {level=medium}
Use a **registry**: a map from name to creator function (`map<string, function<unique_ptr<Shape>()>>`). New types register themselves; the factory never changes.
:::

:::qa What is the Builder pattern and when do you use it? {level=easy}
It constructs a complex object step by step with a fluent interface (`Pizza::Builder().size(L).cheese().build()`), avoiding telescoping constructors with many optional parameters and allowing validation in `build()`. Alternative in C++20: designated initialisers or a config struct.
:::

:::qa What is the Prototype pattern? {level=medium}
Create new objects by **cloning** an existing instance (`virtual unique_ptr<Shape> clone() const`). Useful when construction is expensive or when you only have a base pointer and need a copy of the real derived object (avoiding slicing).
:::

:::qa What is the Object Pool pattern? {level=medium}
Reuse expensive objects (threads, connections, buffers) instead of creating and destroying them. Acquire from the pool, release back. Needs thread-safety, a size limit and a policy for exhaustion (block, grow or fail). Return handles with RAII so release is automatic.
:::

:::qa Which creational pattern would you use for a configuration with many optional fields? {level=easy}
Builder (or a settings struct with defaults). It keeps construction readable and validated.
:::

:::qa How does Dependency Injection relate to creational patterns? {level=medium}
DI moves the "where do objects come from" decision to the composition root, which uses factories/builders. Classes receive collaborators instead of calling `new` or `getInstance()`, which reduces the need for Singleton.
:::

:::qa How does a factory help with testing? {level=medium}
Code depends on a `ShapeFactory` interface, so tests supply a fake factory that returns stubs. Without it, `new Concrete` inside the class cannot be replaced.
:::

:::qa Why return `unique_ptr` from factories? {level=medium}
It states ownership transfer, is exception-safe, can be converted to `shared_ptr` if needed, and works with polymorphic types as `unique_ptr<Base>`.
:::

:::qa What is lazy vs eager initialisation for singletons? {level=medium}
Eager creates the instance at startup (simple, predictable, may waste time/memory). Lazy creates it on first use (function-local static), saves startup cost and avoids static-order problems.
:::

```quiz
? You need a family of UI widgets that must match each other (all dark-theme or all light-theme). Which pattern?
- Builder
- Prototype
+ Abstract Factory
> It creates related products from one factory.
? What is the main weakness of Singleton?
- It is slow
+ Hidden global state that is hard to test and couples code
- It cannot be thread-safe
> Prefer injecting the single instance.
```

:::keypoints
- Singleton: Meyers' static local, delete copies; but prefer DI.
- Factory Method (subclass decides), Abstract Factory (families), Builder (stepwise), Prototype (clone), Pool (reuse).
- Registries make factories open for extension.
:::
