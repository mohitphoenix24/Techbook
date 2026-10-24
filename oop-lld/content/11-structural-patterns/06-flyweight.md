---
title: Flyweight
level: intermediate
time: 30
summary: Save memory when you have a huge number of similar objects, by sharing the part that never changes. See shared and unshared data, a forest of trees, a text editor, and the rules for doing it safely.
---

## What problem does Flyweight solve?

Don't memorise the definition yet. Think of it like this:

> "I have 100,000 trees in a game. Most of them are the same kind of tree. Why should I store the same big picture 100,000 times? Let me store it **once** and share it."

:::def Flyweight
Share the common, **unchanging** part of many similar objects, so you store it only once. The part that is **different** for each object is kept separately.
:::

## The problem: millions of similar objects

A game draws 100,000 trees. Each tree has:

- a **species** (name, a big 3D model and texture, about 2 MB), and
- a **position** and **size** (just a few bytes).

If every tree keeps its own copy of the model and texture, memory explodes: 100,000 × 2 MB = 200 GB!

But trees of one species have the **same** model and texture. Only the position is different. So we split the data into two kinds:

| Kind | In simple words | Where we keep it |
|---|---|---|
| **Intrinsic** (shared) | does not change, same for many objects (species name, model, texture) | in **one shared object** per species |
| **Extrinsic** (not shared) | different for each use (x, y, size) | **outside**, kept by the user or passed in when needed |

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

## The code

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

Three shared objects serve 100,000 trees. That is about 6 MB instead of 200,000 MB. Each tree costs only its position and one pointer.

## Another example: letters in a text editor

A document with a million letters. If every letter was a full object with font details, it would be huge. Instead, share **one glyph object per (letter, font)**, and keep the positions outside.

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

## Rules for doing it right

1. **Shared objects must never change** (immutable). If one user changes it, everyone sees the change. Use `const` methods and `shared_ptr<const T>`.
2. **Split the data carefully.** If you put something that differs per use inside the shared object, sharing breaks.
3. **Always create shared objects through a factory**, so you never get duplicates.
4. **Make the factory thread-safe** if many threads use it (a mutex around the cache).
5. Users must not care whether they share the object or not.

## Trade-offs

| Good | Not so good |
|---|---|
| Big memory savings with many similar objects | code is more complex: data is in two places |
| Fewer allocations | the per-use data must be stored or calculated |
| Better speed because few shared objects fit in cache | shared objects live as long as the factory |

Use it only when you **measure** that memory is a problem because of very many similar objects. It is an optimisation. Do not use it for a dozen objects.

## Where you see it

- String pools (the same text stored once).
- Fonts and glyph caches, game sprite sheets, tile maps, particle systems.
- Icons in UI toolkits.
- Java's small-number cache (`Integer.valueOf`).

## Short answer to say in an interview

:::interview What are intrinsic and extrinsic state in Flyweight?
"Intrinsic state is the data that never changes and is the same for many objects, like a tree species' model and texture. We keep it in a shared object made by a factory. Extrinsic state is the data that differs for each use, like a tree's position. The user keeps it or passes it in. This saves a lot of memory when there are very many similar objects."
:::

```quiz
? What does a Flyweight share?
- Changing data between threads
+ Unchanging (immutable) data among many objects
- The whole object including its position
> Data that differs per use stays with the user.
? Why must shared flyweights be immutable?
- To make them faster
+ They are shared, so a change would affect everyone using them
- Because they use const members
> Changing shared data causes surprising bugs and data races.
? When is Flyweight worth using?
- For ten objects
+ When you measure that very many similar objects cause a memory problem
- Always
> It is an optimisation that adds complexity.
```

:::keypoints
- Flyweight shares unchanging data among many objects. The changing data is kept by the user.
- A factory keeps one shared object per distinct shared state. Make shared objects `const` and the factory thread-safe.
- Use it only when many similar objects cause a memory problem (trees, letters, particles, tiles).
:::
