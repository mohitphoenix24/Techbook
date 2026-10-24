---
title: "OOP interview: constructors and destructors"
level: medium
time: 30
summary: Simple answers on constructors, initialiser lists, the order of construction and destruction, virtual destructors, and the Rule of 0, 3 and 5.
---

## Constructors

:::qa What are the kinds of constructors in C++? {level=easy}
**Say this:** "Default, parameterised, copy, move, delegating and converting constructors."

**In simple words:** A default one has no arguments. A copy one builds from another object of the same type. A move one takes over from a temporary. A delegating one calls another constructor of the same class. The compiler may write some of them for you.
:::

:::qa When does the compiler NOT generate a default constructor? {level=easy}
**Say this:** "As soon as I write any constructor myself. I can bring it back with `T() = default;`."
:::

:::qa What is an initialiser list and why prefer it? {level=easy}
**Say this:** "`Point(int x, int y) : x_(x), y_(y) {}` sets members before the body runs. It is needed for `const` and reference members."

**In simple words:** It also avoids doing the work twice ("make empty, then assign").
:::

:::qa In what order are members initialised? {level=medium}
**Say this:** "In the order they are declared in the class, not in the order of the initialiser list."

**In simple words:** Base classes come first, then members. If one member needs another, declare them in the right order. The compiler warns with `-Wreorder`.
:::

:::qa In what order are destructors called? {level=medium}
**Say this:** "The reverse of construction: the child's body, then its members (reversed), then the base class."

**In simple words:** Local objects are also destroyed in reverse order of creation.
:::

:::qa What is a delegating constructor? {level=medium}
**Say this:** "A constructor that calls another constructor of the same class: `Account() : Account(0, "none") {}`."

**In simple words:** It avoids repeating the checks.
:::

:::qa What is the "most vexing parse"? {level=hard}
**Say this:** "`Timer t();` declares a function named `t`, not an object."

**In simple words:** Write `Timer t;` or `Timer t{};`. Brace initialisation avoids this trap.
:::

:::qa Can a constructor be virtual? Why not? {level=medium}
**Say this:** "No. A virtual call needs the object's type, and the constructor is what builds the object."

**In simple words:** For "virtual construction", use a factory or a virtual `clone()` function.
:::

:::qa What happens if you call a virtual function from a constructor? {level=hard}
**Say this:** "It calls the version of the class being built, not the child's override."

**In simple words:** The child part does not exist yet. The same is true in destructors. Avoid virtual calls there.
:::

:::qa What happens if a constructor throws? {level=hard}
**Say this:** "The object is not built, so its destructor does not run. But the members that were fully built are destroyed."

**In simple words:** So keep resources in RAII members (`unique_ptr`, `vector`). A raw `new` in the constructor body can leak.
:::

:::qa What is a private constructor useful for? {level=medium}
**Say this:** "It stops outside code from creating objects. Used for Singleton and for factories."
:::

:::qa What does = default and = delete do? {level=easy}
**Say this:** "`= default` asks the compiler to write the function. `= delete` forbids it, and using it is a compile error."

**In simple words:** Delete copying for types with one owner. Delete unwanted overloads, like `void f(double) = delete;`.
:::

## Destructors

:::qa What is a destructor for? {level=easy}
**Say this:** "To give back what the object owns, like memory, files, locks and sockets, at the end of its life."

**In simple words:** This automatic clean-up is called **RAII**: get the resource in the constructor, release it in the destructor.
:::

:::qa When must a destructor be virtual? {level=easy}
**Say this:** "When I may delete a child object through a base pointer."

**In simple words:** Without a virtual destructor, only the base destructor runs. The child part leaks, and the behaviour is undefined.
:::

:::qa Should every class have a virtual destructor? {level=medium}
**Say this:** "No. Only base classes made for use through pointers need it."

**In simple words:** It adds a hidden pointer to each object. Simple value classes do not need it.
:::

:::qa Can a destructor throw? {level=hard}
**Say this:** "It can, but it should not. If it throws while another error is already being handled, the program stops (`std::terminate`)."

**In simple words:** Catch the error inside the destructor and log it.
:::

:::qa Can a destructor be pure virtual? {level=hard}
**Say this:** "Yes, to make a class abstract. But it must still have a body."

**In simple words:** `virtual ~Base() = 0;` plus `Base::~Base() {}`, because child destructors call it.
:::

:::qa What is the Rule of Zero? {level=medium}
**Say this:** "If my class owns no raw resources, I write none of the special functions. The compiler's ones are correct."

**In simple words:** Use `string`, `vector` and `unique_ptr` as members. This is the best design.
:::

:::qa What is the Rule of Three? {level=medium}
**Say this:** "If I need a custom destructor, copy constructor or copy assignment, I probably need all three."

**In simple words:** Because the class manages a resource by hand. Otherwise copies share the resource, and it is freed twice.
:::

:::qa What is the Rule of Five? {level=medium}
**Say this:** "The Rule of Three plus the move constructor and move assignment."

**In simple words:** Writing any one of the five stops the compiler from writing the move operations. So write each of them, or mark it `= default` or `= delete`.
:::

:::qa How do you make a class non-copyable but movable? {level=medium}
**Say this:** "Delete copying, and default the moves."

```cpp
class Handle {
public:
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&&) noexcept = default;
    Handle& operator=(Handle&&) noexcept = default;
};
```
**In simple words:** `unique_ptr` and `std::thread` work like this.
:::

:::qa How do you make a class that can only be created on the heap? Only on the stack? {level=hard}
**Say this:** "Heap only: make the destructor private and give a static `create()`. Stack only: delete `operator new`."

**In simple words:** These are rare tricks. Know that they exist.
:::

:::qa Implement a Singleton in C++. What are its drawbacks? {level=medium}
**Say this:** "A private constructor, deleted copying, and a function-local static."

```cpp
class Config {
    Config() = default;
public:
    static Config& instance() { static Config c; return c; }   // thread-safe since C++11
    Config(const Config&) = delete;
    Config& operator=(const Config&) = delete;
};
```
**Drawbacks:** it is hidden global state, hard to test, tightly coupled, and has a risk with the order of destruction at exit. Prefer passing the one object in. (See the creational patterns module.)
:::

```quiz
? A base class has a non-virtual destructor and you delete a Derived through a Base*. What happens?
- The Derived destructor, then the Base destructor
+ Undefined behaviour. Usually only the Base destructor runs
- A compile error
> Make the base destructor virtual.
? Members a_ then b_ are declared in that order, but the initialiser list says b_(1), a_(b_). What happens?
- b_ is initialised first
+ a_ is initialised first, and reads an uninitialised b_
- A compile error always
> Initialisation follows the declaration order.
```

:::keypoints
- Initialiser lists. Members are built in declaration order and destroyed in the reverse order.
- Virtual destructor for classes used through base pointers. Never throw out of a destructor.
- Rule of 0 (best), 3 and 5. `= default` and `= delete` show your intention.
:::
