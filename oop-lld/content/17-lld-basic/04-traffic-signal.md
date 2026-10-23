---
title: Design a Traffic Signal Controller
level: easy
time: 40
summary: A four-way intersection controlled by timed phases, modelled with a phase state machine, an injectable clock for deterministic simulation, safety rules (never two conflicting greens), emergency override and pedestrian requests.
---

:::problem Design a Traffic Signal Controller {level=easy tags="state machine,timing,simulation,safety"}
Design the software for a four-way intersection (North, East, South, West). Signals cycle through green, yellow and red with configurable durations. Conflicting directions must **never** be green at the same time. Support an emergency vehicle override that gives its direction green.

:::hint Hint
Think in **phases**, not in individual lights: a phase says which roads are green together (North and South; then East and West). The controller advances the phase when time runs out. Safety follows from the phase table, because it simply never lists conflicting directions together.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Directions? | N, E, S, W. N/S pair together, E/W pair together |
| Light colours? | Green, Yellow, Red |
| Cycle? | NS green → NS yellow → (all red) → EW green → EW yellow → (all red) → repeat |
| Durations? | configurable per colour |
| Safety? | NS and EW are never both non-red |
| Emergency? | on request, finish the current yellow safely, then give the emergency direction pair green until cleared |
| Time? | a simulated clock (`tick`), so the demo is deterministic |

## Step 2: entities

- **Direction** (enum) and **Colour** (enum).
- **Phase**: which direction pair is active and which colour it shows: `NS_GREEN, NS_YELLOW, ALL_RED_1, EW_GREEN, EW_YELLOW, ALL_RED_2`.
- **PhaseTimings**: duration of each phase (configuration, a plain struct).
- **Signal**: one per direction, shows a colour (a passive display; **Observer** target).
- **Controller**: knows the current phase, time left, advances on `tick()`, handles `requestEmergency()`.

```viz algo=state title="Intersection phases"
state NSG "NS green" [initial] @0,0
state NSY "NS yellow" @1,0
state AR1 "All red" @2,0
state EWG "EW green" @2,1
state EWY "EW yellow" @1,1
state AR2 "All red " @0,1
NSG -> NSY : timer
NSY -> AR1 : timer
AR1 -> EWG : timer
EWG -> EWY : timer
EWY -> AR2 : timer
AR2 -> NSG : timer
play: timer, timer, timer, timer, timer, timer
```

## Step 3: design decisions

- **Phase table drives everything**: `phaseColours(phase)` returns the colour for each of N, E, S, W. Because conflicting greens do not appear in any row, **the table is the safety proof**. A unit test can assert it for every phase.
- **The all-red gap** gives clearing time between the two axes.
- **Clock injection**: the controller takes `tick(seconds)`; no real sleeping. Real hardware would call `tick(1)` from a timer.
- **Emergency override**: set a pending request. At the next safe boundary (after yellow, during all-red) jump to the requested axis green. Never switch green to green directly.
- **Observer** (here a simple callback): signals/displays/loggers get `onChange` events.

## Step 4: the code

```cpp run title="Traffic signal controller: complete"
#include <array>
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

enum class Direction { N = 0, E = 1, S = 2, W = 3 };
enum class Colour { Red, Yellow, Green };
enum class Phase { NS_Green, NS_Yellow, AllRed1, EW_Green, EW_Yellow, AllRed2 };

const char* name(Phase p) {
    switch (p) {
        case Phase::NS_Green: return "NS_Green";   case Phase::NS_Yellow: return "NS_Yellow";
        case Phase::AllRed1: return "AllRed(1)";   case Phase::EW_Green: return "EW_Green";
        case Phase::EW_Yellow: return "EW_Yellow"; case Phase::AllRed2: return "AllRed(2)";
    }
    return "?";
}
char letter(Colour c) { return c == Colour::Red ? 'R' : c == Colour::Yellow ? 'Y' : 'G'; }

struct Timings { int green = 4, yellow = 2, allRed = 1; };       // seconds (small numbers keep the demo short)

// The phase table: THE place where safety is decided.
array<Colour, 4> coloursFor(Phase p) {
    using C = Colour;
    switch (p) {
        case Phase::NS_Green:  return {C::Green, C::Red, C::Green, C::Red};     // N E S W
        case Phase::NS_Yellow: return {C::Yellow, C::Red, C::Yellow, C::Red};
        case Phase::EW_Green:  return {C::Red, C::Green, C::Red, C::Green};
        case Phase::EW_Yellow: return {C::Red, C::Yellow, C::Red, C::Yellow};
        default:               return {C::Red, C::Red, C::Red, C::Red};         // all red
    }
}

// Safety check used by tests: no two conflicting directions are non-red together
bool isSafe(const array<Colour, 4>& c) {
    bool ns = c[0] != Colour::Red || c[2] != Colour::Red;
    bool ew = c[1] != Colour::Red || c[3] != Colour::Red;
    return !(ns && ew);
}

class Controller {
    Timings t_;
    Phase phase_ = Phase::NS_Green;
    int left_;
    long now_ = 0;
    int emergencyAxis_ = -1;                               // -1 none, 0 = NS, 1 = EW
    vector<function<void(long, Phase, const array<Colour, 4>&)>> listeners_;

    int durationOf(Phase p) const {
        switch (p) { case Phase::NS_Green: case Phase::EW_Green: return t_.green;
                     case Phase::NS_Yellow: case Phase::EW_Yellow: return t_.yellow;
                     default: return t_.allRed; }
    }
    Phase next(Phase p) const {
        if (p == Phase::AllRed1 || p == Phase::AllRed2) {
            if (emergencyAxis_ == 0) return Phase::NS_Green;               // emergency: choose the axis, only from an all-red gap
            if (emergencyAxis_ == 1) return Phase::EW_Green;
        }
        switch (p) {
            case Phase::NS_Green: return Phase::NS_Yellow;
            case Phase::NS_Yellow: return Phase::AllRed1;
            case Phase::AllRed1: return Phase::EW_Green;
            case Phase::EW_Green: return Phase::EW_Yellow;
            case Phase::EW_Yellow: return Phase::AllRed2;
            default: return Phase::NS_Green;
        }
    }
    void enter(Phase p) {
        phase_ = p; left_ = durationOf(p);
        if ((p == Phase::NS_Green && emergencyAxis_ == 0) || (p == Phase::EW_Green && emergencyAxis_ == 1)) left_ = t_.green * 2;   // hold longer for the emergency
        if ((p == Phase::NS_Green && emergencyAxis_ == 0) || (p == Phase::EW_Green && emergencyAxis_ == 1)) emergencyAxis_ = -1;     // served
        auto c = coloursFor(p);
        for (auto& l : listeners_) l(now_, p, c);
    }
public:
    explicit Controller(Timings t) : t_(t), left_(t.green) {}
    void onChange(function<void(long, Phase, const array<Colour, 4>&)> f) { listeners_.push_back(move(f)); }
    void start() { enter(Phase::NS_Green); }
    void requestEmergency(Direction d) {
        emergencyAxis_ = (d == Direction::N || d == Direction::S) ? 0 : 1;
        cout << "  t=" << now_ << "s  EMERGENCY requested from " << (emergencyAxis_ == 0 ? "NS" : "EW") << "\n";
    }
    void tick() {                                          // one simulated second
        ++now_;
        if (--left_ > 0) return;
        enter(next(phase_));
    }
    long now() const { return now_; }
};

int main() {
    Controller c(Timings{4, 2, 1});
    bool alwaysSafe = true;
    c.onChange([&](long t, Phase p, const array<Colour, 4>& col) {
        cout << "  t=" << t << "s  " << name(p) << "   N:" << letter(col[0]) << " E:" << letter(col[1]) << " S:" << letter(col[2]) << " W:" << letter(col[3]) << "\n";
        alwaysSafe = alwaysSafe && isSafe(col);
    });
    c.start();
    for (int i = 0; i < 16; ++i) {
        if (c.now() == 13) c.requestEmergency(Direction::N);     // an ambulance arrives from the north while EW is cycling
        c.tick();
    }
    cout << (alwaysSafe ? "PASS" : "FAIL") << ": conflicting directions were never non-red together\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Emergency during green of the *other* axis | wait for yellow and all-red (no instant switch) then give the emergency axis green |
| Emergency from the axis already green | extend the green (extension idea) |
| Two emergencies | queue them; serve in order |
| Controller reset after a power loss | start in **all-red flash** (safe state) then `start()` |
| Sensor-driven timing | replace `Timings` by a `TimingPolicy` (Strategy) that reads queue lengths |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Pedestrian crossing button" | extra phases with `WALK`; a request flag like the emergency one, served at the next all-red |
| "Left-turn arrows, more roads" | a richer phase table: each row lists all compatible movements; a unit test checks compatibility pairs |
| "Coordinate a whole street of intersections" | `Corridor` coordinator with offsets (green wave); each controller unchanged |
| "Adaptive timings" | Strategy for durations (fixed, time-of-day, sensor) |
| "Monitoring/logging" | listeners already exist: add a `Logger` and a `FaultDetector` |
| "Hardware failure" | a watchdog: if no tick arrives, switch to flashing red |

```quiz
? Where does the design guarantee that conflicting greens never occur?
- In a unit test only
+ In the phase table: no row has conflicting directions non-red together
- In the clock
> If the table is correct, every state the machine can reach is safe.
? Why use an all-red phase between axes?
- To save power
+ To give vehicles time to clear the intersection before the other axis starts
- Because C++ requires it
> A safety gap between conflicting movements.
```

:::keypoints
- Model phases (compatible movements together), not individual lights. The phase table encodes safety.
- Inject time (`tick`) for deterministic simulation; use callbacks (Observer) for displays and logs.
- Emergency override switches only through a safe boundary; the design extends via TimingPolicy and extra phases.
:::
