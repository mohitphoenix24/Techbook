---
title: State
level: intermediate
time: 40
summary: Let an object behave differently depending on its current state, by giving each state its own class. See why a big switch is a problem, a gumball machine, a document workflow, who controls the transitions, a table version, and how State differs from Strategy.
---

## What is the State pattern?

Don't memorise the definition yet. Think of it like this:

> "The same button does different things depending on the situation. A lift button works one way when the lift is moving, and another way when the doors are open."

Many things in real life (and in code) behave differently depending on their **mode**:

- a vending machine: idle, has money, dispensing,
- a document: draft, in review, published,
- an order: placed, paid, shipped, delivered, cancelled,
- a media player: stopped, playing, paused.

:::def State
Let an object **change its behaviour when its internal state changes**, by handing the work to a **state object**. From outside it looks like the object changed its class.
:::

## The problem: a switch in every method

The first idea most people try is a `switch (state)` inside every method.

```cpp run title="Every operation switches on the state"
#include <iostream>
using namespace std;

enum class S { Idle, HasCoin, Sold };

class Gumball {
    S s_ = S::Idle; int count_ = 2;
public:
    void insertCoin() {
        switch (s_) {
            case S::Idle:    s_ = S::HasCoin; cout << "  coin accepted\n"; break;
            case S::HasCoin: cout << "  coin already inserted\n"; break;
            case S::Sold:    cout << "  please wait, dispensing\n"; break;
        }
    }
    void turnCrank() {
        switch (s_) {
            case S::Idle:    cout << "  insert a coin first\n"; break;
            case S::HasCoin: s_ = S::Sold; cout << "  crank turned\n"; dispense(); break;
            case S::Sold:    cout << "  turning twice does not help\n"; break;
        }
    }
private:
    void dispense() { --count_; cout << "  a gumball rolls out (" << count_ << " left)\n"; s_ = count_ > 0 ? S::Idle : S::Idle; }
};

int main() { Gumball g; g.insertCoin(); g.turnCrank(); g.turnCrank(); }
```

Now imagine adding a new state, like "Winner: gives two gumballs". You must edit **every** method. And one state's behaviour is scattered across many places. This breaks both the "one job per class" and the "do not edit old code" rules.

## The State pattern

Make each state its **own class**. That class knows what to do for every action **in that state**. The main object (the **context**) keeps a pointer to the current state and **passes every call to it**. When something changes, a state tells the context to switch to a new state.

```viz algo=uml title="State"
class GumballMachine
  - state: State
  - count: int
  + insertCoin(): void
  + turnCrank(): void
  + setState(s: State): void
interface State
  + insertCoin(m: GumballMachine): void
  + turnCrank(m: GumballMachine): void
class NoCoinState
class HasCoinState
class SoldOutState
GumballMachine o-- State
NoCoinState ..|> State
HasCoinState ..|> State
SoldOutState ..|> State
```

```viz algo=state title="The gumball machine's lifecycle"
state NoCoin "No coin" [initial] @0,1
state HasCoin "Has coin" @1,1
state SoldOut "Sold out" @2,1
NoCoin -> HasCoin : insert coin
HasCoin -> NoCoin : crank (stock left)
HasCoin -> SoldOut : crank (last one)
play: crank, insert coin, insert coin, crank
```

```cpp run title="One class per state"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class GumballMachine;

class State {                                              // every operation exists in every state
public:
    virtual ~State() = default;
    virtual void insertCoin(GumballMachine& m) = 0;
    virtual void turnCrank(GumballMachine& m) = 0;
    virtual string name() const = 0;
};

class NoCoinState : public State {
public:
    void insertCoin(GumballMachine& m) override;
    void turnCrank(GumballMachine&) override { cout << "  insert a coin first\n"; }
    string name() const override { return "NoCoin"; }
};
class HasCoinState : public State {
public:
    void insertCoin(GumballMachine&) override { cout << "  coin already inserted\n"; }
    void turnCrank(GumballMachine& m) override;
    string name() const override { return "HasCoin"; }
};
class SoldOutState : public State {
public:
    void insertCoin(GumballMachine&) override { cout << "  sold out: coin returned\n"; }
    void turnCrank(GumballMachine&) override { cout << "  sold out: nothing to give\n"; }
    string name() const override { return "SoldOut"; }
};

class GumballMachine {                                     // the context
    unique_ptr<State> state_;
    int count_;
public:
    explicit GumballMachine(int n) : count_(n) { state_ = n > 0 ? unique_ptr<State>(make_unique<NoCoinState>()) : make_unique<SoldOutState>(); }
    void insertCoin() { state_->insertCoin(*this); }       // delegate: no switch anywhere
    void turnCrank() { state_->turnCrank(*this); }
    void setState(unique_ptr<State> s) { state_ = move(s); cout << "  [state -> " << state_->name() << "]\n"; }
    void releaseBall() { if (count_ > 0) { --count_; cout << "  a gumball rolls out (" << count_ << " left)\n"; } }
    int count() const { return count_; }
};

void NoCoinState::insertCoin(GumballMachine& m) { cout << "  coin accepted\n"; m.setState(make_unique<HasCoinState>()); }
void HasCoinState::turnCrank(GumballMachine& m) {
    cout << "  crank turned\n";
    m.releaseBall();
    if (m.count() > 0) m.setState(make_unique<NoCoinState>());
    else m.setState(make_unique<SoldOutState>());
}

int main() {
    GumballMachine m(2);
    m.turnCrank();
    m.insertCoin(); m.insertCoin(); m.turnCrank();
    m.insertCoin(); m.turnCrank();
    m.insertCoin();
}
```

Now each state's behaviour lives **in one class**. To add `WinnerState`, you write a new class and add the arrows into it. The machine class has no `if` or `switch`.

## Another example: a document workflow

Here, what you can do depends on the state: you can edit only in Draft, approve only in Review, and a Published document can only be archived.

```cpp run title="Document lifecycle with the State pattern"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Document;

class DocState {
public:
    virtual ~DocState() = default;
    virtual string name() const = 0;
    virtual void edit(Document& d, const string& text);
    virtual void submit(Document& d);
    virtual void approve(Document& d);
    virtual void reject(Document& d);
};

class Document {
    unique_ptr<DocState> state_;
    string text_;
public:
    Document();
    void edit(const string& t) { state_->edit(*this, t); }
    void submit() { state_->submit(*this); }
    void approve() { state_->approve(*this); }
    void reject() { state_->reject(*this); }
    void set(unique_ptr<DocState> s) { state_ = move(s); }
    void setText(const string& t) { text_ = t; }
    const string& text() const { return text_; }
    string state() const { return state_->name(); }
};

// defaults: an operation that is not allowed in a state
void DocState::edit(Document&, const string&) { cout << "  cannot edit in " << name() << "\n"; }
void DocState::submit(Document&)  { cout << "  cannot submit in " << name() << "\n"; }
void DocState::approve(Document&) { cout << "  cannot approve in " << name() << "\n"; }
void DocState::reject(Document&)  { cout << "  cannot reject in " << name() << "\n"; }

struct Published : DocState { string name() const override { return "Published"; } };    // nothing is allowed
struct Review : DocState {
    string name() const override { return "Review"; }
    void approve(Document& d) override { cout << "  approved\n"; d.set(make_unique<Published>()); }
    void reject(Document& d) override;
};
struct Draft : DocState {
    string name() const override { return "Draft"; }
    void edit(Document& d, const string& t) override { d.setText(t); cout << "  edited\n"; }
    void submit(Document& d) override { cout << "  submitted for review\n"; d.set(make_unique<Review>()); }
};
void Review::reject(Document& d) { cout << "  rejected, back to draft\n"; d.set(make_unique<Draft>()); }
Document::Document() : state_(make_unique<Draft>()) {}

int main() {
    Document d;
    d.edit("first version");
    d.approve();                       // not allowed yet
    d.submit();
    d.edit("sneaky change");           // not allowed in review
    d.reject();
    d.edit("second version");
    d.submit();
    d.approve();
    d.edit("too late");
    cout << "final state: " << d.state() << ", text: " << d.text() << "\n";
}
```

## Who decides the next state?

| Option | How | Good / not so good |
|---|---|---|
| **The states decide** (as above) | each state tells the context what comes next | easy to add states, but states know their neighbours |
| **The context decides** | the context keeps a table of transitions; states only act | all transitions in one place |
| **Table only** (no state classes) | `map<pair<State, Event>, State>` | short and easy to check; behaviour is in separate functions |

```cpp run title="Table-driven state machine"
#include <iostream>
#include <map>
#include <string>
using namespace std;

enum class S { Idle, Running, Paused, Stopped };
enum class E { Start, Pause, Resume, Stop };

string name(S s) { switch (s) { case S::Idle: return "Idle"; case S::Running: return "Running"; case S::Paused: return "Paused"; case S::Stopped: return "Stopped"; } return "?"; }

class Player {
    S s_ = S::Idle;
    static const map<pair<S, E>, S>& table() {
        static const map<pair<S, E>, S> t{
            {{S::Idle, E::Start}, S::Running},
            {{S::Running, E::Pause}, S::Paused},
            {{S::Paused, E::Resume}, S::Running},
            {{S::Running, E::Stop}, S::Stopped},
            {{S::Paused, E::Stop}, S::Stopped},
        };
        return t;
    }
public:
    void fire(E e) {
        auto it = table().find({s_, e});
        if (it == table().end()) { cout << "  ignored in " << name(s_) << "\n"; return; }
        cout << "  " << name(s_) << " -> " << name(it->second) << "\n";
        s_ = it->second;
    }
};

int main() {
    Player p;
    for (E e : {E::Pause, E::Start, E::Pause, E::Resume, E::Stop, E::Start}) p.fire(e);
}
```

In the table version, the whole machine is just **data**. It is easy to print, check and test. For small, stable machines this is often the best choice. The State pattern is better when each state has **a lot of behaviour**.

## Sharing state objects

Often a state object has **no data of its own**. Then one shared copy of each state is enough. This saves memory and avoids creating objects again and again.

```cpp run title="Stateless states as shared singletons"
#include <iostream>
using namespace std;

class Light;
struct LightState {
    virtual ~LightState() = default;
    virtual void press(Light& l) const = 0;
    virtual const char* name() const = 0;
};
class Light {
    const LightState* s_;
public:
    explicit Light(const LightState& initial) : s_(&initial) {}
    void press() { s_->press(*this); }
    void set(const LightState& s) { s_ = &s; }
    const char* name() const { return s_->name(); }
};
struct Off : LightState { void press(Light& l) const override; const char* name() const override { return "off"; } };
struct On  : LightState { void press(Light& l) const override; const char* name() const override { return "on"; } };
const Off kOff; const On kOn;                              // one shared object per state
void Off::press(Light& l) const { l.set(kOn); }
void On::press(Light& l) const { l.set(kOff); }

int main() {
    Light l(kOff);
    for (int i = 0; i < 3; ++i) { l.press(); cout << l.name() << " "; }
    cout << "\n";
}
```

## State vs Strategy

Both hold a pointer to an interface and pass the work on. The difference is **who changes it and why**.

| | State | Strategy |
|---|---|---|
| Who changes the pointer? | the object **itself**, as it moves along | the **user**, from outside |
| Do the variants know each other? | **yes**, a state names the next state | no |
| The question it answers | "What can I do **now**?" | "**How** should I do this?" |
| Typical use | workflows, protocols, machines | sorting, pricing, routing |

## Short answer to say in an interview

:::interview How is State different from a switch, and from Strategy?
"A switch spreads one state's behaviour across all the methods, and I must edit every method for a new state. With the State pattern each state is a class, and the main object passes calls to the current state. So a new state is just a new class. It differs from Strategy because the object changes its own state as it runs, and states know the valid transitions. A strategy is chosen by the user, and strategies do not know each other."
:::

```quiz
? What does the context do in the State pattern?
- Writes the logic of every state
+ Holds the current state object and passes the calls to it
- Chooses a strategy
> It has no switch on the state. The state object decides what to do.
? When is a table-driven machine a good choice?
- When each state has a lot of behaviour
+ When the machine is small, mostly transitions, and easy to check
- When you need polymorphism
> A table is short. Use state classes when each state has rich behaviour.
? How can states that have no data be made cheaper?
- Use raw pointers
+ Share one object for each state
- They cannot be shared
> If a state keeps no data, one shared copy is enough.
```

:::keypoints
- State: one class per state. The context passes calls to the current state. States trigger the transitions.
- It replaces repeated `switch` on a state. Invalid actions get a clear default reply.
- Transitions can live in the states, in the context, or in a table. Share states that have no data.
- State changes by itself over time. Strategy is chosen from outside.
:::
