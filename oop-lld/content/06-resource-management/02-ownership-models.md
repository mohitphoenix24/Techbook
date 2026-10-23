---
title: Ownership, lifetimes and relationships
level: intermediate
time: 35
summary: Mapping UML composition, aggregation and association to C++ ownership, trees with parent back-pointers, shared_ptr cycles and how weak_ptr breaks them, observers that outlive subjects, enable_shared_from_this, and iterator invalidation.
---

In an LLD interview you draw arrows between classes: "has-a" with a filled diamond, "uses" with a plain arrow. In C++ each arrow **means something about ownership and lifetime**. This lesson connects the two.

## The three relationships and how to write them

```viz algo=uml title="UML relationships and their C++ spelling"
class Library
  - books: vector<Book>
class Book
class Member
  + borrow(b: Book*)
class Loan
  - member: Member*
  - book: Book*
class Printer
  + print(r: Report)
class Report
Library *-- Book : composition
Loan --> Member : association
Loan --> Book : association
Printer ..> Report : dependency
```

| Relationship | Meaning | Lifetime | C++ spelling |
|---|---|---|---|
| **Composition** (filled diamond) | whole **owns** the part; the part cannot exist alone | part dies with the whole | a **member by value**, `unique_ptr<T>`, or `vector<T>` |
| **Aggregation** (hollow diamond) | whole **has** parts that exist independently | parts outlive the whole | a **raw pointer / reference** or `shared_ptr<T>` to something owned elsewhere |
| **Association** (arrow) | one object **knows** another and keeps a link | independent | pointer or reference member |
| **Dependency** (dashed arrow) | one class **uses** another temporarily | only during a call | parameter, local variable, return type |
| **Inheritance** | is-a | n/a | `: public Base` |

```cpp run title="Composition vs aggregation in code"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Engine { string type = "V6"; };

struct Student {
    string name;
};

class Car {                          // COMPOSITION: the engine is created with the car and dies with it
    Engine engine_;                  // member by value
public:
    string engine() const { return engine_.type; }
};

class Course {                       // AGGREGATION: students exist independently of the course
    vector<const Student*> roster_;  // non-owning pointers
public:
    void enrol(const Student& s) { roster_.push_back(&s); }
    size_t size() const { return roster_.size(); }
};

int main() {
    Student a{"Asha"}, b{"Ravi"};    // students live on their own
    {
        Course c;
        c.enrol(a); c.enrol(b);
        cout << c.size() << " students enrolled\n";
    }                                // the course is gone; the students are still alive
    cout << a.name << " and " << b.name << " still exist\n";
    cout << Car().engine() << "\n";  // the engine died with the temporary car
}
```

The honest answer to "composition or aggregation?" is the question **"who deletes it?"**. If this object deletes it, it is composition. If someone else does, it is aggregation or association.

## Trees: children owned, parent observed

```cpp run title="A folder tree: owners point down, observers point up"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Folder {
    string name_;
    Folder* parent_;                                   // NON-owning back pointer: the parent always outlives its children
    vector<unique_ptr<Folder>> children_;              // OWNING pointers down the tree
public:
    explicit Folder(string n, Folder* parent = nullptr) : name_(move(n)), parent_(parent) {}
    ~Folder() { cout << "  delete " << name_ << "\n"; }

    Folder* addChild(const string& n) {
        children_.push_back(make_unique<Folder>(n, this));
        return children_.back().get();
    }
    string path() const { return parent_ ? parent_->path() + "/" + name_ : name_; }
};

int main() {
    Folder root("root");
    Folder* docs = root.addChild("docs");
    Folder* cv = docs->addChild("cv");
    cout << cv->path() << "\n";
}                                                        // deleting root deletes docs, which deletes cv
```

This is the standard pattern: **owning pointers go down, plain pointers go up**. No `shared_ptr` needed, no cycle possible.

## The shared_ptr cycle leak

If two objects hold `shared_ptr`s to each other, the counts never reach zero and **neither is ever deleted**.

```cpp run title="A reference cycle leaks (note: no destructor message)"
#include <iostream>
#include <memory>
using namespace std;

struct B;
struct A { shared_ptr<B> b; ~A() { cout << "  ~A\n"; } };
struct B { shared_ptr<A> a; ~B() { cout << "  ~B\n"; } };

int main() {
    {
        auto a = make_shared<A>();
        auto b = make_shared<B>();
        a->b = b;
        b->a = a;                                       // cycle: A -> B -> A
        cout << "counts: a=" << a.use_count() << " b=" << b.use_count() << "\n";
    }
    cout << "scope left: neither destructor ran, the memory leaked (the program ends without cleanup)\n";
    // This leaks on purpose. Compile with -fsanitize=address and LeakSanitizer reports it when the program exits.
}
```

Break the cycle by making one direction a `weak_ptr` (the **non-owning** side: usually the "back" or "parent" link).

```cpp run title="weak_ptr breaks the cycle"
#include <iostream>
#include <memory>
using namespace std;

struct B;
struct A { shared_ptr<B> b; ~A() { cout << "  ~A\n"; } };
struct B { weak_ptr<A> a; ~B() { cout << "  ~B\n"; } };      // back-reference does not own

int main() {
    {
        auto a = make_shared<A>();
        auto b = make_shared<B>();
        a->b = b;
        b->a = a;
        cout << "counts: a=" << a.use_count() << " b=" << b.use_count() << "\n";
    }
    cout << "both destroyed\n";
}
```

## Observers: dangling and the weak_ptr fix

A subject that stores raw pointers to its observers will call a destroyed object if an observer dies first.

```cpp run title="Safe observers with weak_ptr"
#include <algorithm>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Listener {
    string name;
    explicit Listener(string n) : name(move(n)) {}
    void onEvent(const string& e) const { cout << "  " << name << " got " << e << "\n"; }
};

class Subject {
    vector<weak_ptr<Listener>> listeners_;
public:
    void subscribe(const shared_ptr<Listener>& l) { listeners_.push_back(l); }
    void publish(const string& e) {
        listeners_.erase(remove_if(listeners_.begin(), listeners_.end(),
                                   [](const weak_ptr<Listener>& w) { return w.expired(); }), listeners_.end());   // drop dead ones
        for (auto& w : listeners_)
            if (auto l = w.lock()) l->onEvent(e);               // call only if still alive
    }
    size_t count() const { return listeners_.size(); }
};

int main() {
    Subject s;
    auto a = make_shared<Listener>("A");
    {
        auto b = make_shared<Listener>("B");
        s.subscribe(a); s.subscribe(b);
        s.publish("first");
    }                                                            // b is destroyed here
    s.publish("second");
    cout << "subscribers now: " << s.count() << "\n";
}
```

## enable_shared_from_this

Inside a member function, how do you give out a `shared_ptr` to `this`? Not by writing `shared_ptr<T>(this)` (that creates a second control block). Derive from `enable_shared_from_this`.

```cpp run title="shared_from_this"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Task : public enable_shared_from_this<Task> {
public:
    void registerWith(vector<shared_ptr<Task>>& registry) {
        registry.push_back(shared_from_this());               // shares ownership with the existing owners
    }
};

int main() {
    vector<shared_ptr<Task>> registry;
    auto t = make_shared<Task>();                              // must already be owned by a shared_ptr
    t->registerWith(registry);
    cout << "use_count = " << t.use_count() << "\n";           // t and the registry entry
}
```

## Dangling through container reallocation

A pointer or reference into a `vector` dangles when the vector reallocates:

```cpp run title="Pointers into a vector are fragile"
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    v.reserve(2);
    v.push_back(10);
    const int* first = &v[0];
    cout << "before: " << *first << ", capacity " << v.capacity() << "\n";
    v.push_back(20);
    v.push_back(30);                          // exceeds capacity: the buffer moves
    cout << "capacity now " << v.capacity() << "; 'first' points to the OLD buffer and must not be used\n";
    cout << "re-fetch: " << v[0] << "\n";     // fine
    (void)first;
}
```

Remedies: store **indices or ids** instead of pointers; use `vector<unique_ptr<T>>` (the objects do not move, only the pointers do); or use a container with stable addresses (`list`, `deque` for push at ends, `map`).

:::interview Composition vs aggregation: how do you decide in code?
"I ask who controls the lifetime. If the part is created and destroyed with the whole, and nothing else keeps it, that's composition: a member by value or `unique_ptr`. If the part has its own lifetime and the whole merely refers to it, that's aggregation or association: a reference, a raw pointer, or a `shared_ptr`/`weak_ptr` when lifetimes are shared or uncertain."
:::

```quiz
? Which smart pointer member breaks a parent/child reference cycle?
- unique_ptr on both sides
+ A weak_ptr (or raw pointer) for the non-owning direction
- shared_ptr on both sides
> One direction must not own. The back-reference is usually the weak one.
? In a folder tree, how should a child refer to its parent?
- shared_ptr<Folder>
+ A non-owning raw pointer or reference, because the parent outlives the child
- unique_ptr<Folder>
> Owning pointers go down; observing pointers go up.
? What does UML composition correspond to in C++?
- A raw pointer to an object owned elsewhere
+ A member by value or unique_ptr owned by the whole
- A friend class
> The whole controls the part's life: it is created and destroyed with it.
```

:::keypoints
- Composition = the whole owns the part (value member or `unique_ptr`). Aggregation/association = a non-owning link (reference, raw pointer, `weak_ptr`).
- Owning pointers go down a tree, non-owning pointers go up.
- `shared_ptr` cycles leak; break them with `weak_ptr`.
- Observers that may die first should be `weak_ptr`s checked with `lock()`. Do not keep pointers into a vector that may reallocate.
:::
