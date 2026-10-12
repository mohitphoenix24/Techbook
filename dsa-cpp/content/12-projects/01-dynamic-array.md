---
title: Build Your Own vector
level: intermediate
time: 60
icon: layers
cover: #f97316,#db2777
tags: templates, RAII, rule of five, amortized analysis, move semantics
summary: Implement a generic dynamic array from raw memory — geometric growth, push/pop/insert/erase, bounds-checked access, iterators that work with range-for and std::sort, and the rule of five (copy and move) — then test it against std::vector and measure its amortized cost.
---

`std::vector` is the most used container in C++, and its inner workings answer several interview questions: *why is `push_back` O(1) amortized? What does `reserve` do? Why do iterators get invalidated? What are move semantics for?* In this project you'll build one yourself.

:::flow What you'll build
Storage | raw memory: data, size, capacity
Growth | double the capacity when full
Operations | push/pop/insert/erase/at/[]
Iterators | plain pointers: range-for, std::sort
Rule of five | destructor, copy, move
Tests | compare with std::vector on random operations
:::

## Design

| Member | Meaning |
|---|---|
| `T* data_` | the start of a heap buffer with room for `cap_` elements |
| `size_t size_` | how many elements are actually constructed |
| `size_t cap_` | how many fit before we must grow |

**Invariant:** `size_ ≤ cap_`. Slots `[0, size_)` hold live objects, and `[size_, cap_)` is raw, unconstructed memory.

:::def Placement new
`new (ptr) T(args...)` constructs an object **at an address you choose**, without allocating. Paired with an explicit destructor call `ptr->~T()`, it lets a container separate *allocating memory* from *constructing objects*. That's how `reserve(1000)` can allocate space without creating 1000 objects.
:::

## Growth policy

When `size_ == cap_`, allocate `max(1, 2 * cap_)` slots, **move** the old elements over, destroy the old ones, and free the old buffer. As proved in *Amortized Analysis*, doubling makes $n$ pushes cost fewer than $3n$ element operations in total.

:::warn Self-insertion
`v.push_back(v[0])` is a classic trap. If the vector reallocates, the argument (a reference into the **old** buffer) dangles before we copy it. The fix: copy the value into a local **before** growing, which is what the code below does.
:::

## The rule of five

:::def Rule of five
If a class manages a resource itself (here, raw memory), it needs all five special members: **destructor**, **copy constructor**, **copy assignment**, **move constructor**, and **move assignment**. Otherwise the compiler-generated versions copy the *pointer*, two objects free the same buffer, and the program crashes.
:::

Move operations **steal** the buffer (three pointer/size copies, then leave the source empty). They run in $O(1)$ instead of $O(n)$. That's why returning a vector from a function is cheap.

## The full implementation

```cpp run title="Vector<T> with tests against std::vector"
#include <bits/stdc++.h>
using namespace std;

template <typename T>
class Vector {
public:
    Vector() = default;
    explicit Vector(size_t n, const T& value = T()) { reserve(n); while (size_ < n) push_back(value); }
    Vector(initializer_list<T> init) { reserve(init.size()); for (const T& x : init) push_back(x); }

    // ---- rule of five ----
    ~Vector() { clear(); ::operator delete(data_); }
    Vector(const Vector& o) { reserve(o.size_); for (const T& x : o) push_back(x); }        // deep copy
    Vector(Vector&& o) noexcept : data_(o.data_), size_(o.size_), cap_(o.cap_) {          // steal
        o.data_ = nullptr; o.size_ = o.cap_ = 0;
    }
    Vector& operator=(Vector o) noexcept { swap(o); return *this; }   // copy-and-swap: handles copy AND move
    void swap(Vector& o) noexcept { std::swap(data_, o.data_); std::swap(size_, o.size_); std::swap(cap_, o.cap_); }

    // ---- capacity ----
    size_t size() const { return size_; }
    size_t capacity() const { return cap_; }
    bool empty() const { return size_ == 0; }
    void reserve(size_t newCap) {
        if (newCap <= cap_) return;
        T* fresh = static_cast<T*>(::operator new(newCap * sizeof(T)));    // raw memory, no objects yet
        for (size_t i = 0; i < size_; i++) {
            new (fresh + i) T(std::move(data_[i]));                          // move-construct into the new buffer
            data_[i].~T();                                                   // destroy the old object
        }
        ::operator delete(data_);
        data_ = fresh; cap_ = newCap;
        reallocations++;
    }

    // ---- modifiers ----
    void push_back(T value) {                 // by value: safe even if `value` refers into this vector
        if (size_ == cap_) reserve(cap_ ? 2 * cap_ : 1);
        new (data_ + size_) T(std::move(value));
        size_++;
    }
    void pop_back() { if (empty()) throw out_of_range("pop_back on empty Vector"); data_[--size_].~T(); }
    void clear() { while (size_) data_[--size_].~T(); }
    T* insert(T* pos, T value) {              // O(n - i): shift the tail right by one
        size_t i = pos - data_;
        push_back(std::move(value));          // may reallocate: work with indexes, not pointers
        std::rotate(data_ + i, data_ + size_ - 1, data_ + size_);
        return data_ + i;
    }
    T* erase(T* pos) {                        // O(n - i): shift the tail left by one
        std::move(pos + 1, data_ + size_, pos);
        pop_back();
        return pos;
    }

    // ---- access ----
    T& operator[](size_t i) { return data_[i]; }
    const T& operator[](size_t i) const { return data_[i]; }
    T& at(size_t i) { if (i >= size_) throw out_of_range("Vector::at"); return data_[i]; }
    T& back() { return data_[size_ - 1]; }
    T* begin() { return data_; }
    T* end() { return data_ + size_; }
    const T* begin() const { return data_; }
    const T* end() const { return data_ + size_; }

    static inline int reallocations = 0;      // instrumentation for the experiment below

private:
    T* data_ = nullptr;
    size_t size_ = 0, cap_ = 0;
};

int main() {
    // 1. random operations compared with std::vector
    mt19937 rng(1);
    Vector<int> mine;
    vector<int> ref;
    for (int step = 0; step < 20000; step++) {
        int op = rng() % 10, x = rng() % 1000;
        if (op < 5 || ref.empty()) { mine.push_back(x); ref.push_back(x); }
        else if (op < 7) { mine.pop_back(); ref.pop_back(); }
        else if (op < 8) { size_t i = rng() % (ref.size() + 1); mine.insert(mine.begin() + i, x); ref.insert(ref.begin() + i, x); }
        else if (op < 9) { size_t i = rng() % ref.size(); mine.erase(mine.begin() + i); ref.erase(ref.begin() + i); }
        else { size_t i = rng() % ref.size(); mine[i] = x; ref[i] = x; }
    }
    bool same = mine.size() == ref.size() && equal(mine.begin(), mine.end(), ref.begin());
    cout << "20000 random ops match std::vector: " << boolalpha << same << " (size " << mine.size() << ")\n";

    // 2. works with algorithms and range-for (iterators are pointers)
    Vector<string> words = {"pear", "apple", "fig"};
    sort(words.begin(), words.end());
    for (const auto& w : words) cout << w << ' ';
    cout << '\n';

    // 3. copy vs move
    Vector<string> copy = words;              // deep copy
    Vector<string> moved = std::move(words);  // steals the buffer
    copy[0] = "changed";
    cout << "moved[0] = " << moved[0] << ", copy[0] = " << copy[0] << ", source size after move = " << words.size() << '\n';

    // 4. self-insertion edge case
    Vector<string> v = {"x"};
    for (int i = 0; i < 5; i++) v.push_back(v[0]);   // reallocates while the argument refers into v
    cout << "self push_back ok: " << v.size() << " copies of " << v.back() << '\n';

    try { v.at(99); } catch (const out_of_range& e) { cout << "at(99) threw: " << e.what() << '\n'; }
}
```

## Experiment: how many reallocations, and how many moves?

```cpp run title="Growth factor experiment"
#include <bits/stdc++.h>
using namespace std;

struct Counter {                       // counts how often elements are moved or copied
    static inline long long moves = 0;
    int v = 0;
    Counter(int x = 0) : v(x) {}
    Counter(const Counter& o) : v(o.v) { moves++; }
    Counter(Counter&& o) noexcept : v(o.v) { moves++; }
    Counter& operator=(const Counter&) = default;
};

int main() {
    for (int n : {1000, 100000, 1000000}) {
        Counter::moves = 0;
        vector<Counter> v;
        size_t lastCap = 0; int reallocs = 0;
        for (int i = 0; i < n; i++) { v.push_back(Counter(i)); if (v.capacity() != lastCap) { reallocs++; lastCap = v.capacity(); } }
        cout << "n=" << setw(8) << n << "  reallocations: " << setw(2) << reallocs
             << "  element moves per push: " << fixed << setprecision(2) << (double)Counter::moves / n << '\n';
    }
}
```

About $\log_2 n$ reallocations, and a **constant** number of moves per push (about 2: one into the vector, plus about one more on average from regrowth). That's the amortized $O(1)$ bound, measured.

:::tip Why `noexcept` on the move constructor matters
`std::vector` only **moves** elements during regrowth if the move constructor is `noexcept`. Otherwise it **copies** them, to keep its strong exception-safety guarantee. Drop the `noexcept` from `Counter` and the "moves" become copies. For expensive types like `string` that's a real slowdown.
:::

## Extensions

:::exercise Make it your own
1. Add `shrink_to_fit()` and `resize(n)`.
2. Implement `emplace_back(args...)` with perfect forwarding (`template <class... Args>` + `std::forward`).
3. Try a growth factor of 1.5 and measure moves per push. (Why might 1.5 let freed memory be reused while 2 can't?)
4. Write a real iterator class with `operator++`, `operator*` and the iterator category tags instead of raw pointers.
:::

:::keypoints
- A vector = a pointer + size + capacity. Separating allocation from construction (placement new) is what makes `reserve` cheap.
- Doubling gives $O(1)$ amortized `push_back`: about $\log n$ reallocations and a constant number of moves per element.
- Managing raw resources requires the rule of five. Copy-and-swap gives safe assignment.
- Moves are $O(1)$ steals. Mark them `noexcept` so containers use them.
- Insert and erase in the middle shift elements, which is $O(n)$ and invalidates iterators.
:::
