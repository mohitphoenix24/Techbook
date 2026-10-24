---
title: "LLD interview: SOLID and design principles"
level: medium
time: 30
summary: Simple answers for each SOLID principle with a bad example and the fix, plus DRY, KISS, YAGNI and other everyday design rules.
---

See the SOLID module for full examples. Here are the questions you will be asked. Each one has a short **Say this** line.

:::qa Explain the Single Responsibility Principle with an example. {level=easy}
**Say this:** "A class should have only one reason to change. An Invoice that calculates totals, prints itself and saves to a database has three reasons. So I split it into three classes."

**In simple words:** If a change in printing can break saving, the class is doing too much. Make `Invoice` (data and totals), `InvoicePrinter` and `InvoiceRepository`.
:::

:::qa Is SRP "a class should do one thing"? {level=medium}
**Say this:** "Not exactly. It means one reason to change, for one group of people. A class may have many methods if they all serve the same purpose."

**In simple words:** `Money` has add, subtract and compare, and that is fine, because all of them are about money. If you split too much, you get hundreds of tiny classes with no meaning.
:::

:::qa Explain the Open/Closed Principle with an example. {level=easy}
**Say this:** "Add new behaviour by adding new code, not by editing old code. Replace an if-else chain on type with an interface and one class for each type."

**In simple words:** A discount calculator with `if (type == "student") ... else if (type == "senior")` must be edited for every new type. With a `DiscountPolicy` interface, a new type is just a new class, and the calculator never changes.
:::

:::qa How do you achieve OCP in C++? {level=medium}
**Say this:** "Depend on an abstraction (an interface, a `std::function` or a template parameter) and add behaviour by giving a new implementation."

**In simple words:** Use Strategy, Decorator, Template Method, or a registry for plug-ins. Remove `switch` and `if` chains on types.
:::

:::qa Is OCP always achievable? {level=hard}
**Say this:** "No. I can only prepare for the changes I expect. I choose the likely change, abstract that, and accept edits for rare ones."

**In simple words:** Adding abstractions for every possible future is also a cost. Pick the one or two places where change is likely, like payment methods.
:::

:::qa Explain the Liskov Substitution Principle with the Square/Rectangle example. {level=medium}
**Say this:** "If I replace a parent with a child, the program should still work. A Square that changes both sides when you set the width breaks code written for Rectangle."

**In simple words:** Code sets width 5 and height 4 and expects area 20. A Square cannot do that. So Square should not inherit from Rectangle. Make both shapes under a `Shape` interface, or make them unchangeable.
:::

:::qa What are the rules of LSP? {level=hard}
**Say this:** "The child must not ask for more, must not give less, and must not surprise the code that uses the parent."

**In simple words:** The formal words are: preconditions no stronger, postconditions no weaker, invariants kept, and no new kinds of errors. In simple terms: anything that worked with the parent must work with the child.
:::

:::qa What is a typical sign of an LSP violation? {level=medium}
**Say this:** "A child method that throws 'not supported', does nothing, or code that checks the child type before calling."

**In simple words:** For example `Penguin` inherits `Bird` and throws in `fly()`. Fix it by splitting into `Bird` and `FlyingBird`, or by using composition.
:::

:::qa Explain the Interface Segregation Principle. {level=easy}
**Say this:** "Do not force a class to have methods it does not need. Split a big interface into small ones."

**In simple words:** A `Machine` interface with print, scan and fax forces a simple printer to write scan and fax methods. Make `IPrinter`, `IScanner` and `IFax`. A multi-function device follows all three.
:::

:::qa Explain the Dependency Inversion Principle. {level=easy}
**Say this:** "Important code should depend on interfaces, not on small details. `OrderService` should use `IPaymentGateway`, not `StripeGateway`."

**In simple words:** The interface belongs to the important code. The details (Stripe, PayPal) follow it. Then you can swap the detail without touching the important code.
:::

:::qa What is the difference between dependency inversion, dependency injection and inversion of control? {level=medium}
**Say this:** "Inversion is the rule. Injection is the trick that follows the rule. Inversion of control is the wider idea that someone else controls the flow."

**In simple words:**
- **DIP:** depend on interfaces.
- **DI:** pass the helper in from outside.
- **IoC:** "don't call us, we will call you" (a framework calls your code).
:::

:::qa Which SOLID principle does the Strategy pattern support most? {level=medium}
**Say this:** "Mainly OCP, because a new behaviour is a new class. Also DIP and SRP."

**In simple words:** The context depends on the strategy interface (DIP), each algorithm is in its own class (SRP), and you add algorithms without editing the context (OCP).
:::

:::qa Which principle is violated by a switch on a type code? {level=easy}
**Say this:** "OCP. Every new type means editing the switch."

**In simple words:** Replace it with virtual functions (one class for each type), or a map of strategies.
:::

:::qa Can SOLID conflict with simplicity? {level=medium}
**Say this:** "Yes. If I apply it everywhere I get too many small classes. I apply it where change really happens."

**In simple words:** Keep simple code simple. Use SOLID where the code is getting hard to change.
:::

:::qa What are DRY, KISS and YAGNI? {level=easy}
**Say this:** "Don't Repeat Yourself, Keep It Simple, You Aren't Gonna Need It."

**In simple words:** DRY: each piece of knowledge lives in one place. KISS: choose the simplest design that works. YAGNI: do not build what you do not need yet.
:::

:::qa What is DRY's pitfall? {level=hard}
**Say this:** "Joining two pieces of code that only look the same but change for different reasons."

**In simple words:** If you merge them, a change for one breaks the other. Only remove repetition when the code really shares the same idea.
:::

:::qa What is the Hollywood principle? {level=medium}
**Say this:** "Don't call us, we will call you. A framework calls my code, and I do not call the framework."

**In simple words:** Callbacks, Template Method and event handlers all work this way. It is called inversion of control.
:::

:::qa What is the Principle of Least Astonishment? {level=easy}
**Say this:** "A function should do what its name says, nothing more."

**In simple words:** `getUser()` should not delete anything. Operators should behave like the normal ones.
:::

:::qa How would you review code for SOLID violations? {level=medium}
**Say this:** "I look for classes with many unrelated methods, if-else chains on type, children that throw or do nothing, big interfaces, and `new ConcreteClass` inside important code."

**In simple words:** One clue for each letter: S (many jobs in one class), O (switch on type), L (a child that refuses), I (a fat interface), D (creating the concrete helper inside).
:::

```quiz
? A Bird base class has fly(), and Penguin overrides it to throw an error. Which principle is broken?
- Single responsibility
- Interface segregation
+ Liskov substitution
> Code that uses a Bird cannot trust fly(). Restructure the classes.
? Replacing if (kind == "student") chains with a DiscountPolicy interface applies...
- ISP
+ OCP
- SRP only
> New kinds are new classes, and the calculator does not change.
```

:::keypoints
- S: one reason to change. O: add, do not edit. L: a child must be safe to use in place of the parent. I: small interfaces. D: depend on interfaces.
- DI is the trick, DIP is the rule, IoC is the wider idea.
- Use these ideas where change is likely. Do not over-build.
:::
