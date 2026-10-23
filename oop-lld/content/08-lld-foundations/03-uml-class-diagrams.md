---
title: UML class diagrams, and how they map to C++
level: easy
time: 30
summary: Reading and drawing class diagrams: class boxes, visibility, the six relationships with their arrows and multiplicities, and the exact C++ code that each arrow stands for.
---

A **class diagram** is the main picture of an LLD answer. You draw it on the whiteboard in the first 10 minutes. It must be quick to draw, and the code must follow it. You need only a small part of UML.

## The class box

```viz algo=uml title="One class box"
class Account
  - id: string
  - balance: Money
  + deposit(amount: Money): void
  + withdraw(amount: Money): bool
  + balance(): Money
  # audit(): void
```

| Part | Meaning |
|---|---|
| Top: **name** | nouns, singular: `Account` |
| Middle: **attributes** | `visibility name: Type` |
| Bottom: **operations** | `visibility name(params): ReturnType` |
| `+` / `-` / `#` | public / private / protected |
| *italic* name or `«abstract»` | abstract class |
| `«interface»` | an interface (all pure virtual) |
| underlined member | `static` |

In an interview, you may skip getters and trivial members. Show the **key** data and the **important** operations only.

## The relationships

Six arrows cover almost everything. From weakest to strongest coupling:

| Arrow | Name | Reads as | Strength |
|---|---|---|---|
| `A ..> B` dashed, open head | **Dependency** | "A uses B temporarily" | weakest |
| `A --> B` solid, open head | **Association** | "A knows B" | |
| `A o-- B` hollow diamond at A | **Aggregation** | "A has B (B lives independently)" | |
| `A *-- B` filled diamond at A | **Composition** | "A owns B (B dies with A)" | |
| `A ..|> B` dashed, hollow triangle | **Realisation** | "A implements interface B" | |
| `A --|> B` solid, hollow triangle | **Generalisation** | "A is a kind of B" (inheritance) | strongest |

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

## Multiplicity

Numbers on an arrow end say how many objects take part:

| Notation | Meaning |
|---|---|
| `1` | exactly one |
| `0..1` | zero or one (optional) |
| `*` or `0..*` | zero or more |
| `1..*` | one or more |
| `3` | exactly three |

"A `Member` borrows `0..3` `Copy` objects; a `Copy` is borrowed by `0..1` `Member`."

## Each arrow in C++ code

This single program shows the C++ spelling of every relationship. Match each comment to the diagram above.

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

1. **Interfaces and abstract classes at the top**, concrete classes below, owners above the parts they own. Arrows read naturally top-down.
2. **Name the role** on an association when it helps: `Order --> Customer : placedBy`.
3. **Do not draw every getter.** Show what proves the design: data that matters, public operations, interfaces.
4. **Mark multiplicities** on composition and association. They show you thought about cardinality.
5. **Show the pattern** by labelling: `«strategy»`, `«factory»`.
6. Keep it to **8 to 12 classes**. If you need more, group them or draw it in two parts.

:::warn Frequent mistakes
- Using inheritance arrows for "has-a" (a `Car` is not an `Engine`).
- Drawing a diamond but meaning a plain reference. Diamonds claim *ownership* or *part-of*; if unsure, use a plain arrow.
- Both classes pointing to each other with no reason (a cycle). One direction is usually enough.
- Putting `getX`/`setX` pairs for every field: it signals poor encapsulation.
:::

## Tools

On a whiteboard, boxes and arrows suffice. In a take-home or document use **PlantUML**, **Mermaid** (`classDiagram`), or draw.io. The diagrams in this course are generated from a tiny text language like PlantUML's.

```quiz
? What does a filled diamond on a line mean?
- Inheritance
+ Composition: the whole owns the part, and the part dies with it
- A dependency
> Filled = strong ownership. Hollow diamond = aggregation (independent lifetimes).
? Which arrow means "implements an interface"?
- Solid line with a hollow triangle
+ Dashed line with a hollow triangle
- Dashed line with an open arrowhead
> Dashed + triangle is realisation; solid + triangle is inheritance; dashed + open arrow is dependency.
? How is composition usually written in C++?
- A raw pointer to an object owned elsewhere
+ A member by value, or a unique_ptr or vector owned by the whole
- A friend declaration
> Owning the part and controlling its lifetime maps to value members and unique_ptr.
```

:::keypoints
- Class box: name, attributes, operations; `+ - #` for visibility; `«interface»` and abstract in italics.
- Six arrows: dependency, association, aggregation, composition, realisation, generalisation. Each has a clear C++ spelling.
- Draw interfaces on top, 8 to 12 classes, multiplicities on associations, and make the code match the diagram.
:::
