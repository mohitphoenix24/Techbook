---
title: State and State Machines
level: intermediate
time: 45
summary: Modelling objects whose behaviour depends on their current state — the State pattern (a vending machine with idle, has-money, dispensing and sold-out states in C++ and JavaScript), state diagrams, table-driven state machines as a lighter alternative, and the LLD problems (orders, rides, elevators, ATMs) that are really state machines.
---

Many LLD questions are secretly **state machines**: a vending machine, an ATM, an elevator, a traffic light, an order (placed → paid → shipped → delivered), a ride (requested → matched → in progress → completed), a document workflow (draft → review → published). The same action means different things in different states: pressing "dispense" with no money inserted must be refused; inserting a coin while dispensing must wait. Code that handles this with nested `if (state == …)` checks in every method becomes a tangle. The **State** pattern untangles it.

:::def State pattern
Lets an object **change its behaviour when its internal state changes**: each state is a separate class implementing the same interface, the object (the **context**) delegates every action to its current state object, and states decide the **transitions** by switching the context's current state.
:::

## The vending machine

States and transitions, drawn as a diagram:

```viz algo=arch title="Vending machine states" dir=right
idle      Idle | waiting for money [box]
money     HasMoney | balance > 0 [pay]
disp      Dispensing [box]
sold      SoldOut [box]
--
idle -> money : insert coin
money -> idle : cancel → refund
money -> disp : select item (enough money)
disp -> idle : item out, change returned
disp -> sold : last item sold
sold -> idle : restocked
```

Every state must answer every action: `insertCoin`, `selectItem`, `cancel`, `restock`. Most answers in most states are "not allowed here", and that's the point: the rules for each state live in one class.

```viz algo=uml title="State pattern structure"
class VendingMachine
  - state: State
  - balance: int
  - stock: map<string, int>
  + insertCoin(amount)
  + selectItem(code)
  + cancel()
  ~ setState(s: State)
interface State
  + insertCoin(m, amount)
  + selectItem(m, code)
  + cancel(m)
  + name(): string
class IdleState
class HasMoneyState
class DispensingState
class SoldOutState
VendingMachine o-- State : current
IdleState ..|> State
HasMoneyState ..|> State
DispensingState ..|> State
SoldOutState ..|> State
```

:::tabs A vending machine with the State pattern
```cpp run
#include <bits/stdc++.h>
using namespace std;

class VendingMachine;

class State {
public:
    virtual ~State() = default;
    virtual void insertCoin(VendingMachine& m, int amount) = 0;
    virtual void selectItem(VendingMachine& m, const string& code) = 0;
    virtual void cancel(VendingMachine& m) = 0;
    virtual string name() const = 0;
};

class VendingMachine {
public:
    VendingMachine();
    void insertCoin(int amount) { state_->insertCoin(*this, amount); }   // every action delegates to the state
    void selectItem(const string& code) { state_->selectItem(*this, code); }
    void cancel() { state_->cancel(*this); }
    void restock(const string& code, int qty, int price);
    string stateName() const { return state_->name(); }

    // used by the states
    void setState(State* s) { state_ = s; }
    State* idle(); State* hasMoney(); State* dispensing(); State* soldOut();
    int balance = 0;
    map<string, pair<int, int>> items;                   // code -> {price, qty}
    int totalStock() const { int n = 0; for (auto& [_, it] : items) n += it.second; return n; }
    void say(const string& msg) { cout << "  [" << stateName() << "] " << msg << "\n"; }
private:
    State* state_;
    unique_ptr<State> idle_, hasMoney_, dispensing_, soldOut_;
};

class IdleState : public State {
public:
    void insertCoin(VendingMachine& m, int amount) override { m.balance += amount; m.say("credit Rs " + to_string(m.balance)); m.setState(m.hasMoney()); }
    void selectItem(VendingMachine& m, const string&) override { m.say("please insert money first"); }
    void cancel(VendingMachine& m) override { m.say("nothing to refund"); }
    string name() const override { return "Idle"; }
};

class HasMoneyState : public State {
public:
    void insertCoin(VendingMachine& m, int amount) override { m.balance += amount; m.say("credit Rs " + to_string(m.balance)); }
    void selectItem(VendingMachine& m, const string& code) override {
        auto it = m.items.find(code);
        if (it == m.items.end() || it->second.second == 0) { m.say(code + " is unavailable, choose another"); return; }
        if (m.balance < it->second.first) { m.say("insert Rs " + to_string(it->second.first - m.balance) + " more"); return; }
        m.balance -= it->second.first;
        it->second.second--;
        m.setState(m.dispensing());
        m.say("dispensing " + code + ", change Rs " + to_string(m.balance));
        m.balance = 0;
        m.setState(m.totalStock() == 0 ? m.soldOut() : m.idle());   // the state decides the next state
    }
    void cancel(VendingMachine& m) override { m.say("refund Rs " + to_string(m.balance)); m.balance = 0; m.setState(m.idle()); }
    string name() const override { return "HasMoney"; }
};

class DispensingState : public State {
public:
    void insertCoin(VendingMachine& m, int) override { m.say("please wait, dispensing"); }
    void selectItem(VendingMachine& m, const string&) override { m.say("please wait, dispensing"); }
    void cancel(VendingMachine& m) override { m.say("too late to cancel"); }
    string name() const override { return "Dispensing"; }
};

class SoldOutState : public State {
public:
    void insertCoin(VendingMachine& m, int amount) override { m.say("sold out, returning Rs " + to_string(amount)); }
    void selectItem(VendingMachine& m, const string&) override { m.say("sold out"); }
    void cancel(VendingMachine& m) override { m.say("nothing to refund"); }
    string name() const override { return "SoldOut"; }
};

VendingMachine::VendingMachine()
    : idle_(make_unique<IdleState>()), hasMoney_(make_unique<HasMoneyState>()),
      dispensing_(make_unique<DispensingState>()), soldOut_(make_unique<SoldOutState>()) { state_ = soldOut_.get(); }
State* VendingMachine::idle() { return idle_.get(); }
State* VendingMachine::hasMoney() { return hasMoney_.get(); }
State* VendingMachine::dispensing() { return dispensing_.get(); }
State* VendingMachine::soldOut() { return soldOut_.get(); }
void VendingMachine::restock(const string& code, int qty, int price) {
    items[code] = {price, items[code].second + qty};
    if (state_ == soldOut_.get()) setState(idle_.get());
    say("restocked " + code);
}

int main() {
    VendingMachine vm;
    vm.insertCoin(10);                      // sold out: coin returned
    vm.restock("A1", 1, 25);
    vm.selectItem("A1");                    // no money yet
    vm.insertCoin(10); vm.insertCoin(10);
    vm.selectItem("A1");                    // not enough
    vm.insertCoin(10);
    vm.selectItem("A1");                    // dispenses, last item -> SoldOut
    vm.insertCoin(20);
    cout << "final state: " << vm.stateName() << "\n";
}
```
```js run
class VendingMachine {
  balance = 0;
  items = new Map();                                     // code → { price, qty }
  constructor() {
    this.states = { idle: new IdleState(), hasMoney: new HasMoneyState(), dispensing: new DispensingState(), soldOut: new SoldOutState() };
    this.state = this.states.soldOut;
  }
  insertCoin(amount) { this.state.insertCoin(this, amount); }   // every action delegates to the state
  selectItem(code) { this.state.selectItem(this, code); }
  cancel() { this.state.cancel(this); }
  restock(code, qty, price) {
    const it = this.items.get(code) ?? { price, qty: 0 };
    this.items.set(code, { price, qty: it.qty + qty });
    if (this.state === this.states.soldOut) this.state = this.states.idle;
    this.say(`restocked ${code}`);
  }
  get totalStock() { let n = 0; for (const { qty } of this.items.values()) n += qty; return n; }
  say(msg) { console.log(`  [${this.state.constructor.name.replace("State", "")}] ${msg}`); }
}

class IdleState {
  insertCoin(m, amount) { m.balance += amount; m.say(`credit Rs ${m.balance}`); m.state = m.states.hasMoney; }
  selectItem(m) { m.say("please insert money first"); }
  cancel(m) { m.say("nothing to refund"); }
}
class HasMoneyState {
  insertCoin(m, amount) { m.balance += amount; m.say(`credit Rs ${m.balance}`); }
  selectItem(m, code) {
    const it = m.items.get(code);
    if (!it || it.qty === 0) return m.say(`${code} is unavailable, choose another`);
    if (m.balance < it.price) return m.say(`insert Rs ${it.price - m.balance} more`);
    m.balance -= it.price;
    it.qty--;
    m.state = m.states.dispensing;
    m.say(`dispensing ${code}, change Rs ${m.balance}`);
    m.balance = 0;
    m.state = m.totalStock === 0 ? m.states.soldOut : m.states.idle;   // the state decides the next state
  }
  cancel(m) { m.say(`refund Rs ${m.balance}`); m.balance = 0; m.state = m.states.idle; }
}
class DispensingState {
  insertCoin(m) { m.say("please wait, dispensing"); }
  selectItem(m) { m.say("please wait, dispensing"); }
  cancel(m) { m.say("too late to cancel"); }
}
class SoldOutState {
  insertCoin(m, amount) { m.say(`sold out, returning Rs ${amount}`); }
  selectItem(m) { m.say("sold out"); }
  cancel(m) { m.say("nothing to refund"); }
}

const vm = new VendingMachine();
vm.insertCoin(10);                       // sold out: coin returned
vm.restock("A1", 1, 25);
vm.selectItem("A1");                     // no money yet
vm.insertCoin(10); vm.insertCoin(10);
vm.selectItem("A1");                     // not enough
vm.insertCoin(10);
vm.selectItem("A1");                     // dispenses, last item → SoldOut
vm.insertCoin(20);
console.log("final state:", vm.state.constructor.name);
```
:::

What the pattern buys you:

- **No conditionals on state** in the context: `VendingMachine` just delegates. Each state's rules are in one class.
- **Adding a state** (say `Maintenance`) means one new class plus the transitions into it, instead of editing every method's `if` chain.
- **Illegal actions are explicit**: every state must decide what each action does, so nothing is forgotten.

Design notes: states here are **stateless singletons** shared per machine (the data, like balance and stock, lives in the context), which is the common choice. Transitions can live in the states (as above) or in the context; keep them in one consistent place.

## The lighter alternative: a transition table

For machines where states mostly control **which transitions are allowed** (rather than having rich behaviour per state), a **table-driven** state machine is simpler and easy to validate:

:::tabs A table-driven order state machine
```js run
// state → event → next state. Anything not in the table is an illegal transition.
const ORDER_FSM = {
  CREATED:   { pay: "PAID", cancel: "CANCELLED" },
  PAID:      { ship: "SHIPPED", cancel: "REFUNDED" },
  SHIPPED:   { deliver: "DELIVERED", lose: "LOST" },
  DELIVERED: { return: "RETURNED" },
  LOST:      { refund: "REFUNDED" },
};

class Order {
  #state = "CREATED";
  #history = ["CREATED"];
  constructor(id) { this.id = id; }
  fire(event) {
    const next = ORDER_FSM[this.#state]?.[event];
    if (!next) throw new Error(`can't '${event}' an order that is ${this.#state}`);
    this.#state = next;
    this.#history.push(next);
    return this;
  }
  get state() { return this.#state; }
  get history() { return this.#history.join(" → "); }
}

const o = new Order("o-501").fire("pay").fire("ship").fire("deliver");
console.log(o.id, o.history);
try { o.fire("cancel"); } catch (e) { console.log("rejected:", e.message); }
console.log("allowed from SHIPPED:", Object.keys(ORDER_FSM.SHIPPED));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

// state -> event -> next state. Anything not in the table is an illegal transition.
const map<string, map<string, string>> ORDER_FSM = {
    {"CREATED", {{"pay", "PAID"}, {"cancel", "CANCELLED"}}},
    {"PAID", {{"ship", "SHIPPED"}, {"cancel", "REFUNDED"}}},
    {"SHIPPED", {{"deliver", "DELIVERED"}, {"lose", "LOST"}}},
    {"DELIVERED", {{"return", "RETURNED"}}},
    {"LOST", {{"refund", "REFUNDED"}}},
};

class Order {
    string state_ = "CREATED";
    vector<string> history_{"CREATED"};
public:
    Order& fire(const string& event) {
        auto s = ORDER_FSM.find(state_);
        if (s == ORDER_FSM.end() || !s->second.count(event))
            throw logic_error("can't '" + event + "' an order that is " + state_);
        state_ = s->second.at(event);
        history_.push_back(state_);
        return *this;
    }
    string history() const { string h; for (size_t i = 0; i < history_.size(); i++) h += (i ? " -> " : "") + history_[i]; return h; }
};

int main() {
    Order o;
    o.fire("pay").fire("ship").fire("deliver");
    cout << "o-501 " << o.history() << "\n";
    try { o.fire("cancel"); } catch (const exception& e) { cout << "rejected: " << e.what() << "\n"; }
}
```
:::

In databases, the same guard is a conditional update: `UPDATE orders SET status='SHIPPED' WHERE id=? AND status='PAID'`, which also makes the transition safe under concurrency.

| | State pattern (classes) | Transition table |
|---|---|---|
| Best when | each state has substantial, different **behaviour** | states mainly gate **which transitions** are legal |
| Adding a state | a new class | a new row |
| Visibility of the whole machine | spread over classes | one table, easy to review, draw and test |

:::interview Spot the state machine
When a problem has words like *status*, *mode*, *phase*, or lists of things that "can only happen after…", draw the state diagram first (states, events, transitions, and what's illegal). It catches missing cases early (can a cancelled ride be rated?) and drives either the State pattern or a table. Elevators (idle / moving up / moving down / doors open / maintenance), ATMs (no card / card inserted / PIN verified / dispensing), and rides are classic examples.
:::

```quiz
? Every method of a TrafficLight class starts with `if (color == RED) … else if (color == GREEN) …`. Which pattern removes this?
+ State: one class per color, each handling the actions and choosing the next state
- Observer
- Builder
> Behaviour that depends on the current state moves into state classes; the context delegates.

? What's the key difference between State and Strategy?
+ In State, the state objects trigger transitions between themselves as events happen; in Strategy, the client picks the algorithm and it doesn't change on its own
- State uses inheritance and Strategy uses composition
- There is no difference
> Both delegate to an interface, but State models a lifecycle with transitions.

? An order may only move CREATED → PAID → SHIPPED → DELIVERED, with cancel allowed before shipping. What's a lightweight implementation?
+ A transition table (state → event → next state), rejecting events not in the table
- A Singleton
- A Composite
> When states mainly gate transitions, a table is simple, visible and easy to test.
```

:::keypoints
- The **State** pattern gives each state its own class with the same interface; the context **delegates** every action to its current state, and states perform **transitions**.
- It removes state conditionals from every method and makes illegal actions explicit; adding a state is a new class.
- **Transition tables** are a lighter alternative when states mainly control which transitions are legal; enforce them in the DB with conditional updates.
- Many LLD problems are state machines (vending machine, ATM, elevator, orders, rides): **draw the state diagram first**.
:::
