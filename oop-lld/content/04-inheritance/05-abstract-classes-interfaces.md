---
title: Abstract classes and interfaces
level: intermediate
time: 35
summary: Pure virtual functions, abstract classes that cannot be instantiated, interface-style classes (C++ has no interface keyword), abstract classes with shared code, pure virtual with a body, and the Non-Virtual Interface idiom.
---

An **abstract class** defines *what* must be done without saying *how*. You cannot create an object of it. It exists to be inherited from.

## Pure virtual functions

Write `= 0` after a virtual function to make it **pure**. A class with at least one pure virtual function is **abstract**. Every concrete derived class must override *all* pure virtuals, or it is abstract too.

```cpp run title="An abstract Shape"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Shape {                                    // abstract: cannot do `Shape s;`
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;            // pure virtual: "every Shape can compute its area"
    virtual double perimeter() const = 0;
    virtual const char* name() const = 0;
    void describe() const {                      // shared, non-virtual code built on the pure ones
        cout << name() << ": area=" << area() << " perimeter=" << perimeter() << "\n";
    }
};

class Circle : public Shape {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }
    double perimeter() const override { return 2 * 3.14159 * r_; }
    const char* name() const override { return "Circle"; }
};

class Rectangle : public Shape {
    double w_, h_;
public:
    Rectangle(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
    double perimeter() const override { return 2 * (w_ + h_); }
    const char* name() const override { return "Rectangle"; }
};

int main() {
    // Shape s;                                  // error: cannot instantiate an abstract class
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(1));
    shapes.push_back(make_unique<Rectangle>(3, 4));
    double total = 0;
    for (const auto& s : shapes) { s->describe(); total += s->area(); }
    cout << "total area " << total << "\n";
}
```

Notice `describe()`: a **non-virtual function in the base that calls virtual ones**. The base provides common behaviour; the derived classes plug in the varying part. That is the **Template Method** pattern, one of the most useful in practice.

```cpp run expect-error title="A class that does not override every pure virtual stays abstract"
#include <iostream>
using namespace std;

struct Shape {
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual double perimeter() const = 0;
};
struct Square : Shape {
    double s = 2;
    double area() const override { return s * s; }       // forgot perimeter()
};

int main() {
    Square q;                                   // error: Square is still abstract
    cout << q.area() << "\n";
}
```

## Interfaces in C++

C++ has no `interface` keyword. By convention an **interface** is an abstract class that has:

- only pure virtual functions (no data members),
- a virtual destructor,
- usually named with an `I` prefix or `-able` suffix (`IPaymentMethod`, `Printable`).

```cpp run title="A class can implement several interfaces"
#include <iostream>
#include <string>
using namespace std;

struct Printable { virtual ~Printable() = default; virtual string toString() const = 0; };
struct Comparable { virtual ~Comparable() = default; virtual int compareTo(const Comparable& o) const = 0; };

class Version : public Printable, public Comparable {      // multiple inheritance of INTERFACES is safe and common
    int major_, minor_;
public:
    Version(int a, int b) : major_(a), minor_(b) {}
    string toString() const override { return to_string(major_) + "." + to_string(minor_); }
    int compareTo(const Comparable& o) const override {
        const auto& v = static_cast<const Version&>(o);     // (we know it is a Version here)
        return major_ != v.major_ ? major_ - v.major_ : minor_ - v.minor_;
    }
};

int main() {
    Version a(1, 4), b(1, 10);
    cout << a.toString() << (a.compareTo(b) < 0 ? " < " : " >= ") << b.toString() << "\n";
}
```

| | Interface (pure abstract) | Abstract class with code |
|---|---|---|
| Data members | none | allowed |
| Implemented functions | none (except dtor) | some, shared by children |
| Multiple inheritance | safe | risky (diamond) |
| Use when | you only want a **contract** | children share **real code and state** |

:::interview Interface vs abstract class in C++?
"C++ has no `interface` keyword. An interface is an abstract class with only pure virtual functions and a virtual destructor. An abstract class may also have data and implemented functions shared by subclasses. I use interfaces for contracts between components (they work well with multiple inheritance and dependency injection), and abstract classes when subclasses share state or a template method."
:::

## Pure virtual functions can have a body

A pure virtual function may be defined. Derived classes *must still override it*, but they can call the base body.

```cpp run title="Pure virtual with a default implementation"
#include <iostream>
using namespace std;

class Logger {
public:
    virtual ~Logger() = default;
    virtual void log(const char* msg) = 0;
};
void Logger::log(const char* msg) { cout << "[default] " << msg << "\n"; }    // body for the pure virtual

class ConsoleLogger : public Logger {
public:
    void log(const char* msg) override { Logger::log(msg); cout << "[console] also printed\n"; }
};

int main() { ConsoleLogger c; c.log("started"); }
```

## Non-Virtual Interface (NVI)

A public **virtual** function lets derived classes change behaviour, but gives them no control point for the base: it cannot add logging, locking, checks. The **NVI idiom** keeps the public function **non-virtual** and the customisation points **private virtual**.

```cpp run title="NVI: the base controls the algorithm, children fill in steps"
#include <iostream>
#include <string>
using namespace std;

class Exporter {
public:
    virtual ~Exporter() = default;
    void exportData(const string& data) {              // public, NON-virtual: the fixed outline
        if (data.empty()) { cout << "nothing to export\n"; return; }     // precondition checked ONCE, in the base
        cout << "-- start " << format() << " export --\n";
        write(transform(data));
        cout << "-- done --\n";                         // post-processing is guaranteed
    }
private:
    virtual string format() const = 0;                  // private virtual: children override, callers cannot call
    virtual string transform(const string& d) const { return d; }   // optional hook with a default
    virtual void write(const string& d) const = 0;
};

class CsvExporter : public Exporter {
    string format() const override { return "CSV"; }
    void write(const string& d) const override { cout << "csv: " << d << "\n"; }
};
class UpperJson : public Exporter {
    string format() const override { return "JSON"; }
    string transform(const string& d) const override { string u = d; for (char& c : u) c = toupper(c); return u; }
    void write(const string& d) const override { cout << "{\"data\":\"" << d << "\"}\n"; }
};

int main() {
    CsvExporter().exportData("a,b,c");
    UpperJson().exportData("hello");
    UpperJson().exportData("");
}
```

You can override a *private* virtual function. Access control applies to *calling*, not to overriding. NVI is the **Template Method** pattern in its cleanest C++ form, and the `std::ostream` hierarchy uses it.

```quiz
? What makes a class abstract?
- Having a virtual destructor
+ Having at least one pure virtual function
- Having only private members
> A pure virtual function (`= 0`) makes the class impossible to instantiate.
? A class derives from an abstract base and forgets one pure virtual override. What is it?
- A normal class
+ Still abstract: it cannot be instantiated
- A final class
> Every pure virtual must be overridden in the chain for a class to be concrete.
? Why does NVI make the public function non-virtual?
- To make it faster
+ So the base class controls the common steps (checks, logging) and children only fill in the customisation points
- Because virtual functions cannot be public
> It gives the base a single control point, which is easier to maintain.
```

:::keypoints
- `= 0` makes a function pure virtual and the class abstract. Concrete classes must override all of them.
- An interface is an abstract class with only pure virtuals and a virtual destructor. Multiple interface inheritance is safe.
- Share code through non-virtual base functions that call virtual steps (Template Method / NVI).
:::
