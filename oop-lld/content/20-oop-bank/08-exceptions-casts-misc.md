---
title: "OOP interview: exceptions, casts and the rest"
level: medium
time: 25
summary: Exception handling and safety guarantees, noexcept, the four casts, volatile, linkage, preprocessor, undefined behaviour examples and a few classic C++ trivia questions.
---

## Exceptions

:::qa How does exception handling work in C++? {level=easy}
`throw` raises an exception object; the runtime **unwinds the stack**, destroying locals (so RAII destructors run) until a matching `catch` is found. If none is found, `std::terminate` is called.
```cpp
try { risky(); } catch (const std::invalid_argument& e) { log(e.what()); } catch (...) { throw; }
```
:::

:::qa Why catch exceptions by const reference? {level=medium}
Catching by value **slices** derived exceptions and copies. By pointer needs manual lifetime. `catch (const E& e)` avoids slicing and copying and preserves polymorphism. Throw by value.
:::

:::qa What are the exception safety guarantees? {level=medium}
- **No-throw:** never fails (`swap`, destructors, moves).
- **Strong:** if it throws, state is unchanged (commit-or-rollback).
- **Basic:** no leaks and invariants hold, but state may change.
- **None:** anything can happen.

Copy-and-swap gives the strong guarantee.
:::

:::qa What does `noexcept` do? {level=medium}
It promises a function will not throw. If it does, `std::terminate` runs. It enables optimisations and lets containers choose move over copy. Apply it to moves, `swap` and destructors. It is a part of the function type since C++17.
:::

:::qa Should you use exceptions or error codes? {level=medium}
Exceptions for rare, exceptional failures that the immediate caller cannot handle (they keep the happy path clean). Error codes / `std::optional` / `expected`-style results for expected, frequent failures (parsing user input, "not found"). Also error codes in code that cannot use exceptions (real-time, embedded).
:::

:::qa What is stack unwinding? {level=medium}
While an exception travels up, every scope it leaves has its automatic objects destroyed in reverse order of construction. That is how locks release and memory frees without `finally`.
:::

:::qa What happens if an exception is thrown while another is being handled? {level=hard}
If it escapes a destructor during unwinding, `std::terminate` is called. That is why destructors must not throw.
:::

:::qa How do you write a custom exception class? {level=easy}
Derive from `std::exception` (or `std::runtime_error`) and override `what()`:
```cpp
struct InsufficientFunds : std::runtime_error {
    explicit InsufficientFunds(double need) : std::runtime_error("need " + std::to_string(need) + " more") {}
};
```
:::

:::qa What is `std::terminate` and `std::abort`? {level=medium}
`terminate` is called when exception handling fails (uncaught exception, throw from `noexcept`, throw in a destructor during unwinding). By default it calls `abort`, which ends the program immediately without running destructors.
:::

## Casts

:::qa What are the four C++ casts? {level=medium}
- `static_cast`: well-defined conversions (numeric, up/down a hierarchy without a check).
- `dynamic_cast`: checked down/side casts in polymorphic hierarchies.
- `const_cast`: add or remove `const`/`volatile`.
- `reinterpret_cast`: reinterpret bits (pointer to integer, unrelated pointers); dangerous.

Prefer them over C-style casts because they are searchable and say exactly what you intend.
:::

:::qa When is `const_cast` legitimate? {level=hard}
To call an old API that takes `char*` but does not modify, or to reuse the non-const overload from the const one. Modifying an object that was **originally defined `const`** through it is undefined behaviour.
:::

:::qa What is the problem with C-style casts? {level=medium}
`(T)x` silently picks the first of const_cast, static_cast, reinterpret_cast that compiles, so a harmless-looking cast may reinterpret raw bytes. Hard to grep too.
:::

:::qa What is type punning and how is it done safely? {level=hard}
Reading the bits of one type as another. `reinterpret_cast` between unrelated types violates strict aliasing (UB). Safe ways: `std::memcpy` into the other type (compilers optimise it away), or C++20 `std::bit_cast`.
:::

## Everything else

:::qa What does `volatile` mean? Is it for threads? {level=medium}
It tells the compiler a variable may change outside the program's view (memory-mapped hardware), so every read and write must really happen. It is **not** a synchronisation tool; use `std::atomic` or a mutex for threads.
:::

:::qa What is internal vs external linkage? {level=hard}
External: the name is visible to other translation units (non-static functions and global variables). Internal: only inside its file (`static` globals, functions in an anonymous namespace, `const` globals by default). Unique file-local helpers should go in an anonymous namespace.
:::

:::qa What is the static initialisation order fiasco? {level=hard}
The initialisation order of globals in **different** translation units is unspecified. A global that uses another global from a different file may see it uninitialised. Fix with a function-local static ("construct on first use"): `Config& cfg() { static Config c; return c; }`.
:::

:::qa What is the One Definition Rule? {level=medium}
Every function and variable must have exactly one definition in the program (inline functions/variables and templates may repeat if identical). Violations cause linker errors or silent undefined behaviour.
:::

:::qa What is a `union`, and what is `std::variant`? {level=medium}
A union stores one of several members in the same memory; the programmer must remember which one is active (reading the wrong one is UB). `std::variant<A, B>` is the safe version: it tracks the active type, destroys correctly and works with `std::visit`.
:::

:::qa What are bit fields? {level=hard}
`struct Flags { unsigned a : 1; unsigned b : 3; };` packs members into specific numbers of bits. Layout is implementation-defined and you cannot take their address, so use them sparingly (hardware registers, compact flags).
:::

:::qa What is `std::optional` for? {level=easy}
A value that may or may not be present, without a null pointer or a magic value: `optional<int> parse(string)`. Check with `if (r)` or `has_value()`, read with `*r`, `value()` or `value_or(default)`.
:::

:::qa What is the difference between `std::thread` `join` and `detach`? {level=medium}
`join()` waits for the thread to finish. `detach()` lets it run on its own (you lose control and it may touch destroyed objects). A joinable thread destroyed without either calls `std::terminate`. Prefer `std::jthread` (C++20), which joins automatically.
:::

:::qa What is a data race and how is it different from a race condition? {level=medium}
A **data race** is two threads accessing the same memory at once, at least one writing, without synchronisation: undefined behaviour. A **race condition** is a logic error where the outcome depends on timing, even if every access is synchronised (check-then-act bugs).
:::

```quiz
? A destructor throws while the stack is unwinding from another exception. What happens?
- Both are caught
+ std::terminate is called
- The first exception is ignored
> This is why destructors must not throw.
? Which cast performs a checked downcast in a polymorphic hierarchy?
- static_cast
+ dynamic_cast
- reinterpret_cast
> It returns nullptr (pointers) or throws bad_cast (references) when the type is wrong.
```

:::keypoints
- Throw by value, catch by const reference; RAII makes unwinding safe; destructors and moves are `noexcept`.
- Four casts, each with one purpose; `reinterpret_cast` and C-casts are last resorts.
- `volatile` is not for threads; avoid the static initialisation order fiasco with construct-on-first-use.
:::
