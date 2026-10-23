---
title: Multiple inheritance, the diamond and virtual inheritance
level: advanced
time: 35
summary: Deriving from more than one base, resolving ambiguity, the diamond problem and how virtual inheritance fixes it, who constructs the virtual base, the cost, and the safe patterns (interfaces and mixins).
---

C++ allows a class to have **several base classes**. Java and C# do not (for classes). It is powerful and dangerous in equal measure.

## Basics and ambiguity

```cpp run title="Two bases, one derived class"
#include <iostream>
using namespace std;

struct Flyer   { void move() const { cout << "flying\n"; }  int speed = 800; };
struct Swimmer { void move() const { cout << "swimming\n"; } int speed = 10; };

struct Duck : Flyer, Swimmer {                    // inherits from both
    void move() const {                           // resolve the clash by saying what Duck does
        Flyer::move();
        Swimmer::move();
    }
};

int main() {
    Duck d;
    // d.speed;                                   // error: ambiguous (Flyer::speed or Swimmer::speed?)
    cout << d.Flyer::speed << " " << d.Swimmer::speed << "\n";   // qualify with the base name
    d.move();
}
```

If two bases have a member with the same name, using the name unqualified is an **ambiguity error**. Qualify it, or define your own in the derived class.

## The diamond problem

The famous trap: two classes inherit from one base, and a fourth inherits from both.

```viz algo=uml title="The diamond"
class Device
  + id: int
class Scanner
class Printer
class Copier
Scanner --|> Device
Printer --|> Device
Copier --|> Scanner
Copier --|> Printer
```

By default `Copier` gets **two** separate `Device` sub-objects: one through `Scanner`, one through `Printer`.

```cpp run title="Without virtual inheritance: two copies of Device"
#include <iostream>
using namespace std;

struct Device {
    int id = 0;
    Device() { cout << "Device()\n"; }
};
struct Scanner : Device { };
struct Printer : Device { };
struct Copier : Scanner, Printer { };

int main() {
    Copier c;
    c.Scanner::id = 1;                            // one Device...
    c.Printer::id = 2;                            // ...and a different Device
    cout << c.Scanner::id << " " << c.Printer::id << "\n";
    // c.id = 5;                                  // error: ambiguous
    cout << "sizeof(Copier) = " << sizeof(Copier) << "\n";    // two ints
}
```

`Device()` printed twice, and the data exists twice. That is almost never what you want ("a copier has *one* id").

## Virtual inheritance: one shared base

Add `virtual` to the **inheritance** in the middle classes, and the diamond has a single shared `Device`.

```cpp run title="With virtual inheritance: one Device"
#include <iostream>
using namespace std;

struct Device {
    int id;
    explicit Device(int i) : id(i) { cout << "Device(" << i << ")\n"; }
};
struct Scanner : virtual Device {
    Scanner() : Device(1) { cout << "Scanner()\n"; }       // this Device(1) is IGNORED when Scanner is a base of Copier
};
struct Printer : virtual Device {
    Printer() : Device(2) { cout << "Printer()\n"; }
};
struct Copier : Scanner, Printer {
    Copier() : Device(99) { cout << "Copier()\n"; }         // the MOST DERIVED class constructs the virtual base
};

int main() {
    Copier c;
    c.id = 5;                                               // no ambiguity: there is only one
    cout << "id = " << c.id << ", Scanner view " << c.Scanner::id << ", Printer view " << c.Printer::id << "\n";
}
```

Key rules:

1. Mark the *intermediate* inheritance `virtual` (`: virtual Device`), not the final class.
2. The **most derived class** (`Copier`) is responsible for constructing the virtual base. Calls to `Device(...)` in `Scanner` and `Printer` constructors are skipped in that case. If `Device` has no default constructor, every most-derived class must call it. This is the confusing part.
3. Virtual bases are constructed **first**, before non-virtual bases.

## The cost

Virtual inheritance adds a hidden pointer (or offset) in each object to find the shared base, makes access to base members indirect, and complicates construction. Use it only when you truly need a *single shared state*.

```cpp run title="Objects get bigger with virtual bases"
#include <iostream>
using namespace std;

struct A { int a; };
struct B1 : A {};            struct C1 : B1 {};
struct B2 : virtual A {};    struct C2 : B2 {};

int main() {
    cout << "plain chain   : " << sizeof(C1) << "\n";
    cout << "virtual base  : " << sizeof(C2) << "\n";     // adds a vbase pointer
}
```

## The safe patterns

Multiple inheritance is fine, and common, when used for:

1. **Implementing several interfaces** (pure abstract classes with no data). No data means no diamond problem.
2. **Mixins**: small classes (often templates) that add one capability. Example: `class Widget : public Drawable, public Serializable`.

```cpp run title="Interface-style multiple inheritance: no problems"
#include <iostream>
#include <string>
using namespace std;

struct Drawable     { virtual ~Drawable() = default;     virtual void draw() const = 0; };
struct Serializable { virtual ~Serializable() = default; virtual string serialize() const = 0; };

class Button : public Drawable, public Serializable {
    string label_;
public:
    explicit Button(string l) : label_(move(l)) {}
    void draw() const override { cout << "[ " << label_ << " ]\n"; }
    string serialize() const override { return "Button{" + label_ + "}"; }
};

void render(const Drawable& d) { d.draw(); }
void save(const Serializable& s) { cout << "saved " << s.serialize() << "\n"; }

int main() {
    Button b("OK");
    render(b);              // used as a Drawable
    save(b);                // used as a Serializable
}
```

:::interview What is the diamond problem and how do you solve it?
"When a class inherits from two classes that share a common base, the object contains two copies of the base, giving ambiguity and duplicated state. Virtual inheritance (`class B : virtual A`) makes all paths share one base sub-object. The most derived class initialises the virtual base. It has a cost, so I prefer to avoid shared-state diamonds: use interfaces without data, or composition."
:::

```quiz
? Two bases both have `int speed`. What does `d.speed` do on the derived object?
- Picks the first base
+ Is an ambiguity compile error; qualify it: `d.Flyer::speed`
- Picks the larger value
> Name lookup finds two candidates and refuses to guess.
? Who constructs a virtual base class?
- The class that directly inherits from it
+ The most derived class
- The compiler picks any
> The most derived class's initialiser list decides, so all paths share one initialised base.
? Which multiple-inheritance use is generally safe?
- Two classes with data inheriting from a common data-heavy base
+ Implementing multiple pure-interface classes
- Virtual inheritance everywhere
> Interfaces have no data, so there is nothing to duplicate.
```

:::keypoints
- Multiple inheritance combines bases; same-named members are ambiguous until qualified.
- The diamond gives two base sub-objects; `virtual` inheritance gives one, constructed by the most derived class.
- Virtual inheritance costs size and speed; prefer data-free interfaces and composition.
:::
