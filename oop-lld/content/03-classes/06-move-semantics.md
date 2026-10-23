---
title: Move semantics, the Rule of Five and the Rule of Zero
level: intermediate
time: 40
summary: Why copying is sometimes wasteful, how rvalue references and std::move let an object hand over its resources, writing the move constructor and move assignment, noexcept and vector reallocation, copy elision, and the Rule of Five and Rule of Zero.
---

Copying a large `vector<string>` copies every string, just to throw the original away a moment later. **Move semantics** (C++11) lets an object *steal* the contents of a temporary instead. A move is usually a few pointer swaps, not a full copy.

:::analogy Think of it like this
Moving house. **Copy** = buy a second identical sofa, then throw the old one away. **Move** = load the same sofa onto the truck and carry it to the new flat. When the old flat is being demolished anyway, moving is obviously better.
:::

## std::move does not move

`std::move(x)` is only a **cast**: it says "treat x as an rvalue; I am done with it". The actual stealing happens in the move constructor or move assignment that gets selected because the argument is now an rvalue.

```cpp run title="A tracer that shows copy vs move"
#include <iostream>
#include <string>
#include <utility>
#include <vector>
using namespace std;

struct Tracer {
    string name;
    explicit Tracer(string n) : name(move(n)) { cout << "  ctor " << name << "\n"; }
    Tracer(const Tracer& o) : name(o.name) { cout << "  copy " << name << "\n"; }
    Tracer(Tracer&& o) noexcept : name(move(o.name)) { cout << "  move -> " << name << "\n"; }
    Tracer& operator=(const Tracer& o) { name = o.name; cout << "  copy-assign " << name << "\n"; return *this; }
    Tracer& operator=(Tracer&& o) noexcept { name = move(o.name); cout << "  move-assign " << name << "\n"; return *this; }
};

Tracer make() { Tracer t("made"); return t; }       // no copy and no move: see "elision" below

int main() {
    Tracer a("a");
    cout << "copy:\n";    Tracer b = a;
    cout << "move:\n";    Tracer c = move(a);
    cout << "after the move, a.name is \"" << a.name << "\" (valid but unspecified)\n";
    cout << "function result:\n"; Tracer d = make();
    cout << "assign:\n";  b = c;  b = move(c);
}
```

After `move(a)`, `a` is in a **valid but unspecified** state. You may destroy it or assign to it. Do not rely on its contents.

## Writing a move constructor and move assignment

For our `Buffer` from the previous lesson, "stealing" means copying the pointer and leaving the source empty so that its destructor deletes nothing.

```cpp run title="Buffer with all five special functions"
#include <algorithm>
#include <iostream>
#include <utility>
using namespace std;

class Buffer {
    int* data_ = nullptr;
    size_t size_ = 0;
public:
    explicit Buffer(size_t n) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }

    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) {       // copy: O(n)
        copy(o.data_, o.data_ + size_, data_);
        cout << "  copied " << size_ << " ints\n";
    }
    Buffer& operator=(const Buffer& o) {
        if (this != &o) { Buffer tmp(o); swap(data_, tmp.data_); swap(size_, tmp.size_); }   // copy-and-swap
        return *this;
    }

    Buffer(Buffer&& o) noexcept : data_(exchange(o.data_, nullptr)), size_(exchange(o.size_, 0)) {   // move: O(1)
        cout << "  moved (stole the pointer)\n";
    }
    Buffer& operator=(Buffer&& o) noexcept {
        if (this != &o) {
            delete[] data_;                                  // release what we own
            data_ = exchange(o.data_, nullptr);              // take theirs, leave them empty
            size_ = exchange(o.size_, 0);
            cout << "  move-assigned\n";
        }
        return *this;
    }
    size_t size() const { return size_; }
};

Buffer makeBig() { Buffer b(1'000'000); return b; }

int main() {
    Buffer a(1'000'000);
    Buffer b = a;                 // copy
    Buffer c = move(a);           // move: instant
    cout << "a.size=" << a.size() << " c.size=" << c.size() << "\n";
    Buffer d(1);
    d = makeBig();                // move assignment from a temporary
    cout << "d.size=" << d.size() << "\n";
}
```

The key points of a good move operation:

1. Take the resources from the source (`exchange(o.data_, nullptr)` reads the old value and puts `nullptr` in its place).
2. Leave the source in a state where its destructor is safe.
3. Mark it **`noexcept`**: it cannot fail, since it only copies pointers. This matters (next section).
4. Guard against self-move in move assignment.

## noexcept matters: vector reallocation

When a `std::vector` grows, it must move its elements to the new buffer. If your move constructor might throw, `vector` cannot give its **strong exception guarantee** (if it threw halfway, the old buffer would be half-emptied). So it uses your **copy** constructor instead, unless the move is `noexcept`.

```cpp run title="A move that is not noexcept is ignored by vector"
#include <iostream>
#include <vector>
using namespace std;

struct Safe {
    Safe() = default;
    Safe(const Safe&) { ++copies; }
    Safe(Safe&&) noexcept { ++moves; }
    static inline int copies = 0, moves = 0;
};
struct Risky {
    Risky() = default;
    Risky(const Risky&) { ++copies; }
    Risky(Risky&&) { ++moves; }                // forgot noexcept
    static inline int copies = 0, moves = 0;
};

template <class T> void grow() {
    vector<T> v;
    for (int i = 0; i < 4; ++i) v.emplace_back();      // reallocations at sizes 1, 2 and 4
}

int main() {
    grow<Safe>();
    cout << "noexcept move: copies=" << Safe::copies << " moves=" << Safe::moves << "\n";
    grow<Risky>();
    cout << "plain move   : copies=" << Risky::copies << " moves=" << Risky::moves << "\n";
}
```

That one missing word silently turns every reallocation into deep copies. **Always declare move operations `noexcept`** when they cannot throw.

## Copy elision: the cheapest move is no move

When a function returns a local object by value, the compiler usually builds it directly in the caller's variable. In C++17 this is *guaranteed* when you return a **temporary** (a prvalue), and done in practice for named locals (NRVO).

```cpp run title="Returning by value is cheap"
#include <iostream>
using namespace std;

struct Big {
    Big() { cout << "  constructed\n"; }
    Big(const Big&) { cout << "  copied\n"; }
    Big(Big&&) noexcept { cout << "  moved\n"; }
};

Big fromTemporary() { return Big(); }          // guaranteed elision in C++17
Big fromLocal() { Big b; return b; }           // NRVO: almost always elided

int main() {
    cout << "temporary:\n"; Big a = fromTemporary();
    cout << "local:\n";     Big b = fromLocal();
}
```

So: **return locals by value**. Do *not* write `return std::move(local);`. It prevents elision and makes things slower (compilers warn about it).

## The Rule of Five and the Rule of Zero

:::def Rule of Five
If you declare any of: **destructor, copy constructor, copy assignment, move constructor, move assignment**, think about all five. Writing a destructor or a copy operation *suppresses* the automatic move operations, so the class silently falls back to copying. Either define all five, or `= default` / `= delete` the ones you do not want.
:::

:::def Rule of Zero
Design classes so that they need **none** of the five. Hold resources in members that manage themselves (`std::string`, `std::vector`, `std::unique_ptr`). Then the compiler-generated versions are all correct, and your class is shorter and safer. This is the best rule, and the one to aim for.
:::

```cpp run title="Rule of Zero: nothing to write"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Document {                          // no destructor, no copy, no move written
    string title_;
    vector<string> lines_;
    unique_ptr<int[]> scratch_ = make_unique<int[]>(8);
public:
    explicit Document(string t) : title_(move(t)) {}
    void add(string l) { lines_.push_back(move(l)); }
    size_t lines() const { return lines_.size(); }
    const string& title() const { return title_; }
};

int main() {
    Document a("notes");
    a.add("first"); a.add("second");
    Document b = move(a);                 // the generated move works: unique_ptr moves, vector moves
    cout << b.title() << " has " << b.lines() << " lines\n";
    // Document c = b;                    // error: unique_ptr member makes Document move-only (correctly!)
}
```

## Passing and returning: a quick guide

| Situation | Write | Why |
|---|---|---|
| Read-only big parameter | `const T&` | no copy |
| Function **keeps** a copy (a setter, a constructor) | `T x` then `member_(std::move(x))` | caller can pass an lvalue (copy) or an rvalue (move) |
| Return a local | `return local;` | elision or move happens automatically |
| Move into a container | `v.push_back(std::move(x))` or `v.emplace_back(args...)` | no copy |

```quiz
? What does std::move(x) actually do?
- Moves x's contents into a new object
+ Casts x to an rvalue reference so a move operation may be chosen
- Deletes x
> The moving is done by the move constructor or assignment that is selected afterwards.
? Why should a move constructor be noexcept?
- So that it runs faster
+ So std::vector can use it during reallocation instead of falling back to copying
- It is required by the language
> Without noexcept, vector prefers the copy constructor to keep its strong guarantee.
? What is the Rule of Zero?
- Never write constructors
+ Let member types manage resources so the class needs no destructor, copy or move operations
- Delete all special functions
> Use RAII members (string, vector, unique_ptr) and the defaults are correct.
```

:::keypoints
- A move transfers resources instead of copying them. `std::move` only casts to an rvalue.
- Write move operations as cheap pointer steals, leave the source destructible, and mark them `noexcept`.
- Return locals by value (elision). Do not `return std::move(local)`.
- Rule of Five: if you write one special function, decide about all five. Rule of Zero: avoid writing any.
:::
