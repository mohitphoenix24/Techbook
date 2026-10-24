---
title: "OOP interview: output puzzles on classes"
level: medium
time: 35
summary: Twelve "what does this print?" puzzles on construction order, virtual calls, slicing, name hiding, default arguments, copies, moves and static members. Each has a verified run and a simple reason.
---

**How to do these puzzles:** read the code, write the output on paper, and only then press **Run** to check. The reason is written under each puzzle in simple words.

:::qa Puzzle 1: construction and destruction order {level=medium}
```cpp run title="Order of constructors and destructors"
#include <iostream>
using namespace std;
struct Part { const char* n; Part(const char* n) : n(n) { cout << "Part(" << n << ") "; } ~Part() { cout << "~Part(" << n << ") "; } };
struct Base { Part b{"base"}; Base() { cout << "Base() "; } ~Base() { cout << "~Base() "; } };
struct Derived : Base {
    Part m1{"m1"}; Part m2{"m2"};
    Derived() { cout << "Derived() "; }
    ~Derived() { cout << "~Derived() "; }
};
int main() { { Derived d; } cout << "\n"; }
```
**Why:** think of building a house. The foundation (the base class and its parts) is built first. Then the rooms (the child's members), in the order they are written in the class. Then the finishing work (the child constructor's body). Destruction goes in exactly the opposite order: the child's body, the child's members in reverse, then the base.
:::

:::qa Puzzle 2: a virtual call inside a constructor {level=hard}
```cpp run title="Virtual call during construction"
#include <iostream>
using namespace std;
struct Animal {
    Animal() { cout << "Animal ctor: "; speak(); }
    virtual void speak() const { cout << "...\n"; }
    virtual ~Animal() = default;
};
struct Dog : Animal {
    Dog() { cout << "Dog ctor: "; speak(); }
    void speak() const override { cout << "Woof\n"; }
};
int main() { Dog d; cout << "after: "; d.speak(); }
```
**Why:** while the `Animal` constructor runs, the object is only an `Animal`. The `Dog` part has not been built yet, so `Animal::speak` runs. Once the `Dog` constructor runs, the object is a `Dog`.
:::

:::qa Puzzle 3: object slicing {level=medium}
```cpp run title="Slicing"
#include <iostream>
#include <vector>
using namespace std;
struct Shape { virtual double area() const { return 0; } virtual ~Shape() = default; };
struct Square : Shape { double s; Square(double s) : s(s) {} double area() const override { return s * s; } };
double byValue(Shape sh) { return sh.area(); }
double byRef(const Shape& sh) { return sh.area(); }
int main() {
    Square sq(3);
    cout << "by value: " << byValue(sq) << "\n";
    cout << "by reference: " << byRef(sq) << "\n";
    vector<Shape> v; v.push_back(sq);
    cout << "in vector<Shape>: " << v[0].area() << "\n";
}
```
**Why:** passing a `Square` as a `Shape` **by value** copies only the `Shape` part, and the rest is cut off (sliced). A reference or pointer keeps the real object. So store `unique_ptr<Shape>` in containers.
:::

:::qa Puzzle 4: default arguments and virtual functions {level=hard}
```cpp run title="Default argument of a virtual function"
#include <iostream>
using namespace std;
struct A { virtual void show(int x = 1) const { cout << "A::show " << x << "\n"; } virtual ~A() = default; };
struct B : A { void show(int x = 2) const override { cout << "B::show " << x << "\n"; } };
int main() {
    B b; A& a = b;
    a.show();     // which function, which default?
    b.show();
}
```
**Why:** the function that runs is chosen at run time (`B::show`), but the default value is chosen at compile time from the type written in the code (`A&`, so 1). Never change defaults in an override. Better: do not use default arguments on virtual functions.
:::

:::qa Puzzle 5: name hiding {level=medium}
```cpp run title="A derived function hides base overloads"
#include <iostream>
using namespace std;
struct Base { void f(int) const { cout << "Base::f(int)\n"; } void f(double) const { cout << "Base::f(double)\n"; } };
struct Derived : Base { void f(const char*) const { cout << "Derived::f(const char*)\n"; } };
struct Fixed : Base { using Base::f; void f(const char*) const { cout << "Fixed::f(const char*)\n"; } };
int main() {
    Derived d; Fixed x;
    // d.f(1);        // error: Base::f is hidden
    d.Base::f(1);
    x.f(1); x.f(2.5); x.f("hi");
}
```
**Why:** writing any `f` in `Derived` hides **all** the `Base::f` functions, so `d.f(1)` would not compile (that line is commented out). `using Base::f;` brings them back.
:::

:::qa Puzzle 6: how many copies? {level=hard}
```cpp run title="Copy elision and moves"
#include <iostream>
using namespace std;
struct T {
    T() { cout << "ctor "; }
    T(const T&) { cout << "copy "; }
    T(T&&) noexcept { cout << "move "; }
    ~T() { cout << "dtor "; }
};
T make() { return T(); }                 // returns a prvalue
T makeNamed() { T t; return t; }         // named local
void take(T) {}
int main() {
    cout << "a: "; { T t = make(); } cout << "\n";
    cout << "b: "; { T t = makeNamed(); } cout << "\n";
    cout << "c: "; { T t; take(t); } cout << "\n";
    cout << "d: "; { T t; take(std::move(t)); } cout << "\n";
}
```
**Why:** (a) returning a temporary builds it directly in its final place (guaranteed since C++17), so there is no copy or move. (b) the compiler also skips the copy for a named local (usually, but not required). (c) `take(t)` copies into the parameter. (d) `std::move` lets the parameter be move-constructed instead.
:::

:::qa Puzzle 7: move and the moved-from object {level=medium}
```cpp run title="What is left after a move"
#include <iostream>
#include <string>
#include <vector>
using namespace std;
int main() {
    string a = "hello world, this is a long string to avoid small-string tricks";
    string b = move(a);
    cout << "a.size() after move: " << a.size() << "\n";
    cout << "b.size(): " << b.size() << "\n";
    vector<int> v{1, 2, 3};
    vector<int> w = move(v);
    cout << "v.size(): " << v.size() << ", w.size(): " << w.size() << "\n";
    a = "reusable again";
    cout << "a: " << a << "\n";
}
```
**Why:** a moved-from object is **valid but unspecified**. In practice the standard library types are left empty. You may give them a new value or destroy them safely. But do not read them as if they still held the old value.
:::

:::qa Puzzle 8: static members and counting objects {level=medium}
```cpp run title="Instance counter"
#include <iostream>
using namespace std;
class Widget {
    static inline int alive = 0;
    static inline int created = 0;
public:
    Widget() { ++alive; ++created; }
    Widget(const Widget&) { ++alive; ++created; }
    ~Widget() { --alive; }
    static void report(const char* when) { cout << when << ": alive=" << alive << " created=" << created << "\n"; }
};
Widget makeOne() { Widget w; return w; }
void byValue(Widget) {}
int main() {
    Widget a;
    Widget::report("start");
    { Widget b = a; Widget::report("inside block"); }
    Widget::report("after block");
    byValue(a);
    Widget::report("after byValue");
    Widget c = makeOne();
    Widget::report("end");
}
```
**Why:** a copy adds 1 to both counters. When a copy goes out of scope, only `alive` goes down. `byValue(a)` makes one temporary copy. `makeOne()` builds `w` directly inside `c`, so only one object is created for it.
:::

:::qa Puzzle 9: const and overload resolution {level=medium}
```cpp run title="const overloads and conversions"
#include <iostream>
#include <string>
using namespace std;
struct Buf {
    string& at() { cout << "non-const "; static string s = "x"; return s; }
    const string& at() const { cout << "const "; static string s = "y"; return s; }
};
void f(int) { cout << "f(int)\n"; }
void f(double) { cout << "f(double)\n"; }
void f(const char*) { cout << "f(const char*)\n"; }
void f(bool) { cout << "f(bool)\n"; }
int main() {
    Buf b; const Buf cb;
    cout << b.at() << "\n";
    cout << cb.at() << "\n";
    f(1); f(1.5); f(1.5f); f('a'); f("text"); f(nullptr == nullptr);
    f(static_cast<long>(3) == 3 ? 7 : 8);
}
```
**Why:** a non-const object picks the non-const function, and a const object picks the const one. For `f(1.5f)`, a float is promoted to `double`, which is better than converting to `int`. The letter `'a'` is promoted to `int`. A string literal becomes `const char*`, which is better than `bool`. A comparison gives a `bool`.
:::

:::qa Puzzle 10: Rule of Three in action {level=hard}
```cpp run title="Deep copy vs shallow copy"
#include <cstring>
#include <iostream>
using namespace std;
class Name {
    char* s_;
public:
    Name(const char* s) : s_(new char[strlen(s) + 1]) { strcpy(s_, s); cout << "make " << s_ << "\n"; }
    Name(const Name& o) : s_(new char[strlen(o.s_) + 1]) { strcpy(s_, o.s_); cout << "copy " << s_ << "\n"; }
    Name& operator=(const Name& o) {
        cout << "assign " << o.s_ << " to " << s_ << "\n";
        if (this != &o) { char* t = new char[strlen(o.s_) + 1]; strcpy(t, o.s_); delete[] s_; s_ = t; }
        return *this;
    }
    ~Name() { cout << "free " << s_ << "\n"; delete[] s_; }
    void set(char c) { s_[0] = c; }
    const char* get() const { return s_; }
};
int main() {
    Name a("alice");
    Name b = a;          // copy construction
    Name c("carol");
    c = a;               // copy assignment
    a.set('X');
    cout << a.get() << " " << b.get() << " " << c.get() << "\n";
}
```
**Why:** each object owns its own buffer, so changing `a` does not change `b` or `c`. At the end, three destructors run in reverse order of creation (`c`, `b`, `a`), and each frees its own memory. With the compiler's default copy, all three would share one buffer and free it three times.
:::

:::qa Puzzle 11: polymorphism with a vector of unique_ptr {level=easy}
```cpp run title="Dynamic dispatch through a base pointer"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;
struct Employee {
    virtual double pay() const { return 1000; }
    virtual const char* title() const { return "Employee"; }
    void print() const { cout << title() << " earns " << pay() << "\n"; }
    virtual ~Employee() = default;
};
struct Manager : Employee {
    double pay() const override { return Employee::pay() * 2 + 500; }
    const char* title() const override { return "Manager"; }
};
struct Intern : Employee {
    double pay() const override { return 300; }
};
int main() {
    vector<unique_ptr<Employee>> staff;
    staff.push_back(make_unique<Employee>());
    staff.push_back(make_unique<Manager>());
    staff.push_back(make_unique<Intern>());
    for (auto& e : staff) e->print();
}
```
**Why:** `print()` is not virtual, but it calls virtual functions through `this`. So each object shows its own `title()` and `pay()`. `Intern` changes only `pay`, so it keeps the inherited title.
:::

:::qa Puzzle 12: the diamond {level=hard}
```cpp run title="Diamond with and without virtual inheritance"
#include <iostream>
using namespace std;
struct Device { int id = 0; Device() { cout << "Device "; } };
struct Scanner : Device { Scanner() { cout << "Scanner "; } };
struct Printer : Device { Printer() { cout << "Printer "; } };
struct Copier : Scanner, Printer { Copier() { cout << "Copier\n"; } };

struct VDevice { int id = 0; VDevice() { cout << "VDevice "; } };
struct VScanner : virtual VDevice { VScanner() { cout << "VScanner "; } };
struct VPrinter : virtual VDevice { VPrinter() { cout << "VPrinter "; } };
struct VCopier : VScanner, VPrinter { VCopier() { cout << "VCopier\n"; } };

int main() {
    Copier c;
    VCopier v;
    cout << "sizeof Copier=" << sizeof(Copier) << " (two ints), sizeof VCopier=" << sizeof(VCopier) << " (hidden pointers to the shared base)\n";
    c.Scanner::id = 1; c.Printer::id = 2;
    cout << "two ids: " << c.Scanner::id << " " << c.Printer::id << ", one id: " << v.id << "\n";
}
```
**Why:** without `virtual`, `Copier` has two `Device` parts (so two `id` ints, 8 bytes), each built separately, and `c.id` would be unclear. With virtual inheritance there is only one shared `VDevice`, built once by the most derived class.
:::

```quiz
? In Puzzle 2, why does the Animal constructor not call Dog::speak?
- Dog::speak is private
+ The Dog part of the object does not exist yet, so the type is still Animal at that moment
- The compiler turns off virtual calls
> The same is true inside destructors.
```

:::keypoints
- Building: base, members (in declaration order), then the body. Destroying goes in the exact reverse.
- Virtual calls need a pointer or reference. Slicing, default arguments and name hiding all come from "decided at compile time" vs "decided at run time".
- C++17 skips the copy for returned temporaries. A moved-from object is valid but unspecified.
:::
