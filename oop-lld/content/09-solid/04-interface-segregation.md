---
title: "I: Interface Segregation Principle"
level: intermediate
time: 25
summary: Do not force a class to have methods it does not need. See the problem with one big interface, how to split it into small role-based interfaces, and how this keeps the code safe and easy to change.
---

**I** in SOLID stands for **Interface Segregation Principle**, or **ISP**.

Don't memorise the definition yet. Think of it like this:

> "Don't make me sign a form with 20 rules when I only need to follow 2 of them."

:::def Interface Segregation Principle (ISP)
**Nobody should be forced to depend on methods they do not use.** Prefer several small interfaces over one big interface.
:::

(Remember: an **interface** here is a class that only lists *what can be done*, with no real code inside.)

## The problem: one big interface

Imagine a `Worker` interface with three methods: `work`, `eat` and `sleep`.

```cpp run title="One interface for everything: Robot has to fake eating"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

class Worker {                                           // FAT interface
public:
    virtual ~Worker() = default;
    virtual void work() = 0;
    virtual void eat() = 0;
    virtual void sleep() = 0;
};

class Human : public Worker {
public:
    void work() override { cout << "  human works\n"; }
    void eat() override { cout << "  human eats lunch\n"; }
    void sleep() override { cout << "  human sleeps\n"; }
};
class Robot : public Worker {
public:
    void work() override { cout << "  robot works\n"; }
    void eat() override { /* robots do not eat: a meaningless empty method */ }
    void sleep() override { throw logic_error("robots do not sleep"); }       // forced to lie: also breaks LSP
};

int main() {
    vector<unique_ptr<Worker>> staff;
    staff.push_back(make_unique<Human>());
    staff.push_back(make_unique<Robot>());
    for (auto& w : staff) w->work();
    try { staff[1]->sleep(); } catch (const exception& e) { cout << "  error: " << e.what() << "\n"; }
}
```

A human worker is fine. But a `Robot` is also a `Worker`. A robot does not eat or sleep, but it is **forced** to write `eat()` and `sleep()`. So it writes an empty method, or throws an error.

Now anyone who calls `eat()` on a worker may get a strange result. Also, if someone changes `eat()`, the `Robot` must change and be rebuilt, even though it never used `eat()`.

## The fix: small interfaces based on roles

Split the big interface by **role**, which means "what does the user need to do with this object?"

```cpp run title="Small interfaces, combined where needed"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Workable  { virtual ~Workable() = default;  virtual void work() = 0; };
struct Eatable   { virtual ~Eatable() = default;   virtual void eat() = 0; };
struct Sleepable { virtual ~Sleepable() = default; virtual void sleep() = 0; };

class Human : public Workable, public Eatable, public Sleepable {      // implements all three roles
public:
    void work() override { cout << "  human works\n"; }
    void eat() override { cout << "  human eats\n"; }
    void sleep() override { cout << "  human sleeps\n"; }
};
class Robot : public Workable {                                          // only what it truly does
public:
    void work() override { cout << "  robot works\n"; }
};

void runShift(const vector<Workable*>& staff) { for (auto* w : staff) w->work(); }   // depends ONLY on work()
void lunchBreak(const vector<Eatable*>& people) { for (auto* p : people) p->eat(); } // depends ONLY on eat()

int main() {
    Human h; Robot r;
    runShift({&h, &r});
    lunchBreak({&h});                          // a Robot cannot be passed here: it is a compile error, not a runtime surprise
}
```

Now each function asks only for the ability it needs. For example, `lunchBreak` needs something that can **eat**. If you try to give it a robot, the program **will not compile**. The mistake is caught early.

Here is the picture:

```viz algo=uml title="Role interfaces"
interface Workable
  + work(): void
interface Eatable
  + eat(): void
interface Sleepable
  + sleep(): void
class Human
class Robot
Human ..|> Workable
Human ..|> Eatable
Human ..|> Sleepable
Robot ..|> Workable
```

## A real example: printers

```cpp run title="Multi-function device vs simple printer"
#include <iostream>
#include <string>
using namespace std;

struct Printer { virtual ~Printer() = default; virtual void print(const string& d) = 0; };
struct Scanner { virtual ~Scanner() = default; virtual string scan() = 0; };
struct Fax     { virtual ~Fax() = default;     virtual void fax(const string& d) = 0; };

class BasicPrinter : public Printer {                    // a cheap printer implements one role
public:
    void print(const string& d) override { cout << "  basic prints: " << d << "\n"; }
};
class OfficeMachine : public Printer, public Scanner, public Fax {
public:
    void print(const string& d) override { cout << "  office prints: " << d << "\n"; }
    string scan() override { return "scanned-page"; }
    void fax(const string& d) override { cout << "  faxing: " << d << "\n"; }
};

void printReport(Printer& p) { p.print("Q3 report"); }   // any printer will do: depends only on Printer

int main() {
    BasicPrinter b; OfficeMachine o;
    printReport(b);
    printReport(o);
    o.fax(o.scan());
}
```

A simple printer only needs to print. A multi-function device can print, scan and fax. Each one follows only the interfaces that fit it.

## ISP from the user's side: ask for less

ISP is also about **the code that uses** an interface. A function should ask for the **smallest** interface it needs.

```cpp run title="A function that needs only reading takes the read-only interface"
#include <iostream>
#include <map>
#include <string>
using namespace std;

struct ConfigReader { virtual ~ConfigReader() = default; virtual string get(const string& k) const = 0; };
struct ConfigWriter { virtual ~ConfigWriter() = default; virtual void set(const string& k, const string& v) = 0; };

class Config : public ConfigReader, public ConfigWriter {
    map<string, string> kv_;
public:
    string get(const string& k) const override { auto it = kv_.find(k); return it == kv_.end() ? "" : it->second; }
    void set(const string& k, const string& v) override { kv_[k] = v; }
};

void printHost(const ConfigReader& cfg) { cout << "host = " << cfg.get("host") << "\n"; }   // cannot modify the config: safer

int main() {
    Config c;
    c.set("host", "example.com");
    printHost(c);
}
```

If a function only reads a setting, give it the read-only interface. Then it cannot change anything by mistake, and it is easy to test.

## ISP and SRP: close cousins

- **SRP**: one class should have one reason to change.
- **ISP**: one user should depend only on the part it uses.

When you see a fat interface, a class or a role is usually doing too much.

## How to use it

1. List who **uses** the interface. What does each user call?
2. If different users use **different parts**, split the interface that way.
3. Name interfaces by **role**: `Readable`, `Closeable`, `Printable`.
4. One class can follow **many** small interfaces. That is safe.
5. Do not make one-method interfaces everywhere. Split only when users really differ.

## Short answer to say in an interview

:::interview What is ISP? Give an example.
"ISP says a class should not be forced to implement methods it does not need. For example, a Worker interface with work, eat and sleep forces a Robot to write fake eat and sleep methods. I split it into Workable, Eatable and Sleepable, so each class follows only the roles it really has. This avoids empty or error-throwing methods and makes mistakes show up at compile time."
:::

```quiz
? What problem does a "fat interface" cause?
- It is slower
+ Classes must write methods they cannot or should not support
- It cannot be inherited
> They end up with empty or error-throwing methods.
? How do you apply ISP?
- Merge the interfaces
+ Split the interface by role, so each user sees only what it needs
- Remove virtual functions
> Small interfaces give small, safe dependencies.
? Can one class follow several small interfaces?
- No
+ Yes, and it is common and safe
> Following several pure interfaces is a normal way to combine roles.
```

:::keypoints
- Do not force a class to have methods it does not need.
- Split big interfaces by role. One class can follow many small interfaces.
- A function should ask for the smallest interface it needs, such as a read-only one.
- ISP avoids empty or throwing methods (which helps the Liskov rule) and avoids needless rebuilds.
:::
