---
title: "OOP interview: modern C++ (11 to 23)"
level: medium
time: 25
summary: Simple answers on what changed in C++11, 14, 17, 20 and 23 that interviewers expect you to know: move semantics, smart pointers, lambdas, structured bindings, optional and variant, string_view, concepts, ranges, coroutines and modules.
---

:::qa What are the most important features added in C++11? {level=easy}
**Say this:** "`auto`, range-for, move semantics, smart pointers, lambdas, `nullptr`, `constexpr`, `override`, `enum class`, and threads."

**In simple words:** Also: variadic templates, `unordered_*` containers, `= default` and `= delete`, brace initialisation, and `static_assert`.
:::

:::qa What was added in C++14 and C++17? {level=medium}
**Say this:** "C++14: generic lambdas, `make_unique`. C++17: structured bindings, `optional`, `variant`, `string_view`, `if constexpr`."

**In simple words:** More from C++14: return type deduction, digit separators (`1'000'000`). More from C++17: `if` with an initialiser, fold expressions, `std::filesystem`, guaranteed copy elision, `inline` variables, and deduction of template arguments (`pair p{1, 2.0};`).
:::

:::qa What are the big features of C++20? {level=medium}
**Say this:** "Concepts, ranges, coroutines, modules, and the `<=>` operator."

**In simple words:** Also: `std::span`, `std::jthread`, designated initialisers, `std::format`, `consteval`.
:::

:::qa What is new in C++23 that is worth mentioning? {level=medium}
**Say this:** "`std::expected`, `std::print`, `std::mdspan`, `std::flat_map`, deducing `this`."

**In simple words:** Also `std::generator`, `if consteval` and `std::stacktrace`.
:::

:::qa What are structured bindings? {level=easy}
**Say this:** "They unpack a pair, tuple, array or simple struct into named variables."

**In simple words:** `auto [name, age] = person;` or `for (auto& [key, value] : map)`.
:::

:::qa What is std::optional vs std::variant vs std::any? {level=medium}
**Say this:** "`optional<T>`: a T or nothing. `variant<A, B>`: exactly one of a fixed list of types. `any`: one value of any type."

**In simple words:** Prefer `variant` when you know the types. `any` checks at run time and is slower.
:::

:::qa What is std::string_view? Name the main risk. {level=medium}
**Say this:** "A non-owning look at text (pointer and length). The risk is that the text may disappear while the view still exists."

**In simple words:** A view of a temporary string, or of a string that changes or is freed, dangles.
:::

:::qa What is std::span? {level=medium}
**Say this:** "A non-owning view over a continuous block (vector, array), with its size."

**In simple words:** It replaces `(pointer, length)` pairs: `void f(std::span<const int> data)`.
:::

:::qa What is the ranges library? {level=medium}
**Say this:** "C++20 pipelines that work lazily on sequences: `v | views::filter(even) | views::transform(square)`."

**In simple words:** No temporary vectors are made between the steps. Algorithms also accept whole containers: `ranges::sort(v)`.
:::

:::qa What are coroutines in C++20? {level=hard}
**Say this:** "Functions that can pause and resume, using `co_await`, `co_yield` and `co_return`."

**In simple words:** They are the base for generators and async code. The standard gives the mechanism, and libraries give the types.
:::

:::qa What are modules? {level=hard}
**Say this:** "A C++20 replacement for header files: `import std;`."

**In simple words:** They are compiled once, with no textual include and no macro leaks, so builds are faster. Tool support is still growing.
:::

:::qa What is consteval vs constexpr? {level=hard}
**Say this:** "A `constexpr` function may run at compile time. A `consteval` function must."

**In simple words:** `constinit` makes sure a variable is set at compile time, but it can still change later.
:::

:::qa What is class template argument deduction (CTAD)? {level=medium}
**Say this:** "Since C++17 I can leave out template arguments when the compiler can work them out."

**In simple words:** `std::vector v{1, 2, 3};` is a `vector<int>`. `std::pair p{1, 2.5};` is `pair<int, double>`.
:::

:::qa What is a designated initialiser? {level=easy}
**Say this:** "C++20 lets me name the members: `Point p{.x = 1, .y = 2};`."

**In simple words:** It makes the code easier to read.
:::

:::qa What are the "attributes" you should know? {level=medium}
**Say this:** "`[[nodiscard]]`, `[[maybe_unused]]`, `[[deprecated]]`, `[[fallthrough]]`, `[[noreturn]]`."

**In simple words:** `[[nodiscard]]` warns if the result is ignored. Use it for error codes and factories.
:::

:::qa What is std::jthread and stop_token? {level=hard}
**Say this:** "A `jthread` joins automatically when it is destroyed and can be asked to stop politely with a `stop_token`."

**In simple words:** It removes two classic mistakes of `std::thread`.
:::

:::qa How do you decide which C++ standard to teach or use in a project? {level=medium}
**Say this:** "The newest one that all my compilers support. In interviews I write C++17 and mention C++20 where it helps."

**In simple words:** Say that you would first check the project's limits.
:::

```quiz
? Which type safely holds one value out of a fixed list of types?
- union
- std::any
+ std::variant
> `variant` remembers which type is active. `any` allows any type, checked at run time.
? A string_view of a temporary std::string is dangerous because...
- It is slow
+ It does not own the text, and the text may be gone
- It cannot be compared
> Keep the owner alive as long as the view.
```

:::keypoints
- C++11 changed the most. C++14 and 17 added helpers (`optional`, `variant`, `string_view`). C++20 added concepts, ranges, coroutines, modules and `<=>`.
- Views (`string_view`, `span`, ranges) do not own the data. Watch their lifetime.
- Know a one-line meaning for each new feature. Show C++17 as your base.
:::
