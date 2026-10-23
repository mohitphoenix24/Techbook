---
title: State
level: intermediate
time: 40
summary: Letting an object change its behaviour when its internal state changes, by delegating to state objects: replacing a growing switch, a vending machine and a document workflow, who owns the transitions, state tables, shared stateless states, and the contrast with Strategy.
---

:::def State
Allow an object to **alter its behaviour when its internal state changes**. The object will appear to change its class.
:::

Many objects behave differently depending on their **mode**: a vending machine (idle, has money, dispensing), a document (draft, review, published), an order (placed, paid, shipped, delivered, cancelled), a TCP connection, a media player (stopped, playing, paused), a traffic light, an elevator. The usual first attempt is a big `switch (state)` inside every method.

## The problem: switch statements in every method

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

Adding a new state ("Winner: two gumballs") means editing **every method's** switch. The behaviour of one state is scattered over many places. This breaks OCP and SRP.

## The State pattern

Make each state a **class** that implements all the operations for that state. The **context** holds a pointer to the current state and **delegates** every call to it. States perform transitions by telling the context to switch.

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

Now each state's behaviour is **in one class**. Adding a state (`WinnerState`) is a new class plus the transitions into it. The machine class has no conditionals.

## A document workflow

A second example with permissions depending on the state: a document can be edited only as a draft, approved only in review, and archived once published.

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

## Who defines the transitions?

| Option | How | Trade-off |
|---|---|---|
| **States decide** (as above) | each state calls `context.set(new State)` | easy to add states; states know their neighbours (some coupling between states) |
| **Context decides** | context holds a transition table; states only act | transitions are in one place; good for many states with data-driven rules |
| **Table-driven** (no state classes) | `map<pair<State, Event>, State>` | compact and easy to verify; behaviour per state is in separate functions |

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

The whole machine is **data**: easy to print, validate and test. For small, stable machines this is often the best choice; the State pattern wins when each state has **rich behaviour**.

## Sharing state objects

State objects often hold **no data of their own**: they are stateless. Then one shared instance of each is enough (a Flyweight/Singleton per state), avoiding repeated allocation:

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

Both hold an interface pointer and delegate. The difference is **who changes it and why**.

| | State | Strategy |
|---|---|---|
| The object swaps the pointer | **itself**, as it moves through its lifecycle | the **client** sets it from outside |
| Variants know each other | **yes**: a state names the next state | no |
| Question it answers | "What can I do *now*?" | "*How* shall I do this?" |
| Typical | workflow, protocol, machine | sorting order, pricing, routing |

:::interview How is the State pattern different from a switch or from Strategy?
"A switch scatters one state's behaviour across every method and must be edited for each new state. State puts each state's behaviour in a class and the context delegates, so adding a state is adding a class. It differs from Strategy in that the object changes its own state object as it runs, and the states encode the valid transitions, whereas a strategy is chosen by the client and strategies do not know each other."
:::

```quiz
? What does the context do in the State pattern?
- Implements every state's logic
+ Holds the current state object and delegates operations to it
- Chooses a strategy
> It has no conditionals on state; the state object decides the behaviour.
? Which is a good reason to use a table-driven machine instead of state classes?
- The states have complex behaviour
+ The machine is small and mostly data (transitions), and easy to validate
- You need polymorphism
> A transition table is compact; use state classes when each state has rich behaviour.
? How can stateless state objects be made cheaper?
- By using raw pointers
+ Share one instance of each (like flyweights/singletons)
- They cannot be shared
> If they hold no per-context data, a single shared object per state is enough.
```

:::keypoints
- State: one class per state implementing all operations; the context delegates; states trigger transitions.
- Replaces repeated `switch` over a state enum (OCP, SRP). Invalid operations get a clear default response.
- Transitions can live in the states, in the context, or in a table. Share stateless states.
- State changes itself over time; Strategy is chosen from outside.
:::
