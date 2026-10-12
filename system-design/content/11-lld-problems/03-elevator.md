---
title: Design an Elevator System
level: advanced
time: 60
summary: A multi-elevator controller — hall calls vs car calls, each car as a state machine running the LOOK (elevator) algorithm, a pluggable dispatch strategy that assigns hall calls by estimated cost, a tick-based simulation in C++ and JavaScript, and the trade-offs interviewers probe (fairness, rush hour, zoning, concurrency).
---

:::problem Design an Elevator System {level=hard tags="LLD,State,Strategy,simulation"}
A building has M floors and N elevators. People press up/down buttons on floors (hall calls) and floor buttons inside cars (car calls). Design the classes, decide which elevator serves each hall call, and implement the movement logic so every request is eventually served efficiently.

:::hint Hint
Separate two concerns: (1) how ONE car orders its stops (a state machine that keeps going in its current direction while it has stops ahead: the LOOK algorithm), and (2) which car should take a new hall call (a dispatch strategy that estimates each car's cost).
:::
:::

## Requirements

**Functional**
- N elevators, floors 0…M−1.
- **Hall calls**: a person on floor f presses ▲ or ▼. The controller assigns the call to one car.
- **Car calls**: inside a car, a person presses a destination floor. Only that car serves it.
- Cars move one floor per tick, stop at requested floors, open doors, and continue.
- Display each car's floor and direction.

**Non-functional and rules**
- Every request is served (no starvation).
- Minimise waiting time; avoid needless direction changes.
- The dispatching algorithm should be replaceable (rush-hour modes, zoning).
- Out of scope: weight limits, emergency modes, maintenance (mention as extensions).

## Entities

```viz algo=uml title="Elevator system"
class ElevatorController
  - cars: Elevator[]
  - dispatcher: DispatchStrategy
  + hallCall(floor, dir)
  + carCall(carId, floor)
  + step()
class Elevator
  - id: int
  - floor: int
  - direction: Direction
  - doorsOpen: bool
  - stops: set<int>
  + addStop(floor)
  + step()
  + costTo(floor, dir): int
interface DispatchStrategy
  + choose(cars, floor, dir): Elevator
class NearestCarStrategy
class ZoningStrategy
enum Direction
  UP
  DOWN
  IDLE
ElevatorController *-- Elevator : 1..*
ElevatorController --> DispatchStrategy
NearestCarStrategy ..|> DispatchStrategy
ZoningStrategy ..|> DispatchStrategy
Elevator --> Direction
```

## One car: a state machine running LOOK

Each car is in one of a few states: **idle**, **moving up**, **moving down**, **doors open**. The movement rule is the classic **LOOK** algorithm (a refinement of SCAN, the "elevator algorithm" also used by disk schedulers):

:::flow LOOK, per tick
Doors open? | close them this tick (passengers boarded)
At a stop? | open the doors, remove the stop
Stops ahead in my direction? | keep going that way
Stops only behind me? | reverse direction
No stops? | become idle
:::

Why not "go to the nearest request"? Shortest-seek-first can **starve** far floors: with constant requests near the middle, someone on the top floor might wait forever. LOOK guarantees that every stop is reached within at most one sweep in each direction.

```viz algo=arch title="Car state transitions" dir=right
idle    Idle [box]
up      Moving up [box]
down    Moving down [box]
doors   Doors open [box]
--
idle -> up : stop above
idle -> down : stop below
up -> doors : reached a stop
down -> doors : reached a stop
doors -> up : stops still above
doors -> down : stops below
doors -> idle : no stops left
```

## Dispatching hall calls

When someone presses ▲ on floor 7, which car should come? A **cost estimate** per car, minimised:

- An **idle** car: cost = distance.
- A car **moving toward** floor 7 **in the same direction** (going up, currently below 7): cost = distance (it can stop on the way).
- Otherwise: it must finish its current sweep first: cost ≈ distance to its farthest stop + distance from there back to 7.
- Add a small penalty per stop already queued, to spread load.

This is a **strategy**: building managers can switch to **zoning** (cars 1–2 serve floors 0–10, cars 3–4 serve 11–20) or **up-peak mode** at 9 a.m. (idle cars return to the lobby).

## Implementation

:::tabs Elevator controller with a tick-based simulation
```cpp run
#include <bits/stdc++.h>
using namespace std;

enum class Dir { UP, DOWN, IDLE };
const char* sym(Dir d) { return d == Dir::UP ? "^" : d == Dir::DOWN ? "v" : "-"; }

class Elevator {
public:
    const int id;
    explicit Elevator(int id, int floor = 0) : id(id), floor_(floor) {}
    void addStop(int f) {
        if (f == floor_ && dir_ == Dir::IDLE) { doorsOpen_ = true; return; }   // already here
        stops_.insert(f);
        if (!doorsOpen_) updateDirection();          // commit to a direction now, so dispatch sees it
    }
    int floor() const { return floor_; }
    Dir dir() const { return dir_; }
    bool doorsOpen() const { return doorsOpen_; }
    size_t load() const { return stops_.size(); }

    // Estimated ticks to reach floor f to travel in direction d
    int costTo(int f, Dir d) const {
        int dist = abs(floor_ - f);
        if (dir_ == Dir::IDLE || stops_.empty()) return dist;      // idle, or just finished its last stop
        bool ahead = (dir_ == Dir::UP && f >= floor_) || (dir_ == Dir::DOWN && f <= floor_);
        if (ahead && d == dir_) return dist + (int)stops_.size();
        int far = dir_ == Dir::UP ? *stops_.rbegin() : *stops_.begin();   // finish the sweep, then come back
        return abs(floor_ - far) + abs(far - f) + (int)stops_.size();
    }

    // One tick of the LOOK algorithm; returns an event description (or "")
    string step() {
        if (doorsOpen_) { doorsOpen_ = false; updateDirection(); return ""; }
        if (stops_.count(floor_)) { stops_.erase(floor_); doorsOpen_ = true; return "car " + to_string(id) + " opens at " + to_string(floor_); }
        updateDirection();
        if (dir_ == Dir::UP) floor_++;
        else if (dir_ == Dir::DOWN) floor_--;
        return "";
    }
private:
    int floor_;
    Dir dir_ = Dir::IDLE;
    bool doorsOpen_ = false;
    set<int> stops_;                                   // ordered: easy to find stops above/below
    void updateDirection() {
        if (stops_.empty()) { dir_ = Dir::IDLE; return; }
        bool above = stops_.upper_bound(floor_) != stops_.end();
        bool below = stops_.lower_bound(floor_) != stops_.begin();
        if (dir_ == Dir::UP && above) return;          // keep going: that's LOOK
        if (dir_ == Dir::DOWN && below) return;
        dir_ = above ? Dir::UP : below ? Dir::DOWN : Dir::IDLE;
    }
};

struct DispatchStrategy {
    virtual ~DispatchStrategy() = default;
    virtual Elevator& choose(vector<Elevator>& cars, int floor, Dir d) = 0;
};
struct LowestCostStrategy : DispatchStrategy {
    Elevator& choose(vector<Elevator>& cars, int floor, Dir d) override {
        return *min_element(cars.begin(), cars.end(), [&](const Elevator& a, const Elevator& b) { return a.costTo(floor, d) < b.costTo(floor, d); });
    }
};

class ElevatorController {
    vector<Elevator> cars_;
    unique_ptr<DispatchStrategy> dispatcher_;
    int tick_ = 0;
public:
    ElevatorController(int n, unique_ptr<DispatchStrategy> s) : dispatcher_(std::move(s)) { for (int i = 1; i <= n; i++) cars_.emplace_back(i); }
    void hallCall(int floor, Dir d) {
        Elevator& car = dispatcher_->choose(cars_, floor, d);
        car.addStop(floor);
        cout << "t=" << setw(2) << tick_ << " hall call " << floor << sym(d) << " -> car " << car.id << "\n";
    }
    void carCall(int carId, int floor) { cars_.at(carId - 1).addStop(floor); cout << "t=" << setw(2) << tick_ << " inside car " << carId << ": floor " << floor << "\n"; }
    void step() {
        tick_++;
        for (auto& c : cars_) if (auto ev = c.step(); !ev.empty()) cout << "t=" << setw(2) << tick_ << " " << ev << "\n";
    }
    string display() const {
        string s;
        for (auto& c : cars_) s += "[car " + to_string(c.id) + ": " + to_string(c.floor()) + sym(c.dir()) + (c.doorsOpen() ? " doors" : "") + "] ";
        return s;
    }
};

int main() {
    ElevatorController ctl(2, make_unique<LowestCostStrategy>());
    ctl.hallCall(5, Dir::UP);                 // someone on 5 wants to go up
    ctl.hallCall(2, Dir::UP);
    for (int i = 0; i < 3; i++) ctl.step();
    ctl.carCall(2, 9);                        // whoever boarded car 2 at floor 2 wants 9
    for (int i = 0; i < 4; i++) ctl.step();
    ctl.carCall(1, 8);                        // passenger in car 1 (now at 5) wants 8
    ctl.hallCall(3, Dir::DOWN);               // a downward call while both cars go up
    for (int i = 0; i < 14; i++) ctl.step();
    cout << ctl.display() << "\n";
}
```
```js run
const Dir = Object.freeze({ UP: "^", DOWN: "v", IDLE: "-" });

class Elevator {
  #stops = new Set(); #floor; #dir = Dir.IDLE; #doorsOpen = false;
  constructor(id, floor = 0) { this.id = id; this.#floor = floor; }
  get floor() { return this.#floor; }
  get dir() { return this.#dir; }
  get doorsOpen() { return this.#doorsOpen; }
  addStop(f) {
    if (f === this.#floor && this.#dir === Dir.IDLE) { this.#doorsOpen = true; return; }   // already here
    this.#stops.add(f);
    if (!this.#doorsOpen) this.#updateDirection();   // commit to a direction now, so dispatch sees it
  }

  costTo(f, d) {                                       // estimated ticks to reach f to travel in d
    const dist = Math.abs(this.#floor - f);
    if (this.#dir === Dir.IDLE || this.#stops.size === 0) return dist;   // idle, or just finished its last stop
    const ahead = (this.#dir === Dir.UP && f >= this.#floor) || (this.#dir === Dir.DOWN && f <= this.#floor);
    if (ahead && d === this.#dir) return dist + this.#stops.size;
    const far = this.#dir === Dir.UP ? Math.max(...this.#stops) : Math.min(...this.#stops);   // finish the sweep first
    return Math.abs(this.#floor - far) + Math.abs(far - f) + this.#stops.size;
  }

  step() {                                            // one tick of LOOK; returns an event or ""
    if (this.#doorsOpen) { this.#doorsOpen = false; this.#updateDirection(); return ""; }
    if (this.#stops.has(this.#floor)) { this.#stops.delete(this.#floor); this.#doorsOpen = true; return `car ${this.id} opens at ${this.#floor}`; }
    this.#updateDirection();
    if (this.#dir === Dir.UP) this.#floor++;
    else if (this.#dir === Dir.DOWN) this.#floor--;
    return "";
  }
  #updateDirection() {
    if (this.#stops.size === 0) { this.#dir = Dir.IDLE; return; }
    const above = [...this.#stops].some((s) => s > this.#floor), below = [...this.#stops].some((s) => s < this.#floor);
    if ((this.#dir === Dir.UP && above) || (this.#dir === Dir.DOWN && below)) return;   // keep going: LOOK
    this.#dir = above ? Dir.UP : below ? Dir.DOWN : Dir.IDLE;
  }
}

const lowestCost = { choose: (cars, floor, d) => cars.reduce((best, c) => (c.costTo(floor, d) < best.costTo(floor, d) ? c : best)) };

class ElevatorController {
  #tick = 0;
  constructor(n, dispatcher) { this.cars = Array.from({ length: n }, (_, i) => new Elevator(i + 1)); this.dispatcher = dispatcher; }
  #log(msg) { console.log(`t=${String(this.#tick).padStart(2)} ${msg}`); }
  hallCall(floor, d) { const car = this.dispatcher.choose(this.cars, floor, d); car.addStop(floor); this.#log(`hall call ${floor}${d} -> car ${car.id}`); }
  carCall(carId, floor) { this.cars[carId - 1].addStop(floor); this.#log(`inside car ${carId}: floor ${floor}`); }
  step() { this.#tick++; for (const c of this.cars) { const ev = c.step(); if (ev) this.#log(ev); } }
  display() { return this.cars.map((c) => `[car ${c.id}: ${c.floor}${c.dir}${c.doorsOpen ? " doors" : ""}]`).join(" "); }
}

const ctl = new ElevatorController(2, lowestCost);
ctl.hallCall(5, Dir.UP);
ctl.hallCall(2, Dir.UP);
for (let i = 0; i < 3; i++) ctl.step();
ctl.carCall(2, 9);
for (let i = 0; i < 4; i++) ctl.step();
ctl.carCall(1, 8);
ctl.hallCall(3, Dir.DOWN);
for (let i = 0; i < 14; i++) ctl.step();
console.log(ctl.display());
```
:::

Read the trace: the first call goes to car 1, and the second (floor 2) goes to **car 2**, because car 1 is already committed upward with a queued stop, which raises its cost. The downward call from floor 3, arriving while both cars head up, goes to whichever car finishes its sweep with the lower estimated cost.

## Design discussion

- **Separation of concerns**: `Elevator` knows how to move and order its own stops (state + LOOK); the **controller** only routes calls; the **dispatch strategy** encapsulates the policy (Strategy pattern, Open/Closed).
- **Hall call direction matters**: a car going down past floor 7 shouldn't pick up someone who pressed ▲ there (they'd ride in the wrong direction). A complete version keeps separate up/down hall-call sets per car and only stops for matching directions.
- **Re-assignment**: estimates go stale (a car gets many car calls after being assigned). Real controllers periodically re-evaluate unserved hall calls.
- **Concurrency**: in a real system, buttons, sensors and motors work asynchronously. The controller processes events from a **queue** on one thread (an event loop), which removes most locking; per-car controllers run independently, and the **Mediator** pattern describes the controller's role between buttons and cars.
- **State pattern**: the car's modes (idle, moving, doors open, **maintenance**, **fire service**) map naturally to state classes when their behaviours grow.

| Extension | Where it goes |
|---|---|
| Up-peak (morning) / down-peak (evening) modes | new `DispatchStrategy`; idle cars park at the lobby |
| Zoning / express elevators | strategy filters eligible cars by floor range |
| Weight limit / full car | the car skips hall calls when load ≥ capacity |
| VIP / emergency / maintenance | additional car states; controller excludes cars from dispatch |
| Destination dispatch (choose the floor in the lobby) | hall calls carry the destination, so dispatch can group passengers by destination |
| Displays and logging | observers on car state changes |

```quiz
? Why do elevators use LOOK/SCAN instead of always serving the nearest pending floor?
+ Nearest-first can starve far floors when nearby requests keep arriving; LOOK serves every stop within one sweep per direction
- LOOK uses less electricity
- Nearest-first is impossible to implement
> Sweeping in one direction until no stops remain ahead bounds every passenger's wait.

? A car is moving down at floor 9 with a stop at 2. A hall call ▲ arrives from floor 6. Why is this car's cost high?
+ It must finish going down to 2 before it can come back up to 6 for an upward trip
- Floor 6 is above 2
- Cars can never stop at floor 6
> Picking up an upward passenger while going down would carry them the wrong way, so the car must complete its sweep first.

? Which pattern makes "switch to zoning during office hours" a configuration change rather than a rewrite?
+ Strategy (the dispatch algorithm behind an interface)
- Singleton
- Prototype
> The controller delegates car selection to a swappable strategy.
```

:::keypoints
- Distinguish **hall calls** (floor + direction, assigned by the controller) from **car calls** (destination, owned by one car).
- Each car is a **state machine** running **LOOK**: continue while stops lie ahead, reverse when only stops behind remain, idle when none. It's starvation-free.
- A **dispatch strategy** assigns hall calls by estimated cost (direction-aware, load-penalised); swap strategies for zoning, peaks, destination dispatch.
- Real controllers are event-driven (a queue), re-evaluate stale assignments, and add states for maintenance and emergencies.
:::
