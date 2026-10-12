---
title: Linked Lists
level: intermediate
time: 60
summary: Singly and doubly linked lists, the cost of each operation, and the techniques that solve almost every list problem — the dummy head, careful pointer re-wiring (reversal, iterative and recursive), the two-pointer gap, splicing — through eight classic problems up to Reverse Nodes in k-Group.
---

Linked list problems are rarely about clever algorithms. They're about **re-wiring pointers without losing anything**. A few techniques, plus the discipline to check the null cases, cover nearly all of them.

## Singly and doubly linked lists

:::def Singly linked list
A chain of nodes. Each node stores a value and a pointer `next` to the following node. The last node's `next` is `nullptr`. You only hold a pointer to the **head**.
:::

:::def Doubly linked list
Each node also has a `prev` pointer. That allows $O(1)$ removal of a node you hold a pointer to, and walking backwards. `std::list` is doubly linked. The LRU cache uses one.
:::

| Operation | Array / vector | Linked list |
|---|---|---|
| access the k-th element | $O(1)$ | $O(k)$ |
| insert/delete at the front | $O(n)$ | $O(1)$ |
| insert/delete **after a node you hold** | $O(n)$ | $O(1)$ |
| delete a node you hold (doubly) | $O(n)$ | $O(1)$ |
| search | $O(n)$ | $O(n)$ |
| memory/cache behaviour | compact, cache-friendly | an extra pointer per node, scattered |

All the problems below use LeetCode's node type and two small helpers to build and print lists:

```cpp
struct ListNode {
    int val; ListNode* next;
    ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {}
};
```

## Technique 1: the dummy (sentinel) head

:::def Dummy node
A fake node placed **before** the real head. Then even the first real node has a predecessor, so "insert or delete at the head" stops being a special case. Return `dummy.next` at the end.
:::

## Technique 2: re-wire in the right order

Before overwriting a `next` pointer, **save what you'll need later**. The classic example is reversal:

```viz algo=reverse-list
```

:::tip Draw it
For any list problem, draw 3–4 boxes with arrows and trace your pointer updates on paper, including the case of an empty list and a single node. Interviewers expect to see you do this, and it catches most bugs.
:::

## Technique 3: two pointers with a gap

To find the k-th node from the **end** in one pass, move `fast` ahead by `k` nodes, then move both together. When `fast` reaches the end, `slow` is `k` from the end.

## Problems

:::problem Reverse Linked List {level=easy lc=reverse-linked-list tags="linked list,recursion"}
Reverse a singly linked list. Do it iteratively and recursively.

Example: `1→2→3→4→5` → `5→4→3→2→1`.

:::hint Hint
Iteratively: three pointers `prev`, `curr`, `nxt`. Recursively: reverse the rest of the list, then make `head->next` point back to `head`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* reverseIter(ListNode* head) {
    ListNode *prev = nullptr, *curr = head;
    while (curr) {
        ListNode* nxt = curr->next;   // save the rest
        curr->next = prev;            // flip
        prev = curr;                  // advance
        curr = nxt;
    }
    return prev;
}

ListNode* reverseRec(ListNode* head) {
    if (!head || !head->next) return head;      // 0 or 1 node
    ListNode* newHead = reverseRec(head->next);  // reverse everything after head
    head->next->next = head;                     // the old second node now points back
    head->next = nullptr;
    return newHead;
}

int main() {
    print(reverseIter(build({1, 2, 3, 4, 5})));
    print(reverseRec(build({1, 2, 3})));
    print(reverseIter(build({})));
}
```

:::complexity
Time | O(n) |
Space | O(1) | iterative; O(n) recursion stack for the recursive version
:::
:::
:::

:::problem Merge Two Sorted Lists {level=easy lc=merge-two-sorted-lists tags="linked list,dummy node,merge"}
Merge two sorted lists into one sorted list by splicing their nodes together.

Example: `1→2→4`, `1→3→4` → `1→1→2→3→4→4`.

:::hint Hint
Dummy head plus a `tail` pointer. Attach the smaller front node, then advance.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* mergeTwoLists(ListNode* a, ListNode* b) {
    ListNode dummy(0);
    ListNode* tail = &dummy;
    while (a && b) {
        if (a->val <= b->val) { tail->next = a; a = a->next; }
        else { tail->next = b; b = b->next; }
        tail = tail->next;
    }
    tail->next = a ? a : b;        // attach whatever is left
    return dummy.next;
}

int main() { print(mergeTwoLists(build({1, 2, 4}), build({1, 3, 4}))); }
```

:::complexity
Time | O(n + m) |
Space | O(1) | nodes are re-linked, not copied
:::
:::
:::

:::problem Remove Nth Node From End of List {level=medium lc=remove-nth-node-from-end-of-list tags="linked list,two pointers,dummy node"}
Remove the `n`-th node from the end and return the head, in one pass.

Example: `1→2→3→4→5, n=2` → `1→2→3→5`.

:::hint Hint
Put `fast` `n` nodes ahead of `slow`, starting both at a dummy. When `fast` is on the last node, `slow` is just **before** the node to delete. The dummy handles deleting the head.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* removeNthFromEnd(ListNode* head, int n) {
    ListNode dummy(0, head);
    ListNode *fast = &dummy, *slow = &dummy;
    for (int i = 0; i < n; i++) fast = fast->next;          // gap of n
    while (fast->next) { fast = fast->next; slow = slow->next; }
    ListNode* del = slow->next;
    slow->next = del->next;
    delete del;
    return dummy.next;
}

int main() {
    print(removeNthFromEnd(build({1, 2, 3, 4, 5}), 2));
    print(removeNthFromEnd(build({1, 2}), 2));               // removes the head
    print(removeNthFromEnd(build({1}), 1));                  // empty result
}
```

:::complexity
Time | O(L) | one pass
Space | O(1) |
:::
:::
:::

:::problem Intersection of Two Linked Lists {level=easy lc=intersection-of-two-linked-lists tags="linked list,two pointers"}
Two lists may merge into one shared tail. Return the first shared node, or `nullptr`. Use $O(1)$ extra memory.

:::hint Hint
Walk `pA` through A then B, and `pB` through B then A. Both then travel the same total distance before meeting.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };

ListNode* getIntersectionNode(ListNode* a, ListNode* b) {
    ListNode *p = a, *q = b;
    while (p != q) {
        p = p ? p->next : b;     // switch to the other list at the end
        q = q ? q->next : a;
    }
    return p;                    // the meeting node, or nullptr if they never share one
}

int main() {
    ListNode* shared = new ListNode(8, new ListNode(4, new ListNode(5)));
    ListNode* A = new ListNode(4, new ListNode(1, shared));
    ListNode* B = new ListNode(5, new ListNode(6, new ListNode(1, shared)));
    ListNode* r = getIntersectionNode(A, B);
    cout << (r ? to_string(r->val) : "none") << '\n';
    cout << (getIntersectionNode(new ListNode(1), new ListNode(2)) ? "found" : "none") << '\n';
}
```

:::proof Why the two pointers meet at the intersection
Let A's private part have length $a$, B's private part length $b$, and the shared tail length $c$. Pointer `p` walks $a + c$ nodes, then $b$ more, and arrives at the intersection after $a + c + b$ steps. Pointer `q` walks $b + c$, then $a$ more, and arrives after $b + c + a$ steps, the **same number**. If there's no intersection ($c = 0$), both reach `nullptr` together after $a + b$ steps, and the loop ends with `p == q == nullptr`.
:::

:::complexity
Time | O(a + b + c) |
Space | O(1) |
:::
:::
:::

:::problem Add Two Numbers {level=medium lc=add-two-numbers tags="linked list,math"}
Two non-negative numbers are stored as lists of digits in **reverse** order (`2→4→3` is 342). Return their sum as a list in the same format.

Example: `2→4→3 + 5→6→4` → `7→0→8` (342 + 465 = 807).

:::hint Hint
Grade-school addition from the least significant digit, carrying as you go. Keep going while **either** list has digits **or** there's a carry.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* addTwoNumbers(ListNode* a, ListNode* b) {
    ListNode dummy(0);
    ListNode* tail = &dummy;
    int carry = 0;
    while (a || b || carry) {
        int s = carry + (a ? a->val : 0) + (b ? b->val : 0);
        carry = s / 10;
        tail = tail->next = new ListNode(s % 10);
        if (a) a = a->next;
        if (b) b = b->next;
    }
    return dummy.next;
}

int main() {
    print(addTwoNumbers(build({2, 4, 3}), build({5, 6, 4})));
    print(addTwoNumbers(build({9, 9, 9, 9}), build({9, 9})));
}
```

:::complexity
Time | O(\max(m, n)) |
Space | O(\max(m, n)) | the output list
:::
:::
:::

:::problem Reorder List {level=medium lc=reorder-list tags="linked list,fast-slow,reversal"}
Reorder `L0→L1→…→Ln` into `L0→Ln→L1→Ln−1→L2→…` in place.

Example: `1→2→3→4→5` → `1→5→2→4→3`.

:::hint Hint
It's three problems you already know: find the middle (slow/fast), reverse the second half, then interleave the two halves.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

void reorderList(ListNode* head) {
    if (!head || !head->next) return;
    ListNode *slow = head, *fast = head;
    while (fast->next && fast->next->next) { slow = slow->next; fast = fast->next->next; }
    ListNode *prev = nullptr, *curr = slow->next;        // reverse the second half
    slow->next = nullptr;
    while (curr) { ListNode* n = curr->next; curr->next = prev; prev = curr; curr = n; }
    ListNode *a = head, *b = prev;                        // interleave
    while (b) {
        ListNode *an = a->next, *bn = b->next;
        a->next = b; b->next = an;
        a = an; b = bn;
    }
}

int main() {
    ListNode* h = build({1, 2, 3, 4, 5}); reorderList(h); print(h);
    ListNode* g = build({1, 2, 3, 4});    reorderList(g); print(g);
}
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Copy List with Random Pointer {level=medium lc=copy-list-with-random-pointer tags="linked list,hash map"}
Each node has `next` and a `random` pointer (to any node, or null). Return a **deep copy**.

:::hint Hint 1
A hash map `original → copy` makes it easy: first create every copy, then set `copy->next = map[orig->next]` and `copy->random = map[orig->random]`.
:::

:::hint Hint 2
For $O(1)$ extra space, interleave each copy right after its original (`A→A'→B→B'`). Then `A'->random = A->random->next`. Finally split the two lists apart.
:::

:::solution
The interleaving version, which uses $O(1)$ extra space:

```cpp run
#include <bits/stdc++.h>
using namespace std;
struct Node { int val; Node* next = nullptr; Node* random = nullptr; Node(int v) : val(v) {} };

Node* copyRandomList(Node* head) {
    for (Node* c = head; c; c = c->next->next) {          // 1. A -> A' -> B -> B' ...
        Node* cp = new Node(c->val);
        cp->next = c->next;
        c->next = cp;
    }
    for (Node* c = head; c; c = c->next->next)            // 2. set the randoms of the copies
        if (c->random) c->next->random = c->random->next;
    Node dummy(0); Node* t = &dummy;                       // 3. split the two lists apart
    for (Node* c = head; c; c = c->next) {
        t->next = c->next;  t = t->next;
        c->next = c->next->next;                           // restore the original list
    }
    return dummy.next;
}

int main() {
    vector<Node*> v; for (int x : {7, 13, 11, 10, 1}) v.push_back(new Node(x));
    for (int i = 0; i + 1 < 5; i++) v[i]->next = v[i + 1];
    v[1]->random = v[0]; v[2]->random = v[4]; v[3]->random = v[2]; v[4]->random = v[0];
    Node* cp = copyRandomList(v[0]);
    for (Node* c = cp; c; c = c->next)
        cout << '[' << c->val << ", random=" << (c->random ? to_string(c->random->val) : "null") << "] ";
    cout << "\ndeep copy? " << (cp != v[0] ? "yes" : "no") << '\n';
}
```

:::complexity
Time | O(n) | three passes
Space | O(1) | extra (O(n) with the hash map version)
:::
:::
:::

:::problem Reverse Nodes in k-Group {level=hard lc=reverse-nodes-in-k-group tags="linked list,reversal"}
Reverse the nodes `k` at a time. A final group shorter than `k` stays as it is.

Example: `1→2→3→4→5, k=2` → `2→1→4→3→5`; with `k=3` → `3→2→1→4→5`.

:::hint Hint
Keep `groupPrev`, the node just before the current group (start with a dummy). Check that `k` nodes exist ahead, reverse exactly those `k`, then reconnect both ends.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }
void print(ListNode* h) { for (; h; h = h->next) cout << h->val << (h->next ? "->" : ""); cout << '\n'; }

ListNode* reverseKGroup(ListNode* head, int k) {
    ListNode dummy(0, head);
    ListNode* groupPrev = &dummy;
    while (true) {
        ListNode* kth = groupPrev;
        for (int i = 0; i < k && kth; i++) kth = kth->next;     // the k-th node of this group
        if (!kth) break;                                         // fewer than k left
        ListNode *groupNext = kth->next, *prev = groupNext, *curr = groupPrev->next;
        while (curr != groupNext) {                              // reverse; the first node will point to groupNext
            ListNode* n = curr->next; curr->next = prev; prev = curr; curr = n;
        }
        ListNode* firstOfGroup = groupPrev->next;                // now the LAST of the reversed group
        groupPrev->next = kth;                                   // kth is the new first
        groupPrev = firstOfGroup;
    }
    return dummy.next;
}

int main() { print(reverseKGroup(build({1, 2, 3, 4, 5}), 2)); print(reverseKGroup(build({1, 2, 3, 4, 5}), 3)); }
```

:::complexity
Time | O(n) | each node is visited a constant number of times
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? What problem does a dummy head node solve?
+ It gives the first real node a predecessor, so operations at the head aren't special cases
- It makes the list doubly linked
- It speeds up searching
> Return dummy.next at the end.

? In iterative reversal, what must you save BEFORE setting curr->next = prev?
+ curr->next (the rest of the list)
- prev->next
- head
> Otherwise the rest of the list is lost.

? Two lists A and B (lengths a+c and b+c) share a tail of length c. Switching heads, the pointers meet after…
+ a + b + c steps
- max(a, b) steps
- c steps
> Both walk the same total distance.
```

:::keypoints
- Lists give $O(1)$ splicing at a known node but $O(n)$ access. Arrays are the opposite (and more cache-friendly).
- Dummy head = no special cases at the front. Return `dummy.next`.
- Save `next` before re-wiring. Reversal is the core move (iteratively with prev/curr/nxt, or recursively).
- Two pointers: a gap of k (k-th from the end), switching heads (intersection), slow/fast (middle, cycles; next lesson).
- Many hard list problems are compositions: middle + reverse + merge/interleave.
:::
