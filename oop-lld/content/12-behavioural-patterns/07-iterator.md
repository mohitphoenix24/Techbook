---
title: Iterator
level: intermediate
time: 35
summary: Walking through a collection without exposing its structure: how the C++ standard library is built on iterators, writing your own iterator for a range-for loop, a binary-tree in-order iterator, iterator categories, a generator-style iterator, and invalidation.
---

:::def Iterator
Provide a way to **access the elements of an aggregate object sequentially** without exposing its underlying representation.
:::

The classical GoF iterator has `first()`, `next()`, `isDone()`, `current()`. **C++ built the idea into the language and the standard library**: `begin()`, `end()`, `++it`, `*it`, `it != end`. Every container, algorithm and range-for loop relies on it.

## Why iterators matter

A vector is a contiguous array; a `list` is linked nodes; a `map` is a tree; an `unordered_map` is a hash table. The same loop works for all, because each offers an iterator:

```cpp run title="One loop, four very different containers"
#include <iostream>
#include <list>
#include <map>
#include <set>
#include <vector>
using namespace std;

template <typename Container>
void printAll(const Container& c) {
    for (auto it = c.begin(); it != c.end(); ++it) cout << *it << " ";     // works through ANY iterator
    cout << "\n";
}

int main() {
    printAll(vector<int>{1, 2, 3});
    printAll(list<int>{4, 5, 6});
    printAll(set<int>{9, 7, 8});
    map<string, int> m{{"a", 1}, {"b", 2}};
    for (const auto& [k, v] : m) cout << k << "=" << v << " ";
    cout << "\n";
}
```

Algorithms such as `std::find`, `std::sort` and `std::copy` take **iterator pairs**, not containers. That separates *algorithms* from *data structures*: N containers + M algorithms, not N × M functions.

## Writing your own iterator

To make your class usable in a range-for loop, provide `begin()` and `end()` returning an iterator type with `operator*`, `operator++` and `operator!=`.

```cpp run title="A range-for-friendly Countdown"
#include <iostream>
using namespace std;

class Countdown {
    int from_;
public:
    explicit Countdown(int from) : from_(from) {}

    class Iterator {
        int cur_;
    public:
        explicit Iterator(int c) : cur_(c) {}
        int operator*() const { return cur_; }
        Iterator& operator++() { --cur_; return *this; }
        bool operator!=(const Iterator& o) const { return cur_ != o.cur_; }
    };
    Iterator begin() const { return Iterator(from_); }
    Iterator end() const { return Iterator(0); }          // one past the last element
};

int main() {
    for (int n : Countdown(5)) cout << n << " ";
    cout << "liftoff\n";
}
```

The range-for loop `for (x : obj)` is translated by the compiler into `auto it = obj.begin(); while (it != obj.end()) { x = *it; ++it; }`.

## A collection iterator: iterating a custom container

```cpp run title="Ring buffer with an iterator that hides the wrap-around"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class RingBuffer {
    vector<string> data_;
    size_t head_ = 0, size_ = 0;
public:
    explicit RingBuffer(size_t cap) : data_(cap) {}
    void push(string s) {
        data_[(head_ + size_) % data_.size()] = move(s);
        if (size_ < data_.size()) ++size_; else head_ = (head_ + 1) % data_.size();     // overwrite the oldest
    }

    class Iterator {
        const RingBuffer* rb_; size_t i_;                  // logical index 0..size-1: hides the physical layout
    public:
        Iterator(const RingBuffer* rb, size_t i) : rb_(rb), i_(i) {}
        const string& operator*() const { return rb_->data_[(rb_->head_ + i_) % rb_->data_.size()]; }
        Iterator& operator++() { ++i_; return *this; }
        bool operator!=(const Iterator& o) const { return i_ != o.i_; }
    };
    Iterator begin() const { return Iterator(this, 0); }
    Iterator end() const { return Iterator(this, size_); }
};

int main() {
    RingBuffer log(3);
    for (const char* m : {"a", "b", "c", "d", "e"}) log.push(m);     // keeps only the last three
    for (const auto& m : log) cout << m << " ";
    cout << "\n";
}
```

The caller sees the **last three messages in order** (`c d e`) and never knows about the head index or the wrap-around. That is the pattern's purpose.

## Tree traversal: an in-order iterator

Iterating a tree needs to remember where you are. The iterator holds an explicit **stack** instead of using recursion.

```cpp run title="In-order iterator over a binary search tree"
#include <iostream>
#include <memory>
#include <stack>
using namespace std;

struct Node {
    int key; unique_ptr<Node> left, right;
    explicit Node(int k) : key(k) {}
};

class Bst {
    unique_ptr<Node> root_;
    static void insert(unique_ptr<Node>& n, int k) {
        if (!n) n = make_unique<Node>(k);
        else if (k < n->key) insert(n->left, k);
        else insert(n->right, k);
    }
public:
    void insert(int k) { insert(root_, k); }

    class Iterator {
        stack<const Node*> path_;                          // the nodes whose right subtrees are still to visit
        void pushLeft(const Node* n) { while (n) { path_.push(n); n = n->left.get(); } }
    public:
        explicit Iterator(const Node* root) { pushLeft(root); }
        Iterator() = default;                              // the end iterator: an empty stack
        int operator*() const { return path_.top()->key; }
        Iterator& operator++() { const Node* n = path_.top(); path_.pop(); pushLeft(n->right.get()); return *this; }
        bool operator!=(const Iterator& o) const { return path_.size() != o.path_.size(); }   // enough for end() comparison here
    };
    Iterator begin() const { return Iterator(root_.get()); }
    Iterator end() const { return Iterator(); }
};

int main() {
    Bst t;
    for (int k : {50, 30, 70, 20, 40, 60, 80}) t.insert(k);
    for (int k : t) cout << k << " ";                      // sorted order, without recursion or exposing nodes
    cout << "\n";
}
```

Clients get a **sorted traversal** without knowing about nodes or the tree shape. You could add `preOrderBegin()` or a `LevelOrder` iterator without changing the users.

## Iterator categories (what C++ promises)

| Category | Operations | Examples | Algorithms that need it |
|---|---|---|---|
| **Input** | read once, move forward | `istream_iterator` | `std::find`, `std::accumulate` |
| **Output** | write once, move forward | `ostream_iterator`, `back_inserter` | `std::copy` (destination) |
| **Forward** | multi-pass, forward only | `forward_list`, `unordered_set` | `std::replace` |
| **Bidirectional** | also `--it` | `list`, `set`, `map` | `std::reverse` |
| **Random access** | `it + n`, `it[n]`, `it1 - it2` | `vector`, `deque`, arrays | `std::sort`, `std::binary_search` |
| **Contiguous** (C++20) | random access over contiguous memory | `vector`, `array`, `string` | `std::span` |

That is why `std::sort` does not compile on a `std::list`: lists give bidirectional iterators and `sort` needs random access. (`list::sort()` is a member function for that reason.)

## A generator-like iterator

An iterator needn't have a container behind it. It can **compute** values on demand.

```cpp run title="Fibonacci numbers, lazily"
#include <iostream>
using namespace std;

class Fibonacci {
    int limit_;
public:
    explicit Fibonacci(int limit) : limit_(limit) {}
    class Iterator {
        long a_ = 0, b_ = 1; int count_;
    public:
        explicit Iterator(int count) : count_(count) {}
        long operator*() const { return a_; }
        Iterator& operator++() { long t = a_ + b_; a_ = b_; b_ = t; ++count_; return *this; }
        bool operator!=(const Iterator& o) const { return count_ != o.count_; }
    };
    Iterator begin() const { return Iterator(0); }
    Iterator end() const { return Iterator(limit_); }
};

int main() {
    for (long f : Fibonacci(12)) cout << f << " ";         // no vector of 12 numbers is ever stored
    cout << "\n";
}
```

C++20 **ranges** (`std::views::iota`, `views::filter`, `views::transform`) provide lazy sequences like this out of the box.

```cpp run title="Lazy views with C++20 ranges"
#include <iostream>
#include <ranges>
using namespace std;

int main() {
    auto evens = views::iota(1, 100) | views::filter([](int x) { return x % 2 == 0; }) | views::take(5);
    for (int x : evens) cout << x << " ";
    cout << "\n";
}
```

## Iterator invalidation (reminder)

Iterators are not magical: modifying the container may **invalidate** them (see the containers lesson). A custom container should document which operations invalidate its iterators.

:::interview Iterator: what and why? How does C++ use it?
"Iterator gives sequential access to an aggregate's elements without exposing its representation. C++ makes it a core idiom: containers offer `begin()`/`end()`, and algorithms work on iterator ranges, so any algorithm works with any container that provides the needed iterator category. To make my own class work with range-for I provide `begin()`, `end()` and an iterator type with `*`, `++` and `!=`. Traversal state, like a stack for tree in-order traversal, lives in the iterator, and there can be several independent iterators over one collection."
:::

```quiz
? What is the main benefit of the Iterator pattern?
- Faster loops
+ Clients traverse a collection without knowing its internal structure
- Fewer classes
> It separates traversal from the data structure, so algorithms are reusable.
? What do you need for a class to work in a range-for loop?
- A virtual destructor
+ begin() and end() returning an iterator with *, ++ and !=
- A template
> The compiler rewrites range-for into iterator calls.
? Why can std::sort not be used on a std::list?
- Lists cannot be sorted
+ sort needs random-access iterators, and a list provides only bidirectional ones
> Use list::sort() or copy into a vector.
```

:::keypoints
- Iterator: sequential access without exposing the structure. In C++ it is the foundation of containers and algorithms.
- Custom iterator: `begin()`, `end()`, and an iterator with `operator*`, `operator++`, `operator!=` enables range-for.
- Traversal state (a stack, an index) lives in the iterator. Know the iterator categories and invalidation rules.
:::
