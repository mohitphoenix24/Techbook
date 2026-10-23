---
title: Design a Coffee Machine
level: easy
time: 45
summary: Beverages defined by recipes of ingredients, an ingredient inventory with low-stock alerts, a template method for the brewing steps, a factory/registry for recipes, optional add-ons as decorators, and clear error handling when something is missing.
---

:::problem Design a Coffee Machine {level=easy tags="Template Method,Factory,Decorator,inventory,Observer"}
Design a coffee machine that makes beverages (espresso, latte, tea, hot chocolate). Each beverage needs certain quantities of ingredients (water, milk, coffee, tea leaves, sugar). The machine holds an ingredient inventory, refuses a drink if an ingredient is short, and alerts the operator when stock is low. New beverages and add-ons (extra shot, sugar) should be easy to add.

:::hint Hint
A beverage is **data** (a recipe: ingredient to quantity) plus a common **brewing procedure** (check, heat, mix, serve). Keep the procedure in one place (Template Method) and make recipes plain data. Add-ons that change the recipe and price are decorators.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Beverages? | espresso, latte, tea, hot chocolate; more later |
| Ingredients? | water, milk, coffee, tea leaves, chocolate, sugar, in ml or grams |
| Failure? | if any ingredient is short, refuse and say which one; do **not** consume anything |
| Alerts? | notify when an ingredient falls below a threshold |
| Add-ons? | extra shot, extra sugar; each changes the recipe and the price |
| Concurrency? | one drink at a time per machine (a mutex on the inventory) |
| Out of scope | payment, UI, cleaning cycles |

## Step 2: entities

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

## Step 3: the brewing flow

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

## Step 4: design decisions

- **Recipe = data** (a map of needs). Adding "cappuccino" is a data entry, not a class. Classes only where **behaviour** differs.
- **Template Method** (`brew`): `check → consume → heat → mix → serve`. A beverage that needs a special step (tea steeping) overrides just that hook.
- **Add-ons = Decorator-like transformations** of a recipe: `ExtraShot` adds 18 g coffee and 20 rupees. They compose in any order.
- **All-or-nothing consumption**: check **all** ingredients first, then consume. No half-made drinks.
- **Observer** for low stock keeps alerting out of the brewing code.

## Step 5: the code

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

| Case | Handling |
|---|---|
| Ingredient short | refuse, name the **first** shortage, consume nothing |
| Add-on changes price and needs | applied on a copy; the catalogue recipe stays pristine |
| Unknown drink or add-on | clear message |
| Several alerts for one drink | each ingredient crossing the threshold alerts once per consumption |
| Concurrent orders | one mutex around `make` (check and consume must be atomic) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "New beverage" | `addRecipe(...)`: no code change; a special step means a new `Brewer` subclass |
| "Size options (small/large)" | a `SizeModifier` that scales quantities (a Strategy over `Needs`) |
| "Payment" | a `PaymentMethod` interface called before brewing |
| "Cleaning and descaling cycles" | a counter and a maintenance state (State pattern) that blocks brewing |
| "Many machines reporting to HQ" | the listener forwards alerts to a message queue |
| "Recipes from a config file" | a `RecipeRepository` parsing JSON; the machine depends on the interface |
| "Ingredient substitution (oat milk)" | recipes list acceptable alternatives; the check picks the first available |

```quiz
? Why are recipes data instead of one class per drink?
- It is shorter
+ Drinks differ in quantities, not behaviour, so a new drink needs no new class
- Classes are slow
> Use classes where behaviour varies, data where only values vary.
? Why check every ingredient before consuming any?
- To print nicer messages
+ A failed drink must not consume anything (all-or-nothing)
- Because maps are unordered
> Otherwise a shortage halfway would waste the first ingredients.
```

:::keypoints
- Recipes as data; Template Method for the brewing steps; add-ons transform a copy of the recipe; Observer for low-stock.
- Check all, then consume. Keep the catalogue immutable and apply options to copies.
- Extensions: sizes as a quantity strategy, payment interface, maintenance state, recipe repository.
:::
