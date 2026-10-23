---
title: Abstract Factory
level: intermediate
time: 30
summary: Creating families of related objects that must be used together (UI themes, database drivers, cross-platform widgets), the structure, a full C++ example, what is easy and what is hard to extend, and how it differs from Factory Method.
---

:::def Abstract Factory
Provide an interface for creating **families of related or dependent objects** without specifying their concrete classes.
:::

The key idea: products belong to **families**, and you must not mix families. A `DarkButton` with a `LightCheckbox` looks wrong. A `PostgresConnection` with a `MySqlCommand` crashes. An abstract factory guarantees that everything you create comes from the same family.

## The structure

```viz algo=uml title="Abstract Factory: two families, two products"
interface UiFactory
  + createButton(): Button
  + createCheckbox(): Checkbox
class LightFactory
class DarkFactory
interface Button
  + render(): string
interface Checkbox
  + render(): string
class LightButton
class DarkButton
class LightCheckbox
class DarkCheckbox
class Application
  - factory: UiFactory
LightFactory ..|> UiFactory
DarkFactory ..|> UiFactory
LightButton ..|> Button
DarkButton ..|> Button
LightCheckbox ..|> Checkbox
DarkCheckbox ..|> Checkbox
Application --> UiFactory
UiFactory ..> Button
UiFactory ..> Checkbox
```

## A complete example: themed UI

```cpp run title="Abstract Factory: one switch picks a whole family"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

// ---- product interfaces ----
struct Button   { virtual ~Button() = default;   virtual string render() const = 0; };
struct Checkbox { virtual ~Checkbox() = default; virtual string render() const = 0; };

// ---- family 1: light ----
struct LightButton   : Button   { string render() const override { return "[ Light Button ]"; } };
struct LightCheckbox : Checkbox { string render() const override { return "[ ] Light Checkbox"; } };
// ---- family 2: dark ----
struct DarkButton   : Button   { string render() const override { return "[# Dark Button #]"; } };
struct DarkCheckbox : Checkbox { string render() const override { return "[#] Dark Checkbox"; } };

// ---- the abstract factory ----
struct UiFactory {
    virtual ~UiFactory() = default;
    virtual unique_ptr<Button> createButton() const = 0;
    virtual unique_ptr<Checkbox> createCheckbox() const = 0;
};
struct LightFactory : UiFactory {
    unique_ptr<Button> createButton() const override { return make_unique<LightButton>(); }
    unique_ptr<Checkbox> createCheckbox() const override { return make_unique<LightCheckbox>(); }
};
struct DarkFactory : UiFactory {
    unique_ptr<Button> createButton() const override { return make_unique<DarkButton>(); }
    unique_ptr<Checkbox> createCheckbox() const override { return make_unique<DarkCheckbox>(); }
};

// ---- client code: knows ONLY the interfaces ----
class SettingsScreen {
    unique_ptr<Button> save_;
    unique_ptr<Checkbox> notify_;
public:
    explicit SettingsScreen(const UiFactory& f) : save_(f.createButton()), notify_(f.createCheckbox()) {}
    void show() const { cout << "  " << notify_->render() << "   " << save_->render() << "\n"; }
};

unique_ptr<UiFactory> factoryFor(const string& theme) {           // the ONE place that chooses the family
    if (theme == "dark") return make_unique<DarkFactory>();
    return make_unique<LightFactory>();
}

int main() {
    for (const char* theme : {"light", "dark"}) {
        cout << theme << " theme:\n";
        SettingsScreen(*factoryFor(theme)).show();
    }
}
```

`SettingsScreen` can never get a dark button with a light checkbox: both come from the same factory object. Switching the whole application to a new theme means passing a different factory.

## A second example: database drivers

A real use: an application talks to several databases. Each database has a *connection* and a *command*, and they must match.

```cpp run title="Abstract Factory for database access"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Connection { virtual ~Connection() = default; virtual string open() const = 0; };
struct Command    { virtual ~Command() = default;    virtual string run(const string& sql) const = 0; };

struct PgConnection : Connection { string open() const override { return "postgres://connected"; } };
struct PgCommand    : Command    { string run(const string& sql) const override { return "PG executed: " + sql; } };
struct MyConnection : Connection { string open() const override { return "mysql://connected"; } };
struct MyCommand    : Command    { string run(const string& sql) const override { return "MySQL executed: " + sql; } };

struct DbFactory {
    virtual ~DbFactory() = default;
    virtual unique_ptr<Connection> connection() const = 0;
    virtual unique_ptr<Command> command() const = 0;
};
struct PgFactory : DbFactory {
    unique_ptr<Connection> connection() const override { return make_unique<PgConnection>(); }
    unique_ptr<Command> command() const override { return make_unique<PgCommand>(); }
};
struct MyFactory : DbFactory {
    unique_ptr<Connection> connection() const override { return make_unique<MyConnection>(); }
    unique_ptr<Command> command() const override { return make_unique<MyCommand>(); }
};

class UserRepository {                                    // business code independent of the database
    unique_ptr<Connection> conn_;
    unique_ptr<Command> cmd_;
public:
    explicit UserRepository(const DbFactory& f) : conn_(f.connection()), cmd_(f.command()) {}
    void createUser(const string& name) const {
        cout << "  " << conn_->open() << "\n  " << cmd_->run("INSERT INTO users VALUES ('" + name + "')") << "\n";
    }
};

int main() {
    PgFactory pg; MyFactory my;
    UserRepository(pg).createUser("asha");
    UserRepository(my).createUser("ravi");
}
```

## What is easy and what is hard

| Change | Effort |
|---|---|
| Add a **new family** (e.g. `HighContrastFactory`) | easy: one factory + its product classes; nothing existing changes (OCP) |
| Add a **new product** to every family (e.g. `Slider`) | **hard**: change the abstract factory interface and *every* concrete factory |
| Guarantee products match | built in |

This asymmetry is the main trade-off, and a typical interview question. Abstract Factory fits when the **set of product types is stable** but the **number of families grows**.

## Abstract Factory vs Factory Method

| | Factory Method | Abstract Factory |
|---|---|---|
| Creates | **one** product | a **family** of related products |
| Mechanism | **inheritance**: a subclass overrides one creation method | **composition**: a factory *object* is passed to the client |
| Typical shape | a method in a creator class | an object with several `create...()` methods |
| Often implemented with | a virtual method | several Factory Methods inside one class |

An Abstract Factory is frequently *made of* Factory Methods.

## Related patterns

- Often combined with **Singleton** (one factory per family) or chosen via a **registry**.
- The factories are a natural place for **Prototype** (clone prototypes instead of calling constructors).
- **Builder** is for a *complex single object*, Abstract Factory for *families of simple objects*.

:::interview When would you use an Abstract Factory?
"When a system must work with several families of related objects, and objects from one family must be used together, for example themed UI widgets, cross-platform controls, or the connection and command classes of a database driver. The client holds an abstract factory and creates everything through it, so it can never mix families, and switching the family is a single decision at start-up. The drawback is that adding a new product type means changing all factories."
:::

```quiz
? What does an Abstract Factory guarantee?
- Faster object creation
+ All objects created through it belong to the same family and fit together
- That objects are singletons
> It enforces consistency among related products.
? Which is harder with Abstract Factory?
- Adding a new family
+ Adding a new kind of product to all families
- Switching families at start-up
> New product types force changes in the factory interface and every concrete factory.
? How does Abstract Factory differ from Factory Method?
- No difference
+ It creates a family of products using a factory object (composition) instead of one product via subclassing
> Factory Method is inheritance-based and single-product.
```

:::keypoints
- Abstract Factory: an interface with several creation methods that produce a consistent family.
- The client uses only interfaces and receives a factory; one decision selects the whole family.
- Easy to add families, hard to add product types. Uses composition; Factory Method uses inheritance.
:::
