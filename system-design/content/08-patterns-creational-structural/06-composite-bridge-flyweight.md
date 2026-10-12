---
title: Composite, Bridge and Flyweight
level: intermediate
time: 45
summary: Three structural patterns — Composite for treating trees of objects uniformly (a file system and an org chart, in C++ and JavaScript), Bridge for separating two independent dimensions of variation (shapes × renderers, notifications × channels), and Flyweight for sharing intrinsic state among huge numbers of small objects.
---

## Composite

:::def Composite
Composes objects into **tree structures** and lets clients treat **individual objects (leaves) and groups of objects (composites) the same way**, through one common interface.
:::

**Problem:** a file system has files and folders; folders contain files **and other folders**. "Total size", "count files", "search by name" should work on a single file or a whole folder tree without the caller checking which is which. The same shape appears in menus with submenus, UI layouts (panels containing widgets), org charts, bills of materials, and expression trees.

```viz algo=uml title="Composite: leaves and containers share one interface"
interface Node
  + name(): string
  + size(): long
  + print(indent: int)
class File
  - bytes: long
class Folder
  - children: Node[]
  + add(n: Node)
File ..|> Node
Folder ..|> Node
Folder o-- Node : children
```

:::tabs A file system with Composite
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Node {
public:
    explicit Node(string name) : name_(std::move(name)) {}
    virtual ~Node() = default;
    virtual long size() const = 0;
    virtual int fileCount() const = 0;
    virtual void print(int indent = 0) const = 0;
    const string& name() const { return name_; }
protected:
    string name_;
};

class File : public Node {                               // leaf
    long bytes_;
public:
    File(string name, long bytes) : Node(std::move(name)), bytes_(bytes) {}
    long size() const override { return bytes_; }
    int fileCount() const override { return 1; }
    void print(int indent) const override { cout << string(indent, ' ') << "- " << name_ << " (" << bytes_ << " B)\n"; }
};

class Folder : public Node {                             // composite: delegates to its children
    vector<unique_ptr<Node>> children_;
public:
    using Node::Node;
    Folder& add(unique_ptr<Node> n) { children_.push_back(std::move(n)); return *this; }
    long size() const override { long s = 0; for (auto& c : children_) s += c->size(); return s; }
    int fileCount() const override { int n = 0; for (auto& c : children_) n += c->fileCount(); return n; }
    void print(int indent) const override {
        cout << string(indent, ' ') << "+ " << name_ << "/ (" << size() << " B)\n";
        for (auto& c : children_) c->print(indent + 2);
    }
};

int main() {
    auto src = make_unique<Folder>("src");
    src->add(make_unique<File>("main.cpp", 1200)).add(make_unique<File>("cache.cpp", 3400));
    auto docs = make_unique<Folder>("docs");
    docs->add(make_unique<File>("README.md", 800));

    Folder root("project");
    root.add(std::move(src)).add(std::move(docs)).add(make_unique<File>("LICENSE", 1100));
    root.print(0);                // default arguments aren't inherited by overrides, so pass it
    cout << "total: " << root.size() << " bytes in " << root.fileCount() << " files\n";
}
```
```js run
class File {                                            // leaf
  constructor(name, bytes) { Object.assign(this, { name, bytes }); }
  size() { return this.bytes; }
  fileCount() { return 1; }
  print(indent = 0) { console.log(`${" ".repeat(indent)}- ${this.name} (${this.bytes} B)`); }
  *find(pred) { if (pred(this)) yield this; }
}

class Folder {                                          // composite: delegates to its children
  #children = [];
  constructor(name) { this.name = name; }
  add(...nodes) { this.#children.push(...nodes); return this; }
  size() { return this.#children.reduce((s, c) => s + c.size(), 0); }
  fileCount() { return this.#children.reduce((s, c) => s + c.fileCount(), 0); }
  print(indent = 0) {
    console.log(`${" ".repeat(indent)}+ ${this.name}/ (${this.size()} B)`);
    for (const c of this.#children) c.print(indent + 2);
  }
  *find(pred) { if (pred(this)) yield this; for (const c of this.#children) yield* c.find(pred); }
}

const root = new Folder("project").add(
  new Folder("src").add(new File("main.cpp", 1200), new File("cache.cpp", 3400)),
  new Folder("docs").add(new File("README.md", 800)),
  new File("LICENSE", 1100),
);
root.print();
console.log(`total: ${root.size()} bytes in ${root.fileCount()} files`);
console.log("files over 1 KB:", [...root.find((n) => n instanceof File && n.size() > 1024)].map((f) => f.name));
```
:::

The key is **recursion through a shared interface**: a folder's `size()` asks each child for its size, and each child (file or folder) answers in its own way. Adding a new node type (a symbolic link, a zip archive) means adding a class.

**In LLD interviews:** the **stacked discount** follow-up from the cart lesson (`CompositeDiscount` holding several discounts), menus, organisation hierarchies ("total salary under this manager"), a **splitwise group** of groups, and the classic "design a file system" question.

## Bridge

:::def Bridge
Separates an **abstraction** from its **implementation** so the two can vary **independently**: the abstraction holds a reference to an implementation interface, instead of being subclassed for every implementation.
:::

**Problem:** you have notification **types** (alert, reminder, marketing), each with different content rules, and delivery **channels** (email, SMS, push). Subclassing every pair (`UrgentAlertViaSms`) grows as types × channels. The Bridge splits the two hierarchies and connects them with composition:

```viz algo=uml title="Bridge: two hierarchies joined by composition"
abstract class Notification
  # channel: Channel
  + send(to: string)
class AlertNotification
class ReminderNotification
interface Channel
  + deliver(to: string, title: string, body: string)
class EmailChannel
class SmsChannel
class PushChannel
AlertNotification --|> Notification
ReminderNotification --|> Notification
Notification o-- Channel : bridge
EmailChannel ..|> Channel
SmsChannel ..|> Channel
PushChannel ..|> Channel
```

:::tabs Bridge: message types × delivery channels
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Channel {                                         // the implementation hierarchy
public:
    virtual ~Channel() = default;
    virtual void deliver(const string& to, const string& title, const string& body) const = 0;
};
class EmailChannel : public Channel {
public:
    void deliver(const string& to, const string& t, const string& b) const override { cout << "EMAIL " << to << " | " << t << " | " << b << "\n"; }
};
class SmsChannel : public Channel {
public:
    void deliver(const string& to, const string& t, const string& b) const override {
        string msg = t + ": " + b;
        cout << "SMS   " << to << " | " << (msg.size() > 40 ? msg.substr(0, 37) + "..." : msg) << "\n";
    }
};

class Notification {                                    // the abstraction hierarchy
protected:
    const Channel& channel_;                            // the bridge
public:
    explicit Notification(const Channel& c) : channel_(c) {}
    virtual ~Notification() = default;
    virtual void send(const string& to) const = 0;
};
class AlertNotification : public Notification {
    string what_;
public:
    AlertNotification(const Channel& c, string what) : Notification(c), what_(std::move(what)) {}
    void send(const string& to) const override { channel_.deliver(to, "ALERT", what_ + ". Act now."); }
};
class ReminderNotification : public Notification {
    string what_, when_;
public:
    ReminderNotification(const Channel& c, string what, string when) : Notification(c), what_(std::move(what)), when_(std::move(when)) {}
    void send(const string& to) const override { channel_.deliver(to, "Reminder", what_ + " at " + when_); }
};

int main() {
    EmailChannel email; SmsChannel sms;
    AlertNotification(sms, "Unusual login from a new device").send("+91-98450-00000");
    AlertNotification(email, "Unusual login from a new device").send("asha@example.com");
    ReminderNotification(email, "Dentist appointment", "4 pm").send("asha@example.com");
    // 2 types + 2 channels = 4 classes; adding PushChannel adds 1 class, not 2
}
```
```js run
// Implementations: anything with deliver(to, title, body)
const emailChannel = { deliver: (to, title, body) => console.log(`EMAIL ${to} | ${title} | ${body}`) };
const smsChannel = {
  deliver: (to, title, body) => {
    const msg = `${title}: ${body}`;
    console.log(`SMS   ${to} | ${msg.length > 40 ? msg.slice(0, 37) + "..." : msg}`);
  },
};

// Abstractions hold a channel (the bridge) and decide WHAT to say
class Notification { constructor(channel) { this.channel = channel; } }
class AlertNotification extends Notification {
  constructor(channel, what) { super(channel); this.what = what; }
  send(to) { this.channel.deliver(to, "ALERT", `${this.what}. Act now.`); }
}
class ReminderNotification extends Notification {
  constructor(channel, what, when) { super(channel); Object.assign(this, { what, when }); }
  send(to) { this.channel.deliver(to, "Reminder", `${this.what} at ${this.when}`); }
}

new AlertNotification(smsChannel, "Unusual login from a new device").send("+91-98450-00000");
new AlertNotification(emailChannel, "Unusual login from a new device").send("asha@example.com");
new ReminderNotification(emailChannel, "Dentist appointment", "4 pm").send("asha@example.com");
```
:::

Bridge vs Strategy: structurally similar (an object holding an interface). **Strategy** swaps an **algorithm** inside one class; **Bridge** is an up-front design that keeps **two whole hierarchies** independent. Bridge vs Adapter: Bridge is designed **in advance** to let both sides vary; Adapter is applied **afterwards** to make existing incompatible things fit. Classic real examples: JDBC (the `java.sql` API vs drivers per database), GUI toolkits (widgets vs platform renderers), and device drivers.

## Flyweight

:::def Flyweight
Shares the **intrinsic** (common, immutable) state of a huge number of fine-grained objects, so each object stores only its **extrinsic** (unique, context-dependent) state. A factory hands out shared flyweights from a cache.
:::

**Problem:** a map shows 1,000,000 trees. Each tree has a position (unique) and a species with a name, texture and 3D model (shared by thousands of trees). Storing a copy of the species data in every tree wastes gigabytes. The same applies to characters in a text editor (font, size and style shared), particles in a game, and map markers.

:::tabs Flyweight: share the heavy, immutable part
```js run
class TreeType {                                       // the flyweight: intrinsic, shared, immutable
  constructor(species, color, textureBytes) {
    Object.assign(this, { species, color, texture: new Uint8Array(textureBytes) });
    Object.freeze(this);
  }
}

class TreeTypeFactory {                                // hands out shared instances
  #cache = new Map();
  get(species, color, textureBytes) {
    const key = `${species}|${color}`;
    if (!this.#cache.has(key)) this.#cache.set(key, new TreeType(species, color, textureBytes));
    return this.#cache.get(key);
  }
  get count() { return this.#cache.size; }
}

const factory = new TreeTypeFactory();
const species = [["neem", "green", 40_000], ["banyan", "dark green", 60_000], ["gulmohar", "red", 50_000]];
const forest = [];
for (let i = 0; i < 100_000; i++) {
  const [s, c, bytes] = species[i % 3];
  forest.push({ x: i % 1000, y: Math.floor(i / 1000), type: factory.get(s, c, bytes) });   // extrinsic: position only
}

const shared = species.reduce((sum, [, , b]) => sum + b, 0);
const naive = forest.reduce((sum, t) => sum + t.type.texture.length, 0);
console.log(`trees: ${forest.length.toLocaleString("en-US")}, distinct TreeType objects: ${factory.count}`);
console.log(`texture memory with flyweights: ${(shared / 1e3).toFixed(0)} KB, without: ${(naive / 1e9).toFixed(1)} GB`);
console.log("same object shared:", forest[0].type === forest[3].type);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct TreeType {                                       // the flyweight: intrinsic, shared, immutable
    const string species, color;
    const vector<uint8_t> texture;
    TreeType(string s, string c, size_t bytes) : species(std::move(s)), color(std::move(c)), texture(bytes) {}
};

class TreeTypeFactory {
    unordered_map<string, shared_ptr<const TreeType>> cache_;
public:
    shared_ptr<const TreeType> get(const string& s, const string& c, size_t bytes) {
        auto& slot = cache_[s + "|" + c];
        if (!slot) slot = make_shared<const TreeType>(s, c, bytes);
        return slot;
    }
    size_t count() const { return cache_.size(); }
};

struct Tree { int x, y; shared_ptr<const TreeType> type; };   // extrinsic state + a pointer to the shared part

int main() {
    TreeTypeFactory factory;
    vector<tuple<string, string, size_t>> species = {{"neem", "green", 40000}, {"banyan", "dark green", 60000}, {"gulmohar", "red", 50000}};
    vector<Tree> forest;
    forest.reserve(100000);
    for (int i = 0; i < 100000; i++) {
        auto& [s, c, b] = species[i % 3];
        forest.push_back({i % 1000, i / 1000, factory.get(s, c, b)});
    }
    size_t shared = 0, naive = 0;
    for (auto& [s, c, b] : species) shared += b;
    for (auto& t : forest) naive += t.type->texture.size();
    cout << "trees: " << forest.size() << ", distinct TreeType objects: " << factory.count() << "\n";
    cout << "texture memory with flyweights: " << shared / 1000 << " KB, without: " << fixed << setprecision(1) << naive / 1e9 << " GB\n";
    cout << boolalpha << "same object shared: " << (forest[0].type == forest[3].type) << "\n";
}
```
:::

Rules: the shared (intrinsic) part must be **immutable** (otherwise one tree's change affects thousands), and the extrinsic state is passed in or stored by the client. Use Flyweight only when there really are **very many** objects and memory is the measured problem; otherwise it adds complexity for nothing. Related everyday examples: **string interning**, Java's `Integer` cache for small values, and **connection or object pools** (shared reusable instances).

```quiz
? "Total salary of everyone under this manager, at any level" is easiest with which pattern?
+ Composite: employees and managers share an interface, and a manager sums its reports recursively
- Flyweight
- Bridge
> The org chart is a tree; Composite lets a leaf and a whole subtree answer the same question.

? Shapes (circle, square) must render with two engines (vector, raster), and both sets will grow. Which pattern keeps classes from multiplying as shapes × engines?
- Composite
+ Bridge: Shape holds a Renderer interface
- Prototype
> Two independent dimensions are joined by composition, so adding one shape or one renderer adds one class.

? In the Flyweight pattern, why must the shared (intrinsic) state be immutable?
+ Thousands of objects share it, so a change through one would silently change all of them
- Immutable objects use less memory
- The factory can't store mutable objects
> Shared mutable state would couple every object that uses the flyweight.
```

:::keypoints
- **Composite**: leaves and containers implement one interface; containers delegate recursively. Use for any tree: file systems, menus, org charts, nested discounts.
- **Bridge**: split two independent dimensions (abstraction × implementation) into two hierarchies connected by composition, so classes grow as N + M, not N × M.
- **Flyweight**: share immutable intrinsic state among very many small objects via a caching factory; keep extrinsic state outside. Use only when memory is a measured problem.
:::
