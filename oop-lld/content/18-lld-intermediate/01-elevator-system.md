---
title: Design an Elevator System
level: intermediate
time: 60
summary: Several elevators serving hall calls and cabin requests, an elevator state machine, a SCAN scheduling strategy inside each car, a dispatcher strategy that assigns calls to cars, a tick-based simulation and the safety and concurrency considerations.
---

:::problem Design an Elevator System {level=medium tags="State,Strategy,scheduling,simulation,classic"}
Design the control software for a building with several elevators and many floors. People press up/down buttons in the hall and floor buttons inside the cabin. The system decides which elevator serves which call, and each elevator decides in which order to visit its floors. Keep it extensible: new scheduling algorithms, express elevators, maintenance mode.

:::hint Hint
Two separate decisions: **which elevator** takes a hall call (dispatcher strategy) and **in what order** one elevator visits its stops (scheduling strategy such as SCAN: keep going in the current direction while there are stops ahead). Each elevator is a small state machine driven by a clock tick.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Size? | 3 elevators, floors 0 to 9 (configurable) |
| Requests? | **hall call** (floor, direction UP/DOWN) and **cabin request** (destination floor) |
| Movement? | one floor per tick; doors open for 1 tick at a stop |
| Scheduling inside a car? | SCAN: continue in the current direction serving stops, reverse when none ahead |
| Dispatch? | assign a hall call to the elevator with the lowest "cost" (nearest, preferring one already heading that way) |
| Capacity/weight? | out of scope (mention), maintenance state included |
| Time? | a discrete `tick()` so the simulation is deterministic |
| Safety? | doors never open while moving; an out-of-service car receives no calls |

## Step 2: elevator states

```viz algo=state title="One elevator"
state Idle "Idle" [initial] @0,1
state MovingUp "Moving up" @1,0
state MovingDown "Moving down" @1,2
state DoorsOpen "Doors open" @2,1
Idle -> MovingUp : stop above
Idle -> MovingDown : stop below
MovingUp -> DoorsOpen : arrive at a stop
MovingDown -> DoorsOpen : arrive at a stop
DoorsOpen -> MovingUp : more stops above
DoorsOpen -> MovingDown : more stops below
DoorsOpen -> Idle : no stops left
play: stop above, arrive at a stop, no stops left
```

## Step 3: entities

```viz algo=uml title="Elevator system"
class ElevatorController
  - elevators: Elevator[]
  - dispatcher: DispatchStrategy
  + hallCall(floor: int, dir: Direction): void
  + tick(): void
class Elevator
  - id: int
  - floor: int
  - state: State
  - upStops: set<int>
  - downStops: set<int>
  + addStop(floor: int): void
  + step(): void
  + cost(floor: int, dir: Direction): int
interface DispatchStrategy
  + choose(cars: Elevator[], floor: int, dir: Direction): Elevator
class NearestCarDispatch
class CabinPanel
  + press(car: Elevator, floor: int): void
ElevatorController *-- Elevator
ElevatorController --> DispatchStrategy
NearestCarDispatch ..|> DispatchStrategy
CabinPanel ..> Elevator
```

## Step 4: design decisions

- **Two-level scheduling**: the controller picks the car (`DispatchStrategy`), the car orders its own stops (SCAN). Each can be swapped independently.
- **Stops are two sorted sets** (`upStops`, `downStops`), so "next stop in the current direction" is a log-time lookup and duplicates collapse.
- **Cost function** for dispatch: distance to the call, minus a bonus when the car is already moving toward it in the same direction, large penalty if the call is behind it, infinity if out of service.
- **Tick-driven**: `controller.tick()` calls `elevator.step()` on each car. Real hardware would call this from a timer. No sleeping in the logic.
- **State enum** with a `step()` switch is enough for four states; State classes are warranted if behaviours grow (fire mode, VIP mode).
- **Concurrency**: button presses arrive on other threads; a mutex in the controller protects stops and the tick (or an input queue drained at each tick, which is simpler and deterministic).

## Step 5: the code

```cpp run title="Three elevators, SCAN, nearest-car dispatch"
#include <climits>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <set>
#include <string>
#include <vector>
using namespace std;

enum class Direction { Up, Down, None };
enum class State { Idle, MovingUp, MovingDown, DoorsOpen };
const char* name(State s) { static const char* n[] = {"idle", "moving up", "moving down", "doors open"}; return n[static_cast<int>(s)]; }

class Elevator {
    int id_, floor_ = 0;
    State state_ = State::Idle;
    Direction heading_ = Direction::None;                   // the direction we are committed to
    set<int> up_, down_;                                    // pending stops (SCAN keeps them sorted)
    bool inService_ = true;
    int doorTicks_ = 0;

    bool hasStopsAbove() const { return (!up_.empty() && *up_.rbegin() > floor_) || (!down_.empty() && *down_.rbegin() > floor_); }
    bool hasStopsBelow() const { return (!up_.empty() && *up_.begin() < floor_) || (!down_.empty() && *down_.begin() < floor_); }
    bool stopHere() const { return up_.count(floor_) || down_.count(floor_); }
public:
    explicit Elevator(int id) : id_(id) {}
    int id() const { return id_; }
    int floor() const { return floor_; }
    State state() const { return state_; }
    void setInService(bool b) { inService_ = b; }
    bool inService() const { return inService_; }
    bool idle() const { return state_ == State::Idle && up_.empty() && down_.empty(); }

    void addStop(int f, Direction wanted) {
        if (f == floor_ && state_ == State::Idle) { state_ = State::DoorsOpen; doorTicks_ = 1; return; }      // already here
        (wanted == Direction::Down || (wanted == Direction::None && f < floor_) ? down_ : up_).insert(f);
    }

    // lower is better; used by the dispatcher
    int cost(int floor, Direction dir) const {
        if (!inService_) return INT_MAX;
        int distance = abs(floor - floor_);
        if (idle()) return distance;
        bool towards = (heading_ == Direction::Up && floor >= floor_ && dir != Direction::Down) || (heading_ == Direction::Down && floor <= floor_ && dir != Direction::Up);
        return towards ? distance : distance + 20;          // a car heading the other way will take much longer
    }

    void step() {
        switch (state_) {
            case State::DoorsOpen:
                if (--doorTicks_ > 0) return;
                decideNext();                                // doors close, choose where to go
                break;
            case State::Idle:
                decideNext();
                break;
            case State::MovingUp:
            case State::MovingDown:
                floor_ += (state_ == State::MovingUp) ? 1 : -1;
                if (stopHere()) { up_.erase(floor_); down_.erase(floor_); state_ = State::DoorsOpen; doorTicks_ = 1; }
                break;
        }
    }
private:
    void decideNext() {
        if (heading_ == Direction::Up && hasStopsAbove()) state_ = State::MovingUp;           // SCAN: keep going while there is work ahead
        else if (heading_ == Direction::Down && hasStopsBelow()) state_ = State::MovingDown;
        else if (hasStopsAbove()) { heading_ = Direction::Up; state_ = State::MovingUp; }       // reverse or start
        else if (hasStopsBelow()) { heading_ = Direction::Down; state_ = State::MovingDown; }
        else { heading_ = Direction::None; state_ = State::Idle; }
    }
};

struct DispatchStrategy { virtual ~DispatchStrategy() = default; virtual Elevator* choose(vector<unique_ptr<Elevator>>& cars, int floor, Direction dir) = 0; };
struct NearestCarDispatch : DispatchStrategy {
    Elevator* choose(vector<unique_ptr<Elevator>>& cars, int floor, Direction dir) override {
        Elevator* best = nullptr; int bestCost = INT_MAX;
        for (auto& c : cars) { int k = c->cost(floor, dir); if (k < bestCost) { bestCost = k; best = c.get(); } }
        return best;
    }
};

class ElevatorController {
    vector<unique_ptr<Elevator>> cars_;
    unique_ptr<DispatchStrategy> dispatcher_;
    int topFloor_;
    long time_ = 0;
public:
    ElevatorController(int cars, int topFloor, unique_ptr<DispatchStrategy> d) : dispatcher_(move(d)), topFloor_(topFloor) { for (int i = 0; i < cars; ++i) cars_.push_back(make_unique<Elevator>(i + 1)); }
    Elevator& car(int id) { return *cars_.at(id - 1); }

    void hallCall(int floor, Direction dir) {
        if (floor < 0 || floor > topFloor_) { cout << "  ignored call from invalid floor " << floor << "\n"; return; }
        Elevator* e = dispatcher_->choose(cars_, floor, dir);
        if (!e) { cout << "  no elevator in service\n"; return; }
        cout << "  t=" << time_ << " hall call at floor " << floor << (dir == Direction::Up ? " UP" : " DOWN") << " -> elevator " << e->id() << "\n";
        e->addStop(floor, dir);
    }
    void pressInside(int carId, int floor) {
        if (floor < 0 || floor > topFloor_) return;
        cout << "  t=" << time_ << " passenger in elevator " << carId << " presses " << floor << "\n";
        car(carId).addStop(floor, Direction::None);
    }
    void tick() {
        ++time_;
        for (auto& c : cars_) {
            State before = c->state(); int fb = c->floor();
            c->step();
            if (c->state() == State::DoorsOpen && before != State::DoorsOpen) cout << "  t=" << time_ << " elevator " << c->id() << " opens doors at floor " << c->floor() << "\n";
            (void)fb;
        }
    }
    bool allIdle() const { for (auto& c : cars_) if (!c->idle()) return false; return true; }
    string snapshot() const { string s; for (auto& c : cars_) s += " E" + to_string(c->id()) + "@" + to_string(c->floor()) + "(" + name(c->state()) + ")"; return s; }
    long time() const { return time_; }
};

int main() {
    ElevatorController ctl(3, 9, make_unique<NearestCarDispatch>());
    cout << "initial:" << ctl.snapshot() << "\n";
    ctl.hallCall(5, Direction::Down);                         // someone on floor 5 wants to go down
    ctl.hallCall(2, Direction::Up);
    for (int i = 0; i < 6; ++i) ctl.tick();
    ctl.pressInside(1, 0);                                    // the passenger picked up at 5 wants floor 0
    ctl.hallCall(8, Direction::Down);                         // another call while cars are busy
    for (int i = 0; i < 14; ++i) ctl.tick();
    cout << "after 20 ticks:" << ctl.snapshot() << "\n";

    cout << "maintenance: elevator 2 goes out of service, calls avoid it\n";
    ctl.car(2).setInService(false);
    ctl.hallCall(3, Direction::Up);
}
```

## Edge cases

| Case | Handling |
|---|---|
| Call on the floor where a car is idle | doors open immediately |
| Two calls for the same floor | stops are sets: duplicates collapse |
| All elevators out of service | `choose` returns null and the controller reports it |
| Car full | `cost` returns a large value when the load is above the limit (extension) |
| Invalid floor | rejected at the boundary |
| Direction change with stops in both directions | SCAN finishes the current direction first, then reverses |
| Starvation | SCAN serves every pending stop within one sweep; add an age bonus for fairness if needed |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Smarter dispatch (minimise total wait)" | a different `DispatchStrategy` (zoning, destination dispatch, simulated annealing) |
| "Express elevator that skips floors" | an `AccessPolicy` per car; `addStop` rejects unreachable floors; `cost` honours it |
| "Fire mode / VIP mode" | State classes: `FireState` ignores calls and returns to the lobby |
| "Capacity and weight sensors" | `Elevator` exposes `load`; `cost` and `addStop` consult it |
| "Display panels and sounds" | Observer: cars publish `Arrived`, `DoorsOpened` events |
| "Real-time threads" | a mutex-protected request queue drained at each tick keeps the simulation deterministic |
| "Digital twin/analytics" | log every event and replay it |

```quiz
? Why separate dispatching from in-car scheduling?
- To use more classes
+ They are independent decisions: which car takes the call, and in which order a car visits its stops; each can change alone
- Because C++ has two kinds of strategy
> Strategy per decision keeps both replaceable.
? Why store stops in sorted sets?
- To make printing easy
+ SCAN needs the nearest stop in the current direction, and duplicates collapse automatically
- Because floors are strings
> Ordered sets give logarithmic nearest-stop lookups.
```

:::keypoints
- Controller (dispatch strategy) + Elevator (state machine, SCAN over two sorted stop sets) + a tick-driven simulation.
- A cost function decides the car; out-of-service cars cost infinity.
- Extensions are new strategies, new states and events; threads feed a queue drained per tick.
:::
