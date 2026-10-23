---
title: Memento
level: intermediate
time: 30
summary: Capturing and restoring an object's internal state without breaking encapsulation: originator, memento and caretaker, an editor and a game save with undo, deep copies, storing diffs, how it complements Command, and its costs.
---

:::def Memento
Without violating encapsulation, **capture and externalise an object's internal state** so that the object can be **restored to this state later**.
:::

You need this for **undo**, **checkpoints**, **save games**, **transaction rollback**, and "restore previous version". The challenge: the state is **private**. If you expose getters for everything just to save it, you break encapsulation.

## Roles

| Role | Job |
|---|---|
| **Originator** | the object whose state is saved. It creates a memento of itself and restores from one. |
| **Memento** | an **opaque snapshot** of the originator's state. Only the originator can read its contents. |
| **Caretaker** | **keeps** the mementos (a history stack) but never looks inside them. |

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

## Implementation: a nested private memento

The trick in C++: make the Memento a **nested class with private members**, and let only the `Editor` be its friend. The caretaker can store and pass it, but cannot read it.

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

The `History` can hold any number of snapshots and give them back, but it **cannot see or change** what is inside. The editor's fields stay private.

## A game: save points

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

## Important design points

**1. Deep copy.** A memento must hold an **independent copy** of the state. If it stores a pointer to a shared object that later changes, restoring brings back the *changed* object. Use value members (`string`, `vector`, structs), or deep-copy owned objects.

**2. Memory cost.** Snapshotting a 100 MB document at every keystroke is wasteful. Options:

| Strategy | How |
|---|---|
| **Limit** the history | keep the last N snapshots |
| **Store diffs** | save only the changes (what Command's `undo` does) |
| **Coalesce** | group quick consecutive edits into one snapshot |
| **Copy-on-write / persistent structures** | share unchanged parts |
| **Snapshot occasionally**, replay commands in between | combine both patterns |

**3. Encapsulation.** Keep the memento opaque (nested private class with friend, or an `std::any`-like opaque token). Do not add public getters just for saving.

**4. Serialisation.** A memento can also be written to disk (save file) if you design a stable format. Then it becomes data, so version it.

## Memento vs Command for undo

| | Command-based undo | Memento-based undo |
|---|---|---|
| Stores | the **operation** (and enough to reverse it) | the **state** itself |
| Memory | small | can be large |
| Correctness | each command must implement an exact inverse (hard for some ops) | restoring is trivial and always correct |
| Best for | fine-grained edits; operations with cheap inverses | complex state; coarse checkpoints; "restore the whole thing" |

Many real systems use **both**: commands for fast incremental undo, mementos as periodic checkpoints.

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

:::interview How do you implement undo, and how does Memento fit?
"I can undo with commands that know how to reverse themselves, or with mementos: before a change the originator creates an opaque snapshot of its state, the caretaker keeps them on a stack, and undo restores the latest. The memento is a nested class with private members that only the originator can read, so encapsulation stays intact. Memento is simple and always correct but may cost memory, so I limit history, store diffs, or combine it with commands."
:::

```quiz
? Who is allowed to read a memento's contents?
- The caretaker
+ Only the originator that created it
- Any client
> The caretaker only stores and returns it. That is how encapsulation is preserved.
? Why must a memento hold a deep copy?
- For speed
+ So that later changes to the originator do not alter the saved snapshot
- To save memory
> A shallow copy of a shared object would be silently changed along with the original.
? What is the downside of snapshot-based undo?
- It is incorrect
+ It can use a lot of memory for large states
- It needs inheritance
> Mitigate with limited history, diffs or periodic snapshots.
```

:::keypoints
- Memento: snapshot and restore private state without exposing it. Originator creates/restores, memento is opaque, caretaker stores.
- In C++: a nested class with private members and `friend class Originator`. Use value members for a deep copy.
- Costs memory: limit, diff, or combine with Command. Good for undo, checkpoints and rollback.
:::
