---
title: Adapter and Facade
level: intermediate
time: 40
summary: Two patterns for working with interfaces you don't control — the Adapter, which makes an incompatible class fit the interface your code expects (wrapping third-party payment SDKs, in C++ and JavaScript), and the Facade, which hides a complicated subsystem behind one simple entry point (an order checkout facade) — plus how they differ from Decorator and Proxy.
---

Real systems integrate with code they didn't write: payment SDKs, legacy modules, cloud libraries, partner APIs, each with its own method names, data formats and error styles. Two structural patterns keep that mess at the edges of your design.

## Adapter

:::def Adapter
Converts the interface of an existing class into **the interface your code expects**, so classes with incompatible interfaces can work together. Also called a **wrapper**.
:::

**Problem:** your checkout depends on your own `PaymentGateway` interface (good, Dependency Inversion). Now you must support Stripe and a legacy in-house processor, whose SDKs look nothing like your interface: different method names, amounts in different units (cents vs a decimal string), different error handling.

```viz algo=uml title="Adapters let incompatible SDKs plug into your interface"
interface PaymentGateway
  + charge(amountPaise: long, token: string): ChargeResult
class Checkout
class StripeAdapter
  - client: StripeClient
class LegacyAdapter
  - processor: LegacyProcessor
class StripeClient
  + createCharge(params): object
class LegacyProcessor
  + doPayment(amtString, cardRef): int
Checkout --> PaymentGateway
StripeAdapter ..|> PaymentGateway
LegacyAdapter ..|> PaymentGateway
StripeAdapter --> StripeClient : wraps
LegacyAdapter --> LegacyProcessor : wraps
```

:::tabs Adapting two incompatible payment SDKs
```cpp run
#include <bits/stdc++.h>
using namespace std;

// ---- Our interface (what Checkout depends on) ----
struct ChargeResult { bool ok; string reference; string error; };
struct PaymentGateway {
    virtual ~PaymentGateway() = default;
    virtual ChargeResult charge(long amountPaise, const string& token) = 0;
};

// ---- Third-party / legacy code we can't change ----
struct StripeCharge { string id; string status; };
class StripeClient {                                       // takes cents-like minor units + a map of params
public:
    StripeCharge createCharge(const map<string, string>& p) {
        if (p.at("source") == "tok_declined") return {"", "failed"};
        return {"ch_" + p.at("amount"), "succeeded"};
    }
};
class LegacyProcessor {                                    // takes "1299.00" strings, returns a numeric code
public:
    int doPayment(const string& amount, const string& cardRef) { return cardRef.empty() ? 51 : 0; }   // 0 = OK
};

// ---- Adapters: translate calls, units and errors ----
class StripeAdapter : public PaymentGateway {
    StripeClient client_;
public:
    ChargeResult charge(long paise, const string& token) override {
        auto c = client_.createCharge({{"amount", to_string(paise)}, {"currency", "inr"}, {"source", token}});
        return c.status == "succeeded" ? ChargeResult{true, c.id, ""} : ChargeResult{false, "", "card declined"};
    }
};
class LegacyAdapter : public PaymentGateway {
    LegacyProcessor processor_;
public:
    ChargeResult charge(long paise, const string& token) override {
        ostringstream amount;
        amount << paise / 100 << "." << setw(2) << setfill('0') << paise % 100;   // paise -> "1299.00"
        int code = processor_.doPayment(amount.str(), token);
        if (code == 0) return {true, "legacy-" + amount.str(), ""};
        return {false, "", "legacy error code " + to_string(code)};
    }
};

// ---- Our business code never sees a third-party type ----
class Checkout {
    PaymentGateway& gw_;
public:
    explicit Checkout(PaymentGateway& gw) : gw_(gw) {}
    string pay(long paise, const string& token) {
        auto r = gw_.charge(paise, token);
        return r.ok ? "paid, ref " + r.reference : "failed: " + r.error;
    }
};

int main() {
    StripeAdapter stripe;
    LegacyAdapter legacy;
    cout << Checkout(stripe).pay(129900, "tok_visa") << "\n";
    cout << Checkout(stripe).pay(129900, "tok_declined") << "\n";
    cout << Checkout(legacy).pay(129900, "card-881") << "\n";
    cout << Checkout(legacy).pay(129900, "") << "\n";
}
```
```js run
// ---- Third-party / legacy code we can't change ----
class StripeClient {                               // async, minor units, throws on decline
  async createCharge({ amount, currency, source }) {
    if (source === "tok_declined") throw Object.assign(new Error("Your card was declined."), { code: "card_declined" });
    return { id: `ch_${amount}`, status: "succeeded", currency };
  }
}
class LegacyProcessor {                            // sync, "1299.00" strings, numeric return codes
  doPayment(amountString, cardRef) { return cardRef ? 0 : 51; }   // 0 = OK
}

// ---- Adapters: our contract is  charge(amountPaise, token) → Promise<{ ok, reference, error }> ----
class StripeAdapter {
  #client = new StripeClient();
  async charge(amountPaise, token) {
    try {
      const c = await this.#client.createCharge({ amount: amountPaise, currency: "inr", source: token });
      return { ok: true, reference: c.id };
    } catch (e) { return { ok: false, error: e.code === "card_declined" ? "card declined" : "provider error" }; }
  }
}
class LegacyAdapter {
  #processor = new LegacyProcessor();
  async charge(amountPaise, token) {
    const amount = `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, "0")}`;
    const code = this.#processor.doPayment(amount, token);
    return code === 0 ? { ok: true, reference: `legacy-${amount}` } : { ok: false, error: `legacy error code ${code}` };
  }
}

// ---- Our business code never sees a third-party type ----
class Checkout {
  constructor(gateway) { this.gateway = gateway; }
  async pay(amountPaise, token) {
    const r = await this.gateway.charge(amountPaise, token);
    return r.ok ? `paid, ref ${r.reference}` : `failed: ${r.error}`;
  }
}

for (const [gw, token] of [[new StripeAdapter(), "tok_visa"], [new StripeAdapter(), "tok_declined"], [new LegacyAdapter(), "card-881"], [new LegacyAdapter(), ""]])
  console.log(await new Checkout(gw).pay(129900, token));
```
:::

What a good adapter translates: **method names and signatures**, **units and formats** (paise vs "1299.00", timestamps, enums), **error styles** (exceptions vs codes vs status fields, mapped to your error types), and sometimes **sync vs async**. It contains **no business logic**.

Two variants: an **object adapter** (holds the adaptee as a field, shown above, the usual choice) and a **class adapter** (inherits from the adaptee; only in languages with multiple inheritance, and more tightly coupled).

:::tip The anti-corruption layer
At a larger scale, Domain-Driven Design calls a set of adapters around a legacy or external system an **anti-corruption layer**: it stops the other system's model (its names, quirks and data shapes) from leaking into your domain model. Same idea, bigger boundary.
:::

## Facade

:::def Facade
Provides **one simplified interface** to a complex subsystem of many classes. Clients call the facade; the facade coordinates the subsystem. The subsystem classes still exist and can be used directly when needed.
:::

**Problem:** placing an order involves inventory, pricing, payment, shipping and notifications, each a separate class or service with its own API. Every controller (web, mobile API, admin tool) that places orders would repeat the same orchestration and would break whenever the subsystem changes.

```viz algo=arch title="A checkout facade in front of a subsystem"
web      Web controller [browser]
mob      Mobile API [mobile]
facade   CheckoutFacade | placeOrder() [gateway]
inv      Inventory [box]
price    Pricing [service]
pay      Payments [pay]
ship     Shipping [map]
note     Notifications [mail]
--
web -> facade
mob -> facade
facade -> inv : reserve
facade -> price : quote
facade -> pay : charge
facade -> ship : schedule
facade -> note : confirm
```

:::tabs A checkout facade
```cpp run
#include <bits/stdc++.h>
using namespace std;

// ---- The subsystem: several classes with their own APIs ----
class Inventory {
    map<string, int> stock_{{"mug", 5}, {"lamp", 0}};
public:
    bool reserve(const string& sku, int qty) { if (stock_[sku] < qty) return false; stock_[sku] -= qty; return true; }
    void release(const string& sku, int qty) { stock_[sku] += qty; }
};
class Pricing { public: long quote(const string& sku, int qty) const { return (sku == "mug" ? 29900 : 149900) * qty + 4000; } };
class Payments { public: bool charge(const string& user, long paise) { return user != "broke-user"; } };
class Shipping { public: string schedule(const string& sku, const string& city) { return "AWB-" + sku + "-" + city.substr(0, 3); } };
class Notifications { public: void email(const string& user, const string& msg) { cout << "  [email " << user << "] " << msg << "\n"; } };

// ---- The facade: one simple operation, all the coordination inside ----
class CheckoutFacade {
    Inventory inv_; Pricing pricing_; Payments payments_; Shipping shipping_; Notifications notify_;
public:
    string placeOrder(const string& user, const string& sku, int qty, const string& city) {
        if (!inv_.reserve(sku, qty)) return "out of stock";
        long total = pricing_.quote(sku, qty);
        if (!payments_.charge(user, total)) { inv_.release(sku, qty); return "payment failed (stock released)"; }
        string awb = shipping_.schedule(sku, city);
        notify_.email(user, "order confirmed, Rs " + to_string(total / 100) + ", tracking " + awb);
        return "ok " + awb;
    }
};

int main() {
    CheckoutFacade checkout;                        // clients see ONE method
    cout << checkout.placeOrder("asha", "mug", 2, "Pune") << "\n";
    cout << checkout.placeOrder("bilal", "lamp", 1, "Delhi") << "\n";
    cout << checkout.placeOrder("broke-user", "mug", 1, "Agra") << "\n";
}
```
```js run
// ---- The subsystem: several classes with their own APIs ----
class Inventory {
  #stock = new Map([["mug", 5], ["lamp", 0]]);
  reserve(sku, qty) { if ((this.#stock.get(sku) ?? 0) < qty) return false; this.#stock.set(sku, this.#stock.get(sku) - qty); return true; }
  release(sku, qty) { this.#stock.set(sku, this.#stock.get(sku) + qty); }
}
class Pricing { quote(sku, qty) { return (sku === "mug" ? 29900 : 149900) * qty + 4000; } }
class Payments { charge(user, paise) { return user !== "broke-user"; } }
class Shipping { schedule(sku, city) { return `AWB-${sku}-${city.slice(0, 3)}`; } }
class Notifications { email(user, msg) { console.log(`  [email ${user}] ${msg}`); } }

// ---- The facade: one simple operation, all the coordination inside ----
class CheckoutFacade {
  #inv = new Inventory(); #pricing = new Pricing(); #payments = new Payments(); #shipping = new Shipping(); #notify = new Notifications();
  placeOrder(user, sku, qty, city) {
    if (!this.#inv.reserve(sku, qty)) return "out of stock";
    const total = this.#pricing.quote(sku, qty);
    if (!this.#payments.charge(user, total)) { this.#inv.release(sku, qty); return "payment failed (stock released)"; }
    const awb = this.#shipping.schedule(sku, city);
    this.#notify.email(user, `order confirmed, Rs ${total / 100}, tracking ${awb}`);
    return `ok ${awb}`;
  }
}

const checkout = new CheckoutFacade();             // clients see ONE method
console.log(checkout.placeOrder("asha", "mug", 2, "Pune"));
console.log(checkout.placeOrder("bilal", "lamp", 1, "Delhi"));
console.log(checkout.placeOrder("broke-user", "mug", 1, "Agra"));
```
:::

Benefits: clients are **decoupled** from the subsystem's internals; the orchestration lives in **one place**; the subsystem can be refactored behind a stable interface. Watch out: a facade that keeps growing into a dumping ground of unrelated operations becomes a **god class**. Split it by use case. In HLD terms, an **API gateway** or a **BFF** is a facade over microservices.

## Adapter vs Facade vs Decorator vs Proxy

These four all "wrap" something, which is why they're confused. The difference is the **intent**:

| Pattern | Wraps | Interface it exposes | Purpose |
|---|---|---|---|
| **Adapter** | one object | a **different** interface (the one the client expects) | make incompatible things fit |
| **Facade** | a whole **subsystem** | a new, **simpler** interface | hide complexity |
| **Decorator** | one object | the **same** interface | **add behaviour** (next lesson) |
| **Proxy** | one object | the **same** interface | **control access** to it (next lesson) |

```quiz
? A new SMS provider's SDK has `sendText(to, body, opts)` while your code expects `Notifier.send(user, message)`. Which pattern?
+ Adapter
- Facade
- Singleton
> The adapter implements your Notifier interface by translating calls to the provider's SDK.

? Five controllers each call inventory, pricing, payment, shipping and email in the same order. What helps most?
- An adapter per service
+ A facade that offers placeOrder() and coordinates the subsystem
- A prototype of each controller
> A facade gives one simple entry point and one place for the orchestration.

? What should an adapter NOT contain?
+ Business rules: it should only translate interfaces, units and errors
- Unit conversions
- Error mapping
> Keep adapters thin; business logic belongs in your domain classes.

? Which pair exposes the SAME interface as the object they wrap?
- Adapter and Facade
+ Decorator and Proxy
- Facade and Proxy
> Decorators add behaviour and proxies control access, both behind the original interface.
```

:::keypoints
- **Adapter**: implements the interface your code expects by translating to an incompatible class (names, units, errors, sync/async); keeps third-party types out of your domain. At scale: an anti-corruption layer.
- **Facade**: one simple entry point to a complex subsystem; orchestration in one place; beware growing it into a god class.
- Wrapper patterns differ by intent: Adapter (**different** interface, compatibility), Facade (**simpler** interface, hide complexity), Decorator (**same** interface, add behaviour), Proxy (**same** interface, control access).
:::
