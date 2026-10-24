---
title: "OOP interview: core concepts"
level: easy
time: 25
summary: Simple answers on classes and objects, the four pillars of OOP, composition vs inheritance, coupling and cohesion, and the questions asked first in any interview.
---

Try to answer each question aloud before you open it. Each answer starts with a short **Say this** line, which is what you would say in the first 30 seconds. Below it is a simple explanation. Use **Mark as known** to track your revision. All questions are also on the [Q&A page](#/qa/oop).

## The four pillars

:::qa What are the four pillars of OOP? {level=easy}
**Say this:** "Encapsulation, abstraction, inheritance and polymorphism."

**In simple words:**
- **Encapsulation:** keep data together with the code that uses it, and hide the details.
- **Abstraction:** show only what the user needs.
- **Inheritance:** a new class reuses and extends an existing class.
- **Polymorphism:** one call, many behaviours.

One example: a `Shape` interface (abstraction), `Circle` with private fields (encapsulation), `Circle` derived from `Shape` (inheritance), and a loop that calls `area()` on every shape (polymorphism).
:::

:::qa What is encapsulation, and how is it different from abstraction? {level=easy}
**Say this:** "Encapsulation protects the data. Abstraction hides the complexity."

**In simple words:** Think of a car. The engine under the bonnet is encapsulation: you cannot touch it directly. The steering wheel and pedals as your only controls is abstraction: you do not need to know how the engine works.
:::

:::qa What is the difference between a class and an object? {level=easy}
**Say this:** "A class is a blueprint. An object is one real thing made from it."

**In simple words:** `Car` is the blueprint. My red car in the parking lot is an object. Each object has its own values.
:::

:::qa What is polymorphism? Name its two kinds in C++. {level=easy}
**Say this:** "Polymorphism means one name, many forms. At compile time: overloading and templates. At run time: virtual functions."

**In simple words:** `speak()` on a Dog says "Woof" and on a Cat says "Meow", even if you call it through an `Animal*`. That is run-time polymorphism.
:::

:::qa What is inheritance? What problems does it cause when overused? {level=easy}
**Say this:** "Inheritance lets a child class reuse a parent class. Overused, it makes deep, rigid class families and wrong models."

**In simple words:** Problems: the child depends on the parent's insides, a change in the parent breaks children (the "fragile base class"), and some "is a" ideas are not true in code (a Square is not safely a Rectangle). Use it only when the child can truly replace the parent.
:::

:::qa Composition vs inheritance: which do you prefer and why? {level=medium}
**Say this:** "I prefer composition: 'has a'. It keeps classes less tied together and lets me swap parts while running."

**In simple words:** A `Car` **has an** `Engine`. A `Player` **has a** `MovementStrategy`. I use inheritance only for a true 'is a' relationship where the child can be used anywhere the parent is expected, mostly for interfaces.
:::

:::qa What is the difference between aggregation and composition? {level=medium}
**Say this:** "Both mean 'has a'. In composition the part dies with the whole. In aggregation the part can live alone."

**In simple words:** A `Car` and its `Engine`: if the car is destroyed, the engine goes too (composition, a member or `unique_ptr`). A `Team` and its `Player`s: the players exist without the team (aggregation, pointers).
:::

:::qa What are coupling and cohesion? Which should be high? {level=medium}
**Say this:** "Cohesion is how well a class's parts belong together. Coupling is how much classes depend on each other. I want high cohesion and low coupling."

**In simple words:** Each class does one job well (high cohesion), and knows as little as possible about other classes (low coupling).
:::

:::qa What is a constructor? What is a destructor? {level=easy}
**Say this:** "A constructor runs when an object is created and makes it valid. A destructor runs when it ends and cleans up."

**In simple words:** The constructor gets the resource (memory, a file). The destructor gives it back. This pair is the basis of RAII.
:::

:::qa What is an abstract class? How do you make one in C++? {level=easy}
**Say this:** "A class you cannot create objects from, because it has at least one pure virtual function: `virtual void f() = 0;`."

**In simple words:** It sets rules that children must follow. It can also hold some shared code.
:::

:::qa What is an interface in C++? There is no keyword for it. {level=easy}
**Say this:** "A class with only pure virtual functions, a virtual destructor and no data."

**In simple words:** A class that follows it must write every function. It describes a role, like `Payable` or `Drawable`.
:::

:::qa What does "program to an interface, not an implementation" mean? {level=medium}
**Say this:** "Depend on abstract types like `Logger`, not on concrete ones like `FileLogger`."

**In simple words:** Then you can swap the implementation, use fakes in tests, and add new versions without changing the callers.
:::

:::qa What is the "is-a" test and why is it not enough? {level=medium}
**Say this:** "The real test is: can the child replace the parent everywhere? If not, do not inherit."

**In simple words:** A Square **is a** Rectangle in maths. But a rectangle lets you set width and height separately, and a square cannot do that. So in code, it is not safe.
:::

:::qa What is the difference between a struct and a class in C++? {level=easy}
**Say this:** "Only the default access: `struct` is public by default, `class` is private."

**In simple words:** Convention: use `struct` for plain data, and `class` for types with rules to protect. Inheritance also defaults to public for `struct` and private for `class`.
:::

:::qa What is an invariant? Why do we care? {level=medium}
**Say this:** "A rule that must always be true for a valid object, like `balance >= 0`."

**In simple words:** The constructor makes it true. Every public method keeps it true. That is why we hide the data: to protect the rule.
:::

:::qa What is the difference between overloading, overriding and hiding? {level=medium}
**Say this:** "Overloading: same name, different parameters. Overriding: a child replaces a virtual function. Hiding: a child function with the same name hides all parent versions."

**In simple words:**
- **Overloading** is decided at compile time.
- **Overriding** is decided at run time (needs `virtual`).
- **Hiding:** a child's `f(string)` hides the parent's `f(int)` unless you write `using Base::f;`.
:::

:::qa What is late binding vs early binding? {level=medium}
**Say this:** "Early binding picks the function at compile time. Late binding picks it at run time, from the real object type."

**In simple words:** Late binding is what `virtual` gives you, when you call through a pointer or reference.
:::

:::qa What is the Law of Demeter? {level=medium}
**Say this:** "Talk only to your direct friends. Do not write long chains like `a.getB().getC().doIt()`."

**In simple words:** If you reach through objects, you depend on how they are built inside. Give `a` one method that does the job.
:::

:::qa What is the difference between a shallow and a deep copy? {level=medium}
**Say this:** "A shallow copy copies pointer values, so both objects share the same resource. A deep copy makes a new resource and copies the content."

**In simple words:** Shallow: two objects point to the same memory, and both try to free it (a crash). Deep: each has its own. The default copy is shallow for raw pointers.
:::

:::qa What are access specifiers? {level=easy}
**Say this:** "`public` (anyone), `protected` (the class and its children), `private` (only the class and its friends)."

**In simple words:** They protect data at compile time.
:::

:::qa What does friend do, and does it break encapsulation? {level=medium}
**Say this:** "It gives another function or class access to private members. Used rarely, it is a controlled exception."

**In simple words:** Good uses: `operator<<` for printing, or two classes that are tightly related. Too many friends break encapsulation.
:::

:::qa What are static members? {level=easy}
**Say this:** "A static data member is one copy shared by all objects. A static function has no `this`."

**In simple words:** Use static members for counters, constants and factory functions.
:::

:::qa What is the this pointer? {level=easy}
**Say this:** "Inside a member function, `this` points to the object the function was called on."

**In simple words:** It is how members are reached, and how methods return `*this` for chaining.
:::

:::qa What is the difference between delete and delete[]? {level=easy}
**Say this:** "`delete` frees one object. `delete[]` frees an array. Mixing them is undefined behaviour."

**In simple words:** Better: use `unique_ptr`, `vector` or `make_unique<T[]>`, and avoid both.
:::

:::qa What are the special member functions? {level=medium}
**Say this:** "Default constructor, destructor, copy constructor, copy assignment, move constructor and move assignment."

**In simple words:** The compiler may write them for you. The Rule of 0, 3 and 5 says what to do.
:::

```quiz
? Which relationship fits "a Car has an Engine that dies with the car"?
- Inheritance
- Aggregation
+ Composition
> The part's life belongs to the whole.
? Which pair describes good design?
- Low cohesion, high coupling
+ High cohesion, low coupling
- High cohesion, high coupling
> Focused classes that depend on little.
```

:::keypoints
- Pillars: encapsulation, abstraction, inheritance, polymorphism.
- Prefer composition. Use inheritance only when the child can replace the parent.
- High cohesion, low coupling. Protect the rules (invariants).
:::
