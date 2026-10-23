---
title: Sequence, state and use-case diagrams
level: easy
time: 30
summary: The behaviour diagrams you actually draw in LLD interviews: use cases to scope a problem, sequence diagrams to prove the objects collaborate correctly, and state diagrams for anything with a lifecycle, each turned into code.
---

A class diagram shows **structure**. Interviewers also want to see **behaviour**: how objects work together, and how an object changes over time. Three more diagrams do this.

## 1. Use cases: scope the problem

A **use case** is one thing an **actor** (a user or another system) wants to do. Listing them at the start fixes the scope, and every use case becomes a flow you must support.

| Actor | Use cases (ATM example) |
|---|---|
| Customer | insert card, enter PIN, check balance, withdraw cash, deposit cash, print mini-statement |
| Bank (system) | verify PIN, debit/credit account |
| Technician | refill cash, service machine |

You rarely draw the stick-figure diagram. A **table or bullet list** like this is enough, and it is quicker. Then mark the ones in scope: "I will design withdraw, balance and deposit; the technician flow is out of scope."

## 2. Sequence diagrams: prove the collaboration

A **sequence diagram** shows objects across the top and messages between them, ordered in time. It answers "who calls whom, in what order?" for one use case. Drawing it often **exposes missing methods or responsibilities**, which is why it is worth the time.

```viz algo=seq title="Withdraw cash: ATM, Bank, Account"
participant c Customer [user]
participant atm ATM [box]
participant bank BankService [service]
participant acc Account [db]
c -> atm : insertCard() | The ATM reads the card number and moves to the "card inserted" state.
c -> atm : enterPin(1234)
atm -> bank : verify(card, pin) | The ATM does not know PIN rules: it asks the bank service.
bank --> atm : ok
c -> atm : withdraw(2000)
atm -> bank : debit(card, 2000)
bank -> acc : withdraw(2000) | The Account checks the balance and keeps the invariant.
acc --> bank : true
bank --> atm : approved
atm -> atm : dispenseCash(2000) | A self-call: the ATM's cash dispenser counts notes.
atm --> c : cash + receipt
```

How to read: vertical dashed lines are the lifetimes of the objects; a solid arrow is a call; a dashed arrow is a return; an arrow back to the same object is a self-call. Step through it above to replay the story.

Tips:

- Draw **one sequence per important use case**, not per method.
- The first arrow is the *trigger* (what the actor does).
- If you find yourself writing a call to a method that does not exist on your class diagram, **update the class diagram**. That is the point of the exercise.
- Use notes for `alt`/`loop`: "if PIN wrong, three tries then retain the card".

## 3. State diagrams: for anything with a lifecycle

Objects like an ATM, a vending machine, an order, an elevator or a traffic signal behave differently depending on their **state**. A **state diagram** shows the states and the **events** that cause **transitions** between them.

```viz algo=state title="Vending machine"
state Idle "Idle" [initial] @0,1
state HasMoney "Has money" @1,0
state Dispensing "Dispensing" @2,1
state OutOfStock "Out of stock" @1,2
Idle -> HasMoney : insert coin
HasMoney -> HasMoney : insert coin
HasMoney -> Dispensing : select item
HasMoney -> Idle : refund
Dispensing -> Idle : item taken
Idle -> OutOfStock : sold out
OutOfStock -> Idle : restock
play: select item, insert coin, insert coin, select item, item taken, refund
```

Press ▶ to feed events into the machine. Notice the first event, `select item`, is **not allowed** in `Idle` and is rejected. Showing which events are illegal in which state is exactly the value of the diagram: it forces you to list every case.

A state table is the same information as a grid, and is the best checklist to turn into code:

| State \ Event | insert coin | select item | refund | item taken |
|---|---|---|---|---|
| **Idle** | → Has money | reject | reject | reject |
| **Has money** | stay (add credit) | → Dispensing | → Idle | reject |
| **Dispensing** | reject | reject | reject | → Idle |

### From the diagram to code (the simple way)

```cpp run title="A state machine with an enum and a transition function"
#include <iostream>
#include <string>
using namespace std;

enum class State { Idle, HasMoney, Dispensing };
enum class Event { InsertCoin, SelectItem, Refund, ItemTaken };

const char* name(State s) { return s == State::Idle ? "Idle" : s == State::HasMoney ? "HasMoney" : "Dispensing"; }
const char* name(Event e) {
    switch (e) { case Event::InsertCoin: return "insert coin"; case Event::SelectItem: return "select item";
                 case Event::Refund: return "refund"; case Event::ItemTaken: return "item taken"; }
    return "?";
}

class VendingMachine {
    State state_ = State::Idle;
    int credit_ = 0;
public:
    void handle(Event e) {
        State before = state_;
        switch (state_) {
            case State::Idle:
                if (e == Event::InsertCoin) { credit_ += 10; state_ = State::HasMoney; }
                break;
            case State::HasMoney:
                if (e == Event::InsertCoin) credit_ += 10;
                else if (e == Event::SelectItem) state_ = State::Dispensing;
                else if (e == Event::Refund) { credit_ = 0; state_ = State::Idle; }
                break;
            case State::Dispensing:
                if (e == Event::ItemTaken) { credit_ = 0; state_ = State::Idle; }
                break;
        }
        cout << "  " << name(before) << " + " << name(e) << " -> " << name(state_)
             << (before == state_ && e != Event::InsertCoin ? "  (ignored)" : "") << ", credit " << credit_ << "\n";
    }
};

int main() {
    VendingMachine m;
    for (Event e : {Event::SelectItem, Event::InsertCoin, Event::InsertCoin, Event::SelectItem, Event::ItemTaken}) m.handle(e);
}
```

This `switch` version is fine for 3 states. When states grow, or each state has a lot of behaviour, switch to the **State pattern** (module 12), where each state is a class. The diagram stays the same.

## 4. Activity diagrams (optional)

An **activity diagram** is a flowchart for a process with decisions and parallel steps. It is useful for workflows (checkout, onboarding). A simple `:::flow` is usually quicker to sketch:

:::flow Checkout process
Cart | items and quantities
Address | where to deliver
Payment | card / UPI / COD
Place order | stock reserved
Confirm | email and SMS sent
:::

## Which diagram when?

| You want to show | Draw |
|---|---|
| Scope and actors | use-case list |
| Classes, relationships | **class diagram** (always) |
| How objects cooperate for one scenario | **sequence diagram** (for the 1 or 2 main flows) |
| An object whose behaviour depends on its history | **state diagram** (for lifecycle objects) |
| A business process with branches | activity diagram / flowchart |

In a 45-minute round: a class diagram, one sequence diagram, and a state diagram if there is a lifecycle. That is more than enough.

```quiz
? What is the best use of a sequence diagram in an LLD interview?
- To show the database schema
+ To prove the objects collaborate correctly for a main use case, exposing missing methods
- To list all classes
> Walking through a scenario message by message finds gaps in the class design.
? Which kind of object most needs a state diagram?
- A Money value object
+ A vending machine, order or elevator whose behaviour depends on its current state
- A utility class with static functions
> State diagrams capture lifecycle rules: which events are valid in which state.
? A state table lists, for each state and event, ...
- The class names
+ The next state (or "reject")
- The method bodies
> It is a checklist that turns directly into a switch or into State classes.
```

:::keypoints
- Use cases scope the problem. A sequence diagram per main flow proves the design. A state diagram for lifecycle objects.
- A state table (state × event → next state) is the best bridge from diagram to code.
- Update the class diagram whenever a flow reveals a missing method.
:::
