---
title: "LLD interview: OOP design and UML"
level: easy
time: 25
summary: Relationships between classes, UML diagram types, modelling choices (inheritance vs composition, interface vs abstract class), dependency injection, immutability, value vs entity and the design vocabulary.
---

## UML and relationships

:::qa What are the relationships between classes in UML and how do you write each in C++? {level=easy}
| Relationship | Meaning | C++ shape |
|---|---|---|
| Association | uses / knows | pointer or reference member |
| Aggregation | has-a, part can live alone | pointer / `weak_ptr` / `shared_ptr` member |
| Composition | has-a, part dies with whole | member by value, `unique_ptr`, `vector` |
| Inheritance | is-a | `class D : public B` |
| Realisation | implements an interface | `class D : public IFace` |
| Dependency | temporarily uses | parameter or local variable |
:::

:::qa What is the difference between association, aggregation and composition? {level=medium}
Association is any link. Aggregation says "whole-part" but the part exists independently (a `Department` and its `Professor`s). Composition says the part has no life without the whole (a `House` and its `Room`s): destroying the whole destroys the parts.
:::

:::qa What UML diagrams do you use in an LLD interview? {level=easy}
Mainly the **class diagram** (structure), the **sequence diagram** (a flow between objects over time) and the **state diagram** (lifecycle of one object). Occasionally a use-case diagram to list actors and goals.
:::

:::qa How do you show multiplicity and navigability? {level=medium}
Numbers at the line ends: `1`, `0..1`, `*`, `1..*`. An arrow shows who knows whom: `Order -> Customer` means an `Order` holds a customer reference but not the other way round. Prefer one-way navigability: it reduces coupling.
:::

:::qa What is the difference between an interface and an abstract class? {level=medium}
An **interface** (pure virtual functions only, no state) defines a capability and supports multiple implementation. An **abstract class** may also hold shared state and default code. In C++, both use pure virtual functions; use an interface for roles ("Payable") and an abstract base when subclasses really share implementation.
:::

:::qa When do you choose inheritance and when composition in design? {level=medium}
Inheritance for a true is-a with substitutability and shared interface (`Circle` is a `Shape`). Composition when you want to reuse behaviour or vary it at run time (a `Car` has an `Engine`; a `Player` has a `MovementStrategy`). "Favour composition over inheritance" because it keeps coupling low.
:::

:::qa What is the difference between an entity and a value object? {level=medium}
An **entity** has an identity that persists as its data changes (`User` with id 7). A **value object** is defined only by its values and is immutable (`Money(5, INR)`, `DateRange`). Value objects are compared by value and can be freely shared and copied.
:::

:::qa Why make objects immutable? {level=medium}
Immutable objects are inherently thread-safe, easy to reason about, safe to share and use as map keys, and cannot be left in a half-updated state. Make small value types immutable (`const` members or no setters) and change them by creating new ones.
:::

:::qa What is dependency injection and why use it? {level=easy}
Pass an object's collaborators in (constructor parameters) rather than letting it create them. The class depends on an interface, so you can swap implementations, use fakes in tests and configure the object graph in one place (the composition root).
:::

:::qa Constructor injection vs setter injection? {level=medium}
Constructor injection makes dependencies **required** and the object valid from the start (preferred). Setter injection allows optional or changeable dependencies but leaves a window where the object is incomplete.
:::

:::qa What is the Tell, Don't Ask principle? {level=medium}
Tell objects what to do instead of asking for their state and deciding for them. `account.withdraw(50)` keeps the rule inside; `if (account.getBalance() >= 50) account.setBalance(...)` leaks it and invites duplicated checks.
:::

:::qa What is an anemic domain model? {level=medium}
Entities that are only data holders with getters/setters, while all behaviour lives in service classes. It is procedural code in disguise. Put behaviour next to the data it protects.
:::

:::qa What is a God class and how do you fix it? {level=easy}
A class that knows and does too much (a `Manager` with 40 methods). Split by responsibility: identify groups of methods that use different data, extract classes (and name them by role), and delegate.
:::

:::qa What is the difference between a service, a repository and a factory? {level=medium}
A **service** holds business operations that span objects. A **repository** hides how entities are stored and found (a collection-like interface). A **factory** creates objects when construction is complex or varies by type.
:::

:::qa How do you model "one of several types" in C++ for a design problem? {level=medium}
Closed set known at compile time: an `enum class` plus `std::variant`, or a small hierarchy with a visitor. Open set that others extend: an interface with virtual functions and a factory/registry.
:::

:::qa How do you represent money, time and ids in a design? {level=easy}
Money as an integer number of minor units (paise/cents) plus currency in a `Money` type, never `double`. Time through an injectable `Clock` and `chrono` types. Ids as strong types or strings generated by an injectable generator.
:::

:::qa What is cohesion at class level and package level? {level=medium}
Class cohesion: the methods work on the same data for one purpose. Package cohesion: classes that change together live together (and depend one way). Low cohesion makes changes ripple.
:::

:::qa What is a design smell? Name five. {level=easy}
A sign (not a bug) that the design needs work: God class, long method, long parameter list, switch on type, duplicated code, feature envy (a method using another class's data more than its own), shotgun surgery (one change touches many classes), primitive obsession.
:::

:::qa How does the Law of Demeter affect design? {level=medium}
It reduces coupling: a class should only call its own members, parameters and objects it creates. So `order.customer().address().city()` becomes `order.shippingCity()`. Outer code does not depend on the structure of inner objects.
:::

:::qa What is the principle "prefer composition over inheritance" really saying? {level=medium}
Reuse by **holding** another object and delegating, instead of by deriving from it. It avoids tight coupling to the base's internals, allows run-time swapping, and avoids deep hierarchies.
:::

```quiz
? Which relationship does a filled diamond represent in UML?
- Inheritance
+ Composition
- Dependency
> The part's lifetime is bound to the whole.
```

:::keypoints
- Know the six relationships and their C++ shapes; prefer one-way association and composition.
- Entities vs value objects; immutability; Tell-Don't-Ask; avoid God classes and anemic models.
- Inject dependencies through constructors.
:::
