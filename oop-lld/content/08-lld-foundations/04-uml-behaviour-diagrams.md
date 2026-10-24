---
title: Sequence, state and use-case diagrams
level: easy
time: 30
summary: The three diagrams that show how a design behaves: use cases to decide the scope, sequence diagrams to check who calls whom, and state diagrams for things that change over time. Each one is turned into code.
---

A class diagram shows the **structure** (which classes exist). Interviewers also want to see the **behaviour**: how the objects work together, and how one object changes over time. Three simple diagrams help with that.

## 1. Use cases: decide the scope

A **use case** is one thing that a user (or another system) wants to do. Writing them down at the start tells you exactly what to build.

Example for an ATM:

| Who | What they want to do |
|---|---|
| Customer | insert card, enter PIN, check balance, withdraw cash, deposit cash |
| Bank (a system) | check the PIN, update the account |
| Technician | refill cash, repair the machine |

You do not need to draw stick figures. A **simple list or table** like this is enough, and faster. Then say what is in scope: "I will design withdraw, balance and deposit. The technician part is out of scope."

## 2. Sequence diagram: who calls whom

A **sequence diagram** shows the objects across the top and the messages between them, from top to bottom in time order. It answers one question: **"for this use case, who calls whom, and in what order?"**

Drawing it is useful because it often shows **a method you forgot**.

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

How to read it:

- Each vertical line belongs to one object.
- A solid arrow is a call.
- A dashed arrow is the answer coming back.
- Use the step buttons above to replay the story one message at a time.

Tips:

- Draw **one sequence diagram per important use case** (not one per method).
- The first arrow is what starts everything (the user's action).
- If you need a method that is not in your class diagram, **add it to the class diagram**. That is exactly why we draw this.
- Use a short note for special cases: "if the PIN is wrong three times, keep the card".

## 3. State diagram: for things that change over time

Some objects behave differently depending on **what state they are in**. A vending machine, an ATM, an order, a lift, a traffic light: all of these.

A **state diagram** shows:

- the **states** (boxes),
- the **events** (things that happen), and
- the **transitions** (arrows from one state to another).

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

Press ▶ to feed events into the machine. Look at the first event: `select item` is **not allowed** in the `Idle` state, so it is rejected. This is the real value of the diagram. It makes you think about **every case**, including the illegal ones.

The same information can be written as a **table**. A table is the best checklist when you write code.

| State \ Event | insert coin | select item | refund | item taken |
|---|---|---|---|---|
| **Idle** | go to Has money | reject | reject | reject |
| **Has money** | stay (add credit) | go to Dispensing | go to Idle | reject |
| **Dispensing** | reject | reject | reject | go to Idle |

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

This `switch` version is fine when there are only 3 or 4 states. When states grow, or each state has a lot of its own behaviour, use the **State pattern** (module 12), where each state becomes a class. The diagram stays the same.

## 4. Activity diagram (optional)

An **activity diagram** is just a flowchart for a process. It is useful for things like checkout or sign-up. A simple flow like this is often enough:

:::flow Checkout process
Cart | items and quantities
Address | where to deliver
Payment | card / UPI / COD
Place order | stock reserved
Confirm | email and SMS sent
:::

## Which diagram should I draw?

| You want to show | Draw |
|---|---|
| What the system must do | use-case list |
| The classes and how they connect | **class diagram** (always) |
| How objects work together in one scenario | **sequence diagram** (for 1 or 2 main flows) |
| An object that changes over time | **state diagram** |
| A business process with branches | flowchart |

In a 45-minute round, a class diagram, one sequence diagram and (if needed) one state diagram is plenty.

## Short answer to say in an interview

:::interview Why do you draw a sequence diagram or a state diagram?
"The class diagram shows what classes exist. A sequence diagram checks that the objects can really work together for a use case, and it often shows a missing method. A state diagram is for objects like an order or a vending machine, where the allowed actions depend on the current state."
:::

```quiz
? What is a sequence diagram best used for in an LLD interview?
- To show the database tables
+ To check that the objects work together for one use case, and to find missing methods
- To list all classes
> Going through a scenario message by message exposes gaps in your classes.
? Which object most needs a state diagram?
- A Money value
+ A vending machine, order or lift whose behaviour depends on its current state
- A helper class with only static functions
> State diagrams show which events are allowed in which state.
? What does a state table list for every state and event?
- The class names
+ The next state (or "reject")
- The method bodies
> It is a checklist that turns straight into a switch or into State classes.
```

:::keypoints
- Use cases decide the scope. A sequence diagram checks one flow. A state diagram is for things with a life cycle.
- A state table (state and event gives next state) is the easiest bridge from diagram to code.
- If a flow needs a method you do not have, update the class diagram.
:::
