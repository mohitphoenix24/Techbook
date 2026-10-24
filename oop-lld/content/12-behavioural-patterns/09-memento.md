---
title: Memento
level: intermediate
time: 30
summary: Save a snapshot of an object's state and restore it later, without exposing its private data. See the three roles, an editor with undo, a game save, deep copies, memory costs, and how Memento works with Command.
---

## What is the Memento pattern?

Don't memorise the definition yet. Think of it like this:

> "Before I try something risky, I **save the game**. If it goes wrong, I **load the save** and everything comes back."

That save file is the memento.

:::def Memento
Take a **snapshot of an object's state** so you can **restore it later**, without breaking the object's privacy.
:::

You need this for **undo**, **checkpoints**, **save games**, **rollback** and "restore the previous version".

The challenge: the object's data is **private**. If we add public getters for everything just so we can save it, we break encapsulation (the privacy we wanted to protect).

## The three roles

| Role | Job |
|---|---|
| **Originator** | the object whose state is saved. It creates a snapshot of itself, and can restore from one. |
| **Memento** | the **snapshot**. It is sealed: only the originator can read what is inside. |
| **Caretaker** | **keeps** the snapshots (for example in a history stack) but never looks inside. |

```viz algo=uml title="Memento"
class Editor
  - text: string
  - cursor: int
  + type(s: string): void
  + save(): Memento
  + restore(m: Memento): void
class Memento
  - text: string
  - cursor: int
class History
  - snapshots: Memento[]
  + push(m: Memento): void
  + pop(): Memento
Editor ..> Memento : creates
History o-- Memento
History --> Editor
```

## How to build it in C++

The trick: make the Memento a **nested class with private members**, and make only the `Editor` its friend. The caretaker can store and hand it back, but it cannot read it.

```cpp run title="Undo with snapshots"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Editor {
    string text_;
    size_t cursor_ = 0;
public:
    class Memento {                                        // opaque to everyone but Editor
        friend class Editor;
        string text_;
        size_t cursor_;
        Memento(string t, size_t c) : text_(move(t)), cursor_(c) {}
    };

    void type(const string& s) { text_.insert(cursor_, s); cursor_ += s.size(); }
    void moveCursor(size_t pos) { cursor_ = min(pos, text_.size()); }
    Memento save() const { return Memento(text_, cursor_); }
    void restore(const Memento& m) { text_ = m.text_; cursor_ = m.cursor_; }
    void show(const char* label) const { cout << "  " << label << ": \"" << text_ << "\" (cursor " << cursor_ << ")\n"; }
};

class History {                                            // the caretaker: stores snapshots, never reads them
    vector<Editor::Memento> stack_;
public:
    void push(Editor::Memento m) { stack_.push_back(move(m)); }
    bool empty() const { return stack_.empty(); }
    Editor::Memento pop() { auto m = move(stack_.back()); stack_.pop_back(); return m; }
};

int main() {
    Editor ed;
    History history;

    history.push(ed.save()); ed.type("Hello");
    history.push(ed.save()); ed.type(", world");
    history.push(ed.save()); ed.type("!!!");
    ed.show("current");

    ed.restore(history.pop()); ed.show("undo 1");
    ed.restore(history.pop()); ed.show("undo 2");
    ed.restore(history.pop()); ed.show("undo 3");
}
```

The `History` can hold many snapshots and return them, but it **cannot see or change** what is inside. The editor's data stays private.

## Example: save points in a game

```cpp run title="Checkpoints in a game"
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace std;

class Player {
    string name_;
    int hp_ = 100, level_ = 1;
    vector<string> inventory_;
public:
    explicit Player(string n) : name_(move(n)) {}
    void takeDamage(int d) { hp_ = max(0, hp_ - d); }
    void levelUp() { ++level_; hp_ = 100; }
    void pick(string item) { inventory_.push_back(move(item)); }

    struct Snapshot {                                      // a value object: copies everything (deep copy via vector/string)
    private:
        friend class Player;
        int hp, level; vector<string> inventory;
    };
    Snapshot checkpoint() const { Snapshot s; s.hp = hp_; s.level = level_; s.inventory = inventory_; return s; }
    void load(const Snapshot& s) { hp_ = s.hp; level_ = s.level; inventory_ = s.inventory; }
    void print(const char* when) const {
        cout << "  " << when << ": hp=" << hp_ << " level=" << level_ << " items=";
        for (const auto& i : inventory_) cout << i << ",";
        cout << "\n";
    }
};

int main() {
    Player p("Hero");
    p.pick("sword"); p.levelUp();
    auto save = p.checkpoint();                            // before the boss
    p.print("at the checkpoint");
    p.takeDamage(90); p.pick("cursed ring");
    p.print("after the boss fight");
    p.load(save);                                          // the player dies and reloads
    p.print("after loading");
}
```

## Important points

**1. Make a deep copy.** A memento must hold its **own copy** of the state. If it only stores a pointer to something that is shared, and that thing changes later, restoring will bring back the **changed** thing. Use value members (`string`, `vector`, structs), or copy owned objects fully.

**2. Watch the memory.** Saving a 100 MB document on every keystroke is wasteful. Options:

| Idea | How |
|---|---|
| **Limit the history** | keep only the last N snapshots |
| **Save only the changes (diffs)** | like the `undo` of a Command |
| **Group quick edits** | one snapshot for many small edits |
| **Share unchanged parts** | copy-on-write structures |
| **Snapshot now and then**, replay commands in between | combine both patterns |

**3. Keep it sealed.** Use a nested private class with a friend. Do not add public getters just for saving.

**4. Saving to disk.** A memento can be written to a file (a save game) if you choose a stable format. Then it is data, so give it a version number.

## Memento vs Command for undo

| | Command-based undo | Memento-based undo |
|---|---|---|
| What it stores | the **action** (and how to reverse it) | the **whole state** |
| Memory | small | can be big |
| Correctness | every command needs an exact reverse (hard for some actions) | restoring is easy and always correct |
| Best for | small edits with easy reverses | complex state, big checkpoints, "restore everything" |

Many real systems use **both**: commands for quick small undos, and mementos as checkpoints now and then.

```cpp run title="Combining: a memento taken before a risky command"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

class Account {
    long balance_ = 1000;
public:
    struct Memento { private: friend class Account; long balance; };
    Memento save() const { Memento m; m.balance = balance_; return m; }
    void restore(const Memento& m) { balance_ = m.balance; }
    void debit(long x) { if (x > balance_) throw runtime_error("insufficient funds"); balance_ -= x; }
    long balance() const { return balance_; }
};

void batch(Account& a) {
    auto before = a.save();                                // checkpoint
    try {
        a.debit(300);
        a.debit(500);
        a.debit(400);                                      // fails: the whole batch should vanish
    } catch (const exception& e) {
        cout << "  batch failed (" << e.what() << "), rolling back\n";
        a.restore(before);
    }
}

int main() {
    Account a;
    batch(a);
    cout << "balance after the failed batch: " << a.balance() << "\n";
}
```

## Short answer to say in an interview

:::interview How do you implement undo, and where does Memento fit?
"I can undo with commands that know how to reverse themselves, or with mementos. Before a change, the object saves a sealed snapshot of its state. A history keeps the snapshots on a stack, and undo restores the latest one. The memento is a nested class with private members that only the object itself can read, so privacy is kept. It is simple and always correct, but it can use a lot of memory. So I limit the history, store only changes, or combine it with commands."
:::

```quiz
? Who may read the inside of a memento?
- The caretaker
+ Only the originator that made it
- Any user
> The caretaker only stores it and gives it back. That keeps the privacy safe.
? Why must a memento hold a deep copy?
- For speed
+ So later changes to the object do not change the saved snapshot
- To save memory
> A shallow copy of something shared would change along with the original.
? What is the downside of undo by snapshots?
- It is not correct
+ It can use a lot of memory if the state is big
- It needs inheritance
> Limit the history, store changes only, or take snapshots now and then.
```

:::keypoints
- Memento = save and restore private state without exposing it. The originator creates and restores, the memento is sealed, the caretaker stores.
- In C++: a nested class with private members and `friend class Originator`. Use value members for a deep copy.
- It costs memory: limit it, store changes, or combine with Command. Good for undo, checkpoints and rollback.
:::
