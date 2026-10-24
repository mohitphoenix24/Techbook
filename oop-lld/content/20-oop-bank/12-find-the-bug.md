---
title: "OOP interview: find the bug"
level: medium
time: 30
summary: Fourteen short buggy C++ snippets (leaks, slicing, missing virtual destructor, dangling references, iterator problems, data races and more). Each one names the problem and shows the fix.
---

Interviewers love "what is wrong with this code?". For each snippet, look for the bug first, then open the answer.

A simple method: ask three questions. **Who owns this memory?** (leaks, double free) **Does this reference or pointer still point to something alive?** (dangling) **Can two threads touch this at once?** (races, deadlocks).

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
**Bug:** the copy that the compiler writes copies only the pointer. So `a` and `b` share one array, and both destructors free it. That is a **double free**. This is the Rule of Three problem.

**Fix:** use `std::vector<int>` (Rule of Zero). Or write the copy constructor and assignment (and the moves). Or `= delete` them.
:::

:::qa Bug 2: deleting a derived object through a base pointer {level=easy}
```cpp
struct Shape { virtual double area() const = 0; };
struct Circle : Shape { std::string label = "c"; double area() const override { return 3.14; } };
Shape* s = new Circle;
delete s;
```
**Bug:** `Shape` has no virtual destructor, so `delete s` is undefined behaviour. `Circle`'s destructor does not run, and `label` leaks.

**Fix:** write `virtual ~Shape() = default;` in the base. (A `unique_ptr<Shape>` needs it too.)
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
**Bug:** `name` is destroyed when the function ends, so the reference points to nothing (undefined behaviour).

**Fix:** return by value: `std::string makeName()`. Copy elision makes it free.
:::

:::qa Bug 4: iterator invalidation {level=medium}
```cpp
std::vector<int> v{1, 2, 3, 4};
for (auto it = v.begin(); it != v.end(); ++it)
    if (*it % 2 == 0) v.erase(it);
```
**Bug:** `erase` makes `it` (and every iterator after it) invalid. Using `++it` on it is undefined, and items get skipped.

**Fix:** use the iterator that `erase` returns, or use erase-remove.

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
**Bug:** storing child objects by value cuts them down to `Animal`, so every call runs `Animal::speak`.

**Fix:** use `std::vector<std::unique_ptr<Animal>>` and `make_unique<Dog>()`.
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
**Bug:** `++counter` is read, add, write on shared memory from two threads with no protection. That is a data race (undefined behaviour), and updates are lost.

**Fix:** `std::atomic<int> counter{0};`, or protect it with a `std::mutex` (`lock_guard`).
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
**Bug:** `balance()` reads while another thread may write. That is a data race. (It also cannot lock `m_` as written, because the function is `const`.)

**Fix:** write `mutable std::mutex m_;` and lock in `balance()` too. Every access to shared data must use the same mutex.
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
**Bug:** each thread takes one lock and waits for the other. That is a **deadlock** (the locks are taken in opposite order).

**Fix:** lock both together with `std::scoped_lock lock(from.m, to.m);`, or always lock in a fixed order (for example by account id).
:::

:::qa Bug 9: `shared_ptr` from `this` {level=hard}
```cpp
struct Session {
    void start() { registry.add(std::shared_ptr<Session>(this)); }
};
auto s = std::make_shared<Session>();
s->start();
```
**Bug:** `shared_ptr<Session>(this)` makes a **second** owner group for an object that is already owned, so the object is deleted twice.

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
**Bug:** the lambda captures `count` by reference, but `count` is gone when `makeCounter` returns.

**Fix:** capture by value with `mutable`: `return [count]() mutable { return ++count; };` or `[count = 0]() mutable {...}`.
:::

:::qa Bug 11: signed/unsigned loop {level=easy}
```cpp
std::vector<int> v;
for (size_t i = v.size() - 1; i >= 0; --i) std::cout << v[i];
```
**Bug:** `size_t` is unsigned. For an empty vector `v.size() - 1` becomes a huge number, and `i >= 0` is always true, so the loop never ends and reads outside the vector.

**Fix:** `for (size_t i = v.size(); i-- > 0; )`, or use reverse iterators or `views::reverse`.
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
**Bug:** members are built in **declaration** order. So `size_` is set before `data_` is ready, and it reads the size of an empty vector.

**Fix:** declare `data_` first and then `size_`, and write the initialiser list in that order: `data_(std::move(d)), size_(data_.size())`.
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
**Bugs:** (1) Self-assignment (`t = t`) deletes the buffer before copying from it. (2) If `new` throws, `buf_` is left pointing to freed memory.

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
**Bugs:** `return std::move(v);` stops copy elision, and forces a move that a plain `return v;` would avoid. Moving from a `const std::string` quietly **copies**, because a move constructor cannot take a const object.

**Fix:** write `return v;`. Take the parameter as a non-const value (`std::string s`) if you want to move from it.
:::

```quiz
? A class has a raw owning pointer and no copy constructor. What is the first bug to expect?
- A memory leak only
+ A double free when two copies are destroyed
- A compile error
> The default copy is shallow.
```

:::keypoints
- Most bugs come from ownership (Rule of 3 and 5, dangling), polymorphism (virtual destructor, slicing), or threads (races, lock order).
- Fix by design: RAII types, `unique_ptr`, `scoped_lock`, `atomic`, and plain value types.
:::
