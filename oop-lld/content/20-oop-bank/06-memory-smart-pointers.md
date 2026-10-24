---
title: "OOP interview: memory and smart pointers"
level: medium
time: 30
summary: Simple answers on new and delete, leaks and dangling pointers, RAII, unique_ptr, shared_ptr and weak_ptr, reference cycles, custom deleters, padding, placement new, memory pools and memory bugs.
---

:::qa What is RAII? {level=easy}
**Say this:** "Resource Acquisition Is Initialisation: tie a resource's life to an object. The constructor gets it, the destructor releases it."

**In simple words:** Clean-up happens automatically, even if an error is thrown or the function returns early. `unique_ptr`, `vector`, `lock_guard` and `fstream` all work this way.
:::

:::qa What is the difference between new/delete and malloc/free? {level=easy}
**Say this:** "`new` allocates and also calls the constructor. `malloc` only gets raw bytes."

**In simple words:** `new` gives a typed pointer and throws `bad_alloc` on failure. `malloc` gives `void*` and returns `NULL` on failure. `delete` calls the destructor. `free` does not. Never mix the two families.
:::

:::qa What is a memory leak? Can RAII still leak? {level=easy}
**Say this:** "Memory that is taken but never freed. RAII prevents most leaks, but not reference cycles with `shared_ptr`."

**In simple words:** Other ways to still leak: a cache that grows without limit, and threads that are abandoned.
:::

:::qa What are the smart pointers and when do you use each? {level=easy}
**Say this:** "`unique_ptr` for one owner, `shared_ptr` for shared ownership, `weak_ptr` to watch without owning."

**In simple words:**
- **`unique_ptr<T>`:** one owner, no extra cost, can be moved. My default.
- **`shared_ptr<T>`:** several owners, with a reference count.
- **`weak_ptr<T>`:** watches a `shared_ptr` and does not keep it alive. Breaks cycles.
- A plain pointer or reference: just uses the object.
:::

:::qa Why prefer make_unique / make_shared over new? {level=medium}
**Say this:** "They are shorter, safe with errors, and `make_shared` does one allocation instead of two."

**In simple words:** An exception is when you need a custom deleter.
:::

:::qa How does shared_ptr work internally? {level=hard}
**Say this:** "It holds two pointers: one to the object and one to a control block with the counts and the deleter."

**In simple words:** Copying adds 1 to the count (safely across threads). When the count reaches zero, the object is destroyed. The count is thread-safe, but the object itself is not.
:::

:::qa What is a reference cycle with shared_ptr and how do you fix it? {level=medium}
**Say this:** "`A` holds a `shared_ptr` to `B`, and `B` holds one to `A`. Neither is ever freed. Make one side a `weak_ptr`."

**In simple words:** For example, a child's pointer to its parent should be a `weak_ptr`.
:::

:::qa Is shared_ptr thread-safe? {level=hard}
**Say this:** "The reference count is. Writing the same `shared_ptr` object from two threads, or using the object, needs your own protection."

**In simple words:** Different threads may safely copy different `shared_ptr`s that point to the same object. C++20 has `atomic<shared_ptr>` for shared writes.
:::

:::qa How do you pass smart pointers to functions? {level=medium}
**Say this:** "If the function only uses the object, pass `T&`. Use a smart pointer only to give or share ownership."

**In simple words:**
- Only uses: `T&` or `const T&`.
- Takes ownership: `unique_ptr<T>` by value (the caller writes `std::move`).
- Shares ownership: `shared_ptr<T>` by value.
- Wants to change the caller's pointer: `unique_ptr<T>&`.
:::

:::qa What is enable_shared_from_this? {level=hard}
**Say this:** "A base class that lets an object, already owned by a `shared_ptr`, safely make more `shared_ptr`s to itself."

**In simple words:** Writing `shared_ptr<T>(this)` makes a second owner group, and the object is deleted twice. Use `shared_from_this()`.
:::

:::qa What is a custom deleter and when do you need one? {level=medium}
**Say this:** "A function the smart pointer runs instead of `delete`, like `fclose` for a file."

**In simple words:** `unique_ptr<FILE, decltype(&fclose)> f(fopen(...), &fclose);`. With `unique_ptr` the deleter is part of the type. With `shared_ptr` it is hidden.
:::

:::qa What is unique_ptr<T[]> and why not unique_ptr<T> for arrays? {level=medium}
**Say this:** "`unique_ptr<T[]>` calls `delete[]`. `unique_ptr<T>` would call `delete`, which is undefined for arrays."

**In simple words:** Even better, use `std::vector` or `std::array`.
:::

:::qa What is a dangling pointer, a wild pointer and a double free? {level=easy}
**Say this:** "Dangling: points to freed memory. Wild: never set. Double free: freed twice."

**In simple words:** Set raw pointers to `nullptr` after delete, or better, do not own through raw pointers.
:::

:::qa What is the difference between sizeof and strlen, sizeof of a class? {level=easy}
**Say this:** "`sizeof` is the size of a type in bytes, found at compile time. `strlen` counts the characters of a C string at run time."

**In simple words:** `sizeof(class)` includes padding, a hidden pointer if there are virtual functions, and at least 1 byte for an empty class.
:::

:::qa What is structure padding and alignment? {level=medium}
**Say this:** "The compiler adds unused bytes so each member sits at a good address."

**In simple words:** Put the largest members first to waste less. `alignof(T)` tells the requirement.
:::

:::qa What is placement new? {level=hard}
**Say this:** "`new (address) T(args)` builds an object in memory I already have."

**In simple words:** You must call the destructor yourself (`obj->~T()`) and free the memory yourself. `vector` uses this to build elements.
:::

:::qa What is a memory pool or arena allocator and why use one? {level=hard}
**Say this:** "One big block of memory from which small objects are handed out quickly, and freed all together."

**In simple words:** It avoids the cost of many small `malloc` calls and fragmentation. In C++17: `std::pmr::monotonic_buffer_resource`.
:::

:::qa How do you detect memory bugs? {level=medium}
**Say this:** "Compile with `-fsanitize=address,undefined`, use Valgrind, turn on warnings, and write RAII code so the bugs cannot happen."

**In simple words:** AddressSanitizer finds overflows, use-after-free and leaks. UBSan finds undefined behaviour.
:::

:::qa What is the difference between std::array, C array and std::vector? {level=easy}
**Say this:** "C array: fixed size and no length information. `std::array`: fixed size, knows its size. `std::vector`: grows."

**In simple words:** `std::array` lives on the stack and is copyable. `std::vector` lives on the heap and doubles its size when full.
:::

:::qa What does it mean that a vector "invalidates iterators"? {level=medium}
**Say this:** "When a vector grows, its old memory is freed, so all old iterators, pointers and references into it are dangling."

**In simple words:** `erase` invalidates from that point on. `reserve` in advance, or store indexes.
:::

:::qa What is the memory layout of an object with virtual functions? {level=hard}
**Say this:** "`[vptr][base members][child members]`, with padding."

**In simple words:** A class with a virtual function costs one pointer in each object, and one vtable for each class.
:::

```quiz
? Two shared_ptrs point at each other. What happens at program end?
- Both are destroyed normally
+ Neither is destroyed (a leak), because their counts never reach zero
- A crash
> Break the cycle with weak_ptr.
? Best way to give exclusive ownership to a function?
- Pass a raw pointer
+ Pass unique_ptr<T> by value and use std::move
- Pass shared_ptr by reference
> The type shows the hand-over.
```

:::keypoints
- RAII everywhere. `unique_ptr` by default, `shared_ptr` only for shared life, `weak_ptr` for cycles and watching.
- Pass references to use an object. Pass smart pointers only to give or share ownership.
- Know padding, placement new, pools and sanitizers.
:::
