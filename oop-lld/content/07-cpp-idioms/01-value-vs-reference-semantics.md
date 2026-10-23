---
title: Value semantics vs reference semantics
level: intermediate
time: 30
summary: Why C++ types behave like ints by default, the aliasing bugs of reference semantics, regular types, when to share and when to copy, and how to design classes that are safe to pass around.
---

This is the deepest difference between C++ and Java/C#/Python, and a favourite "how do you think about objects" question.

- **Value semantics:** a variable *is* the object. Copying it makes an **independent** object. (`int`, `std::string`, `std::vector`, your well-designed classes.) This is the C++ default.
- **Reference semantics:** a variable *refers to* an object that may be shared. Copying the variable copies the reference, so two names see **one** object. (Java object variables, Python names, C++ raw pointers and `shared_ptr`.)

```cpp run title="Same code, two meanings"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

int main() {
    // VALUE semantics: b is an independent copy
    vector<int> a{1, 2, 3};
    vector<int> b = a;
    b.push_back(4);
    cout << "values : a.size=" << a.size() << " b.size=" << b.size() << "\n";

    // REFERENCE semantics: both names refer to ONE vector
    auto p = make_shared<vector<int>>(vector<int>{1, 2, 3});
    auto q = p;
    q->push_back(4);
    cout << "shared : p.size=" << p->size() << " q.size=" << q->size() << " (same object)\n";
}
```

## Why value semantics is the safer default

With references to shared objects, any code holding a reference can change the object, and you cannot tell from the call site.

```cpp run title="An aliasing bug"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Settings { string theme = "light"; };

int main() {
    // Reference semantics: two components share one Settings
    auto shared = make_shared<Settings>();
    auto editorSettings = shared;
    auto previewSettings = shared;
    editorSettings->theme = "dark";                       // the preview changes too!
    cout << "preview sees: " << previewSettings->theme << "\n";

    // Value semantics: each has its own copy
    Settings base;
    Settings editor = base, preview = base;
    editor.theme = "dark";
    cout << "preview sees: " << preview.theme << "\n";
}
```

Value types give you **local reasoning**: to know what a function can change, read its parameters. No spooky action at a distance. They are also automatically **thread-safe** to read when no one writes, and need no ownership decisions.

## Regular types

A **regular type** behaves like `int`: default-constructible, copyable, assignable, comparable with `==`. Containers, algorithms and `unordered_map` all work best with regular types.

```cpp run title="A regular type"
#include <compare>
#include <iostream>
#include <set>
#include <string>
#include <type_traits>
using namespace std;

struct Student {                                        // plain data, Rule of Zero: everything is generated
    string name;
    int rollNo = 0;
    auto operator<=>(const Student&) const = default;  // ==, <, etc.
    bool operator==(const Student&) const = default;
};

int main() {
    Student a{"Asha", 7}, b = a;                        // copy
    b.name = "Asha K";                                  // does not affect a
    cout << boolalpha << (a == b) << " " << (a < b) << "\n";
    set<Student> roll{b, a};                            // works with standard containers
    cout << roll.size() << " " << is_default_constructible_v<Student> << is_copy_assignable_v<Student> << "\n";
}
```

## When to use reference semantics anyway

| Use values when | Use pointers/references/shared ownership when |
|---|---|
| the object is small or cheap to copy/move | the object is large and must not be copied |
| independence is wanted | **identity** matters: it is *one particular* entity (a bank account, a connection, a window) |
| the type is a pure value (Money, Point, Date) | the object is polymorphic (needs a base pointer) |
| you want simple, thread-safe code | several parts of the system must see **the same** changes |

An important idea from domain modelling: **value objects** (`Money`, `Address`, `Seat`) are compared by content and are copyable and immutable; **entities** (`Account`, `Order`, `Customer`) have an identity (an id) and are *not* copied around. In C++, model value objects as plain value types and refer to entities by id or by pointer/reference.

## Passing around: a decision guide

```text
Is the type cheap to copy (int, double, small struct ≤ 2 words, string_view, span)?
 └─ pass by value
Do you only read it?
 └─ const T&
Do you modify the caller's object?
 └─ T&   (or return a new value instead; prefer that)
Do you keep a copy (store it in a member)?
 └─ take by value and std::move it into place
Is it polymorphic or optional?
 └─ const Base& / const Base* / unique_ptr<Base> by value to take ownership
```

```cpp run title="Sink parameter: take by value, then move"
#include <iostream>
#include <string>
#include <utility>
#include <vector>
using namespace std;

class Playlist {
    string name_;
    vector<string> songs_;
public:
    explicit Playlist(string name) : name_(move(name)) {}           // the caller's lvalue is copied once; an rvalue is moved
    void add(string song) { songs_.push_back(move(song)); }          // same pattern
    size_t size() const { return songs_.size(); }
    const string& name() const { return name_; }
};

int main() {
    string title = "Road trip";
    Playlist p(title);                       // title is copied (we still need it)
    p.add("Kun Faya Kun");                   // a temporary: moved, no extra copy
    string s = "Tum Se Hi";
    p.add(move(s));                          // we are finished with s: move it
    cout << p.name() << " has " << p.size() << " songs\n";
}
```

:::interview How is C++ different from Java regarding objects?
"In C++ objects have value semantics by default: a variable holds the object itself, copies are independent, and objects can live on the stack. In Java, object variables are references to heap objects, so assignment copies a reference. C++ gives you both models (values, and pointers/`shared_ptr` for sharing) and makes ownership explicit, which is why there is no garbage collector: lifetimes are managed through RAII."
:::

```quiz
? What does `vector<int> b = a;` do under value semantics?
- Makes b another name for a
+ Makes b an independent copy of a
- Moves a into b
> Changes to b do not affect a. (With `shared_ptr`, both names would refer to one vector.)
? Which parameter style suits a function that stores its argument in a member?
- `const T&` and copy inside
+ `T` by value, then `std::move` into the member
- `T&`
> Callers pass lvalues (copied once) or rvalues (moved), and you never copy twice.
? What distinguishes an entity from a value object?
- Entities are bigger
+ An entity has identity (an id); a value object is compared by content
- Entities are always pointers
> Two accounts with the same balance are still different accounts; two identical Money amounts are the same value.
```

:::keypoints
- C++ types are value types by default: copies are independent, so reasoning is local and thread-safety is easier.
- Use pointers/`shared_ptr` only for identity, polymorphism or genuinely shared state.
- Regular types (copy, assign, compare) work with the whole standard library; model value objects that way.
- Cheap types by value; read-only large by `const&`; sinks by value then move.
:::
