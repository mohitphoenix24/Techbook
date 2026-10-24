---
title: Design a Text Editor with Undo/Redo
level: advanced
time: 70
summary: A text editor where every edit is an object that can be undone and redone. Learn the document model, undo and redo stacks, joining typed letters into one undo step, macros and replace-all, snapshots, and change notifications.
---

:::problem Design a Text Editor with Undo/Redo {level=hard tags="Command,Memento,undo,Composite,document model,Observer"}
Design the core of a text editor. It supports inserting and deleting text at the cursor, moving the cursor, selecting, copy, cut and paste, find and replace-all, and unlimited undo and redo. Typing a word should undo as **one** step, not letter by letter. Actions like replace-all must also undo as one step. The editor tells listeners (views) after every change.
:::

:::hint Hint
Every edit is a **Command** with `execute` and `undo` (and it saves enough data to reverse itself). A history object keeps two stacks. For typing, **merge** a new letter into the previous command when it continues it. A replace-all is a **composite command** made of many small replacements.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| The document? | one text buffer (UTF-8 bytes treated as characters, to keep it simple) |
| Actions? | insert(text), erase(count), moveCursor, select, copy, cut, paste, replaceAll(find, with) |
| Undo and redo? | unlimited stacks. A new edit clears the redo stack |
| Merging? | letters typed one after another at nearby positions join into one undo step |
| The cursor? | undo and redo put the cursor back where it was |
| Messages? | listeners are told after each change (and after undo and redo) |
| Speed? | O(n) string edits are fine here. For big files we mention a gap buffer or a rope |
| Not needed | rich text, many documents, files |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **`Document` shows only simple, reversible actions:** `insert(pos, s)` and `erase(pos, n)` (which returns the erased text). Everything else is built from these two.
- **Commands save what they need to undo.** `Insert` knows the position and text (undo = erase). `Erase` keeps the removed text (undo = insert). `Replace` = erase + insert as a small group. Each also keeps the **cursor before and after**, so undo puts the cursor back.
- **`mergeWith(next)` (joining typed letters):** `InsertCommand` joins `next` when `next` is an insert that starts exactly at the end of its text, and both are "typing" (not after a pause or a cursor jump). A space or word end could finish a group (a policy).
- **MacroCommand** (a Composite) groups commands. Its `undo` undoes them **in reverse order**. `replaceAll` builds one macro (replacing from the **last** match to the first, so positions stay correct) and runs it as one history entry.
- **History** has `undoStack` and `redoStack`. `run` executes the command, tries to merge it with the top of the undo stack, otherwise pushes it, and clears the redo stack.
- **Memento for big changes:** instead of many small commands, a `SnapshotCommand` can keep the whole text before and after. Use commands for fine edits, and snapshots for rare big changes or crash recovery.
- **Observer:** `Document` tells listeners after any change (including undo and redo), so views refresh.

## Step 4: The code

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

| Case | What happens |
|---|---|
| Undo with an empty stack | returns false and nothing happens |
| Backspace at position 0 | ignored |
| Joining across a cursor move | `lastWasTyping_` is reset when the cursor moves, so the next letter starts a new group |
| `replaceAll` with overlapping matches | scan from the left without overlaps. Apply edits from right to left |
| Replacement text that contains the search text (`a` to `aa`) | the scan runs once on the original text, so it does not grow forever |
| Very long history | limit the stack (drop the oldest), or save to disk. Take snapshots every N commands to limit replay |
| The cursor after undo | each command saves the cursor from before it ran |
| Observers during a macro | tell them once at the end (batching), to avoid flicker |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Large files (millions of characters)" | replace `string` with a **gap buffer** (O(1) edits near the cursor) or a **rope** or piece table (good for big edits and cheap undo) |
| "Many cursors or selections" | commands hold a list of ranges. A macro of one command for each cursor |
| "Editing together with others" | operational transformation or CRDTs: commands are changed to fit other users' commands |
| "Colouring code" | a `Highlighter` observer that works only on the changed ranges |
| "Auto-save and crash recovery" | write the command log (a WAL) and replay it. Take Memento snapshots now and then |
| "Regex search, search as you type" | a `Matcher` Strategy |
| "Macros recorded by the user" | record executed commands into a `MacroCommand` and replay them |
| "A model based on lines" | keep lines in a vector for fast movement. Commands use (line, column) positions |

## Short answer to say in an interview

:::interview How do you implement undo and redo in a text editor?
"Each edit is a Command with execute and undo, and it saves what it needs to reverse itself: an insert knows its position and text, and an erase keeps the removed text. A history keeps an undo stack and a redo stack. Running a new command pushes it and clears redo. Typed letters merge into the previous command, so a word undoes in one step. A macro, like replace-all, is a composite command that undoes in reverse order. The document tells listeners after every change, including undo."
:::

```quiz
? Why does MacroCommand undo in reverse order?
- It is faster
+ The last change must be undone first, so the earlier positions and contents are correct again
- By habit
> Undoing in the same order would apply changes to the wrong state.
? What does joining typing commands give us?
- Faster typing
+ A whole word undoes as one step instead of letter by letter
- Only less memory
> Joining groups edits that the user feels as one action.
```

:::keypoints
- `Document` offers simple, reversible actions. Every edit is a Command that saves what it needs to undo. History keeps undo and redo stacks.
- Join typed letters with `mergeWith`. Use a composite MacroCommand for replace-all (apply right to left, undo in reverse).
- Mementos for snapshots, observers for views. A gap buffer, rope or piece table for scale. OT or CRDT for working together.
:::
