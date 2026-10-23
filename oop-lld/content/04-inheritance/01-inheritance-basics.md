---
title: Inheritance basics
level: easy
time: 30
summary: Deriving a class from a base class, what is and is not inherited, calling base constructors, protected access, name hiding and using, with an Employee hierarchy, and a first look at when inheritance is the right tool.
---

**Inheritance** lets a new class (the **derived** or child class) take the data and behaviour of an existing class (the **base** or parent class), and add to it or change it. It models an **is-a** relationship: a `Manager` *is an* `Employee`.

```viz algo=uml title="Employee hierarchy"
class Employee
  # name_: string
  # baseSalary_: double
  + Employee(name: string, salary: double)
  + name(): string
  + pay(): double
class Engineer
  - level_: int
  + pay(): double
class Manager
  - reports_: int
  + pay(): double
Engineer --|> Employee
Manager --|> Employee
```

The arrow with the hollow triangle means "inherits from". In UML it points **at the parent**.

## The first example

```cpp run title="Derived classes reuse and extend the base"
#include <iostream>
#include <string>
using namespace std;

class Employee {
protected:                                  // visible to derived classes, hidden from everyone else
    string name_;
    double baseSalary_;
public:
    Employee(string name, double salary) : name_(move(name)), baseSalary_(salary) {}
    string name() const { return name_; }
    double pay() const { return baseSalary_; }
};

class Engineer : public Employee {          // public inheritance: "Engineer IS-A Employee"
    int level_;
public:
    Engineer(string name, double salary, int level)
        : Employee(name, salary), level_(level) {}              // the BASE part is built first, by this call
    double pay() const { return baseSalary_ + level_ * 5000; }   // a new version for Engineer
};

class Manager : public Employee {
    int reports_;
public:
    Manager(string name, double salary, int reports)
        : Employee(move(name), salary), reports_(reports) {}
    double pay() const { return baseSalary_ + reports_ * 2000; }
};

int main() {
    Employee e("Meera", 50000);
    Engineer g("Ravi", 60000, 3);
    Manager m("Asha", 80000, 5);
    cout << e.name() << ": " << e.pay() << "\n";
    cout << g.name() << ": " << g.pay() << "\n";     // name() is inherited, pay() is Engineer's own
    cout << m.name() << ": " << m.pay() << "\n";
}
```

`Engineer` did not write `name()`. It got it for free. And it **redefined** `pay()` for its own rule. But notice something sneaky: `pay()` here is **not** `virtual`, so what the *pointer's static type* says decides which version runs. The next lesson fixes that.

## What is inherited, and what is not

| Inherited by the derived class | NOT inherited |
|---|---|
| public and protected data members and member functions (private ones exist in the object but are inaccessible) | constructors and destructors (the derived class has its own; the base ones are *called*) |
| the type relationship (Derived can be used as Base) | assignment operators (they are generated separately) |
| virtual-ness of functions | friendships |

The **object** of a derived class physically contains a base-class sub-object, followed by the derived part:

```text
 Engineer object in memory
 ┌─────────────────────────────┐
 │ Employee part               │  name_, baseSalary_
 │   (built first)             │
 ├─────────────────────────────┤
 │ Engineer part               │  level_
 └─────────────────────────────┘
```

That is why a derived pointer can be treated as a base pointer: the base part sits at the start.

## Constructing the base: initialiser list

A derived constructor **must** make the base part. If you do not mention the base in the initialiser list, the base's *default* constructor is called, and if there is none, the code does not compile.

```cpp run expect-error title="Forgetting to initialise a base with no default constructor"
#include <iostream>
using namespace std;

class Base {
public:
    explicit Base(int x) { cout << "Base " << x << "\n"; }    // no default constructor
};

class Derived : public Base {
public:
    Derived() {}                           // error: Base() does not exist, and we did not call Base(int)
};

int main() { Derived d; }
```

Fix: `Derived() : Base(42) {}`.

## protected: a door for children only

`protected` members are visible to the class and to derived classes, but not to outside code. It is a middle level, and also a **design smell** when overused: derived classes now depend on the base's data layout, which weakens encapsulation. Prefer `private` data with `protected` *functions* when children need access.

```cpp run title="protected data vs protected function"
#include <iostream>
using namespace std;

class Account {
    double balance_ = 100;                                // private: children cannot touch it
protected:
    void adjust(double delta) { balance_ += delta; }      // protected function: a controlled door
public:
    double balance() const { return balance_; }
};

class Savings : public Account {
public:
    void addInterest() { adjust(balance() * 0.05); }      // uses the door, not the data
};

int main() {
    Savings s;
    s.addInterest();
    cout << s.balance() << "\n";
}
```

## Name hiding

If a derived class declares a function with the **same name** as a base function, it **hides all** base overloads with that name, even those with different parameters. This surprises many people.

```cpp run title="A derived function hides every base overload"
#include <iostream>
using namespace std;

struct Base {
    void show(int x)    { cout << "Base::show(int " << x << ")\n"; }
    void show(double x) { cout << "Base::show(double " << x << ")\n"; }
};
struct Derived : Base {
    void show(const char* s) { cout << "Derived::show(" << s << ")\n"; }
    using Base::show;                       // bring the hidden base overloads back into view
};

int main() {
    Derived d;
    d.show("text");
    d.show(7);                              // without 'using Base::show;' this line would not compile
    d.show(2.5);
}
```

## Is-a, and when not to inherit

Inheritance is the **tightest** coupling in C++. A change to the base can break every derived class. Ask these before you inherit:

1. Is it truly *is-a*, in behaviour, not just in English? (A `Square` is a `Rectangle` in geometry, but not in code where `setWidth` and `setHeight` are independent: you will see this as the **Liskov** violation in SOLID.)
2. Can a `Derived` be used **everywhere** a `Base` is expected without surprises?
3. Do I want *polymorphism* (many kinds behind one interface), or only code reuse? For reuse alone, **composition** (a member object) is better.

```cpp run title="Composition: a Car HAS an Engine"
#include <iostream>
using namespace std;

class Engine {
public:
    void start() const { cout << "engine running\n"; }
};

class Car {
    Engine engine_;                         // has-a
public:
    void drive() const { engine_.start(); cout << "car moving\n"; }
};

int main() { Car().drive(); }
```

A `Car` is not an `Engine`, so inheriting would be wrong ("a car *is an* engine"?). This is the classic mistake to avoid.

```quiz
? What happens if a derived constructor does not mention the base in its initialiser list, and the base has no default constructor?
- The base is skipped
+ Compile error
- The base is built with zeros
> The base part must be constructed. Call a base constructor explicitly.
? A derived class declares `void show(const char*)`. The base has `show(int)`. What does `d.show(3)` do?
- Calls the base show(int)
+ Fails to compile: the derived name hides the base overloads (unless `using Base::show;`)
- Converts 3 to const char*
> Name lookup stops at the first scope that has the name.
? Which relationship fits Car and Engine?
- Car is-a Engine
+ Car has-a Engine (composition)
- Engine inherits from Car
> Use inheritance for is-a with substitutability; use members for has-a.
```

:::keypoints
- Inheritance models *is-a* and reuses base code. The derived object contains a base sub-object built first.
- Initialise the base in the derived constructor's initialiser list.
- Constructors, destructors and assignment are not inherited; same-named derived functions hide all base overloads (`using` restores them).
- Inheritance is tight coupling: prefer composition unless you need substitutability.
:::
