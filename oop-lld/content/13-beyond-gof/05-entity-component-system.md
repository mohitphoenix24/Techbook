---
title: Entity-Component-System (ECS)
level: advanced
time: 30
summary: Why deep inheritance trees fail for game objects, how composition goes further with entities as ids, components as plain data and systems as behaviour, a small ECS in C++, and the cache and flexibility benefits compared with classical OOP.
---

Games and simulations have **many kinds of objects** with overlapping abilities: a tree is drawn; a crate is drawn and has physics; a player is drawn, has physics, health and input; an enemy is drawn, has physics, health and AI. Classical inheritance struggles with this.

## The inheritance trap

```text
GameObject
 ├─ Drawable ── Tree
 ├─ Physical ── Crate
 ├─ Character ── Player, Enemy
 └─ ??? FlyingEnemy (a Character that ignores gravity)
 └─ ??? Boss (a Character with a health bar, AI, and special physics)
```

Every new combination bends the hierarchy, forces multiple inheritance, or pushes features up into a "fat" base class that every object pays for. We already saw this with birds: behaviour belongs in **parts**, not in the class tree.

## The ECS idea

| Concept | What it is | Example |
|---|---|---|
| **Entity** | just an **id** (a number): "a thing in the world" | `Entity 17` |
| **Component** | a **plain data** struct with no behaviour; one aspect of a thing | `Position{x,y}`, `Velocity{dx,dy}`, `Health{hp}` |
| **System** | **behaviour**: a function that processes all entities having a certain set of components | `MovementSystem` updates every entity with Position + Velocity |

An entity **is defined by which components it has**. A tree = `{Position, Sprite}`. A crate = `{Position, Sprite, Velocity}`. A player = `{Position, Sprite, Velocity, Health, Input}`. Adding "flying" means adding a component or two. No class changes.

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

The tree never moves because it has no `Velocity`; the crate moves but cannot be hurt because it has no `Health`; the hero does both. **No class hierarchy**, and a new behaviour (poison, say) is a new component plus a new system, with no edit to existing code.

## Why it scales: data-oriented design

Real ECS libraries (EnTT, flecs, Unity DOTS, Bevy) store each component type in a **contiguous array** (struct of arrays). A system then loops over memory in order, which is excellent for the CPU cache.

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

An array of polymorphic `GameObject*` scatters objects over the heap and makes a virtual call per object. Component arrays are processed linearly with no virtual calls, often **several times faster** for large worlds.

## ECS vs classical OOP

| | Inheritance-based objects | ECS |
|---|---|---|
| Combining abilities | multiple inheritance / deep trees | add components |
| Behaviour location | in each object's methods | in systems, over many entities |
| Data layout | object-by-object (pointer chasing) | component arrays (cache friendly) |
| Adding a behaviour | edit classes | add a component and a system |
| Weak point | rigid, fragile base classes | harder to reason about interactions; less encapsulation; overkill for small apps |

## When to use it

- **Games, simulations, particle systems**, with thousands of entities that mix abilities.
- Any domain where "things" gain and lose capabilities at run time.
- When performance of bulk updates matters.

For a typical business-logic LLD problem (parking lot, library), classes with composition and patterns are better. ECS is a good thing to *mention* when asked about game design ("design a game engine", "design Mario").

:::interview What is ECS and why use it instead of inheritance?
"Entity-Component-System splits game objects into entities (just ids), components (plain data) and systems (logic that processes all entities having certain components). An entity's abilities are the components it has, so I combine abilities without class hierarchies, and add behaviour with a new component and system. Because components are stored in contiguous arrays, systems iterate cache-friendly with no virtual calls. It is composition over inheritance taken to its limit."
:::

```quiz
? In ECS, what is an entity?
- A class with virtual methods
+ An identifier that groups components
- A system
> Entities are ids; data lives in components and logic in systems.
? What does a MovementSystem process?
- Every entity
+ Entities that have both Position and Velocity components
- Only the player
> Systems select entities by the set of components they need.
? Why is ECS often faster than an object hierarchy?
- It uses fewer classes
+ Components are stored contiguously and processed in tight loops without virtual calls
- It uses threads
> Better cache locality and no dynamic dispatch per object.
```

:::keypoints
- ECS: entities are ids, components are plain data, systems are behaviour over entities with certain components.
- Composition instead of inheritance: abilities are added or removed by adding components. New behaviour = a new component and system.
- Contiguous component storage gives cache-friendly speed. Best for games and simulations, not for every domain.
:::
