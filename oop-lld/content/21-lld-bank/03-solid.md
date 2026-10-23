---
title: "LLD interview: SOLID and design principles"
level: medium
time: 30
summary: Each SOLID principle with a violation example, the fix, and the follow-up questions; plus DRY, KISS, YAGNI, composition over inheritance and the Hollywood principle.
---

See the SOLID module for full worked examples. Here are the questions you will be asked.

:::qa Explain the Single Responsibility Principle with an example. {level=easy}
A class should have **one reason to change**. An `Invoice` that computes totals, prints itself and saves to a database has three reasons. Split into `Invoice` (data and totals), `InvoicePrinter` and `InvoiceRepository`. A change to printing then cannot break storage.
:::

:::qa Is SRP "a class should do one thing"? {level=medium}
Not exactly. It is about **reasons to change**, tied to who asks for changes (actors). A class can have several methods, as long as they change for the same reason. Taking SRP to the extreme gives hundreds of tiny classes with no meaning.
:::

:::qa Explain the Open/Closed Principle with an example. {level=easy}
Code should be **open for extension, closed for modification**. A `DiscountCalculator` with `if (type == "student") ... else if (type == "senior")` must be edited for each new type. With a `DiscountPolicy` interface, a new type is a new class and the calculator never changes.
:::

:::qa How do you achieve OCP in C++? {level=medium}
Depend on an abstraction (interface, `std::function`, template parameter) and add behaviour by supplying new implementations: Strategy, Decorator, Template Method, plug-in registries. Remove `switch`/`if` on type.
:::

:::qa Is OCP always achievable? {level=hard}
No. You can only be closed against changes you anticipated. Choose the likely axis of change (new payment methods), abstract that, and accept modification for rare changes. Premature abstraction is also a cost.
:::

:::qa Explain the Liskov Substitution Principle with the Square/Rectangle example. {level=medium}
If `Square` derives from `Rectangle` and overrides `setWidth` to also change height, code that sets width 5 and height 4 and expects area 20 breaks for a square. A subtype must honour the base's **contract**. Fix: no inheritance between them (separate shapes under a `Shape` interface) or make shapes immutable.
:::

:::qa What are the rules of LSP? {level=hard}
Subtypes must not **strengthen preconditions** (require more), must not **weaken postconditions** (promise less), must **preserve invariants**, and must not throw new kinds of exceptions the base does not allow. Signature rules: contravariant parameters, covariant return types.
:::

:::qa What is a typical sign of an LSP violation? {level=medium}
A subclass that throws `NotImplemented`, returns a no-op, or code that checks `if (dynamic_cast<Penguin*>(bird))` before calling `fly()`. Fix the hierarchy (`Bird` and `FlyingBird`) or use composition.
:::

:::qa Explain the Interface Segregation Principle. {level=easy}
Clients should not be forced to depend on methods they do not use. A fat `Machine` interface with `print()`, `scan()` and `fax()` forces a simple printer to implement scan and fax. Split into `IPrinter`, `IScanner`, `IFax`; a multifunction device implements all three.
:::

:::qa Explain the Dependency Inversion Principle. {level=easy}
High-level policy should not depend on low-level details; **both should depend on abstractions**. `OrderService` should depend on `IPaymentGateway`, not on `StripeGateway`. The detail implements the abstraction defined by the high-level module.
:::

:::qa What is the difference between dependency inversion, dependency injection and inversion of control? {level=medium}
- **IoC:** a framework or caller controls the flow (the Hollywood principle).
- **DIP:** a design rule about which way source dependencies point (towards abstractions).
- **DI:** a technique to supply dependencies from outside (constructor, setter). DI is one way to follow DIP.
:::

:::qa Which SOLID principle does the Strategy pattern support most? {level=medium}
OCP (new behaviour without editing the context), plus DIP (the context depends on the strategy interface) and SRP (each algorithm in its own class).
:::

:::qa Which principle is violated by a `switch` on a type code? {level=easy}
OCP (every new type edits the switch), and often LSP/polymorphism not being used. Replace with virtual functions or a strategy map.
:::

:::qa Can SOLID conflict with simplicity? {level=medium}
Yes. Applied everywhere it produces many small classes and indirection. Apply SOLID where change or complexity actually occurs; keep simple code simple.
:::

:::qa What are DRY, KISS and YAGNI? {level=easy}
- **DRY:** Don't Repeat Yourself: every piece of knowledge has one place.
- **KISS:** Keep It Simple: the simplest design that works.
- **YAGNI:** You Aren't Gonna Need It: do not build for imagined needs.
:::

:::qa What is DRY's pitfall? {level=hard}
Merging code that merely *looks* alike but changes for different reasons creates coupling ("accidental duplication"). Only deduplicate real shared knowledge.
:::

:::qa What is the Hollywood principle? {level=medium}
"Don't call us, we'll call you." A framework calls your code (callbacks, template methods, event handlers) rather than your code calling the framework. It is inversion of control.
:::

:::qa What is the Principle of Least Astonishment? {level=easy}
A class or function should behave as users expect from its name and context. `getUser()` should not delete anything; operators should behave like the built-in ones.
:::

:::qa How would you review code for SOLID violations? {level=medium}
Look for classes with many unrelated methods or imports (SRP), `if/switch` on type (OCP), subclasses that override to do nothing or throw (LSP), interfaces with many methods where clients use few (ISP), and `new ConcreteClass` inside high-level code (DIP).
:::

```quiz
? A `Bird` base class has `fly()`, and `Penguin` overrides it to throw. Which principle is broken?
- Single responsibility
- Interface segregation
+ Liskov substitution
> Callers of `Bird::fly` cannot trust it; restructure the hierarchy.
? Replacing `if (kind == "student")` chains with a DiscountPolicy interface applies...
- ISP
+ OCP
- SRP only
> New kinds are added without editing the calculator.
```

:::keypoints
- S: one reason to change. O: extend without editing. L: honour the base contract. I: small client-specific interfaces. D: depend on abstractions.
- DI is the technique; DIP is the rule; IoC is the style.
- Apply principles where variation exists; avoid over-engineering.
:::
