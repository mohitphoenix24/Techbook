---
title: "OOP interview: memory and smart pointers"
level: medium
time: 30
summary: new and delete, leaks and dangling pointers, RAII, unique_ptr, shared_ptr and weak_ptr, reference cycles, custom deleters, alignment, placement new, allocators and memory bugs.
---

:::qa What is RAII? {level=easy}
**Resource Acquisition Is Initialisation**: tie a resource's lifetime to an object's. The constructor acquires (memory, file, lock), the destructor releases, so cleanup is automatic even when exceptions are thrown or functions return early. `unique_ptr`, `vector`, `lock_guard` and `fstream` all follow it.
:::

:::qa What is the difference between `new`/`delete` and `malloc`/`free`? {level=easy}
`new` allocates **and constructs** (calls the constructor), returns a typed pointer and throws `bad_alloc` on failure. `malloc` only allocates raw bytes, returns `void*` and returns `NULL` on failure. `delete` calls the destructor then frees; `free` does not. Never mix the two families.
:::

:::qa What is a memory leak? Can RAII still leak? {level=easy}
Memory that is allocated but never freed, so it cannot be reused. RAII prevents it except for **reference cycles** with `shared_ptr`, memory held in global caches that grow forever, and resources leaked by `detach`ed or abandoned threads.
:::

:::qa What are the smart pointers and when do you use each? {level=easy}
- **`unique_ptr<T>`:** exclusive ownership, zero overhead, movable. The default choice.
- **`shared_ptr<T>`:** shared ownership with a reference count. Use when several owners truly share lifetime.
- **`weak_ptr<T>`:** non-owning observer of a `shared_ptr`; breaks cycles and checks if the object is still alive (`lock()`).
- Raw pointers/references: non-owning access.
:::

:::qa Why prefer `make_unique` / `make_shared` over `new`? {level=medium}
They are exception-safe in argument lists (`f(unique_ptr<A>(new A), g())` may leak if `g` throws between allocation and wrapping, pre-C++17), shorter, and `make_shared` makes **one** allocation for the object and the control block (faster, cache-friendlier). Exception: custom deleters, or weak_ptrs that must free memory early.
:::

:::qa How does `shared_ptr` work internally? {level=hard}
It holds two pointers: to the object and to a **control block** containing the strong count, the weak count, the deleter and the allocator. Copying increments the strong count atomically; destruction decrements, and at zero the object is destroyed (the control block lives on until the weak count is zero). The reference counting is thread-safe, but the pointed-to object is not.
:::

:::qa What is a reference cycle with `shared_ptr` and how do you fix it? {level=medium}
`A` holds a `shared_ptr<B>` and `B` holds a `shared_ptr<A>`: both counts never reach zero, so both leak. Make one direction a `weak_ptr` (the child's pointer to its parent, an observer's pointer to its subject).
:::

:::qa Is `shared_ptr` thread-safe? {level=hard}
The **control block** is: different threads may copy/destroy different `shared_ptr` instances that share ownership. But writing the *same* `shared_ptr` object from two threads, or touching the pointee, needs your own synchronisation (or `std::atomic<shared_ptr>` in C++20).
:::

:::qa How do you pass smart pointers to functions? {level=medium}
- Function only **uses** the object: pass `T&` or `const T&` (or `T*` if optional). Do not pass a smart pointer at all.
- Function **takes ownership**: pass `unique_ptr<T>` by value (caller uses `std::move`).
- Function **shares ownership**: pass `shared_ptr<T>` by value.
- Function may **reseat** the caller's pointer: pass `unique_ptr<T>&`.
:::

:::qa What is `enable_shared_from_this`? {level=hard}
A base class that lets an object that is already managed by a `shared_ptr` create more `shared_ptr`s to itself safely (`shared_from_this()`). Without it, `shared_ptr<T>(this)` creates a second control block and a double delete. Use it for async callbacks that must keep the object alive.
:::

:::qa What is a custom deleter and when do you need one? {level=medium}
A callable that the smart pointer runs instead of `delete`, such as `fclose` for a `FILE*` or a library's `release()` function: `unique_ptr<FILE, decltype(&fclose)> f(fopen(...), &fclose);`. With `shared_ptr` the deleter is type-erased, with `unique_ptr` it is part of the type.
:::

:::qa What is `unique_ptr<T[]>` and why not `unique_ptr<T>` for arrays? {level=medium}
`unique_ptr<T[]>` calls `delete[]`. `unique_ptr<T>` would call `delete` on an array (undefined behaviour). Even better: use `std::vector` or `std::array`.
:::

:::qa What is a dangling pointer, a wild pointer and a double free? {level=easy}
- **Dangling:** points to memory that was freed or went out of scope.
- **Wild:** never initialised, holds garbage.
- **Double free:** `delete`/`free` called twice on the same pointer (heap corruption).

Set raw pointers to `nullptr` after delete, or better, do not own through raw pointers.
:::

:::qa What is the difference between `sizeof` and `strlen`, `sizeof` of a class? {level=easy}
`sizeof` is a compile-time size in bytes of a type (including padding). `strlen` counts characters in a C string at run time. `sizeof(class)` includes padding for alignment, the vptr if there are virtual functions, and at least 1 byte for an empty class.
:::

:::qa What is structure padding and alignment? {level=medium}
The compiler inserts unused bytes so each member sits at an address that is a multiple of its alignment. Order members from largest to smallest to reduce padding. `alignof(T)` gives the requirement; `#pragma pack` or `[[gnu::packed]]` removes padding at a speed cost.
:::

:::qa What is placement new? {level=hard}
`new (address) T(args)` constructs an object **in memory you already have** (a buffer, a pool). You must destroy it explicitly (`obj->~T()`) and free the buffer yourself. It is how `vector` and allocators build elements.
:::

:::qa What is a memory pool or arena allocator and why use one? {level=hard}
A big block of memory from which small objects are carved cheaply, then freed all at once. It avoids per-object `malloc` cost and fragmentation, improves locality, and fits request-scoped lifetimes (game frames, parsers). In C++17: `std::pmr::monotonic_buffer_resource`.
:::

:::qa How do you detect memory bugs? {level=medium}
Compile with `-fsanitize=address,undefined` (AddressSanitizer finds overflows, use-after-free, leaks; UBSan finds UB), run Valgrind for leaks, turn on warnings (`-Wall -Wextra`), and write RAII code so the bugs cannot appear.
:::

:::qa What is the difference between `std::array`, C array and `std::vector`? {level=easy}
C array: fixed size, decays to a pointer, no bounds info. `std::array<T, N>`: fixed size, on the stack, knows its size, copyable, works with algorithms. `std::vector<T>`: dynamic size on the heap, contiguous, grows by doubling.
:::

:::qa What does it mean that a vector "invalidates iterators"? {level=medium}
When a vector reallocates (growth by `push_back`/`insert`), the old memory is freed and all iterators, pointers and references into it dangle. `erase` invalidates from the erased position on. Reserve in advance, or store indices.
:::

:::qa What is the memory layout of an object with virtual functions? {level=hard}
`[vptr][base members...][derived members...]` with padding. The vptr is usually the first 8 bytes. A class with a virtual function costs one pointer per object, and per class one vtable (plus type_info for RTTI).
:::

```quiz
? Two shared_ptrs point at each other. What happens at program end?
- Both destroyed normally
+ Neither is destroyed (a leak), since their counts never reach zero
- A crash
> Break the cycle with weak_ptr.
? Best way to hand exclusive ownership to a function?
- Pass a raw pointer
+ Pass unique_ptr<T> by value and std::move into it
- Pass shared_ptr by reference
> The type shows the transfer.
```

:::keypoints
- RAII everywhere; `unique_ptr` by default, `shared_ptr` only for shared lifetime, `weak_ptr` for cycles and observers.
- Pass references for use, smart pointers only for ownership transfer or sharing.
- Know padding, placement new, pools and sanitizers.
:::
