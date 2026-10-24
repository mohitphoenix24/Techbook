---
title: "OOP interview: output puzzles on the language and library"
level: medium
time: 35
summary: Twelve more "what does this print?" puzzles on integer maths, struct size, lambdas and captures, smart pointers, map operator[], exceptions, templates, static variables and strings.
---

Predict first, then press **Run**.

:::qa Puzzle 1: signed and unsigned comparison {level=medium}
```cpp run title="Mixing signed and unsigned"
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int a = -1; unsigned b = 1;
    cout << "-1 < 1u ? " << boolalpha << (a < b) << "\n";
    vector<int> v;
    cout << "v.size() - 1 = " << v.size() - 1 << "\n";
    cout << "(int)v.size() - 1 = " << static_cast<int>(v.size()) - 1 << "\n";
    unsigned char c = 255; c++;
    cout << "255 + 1 as unsigned char = " << (int)c << "\n";
    cout << "7 / 2 = " << 7 / 2 << ", -7 / 2 = " << -7 / 2 << ", -7 % 3 = " << -7 % 3 << ", 7 / 2.0 = " << 7 / 2.0 << "\n";
}
```
**Why:** in `a < b`, the `int` is turned into `unsigned`, so -1 becomes 4294967295. `size()` is unsigned, so `0 - 1` wraps to a huge number. Integer division cuts toward zero, and the remainder has the sign of the left number.
:::

:::qa Puzzle 2: struct padding and sizeof {level=medium}
```cpp run title="sizeof and member order"
#include <iostream>
using namespace std;
struct A { char a; int b; char c; };
struct B { int b; char a; char c; };
struct C { char a; double d; char c; };
struct D { double d; char a; char c; };
struct E { virtual void f() {} char c; };
struct Empty {};
int main() {
    cout << "A=" << sizeof(A) << " B=" << sizeof(B) << " C=" << sizeof(C) << " D=" << sizeof(D)
         << " E(virtual)=" << sizeof(E) << " Empty=" << sizeof(Empty) << "\n";
}
```
**Why:** each member sits at an address that fits its own size, and the whole struct is padded to a multiple of its biggest member. `A` wastes bytes between `a` and `b` and after `c`. Putting big members first (`B`, `D`) wastes less. A virtual function adds a pointer (8 bytes on 64-bit). An empty class has size 1, so each object has its own address. (These sizes are for a normal 64-bit computer.)
:::

:::qa Puzzle 3: lambda captures {level=medium}
```cpp run title="Capture by value vs by reference"
#include <functional>
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int x = 10;
    auto byVal = [x]() { return x; };
    auto byRef = [&x]() { return x; };
    auto counter = [n = 0]() mutable { return ++n; };
    x = 20;
    cout << "byVal=" << byVal() << " byRef=" << byRef() << "\n";
    cout << "counter: " << counter() << " " << counter() << " " << counter() << "\n";
    auto copy = counter;                      // copies the lambda including its state
    cout << "original: " << counter() << ", copy: " << copy() << "\n";
    vector<function<int()>> fs;
    for (int i = 0; i < 3; ++i) fs.push_back([i]() { return i * i; });
    for (auto& f : fs) cout << f() << " ";
    cout << "\n";
}
```
**Why:** `byVal` froze `x` at 10 when it was created. `byRef` sees the later change. A `mutable` lambda keeps its own state between calls. Copying the lambda copies that state, so the two then count on their own. The loop copies each `i` into its lambda, so the results are 0, 1, 4.
:::

:::qa Puzzle 4: shared_ptr reference counts {level=medium}
```cpp run title="use_count and weak_ptr"
#include <iostream>
#include <memory>
using namespace std;
struct Node { ~Node() { cout << "  Node destroyed\n"; } };
int main() {
    auto a = make_shared<Node>();
    cout << "count after make: " << a.use_count() << "\n";
    {
        auto b = a;
        weak_ptr<Node> w = a;
        cout << "count with copy: " << a.use_count() << " (weak does not count)\n";
        shared_ptr<Node> c = w.lock();
        cout << "after lock: " << a.use_count() << "\n";
    }
    cout << "count after block: " << a.use_count() << "\n";
    weak_ptr<Node> watcher = a;
    a.reset();
    cout << "expired after reset: " << boolalpha << watcher.expired() << ", lock() is null: " << (watcher.lock() == nullptr) << "\n";
}
```
**Why:** each `shared_ptr` copy adds 1 to the count. A `weak_ptr` adds nothing, but `lock()` makes a temporary owner for as long as you hold it. When the last owner goes away, the object is destroyed, and the weak pointers see it as expired.
:::

:::qa Puzzle 5: map operator[] inserts {level=medium}
```cpp run title="operator[] vs find vs at"
#include <iostream>
#include <map>
#include <string>
using namespace std;
int main() {
    map<string, int> stock{{"apple", 5}};
    cout << "size before: " << stock.size() << "\n";
    cout << "banana (operator[]): " << stock["banana"] << "\n";
    cout << "size after operator[]: " << stock.size() << "\n";
    cout << "cherry via find: " << (stock.find("cherry") != stock.end() ? "found" : "missing") << ", size: " << stock.size() << "\n";
    try { stock.at("durian"); } catch (const out_of_range&) { cout << "at() threw out_of_range, size: " << stock.size() << "\n"; }
    for (auto& [k, v] : stock) cout << k << "=" << v << " ";
    cout << "\n";
}
```
**Why:** `operator[]` creates the entry if it is missing (with value 0 for an `int`). This is a common cause of "ghost keys". `find` and `at` do not change the map.
:::

:::qa Puzzle 6: exceptions, catch order and unwinding {level=hard}
```cpp run title="Throw, catch and RAII during unwinding"
#include <iostream>
#include <stdexcept>
using namespace std;
struct Guard { const char* n; Guard(const char* n) : n(n) { cout << "enter " << n << "\n"; } ~Guard() { cout << "leave " << n << "\n"; } };
struct AppError : runtime_error { using runtime_error::runtime_error; };
void inner() { Guard g("inner"); throw AppError("disk full"); }
void middle() { Guard g("middle"); inner(); cout << "never printed\n"; }
int main() {
    try { Guard g("main try"); middle(); }
    catch (const runtime_error& e) { cout << "caught runtime_error: " << e.what() << "\n"; }
    try { throw 42; } catch (int n) { cout << "caught int " << n << "\n"; }
    try { try { throw logic_error("first"); } catch (const exception& e) { cout << "inner caught " << e.what() << ", rethrowing\n"; throw; } }
    catch (const logic_error& e) { cout << "outer caught " << e.what() << "\n"; }
}
```
**Why:** the destructors of `inner`, `middle` and the try block run in reverse order while the error travels up, before the handler runs. The first matching `catch` wins: `AppError` is caught by the `runtime_error` handler because it derives from it. That is why a base-class handler placed before a child handler makes the child handler unreachable (the compiler warns). `throw;` throws the same error again.
:::

:::qa Puzzle 7: template deduction and auto {level=hard}
```cpp run title="What type does auto deduce?"
#include <iostream>
#include <type_traits>
#include <vector>
using namespace std;
int main() {
    const int ci = 5;
    int i = 7;
    int& ri = i;
    auto a = ci;            // drops const
    auto& b = ci;           // keeps const
    auto c = ri;            // drops the reference
    decltype(ri) d = i;     // keeps the reference
    auto&& e = i;           // forwarding reference to an lvalue
    cout << boolalpha;
    cout << "a is const: " << is_const_v<decltype(a)> << "\n";
    cout << "b is const: " << is_const_v<remove_reference_t<decltype(b)>> << "\n";
    cout << "c is reference: " << is_reference_v<decltype(c)> << "\n";
    cout << "d is reference: " << is_reference_v<decltype(d)> << "\n";
    cout << "e is lvalue reference: " << is_lvalue_reference_v<decltype(e)> << "\n";
    vector<bool> vb{true, false};
    auto first = vb[0];     // a proxy, not bool
    cout << "auto from vector<bool> is bool: " << is_same_v<decltype(first), bool> << "\n";
}
```
**Why:** plain `auto` drops top-level `const` and references. `auto&` keeps them. `decltype` keeps everything. `auto&&` bound to an lvalue becomes an lvalue reference. `vector<bool>` is a special bit-packed container, and its `operator[]` returns a small helper object.
:::

:::qa Puzzle 8: static local and initialisation order {level=hard}
```cpp run title="Function-local statics"
#include <iostream>
using namespace std;
struct Noisy { int id; Noisy(int i) : id(i) { cout << "build " << id << "\n"; } ~Noisy() { cout << "destroy " << id << "\n"; } };
int next() { static int n = 0; return ++n; }
Noisy& instance() { static Noisy s(1); return s; }
int main() {
    cout << next() << next() << next() << "\n";
    cout << "before first use\n";
    instance();
    instance();
    cout << "second call did not rebuild\n";
    Noisy local(2);
    cout << "end of main\n";
}
```
**Why:** a `static` local is built **once**, the first time the code passes through it (thread-safe since C++11), and it is destroyed at program exit after the locals. That makes it the safe "construct on first use" pattern.
:::

:::qa Puzzle 9: strings and C strings {level=medium}
```cpp run title="Comparing strings"
#include <cstring>
#include <iostream>
#include <string>
using namespace std;
int main() {
    char a[] = "hi";
    const char* b = "hi";
    string s = "hi", t = "hi";
    cout << boolalpha;
    cout << "array == pointer (addresses): " << (a == b) << "\n";
    cout << "strcmp == 0: " << (strcmp(a, b) == 0) << "\n";
    cout << "string == string: " << (s == t) << "\n";
    cout << "string == const char*: " << (s == b) << "\n";
    cout << "sizeof(a)=" << sizeof(a) << " strlen(a)=" << strlen(a) << " s.size()=" << s.size() << "\n";
    string u = "abc" + string("def");
    u += 'g';
    cout << u << " " << u.substr(2, 3) << " " << u.find("fg") << " " << (u.find("zz") == string::npos) << "\n";
}
```
**Why:** comparing an array with a pointer compares **addresses**. `sizeof` of the array includes the ending `'\0'`, but `strlen` does not. `std::string` compares the text.
:::

:::qa Puzzle 10: evaluation and operators {level=medium}
```cpp run title="Short-circuit, ternary and comma"
#include <iostream>
using namespace std;
bool yes(const char* who) { cout << who << " "; return true; }
bool no(const char* who) { cout << who << " "; return false; }
int main() {
    cout << "A: "; bool r1 = no("one") && yes("two"); cout << "-> " << r1 << "\n";
    cout << "B: "; bool r2 = yes("one") || yes("two"); cout << "-> " << r2 << "\n";
    cout << "C: "; bool r3 = no("one") || yes("two"); cout << "-> " << r3 << "\n";
    int x = 5;
    int y = (x > 3) ? x * 2 : x / 2;
    int z = (x++, x * 10);
    cout << "y=" << y << " z=" << z << " x=" << x << "\n";
    int i = 3;
    int j = i++ * 2;
    int k = ++i * 2;
    cout << "j=" << j << " k=" << k << " i=" << i << "\n";
}
```
**Why:** `&&` and `||` stop as soon as the answer is known, so the second function may never run. The comma operator evaluates left to right and gives the last value. `i++` gives the old value (3, then `i` becomes 4). `++i` gives the new value (5).
:::

:::qa Puzzle 11: vector growth and invalid iterators {level=hard}
```cpp run title="capacity, reserve and erase-remove"
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v;
    size_t lastCap = 0; int growths = 0;
    for (int i = 0; i < 100; ++i) { v.push_back(i); if (v.capacity() != lastCap) { lastCap = v.capacity(); ++growths; } }
    cout << "100 push_backs caused " << growths << " reallocations (about log2 of 100)\n";
    vector<int> w; w.reserve(100);
    const int* before = nullptr;
    for (int i = 0; i < 100; ++i) { w.push_back(i); if (i == 0) before = w.data(); }
    cout << "with reserve, data pointer unchanged: " << boolalpha << (before == w.data()) << ", size=" << w.size() << " capacity>=100: " << (w.capacity() >= 100) << "\n";
    vector<int> nums{1, 2, 3, 2, 4, 2, 5};
    nums.erase(remove(nums.begin(), nums.end(), 2), nums.end());
    for (int n : nums) cout << n << " ";
    cout << "\n";
}
```
**Why:** the capacity grows by multiplying (here, only a few reallocations), which makes `push_back` O(1) on average. `reserve` avoids the reallocations, so pointers stay valid. `remove` moves the wanted items forward, and `erase` cuts the tail.
:::

:::qa Puzzle 12: CRTP and static polymorphism {level=hard}
```cpp run title="CRTP"
#include <iostream>
using namespace std;
template <class Derived>
struct Shape {
    double area() const { return static_cast<const Derived*>(this)->areaImpl(); }
    void describe() const { cout << name() << " with area " << area() << "\n"; }
    const char* name() const { return static_cast<const Derived*>(this)->nameImpl(); }
};
struct Sq : Shape<Sq> { double s; explicit Sq(double s) : s(s) {} double areaImpl() const { return s * s; } const char* nameImpl() const { return "Square"; } };
struct Circ : Shape<Circ> { double r; explicit Circ(double r) : r(r) {} double areaImpl() const { return 3.14 * r * r; } const char* nameImpl() const { return "Circle"; } };
template <class S> void show(const Shape<S>& s) { s.describe(); }
int main() {
    show(Sq(3)); show(Circ(1));
    cout << "sizeof(Sq)=" << sizeof(Sq) << " (no vptr)\n";
}
```
**Why:** the base class template knows its child type, so the call is decided at compile time and can be inlined. There is no vtable and no hidden pointer in each object. The price: there is no common base type for a mixed `vector`.
:::

```quiz
? What does `auto x = ref;` give when ref is an int&?
- int&
+ int
- const int&
> auto drops references and top-level const.
```

:::keypoints
- Mixing signed and unsigned, narrowing, and `size_t` maths cause quiet bugs.
- Know padding rules, capture meaning, map `operator[]`, the order of exception unwinding, and `auto` deduction.
- A static local is built once, on first use.
:::
