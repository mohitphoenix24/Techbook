---
title: Composite
level: intermediate
time: 35
summary: Treat a single item and a group of items in the same way, using a tree. See a files-and-folders example, a search, an expression tree, and the design choices.
---

## What is the Composite pattern?

Don't memorise the definition yet. Think of it like this:

> "A folder can contain files and other folders. But when I ask 'what is your size?', I do not want to care whether it is a file or a folder. I just ask."

That is the whole idea. You treat **one item** and **a group of items** in the **same way**.

:::def Composite
Arrange objects in a **tree**, so that a single object and a group of objects can be used **through the same interface**.
:::

You see trees everywhere: files and folders, a screen with buttons inside panels inside windows, a company with employees and managers, a menu with items and submenus, a maths expression like `(2 + 3) * 4`.

## The idea in three roles

- **Component**: the common interface (for example `size()`).
- **Leaf**: a simple item with no children (a file). It does the work itself.
- **Composite**: an item that holds children (a folder). It does its work by **asking each child**.

The caller never asks "is this a file or a folder?".

```viz algo=uml title="Composite"
interface FileSystemItem
  + name(): string
  + size(): long
  + print(indent: int): void
class File
  - bytes: long
  + size(): long
class Folder
  - children: FileSystemItem[]
  + add(item: FileSystemItem): void
  + size(): long
File ..|> FileSystemItem
Folder ..|> FileSystemItem
Folder o-- FileSystemItem : children 0..*
```

## Example: a file system

```cpp run title="Files and folders, treated alike"
#include <algorithm>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class FileSystemItem {                                     // the Component
public:
    virtual ~FileSystemItem() = default;
    virtual string name() const = 0;
    virtual long size() const = 0;
    virtual void print(int indent) const = 0;               // (no default argument: they are not virtual)
};

class File : public FileSystemItem {                       // a Leaf
    string name_;
    long bytes_;
public:
    File(string n, long b) : name_(move(n)), bytes_(b) {}
    string name() const override { return name_; }
    long size() const override { return bytes_; }
    void print(int indent) const override { cout << string(indent, ' ') << name_ << " (" << bytes_ << " B)\n"; }
};

class Folder : public FileSystemItem {                     // the Composite
    string name_;
    vector<unique_ptr<FileSystemItem>> children_;
public:
    explicit Folder(string n) : name_(move(n)) {}
    Folder& add(unique_ptr<FileSystemItem> item) { children_.push_back(move(item)); return *this; }
    string name() const override { return name_; }
    long size() const override {                           // recursion: a folder's size is the sum of its children
        long total = 0;
        for (const auto& c : children_) total += c->size();
        return total;
    }
    void print(int indent) const override {
        cout << string(indent, ' ') << name_ << "/ (" << size() << " B)\n";
        for (const auto& c : children_) c->print(indent + 2);
    }
};

int main() {
    auto root = make_unique<Folder>("root");
    auto docs = make_unique<Folder>("docs");
    docs->add(make_unique<File>("cv.pdf", 120000)).add(make_unique<File>("notes.txt", 2500));
    auto pics = make_unique<Folder>("pics");
    pics->add(make_unique<File>("a.jpg", 800000));
    docs->add(move(pics));                                  // folders nest
    root->add(move(docs)).add(make_unique<File>("readme.md", 900));

    root->print(0);
    cout << "total: " << root->size() << " B\n";
}
```

Read `size()`:

- For a **file**, it returns the file's own size.
- For a **folder**, it adds up the size of every child. Each child may be a file or another folder, and the same call works.

`size()` and `print()` are written once for the whole tree, and there is no `if (isFolder)` anywhere. A new type, like `Symlink` or `Archive`, fits in without changing old code.

## A search that works on any node

The same trick works for any job that walks the tree.

```cpp run title="Find files matching a predicate"
#include <functional>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Node {
public:
    virtual ~Node() = default;
    void forEachFile(const function<void(const string&, long)>& fn) const { visit(fn, ""); }   // public entry point
    virtual void visit(const function<void(const string&, long)>& fn, const string& path) const = 0;
};
class File : public Node {
    string name_; long bytes_;
public:
    File(string n, long b) : name_(move(n)), bytes_(b) {}
    void visit(const function<void(const string&, long)>& fn, const string& path) const override { fn(path + name_, bytes_); }
};
class Dir : public Node {
    string name_; vector<unique_ptr<Node>> kids_;
public:
    explicit Dir(string n) : name_(move(n)) {}
    Dir& add(unique_ptr<Node> n) { kids_.push_back(move(n)); return *this; }
    void visit(const function<void(const string&, long)>& fn, const string& path) const override {
        for (const auto& k : kids_) k->visit(fn, path + name_ + "/");
    }
};

int main() {
    Dir root("root");
    auto src = make_unique<Dir>("src");
    src->add(make_unique<File>("main.cpp", 4200)).add(make_unique<File>("util.cpp", 900));
    root.add(move(src)).add(make_unique<File>("big.bin", 5'000'000));

    root.forEachFile([](const string& path, long bytes) { if (bytes > 1000) cout << "  large: " << path << " (" << bytes << ")\n"; });
}
```

## Another example: an expression tree

Numbers are leaves. Operations (`+`, `*`) are composites whose children are smaller expressions.

```cpp run title="(2 + 3) * 4 as a tree"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Expr {
    virtual ~Expr() = default;
    virtual double eval() const = 0;
    virtual string str() const = 0;
};
struct Num : Expr {
    double v;
    explicit Num(double v) : v(v) {}
    double eval() const override { return v; }
    string str() const override { return to_string(static_cast<int>(v)); }
};
struct BinOp : Expr {
    char op; unique_ptr<Expr> l, r;
    BinOp(char o, unique_ptr<Expr> a, unique_ptr<Expr> b) : op(o), l(move(a)), r(move(b)) {}
    double eval() const override {
        double a = l->eval(), b = r->eval();
        switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; default: return a / b; }
    }
    string str() const override { return "(" + l->str() + " " + op + " " + r->str() + ")"; }
};

int main() {
    auto e = make_unique<BinOp>('*',
                 make_unique<BinOp>('+', make_unique<Num>(2), make_unique<Num>(3)),
                 make_unique<Num>(4));
    cout << e->str() << " = " << e->eval() << "\n";
}
```

## Design choices

**Where should `add` and `remove` live?**

| Choice | Good | Not so good |
|---|---|---|
| In the **common interface** (transparent) | callers never need a cast | a `File` must have an `add` method that makes no sense |
| Only in **Composite** (safe) | a file can never get children | the caller must know it holds a folder |

We prefer **safety**: put `add` only in `Folder`. Keep the "question" methods (`size`, `print`) in the common interface.

**Who owns the children?** The composite owns them (`unique_ptr`). If a child keeps a pointer to its parent, that pointer should be a plain, non-owning one.

**Speed:** a call that walks the whole tree costs time in proportion to the tree size. If you ask often (like folder size), save the answer and refresh it when something changes.

**Loops:** a folder must never contain itself, directly or through others. Check this when users can build any tree they like.

## Where you will meet it in LLD problems

File system, UI components, menus, company charts, shopping bundles ("a bundle is also an item with a price"), permission groups, expression calculators, game scenes.

## Short answer to say in an interview

:::interview What is the Composite pattern?
"Composite lets me treat a single object and a group of objects the same way. Both follow one interface. A leaf does the work itself. A composite holds children and passes the work to each of them. A file system is the classic example: size() on a file returns its own size, and on a folder adds up its children, with no type checks. The folder owns its children with unique_ptr."
:::

```quiz
? What is the main benefit of Composite?
- Faster loops
+ The caller treats leaves and groups in the same way through one interface
- Fewer classes
> The caller does not care about the tree shape.
? Who should own the children of a Folder?
- A global registry
+ The Folder itself, using unique_ptr
- The children
> The composite owns its children. A back-pointer to the parent is non-owning.
? What is a downside of putting add() in the common interface?
- Slower code
+ Leaves get a method that makes no sense for them
- It needs templates
> That is the trade-off between "transparent" and "safe".
```

:::keypoints
- Composite = a tree where leaves and groups share one interface. A group passes work to its children.
- Common jobs: `size`, `price`, `print`, `search`, `evaluate`. New node types need no other changes.
- Prefer safety: keep child management only in the composite. The composite owns children with `unique_ptr`.
:::
