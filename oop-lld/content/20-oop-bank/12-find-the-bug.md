---
title: "OOP interview: find the bug"
level: medium
time: 30
summary: Fourteen short buggy C++ snippets (leaks, slicing, missing virtual destructor, dangling references, iterator invalidation, data races and more) with the problem named and the fix shown.
---

Interviewers love "what is wrong with this code?". For each snippet, find the bug first, then open the answer.

:::qa Bug 1: the class that leaks and double-frees {level=easy}
```cpp
class Buffer {
    int* data_;
    size_t n_;
public:
    Buffer(size_t n) : data_(new int[n]), n_(n) {}
    ~Buffer() { delete[] data_; }
};
void f() { Buffer a(10); Buffer b = a; }   // what happens?
```
**Bug:** the compiler-generated copy constructor copies the pointer, so `a` and `b` share one array, and both destructors free it: **double free**. This is the Rule of Three.

**Fix:** use `std::vector<int>` (Rule of Zero), or write the copy constructor and assignment (and move operations), or `= delete` them.
:::

:::qa Bug 2: deleting a derived object through a base pointer {level=easy}
```cpp
struct Shape { virtual double area() const = 0; };
struct Circle : Shape { std::string label = "c"; double area() const override { return 3.14; } };
Shape* s = new Circle;
delete s;
```
**Bug:** `Shape` has no virtual destructor, so `delete s` is undefined behaviour; `Circle::~Circle` is not called and `label` leaks.

**Fix:** `virtual ~Shape() = default;` in the base (or hold a `unique_ptr<Shape>`, which still needs the virtual destructor).
:::

:::qa Bug 3: returning a reference to a local {level=easy}
```cpp
const std::string& makeName() {
    std::string name = "Asha";
    return name;
}
auto& n = makeName();
std::cout << n;
```
**Bug:** `name` is destroyed when the function returns, so the reference dangles (undefined behaviour).

**Fix:** return by value: `std::string makeName()`. Copy elision makes it free.
:::

:::qa Bug 4: iterator invalidation {level=medium}
```cpp
std::vector<int> v{1, 2, 3, 4};
for (auto it = v.begin(); it != v.end(); ++it)
    if (*it % 2 == 0) v.erase(it);
```
**Bug:** `erase` invalidates `it` (and every iterator after it); `++it` on it is undefined, and elements get skipped.

**Fix:** use the returned iterator, or erase-remove.
```cpp
for (auto it = v.begin(); it != v.end(); ) { if (*it % 2 == 0) it = v.erase(it); else ++it; }
// or: v.erase(std::remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }), v.end());
```
:::

:::qa Bug 5: slicing in a container {level=medium}
```cpp
std::vector<Animal> zoo;
zoo.push_back(Dog());
zoo.push_back(Cat());
for (auto& a : zoo) a.speak();       // speak() is virtual
```
**Bug:** storing derived objects by value slices them to `Animal`, so every call runs `Animal::speak`.

**Fix:** `std::vector<std::unique_ptr<Animal>>` and `make_unique<Dog>()`.
:::

:::qa Bug 6: a data race {level=medium}
```cpp
int counter = 0;
void work() { for (int i = 0; i < 100000; ++i) ++counter; }
int main() {
    std::thread a(work), b(work);
    a.join(); b.join();
    std::cout << counter;        // expected 200000
}
```
**Bug:** `++counter` is a read-modify-write on shared memory from two threads without synchronisation: a data race (undefined behaviour). Updates are lost.

**Fix:** `std::atomic<int> counter{0};` or guard with a `std::mutex` (`lock_guard`).
:::

:::qa Bug 7: a missing lock on one path {level=hard}
```cpp
class Account {
    std::mutex m_; int balance_ = 0;
public:
    void deposit(int x) { std::lock_guard<std::mutex> l(m_); balance_ += x; }
    int balance() const { return balance_; }       // reads without the lock
};
```
**Bug:** `balance()` reads while another thread may write: a data race. (It also cannot lock `m_` as written because the function is `const`.)

**Fix:** declare `mutable std::mutex m_;` and lock in `balance()` too: every access to shared state uses the same mutex.
:::

:::qa Bug 8: the classic deadlock {level=hard}
```cpp
void transfer(Account& from, Account& to, int amt) {
    std::lock_guard<std::mutex> a(from.m);
    std::lock_guard<std::mutex> b(to.m);
    from.balance -= amt; to.balance += amt;
}
// thread 1: transfer(x, y, 5);   thread 2: transfer(y, x, 7);
```
**Bug:** each thread takes one lock and waits for the other: **deadlock** (opposite lock order).

**Fix:** lock both at once with `std::scoped_lock lock(from.m, to.m);` (deadlock-avoiding algorithm), or always lock in a global order (for example by account id).
:::

:::qa Bug 9: `shared_ptr` from `this` {level=hard}
```cpp
struct Session {
    void start() { registry.add(std::shared_ptr<Session>(this)); }
};
auto s = std::make_shared<Session>();
s->start();
```
**Bug:** `shared_ptr<Session>(this)` creates a **second** control block for an object that is already managed, so the object is deleted twice.

**Fix:** inherit from `std::enable_shared_from_this<Session>` and use `shared_from_this()`.
:::

:::qa Bug 10: a lambda capturing a dead local {level=medium}
```cpp
std::function<int()> makeCounter() {
    int count = 0;
    return [&count]() { return ++count; };
}
auto c = makeCounter();
std::cout << c();
```
**Bug:** the lambda captures `count` by reference, but `count` dies when `makeCounter` returns.

**Fix:** capture by value with `mutable`: `return [count]() mutable { return ++count; };` or `[count = 0]() mutable {...}`.
:::

:::qa Bug 11: signed/unsigned loop {level=easy}
```cpp
std::vector<int> v;
for (size_t i = v.size() - 1; i >= 0; --i) std::cout << v[i];
```
**Bug:** `size_t` is unsigned: `v.size() - 1` wraps to a huge value for an empty vector, and `i >= 0` is always true, so the loop never ends (and reads out of range).

**Fix:** `for (size_t i = v.size(); i-- > 0; )` or use reverse iterators / `views::reverse`.
:::

:::qa Bug 12: member initialisation order {level=medium}
```cpp
class Range {
    std::vector<int> data_;
    size_t size_;
public:
    Range(std::vector<int> d) : size_(data_.size()), data_(std::move(d)) {}
};
```
**Bug:** members initialise in **declaration** order, so `data_` is built (and moved into) after `size_` reads `data_.size()`: `size_` is read from an empty vector.

**Fix:** match the order, and read from the parameter `d` or the already built member in the right order (`data_(std::move(d)), size_(data_.size())`) with the declarations in that order.
:::

:::qa Bug 13: an assignment operator that is not safe {level=hard}
```cpp
Text& Text::operator=(const Text& o) {
    delete[] buf_;
    buf_ = new char[o.len_ + 1];      // may throw
    std::strcpy(buf_, o.buf_);
    len_ = o.len_;
    return *this;
}
```
**Bugs:** (1) self-assignment (`t = t`) deletes the buffer before copying from it. (2) If `new` throws, `buf_` is left dangling: no exception safety.

**Fix:** copy-and-swap: `Text& operator=(Text o) noexcept { swap(o); return *this; }`.
:::

:::qa Bug 14: returning `std::move` of a local, and moving a const {level=hard}
```cpp
std::vector<int> build() {
    std::vector<int> v(1000);
    return std::move(v);
}
void take(const std::string s) { auto t = std::move(s); }     // does it move?
```
**Bugs:** `return std::move(v);` blocks copy elision (NRVO), so it forces a move that plain `return v;` would avoid. Moving from a `const std::string` silently **copies**, because a move constructor cannot bind to a const rvalue.

**Fix:** `return v;`. Take the parameter by value as non-const (`std::string s`) if you intend to move from it.
:::

```quiz
? A class has a raw owning pointer and no copy constructor. What is the first bug to expect?
- A memory leak only
+ A double free when two copies are destroyed
- A compile error
> The default copy is shallow.
```

:::keypoints
- Most bugs trace back to ownership (Rule of 3/5, dangling), polymorphism (virtual destructor, slicing), and concurrency (races, lock order).
- Fix by design: RAII types, `unique_ptr`, `scoped_lock`, `atomic`, value semantics.
:::
