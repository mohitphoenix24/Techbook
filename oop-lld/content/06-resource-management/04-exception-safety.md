---
title: Exception safety guarantees
level: advanced
time: 35
summary: The basic, strong and no-throw guarantees, how to achieve the strong guarantee with copy-and-swap, commit-or-rollback with a scope guard, and why noexcept moves and RAII members are the foundation.
---

It is not enough that code *works* when nothing goes wrong. A senior engineer asks: **what state is the program in if an exception is thrown halfway?** The answer is called the **exception safety guarantee** of the function.

## The four levels

| Guarantee | Promise | Example |
|---|---|---|
| **No-throw** (`noexcept`) | The operation never throws | `swap`, move operations, destructors |
| **Strong** | If it throws, **nothing changed** (commit or rollback) | `vector::push_back`, `std::map::insert` (single element) |
| **Basic** | If it throws, no leaks and all invariants hold, but the *values* may have changed | most mutating operations |
| **None** | Anything may happen: leaks, corrupt objects | code to avoid |

Your goal: every function gives at least the **basic** guarantee; provide the **strong** guarantee where it is cheap; and build everything on a small set of **no-throw** operations (`swap`, moves).

## A function with no guarantee

```cpp run title="A transfer that is not exception safe"
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class Account {
    string id_;
    double balance_;
public:
    Account(string id, double b) : id_(move(id)), balance_(b) {}
    void withdraw(double x) { if (x > balance_) throw runtime_error("insufficient funds in " + id_); balance_ -= x; }
    void deposit(double x)  { if (x < 0) throw runtime_error("negative deposit"); balance_ += x; }
    double balance() const { return balance_; }
};

void transferBad(Account& from, Account& to, double amount) {
    from.withdraw(amount);          // step 1 succeeds
    to.deposit(-amount);            // step 2 throws (a bug here, but any failure would do)
}

int main() {
    Account a("A", 100), b("B", 0);
    try { transferBad(a, b, 40); } catch (const exception& e) { cout << "failed: " << e.what() << "\n"; }
    cout << "A has " << a.balance() << " (lost 40!), B has " << b.balance() << "\n";
}
```

The money vanished. The program kept running, but the invariant ("total money is constant") is broken. That is the cost of ignoring exception safety.

## Strong guarantee by "do the risky work first"

A simple recipe: **(1)** do everything that can throw on *temporary* copies; **(2)** then commit with operations that cannot throw.

```cpp run title="Compute first, commit with no-throw operations"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class Team {
    vector<string> members_;
public:
    // Strong guarantee: on failure, members_ is unchanged.
    void addAll(const vector<string>& names) {
        vector<string> tmp = members_;                     // 1. work on a copy (may throw)
        for (const auto& n : names) {
            if (n.empty()) throw invalid_argument("empty name");     // may throw halfway: tmp is discarded
            tmp.push_back(n);
        }
        members_.swap(tmp);                                // 2. commit: swap never throws
    }
    size_t size() const { return members_.size(); }
};

int main() {
    Team t;
    t.addAll({"asha", "ravi"});
    try { t.addAll({"meera", "", "kiran"}); } catch (const exception& e) { cout << "failed: " << e.what() << "\n"; }
    cout << "size is still " << t.size() << "\n";           // 2: the failed call changed nothing
}
```

## Copy-and-swap: the strong assignment operator

This is the standard way to write a correct `operator=` for a class that owns a resource. It also handles self-assignment for free.

```cpp run title="Copy-and-swap idiom"
#include <algorithm>
#include <iostream>
#include <utility>
using namespace std;

class Buffer {
    int* data_;
    size_t size_;
public:
    explicit Buffer(size_t n = 0) : data_(new int[n]{}), size_(n) {}
    ~Buffer() { delete[] data_; }
    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) { copy(o.data_, o.data_ + size_, data_); }
    Buffer(Buffer&& o) noexcept : data_(exchange(o.data_, nullptr)), size_(exchange(o.size_, 0)) {}

    friend void swap(Buffer& a, Buffer& b) noexcept {      // the no-throw building block
        using std::swap;
        swap(a.data_, b.data_);
        swap(a.size_, b.size_);
    }

    Buffer& operator=(Buffer other) noexcept {             // take the argument BY VALUE: the copy (may throw) happens in the caller
        swap(*this, other);                                // swap with the copy (cannot throw)
        return *this;                                      // the old data dies with 'other'
    }
    int& operator[](size_t i) { return data_[i]; }
    size_t size() const { return size_; }
};

int main() {
    Buffer a(3), b(5);
    a[0] = 42;
    b = a;                          // copy-assign: strong guarantee, self-assignment safe
    b = b;                          // fine
    Buffer c;
    c = move(a);                    // the same operator, now fed by a move
    cout << b[0] << " " << b.size() << " " << c.size() << "\n";
}
```

One `operator=` (taking its parameter by value) serves both copy and move assignment. The risky step, copying, happens *before* we touch `*this`.

## Commit or rollback with a scope guard

When you must apply several changes to different objects, register an **undo** action as you go, and "dismiss" it only when everything succeeds.

```cpp run title="A rollback guard"
#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class ScopeGuard {
    function<void()> undo_;
    bool active_ = true;
public:
    explicit ScopeGuard(function<void()> undo) : undo_(move(undo)) {}
    ~ScopeGuard() { if (active_) undo_(); }              // runs on any early exit, including exceptions
    void dismiss() { active_ = false; }                  // everything worked: keep the changes
    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
};

struct Inventory {
    int stock = 5;
    void reserve(int n) { if (n > stock) throw runtime_error("not enough stock"); stock -= n; cout << "  reserved " << n << "\n"; }
    void release(int n) { stock += n; cout << "  released " << n << " (rollback)\n"; }
};
struct Payment { void charge(bool ok) { if (!ok) throw runtime_error("card declined"); cout << "  charged\n"; } };

void placeOrder(Inventory& inv, Payment& pay, int qty, bool cardOk) {
    inv.reserve(qty);
    ScopeGuard rollback([&] { inv.release(qty); });       // if anything below throws, stock is returned
    pay.charge(cardOk);
    rollback.dismiss();                                    // success: keep the reservation
    cout << "  order placed\n";
}

int main() {
    Inventory inv; Payment pay;
    cout << "order 1:\n"; placeOrder(inv, pay, 2, true);
    cout << "order 2:\n";
    try { placeOrder(inv, pay, 2, false); } catch (const exception& e) { cout << "  failed: " << e.what() << "\n"; }
    cout << "stock = " << inv.stock << " (3 after order 1, unchanged by the failed order 2)\n";
}
```

This is the idea behind database transactions, and behind `std::scope_exit` proposals and Go's `defer`.

## Why noexcept moves matter (again)

`vector::push_back` offers the strong guarantee. During reallocation it must move old elements to the new buffer. If it used a throwing move and failed halfway, it could not restore the old buffer. So it uses `move_if_noexcept`: **move if the move is `noexcept`, otherwise copy**. You saw this in the move-semantics lesson.

## A checklist

1. Hold resources in RAII members (`vector`, `string`, `unique_ptr`, locks). Then the basic guarantee comes free.
2. Never throw from destructors, `swap`, or move operations. Mark them `noexcept`.
3. For the strong guarantee: do the risky work on temporaries, then **commit with no-throw operations** (`swap`, `move`).
4. Update several things in a safe order, or use a rollback guard.
5. Document the guarantee your function gives.

:::interview What are the exception safety guarantees?
"Four levels: no-throw, strong (commit or rollback: if it throws, state is unchanged), basic (no leaks, invariants hold, but values may change), and none. I use RAII for the basic guarantee, copy-and-swap or 'work on a copy, then swap' for the strong one, and `noexcept` swap and moves as the building blocks."
:::

```quiz
? What does the strong exception guarantee promise?
- The function never throws
+ If it throws, the program state is as if the call never happened
- Only that there are no leaks
> That is "commit or rollback" semantics.
? In copy-and-swap, why is the parameter taken by value?
- To make it faster
+ The (possibly throwing) copy happens before any modification of *this, and the same operator handles moves
- Because swap needs a copy
> The risky part is done first; then a no-throw swap commits.
? What does `vector::push_back` do on reallocation if the element's move constructor is not noexcept?
- Moves anyway
+ Copies the elements, to keep the strong guarantee
- Throws
> `std::move_if_noexcept` picks copy unless moving cannot throw.
```

:::keypoints
- Guarantees: no-throw, strong (commit or rollback), basic (valid but changed), none.
- Do risky work on copies, then commit with no-throw `swap`. Copy-and-swap gives a strong, self-assignment-safe `operator=`.
- A scope guard with `dismiss()` implements rollback. RAII members give the basic guarantee for free.
- `noexcept` moves and swap are the foundation; containers rely on them.
:::
