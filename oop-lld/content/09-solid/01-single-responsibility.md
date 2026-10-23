---
title: S: Single Responsibility Principle
level: intermediate
time: 30
summary: A class should have one reason to change. A violation with three stakeholders in one class, the refactoring, how to spot responsibilities, how far to go, and the common misreadings.
---

:::def Single Responsibility Principle (SRP)
A class should have **one, and only one, reason to change**. More precisely (Robert Martin): a module should be responsible to **one actor**, one group of people who would ask for changes.
:::

"One reason to change" is the key. It does **not** mean "a class has only one method". It means everything inside the class changes for the *same kind of reason*.

:::analogy Think of it like this
A restaurant cook who also takes orders, handles the till and cleans the toilets. When the menu changes, the till rules change, or the cleaning schedule changes, you disturb the same person. Better: separate roles, so a change in one does not break the others.
:::

## A violation

```cpp run title="Employee with three reasons to change"
#include <iostream>
#include <string>
using namespace std;

class Employee {
    string name_;
    double hourlyRate_;
    int hours_;
public:
    Employee(string n, double r, int h) : name_(move(n)), hourlyRate_(r), hours_(h) {}

    // Reason 1: payroll rules. Changes when the FINANCE team changes overtime or tax rules.
    double calculatePay() const {
        double overtime = hours_ > 160 ? (hours_ - 160) * hourlyRate_ * 0.5 : 0;
        return hours_ * hourlyRate_ + overtime;
    }

    // Reason 2: HR reporting. Changes when the HR team changes what counts as reported hours.
    string hoursReport() const { return name_ + ": " + to_string(hours_) + " hours"; }

    // Reason 3: persistence. Changes when the IT team moves from files to a database.
    void save() const { cout << "  saving " << name_ << " to the database\n"; }
};

int main() {
    Employee e("Asha", 500, 170);
    cout << e.hoursReport() << ", pay " << e.calculatePay() << "\n";
    e.save();
}
```

Why is it bad? **Three different teams** edit one class, so their changes collide in version control and in behaviour. If HR's report formula shares a helper with the pay calculation (say, a `regularHours()` method), an HR change can silently change salaries. Also, to test pay you must build an object that knows about databases.

## The refactoring

Split by **reason to change** (by actor). Keep the data in a small class, and move each responsibility to its own class.

```cpp run title="One class per reason to change"
#include <iostream>
#include <string>
using namespace std;

// Plain data: the thing all three agree about
struct EmployeeData {
    string name;
    double hourlyRate;
    int hours;
};

// FINANCE changes this
class PayCalculator {
public:
    double pay(const EmployeeData& e) const {
        double overtime = e.hours > 160 ? (e.hours - 160) * e.hourlyRate * 0.5 : 0;
        return e.hours * e.hourlyRate + overtime;
    }
};

// HR changes this
class HoursReporter {
public:
    string report(const EmployeeData& e) const { return e.name + ": " + to_string(e.hours) + " hours"; }
};

// IT changes this
class EmployeeRepository {
public:
    void save(const EmployeeData& e) const { cout << "  saving " << e.name << " to the database\n"; }
};

int main() {
    EmployeeData e{"Asha", 500, 170};
    cout << HoursReporter().report(e) << ", pay " << PayCalculator().pay(e) << "\n";
    EmployeeRepository().save(e);
}
```

Now each class has one reason to change and can be tested on its own. `PayCalculator` can be tested with no database at all.

```viz algo=uml title="After applying SRP"
class EmployeeData
  + name: string
  + hourlyRate: double
  + hours: double
class PayCalculator
  + pay(e: EmployeeData): double
class HoursReporter
  + report(e: EmployeeData): string
class EmployeeRepository
  + save(e: EmployeeData): void
PayCalculator ..> EmployeeData
HoursReporter ..> EmployeeData
EmployeeRepository ..> EmployeeData
```

## How to spot a violation

| Smell | Example |
|---|---|
| The class name needs "And" or "Manager", "Helper", "Util", "Processor" | `OrderManagerAndMailer` |
| Methods that use disjoint groups of fields | half the methods touch `balance_`, half touch `smtpHost_` |
| Imports/includes from unrelated areas (UI, DB, network, maths) | a `Report` that includes `<sqlite3.h>` and `<smtp.h>` |
| One feature request keeps editing the same class from many teams | merge conflicts every sprint |
| You cannot name the class's purpose in **one sentence without "and"** | "validates input and writes to disk and..." |
| Hard to unit test | you need a database to test arithmetic |

## How far to go? (Do not over-apply it)

SRP is a **guide, not a goal**. If you split too far you get dozens of tiny classes that are hard to follow ("class explosion"). Use these checks:

1. Split when the parts **change at different times, for different reasons**, not just because they are different.
2. Keep things together that **always change together** (that is cohesion).
3. A tiny class used in exactly one place and unlikely to vary may not need its own type.

```cpp run title="Same responsibility, so keep it together"
#include <iostream>
using namespace std;

// 'Money' has several methods, but they all serve ONE responsibility: being a monetary amount.
class Money {
    long paise_;
public:
    explicit Money(long p) : paise_(p) {}
    Money plus(Money o) const { return Money(paise_ + o.paise_); }
    Money minus(Money o) const { return Money(paise_ - o.paise_); }
    Money times(int n) const { return Money(paise_ * n); }
    bool operator<(Money o) const { return paise_ < o.paise_; }
    long paise() const { return paise_; }
};

int main() {
    Money a(1000), b(250);
    cout << a.plus(b).paise() << " " << a.minus(b).times(2).paise() << " " << (b < a) << "\n";
}
```

Five methods, one reason to change. That is perfectly fine under SRP.

## SRP at every level

SRP applies to **functions** too. A function that parses, validates, computes and prints should be four small functions. It applies to **modules** and **services**: a "UserService" that handles profiles, emails and billing is three services.

:::interview Explain SRP. Does it mean a class should have one method?
"SRP says a class should have only one reason to change, meaning it is responsible to one stakeholder or concern. It does not limit the number of methods: `Money` has many, all about money. I look for classes where different kinds of change would hit the same class, such as tax rules, report layout and storage, and I split those so a change stays local and the class stays easy to test."
:::

```quiz
? What does "one reason to change" mean?
- The class has exactly one method
+ All the class's code would change for the same kind of reason (one actor or concern)
- The class has one data member
> Many methods are fine when they serve the same responsibility.
? Which is a symptom of an SRP violation?
- A class named Money with add and subtract
+ A class that mixes business rules, report formatting and database access
- A class with a virtual destructor
> Those parts change for different reasons and for different people.
? What is the danger of applying SRP too aggressively?
- Faster code
+ Many tiny classes that are hard to navigate (class explosion)
- It breaks Liskov
> Split along real axes of change, not just because things differ.
```

:::keypoints
- One class, one reason to change (one actor, one concern). It is about **change**, not about the number of methods.
- Violation signs: "And/Manager/Util" names, disjoint field groups, many teams editing one class, hard to test.
- Split by reason to change; keep together what changes together; do not over-split.
:::
