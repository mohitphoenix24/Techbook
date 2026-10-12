---
title: Command and Memento — Undo, Redo, Queues and Snapshots
level: intermediate
time: 50
summary: Command turns a request into an object that can be queued, logged, retried and undone — implemented as a text editor with undo/redo and macros in C++ and JavaScript — and Memento captures an object's state as an opaque snapshot so it can be restored, with the trade-offs between the two approaches to undo.
---

Two patterns that make **actions** and **states** into objects you can store. Together they power undo/redo, job queues, transaction logs, macros, and save points, and they appear in LLD questions like "design a text editor", "design a drawing app", "design a job scheduler" or "design a smart-home remote".

## Command

:::def Command
Encapsulates a **request as an object** containing everything needed to perform it (the receiver, the action, the parameters). The invoker that triggers it doesn't need to know what it does. Because it's an object, a command can be **stored, queued, logged, sent elsewhere, retried, and undone**.
:::

```viz algo=uml title="Command"
interface Command
  + execute()
  + undo()
  + label(): string
class InsertText
  - pos: int
  - text: string
class DeleteText
  - pos: int
  - len: int
  - deleted: string
class Document
  + insert(pos, text)
  + erase(pos, len): string
class Editor
  - undoStack: Command[]
  - redoStack: Command[]
  + run(cmd: Command)
  + undo()
  + redo()
InsertText ..|> Command
DeleteText ..|> Command
InsertText --> Document : receiver
DeleteText --> Document : receiver
Editor o-- Command : history
```

The roles: the **command** (`InsertText`), the **receiver** that does the real work (`Document`), the **invoker** that runs commands and keeps history (`Editor`), and the **client** that creates commands (the UI, keyboard shortcuts).

:::tabs A text editor with undo, redo and a macro
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Document {                                         // the receiver
    string text_;
public:
    void insert(size_t pos, const string& s) { text_.insert(pos, s); }
    string erase(size_t pos, size_t len) { string gone = text_.substr(pos, len); text_.erase(pos, len); return gone; }
    const string& text() const { return text_; }
};

class Command {
public:
    virtual ~Command() = default;
    virtual void execute() = 0;
    virtual void undo() = 0;
    virtual string label() const = 0;
};

class InsertText : public Command {
    Document& doc_; size_t pos_; string text_;
public:
    InsertText(Document& d, size_t pos, string t) : doc_(d), pos_(pos), text_(std::move(t)) {}
    void execute() override { doc_.insert(pos_, text_); }
    void undo() override { doc_.erase(pos_, text_.size()); }
    string label() const override { return "insert '" + text_ + "'"; }
};

class DeleteText : public Command {
    Document& doc_; size_t pos_, len_; string deleted_;   // remembers what it removed, to undo
public:
    DeleteText(Document& d, size_t pos, size_t len) : doc_(d), pos_(pos), len_(len) {}
    void execute() override { deleted_ = doc_.erase(pos_, len_); }
    void undo() override { doc_.insert(pos_, deleted_); }
    string label() const override { return "delete " + to_string(len_) + " chars"; }
};

class Macro : public Command {                           // a composite command
    vector<unique_ptr<Command>> steps_; string name_;
public:
    explicit Macro(string name) : name_(std::move(name)) {}
    Macro& add(unique_ptr<Command> c) { steps_.push_back(std::move(c)); return *this; }
    void execute() override { for (auto& c : steps_) c->execute(); }
    void undo() override { for (auto it = steps_.rbegin(); it != steps_.rend(); ++it) (*it)->undo(); }
    string label() const override { return "macro " + name_; }
};

class Editor {                                           // the invoker: runs commands, keeps history
    vector<unique_ptr<Command>> undo_, redo_;
public:
    void run(unique_ptr<Command> c) { c->execute(); undo_.push_back(std::move(c)); redo_.clear(); }   // a new action clears redo
    void undo() { if (undo_.empty()) return; undo_.back()->undo(); redo_.push_back(std::move(undo_.back())); undo_.pop_back(); }
    void redo() { if (redo_.empty()) return; redo_.back()->execute(); undo_.push_back(std::move(redo_.back())); redo_.pop_back(); }
    string history() const { string h; for (auto& c : undo_) h += "[" + c->label() + "] "; return h; }
};

int main() {
    Document doc;
    Editor ed;
    auto show = [&](const string& what) { cout << left << setw(16) << what << "\"" << doc.text() << "\"\n"; };
    ed.run(make_unique<InsertText>(doc, 0, "Hello world")); show("type");
    ed.run(make_unique<DeleteText>(doc, 5, 6));             show("delete");
    ed.run(make_unique<InsertText>(doc, 5, ", LLD"));       show("type");
    ed.undo();                                              show("undo");
    ed.undo();                                              show("undo");
    ed.redo();                                              show("redo");
    auto sign = make_unique<Macro>("signature");
    sign->add(make_unique<InsertText>(doc, doc.text().size(), "\n-- ")).add(make_unique<InsertText>(doc, doc.text().size() + 4, "Asha"));
    ed.run(std::move(sign));                                show("macro");
    ed.undo();                                              show("undo macro");
    cout << "history: " << ed.history() << "\n";
}
```
```js run
class Document {                                         // the receiver
  text = "";
  insert(pos, s) { this.text = this.text.slice(0, pos) + s + this.text.slice(pos); }
  erase(pos, len) { const gone = this.text.slice(pos, pos + len); this.text = this.text.slice(0, pos) + this.text.slice(pos + len); return gone; }
}

class InsertText {
  constructor(doc, pos, text) { Object.assign(this, { doc, pos, text }); }
  execute() { this.doc.insert(this.pos, this.text); }
  undo() { this.doc.erase(this.pos, this.text.length); }
  get label() { return `insert '${this.text}'`; }
}
class DeleteText {
  constructor(doc, pos, len) { Object.assign(this, { doc, pos, len, deleted: "" }); }
  execute() { this.deleted = this.doc.erase(this.pos, this.len); }   // remembers what it removed
  undo() { this.doc.insert(this.pos, this.deleted); }
  get label() { return `delete ${this.len} chars`; }
}
class Macro {                                            // a composite command
  constructor(name, steps) { Object.assign(this, { name, steps }); }
  execute() { this.steps.forEach((c) => c.execute()); }
  undo() { [...this.steps].reverse().forEach((c) => c.undo()); }
  get label() { return `macro ${this.name}`; }
}

class Editor {                                           // the invoker
  #undo = []; #redo = [];
  run(cmd) { cmd.execute(); this.#undo.push(cmd); this.#redo = []; }   // a new action clears redo
  undo() { const c = this.#undo.pop(); if (c) { c.undo(); this.#redo.push(c); } }
  redo() { const c = this.#redo.pop(); if (c) { c.execute(); this.#undo.push(c); } }
  get history() { return this.#undo.map((c) => `[${c.label}]`).join(" "); }
}

const doc = new Document(), ed = new Editor();
const show = (what) => console.log(`${what.padEnd(16)}${JSON.stringify(doc.text)}`);
ed.run(new InsertText(doc, 0, "Hello world")); show("type");
ed.run(new DeleteText(doc, 5, 6));             show("delete");
ed.run(new InsertText(doc, 5, ", LLD"));       show("type");
ed.undo();                                     show("undo");
ed.undo();                                     show("undo");
ed.redo();                                     show("redo");
const end = doc.text.length;
ed.run(new Macro("signature", [new InsertText(doc, end, "\n-- "), new InsertText(doc, end + 4, "Asha")])); show("macro");
ed.undo();                                     show("undo macro");
console.log("history:", ed.history);
```
:::

### What Command enables

- **Undo/redo**: each command knows how to reverse itself; two stacks give the history. (A new action after an undo clears the redo stack.)
- **Queues and scheduling**: commands are objects, so they can sit in a job queue, run later, run on another thread, or be **retried** (make them idempotent).
- **Logging and replay**: write each command to a log; replay the log to rebuild state after a crash. Databases do this with write-ahead logs, and event sourcing is the same idea for business events.
- **Macros and transactions**: a composite command runs several steps and undoes them in reverse.
- **Decoupling UI from logic**: a toolbar button, a keyboard shortcut and a voice assistant can all trigger the same `PasteCommand`.

LLD examples: smart-home remote (buttons bound to `LightOnCommand`, `FanSpeedCommand`, with undo), text or drawing editors, a **job/task scheduler** (jobs are commands), a restaurant ordering system (orders as commands queued to the kitchen), and a **bank transaction** log.

## Memento

:::def Memento
Captures an object's internal state in a **snapshot object** (the memento) **without exposing that state**, so the object can be restored to it later. Three roles: the **originator** (the object whose state is saved; it creates and restores mementos), the **memento** (an opaque snapshot), and the **caretaker** (stores mementos, e.g. an undo history, but never looks inside them).
:::

Command implements undo by **reversing each operation**. Memento implements undo by **restoring a saved copy**. Memento is simpler when operations are hard to reverse (a filter applied to an image, a complex form, a game level), at the cost of memory for each snapshot.

:::tabs Memento: save points for a game character
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Player {                                            // the originator
public:
    class Memento {                                       // opaque: only Player can read it
        friend class Player;
        int level_, hp_; vector<string> inventory_; string savedAt_;
        Memento(int l, int h, vector<string> inv, string at) : level_(l), hp_(h), inventory_(std::move(inv)), savedAt_(std::move(at)) {}
    public:
        const string& savedAt() const { return savedAt_; }   // harmless metadata for the caretaker
    };

    void fight(int damage) { hp_ = max(0, hp_ - damage); }
    void loot(const string& item) { inventory_.push_back(item); }
    void levelUp() { level_++; hp_ = 100; }
    Memento save(const string& where) const { return Memento(level_, hp_, inventory_, where); }
    void restore(const Memento& m) { level_ = m.level_; hp_ = m.hp_; inventory_ = m.inventory_; }
    string status() const { return "level " + to_string(level_) + ", hp " + to_string(hp_) + ", items " + to_string(inventory_.size()); }
private:
    int level_ = 1, hp_ = 100;
    vector<string> inventory_;
};

class SaveSlots {                                         // the caretaker: stores, never inspects
    vector<Player::Memento> slots_;
public:
    void push(Player::Memento m) { slots_.push_back(std::move(m)); }
    const Player::Memento& last() const { return slots_.back(); }
};

int main() {
    Player p;
    SaveSlots saves;
    p.loot("sword"); p.levelUp();
    saves.push(p.save("castle gate"));
    cout << "saved at " << saves.last().savedAt() << ": " << p.status() << "\n";
    p.fight(70); p.loot("cursed ring"); p.fight(40);
    cout << "after the boss: " << p.status() << "\n";
    p.restore(saves.last());
    cout << "reloaded:       " << p.status() << "\n";
}
```
```js run
class Player {                                            // the originator
  #level = 1; #hp = 100; #inventory = [];
  fight(damage) { this.#hp = Math.max(0, this.#hp - damage); }
  loot(item) { this.#inventory.push(item); }
  levelUp() { this.#level++; this.#hp = 100; }
  save(where) {                                           // the memento: frozen, and its state is hidden in a closure
    const state = structuredClone({ level: this.#level, hp: this.#hp, inventory: this.#inventory });
    return Object.freeze({ savedAt: where, [Player.#key]: state });
  }
  restore(memento) {
    const s = memento[Player.#key];
    if (!s) throw new Error("not a Player memento");
    this.#level = s.level; this.#hp = s.hp; this.#inventory = structuredClone(s.inventory);
  }
  static #key = Symbol("player-state");                  // only Player knows the key
  get status() { return `level ${this.#level}, hp ${this.#hp}, items ${this.#inventory.length}`; }
}

const saves = [];                                         // the caretaker: stores, never inspects
const p = new Player();
p.loot("sword"); p.levelUp();
saves.push(p.save("castle gate"));
console.log(`saved at ${saves.at(-1).savedAt}: ${p.status}`);
p.fight(70); p.loot("cursed ring"); p.fight(40);
console.log(`after the boss: ${p.status}`);
p.restore(saves.at(-1));
console.log(`reloaded:       ${p.status}`);
```
:::

## Command-based undo vs Memento-based undo

| | Command (reverse each operation) | Memento (restore a snapshot) |
|---|---|---|
| Memory | small: only the operation's parameters (and what it deleted) | a full (or partial) copy of the state per step |
| Complexity | every command must implement a correct `undo()` | trivial: copy in, copy out |
| Best when | operations are small and reversible (text edits, moves) | state is small, or operations are hard to reverse (filters, complex forms) |
| Bonus | the log of commands is replayable, auditable, sendable | point-in-time save slots |

Real editors often **combine** them: commands for fine-grained undo, periodic mementos (checkpoints) to bound replay time. Collaborative editors go further with operational transforms or CRDTs (Google Docs case study).

```quiz
? A smart-home remote needs programmable buttons, a "party mode" that runs several actions, and undo. Which pattern fits best?
+ Command: each action is an object with execute/undo; party mode is a macro (composite) command
- Singleton
- Observer
> Commands decouple buttons from devices and make actions storable, composable and reversible.

? After undoing two edits, the user types a new character. What should happen to the redo stack?
+ It's cleared, because the new action starts a new history branch
- It keeps both undone edits for later
- The new character is pushed onto the redo stack
> Standard undo/redo semantics: any new action invalidates the redo history.

? In Memento, why shouldn't the caretaker read the snapshot's contents?
+ To preserve encapsulation: only the originator knows (and can change) its internal representation
- Snapshots are encrypted
- The caretaker is always a remote server
> The memento is opaque to everyone except the object that created it.

? When is Memento-based undo preferable to Command-based undo?
+ When operations are hard to reverse and the state is small enough to snapshot
- When memory is extremely limited and state is huge
- Never
> Snapshots avoid writing an inverse for every operation, at the cost of memory.
```

:::keypoints
- **Command**: a request as an object (receiver + action + parameters), run by an invoker. Enables **undo/redo** (two stacks), **queues**, **retries**, **logging/replay**, **macros**, and decoupled UIs.
- **Memento**: an **opaque snapshot** created and restored by the originator, stored by a caretaker that never looks inside.
- Undo by **reversing operations** (Command: small memory, needs correct inverses) or **restoring snapshots** (Memento: simple, more memory); real systems often combine them.
:::
