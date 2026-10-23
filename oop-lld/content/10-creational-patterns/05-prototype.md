---
title: Prototype
level: intermediate
time: 30
summary: Creating new objects by copying existing ones through a clone interface, why you cannot use the copy constructor through a base pointer, the clone idiom with covariant returns, a prototype registry, deep versus shallow copies, and a CRTP helper that removes the boilerplate.
---

:::def Prototype
Specify the kinds of objects to create using a **prototypical instance**, and create new objects by **copying** this prototype.
:::

When is that useful?

- Creating an object is **expensive** (loading data, computing), and copies of a configured object are cheap.
- You want to copy an object **when you only know its base type** (`Shape*`).
- You want to avoid a parallel hierarchy of factories; you just keep a set of ready-made **prototypes** and clone them.

## The problem: copying through a base pointer

```cpp title="Display only: this does not work"
Shape* copy = new Shape(*original);    // original is really a Circle: error, Shape is abstract
                                       // even if it compiled, it would SLICE the Circle into a Shape
```

C++ constructors cannot be virtual. The copy constructor needs the **exact** type at compile time. The solution is a **virtual `clone()`** function: each class knows its own type and copies itself.

## The clone idiom

```cpp run title="clone(): a virtual copy constructor"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Shape {
public:
    virtual ~Shape() = default;
    virtual unique_ptr<Shape> clone() const = 0;          // the "virtual copy constructor"
    virtual string describe() const = 0;
    virtual void scale(double k) = 0;
};

class Circle : public Shape {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    unique_ptr<Shape> clone() const override { return make_unique<Circle>(*this); }     // uses the real copy constructor
    string describe() const override { return "Circle r=" + to_string(r_); }
    void scale(double k) override { r_ *= k; }
};
class Rectangle : public Shape {
    double w_, h_;
public:
    Rectangle(double w, double h) : w_(w), h_(h) {}
    unique_ptr<Shape> clone() const override { return make_unique<Rectangle>(*this); }
    string describe() const override { return "Rect " + to_string(w_) + "x" + to_string(h_); }
    void scale(double k) override { w_ *= k; h_ *= k; }
};

int main() {
    vector<unique_ptr<Shape>> drawing;
    drawing.push_back(make_unique<Circle>(2));
    drawing.push_back(make_unique<Rectangle>(3, 4));

    // Duplicate every shape without knowing its type
    vector<unique_ptr<Shape>> copy;
    for (const auto& s : drawing) copy.push_back(s->clone());

    copy[0]->scale(10);                                    // changes the copy only
    cout << "original: " << drawing[0]->describe() << "\n";
    cout << "copy    : " << copy[0]->describe() << "\n";
}
```

```viz algo=uml title="Prototype"
interface Shape
  + clone(): Shape
  + describe(): string
class Circle
  - r: double
  + clone(): Shape
class Rectangle
  - w: double
  - h: double
  + clone(): Shape
class ShapeRegistry
  - prototypes: map<string, Shape>
  + add(name: string, proto: Shape): void
  + create(name: string): Shape
Circle ..|> Shape
Rectangle ..|> Shape
ShapeRegistry o-- Shape
```

## A prototype registry

Keep a catalogue of preconfigured prototypes by name. "Creating" an object is cloning one of them, then tweaking.

```cpp run title="Game units spawned from prototypes"
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class Unit {
public:
    string name;
    int hp, attack;
    vector<string> abilities;
    Unit(string n, int h, int a, vector<string> ab) : name(move(n)), hp(h), attack(a), abilities(move(ab)) {}
    unique_ptr<Unit> clone() const { return make_unique<Unit>(*this); }       // deep copy: strings and vectors copy themselves
    string describe() const {
        string s = name + " hp=" + to_string(hp) + " atk=" + to_string(attack) + " [";
        for (size_t i = 0; i < abilities.size(); ++i) s += (i ? "," : "") + abilities[i];
        return s + "]";
    }
};

class UnitRegistry {
    map<string, unique_ptr<Unit>> prototypes_;
public:
    void add(const string& key, unique_ptr<Unit> proto) { prototypes_[key] = move(proto); }
    unique_ptr<Unit> spawn(const string& key) const {
        auto it = prototypes_.find(key);
        if (it == prototypes_.end()) throw invalid_argument("no prototype: " + key);
        return it->second->clone();
    }
};

int main() {
    UnitRegistry reg;                                          // expensive setup done once
    reg.add("archer", make_unique<Unit>("Archer", 50, 12, vector<string>{"shoot", "dodge"}));
    reg.add("knight", make_unique<Unit>("Knight", 120, 20, vector<string>{"charge"}));

    auto a1 = reg.spawn("archer");
    auto a2 = reg.spawn("archer");
    a2->hp = 80;                                               // customise ONE copy
    a2->abilities.push_back("volley");
    auto k = reg.spawn("knight");
    cout << a1->describe() << "\n" << a2->describe() << "\n" << k->describe() << "\n";
}
```

## Shallow vs deep copy matters

If the object holds **pointers**, the default copy copies the *pointer* (shallow): the clone and the original then share the same pointee. A correct `clone()` must produce an **independent** object (deep copy). Use members that copy themselves (`string`, `vector`, `unique_ptr` with a custom copy that clones). If a member is a `unique_ptr<Part>` you must write the copy constructor to clone it.

```cpp run title="Deep copy of an owned part"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Engine {
    int horsepower;
    explicit Engine(int hp) : horsepower(hp) {}
};
class Car {
    string model_;
    unique_ptr<Engine> engine_;
public:
    Car(string m, int hp) : model_(move(m)), engine_(make_unique<Engine>(hp)) {}
    Car(const Car& o) : model_(o.model_), engine_(make_unique<Engine>(*o.engine_)) {}     // clone the owned part: deep copy
    Car& operator=(const Car&) = delete;
    int& hp() { return engine_->horsepower; }
    string str() const { return model_ + " " + to_string(engine_->horsepower) + "hp"; }
};

int main() {
    Car a("Swift", 90);
    Car b = a;                       // deep: b has its own Engine
    b.hp() = 150;
    cout << a.str() << " | " << b.str() << "\n";
}
```

## CRTP helper: remove the clone boilerplate

Writing `clone()` in every class is repetitive. A small CRTP base writes it once.

```cpp run title="Cloneable<Derived>: clone() generated for free"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Shape {
    virtual ~Shape() = default;
    virtual unique_ptr<Shape> clone() const = 0;
    virtual string name() const = 0;
};

template <typename Derived>
struct Cloneable : Shape {                                 // implements clone() for any Derived
    unique_ptr<Shape> clone() const override { return make_unique<Derived>(static_cast<const Derived&>(*this)); }
};

struct Circle : Cloneable<Circle> { string name() const override { return "circle"; } };
struct Square : Cloneable<Square> { string name() const override { return "square"; } };

int main() {
    unique_ptr<Shape> s = make_unique<Circle>();
    unique_ptr<Shape> t = s->clone();                      // no clone() written in Circle
    cout << s->name() << " cloned as " << t->name() << "\n";
}
```

## When to use Prototype

| Use | Avoid |
|---|---|
| Object creation is costly and copies are cheap | Objects are trivial: just construct them |
| You must copy through a base pointer | Types are known at compile time: use the copy constructor |
| Configurations are chosen at run time from a catalogue | Objects hold resources that cannot be duplicated (sockets, mutexes): clone makes no sense |
| Avoid a deep hierarchy of factories | Objects have complex cyclic references (deep copy is hard) |

In modern C++, `clone()` often appears as the **clone idiom** for polymorphic copy rather than as a formally named "Prototype".

:::interview Why can't you copy a polymorphic object through a base pointer, and what do you do?
"Constructors cannot be virtual, and `Base(*ptr)` would slice or fail if Base is abstract. I add a pure virtual `clone()` to the base; each derived class overrides it to return a copy of itself, using its own copy constructor. A prototype registry stores ready-made objects and creates new ones by cloning. I make sure clone does a deep copy so clones are independent."
:::

```quiz
? Why do we need `clone()` instead of just the copy constructor?
- Because copy constructors are slow
+ Constructors cannot be virtual, so copying through a base pointer needs a virtual function
- Because clone is shorter
> Only a virtual function can dispatch to the right derived copy.
? What is the danger of a shallow clone?
- It is slower
+ The clone and the original may share pointed-to data, so changing one affects the other
- It cannot be compiled
> Clones must be independent, which requires copying owned pointees (deep copy).
? What does a prototype registry store?
- Factories
+ Pre-configured objects to clone
- Singletons
> Creating a new object means cloning one of the stored prototypes.
```

:::keypoints
- Prototype = create objects by cloning a configured instance. In C++, use a virtual `clone()` (the virtual copy constructor).
- Clone must be a deep, independent copy. A registry of prototypes avoids factory hierarchies.
- A CRTP `Cloneable<Derived>` base removes the boilerplate.
:::
