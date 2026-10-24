---
title: Facade
level: easy
time: 25
summary: One simple front door for a complicated group of classes. A home theatre example, an order example, and how Facade differs from Adapter and Mediator.
---

## What is the Facade pattern?

Don't memorise the definition yet. Think of it like this:

> "Starting a movie needs 6 steps on 6 different devices. Instead, I want **one button** that says 'Watch movie'."

That one button is the Facade.

:::analogy Think of a hotel concierge
To get a dinner table, a taxi and theatre tickets, you could call the restaurant, the cab company and the box office yourself. Or you can tell the concierge, "arrange my evening". You talk to **one person**, and the hard work happens behind the desk.
:::

:::def Facade
One **simple interface** placed in front of a **group of complex classes**, so that using them becomes easy.
:::

## The problem

To start a movie you must: dim the lights, lower the screen, switch on the projector, set its input, switch on the amplifier, choose the sound mode, and finally press play. Every user who wants to "watch a movie" must repeat these steps and know all six classes.

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

Now the user knows **one class** and **two methods**. If you replace the projector with a TV one day, only the facade changes. The users stay the same.

## A real example: placing an order

In a shopping app, "place an order" touches inventory, payment, shipping and notifications. A facade makes it one operation. It also takes care of the order of steps and what to do when something fails.

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

## What makes a good facade?

| Property | Meaning |
|---|---|
| **Simple** | it shows only the common use cases |
| **Not a wall** | the inner classes are still available for people who need them |
| **No new business rules** (ideally) | it only coordinates. The real work stays in the inner classes |
| **No stored state** if possible | easier to understand and test |
| **Can be layered** | a big system may have one facade per area |

## Facade vs Adapter vs Mediator

| | Facade | Adapter | Mediator |
|---|---|---|---|
| Purpose | **make simpler** | **convert** an interface | **coordinate** peers who talk to each other |
| Works with | several classes | one class | several classes |
| Do the inner classes know about it? | **no** | no | **yes**, they talk through it |

## Mistakes to avoid

- A facade with hundreds of methods turns into a **god class**. Split it by area.
- If everyone still bypasses the facade, it is useless.
- Do not put **business rules** in it. Keep it thin.
- A facade does not clean up a messy subsystem. It only makes it easier to use.

## Short answer to say in an interview

:::interview What is the difference between Facade and Adapter?
"A facade gives a simpler interface to a whole group of classes. The group does not know about the facade, and can still be used directly. An adapter makes one existing class match an interface that the user already expects, usually for a third-party class. Facade is about making things simple. Adapter is about making things fit."
:::

```quiz
? What is the main goal of Facade?
- To convert an incompatible interface
+ To give a simple, single interface to a complex group of classes
- To add behaviour at run time
> Users call one method instead of coordinating many classes.
? Does the subsystem need to know about the facade?
- Yes
+ No. The facade uses the subsystem, not the other way round
> That is what makes it different from a Mediator.
? What is a common problem with facades?
- They are too small
+ They grow into a god class with too many operations and rules
> Keep them thin and split by area.
```

:::keypoints
- Facade = one simple front door over several classes. The inner classes stay available.
- It reduces coupling for users and gives one place to change the steps.
- Keep it thin and without stored state. Do not let it become a god class. It is not the same as Adapter or Mediator.
:::
