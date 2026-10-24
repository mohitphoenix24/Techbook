---
title: "LLD interview: creational patterns"
level: medium
time: 30
summary: Simple answers about Singleton, Factory, Abstract Factory, Builder, Prototype and Object Pool: what each one is for, when to use it, and the usual follow-up questions.
---

:::qa What is a design pattern, and why learn them? {level=easy}
**Say this:** "A pattern is a named, proven solution to a problem that comes up again and again. It gives us a shared vocabulary."

**In simple words:** When you say "use a Strategy here", everyone knows what you mean. But a pattern is not code to copy. Use it only when you really have that problem.
:::

:::qa How are the GoF patterns grouped? {level=easy}
**Say this:** "Creational (making objects), structural (joining objects), and behavioural (how objects work together)."

**In simple words:**
- **Creational:** Singleton, Factory Method, Abstract Factory, Builder, Prototype.
- **Structural:** Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy.
- **Behavioural:** Strategy, Observer, Command, State, Template Method, Chain of Responsibility, Iterator, Mediator, Memento, Visitor, Interpreter.
:::

:::qa What is the Singleton pattern? How do you implement it in C++? {level=easy}
**Say this:** "A class with exactly one object and one place to get it. In C++ I use a private constructor, delete copying, and return a function-local static."

**In simple words:** This is called the Meyers singleton:

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
**Say this:** "It is hidden global state. It is hard to test, it hides dependencies, and it ties every user to one class."

**In simple words:** A class that quietly uses `Config::instance()` inside does not show that it needs a config. You cannot swap it with a fake in a test. Better to create one object in `main` and pass it in.
:::

:::qa Is the C++11 function-local static singleton thread-safe? Is using it thread-safe? {level=hard}
**Say this:** "Creating it is thread-safe. Using it is not automatically safe."

**In simple words:** C++ guarantees that the object is created exactly once, even with many threads. But if it holds data that changes, you still need a mutex inside it.
:::

:::qa How would you destroy or reset a singleton for tests? {level=hard}
**Say this:** "A Meyers singleton cannot be reset. So I depend on an interface and pass a fake in tests."

**In simple words:** Options: put it behind an interface, add a test-only `reset()`, or avoid the singleton and create one object in `main`.
:::

:::qa What is the Factory Method pattern? {level=easy}
**Say this:** "A method that creates objects, where a subclass (or a parameter) decides which class. The user only knows the interface."

**In simple words:** `Document::createPage()` is overridden by `Resume` and `Report`. The code using it never names the concrete page class.
:::

:::qa Simple Factory vs Factory Method vs Abstract Factory? {level=medium}
**Say this:** "Simple Factory is one function with an if. Factory Method uses a subclass to decide. Abstract Factory makes a whole matching set of objects."

**In simple words:**
- **Simple factory:** one function with a `switch` (easy, but you edit it for each new type).
- **Factory Method:** a virtual creation method that subclasses override.
- **Abstract Factory:** one factory makes a **family** (`WinFactory` makes `WinButton` and `WinCheckbox`), so they always match.
:::

:::qa How do you make a factory open for extension in C++? {level=medium}
**Say this:** "Use a registry: a map from name to a function that creates the object. New types register themselves."

**In simple words:** `map<string, function<unique_ptr<Shape>()>>`. The factory never changes when you add a type.
:::

:::qa What is the Builder pattern and when do you use it? {level=easy}
**Say this:** "Build an object step by step with named steps. Use it when there are many optional parts."

**In simple words:** `Pizza::Builder().size(L).cheese().build()` is easier to read than a constructor with 8 arguments. `build()` can also check that the combination is valid. In C++20, designated initialisers can do the same for simple structs.
:::

:::qa What is the Prototype pattern? {level=medium}
**Say this:** "Make new objects by copying an existing one, using a virtual `clone()`."

**In simple words:** It is useful when you only have a base pointer and want a copy of the real child object (and not a cut-down copy). Also when creating the object from scratch is expensive.
:::

:::qa What is the Object Pool pattern? {level=medium}
**Say this:** "Keep costly objects ready and reuse them. Borrow one, use it, give it back."

**In simple words:** Like a library: you do not print a new book for each reader. A pool needs thread safety, a size limit, and a rule for when it is empty (wait, grow or fail). Give out an RAII handle, so the object always comes back.
:::

:::qa Which creational pattern would you use for a configuration with many optional fields? {level=easy}
**Say this:** "Builder, or a settings struct with default values."

**In simple words:** The construction stays readable, and `build()` can check the settings.
:::

:::qa How does Dependency Injection relate to creational patterns? {level=medium}
**Say this:** "Injection moves the decision of 'where do objects come from' to one place, the composition root."

**In simple words:** Classes receive their helpers instead of calling `new` or `getInstance()`. This often removes the need for a Singleton.
:::

:::qa How does a factory help with testing? {level=medium}
**Say this:** "Code depends on a factory interface, so a test can give a fake factory that returns simple stand-ins."

**In simple words:** Without a factory, a `new Concrete` inside a class cannot be replaced in a test.
:::

:::qa Why return unique_ptr from factories? {level=medium}
**Say this:** "It shows that ownership moves to the caller, it is safe with errors, and it can become a `shared_ptr` if needed."

**In simple words:** The factory makes the object and gives it away. `unique_ptr<Base>` works with child classes.
:::

:::qa What is lazy vs eager initialisation for singletons? {level=medium}
**Say this:** "Eager creates it at start. Lazy creates it the first time it is used."

**In simple words:** Eager is simple and predictable, but can waste start-up time. Lazy (a function-local static) saves time and avoids start-up order problems.
:::

```quiz
? You need a matching set of UI widgets (all dark theme or all light theme). Which pattern?
- Builder
- Prototype
+ Abstract Factory
> One factory makes the whole matching family.
? What is the main weakness of Singleton?
- It is slow
+ Hidden global state that is hard to test and ties code together
- It cannot be thread-safe
> Prefer passing the one object in.
```

:::keypoints
- Singleton: static local, deleted copies. But prefer passing one object in.
- Factory Method (a subclass decides), Abstract Factory (matching sets), Builder (step by step), Prototype (clone), Pool (reuse).
- A registry makes a factory open for new types.
:::
