---
title: Facade
level: easy
time: 25
summary: One simple entry point over a complicated subsystem, a home-cinema and an order-fulfilment example, how Facade reduces coupling without hiding the subsystem, and how it differs from Adapter and Mediator.
---

:::def Facade
Provide a **unified, simpler interface** to a set of interfaces in a subsystem. Facade defines a higher-level interface that makes the subsystem easier to use.
:::

:::analogy Think of it like this
A hotel concierge. To get a dinner table, a taxi and theatre tickets you could call the restaurant, the cab company and the box office yourself. Or you say "arrange my evening" to the concierge, who calls them all. You deal with **one person**; the complexity is behind the desk.
:::

## The problem

To start a movie you must dim the lights, lower the screen, switch on the projector, set its input, switch on the amplifier, choose the surround mode, and finally play. Every client that wants to "watch a movie" repeats this sequence and knows all six classes.

```cpp run title="Without a facade: clients juggle the whole subsystem"
#include <iostream>
using namespace std;

struct Lights    { void dim(int pct) { cout << "  lights dimmed to " << pct << "%\n"; } void on() { cout << "  lights on\n"; } };
struct Screen    { void down() { cout << "  screen down\n"; } void up() { cout << "  screen up\n"; } };
struct Projector { void on() { cout << "  projector on\n"; } void input(const char* s) { cout << "  projector input " << s << "\n"; } void off() { cout << "  projector off\n"; } };
struct Amplifier { void on() { cout << "  amplifier on\n"; } void surround() { cout << "  surround sound on\n"; } void off() { cout << "  amplifier off\n"; } };
struct Player    { void play(const char* m) { cout << "  playing '" << m << "'\n"; } void stop() { cout << "  player stopped\n"; } };

int main() {
    Lights l; Screen s; Projector p; Amplifier a; Player pl;
    cout << "watch a movie:\n";
    l.dim(10); s.down(); p.on(); p.input("player"); a.on(); a.surround(); pl.play("Lagaan");
    // every client that wants a movie night must repeat this, in the right order, and remember how to shut it all down
}
```

## The facade

```cpp run title="HomeTheaterFacade: watchMovie() and endMovie()"
#include <iostream>
using namespace std;

struct Lights    { void dim(int pct) { cout << "  lights dimmed to " << pct << "%\n"; } void on() { cout << "  lights on\n"; } };
struct Screen    { void down() { cout << "  screen down\n"; } void up() { cout << "  screen up\n"; } };
struct Projector { void on() { cout << "  projector on\n"; } void input(const char* s) { cout << "  projector input " << s << "\n"; } void off() { cout << "  projector off\n"; } };
struct Amplifier { void on() { cout << "  amplifier on\n"; } void surround() { cout << "  surround sound on\n"; } void off() { cout << "  amplifier off\n"; } };
struct Player    { void play(const char* m) { cout << "  playing '" << m << "'\n"; } void stop() { cout << "  player stopped\n"; } };

class HomeTheaterFacade {                                 // the simple interface
    Lights lights_; Screen screen_; Projector projector_; Amplifier amp_; Player player_;
public:
    void watchMovie(const char* title) {
        cout << "Get ready to watch '" << title << "'\n";
        lights_.dim(10);
        screen_.down();
        projector_.on();
        projector_.input("player");
        amp_.on();
        amp_.surround();
        player_.play(title);
    }
    void endMovie() {
        cout << "Shutting down\n";
        player_.stop();
        amp_.off();
        projector_.off();
        screen_.up();
        lights_.on();
    }
};

int main() {
    HomeTheaterFacade theater;
    theater.watchMovie("Lagaan");
    theater.endMovie();
}
```

```viz algo=uml title="Facade"
class Client
class HomeTheaterFacade
  + watchMovie(title: string): void
  + endMovie(): void
class Lights
class Screen
class Projector
class Amplifier
class Player
Client --> HomeTheaterFacade
HomeTheaterFacade --> Lights
HomeTheaterFacade --> Screen
HomeTheaterFacade --> Projector
HomeTheaterFacade --> Amplifier
HomeTheaterFacade --> Player
```

The client now knows **one** class and two methods. If you replace the projector with a TV, only the facade changes.

## A realistic example: order fulfilment

In an e-commerce system, "place an order" involves inventory, payment, shipping and notifications. A facade presents it as one operation, and handles the order and the failure cases.

```cpp run title="OrderFacade: one call, four subsystems, with rollback"
#include <iostream>
#include <string>
using namespace std;

class Inventory {
    int stock_ = 3;
public:
    bool reserve(int qty) { if (qty > stock_) return false; stock_ -= qty; cout << "  inventory: reserved " << qty << "\n"; return true; }
    void release(int qty) { stock_ += qty; cout << "  inventory: released " << qty << "\n"; }
};
class Payment {
public:
    bool charge(const string& customer, double amount) {
        if (amount > 5000) { cout << "  payment: declined " << amount << "\n"; return false; }
        cout << "  payment: charged " << customer << " " << amount << "\n"; return true;
    }
};
class Shipping { public: string schedule(const string& customer) { cout << "  shipping: scheduled for " << customer << "\n"; return "TRK-1001"; } };
class Notifier { public: void send(const string& customer, const string& text) { cout << "  notify " << customer << ": " << text << "\n"; } };

class OrderFacade {
    Inventory inventory_; Payment payment_; Shipping shipping_; Notifier notifier_;
public:
    bool placeOrder(const string& customer, int qty, double price) {
        cout << "placing order for " << customer << "\n";
        if (!inventory_.reserve(qty)) { notifier_.send(customer, "out of stock"); return false; }
        if (!payment_.charge(customer, qty * price)) {
            inventory_.release(qty);                        // the facade owns the failure handling
            notifier_.send(customer, "payment failed");
            return false;
        }
        string tracking = shipping_.schedule(customer);
        notifier_.send(customer, "order confirmed, tracking " + tracking);
        return true;
    }
};

int main() {
    OrderFacade shop;
    shop.placeOrder("Asha", 2, 400);
    shop.placeOrder("Ravi", 1, 6000);
    shop.placeOrder("Meera", 5, 10);
}
```

## Properties of a good Facade

| Property | Meaning |
|---|---|
| **Simplifies** | exposes only the common use cases |
| **Does not hide** | the subsystem classes remain accessible for advanced users who need them |
| **Adds no new business logic** (ideally) | it orchestrates; the real work stays in the subsystem classes |
| **Stateless where possible** | easier to reason about and test |
| **Can be layered** | a big system may have facades per area |

## Facade vs Adapter vs Mediator

| | Facade | Adapter | Mediator |
|---|---|---|---|
| Purpose | **simplify** a subsystem | **convert** one interface to another | **coordinate** peers that talk to each other |
| Knows about | several subsystem classes | one adaptee | several colleague classes |
| Do the subsystem classes know it? | **no**: the subsystem is unaware | no | **yes**: colleagues talk through the mediator |
| Interface | new, simpler | the one the client expects | n/a |

## Pitfalls

- A facade that grows to **hundreds of methods** becomes a **god class**. Split it by area.
- If all clients still reach around the facade into the subsystem, it adds nothing.
- Do not put **business rules** in it. Keep it a thin coordinator.
- Facade is **not** an excuse to leave the subsystem a mess. It simplifies use; clean the subsystem separately.

:::interview Facade vs Adapter?
"A facade gives a *simpler* interface to a whole subsystem of several classes; the subsystem does not know about it and remains usable directly. An adapter makes *one existing class* match an interface a client already expects, usually for a third-party class. Facade is about simplification, Adapter is about compatibility."
:::

```quiz
? What is the main goal of Facade?
- Converting an incompatible interface
+ Providing a simple, unified interface to a complex subsystem
- Adding behaviour dynamically
> Clients call one method instead of orchestrating many classes.
? Does the subsystem need to know about the facade?
- Yes
+ No: the facade depends on the subsystem, not the other way round
> That is what distinguishes it from a Mediator.
? What is a common failure mode of a facade?
- It is too small
+ It grows into a god class holding too many operations and logic
> Keep it thin, and split by area when it grows.
```

:::keypoints
- Facade: one simple entry point over several subsystem classes; the subsystem stays accessible.
- It reduces coupling for clients and gives you one place to change orchestration.
- Keep it thin and stateless; do not let it become a god class. Not the same as Adapter or Mediator.
:::
