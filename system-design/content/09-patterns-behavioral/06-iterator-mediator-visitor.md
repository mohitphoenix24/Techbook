---
title: Iterator, Mediator and Visitor
level: advanced
time: 45
summary: The remaining behavioral patterns you should recognise — Iterator (traversing a collection without exposing it; C++ iterators and JavaScript generators over a paginated source), Mediator (a hub that coordinates many objects, e.g. an air-traffic controller or chat room), and Visitor (adding operations to a fixed class hierarchy, with double dispatch and std::variant).
---

## Iterator

:::def Iterator
Provides a way to access the elements of a collection **sequentially without exposing its underlying representation** (array, tree, hash table, paginated API…). The iterator keeps the traversal state; the collection stays encapsulated.
:::

Both languages build Iterator into the language: C++ containers expose `begin()`/`end()` iterators (which is why the same `for (auto& x : c)` works on a vector, a set or your own class), and JavaScript has the **iteration protocol** (`[Symbol.iterator]`), with **generators** (`function*`) as the easy way to write iterators.

The pattern shines when the traversal is non-trivial: a tree in a specific order, a filtered or lazy sequence, or a collection that's fetched **page by page** from an API, which callers should be able to loop over as if it were one list:

:::tabs Iterating over a paginated source (and a custom C++ iterator)
```js run
// A fake API that returns 3 items per page with a cursor
const ALL = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `order-${i + 1}` }));
let apiCalls = 0;
async function fetchPage(cursor = 0) {
  apiCalls++;
  const items = ALL.slice(cursor, cursor + 3);
  return { items, next: cursor + 3 < ALL.length ? cursor + 3 : null };
}

// The iterator hides the paging: callers just loop
async function* allOrders() {
  for (let cursor = 0; cursor !== null; ) {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.next;
  }
}

// Lazy: only fetches pages as far as the caller actually reads
for await (const order of allOrders()) {
  if (order.id > 4) break;
  console.log("got", order.name);
}
console.log("API calls made:", apiCalls, "(stopped early, page 3 never fetched)");

// Composable generator pipelines
function* take(iter, n) { for (const x of iter) { if (n-- <= 0) return; yield x; } }
function* filter(iter, pred) { for (const x of iter) if (pred(x)) yield x; }
function* naturals() { for (let n = 1; ; n++) yield n; }          // infinite, but lazy
console.log("first 5 multiples of 7:", [...take(filter(naturals(), (n) => n % 7 === 0), 5)]);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

// A collection with its own iterator: a ring buffer that keeps the last N events.
// Callers iterate oldest -> newest without knowing about the wrap-around inside.
template <class T, size_t N>
class RingBuffer {
    array<T, N> data_{};
    size_t start_ = 0, size_ = 0;
public:
    void push(T v) {
        if (size_ < N) data_[(start_ + size_++) % N] = std::move(v);
        else { data_[start_] = std::move(v); start_ = (start_ + 1) % N; }   // overwrite the oldest
    }
    class iterator {
        const RingBuffer* rb_; size_t i_;
    public:
        using iterator_category = forward_iterator_tag;
        using value_type = T; using difference_type = ptrdiff_t; using pointer = const T*; using reference = const T&;
        iterator(const RingBuffer* rb, size_t i) : rb_(rb), i_(i) {}
        const T& operator*() const { return rb_->data_[(rb_->start_ + i_) % N]; }
        iterator& operator++() { ++i_; return *this; }
        bool operator!=(const iterator& o) const { return i_ != o.i_; }
        bool operator==(const iterator& o) const { return i_ == o.i_; }
    };
    iterator begin() const { return {this, 0}; }
    iterator end() const { return {this, size_}; }
};

int main() {
    RingBuffer<string, 3> recent;
    for (string e : {"login", "view", "add-to-cart", "checkout", "logout"}) recent.push(e);
    cout << "last 3 events:";
    for (const auto& e : recent) cout << " " << e;              // range-for works: it's an iterator
    cout << "\n";
    cout << "contains checkout: " << boolalpha << (find(recent.begin(), recent.end(), "checkout") != recent.end()) << "\n";   // STL algorithms work too
}
```
:::

## Mediator

:::def Mediator
Defines an object that **encapsulates how a set of objects interact**. Instead of referring to each other directly (a tangle of N × N connections), the objects (colleagues) talk only to the mediator, which coordinates them.
:::

**Problem:** in an airport, planes shouldn't negotiate runway use with each other directly; they talk to the **control tower**. In a chat room, users don't hold references to every other user; they send to the room. In a UI form, the "country" dropdown, "state" dropdown, "pin code" field and "submit" button affect each other; wiring each widget to every other one creates spaghetti.

```viz algo=arch title="Without vs with a mediator" dir=right
p1   Flight AI101 [ext]
p2   Flight 6E202 [ext]
p3   Flight UK303 [ext]
tower Control tower | the mediator [gateway]
rw   Runway 09L [map]
--
p1 <-> tower
p2 <-> tower
p3 <-> tower
tower -> rw : grants exclusive use
```

:::tabs An air-traffic control mediator
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Tower;

class Flight {                                       // a colleague: only knows the mediator
    string id_; Tower& tower_;
public:
    Flight(string id, Tower& t) : id_(std::move(id)), tower_(t) {}
    const string& id() const { return id_; }
    void requestLanding();
    void landingComplete();
    void notify(const string& msg) const { cout << "  " << id_ << " hears: " << msg << "\n"; }
};

class Tower {                                        // the mediator: owns the coordination rules
    vector<Flight*> flights_;
    optional<string> runwayUser_;
    deque<Flight*> queue_;
public:
    void registerFlight(Flight* f) { flights_.push_back(f); }
    void requestLanding(Flight* f) {
        if (!runwayUser_) { runwayUser_ = f->id(); f->notify("cleared to land on 09L"); broadcast(f->id() + " is landing, hold position", f); }
        else { queue_.push_back(f); f->notify("hold, you are number " + to_string(queue_.size()) + " in sequence"); }
    }
    void landingComplete(Flight* f) {
        cout << "  [tower] " << f->id() << " has vacated the runway\n";
        runwayUser_.reset();
        if (!queue_.empty()) { Flight* next = queue_.front(); queue_.pop_front(); requestLanding(next); }
    }
private:
    void broadcast(const string& msg, Flight* except) { for (auto* f : flights_) if (f != except) f->notify(msg); }
};

void Flight::requestLanding() { tower_.requestLanding(this); }
void Flight::landingComplete() { tower_.landingComplete(this); }

int main() {
    Tower tower;
    Flight a("AI101", tower), b("6E202", tower), c("UK303", tower);
    for (auto* f : {&a, &b, &c}) tower.registerFlight(f);
    a.requestLanding();
    b.requestLanding();
    c.requestLanding();
    a.landingComplete();
}
```
```js run
class ChatRoom {                                     // the mediator
  #members = new Map();
  #muted = new Set();
  join(user) { this.#members.set(user.name, user); user.room = this; this.#broadcast(`${user.name} joined`, user.name); }
  mute(name) { this.#muted.add(name); }
  send(from, text, to = null) {                     // all coordination rules live here
    if (this.#muted.has(from)) return this.#members.get(from).receive("system", "you are muted");
    if (to) return this.#members.get(to)?.receive(`${from} (private)`, text);
    this.#broadcast(`${from}: ${text}`, from);
  }
  #broadcast(text, except) { for (const [name, u] of this.#members) if (name !== except) u.receive("room", text); }
}

class User {                                         // a colleague: knows only the room
  constructor(name) { this.name = name; this.room = null; }
  say(text, to) { this.room.send(this.name, text, to); }
  receive(from, text) { console.log(`  ${this.name.padEnd(5)} <- [${from}] ${text}`); }
}

const room = new ChatRoom();
const [asha, bilal, chen] = ["asha", "bilal", "chen"].map((n) => new User(n));
[asha, bilal, chen].forEach((u) => room.join(u));
asha.say("standup in 5 min");
bilal.say("can you review my PR?", "chen");
room.mute("chen");
chen.say("spam spam spam");
```
:::

The mediator turns many-to-many dependencies into **many-to-one**, and puts the interaction rules in one place. The risk: the mediator becomes a **god object** that knows too much. Keep it focused on coordination, not on the colleagues' own logic. Mediator vs Observer: Observer is one-way broadcast from a subject to whoever subscribed; Mediator is a two-way hub with **rules** about who talks to whom. Mediator vs Facade: a facade simplifies access **into** a subsystem from outside; a mediator coordinates **between** peers.

LLD examples: **elevator controller** (cars and floor buttons talk to a dispatcher), **chat rooms**, **air traffic control**, auction houses, and form or dialog controllers in UIs.

## Visitor

:::def Visitor
Lets you add **new operations** to a stable class hierarchy **without modifying those classes**. Each operation is a visitor class with one method per element type; each element has an `accept(visitor)` method that calls back the right one (**double dispatch**).
:::

**Problem:** a document is a tree of `Paragraph`, `Image` and `Table` elements (a stable set). You keep needing new operations: render to HTML, count words, export to Markdown, check accessibility. Adding a method to every element class for every operation spreads each feature across all classes; a `switch` on the element type is fragile. Visitor groups each operation into one class.

:::tabs Visitor: classic double dispatch (C++ also shows std::variant + std::visit)
```cpp run
#include <bits/stdc++.h>
using namespace std;

// ---- Classic Visitor ----
struct Paragraph; struct Image; struct Table;
struct Visitor {
    virtual ~Visitor() = default;
    virtual void visit(const Paragraph&) = 0;
    virtual void visit(const Image&) = 0;
    virtual void visit(const Table&) = 0;
};
struct Element { virtual ~Element() = default; virtual void accept(Visitor& v) const = 0; };
struct Paragraph : Element { string text; explicit Paragraph(string t) : text(std::move(t)) {} void accept(Visitor& v) const override { v.visit(*this); } };
struct Image : Element { string src, alt; Image(string s, string a) : src(std::move(s)), alt(std::move(a)) {} void accept(Visitor& v) const override { v.visit(*this); } };
struct Table : Element { int rows, cols; Table(int r, int c) : rows(r), cols(c) {} void accept(Visitor& v) const override { v.visit(*this); } };

struct HtmlRenderer : Visitor {                      // operation 1
    string out;
    void visit(const Paragraph& p) override { out += "<p>" + p.text + "</p>"; }
    void visit(const Image& i) override { out += "<img src=\"" + i.src + "\" alt=\"" + i.alt + "\">"; }
    void visit(const Table& t) override { out += "<table " + to_string(t.rows) + "x" + to_string(t.cols) + ">"; }
};
struct AccessibilityChecker : Visitor {              // operation 2, added without touching the elements
    vector<string> issues;
    void visit(const Paragraph&) override {}
    void visit(const Image& i) override { if (i.alt.empty()) issues.push_back("image " + i.src + " has no alt text"); }
    void visit(const Table& t) override { if (t.rows > 20) issues.push_back("large table without summary"); }
};

// ---- Modern C++ alternative: a closed set of types in a std::variant ----
using Node = variant<Paragraph, Image, Table>;
struct WordCount {
    int operator()(const Paragraph& p) const { return count(p.text.begin(), p.text.end(), ' ') + 1; }
    int operator()(const Image&) const { return 0; }
    int operator()(const Table& t) const { return t.rows * t.cols; }   // assume one word per cell
};

int main() {
    vector<unique_ptr<Element>> doc;
    doc.push_back(make_unique<Paragraph>("System design is fun"));
    doc.push_back(make_unique<Image>("arch.png", ""));
    doc.push_back(make_unique<Table>(3, 4));

    HtmlRenderer html; AccessibilityChecker a11y;
    for (auto& e : doc) { e->accept(html); e->accept(a11y); }
    cout << html.out << "\n";
    for (auto& i : a11y.issues) cout << "a11y: " << i << "\n";

    vector<Node> nodes{Paragraph("System design is fun"), Image("arch.png", ""), Table(3, 4)};
    int words = 0;
    for (auto& n : nodes) words += visit(WordCount{}, n);
    cout << "word count (std::visit): " << words << "\n";
}
```
```js run
// Elements: each accept() calls the visitor method for ITS type (double dispatch)
class Paragraph { constructor(text) { this.text = text; } accept(v) { return v.visitParagraph(this); } }
class Image { constructor(src, alt) { Object.assign(this, { src, alt }); } accept(v) { return v.visitImage(this); } }
class Table { constructor(rows, cols) { Object.assign(this, { rows, cols }); } accept(v) { return v.visitTable(this); } }

const htmlRenderer = {                                   // operation 1
  visitParagraph: (p) => `<p>${p.text}</p>`,
  visitImage: (i) => `<img src="${i.src}" alt="${i.alt}">`,
  visitTable: (t) => `<table ${t.rows}x${t.cols}>`,
};
const accessibilityChecker = {                           // operation 2, added without touching the elements
  visitParagraph: () => [],
  visitImage: (i) => (i.alt ? [] : [`image ${i.src} has no alt text`]),
  visitTable: (t) => (t.rows > 20 ? ["large table without summary"] : []),
};
const wordCounter = {                                    // operation 3
  visitParagraph: (p) => p.text.split(/\s+/).length,
  visitImage: () => 0,
  visitTable: (t) => t.rows * t.cols,
};

const doc = [new Paragraph("System design is fun"), new Image("arch.png", ""), new Table(3, 4)];
console.log(doc.map((e) => e.accept(htmlRenderer)).join(""));
doc.flatMap((e) => e.accept(accessibilityChecker)).forEach((i) => console.log("a11y:", i));
console.log("word count:", doc.reduce((n, e) => n + e.accept(wordCounter), 0));
```
:::

The trade-off is precise: Visitor makes **adding operations** easy and **adding element types** hard (every visitor must gain a new method). Use it when the **types are stable and operations keep growing**: compilers and interpreters (AST nodes visited by type checkers, optimisers, code generators), document and file-format processing, tax/pricing rules over a fixed set of item types. In modern C++, `std::variant` + `std::visit` gives the same benefit for closed sets of types with less boilerplate; in JavaScript, a map of handlers keyed by type is often enough.

```quiz
? You want callers to loop over all of a user's orders with `for await (const o of orders())`, although the API returns 50 per page. Which pattern?
+ Iterator (an async generator that fetches pages lazily)
- Visitor
- Mediator
> The iterator hides the paging and fetches only as far as the caller reads.

? In a chat app, users shouldn't hold references to every other user; muting and private messages have rules. Which pattern?
+ Mediator: users talk only to the ChatRoom, which applies the rules
- Iterator
- Flyweight
> The mediator turns many-to-many connections into many-to-one and centralises interaction rules.

? When is Visitor a good fit?
+ When the set of element types is stable but new operations over them are added often
- When new element types are added often
- When only one operation exists
> Adding an element type forces changes to every visitor; adding an operation is just a new visitor.
```

:::keypoints
- **Iterator**: sequential access without exposing the representation. Built into both languages (C++ `begin/end`, JS `Symbol.iterator`); **generators** make lazy, composable, even paginated iterators easy.
- **Mediator**: colleagues talk only to a hub that holds the interaction rules (control tower, chat room, elevator dispatcher); avoid letting it become a god object.
- **Visitor**: new operations over a stable type hierarchy via `accept` + double dispatch; easy to add operations, hard to add types. Modern alternatives: `std::variant` + `std::visit`, handler maps in JS.
:::
