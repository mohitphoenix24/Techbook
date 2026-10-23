---
title: Design a Text Editor with Undo/Redo
level: advanced
time: 70
summary: A document model with insert, delete and replace, edits as Command objects with undo and redo stacks, coalescing consecutive typing into one undo step, macros and find/replace-all as composite commands, snapshots with Memento, and change notifications.
---

:::problem Design a Text Editor with Undo/Redo {level=hard tags="Command,Memento,undo,Composite,document model,Observer"}
Design the core of a text editor. It supports inserting and deleting text at the cursor, cursor movement, selection, copy/cut/paste, find and replace-all, and unlimited undo and redo. Typing a word should undo as **one** step, not letter by letter. Operations such as replace-all must undo as one step too. The editor notifies listeners (views) after every change.
:::

:::hint Hint
Every edit is a **Command** with `execute` and `undo` (and enough saved data to reverse itself). A history object keeps two stacks. For typing, **merge** a new character into the previous command when it continues it. A replace-all is a **composite command** of many small replacements.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Document? | a single text buffer (UTF-8 bytes treated as characters for simplicity) |
| Operations? | insert(text), erase(count), moveCursor, select, copy/cut/paste, replaceAll(find, with) |
| Undo/redo? | unlimited stacks; a new edit clears redo |
| Merging? | consecutive single-character inserts at adjacent positions merge into one undo step |
| Cursor restore? | undo/redo restores the cursor to where it was |
| Notifications? | listeners are told after each change (and on undo/redo) |
| Performance? | O(n) string edits are acceptable here; mention a gap buffer or rope for big files |
| Out of scope | rich text, multiple documents, files |

## Step 2: entities

```viz algo=uml title="Text editor"
class Editor
  - doc: Document
  - history: History
  - clipboard: string
  + type(s: string): void
  + backspace(): void
  + paste(): void
  + replaceAll(find: string, with: string): int
  + undo(): void
  + redo(): void
class Document
  - text: string
  - cursor: size_t
  + insert(pos: size_t, s: string): void
  + erase(pos: size_t, n: size_t): string
interface Command
  + execute(d: Document): void
  + undo(d: Document): void
  + mergeWith(next: Command): bool
class InsertCommand
class EraseCommand
class ReplaceCommand
class MacroCommand
class History
  - undoStack: Command[]
  - redoStack: Command[]
  + run(c: Command): void
interface DocumentListener
  + onChange(d: Document): void
Editor *-- Document
Editor *-- History
History o-- Command
InsertCommand ..|> Command
EraseCommand ..|> Command
ReplaceCommand ..|> Command
MacroCommand ..|> Command
MacroCommand o-- Command
Document o-- DocumentListener
```

## Step 3: design decisions

- **Document** exposes only **primitive, reversible operations**: `insert(pos, s)` and `erase(pos, n)` returning the erased text. Everything else is built from them.
- **Commands save what they need to reverse**: `Insert` knows pos and text (undo = erase). `Erase` stores the removed text (undo = insert). `Replace` = erase + insert as a small composite. Each also stores the **cursor before and after** so undo restores the cursor.
- **`mergeWith(next)`** (coalescing): `InsertCommand` merges when `next` is an insert starting exactly at the end of its text and both are "typing" (not after a pause or a cursor jump). Whitespace/word boundary could end a merge group (policy).
- **MacroCommand** (Composite) groups commands; its `undo` reverses them **in reverse order**. `replaceAll` builds one macro (replace from the **last** match to the first so positions stay valid), runs it as a single history entry.
- **History** has `undoStack` and `redoStack`. `run` executes, tries to merge with the top of the undo stack, otherwise pushes; clears redo.
- **Memento for big operations**: instead of many small commands, a `SnapshotCommand` could store the whole text before/after. Use commands for fine edits, snapshots for rare bulk changes or crash recovery.
- **Observer**: `Document` notifies listeners after any change (including undo/redo) so views refresh.

## Step 4: the code

```cpp run title="Commands, merging, macros, undo/redo"
#include <algorithm>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct DocumentListener { virtual ~DocumentListener() = default; virtual void onChange(const string& text, size_t cursor) = 0; };

class Document {
    string text_; size_t cursor_ = 0;
    vector<DocumentListener*> listeners_;
    void notify() { for (auto* l : listeners_) l->onChange(text_, cursor_); }
public:
    void listen(DocumentListener* l) { listeners_.push_back(l); }
    const string& text() const { return text_; }
    size_t cursor() const { return cursor_; }
    void setCursor(size_t c) { cursor_ = min(c, text_.size()); notify(); }
    void insert(size_t pos, const string& s) { text_.insert(pos, s); notify(); }
    string erase(size_t pos, size_t n) { string removed = text_.substr(pos, n); text_.erase(pos, n); notify(); return removed; }
    void setCursorQuiet(size_t c) { cursor_ = min(c, text_.size()); }
};

class Command {
public:
    virtual ~Command() = default;
    virtual void execute(Document& d) = 0;
    virtual void undo(Document& d) = 0;
    virtual bool mergeWith(const Command&) { return false; }       // coalescing hook
    virtual const char* kind() const = 0;
};

class InsertCommand : public Command {
    size_t pos_; string text_; size_t cursorBefore_ = 0;
    friend class History;
public:
    InsertCommand(size_t pos, string text) : pos_(pos), text_(move(text)) {}
    void execute(Document& d) override { cursorBefore_ = d.cursor(); d.insert(pos_, text_); d.setCursorQuiet(pos_ + text_.size()); }
    void undo(Document& d) override { d.erase(pos_, text_.size()); d.setCursorQuiet(cursorBefore_); }
    bool mergeWith(const Command& next) override {                 // typing continues exactly where the last insert ended
        const auto* n = dynamic_cast<const InsertCommand*>(&next);
        if (!n || n->pos_ != pos_ + text_.size() || n->text_.find(' ') != string::npos || text_.find(' ') != string::npos) return false;   // a space ends the group
        text_ += n->text_;
        return true;
    }
    const char* kind() const override { return "insert"; }
    const string& text() const { return text_; }
};

class EraseCommand : public Command {
    size_t pos_, count_; string removed_; size_t cursorBefore_ = 0;
public:
    EraseCommand(size_t pos, size_t count) : pos_(pos), count_(count) {}
    void execute(Document& d) override { cursorBefore_ = d.cursor(); removed_ = d.erase(pos_, count_); d.setCursorQuiet(pos_); }
    void undo(Document& d) override { d.insert(pos_, removed_); d.setCursorQuiet(cursorBefore_); }
    const char* kind() const override { return "erase"; }
};

class MacroCommand : public Command {                              // Composite: many edits, one undo step
    vector<unique_ptr<Command>> steps_; string label_;
public:
    explicit MacroCommand(string label) : label_(move(label)) {}
    void add(unique_ptr<Command> c) { steps_.push_back(move(c)); }
    bool empty() const { return steps_.empty(); }
    void execute(Document& d) override { for (auto& s : steps_) s->execute(d); }
    void undo(Document& d) override { for (auto it = steps_.rbegin(); it != steps_.rend(); ++it) (*it)->undo(d); }   // reverse order!
    const char* kind() const override { return "macro"; }
};

class History {
    vector<unique_ptr<Command>> undo_, redo_;
public:
    void run(unique_ptr<Command> c, Document& d, bool allowMerge) {
        c->execute(d);
        redo_.clear();                                              // a new edit invalidates redo
        if (allowMerge && !undo_.empty() && undo_.back()->mergeWith(*c)) return;      // coalesced into the previous step
        undo_.push_back(move(c));
    }
    bool undo(Document& d) { if (undo_.empty()) return false; undo_.back()->undo(d); redo_.push_back(move(undo_.back())); undo_.pop_back(); return true; }
    bool redo(Document& d) { if (redo_.empty()) return false; redo_.back()->execute(d); undo_.push_back(move(redo_.back())); redo_.pop_back(); return true; }
    size_t undoDepth() const { return undo_.size(); }
    void breakMerge() {}                                            // (hook: e.g. after a cursor move, stop merging)
};

class Editor {
    Document doc_; History history_; string clipboard_;
    size_t selStart_ = 0, selEnd_ = 0;                              // selection [start, end)
    bool lastWasTyping_ = false;
public:
    Document& document() { return doc_; }
    void type(const string& s) { history_.run(make_unique<InsertCommand>(doc_.cursor(), s), doc_, lastWasTyping_); lastWasTyping_ = true; }
    void backspace() { if (doc_.cursor() == 0) return; history_.run(make_unique<EraseCommand>(doc_.cursor() - 1, 1), doc_, false); lastWasTyping_ = false; }
    void moveCursor(size_t pos) { doc_.setCursor(pos); lastWasTyping_ = false; }        // a cursor jump ends a typing group
    void select(size_t from, size_t to) { selStart_ = from; selEnd_ = to; }
    void copy() { clipboard_ = doc_.text().substr(selStart_, selEnd_ - selStart_); }
    void cut() { copy(); doc_.setCursorQuiet(selStart_); history_.run(make_unique<EraseCommand>(selStart_, selEnd_ - selStart_), doc_, false); lastWasTyping_ = false; }
    void paste() { history_.run(make_unique<InsertCommand>(doc_.cursor(), clipboard_), doc_, false); lastWasTyping_ = false; }
    int replaceAll(const string& find, const string& with) {
        if (find.empty()) return 0;
        vector<size_t> hits;
        for (size_t p = doc_.text().find(find); p != string::npos; p = doc_.text().find(find, p + find.size())) hits.push_back(p);
        if (hits.empty()) return 0;
        auto macro = make_unique<MacroCommand>("replace all");
        for (auto it = hits.rbegin(); it != hits.rend(); ++it) {    // from the END to the start so earlier positions stay valid
            macro->add(make_unique<EraseCommand>(*it, find.size()));
            macro->add(make_unique<InsertCommand>(*it, with));
        }
        history_.run(move(macro), doc_, false);
        lastWasTyping_ = false;
        return static_cast<int>(hits.size());
    }
    bool undo() { lastWasTyping_ = false; return history_.undo(doc_); }
    bool redo() { lastWasTyping_ = false; return history_.redo(doc_); }
    size_t undoDepth() const { return history_.undoDepth(); }
};

struct ConsoleView : DocumentListener {
    int changes = 0;
    void onChange(const string&, size_t) override { ++changes; }
};

int main() {
    Editor ed; ConsoleView view; ed.document().listen(&view);
    auto show = [&](const char* what) { cout << "  " << what << ": \"" << ed.document().text() << "\" cursor=" << ed.document().cursor() << "  (undo steps: " << ed.undoDepth() << ")\n"; };

    for (char c : string("Hello")) ed.type(string(1, c));         // five keystrokes: ONE undo step
    show("typed Hello letter by letter");
    ed.type(" "); ed.type("w"); ed.type("o"); ed.type("r"); ed.type("l"); ed.type("d");
    show("typed ' world' (a space starts a new group)");

    ed.undo(); show("undo (removes 'world' as one step)");
    ed.undo(); show("undo (removes the space)");
    ed.undo(); show("undo (removes 'Hello')");
    ed.redo(); ed.redo(); show("redo twice");

    ed.type("!"); show("typing after undo");
    cout << "  redo possible now? " << boolalpha << ed.redo() << " (a new edit cleared the redo stack)\n";

    ed.backspace(); show("backspace");
    ed.undo(); show("undo the backspace restores the character and the cursor");

    cout << "replace all:\n";
    ed.moveCursor(ed.document().text().size());
    ed.type(" hello again");
    int n = ed.replaceAll("hello", "bye"); show("replace 'hello' with 'bye' (case-sensitive)");
    cout << "  replaced " << n << " occurrence(s); undo restores them all in one step:\n";
    ed.undo(); show("undo");
    ed.redo(); show("redo");

    cout << "cut and paste:\n";
    ed.select(0, 3); ed.cut(); show("cut the first 3 characters");
    ed.moveCursor(ed.document().text().size()); ed.paste(); show("paste at the end");
    ed.undo(); ed.undo(); show("two undos");
    cout << "listener was notified " << view.changes << " times\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Undo with an empty stack | returns false; nothing happens |
| Backspace at position 0 | ignored |
| Merge across a cursor move | `lastWasTyping_` resets on cursor movement, so the next character starts a new group |
| `replaceAll` overlapping matches | non-overlapping scan from left; edits applied right to left |
| Replace text that contains the search text (`a` → `aa`) | scan is done on the original text once, so no infinite expansion |
| Huge history | cap the stack (drop the oldest) or persist to disk; snapshots every N commands to bound replay |
| Cursor after undo | each command stores the cursor before it ran |
| Observers during a macro | notify once at the end (batch) to avoid flicker |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Large files (millions of characters)" | replace `string` by a **gap buffer** (O(1) edits near the cursor) or a **rope**/piece table (efficient for large edits and cheap undo) |
| "Multiple cursors / selections" | commands hold a list of ranges; a macro of per-cursor commands |
| "Collaborative editing" | operational transformation or CRDTs: commands are transformed against concurrent ones |
| "Syntax highlighting" | a `Highlighter` observer working on changed ranges only |
| "Auto-save and crash recovery" | write the command log (a WAL) and replay; periodic Memento snapshots |
| "Search with regex, incremental find" | a `Matcher` Strategy |
| "Macros recorded by the user" | record executed commands into a `MacroCommand` and replay |
| "Line-based model" | store lines in a vector for fast navigation; commands use (line, column) positions |

```quiz
? Why does MacroCommand undo in reverse order?
- It is faster
+ The last change must be reversed first so earlier positions and contents are valid again
- By convention
> Undoing in the original order would apply changes to a different state.
? What does merging typing commands achieve?
- Faster typing
+ A whole word undoes as one step instead of letter by letter
- Smaller memory only
> Coalescing groups consecutive edits that a user perceives as one action.
```

:::keypoints
- Document offers primitive reversible operations; every edit is a Command with saved data to undo; History keeps undo/redo stacks.
- Coalesce typing with `mergeWith`; composite MacroCommand for replace-all (apply right-to-left, undo in reverse).
- Mementos for snapshots, observers for views; gap buffer, rope or piece table for scale; OT/CRDT for collaboration.
:::
