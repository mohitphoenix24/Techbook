---
title: Refactoring step by step toward patterns
level: intermediate
time: 40
summary: Small, safe changes that improve messy code and lead naturally to design patterns: extract method, replace a switch with classes, parameter objects, move method, factory, delegation and named constants. Each one has before and after code.
---

Good design is often **grown**, not drawn on day one. You start with simple code. You notice a smell. You make a small change that makes the structure better **without changing what the code does**. This is called **refactoring**. If you repeat it, you often end up at a design pattern.

This lesson shows the most useful moves.

## The rhythm (very important)

1. **Have a test**, even a tiny one, that shows what the code does now.
2. Make **one** small change in the structure.
3. Run the test. Green? Go on. Red? Undo and take a smaller step.
4. Repeat. **Never mix refactoring with changing behaviour.**

## 1. Extract Method (for a long method)

Take a block of code, give it a name, and make it a function.

```cpp run title="Before and after"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Item { string name; double price; int qty; };

// BEFORE: one function does everything, with comments marking the "sections"
void printInvoiceBefore(const vector<Item>& items) {
    // header
    cout << "INVOICE\n--------\n";
    // lines
    double total = 0;
    for (const auto& i : items) { cout << i.name << " x" << i.qty << " = " << i.price * i.qty << "\n"; total += i.price * i.qty; }
    // footer
    cout << "--------\nTOTAL " << total << (total > 1000 ? " (free shipping)" : "") << "\n";
}

// AFTER: each section is a named function: the comments became names
void printHeader() { cout << "INVOICE\n--------\n"; }
double lineTotal(const Item& i) { return i.price * i.qty; }
double printLines(const vector<Item>& items) {
    double total = 0;
    for (const auto& i : items) { cout << i.name << " x" << i.qty << " = " << lineTotal(i) << "\n"; total += lineTotal(i); }
    return total;
}
void printFooter(double total) { cout << "--------\nTOTAL " << total << (total > 1000 ? " (free shipping)" : "") << "\n"; }
void printInvoiceAfter(const vector<Item>& items) { printHeader(); printFooter(printLines(items)); }

int main() {
    vector<Item> items{{"pen", 10, 5}, {"bag", 1200, 1}};
    printInvoiceBefore(items);
    cout << "== after the refactoring: identical output ==\n";
    printInvoiceAfter(items);
}
```

## 2. Replace Conditional with Polymorphism (leads to Strategy or State)

```cpp run title="A switch on a type code becomes classes"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

// BEFORE
enum class Kind { Regular, Premium, Student };
double feeBefore(Kind k, double base) {
    switch (k) {
        case Kind::Regular: return base;
        case Kind::Premium: return base * 0.8;
        case Kind::Student: return base * 0.5;
    }
    return base;
}

// AFTER
struct Membership { virtual ~Membership() = default; virtual double fee(double base) const = 0; };
struct Regular : Membership { double fee(double b) const override { return b; } };
struct Premium : Membership { double fee(double b) const override { return b * 0.8; } };
struct Student : Membership { double fee(double b) const override { return b * 0.5; } };

int main() {
    cout << feeBefore(Kind::Premium, 1000) << " " << feeBefore(Kind::Student, 1000) << "\n";
    vector<unique_ptr<Membership>> ms;
    ms.push_back(make_unique<Regular>()); ms.push_back(make_unique<Premium>()); ms.push_back(make_unique<Student>());
    for (auto& m : ms) cout << m->fee(1000) << " ";
    cout << "\n";
}
```

## 3. Introduce Parameter Object (for long parameter lists)

When the same values always travel together, make them one type.

```cpp run title="Parameters that travel together become a type"
#include <iostream>
#include <string>
using namespace std;

// BEFORE: void book(string guest, string room, int checkInDay, int checkOutDay, bool breakfast);
struct Stay { int checkInDay, checkOutDay; bool breakfast = false; int nights() const { return checkOutDay - checkInDay; } };
void book(const string& guest, const string& room, const Stay& s) {
    cout << guest << " in " << room << " for " << s.nights() << " nights" << (s.breakfast ? " with breakfast" : "") << "\n";
}

int main() { book("Asha", "204", {10, 13, true}); }
```

A parameter object often grows its own methods (like `nights()`). That is how a **value object** is born.

## 4. Move Method / Extract Class (for feature envy and god classes)

```cpp run title="The method moves to the data it uses"
#include <iostream>
#include <vector>
using namespace std;

struct Order { vector<double> lines; };

// BEFORE: a Report class that digs into Order's data
//   double orderTotal(const Order& o) { double t = 0; for (double l : o.lines) t += l; return t; }
// AFTER: Order answers the question itself
class OrderV2 {
    vector<double> lines_;
public:
    void add(double l) { lines_.push_back(l); }
    double total() const { double t = 0; for (double l : lines_) t += l; return t; }
};

int main() { OrderV2 o; o.add(100); o.add(250); cout << o.total() << "\n"; }
```

## 5. Replace Constructor with Factory Method (leads to Factory)

```cpp run title="Named creation, validation and caching in one place"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

// BEFORE: callers do `new Notification(type, ...)` and each decides how to interpret type strings
class Notification {
    string channel_, text_;
    Notification(string c, string t) : channel_(move(c)), text_(move(t)) {}
public:
    static unique_ptr<Notification> email(string text) { return unique_ptr<Notification>(new Notification("email", move(text))); }
    static unique_ptr<Notification> sms(string text) {
        if (text.size() > 160) throw invalid_argument("sms too long");         // rule enforced in ONE place
        return unique_ptr<Notification>(new Notification("sms", move(text)));
    }
    string describe() const { return channel_ + ": " + text_; }
};

int main() {
    cout << Notification::email("hello")->describe() << "\n" << Notification::sms("hi")->describe() << "\n";
}
```

## 6. Replace Inheritance with Delegation (leads to Strategy or Decorator)

```cpp run title="A Stack that HAS a vector instead of BEING one"
#include <iostream>
#include <vector>
using namespace std;

// BEFORE: class Stack : public vector<int>  (exposes insert, erase, operator[] ...)
class Stack {
    vector<int> items_;                                    // delegate to a member
public:
    void push(int x) { items_.push_back(x); }
    int pop() { int v = items_.back(); items_.pop_back(); return v; }
    bool empty() const { return items_.empty(); }
};

int main() { Stack s; s.push(1); s.push(2); cout << s.pop() << s.pop() << "\n"; }
```

## 7. Introduce Null Object

Replace repeated `if (customer == nullptr)` checks with a `GuestCustomer` that has harmless behaviour (see the Null Object lesson).

## 8. Replace Magic Number with a Named Constant (or enum)

```cpp run title="Name your constants"
#include <iostream>
using namespace std;

// BEFORE: if (status == 3 && days > 14) fine = days * 2;
enum class LoanStatus { Active = 1, Returned = 2, Overdue = 3 };
constexpr int kLoanDays = 14;
constexpr int kFinePerDay = 2;

int fine(LoanStatus s, int days) { return (s == LoanStatus::Overdue && days > kLoanDays) ? (days - kLoanDays) * kFinePerDay : 0; }

int main() { cout << fine(LoanStatus::Overdue, 20) << " " << fine(LoanStatus::Active, 20) << "\n"; }
```

## The map: smell, refactoring, pattern

| Smell | Refactoring | Pattern you reach |
|---|---|---|
| Switch on a type code | Replace Conditional with Polymorphism | Strategy / State |
| A constructor full of `if`s on a type | Replace Constructor with Factory | Factory Method |
| Many optional constructor parameters | Introduce Builder | Builder |
| The same wrapper code around several classes (logging, retry) | Extract Decorator | Decorator |
| A complex group of classes used the same way everywhere | Introduce Facade | Facade |
| Repeated `if (x == nullptr)` | Introduce Null Object | Null Object |
| One object must tell many others about changes | Extract Observer | Observer |
| The same steps repeated in similar classes | Form Template Method | Template Method |
| Inheritance only for reuse | Replace Inheritance with Delegation | composition, Strategy |
| A job scattered over a class family | Move to a Visitor or `variant` | Visitor |

## Short answer to say in an interview

:::interview How would you improve this messy code?
"First I would write a test that shows what it does now. Then I would make small steps: extract methods to name the parts, replace the type switch with classes, make a parameter object for the long list of arguments, move behaviour to the class that owns the data, and pass dependencies in. After each step I run the test. I also name each smell and the pattern it leads to."
:::

```quiz
? What is the most important rule of refactoring?
- Change behaviour as you go
+ Keep behaviour the same, in small steps, with tests passing
- Rewrite everything at once
> Refactoring changes only the structure. Mixing in new behaviour hides bugs.
? Replacing a switch on a type code with classes leads to which pattern?
- Singleton
+ Strategy or State
- Facade
> Each case becomes a class behind a common interface.
? Which refactoring fixes a class that inherits only to reuse code?
- Extract Method
+ Replace Inheritance with Delegation
- Introduce Parameter Object
> Hold the other class as a member and pass on only the calls you want.
```

:::keypoints
- Refactor in small steps with tests: extract method, replace conditional with polymorphism, parameter object, move method, factory, delegation, null object, named constants.
- Each refactoring cures a smell, and often leads to a pattern.
- Never mix refactoring with changing behaviour.
:::
