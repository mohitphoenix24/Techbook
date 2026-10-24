---
title: Design a Coffee Machine
level: easy
time: 45
summary: Drinks made from recipes, an ingredient store with low-stock alerts, a fixed brewing procedure, add-ons like an extra shot, and clear messages when something is missing.
---

:::problem Design a Coffee Machine {level=easy tags="Template Method,Factory,Decorator,inventory,Observer"}
Design a coffee machine that makes drinks (espresso, latte, tea, hot chocolate). Each drink needs some amount of ingredients (water, milk, coffee, tea leaves, sugar). The machine keeps a store of ingredients, refuses a drink if an ingredient is short, and warns the operator when stock is low. New drinks and add-ons (extra shot, sugar) must be easy to add.

:::hint Hint
A drink is **data** (a recipe: ingredient and amount) plus a common **brewing procedure** (check, heat, mix, serve). Keep the procedure in one place (Template Method) and keep recipes as plain data. Add-ons that change the recipe and price are decorators.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Drinks? | espresso, latte, tea, hot chocolate. More later |
| Ingredients? | water, milk, coffee, tea leaves, chocolate, sugar, in ml or grams |
| If something is short? | refuse, say which one, and do **not** use up anything |
| Alerts? | give a message when an ingredient falls below a limit |
| Add-ons? | extra shot, extra sugar. Each changes the recipe and the price |
| Many users at once? | one drink at a time on a machine (a mutex on the store) |
| Not needed | payment, screen, cleaning cycles |

## Step 2: Find the classes

```viz algo=uml title="Coffee machine"
class CoffeeMachine
  - inventory: Inventory
  - recipes: map<string, Recipe>
  + make(name: string, addOns: string[]): Result
  + refill(i: Ingredient, qty: int): void
class Recipe
  - name: string
  - needs: map<Ingredient, int>
  - price: int
class Inventory
  - stock: map<Ingredient, int>
  + hasAll(needs: map): string
  + consume(needs: map): void
  + low(): Ingredient[]
interface InventoryListener
  + onLow(i: Ingredient, left: int): void
abstract class Beverage
  + prepare(): void
  # heat(): void
  # mix(): void
  # serve(): void
class AddOn
  - name: string
  - extra: map<Ingredient, int>
  - price: int
CoffeeMachine *-- Inventory
CoffeeMachine o-- Recipe
CoffeeMachine ..> AddOn
Inventory o-- InventoryListener
```

## Step 3: The brewing flow

```viz algo=seq title="Making a latte with an extra shot"
participant u Customer [user]
participant m CoffeeMachine [box]
participant r Recipes [list]
participant i Inventory [db]
u -> m : make("latte", ["extra shot"])
m -> r : recipe("latte") + add-ons | The add-ons are applied to a COPY of the recipe: the base recipe stays unchanged.
r --> m : needs {coffee 18g, milk 150ml, water 30ml}
m -> i : check all ingredients | If something is short, say what and stop: nothing is consumed.
i --> m : ok
m -> i : consume(needs)
m -> m : heat, mix, serve (template steps)
i ->> m : low-stock alert (milk) | Observer: the operator is told.
```

## Step 4: Design decisions

- **A recipe is data** (a map of what is needed). Adding "cappuccino" is just a new entry, not a new class. We use classes only where the **behaviour** is different.
- **Template Method** (`brew`): `check, use up, heat, mix, serve`. A drink that needs a special step (like tea steeping) overrides just that step.
- **Add-ons work like Decorators:** they change a recipe. `ExtraShot` adds 18 g of coffee and 20 rupees. They can be joined in any order.
- **All or nothing:** we check **all** ingredients first, and only then use them up. No half-made drinks.
- **Observer** for low stock keeps the alerts out of the brewing code.

## Step 5: The code

```cpp run title="Coffee machine: recipes, add-ons, inventory, alerts"
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

enum class Ingredient { Water, Milk, Coffee, Tea, Chocolate, Sugar };
string name(Ingredient i) {
    switch (i) { case Ingredient::Water: return "water"; case Ingredient::Milk: return "milk"; case Ingredient::Coffee: return "coffee";
                 case Ingredient::Tea: return "tea"; case Ingredient::Chocolate: return "chocolate"; case Ingredient::Sugar: return "sugar"; }
    return "?";
}
using Needs = map<Ingredient, int>;

struct Recipe { string name; Needs needs; int price; };

// ---------- add-ons: transform a recipe ----------
struct AddOn {
    string name; Needs extra; int price;
    Recipe apply(Recipe r) const { for (auto& [i, q] : extra) r.needs[i] += q; r.price += price; r.name += " + " + name; return r; }
};

class Inventory {
    map<Ingredient, int> stock_;
    int lowLevel_;
    vector<function<void(Ingredient, int)>> listeners_;
public:
    explicit Inventory(int lowLevel) : lowLevel_(lowLevel) {}
    void onLow(function<void(Ingredient, int)> f) { listeners_.push_back(move(f)); }
    void refill(Ingredient i, int qty) { stock_[i] += qty; }
    string missing(const Needs& needs) const {              // "" if everything is available, else the first shortage
        for (auto& [i, q] : needs) {
            auto it = stock_.find(i);
            int have = it == stock_.end() ? 0 : it->second;
            if (have < q) return name(i) + " (need " + to_string(q) + ", have " + to_string(have) + ")";
        }
        return "";
    }
    void consume(const Needs& needs) {
        for (auto& [i, q] : needs) {
            stock_[i] -= q;
            if (stock_[i] < lowLevel_) for (auto& l : listeners_) l(i, stock_[i]);
        }
    }
    int level(Ingredient i) const { auto it = stock_.find(i); return it == stock_.end() ? 0 : it->second; }
};

// ---------- template method: the fixed brewing procedure ----------
class Brewer {
public:
    virtual ~Brewer() = default;
    void brew(const Recipe& r) {                            // THE TEMPLATE: order is fixed
        heat();
        mix(r);
        serve(r);
    }
protected:
    virtual void heat() { cout << "    heating water\n"; }
    virtual void mix(const Recipe& r) { cout << "    mixing:"; for (auto& [i, q] : r.needs) cout << " " << name(i) << "=" << q; cout << "\n"; }
    virtual void serve(const Recipe& r) { cout << "    served: " << r.name << "\n"; }
};
class TeaBrewer : public Brewer {                           // only the differing step is overridden
protected:
    void heat() override { cout << "    heating water to 90C and steeping the leaves\n"; }
};

class CoffeeMachine {
    Inventory inv_;
    map<string, Recipe> recipes_;
    map<string, AddOn> addOns_;
    Brewer coffeeBrewer_;
    TeaBrewer teaBrewer_;
public:
    explicit CoffeeMachine(int lowLevel) : inv_(lowLevel) {}
    Inventory& inventory() { return inv_; }
    void addRecipe(Recipe r) { recipes_[r.name] = move(r); }
    void addAddOn(AddOn a) { addOns_[a.name] = move(a); }

    bool make(const string& drink, const vector<string>& extras = {}) {
        auto it = recipes_.find(drink);
        if (it == recipes_.end()) { cout << "  unknown drink '" << drink << "'\n"; return false; }
        Recipe r = it->second;                              // a COPY: add-ons never change the catalogue
        for (const auto& e : extras) {
            auto a = addOns_.find(e);
            if (a == addOns_.end()) { cout << "  unknown add-on '" << e << "'\n"; return false; }
            r = a->second.apply(move(r));
        }
        string shortage = inv_.missing(r.needs);
        if (!shortage.empty()) { cout << "  cannot make " << r.name << ": not enough " << shortage << "\n"; return false; }
        inv_.consume(r.needs);                              // all-or-nothing
        cout << "  making " << r.name << " (Rs " << r.price << ")\n";
        (drink == "tea" ? static_cast<Brewer&>(teaBrewer_) : coffeeBrewer_).brew(r);
        return true;
    }
};

int main() {
    CoffeeMachine m(60);                                    // alert when an ingredient drops below 60
    m.inventory().onLow([](Ingredient i, int left) { cout << "    [ALERT] low on " << name(i) << ": " << left << " left\n"; });
    for (auto [i, q] : Needs{{Ingredient::Water, 1000}, {Ingredient::Milk, 500}, {Ingredient::Coffee, 150}, {Ingredient::Tea, 50}, {Ingredient::Sugar, 200}})
        m.inventory().refill(i, q);

    m.addRecipe({"espresso", {{Ingredient::Coffee, 18}, {Ingredient::Water, 30}}, 80});
    m.addRecipe({"latte", {{Ingredient::Coffee, 18}, {Ingredient::Milk, 150}, {Ingredient::Water, 30}}, 120});
    m.addRecipe({"tea", {{Ingredient::Tea, 5}, {Ingredient::Water, 150}, {Ingredient::Milk, 50}}, 40});
    m.addAddOn({"extra shot", {{Ingredient::Coffee, 18}}, 30});
    m.addAddOn({"sugar", {{Ingredient::Sugar, 10}}, 0});

    cout << "1) espresso:\n";                 m.make("espresso");
    cout << "2) latte with extra shot and sugar:\n"; m.make("latte", {"extra shot", "sugar"});
    cout << "3) tea:\n";                       m.make("tea");
    cout << "4) two lattes (milk runs low):\n"; m.make("latte"); m.make("latte");
    cout << "5) one more latte: milk is short, nothing is consumed:\n"; m.make("latte");
    cout << "   coffee left: " << m.inventory().level(Ingredient::Coffee) << "g\n";
    cout << "6) unknown things:\n";            m.make("mocha"); m.make("tea", {"caramel"});
}
```

## Edge cases

| Case | What happens |
|---|---|
| An ingredient is short | refuse, name the **first** shortage, use up nothing |
| An add-on changes the price and needs | it is applied to a **copy**. The main recipe stays unchanged |
| Unknown drink or add-on | a clear message |
| Several alerts for one drink | each ingredient that crosses the limit alerts once |
| Many orders together | one mutex around `make` (checking and using up must be one step) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "A new drink" | `addRecipe(...)`, no code change. A special step means a new `Brewer` subclass |
| "Sizes (small, large)" | a `SizeModifier` that scales the amounts (a Strategy) |
| "Payment" | a `PaymentMethod` interface called before brewing |
| "Cleaning cycles" | a counter and a maintenance state (State pattern) that blocks brewing |
| "Many machines reporting to a head office" | the listener sends alerts to a message queue |
| "Recipes from a file" | a `RecipeRepository` that reads JSON. The machine uses the interface |
| "Use oat milk if milk is finished" | recipes list the allowed alternatives. The check picks the first one available |

## Short answer to say in an interview

:::interview How do you design a coffee machine so new drinks are easy to add?
"I keep a recipe as plain data, a map from ingredient to amount, so a new drink is just a new entry. The brewing steps are fixed in one function (Template Method), and only a special drink overrides a step. Add-ons change a copy of the recipe, like decorators. I check all ingredients before using any, so a failed drink uses up nothing. Low-stock alerts go through an observer."
:::

```quiz
? Why are recipes data and not one class per drink?
- It is shorter
+ Drinks differ in amounts, not in behaviour, so a new drink needs no new class
- Classes are slow
> Use classes where behaviour changes. Use data where only values change.
? Why check every ingredient before using any?
- To print nicer messages
+ A failed drink must not use up anything (all or nothing)
- Because maps are unordered
> Otherwise a shortage in the middle would waste the first ingredients.
```

:::keypoints
- Recipes as data. Template Method for the brewing steps. Add-ons change a copy of the recipe. Observer for low stock.
- Check everything first, then use up. Keep the main recipe unchanged and apply options to a copy.
- Extensions: sizes as a strategy, payment interface, maintenance state, recipe repository.
:::
