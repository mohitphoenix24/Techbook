---
title: Design an Elevator System
level: intermediate
time: 60
summary: Several lifts serving calls from the hall and buttons inside. Learn the lift state machine, the SCAN way of visiting floors, a dispatcher that picks which lift answers a call, and a simulation that moves one step at a time.
---

:::problem Design an Elevator System {level=medium tags="State,Strategy,scheduling,simulation,classic"}
Design the control software for a building with several lifts (elevators) and many floors. People press up and down buttons in the hall, and floor buttons inside the lift. The system decides which lift answers which call, and each lift decides the order in which it visits its floors. Keep it easy to extend: new scheduling methods, express lifts, maintenance mode.

:::hint Hint
There are two separate decisions: **which lift** takes a hall call (a dispatcher strategy), and **in what order** one lift visits its stops (a scheduling strategy like SCAN: keep going in the same direction while there are stops ahead). Each lift is a small state machine that moves on a clock tick.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Size? | 3 lifts, floors 0 to 9 (can be changed) |
| Requests? | a **hall call** (floor and direction UP or DOWN) and a **cabin request** (the destination floor) |
| Movement? | one floor per tick. Doors stay open for 1 tick at a stop |
| Order inside one lift? | SCAN: keep going in the current direction serving stops, and reverse when there are none ahead |
| Which lift answers a call? | the one with the lowest "cost" (nearest, and better if already heading that way) |
| Weight limit? | not needed (we mention it). A maintenance state is included |
| Time? | a step-by-step `tick()`, so the simulation gives the same result every time |
| Safety? | doors never open while moving. A lift that is out of service gets no calls |

## Step 2: The states of one lift

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **Two levels of decisions.** The controller picks the lift (`DispatchStrategy`). The lift orders its own stops (SCAN). Each can be changed on its own.
- **Stops are kept in two sorted sets** (`upStops`, `downStops`). So "the next stop in my direction" is a fast lookup, and repeated stops become one.
- **A cost for dispatch:** the distance to the call, minus a bonus if the lift is already moving toward it in the same direction, a big penalty if the call is behind it, and infinity if the lift is out of service.
- **Driven by ticks.** `controller.tick()` calls `elevator.step()` on every lift. Real hardware would call this from a timer. The logic never sleeps.
- **State enum** with a `step()` switch is enough for four states. Use State classes if behaviour grows (fire mode, VIP mode).
- **Threads:** button presses come from other threads. A mutex in the controller protects the stops and the tick. A simpler way is a queue of inputs that is emptied at each tick, which also keeps the simulation predictable.

## Step 5: The code

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

| Case | What happens |
|---|---|
| A call on the floor where a lift is idle | doors open at once |
| Two calls for the same floor | stops are sets, so they become one |
| All lifts out of service | `choose` returns null and the controller reports it |
| The lift is full | `cost` returns a very big number when the load is over the limit (extension) |
| A floor that does not exist | refused at the entrance |
| Stops in both directions | SCAN finishes the current direction first, then reverses |
| A call that waits too long | SCAN serves every waiting stop in one sweep. Add an age bonus for fairness if needed |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Smarter dispatch (less waiting time)" | a different `DispatchStrategy` (zones, destination dispatch) |
| "An express lift that skips floors" | an `AccessPolicy` for each lift. `addStop` refuses floors it cannot reach. `cost` follows it |
| "Fire mode or VIP mode" | State classes. `FireState` ignores calls and returns to the lobby |
| "Weight sensors" | `Elevator` shows its `load`. `cost` and `addStop` check it |
| "Display panels and sounds" | Observer: lifts announce `Arrived` and `DoorsOpened` |
| "Real threads" | a queue of requests protected by a mutex, emptied at each tick, keeps it predictable |
| "Analytics" | log every event and replay it |

## Short answer to say in an interview

:::interview How does your elevator design decide which lift to send?
"There are two separate decisions. A dispatch strategy in the controller chooses the lift for a hall call using a cost: distance, a bonus if the lift is already going that way, and infinity if it is out of service. Then each lift orders its own stops with SCAN: keep going in one direction, serving stops, and reverse when none are ahead. Each lift is a small state machine driven by ticks. I can swap either strategy without touching the other."
:::

```quiz
? Why separate dispatching from the order inside one lift?
- To use more classes
+ They are two independent decisions (which lift, and which order), and each can change alone
- C++ has two kinds of strategy
> A strategy for each decision keeps both replaceable.
? Why keep stops in sorted sets?
- To make printing easy
+ SCAN needs the nearest stop in the current direction, and repeated stops become one
- Floors are strings
> Ordered sets give fast nearest-stop lookups.
```

:::keypoints
- Controller (dispatch strategy), Elevator (state machine, SCAN over two sorted stop sets), and a simulation driven by ticks.
- A cost decides the lift. A lift that is out of service costs infinity.
- Extensions are new strategies, new states and events. Threads feed a queue that is emptied each tick.
:::
