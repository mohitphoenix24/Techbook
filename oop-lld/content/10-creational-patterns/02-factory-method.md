---
title: Factory Method and Simple Factory
level: intermediate
time: 35
summary: Do not create objects with `new` all over your code. Learn the simple factory function, the Factory Method pattern, and a self-registering factory, and when to use each.
---

## What problem does a factory solve?

Imagine your code says `new PdfParser` in ten places. Tomorrow you must also support JSON. Now you must open all ten places and add `if / else`. That is painful and risky.

A **factory** is just **one place that creates the objects for you**. The rest of the code asks the factory: "give me a parser for this format", and does not care which class comes back.

:::def Factory Method
Define one method for **creating an object**, and let **subclasses decide** which exact class to create.
:::

## The problem in code

```cpp run title="Creation logic scattered through the client"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Parser { virtual ~Parser() = default; virtual string parse(const string& text) = 0; };
struct JsonParser : Parser { string parse(const string& t) override { return "JSON(" + t + ")"; } };
struct XmlParser  : Parser { string parse(const string& t) override { return "XML(" + t + ")"; } };

int main() {
    string format = "json";
    unique_ptr<Parser> p;                                 // this if/else must be repeated at every place that needs a parser
    if (format == "json") p = make_unique<JsonParser>();
    else if (format == "xml") p = make_unique<XmlParser>();
    cout << p->parse("data") << "\n";
}
```

The creation logic is spread everywhere. Every new type means editing all those places.

## Step 1: Simple Factory (just a function)

Move the decision into **one function**. This is not an official "GoF" pattern, but it solves most real problems.

```cpp run title="Simple factory function"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

struct Parser { virtual ~Parser() = default; virtual string parse(const string& text) = 0; };
struct JsonParser : Parser { string parse(const string& t) override { return "JSON(" + t + ")"; } };
struct XmlParser  : Parser { string parse(const string& t) override { return "XML(" + t + ")"; } };
struct CsvParser  : Parser { string parse(const string& t) override { return "CSV(" + t + ")"; } };

unique_ptr<Parser> makeParser(const string& format) {          // ONE place knows the concrete types
    if (format == "json") return make_unique<JsonParser>();
    if (format == "xml")  return make_unique<XmlParser>();
    if (format == "csv")  return make_unique<CsvParser>();
    throw invalid_argument("unsupported format: " + format);
}

int main() {
    for (const char* f : {"json", "xml", "csv"}) cout << makeParser(f)->parse("data") << "\n";
    try { makeParser("yaml"); } catch (const exception& e) { cout << e.what() << "\n"; }
}
```

Now the rest of the code knows only `Parser` and `makeParser`. When we add a new format, we edit only the factory function. That is a small break of the "closed for editing" rule, but it is fine because the change is in one place.

## Step 2: The Factory Method pattern

In the real pattern, there is a base class (the **creator**) with a method that creates a product. Each subclass **overrides that method** to create its own kind of product. The base class does the common work and uses the product only through its interface.

```viz algo=uml title="Factory Method"
abstract class Application
  + openDocument(): void
  # createDocument(): Document
interface Document
  + open(): void
  + save(): void
class PdfApplication
  # createDocument(): Document
class WordApplication
  # createDocument(): Document
class PdfDocument
class WordDocument
PdfApplication --|> Application
WordApplication --|> Application
PdfDocument ..|> Document
WordDocument ..|> Document
Application ..> Document
PdfApplication ..> PdfDocument : creates
WordApplication ..> WordDocument : creates
```

```cpp run title="Factory Method: the creator's workflow, the subclass's product"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Document {                                         // the product interface
public:
    virtual ~Document() = default;
    virtual void open() = 0;
    virtual void save() = 0;
};
class PdfDocument : public Document {
public:
    void open() override { cout << "  PDF: rendering pages\n"; }
    void save() override { cout << "  PDF: exporting to .pdf\n"; }
};
class WordDocument : public Document {
public:
    void open() override { cout << "  Word: loading .docx\n"; }
    void save() override { cout << "  Word: writing .docx\n"; }
};

class Application {                                      // the creator
public:
    virtual ~Application() = default;
    void openDocument(const string& name) {              // the workflow is written ONCE, against the interface
        cout << "opening " << name << "\n";
        auto doc = createDocument();                     // <-- the factory method: subclasses decide the type
        doc->open();
        doc->save();
    }
protected:
    virtual unique_ptr<Document> createDocument() = 0;
};
class PdfApplication : public Application {
protected:
    unique_ptr<Document> createDocument() override { return make_unique<PdfDocument>(); }
};
class WordApplication : public Application {
protected:
    unique_ptr<Document> createDocument() override { return make_unique<WordDocument>(); }
};

int main() {
    PdfApplication pdf;
    WordApplication word;
    pdf.openDocument("report");
    word.openDocument("letter");
}
```

Read it like this:

- `Application::openDocument` contains the **steps that are the same for everyone** (create, open, show).
- It has no idea which `Document` it gets. A subclass decides.
- To support Excel, add `ExcelApplication` and `ExcelDocument`. **Two new classes, no edits.**

(If you have seen the Template Method pattern: this is similar. The steps are the template, and `createDocument` is the part that changes.)

## Step 3: A registry (add new types without editing the factory)

A `switch` inside the factory still needs an edit for each new type. A **registry** fixes this. Each class **registers itself** with the factory, so the factory never changes.

```cpp run title="Registry-based factory"
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

struct Shape { virtual ~Shape() = default; virtual string draw() const = 0; };

class ShapeFactory {
public:
    using Creator = function<unique_ptr<Shape>()>;
    static ShapeFactory& instance() { static ShapeFactory f; return f; }
    bool add(const string& name, Creator c) { return creators_.emplace(name, move(c)).second; }
    unique_ptr<Shape> create(const string& name) const {
        auto it = creators_.find(name);
        if (it == creators_.end()) throw invalid_argument("unknown shape: " + name);
        return it->second();
    }
private:
    map<string, Creator> creators_;
};

// Each shape registers itself. Adding a shape = adding a class + one registration line. The factory is never edited.
struct Circle : Shape { string draw() const override { return "()"; } };
struct Square : Shape { string draw() const override { return "[]"; } };
struct Star   : Shape { string draw() const override { return "*"; } };

static bool regCircle = ShapeFactory::instance().add("circle", [] { return make_unique<Circle>(); });
static bool regSquare = ShapeFactory::instance().add("square", [] { return make_unique<Square>(); });
static bool regStar   = ShapeFactory::instance().add("star",   [] { return make_unique<Star>(); });

int main() {
    for (const char* n : {"circle", "star", "square"}) cout << n << " -> " << ShapeFactory::instance().create(n)->draw() << "\n";
    try { ShapeFactory::instance().create("hexagon"); } catch (const exception& e) { cout << e.what() << "\n"; }
    (void)regCircle; (void)regSquare; (void)regStar;
}
```

Now the names can even come from a file or from the user. Plug-in systems work like this.

## Which one should I use?

| Approach | Use it when | Cost to add a new type |
|---|---|---|
| plain `new` | only one type, nothing varies | none |
| **Simple factory function** | one place picks the type from input or config | edit one function |
| **Factory Method** | a base class has the workflow, and subclasses decide the product | add a subclass |
| **Registry factory** | types are plugged in by name, maybe from other modules | register a creator |
| **Abstract Factory** (next lesson) | you must create a whole matching set of objects | add a new factory class |

## A classic interview question: three kinds of factory

- **Simple Factory**: one function with an `if / switch` that returns different objects.
- **Factory Method**: uses **inheritance**. A subclass overrides the method that creates the product.
- **Abstract Factory**: uses **composition**. One object has *several* create methods and makes a whole **family** of products.

## Short answer to say in an interview

:::interview Why use a factory instead of new?
"With new, the exact class is fixed at the place where I write it. A factory puts the decision in one place, so the rest of the code depends only on an interface. I can add new types without changing the users, choose the type from config, and use fakes in tests. A factory can also return a smart pointer to show who owns the object."
:::

```quiz
? In the Factory Method pattern, who decides which exact product is created?
- The client
+ A subclass of the creator, by overriding the factory method
- The product
> The base class has a method, and each subclass returns its own product.
? What is the advantage of a registry factory over a switch?
- It is faster
+ New types register themselves, so the factory never needs editing
- It uses less memory
> This keeps the factory closed for editing.
? Which statement is correct?
- Simple Factory is one of the 23 GoF patterns
+ Simple Factory is a common idiom, but not one of the 23 GoF patterns. Factory Method is.
> The GoF Factory Method needs a creator class hierarchy.
```

:::keypoints
- Take creation out of the users' code. They depend only on an interface.
- Simple factory = one function. Factory Method = subclasses override the creation method. Registry = self-registering creators.
- Return `unique_ptr<Base>` to show ownership. A new product should not need edits in the users.
:::
