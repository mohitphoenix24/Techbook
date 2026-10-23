---
title: Composite
level: intermediate
time: 35
summary: Treating single objects and groups of objects uniformly in a tree: the Component, Leaf and Composite roles, a file-system example with sizes and search, an expression tree, design choices (child management in the base or not), and traversal.
---

:::def Composite
Compose objects into **tree structures** to represent part-whole hierarchies. Composite lets clients treat **individual objects and compositions of objects uniformly**.
:::

You meet trees everywhere: a file system (files and folders), a UI (buttons inside panels inside windows), an organisation chart (employees and managers), a menu (items and submenus), an arithmetic expression (numbers and operations), a graphics scene (shapes and groups).

## The idea

All nodes share **one interface**. A **leaf** does the work itself. A **composite** holds children and **delegates** to them (often by recursion). The caller never checks "is this a file or a folder?".

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

## A file system

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

`size()` and `print()` are written once for the whole tree. The call `child->size()` works for a file or a folder with no `if`. A new leaf type (`Symlink`) or composite type (`Archive`) slots in without touching existing code.

## A search that works on any node

The same trick applies to any operation that walks the tree.

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

## Another composite: an expression tree

Numbers are leaves; operations are composites whose children are sub-expressions.

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

**Where do `add`/`remove` live?**

| Choice | Pros | Cons |
|---|---|---|
| In the **base** `Component` (transparency) | uniform interface; client never casts | a `File` must implement `add` (throw or ignore): violates LSP/ISP |
| Only in **Composite** (safety) | a leaf cannot be given children | the client must know it is holding a composite (a cast) |

Prefer **safety**: keep `add` in `Folder`, and build the tree through `Folder` references (as above). Keep the *query* operations (`size`, `print`) in the common interface.

**Ownership:** the composite **owns** its children (`unique_ptr`). A child holding a parent pointer should use a **non-owning** raw pointer.

**Cost:** a recursive operation costs O(n) in tree size; cache values (like folder size) if you read them often, and invalidate on change.

**Cycles:** a composite must never contain itself, directly or indirectly. Guard `add` if users can build arbitrary graphs.

## Where it appears in LLD problems

File system design, UI component trees, menu systems, org charts, shopping bundles ("a bundle of items is itself an item with a price"), permissions groups, expression evaluators, game scenes.

:::interview What is the Composite pattern? Where did you use it?
"Composite lets clients treat single objects and groups the same way. Leaf and composite classes implement one component interface; a composite holds children and delegates operations to them recursively. A file system is the classic example: `size()` on a folder sums its children and on a file returns its own size, with no type checks. I keep child management in the composite for type safety and have the composite own its children via `unique_ptr`."
:::

```quiz
? What is the key benefit of Composite?
- Faster iteration
+ Clients treat leaves and composites uniformly through one interface
- Fewer classes
> The recursion hides the structure from the caller.
? Who should own the children of a Folder?
- A global registry
+ The Folder itself, via unique_ptr
- The children's parent pointers
> The composite owns its children; back-pointers to the parent are non-owning.
? A downside of putting `add()` in the common base interface is...
- Slower code
+ Leaves must implement an operation that makes no sense for them
- It needs templates
> That is the transparency versus safety trade-off.
```

:::keypoints
- Composite: a tree where leaves and composites share one interface; composites delegate to children recursively.
- Typical operations: `size`, `price`, `print`, `search`, `evaluate`. New node types need no changes elsewhere.
- Prefer type safety (child management only on the composite). The composite owns its children with `unique_ptr`; parent links are non-owning.
:::
