---
title: "OOP interview: C++ basics"
level: easy
time: 30
summary: Simple answers about references and pointers, const, static, inline, where variables live, namespaces, enums, strings, starting values, and small details interviewers like to ask.
---

## References and pointers

:::qa What is the difference between a pointer and a reference? {level=easy}
**Say this:** "A pointer can be null and can point somewhere else later. A reference must refer to an object and cannot be changed to refer to another."

| | Pointer | Reference |
|---|---|---|
| Can be null | yes | no |
| Can point elsewhere later | yes | no |
| Written as | `*p`, `p->x` | used like the object |
| Must be set at the start | no (but should) | yes |

**In simple words:** A reference is another name for an object. Use references when the object must exist. Use a pointer when "no object" is a normal case (or use `std::optional`).
:::

:::qa What is the difference between const int*, int* const and const int* const? {level=medium}
**Say this:** "Read from right to left. `const int*`: pointer to a constant int. `int* const`: constant pointer to an int. The last one: both are constant."

**In simple words:**
- `const int* p`: you cannot change `*p`, but you can point `p` elsewhere.
- `int* const p`: you can change `*p`, but `p` always points to the same place.
- `const int* const p`: you can change neither.
:::

:::qa What does const after a member function mean? {level=easy}
**Say this:** "`int get() const;` promises that the function does not change the object."

**In simple words:** Then you can call it on a `const` object. Mark every function that only reads with `const`.
:::

:::qa What is mutable? {level=medium}
**Say this:** "A `mutable` member can change even inside a `const` function."

**In simple words:** Use it for things that are not part of the real state: caches, mutexes, counters.
:::

:::qa Pass by value, by reference, by const reference, by pointer: when do you use each? {level=easy}
**Say this:** "`const T&` to read anything big. `T&` to change the caller's object. By value for small types, or when I need my own copy. A pointer when null is meaningful."

**In simple words:** Also: to take ownership of something, pass by value and `std::move` it in.
:::

:::qa What is a dangling reference or pointer? Give an example. {level=medium}
**Say this:** "One that refers to an object that no longer exists."

**In simple words:** Examples: returning a reference to a local variable, keeping a pointer into a `vector` after it grows, or a `string_view` of a temporary string. Using it is undefined behaviour.
:::

:::qa What is the difference between NULL, 0 and nullptr? {level=easy}
**Say this:** "`NULL` is a macro for 0. `nullptr` has its own type and is safe. Always use `nullptr`."

**In simple words:** With `NULL`, a call `f(NULL)` may pick `f(int)` instead of `f(char*)`. `nullptr` never turns into an integer.
:::

:::qa What is the difference between stack and heap memory? {level=easy}
**Say this:** "The stack holds local variables and is automatic and fast. The heap is for objects with a size or life that is decided while running, and must be released."

**In simple words:** The stack is small (a few MB) and cleans itself when a scope ends. The heap (`new`, `make_unique`) is flexible but slower. Prefer the stack. Use smart pointers for the heap.
:::

:::qa What are the storage durations in C++? {level=medium}
**Say this:** "Automatic (locals), static (globals and static locals), dynamic (`new`) and thread (`thread_local`)."

**In simple words:** How long a variable lives: until the scope ends, until the program ends, until you delete it, or until the thread ends.
:::

## Keywords and declarations

:::qa What does static mean in C++? It has several uses. {level=medium}
**Say this:** "A static local keeps its value between calls. A static member is shared by all objects. A static global is private to its file."

**In simple words:** Four uses: (1) a local variable that keeps its value, (2) a class member shared by all objects, (3) a file-private function or variable, (4) a member function without `this`.
:::

:::qa What does inline really mean today? {level=medium}
**Say this:** "It mostly allows the same definition in many files. It does not force the compiler to expand the code."

**In simple words:** That is why functions in header files are `inline`. The compiler decides by itself whether to really inline them.
:::

:::qa What is constexpr? How is it different from const? {level=medium}
**Say this:** "`const` means 'cannot change after it is set'. `constexpr` means 'can be calculated at compile time'."

**In simple words:** Use `constexpr` for array sizes and template arguments. A `constexpr` function can also run at run time.
:::

:::qa What is auto and when should you use it? {level=easy}
**Say this:** "`auto` lets the compiler work out the type from the value. Use it when the type is long or obvious."

**In simple words:** Good: iterators, `make_unique`, lambdas. Not good: hiding a type that the reader needs to know. `auto` drops `const` and `&`, so write `const auto&` when you mean it.
:::

:::qa What is explicit for? {level=medium}
**Say this:** "It stops a constructor from being used for hidden conversions."

**In simple words:** Without it, `void f(Buffer b); f(10);` quietly builds a `Buffer` from 10. Mark single-argument constructors `explicit`.
:::

:::qa What is a namespace and why use one? {level=easy}
**Say this:** "A named area that prevents name clashes between libraries."

**In simple words:** Do not write `using namespace std;` in headers. It affects everyone who includes the file.
:::

:::qa What is the difference between enum and enum class? {level=easy}
**Say this:** "`enum class` is scoped and does not turn into an int by itself. Prefer it."

**In simple words:** A plain `enum` leaks its names into the surrounding scope. With `enum class` you write `Color::Red`. You can also choose the type: `enum class Level : uint8_t`.
:::

:::qa What is the difference between #define and const/constexpr? {level=easy}
**Say this:** "`#define` is plain text replacement with no type and no scope. `constexpr` is typed and safe."

**In simple words:** `#define SQ(x) x*x` breaks for `SQ(a+1)`. Use macros only for conditional compilation and include guards.
:::

:::qa What are include guards and #pragma once? {level=easy}
**Say this:** "They stop a header from being included twice in one file."

**In simple words:** Without them, a class could be defined twice. `#pragma once` does the same in one line.
:::

:::qa What is the difference between declaration and definition? {level=easy}
**Say this:** "A declaration says a name exists. A definition creates it."

**In simple words:** `int f(int);` is a declaration. The function with a body is the definition. You can declare many times, but define only once (the One Definition Rule).
:::

:::qa What is a translation unit and what does the linker do? {level=medium}
**Say this:** "A translation unit is one `.cpp` file with its includes pasted in. The linker joins all compiled files into one program."

**In simple words:** The linker reports "undefined reference" (a function is declared but never defined) or "multiple definition" errors.
:::

## Initialisation and strings

:::qa What are the different ways to initialise a variable? Which is safest? {level=medium}
**Say this:** "`int a = 5;`, `int b(5);`, and `int c{5};`. Brace initialisation is the safest because it forbids narrowing."

**In simple words:** `int x{3.5};` is an error, which saves you from silent loss. One catch: `vector<int> v{5, 1}` makes a vector with two items (5 and 1), not five copies of 1.
:::

:::qa What is the difference between std::string, const char* and std::string_view? {level=medium}
**Say this:** "`const char*` is just a pointer. `std::string` owns its text. `std::string_view` only looks at text it does not own."

**In simple words:** A `string_view` is cheap to pass, but the owner of the text must stay alive longer than the view.
:::

:::qa What is the Small String Optimisation (SSO)? {level=hard}
**Say this:** "Short strings (about 15 to 22 characters) are stored inside the string object itself, with no heap allocation."

**In simple words:** That makes short strings fast.
:::

:::qa What are uninitialised variables and why are they dangerous? {level=easy}
**Say this:** "A local `int x;` has a random value. Reading it is undefined behaviour. Always set a value: `int x{};`."

**In simple words:** Globals and statics start at zero. Locals do not.
:::

:::qa What is undefined behaviour? Give three examples. {level=medium}
**Say this:** "The standard does not say what happens. The program may crash, give wrong results, or seem fine."

**In simple words:** Examples: reading past the end of an array, using a null or dangling pointer, signed integer overflow, reading an uninitialised variable, a data race, deleting twice. The compiler may assume it never happens and optimise in surprising ways.
:::

:::qa What is the difference between ++i and i++? Which is faster? {level=easy}
**Say this:** "`++i` adds one and gives the new value. `i++` gives the old value (a copy). Prefer `++i`."

**In simple words:** For `int` they are the same speed. For iterators and classes, `i++` makes an extra copy.
:::

:::qa What is the difference between == on const char* and on std::string? {level=easy}
**Say this:** "On `const char*` it compares addresses. On `std::string` it compares the text."

**In simple words:** Use `strcmp` for C strings.
:::

:::qa What is size_t and what is the classic pitfall with it? {level=medium}
**Say this:** "`size_t` is an unsigned type for sizes. It can never be negative, so loops like `for (size_t i = n - 1; i >= 0; --i)` never end."

**In simple words:** Also `v.size() - 1` becomes a huge number for an empty vector. Be careful when subtracting.
:::

```quiz
? Which declaration lets you change the pointed-to value but not the pointer itself?
- const int* p
+ int* const p
- const int* const p
> `int* const` is a constant pointer to an int that can change.
? What does explicit on a constructor prevent?
- Copying
+ Hidden conversions from the argument type
- Inheritance
> It stops `f(10)` from quietly creating an object.
```

:::keypoints
- References are never null. Pointers can be null and can move.
- Use `const` everywhere it fits, `constexpr` for compile time, and `explicit` for single-argument constructors.
- Know undefined behaviour, dangling references and the unsigned size trap.
:::
