---
title: Design a Traffic Signal Controller
level: easy
time: 40
summary: A four-way road junction with timed lights. Learn to think in phases instead of single lights, how a table can prove the design is safe, how to control time in a simulation, and how to handle an emergency vehicle.
---

:::problem Design a Traffic Signal Controller {level=easy tags="state machine,timing,simulation,safety"}
Design the software for a four-way junction (North, East, South, West). The lights go through green, yellow and red, with times that can be set. Directions that cross each other must **never** be green at the same time. Support an emergency vehicle: its direction should get green.

:::hint Hint
Think in **phases**, not in single lights. A phase says which roads are green together (for example North and South, then East and West). When time runs out, the controller moves to the next phase. Safety comes from the phase table, because it never lists crossing directions together.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Directions? | N, E, S, W. North and South go together. East and West go together |
| Colours? | Green, Yellow, Red |
| The cycle? | NS green, NS yellow, (all red), EW green, EW yellow, (all red), and repeat |
| Times? | can be set for each colour |
| Safety? | NS and EW are never both non-red |
| Emergency? | when asked, finish the current yellow safely, then give the emergency direction green until it is cleared |
| Time? | a simulated clock (`tick`), so the demo gives the same result every time |

## Step 2: Find the classes

- **Direction** (enum) and **Colour** (enum).
- **Phase**: which pair of directions is active and which colour it shows: `NS_GREEN, NS_YELLOW, ALL_RED_1, EW_GREEN, EW_YELLOW, ALL_RED_2`.
- **PhaseTimings**: how long each phase lasts (settings, a plain struct).
- **Signal**: one for each direction. It only shows a colour (a good target for Observer).
- **Controller**: knows the current phase and the time left. It moves on with `tick()` and handles `requestEmergency()`.

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

## Step 3: Design decisions

- **The phase table drives everything.** `phaseColours(phase)` gives the colour of N, E, S and W. No row of the table has crossing directions both green, so **the table itself proves the design is safe**. A unit test can check this for every phase.
- **The all-red gap** gives vehicles time to clear the junction between the two directions.
- **Time is passed in.** The controller uses `tick(seconds)` and never really sleeps. Real hardware would call `tick(1)` from a timer.
- **Emergency override.** We note the request. At the next safe point (after yellow, during all-red) we jump to the green of the requested direction. We never go from one green straight to another.
- **Observer** (here a simple callback): displays and loggers hear about each change.

## Step 4: The code

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

| Case | How to handle |
|---|---|
| Emergency while the **other** direction is green | wait for yellow and all-red (no instant switch), then give green to the emergency direction |
| Emergency from the direction that is already green | make the green longer (an extension) |
| Two emergencies | put them in a line and serve them in order |
| Power cut and restart | start in **flashing red** (a safe state), then `start()` |
| Sensors decide the timing | replace `Timings` with a `TimingPolicy` (Strategy) that reads the queue lengths |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "A button for people crossing" | extra phases with `WALK`. A request flag like the emergency one, served at the next all-red |
| "Turn arrows, more roads" | a bigger phase table. Each row lists all movements that can go together. A unit test checks the pairs |
| "Coordinate a whole street" | a `Corridor` coordinator with offsets (a green wave). Each controller stays the same |
| "Timing that adapts" | Strategy for the times (fixed, time of day, sensors) |
| "Monitoring and logs" | listeners already exist. Add a `Logger` and a `FaultDetector` |
| "Hardware failure" | a watchdog: if no tick arrives, switch to flashing red |

## Short answer to say in an interview

:::interview How does your design make sure two crossing directions are never green together?
"I model phases, not single lights. Each phase lists the colour of every direction, and the table never has crossing directions green at the same time. Every state the controller can reach comes from this table, so it is safe by design, and I can unit test the table. There is also an all-red gap between the phases. An emergency request waits for a safe point before switching."
:::

```quiz
? Where does the design make sure crossing greens never happen?
- Only in a unit test
+ In the phase table. No row has crossing directions non-red together
- In the clock
> If the table is right, every reachable state is safe.
? Why add an all-red phase between the two directions?
- To save power
+ To give vehicles time to clear the junction before the other direction starts
- Because C++ requires it
> It is a safety gap between crossing movements.
```

:::keypoints
- Model phases (movements that go together), not single lights. The phase table holds the safety rule.
- Pass time in (`tick`) for a predictable simulation. Use callbacks (Observer) for displays and logs.
- An emergency request switches only at a safe point. Extend with a TimingPolicy and extra phases.
:::
