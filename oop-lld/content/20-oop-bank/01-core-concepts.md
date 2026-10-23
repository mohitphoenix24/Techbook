---
title: "OOP interview: core concepts"
level: easy
time: 25
summary: Classes and objects, the four pillars, composition vs inheritance, coupling and cohesion, and the definitions interviewers ask first.
---

Answer each question aloud before opening it. Short answers are on purpose: they are what you would say in the first thirty seconds. Use the **Mark as known** button to track your revision. All questions of the course are also on the [Q&A page](#/qa/oop).

## The four pillars

:::qa What are the four pillars of OOP? {level=easy}
**Encapsulation** (bundle data with the code that works on it and hide the details), **abstraction** (show only what the user needs), **inheritance** (a new class reuses and extends an existing one) and **polymorphism** (one interface, many behaviours).

A one-line example: a `Shape` interface (abstraction) with private fields in `Circle` (encapsulation), `Circle` derived from `Shape` (inheritance), and a loop calling `area()` on a `vector<Shape*>` (polymorphism).
:::

:::qa What is encapsulation, and how is it different from abstraction? {level=easy}
Encapsulation is about **protecting state**: data is private and changes only through methods that keep the object valid. Abstraction is about **hiding complexity**: the caller sees *what* an object does, not *how*.

Think of a car. The engine being under the bonnet is encapsulation. The steering wheel and pedals as the only controls is abstraction.
:::

:::qa What is the difference between a class and an object? {level=easy}
A class is a **blueprint** (a type with data members and functions). An object is a **real instance** of that type, living in memory with its own values.
:::

:::qa What is polymorphism? Name its two kinds in C++. {level=easy}
Polymorphism means "many forms": the same call behaves differently depending on the type.

- **Compile-time (static):** function overloading, operator overloading, templates.
- **Run-time (dynamic):** virtual functions called through a base pointer or reference.
:::

:::qa What is inheritance? What problems does it cause when overused? {level=easy}
Inheritance lets a derived class reuse and specialise a base class (an **is-a** relationship). When overused it creates deep, rigid hierarchies, tight coupling to the base class, the fragile base class problem and wrong models (a `Square` that is not really a `Rectangle`). Prefer composition unless the substitution rule really holds.
:::

:::qa Composition vs inheritance: which do you prefer and why? {level=medium}
I prefer **composition** by default ("has-a"). It couples classes loosely, lets you change behaviour at run time (swap a member), and avoids the fragile base class problem. I use inheritance only for a true is-a relationship where a derived object can be used anywhere a base is expected (Liskov), mainly to implement interfaces.
:::

:::qa What is the difference between aggregation and composition? {level=medium}
Both are "has-a". In **composition** the part cannot outlive the whole (an `Engine` member owned by value or `unique_ptr` inside `Car`). In **aggregation** the part has its own life and the whole only refers to it (a `Team` holding pointers to `Player`s who exist without the team). In C++: members by value or `unique_ptr` for composition; raw/weak/shared pointers for aggregation.
:::

:::qa What are coupling and cohesion? Which should be high? {level=medium}
**Cohesion** is how closely the parts of one class belong together. **Coupling** is how much one class depends on others. Aim for **high cohesion, low coupling**: each class does one job well and knows as little as possible about the rest.
:::

:::qa What is a constructor? What is a destructor? {level=easy}
A constructor runs automatically when an object is created and puts it in a valid state. A destructor runs when the object's lifetime ends (scope exit, `delete`, owner destroyed) and releases resources. In C++ this pair is the base of **RAII**.
:::

:::qa What is an abstract class? How do you make one in C++? {level=easy}
A class that cannot be instantiated because it has at least one **pure virtual function** (`virtual void f() = 0;`). It defines an interface (and possibly some shared code) that derived classes must complete.
:::

:::qa What is an interface in C++? There is no keyword for it. {level=easy}
By convention, a class with **only pure virtual functions and a virtual destructor**, no data. Classes implement it by inheriting and overriding every function.
:::

:::qa What does "program to an interface, not an implementation" mean? {level=medium}
Depend on abstract types (`Logger`, `PaymentMethod`) rather than concrete classes (`FileLogger`). Then you can swap implementations, test with fakes, and add new variants without touching the callers.
:::

:::qa What is the "is-a" test and why is it not enough? {level=medium}
"Is a `Square` a `Rectangle`?" Mathematically yes, but in code a `Rectangle` lets you set width and height independently, and a `Square` cannot honour that. The real test is **substitutability**: can every use of the base work correctly with the derived class? If not, inheritance is wrong. That is the Liskov Substitution Principle.
:::

:::qa What is the difference between a struct and a class in C++? {level=easy}
Only the **default access**: members of a `struct` are public by default, members of a `class` are private. Inheritance defaults to public for `struct` and private for `class`. Convention: `struct` for plain data, `class` for types with invariants.
:::

:::qa What is an invariant? Why do we care? {level=medium}
A condition that is always true for a valid object (for example `balance >= 0`, or `size <= capacity`). The constructor establishes it and every public method preserves it. Encapsulation exists to protect invariants.
:::

:::qa What is the difference between overloading, overriding and hiding? {level=medium}
- **Overloading:** same name, different parameters, same scope. Resolved at compile time.
- **Overriding:** a derived class replaces a *virtual* function with the same signature. Resolved at run time.
- **Hiding:** a derived function with the same name hides **all** base functions of that name (even with other parameters), unless you write `using Base::f;`.
:::

:::qa What is late binding vs early binding? {level=medium}
Early (static) binding picks the function at compile time from the static type. Late (dynamic) binding picks it at run time from the real object type, through the vtable, and applies to `virtual` functions called by pointer or reference.
:::

:::qa What is the Law of Demeter? {level=medium}
"Talk only to your friends." A method should call methods on itself, its parameters, objects it creates, and its direct members. Chains like `a.getB().getC().doIt()` leak structure; wrap them in a method on `a`.
:::

:::qa What is the difference between a shallow and a deep copy? {level=medium}
A shallow copy copies pointer values, so both objects share the same resource (and may double-free it). A deep copy allocates a new resource and copies the contents so each object owns its own. The default copy constructor is shallow for raw pointers.
:::

:::qa What are access specifiers? {level=easy}
`public` (anyone), `protected` (the class and its derived classes), `private` (only the class and its friends). They enforce encapsulation at compile time.
:::

:::qa What does `friend` do, and does it break encapsulation? {level=medium}
`friend` gives another function or class access to private members. It is a controlled exception, useful for operators like `operator<<` or tightly related helper classes. Overuse does break encapsulation, so keep friends few and close.
:::

:::qa What are static members? {level=easy}
A `static` data member is **one copy shared by all objects** of the class (defined once outside the class, or `inline static`). A `static` member function has no `this` and can only touch static members. Use for counters, constants and factory functions.
:::

:::qa What is the `this` pointer? {level=easy}
Inside a non-static member function, `this` is a pointer to the object the function was called on. It is how members are reached, how methods return `*this` for chaining, and why `const` member functions have `const T*` as `this`.
:::

:::qa What is the difference between `delete` and `delete[]`? {level=easy}
`delete p` destroys one object; `delete[] p` destroys an array and calls every element's destructor. Mixing them is undefined behaviour. Better: avoid both and use `unique_ptr`, `vector` or `make_unique<T[]>`.
:::

:::qa What are the special member functions? {level=medium}
The default constructor, destructor, copy constructor, copy assignment, move constructor and move assignment. The compiler generates them when needed; the **Rule of 0/3/5** says how to treat them.
:::

```quiz
? Which relationship fits "a Car has an Engine that dies with the car"?
- Inheritance
- Aggregation
+ Composition
> The part's lifetime is owned by the whole.
? Which pair describes good design?
- Low cohesion, high coupling
+ High cohesion, low coupling
- High cohesion, high coupling
> Focused classes that depend on little.
```

:::keypoints
- Pillars: encapsulation, abstraction, inheritance, polymorphism.
- Prefer composition; use inheritance only when substitution holds.
- High cohesion, low coupling; protect invariants.
:::
