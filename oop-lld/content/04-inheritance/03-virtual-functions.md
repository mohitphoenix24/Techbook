---
title: Virtual functions and dynamic dispatch
level: intermediate
time: 40
summary: The most important OOP feature in C++: calling a function through a base pointer or reference and getting the derived version, static versus dynamic binding, override, polymorphic containers, and the traps (virtual calls in constructors, default arguments, slicing).
---

This lesson is the answer to "what is polymorphism in C++, show me in code".

## The problem: non-virtual functions are chosen at compile time

```cpp run title="Without virtual, the pointer's type decides"
#include <iostream>
using namespace std;

class Animal {
public:
    void speak() const { cout << "...\n"; }              // NOT virtual
};
class Dog : public Animal {
public:
    void speak() const { cout << "Woof\n"; }
};

int main() {
    Dog d;
    d.speak();                // Dog::speak : the object's type is known to be Dog

    Animal* a = &d;
    a->speak();               // Animal::speak !  The compiler only sees "Animal*"
}
```

Using a base pointer to hold different derived objects is the *whole point* of inheritance, yet here the derived behaviour is lost. This is **static binding** (early binding): the call is decided at compile time from the declared type.

## The solution: virtual

```cpp run title="With virtual, the object's real type decides"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Animal {
public:
    virtual ~Animal() = default;                         // (always, in a polymorphic base: next lesson)
    virtual void speak() const { cout << "...\n"; }       // virtual: may be overridden
};
class Dog : public Animal {
public:
    void speak() const override { cout << "Woof\n"; }
};
class Cat : public Animal {
public:
    void speak() const override { cout << "Meow\n"; }
};

void makeNoise(const Animal& a) { a.speak(); }            // works for any current or future animal

int main() {
    Dog d; Cat c; Animal generic;
    makeNoise(d);
    makeNoise(c);
    makeNoise(generic);

    vector<unique_ptr<Animal>> zoo;                      // one container, many kinds
    zoo.push_back(make_unique<Dog>());
    zoo.push_back(make_unique<Cat>());
    for (const auto& a : zoo) a->speak();
}
```

Now `a.speak()` runs **`Dog::speak` or `Cat::speak` depending on the real object**. That is **dynamic binding** (late binding, run-time polymorphism). `makeNoise` does not know about `Dog` or `Cat`; add a `Cow` next year and it works unchanged.

:::def Polymorphism
"Many forms". In C++ **run-time polymorphism** means calling a `virtual` function through a base **pointer or reference**, and the version for the object's *actual* type runs. It needs: (1) inheritance, (2) a `virtual` function, (3) a call through a pointer or reference.
:::

:::analogy Think of it like this
A TV remote with a **Power** button. You press the same button on a Sony or a Samsung TV. The button is the base-class function; each TV has its own implementation. You do not need to know which TV you hold.
:::

## override: let the compiler catch your typos

Always write `override` on functions that override. It makes the compiler check that a matching virtual function really exists in a base class.

```cpp run expect-error title="override catches a mismatched signature"
#include <iostream>
using namespace std;

class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const { return 0; }
};

class Circle : public Shape {
    double r_ = 1;
public:
    double area() override { return 3.14 * r_ * r_; }    // forgot const: this does NOT override Shape::area
};

int main() { Circle c; cout << c.area() << "\n"; }
```

Without `override`, that code would compile and silently create a **second, unrelated** function. Calls through `Shape*` would then use the wrong one, and nobody would notice. With `override` you get an error right away. A function that overrides is automatically virtual; `virtual` in the derived class is optional, `override` is not.

## How the compiler finds the right function (short version)

```viz algo=seq title="What happens at a virtual call"
participant code Caller [box]
participant ptr "Animal* a" [box]
participant obj "Dog object" [box]
participant vt "Dog's vtable" [box]
code -> ptr : a->speak()
ptr -> obj : follow the pointer to the object
obj -> vt : read the hidden vptr
vt --> code : address of Dog::speak | the vtable maps each virtual function to the right version
code -> vt : call Dog::speak
```

Each class with virtual functions has a hidden table of function pointers (the **vtable**). Each object has a hidden pointer to its class's table (the **vptr**). A virtual call is: load vptr, load function address, call. The full story is two lessons away.

## Calling the base version explicitly

```cpp run title="Extending behaviour instead of replacing it"
#include <iostream>
#include <string>
using namespace std;

class Notifier {
public:
    virtual ~Notifier() = default;
    virtual void send(const string& msg) const { cout << "log: " << msg << "\n"; }
};

class EmailNotifier : public Notifier {
public:
    void send(const string& msg) const override {
        Notifier::send(msg);                                // call the base version explicitly
        cout << "email: " << msg << "\n";
    }
};

int main() {
    const Notifier& n = EmailNotifier();
    n.send("server down");
}
```

## Traps

### Trap 1: virtual calls inside constructors and destructors

During construction of a base class the object is *only* a base object. A virtual call inside a base constructor runs the **base** version, not the derived one, because the derived part does not exist yet.

```cpp run title="Virtual functions do not dispatch to derived classes during construction"
#include <iostream>
using namespace std;

struct Base {
    Base()  { cout << "Base ctor calls: "; whoami(); }
    virtual ~Base() { cout << "Base dtor calls: "; whoami(); }
    virtual void whoami() const { cout << "Base\n"; }
};
struct Derived : Base {
    Derived() { cout << "Derived ctor calls: "; whoami(); }
    ~Derived() override { cout << "Derived dtor calls: "; whoami(); }
    void whoami() const override { cout << "Derived\n"; }
};

int main() {
    Derived d;
    cout << "complete object calls: "; d.whoami();
}
```

Rule: **never call virtual functions from constructors or destructors** expecting the derived version. If you need "post-construction" virtual behaviour, use a separate `init()` call or a factory.

### Trap 2: default arguments are NOT virtual

Default arguments are resolved **statically**, using the type of the pointer, even though the function body is chosen dynamically.

```cpp run title="Default arguments use the static type"
#include <iostream>
using namespace std;

struct Base {
    virtual ~Base() = default;
    virtual void greet(const char* who = "Base default") const { cout << "Base::greet " << who << "\n"; }
};
struct Derived : Base {
    void greet(const char* who = "Derived default") const override { cout << "Derived::greet " << who << "\n"; }
};

int main() {
    Derived d;
    Base* p = &d;
    p->greet();          // Derived's body, but Base's default argument!
    d.greet();
}
```

Avoid default arguments on virtual functions. Use overloads instead.

### Trap 3: dispatch needs a pointer or reference

Passing a derived object **by value** to a base parameter *slices* it (cuts off the derived part), and then there is nothing to dispatch to. This is covered in lesson 8.

```quiz
? What is needed for run-time polymorphism in C++?
- Only inheritance
+ A virtual function, called through a base pointer or reference
- Templates
> Inheritance, virtual functions and indirection (pointer or reference) together give dynamic dispatch.
? What does `override` do?
- Makes a function virtual
+ Asks the compiler to verify that it overrides a base virtual function, so mistakes are errors
- Makes a function faster
> It prevents silent bugs such as a missing const or a wrong parameter type.
? In a base-class constructor, a call to a virtual function runs...
- the most derived version
+ the base version
- nothing
> The derived part is not built yet, so the dynamic type is still the base.
```

:::interview What is the difference between overloading and overriding?
"Overloading: same name, different parameters, in the same scope, resolved at compile time. Overriding: a derived class gives a new body to a base-class virtual function with the same signature, resolved at run time by the object's real type. Overriding needs `virtual`; I always add `override`. **Hiding** is a third case: a derived non-virtual function with the same name hides the base one."
:::

:::keypoints
- `virtual` + base pointer/reference = the real object's function runs (dynamic binding). Without virtual, the static type decides.
- Always write `override`; the compiler then checks the match.
- Never rely on virtual dispatch inside constructors/destructors. Avoid default arguments on virtual functions.
- The mechanism is a vptr in each object pointing to the class's vtable (details in lesson 6).
:::
