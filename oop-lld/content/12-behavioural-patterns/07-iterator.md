---
title: Iterator
level: intermediate
time: 35
summary: Go through the items of a collection one by one, without knowing how it is stored inside. See how C++ uses iterators everywhere, how to write your own, a tree iterator, iterator categories, and lazy sequences.
---

## What is the Iterator pattern?

Don't memorise the definition yet. Think of it like this:

> "I want to visit every item in a collection, one by one. I don't care if it is stored as an array, a linked list or a tree. I just want to say 'give me the next one'."

:::def Iterator
A way to **go through the items of a collection one by one**, without exposing how the collection is stored inside.
:::

In many books, an iterator has `first()`, `next()`, `isDone()` and `current()`. **C++ already built this idea into the language.** Its version uses `begin()`, `end()`, `++it`, `*it` and `it != end`. Every container, every algorithm and every range-for loop depends on it.

## Why iterators are useful

A `vector` is an array. A `list` is a chain of nodes. A `map` is a tree. An `unordered_map` is a hash table. All are stored very differently. But the same loop works for all of them, because each gives an iterator:

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

Algorithms like `std::find`, `std::sort` and `std::copy` work with **a pair of iterators**, not with a container. So we only need N containers + M algorithms, and not N × M separate functions.

## Write your own iterator

To use your class in a range-for loop, give it `begin()` and `end()`. They return an iterator type that supports `operator*` (get the item), `operator++` (move on) and `operator!=` (check for the end).

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

The loop `for (x : obj)` is turned by the compiler into roughly this:

```text
auto it = obj.begin();
while (it != obj.end()) { x = *it; ++it; }
```

## Iterating a custom container

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

The caller sees the **last three messages in order** and never learns about the head index or the wrap-around. That is the whole point of the pattern.

## Tree traversal: an in-order iterator

To walk a tree, the iterator must remember where it is. Instead of recursion, it keeps its own **stack**.

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

The user gets a **sorted walk** without knowing about nodes or the shape of the tree. We could add a pre-order or level-order iterator later without changing any user.

## Iterator categories (what C++ promises)

| Category | What it can do | Examples | Algorithms that need it |
|---|---|---|---|
| **Input** | read once, move forward | `istream_iterator` | `std::find` |
| **Output** | write once, move forward | `back_inserter` | `std::copy` (the destination) |
| **Forward** | go forward many times | `forward_list` | `std::replace` |
| **Bidirectional** | also go back (`--it`) | `list`, `set`, `map` | `std::reverse` |
| **Random access** | jump (`it + n`, `it[n]`) | `vector`, `deque` | `std::sort` |
| **Contiguous** (C++20) | random access in one block | `vector`, `array`, `string` | `std::span` |

This explains why `std::sort` does not work on a `std::list`: a list gives only bidirectional iterators, and `sort` needs random access. (That is why `list` has its own `list::sort()`.)

## A generator-style iterator

An iterator does not need a container behind it. It can **calculate** the next value when asked.

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

C++20 **ranges** (`views::iota`, `views::filter`, `views::transform`) give you lazy sequences like this ready-made.

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

## A reminder about invalidation

If you change a container (like adding to a vector), old iterators may become **invalid**. If you write your own container, say which operations invalidate iterators.

## Short answer to say in an interview

:::interview What is the Iterator pattern, and how does C++ use it?
"An iterator lets me go through a collection one item at a time without knowing how it is stored. In C++ it is a core idea. Containers give begin() and end(), and algorithms work on ranges of iterators, so one algorithm works with many containers. To make my own class work in a range-for loop, I write begin(), end() and an iterator with *, ++ and !=. The walking state, like a stack for a tree, lives inside the iterator."
:::

```quiz
? What is the main benefit of the Iterator pattern?
- Faster loops
+ Users walk through a collection without knowing how it is stored
- Fewer classes
> It separates the walking from the data structure, so algorithms can be reused.
? What does a class need to work in a range-for loop?
- A virtual destructor
+ begin() and end() that give an iterator with *, ++ and !=
- A template
> The compiler changes range-for into iterator calls.
? Why can std::sort not be used on a std::list?
- Lists cannot be sorted
+ sort needs random-access iterators, and a list gives only bidirectional ones
> Use list::sort(), or copy into a vector.
```

:::keypoints
- Iterator = go through a collection without knowing its insides. In C++ it is the base of containers and algorithms.
- A custom iterator needs `begin()`, `end()`, and `operator*`, `operator++`, `operator!=` to work in range-for.
- The walking state (a stack, an index) lives in the iterator. Know the categories and when iterators become invalid.
:::
