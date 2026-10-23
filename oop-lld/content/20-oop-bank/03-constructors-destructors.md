---
title: "OOP interview: constructors and destructors"
level: medium
time: 30
summary: Default and parameterised constructors, initialiser lists, order of construction and destruction, delegating constructors, virtual destructors, and the Rule of 0, 3 and 5.
---

## Constructors

:::qa What are the kinds of constructors in C++? {level=easy}
Default (no arguments), parameterised, copy (`T(const T&)`), move (`T(T&&)`), delegating (calls another constructor of the same class), converting (single-argument, non-`explicit`), and `explicit` ones. The compiler may supply default, copy and move versions.
:::

:::qa When does the compiler NOT generate a default constructor? {level=easy}
As soon as you declare **any** constructor yourself. Write `T() = default;` to bring it back.
:::

:::qa What is an initialiser list and why prefer it? {level=easy}
`Point(int x, int y) : x_(x), y_(y) {}` initialises members **before** the body runs. It is required for `const` members, reference members and members/bases without a default constructor, and avoids the wasteful "default-construct then assign" for the rest.
:::

:::qa In what order are members initialised? {level=medium}
In the order they are **declared in the class**, not the order in the initialiser list. Base classes come first (in declaration order), then members. If one member's initialiser depends on another, declare them in the right order. Compilers warn with `-Wreorder`.
:::

:::qa In what order are destructors called? {level=medium}
The reverse of construction: the derived destructor body runs first, then members are destroyed in reverse declaration order, then the base class destructor. Local objects are destroyed in reverse order of creation.
:::

:::qa What is a delegating constructor? {level=medium}
A constructor that forwards to another one of the same class in its initialiser list: `Account() : Account(0, "none") {}`. It avoids repeating validation code.
:::

:::qa What is the "most vexing parse"? {level=hard}
`Timer t();` declares a **function** named `t` returning `Timer`, not an object. Use `Timer t;` or `Timer t{};`. Likewise `Widget w(Gadget());` declares a function. Brace initialisation avoids it.
:::

:::qa Can a constructor be virtual? Why not? {level=medium}
No. A virtual call needs the object's vtable pointer, which is set up *by* the constructor, so the type does not exist yet. For "virtual construction" use a **factory** or a virtual `clone()` function.
:::

:::qa What happens if you call a virtual function from a constructor? {level=hard}
It calls the version of the class **being constructed**, not the most derived override, because the derived part does not exist yet. The same applies in destructors. Avoid virtual calls there.
:::

:::qa What happens if a constructor throws? {level=hard}
The object is never considered constructed, so its destructor is **not** called. But fully constructed members and bases are destroyed. So hold resources in RAII members (`unique_ptr`, `vector`) and nothing leaks; raw `new` in a constructor body can leak.
:::

:::qa What is a private constructor useful for? {level=medium}
It stops outside code from creating objects: used for the Singleton, for factories (`static create()`), and for classes made only of static members. Together with `= delete` for copy it controls how objects come to be.
:::

:::qa What does `= default` and `= delete` do? {level=easy}
`= default` asks the compiler to generate the special function. `= delete` forbids it: calling it is a compile error. Delete copying for unique-ownership types, and delete unwanted overloads (`void f(double) = delete;`).
:::

## Destructors

:::qa What is a destructor for? {level=easy}
To release what the object owns (memory, files, locks, sockets) at the end of its life. This automatic clean-up is **RAII**: acquire in the constructor, release in the destructor.
:::

:::qa When must a destructor be virtual? {level=easy}
When the class is meant to be used polymorphically, that is, you may `delete` a derived object through a base pointer. Without `virtual ~Base()`, only the base destructor runs: the derived part leaks and the behaviour is undefined.
:::

:::qa Should every class have a virtual destructor? {level=medium}
No. Only base classes designed for polymorphic deletion need it. It adds a vtable pointer to every object. A common rule: if a class has virtual functions, give it a virtual (or protected non-virtual) destructor. Value-like classes do not need one.
:::

:::qa Can a destructor throw? {level=hard}
It can, but it should not. Destructors are `noexcept` by default; if one throws while another exception is already unwinding the stack, `std::terminate` is called. Catch inside the destructor and log or swallow.
:::

:::qa Can a destructor be pure virtual? {level=hard}
Yes, to make a class abstract when it has no other pure functions: `virtual ~Base() = 0;`. But it **must still have a definition** (`Base::~Base() {}`), because derived destructors call it.
:::

:::qa What is the Rule of Zero? {level=medium}
If your class owns no raw resources (it uses `string`, `vector`, `unique_ptr` and so on), write **none** of the destructor, copy or move functions. The compiler-generated ones are correct. This is the preferred design.
:::

:::qa What is the Rule of Three? {level=medium}
If a class needs a custom destructor, copy constructor **or** copy assignment operator, it almost certainly needs all three, because it manages a resource by hand. Otherwise copies share the resource (double free).
:::

:::qa What is the Rule of Five? {level=medium}
In modern C++ add the **move constructor** and **move assignment** to the Rule of Three. Declaring any of the five stops the compiler from generating the move operations, so be explicit with `= default` or `= delete` for the ones you do not customise.
:::

:::qa How do you make a class non-copyable but movable? {level=medium}
```cpp
class Handle {
public:
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&&) noexcept = default;
    Handle& operator=(Handle&&) noexcept = default;
};
```
`unique_ptr` and `std::thread` work like this.
:::

:::qa How do you make a class that can only be created on the heap? Only on the stack? {level=hard}
**Heap only:** make the destructor `private`/`protected` and offer a `static` factory that does `new`, plus a `destroy()` method. **Stack only:** `delete` `operator new` (`static void* operator new(size_t) = delete;`).
:::

:::qa Implement a Singleton in C++. What are its drawbacks? {level=medium}
```cpp
class Config {
    Config() = default;
public:
    static Config& instance() { static Config c; return c; }   // thread-safe since C++11
    Config(const Config&) = delete;
    Config& operator=(const Config&) = delete;
};
```
Drawbacks: hidden global state, hard to test, tight coupling, lifetime order problems at exit. Prefer passing the dependency in. (See the creational patterns module for details.)
:::

```quiz
? A base class has a non-virtual destructor and you delete a Derived through a Base*. What happens?
- Derived destructor then Base destructor
+ Undefined behaviour; typically only the Base destructor runs
- Compile error
> Make the base destructor virtual.
? Members a_ then b_ are declared in that order, but the initialiser list says b_(1), a_(b_). What happens?
- b_ is initialised first
+ a_ is initialised first, reading an uninitialised b_
- Compile error always
> Initialisation follows declaration order.
```

:::keypoints
- Initialiser lists; members initialise in declaration order; destruction is the reverse.
- Virtual destructor for polymorphic bases; never throw out of a destructor.
- Rule of 0 (best), 3, 5; `= default` and `= delete` express intent.
:::
