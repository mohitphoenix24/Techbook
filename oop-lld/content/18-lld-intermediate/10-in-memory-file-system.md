---
title: Design an In-Memory File System
level: intermediate
time: 60
summary: Files and directories as a Composite tree, path parsing, mkdir -p, ls, cat, write, rm and mv, recursive size and search through a visitor-like traversal, permissions, and a tiny command interpreter on top.
---

:::problem Design an In-Memory File System {level=medium tags="Composite,tree,paths,Visitor,commands"}
Design an in-memory file system like a tiny Unix. It supports absolute paths, `mkdir` (with parents), creating and writing files, `ls`, `cat`, `rm`, `mv`/`cp`, `find` by name, and computing the size of a directory. Keep it extensible: new node types (symlinks), permissions, and new operations over the tree.
:::

:::hint Hint
A directory contains files and directories, and you treat them uniformly: that is the **Composite** pattern. Path handling (splitting `/a/b/c` and walking from the root) should be in one place. New operations on the tree (size, find, print) fit the **Visitor** idea.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Paths? | absolute, `/`-separated, normalised (`.` and `..` handled) |
| Operations? | `mkdir -p`, `touch/write`, `cat`, `ls`, `rm [-r]`, `mv`, `cp`, `du` (size), `find name` |
| Node kinds? | File (content), Directory (children), extensible to Symlink |
| Names? | unique within a directory; no `/` in names |
| Errors? | not found, already exists, not a directory, directory not empty (for `rm` without `-r`) |
| Permissions? | simple read/write bits per node (extension point) |
| Concurrency? | a single mutex over the tree (readers-writer lock as an extension) |
| Out of scope | persistence, hard links, real I/O |

## Step 2: entities

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

## Step 3: design decisions

- **Composite**: `Node` is the component; `File` is a leaf; `Directory` holds `unique_ptr<Node>` children by name (ordered `map` so `ls` is sorted). `size()` is recursive.
- **Path resolution** in one function: split on `/`, process `.` and `..`, then walk from the root. Every operation uses `resolve(path)` or `resolveParent(path)` (parent directory + leaf name), so error handling is uniform.
- **Ownership**: the parent owns its children (`unique_ptr`); a child keeps a **non-owning** raw pointer to the parent (for `..` and absolute path printing).
- **`mv` is "detach then attach"** (a `remove` that returns the owning pointer plus an `add`). That makes it O(1) and keeps the subtree intact. Moving a directory into its own descendant is detected and refused.
- **`cp`** deep-copies with a recursive `clone()` (Prototype).
- **Visitor** for tree-wide operations such as `find` and size reports, so new reports do not edit the node classes.
- **Errors** as a `Status` enum + message (normal outcomes).

## Step 4: the code

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

| Case | Handling |
|---|---|
| `mkdir` on an existing path | `Exists` (without `-p`) |
| Path through a file (`/a/file/b`) | `NotADirectory` |
| `rm` a non-empty directory | `NotEmpty` unless recursive |
| `mv` a directory into its own subtree | refused (`isAncestorOf`) |
| `mv dir existingDir` | moves *into* the existing directory, like Unix |
| `..` above the root | stays at the root |
| Names containing `/` | rejected (extension) |
| Deleting while another thread lists | one mutex (or a readers-writer lock) makes each operation atomic |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Symbolic links" | `Symlink : Node` storing a path; `resolve` follows with a loop limit |
| "Permissions and ownership" | `Permissions` value in `Node`; checks in each operation (a Proxy/Decorator over `FileSystem`) |
| "Disk quota / size limits" | a `QuotaPolicy` checked in `write`/`cp` |
| "Undo/redo (trash)" | Command objects per operation; `rm` moves to a `/trash` directory |
| "Watch for changes" | Observer events (`Created`, `Modified`, `Deleted`) |
| "Glob and regex search" | `find` takes a predicate; Specification for combinations |
| "Persistence" | serialise the tree (Memento) to JSON |
| "Concurrent readers" | `shared_mutex`: many `ls`/`cat`, exclusive writes |
| "Large trees" | lazy size caching with invalidation up the parent chain |

```quiz
? Why does Directory own children with unique_ptr while Node keeps a raw parent pointer?
- To avoid templates
+ Ownership flows down the tree; the back-pointer only observes and cannot create a cycle
- Raw pointers are faster
> Owning pointers go down, observing pointers go up.
? How is `mv` implemented efficiently?
- Copy then delete
+ Detach the node from the old parent and attach it to the new one: the subtree is not copied
- By renaming strings
> O(1) relinking.
```

:::keypoints
- Composite tree (`Node`, `File`, `Directory`); one path resolver; parent owns children, children point to the parent without owning.
- `mv` = detach + attach with a cycle check; `cp` = recursive clone; Visitors for find/size/report.
- Extend with symlinks, permissions (proxy), events (observer) and undo (command).
:::
