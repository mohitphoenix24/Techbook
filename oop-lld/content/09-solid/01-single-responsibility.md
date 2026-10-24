---
title: "S: Single Responsibility Principle"
level: intermediate
time: 30
summary: One class should have one reason to change. A simple example with three people in one class, how to split it, how to spot the problem, and how far to go.
---

**S** in SOLID stands for **Single Responsibility Principle**, or **SRP**.

Don't memorise the long definition yet. Think of it like this:

> "If I need to change something, how many different reasons could make me open this class? If the answer is more than one, the class is doing too much."

:::def Single Responsibility Principle (SRP)
A class should have **only one reason to change**. In other words, it should serve **one purpose** for **one group of people**.
:::

One important thing: this does **not** mean "a class can have only one method". A `Money` class can have many methods (add, subtract, compare). They all have **one purpose**: handling money. That is fine.

:::analogy Think of a restaurant
One person cooks, takes orders, handles the cash counter and cleans the toilets. When the menu changes, or the billing rules change, or the cleaning schedule changes, that same person is disturbed. It is better to have separate people for separate jobs. Then a change in one job does not break the others.
:::

## A bad example

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

Why is this bad?

- **Three different teams** would edit this one class: HR (reports), finance (salary), and the database team (saving). Their changes can clash.
- Suppose HR's report and the pay calculation both use a helper like `regularHours()`. If HR changes it, **salaries change by accident**.
- To test the pay calculation, you must also set up a database. That is painful.

## The fix: split by job

Keep the data in a small class. Give each job its own class.

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

Now each class has **one reason to change**. `PayCalculator` can be tested without any database.

Here is how the pieces work together:

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

## How to spot a problem

| Warning sign | Example |
|---|---|
| The class name has "And", "Manager", "Helper", "Util" or "Processor" | `OrderManagerAndMailer` |
| Some methods use some fields, other methods use other fields | half the methods use `balance_`, half use `smtpHost_` |
| The class imports things from unrelated areas | a `Report` that includes both a database library and an email library |
| Many teams keep editing the same class | merge conflicts every week |
| You cannot explain the class in one sentence without "and" | "it validates input and writes files and..." |
| It is hard to test | you need a database to test simple maths |

## Do not go too far

SRP is a **guide**, not a goal. If you split everything into tiny classes, nobody can follow the code. Use these checks:

1. Split when parts **change at different times for different reasons**. Do not split only because they look different.
2. Keep things together if they **always change together**.
3. A tiny class used in only one place, which will probably never change, may not need its own type.

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

This class has five methods and still follows SRP, because all of them serve one purpose.

## SRP is not only for classes

A function that reads input, checks it, calculates and prints should be four small functions. A "UserService" that handles profile, emails and billing should be three services.

## Short answer to say in an interview

:::interview Explain SRP. Does it mean one method per class?
"SRP says a class should have only one reason to change, meaning one purpose for one group of people. It does not limit the number of methods. For example, Money can have many methods and all of them are about money. When I see a class that mixes things like tax rules, report format and database code, I split it, so a change in one place does not break the others and each class is easy to test."
:::

```quiz
? What does "one reason to change" mean?
- The class has exactly one method
+ All the code in the class would change for the same kind of reason
- The class has one data member
> Many methods are fine if they all serve the same purpose.
? Which one is a sign that SRP is broken?
- A class named Money with add and subtract
+ A class that mixes business rules, report printing and database code
- A class with a virtual destructor
> Those parts change for different reasons.
? What is the danger of applying SRP too much?
- Faster code
+ Too many tiny classes that are hard to follow
- It breaks the Liskov principle
> Split only where there are real, separate reasons to change.
```

:::keypoints
- One class, one reason to change (one purpose, one group of people). It is about **change**, not about counting methods.
- Warning signs: names with "And/Manager/Util", fields used by separate groups of methods, many teams editing one class, hard to test.
- Split by reason to change, keep together what changes together, and do not over-split.
:::
