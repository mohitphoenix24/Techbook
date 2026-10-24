---
title: Abstract Factory
level: intermediate
time: 30
summary: How to create a whole matching set of objects (like a dark theme or a light theme) so that they always fit together. Includes a UI theme example, a database example, and the difference from Factory Method.
---

## What problem does it solve?

Think of buying a **matching set** of furniture: a sofa, a table and a chair in the same style. You do not want a modern sofa with an antique chair.

In code it is the same. A `DarkButton` with a `LightCheckbox` looks wrong. A `PostgresConnection` with a `MySqlCommand` will crash. We need a way to make sure **everything we create comes from the same set**.

:::def Abstract Factory
An interface for creating **a family of matching objects**, without saying which exact classes they are.
:::

In simple words: **one factory that makes a whole matching set.**

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

Look at the picture: there are two families (Dark and Light). Each family has its own factory. Each factory can create a button and a checkbox of **its own style**.

## A full example: UI themes

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

`SettingsScreen` can **never** get a dark button with a light checkbox, because both come from the same factory. To switch the whole app to another theme, we just pass a different factory. One decision, everything changes together.

## Another example: database drivers

An app may talk to different databases. Each database has a *connection* and a *command*, and they must match.

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

## What is easy, and what is hard?

| Change | How hard? |
|---|---|
| Add a **new family** (like `HighContrastFactory`) | **easy**: add one factory and its products. Nothing old changes. |
| Add a **new product** to every family (like `Slider`) | **hard**: you must change the factory interface and **every** factory |
| Make sure products match | built in |

This is the main trade-off, and a very common interview question. Abstract Factory is a good fit when the **kinds of products stay the same** but **new families keep coming**.

## Abstract Factory vs Factory Method

| | Factory Method | Abstract Factory |
|---|---|---|
| Creates | **one** product | a **family** of matching products |
| How | **inheritance**: a subclass overrides one method | **composition**: you pass a factory object to the user |
| Looks like | one method in a creator class | one object with several `create...()` methods |

An Abstract Factory is often **built from several Factory Methods**.

## Related ideas

- You often make only **one factory per family** (Singleton), or pick it by name from a registry.
- **Builder** is for building *one complex object*. Abstract Factory is for *sets of simple objects*.

## Short answer to say in an interview

:::interview When do you use an Abstract Factory?
"When the program must use families of related objects, and objects from one family must be used together. For example, UI widgets for a theme, or a connection and a command for one database. The user holds a factory and creates everything through it, so it can never mix families. The drawback is that adding a new kind of product means changing every factory."
:::

```quiz
? What does an Abstract Factory guarantee?
- Faster object creation
+ All the objects it creates belong to the same family and fit together
- That objects are singletons
> It keeps related products consistent.
? What is harder with an Abstract Factory?
- Adding a new family
+ Adding a new kind of product to all families
- Switching the family at start-up
> A new product type changes the interface and every factory.
? How is it different from Factory Method?
- No difference
+ It makes a family of products using a factory object, not one product through subclassing
> Factory Method uses inheritance and makes one product.
```

:::keypoints
- Abstract Factory = one interface with several create methods that makes a matching family.
- The user works only with interfaces. One choice of factory picks the whole family.
- Easy to add families, hard to add product types. It uses composition. Factory Method uses inheritance.
:::
