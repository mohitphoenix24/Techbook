---
title: Flyweight
level: advanced
time: 30
summary: Saving memory by sharing the common, unchanging part of many similar objects: intrinsic versus extrinsic state, a factory that caches flyweights, a forest of trees and a text editor, measuring the savings, and the thread-safety and immutability rules.
---

:::def Flyweight
Use **sharing** to support a large number of **fine-grained objects** efficiently. Separate the object's state into **intrinsic** (shared, immutable) and **extrinsic** (supplied by the client at use time).
:::

## The problem: millions of similar objects

A game draws 100,000 trees. Each tree has a **species** (name, a big mesh and texture, 2 MB) and a **position** and **size** (a few bytes). If every tree object carries its own copy of the mesh and texture, memory explodes: 100,000 × 2 MB = 200 GB.

But most trees of one species have **identical** mesh and texture. Only their position differs. So split the state:

| State | Description | Where it lives |
|---|---|---|
| **Intrinsic** | does not depend on context; identical for many objects; **immutable** (species name, mesh, texture) | **shared** flyweight object (one per species) |
| **Extrinsic** | depends on context; differs per use (x, y, scale) | stored by the **client** (or passed in each call) |

```viz algo=uml title="Flyweight"
class TreeType
  - name: string
  - texture: vector<byte>
  + draw(x: int, y: int): void
class TreeTypeFactory
  - cache: map<string, TreeType>
  + get(name: string): TreeType
class Tree
  - x: int
  - y: int
  - type: TreeType*
class Forest
  - trees: Tree[]
  + plant(x: int, y: int, species: string): void
TreeTypeFactory o-- TreeType : shares
Tree --> TreeType
Forest *-- Tree
Forest --> TreeTypeFactory
```

## Code

```cpp run title="A forest of 100,000 trees sharing three tree types"
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using namespace std;

// The FLYWEIGHT: intrinsic, immutable, shared state
class TreeType {
    string name_;
    vector<char> texture_;                                 // pretend this is big
public:
    TreeType(string name, size_t textureBytes) : name_(move(name)), texture_(textureBytes, 'x') {}
    size_t memory() const { return texture_.size() + name_.size(); }
    void draw(int x, int y) const { (void)x; (void)y; /* draw name_ at (x, y) using texture_ */ }
    const string& name() const { return name_; }
};

// The FACTORY: guarantees one flyweight per distinct intrinsic state
class TreeTypeFactory {
    map<string, shared_ptr<const TreeType>> cache_;
public:
    shared_ptr<const TreeType> get(const string& name) {
        auto& slot = cache_[name];
        if (!slot) slot = make_shared<const TreeType>(name, 2'000'000);       // ~2 MB, created once per species
        return slot;
    }
    size_t distinct() const { return cache_.size(); }
    size_t memory() const { size_t m = 0; for (const auto& [k, t] : cache_) m += t->memory(); return m; }
};

// The CONTEXT: tiny per-tree extrinsic state + a pointer to the shared flyweight
struct Tree {
    int x, y;
    shared_ptr<const TreeType> type;
    void draw() const { type->draw(x, y); }
};

int main() {
    TreeTypeFactory factory;
    vector<Tree> forest;
    const char* species[] = {"oak", "pine", "birch"};
    for (int i = 0; i < 100000; ++i)
        forest.push_back({i % 1000, i / 1000, factory.get(species[i % 3])});

    cout << "trees: " << forest.size() << "\n";
    cout << "distinct tree types (flyweights): " << factory.distinct() << "\n";
    cout << "texture memory with sharing:    " << factory.memory() / 1'000'000 << " MB\n";
    cout << "texture memory WITHOUT sharing: " << forest.size() * 2'000'000ULL / 1'000'000 << " MB\n";
    cout << "per-tree context (x, y, pointer): " << sizeof(Tree) << " bytes\n";
}
```

Three flyweights serve 100,000 trees: about 6 MB instead of 200,000 MB. The per-tree cost is just position and a pointer.

## A text editor: characters as flyweights

Another classic: a document with a million characters. A `Glyph` object per character would be heavy. Share **one glyph object per distinct (character, font)**, and keep positions outside.

```cpp run title="Glyph flyweights in a document"
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Glyph {                                              // intrinsic: the character and its font; immutable
    char ch_;
    string font_;
public:
    Glyph(char c, string f) : ch_(c), font_(move(f)) {}
    void render(int col, int row, const string& colour) const {          // extrinsic state passed in
        cout << "  '" << ch_ << "' [" << font_ << "," << colour << "] at (" << col << "," << row << ")\n";
    }
};

class GlyphFactory {
    map<pair<char, string>, shared_ptr<const Glyph>> pool_;
public:
    shared_ptr<const Glyph> get(char c, const string& font) {
        auto key = make_pair(c, font);
        auto it = pool_.find(key);
        if (it == pool_.end()) it = pool_.emplace(key, make_shared<const Glyph>(c, font)).first;
        return it->second;
    }
    size_t size() const { return pool_.size(); }
};

struct Placed { shared_ptr<const Glyph> glyph; int col, row; string colour; };

int main() {
    GlyphFactory glyphs;
    vector<Placed> doc;
    string text = "hello world";
    for (size_t i = 0; i < text.size(); ++i)
        doc.push_back({glyphs.get(text[i], "Arial"), static_cast<int>(i), 0, i < 5 ? "black" : "blue"});

    for (size_t i = 0; i < 3; ++i) doc[i].glyph->render(doc[i].col, doc[i].row, doc[i].colour);
    cout << "characters in the document: " << doc.size() << ", glyph objects created: " << glyphs.size() << "\n";   // l and o repeat
}
```

## Rules for a correct Flyweight

1. **Flyweights are immutable.** They are shared, so any mutation would affect every user (and cause data races across threads). Make methods `const` and hold them as `shared_ptr<const T>`.
2. **Separate intrinsic and extrinsic state carefully.** If you put something context-dependent in the flyweight, sharing breaks.
3. **Create flyweights through the factory only**, so duplicates never appear.
4. **The factory must be thread-safe** if used concurrently (mutex around the cache).
5. **Identity does not matter**: two clients using the "oak" flyweight must not care that they share one object.

## Trade-offs

| Benefit | Cost |
|---|---|
| Large memory savings when there are many similar objects | more complex code: state split into two places |
| Fewer allocations | extrinsic state must be computed or stored per use (CPU for memory trade) |
| Better cache locality when the flyweights are few | flyweights live as long as the factory (or until reference counts drop) |

Use it only when profiling shows **memory pressure from very many similar objects**. It is an optimisation pattern. Do not apply it to a dozen objects.

## Real examples

- `std::string` interning and the **string pool** in managed languages.
- Fonts and glyph caches; sprite and texture atlases in games; tile maps; particle systems.
- Icons in a UI toolkit; database connection descriptors (when immutable).
- The "same value" integer cache in Java (`Integer.valueOf`).

:::interview Explain intrinsic vs extrinsic state in Flyweight
"Intrinsic state is the context-independent, immutable data that many objects have in common, like a tree species' mesh and texture; it is stored in a shared flyweight created by a factory. Extrinsic state depends on the use, like a tree's position, and is stored by the client or passed to the flyweight's methods. This saves memory when you have very many similar objects."
:::

```quiz
? What does a Flyweight share?
- Mutable state between threads
+ Immutable intrinsic state among many objects
- The whole object including position
> Per-use data (extrinsic state) stays with the client.
? Why must flyweights be immutable?
- To make them faster
+ They are shared, so a change would affect every user of the same object
- Because they use `const` members
> Mutation of shared state causes surprising bugs and data races.
? When is Flyweight worth using?
- For ten objects
+ When profiling shows very many similar objects causing memory pressure
- Always
> It is an optimisation with a complexity cost.
```

:::keypoints
- Flyweight shares immutable intrinsic state among many objects; extrinsic state is supplied by the client.
- A factory caches flyweights (one per distinct intrinsic state). Make flyweights `const` and the factory thread-safe.
- Use only when many similar objects cause memory pressure (trees, glyphs, particles, tiles).
:::
