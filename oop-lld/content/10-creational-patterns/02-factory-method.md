---
title: Factory Method and Simple Factory
level: intermediate
time: 35
summary: Moving object creation out of client code. A simple factory function, the Factory Method pattern with creator and product hierarchies, a self-registering registry factory, and how to choose between them.
---

:::def Factory Method
Define an interface for **creating an object**, but let **subclasses decide which class to instantiate**. Factory Method lets a class defer instantiation to subclasses.
:::

The problem it solves: client code that writes `new Concrete...` is welded to that concrete type. When the type to create varies (by input, config, platform), those `if/else` chains spread everywhere.

## The problem

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

## Step 1: Simple Factory (a function)

Move the decision into **one function**. Not a GoF pattern, but the 80% solution.

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

Clients now depend only on `Parser` and `makeParser`. Adding a format means editing the factory function (a small violation of OCP, acceptable for a central switch).

## Step 2: the Factory Method pattern

In the real pattern, an abstract **Creator** has a *factory method* that subclasses override to create their own **Product**. The creator's other code uses the product through its interface and never names the concrete class.

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

`Application::openDocument` contains the shared workflow and has no idea which `Document` it will get. A new `ExcelApplication` plus `ExcelDocument` is two new classes and no edits (OCP). This is also the **Template Method** pattern in disguise: the workflow is a template, and `createDocument` is the hook.

## Step 3: a registry factory (open without editing)

A switch in a factory function still needs editing for every new type. A **registry** lets each class *register itself*, so the factory never changes.

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

The names can now come from a file or user input. Plug-in systems work like this.

## Choosing

| Approach | Use when | Extension cost |
|---|---|---|
| `new` directly | one concrete type, no variation | n/a |
| **Simple factory function** | a central place picks the type from input/config | edit one function |
| **Factory Method** (subclass decides) | a framework class has a workflow and defers *what* to create to subclasses | new subclass |
| **Registry factory** | types are plugged in by name, possibly by other modules | register a creator |
| **Abstract Factory** (next lesson) | you must create a *family* of related objects consistently | new family class |

## Factory Method vs Simple Factory vs Abstract Factory (a classic question)

- **Simple Factory**: one function/class with a conditional that returns different products.
- **Factory Method**: **inheritance**. A creator class has a virtual method that subclasses override to create products.
- **Abstract Factory**: **composition**. An object with *several* creation methods that produces a **family** of related products.

:::interview Why use a factory instead of `new`?
"Constructors fix the concrete type at the call site. A factory centralises the decision, so clients depend on an interface and never name concrete classes. That lets me add types without changing client code, choose the type from configuration, and substitute fakes in tests. A factory can also return a smart pointer to express ownership, and can hide complex setup."
:::

```quiz
? In the Factory Method pattern, who decides which concrete product is created?
- The client
+ The creator's subclass, by overriding the factory method
- The product
> The base creator has a virtual method; each subclass returns its own product type.
? What advantage does a registry factory have over a switch-based one?
- It is faster
+ New types register themselves, so the factory never needs editing
- It uses less memory
> That is OCP applied to the factory itself.
? Which statement is correct?
- Simple Factory is a GoF pattern
+ Simple Factory is a common idiom, not one of the 23 GoF patterns; Factory Method is
> The GoF "Factory Method" involves a creator hierarchy; a simple factory is just a function.
```

:::keypoints
- Move creation out of client code: clients depend on the product interface only.
- Simple factory: one function. Factory Method: a virtual creation method in a creator, overridden by subclasses. Registry factory: self-registering creators.
- Return `unique_ptr<Base>` to express ownership. A new product should not require editing clients.
:::
