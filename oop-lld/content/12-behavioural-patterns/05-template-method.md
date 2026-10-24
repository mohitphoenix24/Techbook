---
title: Template Method
level: intermediate
time: 30
summary: Fix the steps of a job in a base class, and let child classes fill in the details. See a data pipeline and a game turn, the "don't call us, we'll call you" idea, a C++ idiom called NVI, and how it differs from Strategy.
---

## What is the Template Method pattern?

Don't memorise the definition yet. Think of it like this:

> "The **steps** of the job are always the same and in the same order. Only a few steps are done differently by different children."

:::analogy Think of a recipe for a hot drink
The steps are fixed: boil water, **brew**, pour into a cup, **add extras**. For tea, "brew" means putting in a tea bag. For coffee, it means filtering the grounds. The outline is common. Only specific steps differ.
:::

:::def Template Method
The base class writes the **outline of a job** (the steps and their order). Child classes **fill in some of the steps**, but they cannot change the outline.
:::

## The idea

The base class has one **non-virtual** function (the "template") that calls the steps in order. Some steps are **abstract** (children must write them). Some have a **default** version. Some are optional empty **hooks**.

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

The order `open → extract → parse → analyse → report → done` is written in **one place**. Children cannot change the order or skip a step, because the template function is not virtual. The repeated code is gone from the children.

## "Don't call us, we'll call you"

This is called the **Hollywood principle**.

- In normal code, **you** call the library's helper functions.
- In Template Method, **the base class calls your code**.

The framework controls the flow. You only plug in the details. You have seen this in test frameworks (`setUp`, `test`, `tearDown`), web frameworks and game loops (`update`, `draw`).

## Example: a game turn

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

## The C++ way: NVI

C++ programmers often use Template Method with the **Non-Virtual Interface** idea: the public function is **non-virtual** and calls **private virtual** steps. This lets the base class add checks, logging or locking around every step that a child writes.

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

## Tips

- Make the template function **non-virtual** (or `final`), so children cannot change the outline.
- Name optional extension points **hooks** (`onDone`, `beforeSave`) with empty or default bodies.
- Make required steps **pure virtual**. Give the others a sensible default.
- Keep the number of steps small. If children must change almost every step, the outline is not really shared.

## Template Method vs Strategy

| | Template Method | Strategy |
|---|---|---|
| How | **inheritance** | **composition** |
| What changes | some **steps** of a fixed job | the **whole job** |
| When it is chosen | when compiling (which subclass) | while running (which strategy object) |
| Who calls whom | base calls child (Hollywood) | context calls strategy |
| Flexibility | less | more: swap and reuse |
| Risk | the child depends on the base's insides | more small objects |

Rule of thumb: if the **outline is stable** and variants differ in a few steps, use Template Method. If you need to **swap** the whole job at run time, or want to avoid inheritance, use Strategy.

## Short answer to say in an interview

:::interview What is Template Method? Give an example.
"A base class defines the steps of a job in a non-virtual function. Some steps are abstract, and children write them. Children cannot change the order of the steps. It follows the Hollywood principle: the base class calls the child. For example, a data pipeline that opens a file, extracts, parses, analyses and reports. The base class fixes that order, and each file type writes its own parse step. Compared with Strategy, it uses inheritance and changes steps, while Strategy uses composition and swaps the whole job."
:::

```quiz
? Why is the template function usually non-virtual?
- It would be slower
+ So children cannot change the order of the steps
- Virtual functions cannot call other functions
> The outline stays fixed. Only the steps are meant to change.
? What is a hook?
- A pure virtual step
+ An optional step with an empty or default body that a child may override
- A static function
> Hooks give extension points without forcing every child to write them.
? How is Template Method different from Strategy?
- It is not different
+ Template Method changes steps using inheritance. Strategy swaps the whole job using composition
> Strategy can change at run time. Template Method is fixed by the child you pick.
```

:::keypoints
- Template Method: a non-virtual function fixes the order. Abstract steps and optional hooks change in the children.
- Hollywood principle: the base calls the child. It removes repeated code and keeps the outline safe.
- In C++ it is the NVI idea. Choose Strategy if the job must be swapped at run time.
:::
