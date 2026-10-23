---
title: I: Interface Segregation Principle
level: intermediate
time: 25
summary: Clients should not be forced to depend on methods they do not use. A fat interface and its empty or throwing implementations, splitting into role interfaces, C++ multiple inheritance of interfaces, and how ISP relates to SRP.
---

:::def Interface Segregation Principle (ISP)
**No client should be forced to depend on methods it does not use.** Prefer many small, focused interfaces over one large general-purpose interface.
:::

## A fat interface

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

`Robot` must implement `eat` and `sleep` though it has no use for them, so it writes an empty body or throws. Anyone who calls `eat()` through a `Worker` gets nonsense. Also, a change to `eat()`'s signature forces `Robot` to change and recompile, though it never uses `eat`.

## Segregated "role" interfaces

Split by **role**: what a client *needs to do* with the object.

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

Each function now depends on exactly the capability it uses. `lunchBreak` cannot be given a robot, so the mistake is caught by the compiler.

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

## A realistic example: a printer hierarchy

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

## ISP in a client's view: depend on less

ISP is about the **client's** dependency. A function or class should name the smallest interface it needs.

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

## ISP and SRP

They are cousins. **SRP**: a *class* should have one reason to change. **ISP**: a *client* should depend only on the part of an interface it uses. A fat interface is often a symptom of a class (or a role) doing too much.

## How to apply it

1. List the **clients** of the interface. What does each one call?
2. If different clients use **different subsets**, split the interface along those lines.
3. Name interfaces by **role**: `Readable`, `Closeable`, `Comparable`, `Printable`.
4. A concrete class can implement **several** interfaces (multiple inheritance of data-free interfaces is safe).
5. Do not create interfaces with one method each *everywhere*: split only when clients really differ.

:::interview ISP: example and benefit
"A fat `Worker` interface with `work`, `eat` and `sleep` forces a `Robot` to implement methods it cannot honour. I split it into `Workable`, `Eatable`, `Sleepable` so each class implements only its real roles, and each client depends only on what it uses. Benefits: no dummy or throwing methods (so LSP holds), fewer recompiles when an unused method changes, and mistakes that become compile errors."
:::

```quiz
? What problem does a "fat interface" cause?
- It is slower
+ Implementers must provide methods they cannot or should not support
- It cannot be inherited
> They end up with empty or throwing implementations, breaking contracts.
? How do you apply ISP?
- Merge interfaces
+ Split an interface by client roles so each client sees only what it needs
- Remove virtual functions
> Role interfaces give small, focused dependencies.
? Does ISP forbid a class from implementing several interfaces?
- Yes
+ No: a class may implement multiple small interfaces
> Multiple inheritance of pure interfaces is safe and common.
```

:::keypoints
- Do not force clients (or implementers) to depend on methods they do not use.
- Split fat interfaces into role interfaces; a class can implement several.
- Functions should accept the smallest interface they need (`const ConfigReader&`, not `Config&`).
- ISP prevents empty/throwing overrides, helping Liskov, and reduces recompilation.
:::
