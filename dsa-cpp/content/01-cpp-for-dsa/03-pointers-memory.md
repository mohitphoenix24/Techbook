---
title: Pointers, References & Memory
level: easy
time: 35
summary: How data actually lives in memory — the stack and the heap, addresses, pointers and references, new/delete and smart pointers, building linked nodes, and why contiguous memory (cache locality) makes arrays so fast.
---

Linked lists, trees and graphs are built from **nodes that point to other nodes**. To work with them confidently, you need a clear picture of what a pointer is. You also need to know why memory layout affects speed as much as Big-O does.

## Memory is a giant array of bytes

:::def Address
Every byte of memory has a number, its **address**. A variable lives at some address, and `&x` gives you that address.
:::

:::def Pointer
A variable that **stores an address**. `int* p` is "a pointer to an int". `*p` follows the pointer to the value it points at (this is called *dereferencing*).
:::

:::syntax
```cpp
int x = 42;
int* p = &x;      // p holds the address of x
*p = 7;           // write through the pointer: x is now 7
int& r = x;       // r is a reference: another name for x
r = 9;            // x is now 9
p = nullptr;      // a pointer that points nowhere
```
:::

```cpp run level=easy title="Addresses, pointers and references"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int x = 42;
    int* p = &x;
    cout << "x = " << x << ", *p = " << *p << '\n';

    *p = 7;                           // change x through the pointer
    cout << "after *p = 7, x = " << x << '\n';

    int& r = x;                       // reference = alias
    r += 1;
    cout << "after r += 1, x = " << x << '\n';

    int arr[4] = {10, 20, 30, 40};
    int* q = arr;                     // an array name decays to a pointer to its first element
    cout << "q[2] = " << q[2] << ", *(q + 2) = " << *(q + 2) << '\n';
    cout << "elements are " << (char*)&arr[1] - (char*)&arr[0] << " bytes apart\n";
}
```

### Pointer vs reference

| | Pointer `T*` | Reference `T&` |
|---|---|---|
| Can be null | yes (`nullptr`) | no, must refer to something |
| Can be re-pointed | yes | no, bound for life |
| Syntax to use | `*p`, `p->field` | just the name |
| Typical use | links between nodes, optional values | function parameters, aliases |

`p->val` is shorthand for `(*p).val`: "follow the pointer, then take the field".

## Stack and heap

:::def Stack memory
Memory for **local variables and function calls**. It's fast and freed automatically when a function returns. It's also small, typically 1–8 MB, which is why very deep recursion crashes with a *stack overflow*.
:::

:::def Heap memory
A large pool you allocate from at runtime (`new`, or containers like `vector` doing it for you). It lives until it's freed. If you forget to free it, that's a **memory leak**.
:::

```cpp run level=intermediate title="new, delete and smart pointers"
#include <bits/stdc++.h>
using namespace std;

struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};

int main() {
    // Manual: you must delete what you new
    Node* a = new Node(1);
    a->next = new Node(2);
    cout << a->val << " -> " << a->next->val << '\n';
    delete a->next;
    delete a;

    // Smart pointer: frees itself when it goes out of scope (RAII)
    auto b = make_unique<Node>(5);
    cout << "unique_ptr node: " << b->val << '\n';

    // A vector manages its heap buffer for you, too
    vector<int> big(1'000'000, 7);
    cout << "vector of " << big.size() << " ints, about " << big.size() * sizeof(int) / 1024 << " KB on the heap\n";
}   // b and big are freed here automatically
```

:::tip In interviews
LeetCode-style problems use raw pointers (`ListNode*`, `TreeNode*`) and rarely care about `delete`. Mention that real code would free the memory or use smart pointers. It shows maturity, and it costs you one sentence.
:::

## Building linked structures

Here is the node type you'll see in every linked-list problem, and a list built from it:

```cpp run level=easy title="A tiny linked list"
#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {}
};

ListNode* build(const vector<int>& v) {
    ListNode dummy(0);                       // a fake head simplifies building
    ListNode* tail = &dummy;
    for (int x : v) { tail->next = new ListNode(x); tail = tail->next; }
    return dummy.next;
}

int main() {
    ListNode* head = build({3, 1, 4, 1, 5});
    for (ListNode* cur = head; cur != nullptr; cur = cur->next)
        cout << cur->val << (cur->next ? " -> " : " -> null\n");
}
```

The loop `for (cur = head; cur; cur = cur->next)` is **the** linked-list traversal. You'll write it hundreds of times.

:::warn Dereferencing null
`cur->next` when `cur` is `nullptr` is a crash (segmentation fault). Before following a pointer, ask: *can it be null here?* Most linked-list bugs are exactly this.
:::

```cpp run level=easy title="What a null dereference looks like" runtime-error
#include <bits/stdc++.h>
using namespace std;

struct ListNode { int val; ListNode* next; };

int main() {
    ListNode* head = nullptr;              // empty list
    cout << "about to read head->val...\n" << flush;
    cout << head->val << '\n';             // crash: there is no node
}
```

## Why memory layout matters: cache locality

Big-O counts operations, but **not all operations cost the same**. The CPU loads memory in chunks of 64 bytes (cache lines). Reading a `vector` touches neighbouring bytes, which are already in the cache. Following list pointers jumps all over memory, and each jump can miss the cache.

:::def Cache locality
Accessing memory that's **close to what you just accessed** is much faster than jumping around, because it's already in the CPU cache. Arrays have excellent locality. Linked structures usually don't.
:::

```cpp run level=intermediate timing title="Same O(n), very different speed"
#include <bits/stdc++.h>
using namespace std;

int main() {
    const int N = 5'000'000;
    vector<int> v(N, 1);
    list<int> l(v.begin(), v.end());             // doubly linked list, nodes scattered on the heap

    auto t0 = chrono::steady_clock::now();
    long long s1 = accumulate(v.begin(), v.end(), 0LL);
    auto t1 = chrono::steady_clock::now();
    long long s2 = accumulate(l.begin(), l.end(), 0LL);
    auto t2 = chrono::steady_clock::now();

    auto ms = [](auto d) { return chrono::duration<double, milli>(d).count(); };
    cout << "vector sum " << s1 << " in " << ms(t1 - t0) << " ms\n";
    cout << "list   sum " << s2 << " in " << ms(t2 - t1) << " ms\n";
}
```

Both loops are O(n), but the vector is typically several times faster. This is why `vector` is the default container. Reach for linked structures only when you need what they're good at, such as O(1) insertion in the middle when you already have a pointer to the spot.

## How big is a thing?

`sizeof` tells you how many bytes a type uses. This matters for memory limits: a typical 256 MB limit fits about 64 million `int`s, or 32 million `long long`s.

```cpp run level=easy title="sizeof"
#include <bits/stdc++.h>
using namespace std;

struct ListNode { int val; ListNode* next; };

int main() {
    cout << "char " << sizeof(char) << ", int " << sizeof(int) << ", long long " << sizeof(long long)
         << ", double " << sizeof(double) << ", pointer " << sizeof(int*) << '\n';
    cout << "ListNode " << sizeof(ListNode) << " bytes (4 for val + 4 padding + 8 for next)\n";
    cout << "vector<int> object itself: " << sizeof(vector<int>) << " bytes (3 pointers; the data lives on the heap)\n";
}
```

## Problems

:::problem Delete Node in a Linked List {level=medium lc=delete-node-in-a-linked-list tags="linked list,pointers"}
You get a pointer to a node in a singly linked list, but **not the head**. Delete that node. It's guaranteed not to be the last node.

Example: list `4 → 5 → 1 → 9`, given the node `5` → list becomes `4 → 1 → 9`.

:::hint Hint
You can't reach the previous node, so you can't unlink *this* node. But you can make this node **look like** the next one, and then unlink the next one.
:::

:::solution
Copy the next node's value into this node, then skip over the next node. The node object that leaves the list is physically the next one, but the list now reads correctly.

```cpp run
#include <bits/stdc++.h>
using namespace std;

struct ListNode { int val; ListNode* next; ListNode(int x) : val(x), next(nullptr) {} };

void deleteNode(ListNode* node) {
    ListNode* nxt = node->next;
    node->val = nxt->val;          // become the next node
    node->next = nxt->next;        // unlink the (old) next node
    delete nxt;
}

int main() {
    ListNode* head = new ListNode(4);
    head->next = new ListNode(5);
    head->next->next = new ListNode(1);
    head->next->next->next = new ListNode(9);
    deleteNode(head->next);        // delete the 5
    for (ListNode* c = head; c; c = c->next) cout << c->val << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(1) |
Space | O(1) |
:::

This trick only works because the node isn't the tail. Say that out loud in an interview: noticing edge cases is part of the grade.
:::
:::

## Check yourself

```quiz
? What does `p->next` mean if `p` is a `ListNode*`?
+ Follow the pointer p, then read its `next` field
- The address of p plus one
- Make p point to the next node
> `p->next` is `(*p).next`.

? Why does very deep recursion (say 10⁷ levels) crash?
- The heap runs out
+ Each call uses stack memory, and the stack is only a few MB
- Recursion isn't allowed in C++
> Every call frame lives on the call stack. Deep recursion overflows it.

? Summing a vector and a linked list are both O(n). Why is the vector faster in practice?
+ Its elements are contiguous, so they're already in the CPU cache
- The vector uses less memory per element only
- Lists can't be summed with accumulate
> Cache locality: sequential memory access is much cheaper than pointer chasing.
```

:::keypoints
- A pointer stores an address: `&x` takes an address, `*p` and `p->field` follow it. References are non-null, fixed aliases.
- Locals and calls live on the **stack** (small, automatic). `new` and containers use the **heap**. Smart pointers free memory automatically.
- Always ask "can this pointer be null?" before dereferencing it.
- Contiguous memory (arrays, `vector`) is very cache-friendly. Same Big-O doesn't mean same speed.
:::
