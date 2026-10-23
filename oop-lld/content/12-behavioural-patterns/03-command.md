---
title: Command
level: intermediate
time: 40
summary: Turning a request into an object so it can be queued, logged, scheduled, undone and redone: the command interface, a text editor with undo and redo stacks, macro commands, a task queue, and when a lambda is enough.
---

:::def Command
**Encapsulate a request as an object**, thereby letting you parameterise clients with different requests, **queue or log** requests, and support **undoable operations**.
:::

A normal method call `light.turnOn()` happens **now**, and leaves no trace. If the request is an **object**, you can store it, pass it around, delay it, repeat it, record it, or reverse it.

:::analogy Think of it like this
A restaurant order slip. The waiter writes your order on a slip (the command) and hands it to the kitchen. The slip can wait in a queue, be logged, be cancelled, or be repeated for the next table. The waiter does not cook, and the cook does not talk to you.
:::

## Structure

```viz algo=uml title="Command"
interface Command
  + execute(): void
  + undo(): void
class InsertText
class DeleteText
class Editor
  - text: string
  + insert(pos: int, s: string): void
  + erase(pos: int, n: int): string
class History
  - undoStack: Command[]
  - redoStack: Command[]
  + run(c: Command): void
  + undo(): void
  + redo(): void
InsertText ..|> Command
DeleteText ..|> Command
InsertText --> Editor : receiver
DeleteText --> Editor : receiver
History o-- Command
```

Roles: **Command** (interface), **ConcreteCommand** (binds an action to a **receiver**), **Receiver** (does the real work: the `Editor`), **Invoker** (the `History`: triggers and stores commands), **Client** (creates commands).

## A text editor with undo and redo

```cpp run title="Undo/redo with the Command pattern"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Editor {                                             // the receiver
    string text_;
public:
    void insert(size_t pos, const string& s) { text_.insert(pos, s); }
    string erase(size_t pos, size_t n) { string removed = text_.substr(pos, n); text_.erase(pos, n); return removed; }
    const string& text() const { return text_; }
};

class Command {
public:
    virtual ~Command() = default;
    virtual void execute() = 0;
    virtual void undo() = 0;
};

class InsertCommand : public Command {
    Editor& ed_; size_t pos_; string text_;
public:
    InsertCommand(Editor& e, size_t pos, string t) : ed_(e), pos_(pos), text_(move(t)) {}
    void execute() override { ed_.insert(pos_, text_); }
    void undo() override { ed_.erase(pos_, text_.size()); }                 // the exact inverse
};
class DeleteCommand : public Command {
    Editor& ed_; size_t pos_, len_; string removed_;                        // remembers what it deleted, so it can restore it
public:
    DeleteCommand(Editor& e, size_t pos, size_t len) : ed_(e), pos_(pos), len_(len) {}
    void execute() override { removed_ = ed_.erase(pos_, len_); }
    void undo() override { ed_.insert(pos_, removed_); }
};

class History {                                            // the invoker
    vector<unique_ptr<Command>> undo_, redo_;
public:
    void run(unique_ptr<Command> c) {
        c->execute();
        undo_.push_back(move(c));
        redo_.clear();                                     // a new action invalidates the redo history
    }
    bool undo() { if (undo_.empty()) return false; undo_.back()->undo(); redo_.push_back(move(undo_.back())); undo_.pop_back(); return true; }
    bool redo() { if (redo_.empty()) return false; redo_.back()->execute(); undo_.push_back(move(redo_.back())); redo_.pop_back(); return true; }
};

int main() {
    Editor ed; History h;
    auto show = [&](const char* what) { cout << "  " << what << " -> \"" << ed.text() << "\"\n"; };

    h.run(make_unique<InsertCommand>(ed, 0, "Hello"));      show("insert Hello");
    h.run(make_unique<InsertCommand>(ed, 5, " world"));     show("insert ' world'");
    h.run(make_unique<DeleteCommand>(ed, 0, 6));            show("delete 6 chars");
    h.undo();                                               show("undo");
    h.undo();                                               show("undo");
    h.redo();                                               show("redo");
    h.run(make_unique<InsertCommand>(ed, 5, "!"));          show("insert ! (clears redo)");
    cout << "redo possible? " << boolalpha << h.redo() << "\n";
}
```

Every action goes through `History::run`, which gives you **undo, redo, history logs and macro recording** in one place. Each command stores exactly what it needs to reverse itself.

## Macro commands (composite of commands)

A **macro** is a command made of commands.

```cpp run title="MacroCommand: run and undo a group"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Command { virtual ~Command() = default; virtual void execute() = 0; virtual void undo() = 0; };

class Light {
    string name_; bool on_ = false;
public:
    explicit Light(string n) : name_(move(n)) {}
    void set(bool on) { on_ = on; cout << "  " << name_ << (on ? " ON\n" : " OFF\n"); }
    bool on() const { return on_; }
};
class SwitchCommand : public Command {
    Light& l_; bool target_, before_ = false;
public:
    SwitchCommand(Light& l, bool target) : l_(l), target_(target) {}
    void execute() override { before_ = l_.on(); l_.set(target_); }
    void undo() override { l_.set(before_); }
};
class MacroCommand : public Command {
    vector<unique_ptr<Command>> steps_;
public:
    MacroCommand& add(unique_ptr<Command> c) { steps_.push_back(move(c)); return *this; }
    void execute() override { for (auto& s : steps_) s->execute(); }
    void undo() override { for (auto it = steps_.rbegin(); it != steps_.rend(); ++it) (*it)->undo(); }   // reverse order!
};

int main() {
    Light hall("hall"), kitchen("kitchen");
    MacroCommand goodNight;
    goodNight.add(make_unique<SwitchCommand>(hall, false)).add(make_unique<SwitchCommand>(kitchen, false));
    hall.set(true); kitchen.set(true);
    cout << "good night:\n"; goodNight.execute();
    cout << "undo good night:\n"; goodNight.undo();
}
```

## Queueing and scheduling: commands as tasks

Because a command is an object, a worker can run it later, on another thread.

```cpp run title="A simple job queue"
#include <functional>
#include <iostream>
#include <memory>
#include <queue>
#include <string>
using namespace std;

class Job {
public:
    virtual ~Job() = default;
    virtual void run() = 0;
    virtual string name() const = 0;
};
class EmailJob : public Job {
    string to_;
public:
    explicit EmailJob(string to) : to_(move(to)) {}
    void run() override { cout << "  sending email to " << to_ << "\n"; }
    string name() const override { return "email"; }
};
class ReportJob : public Job {
public:
    void run() override { cout << "  generating the monthly report\n"; }
    string name() const override { return "report"; }
};

int main() {
    queue<unique_ptr<Job>> pending;
    pending.push(make_unique<EmailJob>("asha@example.com"));
    pending.push(make_unique<ReportJob>());
    pending.push(make_unique<EmailJob>("ravi@example.com"));
    cout << pending.size() << " jobs queued; a worker drains the queue later:\n";
    while (!pending.empty()) { pending.front()->run(); pending.pop(); }
}
```

## When a lambda is enough

If you do not need undo or inspection, a command is just a **callable**: `std::function<void()>`.

```cpp run title="Commands as lambdas"
#include <functional>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<function<void()>> pending;
    int counter = 0;
    pending.push_back([&] { ++counter; cout << "  counter is " << counter << "\n"; });
    pending.push_back([&] { counter *= 10; cout << "  counter is " << counter << "\n"; });
    for (auto& c : pending) c();                           // run later, in order
}
```

Use a **class** when the command needs: undo, a description/name, serialization, inspection, or state. Use a **lambda** when it is fire and forget.

## What commands unlock

| Feature | How |
|---|---|
| Undo/redo | a stack of executed commands, each with `undo()` |
| Macros | a composite of commands |
| Queues, schedulers, thread pools | store commands, run later |
| Logging and **crash recovery** | persist the command list; replay it to rebuild state (event sourcing) |
| Transactions | run commands; on failure undo the completed ones |
| Decoupling UI from logic | a button holds a command, not business code |

## Design choices

- **Command stores receiver or gets it at run time?** Store it (as above) for simple cases.
- **Undo by inverse operation or by snapshot?** Inverse is cheap but must be exact; a snapshot (Memento) is simpler but heavier. Many editors combine both.
- **Commands that cannot be undone** (send an email): mark them non-undoable, or make `undo` compensate (send a retraction).
- **Merging**: typing many characters might merge into one undo step.

:::interview How would you implement undo/redo?
"Model each user action as a Command with `execute()` and `undo()`, holding the receiver and whatever state it needs to reverse itself. An invoker keeps an undo stack and a redo stack: running a command pushes it on the undo stack and clears the redo stack; undo pops, calls `undo()`, and pushes onto the redo stack. For groups I use a MacroCommand that undoes in reverse order. If inverse operations are hard, I save a memento of the state instead."
:::

```quiz
? What does Command turn a request into?
- A thread
+ An object that can be stored, queued, logged and undone
- A global function
> Having the request as data is what enables history and scheduling.
? When a new command runs, what happens to the redo stack?
- It is kept
+ It is cleared, because the history branched
- It is undone
> Standard editor behaviour: redo is only valid until you do something new.
? In what order does a MacroCommand undo its steps?
- The same order as execution
+ The reverse order
- Random
> The last change must be reversed first.
```

:::keypoints
- Command: a request as an object with `execute()` (and `undo()`); invoker stores them, receiver does the work.
- Enables undo/redo (two stacks), macros (composite), queues/scheduling, logging, transactions, UI decoupling.
- Use a lambda when you only need to defer a call; use a class when you need undo or inspection.
:::
