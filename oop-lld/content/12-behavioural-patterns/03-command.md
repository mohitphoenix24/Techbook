---
title: Command
level: intermediate
time: 40
summary: Turn a request into an object, so you can store it, delay it, repeat it, or undo it. Learn the roles, undo and redo in a text editor, macros, a job queue, and when a lambda is enough.
---

## What is the Command pattern?

Don't memorise the definition yet. Think of it like this:

> "Instead of **doing** an action right now, I write the action on a **slip of paper** (an object). Then I can keep the slip, pass it to someone, do it later, do it again, or cancel it."

:::analogy Think of a restaurant order slip
The waiter writes your order on a slip and gives it to the kitchen. The slip can wait in a queue, be written in a log, be cancelled, or be repeated for another table. The waiter does not cook, and the cook does not talk to you.
:::

:::def Command
A **request turned into an object**. Because it is an object, you can store it, queue it, log it, and **undo** it.
:::

A normal call like `light.turnOn()` happens **now** and leaves no trace. If the request is an **object**, you can do much more with it.

## The roles

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

- **Command**: the common interface (`execute`, and often `undo`).
- **ConcreteCommand**: one real action, tied to the object that does the work.
- **Receiver**: the object that does the real work (for example the `Editor`).
- **Invoker**: the one that runs and stores commands (for example `History`).
- **Client**: the code that creates the commands.

## Example: a text editor with undo and redo

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

Every action goes through `History::run`. This one place gives us **undo, redo and history**. Each command remembers exactly what it needs to reverse itself.

How undo and redo work with two stacks:

1. Run a command → push it on the **undo** stack, and **clear** the redo stack.
2. Undo → pop from the undo stack, call `undo()`, push it on the **redo** stack.
3. Redo → pop from the redo stack, run it again, push it on the undo stack.

## Macro commands (a command made of commands)

A **macro** runs several commands as one. Undo runs them in **reverse order**.

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

## Queueing and scheduling

A command is an object, so a worker can run it later, maybe on another thread.

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

If you do not need undo or inspection, a command can simply be a function: `std::function<void()>`.

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

Use a **class** when the command needs undo, a name, saving to disk, or its own data. Use a **lambda** when it is "run this later and forget it".

## What commands make possible

| Feature | How |
|---|---|
| Undo and redo | a stack of done commands, each with `undo()` |
| Macros | a command that holds other commands |
| Queues, schedulers, thread pools | store commands, run them later |
| Logging and **recovery after a crash** | save the commands; replay them to rebuild the state |
| Transactions | run commands; if one fails, undo the finished ones |
| Separating UI from logic | a button holds a command, not business code |

## Design choices

- **Undo by doing the opposite** (cheap, but must be exact) or **by saving a snapshot** (simpler, but uses more memory). Many editors use both.
- **Commands that cannot be undone** (like sending an email): mark them as not undoable, or make `undo` send a correction.
- **Merging:** typing many letters can be merged into one undo step.

## Short answer to say in an interview

:::interview How would you implement undo and redo?
"I make each user action a Command with execute() and undo(). It holds the object it works on and whatever it needs to reverse itself. A history object keeps an undo stack and a redo stack. When a new command runs, I push it on the undo stack and clear the redo stack. Undo pops a command, calls undo() and pushes it on the redo stack. For groups of actions I use a macro command that undoes in reverse order. If the opposite action is hard to write, I save a snapshot of the state."
:::

```quiz
? What does Command turn a request into?
- A thread
+ An object that can be stored, queued, logged and undone
- A global function
> When the request is data, you can do much more with it.
? When a new command runs, what happens to the redo stack?
- It is kept
+ It is cleared, because the history has branched
- It is undone
> Redo is only valid until you do something new.
? In what order does a macro undo its steps?
- Same as the order they ran
+ In reverse order
- Random
> The last change must be undone first.
```

:::keypoints
- Command = a request as an object, with `execute()` and often `undo()`. An invoker stores commands. A receiver does the work.
- It gives undo/redo (two stacks), macros, queues, logging, transactions and UI separation.
- Use a lambda to simply delay a call. Use a class when you need undo or inspection.
:::
