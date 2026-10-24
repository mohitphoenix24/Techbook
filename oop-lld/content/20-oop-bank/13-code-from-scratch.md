---
title: "OOP interview: write it from scratch"
level: hard
time: 50
summary: Classic "implement it yourself" exercises with verified code: a String class, a Vector, a unique_ptr and a shared_ptr, a Matrix with operators, a generic Stack and an observable value. Each one says what the interviewer is checking.
---

These are the "implement `std::xxx`" questions. They check that you know the Rule of Five, RAII, `const` and operators. Type them out until it feels easy.

How to practise: read the code once, close the page, and write it again from memory. Then compare. Say aloud **why** each line is there. The "What the interviewer checks" line tells you what to explain.

:::qa Implement a String class with the Rule of Five {level=hard}
```cpp run title="A minimal String"
#include <cstring>
#include <iostream>
#include <utility>
using namespace std;

class String {
    char* data_ = nullptr;
    size_t len_ = 0;
public:
    String() : data_(new char[1]{0}) {}
    String(const char* s) : data_(nullptr), len_(strlen(s)) { data_ = new char[len_ + 1]; memcpy(data_, s, len_ + 1); }
    String(const String& o) : len_(o.len_) { data_ = new char[len_ + 1]; memcpy(data_, o.data_, len_ + 1); cout << "[copy] "; }
    String(String&& o) noexcept : data_(o.data_), len_(o.len_) { o.data_ = nullptr; o.len_ = 0; cout << "[move] "; }
    String& operator=(String o) noexcept { swap(o); return *this; }             // copy-and-swap handles both copy and move assignment
    ~String() { delete[] data_; }

    void swap(String& o) noexcept { std::swap(data_, o.data_); std::swap(len_, o.len_); }
    size_t size() const { return len_; }
    const char* c_str() const { return data_ ? data_ : ""; }
    char& operator[](size_t i) { return data_[i]; }
    const char& operator[](size_t i) const { return data_[i]; }
    String& operator+=(const String& o) {
        char* n = new char[len_ + o.len_ + 1];
        memcpy(n, data_, len_); memcpy(n + len_, o.data_, o.len_ + 1);
        delete[] data_; data_ = n; len_ += o.len_;
        return *this;
    }
    friend String operator+(String a, const String& b) { a += b; return a; }
    friend bool operator==(const String& a, const String& b) { return a.len_ == b.len_ && memcmp(a.data_, b.data_, a.len_) == 0; }
    friend ostream& operator<<(ostream& os, const String& s) { return os << s.c_str(); }
};

int main() {
    String a("hello");
    String b = a;                       // copy
    String c = std::move(a);            // move
    cout << "\nb=" << b << " c=" << c << " a(moved-from) size=" << a.size() << "\n";
    b += String(", world");
    cout << b << " (" << b.size() << ")\n";
    String d; d = b + String("!");      // operator+ then move assignment
    d[0] = 'H';
    cout << "\n" << d << " equal to b? " << boolalpha << (d == b) << "\n";
}
```
**What the interviewer checks:** copy versus move, `noexcept` on the move, safety when assigning to yourself, `const` versions of `operator[]`, no leaks (`delete[]`), a valid moved-from object, and a safe `c_str`. Note that `operator+` takes its left side **by value** and reuses `+=`.
:::

:::qa Implement a simplified `vector<T>` {level=hard}
```cpp run title="MyVector with growth, move and iterators"
#include <iostream>
#include <new>
#include <stdexcept>
#include <utility>
using namespace std;

template <class T>
class MyVector {
    T* data_ = nullptr;
    size_t size_ = 0, cap_ = 0;
    void grow(size_t newCap) {
        T* n = static_cast<T*>(::operator new(newCap * sizeof(T)));                 // raw memory, no constructors yet
        for (size_t i = 0; i < size_; ++i) { new (n + i) T(std::move_if_noexcept(data_[i])); data_[i].~T(); }
        ::operator delete(data_);
        data_ = n; cap_ = newCap;
    }
public:
    MyVector() = default;
    MyVector(initializer_list<T> il) { reserve(il.size()); for (const T& x : il) push_back(x); }
    MyVector(const MyVector& o) { reserve(o.size_); for (size_t i = 0; i < o.size_; ++i) push_back(o.data_[i]); }
    MyVector(MyVector&& o) noexcept : data_(o.data_), size_(o.size_), cap_(o.cap_) { o.data_ = nullptr; o.size_ = o.cap_ = 0; }
    MyVector& operator=(MyVector o) noexcept { swap(o); return *this; }
    ~MyVector() { clear(); ::operator delete(data_); }

    void swap(MyVector& o) noexcept { std::swap(data_, o.data_); std::swap(size_, o.size_); std::swap(cap_, o.cap_); }
    void reserve(size_t n) { if (n > cap_) grow(n); }
    void push_back(const T& v) { emplace_back(v); }
    void push_back(T&& v) { emplace_back(std::move(v)); }
    template <class... A> T& emplace_back(A&&... a) {
        if (size_ == cap_) grow(cap_ ? cap_ * 2 : 1);
        new (data_ + size_) T(std::forward<A>(a)...);                              // construct in place
        return data_[size_++];
    }
    void pop_back() { data_[--size_].~T(); }
    void clear() { while (size_) pop_back(); }
    T& operator[](size_t i) { return data_[i]; }
    const T& operator[](size_t i) const { return data_[i]; }
    T& at(size_t i) { if (i >= size_) throw out_of_range("index"); return data_[i]; }
    size_t size() const { return size_; }
    size_t capacity() const { return cap_; }
    T* begin() { return data_; }
    T* end() { return data_ + size_; }
    const T* begin() const { return data_; }
    const T* end() const { return data_ + size_; }
};

struct Tracked {
    int id; Tracked(int i) : id(i) {} Tracked(const Tracked& o) : id(o.id) { cout << "c"; } Tracked(Tracked&& o) noexcept : id(o.id) { cout << "m"; }
};

int main() {
    MyVector<int> v;
    for (int i = 1; i <= 5; ++i) { v.push_back(i * i); cout << "size=" << v.size() << " cap=" << v.capacity() << (i < 5 ? "; " : "\n"); }
    int sum = 0; for (int x : v) sum += x;
    cout << "sum=" << sum << "\n";
    MyVector<int> w = v; w[0] = 99;
    cout << "copy is independent: " << v[0] << " vs " << w[0] << "\n";
    try { v.at(10); } catch (const out_of_range& e) { cout << "at(10) threw: " << e.what() << "\n"; }
    cout << "growth moves (m) instead of copies (c): ";
    MyVector<Tracked> t; for (int i = 0; i < 4; ++i) t.emplace_back(i);
    cout << "\n";
}
```
**What the interviewer checks:** raw memory plus placement new (items are built only when added), growth by doubling, `move_if_noexcept`, destroying the items before freeing the memory, the Rule of Five, `emplace_back` with forwarding, and const iterators.
:::

:::qa Implement `unique_ptr` {level=hard}
```cpp run title="MyUnique"
#include <iostream>
#include <utility>
using namespace std;

template <class T>
class MyUnique {
    T* p_ = nullptr;
public:
    MyUnique() = default;
    explicit MyUnique(T* p) : p_(p) {}
    MyUnique(const MyUnique&) = delete;
    MyUnique& operator=(const MyUnique&) = delete;
    MyUnique(MyUnique&& o) noexcept : p_(std::exchange(o.p_, nullptr)) {}
    MyUnique& operator=(MyUnique&& o) noexcept { if (this != &o) { reset(); p_ = std::exchange(o.p_, nullptr); } return *this; }
    ~MyUnique() { delete p_; }
    T* get() const { return p_; }
    T& operator*() const { return *p_; }
    T* operator->() const { return p_; }
    explicit operator bool() const { return p_ != nullptr; }
    T* release() { return std::exchange(p_, nullptr); }
    void reset(T* p = nullptr) { delete std::exchange(p_, p); }
};
template <class T, class... A> MyUnique<T> makeUnique(A&&... a) { return MyUnique<T>(new T(std::forward<A>(a)...)); }

struct Res { int id; Res(int i) : id(i) { cout << "acquire " << id << "\n"; } ~Res() { cout << "release " << id << "\n"; } };

int main() {
    auto a = makeUnique<Res>(1);
    auto b = std::move(a);
    cout << "a empty: " << boolalpha << !a << ", b->id = " << b->id << "\n";
    b = makeUnique<Res>(2);                // old resource released here
    cout << "end of main\n";
}
```
**What the interviewer checks:** copying is deleted, the move uses `exchange`, a guard for moving to yourself, `explicit operator bool`, the difference between `release` and `reset`, and a `make` function that forwards its arguments.
:::

:::qa Implement `shared_ptr` (reference counting) {level=hard}
```cpp run title="MyShared with a control block"
#include <iostream>
#include <utility>
using namespace std;

template <class T>
class MyShared {
    struct Block { long count = 1; };
    T* p_ = nullptr; Block* b_ = nullptr;
    void release() { if (b_ && --b_->count == 0) { delete p_; delete b_; } p_ = nullptr; b_ = nullptr; }
public:
    MyShared() = default;
    explicit MyShared(T* p) : p_(p), b_(p ? new Block : nullptr) {}
    MyShared(const MyShared& o) : p_(o.p_), b_(o.b_) { if (b_) ++b_->count; }
    MyShared(MyShared&& o) noexcept : p_(std::exchange(o.p_, nullptr)), b_(std::exchange(o.b_, nullptr)) {}
    MyShared& operator=(MyShared o) noexcept { std::swap(p_, o.p_); std::swap(b_, o.b_); return *this; }
    ~MyShared() { release(); }
    long use_count() const { return b_ ? b_->count : 0; }
    T& operator*() const { return *p_; }
    T* operator->() const { return p_; }
    T* get() const { return p_; }
    void reset() { release(); }
};

struct Doc { string name; Doc(string n) : name(std::move(n)) { cout << "open " << name << "\n"; } ~Doc() { cout << "close " << name << "\n"; } };

int main() {
    MyShared<Doc> a(new Doc("report"));
    cout << "count " << a.use_count() << "\n";
    {
        MyShared<Doc> b = a;
        MyShared<Doc> c = b;
        cout << "count " << a.use_count() << "\n";
    }
    cout << "count after scope " << a.use_count() << "\n";
    MyShared<Doc> d = std::move(a);
    cout << "a now " << a.use_count() << ", d " << d.use_count() << "\n";
    d.reset();
    cout << "done\n";
}
```
**What the interviewer checks:** the shared control block, adding 1 when copying, subtracting and deleting at zero, and a move that does not touch the count. Say that the real one uses **atomic** counts, a weak count, a deleter, and that `make_shared` joins the two allocations.
:::

:::qa Implement a generic Matrix class with operators {level=medium}
```cpp run title="Matrix"
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace std;

class Matrix {
    size_t r_, c_; vector<double> d_;
public:
    Matrix(size_t r, size_t c, double fill = 0) : r_(r), c_(c), d_(r * c, fill) {}
    Matrix(initializer_list<initializer_list<double>> rows) : r_(rows.size()), c_(rows.begin()->size()) {
        for (auto& row : rows) { if (row.size() != c_) throw invalid_argument("ragged rows"); d_.insert(d_.end(), row.begin(), row.end()); }
    }
    double& operator()(size_t i, size_t j) { return d_[i * c_ + j]; }
    double operator()(size_t i, size_t j) const { return d_[i * c_ + j]; }
    Matrix operator+(const Matrix& o) const {
        if (r_ != o.r_ || c_ != o.c_) throw invalid_argument("shape mismatch");
        Matrix m(r_, c_); for (size_t i = 0; i < d_.size(); ++i) m.d_[i] = d_[i] + o.d_[i]; return m;
    }
    Matrix operator*(const Matrix& o) const {
        if (c_ != o.r_) throw invalid_argument("shape mismatch");
        Matrix m(r_, o.c_);
        for (size_t i = 0; i < r_; ++i) for (size_t k = 0; k < c_; ++k) for (size_t j = 0; j < o.c_; ++j) m(i, j) += (*this)(i, k) * o(k, j);
        return m;
    }
    Matrix transposed() const { Matrix t(c_, r_); for (size_t i = 0; i < r_; ++i) for (size_t j = 0; j < c_; ++j) t(j, i) = (*this)(i, j); return t; }
    friend Matrix operator*(double k, Matrix m) { for (auto& x : m.d_) x *= k; return m; }
    friend ostream& operator<<(ostream& os, const Matrix& m) {
        for (size_t i = 0; i < m.r_; ++i) { for (size_t j = 0; j < m.c_; ++j) os << m(i, j) << (j + 1 < m.c_ ? " " : ""); os << "\n"; }
        return os;
    }
};

int main() {
    Matrix a{{1, 2}, {3, 4}}, b{{0, 1}, {1, 0}};
    cout << "a+b:\n" << a + b << "a*b:\n" << a * b << "2*a:\n" << 2 * a << "a transposed:\n" << a.transposed();
    try { Matrix bad(2, 3); auto x = bad * bad; } catch (const invalid_argument& e) { cout << "error: " << e.what() << "\n"; }
}
```
**What the interviewer checks:** `operator()` with const and non-const versions (not `[][]`), flat storage in a `vector` (Rule of Zero, so no copy code), shape checks with exceptions, and the symmetric `k * m` as a non-member.
:::

:::qa Implement a generic Stack with a linked list (templates, RAII) {level=medium}
```cpp run title="Stack<T> on nodes owned by unique_ptr"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

template <class T>
class Stack {
    struct Node { T value; unique_ptr<Node> next; Node(T v, unique_ptr<Node> n) : value(std::move(v)), next(std::move(n)) {} };
    unique_ptr<Node> head_; size_t size_ = 0;
public:
    Stack() = default;
    Stack(Stack&&) noexcept = default;
    Stack& operator=(Stack&&) noexcept = default;
    ~Stack() { while (head_) head_ = std::move(head_->next); }                 // iterative: no deep recursion on long lists
    void push(T v) { head_ = make_unique<Node>(std::move(v), std::move(head_)); ++size_; }
    T pop() { if (!head_) throw underflow_error("stack is empty"); T v = std::move(head_->value); head_ = std::move(head_->next); --size_; return v; }
    const T& top() const { if (!head_) throw underflow_error("stack is empty"); return head_->value; }
    bool empty() const { return !head_; }
    size_t size() const { return size_; }
};

int main() {
    Stack<string> s;
    s.push("a"); s.push("b"); s.push("c");
    cout << "top=" << s.top() << " size=" << s.size() << "\n";
    cout << "pop: " << s.pop() << s.pop() << s.pop() << "\n";
    try { s.pop(); } catch (const underflow_error& e) { cout << "error: " << e.what() << "\n"; }
    Stack<int> big; for (int i = 0; i < 200000; ++i) big.push(i);
    cout << "built " << big.size() << " nodes and destroyed them without a stack overflow\n";
}
```
**What the interviewer checks:** ownership with `unique_ptr`, a destructor that does not call itself again and again (a recursive destructor overflows the stack on a long list), safe behaviour on errors, and a `const` `top()`. The class can only be moved because `unique_ptr` members stop copying. Say this, or add a deep-copy constructor.
:::

:::qa Implement an observable value (Observer pattern with std::function) {level=medium}
```cpp run title="Observable<T>"
#include <functional>
#include <iostream>
#include <map>
#include <string>
using namespace std;

template <class T>
class Observable {
    T value_;
    map<int, function<void(const T&, const T&)>> subs_;
    int next_ = 0;
public:
    explicit Observable(T v) : value_(std::move(v)) {}
    int subscribe(function<void(const T&, const T&)> f) { subs_[next_] = std::move(f); return next_++; }
    void unsubscribe(int id) { subs_.erase(id); }
    const T& get() const { return value_; }
    void set(T v) {
        if (v == value_) return;                                   // notify only on real changes
        T old = std::move(value_); value_ = std::move(v);
        auto copy = subs_;                                         // observers may unsubscribe while being notified
        for (auto& [id, f] : copy) f(old, value_);
    }
};

int main() {
    Observable<int> temp(20);
    int logger = temp.subscribe([](int o, int n) { cout << "log: " << o << " -> " << n << "\n"; });
    temp.subscribe([](int, int n) { if (n > 30) cout << "alert: too hot (" << n << ")\n"; });
    temp.set(25); temp.set(25); temp.set(35);
    temp.unsubscribe(logger);
    cout << "after unsubscribe:\n";
    temp.set(10);
    cout << "final " << temp.get() << "\n";
}
```
**What the interviewer checks:** subscription handles, telling observers only when the value really changes, safe looping when observers unsubscribe, and who owns the observers (use `weak_ptr` or return a handle in real code).
:::

```quiz
? Why does MyVector use placement new instead of `new T[n]`?
- It is faster to type
+ It gets raw memory and builds items only when they are added, like std::vector
- It avoids templates
> new T[n] would build all n items at once and need a default constructor.
```

:::keypoints
- Practise: String (Rule of Five), vector (raw memory and placement new), unique_ptr and shared_ptr (move, counts), matrix (operators), stack (templates and ownership), observable (callbacks).
- Say your rules, and your choices about `noexcept` and `const`, aloud. That is what is being graded.
:::
