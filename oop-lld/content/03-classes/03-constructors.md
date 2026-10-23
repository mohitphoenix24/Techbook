---
title: Constructors and initialisation
level: easy
time: 35
summary: Default, parameterised, delegating and converting constructors, the member initialiser list and why initialisation order follows declaration order, default member initialisers, explicit, initializer_list constructors, and constructors that fail.
---

A **constructor** is a special function that runs when an object is created. Its job: bring the object to a **valid state** (establish the invariant). It has the same name as the class and no return type.

## Default and parameterised constructors

```cpp run title="Constructors in one class"
#include <iostream>
#include <string>
using namespace std;

class Book {
    string title_;
    int pages_;
public:
    Book() : title_("untitled"), pages_(0) { cout << "default ctor\n"; }
    Book(string title, int pages) : title_(move(title)), pages_(pages) { cout << "2-arg ctor: " << title_ << "\n"; }
    void print() const { cout << title_ << " (" << pages_ << " pages)\n"; }
};

int main() {
    Book a;                       // default constructor
    Book b("Godaan", 400);        // parameterised
    Book c{"Gitanjali", 120};     // same, brace style
    a.print(); b.print(); c.print();
}
```

If you write **no** constructor at all, the compiler provides a default one (which leaves built-in members uninitialised!). If you write **any** constructor, the compiler stops providing the default one. Ask for it back with `Book() = default;`.

## The member initialiser list

Members are best set in the **initialiser list** (after the colon), not by assignment in the body.

```cpp run title="Initialiser list vs assignment"
#include <iostream>
#include <string>
using namespace std;

struct Noisy {
    Noisy()            { cout << "  Noisy default\n"; }
    Noisy(const string&) { cout << "  Noisy(string)\n"; }
    Noisy& operator=(const string&) { cout << "  Noisy assign\n"; return *this; }
};

class Slow {
    Noisy n_;
public:
    Slow(const string& s) { cout << " body starts\n"; n_ = s; }       // default-constructs n_ FIRST, then assigns
};
class Fast {
    Noisy n_;
public:
    Fast(const string& s) : n_(s) { cout << " body starts\n"; }       // constructs n_ directly
};

int main() {
    cout << "Slow:\n"; Slow s("x");
    cout << "Fast:\n"; Fast f("x");
}
```

In `Slow`, the member was default-constructed and then assigned: two steps. In `Fast`, it is built correctly in one. For `const` members and reference members the initialiser list is **mandatory**, because they cannot be assigned later:

```cpp run title="const and reference members need the list"
#include <iostream>
using namespace std;

class Sensor {
    const int id_;            // cannot be assigned
    int& log_;                // a reference must be bound at creation
public:
    Sensor(int id, int& log) : id_(id), log_(log) { log_++; }
    int id() const { return id_; }
};

int main() {
    int created = 0;
    Sensor a(7, created), b(8, created);
    cout << a.id() << " " << b.id() << " created=" << created << "\n";
}
```

## Members are initialised in DECLARATION order

This is a favourite trap. The order of items in the initialiser list does **not** matter. The order in which the members are *declared* in the class does.

```cpp run title="Initialisation order = declaration order"
#include <iostream>
using namespace std;

class Range {
    int size_ = 0;                   // declared first, so initialised first
    int first_ = 0;                  // (default values make the demo deterministic)
    int last_ = 0;
public:
    Range(int first, int last) : last_(last), first_(first), size_(last_ - first_ + 1) {}
    //                                        ^ written in a different order, but still runs size_ FIRST
    int size() const { return size_; }
};

int main() {
    Range r(10, 14);
    cout << "size is " << r.size() << " (should be 5)\n";
}
```

`size_` is computed from `last_` and `first_` **before** they are set, so it sees their defaults (0 and 0) and the answer is wrong. Without those defaults it would read garbage, which is worse. `g++ -Wall` warns about this (`-Wreorder`: "will be initialized after"). Fix: declare members in the order you want them initialised, and write the list in the same order.

## Default member initialisers

You can give every member a default right where it is declared. Every constructor that does not set it uses that value. This removes repetition and prevents uninitialised members.

```cpp run title="Default member initialisers (C++11)"
#include <iostream>
#include <string>
using namespace std;

class Config {
    string host_ = "localhost";
    int port_ = 8080;
    bool tls_ = false;
public:
    Config() = default;                                   // uses all the defaults
    explicit Config(int port) : port_(port) {}            // overrides only port
    Config(string h, int p, bool t) : host_(move(h)), port_(p), tls_(t) {}
    void print() const { cout << host_ << ":" << port_ << (tls_ ? " (tls)" : "") << "\n"; }
};

int main() {
    Config{}.print();
    Config{9090}.print();
    Config{"example.com", 443, true}.print();
}
```

## Delegating constructors

One constructor can call another, so the validation logic exists only once.

```cpp run title="Delegating constructors"
#include <iostream>
#include <stdexcept>
using namespace std;

class Time {
    int h_, m_;
public:
    Time(int h, int m) : h_(h), m_(m) {
        if (h < 0 || h > 23 || m < 0 || m > 59) throw invalid_argument("bad time");
    }
    Time(int h) : Time(h, 0) {}              // delegates to the 2-argument one
    Time() : Time(0, 0) {}
    void print() const { cout << (h_ < 10 ? "0" : "") << h_ << ":" << (m_ < 10 ? "0" : "") << m_ << "\n"; }
};

int main() {
    Time(9, 5).print();
    Time(14).print();
    Time().print();
    try { Time(25, 0); } catch (const exception& e) { cout << "error: " << e.what() << "\n"; }
}
```

## explicit: stop surprising conversions

A constructor that can be called with **one argument** is also an implicit conversion. That is often unwanted.

```cpp run title="Why explicit matters"
#include <iostream>
using namespace std;

class Meters {
public:
    explicit Meters(double v) : v_(v) {}
    double v_;
};
class Seconds {
public:
    Seconds(double v) : v_(v) {}              // NOT explicit: any double silently becomes Seconds
    double v_;
};

void walk(Meters m)   { cout << "walk " << m.v_ << " m\n"; }
void wait(Seconds s)  { cout << "wait " << s.v_ << " s\n"; }

int main() {
    wait(5.5);                  // compiles: 5.5 was converted to Seconds silently
    // walk(5.5);               // error: constructor is explicit
    walk(Meters(5.5));          // you must say what you mean
}
```

**Rule:** mark every single-argument constructor `explicit` unless you really want implicit conversion (like `std::string` from `const char*`).

## initializer_list constructors

```cpp run title="Brace lists and initializer_list"
#include <initializer_list>
#include <iostream>
#include <vector>
using namespace std;

class Bag {
    vector<int> items_;
public:
    Bag(initializer_list<int> xs) : items_(xs) { cout << "list ctor with " << xs.size() << " items\n"; }
    Bag(int count, int value) : items_(count, value) { cout << "(count, value) ctor\n"; }
    size_t size() const { return items_.size(); }
};

int main() {
    Bag a{1, 2, 3};          // initializer_list constructor
    Bag b(4, 9);             // parentheses: the (count, value) one
    Bag c{4, 9};             // braces PREFER initializer_list: two items, 4 and 9!
    cout << a.size() << " " << b.size() << " " << c.size() << "\n";
}
```

## Constructors that cannot succeed

A constructor has no return value. If it cannot create a valid object, **throw an exception**. The half-built object is never used, and the members already built are destroyed correctly.

When exceptions are not allowed, use a **static factory** that returns `std::optional` or an error value, and make the constructor private:

```cpp run title="Named constructor (static factory) instead of throwing"
#include <iostream>
#include <optional>
#include <string>
using namespace std;

class Email {
    string value_;
    explicit Email(string v) : value_(move(v)) {}              // private: only create() can build one
public:
    static optional<Email> create(const string& s) {
        if (s.find('@') == string::npos) return nullopt;
        return Email(s);
    }
    const string& str() const { return value_; }
};

int main() {
    if (auto e = Email::create("asha@example.com")) cout << "valid: " << e->str() << "\n";
    if (!Email::create("not-an-email")) cout << "invalid rejected\n";
}
```

:::interview Rapid-fire constructor questions
- *Can a constructor be virtual?* No: the vptr is not set up before construction. Use a factory for "virtual construction".
- *Can a constructor be `private`?* Yes: for Singleton, factories, and non-instantiable classes.
- *Order of construction?* Base classes, then members in declaration order, then the constructor body.
- *What if I write only a parameterised constructor?* There is no default constructor any more.
- *`Foo f();` vs `Foo f;`?* The first declares a function.
:::

```quiz
? In what order are members initialised?
- In the order of the initialiser list
+ In the order they are declared in the class
- Alphabetically
> The initialiser list order is ignored. Match the two to avoid surprises (and the -Wreorder warning).
? Why mark a single-argument constructor `explicit`?
- It makes it faster
+ It stops silent implicit conversions such as passing 5.5 where a Seconds is expected
- It is required for const members
> Unwanted implicit conversion causes hard-to-see bugs and wrong overload choices.
? `Bag c{4, 9};` with an initializer_list<int> constructor available creates...
- four nines
+ two elements: 4 and 9
- a compile error
> Brace-init prefers the initializer_list constructor when one is viable.
```

:::keypoints
- A constructor establishes the invariant. Use the initialiser list; it is required for const and reference members.
- Members initialise in **declaration order**, whatever the list order says.
- Use default member initialisers and delegating constructors to avoid repetition.
- Mark single-argument constructors `explicit`. Throw from a constructor that cannot succeed, or use a factory.
:::
