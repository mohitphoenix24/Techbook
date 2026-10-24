---
title: "LLD interview: OOP design and UML"
level: easy
time: 25
summary: Simple answers about class relationships, UML diagrams, inheritance vs composition, interface vs abstract class, passing helpers in, unchangeable objects, and the words used in design interviews.
---

Each answer has a short **Say this** line and a simple explanation below it.

## UML and relationships

:::qa What are the relationships between classes in UML and how do you write each in C++? {level=easy}
**Say this:** "Association, aggregation, composition, inheritance, implementing an interface, and dependency. In C++ they are a pointer, a pointer to something that lives alone, an owned member, a base class, an interface, and a parameter."

| Relationship | In simple words | C++ shape |
|---|---|---|
| Association | "knows" | a pointer or reference member |
| Aggregation | "has", but the part can live alone | `weak_ptr`, `shared_ptr` or pointer member |
| Composition | "owns", the part dies with the whole | a member, `unique_ptr`, `vector` |
| Inheritance | "is a" | `class D : public B` |
| Realisation | "follows the rules of an interface" | `class D : public IFace` |
| Dependency | "uses for a moment" | a parameter or local variable |
:::

:::qa What is the difference between association, aggregation and composition? {level=medium}
**Say this:** "All three mean 'connected'. In aggregation the part can live without the whole. In composition it cannot."

**In simple words:** Association is just a link. A Department and its Professors is aggregation: if the department closes, the professors still exist. A House and its Rooms is composition: if the house is destroyed, the rooms are gone too.
:::

:::qa What UML diagrams do you use in an LLD interview? {level=easy}
**Say this:** "Mostly a class diagram, a sequence diagram for the main flow, and a state diagram for something with a life cycle."

**In simple words:** The class diagram shows what exists. The sequence diagram shows who calls whom. The state diagram shows how one object changes over time. Sometimes a simple list of use cases at the start.
:::

:::qa How do you show multiplicity and navigability? {level=medium}
**Say this:** "Numbers at the ends of a line show how many. An arrow shows who knows whom. I prefer arrows in one direction."

**In simple words:** `1` = exactly one, `0..1` = zero or one, `*` = many, `1..*` = at least one. `Order -> Customer` means an Order knows its Customer, but the Customer does not know its Orders. One-way arrows keep the classes less tied together.
:::

:::qa What is the difference between an interface and an abstract class? {level=medium}
**Say this:** "An interface only lists what can be done. An abstract class can also hold shared data and code."

**In simple words:** In C++ both use pure virtual functions. Use an interface for a role (like `Payable`). Use an abstract base class when the children really share code or data.
:::

:::qa When do you choose inheritance and when composition in design? {level=medium}
**Say this:** "Inheritance for a true 'is a' where the child can replace the parent. Composition when I want to reuse or change behaviour, like 'has a'."

**In simple words:** A Circle **is a** Shape (inheritance). A Car **has an** Engine, and a Player **has a** MovementStrategy (composition). People say "prefer composition" because it keeps classes less tied together and lets you swap parts while the program runs.
:::

:::qa What is the difference between an entity and a value object? {level=medium}
**Say this:** "An entity has an identity that stays when its data changes. A value object is just its values and never changes."

**In simple words:** User number 7 is still user 7 even if they change their name (entity). `Money(5, INR)` is just five rupees. Any other five rupees is the same (value object). Value objects can be shared and copied freely.
:::

:::qa Why make objects immutable? {level=medium}
**Say this:** "An object that never changes is safe for many threads, easy to understand, and can be a map key."

**In simple words:** Nobody can change it by mistake, and it can never be left half-updated. To "change" it, make a new one. Do this for small value types like `Money` and `DateRange`.
:::

:::qa What is dependency injection and why use it? {level=easy}
**Say this:** "A class gets its helpers passed in, instead of creating them. That makes it easy to swap them and to test with fakes."

**In simple words:** Instead of `OrderService` writing `new SmtpMailer`, it receives a `Mailer` interface in the constructor. In production you pass the real mailer. In a test you pass a fake one. The place where you connect everything is called the composition root (usually `main`).
:::

:::qa Constructor injection vs setter injection? {level=medium}
**Say this:** "Constructor injection is for things the class must have. Setter injection is for optional things."

**In simple words:** With the constructor, the object is ready to use from the first moment. With a setter, there is a time when the object is half-ready. So prefer the constructor.
:::

:::qa What is the Tell, Don't Ask principle? {level=medium}
**Say this:** "Tell an object what to do. Do not ask for its data and decide yourself."

**In simple words:** Good: `account.withdraw(50)`. The rule stays inside the account. Bad: `if (account.getBalance() >= 50) account.setBalance(...)`. Now the rule is outside, and it will be copied in many places.
:::

:::qa What is an anemic domain model? {level=medium}
**Say this:** "Objects that hold only data, with all the logic in service classes. It is old procedural code in disguise."

**In simple words:** Put the behaviour next to the data it protects. A `Seat` should know if it is free, instead of a big service checking its fields.
:::

:::qa What is a God class and how do you fix it? {level=easy}
**Say this:** "A class that does too much. I split it by job."

**In simple words:** For example, a `Manager` with 40 methods. Find groups of methods that use different data, move each group into its own class with a clear name, and let the original class pass the work on.
:::

:::qa What is the difference between a service, a repository and a factory? {level=medium}
**Say this:** "A service does business work across objects. A repository hides how objects are stored. A factory creates objects."

**In simple words:** `BookingService.book(...)` is a service. `OrderRepository.findById(...)` is a repository (it looks like a collection and hides the database). `ShapeFactory.create("circle")` is a factory.
:::

:::qa How do you model "one of several types" in C++ for a design problem? {level=medium}
**Say this:** "If the list is fixed, use an enum or `std::variant`. If others can add types, use an interface and a factory."

**In simple words:** Fixed list known now (Circle, Square only): `variant`. Open list that may grow (plug-ins): an interface with virtual functions, and a registry or factory to create objects.
:::

:::qa How do you represent money, time and ids in a design? {level=easy}
**Say this:** "Money as an integer in paise with a currency, time through a clock I can replace, and ids as their own types."

**In simple words:** Never use `double` for money, because decimals like 0.1 are not exact. Pass in a `Clock` so tests can control time. Give ids a type (like `UserId`) so you cannot mix them up.
:::

:::qa What is cohesion at class level and package level? {level=medium}
**Say this:** "Cohesion means things that belong together are together."

**In simple words:** In a class: all methods work on the same data for one purpose. In a package: classes that change together live together. Low cohesion means one change forces edits in many places.
:::

:::qa What is a design smell? Name five. {level=easy}
**Say this:** "A smell is a sign that the design may need work. For example: God class, long method, switch on type, duplicated code, and feature envy."

**In simple words:** It is not a bug. It is a hint. Others: long list of parameters, shotgun surgery (one change touches many classes), primitive obsession (strings and ints instead of real types).
:::

:::qa How does the Law of Demeter affect design? {level=medium}
**Say this:** "Talk only to your direct friends. Do not reach through one object to another."

**In simple words:** Instead of `order.customer().address().city()`, write `order.shippingCity()`. Then the caller does not depend on how the inside is built.
:::

:::qa What is the principle "prefer composition over inheritance" really saying? {level=medium}
**Say this:** "Reuse by holding another object and passing the work to it, not by inheriting from it."

**In simple words:** Inheritance ties a child to its parent's insides and is fixed forever. Holding an object lets you swap it, and avoids deep family trees.
:::

```quiz
? Which relationship does a filled diamond represent in UML?
- Inheritance
+ Composition
- Dependency
> The part lives and dies with the whole.
```

:::keypoints
- Know the six relationships and their C++ shapes. Prefer one-way links and composition.
- Entity vs value object. Unchangeable objects. Tell, don't ask. Avoid God classes and anemic models.
- Pass helpers in through the constructor.
:::
