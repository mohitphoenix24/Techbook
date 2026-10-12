---
title: Merge Sort & Divide and Conquer
level: intermediate
time: 50
summary: Merge sort end to end — the merge procedure and its invariant, the recursion, the Θ(n log n) recurrence, stability and O(n) extra space, bottom-up merge sort, sorting linked lists in O(1) extra space, and the "count during the merge" trick behind inversion counting, Reverse Pairs and Count of Smaller Numbers After Self.
---

Merge sort is the cleanest example of **divide and conquer**: split the problem in half, solve both halves recursively, and combine the results. It guarantees $O(n \log n)$ on every input, and its merge step is a tool in its own right.

:::flow Divide and conquer
Divide | split the array into two halves
Conquer | sort each half recursively
Combine | merge two sorted halves in O(n)
:::

```viz algo=merge-sort
```

## The merge step

:::def Merge
Combine two **sorted** sequences into one sorted sequence by repeatedly taking the smaller of the two front elements. Each step outputs one element, so merging $n$ elements costs $\Theta(n)$.
:::

:::proof The merge is correct
**Invariant:** the output holds the $k$ smallest elements of the two inputs, sorted, and the two front pointers point at the smallest remaining element of each input. The overall smallest remaining element is one of the two fronts (each input is sorted), so appending the smaller front keeps the invariant. When one input runs out, the rest of the other is already sorted and is at least as large as everything output so far.
:::

:::tip Stability comes from `<=`
On ties, take from the **left** half (`a[i] <= a[j]`). Equal elements then keep their original order, and merge sort is stable. Using `<` would break stability.
:::

## Complexity

$T(n) = 2T(n/2) + \Theta(n)$. By the Master theorem (or the recursion tree: $\log_2 n$ levels, each doing $\Theta(n)$ work), $T(n) = \Theta(n \log n)$, in the **best, average and worst** case.

| | |
|---|---|
| Time | $\Theta(n \log n)$ always |
| Extra space | $\Theta(n)$ for the merge buffer (plus $O(\log n)$ recursion) |
| Stable | yes |
| In place | no (for arrays) |

```cpp run level=easy title="Top-down merge sort"
#include <bits/stdc++.h>
using namespace std;

void mergeSort(vector<int>& a, vector<int>& tmp, int l, int r) {     // sorts a[l, r)
    if (r - l <= 1) return;
    int m = l + (r - l) / 2;
    mergeSort(a, tmp, l, m);
    mergeSort(a, tmp, m, r);
    int i = l, j = m, k = l;
    while (i < m && j < r) tmp[k++] = (a[i] <= a[j]) ? a[i++] : a[j++];
    while (i < m) tmp[k++] = a[i++];
    while (j < r) tmp[k++] = a[j++];
    for (k = l; k < r; k++) a[k] = tmp[k];
}

int main() {
    vector<int> a = {38, 27, 43, 3, 9, 82, 10, 3};
    vector<int> tmp(a.size());                        // allocate the buffer ONCE, not in every call
    mergeSort(a, tmp, 0, a.size());
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

:::warn Allocating inside the recursion
Creating `vector<int> left(...)`, `right(...)` in every call works, but it does $O(n \log n)$ total allocations, which makes it several times slower. Allocate one buffer and pass it down.
:::

### Bottom-up (iterative) merge sort

No recursion: merge runs of width 1, then 2, 4, 8, … This is useful when recursion depth is a concern, and it's the natural way to sort linked lists in $O(1)$ extra space.

```cpp run level=intermediate title="Bottom-up merge sort"
#include <bits/stdc++.h>
using namespace std;

void mergeSortBU(vector<int>& a) {
    int n = a.size();
    vector<int> tmp(n);
    for (int width = 1; width < n; width *= 2) {                 // log2(n) passes
        for (int l = 0; l < n; l += 2 * width) {                  // merge [l, l+w) and [l+w, l+2w)
            int m = min(l + width, n), r = min(l + 2 * width, n);
            merge(a.begin() + l, a.begin() + m, a.begin() + m, a.begin() + r, tmp.begin() + l);   // std::merge
        }
        swap(a, tmp);
    }
}

int main() {
    vector<int> a = {5, 1, 4, 2, 8, 0, 2, 9, 7};
    mergeSortBU(a);
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

## Counting during the merge

Many "count pairs `i < j` with some relation" problems can be solved **while merging**. When an element from the right half is placed before elements of the left half, you learn about **all** those pairs at once.

:::derive Counting inversions while merging
\text{during the merge, } a_L[i] > a_R[j] || the right element goes first
\Rightarrow a_L[i], a_L[i+1], \ldots, a_L[\text{end}] \text{ are all } > a_R[j] || the left half is sorted
\Rightarrow (m - i) \text{ new inversions} || count them in O(1)
! \text{total inversions in } O(n \log n) || instead of O(n²) pair checks
:::

## Problems

:::problem Sort an Array {level=medium lc=sort-an-array tags="sorting,merge sort"}
Sort an array in $O(n \log n)$ time **without** built-in sort functions.

:::hint Hint
Merge sort guarantees $O(n \log n)$. A quicksort without a random pivot can hit $O(n^2)$ on LeetCode's adversarial tests.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void ms(vector<int>& a, vector<int>& t, int l, int r) {
    if (r - l <= 1) return;
    int m = l + (r - l) / 2;
    ms(a, t, l, m); ms(a, t, m, r);
    int i = l, j = m, k = l;
    while (i < m || j < r) t[k++] = (j >= r || (i < m && a[i] <= a[j])) ? a[i++] : a[j++];
    copy(t.begin() + l, t.begin() + r, a.begin() + l);
}
vector<int> sortArray(vector<int> a) { vector<int> t(a.size()); ms(a, t, 0, a.size()); return a; }

int main() { for (int x : sortArray({5, 2, 3, 1})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::
:::
:::

:::problem Count Inversions {level=medium lc=global-and-local-inversions tags="merge sort,divide and conquer,counting"}
Count the pairs `i < j` with `a[i] > a[j]` in $O(n \log n)$. (A classic textbook problem. The linked LeetCode problem is a related variant.)

Example: `[2,4,1,3,5]` → `3` (`(2,1), (4,1), (4,3)`).

:::hint Hint
Merge sort. When you take from the right half, every remaining element of the left half forms an inversion with it.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

long long sortCount(vector<int>& a, vector<int>& t, int l, int r) {
    if (r - l <= 1) return 0;
    int m = l + (r - l) / 2;
    long long inv = sortCount(a, t, l, m) + sortCount(a, t, m, r);
    int i = l, j = m, k = l;
    while (i < m && j < r) {
        if (a[i] <= a[j]) t[k++] = a[i++];
        else { t[k++] = a[j++]; inv += m - i; }       // a[i..m) are all bigger than a[j]
    }
    while (i < m) t[k++] = a[i++];
    while (j < r) t[k++] = a[j++];
    copy(t.begin() + l, t.begin() + r, a.begin() + l);
    return inv;
}

int main() {
    for (vector<int> a : vector<vector<int>>{{2, 4, 1, 3, 5}, {5, 4, 3, 2, 1}, {1, 2, 3}}) {
        vector<int> t(a.size());
        cout << sortCount(a, t, 0, a.size()) << ' ';
    }
    cout << '\n';
}
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::

The inversion count measures "how unsorted" an array is. It's the number of swaps bubble sort performs and the Kendall-tau distance between rankings.
:::
:::

:::problem Reverse Pairs {level=hard lc=reverse-pairs tags="merge sort,divide and conquer"}
Count the pairs `i < j` with `nums[i] > 2 * nums[j]`.

Example: `[1,3,2,3,1]` → `2`.

:::hint Hint
Same skeleton as counting inversions, but the counting condition differs from the merging condition. Before merging two sorted halves, count with a **separate two-pointer pass**, then merge normally. Watch out: `2 * nums[j]` overflows `int`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

long long solve(vector<int>& a, int l, int r) {          // [l, r)
    if (r - l <= 1) return 0;
    int m = l + (r - l) / 2;
    long long cnt = solve(a, l, m) + solve(a, m, r);
    int j = m;
    for (int i = l; i < m; i++) {                         // both halves sorted: j only moves forward
        while (j < r && (long long)a[i] > 2LL * a[j]) j++;
        cnt += j - m;
    }
    inplace_merge(a.begin() + l, a.begin() + m, a.begin() + r);
    return cnt;
}

int main() {
    vector<int> a = {1, 3, 2, 3, 1}, b = {2, 4, 3, 5, 1}, c = {2147483647, 2147483647, 2147483647};
    cout << solve(a, 0, a.size()) << ' ' << solve(b, 0, b.size()) << ' ' << solve(c, 0, c.size()) << '\n';
}
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::
:::
:::

:::problem Count of Smaller Numbers After Self {level=hard lc=count-of-smaller-numbers-after-self tags="merge sort,divide and conquer,Fenwick tree"}
Return `counts` where `counts[i]` is the number of elements to the right of `nums[i]` that are smaller than it.

Example: `[5,2,6,1]` → `[2,1,1,0]`.

:::hint Hint 1
That's the inversion count, but **per element**. Sort **indexes** with merge sort, so you know which original element each value came from.
:::

:::hint Hint 2
When a left-half element is output, every right-half element output **before** it was smaller and came from its right. Add the number of right elements taken so far.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> countSmaller(const vector<int>& nums) {
    int n = nums.size();
    vector<int> idx(n), tmp(n), counts(n, 0);
    iota(idx.begin(), idx.end(), 0);
    function<void(int, int)> ms = [&](int l, int r) {
        if (r - l <= 1) return;
        int m = (l + r) / 2;
        ms(l, m); ms(m, r);
        int i = l, j = m, k = l, rightTaken = 0;
        while (i < m || j < r) {
            if (j >= r || (i < m && nums[idx[i]] <= nums[idx[j]])) {
                counts[idx[i]] += rightTaken;             // smaller right elements already passed it
                tmp[k++] = idx[i++];
            } else { rightTaken++; tmp[k++] = idx[j++]; }
        }
        copy(tmp.begin() + l, tmp.begin() + r, idx.begin() + l);
    };
    ms(0, n);
    return counts;
}

int main() { for (int x : countSmaller({5, 2, 6, 1})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::

The alternative is a **Fenwick tree** over compressed values, scanning from the right (see *Segment Trees & Fenwick Trees*). Both are $O(n \log n)$.
:::
:::

:::problem Sort List {level=medium lc=sort-list tags="merge sort,linked list"}
Sort a linked list in $O(n \log n)$ time.

Example: `4→2→1→3` → `1→2→3→4`.

:::hint Hint
Merge sort suits linked lists: find the middle with slow/fast pointers, split, sort both halves, then merge by relinking nodes (no extra array needed).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct ListNode { int val; ListNode* next; ListNode(int v, ListNode* n = nullptr) : val(v), next(n) {} };

ListNode* mergeLists(ListNode* a, ListNode* b) {
    ListNode dummy(0); ListNode* t = &dummy;
    while (a && b) {
        if (a->val <= b->val) { t->next = a; a = a->next; } else { t->next = b; b = b->next; }
        t = t->next;
    }
    t->next = a ? a : b;
    return dummy.next;
}

ListNode* sortList(ListNode* head) {
    if (!head || !head->next) return head;
    ListNode *slow = head, *fast = head->next;          // slow stops at the end of the first half
    while (fast && fast->next) { slow = slow->next; fast = fast->next->next; }
    ListNode* second = slow->next;
    slow->next = nullptr;                                // cut the list in two
    return mergeLists(sortList(head), sortList(second));
}

int main() {
    ListNode* h = new ListNode(-1, new ListNode(5, new ListNode(3, new ListNode(4, new ListNode(0)))));
    for (ListNode* c = sortList(h); c; c = c->next) cout << c->val << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n \log n) |
Space | O(\log n) | recursion; bottom-up merging makes it O(1)
:::
:::
:::

## Check yourself

```quiz
? Merge sort's worst-case time is…
+ Θ(n log n)
- Θ(n²)
- Θ(n)
> log n levels, each with Θ(n) merge work, on every input.

? What makes merge sort stable?
+ Taking from the LEFT half on ties (<=)
- Using recursion
- The O(n) buffer
> Equal elements keep their original order.

? When counting inversions during a merge, taking a[j] from the right half adds…
+ m − i inversions (all remaining left elements are bigger)
- 1 inversion
- j − m inversions
> The left half is sorted, so everything from i to the middle exceeds a[j].
```

:::keypoints
- Divide and conquer: split, solve the halves, merge. $T(n) = 2T(n/2) + n = \Theta(n \log n)$ always.
- Merge = repeatedly take the smaller front; `<=` keeps it stable. Arrays need $O(n)$ extra space; linked lists don't.
- Allocate the buffer once. Bottom-up merge sort avoids recursion.
- "Count pairs i < j with a relation" → count during the merge in $O(n \log n)$ (inversions, reverse pairs, smaller after self).
:::
