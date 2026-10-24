---
title: UML class diagrams, and how they map to C++
level: easy
time: 30
summary: How to read and draw a class diagram in simple steps: the class box, the six kinds of arrows, how many objects are linked, and the C++ code each arrow stands for.
---

A **class diagram** is a picture of your classes and how they are connected. In an LLD interview you draw it on the whiteboard in the first 10 minutes, and your code should follow it.

Good news: you only need a small part of UML (the drawing language). This lesson covers exactly that part.

## The class box

Every class is drawn as a box with three parts.

```viz algo=uml title="One class box"
class Account
  - id: string
  - balance: Money
  + deposit(amount: Money): void
  + withdraw(amount: Money): bool
  + balance(): Money
  # audit(): void
```

| Part | What it holds |
|---|---|
| Top | the class **name**, like `Account` |
| Middle | the **data** it keeps: `visibility name: Type` |
| Bottom | the **actions** it can do: `visibility name(params): ReturnType` |

The small signs in front of each line:

| Sign | Meaning |
|---|---|
| `+` | public (anyone can use it) |
| `-` | private (only this class can use it) |
| `#` | protected (this class and its children) |

Two more labels you will see:

- `«interface»` means a class that only says *what* to do, with no code inside.
- *Italic name* or `«abstract»` means a class you cannot create objects from directly.

In an interview, **skip the boring getters and setters**. Show only the important data and the important methods.

## The six arrows

Six arrows cover almost everything. Here they are, from the loosest link to the tightest.

| Arrow | Name | Say it like this | Example |
|---|---|---|---|
| `A ..> B` (dashed, open head) | **Dependency** | "A just uses B for a moment" | a method takes B as a parameter |
| `A --> B` (solid, open head) | **Association** | "A knows B" | A keeps a pointer to B |
| `A o-- B` (hollow diamond on A) | **Aggregation** | "A has B, but B can live without A" | a Team has Players |
| `A *-- B` (filled diamond on A) | **Composition** | "A owns B, and B dies when A dies" | a House has Rooms |
| `A ..|> B` (dashed, hollow triangle) | **Realisation** | "A follows the rules of interface B" | `Card` implements `Payable` |
| `A --|> B` (solid, hollow triangle) | **Inheritance** | "A is a kind of B" | `Dog` is an `Animal` |

```viz algo=uml title="All six relationships in one diagram"
interface Payable
  + pay(amount: double): bool
abstract class Employee
  - name: string
  + salary(): double
class Manager
class Intern
class Department
  - name: string
class Office
class Printer
  + print(doc: Document)
class Document
Manager --|> Employee
Intern --|> Employee
Employee ..|> Payable
Department o-- Employee : 0..*
Office *-- Department : 1..*
Employee --> Office : worksIn
Printer ..> Document
```

:::tip A easy way to remember
- Dashed line = weak link ("uses" or "follows rules").
- Solid line = stronger link ("knows" or "is a").
- Filled diamond = "owns it completely".
:::

## How many? (multiplicity)

Small numbers at the end of an arrow say **how many objects** are involved.

| Written | Means |
|---|---|
| `1` | exactly one |
| `0..1` | zero or one (optional) |
| `*` or `0..*` | zero or many |
| `1..*` | at least one |
| `3` | exactly three |

Example in words: "A `Member` borrows `0..3` `Copy` objects. A `Copy` is borrowed by `0..1` `Member`."

## What each arrow looks like in C++

This one program shows the C++ code for every arrow. Read the comments and match each one with the diagram above.

```cpp run title="UML arrow to C++ code"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Document { public: string text = "report"; };

// Realisation: Employee implements Payable
class Payable {
public:
    virtual ~Payable() = default;
    virtual bool pay(double amount) = 0;
};

// Generalisation: Manager and Intern are kinds of Employee
class Employee : public Payable {                      // Employee ..|> Payable
protected:
    string name_;
public:
    explicit Employee(string n) : name_(move(n)) {}
    bool pay(double amount) override { cout << "  paid " << amount << " to " << name_ << "\n"; return true; }
    virtual double salary() const = 0;
    const string& name() const { return name_; }
};
class Manager : public Employee {                       // Manager --|> Employee
public:
    using Employee::Employee;
    double salary() const override { return 90000; }
};
class Intern : public Employee {
public:
    using Employee::Employee;
    double salary() const override { return 15000; }
};

// Association: an Employee knows the Office they work in (a plain pointer, the Office is not owned)
class Office { public: string city = "Pune"; };

// Aggregation: a Department has Employees, but employees exist independently (non-owning pointers)
class Department {
    string name_;
    vector<Employee*> staff_;                           // Department o-- Employee
public:
    explicit Department(string n) : name_(move(n)) {}
    void add(Employee* e) { staff_.push_back(e); }
    double payroll() const { double t = 0; for (auto* e : staff_) t += e->salary(); return t; }
    const string& name() const { return name_; }
};

// Composition: the Office owns its Departments; they are created and destroyed with it
class Company {
    vector<unique_ptr<Department>> departments_;        // Company *-- Department
public:
    Department& addDepartment(string n) { departments_.push_back(make_unique<Department>(move(n))); return *departments_.back(); }
    size_t size() const { return departments_.size(); }
};

// Dependency: Printer only USES a Document while printing; it keeps nothing
class Printer {
public:
    void print(const Document& d) const { cout << "  printing: " << d.text << "\n"; }   // Printer ..> Document
};

int main() {
    Office pune;
    Manager asha("Asha");
    Intern ravi("Ravi");
    Company co;
    Department& eng = co.addDepartment("Engineering");      // composition: co owns eng
    eng.add(&asha); eng.add(&ravi);                         // aggregation: staff exist outside
    cout << eng.name() << " payroll " << eng.payroll() << ", departments " << co.size() << "\n";
    Payable& p = asha;                                      // realisation: use through the interface
    p.pay(5000);
    Printer().print(Document{});                            // dependency
    (void)pune;
}
```

## Drawing tips for the whiteboard

1. Put **interfaces at the top**, normal classes below, and owners above the things they own.
2. Write a **name on the arrow** if it helps: `Order --> Customer : placedBy`.
3. **Do not draw every getter.** Show only what proves your design.
4. Write the **numbers** (multiplicity) on the important arrows. It shows you thought about "how many".
5. Label the pattern if you used one: `«strategy»`, `«factory»`.
6. Keep it to **8 to 12 classes**. If you need more, split it into two pictures.

:::warn Common mistakes
- Using an inheritance arrow for "has-a". A `Car` is not an `Engine`; a `Car` *has* an `Engine`.
- Drawing a diamond when you only mean "knows". A diamond says "owns" or "is a part of". If unsure, use a plain arrow.
- Making two classes point at each other for no reason. One direction is usually enough.
- Writing `getX`/`setX` for every field. It makes the design look weak.
:::

## Tools

On a whiteboard, boxes and arrows are enough. For documents you can use PlantUML, Mermaid or draw.io. The diagrams in this course are drawn from a small text language, a bit like PlantUML.

## Short answer to say in an interview

:::interview What is the difference between aggregation and composition?
"Both mean 'has-a'. In composition the whole owns the part, so when the whole is destroyed the part is destroyed too, like a House and its Rooms. In aggregation the part can live on its own, like a Team and its Players."
:::

```quiz
? What does a filled diamond on a line mean?
- Inheritance
+ Composition: the whole owns the part, and the part dies with it
- A dependency
> Filled diamond = strong ownership. Hollow diamond = the part can live alone.
? Which arrow means "implements an interface"?
- Solid line with a hollow triangle
+ Dashed line with a hollow triangle
- Dashed line with an open arrowhead
> Dashed + triangle = implements. Solid + triangle = inheritance. Dashed + open arrow = uses.
? How is composition usually written in C++?
- A raw pointer to something owned elsewhere
+ A member by value, or a unique_ptr or vector owned by the class
- A friend declaration
> If the class owns the part, it holds the part directly.
```

:::keypoints
- A class box has a name, data and methods. `+` is public, `-` is private, `#` is protected.
- Six arrows: dependency, association, aggregation, composition, implements, inherits. Each one maps to simple C++ code.
- Put interfaces on top, keep to 8 to 12 classes, write numbers on important arrows, and make your code match the picture.
:::
