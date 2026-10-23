---
title: Design a Spreadsheet
level: advanced
time: 75
summary: Cells that hold numbers, text or formulas referencing other cells, a dependency graph that recalculates only what changed in topological order, cycle detection, error values, ranges and functions like SUM, and observers for changes.
---

:::problem Design a Spreadsheet (Excel/Sheets core) {level=hard tags="graph,DAG,Interpreter,Observer,parsing,dependency tracking"}
Design a spreadsheet engine. Cells (A1, B2, ...) hold numbers, text or formulas such as `=B1*2+C1` or `=SUM(A1:A5)`. When a cell changes, every formula that depends on it (directly or indirectly) must be recalculated, exactly once and in a valid order. Detect circular references, show errors (`#DIV/0!`, `#REF!`, `#CYCLE!`), and notify listeners about changed cells.
:::

:::hint Hint
A spreadsheet is a **directed acyclic graph**: each formula cell **depends on** the cells it references. Keep, for each cell, both its dependencies and its **dependents**. On change, recalculate the affected cells in **topological order**. Parsing formulas is the Interpreter pattern (an expression tree).
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Cell content? | number, text, or formula starting with `=` |
| Formulas? | `+ - * /`, parentheses, cell references (A1), ranges (A1:B3) inside `SUM`, `AVG`, `MIN`, `MAX`, `COUNT` |
| Recalculation? | automatic on every `set`; only affected cells, each once |
| Errors? | divide by zero, reference to an empty or text cell in arithmetic (treated as 0 for empty, error for text), unknown function, **cycles** |
| Observers? | notified of every cell whose displayed value changed |
| Size? | sparse grid (a map from cell id to cell), unbounded |
| Concurrency? | a single writer; readers need a consistent view (mutex or snapshot) |
| Out of scope | formatting, charts, copy-paste with relative references (extension) |

## Step 2: the model

```viz algo=uml title="Spreadsheet"
class Sheet
  - cells: map<CellId, Cell>
  + set(id: CellId, input: string): void
  + get(id: CellId): Value
  + display(id: CellId): string
class Cell
  - id: CellId
  - input: string
  - formula: Expr
  - value: Value
  - deps: set<CellId>
  - dependents: set<CellId>
interface Expr
  + eval(ctx: Context): Value
class Num
class Ref
class RangeFn
class BinOp
class Parser
  + parse(text: string): Expr
class Value
  - kind: Number | Text | Error
interface CellListener
  + onChanged(id: CellId, v: Value): void
class Recalculator
  + recalc(changed: CellId): void
Sheet *-- Cell
Cell --> Expr
Cell --> Value
Num ..|> Expr
Ref ..|> Expr
RangeFn ..|> Expr
BinOp ..|> Expr
Sheet ..> Parser
Sheet --> Recalculator
Sheet o-- CellListener
BinOp o-- Expr
```

## Step 3: design decisions

- **Two edges per cell**: `deps` (cells this formula reads) and `dependents` (cells that read this one). `set` rewires them: remove old dependency links, add new ones.
- **Recalculation**: when `X` changes, collect the **transitive dependents** of `X`, order them topologically (Kahn's algorithm restricted to the affected subgraph), and evaluate each once. A cell is never evaluated before the cells it reads.
- **Cycle detection**: when setting a formula, check whether the new dependencies can reach the cell itself through `deps` (DFS). A cyclic cell gets the value `#CYCLE!` (and its dependents too), but the sheet stays usable.
- **Values are a small variant**: Number | Text | Error(code). Arithmetic propagates errors (`#DIV/0!` in → `#DIV/0!` out), the typical spreadsheet rule.
- **Formula as an expression tree (Interpreter + Composite)**: `Num`, `Ref(cell)`, `Binary(op)`, `Call(function, args)` with ranges expanded to a list of refs. The tree is built once at `set` time and re-evaluated on recalculation (no reparsing).
- **Listeners** are told of cells whose value changed after the recalculation completes.
- **Cell ids**: parse `A1` to `(col, row)`; store as a normalised string for the map.

## Step 4: the code

```cpp run title="Parsing formulas, dependency graph, ordered recalculation, cycles"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <variant>
#include <vector>
using namespace std;

struct Err { string code; };
using Value = variant<monostate, double, string, Err>;       // empty, number, text, error
string show(const Value& v) {
    if (holds_alternative<monostate>(v)) return "";
    if (auto* d = get_if<double>(&v)) { ostringstream o; o << *d; return o.str(); }
    if (auto* s = get_if<string>(&v)) return *s;
    return get<Err>(v).code;
}
bool operator==(const Value& a, const Value& b) { return show(a) == show(b) && a.index() == b.index(); }

using CellId = string;                                       // "A1"
struct Context { function<Value(const CellId&)> lookup; };

struct Expr { virtual ~Expr() = default; virtual Value eval(const Context& c) const = 0; virtual void refs(set<CellId>& out) const = 0; };
using ExprPtr = unique_ptr<Expr>;

// numeric coercion: empty -> 0, number -> itself, text -> #VALUE!, error -> propagate
optional<double> num(const Value& v, Value& error) {
    if (holds_alternative<monostate>(v)) return 0.0;
    if (auto* d = get_if<double>(&v)) return *d;
    if (holds_alternative<Err>(v)) { error = v; return nullopt; }
    error = Err{"#VALUE!"}; return nullopt;
}

struct Num : Expr { double v; explicit Num(double v) : v(v) {} Value eval(const Context&) const override { return v; } void refs(set<CellId>&) const override {} };
struct Ref : Expr { CellId id; explicit Ref(CellId i) : id(move(i)) {} Value eval(const Context& c) const override { return c.lookup(id); } void refs(set<CellId>& o) const override { o.insert(id); } };
struct Bin : Expr {
    char op; ExprPtr l, r;
    Bin(char o, ExprPtr a, ExprPtr b) : op(o), l(move(a)), r(move(b)) {}
    Value eval(const Context& c) const override {
        Value err; auto a = num(l->eval(c), err); if (!a) return err;
        auto b = num(r->eval(c), err); if (!b) return err;
        switch (op) { case '+': return *a + *b; case '-': return *a - *b; case '*': return *a * *b; default: if (*b == 0) return Err{"#DIV/0!"}; return *a / *b; }
    }
    void refs(set<CellId>& o) const override { l->refs(o); r->refs(o); }
};
struct Fn : Expr {                                           // SUM/AVG/MIN/MAX/COUNT over refs (ranges are expanded at parse time)
    string name; vector<ExprPtr> args;
    Fn(string n, vector<ExprPtr> a) : name(move(n)), args(move(a)) {}
    Value eval(const Context& c) const override {
        vector<double> xs;
        for (auto& a : args) {
            Value v = a->eval(c);
            if (holds_alternative<Err>(v)) return v;                                 // errors propagate
            if (auto* d = get_if<double>(&v)) xs.push_back(*d);                      // text and empty cells are skipped, like Excel
        }
        if (name == "COUNT") return static_cast<double>(xs.size());
        if (name == "SUM") { double s = 0; for (double x : xs) s += x; return s; }
        if (xs.empty()) return name == "AVG" ? Value(Err{"#DIV/0!"}) : Value(0.0);
        if (name == "AVG") { double s = 0; for (double x : xs) s += x; return s / xs.size(); }
        if (name == "MIN") return *min_element(xs.begin(), xs.end());
        if (name == "MAX") return *max_element(xs.begin(), xs.end());
        return Err{"#NAME?"};
    }
    void refs(set<CellId>& o) const override { for (auto& a : args) a->refs(o); }
};

// "A1" -> (col, row)
bool parseCell(const string& s, int& col, int& row) {
    size_t i = 0; col = 0;
    while (i < s.size() && isalpha(static_cast<unsigned char>(s[i]))) col = col * 26 + (toupper(s[i++]) - 'A' + 1);
    if (i == 0 || i == s.size()) return false;
    for (size_t j = i; j < s.size(); ++j) if (!isdigit(static_cast<unsigned char>(s[j]))) return false;
    row = stoi(s.substr(i)); return true;
}
string cellName(int col, int row) { string c; for (int x = col; x > 0; x = (x - 1) / 26) c = char('A' + (x - 1) % 26) + c; return c + to_string(row); }

class Parser {
    string s_; size_t p_ = 0;
    void ws() { while (p_ < s_.size() && isspace(static_cast<unsigned char>(s_[p_]))) ++p_; }
    bool eat(char c) { ws(); if (p_ < s_.size() && s_[p_] == c) { ++p_; return true; } return false; }
    ExprPtr expr() { ExprPtr l = term(); for (;;) { if (eat('+')) l = make_unique<Bin>('+', move(l), term()); else if (eat('-')) l = make_unique<Bin>('-', move(l), term()); else return l; } }
    ExprPtr term() { ExprPtr l = factor(); for (;;) { if (eat('*')) l = make_unique<Bin>('*', move(l), factor()); else if (eat('/')) l = make_unique<Bin>('/', move(l), factor()); else return l; } }
    ExprPtr factor() {
        ws();
        if (eat('(')) { ExprPtr e = expr(); if (!eat(')')) throw runtime_error("missing )"); return e; }
        if (eat('-')) return make_unique<Bin>('-', make_unique<Num>(0), factor());
        if (p_ < s_.size() && (isdigit(static_cast<unsigned char>(s_[p_])) || s_[p_] == '.')) { size_t n; double v = stod(s_.substr(p_), &n); p_ += n; return make_unique<Num>(v); }
        string word; while (p_ < s_.size() && (isalnum(static_cast<unsigned char>(s_[p_])))) word += static_cast<char>(toupper(s_[p_++]));
        if (word.empty()) throw runtime_error("unexpected input");
        if (eat('(')) {                                      // function call
            vector<ExprPtr> args;
            if (!eat(')')) {
                do {
                    ws(); size_t save = p_; string a; while (p_ < s_.size() && isalnum(static_cast<unsigned char>(s_[p_]))) a += static_cast<char>(toupper(s_[p_++]));
                    if (eat(':')) {                          // a range: expand to all cells in the rectangle
                        string b; while (p_ < s_.size() && isalnum(static_cast<unsigned char>(s_[p_]))) b += static_cast<char>(toupper(s_[p_++]));
                        int c1, r1, c2, r2; if (!parseCell(a, c1, r1) || !parseCell(b, c2, r2)) throw runtime_error("bad range");
                        for (int c = min(c1, c2); c <= max(c1, c2); ++c) for (int r = min(r1, r2); r <= max(r1, r2); ++r) args.push_back(make_unique<Ref>(cellName(c, r)));
                    } else { p_ = save; args.push_back(expr()); }
                } while (eat(','));
                if (!eat(')')) throw runtime_error("missing ) after arguments");
            }
            if (word != "SUM" && word != "AVG" && word != "MIN" && word != "MAX" && word != "COUNT") throw runtime_error("unknown function " + word);
            return make_unique<Fn>(word, move(args));
        }
        int c, r; if (!parseCell(word, c, r)) throw runtime_error("bad cell reference " + word);
        return make_unique<Ref>(word);
    }
public:
    static ExprPtr parse(const string& formula) { Parser p; p.s_ = formula; ExprPtr e = p.expr(); p.ws(); if (p.p_ != p.s_.size()) throw runtime_error("unexpected trailing input"); return e; }
};

struct CellListener { virtual ~CellListener() = default; virtual void onChanged(const CellId& id, const Value& v) = 0; };

class Sheet {
    struct Cell { string input; ExprPtr formula; Value value; set<CellId> deps, dependents; };
    map<CellId, Cell> cells_;
    vector<CellListener*> listeners_;
    int evaluations_ = 0;

    bool reaches(const CellId& from, const CellId& target, std::set<CellId>& seen) const {           // can `from` reach `target` through dependencies?
        if (from == target) return true;
        if (!seen.insert(from).second) return false;
        auto it = cells_.find(from);
        if (it == cells_.end()) return false;
        for (auto& d : it->second.deps) if (reaches(d, target, seen)) return true;
        return false;
    }
    void unlink(const CellId& id) { for (auto& d : cells_[id].deps) cells_[d].dependents.erase(id); cells_[id].deps.clear(); }
public:
    void listen(CellListener* l) { listeners_.push_back(l); }
    int evaluations() const { return evaluations_; }
    Value get(const CellId& id) const { auto it = cells_.find(id); return it == cells_.end() ? Value{} : it->second.value; }

    void set(const CellId& id, const string& input) {
        Cell& c = cells_[id];
        unlink(id);
        c.input = input; c.formula.reset();
        if (!input.empty() && input[0] == '=') {
            try {
                c.formula = Parser::parse(input.substr(1));
                std::set<CellId> deps; c.formula->refs(deps);
                for (auto& d : deps) { cells_[d].dependents.insert(id); c.deps.insert(d); }          // rewire the graph (cells_[d] creates empty cells)
            } catch (const exception&) { c.value = Err{"#ERROR!"}; notify(id); recalcDependentsOf(id); return; }
        } else {
            char* end = nullptr; double d = strtod(input.c_str(), &end);
            c.value = input.empty() ? Value{} : (*end == 0 ? Value(d) : Value(input));
        }
        recalcFrom(id);
    }
    string display(const CellId& id) const { return show(get(id)); }
private:
    void notify(const CellId& id) { for (auto* l : listeners_) l->onChanged(id, cells_[id].value); }
    void recalcDependentsOf(const CellId& id) { recalcFrom(id, false); }

    void recalcFrom(const CellId& start, bool includeStart = true) {
        // 1) the affected subgraph: start and everything that depends on it, transitively
        std::set<CellId> affected; vector<CellId> stack{start};
        while (!stack.empty()) { CellId x = stack.back(); stack.pop_back(); if (!affected.insert(x).second) continue; for (auto& d : cells_[x].dependents) stack.push_back(d); }
        // 2) topological order within the subgraph (Kahn): a cell is ready when none of its deps is still pending
        map<CellId, int> pending;
        for (auto& x : affected) { int n = 0; for (auto& d : cells_[x].deps) if (affected.count(d)) ++n; pending[x] = n; }
        vector<CellId> ready, order;
        for (auto& [x, n] : pending) if (n == 0) ready.push_back(x);
        while (!ready.empty()) {
            CellId x = ready.back(); ready.pop_back(); order.push_back(x);
            for (auto& d : cells_[x].dependents) if (affected.count(d) && --pending[d] == 0) ready.push_back(d);
        }
        // 3) anything not in `order` is on a cycle (or depends on one)
        std::set<CellId> inOrder(order.begin(), order.end());
        for (auto& x : affected) if (!inOrder.count(x)) { Value old = cells_[x].value; cells_[x].value = Err{"#CYCLE!"}; if (!(old == cells_[x].value)) notify(x); }
        // 4) evaluate each affected cell exactly once, in order
        Context ctx{[this](const CellId& id) { auto it = cells_.find(id); return it == cells_.end() ? Value{} : it->second.value; }};
        for (auto& x : order) {
            Cell& c = cells_[x];
            Value old = c.value;
            if (c.formula) { ++evaluations_; c.value = c.formula->eval(ctx); }
            if ((x != start || includeStart) && !(old == c.value)) notify(x);
            else if (x == start && includeStart && !(old == c.value)) notify(x);
        }
    }
};

struct Printer : CellListener { vector<string> log; void onChanged(const CellId& id, const Value& v) override { log.push_back(id + "=" + show(v)); } };

int main() {
    Sheet s; Printer p; s.listen(&p);
    s.set("A1", "10"); s.set("A2", "20"); s.set("A3", "30");
    s.set("B1", "=A1*2"); s.set("B2", "=B1+A2");
    s.set("C1", "=SUM(A1:A3)"); s.set("C2", "=AVG(A1:A3)+B2");
    cout << "B1=" << s.display("B1") << " B2=" << s.display("B2") << " C1=" << s.display("C1") << " C2=" << s.display("C2") << "\n";

    cout << "change A1 to 100: only the dependents are recalculated, each once, in a valid order\n";
    int before = s.evaluations(); p.log.clear();
    s.set("A1", "100");
    cout << "  changed cells:"; for (auto& e : p.log) cout << " " << e; cout << "\n";
    cout << "  formulas evaluated: " << s.evaluations() - before << " (B1, B2, C1, C2: not the whole sheet)\n";

    cout << "errors propagate:\n";
    s.set("D1", "=A1/0"); s.set("D2", "=D1+1"); s.set("D3", "=SUM(D1:D2)");
    cout << "  D1=" << s.display("D1") << " D2=" << s.display("D2") << " D3=" << s.display("D3") << "\n";
    s.set("A4", "hello"); s.set("D4", "=A4+1");
    cout << "  text in arithmetic: D4=" << s.display("D4") << ", but SUM skips text: " << (s.set("D5", "=SUM(A1:A4)"), s.display("D5")) << "\n";
    s.set("D6", "=FOO(1)"); cout << "  unknown function: D6=" << s.display("D6") << "\n";

    cout << "circular references:\n";
    s.set("E1", "=E2+1"); s.set("E2", "=E3+1"); s.set("E3", "=E1+1");
    cout << "  E1=" << s.display("E1") << " E2=" << s.display("E2") << " E3=" << s.display("E3") << "\n";
    s.set("E3", "5");
    cout << "  after breaking the cycle (E3=5): E1=" << s.display("E1") << " E2=" << s.display("E2") << " E3=" << s.display("E3") << "\n";

    cout << "formula rewiring: B1 stops depending on A1\n";
    s.set("B1", "=7");
    before = s.evaluations(); s.set("A1", "1");
    cout << "  changing A1 re-evaluates " << s.evaluations() - before << " formulas (C1, C2 and the D cells that read A1, but no longer B1); B1=" << s.display("B1") << " B2=" << s.display("B2") << "\n";
}
```

## Why topological order matters

If `C2 = B2 + A1` and `B2 = A1 + 1`, evaluating `C2` before `B2` uses a **stale** value of `B2`. Kahn's algorithm guarantees each cell is evaluated only after every affected cell it reads. A cell evaluated once (not once per dependency path) avoids exponential recomputation in diamond-shaped dependencies.

## Edge cases

| Case | Handling |
|---|---|
| Self reference `A1 = A1 + 1` | a cycle: `#CYCLE!` |
| Reference to an empty cell | treated as 0 (number) or skipped (functions) |
| Deleting a referenced cell | the dependents see an empty value and recalculate |
| Formula parse error | `#ERROR!` in that cell; dependents recalculate |
| Very large ranges (`SUM(A1:Z100000)`) | store ranges as nodes (`RangeRef`) instead of expanding to thousands of `Ref`s; keep a 2D index |
| Many cells changed at once (paste) | batch: build the union of affected cells, one topological pass |
| Volatile functions (`NOW()`, `RAND()`) | mark cells volatile; recalculate on every pass |
| Floating-point display | format with a significant-digit policy |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Copy/paste with relative references" | formulas store references as (col offset, row offset) relative to the cell; paste shifts them (a `Reference` value type with an `absolute` flag) |
| "More functions (IF, VLOOKUP, string functions)" | a **function registry** (name → implementation) instead of hard-coded names |
| "Insert/delete rows and columns" | rewrite references (a visitor over expression trees) |
| "Undo/redo" | the Command pattern over `set` operations (see the text editor lesson) |
| "Multiple sheets, cross-sheet references" | `Sheet!A1` references; a `Workbook` owning sheets; the graph spans sheets |
| "Incremental, concurrent recalculation" | independent branches of the DAG can evaluate in parallel after the topological layering |
| "Persistence" | serialise inputs, not values; recompute on load |
| "Collaboration" | operations over cell ids merged with CRDT-style last-writer-wins registers |

```quiz
? Why keep both dependencies and dependents for each cell?
- Memory is cheap
+ Dependencies let you check cycles and rewire; dependents let you find what to recalculate when a cell changes
- Excel does it
> The two directions serve different traversals of the DAG.
? How is a circular reference detected?
- By running the formulas until they overflow
+ In the affected subgraph a topological sort cannot order the cells on a cycle, so they remain unordered and get #CYCLE!
- It cannot be detected
> Kahn's algorithm leaves cycle members with non-zero pending counts.
```

:::keypoints
- Cells form a DAG: store deps and dependents; recalc the affected subgraph once each in topological (Kahn) order.
- Formulas are expression trees (Interpreter); values are Number|Text|Error with error propagation; cycles give `#CYCLE!`.
- Listeners get changed cells; extend with a function registry, relative references, undo, batching and parallel layers.
:::
