---
title: Undefined behaviour and the classic gotchas
level: advanced
time: 40
summary: What undefined behaviour is and why it matters, the most common sources (uninitialised reads, dangling references, out-of-bounds access, signed overflow, order of evaluation), the most vexing parse, and the sanitizer flags that find them.
---

**Undefined behaviour (UB)** means the C++ standard places **no requirements** on the program. It may crash, print nonsense, or appear to work, and the compiler is allowed to assume UB never happens. That assumption can make correct-looking code misbehave under optimisation. Interviewers love UB.

## The catalogue

| Source of UB | Example |
|---|---|
| Reading an uninitialised variable | `int x; cout << x;` |
| Dereferencing null or a dangling pointer/reference | returning `&local`, using an iterator after `erase` |
| Out-of-bounds access | `v[10]` on a vector of size 3, `arr[5]` on `int arr[3]` |
| **Signed** integer overflow | `INT_MAX + 1` |
| Violating `const` | modifying an object that was *defined* `const` |
| Deleting through a base pointer without a virtual destructor | `delete basePtr` |
| Double free, use after free | `delete p; delete p;` |
| Data race | two threads write one variable without synchronisation |
| Missing return in a non-void function | falling off the end |
| Modifying a variable twice with no sequencing | `i = i++ + ++i;` |
| ODR violation | two different definitions of one function in two files |

## Signed overflow vs unsigned wraparound

```cpp run title="Unsigned wraps (defined); signed overflow is UB"
#include <climits>
#include <cstdint>
#include <iostream>
using namespace std;

int main() {
    unsigned int u = UINT_MAX;
    cout << "UINT_MAX + 1 = " << u + 1 << "   (defined: wraps around to 0)\n";

    int big = INT_MAX;
    // int bad = big + 1;                     // UB: signed overflow. The compiler may assume it cannot happen.
    long long ok = static_cast<long long>(big) + 1;    // widen first
    cout << "as long long: " << ok << "\n";

    uint8_t byte = 250;
    byte += 10;                                // converts back to 8 bits: 260 mod 256 = 4 (defined)
    cout << int(byte) << "\n";
}
```

## Unsigned comparison trap

```cpp run title="size_t arithmetic surprises"
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    cout << "v.size() - 1 = " << v.size() - 1 << "   (wraps to a huge number, not -1)\n";
    // for (size_t i = 0; i <= v.size() - 1; ++i)    // BUG: loops "forever" over an empty vector
    cout << boolalpha << (-1 < 1u) << "   (-1 is converted to a huge unsigned value, so this is false)\n";
}
```

## Order of evaluation

The order in which function arguments are evaluated is **unspecified**. Never write code that depends on it.

```cpp run title="Do not depend on argument order"
#include <iostream>
using namespace std;

int counter = 0;
int next() { return ++counter; }
void show(int a, int b) { cout << "(" << a << ", " << b << ")\n"; }

int main() {
    // show(next(), next());      // may print (1, 2) or (2, 1): unspecified. Do not write this.
    int a = next();               // fix: sequence the calls with separate statements
    int b = next();
    show(a, b);
    cout << "since C++17, 'cout << next() << next()' is left-to-right: " << flush;
    cout << next() << " " << next() << "\n";
}
```

C++17 made `<<`/`>>` chains, `=` right side first, and `a.b(c)` object-first well-defined, but **function arguments remain unspecified**.

## The most vexing parse

```cpp run title="Anything that looks like a declaration IS a declaration"
#include <iostream>
#include <string>
using namespace std;

struct Timer {};
struct Service { explicit Service(Timer) {} };

int main() {
    Service a(Timer());                         // declares a FUNCTION named a! (taking a function returning Timer)
    Service b{Timer{}};                         // braces: unambiguously an object
    cout << "a is a function declaration, b is an object\n";
    (void)b;
    // a.start();                               // would not compile: a is not an object
}
```

Use brace initialisation `{}` to avoid it.

## Dangling references and views

```cpp title="Display only: each line below is a bug"
const string& longest(const string& a, const string& b) { return a.size() > b.size() ? a : b; }
const string& r = longest(string("short"), string("longer"));   // both temporaries die at the ';' -> dangling r

string_view sv = string("temporary");        // the string is destroyed immediately -> dangling view
auto it = v.begin(); v.push_back(1);         // push_back may reallocate -> 'it' is invalid
for (auto& x : makeVector()) { }             // OK: the temporary lives for the loop
for (auto& x : makeObj().items()) { }        // BUG before C++23: makeObj() temporary is destroyed first
```

## Slicing, shadowing and other silent traps

```cpp run title="Silent bugs the compiler won't stop"
#include <iostream>
#include <string>
using namespace std;

struct Config {
    int retries = 3;
    void set(int retries) { retries = retries; }          // BUG: assigns the parameter to itself (shadowing)
    void setOk(int retries) { this->retries = retries; }  // fix
};

int main() {
    Config c;
    c.set(9);
    cout << "after buggy set: " << c.retries << "\n";
    c.setOk(9);
    cout << "after fixed set: " << c.retries << "\n";

    if (string("a") == "a") cout << "string compares by content\n";
    const char* p = "x";
    const char* q = "x";
    cout << "pointers compare by address, not content (may be " << (p == q ? "equal" : "different") << ")\n";
}
```

## The tools that find UB

Compile your tests with these flags. They catch most of the list above at run time:

```bash
g++ -std=c++20 -g -O1 -fsanitize=address,undefined -fno-omit-frame-pointer main.cpp -o main   # memory errors, UB
g++ -std=c++20 -g -O1 -fsanitize=thread main.cpp -o main                                       # data races
g++ -std=c++20 -Wall -Wextra -Wpedantic -Wshadow -Wconversion main.cpp                         # many bugs at compile time
valgrind ./main                                                                                # leaks, uninitialised reads
```

| Tool | Finds |
|---|---|
| **AddressSanitizer (ASan)** | out-of-bounds, use-after-free, use-after-return, leaks |
| **UndefinedBehaviorSanitizer (UBSan)** | signed overflow, null deref, misaligned access, bad shifts |
| **ThreadSanitizer (TSan)** | data races |
| **MemorySanitizer / Valgrind** | uninitialised reads |
| `-Wall -Wextra -Wshadow -Wconversion` | shadowing, narrowing, missing returns, unused values |

:::interview Why is undefined behaviour dangerous?
"The standard puts no limits on what the program may do, and compilers optimise *assuming* UB never happens. A signed overflow check like `if (x + 1 < x)` can be removed entirely. UB can therefore pass tests in a debug build and fail in release, and it is a source of security bugs. I avoid it by using RAII and containers, `at()` or checked access where input is untrusted, initialising everything, and running tests under ASan, UBSan and TSan."
:::

```quiz
? Which of these is undefined behaviour?
- Unsigned integer overflow
+ Signed integer overflow
- Integer division by 1
> Unsigned arithmetic wraps by definition; signed overflow is UB.
? What does `Service a(Timer());` declare?
- An object named a
+ A function named a (the most vexing parse)
- A syntax error
> Use braces: `Service a{Timer{}};`.
? Is `f(g(), h())` guaranteed to call g before h?
- Yes
+ No, the order of evaluating arguments is unspecified
> Put the calls in separate statements if the order matters.
```

:::keypoints
- UB means the program has no meaning; compilers may assume it never happens. Typical sources: uninitialised reads, dangling pointers, out-of-bounds, signed overflow, data races.
- Beware size_t arithmetic, evaluation order of arguments, the most vexing parse, and shadowing.
- Test under ASan + UBSan (and TSan for threads), and compile with `-Wall -Wextra -Wshadow`.
:::
