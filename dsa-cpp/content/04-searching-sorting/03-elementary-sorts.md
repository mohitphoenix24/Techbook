---
title: Elementary Sorts — Bubble, Selection, Insertion
level: easy
time: 45
summary: The three quadratic sorts, each with a visualizer, its loop invariant and exact operation counts; stability and in-place explained; inversions and why insertion sort's cost equals n plus the number of inversions (expected n²/4, via linearity of expectation); and why insertion sort still matters inside real-world sorts.
---

You'll almost never *use* these three sorts directly. They're $O(n^2)$. But interviews ask about them, they're the clearest way to learn **loop invariants**, and insertion sort is a building block of the fast sorts that libraries actually use.

## Two properties of sorting algorithms

:::def Stable sort
A sort is **stable** if elements with equal keys keep their original relative order. This matters when you sort by one key after another: sort people by name, then **stably** by age, and people of the same age stay alphabetical.
:::

:::def In-place sort
A sort that uses only $O(1)$ extra memory (sometimes $O(\log n)$ is allowed for recursion), rearranging the input array itself.
:::

## Bubble sort

Repeatedly swap adjacent pairs that are out of order. After pass $i$, the $i$ largest elements are at the end in their final positions.

```viz algo=bubble-sort
```

:::def Loop invariant
A statement that is true **before and after every iteration** of a loop. If it's true at the start, each iteration keeps it true, and at the end it implies the result, then the loop is correct. Bubble sort's invariant: after pass $i$, `a[n−i..n−1]` holds the $i$ largest elements in sorted order.
:::

## Selection sort

Find the minimum of the unsorted part and swap it to the front.

```viz algo=selection-sort
```

Invariant: `a[0..i−1]` holds the $i$ smallest elements, sorted. It always does exactly $\frac{n(n-1)}{2}$ comparisons, but **at most $n - 1$ swaps**. That's useful when writes are expensive. It's **not stable**: swapping the minimum forward can jump it over an equal element.

## Insertion sort

Take the next element and slide it left into place in the sorted prefix, like sorting a hand of cards.

```viz algo=insertion-sort
```

Invariant: `a[0..i−1]` is sorted. It's **not necessarily the smallest elements**, which is the difference from selection sort. Insertion sort is stable, in place, **online** (it can sort elements as they arrive), and fast on nearly sorted data.

```cpp run level=easy title="All three, with comparison and swap counts"
#include <bits/stdc++.h>
using namespace std;

struct Stats { long long cmp = 0, moves = 0; };

Stats bubble(vector<int> a) {
    Stats s; int n = a.size();
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - 1 - i; j++) {
            s.cmp++;
            if (a[j] > a[j + 1]) { swap(a[j], a[j + 1]); s.moves++; swapped = true; }
        }
        if (!swapped) break;                                  // early exit: O(n) on sorted input
    }
    return s;
}
Stats selection(vector<int> a) {
    Stats s; int n = a.size();
    for (int i = 0; i < n - 1; i++) {
        int mn = i;
        for (int j = i + 1; j < n; j++) { s.cmp++; if (a[j] < a[mn]) mn = j; }
        if (mn != i) { swap(a[i], a[mn]); s.moves++; }
    }
    return s;
}
Stats insertion(vector<int> a) {
    Stats s; int n = a.size();
    for (int i = 1; i < n; i++) {
        int key = a[i], j = i - 1;
        while (j >= 0) {
            s.cmp++;
            if (a[j] <= key) break;
            a[j + 1] = a[j]; s.moves++; j--;                  // shift right
        }
        a[j + 1] = key;
    }
    return s;
}

int main() {
    int n = 1000;
    vector<int> sorted(n), reversed(n), random(n);
    iota(sorted.begin(), sorted.end(), 0);
    reversed = sorted; reverse(reversed.begin(), reversed.end());
    mt19937 rng(1); random = sorted; shuffle(random.begin(), random.end(), rng);
    cout << "n = 1000          comparisons / swaps-or-shifts\n";
    for (auto [name, v] : vector<pair<string, vector<int>>>{{"sorted  ", sorted}, {"random  ", random}, {"reversed", reversed}}) {
        auto b = bubble(v), s = selection(v), ins = insertion(v);
        cout << name << "  bubble " << setw(6) << b.cmp << '/' << setw(6) << b.moves
             << "  selection " << setw(6) << s.cmp << '/' << setw(4) << s.moves
             << "  insertion " << setw(6) << ins.cmp << '/' << setw(6) << ins.moves << '\n';
    }
}
```

Look at the numbers: selection sort does the same ~500k comparisons regardless of input. Bubble and insertion sort become nearly free on sorted input. Insertion sort's shifts on random input come out near $n^2/4 = 250{,}000$. That's not a coincidence.

## Inversions: the true cost of insertion sort

:::def Inversion
A pair of indexes $i < j$ with $a[i] > a[j]$: two elements in the wrong order. A sorted array has 0 inversions, and a reversed one has the maximum, $\binom n2 = \frac{n(n-1)}{2}$.
:::

:::proof Insertion sort does exactly one shift per inversion
Shifting `a[j]` right past `key` swaps an adjacent pair that is out of order, which removes **exactly one** inversion and creates none. Insertion sort ends with 0 inversions and only ever moves elements this way. So the number of shifts equals the number of inversions $I$, and the running time is $\Theta(n + I)$.
:::

:::derive Expected inversions of a random permutation
I = \sum_{i<j} X_{ij}, \quad X_{ij} = [a_i > a_j] || an indicator for each pair
E[X_{ij}] = P(a_i > a_j) = \tfrac12 || by symmetry, either order is equally likely
E[I] = \binom{n}{2} \cdot \tfrac12 || linearity of expectation
! E[I] = \frac{n(n-1)}{4} = \Theta(n^2) || so insertion sort is Θ(n²) on average, too
:::

The same argument shows that **any** algorithm that only swaps adjacent elements (bubble sort, insertion sort) needs $\Omega(n^2)$ swaps on average. To beat $n^2$, you have to move elements **far** in one step, which is what merge sort, quicksort and heapsort do.

## Comparison

| | Best | Average | Worst | Space | Stable | Notes |
|---|---|---|---|---|---|---|
| Bubble | $O(n)$ (early exit) | $O(n^2)$ | $O(n^2)$ | $O(1)$ | ✅ | teaching only |
| Selection | $O(n^2)$ | $O(n^2)$ | $O(n^2)$ | $O(1)$ | ❌ | fewest swaps ($\le n-1$) |
| Insertion | $O(n)$ | $O(n^2)$ | $O(n^2)$ | $O(1)$ | ✅ | $\Theta(n + \text{inversions})$; great for small or nearly sorted inputs |

:::tip Why insertion sort survives in real libraries
For tiny arrays (about 16 elements or fewer), insertion sort beats the "fast" sorts: no recursion, simple loops, cache-friendly. `std::sort` (introsort) and Python's Timsort both switch to insertion sort for small pieces.
:::

## Problems

:::problem Insertion Sort List {level=medium lc=insertion-sort-list tags="sorting,linked list"}
Sort a singly linked list using insertion sort.

Example: `4→2→1→3` → `1→2→3→4`.

:::hint Hint
Build a new sorted list behind a **dummy head**. Take nodes one at a time from the input, find the insertion point by walking from the dummy, and splice the node in.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct ListNode { int val; ListNode* next; ListNode(int v, ListNode* n = nullptr) : val(v), next(n) {} };

ListNode* insertionSortList(ListNode* head) {
    ListNode dummy(INT_MIN);                         // head of the sorted list
    while (head) {
        ListNode* node = head;
        head = head->next;
        ListNode* p = &dummy;
        while (p->next && p->next->val <= node->val) p = p->next;   // <= keeps it stable
        node->next = p->next;
        p->next = node;
    }
    return dummy.next;
}

int main() {
    ListNode* h = new ListNode(4, new ListNode(2, new ListNode(1, new ListNode(3))));
    for (ListNode* c = insertionSortList(h); c; c = c->next) cout << c->val << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n^2) | worst case; O(n) if the input is sorted in reverse (each node goes to the front)
Space | O(1) |
:::

For an $O(n \log n)$ linked-list sort, use merge sort (*Sort List*, in the Merge Sort lesson).
:::
:::

:::problem Sort Array By Parity {level=easy lc=sort-array-by-parity tags="sorting,two pointers,partition"}
Move all even numbers before all odd numbers. Any order within each group is fine.

Example: `[3,1,2,4]` → `[2,4,3,1]` (or similar).

:::hint Hint
You don't need a full sort, just a **partition** into two groups. Use a write pointer, or swap from both ends.
:::

:::solution
This is the partition step at the heart of quicksort, with the predicate "is even" instead of "less than the pivot".

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> sortArrayByParity(vector<int> a) {
    int write = 0;
    for (int i = 0; i < (int)a.size(); i++)
        if (a[i] % 2 == 0) swap(a[write++], a[i]);
    return a;
}

int main() { for (int x : sortArrayByParity({3, 1, 2, 4})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

`std::partition(a.begin(), a.end(), pred)` does the same; `std::stable_partition` also keeps the original order within each group.
:::
:::

## Check yourself

```quiz
? Which of the three sorts is NOT stable?
- Bubble
+ Selection
- Insertion
> Swapping the minimum forward can jump it over an equal element.

? Insertion sort on an array with I inversions runs in…
+ Θ(n + I)
- Θ(n log n) always
- Θ(I²)
> One shift per inversion, plus n outer iterations.

? Expected inversions in a random permutation of n elements?
- n/2
+ n(n−1)/4
- n log n
> Each of the C(n,2) pairs is inverted with probability ½.

? Why can't any adjacent-swap sort beat Θ(n²) on average?
+ Each adjacent swap fixes at most one inversion, and there are Θ(n²) on average
- Because of cache misses
- It can, with a good pivot
> To go faster, elements must move far in one step.
```

:::keypoints
- Bubble/selection/insertion are $O(n^2)$, in place and simple. Learn their **invariants**.
- Stability: bubble and insertion are stable; selection isn't.
- Insertion sort = $\Theta(n + \text{inversions})$: linear on nearly sorted input. Real libraries use it for small subarrays.
- Average inversions = $n(n-1)/4$, so adjacent-swap sorts are $\Theta(n^2)$ on average.
:::
