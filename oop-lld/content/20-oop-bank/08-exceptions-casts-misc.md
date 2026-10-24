---
title: "OOP interview: exceptions, casts and the rest"
level: medium
time: 25
summary: Simple answers on exception handling and safety levels, noexcept, the four casts, volatile, linkage, the preprocessor, and classic C++ trivia.
---

## Exceptions

:::qa How does exception handling work in C++? {level=easy}
**Say this:** "`throw` raises an error object. The program leaves functions one by one (stack unwinding), destroying locals, until a matching `catch` is found."

**In simple words:** Because locals are destroyed, RAII objects clean up. If no `catch` is found, the program calls `std::terminate`.

```cpp
try { risky(); } catch (const std::invalid_argument& e) { log(e.what()); } catch (...) { throw; }
```
:::

:::qa Why catch exceptions by const reference? {level=medium}
**Say this:** "Catching by value copies and slices. A const reference avoids both."

**In simple words:** Throw by value. Catch by `const E&`.
:::

:::qa What are the exception safety guarantees? {level=medium}
**Say this:** "No-throw, strong (nothing changes if it fails), basic (no leaks, rules still hold), and none."

**In simple words:** Copy-and-swap gives the strong guarantee. `swap`, destructors and moves should be no-throw.
:::

:::qa What does noexcept do? {level=medium}
**Say this:** "It promises a function will not throw. If it does, the program stops."

**In simple words:** It lets containers choose move over copy. Use it on moves, `swap` and destructors.
:::

:::qa Should you use exceptions or error codes? {level=medium}
**Say this:** "Exceptions for rare failures that the caller cannot fix. Results (`optional`, a result type) for normal outcomes like 'not found'."

**In simple words:** Use error codes where exceptions are not allowed, like in real-time or embedded code.
:::

:::qa What is stack unwinding? {level=medium}
**Say this:** "While an error moves up, each scope it leaves has its local objects destroyed in reverse order."

**In simple words:** That is how locks are released and memory freed, without a `finally`.
:::

:::qa What happens if an exception is thrown while another is being handled? {level=hard}
**Say this:** "If it leaves a destructor during unwinding, the program calls `std::terminate`."

**In simple words:** That is why destructors must not throw.
:::

:::qa How do you write a custom exception class? {level=easy}
**Say this:** "Derive from `std::runtime_error` (or `std::exception`) and give a message."

```cpp
struct InsufficientFunds : std::runtime_error {
    explicit InsufficientFunds(double need) : std::runtime_error("need " + std::to_string(need) + " more") {}
};
```
:::

:::qa What is std::terminate and std::abort? {level=medium}
**Say this:** "`terminate` is called when error handling fails. It calls `abort`, which ends the program at once without running destructors."
:::

## Casts

:::qa What are the four C++ casts? {level=medium}
**Say this:** "`static_cast` (normal conversions), `dynamic_cast` (checked class casts), `const_cast` (add or remove const), `reinterpret_cast` (reinterpret bits)."

**In simple words:** Prefer them over C-style casts, because they are easy to search for and say exactly what you mean.
:::

:::qa When is const_cast legitimate? {level=hard}
**Say this:** "To call an old function that takes `char*` but does not change the data."

**In simple words:** Changing an object that was originally `const` is undefined behaviour.
:::

:::qa What is the problem with C-style casts? {level=medium}
**Say this:** "`(T)x` silently tries different casts until one works, so it may reinterpret raw bytes by accident."

**In simple words:** And it is hard to search for.
:::

:::qa What is type punning and how is it done safely? {level=hard}
**Say this:** "Reading the bits of one type as another. Do it with `memcpy` or C++20 `std::bit_cast`, not with `reinterpret_cast`."

**In simple words:** `reinterpret_cast` between unrelated types breaks the aliasing rules.
:::

## Everything else

:::qa What does volatile mean? Is it for threads? {level=medium}
**Say this:** "It says a value may change outside the program, so every access must happen. It is not for threads."

**In simple words:** For threads use `std::atomic` or a mutex.
:::

:::qa What is internal vs external linkage? {level=hard}
**Say this:** "External: visible to other files. Internal: only inside its own file."

**In simple words:** `static` globals and things in an anonymous namespace have internal linkage. Put file-private helpers in an anonymous namespace.
:::

:::qa What is the static initialisation order fiasco? {level=hard}
**Say this:** "The order of globals in different files is not defined. A global may use another one that is not ready yet."

**In simple words:** The fix is construct-on-first-use: `Config& cfg() { static Config c; return c; }`.
:::

:::qa What is the One Definition Rule? {level=medium}
**Say this:** "Each function and variable must be defined exactly once in the program."

**In simple words:** Inline functions and templates may repeat if they are the same.
:::

:::qa What is a union, and what is std::variant? {level=medium}
**Say this:** "A union stores one of several types in the same memory, and you must remember which. `std::variant` is the safe version that remembers."

**In simple words:** Use `std::visit` to handle each type.
:::

:::qa What are bit fields? {level=hard}
**Say this:** "`unsigned a : 1;` takes a set number of bits."

**In simple words:** The layout depends on the compiler, and you cannot take the address. Use them rarely (hardware registers, flags).
:::

:::qa What is std::optional for? {level=easy}
**Say this:** "A value that may or may not be there, without a null pointer or a magic number."

**In simple words:** `optional<int> parse(string)`. Check with `if (r)`, read with `*r`, or `r.value_or(default)`.
:::

:::qa What is the difference between std::thread join and detach? {level=medium}
**Say this:** "`join()` waits for the thread. `detach()` lets it run alone."

**In simple words:** A thread that is destroyed without either stops the program. Prefer `std::jthread` (C++20), which joins by itself.
:::

:::qa What is a data race and how is it different from a race condition? {level=medium}
**Say this:** "A data race is unprotected access to the same memory by two threads, with a write. A race condition is a logic bug that depends on timing."

**In simple words:** A data race is undefined behaviour. A race condition can exist even if every access is locked, like check-then-act.
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
> It returns nullptr (for pointers) or throws bad_cast (for references) when the type is wrong.
```

:::keypoints
- Throw by value, catch by const reference. RAII makes unwinding safe. Destructors and moves are `noexcept`.
- Four casts, each with one purpose. `reinterpret_cast` and C-casts are last resorts.
- `volatile` is not for threads. Avoid the static initialisation order problem with construct-on-first-use.
:::
