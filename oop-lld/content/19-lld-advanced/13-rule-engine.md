---
title: Design a Rule Engine
level: advanced
time: 75
summary: Business rules kept as data and checked against facts. Learn conditions you can combine, a small text language for rules, priorities, repeating until nothing new happens (forward chaining), protection from endless loops, explanations of what fired, and swapping rules without a restart.
---

:::problem Design a Rule Engine {level=hard tags="Specification,Interpreter,Strategy,forward chaining,DSL,business rules"}
Design a rule engine that business users can set up without a new release of the code. Rules have a **condition** and **actions**. For example: `WHEN age >= 18 AND score > 700 THEN approve, limit = 50000`. Given some facts (a customer's data), the engine decides which rules apply, runs their actions (which may create new facts that start other rules), settles clashes by priority, avoids endless loops, and explains what happened.
:::

:::hint Hint
Rules are **data**: a tree of conditions (Specification and Interpreter) and a list of actions. The engine repeatedly picks the rules that apply (the **agenda**), chooses one by priority (**conflict resolution**), fires it, and checks again, until nothing new happens (**forward chaining**). Keep a record of what fired, for the explanation.
:::

## What is a rule engine, in simple words?

Think of a bank officer's checklist: "If the person is over 18 and has a good credit score, they are eligible. If they are eligible and earn a lot, give a high limit." A rule engine is a program that holds such rules **as data**, so you can change the rules without changing the code.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Facts? | a map from name to value (number, string, bool) |
| Conditions? | comparisons (`==, !=, <, <=, >, >=`), `AND`, `OR`, `NOT`, brackets. The two sides are fact names or plain values |
| Actions? | `set name = value` (create or change a fact), `tag "text"` (write down a decision) |
| Priority? | a higher `salience` fires first. Ties are broken by the order they were written |
| Chaining? | firing a rule can change facts, so other rules may now apply. Repeat until no rule applies |
| Loops? | each rule fires at most once in a run (refraction) unless it is marked `repeatable`. Plus a limit on the number of firings |
| Where do rules come from? | written in a small text language, loaded while running, and replaceable without a restart |
| Explanation? | a list of the rules that fired, in order, with the facts that changed |
| Not needed | the RETE speed-up, a screen to write rules, rules about time |

## Step 2: How forward chaining works

```text
facts:   age=25  score=720  income=60000

R1 [salience 10]  WHEN age >= 18 AND score > 700         THEN set eligible = true
R2 [salience 5]   WHEN eligible == true AND income > 50000 THEN set limit = 100000, tag "premium"
R3 [salience 1]   WHEN eligible == true                    THEN tag "send welcome email"

cycle 1: applicable = {R1}                       fire R1  → eligible = true
cycle 2: applicable = {R2, R3} (R2 first)        fire R2  → limit, tag
cycle 3: applicable = {R3}                       fire R3  → tag
cycle 4: applicable = {} (all refracted)         stop
```

R2 became possible only because R1 created a new fact. This is **chaining**.

## Step 3: Find the classes

```viz algo=uml title="Rule engine"
class RuleEngine
  + load(source: string): void
  + run(facts: Facts): RunResult
class Rule
  - name: string
  - salience: int
  - condition: Condition
  - actions: Action[]
  - repeatable: bool
interface Condition
  + eval(f: Facts): bool
class Compare
class And
class Or
class Not
interface Action
  + apply(f: Facts): string
class SetFact
class AddTag
class Facts
  - values: map<string, Value>
  + get(name: string): Value
  + set(name: string, v: Value): void
class RuleParser
  + parse(text: string): Rule[]
interface ConflictResolution
  + pick(agenda: Rule[]): Rule
class BySalience
class RunResult
  - fired: Firing[]
  - tags: string[]
RuleEngine --> Rule
RuleEngine --> Facts
RuleEngine ..> RuleParser
RuleEngine --> ConflictResolution
Rule --> Condition
Rule --> Action
Compare ..|> Condition
And ..|> Condition
Or ..|> Condition
Not ..|> Condition
SetFact ..|> Action
AddTag ..|> Action
BySalience ..|> ConflictResolution
```

## Step 4: Design decisions

- **A condition tree = Specification and Interpreter:** `Compare` (a leaf), `And`, `Or`, `Not` (nodes with children), all with `eval(Facts)`. A **parser** builds them from the text, so the rules are data.
- **Values** are a variant (double, string, bool). A missing fact makes a comparison **false** (on purpose: a rule cannot fire on data we do not know).
- **Actions** are commands with `apply(Facts)`. They return a short description for the explanation.
- **The engine loop** (recognise, then act): work out the **agenda** (rules that have not fired and whose condition holds), choose one with a `ConflictResolution` (a Strategy: by salience, then by order written. Other ways: most specific, random, round-robin), fire it, and repeat.
- **Refraction:** a rule fires at most once in a run (kept in a set). This stops endless loops from rules that make themselves true again. `repeatable` rules may fire again if the facts they use changed (an extension: keep a change stamp). A global `maxFirings` limit stops runaway rule sets.
- **Explanation:** each `Firing` records the rule name and what its actions did.
- **Hot reload:** `load` parses into a new rule list and swaps it in at once (under a lock). Runs use a snapshot, so runs in progress are not affected.
- **Checks when loading:** syntax errors are reported with the line, unknown actions are refused, and repeated rule names are refused.

## Step 5: The code

```cpp run title="A rule DSL, forward chaining, priorities and explanations"
#include <algorithm>
#include <cctype>
#include <cstring>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <variant>
#include <vector>
using namespace std;

using Value = variant<double, string, bool>;
string show(const Value& v) { if (auto* d = get_if<double>(&v)) { ostringstream o; o << *d; return o.str(); } if (auto* s = get_if<string>(&v)) return "\"" + *s + "\""; return get<bool>(v) ? "true" : "false"; }

class Facts {
    map<string, Value> v_;
public:
    void set(const string& k, Value val) { v_[k] = move(val); }
    const Value* get(const string& k) const { auto it = v_.find(k); return it == v_.end() ? nullptr : &it->second; }
    string dump() const { string s; for (auto& [k, val] : v_) s += k + "=" + show(val) + " "; return s; }
};

// ---------- conditions (Specification / Interpreter) ----------
struct Condition { virtual ~Condition() = default; virtual bool eval(const Facts& f) const = 0; };
using CondPtr = unique_ptr<Condition>;

// an operand is a literal or a fact name
struct Operand { bool isFact; Value literal; string name; Value resolve(const Facts& f, bool& ok) const { if (!isFact) { ok = true; return literal; } const Value* v = f.get(name); ok = v != nullptr; return v ? *v : Value(false); } };

struct Compare : Condition {
    Operand l, r; string op;
    Compare(Operand a, string o, Operand b) : l(move(a)), r(move(b)), op(move(o)) {}
    bool eval(const Facts& f) const override {
        bool ok1, ok2; Value a = l.resolve(f, ok1), b = r.resolve(f, ok2);
        if (!ok1 || !ok2) return false;                                   // unknown facts never satisfy a comparison
        if (a.index() != b.index()) return false;
        auto cmp = [&](auto x, auto y) { return op == "==" ? x == y : op == "!=" ? x != y : op == "<" ? x < y : op == "<=" ? x <= y : op == ">" ? x > y : x >= y; };
        if (auto* x = get_if<double>(&a)) return cmp(*x, get<double>(b));
        if (auto* x = get_if<string>(&a)) return cmp(*x, get<string>(b));
        return cmp(get<bool>(a), get<bool>(b));
    }
};
struct And : Condition { CondPtr a, b; And(CondPtr x, CondPtr y) : a(move(x)), b(move(y)) {} bool eval(const Facts& f) const override { return a->eval(f) && b->eval(f); } };
struct Or : Condition { CondPtr a, b; Or(CondPtr x, CondPtr y) : a(move(x)), b(move(y)) {} bool eval(const Facts& f) const override { return a->eval(f) || b->eval(f); } };
struct Not : Condition { CondPtr a; explicit Not(CondPtr x) : a(move(x)) {} bool eval(const Facts& f) const override { return !a->eval(f); } };

// ---------- actions (commands) ----------
struct Action { virtual ~Action() = default; virtual string apply(Facts& f, vector<string>& tags) const = 0; };
struct SetFact : Action { string name; Value value; SetFact(string n, Value v) : name(move(n)), value(move(v)) {} string apply(Facts& f, vector<string>&) const override { f.set(name, value); return "set " + name + " = " + show(value); } };
struct AddTag : Action { string text; explicit AddTag(string t) : text(move(t)) {} string apply(Facts&, vector<string>& tags) const override { tags.push_back(text); return "tag \"" + text + "\""; } };

struct Rule { string name; int salience = 0; CondPtr when; vector<unique_ptr<Action>> then; };

// ---------- the DSL parser ----------
class RuleParser {
    string s_; size_t p_ = 0; int line_ = 1;
    void ws() { while (p_ < s_.size() && isspace(static_cast<unsigned char>(s_[p_]))) ++p_; }
    bool peekWord(const string& w) { ws(); if (s_.compare(p_, w.size(), w) != 0) return false; size_t e = p_ + w.size(); return e >= s_.size() || !isalnum(static_cast<unsigned char>(s_[e])); }
    bool eatWord(const string& w) { if (!peekWord(w)) return false; p_ += w.size(); return true; }
    void expectWord(const string& w) { if (!eatWord(w)) throw runtime_error("expected '" + w + "' near: " + s_.substr(p_, 20)); }
    string ident() { ws(); size_t b = p_; while (p_ < s_.size() && (isalnum(static_cast<unsigned char>(s_[p_])) || s_[p_] == '_')) ++p_; if (b == p_) throw runtime_error("expected a name near: " + s_.substr(p_, 20)); return s_.substr(b, p_ - b); }
    Operand operand() {
        ws();
        if (p_ < s_.size() && s_[p_] == '"') { size_t e = s_.find('"', p_ + 1); string t = s_.substr(p_ + 1, e - p_ - 1); p_ = e + 1; return {false, Value(t), ""}; }
        if (p_ < s_.size() && (isdigit(static_cast<unsigned char>(s_[p_])) || s_[p_] == '-')) { size_t n; double d = stod(s_.substr(p_), &n); p_ += n; return {false, Value(d), ""}; }
        string id = ident(); if (id == "true") return {false, Value(true), ""}; if (id == "false") return {false, Value(false), ""};
        return {true, Value(false), id};
    }
    string compOp() { ws(); for (const char* op : {"==", "!=", "<=", ">=", "<", ">"}) if (s_.compare(p_, strlen(op), op) == 0) { p_ += strlen(op); return op; } throw runtime_error("expected a comparison near: " + s_.substr(p_, 20)); }
    CondPtr orExpr() { CondPtr l = andExpr(); while (eatWord("OR")) l = make_unique<Or>(move(l), andExpr()); return l; }
    CondPtr andExpr() { CondPtr l = notExpr(); while (eatWord("AND")) l = make_unique<And>(move(l), notExpr()); return l; }
    CondPtr notExpr() { if (eatWord("NOT")) return make_unique<Not>(notExpr()); ws(); if (p_ < s_.size() && s_[p_] == '(') { ++p_; CondPtr c = orExpr(); ws(); if (s_[p_] != ')') throw runtime_error("missing )"); ++p_; return c; } Operand a = operand(); string op = compOp(); Operand b = operand(); return make_unique<Compare>(a, op, b); }
    unique_ptr<Action> action() {
        if (eatWord("tag")) { Operand t = operand(); return make_unique<AddTag>(get<string>(t.literal)); }
        string name = ident(); ws(); if (s_[p_] != '=') throw runtime_error("expected '=' after " + name); ++p_;
        Operand v = operand(); if (v.isFact) throw runtime_error("actions assign literals only"); return make_unique<SetFact>(name, v.literal);
    }
public:
    static vector<Rule> parse(const string& text) {
        RuleParser P; P.s_ = text; vector<Rule> rules; set<string> names;
        for (;;) {
            P.ws(); if (P.p_ >= P.s_.size()) break;
            P.expectWord("rule"); Rule r; r.name = P.ident();
            if (!names.insert(r.name).second) throw runtime_error("duplicate rule " + r.name);
            if (P.eatWord("salience")) { P.ws(); size_t n; r.salience = stoi(P.s_.substr(P.p_), &n); P.p_ += n; }
            P.expectWord("when"); r.when = P.orExpr();
            P.expectWord("then"); r.then.push_back(P.action());
            for (P.ws(); P.p_ < P.s_.size() && P.s_[P.p_] == ','; P.ws()) { ++P.p_; r.then.push_back(P.action()); }
            rules.push_back(move(r));
        }
        return rules;
    }
};

struct Firing { string rule; vector<string> effects; };
struct RunResult { vector<Firing> fired; vector<string> tags; Facts facts; };

class RuleEngine {
    shared_ptr<vector<Rule>> rules_ = make_shared<vector<Rule>>();
    mutable mutex m_; int maxFirings_ = 100;
public:
    void load(const string& text) { auto parsed = make_shared<vector<Rule>>(RuleParser::parse(text)); lock_guard l(m_); rules_ = parsed; }      // parse first, swap atomically: a bad file never replaces good rules
    RunResult run(Facts facts) const {
        shared_ptr<vector<Rule>> rules; { lock_guard l(m_); rules = rules_; }                      // a snapshot for this run
        RunResult res; set<size_t> fired;
        for (int cycle = 0; cycle < maxFirings_; ++cycle) {
            vector<size_t> agenda;                                                                  // rules whose condition holds and that have not fired (refraction)
            for (size_t i = 0; i < rules->size(); ++i) if (!fired.count(i) && (*rules)[i].when->eval(facts)) agenda.push_back(i);
            if (agenda.empty()) break;
            size_t pick = *min_element(agenda.begin(), agenda.end(), [&](size_t a, size_t b) { int sa = (*rules)[a].salience, sb = (*rules)[b].salience; return sa != sb ? sa > sb : a < b; });   // conflict resolution
            fired.insert(pick);
            Firing f{(*rules)[pick].name, {}};
            for (auto& a : (*rules)[pick].then) f.effects.push_back(a->apply(facts, res.tags));
            res.fired.push_back(move(f));
        }
        res.facts = move(facts);
        return res;
    }
};

void printRun(const RunResult& r) {
    int i = 1;
    for (auto& f : r.fired) { cout << "    " << i++ << ". " << f.rule << ":"; for (auto& e : f.effects) cout << " [" << e << "]"; cout << "\n"; }
    if (r.fired.empty()) cout << "    (no rule fired)\n";
    cout << "    final facts: " << r.facts.dump() << "\n";
}

int main() {
    const string loanRules = R"(
rule basic_eligibility salience 10
  when age >= 18 AND score > 700
  then eligible = true

rule premium salience 5
  when eligible == true AND income > 50000
  then limit = 100000, tag "premium customer"

rule standard salience 4
  when eligible == true AND NOT (income > 50000)
  then limit = 25000

rule welcome salience 1
  when eligible == true
  then tag "send welcome email"

rule reject salience 20
  when age < 18 OR score < 500
  then eligible = false, tag "rejected"
)";
    RuleEngine engine; engine.load(loanRules);

    auto person = [](double age, double score, double income) { Facts f; f.set("age", age); f.set("score", score); f.set("income", income); return f; };
    cout << "applicant A (25, 720, 60000): chaining basic_eligibility -> premium -> welcome\n";
    printRun(engine.run(person(25, 720, 60000)));
    cout << "applicant B (30, 750, 30000): the 'standard' rule applies instead of 'premium'\n";
    printRun(engine.run(person(30, 750, 30000)));
    cout << "applicant C (17, 800, 90000): the high-salience 'reject' rule fires first\n";
    printRun(engine.run(person(17, 800, 90000)));
    cout << "applicant D (40, 600, 90000): no rule applies (score too low for eligibility, not low enough to reject)\n";
    printRun(engine.run(person(40, 600, 90000)));
    cout << "applicant E: missing facts never satisfy a condition\n";
    { Facts f; f.set("age", 30.0); printRun(engine.run(f)); }

    cout << "hot reload: a bad rule file is rejected and the previous rules stay active\n";
    try { engine.load("rule broken when age >>> 3 then x = 1"); } catch (const exception& e) { cout << "    load failed: " << e.what() << "\n"; }
    printRun(engine.run(person(25, 720, 60000)));
    cout << "hot reload with a stricter score threshold:\n";
    engine.load("rule basic salience 10 when age >= 18 AND score > 800 then eligible = true\nrule welcome when eligible == true then tag \"hello\"");
    printRun(engine.run(person(25, 720, 60000)));
}
```

## Design trade-offs

| Choice | Good | Not so good / other ways |
|---|---|---|
| **Check every rule in each cycle** (this design) | simple, clearly correct | O(rules × cycles). Fine for hundreds of rules |
| **RETE network** | checks only what a changed fact affects. Scales to thousands of rules | complex. Uses memory for partial matches |
| **Refraction (fire once)** | guarantees the engine stops | rules that should fire again after changes need extra support |
| **Salience** (a number for priority) | clear and simple | the numbers become fragile. Other ways: groups or phases, most specific first |
| **Rules as text** | business users can edit them | needs checks, versions and testing tools |
| **Rules in C++ code (lambdas)** | fast, type-safe | needs a new release. The text language gives hot reload |

## Edge cases

| Case | What happens |
|---|---|
| Rules that disagree (approve and reject) | priority decides. The explanation shows both. A checker can warn about opposite actions on the same fact |
| Endless loops (`A` sets x, `B` resets x, again and again) | refraction and `maxFirings` |
| Wrong types (`age > "ten"`) | the comparison is false (or refuse at load time with a type checker) |
| Missing facts | the comparison is false. An `exists(name)` operator could test for presence |
| Equal decimals | use a small tolerance, or use integers for money |
| Rules that depend on order | prefer priorities and phases over hidden order |
| Many runs at the same time | each run uses its own copy of `Facts` and a snapshot of the rules, so nothing is shared and changing |
| Audit | save the list of fired rules with the decision (a rule in lending) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Groups or phases of rules (check, then score, then decide)" | an agenda for each group. Groups run one after another |
| "Versions of rules and a slow roll-out" | rule sets with a version. Send a share of traffic to the new set |
| "Testing rules" | a table of (facts, expected tags) run in CI. A "what if" simulation |
| "Rules that call other services (a credit bureau)" | actions or facts come through a `FactProvider` interface, with caching |
| "Rules about time (3 failed logins in 10 minutes)" | counts over a window kept by event processors |
| "Speed" | compile conditions to bytecode. Index rules by the fact names they read (a simple RETE) |
| "A screen to explain" | show, for each fired rule, the real values of the facts in its condition |
| "Fuzzy or ML conditions" | a `Condition` that calls a model and compares the score with a limit |

## Short answer to say in an interview

:::interview How does a rule engine work, and how do you stop endless loops?
"Rules are data: a condition tree and a list of actions, built by a parser from a small text language. The engine repeats a cycle. It finds the rules whose condition holds and that have not fired yet, which is the agenda. It picks one by priority, fires it, and checks again, because the action may have created new facts. That is forward chaining. To stop loops, each rule fires at most once in a run, which is called refraction, and there is also a global limit on firings. I record each firing so I can explain the decision, and I swap rules in by parsing first and replacing the list in one step."
:::

```quiz
? What does forward chaining mean?
- Rules are sorted alphabetically
+ Firing a rule can create or change facts that make other rules apply, and this repeats until nothing new fires
- Facts are copied forward
> The cycle repeats: find rules, pick one, fire it.
? Why does a rule fire at most once in a run (refraction)?
- To save memory
+ It stops endless loops where a rule keeps making itself true again
- Rules cannot change facts
> Together with a limit on firings, it guarantees the engine stops.
```

:::keypoints
- Rules are data: a tree of conditions (Specification and Interpreter, built by a parser) plus actions (commands).
- The engine = agenda, then conflict resolution (salience), then fire, then repeat. Refraction and limits make it stop. Chaining happens through changed facts.
- Hot reload by parsing first and swapping at once. Explanations come from the firing log. RETE is the way to scale.
:::
