---
title: Design an In-Memory File System
level: intermediate
time: 60
summary: Files and folders as a tree. Learn how to read paths, make folders, write and read files, list, delete, move and copy, find files, and add new kinds of nodes and permissions later.
---

:::problem Design an In-Memory File System {level=medium tags="Composite,tree,paths,Visitor,commands"}
Design an in-memory file system like a tiny Unix. It supports absolute paths, `mkdir` (with parent folders), creating and writing files, `ls`, `cat`, `rm`, `mv` and `cp`, `find` by name, and the size of a folder. Keep it easy to extend: new kinds of nodes (shortcuts), permissions, and new jobs over the tree.
:::

:::hint Hint
A folder holds files and other folders, and you treat them the same way. That is the **Composite** pattern. Handle paths (splitting `/a/b/c` and walking down from the root) in one place. New jobs over the tree (size, find, print) fit the **Visitor** idea.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Paths? | absolute, separated by `/`, cleaned up (`.` and `..` handled) |
| Actions? | `mkdir -p`, `touch` or `write`, `cat`, `ls`, `rm [-r]`, `mv`, `cp`, `du` (size), `find name` |
| Kinds of nodes? | File (has content), Directory (has children). Can be extended with Symlink |
| Names? | unique inside a folder. No `/` inside a name |
| Errors? | not found, already exists, not a directory, folder not empty (for `rm` without `-r`) |
| Permissions? | simple read and write bits for each node (an extension point) |
| Many threads? | one mutex over the whole tree (a reader-writer lock as an extension) |
| Not needed | saving to disk, hard links, real file input and output |

## Step 2: Find the classes

```viz algo=uml title="File system (Composite)"
class FileSystem
  - root: Directory
  + mkdir(path: string, parents: bool): Status
  + write(path: string, data: string): Status
  + cat(path: string): Result<string>
  + ls(path: string): Result<string[]>
  + rm(path: string, recursive: bool): Status
  + mv(from: string, to: string): Status
  + find(root: string, name: string): string[]
abstract class Node
  # name: string
  # parent: Directory
  + size(): long
  + isDirectory(): bool
  + accept(v: NodeVisitor): void
class File
  - content: string
class Directory
  - children: map<string, Node>
  + child(name: string): Node
  + add(n: Node): void
  + remove(name: string): Node
interface NodeVisitor
  + visit(f: File): void
  + visit(d: Directory): void
class PathResolver
  + split(path: string): string[]
File --|> Node
Directory --|> Node
Directory *-- Node : children
FileSystem *-- Directory
FileSystem ..> PathResolver
NodeVisitor ..> Node
```

## Step 3: Design decisions

- **Composite:** `Node` is the common type. `File` is a leaf. `Directory` holds `unique_ptr<Node>` children by name (in an ordered `map`, so `ls` is sorted). `size()` works by recursion.
- **Path handling in one function:** split on `/`, handle `.` and `..`, then walk from the root. Every action uses `resolve(path)` or `resolveParent(path)` (the parent folder plus the last name), so errors are handled in the same way everywhere.
- **Ownership:** the parent owns its children (`unique_ptr`). A child keeps a **non-owning** raw pointer to its parent (for `..` and for printing the full path).
- **`mv` means "detach, then attach."** `remove` gives back the owning pointer, and `add` puts it in the new place. This is O(1) and keeps the whole subtree. Moving a folder into its own child is detected and refused.
- **`cp`** makes a deep copy with a recursive `clone()` (Prototype).
- **Visitor** for jobs over the whole tree, like `find` and size reports, so new reports do not change the node classes.
- **Errors** are a `Status` enum with a message (they are normal outcomes).

## Step 4: The code

```cpp run title="Composite file system with paths, mv, cp, find"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

enum class Status { Ok, NotFound, Exists, NotADirectory, IsADirectory, NotEmpty, Invalid };
const char* msg(Status s) {
    switch (s) { case Status::Ok: return "ok"; case Status::NotFound: return "no such file or directory"; case Status::Exists: return "already exists";
                 case Status::NotADirectory: return "not a directory"; case Status::IsADirectory: return "is a directory"; case Status::NotEmpty: return "directory not empty"; default: return "invalid argument"; }
}

class Directory; class File;
struct NodeVisitor { virtual ~NodeVisitor() = default; virtual void visit(const File&, const string& path) = 0; virtual void visit(const Directory&, const string& path) = 0; };

class Node {
protected:
    string name_; Directory* parent_ = nullptr;
public:
    explicit Node(string n) : name_(move(n)) {}
    virtual ~Node() = default;
    const string& name() const { return name_; }
    void setName(string n) { name_ = move(n); }
    Directory* parent() const { return parent_; }
    void setParent(Directory* d) { parent_ = d; }
    virtual long size() const = 0;
    virtual bool isDirectory() const = 0;
    virtual unique_ptr<Node> clone() const = 0;               // deep copy (Prototype)
    virtual void accept(NodeVisitor& v, const string& path) const = 0;
};

class File : public Node {
    string content_;
public:
    File(string n, string c = "") : Node(move(n)), content_(move(c)) {}
    const string& content() const { return content_; }
    void write(string c) { content_ = move(c); }
    long size() const override { return static_cast<long>(content_.size()); }
    bool isDirectory() const override { return false; }
    unique_ptr<Node> clone() const override { return make_unique<File>(name_, content_); }
    void accept(NodeVisitor& v, const string& path) const override { v.visit(*this, path); }
};

class Directory : public Node {
    map<string, unique_ptr<Node>> children_;
public:
    explicit Directory(string n) : Node(move(n)) {}
    Node* child(const string& n) const { auto it = children_.find(n); return it == children_.end() ? nullptr : it->second.get(); }
    Node* add(unique_ptr<Node> n) { n->setParent(this); auto* raw = n.get(); children_[n->name()] = move(n); return raw; }
    unique_ptr<Node> detach(const string& n) { auto it = children_.find(n); auto p = move(it->second); children_.erase(it); p->setParent(nullptr); return p; }
    bool empty() const { return children_.empty(); }
    vector<string> names() const { vector<string> v; for (auto& [k, c] : children_) v.push_back(c->isDirectory() ? k + "/" : k); return v; }
    long size() const override { long s = 0; for (auto& [k, c] : children_) s += c->size(); return s; }
    bool isDirectory() const override { return true; }
    unique_ptr<Node> clone() const override { auto d = make_unique<Directory>(name_); for (auto& [k, c] : children_) d->add(c->clone()); return d; }
    void accept(NodeVisitor& v, const string& path) const override {
        v.visit(*this, path);
        for (auto& [k, c] : children_) c->accept(v, path == "/" ? "/" + k : path + "/" + k);
    }
    bool isAncestorOf(const Node* n) const { for (const Directory* d = n->parent(); d; d = d->parent()) if (d == this) return true; return n == this; }
};

class FileSystem {
    Directory root_{""};
    mutable mutex m_;

    static vector<string> split(const string& path) {          // "/a/./b/../c" -> {"a", "c"}
        vector<string> parts; stringstream ss(path); string p;
        while (getline(ss, p, '/')) {
            if (p.empty() || p == ".") continue;
            if (p == "..") { if (!parts.empty()) parts.pop_back(); continue; }
            parts.push_back(p);
        }
        return parts;
    }
    Node* resolve(const string& path) const {
        Node* cur = const_cast<Directory*>(&root_);
        for (const auto& p : split(path)) { if (!cur->isDirectory()) return nullptr; cur = static_cast<Directory*>(cur)->child(p); if (!cur) return nullptr; }
        return cur;
    }
    // parent directory + leaf name
    Status resolveParent(const string& path, Directory*& parent, string& leaf) const {
        auto parts = split(path);
        if (parts.empty()) return Status::Invalid;
        leaf = parts.back(); parts.pop_back();
        Node* cur = const_cast<Directory*>(&root_);
        for (const auto& p : parts) { if (!cur->isDirectory()) return Status::NotADirectory; cur = static_cast<Directory*>(cur)->child(p); if (!cur) return Status::NotFound; }
        if (!cur->isDirectory()) return Status::NotADirectory;
        parent = static_cast<Directory*>(cur);
        return Status::Ok;
    }
public:
    Status mkdir(const string& path, bool parents = false) {
        lock_guard l(m_);
        Directory* cur = &root_;
        auto parts = split(path);
        if (parts.empty()) return Status::Exists;
        for (size_t i = 0; i < parts.size(); ++i) {
            Node* next = cur->child(parts[i]);
            if (!next) {
                if (i + 1 < parts.size() && !parents) return Status::NotFound;
                next = cur->add(make_unique<Directory>(parts[i]));
            } else if (!next->isDirectory()) return Status::NotADirectory;
            else if (i + 1 == parts.size() && !parents) return Status::Exists;
            cur = static_cast<Directory*>(next);
        }
        return Status::Ok;
    }
    Status write(const string& path, const string& data) {
        lock_guard l(m_);
        Directory* dir; string leaf;
        if (Status s = resolveParent(path, dir, leaf); s != Status::Ok) return s;
        Node* existing = dir->child(leaf);
        if (existing && existing->isDirectory()) return Status::IsADirectory;
        if (existing) static_cast<File*>(existing)->write(data); else dir->add(make_unique<File>(leaf, data));
        return Status::Ok;
    }
    pair<Status, string> cat(const string& path) const {
        lock_guard l(m_);
        Node* n = resolve(path);
        if (!n) return {Status::NotFound, ""};
        if (n->isDirectory()) return {Status::IsADirectory, ""};
        return {Status::Ok, static_cast<File*>(n)->content()};
    }
    pair<Status, vector<string>> ls(const string& path) const {
        lock_guard l(m_);
        Node* n = resolve(path);
        if (!n) return {Status::NotFound, {}};
        if (!n->isDirectory()) return {Status::Ok, {n->name()}};
        return {Status::Ok, static_cast<Directory*>(n)->names()};
    }
    Status rm(const string& path, bool recursive = false) {
        lock_guard l(m_);
        Directory* dir; string leaf;
        if (Status s = resolveParent(path, dir, leaf); s != Status::Ok) return s;
        Node* n = dir->child(leaf);
        if (!n) return Status::NotFound;
        if (n->isDirectory() && !recursive && !static_cast<Directory*>(n)->empty()) return Status::NotEmpty;
        dir->detach(leaf);                                      // the unique_ptr returned is destroyed here: the subtree is freed
        return Status::Ok;
    }
    Status mv(const string& from, const string& to) {
        lock_guard l(m_);
        Directory *fromDir, *toDir; string fromLeaf, toLeaf;
        if (Status s = resolveParent(from, fromDir, fromLeaf); s != Status::Ok) return s;
        Node* src = fromDir->child(fromLeaf);
        if (!src) return Status::NotFound;
        Node* dest = resolve(to);
        if (dest && dest->isDirectory()) { toDir = static_cast<Directory*>(dest); toLeaf = fromLeaf; }    // mv into an existing directory
        else if (Status s = resolveParent(to, toDir, toLeaf); s != Status::Ok) return s;
        if (src->isDirectory() && static_cast<Directory*>(src)->isAncestorOf(toDir)) return Status::Invalid;   // cannot move a directory into itself
        if (toDir->child(toLeaf)) return Status::Exists;
        auto node = fromDir->detach(fromLeaf);                  // detach, rename, attach: O(1), subtree untouched
        node->setName(toLeaf);
        toDir->add(move(node));
        return Status::Ok;
    }
    Status cp(const string& from, const string& to) {
        lock_guard l(m_);
        Node* src = resolve(from);
        if (!src) return Status::NotFound;
        Directory* toDir; string toLeaf;
        if (Status s = resolveParent(to, toDir, toLeaf); s != Status::Ok) return s;
        if (toDir->child(toLeaf)) return Status::Exists;
        auto copy = src->clone(); copy->setName(toLeaf); toDir->add(move(copy));
        return Status::Ok;
    }
    long size(const string& path) const { lock_guard l(m_); Node* n = resolve(path); return n ? n->size() : -1; }

    // a visitor does the tree-wide work, so new reports need no change to the node classes
    vector<string> find(const string& startPath, const string& name) const {
        struct Finder : NodeVisitor {
            string target; vector<string> hits;
            void visit(const File& f, const string& p) override { if (f.name() == target) hits.push_back(p); }
            void visit(const Directory& d, const string& p) override { if (d.name() == target) hits.push_back(p + "/"); }
        } f; f.target = name;
        lock_guard l(m_);
        Node* n = resolve(startPath);
        if (n) n->accept(f, startPath == "/" ? "/" : startPath);
        return f.hits;
    }
};

void show(const char* cmd, Status s) { cout << "  $ " << cmd << (s == Status::Ok ? "" : string("   -> ") + msg(s)) << "\n"; }

int main() {
    FileSystem fs;
    show("mkdir -p /home/asha/docs", fs.mkdir("/home/asha/docs", true));
    show("mkdir /home/ravi", fs.mkdir("/home/ravi"));
    show("mkdir /x/y            (parent missing)", fs.mkdir("/x/y"));
    show("write /home/asha/docs/cv.txt", fs.write("/home/asha/docs/cv.txt", "Asha, C++ engineer"));
    show("write /home/asha/notes.txt", fs.write("/home/asha/notes.txt", "todo: study LLD"));
    show("write /home/asha/docs (a directory)", fs.write("/home/asha/docs", "oops"));

    auto [s1, ls1] = fs.ls("/home/asha");
    cout << "  $ ls /home/asha ->"; for (auto& n : ls1) cout << " " << n; cout << "\n";
    cout << "  $ cat /home/asha/docs/cv.txt -> " << fs.cat("/home/asha/docs/cv.txt").second << "\n";
    cout << "  $ du /home/asha -> " << fs.size("/home/asha") << " bytes\n";

    show("cp /home/asha/docs /home/ravi/docs-copy", fs.cp("/home/asha/docs", "/home/ravi/docs-copy"));
    show("mv /home/asha/notes.txt /home/ravi", fs.mv("/home/asha/notes.txt", "/home/ravi"));
    show("mv /home/asha /home/asha/docs  (into itself)", fs.mv("/home/asha", "/home/asha/docs"));
    cout << "  $ find / cv.txt ->"; for (auto& p : fs.find("/", "cv.txt")) cout << " " << p; cout << "\n";
    show("rm /home/ravi         (not empty)", fs.rm("/home/ravi"));
    show("rm -r /home/ravi", fs.rm("/home/ravi", true));
    cout << "  $ find / cv.txt ->"; for (auto& p : fs.find("/", "cv.txt")) cout << " " << p; cout << "\n";
    cout << "  paths with . and ..: cat /home/asha/./docs/../docs/cv.txt -> " << fs.cat("/home/asha/./docs/../docs/cv.txt").second << "\n";
}
```

## Edge cases

| Case | What happens |
|---|---|
| `mkdir` on a path that exists | `Exists` (without `-p`) |
| A path that goes through a file (`/a/file/b`) | `NotADirectory` |
| `rm` on a folder that is not empty | `NotEmpty` unless recursive |
| `mv` a folder into its own subtree | refused (`isAncestorOf`) |
| `mv dir existingDir` | moves *into* the existing folder, like Unix |
| `..` above the root | stays at the root |
| Names that contain `/` | refused (extension) |
| Deleting while another thread lists | one mutex (or a reader-writer lock) makes each action safe |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Shortcuts (symbolic links)" | `Symlink : Node` that stores a path. `resolve` follows it with a limit to stop loops |
| "Permissions and owners" | a `Permissions` value in `Node`, and checks in each action (a Proxy or Decorator over `FileSystem`) |
| "A size limit (quota)" | a `QuotaPolicy` checked in `write` and `cp` |
| "Undo and a trash bin" | a Command for each action. `rm` moves to a `/trash` folder |
| "Watch for changes" | Observer events (`Created`, `Modified`, `Deleted`) |
| "Search with patterns" | `find` takes a yes/no function. Specification for combinations |
| "Save to disk" | write the tree out (Memento) as JSON |
| "Many readers" | `shared_mutex`: many `ls` and `cat` together, one writer alone |
| "Very big trees" | save the size of each folder and refresh it up the parent chain when something changes |

## Short answer to say in an interview

:::interview How do you design an in-memory file system?
"I use the Composite pattern. A Node is the common type, a File is a leaf, and a Directory holds its children by name and owns them with unique_ptr. Each child has a plain pointer back to its parent. One function resolves a path, so every action reports errors the same way. A move is detach and attach, with a check that a folder is not moved into itself. A copy is a recursive clone. Jobs like find and size use a visitor, so they do not change the node classes."
:::

```quiz
? Why does Directory own its children with unique_ptr, while Node keeps a raw pointer to its parent?
- To avoid templates
+ Ownership goes down the tree. The pointer upward only watches, and it cannot create a loop of owners
- Raw pointers are faster
> Owning pointers go down and watching pointers go up.
? How is mv done efficiently?
- Copy, then delete
+ Detach the node from the old parent and attach it to the new one. The subtree is not copied
- By renaming strings
> Just relinking, which is O(1).
```

:::keypoints
- A Composite tree (`Node`, `File`, `Directory`). One path resolver. The parent owns the children, and children point to the parent without owning.
- `mv` = detach and attach with a loop check. `cp` = recursive clone. Visitors for find, size and reports.
- Extend with symlinks, permissions (a proxy), events (observer) and undo (command).
:::
