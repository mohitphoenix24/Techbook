---
title: Classes and objects
level: easy
time: 25
summary: Class syntax, data members and member functions, creating objects on the stack and heap, the hidden this pointer, defining members inside and outside the class, and what an object's size really is.
---

A **class** is a user-defined type that bundles **data** (members) with the **functions** (methods) that work on that data. An **object** is one concrete instance of a class, with its own copy of the data.

:::analogy Think of it like this
A class is the **architect's drawing** of a house. An object is a **house built from it**. You can build many houses from one drawing. Each has its own paint colour (data), but all follow the same rules (functions).
:::

## Your first useful class

```cpp run title="A Rectangle class"
#include <iostream>
using namespace std;

class Rectangle {
private:                                   // data members: hidden from outside
    double width_ = 1;
    double height_ = 1;
public:                                    // the interface: what outside code may use
    void set(double w, double h) { width_ = w; height_ = h; }
    double area() const { return width_ * height_; }
    double perimeter() const { return 2 * (width_ + height_); }
};

int main() {
    Rectangle r1, r2;            // two objects: each has its own width_ and height_
    r1.set(3, 4);
    r2.set(10, 2);
    cout << "r1 area " << r1.area() << ", perimeter " << r1.perimeter() << "\n";
    cout << "r2 area " << r2.area() << ", perimeter " << r2.perimeter() << "\n";
}
```

- `.` accesses a member through an object (`r1.area()`); `->` through a pointer (`p->area()` means `(*p).area()`).
- A trailing underscore (`width_`) is a common style for private members. It stops the name clashing with a parameter called `width`.
- Member functions that do not change the object are marked `const`.

## Objects can live on the stack or the heap

```cpp run title="Two ways to create an object"
#include <iostream>
#include <memory>
using namespace std;

class Dog {
    string name_;
public:
    Dog(string name) : name_(move(name)) { cout << name_ << " created\n"; }
    ~Dog() { cout << name_ << " destroyed\n"; }
    void bark() const { cout << name_ << ": woof\n"; }
};

int main() {
    Dog a("Bruno");                               // stack: destroyed automatically at }
    a.bark();

    Dog* b = new Dog("Tommy");                    // heap, raw pointer: YOU must delete
    b->bark();
    delete b;

    auto c = make_unique<Dog>("Sheru");           // heap, owned by a smart pointer: freed automatically
    c->bark();
    cout << "end of main\n";
}
```

Notice the order of "destroyed" lines. `Tommy` dies at `delete b;`. `Sheru` and `Bruno` die when `main` ends, `Sheru` first (reverse order of creation).

## The hidden `this` pointer

Every non-static member function receives a hidden first parameter: a pointer to the object it was called on, named `this`. This is how `r1.area()` and `r2.area()` use different data with the *same* code.

```cpp run title="What a member function really is"
#include <iostream>
using namespace std;

class Counter {
    int n_ = 0;
public:
    void add(int k) { n_ += k; }                  // really: add(Counter* this, int k) { this->n_ += k; }
    int get() const { return n_; }                // really: get(const Counter* this)
    Counter* self() { return this; }
};

// What the compiler effectively makes, written by hand in plain C style:
struct CounterC { int n; };
void add_c(CounterC* self, int k) { self->n += k; }

int main() {
    Counter a, b;
    a.add(5);
    b.add(7);
    cout << a.get() << " " << b.get() << "\n";
    cout << boolalpha << (a.self() == &a) << "\n";     // this == address of the object

    CounterC c{0};
    add_c(&c, 9);
    cout << c.n << "\n";
}
```

Member functions are **not stored inside each object**. There is one copy of the code, and each object has only its own data. So the size of an object is (almost) just the sum of its data members.

```cpp run title="sizeof of a class counts data, not functions"
#include <iostream>
using namespace std;

class A { int x; double y; public: int f() const { return x; } void g() {} void h() {} };
class B {};

int main() {
    cout << "sizeof(A) = " << sizeof(A) << "\n";    // int + padding + double
    cout << "sizeof(B) = " << sizeof(B) << "\n";    // empty class: 1
}
```

(Virtual functions *do* add a hidden pointer to each object. You will see that in the inheritance module.)

## Defining members outside the class

For anything longer than a line or two, declare in the class and define outside with the scope operator `::`. This is the layout you use with header and source files.

```cpp run title="Declaration inside, definition outside"
#include <iostream>
#include <string>
using namespace std;

class Student {
    string name_;
    int marks_ = 0;
public:
    Student(string name, int marks);               // declaration
    string grade() const;
    void addBonus(int b);
};

Student::Student(string name, int marks) : name_(move(name)), marks_(marks) {}   // definition

string Student::grade() const {
    if (marks_ >= 90) return "A";
    if (marks_ >= 75) return "B";
    return "C";
}

void Student::addBonus(int b) { marks_ = min(100, marks_ + b); }       // keep the invariant: marks <= 100

int main() {
    Student s("Asha", 88);
    cout << s.grade() << " ";
    s.addBonus(5);
    cout << s.grade() << "\n";
}
```

## Class diagram (UML)

Throughout the course we draw classes like this. Learn to read it now:

```viz algo=uml title="The Student class in UML"
class Student
  - name_: string
  - marks_: int
  + Student(name: string, marks: int)
  + grade(): string
  + addBonus(b: int): void
```

`-` means private, `+` public, `#` protected. The top box is the name, the middle box holds data, the bottom box holds operations.

:::warn Common mistakes
- Forgetting the semicolon after the closing brace of a class: `class A { ... };`
- Writing `Rectangle r();` to create an object. That declares a *function*. Write `Rectangle r;` or `Rectangle r{};`.
- Calling a non-const member function through a `const` object or reference.
:::

```quiz
? Where is the code of a member function stored?
- Inside every object
+ Once for the class; each call receives the object's address as `this`
- On the heap
> Only data members take space inside objects (plus a hidden pointer if there are virtual functions).
? What does `Rectangle r();` declare?
- A default-constructed Rectangle
+ A function named r that returns a Rectangle
- A compile error
> This is called the "most vexing parse". Use `Rectangle r;` or `Rectangle r{};`.
```

:::keypoints
- A class bundles data and the functions that use it; an object is one instance.
- Each object has its own data; member functions are shared and receive `this`.
- Objects can be on the stack (automatic) or on the heap (own them with a smart pointer).
- Define long members outside the class with `Class::name`. Mark non-modifying members `const`.
:::
