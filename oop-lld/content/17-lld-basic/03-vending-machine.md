---
title: Design a Vending Machine
level: easy
time: 45
summary: The classic State pattern problem. Handle coins, choosing an item, dispensing, refunds and change, and out-of-stock items, with one class for each state and a complete running simulation.
---

:::problem Design a Vending Machine {level=easy tags="state machine,State pattern,inventory,money"}
Design a vending machine that sells snacks. A customer puts in coins, chooses an item by its code, and gets the item and any change. The machine must handle: not enough money, sold-out items, cancelling (refund), and restocking by the operator.

:::hint Hint
The machine behaves differently depending on what it is doing right now: waiting, holding money, or dispensing. That is a **life cycle**. Draw the state diagram first, then give each state its own class.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Money? | coins of 1, 2, 5 and 10 rupees. Amounts in whole rupees. **Exact change** is given using a greedy method (largest coin first) |
| Items? | a slot has a code (A1...), an item name, a price and a quantity |
| Actions? | insert coin, select item, cancel (refund), restock (operator) |
| Errors? | not enough money (stay in `HasMoney`), sold out (refuse), unknown code |
| Not needed | card or UPI payment, many machines, remote monitoring |

## Step 2: The life cycle (state diagram)

```viz algo=state title="Vending machine states"
state Idle "Idle" [initial] @0,1
state HasMoney "Has money" @1,1
state Dispensing "Dispensing" @2,1
Idle -> HasMoney : insert coin
HasMoney -> HasMoney : insert coin
HasMoney -> Idle : cancel
HasMoney -> Dispensing : select (enough money)
HasMoney -> HasMoney : select (not enough / sold out)
Dispensing -> Idle : item and change given
play: select, insert coin, insert coin, select, insert coin, cancel
```

Actions that make no sense in a state (like choosing an item with no money) are **refused with a message**. They are not ignored silently.

## Step 3: Find the classes

- **Coin** (enum with a value): `One, Two, Five, Ten`.
- **Slot**: code, item name, price, quantity. **Inventory**: the slots by code.
- **ChangeMaker**: works out the change for an amount (largest coin first).
- **State** (interface): `insertCoin`, `select`, `cancel`. Three versions: `IdleState`, `HasMoneyState`, `DispensingState`.
- **VendingMachine** (the context): holds the inventory, the current credit and the current state. It passes every action to the state.

```viz algo=uml title="Vending machine: State pattern"
class VendingMachine
  - state: State
  - credit: int
  - inventory: Inventory
  + insertCoin(c: Coin): void
  + select(code: string): void
  + cancel(): void
  + restock(code: string, qty: int): void
interface State
  + insertCoin(m: VendingMachine, c: Coin): void
  + select(m: VendingMachine, code: string): void
  + cancel(m: VendingMachine): void
class IdleState
class HasMoneyState
class DispensingState
class Inventory
  - slots: map<string, Slot>
class Slot
  - item: string
  - price: int
  - qty: int
class ChangeMaker
  + change(amount: int): Coin[]
VendingMachine o-- State
IdleState ..|> State
HasMoneyState ..|> State
DispensingState ..|> State
VendingMachine *-- Inventory
Inventory *-- Slot
VendingMachine ..> ChangeMaker
```

## Step 4: Design decisions

- **State pattern**: one class per state, instead of a `switch` in every method. Adding "OutOfService" later is just a new class.
- The states **hold no data**, so one shared copy of each is enough. The credit and the inventory live in the machine.
- **Dispensing is its own state.** If many things happen at the same time, new coins and new selections are refused while the motor runs.
- **Change** is a separate small class. It is simple logic and easy to test.
- Money is an `int` of rupees here (to keep it simple). A real machine would use a `Money` type.

## Step 5: The code

```cpp run title="Vending machine: complete"
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using namespace std;

enum class Coin { One = 1, Two = 2, Five = 5, Ten = 10 };

class ChangeMaker {
public:
    static vector<Coin> change(int amount) {               // greedy works for this coin system
        vector<Coin> out;
        for (Coin c : {Coin::Ten, Coin::Five, Coin::Two, Coin::One})
            while (amount >= static_cast<int>(c)) { out.push_back(c); amount -= static_cast<int>(c); }
        return out;
    }
    static string describe(const vector<Coin>& coins) {
        if (coins.empty()) return "none";
        string s;
        for (Coin c : coins) s += "Rs" + to_string(static_cast<int>(c)) + " ";
        return s;
    }
};

struct Slot { string item; int price; int qty; };

class Inventory {
    map<string, Slot> slots_;
public:
    void load(const string& code, string item, int price, int qty) { slots_[code] = {move(item), price, qty}; }
    void add(const string& code, int qty) { slots_.at(code).qty += qty; }
    const Slot* find(const string& code) const { auto it = slots_.find(code); return it == slots_.end() ? nullptr : &it->second; }
    void takeOne(const string& code) { --slots_.at(code).qty; }
};

class VendingMachine;

class State {
public:
    virtual ~State() = default;
    virtual void insertCoin(VendingMachine& m, Coin c) = 0;
    virtual void select(VendingMachine& m, const string& code) = 0;
    virtual void cancel(VendingMachine& m) = 0;
    virtual const char* name() const = 0;
};

class VendingMachine {
    Inventory inventory_;
    int credit_ = 0;
    State* state_;
public:
    explicit VendingMachine(Inventory inv);
    // the public API simply delegates to the current state
    void insertCoin(Coin c) { state_->insertCoin(*this, c); }
    void select(const string& code) { state_->select(*this, code); }
    void cancel() { state_->cancel(*this); }
    void restock(const string& code, int qty) { inventory_.add(code, qty); cout << "  [operator] restocked " << code << " +" << qty << "\n"; }

    // services used by the states
    Inventory& inventory() { return inventory_; }
    int credit() const { return credit_; }
    void addCredit(int n) { credit_ += n; }
    void clearCredit() { credit_ = 0; }
    void setState(State& s) { state_ = &s; }
    const char* stateName() const { return state_->name(); }
};

struct IdleState : State {
    void insertCoin(VendingMachine& m, Coin c) override;
    void select(VendingMachine&, const string&) override { cout << "  insert coins first\n"; }
    void cancel(VendingMachine&) override { cout << "  nothing to cancel\n"; }
    const char* name() const override { return "Idle"; }
};
struct HasMoneyState : State {
    void insertCoin(VendingMachine& m, Coin c) override { m.addCredit(static_cast<int>(c)); cout << "  credit is now Rs" << m.credit() << "\n"; }
    void select(VendingMachine& m, const string& code) override;
    void cancel(VendingMachine& m) override;
    const char* name() const override { return "HasMoney"; }
};
struct DispensingState : State {
    void insertCoin(VendingMachine&, Coin) override { cout << "  please wait, dispensing\n"; }
    void select(VendingMachine&, const string&) override { cout << "  please wait, dispensing\n"; }
    void cancel(VendingMachine&) override { cout << "  too late to cancel\n"; }
    const char* name() const override { return "Dispensing"; }
};

IdleState idle; HasMoneyState hasMoney; DispensingState dispensing;     // shared, stateless state objects

VendingMachine::VendingMachine(Inventory inv) : inventory_(move(inv)), state_(&idle) {}

void IdleState::insertCoin(VendingMachine& m, Coin c) {
    m.addCredit(static_cast<int>(c));
    cout << "  credit is now Rs" << m.credit() << "\n";
    m.setState(hasMoney);
}
void HasMoneyState::cancel(VendingMachine& m) {
    cout << "  refund: " << ChangeMaker::describe(ChangeMaker::change(m.credit())) << "\n";
    m.clearCredit();
    m.setState(idle);
}
void HasMoneyState::select(VendingMachine& m, const string& code) {
    const Slot* slot = m.inventory().find(code);
    if (!slot) { cout << "  unknown code " << code << "\n"; return; }
    if (slot->qty == 0) { cout << "  " << slot->item << " is sold out\n"; return; }
    if (m.credit() < slot->price) { cout << "  " << slot->item << " costs Rs" << slot->price << ", you have Rs" << m.credit() << "\n"; return; }

    m.setState(dispensing);                                // the motor runs; other requests are refused
    m.inventory().takeOne(code);
    int changeDue = m.credit() - slot->price;
    cout << "  dispensing " << slot->item << "; change: " << ChangeMaker::describe(ChangeMaker::change(changeDue)) << "\n";
    m.clearCredit();
    m.setState(idle);
}

int main() {
    Inventory inv;
    inv.load("A1", "Chips", 20, 1);
    inv.load("B2", "Biscuits", 12, 5);
    VendingMachine vm(move(inv));

    cout << "select with no money:\n";               vm.select("A1");
    cout << "buy biscuits with Rs 20:\n";            vm.insertCoin(Coin::Ten); vm.insertCoin(Coin::Ten); vm.select("B2");
    cout << "not enough money:\n";                   vm.insertCoin(Coin::Five); vm.select("A1");
    cout << "add more and buy the last chips:\n";    vm.insertCoin(Coin::Ten); vm.insertCoin(Coin::Five); vm.select("A1");
    cout << "chips are sold out now:\n";             vm.insertCoin(Coin::Ten); vm.select("A1");
    cout << "cancel gives money back:\n";            vm.cancel();
    cout << "operator restocks, then a sale:\n";     vm.restock("A1", 3); vm.insertCoin(Coin::Ten); vm.insertCoin(Coin::Ten); vm.select("A1");
    cout << "final state: " << vm.stateName() << "\n";
}
```

## Edge cases to mention

| Case | How to handle |
|---|---|
| The machine cannot make exact change | real machines keep spare coins. Add `canMakeChange()` and refuse the sale (or show "exact change only") |
| Power cut while dispensing | save the sale before the motor moves, and recover when it starts again |
| Used by many at once (a real machine has one person at a time) | one mutex around the public actions. `DispensingState` already refuses overlapping requests |
| Two items with the same code | refuse when loading |
| Prices change | a `PricingPolicy` (Strategy) if prices depend on time or place |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Add card or UPI" | a `PaymentMethod` interface. `CashPayment` is today's behaviour |
| "A maintenance mode" | a new `OutOfServiceState`. All actions are refused |
| "Offers like buy 2 get 1" | a `DiscountPolicy` (Strategy) used inside `select` |
| "Remote monitoring" | Observer: the machine announces `LowStock` and `Fault` |
| "Many machines" | keep `VendingMachine` as it is. Add a `Fleet` that holds many, and a `Restocker` that listens for events |

## Short answer to say in an interview

:::interview Why use the State pattern for a vending machine?
"The machine behaves differently when it is idle, holding money or dispensing. Instead of a switch in every method, each state is a class that decides what each action does in that state, and what the next state is. The machine just passes the call to the current state. A new state, like out of service, is a new class and does not change the others."
:::

```quiz
? Why is Dispensing its own state?
- To save memory
+ Actions during dispensing (coins, choosing, cancel) must behave differently, and a state class shows that clearly
- Because the motor needs a class
> Each phase of the life cycle gets its own behaviour.
? What happens if the customer chooses an item that costs more than the credit?
- The machine keeps the money
+ It shows the price and stays in HasMoney so the customer can add more coins
- It cancels
> There is no state change. Only a message.
```

:::keypoints
- Draw the state diagram first. One class per state. The machine passes every action to the current state.
- States without data can be shared. Credit and inventory live in the machine.
- Keep simple logic (ChangeMaker) apart from the life cycle. Refuse wrong actions with a clear message.
- Extensions: payment strategy, discount policy, out-of-service state, events for monitoring.
:::
