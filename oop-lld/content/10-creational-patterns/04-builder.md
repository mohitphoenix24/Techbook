---
title: Builder
level: intermediate
time: 35
summary: How to create an object that has many parts, step by step, in a clear and safe way. See the problem with long constructors, a builder with checks, the Director, a modern C++20 shortcut, and when not to use a builder.
---

## What problem does Builder solve?

Think of ordering a pizza at a counter. You don't say all your choices in one breath in a fixed order. You say: "Large size... thin crust... extra cheese... no olives." Then the cook makes it.

In code, some objects have many parts, and many of them are optional. A constructor with 8 parameters is very hard to read. The **Builder** lets you say your choices one by one, with names.

:::def Builder
Build a complex object **step by step**, using named steps. At the end you call `build()` to get the finished object.
:::

## The problem: long constructors

```cpp run title="Which argument is which?"
#include <iostream>
#include <string>
using namespace std;

struct Pizza {
    string size, crust, sauce;
    bool cheese, pepperoni, mushrooms, olives;
    Pizza(string size, string crust, string sauce, bool cheese, bool pepperoni, bool mushrooms, bool olives)
        : size(move(size)), crust(move(crust)), sauce(move(sauce)), cheese(cheese), pepperoni(pepperoni), mushrooms(mushrooms), olives(olives) {}
};

int main() {
    // What does this mean? Which true/false is which topping? Easy to swap by mistake and nothing warns you.
    Pizza p("large", "thin", "tomato", true, false, true, false);
    cout << p.size << " " << p.crust << " mushrooms=" << p.mushrooms << " olives=" << p.olives << "\n";
}
```

Look at that call. Can you tell which argument is which? Problems:

- It is **hard to read**.
- It is **easy to mix up** arguments that have the same type.
- You may need a different constructor for each combination of optional parts.
- There is nowhere to **check** whether the combination is valid.

## The Builder way

```cpp run title="A fluent builder with validation"
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
using namespace std;

class Pizza {
    string size_, crust_, sauce_;
    set<string> toppings_;
    Pizza() = default;                                       // only the builder can create one
    friend class PizzaBuilder;
public:
    string describe() const {
        string s = size_ + " " + crust_ + " crust, " + sauce_ + " sauce, toppings:";
        if (toppings_.empty()) s += " none";
        for (const auto& t : toppings_) s += " " + t;
        return s;
    }
};

class PizzaBuilder {
    Pizza p_;
public:
    PizzaBuilder& size(string s)   { p_.size_ = move(s); return *this; }
    PizzaBuilder& crust(string c)  { p_.crust_ = move(c); return *this; }
    PizzaBuilder& sauce(string s)  { p_.sauce_ = move(s); return *this; }
    PizzaBuilder& topping(string t){ p_.toppings_.insert(move(t)); return *this; }
    Pizza build() const {
        if (p_.size_.empty()) throw logic_error("a pizza needs a size");              // validate in ONE place
        if (p_.toppings_.size() > 4) throw logic_error("too many toppings");
        return p_;
    }
};

int main() {
    Pizza margherita = PizzaBuilder().size("large").crust("thin").sauce("tomato").topping("cheese").build();
    cout << margherita.describe() << "\n";

    Pizza plain = PizzaBuilder().size("small").crust("pan").sauce("pesto").build();
    cout << plain.describe() << "\n";

    try { PizzaBuilder().crust("thin").build(); } catch (const exception& e) { cout << "rejected: " << e.what() << "\n"; }
}
```

What do we get?

- **Easy to read**: each value has a name, like `.size("large")`.
- **Optional parts** are just skipped.
- **One place to check** everything: `build()`. Once the object is built, it is always valid.
- The finished object can be **unchangeable** (no setters). Only the builder changes things.

The picture:

```viz algo=uml title="Builder (fluent form)"
class Pizza
  - size: string
  - crust: string
  - toppings: set<string>
  + describe(): string
class PizzaBuilder
  + size(s: string): PizzaBuilder&
  + crust(c: string): PizzaBuilder&
  + topping(t: string): PizzaBuilder&
  + build(): Pizza
PizzaBuilder ..> Pizza : creates
```

## Builder with a Director (the classic form)

A **Director** is a helper that knows a **recipe**: "to make a standard pizza, do these steps in this order". Different builders can follow the same recipe and produce different results.

```cpp run title="Director and two builders (two representations)"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

// Two different "products" built from the same recipe
struct HtmlDoc { string text; };
struct MarkdownDoc { string text; };

struct DocBuilder {                                        // the abstract builder
    virtual ~DocBuilder() = default;
    virtual void title(const string& t) = 0;
    virtual void paragraph(const string& p) = 0;
    virtual void bullet(const string& b) = 0;
};
class HtmlBuilder : public DocBuilder {
    HtmlDoc doc_;
public:
    void title(const string& t) override { doc_.text += "<h1>" + t + "</h1>"; }
    void paragraph(const string& p) override { doc_.text += "<p>" + p + "</p>"; }
    void bullet(const string& b) override { doc_.text += "<li>" + b + "</li>"; }
    HtmlDoc result() { return doc_; }
};
class MarkdownBuilder : public DocBuilder {
    MarkdownDoc doc_;
public:
    void title(const string& t) override { doc_.text += "# " + t + "\n"; }
    void paragraph(const string& p) override { doc_.text += p + "\n"; }
    void bullet(const string& b) override { doc_.text += "- " + b + "\n"; }
    MarkdownDoc result() { return doc_; }
};

class Director {                                           // knows the recipe, not the format
public:
    void buildReleaseNotes(DocBuilder& b) const {
        b.title("Release 2.0");
        b.paragraph("What is new:");
        b.bullet("faster startup");
        b.bullet("dark mode");
    }
};

int main() {
    Director d;
    HtmlBuilder html;  d.buildReleaseNotes(html);
    MarkdownBuilder md; d.buildReleaseNotes(md);
    cout << html.result().text << "\n---\n" << md.result().text;
}
```

## A modern shortcut in C++20: designated initialisers

If the object is just plain data and all fields are optional, you may not need a builder class at all.

```cpp run title="Named fields without a builder"
#include <iostream>
#include <string>
using namespace std;

struct HttpRequest {
    string method = "GET";
    string url;
    int timeoutMs = 3000;
    bool followRedirects = true;
};

int main() {
    HttpRequest a{.url = "https://example.com"};                                  // everything else defaults
    HttpRequest b{.method = "POST", .url = "https://example.com/api", .timeoutMs = 500};
    cout << a.method << " " << a.url << " " << a.timeoutMs << "\n";
    cout << b.method << " " << b.url << " " << b.timeoutMs << " " << b.followRedirects << "\n";
}
```

Rule of thumb:

- **Plain data, no checks** → designated initialisers.
- **Checks across fields, calculated values, an unchangeable object, or many steps** → Builder.

## Step builder: the compiler forces the order

You can make the compiler stop you from forgetting a required field. Each step returns a **different type**, so the next step is available only after the previous one.

```cpp run title="A step builder: name, then email, then optionally phone"
#include <iostream>
#include <string>
using namespace std;

struct User {
    string name, email, phone;
};

class UserBuilder {
public:
    class WithEmail;                                           // forward declarations of the step types
    class Complete;

    class Start {
    public:
        WithEmail name(string n);                              // the ONLY thing you can call first
    };
    class WithEmail {
        string name_;
    public:
        explicit WithEmail(string n) : name_(move(n)) {}
        Complete email(string e);                              // the ONLY thing you can call next
    };
    class Complete {
        User u_;
    public:
        explicit Complete(User u) : u_(move(u)) {}
        Complete& phone(string p) { u_.phone = move(p); return *this; }   // optional
        User build() const { return u_; }                      // available only at this stage
    };
    static Start create() { return Start{}; }
};
UserBuilder::WithEmail UserBuilder::Start::name(string n) { return WithEmail(move(n)); }
UserBuilder::Complete UserBuilder::WithEmail::email(string e) { return Complete(User{name_, move(e), ""}); }

int main() {
    User u = UserBuilder::create().name("Asha").email("asha@example.com").phone("98765").build();
    cout << u.name << " " << u.email << " " << u.phone << "\n";
    // UserBuilder::create().email("x").build();              // compile error: Start has no email()
    // UserBuilder::create().name("A").build();               // compile error: WithEmail has no build()
}
```

If you forget the email, the code does not even compile. The cost is extra code, so use this only for important objects.

## When NOT to use Builder

- The object has only **2 or 3 parameters** and no tricky rules. A normal constructor is fine.
- A simple struct with defaults is enough.
- The builder would just copy every field with nothing extra to add.

## Builder vs similar patterns

| | Builder | Abstract Factory | Factory Method |
|---|---|---|---|
| Focus | **one big object**, built in steps | **families** of objects | **one object**, chosen by a subclass |
| When you get the object | at the end, with `build()` | at once | at once |
| Typical sign | many optional parameters | "the set must match" | `new` hidden behind a virtual call |

## Short answer to say in an interview

:::interview Why use a Builder instead of a constructor with many parameters?
"A builder gives a name to every value, lets me skip optional parts, and checks the whole object once in build(). So an object that is built is always valid. The product can also be unchangeable, because only the builder changes the data. For a plain struct in C++20 I would just use designated initialisers."
:::

```quiz
? What problem does Builder solve?
- Creating exactly one object
+ Creating complex objects with many (often optional) parts in a readable and safe way
- Choosing a subclass at run time
> Named steps replace long confusing constructors.
? Where should the check across fields go?
- In every setter
+ In build(), when all values are known
- Nowhere
> At the end you can check the whole combination once.
? When can you skip a builder in modern C++?
- Never
+ For simple structs, where designated initialisers give readable named fields
> Use a builder when you need checks, an unchangeable object or many steps.
```

:::keypoints
- Builder = build step by step with names, check in `build()`, get a valid (often unchangeable) object.
- The classic form adds a Director that holds the recipe, and different builders for different results.
- In C++20, designated initialisers replace simple builders. A step builder makes the compiler enforce the order.
:::
