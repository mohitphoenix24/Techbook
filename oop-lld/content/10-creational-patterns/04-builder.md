---
title: Builder
level: intermediate
time: 35
summary: Constructing complex objects step by step. The telescoping-constructor problem, a fluent builder with validation, a Director, designated initialisers as the modern shortcut, a step builder that enforces order at compile time, and when not to use a builder.
---

:::def Builder
Separate the **construction** of a complex object from its **representation**, so the same construction process can create different representations. In practice: build an object **step by step** with named steps, then finish with `build()`.
:::

## The problem: telescoping constructors

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

Problems: **unreadable** call sites, **easy to swap** same-typed arguments, a constructor for every combination of optional parts, and no place to **validate** a combination.

## The Builder

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

What the builder gives you:

- **Readable** call sites: every value has a name (`.size("large")`).
- **Optional** parts are simply omitted; no constructor per combination.
- A single place (`build()`) to **validate** the whole object, so the product is **always valid** once built.
- The product can be **immutable** (no setters; the builder alone mutates).

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

## Builder with a Director (the classic GoF form)

A **Director** knows a *recipe*: the order of steps to build a common configuration. Different builders produce different representations from the same recipe.

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

## Modern shortcut: designated initialisers (C++20)

For a simple data object whose fields are all optional, you often do **not** need a builder class.

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

Use designated initialisers for **plain aggregates without validation**. Use a builder when you need **validation across fields**, **derived values**, an **immutable product**, or **multi-step construction**.

## Step builder: enforce the order at compile time

You can make the compiler refuse an incomplete or out-of-order build by returning a **different type** at each step.

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

Required fields cannot be forgotten: the code does not compile. The cost is more boilerplate, so use it for high-stakes objects only.

## When NOT to use Builder

- The object has **2 or 3 parameters** and no invalid combinations: use a constructor.
- A plain **aggregate** with defaults is enough (designated initialisers).
- The builder would just mirror the class's fields one for one with nothing else to add.

## Builder vs related patterns

| | Builder | Abstract Factory | Factory Method |
|---|---|---|---|
| Focus | **one complex object**, built in steps | **families** of objects | **one object**, chosen by subclass |
| Return | at the end, `build()` | immediately | immediately |
| Typical sign | many optional parameters | "mix of products must match" | `new` hidden behind a virtual call |

:::interview Builder vs constructor with many parameters? Why is the product often immutable?
"A builder names each value, lets optional parts be omitted, and validates the complete object once in `build()`, so a built object is always valid. The product can be immutable because only the builder mutates its internal state. In C++20 I may use designated initialisers for simple aggregates, and a builder when I need cross-field validation, immutability or multi-step construction."
:::

```quiz
? What problem does Builder solve?
- Creating exactly one instance
+ Constructing complex objects with many (often optional) parts readably and safely
- Choosing a subclass at runtime
> The builder replaces long positional constructors with named steps and validation.
? Where should cross-field validation live in a builder?
- In every setter
+ In build(), where the complete object is known
- Nowhere
> At build time you know all fields, so you can check combinations once.
? When can you skip Builder in modern C++?
- Never
+ For simple aggregates where designated initialisers give readable named fields
> Use builders when you need validation, immutability or step-wise construction.
```

:::keypoints
- Builder: step-by-step construction with named steps, validation in `build()`, an always-valid (often immutable) product.
- The classic GoF form adds a Director that owns the recipe and swappable builders for different representations.
- C++20 designated initialisers replace simple builders; a step builder uses types to enforce order at compile time.
:::
