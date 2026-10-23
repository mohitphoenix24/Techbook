---
title: "OOP cheat sheet"
level: easy
time: 15
summary: One page to scan on the way to the interview: the pillars, special member functions, rules of thumb for passing and returning, virtual rules, smart pointer choice, container choice and the frequent traps.
---

Print this or keep it open on your phone the day before.

## The pillars in one line each

| Pillar | One sentence | C++ tool |
|---|---|---|
| Encapsulation | Hide state, expose behaviour, protect invariants | `private`, member functions |
| Abstraction | Show what, hide how | abstract classes, interfaces |
| Inheritance | Reuse and specialise (is-a) | `: public Base` |
| Polymorphism | One call, many behaviours | `virtual`, templates, overloading |

## The special member functions

| You wrote | Compiler still generates |
|---|---|
| nothing | all six |
| any constructor | copy, move, destructor (no default constructor) |
| destructor / copy op | copy (deprecated); **no move** |
| move op | **deletes copy** |
| **Rule of 0** | own nothing raw: write none of the five |
| **Rule of 5** | own a raw resource: write destructor, copy ctor/assign, move ctor/assign |

## Passing and returning

| Situation | Choose |
|---|---|
| Read a large object | `const T&` |
| Modify caller's object | `T&` |
| Small type (int, double, pointer) | by value |
| Take ownership / store a copy | by value then `std::move` |
| Optional argument | `T*` or `std::optional<T>` |
| Return a new object | by value (never `std::move` a local) |
| Return an existing member | `const T&` |

## Virtual rules

1. Base with virtual functions gets a **virtual destructor**.
2. Always write **`override`**.
3. No virtual calls in constructors or destructors.
4. Do not give virtual functions default arguments.
5. Store polymorphic objects as `unique_ptr<Base>`, never by value (slicing).
6. `dynamic_cast` often signals a design problem.

## Smart pointer choice

| Need | Use |
|---|---|
| Exactly one owner | `unique_ptr` |
| Several owners | `shared_ptr` (use `make_shared`) |
| Observe without owning, break cycles | `weak_ptr` |
| Use but not own | `T&` or `T*` |

## Containers

| Need | Use | Cost |
|---|---|---|
| Default sequence | `vector` | push_back amortised O(1) |
| Key lookup | `unordered_map` | O(1) average |
| Sorted keys / ranges | `map`, `set` | O(log n) |
| Queue / stack | `deque`, `stack` | O(1) |
| Priority | `priority_queue` | O(log n) push/pop |
| Fixed size | `array` | no heap |

## Classic traps

| Trap | Remember |
|---|---|
| Raw owning pointer + default copy | double free |
| `delete` via base without virtual destructor | UB |
| `Base b = derived;` | slicing |
| `map[key]` on a missing key | inserts it |
| `v.size() - 1` on empty vector | wraps |
| Lambda `[&]` that escapes | dangling reference |
| `shared_ptr` cycle | leak: use `weak_ptr` |
| Threads sharing data | mutex or atomic; lock order for deadlocks |
| `return std::move(local);` | blocks elision |
| `string_view` of a temporary | dangling |

## Say these out loud in the interview

- "I would use composition here because ..."
- "This class owns nothing raw, so the Rule of Zero applies."
- "I mark the move operations `noexcept` so containers can move instead of copy."
- "I inject the dependency through the constructor so I can test it."
- "I need a virtual destructor because this is used polymorphically."

:::keypoints
- When in doubt: value semantics, RAII, `const`, `override`, `unique_ptr`.
- Explain trade-offs, not just choices.
:::
