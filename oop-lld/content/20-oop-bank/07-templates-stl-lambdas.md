---
title: "OOP interview: templates, STL and lambdas"
level: medium
time: 30
summary: Simple answers on templates, specialisation, concepts, CRTP, STL containers and their speed, iterators, algorithms, lambdas and std::function.
---

## Templates

:::qa What is a template and how is it different from a macro? {level=easy}
**Say this:** "A template is a blueprint that the compiler fills in for each type. Unlike a macro, it is checked by the compiler and has scope."

**In simple words:** The cost: each type makes new code (code bloat), and error messages can be long.
:::

:::qa Why are template definitions usually in headers? {level=medium}
**Say this:** "The compiler needs the full body when it creates the code for a type."

**In simple words:** If the body is in a `.cpp` file, other files cannot create it, and the linker says "undefined reference".
:::

:::qa What is template specialisation? Full vs partial? {level=medium}
**Say this:** "A special version for particular types. Full: for exactly one type. Partial: for a family of types."

**In simple words:** `template<> struct Hash<string>` is full. `template<class T> struct Hash<T*>` is partial. Function templates cannot be partially specialised. Use overloading instead.
:::

:::qa What is the difference between typename and class in a template parameter? {level=easy}
**Say this:** "None in `template<class T>`. But `typename` is needed to say that a dependent name is a type."

**In simple words:** `typename T::value_type x;`
:::

:::qa What is a variadic template? {level=hard}
**Say this:** "A template with a pack of any number of parameters: `template<class... Args> void f(Args... args)`."

**In simple words:** You use the pack with `args...`. In C++17, a fold expression is the easy way: `(cout << ... << args);`. `make_unique` and `tuple` are built this way.
:::

:::qa What are C++20 concepts? {level=medium}
**Say this:** "Named conditions on template parameters, like `std::integral T`. They give clear error messages."

**In simple words:** They replace most of the old SFINAE tricks.
:::

:::qa What is SFINAE? {level=hard}
**Say this:** "Substitution Failure Is Not An Error: if filling in types makes an overload's signature invalid, that overload is quietly skipped."

**In simple words:** `enable_if` uses this. Concepts and `if constexpr` are the modern, readable replacements.
:::

:::qa What is if constexpr? {level=medium}
**Say this:** "A compile-time `if`. The branch not taken is not even compiled."

**In simple words:** One template can handle different types: `if constexpr (is_integral_v<T>) ... else ...`.
:::

:::qa What is CRTP? {level=hard}
**Say this:** "The Curiously Recurring Template Pattern: `class Derived : public Base<Derived>`. The base knows the child type at compile time."

**In simple words:** It gives polymorphism without a vtable (static polymorphism), and full inlining. Used for mix-ins and fast interfaces.
:::

:::qa What is the difference between static and dynamic polymorphism? {level=medium}
**Say this:** "Static is decided at compile time (templates, CRTP): fast but fixed. Dynamic is decided at run time (virtual): flexible but slower."

**In simple words:** Use virtual functions when you need a list of mixed types or plug-ins.
:::

:::qa What is type erasure? {level=hard}
**Say this:** "Hiding a concrete type behind one common interface, without the user inheriting."

**In simple words:** `std::function`, `std::any` and the deleter of `shared_ptr` hold any type behind a small virtual interface that is made inside.
:::

:::qa What are decltype and auto return types good for? {level=medium}
**Say this:** "`decltype(expr)` gives the exact type of an expression, so templates can work out return types."

**In simple words:** `auto add(A a, B b) -> decltype(a + b)`. In C++14, plain `auto` return deduction is enough.
:::

## STL containers and algorithms

:::qa Compare vector, list, deque, array and when to use each. {level=easy}
**Say this:** "Start with `vector`. Use others only when you measured a need."

| Container | Strong point | Weak point |
|---|---|---|
| `vector` | default choice, fast loops, fast `push_back` | inserting in the middle is slow |
| `deque` | fast at both ends | slower loops |
| `list` | fast insert and erase with an iterator | poor cache use, no random access |
| `array` | no heap, fixed size | cannot grow |
:::

:::qa map vs unordered_map: differences and complexities? {level=easy}
**Say this:** "`map` is a sorted tree, O(log n). `unordered_map` is a hash table, O(1) on average, with no order."

**In simple words:** Use `map` when you need order or ranges. Otherwise use `unordered_map`.
:::

:::qa Why does map::operator[] sometimes surprise people? {level=medium}
**Say this:** "It inserts a default value if the key is missing."

**In simple words:** So it cannot be used on a `const map`. Use `find`, `at` or `contains` just to look.
:::

:::qa What is the difference between set, multiset, map and multimap? {level=easy}
**Say this:** "`set`: unique keys. `multiset`: repeats allowed. `map`: keys with values. `multimap`: repeated keys with values."
:::

:::qa What is a priority_queue and how does it work? {level=easy}
**Say this:** "A heap on top of a vector. `top()` is the biggest item. `push` and `pop` are O(log n)."

**In simple words:** For a min-heap: `priority_queue<int, vector<int>, greater<int>>`.
:::

:::qa How does vector grow? What is reserve? {level=medium}
**Say this:** "When full, it gets a bigger block (about 1.5 or 2 times), moves the items, and frees the old block. `reserve(n)` gets space in advance."

**In simple words:** So `push_back` is O(1) on average. `reserve` stops the repeated growing and keeps iterators valid.
:::

:::qa What are the iterator categories? {level=medium}
**Say this:** "Input, output, forward, bidirectional, random access (and contiguous in C++20)."

**In simple words:** An algorithm needs a minimum category. `sort` needs random access, so it does not work on `list`.
:::

:::qa What is the erase-remove idiom? {level=medium}
**Say this:** "`remove` moves the wanted items forward and returns the new end. `erase` then cuts the tail."

**In simple words:** `v.erase(remove(v.begin(), v.end(), x), v.end());`. In C++20: `std::erase(v, x)`.
:::

:::qa What do you need to use a custom class as a key in map and unordered_map? {level=medium}
**Say this:** "`map`: a way to order (`operator<`). `unordered_map`: `operator==` and a hash."
:::

:::qa sort is not stable. What do you use when you need stability? {level=medium}
**Say this:** "`std::stable_sort`."

**In simple words:** The comparison must be a strict ordering. Using `<=` is undefined behaviour.
:::

:::qa What is the complexity of find in vector vs set? {level=easy}
**Say this:** "`find` on a vector is O(n). On a sorted vector, `binary_search` is O(log n). `set::find` is O(log n). `unordered_set::find` is O(1) on average."
:::

## Lambdas and callables

:::qa What is a lambda? Explain the capture list. {level=easy}
**Say this:** "An unnamed function written in place: `[captures](params) { body }`. The capture list says which outside variables it can use."

**In simple words:** `[=]` copies what it uses. `[&]` uses references. `[x]` copies x. `[&x]` references x. `[this]` uses the object. Prefer naming each capture.
:::

:::qa What is the danger of capturing by reference? {level=medium}
**Say this:** "If the lambda outlives the variable, the reference dangles."

**In simple words:** For example, a lambda returned from a function or stored in a thread. Capture by value for anything that escapes.
:::

:::qa Why can't a normal lambda modify a by-value capture? {level=medium}
**Say this:** "The lambda's call operator is `const` by default."

**In simple words:** Add `mutable` to change the lambda's own copy: `[n]() mutable { return ++n; }`. The original is not changed.
:::

:::qa std::function vs a lambda vs a function pointer? {level=medium}
**Say this:** "A function pointer holds only plain functions. A lambda is fast and has its own type. `std::function` holds any callable, with a small cost."

**In simple words:** Use templates or `auto` for speed. Use `std::function` to store different callbacks together.
:::

:::qa What are generic lambdas? {level=medium}
**Say this:** "Lambdas with `auto` parameters (C++14): `[](auto a, auto b) { return a + b; }`."

**In simple words:** It is a template in disguise.
:::

:::qa What is std::bind and why is it mostly replaced? {level=medium}
**Say this:** "`bind` fixes some arguments of a function. Lambdas do the same more clearly."
:::

:::qa How do you sort a vector of objects by two fields? {level=easy}
**Say this:** "Use a lambda with `tie`, which compares the fields in order."

```cpp
sort(people.begin(), people.end(), [](const Person& a, const Person& b) {
    return tie(a.age, a.name) < tie(b.age, b.name);       // tuple comparison
});
```
:::

```quiz
? Which container gives O(1) average lookup by key?
- map
+ unordered_map
- list
> It uses hashing. `map` is a tree with O(log n).
? A lambda captures a local by reference and is returned from the function. What happens when it is called?
- It works fine
+ Undefined behaviour: the reference dangles
- A compile error
> Capture by value for anything that escapes.
```

:::keypoints
- Templates: bodies in headers, specialisation, concepts replace SFINAE, CRTP is static polymorphism.
- Default to `vector`. `map` is ordered O(log n). `unordered_map` is O(1) on average. Use the erase-remove idiom.
- Lambdas: name your captures. Never let a reference capture escape. `std::function` has a cost, templates do not.
:::
