---
title: Template Method
level: intermediate
time: 30
summary: Fixing the skeleton of an algorithm in a base class and letting subclasses fill in steps: abstract steps and optional hooks, the Hollywood principle, a data-processing pipeline and a game turn, NVI in C++, and Template Method versus Strategy.
---

:::def Template Method
Define the **skeleton of an algorithm** in an operation, deferring some steps to subclasses. Template Method lets subclasses **redefine certain steps** without changing the algorithm's structure.
:::

:::analogy Think of it like this
A recipe template for "make a hot drink": boil water, **brew** it, pour into a cup, **add extras**. The steps and their order are fixed. For tea, *brew* means steep a tea bag; for coffee, filter the grounds. The outline is common; only specific steps differ.
:::

## The idea

The base class has a **non-virtual** method (the *template method*) that calls a sequence of steps. Some steps are **abstract** (subclasses must provide them), some have **default** implementations, and some are optional empty **hooks**.

```viz algo=uml title="Template Method"
abstract class DataMiner
  + mine(path: string): void
  # openFile(path: string): void
  # extractData(): string
  # parseData(raw: string): string
  # analyse(data: string): void
  # report(): void
  # onDone(): void
class CsvMiner
class JsonMiner
CsvMiner --|> DataMiner
JsonMiner --|> DataMiner
```

```cpp run title="A data-processing pipeline with a fixed outline"
#include <iostream>
#include <string>
using namespace std;

class DataMiner {
public:
    virtual ~DataMiner() = default;
    void mine(const string& path) {                        // THE TEMPLATE METHOD: non-virtual, fixes the order
        openFile(path);
        string raw = extractData();
        string data = parseData(raw);
        analyse(data);
        report();
        onDone();                                          // a hook
    }
protected:
    virtual void openFile(const string& p) { cout << "  opening " << p << "\n"; }     // default step
    virtual string extractData() = 0;                      // abstract steps: subclasses MUST implement
    virtual string parseData(const string& raw) = 0;
    virtual void analyse(const string& data) { cout << "  analysing: " << data << "\n"; }
    virtual void report() { cout << "  report ready\n"; }
    virtual void onDone() {}                               // hook: empty by default
};

class CsvMiner : public DataMiner {
protected:
    string extractData() override { return "a,b,c"; }
    string parseData(const string& raw) override { return "csv fields [" + raw + "]"; }
};
class JsonMiner : public DataMiner {
protected:
    void openFile(const string& p) override { cout << "  opening JSON " << p << " (and checking the schema)\n"; }
    string extractData() override { return "{\"x\":1}"; }
    string parseData(const string& raw) override { return "json object " + raw; }
    void onDone() override { cout << "  JSON cache cleared\n"; }
};

int main() {
    cout << "CSV:\n";  CsvMiner().mine("data.csv");
    cout << "JSON:\n"; JsonMiner().mine("data.json");
}
```

The **order** `open → extract → parse → analyse → report → done` is fixed in one place. Subclasses cannot reorder or skip steps (the template method is not virtual). Duplicate logic is gone from the subclasses.

## The Hollywood Principle

"Don't call us, we'll call you." In normal code, your subclass calls library helpers. In Template Method, the **base class calls the subclass**. The framework controls the flow, and you plug in details. This inversion of control is the heart of frameworks: unit-test runners (`setUp`, `test`, `tearDown`), servlet lifecycles, game loops (`update`, `draw`).

## A game turn

```cpp run title="A board-game turn: the base fixes the rhythm"
#include <iostream>
#include <string>
using namespace std;

class Game {
public:
    virtual ~Game() = default;
    void playTurn(const string& player) {                  // template method
        cout << "-- " << player << "'s turn --\n";
        startTurn(player);
        if (canAct(player)) {
            act(player);
            if (isWon(player)) { cout << "  " << player << " wins!\n"; return; }
        } else {
            cout << "  " << player << " is skipped\n";
        }
        endTurn(player);
    }
protected:
    virtual void startTurn(const string&) {}
    virtual bool canAct(const string&) { return true; }
    virtual void act(const string& p) = 0;                 // the heart of each game
    virtual bool isWon(const string& p) = 0;
    virtual void endTurn(const string&) { cout << "  turn over\n"; }
};

class DiceRace : public Game {
    int position_ = 0; int rolls_[3] = {4, 3, 5}; int next_ = 0;
protected:
    void startTurn(const string& p) override { cout << "  " << p << " is at " << position_ << "\n"; }
    void act(const string& p) override { int r = rolls_[next_++ % 3]; position_ += r; cout << "  " << p << " rolls " << r << " and moves to " << position_ << "\n"; }
    bool isWon(const string&) override { return position_ >= 10; }
};

int main() {
    DiceRace g;
    for (int i = 0; i < 3; ++i) g.playTurn("Asha");
}
```

## NVI: the C++ idiom behind it

C++ programmers often combine Template Method with the **Non-Virtual Interface** idiom (you met it in the abstract classes lesson): the public function is non-virtual and calls **private virtual** steps. That also lets the base add pre- and post-conditions, logging or locking around every customised step.

```cpp run title="NVI wrapper adds locking and timing around any subclass step"
#include <iostream>
#include <mutex>
#include <string>
using namespace std;

class Task {
    mutex m_;
public:
    virtual ~Task() = default;
    void run() {                                           // public, non-virtual
        lock_guard<mutex> lock(m_);                        // the base guarantees mutual exclusion for ALL subclasses
        cout << "  [begin " << name() << "]\n";
        doRun();
        cout << "  [end " << name() << "]\n";
    }
private:
    virtual void doRun() = 0;                              // private virtual: customisation point
    virtual string name() const = 0;
};
class BackupTask : public Task {
    void doRun() override { cout << "  copying files\n"; }
    string name() const override { return "backup"; }
};

int main() { BackupTask().run(); }
```

## Hooks and "don't override the template"

- Make the template method **non-virtual** (or `final`) so subclasses cannot change the skeleton.
- Name optional extension points as **hooks** (`onDone`, `beforeSave`), with empty or default bodies.
- Mark required steps **pure virtual**. Give sensible defaults to the rest.
- Keep the number of steps small. If subclasses must override most of them, the skeleton is not really shared.

## Template Method vs Strategy

| | Template Method | Strategy |
|---|---|---|
| Mechanism | **inheritance** | **composition** |
| What varies | **steps** within a fixed algorithm | the **whole algorithm** |
| When chosen | at compile time (which subclass) | at run time (which strategy object) |
| Control flow | base calls subclass (Hollywood) | context calls strategy |
| Flexibility | less: one skeleton per hierarchy | more: swap, combine, reuse |
| Risk | fragile base class; subclass relies on base internals | more objects |

A rule of thumb: if the *outline* is stable and several variants differ in a few steps, use Template Method. If the algorithm itself must be swappable at run time, or you want to avoid inheritance, use Strategy. Often Template Method can be **refactored into Strategy** by moving the steps into an interface.

:::interview Template Method: key properties and an example
"A base class defines the algorithm skeleton in a non-virtual method that calls abstract steps and optional hooks; subclasses implement the varying steps but cannot change the order. It is the Hollywood principle: the base class calls the subclass. Examples: a data mining pipeline that opens, extracts, parses, analyses and reports; a test framework with setUp and tearDown; a game turn. In C++ it is closely related to the Non-Virtual Interface idiom. Compared with Strategy, it uses inheritance and varies steps, while Strategy uses composition and varies the whole algorithm."
:::

```quiz
? Why is the template method itself usually non-virtual?
- It would be slower
+ So subclasses cannot change the order of the steps
- Virtual functions cannot call others
> The skeleton is the invariant part; only the steps are meant to vary.
? What is a hook?
- A pure virtual step
+ An optional step with an empty or default body that subclasses may override
- A static function
> Hooks give extension points without forcing every subclass to implement them.
? How does Template Method differ from Strategy?
- It does not
+ Template Method varies steps via inheritance; Strategy swaps whole algorithms via composition
> Strategy can be changed at run time; Template Method is fixed by the subclass chosen.
```

:::keypoints
- Template Method: a non-virtual method fixes the algorithm's order; abstract steps and optional hooks vary in subclasses.
- Hollywood principle: the base class calls the derived class. It removes duplication and enforces the outline.
- In C++ this is the NVI idiom. Prefer Strategy when the algorithm must be swapped at run time.
:::
