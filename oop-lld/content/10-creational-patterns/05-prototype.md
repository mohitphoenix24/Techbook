---
title: Prototype
level: intermediate
time: 30
summary: Make new objects by copying an existing one. See why copying through a base pointer is a problem, the clone() solution, a prototype catalogue, deep and shallow copy, and a small helper that removes repeated code.
---

## What is Prototype?

Think of a photocopier. If you need ten copies of a form, you do not write the form ten times. You write it once and **copy** it.

:::def Prototype
Keep one ready-made object (the **prototype**). To create a new object, **copy** that one.
:::

When is this useful?

- Creating an object is **slow or costly** (loading data, heavy work), but copying a ready object is cheap.
- You have only a **base pointer** (like `Shape*`) and you want a copy of the real object behind it.
- You want to avoid many factory classes. Instead, you keep a set of ready-made objects and copy them.

## The problem: copying through a base pointer

```cpp title="Display only: this does not work"
Shape* copy = new Shape(*original);    // original is really a Circle: error, Shape is abstract
                                       // even if it compiled, it would SLICE the Circle into a Shape
```

Why does this not work? In C++, a constructor cannot be `virtual`, and the copy constructor must know the **exact type** while compiling. But with a `Shape*`, we only know the type at run time. Even if it compiled, a `Circle` would be cut down to a plain `Shape` (this is called **slicing**).

The fix: add a **virtual `clone()` function**. Each class knows its own type, so each class copies itself.

## The clone idea

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

In the code, `clone()` is a virtual function. When you call it on a `Shape*`, the correct class runs, and a copy of the **real** object comes back.

## A prototype catalogue

Keep a catalogue of ready-made objects by name. To "create" a new object, **clone** one from the catalogue and change a few things.

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

## Shallow copy and deep copy

If an object holds **pointers**, the normal copy copies only the **pointer**, not the thing it points to. Then the copy and the original **share** the same data. This is a **shallow copy**, and changing one changes the other. That is usually a bug.

A good `clone()` gives an **independent** object (a **deep copy**). Use members that copy themselves, like `string` and `vector`. If a member is a `unique_ptr`, you must write the copy code yourself and clone the thing it points to.

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

## A helper to avoid repeating code

Writing `clone()` in every class is boring. A small helper base class (using the CRTP trick) can write it once.

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

:::note Advanced (optional)
CRTP means a class inherits from a template that uses the class itself as the argument: `class Circle : public Cloneable<Circle>`. It lets the base class know the exact child type at compile time. You do not need to explain this in detail in most interviews. Just say "a helper base class that writes clone() for us".
:::

## When to use it

| Use Prototype when | Do not use it when |
|---|---|
| Creating is costly and copying is cheap | Objects are simple, just create them |
| You must copy through a base pointer | You know the type at compile time, use the copy constructor |
| Settings are chosen at run time from a catalogue | The object holds things that cannot be duplicated (sockets, mutexes) |
| You want to avoid many factory classes | Objects have loops of references, so deep copy is hard |

In modern C++ you will mostly meet this as the **clone idiom**, which is "copy through a base pointer".

## Short answer to say in an interview

:::interview Why can't you copy an object through a base pointer, and what do you do?
"A constructor cannot be virtual, and copying through the base would cut off the child part. So I add a virtual clone() to the base class. Each child class returns a copy of itself. I can also keep a catalogue of ready objects and create new ones by cloning. I make sure clone() makes a deep copy, so the clone does not share data with the original."
:::

```quiz
? Why do we need clone() instead of the normal copy constructor?
- Copy constructors are slow
+ A constructor cannot be virtual, so copying through a base pointer needs a virtual function
- Clone is shorter
> Only a virtual function can run the right child's copy code.
? What is the danger of a shallow clone?
- It is slower
+ The clone and the original may share data, so a change in one shows up in the other
- It does not compile
> A clone must be independent, which needs a deep copy.
? What does a prototype catalogue store?
- Factories
+ Ready-made objects that we can clone
- Singletons
> To make a new object, clone one from the catalogue.
```

:::keypoints
- Prototype = make new objects by copying a ready one. In C++ we use a virtual `clone()`.
- A clone must be a deep, independent copy. A catalogue of prototypes can replace many factories.
- A small helper base class (CRTP) can write `clone()` once for all classes.
:::
