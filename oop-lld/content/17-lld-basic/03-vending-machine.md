---
title: Design a Vending Machine
level: easy
time: 45
summary: The classic State-pattern problem: money handling, item selection, dispensing, refunds and change, an inventory of slots, and out-of-stock handling, with one class per state and a complete runnable simulation.
---

:::problem Design a Vending Machine {level=easy tags="state machine,State pattern,inventory,money"}
Design a vending machine that sells snacks. A customer inserts coins, selects an item by its code, and receives the item and any change. The machine must handle insufficient money, sold-out items, cancelling (refund) and restocking by an operator.

:::hint Hint
The machine behaves differently depending on what it is doing right now: waiting, holding money, dispensing. That is a **lifecycle**, so draw the state diagram first, then give each state its own class.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Money? | coins of 1, 2, 5, 10 rupees; amounts in whole rupees; **exact change** is returned with a greedy coin algorithm |
| Items? | a slot has a code (A1...), an item name, a price and a quantity |
| Operations? | insert coin, select item, cancel (refund), restock (operator) |
| Errors? | not enough money (stay in `HasMoney`), sold out (reject), unknown code |
| Out of scope | card/UPI payment, multiple machines, remote monitoring |

## Step 2: the lifecycle (state diagram)

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

Operations that make no sense in a state (selecting with no money) are **rejected with a message**, not ignored silently.

## Step 3: entities

- **Coin** (enum with a value): `One, Two, Five, Ten`.
- **Slot**: code, item name, price, quantity. **Inventory**: slots by code.
- **ChangeMaker**: computes change from a rupee amount (greedy, largest coin first).
- **State** (interface): `insertCoin`, `select`, `cancel`. Concrete: `IdleState`, `HasMoneyState`, `DispensingState`.
- **VendingMachine** (context): holds the inventory, the current credit and the current state; delegates every operation.

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

## Step 4: design decisions

- **State pattern** (one class per state) instead of a `switch` in every method: adding "OutOfService" later is a new class.
- States are **stateless and shared** (the credit and inventory live in the machine), so one instance of each is enough.
- **Dispensing is a state** so that, in a concurrent version, further coins and selections are rejected while the motor runs.
- **Change** is a separate small class: it is pure logic, easily unit tested.
- Money is an `int` of rupees (a toy); a real machine would use a `Money` value type.

## Step 5: the code

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

| Case | Handling |
|---|---|
| Exact change unavailable | real machines keep a coin float; add `canMakeChange()` and refuse the sale (or show "exact change only") |
| Power cut during dispensing | persist the transaction before moving the motor, recover on start-up (Memento/log) |
| Concurrent use (one person at a time physically) | a mutex around the public operations; `DispensingState` already refuses overlapping requests |
| Two items with the same code | rejected when loading |
| Price changes | a `PricingPolicy` (Strategy) if prices vary by time or location |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Add card/UPI" | a `PaymentMethod` interface; `CashPayment` is today's behaviour |
| "Out of service / maintenance mode" | new `OutOfServiceState`; all operations refused |
| "Promotions: buy 2 get 1" | a `DiscountPolicy` Strategy applied on `select` |
| "Remote monitoring" | Observer: the machine publishes `LowStock`, `Fault` events |
| "Several machines" | `VendingMachine` stays as is; add a `Fleet` that holds many and a `Restocker` that reacts to events |

```quiz
? Why is Dispensing modelled as its own state?
- To save memory
+ Operations during dispensing (coins, selections, cancel) must behave differently, and a state class expresses that
- Because the motor needs a class
> The State pattern gives each lifecycle phase its own behaviour.
? What happens when the customer selects an item that costs more than the credit?
- The machine takes the money
+ It tells them the price and stays in HasMoney so they can add coins
- It cancels
> No transition: only a message.
```

:::keypoints
- Draw the state diagram first; one class per state; the machine delegates every operation.
- Stateless states can be shared; credit and inventory live in the context.
- Separate pure logic (ChangeMaker) from the lifecycle. Reject invalid operations with clear messages.
- Extensions: payment strategy, discount policy, out-of-service state, events for monitoring.
:::
