---
title: Fast & Slow Pointers (Floyd's Cycle Detection)
level: intermediate
time: 45
summary: Two pointers moving at different speeds — finding the middle of a list, detecting a cycle, and finding where the cycle starts, with the complete mathematical proof of Floyd's algorithm. Then the same idea on implicit sequences: Happy Number and Find the Duplicate Number.
---

Send one pointer at speed 1 and another at speed 2. This simple setup finds the **middle** of a list in one pass, detects **cycles** in $O(1)$ memory, and, with a neat piece of algebra, finds **where the cycle begins**.

## Finding the middle

When `fast` reaches the end, `slow` has gone half as far: it's at the middle.

```cpp run level=easy title="Middle of a linked list"
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }

ListNode* middle(ListNode* head) {               // for even length: the SECOND middle
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) { slow = slow->next; fast = fast->next->next; }
    return slow;
}

int main() {
    cout << middle(build({1, 2, 3, 4, 5}))->val << ' ' << middle(build({1, 2, 3, 4, 5, 6}))->val << '\n';
}
```

:::tip First or second middle?
`while (fast && fast->next)` stops `slow` at the **second** middle of an even-length list (4 in `1..6`). Starting with `fast = head->next` gives the **first** middle (3). That's the one you want when splitting a list in half for merge sort.
:::

## Detecting a cycle

If the list has a cycle, `fast` never reaches null: both pointers end up circling the loop. Inside the loop, `fast` gains **one node per step** on `slow`, so the gap shrinks by 1 every step until it reaches 0 and they meet. If there's no cycle, `fast` hits null.

```viz algo=floyd-cycle
```

## Finding where the cycle starts

After they meet, reset one pointer to the head and move **both** one step at a time. They meet again exactly at the start of the cycle. Here's why.

:::derive Floyd's phase 2, proved
a = \text{distance from head to the cycle entry} || name the distances
b = \text{distance from the entry to the meeting point (along the cycle)} ||
L = \text{cycle length} ||
\text{slow walked } a + b, \quad \text{fast walked } a + b + kL \text{ for some } k \ge 1 || fast did k extra laps
2(a + b) = a + b + kL || fast walks twice as far as slow
a + b = kL \;\Rightarrow\; a = kL - b = (k-1)L + (L - b) || rearrange
! a = (L - b) + (k-1)L || head → entry equals meeting point → entry, plus whole laps
:::

So a pointer starting at the head and a pointer starting at the meeting point, both moving one step at a time, reach the entry at the **same moment**: after $a$ steps, the second one has walked $L - b$ to the entry plus $k - 1$ full laps.

:::note Why does slow meet fast within its first lap?
When `slow` enters the cycle, `fast` is somewhere ahead, at most $L - 1$ steps "behind" it going around. The gap closes by 1 per step, so they meet within $L$ more steps, before `slow` finishes one lap. That's why `slow` walked exactly $a + b$ with $b < L$, and why the algorithm is $O(n)$.
:::

## Problems

:::problem Linked List Cycle II {level=medium lc=linked-list-cycle-ii tags="fast-slow pointers,Floyd"}
Return the node where the cycle begins, or `nullptr` if there's no cycle. Use $O(1)$ memory.

:::hint Hint
Phase 1: slow/fast until they meet (or fast hits null). Phase 2: reset one pointer to the head; step both by 1 until they meet.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x) : val(x), next(nullptr) {} };

ListNode* detectCycle(ListNode* head) {
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) {                       // phase 1: there is a cycle
            slow = head;                          // phase 2: find the entry
            while (slow != fast) { slow = slow->next; fast = fast->next; }
            return slow;
        }
    }
    return nullptr;
}

int main() {
    vector<ListNode*> v; for (int x : {3, 2, 0, -4}) v.push_back(new ListNode(x));
    for (int i = 0; i < 3; i++) v[i]->next = v[i + 1];
    v[3]->next = v[1];                            // the tail links back to index 1
    ListNode* e = detectCycle(v[0]);
    cout << "cycle starts at value " << (e ? to_string(e->val) : "none") << '\n';
    v[3]->next = nullptr;
    cout << (detectCycle(v[0]) ? "cycle" : "no cycle") << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) | (a hash set of visited nodes also works, with O(n) space)
:::
:::
:::

:::problem Palindrome Linked List {level=easy lc=palindrome-linked-list tags="fast-slow pointers,reversal"}
Return whether a singly linked list reads the same forwards and backwards, in $O(n)$ time and $O(1)$ space.

:::hint Hint
Find the middle, reverse the second half, compare the halves node by node. (Then reverse it back to be polite.)
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct ListNode { int val; ListNode* next; ListNode(int x, ListNode* n = nullptr) : val(x), next(n) {} };
ListNode* build(const vector<int>& v) { ListNode d(0); ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; }

ListNode* reverse(ListNode* h) { ListNode* p = nullptr; while (h) { ListNode* n = h->next; h->next = p; p = h; h = n; } return p; }

bool isPalindrome(ListNode* head) {
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) { slow = slow->next; fast = fast->next->next; }
    ListNode* second = reverse(slow);            // for odd length, the middle joins the second half: harmless
    bool ok = true;
    for (ListNode *p = head, *q = second; q; p = p->next, q = q->next)
        if (p->val != q->val) { ok = false; break; }
    reverse(second);                             // restore the input
    return ok;
}

int main() { cout << boolalpha << isPalindrome(build({1, 2, 2, 1})) << ' ' << isPalindrome(build({1, 2, 3, 2, 1})) << ' ' << isPalindrome(build({1, 2})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Happy Number {level=easy lc=happy-number tags="fast-slow pointers,cycle detection,math"}
Repeatedly replace `n` by the sum of the squares of its digits. `n` is happy if this reaches 1. Otherwise it loops forever. Return whether `n` is happy.

Example: `19 → 82 → 68 → 100 → 1` → `true`.

:::hint Hint
The sequence $n \to f(n) \to f(f(n)) \ldots$ is an **implicit linked list**. It either reaches 1 (which maps to itself) or falls into a cycle that doesn't contain 1. Use slow/fast on it.
:::

:::solution
Why must it cycle? For $n \ge 1000$, the sum of squared digits is much smaller than $n$ (at most $81 \times$ the number of digits). So values quickly drop below 1000 and stay there, and by the pigeonhole principle some value repeats.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int step(int n) { int s = 0; while (n) { int d = n % 10; s += d * d; n /= 10; } return s; }

bool isHappy(int n) {
    int slow = n, fast = step(n);
    while (fast != 1 && slow != fast) {
        slow = step(slow);
        fast = step(step(fast));
    }
    return fast == 1;
}

int main() { cout << boolalpha << isHappy(19) << ' ' << isHappy(2) << ' ' << isHappy(7) << '\n'; }
```

:::complexity
Time | O(\log n) | to drop below 1000, then a bounded number of steps
Space | O(1) |
:::
:::
:::

:::problem Find the Duplicate Number {level=medium lc=find-the-duplicate-number tags="fast-slow pointers,Floyd,pigeonhole"}
`nums` has `n + 1` integers, each in `[1, n]`, so at least one value repeats (pigeonhole). Find the repeated number **without modifying the array** and using $O(1)$ extra space.

Example: `[1,3,4,2,2]` → `2`.

:::hint Hint 1
Treat the array as a function: index `i` points to index `nums[i]`. Starting from index 0, follow the pointers. Why must you end up in a cycle?
:::

:::hint Hint 2
Two indexes point to the same place (the duplicate value), so that value is the **entry** of the cycle. Floyd's phase 2 finds entries.
:::

:::solution
Index 0 is never pointed to (values are ≥ 1), so it's a "head" outside any cycle. Since some value $v$ appears twice, two different indexes point to index $v$. That makes $v$ the node where the tail joins the cycle.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int findDuplicate(const vector<int>& nums) {
    int slow = 0, fast = 0;
    do { slow = nums[slow]; fast = nums[nums[fast]]; } while (slow != fast);   // phase 1
    slow = 0;
    while (slow != fast) { slow = nums[slow]; fast = nums[fast]; }             // phase 2: the entry
    return slow;
}

int main() { cout << findDuplicate({1, 3, 4, 2, 2}) << ' ' << findDuplicate({3, 1, 3, 4, 2}) << ' ' << findDuplicate({2, 2, 2, 2, 2}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

The constraints rule out the obvious approaches: no sorting (it modifies the array), no hash set (O(n) space). Binary search on the value range (count how many values are ≤ mid) is another valid $O(n \log n)$ answer.
:::
:::

## Check yourself

```quiz
? Inside a cycle, why must fast eventually catch slow?
+ The gap between them shrinks by exactly 1 each step
- fast is twice as fast, so it jumps over slow
- Only if the cycle length is even
> A gap that shrinks by 1 must hit 0. It can't skip over.

? In Floyd's proof, a = (L − b) + (k−1)L means…
+ From the head and from the meeting point, the pointers reach the cycle entry at the same time
- The cycle length equals a
- slow and fast meet at the head
> That's why phase 2 resets one pointer to the head.

? In Find the Duplicate Number, the duplicate value corresponds to…
+ The entry node of the cycle in the index → value graph
- The meeting point of phase 1
- Index 0
> Two indexes point to it, so it's where the tail joins the cycle.
```

:::keypoints
- `while (fast && fast->next)`: `slow` ends at the middle (the second middle for even lengths).
- Cycle detection: the gap shrinks by 1 per step inside the loop, so they meet in $O(n)$ steps with $O(1)$ memory.
- Entry: after meeting, restart one pointer at the head; step both by 1. Proof: $a = (L-b) + (k-1)L$.
- Works on **implicit** sequences $x \to f(x)$: happy numbers, array-as-function (find the duplicate).
:::
