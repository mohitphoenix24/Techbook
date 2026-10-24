---
title: Entity-Component-System (ECS)
level: intermediate
time: 30
summary: Why game objects do not fit well in deep class trees, and how to build them from small parts instead. Entities are ids, components are plain data, and systems hold the behaviour. A small C++ example and the speed benefits.
---

## Why do we need this?

Games have **many kinds of objects** that share different abilities:

- a tree is drawn,
- a crate is drawn and has physics,
- a player is drawn, has physics, health and input,
- an enemy is drawn, has physics, health and AI.

Using normal inheritance for this gets messy very quickly.

## The inheritance trap

```text
GameObject
 ├─ Drawable ── Tree
 ├─ Physical ── Crate
 ├─ Character ── Player, Enemy
 └─ ??? FlyingEnemy (a Character that ignores gravity)
 └─ ??? Boss (a Character with a health bar, AI, and special physics)
```

Every new combination bends the class tree. You are forced into multiple inheritance, or you push features up into a "fat" base class that every object has to carry. We saw the same problem with birds earlier. The fix is the same: abilities should be **parts**, not branches of a family tree.

## The ECS idea

Don't memorise the names yet. Think of building a character in a game by **ticking boxes**: "can move", "can be hurt", "can be drawn". The character is just the set of ticked boxes.

| Word | What it is | Example |
|---|---|---|
| **Entity** | only an **id** (a number): "a thing in the world" | `Entity 17` |
| **Component** | a **plain data** struct with no behaviour: one side of a thing | `Position{x,y}`, `Velocity{dx,dy}`, `Health{hp}` |
| **System** | **behaviour**: a function that works on **all** entities that have certain components | `MovementSystem` updates every entity that has Position and Velocity |

An entity is defined by **which components it has**:

- A tree = `{Position, Sprite}`.
- A crate = `{Position, Sprite, Velocity}`.
- A player = `{Position, Sprite, Velocity, Health, Input}`.

To make something "fly", you add a component or two. No class changes.

```viz algo=uml title="ECS: data in components, logic in systems"
class World
  + create(): Entity
  + add(e: Entity, c: Component): void
class Position
  + x: float
  + y: float
class Velocity
  + dx: float
  + dy: float
class Health
  + hp: int
class MovementSystem
  + update(w: World, dt: float): void
class HazardSystem
  + update(w: World): void
MovementSystem ..> World
HazardSystem ..> World
World *-- Position
World *-- Velocity
World *-- Health
```

## A tiny ECS

```cpp run title="Entities as ids, components as data, systems as functions"
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace std;

using Entity = int;

struct Position { float x = 0, y = 0; };
struct Velocity { float dx = 0, dy = 0; };
struct Health   { int hp = 100; };
struct Name     { string value; };

class World {
    int next_ = 1;
    map<Entity, Position> positions_;
    map<Entity, Velocity> velocities_;
    map<Entity, Health>   healths_;
    map<Entity, Name>     names_;
public:
    Entity create() { return next_++; }
    void add(Entity e, Position p) { positions_[e] = p; }
    void add(Entity e, Velocity v) { velocities_[e] = v; }
    void add(Entity e, Health h)   { healths_[e] = h; }
    void add(Entity e, Name n)     { names_[e] = move(n); }

    // ---- systems: loop over entities that have the needed components ----
    void movementSystem(float dt) {
        for (auto& [e, vel] : velocities_) {
            auto it = positions_.find(e);
            if (it == positions_.end()) continue;           // needs Position AND Velocity
            it->second.x += vel.dx * dt;
            it->second.y += vel.dy * dt;
        }
    }
    void hazardSystem(float lavaX) {
        for (auto& [e, pos] : positions_) {
            auto h = healths_.find(e);
            if (h == healths_.end()) continue;              // only things with Health can be hurt
            if (pos.x >= lavaX) h->second.hp -= 40;
        }
    }
    void report() const {
        for (const auto& [e, n] : names_) {
            cout << "  " << n.value << " (#" << e << ")";
            if (auto p = positions_.find(e); p != positions_.end()) cout << " at (" << p->second.x << ", " << p->second.y << ")";
            if (auto h = healths_.find(e); h != healths_.end()) cout << " hp=" << h->second.hp;
            cout << "\n";
        }
    }
};

int main() {
    World w;
    Entity tree = w.create();   w.add(tree, Name{"tree"});     w.add(tree, Position{10, 0});                                         // no velocity, no health
    Entity crate = w.create();  w.add(crate, Name{"crate"});   w.add(crate, Position{0, 0});   w.add(crate, Velocity{1, 0});         // moves, cannot be hurt
    Entity hero = w.create();   w.add(hero, Name{"hero"});     w.add(hero, Position{0, 0});    w.add(hero, Velocity{2, 0});  w.add(hero, Health{100});

    cout << "start:\n"; w.report();
    for (int step = 0; step < 3; ++step) { w.movementSystem(1.0f); w.hazardSystem(5.0f); }
    cout << "after 3 steps (lava at x >= 5):\n"; w.report();
}
```

Look at the result:

- The tree never moves, because it has no `Velocity`.
- The crate moves, but cannot be hurt, because it has no `Health`.
- The hero does both.

There is **no class tree**. To add something new, like poison, you write a new component and a new system. No old code is edited.

## Why it is fast (data-oriented design)

Real ECS libraries (EnTT, flecs, Unity DOTS, Bevy) keep each kind of component in a **continuous array**. A system then walks through memory in order, which the CPU cache loves.

```cpp run title="Contiguous component arrays (struct of arrays)"
#include <iostream>
#include <vector>
using namespace std;

struct Positions { vector<float> x, y; };
struct Velocities { vector<float> dx, dy; };

void step(Positions& p, const Velocities& v, float dt) {   // one tight loop over contiguous memory
    for (size_t i = 0; i < p.x.size(); ++i) { p.x[i] += v.dx[i] * dt; p.y[i] += v.dy[i] * dt; }
}

int main() {
    Positions p; Velocities v;
    for (int i = 0; i < 5; ++i) { p.x.push_back(float(i)); p.y.push_back(0); v.dx.push_back(1); v.dy.push_back(0.5f); }
    step(p, v, 2.0f);
    for (size_t i = 0; i < p.x.size(); ++i) cout << "(" << p.x[i] << "," << p.y[i] << ") ";
    cout << "\n";
}
```

A list of `GameObject*` pointers is scattered around the heap, and each object needs a virtual call. Component arrays are read one after another with no virtual calls. For big worlds this is often **several times faster**.

## ECS vs normal OOP

| | Inheritance-based objects | ECS |
|---|---|---|
| Mixing abilities | multiple inheritance or deep trees | add components |
| Where behaviour lives | in each object's methods | in systems, over many entities |
| Memory layout | object by object (jumping around) | component arrays (cache friendly) |
| Adding behaviour | edit classes | add a component and a system |
| Weak point | rigid, fragile base classes | interactions are harder to follow; less encapsulation; too much for small apps |

## When to use it

- **Games, simulations, particle systems** with thousands of objects that mix abilities.
- Anywhere things **gain and lose abilities** while running.
- When fast bulk updates matter.

For a normal business LLD problem (parking lot, library), classes with composition and patterns are better. ECS is great to **mention** when asked about game design ("design a game engine", "design Mario").

## Short answer to say in an interview

:::interview What is ECS, and why use it instead of inheritance?
"ECS splits a game object into three things. Entities are just ids. Components are plain data. Systems are the logic that works on all entities that have certain components. An entity's abilities are the components it has, so I can mix abilities without class trees, and add behaviour with a new component and system. Components are stored in continuous arrays, so systems run fast with no virtual calls. It is composition over inheritance taken as far as it can go."
:::

```quiz
? In ECS, what is an entity?
- A class with virtual methods
+ An id that groups components
- A system
> Entities are ids. Data is in components and logic is in systems.
? What does a MovementSystem work on?
- Every entity
+ Entities that have both Position and Velocity
- Only the player
> A system selects entities by the components it needs.
? Why is ECS often faster than a class hierarchy?
- It uses fewer classes
+ Components sit side by side in memory and are processed in tight loops without virtual calls
- It uses threads
> Better cache use, and no dynamic dispatch per object.
```

:::keypoints
- ECS: entities are ids, components are plain data, systems are the behaviour over entities that have certain components.
- It is composition instead of inheritance. Add or remove abilities by adding or removing components. New behaviour is a new component and a new system.
- Continuous component storage makes it fast. Best for games and simulations, not for every domain.
:::
