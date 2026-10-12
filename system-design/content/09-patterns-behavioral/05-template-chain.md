---
title: Template Method and Chain of Responsibility
level: intermediate
time: 45
summary: Template Method — a fixed algorithm skeleton with overridable steps and hooks (a data-import pipeline) — and Chain of Responsibility — passing a request along a chain of handlers until one deals with it (request middleware, support escalation, an ATM dispensing notes, a leveled logger), in C++ and JavaScript.
---

## Template Method

:::def Template Method
Defines the **skeleton of an algorithm** in a base-class method, deferring some **steps** to subclasses. Subclasses override the steps without changing the algorithm's overall structure. Optional steps with default behaviour are called **hooks**.
:::

**Problem:** importing data from CSV, JSON and an XML partner feed. Every import does the same dance: open the source, parse records, validate each one, transform, save, and write a report. Only **parsing** differs between formats. Copying the dance into three importers duplicates the logic (and the bugs).

```viz algo=uml title="Template Method"
abstract class DataImporter
  + run(source): Report  «template method, final»
  # parse(source): Record[]  «abstract step»
  # validate(r: Record): bool  «hook with default»
  # transform(r: Record): Record  «hook with default»
  - save(records)
class CsvImporter
  # parse(source): Record[]
class JsonImporter
  # parse(source): Record[]
  # validate(r: Record): bool
CsvImporter --|> DataImporter
JsonImporter --|> DataImporter
```

:::tabs A data importer with Template Method
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Record { string name; int age; };

class DataImporter {
public:
    virtual ~DataImporter() = default;
    // The template method: the fixed skeleton. Not virtual, so subclasses can't reorder it.
    string run(const string& source) {
        auto records = parse(source);                         // step (varies)
        int saved = 0, rejected = 0;
        for (auto& r : records) {
            if (!validate(r)) { rejected++; continue; }       // hook (default provided)
            save(transform(r));                               // hook + fixed step
            saved++;
        }
        return format() + ": saved " + to_string(saved) + ", rejected " + to_string(rejected);
    }
protected:
    virtual vector<Record> parse(const string& source) = 0;   // abstract step
    virtual string format() const = 0;
    virtual bool validate(const Record& r) const { return !r.name.empty() && r.age > 0; }   // hooks
    virtual Record transform(Record r) const { return r; }
private:
    void save(const Record& r) { cout << "    saved " << r.name << " (" << r.age << ")\n"; }   // fixed step
};

class CsvImporter : public DataImporter {
protected:
    string format() const override { return "CSV"; }
    vector<Record> parse(const string& src) override {        // "name,age;name,age"
        vector<Record> out;
        stringstream rows(src);
        string row;
        while (getline(rows, row, ';')) {
            auto comma = row.find(',');
            out.push_back({row.substr(0, comma), stoi(row.substr(comma + 1))});
        }
        return out;
    }
    Record transform(Record r) const override { if (!r.name.empty()) r.name[0] = toupper(r.name[0]); return r; }   // capitalise
};

class LegacyFixedWidthImporter : public DataImporter {        // a different format, same skeleton
protected:
    string format() const override { return "fixed-width"; }
    vector<Record> parse(const string& src) override {        // 8 chars name + 3 chars age per record
        vector<Record> out;
        for (size_t i = 0; i + 11 <= src.size(); i += 11) {
            string name = src.substr(i, 8);
            name.erase(name.find_last_not_of(' ') + 1);
            out.push_back({name, stoi(src.substr(i + 8, 3))});
        }
        return out;
    }
    bool validate(const Record& r) const override { return DataImporter::validate(r) && r.age < 120; }   // stricter hook
};

int main() {
    CsvImporter csv;
    cout << "  " << csv.run("asha,31;bilal,0;chen,45") << "\n";
    LegacyFixedWidthImporter fixedWidth;
    cout << "  " << fixedWidth.run("DARA    029ELI     150FARAH   033") << "\n";
}
```
```js run
class DataImporter {
  // The template method: the fixed skeleton
  run(source) {
    const records = this.parse(source);                         // step (varies)
    let saved = 0, rejected = 0;
    for (const r of records) {
      if (!this.validate(r)) { rejected++; continue; }          // hook (default provided)
      this.#save(this.transform(r));                            // hook + fixed step
      saved++;
    }
    return `${this.format}: saved ${saved}, rejected ${rejected}`;
  }
  parse() { throw new Error(`${this.constructor.name} must implement parse()`); }   // abstract step
  validate(r) { return Boolean(r.name) && r.age > 0; }                             // hooks
  transform(r) { return r; }
  #save(r) { console.log(`    saved ${r.name} (${r.age})`); }                       // fixed, private step
}

class CsvImporter extends DataImporter {
  format = "CSV";
  parse(src) { return src.split(";").map((row) => { const [name, age] = row.split(","); return { name, age: Number(age) }; }); }
  transform(r) { return { ...r, name: r.name[0].toUpperCase() + r.name.slice(1) }; }
}

class JsonImporter extends DataImporter {
  format = "JSON";
  parse(src) { return JSON.parse(src).people.map((p) => ({ name: p.fullName, age: p.years })); }
  validate(r) { return super.validate(r) && r.age < 120; }   // a stricter hook, reusing the default
}

console.log("  " + new CsvImporter().run("asha,31;bilal,0;chen,45"));
console.log("  " + new JsonImporter().run('{"people":[{"fullName":"Dara","years":29},{"fullName":"Eli","years":150}]}'));
```
:::

Template Method uses **inheritance**: the base class calls down to the subclass (the "Hollywood principle": *don't call us, we'll call you*). It's ideal when the skeleton is genuinely fixed. Its cost is inheritance's coupling; when the varying part is one algorithm, **Strategy** (composition) is often more flexible. Real examples: test frameworks (`setUp` → test → `tearDown`), UI component lifecycles, servlet `doGet/doPost`, game loops, and the Factory Method pattern (a template method whose step is "create").

## Chain of Responsibility

:::def Chain of Responsibility
Passes a request along a **chain of handlers**. Each handler either **handles** the request, **passes it on** to the next handler, or both (processes part of it and forwards the rest). The sender doesn't know which handler will deal with it.
:::

**Problem:** a support ticket should be answered by the FAQ bot if it can, otherwise a level-1 agent, otherwise a level-2 engineer, otherwise a manager. Or: an HTTP request must pass authentication, rate limiting, validation and logging before reaching the handler, and any step may stop it. Hard-coding that sequence with nested `if`s makes it rigid; a chain makes each step a separate, reorderable object.

### Example 1: an ATM dispensing notes

A withdrawal request flows through ₹2000, ₹500, ₹200 and ₹100 dispensers; each pays out as many of its notes as it can and passes the **remainder** down the chain.

:::tabs ATM note dispenser chain
```cpp run
#include <bits/stdc++.h>
using namespace std;

class NoteDispenser {
    int note_; int available_;
    NoteDispenser* next_ = nullptr;
public:
    NoteDispenser(int note, int available) : note_(note), available_(available) {}
    NoteDispenser& then(NoteDispenser& next) { next_ = &next; return next; }   // build the chain
    // returns the amount it could NOT dispense (0 = fully served)
    int dispense(int amount, vector<pair<int, int>>& plan) {
        int count = min(amount / note_, available_);
        if (count > 0) plan.push_back({note_, count});
        int rest = amount - count * note_;
        if (rest > 0 && next_) return next_->dispense(rest, plan);
        return rest;
    }
};

int main() {
    NoteDispenser d2000(2000, 2), d500(500, 10), d200(200, 10), d100(100, 50);
    d2000.then(d500).then(d200).then(d100);
    for (int amount : {6700, 3900, 150}) {
        vector<pair<int, int>> plan;
        int left = d2000.dispense(amount, plan);
        cout << "Rs " << amount << ": ";
        if (left) { cout << "can't dispense (Rs " << left << " left over; amount must be a multiple of 100)\n"; continue; }
        for (auto [note, n] : plan) cout << n << "x" << note << " ";
        cout << "\n";
    }
    // (A real ATM computes the plan first and only commits the notes if the whole amount can be served.)
}
```
```js run
class NoteDispenser {
  #next = null;
  constructor(note, available) { Object.assign(this, { note, available }); }
  then(next) { this.#next = next; return next; }               // build the chain
  dispense(amount, plan = []) {                                // returns the amount left undispensed
    const count = Math.min(Math.floor(amount / this.note), this.available);
    if (count > 0) plan.push(`${count}x${this.note}`);
    const rest = amount - count * this.note;
    return rest > 0 && this.#next ? this.#next.dispense(rest, plan) : rest;
  }
}

const head = new NoteDispenser(2000, 2);
head.then(new NoteDispenser(500, 10)).then(new NoteDispenser(200, 10)).then(new NoteDispenser(100, 50));
for (const amount of [6700, 3900, 150]) {
  const plan = [];
  const left = head.dispense(amount, plan);
  console.log(`Rs ${amount}: ${left ? `can't dispense (Rs ${left} left over; amount must be a multiple of 100)` : plan.join(" ")}`);
}
```
:::

### Example 2: request middleware

The most common modern form: a **pipeline** where each handler does its part and calls `next()` (Express/Koa middleware, ASP.NET middleware, servlet filters, gRPC interceptors). Any handler can **short-circuit** by not calling `next`.

:::tabs Middleware chain with short-circuiting
```js run
// Each middleware: (req, res, next) → either respond, or call next()
const logger = (req, res, next) => { const t0 = req.time; next(); res.log.push(`${req.method} ${req.path} → ${res.status} (${req.time - t0}ms)`); };
const auth = (req, res, next) => { if (!req.headers.authorization) { res.status = 401; res.body = "missing token"; return; } req.user = "u42"; next(); };
const rateLimit = (() => { const counts = {}; return (req, res, next) => {
  counts[req.user] = (counts[req.user] ?? 0) + 1;
  if (counts[req.user] > 2) { res.status = 429; res.body = "slow down"; return; }
  next();
}; })();
const handler = (req, res) => { req.time += 12; res.status = 200; res.body = `orders for ${req.user}`; };

function compose(middlewares) {                              // builds the chain
  return (req, res) => {
    const run = (i) => { if (i < middlewares.length) middlewares[i](req, res, () => run(i + 1)); };
    run(0);
  };
}

const app = compose([logger, auth, rateLimit, handler]);
const log = [];
for (const headers of [{}, { authorization: "Bearer x" }, { authorization: "Bearer x" }, { authorization: "Bearer x" }]) {
  const req = { method: "GET", path: "/orders", headers, time: 0 }, res = { status: 0, body: "", log };
  app(req, res);
  console.log(res.status, res.body);
}
console.log(log.join("\n"));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Request { string path; map<string, string> headers; string user; };
struct Response { int status = 0; string body; };
using Next = function<void()>;
using Middleware = function<void(Request&, Response&, Next)>;

class Pipeline {                                     // builds the chain
    vector<Middleware> chain_;
public:
    Pipeline& use(Middleware m) { chain_.push_back(std::move(m)); return *this; }
    void handle(Request& req, Response& res) const { run(0, req, res); }
private:
    void run(size_t i, Request& req, Response& res) const {
        if (i < chain_.size()) chain_[i](req, res, [&, i] { run(i + 1, req, res); });
    }
};

int main() {
    map<string, int> counts;
    Pipeline app;
    app.use([](Request& q, Response& r, Next next) { next(); cout << "  log: " << q.path << " -> " << r.status << "\n"; })
       .use([](Request& q, Response& r, Next next) {
           if (!q.headers.count("authorization")) { r.status = 401; r.body = "missing token"; return; }   // short-circuit
           q.user = "u42"; next();
       })
       .use([&counts](Request& q, Response& r, Next next) {
           if (++counts[q.user] > 2) { r.status = 429; r.body = "slow down"; return; }
           next();
       })
       .use([](Request& q, Response& r, Next) { r.status = 200; r.body = "orders for " + q.user; });

    vector<map<string, string>> calls = {{}, {{"authorization", "Bearer x"}}, {{"authorization", "Bearer x"}}, {{"authorization", "Bearer x"}}};
    for (auto& h : calls) {
        Request req{"/orders", h, ""};
        Response res;
        app.handle(req, res);
        cout << res.status << " " << res.body << "\n";
    }
}
```
:::

**Pros:** each handler has one job (SRP); handlers can be added, removed and reordered without touching the others (OCP); the sender is decoupled from the receivers. **Cons:** a request might fall off the end unhandled (add a default handler), and debugging means following the chain.

LLD examples: **logger with levels** (DEBUG → INFO → ERROR handlers, each writing to its own sink; built in the LLD Problems module), **support/approval escalation** (expense approvals by amount: manager → director → CFO), **ATM dispensers**, **request validation pipelines**, **coupon eligibility checks**, and event bubbling in UI trees.

```quiz
? CSV, JSON and XML importers all open, parse, validate, transform and save, differing only in parsing. Which pattern removes the duplication?
+ Template Method: the base class owns the skeleton; subclasses override parse() (and optionally the hooks)
- Chain of Responsibility
- Observer
> The fixed sequence lives once in the base class; only the varying steps are overridden.

? Expense claims under Rs 5,000 are approved by a manager, under Rs 50,000 by a director, otherwise by the CFO. Which pattern models this naturally?
+ Chain of Responsibility: each approver handles what it can and passes the rest up the chain
- Builder
- Flyweight
> Escalation along a sequence of handlers is exactly what the chain models.

? What does it mean for a middleware to "short-circuit"?
+ It responds itself (e.g. 401) and doesn't call next(), so later handlers never run
- It runs twice
- It skips the logger only
> Any handler in the chain can stop the request.

? Template Method vs Strategy: which uses inheritance to vary behaviour?
+ Template Method
- Strategy
- Both
> Template Method overrides steps in subclasses; Strategy composes an algorithm object.
```

:::keypoints
- **Template Method**: a base-class method fixes the algorithm's skeleton; subclasses override **steps**; **hooks** have defaults. Inheritance-based; prefer Strategy when only one algorithm varies.
- **Chain of Responsibility**: a request travels through handlers that handle it, pass it on, or both; handlers are independent and reorderable. Add a default/terminal handler.
- Modern form: **middleware pipelines** with `next()` and short-circuiting. LLD uses: leveled loggers, approval escalation, ATM dispensing, validation pipelines.
:::
